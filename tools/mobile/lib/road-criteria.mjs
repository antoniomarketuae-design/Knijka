// -----------------------------------------------------------------------------
// road-criteria.mjs — THE ROAD-REFERENCED ACCEPTANCE CRITERIA, AS FUNCTIONS THAT
// RUN. Nothing in this file is a threshold written in prose.
//
//   node --test tools/mobile/__tests__/road-criteria.test.mjs
//   (or `node scripts/tools-tests.mjs` from platform/, which discovers it)
//
// WHY IT EXISTS. Two drafts of the road-referenced steering instrument were
// written as prose criteria and neither was ever executed. The first died to a
// sample filter (`laneLinesPainted === true`) that selects ZERO ticks on every
// painted road, because the runtime publishes that field only in the disarming
// direction. The second died to eligibility predicates lifted out of a grader
// written to ACQUIT A MANOEUVRING STUDENT. Both were readable, careful, and
// wrong in a way one execution would have exposed. So the criteria live here,
// as functions over probe rows, and the negative controls that must refuse them
// live beside them in __tests__/road-criteria.test.mjs.
//
// THE FIVE CHEATS THIS FILE IS BUILT AGAINST. Each has a control in the test
// file; a change here that stops redding one of them is a regression, whatever
// the rest of the suite says.
//
//   C1 THE CRAWL.   The draft counted a wrong-bank tick only when the ENGINE'S
//                   OWN `moving` predicate held (`speed > movingSpeedKmh`, 5
//                   km/h — engine.ts:3394, rules/types.ts:1795). A controller
//                   doing its oncoming-lane work at 4.9 km/h books a wrong-bank
//                   fraction of exactly 0.
//   C2 REVERSE.     Same shape, other predicate: `forwardGear = tick.gear >= 0`
//                   (engine.ts:2935). Reverse wrong-bank ticks left the
//                   numerator BY SPECIFICATION.
//   C3 THE RING.    The draft's bank criterion is gated `oneway === false`, so
//                   on a roundabout the denominator fills with two-way
//                   APPROACH-ROAD ticks and reports a clean pass while the ring
//                   itself is never judged. Measured this session across the
//                   shipped world content (the command is in §MEASURED and it
//                   runs): 106 files · 876 edges · 34 roundabout ring edges ·
//                   oneway true 34 / false 0 / absent 0 · 565 two-way edges.
//                   Every ring in the product is one-way. A criterion gated
//                   `oneway === false` cannot see a single metre of one.
//   C4 THE MISSING RECORD. A ring buffer with no sequence number, no drop
//                   counter and no gap census. The product's own sibling
//                   consumer says it in its own words at devrig/rig.ts:54-55:
//                   "Wall clock (ms since the rig armed) — GAPS HERE MEAN THE
//                   SIM WAS PAUSED (a teach card / quiz / consequence overlay
//                   stops onTick entirely)". A window never published is ABSENT,
//                   not excluded.
//   C5 THE DEAD REFERENT. A probe wired to a constant posts p90 0, zero
//                   saturated ticks and a spread of 0 — which a lane-holding
//                   criterion actively REWARDS.
//
// THE ONE ASYMMETRY THAT DOES THE MOST WORK HERE, and it is not a preference:
//
//   · The wrong-bank NUMERATOR must NOT carry `moving` / `forwardGear`. Those
//     two predicates are the whole of C1 and C2.
//   · The LANE-HOLDING statistic MUST carry them, because the product's own
//     `POOR_LANE_KEEPING` carries them (engine.ts:3622-3631: `laneLinesPainted
//     && s.inLaneSeen && offCentre && moving && forwardGear && …`). A lane-
//     holding number computed over ticks the product would never have graded is
//     a claim about ticks that were never in question.
//
//   So the U-turn false positive that `moving`/`forwardGear` used to suppress in
//   the numerator is suppressed HERE by a RUN-LENGTH threshold instead, and the
//   run length is the product's own — PER SURFACE:
//   `solidLineCrossSustainSec = 0.6` (rules/types.ts:1986) on a two-way road,
//   `wrongWaySustainSec = 1.5` (rules/types.ts:1902) on a one-way one. Slow and
//   reverse against-flow ticks are COUNTED AND PUBLISHED, never excluded: an
//   excluded tick that is not counted is the silent-exclusion shape this
//   programme keeps finding.
//
//   AND A RUN-LENGTH THRESHOLD IS HALF A RULE. It cannot convict ALTERNATION,
//   because the run RESET is one tick wide — copied from CROSSED_SOLID_LINE's
//   ACQUITTING half at engine.ts:3526. The other half is the per-surface
//   FRACTION ceiling, derived in §THE PER-SURFACE CLOCKS.
//
//   THE SAME ASYMMETRY, APPLIED TO LANE HOLDING. The p90 statistic carries the
//   product's gates; the EXCURSION census does not, for the same reason the
//   flow numerator does not — and for four revisions it did, which is how a car
//   parked 4.1 m off the lane centre was too far out to count. See the
//   EXCURSION CENSUS block in AC-LANE.
//
// THE SECOND ASYMMETRY, measured in the runtime this session, and the reason
// control 3 reads UNRESOLVED rather than PASS or FAIL:
//
//   · TWO-WAY surface — `opposingBank` is computed unconditionally on a
//     resolved two-way edge and set ONLY WHEN TRUE (worldRuntime.ts:2416-2420,
//     inside `if (edgeRt !== null) { … if (!edgeRt.edge.oneway) { … } }`).
//     Under the POSITIVE gate `edgeId != null && oneway === false` — and only
//     under it — absence therefore means "own bank". That is the engine's own
//     idiom at engine.ts:3526 (`tick.opposingBank !== true && …`).
//   · ONE-WAY surface — `wrongWay` is NOT set-only-when-true. It is assigned a
//     definite boolean at worldRuntime.ts:2306-2312:
//         const wrongWay =
//           edgeRt !== null && edgeRt.edge.oneway && !offCarriageway &&
//           (oneWayStreetsStated || edgeRt.edge.roundabout)
//             ? isWrongWay(…) : false;
//     so `wrongWay === false` means EITHER "travelling with the flow" OR "this
//     district states no one-way streets and this is not a ring, so nobody
//     asked". Two meanings, one value, and the probe row cannot tell them
//     apart. A criterion that acquits on it is fail-open. Hence: the one-way
//     surface may only ACQUIT on a leg where the channel was PROVEN LIVE —
//     at least one `wrongWay === true` row in the record, which a declared
//     witness excursion produces on purpose. Otherwise UNRESOLVED.
//
// MEASURED THIS SESSION (every number in this file that is not a product
// constant, with the command that produced it):
//
//   · the ring census above. Run from the REPO ROOT, verbatim, one line:
//
//     node -e "const fs=require('fs');let f=0,e=0,r=0,rt=0,tw=0;for(const n of fs.readdirSync('content/world').filter(x=>x.endsWith('.json'))){f++;for(const g of ((JSON.parse(fs.readFileSync('content/world/'+n,'utf8')).roads||{}).edges||[])){e++;if(g.oneway===false)tw++;if(g.roundabout===true){r++;if(g.oneway===true)rt++;}}}console.log(JSON.stringify({f,e,r,rt,tw}))"
//
//     → {"f":106,"e":876,"r":34,"rt":34,"tw":565}
//       f = world files · e = edges · r = ring edges · rt = ring edges with
//       oneway true · tw = two-way edges. r === rt is the whole of C3.
//
//   · the open list, unchanged by this file and re-read after it was written:
//     `cd platform && node ../tools/audit/finding-reader.mjs --count`
//     → OPEN-LIST filed=1523 retired=1429 open=94 critical=38 major=55 minor=1
//
// PRODUCT CONSTANTS ARE MIRRORED, NOT GUESSED. Each carries its file:line, each
// was read out of platform/src this session, and `__tests__/road-criteria.test.mjs`
// re-reads them from source and refuses a drift.
//
//   AND THAT SENTENCE WAS FALSE FOR THE ONE-WAY SURFACE UNTIL THIS REVISION,
//   which is worth more than the sentence. AC-FLOW applied
//   `solidLineCrossSustainSec` 0.6 s — CROSSED_SOLID_LINE's TWO-WAY clock,
//   whose own condition is gated `tick.oneway === false` (engine.ts:3518) — to
//   both surfaces. A grep for the product's three one-way numbers returned
//   NOTHING in this file. All three are now here: `wrongWaySustainSec` 1.5
//   (rules/types.ts:1902) and `WRONG_WAY_REARM_SEC` 4 (engine.ts:1000) are LIVE
//   CLOCKS on the one-way surface, and `WRONG_WAY_ENTRY_TRAVEL_M` 15
//   (engine.ts:1116) is mirrored with the reason it is deliberately NOT a gate
//   written beside it. The drift test reads all four out of platform/src, and
//   each was mutation-tested this session: changing any one of them in PRODUCT
//   reds the drift test.
//
//   …AND FOR ONE REVISION HALF OF THAT WAS STILL FALSE. `wrongWaySustainSec`
//   did become a live clock. `WRONG_WAY_REARM_SEC` did not: it was mirrored,
//   drift-tested, called a LIVE CLOCK on this line, and read by no rule —
//   `grep -n WRONG_WAY_REARM_SEC tools/mobile/lib/road-criteria.mjs` returned
//   one definition and three comments and not one use. It is spent now, by
//   `surfaceRearmSec` (R8). The lesson is the one this file keeps relearning:
//   a sentence claiming a number is read is not a number being read.
//
//   LINE NUMBERS, AND A WARNING ABOUT THEM. The four `rules/types.ts` numbers
//   above are HEAD-relative and were re-verified this session against HEAD, not
//   against the worktree: a parallel lane is holding 117 uncommitted lines in
//   that file, which moves every one of them (speedingRearmSec 1784 → 1901,
//   laneKeepSustainSec 1862 → 1979, wrongWaySustainSec 1902 → 2019,
//   solidLineCrossSustainSec 1986 → 2103). `rules/engine.ts` is unmodified, so
//   its numbers are exact in both. Re-find every anchor by the QUOTED CODE
//   beside it; the drift test does exactly that, by regex, and would not notice
//   a line number going stale. Measured with, from the repo root:
//     git show HEAD:platform/src/modules/sim/rules/types.ts | grep -n "wrongWaySustainSec: 1.5"
//     grep -n "WRONG_WAY_REARM_SEC = 4" platform/src/modules/sim/rules/engine.ts
//
// THE FIVE RULES ADDED IN THIS REVISION, each because a judge got a cheating
// leg to read `LEG = pass` against the previous one. Every one of the ten is
// rebuilt in the test file, every one was MEASURED passing before the repair,
// and every rule below was mutation-tested — reverted, watched the cheat go
// green again, restored, cmp-verified byte-identical:
//
//   R1 A FRACTION CEILING PER SURFACE, derived (§THE PER-SURFACE CLOCKS).
//      Consumes `againstFlowFrac`, which nothing read. Reds N1 and N15.
//   R2 EVERY DURATION ON THE WALL CLOCK (`medianWallPeriodSec`, `spanWallSec`),
//      and the sample rate with it. `medianTickPeriodSec` survives only to be
//      compared against the wall period in AC-RECORD — see R6, and see the
//      correction under it, because for one revision that sentence was FALSE.
//      Reds N3a and N3b.
//   R3 A CUMULATIVE WALL-GAP CENSUS, plus a coverage check against the DRIVER'S
//      clock instead of `rows[last] − rows[0]`. Reds N2.
//   R4 THE EXCLUSION CEILING OVER THE UNION of all six published classes
//      (`curved − graded`), not `(offRoad + saturated)`. Reds N13 and N17.
//   R5 A CEILING ON WHAT `declared.*` MAY REMOVE — in count and in duration —
//      with the spans PINNED BY CONTENT HASH before the drive (§DECLARED).
//
//   …and two rules the judge's legs forced that are not on that list: the
//   EXCURSION CENSUS is now leg-wide, ungated and cumulative (reds N4, N12,
//   N17), and a row carrying `wrongWay: true` on a two-way surface is a
//   CONTRADICTION rather than a clean tick (reds N14).
//
//   ONE RULE WAS WRITTEN AND THEN DELETED: a wall-SECONDS floor beside the tick
//   floor. It cannot fire — `gradedTicks >= max(30, ceil(3 × laneKeepSustainSec
//   × hz))` already implies `gradedTicks / hz >= 9 s`, searched hz 0.1..400 in
//   0.1 steps with no counterexample. Shipping it would have been one more
//   predicate nothing can read.
//
// THE NINE RULES ADDED IN THE REVISION AFTER THAT, because a third adversarial
// pass rebuilt the cheats from OUTSIDE the module again — this time against the
// revision that had just shipped R6, R7 and R8 — and got FOURTEEN legs to read
// `LEG = pass` on a file whose suite header said "NO CHEAT IN THIS FILE IS
// STILL LIVE". Twelve are closed below; two are disclosed as L8 and L9 and are
// pinned in the cheat suite AT THE VERDICT THEY GET, so a later repair reds the
// suite rather than quietly making this paragraph stale.
//
// EVERY ONE WAS MUTATION-TESTED, and by a method that can tell a verdict
// consumer from a string consumer — see the LEDGER below, which was rewritten
// this revision because it could not.
//
//   R9  THE SIM CLOCK GETS THE CENSUS THE WALL CLOCK ALREADY HAD. R6 bounds the
//       SUM of the two clocks' deltas, so a freeze repaid by a catch-up jump
//       cancels to zero: measured, a 30.00 s sim freeze with one repayment read
//       clockDisagreementSec 0.000e+0, AC-RECORD = pass with ZERO reasons and
//       LEG = pass, while longestSimGapSec 30.05 and simGapsAtOrAboveSustain 1
//       were published and gated nothing. `simLostWallSec` and
//       `simGainedWallSec` charge the two directions SEPARATELY and
//       cumulatively, which a net sum cannot: paying one spends the other.
//       `simGapsAtOrAboveSustain` now gates instead of decorating. Reds
//       SIM-FREEZE 1..4.
//   R10 THE WALL CLOCK IS VALIDATED LIKE `seq`. It is the clock EVERY duration
//       in this file is measured on and it had no check at all: not
//       monotonicity, not cadence. `nonMonotonicWallSteps` is a FAIL on the
//       same footing as a broken `seq`, and `cadenceLostWallSec` — the mirror
//       of `gapBlindWallMs`, summing the time each step falls SHORT of the
//       record's own median — closes both the compression cheat (8.00 s of
//       wrong-bank driving billed as 0.0659 s) and the median-is-the-hole cheat
//       (1 795 500 ms between samples with gapBlindWallMs reading 0). The two
//       censuses are median-independent together and neither is alone.
//       Reds WALL-COMPRESSION, WALL-ROLLBACK, THE MEDIAN IS THE HOLE.
//   R11 `droppedTicks` GETS A CONSUMER. Only `maxContiguousDrop` was read, so
//       spreading the drops walked through it: 74 281 dropped ticks claimed
//       inside a 63 s leg (an implied 1 200 Hz against a 20 Hz median) with
//       impliedDropBlindSec 2.95 s and LEG = pass. `dropBlindWallSec` is that
//       count at the record's own cadence, bounded cumulatively.
//   R12 THE WITNESS FLOOR MEASURES CONTIGUOUS TICKS. `flowRuns` BRIDGES, on
//       purpose, so R7 was reading a bridged SPAN: two true ticks 1.45 s apart
//       with UNKNOWN between them produced a 1.50 s "witness" on 0.10 s of
//       channel evidence, and LEG = pass. The bridge is free — unknown and
//       off-surface ticks are billed to no ceiling — so the budget argument
//       that bounds witness LENGTH never bounded it.
//   R13 N14 IN BOTH DIRECTIONS. `opposingBank` is set only inside
//       `if (!edgeRt.edge.oneway)`, so it is exactly as impossible on a one-way
//       row as `wrongWay` is on a two-way one, and had no rule: 600 wrong-bank
//       ticks filed under `oneway: true` landed in a denominator whose
//       discriminator read a clean false, and LEG = pass.
//   R14 THE UNCLASSIFIED CENSUS IS CUMULATIVE. Third place the same derivation
//       is applied. 754 ticks with no edge, in runs of 2.90 s each, read
//       LEG = pass with `unclassifiedTicks` compared to nothing.
//   R15 A LEG-WIDE AGAINST-FLOW BOUND, weighted by the leg's own surface mix.
//       Nothing at all was said about the leg before it. It does NOT close the
//       cheat that prompted it — see L8, which is disclosed rather than
//       tightened around.
//   R16 AC-LANE GOES LEG-WIDE: the p90 ceiling, the exclusion ceiling and the
//       only hard geometric refusal were all scoped by `declared.curvedSpans`,
//       which is a claim about BENDS. Measured, all three LEG = pass: 900 ticks
//       at 3.00 m (past the 2.40 m ceiling, under the 3.25 m excursion
//       threshold) outside the bucket; 900 unpainted ticks charged to nothing;
//       `worldEdgeClearanceM` −12 m on 900 ticks raising no reason at all.
//   R17 THE CALIBRATION MUST BE SOMEWHERE THE REFERENT CAN STILL ANSWER FROM.
//       AC-REFERENT certified AGREEMENT and never asked WHERE: a park declared
//       at 40.00 m and read back at 40.00 m reported injectionErrM 0.0000 and
//       bought an exemption from the excursion census. The bound is the file's
//       own saturation constant, LANE_WIDTH_M/2 = 4.0625 m, past which AC-LANE
//       already treats the value as not a measurement.
//
// THE THREE RULES ADDED IN THE REVISION BEFORE THOSE, each because an adversary
// rebuilt the twelve cheating legs OUTSIDE this module's own suite
// (__tests__/road-criteria-cheats.test.mjs) and found the list above
// incomplete. Ten of the twelve were red; two were not, and one more hole was
// derived from row 63's own text. Every one below is executed by a named test
// in that file and was mutation-tested — the rule reverted, the cheat watched
// going green again, the rule restored, `cmp` byte-identical.
//
//   R6 THE TWO-CLOCK AGREEMENT RULE, in AC-RECORD. Reds CLOCK-ONLY-a and
//      CLOCK-ONLY-b, and gives `medianTickPeriodSec` the consumer this header
//      SAID IT ALREADY HAD AND DID NOT. Measured before the repair:
//      `grep -n medianTickPeriodSec tools/mobile/lib/road-criteria.mjs`
//      returned four hits — this header's own sentence, the definition, one
//      call and one publication — and NOT ONE WAS A COMPARISON. A leg that is
//      the known-good leg with `tSec` pinned to 0 for 62.95 s of wall time read
//      LEG = pass and certified `mayTestify ["lane position on twoWay"]`; so
//      did one whose sim clock ran 26x slow. N3a and N3b were red only because
//      of the excursion they happen to carry — the clock fraud raised nothing.
//      This is row 63's THIRD remedy, which the two earlier rules left undone
//      while the header described it as done.
//   R7 THE ONE-WAY WITNESS FLOOR, in AC-FLOW. Reds N15b. The liveness gate asks
//      whether `wrongWay` can say true; it did not ask for how long, and a
//      channel armed by a blip acquits everything else for free. 20 ticks
//      (1.0 s) of declared wrong-way carried a 1260-tick one-way denominator to
//      LEG = pass. The floor is the product's own arming clock,
//      `wrongWaySustainSec` 1.5 s, and it is not widenable: lengthening the
//      witness spends declared-removal budget, and on N15b's own leg the two
//      bounds meet with nothing between them (measured: 1.25 s clears the
//      budget and fails the floor; 1.30 s breaks the budget; 1.50 s clears the
//      floor and convicts as an undeclared run — the cheat suite executes the
//      whole range 1..40 ticks and asserts not one of them passes).
//   R8 THE RE-ARM HALF OF THE FRACTION CEILING IS THE SURFACE'S OWN, via
//      `surfaceRearmSec`. No verdict moves today — `WRONG_WAY_REARM_SEC` and
//      `speedingRearmSec` are both 4 s, and engine.ts:1258-1259 says the first
//      borrows the second "for the same idea" — but until this revision
//      `WRONG_WAY_REARM_SEC` was mirrored here, read out of the product by the
//      drift test, called a LIVE CLOCK four paragraphs below, and READ BY
//      NOTHING. That is the dead-predicate class, inside the file that names
//      it. If the product ever splits the two figures the one-way ceiling now
//      follows the one-way constant instead of silently keeping the two-way
//      one — which is precisely the mistake the SUSTAIN clock made for four
//      revisions.
//
// EVERY PUBLISHED NUMBER AND WHO READS IT. This programme is named for the
// defect where a repair ships a MEASUREMENT and wires it to no consumer, and
// this file shipped four of them at once.
//
//   …AND THIS LEDGER WAS ITSELF AN INSTANCE OF IT, FOR TWO REVISIONS RUNNING.
//   The block below used to be headed "NOW READ BY A VERDICT" and listed eight
//   names. SEVEN OF THE EIGHT WERE WRONG: their only consumer was a template
//   literal inside a refusal STRING, and the refusal was gated by some OTHER
//   quantity entirely. `simGapsAtOrAboveSustain` was worse than string-only —
//   the refusal that was supposed to read it interpolated `blindSim.length`
//   instead, so the published counter had no consumer at all, and the price was
//   two cheating legs (a 30.00 s sim freeze and a 62.95 s one) reading
//   LEG = pass while that counter sat at 1.
//
//   THE AUDIT METHOD WAS THE BUG. It was run "by grep and then by mutation",
//   and neither can tell a verdict consumer from a string consumer: grep sees a
//   use, and mutation reds a test whenever a test ASSERTS THE VALUE — which
//   several do. The method below is the one that can, and every line under
//   GATES was produced by it:
//
//     replace the published value with a constant, run both suites in an
//     isolated copy, and count only the tests that assert a VERDICT.
//     Interpolating a number into a reason string cannot change a verdict, so
//     a string-only consumer reds nothing under it.
//
//   Run this session against the isolated copy (80 pass / 0 fail baseline,
//   platform/src copied in so the drift tests run for real):
//
//     `simGapsAtOrAboveSustain: blindSim.length` → `: 0`   reds 2   (was 0)
//     `const blindSim = simGaps.filter(…)` → `= []`        reds 2   (was 0)
//     `simLostWallSec` → 0                                  reds 6
//     `simGainedWallSec` → 0                                reds 1
//     `cadenceLostWallSec` → 0                              reds 2
//     `dropBlindWallSec` → 0                                reds 1
//     `longestContiguousWitnessSec` → the bridged span      reds 3
//     `legP90AbsOffsetM` → 0                                reds 1
//     `legExcludedFrac` → 0                                 reds 2
//     `legAgainstFlowFracCeiling` → Infinity                reds 2
//     `unclassifiedWallSec` → 0                             reds 1
//
//   GATES A VERDICT — each verified by the mutation above, not by grep —
//     `simGapsAtOrAboveSustain`  the single-sim-gap refusal (R9).
//     `simLostWallSec`, `simGainedWallSec`  the cumulative sim census (R9),
//                              two-sided so a catch-up jump cannot repay it.
//     `cadenceLostWallSec`     the swallowed-time census (R10), the mirror of
//                              `gapBlindWallMs`.
//     `nonMonotonicWallSteps`  `wallMs` gets `seq`'s own refusal (R10).
//     `dropBlindWallSec`       what `droppedTicks` costs (R11).
//     `longestContiguousWitnessSec`  the one-way witness floor (R12).
//     `contradictoryRows`      on BOTH surfaces now (R13).
//     `unclassifiedWallSec`    the cumulative unclassified census (R14).
//     `legAgainstFlowFrac` / `legAgainstFlowFracCeiling`  the leg-wide flow
//                              bound (R15).
//     `legP90AbsOffsetM`, `legExcludedFrac`, `offWorldTicks`  AC-LANE leg-wide
//                              (R16).
//     `injectionSaturationM`   the calibration bound (R17).
//     `WRONG_WAY_REARM_SEC`    `surfaceRearmSec` → the one-way ceiling (R8).
//                              GATES, but NOT PROVABLE FROM THIS SIDE: the two
//                              rearm constants both hold 4, so the mutation
//                              survives. See `surfaceRearmSec`, and see the
//                              SECOND survivor disclosed there.
//
//   PUBLISHED AND READ BY NO VERDICT, each with its reason. Seven of these were
//   listed above this line for two revisions and were not true; they are here
//   now because a register that certifies itself is the thing this file spends
//   four paragraphs warning about —
//     `medianTickPeriodSec`   INTERPOLATED into R6's refusal, gated by
//                             `clockDisagreementSec`. It is kept because the
//                             per-step sim census (R9) is strictly stronger
//                             than the median comparison this value was twice
//                             claimed to be for: a median can agree while every
//                             individual step lies. Mutating it reds 4 tests,
//                             all of which ASSERT ITS VALUE.
//     `longestSimGapSec`      interpolated into two refusals; the COUNT
//                             (`simGapsAtOrAboveSustain`) is what gates.
//     `blindWallMs`           same shape: `blindWall.length` gates, the
//                             millisecond total is named in the reason.
//     `declaredManoeuvreTicks`  named by the witness refusal so a reader can
//                             see what the declaration bought.
//     `outsideCurvedSpanTicks`  named by the excursion and leg-wide p90
//                             refusals so a reader can see what the bucket
//                             never looked at. The leg-wide rules (R16) are
//                             what actually judge those ticks.
//     `slow/reverseAgainstFlowTicks`  named by the fraction refusal: they are
//                             the two classes this file COUNTS and refuses to
//                             exclude, which is C1 and C2.
//     `impliedDropBlindSec`   the CONTIGUOUS drop rule still gates on it; the
//                             cumulative one (R11) is what the cheat needed.
//                             (This one is genuinely consumed — listed here
//                             only so the pair is read together.)
//     `recordSpanMs`          the record's own idea of how long it lasted. It
//                             is the number a fabricated record CONTROLS; it is
//                             published beside `coveredWallMs` and
//                             `driverWallSpanMs` precisely to show the gap, and
//                             consuming it would make the check circular.
//     `gradedWallSec`         the quantity of the wall-seconds floor that was
//                             written and deleted for being unable to fire.
//     `WRONG_WAY_ENTRY_TRAVEL_M`  a floor the PROSECUTION must clear in the
//                             product; borrowing it here would invert it into
//                             an ACQUITTAL. See its own comment.
//
// WHAT STILL PASSES — THE DISCLOSED LIVE CHEATS. This is the fifth attempt at
// this instrument; a cheat named here is worth more than one discovered later.
// Each is executable in the test file unless marked otherwise.
//
//   L1 THE FULLY REWRITTEN RECORD. Close the hole, renumber `seq`, and make BOTH
//      clocks smooth, and nothing inside the record can see it — control 5e
//      asserts every internal census reads clean, one by one. The ONLY defence
//      is `declared.expectedSpanMs`, a duration the record did not author, and
//      it is circular the moment that number is taken from the record instead
//      of from the harness's own clock. A leg that declares NO such duration is
//      now UNRESOLVED rather than `pass`, which is the one part of this that
//      got better; the rest of L1 stands.
//   L2 THE TWO-WAY SURFACE HAS NO LIVENESS WITNESS. The one-way surface must
//      prove its channel can say true; the two-way surface is trusted because
//      `opposingBank` is set-only-when-true on a resolved two-way edge. If the
//      probe tap simply never copies the field, the only thing standing between
//      that and a clean pass is `declared.channels` — a claim the harness makes
//      about itself. The symmetric fix is a declared wrong-bank witness
//      excursion on every leg, which costs a deliberate excursion per leg and
//      was NOT paid here.
//   L3 THE INJECTION CERTIFIES MAGNITUDE, NOT SIGN. `laneOffsetM` is positive on
//      both banks, so no injection can prove the referent's sign is bank-
//      correct. AC-FLOW is the only thing that can, and only where a
//      discriminator is published.
//   L4 THE 10 % EXCLUDED-FRACTION CEILING IS A JUDGEMENT, not a measurement, and
//      is declared as one in `EXCLUDED_FRACTION_CEILING`. It now bounds three
//      things — the exclusion union, the declared removals and the unknown
//      share of a discriminator — so the one judgement in this file carries
//      more weight than it did, not less. Everything else new in this revision
//      is derived from a product constant.
//   L7 THE WITNESS FLOOR BOUNDS THE BLIP, NOT THE AMBIGUITY, AND IT DILUTES
//      TWO WAYS — WITH LEG LENGTH, AND WITH A SHORTER CALIBRATION. R7 closes
//      N15b on N15b's own 62.95 s leg because the floor and the declared-removal
//      budget meet there. THEY MEET ONLY BECAUSE THAT LEG'S CALIBRATION PARK
//      HAPPENS TO BE 5.00 s, and this file discovered that one revision late:
//      the budget is (calibration + witness) / leg, so SHORTENING THE
//      CALIBRATION — which no product constant fixes and no rule here bounds
//      from below — buys the witness room again on the very leg the argument
//      was made on. MEASURED this session, row 71's leg with its 30-tick
//      (1.50 s) contiguous witness and nothing else changed:
//
//        calibration 5.00 s → fail  (6.50/62.95 = 0.10326 > 0.1)
//        calibration 4.50 s → pass  (6.00/62.95 = 0.09531)
//        calibration 4.00 s → pass  (5.50/62.95 = 0.08737)
//        calibration 3.00 s → pass  (4.50/62.95 = 0.07149)
//
//      ROW 71 IS THEREFORE NOT RETIRED, and the cheat suite pins all four lines
//      above as L9. A floor on the calibration LENGTH was considered and not
//      written: AC-LANE's sample floor would set it at 3 × laneKeepSustainSec
//      = 9 s, which is longer than the known-good leg's own 5.00 s park, so it
//      would red the control. There is no derivable lower bound here, only a
//      chosen one.
//
//      IT ALSO DILUTES WITH LENGTH, which is the half this file knew first: the
//      budget is a FRACTION of the leg and the floor is an absolute 1.5 s, so a
//      long enough leg affords a lawful witness and still acquits an arbitrary
//      amount of ambiguous `wrongWay: false`. MEASURED on the same leg with a
//      5.00 s calibration and nothing changed but its length:
//
//        1 260 ticks ( 62.95 s) → fail  (budget 0.1033 > 0.1, run convicts)
//        2 000 ticks ( 99.95 s) → pass  (budget 0.0650), 30 of 2 000 ticks
//        5 000 ticks (249.95 s) → pass  (budget 0.0260), 30 of 5 000 ticks
//       12 000 ticks (599.95 s) → pass  (budget 0.0108), 30 of 12 000 ticks
//
//      and each `pass` certifies `mayTestify ["lane position on oneWay"]`. NO
//      PRODUCT CONSTANT BOUNDS THIS. The engine says how long a wrong-way state
//      must last to be believed; it says nothing about how long one
//      demonstration proves a channel stays live, so any ceiling written here
//      would be a chosen number wearing a derivation. A per-EDGE liveness rule
//      is derivable from the gate's own terms (`oneWayStreetsStated` is
//      per-district, `roundabout` per-edge, `offCarriageway` per-tick,
//      worldRuntime.ts:2306-2312) and was considered — it would NOT close this,
//      because the diluting leg above never leaves one edge. What closes it is
//      the founder-ruled signed travel-direction-vs-edge value: once `false`
//      stops meaning "nobody asked", the liveness gate and this floor are BOTH
//      deleted. The seam test in the cheat suite names the replacement.
//   L8 A LEG CAN SPEND TWO SURFACES' BUDGETS. The fraction ceiling is derived
//      PER SURFACE, and R15 adds the only leg-wide bound that is also derived —
//      each surface's ceiling weighted by the ticks the leg spent on it. A leg
//      that visits both surfaces can still put more of ITSELF against the flow
//      than either ceiling alone would suggest. MEASURED: 630 two-way ticks
//      carrying 77 against-flow in honest 0.55 s runs (0.1222 < 0.130434) plus
//      630 one-way ticks carrying 146 in honest 1.45 s runs (0.2317 < 0.272727)
//      = 223 ticks = 11.15 s = 17.70 % of the leg against the flow, against a
//      mix ceiling of 0.201581. LEG = pass, mayTestify ["lane position on
//      twoWay, oneWay"], reasons NONE.
//
//      IT IS DISCLOSED RATHER THAN CLOSED BECAUSE THE ARITHMETIC IS HONEST:
//      every run really is separately lawful, and the duty-cycle derivation
//      really does allow that much. Redding it needs a tighter number, and no
//      product constant supplies one — it would be a chosen threshold wearing a
//      derivation, which is what L4 already declares this file has exactly one
//      of. The cheat suite pins it at `pass` with a control beside it proving
//      the leg-wide bound DOES bite when the mix cannot afford the total.
//   L9 THE WITNESS FLOOR IS DEFEATED BY SHRINKING THE CALIBRATION — see L7,
//      where the four measured lines are. It is called out separately here
//      because it is a LIVE CHEAT on row 71's own leg, not a limit that only
//      appears on a longer one, and because the previous revision's suite
//      asserted row 71 CLOSED on the strength of the 5.00 s figure.
//   L5 NOTHING HERE PROVES A PROBE EXISTS. Every row in the test file is
//      synthetic. These criteria are proven against fixtures, which is what let
//      them be written before any drive — and it means increment 1 owes a run of
//      the same functions over a REAL record, plus the tick cadence and read
//      cost measured on the product headless.
//   L6 THE RING SURFACE STILL CANNOT ACQUIT, AND THIS FILE CANNOT FIX IT. R1
//      and R5 make N15 red, and that is worth doing — but N15's ROOT CAUSE is
//      the referent, not the rule. `wrongWay === false` is published under
//      three gates (worldRuntime.ts:2306-2312) and is ambiguous BY
//      CONSTRUCTION: it means EITHER with-the-flow OR nobody-asked. So the only
//      witness that can prove the channel live is the OFFENCE ITSELF, and the
//      N15 control asserts that byte-identity in the repo
//      (`discriminatorTrueTicks === againstFlowTicks`) rather than describing
//      it. A criterion cannot invent a signal the product does not publish:
//      what a ring leg needs is a disarming referent on the tick — the doc 86
//      T1 pattern, `rules/types.ts` + `runtime/worldRuntime.ts` — and that is a
//      PRODUCT-CONTRACT question, already escalated to the founder AND RULED ON
//      (2026-09-20: the product will publish a per-tick SIGNED
//      travel-direction-vs-edge value; that work belongs to another lane and
//      nothing here depends on its field name). Until it lands, a one-way
//      surface may be CONVICTED freely and may be CLEARED only on a leg
//      carrying a declared witness that reaches the product's own clock — see
//      R7, and see L7 for what that witness still fails to bound.
//      `surfacesJudged` is what carries the scope.
//
// WHAT THIS FILE IS NOT. It is not a controller, it does not drive, it does not
// read `.audit-frames`, and nothing it returns closes a finding. It is pure: an
// array of rows in, a verdict object out, no I/O, no clock, no browser. Its one
// import is `node:crypto`'s `createHash`, used as a pure function of its
// argument to pin a declared span (§DECLARED) — no I/O, no clock, no global.
// -----------------------------------------------------------------------------

// The ONLY import, and it is a pure function of its argument: `createHash` does
// no I/O, reads no clock and touches no global. It is here so a declared span
// can be PINNED BY CONTENT before the drive (see §DECLARED), which is what stops
// a span being authored to fit a result it has already seen.
import { createHash } from "node:crypto";

/**
 * The product's own numbers. Nothing here is a harness choice.
 * Verified in platform/src this session at the line cited.
 */
export const PRODUCT = Object.freeze({
  /** engine.ts:3394 `const moving = speed > cfg.movingSpeedKmh` · rules/types.ts:1795 */
  MOVING_SPEED_KMH: 5,
  /** rules/types.ts:1986 — the clock CROSSED_SOLID_LINE arms on. TWO-WAY ONLY:
   *  its condition is gated `tick.oneway === false` (engine.ts:3518). */
  SOLID_LINE_CROSS_SUSTAIN_SEC: 0.6,
  /** rules/types.ts:1902 — the clock WRONG_WAY arms on. ONE-WAY ONLY. */
  WRONG_WAY_SUSTAIN_SEC: 1.5,
  /** engine.ts:1000 — the one-way episode's re-arm. */
  WRONG_WAY_REARM_SEC: 4,
  /**
   * rules/types.ts:1784. engine.ts:1155 calls it, in its own words, "this
   * engine's declared unit of „a correction that counts"", and engine.ts:1258-
   * 1259 records that `WRONG_WAY_REARM_SEC` BORROWS this figure "for the same
   * idea". It is therefore the product's own answer to "when is the lawful
   * direction held long enough that the next offence is a SECOND act?", and
   * that is the question the fraction ceilings below are derived from.
   */
  SPEEDING_REARM_SEC: 4,
  /**
   * engine.ts:1116. MIRRORED SO THE DRIFT TEST READS IT, AND DELIBERATELY NOT
   * APPLIED AS A GATE. In the product this is a floor the PROSECUTION must
   * clear before a 10-point опасна is billed; borrowing it here would turn it
   * into an ACQUITTAL — "under 15 m of wrong-way road, this record need not
   * answer" — which is the exact inversion engine.ts:1052-1066 measured and
   * fixed (acquittal probability rising with speed). These criteria decide what
   * a leg MAY TESTIFY TO, not what the product bills, so a short wrong-way run
   * is still a run the record has to account for. The probe rows also carry no
   * odometer, so the metres could only be re-derived from speed — a second
   * estimate of a quantity the product measures directly.
   */
  WRONG_WAY_ENTRY_TRAVEL_M: 15,
  /** rules/types.ts:1862 — the clock POOR_LANE_KEEPING arms on. */
  LANE_KEEP_SUSTAIN_SEC: 3,
  /** contracts.ts:31 */
  PERCEPTUAL_ROAD_SCALE: 2.5,
  /** rules/types.ts:1861 `laneKeepMaxOffsetM: 1.3 * PERCEPTUAL_ROAD_SCALE` = 3.25 m. */
  LANE_KEEP_MAX_OFFSET_M: 1.3 * 2.5,
  /** runtime/spatial.ts:29 `LANE_WIDTH_M = 3.25 * PERCEPTUAL_ROAD_SCALE` = 8.125 m. */
  LANE_WIDTH_M: 3.25 * 2.5,
  /** runtime/locator.ts:56 — the smallest lateral quantity the locator acts on. */
  LANE_SWITCH_DEADBAND_M: 0.35,
  /** vehicle/tuning.ts:70 `CHASSIS_HALF_EXTENTS = { x: 0.85, … }` — the car is 1.70 m wide. */
  CHASSIS_HALF_WIDTH_M: 0.85,
});

/**
 * The lane-holding ceiling, DERIVED rather than chosen: the reference drive
 * keeps the whole car inside the product's own band, not merely the point the
 * product measures. 3.25 − 0.85 = 2.40 m. It is a ceiling, never a target.
 */
export const LANE_HOLD_P90_CEILING_M =
  PRODUCT.LANE_KEEP_MAX_OFFSET_M - PRODUCT.CHASSIS_HALF_WIDTH_M;

/**
 * Float-comparison epsilon for the saturation test. NOT a physical margin: the
 * saturation bound is stated symbolically as LANE_WIDTH_M/2 and no numeric
 * ceiling is ever asserted (the true ceiling is LANE_WIDTH_M/2 +
 * LANE_SWITCH_DEADBAND_M on any road with lanesPerDir >= 2, where the lane
 * hysteresis holds a lane the car has left).
 */
const EPS = 1e-9;

/** The declared judgement in this file, and it is declared as one. */
export const EXCLUDED_FRACTION_CEILING = 0.1;

const SURFACE_TWO_WAY = "twoWay";
const SURFACE_ONE_WAY = "oneWay";

/* ────────────────────────────────────────────────────────────────────────────
 * THE PER-SURFACE CLOCKS, AND THE FRACTION CEILING DERIVED FROM THEM.
 *
 * WHY A FRACTION RULE EXISTS AT ALL. A run-length rule alone cannot convict
 * ALTERNATION, and it is not because the threshold is too high — it is because
 * the run RESET is one tick wide. That one-tick reset is copied from
 * CROSSED_SOLID_LINE's acquitting half (engine.ts:3526,
 * `tick.opposingBank !== true && tick.laneOffsetM <= cfg.laneKeepMaxOffsetM` —
 * a state predicate with no duration in it), so eleven wrong ticks followed by
 * one own-bank tick, repeated for twenty seconds, produces thirty-four separate
 * sub-threshold runs and zero convictions. Measured on that exact leg this
 * session: 367 against-flow ticks in a 1260 denominator, 34 runs, longest
 * 0.550 s, convicting 0, LEG = pass.
 *
 * Widening the run threshold cannot fix it (the alternation simply shortens),
 * and widening the BRIDGE to swallow contrary evidence would contradict the
 * product, whose one-way sustain "dies on the first lawful frame" by design
 * (engine.ts:4036-4043). The missing rule is a statement about the leg as a
 * whole rather than about any one run.
 *
 * THE DERIVATION. A leg is lawful under the run rule only if every against-flow
 * observation belongs to a run the product itself would not bill. The longest
 * such run lasts just under the surface's own sustain. Two such runs are
 * SEPARATE ACTS — rather than one offence the one-tick reset chopped in half —
 * only once the lawful direction has been held for the engine's declared unit
 * of "a correction that counts": `speedingRearmSec` = 4 s (rules/types.ts:1784,
 * engine.ts:1155), the same figure `WRONG_WAY_REARM_SEC` borrows "for the same
 * idea" (engine.ts:1258-1259). So the highest against-flow duty cycle a leg can
 * carry while every one of its runs is separately lawful is
 *
 *       sustainSec / (sustainSec + rearmSec)
 *
 * and anything above it is arithmetically impossible to reach with lawful runs.
 * Both numbers are the product's; neither is chosen here.
 *
 *   two-way : 0.6 / (0.6 + 4) = 0.130434…   (solidLineCrossSustainSec)
 *   one-way : 1.5 / (1.5 + 4) = 0.272727…   (wrongWaySustainSec)
 *
 * THE ONE-WAY CLOCK WAS WRONG AND IS NOW RIGHT. Until this revision AC-FLOW
 * applied `solidLineCrossSustainSec` (0.6 s) to BOTH surfaces — CROSSED_SOLID_
 * LINE's clock, on a composite whose own condition is gated `tick.oneway ===
 * false` (engine.ts:3518), i.e. a clock that by construction never runs on a
 * one-way road. The product's one-way clock is `wrongWaySustainSec` = 1.5 s.
 * ──────────────────────────────────────────────────────────────────────────*/

/** The sustain clock the PRODUCT arms on, per surface. */
export function surfaceSustainSec(surface) {
  if (surface === SURFACE_TWO_WAY) return PRODUCT.SOLID_LINE_CROSS_SUSTAIN_SEC;
  if (surface === SURFACE_ONE_WAY) return PRODUCT.WRONG_WAY_SUSTAIN_SEC;
  return null;
}

/**
 * The RE-ARM clock the PRODUCT tells two separate acts apart with, PER SURFACE.
 *
 * WHY THIS FUNCTION EXISTS, AND IT IS NOT COSMETIC. Until this revision the
 * ceiling below read `SPEEDING_REARM_SEC` on BOTH surfaces, and
 * `WRONG_WAY_REARM_SEC` — mirrored here, read out of the product by the drift
 * test, and described in this file's own header as one of two "LIVE CLOCKS on
 * the one-way surface" — was read by no rule at all. Measured this session,
 * from the repo root:
 *
 *     grep -n WRONG_WAY_REARM_SEC tools/mobile/lib/road-criteria.mjs
 *     → 4 hits: :128 (the header claim), :240 (the definition), :244 and :326
 *       (two comments). NOT ONE WAS A USE.
 *
 * That is the dead-predicate class this file spends four paragraphs warning
 * about, sitting inside the file doing the warning.
 *
 * THE TWO FIGURES ARE EQUAL TODAY — both 4 s, and engine.ts:1258-1259 says in
 * its own words that `WRONG_WAY_REARM_SEC` borrows `speedingRearmSec`'s figure
 * "for the same idea" — so NO VERDICT IN THIS FILE MOVES TODAY. What moves is
 * what happens when the product splits them: the one-way ceiling then follows
 * the one-way constant instead of silently keeping the two-way one, which is
 * exactly the mistake the SUSTAIN clock made for four revisions. The drift test
 * asserts the two are equal, so a split reds the suite rather than passing
 * quietly.
 *
 * AND HERE IS WHAT NO TEST OF THIS FUNCTION CAN DO, said out loud rather than
 * left for the next reader to find. Because the two constants hold the same
 * number, a mutation that makes this function return `SPEEDING_REARM_SEC` on
 * the one-way surface SURVIVES the entire suite — re-measured this session in
 * an isolated copy at the 80-test baseline: 0 tests red.
 *
 * AND SO DOES THE MIRROR, which the revision that wrote this paragraph did not
 * disclose: returning `WRONG_WAY_REARM_SEC` on the TWO-WAY surface also reds
 * 0 of 80. It is the same root cause in the other arm of the same function, and
 * naming only one direction of a two-armed equivalence is how the arm nobody
 * mentioned gets rediscovered as a finding. Both are equivalent mutants today
 * and both stop being equivalent the moment the product splits the figures. The wiring is proven from the other
 * direction, by mutating the PRODUCT constant instead: `WRONG_WAY_REARM_SEC`
 * 4 → 6 reds three named tests (the per-surface ceiling test, the N15a cheat
 * and the drift test), which is what shows the one-way ceiling reads the
 * one-way constant. Two constants that agree cannot be told apart by their
 * effects; that is a fact about the product, not a gap in the tests, and it
 * stops being true the moment the product splits them.
 */
export function surfaceRearmSec(surface) {
  // rules/types.ts `speedingRearmSec: 4` — engine.ts:1155 calls it, in its own
  // words, "this engine's declared unit of „a correction that counts"".
  if (surface === SURFACE_TWO_WAY) return PRODUCT.SPEEDING_REARM_SEC;
  // engine.ts:1000 `const WRONG_WAY_REARM_SEC = 4;`, spent at engine.ts:4044
  // `if (t - s.wrongWayEntry.lawfulSince >= WRONG_WAY_REARM_SEC) s.wrongWayEntry = null;`
  // — the one-way episode's own re-arm, verified at those lines this session.
  if (surface === SURFACE_ONE_WAY) return PRODUCT.WRONG_WAY_REARM_SEC;
  return null;
}

/** sustain / (sustain + rearm), BOTH of them the surface's own. Never chosen. */
export function surfaceAgainstFlowFracCeiling(surface) {
  const sustain = surfaceSustainSec(surface);
  const rearm = surfaceRearmSec(surface);
  if (sustain === null || rearm === null) return null;
  return sustain / (sustain + rearm);
}

/* ────────────────────────────────────────────────────────────────────────────
 * VERDICT ALGEBRA — three-valued, always. `unresolved` is RED at the gate.
 * ──────────────────────────────────────────────────────────────────────────*/

const RANK = { pass: 0, unresolved: 1, fail: 2 };

/** `fail` dominates `unresolved` dominates `pass`. An empty list is unresolved. */
export function worstVerdict(verdicts) {
  if (!verdicts.length) return "unresolved";
  let worst = "pass";
  for (const v of verdicts) if (RANK[v] > RANK[worst]) worst = v;
  return worst;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE ENGINE'S OWN PREDICATES — copied by reference, not re-derived.
 * `gear >= 1` is the obvious guess for "forward" and it is NOT what the engine
 * does: neutral counts as forward there.
 * ──────────────────────────────────────────────────────────────────────────*/

/** engine.ts:3394. */
export function engineMoving(row) {
  return row.speedKmh > PRODUCT.MOVING_SPEED_KMH;
}

/** engine.ts:2935 `const forwardGear = tick.gear >= 0`. */
export function engineForwardGear(row) {
  return row.gear >= 0;
}

/* ────────────────────────────────────────────────────────────────────────────
 * SMALL PURE HELPERS
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Nearest-rank percentile, no interpolation — the same convention
 * `tools/audit/route-fidelity.mjs:353` already uses, so two percentiles in this
 * repo cannot disagree about what p90 means. Every value returned is a value
 * that was actually recorded.
 */
export function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  const rank = Math.ceil(p * sortedAsc.length);
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1));
  return sortedAsc[idx];
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * The leg's own tick period, in SIM seconds, taken from the record rather than
 * assumed.
 *
 * NOTHING IN THIS FILE MAY MEASURE A DURATION WITH IT. It is published, and it
 * is compared against the wall period by AC-RECORD's TWO-CLOCK AGREEMENT RULE,
 * and that is all.
 *
 * THAT SENTENCE WAS FALSE FOR A REVISION, which is worth more than the
 * sentence. The comparison did not exist: the value was computed, published and
 * read by no verdict, and a leg with `tSec` frozen at 0 for 62.95 s of wall
 * time read LEG = pass. It exists now, in `assessRecordCompleteness`, and two
 * named tests in __tests__/road-criteria-cheats.test.mjs red without it.
 * `tSec` is
 * the sim clock and it STOPS when the sim is paused (devrig/rig.ts:54-55), so
 * a controller that freezes or stutters it hides exactly the excursions these
 * criteria exist to find. Measured this session on the known-good leg with tSec
 * pinned to 0 and the wall clock untouched: the sample floor COLLAPSED from 180
 * to 30 and a real 4.00 s excursion at 4.0 m reported 0.000 s; with tSec
 * advanced one period every twentieth tick the same 4.00 s excursion reported
 * 0.200 s. Both legs read LEG = pass. Use `medianWallPeriodSec`.
 */
export function medianTickPeriodSec(rows) {
  const deltas = [];
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i].tSec - rows[i - 1].tSec;
    if (Number.isFinite(d) && d > 0) deltas.push(d);
  }
  return median(deltas);
}

/**
 * THE CLOCK EVERY DURATION IN THIS FILE IS MEASURED ON. `wallMs` keeps running
 * across a pause, a teach card and a frozen sim; it is the clock AC-RECORD's
 * own gap census already (correctly) refused to give up.
 *
 * Returns null when the record publishes no usable wall cadence at all, and a
 * null period is UNRESOLVED at every consumer — never a fallback to a constant.
 */
export function medianWallPeriodSec(rows) {
  const deltas = [];
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i].wallMs - rows[i - 1].wallMs;
    if (Number.isFinite(d) && d > 0) deltas.push(d);
  }
  const ms = median(deltas);
  return ms === null ? null : ms / 1000;
}

/**
 * A tick's own dwell is one period; a one-tick run is not a zero-second run.
 * ON THE WALL CLOCK, always.
 */
function spanWallSec(rows, fromIdx, toIdx, periodSec) {
  return (rows[toIdx].wallMs - rows[fromIdx].wallMs) / 1000 + periodSec;
}

function inAnySpan(row, spans) {
  return spans.some((s) => row.seq >= s.fromSeq && row.seq <= s.toSeq);
}

/**
 * Total wall seconds occupied by a set of seq spans, on this record's own
 * cadence. Used to bound what `declared.*` may remove.
 */
function spansWallSec(rows, spans, periodSec) {
  let sec = 0;
  for (const s of spans) {
    const inside = rows.filter((r) => r.seq >= s.fromSeq && r.seq <= s.toSeq);
    if (inside.length) sec += spanWallSec(inside, 0, inside.length - 1, periodSec);
  }
  return sec;
}

/* ────────────────────────────────────────────────────────────────────────────
 * SURFACES. Both memberships are POSITIVE statements. A row that is neither is
 * UNCLASSIFIED and is counted — never dropped.
 * ──────────────────────────────────────────────────────────────────────────*/

export const SURFACE = Object.freeze({ TWO_WAY: SURFACE_TWO_WAY, ONE_WAY: SURFACE_ONE_WAY });

export function surfaceOf(row) {
  if (row.edgeId === null || row.edgeId === undefined) return null;
  if (row.oneway === false) return SURFACE.TWO_WAY;
  if (row.oneway === true) return SURFACE.ONE_WAY;
  return null;
}

/**
 * The against-flow discriminator for a surface.
 * Returns true / false / null, where NULL MEANS UNKNOWN and is never read as
 * "with the flow".
 */
function againstFlow(row, surface) {
  if (surface === SURFACE.TWO_WAY) {
    // Set-only-when-true on a resolved two-way edge (worldRuntime.ts:2416-2420).
    // Under this gate, and only under it, absence is own-bank.
    return row.opposingBank === true;
  }
  if (surface === SURFACE.ONE_WAY) {
    if (row.wrongWay === true) return true;
    if (row.wrongWay === false) return false; // ambiguous — see the liveness gate
    return null;
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * §DECLARED — WHAT A DECLARATION MAY REMOVE, AND WHEN IT WAS WRITTEN.
 *
 * THE HOLE THIS CLOSES. A `declared.manoeuvreSpans` entry does two things at
 * once: it ACQUITS the against-flow runs it covers, and — from this revision —
 * it exempts the excursions it covers. Until now nothing bounded either, and
 * nothing said WHEN the span was authored. Measured this session on a ring leg
 * alternating 11 wrong-way ticks with 1 lawful tick: ONE declared second of
 * wrong-way driving armed the liveness gate and the leg then read LEG = pass
 * while carrying 734 against-flow ticks in an 800 denominator (frac 0.9175).
 *
 * Two bounds and one pin:
 *
 *  · PINNED BY CONTENT, BEFORE THE DRIVE. `declared.spansHash` must equal
 *    `declaredSpansHash(declared)`. The harness computes it when it authors the
 *    route and writes it into the run record; a span rewritten afterwards — to
 *    cover an excursion the drive turned out to contain — no longer matches.
 *    This is a PIN, not a secret: it proves the spans are the ones that were
 *    committed to, and it cannot prove they were wise. An absent hash is
 *    UNRESOLVED, because "the harness says it declared this beforehand" is the
 *    claim under test.
 *
 *  · BOUNDED IN COUNT. Two declared manoeuvres are distinct acts only once the
 *    lawful behaviour between them has been held for the engine's declared unit
 *    of "a correction that counts" (`speedingRearmSec` = 4 s,
 *    rules/types.ts:1784 / engine.ts:1155). So a leg of D seconds cannot
 *    contain more than `floor(D / 4)` of them, and a harness declaring more is
 *    declaring acts the product could not tell apart. Derived, not chosen.
 *
 *  · BOUNDED IN TOTAL DURATION, by `EXCLUDED_FRACTION_CEILING` — the judgement
 *    this file already declares as one, applied to declared removals as it is
 *    to every other exclusion. A declaration is an exclusion; it does not get
 *    its own, larger allowance for being written down.
 *
 * Both bounds are PUBLISHED whether they bind or not, because a removal nobody
 * counted is the silent-exclusion shape this programme keeps finding.
 * ──────────────────────────────────────────────────────────────────────────*/

function canonicalSpan(s) {
  if (s === null || s === undefined) return null;
  const out = {};
  for (const k of Object.keys(s).sort()) out[k] = s[k];
  return out;
}

/**
 * The content hash of everything a declaration asserts about WHERE in the leg
 * its spans fall. Pure, deterministic, key-order independent. Truncated to 16
 * hex characters: this pins an authored span against a later rewrite, and 64
 * bits is far past what an author can grind by hand while keeping a span that
 * still covers the excursion they wanted covered.
 */
export function declaredSpansHash(declared = {}) {
  const payload = {
    calibration: canonicalSpan(declared.calibration ?? null),
    curvedSpans: (declared.curvedSpans ?? []).map(canonicalSpan),
    manoeuvreSpans: (declared.manoeuvreSpans ?? []).map(canonicalSpan),
    expectedSpanMs: declared.expectedSpanMs ?? null,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

/**
 * The spans a declaration REMOVES something with: the calibration park (the car
 * is deliberately off the lane centre inside it) and every manoeuvre span. The
 * curved spans SELECT a bucket rather than removing anything, so they are
 * counted and published separately and are not charged against the ceiling.
 */
function removalSpansOf(declared) {
  return [
    ...(declared.calibration ? [declared.calibration] : []),
    ...(declared.manoeuvreSpans ?? []),
  ];
}

/**
 * Consulted by AC-REFERENT, AC-FLOW and AC-LANE — every criterion that lets a
 * declaration remove something. `ok: false` is UNRESOLVED at the caller.
 */
export function assessDeclaredSpans(rows, declared = {}, periodSec) {
  const reasons = [];
  const spans = removalSpansOf(declared);
  const driverWallSec = Number.isFinite(declared.expectedSpanMs)
    ? declared.expectedSpanMs / 1000
    : periodSec
      ? rows.length * periodSec
      : null;

  const removedTicks = rows.filter((r) => inAnySpan(r, spans)).length;
  const removedWallSec = periodSec ? spansWallSec(rows, spans, periodSec) : null;
  const countCeiling =
    driverWallSec === null
      ? null
      : Math.floor(driverWallSec / PRODUCT.SPEEDING_REARM_SEC);
  const removedFrac =
    removedWallSec === null || !driverWallSec ? null : removedWallSec / driverWallSec;

  const counts = {
    declaredRemovalSpans: spans.length,
    declaredCurvedSpans: (declared.curvedSpans ?? []).length,
    declaredRemovedTicks: removedTicks,
    declaredSpanCountCeiling: countCeiling,
  };
  const metrics = {
    declaredRemovedWallSec: removedWallSec,
    declaredRemovedFrac: removedFrac,
    declaredSpansHash: declared.spansHash ?? null,
    declaredSpansHashExpected: declaredSpansHash(declared),
    driverWallSec,
  };

  let ok = true;

  if (!declared.spansHash) {
    reasons.push(
      "the declared spans are not pinned: `declared.spansHash` is absent, so nothing says these " +
        "spans were authored BEFORE the drive rather than around its result",
    );
    ok = false;
  } else if (declared.spansHash !== metrics.declaredSpansHashExpected) {
    reasons.push(
      `declared spans do not match their pin (${declared.spansHash} != ` +
        `${metrics.declaredSpansHashExpected}): the spans were rewritten after they were committed to`,
    );
    ok = false;
  }

  for (const s of spans) {
    if (rows.length && !rows.some((r) => r.seq >= s.fromSeq && r.seq <= s.toSeq)) {
      reasons.push(`declared span seq ${s.fromSeq}..${s.toSeq} covers no row in this record`);
      ok = false;
    }
  }
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      if (spans[i].fromSeq <= spans[j].toSeq && spans[j].fromSeq <= spans[i].toSeq) {
        reasons.push(
          `declared spans seq ${spans[i].fromSeq}..${spans[i].toSeq} and ` +
            `${spans[j].fromSeq}..${spans[j].toSeq} overlap: one removal counted twice`,
        );
        ok = false;
      }
    }
  }

  if (countCeiling !== null && spans.length > countCeiling) {
    reasons.push(
      `${spans.length} declared removal span(s) > ceiling ${countCeiling} ` +
        `(floor(${driverWallSec.toFixed(2)} s / speedingRearmSec ${PRODUCT.SPEEDING_REARM_SEC} s)): ` +
        `more separate acts than the product could tell apart on a leg this long`,
    );
    ok = false;
  }
  if (removedFrac !== null && removedFrac > EXCLUDED_FRACTION_CEILING) {
    reasons.push(
      `declared spans remove ${removedWallSec.toFixed(2)} s of a ${driverWallSec.toFixed(2)} s leg ` +
        `= ${removedFrac.toFixed(3)} > ${EXCLUDED_FRACTION_CEILING}: a declaration is an exclusion ` +
        `and gets no larger allowance for being written down`,
    );
    ok = false;
  }

  return { ok, reasons, counts, metrics };
}

/* ────────────────────────────────────────────────────────────────────────────
 * AC-RECORD — RECORD COMPLETENESS. A window never published is ABSENT.
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Monotonic seq, a drop counter, and a WALL-CLOCK gap census.
 *
 * THE CLOCK CHOICE IS THE CRITERION. `tSec` is the sim clock and it STOPS when
 * the sim is paused (devrig/rig.ts:54-55), so a sim-clock census is blind to
 * exactly the shape it is supposed to catch. `wallMs` keeps running. Both are
 * published; only the wall census decides.
 *
 * A gap at or above `laneKeepSustainSec` (3.0 s) is UNRESOLVED, because a
 * contiguous blind window that long can hide exactly one complete
 * POOR_LANE_KEEPING episode, so no statistic computed across it may claim the
 * episode did not happen.
 */
export function assessRecordCompleteness(rows, declared = {}) {
  const reasons = [];
  const counts = { rows: rows.length, droppedTicks: 0, maxContiguousDrop: 0 };
  if (rows.length === 0) {
    return { id: "AC-RECORD", verdict: "unresolved", reasons: ["no rows"], counts, metrics: {} };
  }

  const missingSeq = rows.filter((r) => !Number.isFinite(r.seq)).length;
  const missingWall = rows.filter((r) => !Number.isFinite(r.wallMs)).length;
  counts.rowsWithoutSeq = missingSeq;
  counts.rowsWithoutWallMs = missingWall;
  if (missingSeq || missingWall) {
    reasons.push(
      `record carries no sequence number on ${missingSeq} row(s) and no wall clock on ${missingWall}: ` +
        `a buffer that cannot say what it dropped cannot say it dropped nothing`,
    );
    return { id: "AC-RECORD", verdict: "fail", reasons, counts, metrics: {} };
  }

  const wallGaps = [];
  const simGaps = [];
  // THE TWO CLOCKS, PAIRED PER STEP. The summed-difference rule below (R6) can
  // only see a net imbalance; the per-step pairing is what lets the two
  // cumulative censuses under it see time that was lost on one clock and repaid
  // on the other. Measured before the pairing existed: a 30.00 s sim freeze
  // repaid by one catch-up jump read clockDisagreementSec 0.000e+0 and
  // LEG = pass.
  const steps = [];
  let nonMonotonic = 0;
  let nonMonotonicWall = 0;
  for (let i = 1; i < rows.length; i++) {
    const dSeq = rows[i].seq - rows[i - 1].seq;
    if (dSeq <= 0) nonMonotonic++;
    else if (dSeq > 1) {
      counts.droppedTicks += dSeq - 1;
      counts.maxContiguousDrop = Math.max(counts.maxContiguousDrop, dSeq - 1);
    }
    const dWall = rows[i].wallMs - rows[i - 1].wallMs;
    const dSim = rows[i].tSec - rows[i - 1].tSec;
    if (Number.isFinite(dWall) && dWall <= 0) nonMonotonicWall++;
    if (Number.isFinite(dWall)) wallGaps.push(dWall);
    if (Number.isFinite(dSim)) simGaps.push(dSim);
    if (Number.isFinite(dWall) && Number.isFinite(dSim)) {
      steps.push({ dWallSec: dWall / 1000, dSimSec: dSim });
    }
  }
  counts.nonMonotonicSeqSteps = nonMonotonic;
  // THE CLOCK EVERY DURATION IN THIS FILE IS MEASURED ON GETS `seq`'S OWN
  // CHECK. `seq` was checked for strict monotonicity from the first revision
  // and `wallMs` was not, although every duration in the file is a difference
  // of two `wallMs` values. Measured this session on the known-good leg with a
  // 160-tick wrong-bank run whose `wallMs` was rolled BACK to its own start:
  // the run reported longestUndeclaredRunSec 0.050 s against
  // solidLineCrossSustainSec 0.6, convictingRuns 0, gapBlindWallMs 0,
  // nonMonotonicSeqSteps 0, and LEG = pass. A clock that runs backwards inside
  // an offence is the same class of fabrication as a renumbered `seq`, so it
  // gets the same verdict.
  counts.nonMonotonicWallSteps = nonMonotonicWall;
  if (nonMonotonic > 0) {
    reasons.push(`seq is not strictly increasing at ${nonMonotonic} step(s)`);
  }
  if (nonMonotonicWall > 0) {
    reasons.push(
      `\`wallMs\` is not strictly increasing at ${nonMonotonicWall} step(s): it is the clock every ` +
        `duration in these criteria is measured on, so a record that runs it backwards — or holds ` +
        `it still across a step it also numbers — shortens any offence it chooses to nothing`,
    );
  }

  const sustainMs = PRODUCT.LANE_KEEP_SUSTAIN_SEC * 1000;
  const blindWall = wallGaps.filter((g) => g >= sustainMs);
  const blindSim = simGaps.filter((g) => g >= PRODUCT.LANE_KEEP_SUSTAIN_SEC);
  const periodSec = medianTickPeriodSec(rows);
  const wallPeriodSec = medianWallPeriodSec(rows);
  const wallPeriodMs = wallPeriodSec === null ? null : wallPeriodSec * 1000;
  const impliedDropBlindSec =
    wallPeriodSec === null ? null : counts.maxContiguousDrop * wallPeriodSec;

  // THE CUMULATIVE CENSUS. The per-step rule below compares ONE gap against
  // 3.0 s, and a controller that punctures a hole every 2.9 s walks straight
  // through it: measured this session, 21 holes of 2850 ms each — 59.85 s of a
  // 63 s leg unobserved — with `droppedTicks` 0, the longest wall gap 2900 ms,
  // and LEG = pass. Blindness is CUMULATIVE or it is not a census.
  //
  // THE CEILING IS THE PER-STEP RULE'S OWN, restated over the leg: once the
  // record has lost `laneKeepSustainSec` of wall time IN TOTAL it has lost as
  // much observation as one complete POOR_LANE_KEEPING episode occupies, and no
  // statistic computed across it may claim the episode did not happen. That is
  // exactly the sentence the contiguous rule already makes about one window.
  const gapBlindMs = wallPeriodMs === null
    ? null
    : wallGaps.reduce((a, g) => a + Math.max(0, g - wallPeriodMs), 0);

  /* ── THE CENSUS'S OWN MIRROR, AND WHY ONE HALF WAS NOT A CENSUS ───────────
   * `gapBlindWallMs` above sums the wall time by which each step EXCEEDS the
   * record's own median period — the time the clock SKIPPED. It is measured
   * against a median the record itself authors, and that is a hole in exactly
   * one direction: make the majority of steps be the holes and the median
   * BECOMES the hole. Measured this session on a leg whose cadence alternates
   * 50 ms / 2900 ms: medianWallPeriodSec 2.9, gapBlindWallMs 0,
   * wallGapsAtOrAboveSustain 0 — while 1 795 500 ms of the leg sits between
   * samples — coveredWallMs 3 654 000 against a recordSpanMs of 1 858 450, the
   * AC-LANE sample floor collapsed 180 -> 30, and LEG = pass.
   *
   * THE MIRROR CLOSES IT, AND IT IS THE SAME SENTENCE READ THE OTHER WAY:
   * `cadenceLostWallSec` sums the wall time by which each step FALLS SHORT of
   * the median — the time the clock SWALLOWED. Together the two are
   * median-independent, which is the property neither has alone: whichever
   * value the median lands on, the other population is the one that departs
   * from it, and one of the two censuses is looking straight at it. On the
   * alternating leg the median is 2.9 s and this census reads 630 steps ×
   * 2.85 s = 1 795.50 s; on the same leg with the median at 50 ms the gap
   * census reads the same time.
   *
   * IT ALSO CLOSES COMPRESSION INSIDE AN OFFENCE, which is the shape a gap
   * census cannot see by construction. Measured: 160 contiguous wrong-bank
   * ticks — 8.00 s at the leg's own 20 Hz median — with `wallMs` advancing
   * 0.1 ms per tick inside the run reported the run as 0.0659 s, under
   * solidLineCrossSustainSec 0.6 s, convictingRuns 0, LEG = pass. This census
   * reads 160 × (0.05 − 0.0001) = 7.98 s of swallowed time.
   *
   * A REAL PAUSE IS NOT CHARGED HERE. A pause makes a step LONGER than the
   * median, so `max(0, period − delta)` is 0 for it and the gap census — which
   * is the one that should see it — has it. The two censuses partition the
   * departures; neither double-counts the other's.
   *
   * AND ORDINARY JITTER IS NOT CHARGED EITHER, which took a measurement to get
   * right and is the reason for the `dWallSec < wallPeriodSec / 2` gate. The
   * two censuses are NOT symmetric in their exposure to jitter, and the naive
   * mirror was unusable on any real record. Measured this session on the
   * known-good 1260-tick leg with a deterministic ±j ms alternating jitter
   * around its 50 ms cadence, BEFORE the gate:
   *
   *     ±j ms    gapBlindWallMs    cadenceLost (ungated)    AC-RECORD
   *      0.0                 0                    0.000     pass
   *      1.0                 0                    1.258     pass
   *      2.0                 0                    2.516     pass
   *      2.4                 0                    3.019     unresolved  ←
   *      5.0                 0                    6.290     unresolved
   *     20.0                 0                   25.160     unresolved
   *
   * `gapBlindWallMs` reads 0 at EVERY level, because with an alternating
   * cadence the median lands at the top of the band and nothing exceeds it.
   * The ungated mirror therefore charged the whole band, and refused an honest
   * record at 4.8 % jitter.
   *
   * THE GATE IS DERIVED FROM `seq` BEING AN INTEGER, not chosen. A step whose
   * wall delta is under HALF the median period claims an instantaneous sample
   * rate above twice the median — the record's own tick numbering and its own
   * clock are describing cadences that differ by more than a factor of two,
   * which is a different cadence rather than a spread around one. Two is the
   * smallest factor at which the disagreement amounts to a whole extra tick,
   * and `seq` counts whole ticks. With the gate, jitter is tolerated up to
   * ±16.67 ms on this leg (solve 50 − j < (50 + j)/2), and both cheats are
   * unaffected: the compression leg's steps run at 0.1 ms against a 50 ms
   * median and the alternating leg's at 50 ms against a 2900 ms median.
   *
   * WHAT THE GATE GIVES UP, stated rather than left to be found: a MILD
   * compression — say 50 ms → 30 ms — is not charged here. It does not hide an
   * offence either, and that is why it is acceptable: for a 160-tick wrong-bank
   * run to fall under solidLineCrossSustainSec 0.6 s the steps must compress to
   * under 3.75 ms, which is 7.5 % of the median and far inside the gate. A
   * compression large enough to matter is a compression this census sees.
   *
   * THE BOUND IS THE SAME CONSTANT FOR THE SAME REASON as every other
   * cumulative rule here: once the record's clock and the record's own cadence
   * disagree by one complete POOR_LANE_KEEPING episode's worth of time, no
   * duration measured on that clock may claim the episode did not happen.
   * ────────────────────────────────────────────────────────────────────────*/
  const cadenceLostSec = wallPeriodSec === null
    ? null
    : steps.reduce(
        (a, s) =>
          s.dWallSec < wallPeriodSec / 2 ? a + Math.max(0, wallPeriodSec - s.dWallSec) : a,
        0,
      );

  /* ── THE SIM CLOCK GETS THE CENSUS THE WALL CLOCK ALREADY HAD ─────────────
   * WHAT R6 CANNOT SEE. The two-clock agreement rule below compares the SUM of
   * each clock's deltas, so any freeze that is arithmetically repaid inside the
   * leg is invisible to it — and the module's own lesson eleven lines up
   * ("blindness is CUMULATIVE or it is not a census") had been applied to the
   * wall clock and never to the sim clock. Measured this session, both legs
   * LEG = pass with AC-RECORD raising ZERO reasons:
   *
   *   · ONE 30.00 s sim freeze repaid by one catch-up jump: simAdvanceSec
   *     62.9500 against wallAdvanceSec 62.9500, clockDisagreementSec 0.000e+0,
   *     longestSimGapSec 30.05 and simGapsAtOrAboveSustain 1 both PUBLISHED AND
   *     GATING NOTHING, mayTestify ["lane position on twoWay"].
   *   · The known-good leg with `tSec` pinned to 0 for 1 259 of 1 260 rows and
   *     one catch-up jump on the last: same disagreement of 0.00, sim never
   *     advanced for the whole leg, LEG = pass.
   *   · 21 freezes of 2.90 s each, every one under the per-step idea and the
   *     sum under the 3 s bound: clockDisagreementSec 1.05, the sim frozen on
   *     1 141 of 1 259 steps, LEG = pass.
   *
   * THE RULE. Charge the two directions SEPARATELY and cumulatively, which is
   * what a net sum cannot do: `simLostWallSec` is the wall time during which
   * the sim did not advance, `simGainedWallSec` the sim time with no wall time
   * behind it. A catch-up jump repays the sum and CANNOT repay these, because
   * paying one of them spends the other. Each is bounded by
   * laneKeepSustainSec on the same derivation as every cumulative rule here.
   *
   * BOTH DIRECTIONS, DELIBERATELY. Measured this session, the asymmetry was in
   * the tests and not in the code: mutating R6's `Math.abs` to
   * `Math.max(0, wallAdvanceSec − simAdvanceSec)` redded 0 of 58 tests while
   * the mirror mutation redded 3, so a sim clock running FAST was uncovered.
   * ────────────────────────────────────────────────────────────────────────*/
  const simLostWallSec = steps.reduce((a, s) => a + Math.max(0, s.dWallSec - s.dSimSec), 0);
  const simGainedWallSec = steps.reduce((a, s) => a + Math.max(0, s.dSimSec - s.dWallSec), 0);

  /* ── WHAT THE DROP COUNTER COSTS ──────────────────────────────────────────
   * `droppedTicks` was accumulated from the first revision and read by no
   * verdict; only `maxContiguousDrop` was consumed, and a record that spreads
   * its drops walks through that. Measured this session: `seq` striding 60
   * while `wallMs` advances 50 ms claims 74 281 dropped ticks inside a 63 s
   * leg — an implied 1 200 Hz against a 20 Hz median — with maxContiguousDrop
   * 59, impliedDropBlindSec 2.95 s (just under the clock) and LEG = pass.
   *
   * A DROPPED TICK IS BLIND TIME AT THE RECORD'S OWN CADENCE, and blindness is
   * cumulative here as it is everywhere else in this function. The same
   * constant, the same sentence: once the ticks the record admits losing add up
   * to one complete POOR_LANE_KEEPING episode, no statistic computed over what
   * survived may claim the episode did not happen.
   * ────────────────────────────────────────────────────────────────────────*/
  const dropBlindSec = wallPeriodSec === null ? null : counts.droppedTicks * wallPeriodSec;

  /* ── THE TWO-CLOCK AGREEMENT RULE ─────────────────────────────────────────
   * THE HOLE THIS CLOSES, AND IT WAS IN THIS FILE'S OWN HEADER AS A CLAIM THAT
   * WAS ALREADY TRUE. The header said `medianTickPeriodSec` "survives only to
   * be compared against the wall period in AC-RECORD". It did not. Measured
   * this session, from the repo root:
   *
   *     grep -n medianTickPeriodSec tools/mobile/lib/road-criteria.mjs
   *     → 4 hits: the header sentence, the definition, ONE call and ONE
   *       publication. THERE WAS NO COMPARISON.
   *
   * So a leg whose sim clock is frozen at 0 for 63.00 s of wall time read
   * AC-RECORD = pass, LEG = pass, and certified `mayTestify ["lane position on
   * twoWay"]`; a leg whose sim clock ran 26x slow (sim span 2.39 s against a
   * wall span 62.95 s) did the same. Both are in the cheat suite. The two
   * sim-clock legs that WERE red (N3a, N3b) were red because of an EXCURSION
   * they happened to carry — the clock fraud itself raised nothing.
   *
   * THE RULE IS ROW 63'S THIRD REMEDY, WORD FOR WORD: red "when the summed tSec
   * deltas and the summed wallMs deltas disagree by more than one
   * laneKeepSustainSec over the leg". Two clocks that disagree by that much say
   * one of two things, and this criterion cannot tell them apart:
   *
   *   · THE SIM WAS STOPPED while the record kept writing rows — devrig/rig.ts:
   *     54-55 names the shape ("a teach card / quiz / consequence overlay stops
   *     onTick entirely"). A car that was not moving for one complete
   *     POOR_LANE_KEEPING episode's worth of time was not driving the leg it is
   *     being judged on.
   *   · ONE OF THE TWO CLOCKS WAS REWRITTEN, which is the fabricated-record
   *     shape the rest of AC-RECORD exists for.
   *
   * Either way the record is UNMEASURABLE, not clean. The bound is the
   * contiguous rule's own constant restated over the leg, exactly as the
   * cumulative gap census above restates the per-step rule.
   *
   * WHY IT IS NOT REDUNDANT WITH THE WALL-GAP CENSUS. A pause that stops
   * `onTick` leaves a WALL gap and the per-step rule already reds it. A pause —
   * or a fabrication — that freezes the sim while rows keep arriving at 20 Hz
   * leaves NO gap in any census above: measured on the known-good leg with
   * `tSec` pinned to 0 and nothing else touched, every counter in this function
   * read clean.
   * ────────────────────────────────────────────────────────────────────────*/
  const simAdvanceSec = simGaps.reduce((a, g) => a + g, 0);
  const wallAdvanceSec = wallGaps.reduce((a, g) => a + g, 0) / 1000;
  const clockDisagreementSec = Math.abs(wallAdvanceSec - simAdvanceSec);

  // …AND THE HALF A GAP CENSUS CANNOT SEE. A record whose wall clock is smooth
  // but SHORT is blind at its ends, or between ticks it renumbered away. The
  // span therefore comes from the DRIVER'S OWN CLOCK — a duration the record
  // did not author — and never from rows[last] − rows[0], which is a quantity a
  // fabricated record controls and can INFLATE: the same 21-hole leg reports a
  // record span of 121 750 ms for a 63 000 ms drive.
  const driverWallMs = Number.isFinite(declared.expectedSpanMs)
    ? declared.expectedSpanMs
    : null;
  const sampledWallMs = wallPeriodMs === null ? null : rows.length * wallPeriodMs;
  const unsampledWallMs =
    driverWallMs === null || sampledWallMs === null
      ? null
      : Math.max(0, driverWallMs - sampledWallMs);

  const metrics = {
    longestWallGapMs: wallGaps.length ? Math.max(...wallGaps) : 0,
    longestSimGapSec: simGaps.length ? Math.max(...simGaps) : 0,
    wallGapsAtOrAboveSustain: blindWall.length,
    simGapsAtOrAboveSustain: blindSim.length,
    blindWallMs: blindWall.reduce((a, b) => a + b, 0),
    gapBlindWallMs: gapBlindMs,
    medianTickPeriodSec: periodSec,
    medianWallPeriodSec: wallPeriodSec,
    // The two-clock agreement rule's own three numbers. CONSUMED — see the
    // block above and the refusal below.
    simAdvanceSec,
    wallAdvanceSec,
    clockDisagreementSec,
    // The four cumulative censuses. ALL FOUR GATE — see the four refusals
    // below, and the mutation results recorded beside each block.
    cadenceLostWallSec: cadenceLostSec,
    simLostWallSec,
    simGainedWallSec,
    dropBlindWallSec: dropBlindSec,
    impliedDropBlindSec,
    // The record's own idea of how long it lasted. PUBLISHED, NEVER CONSUMED —
    // it is the number the fabricated record controls.
    recordSpanMs: rows[rows.length - 1].wallMs - rows[0].wallMs,
    // What the record actually SAMPLED, and what the driver says elapsed.
    coveredWallMs: sampledWallMs,
    driverWallSpanMs: driverWallMs,
    unsampledWallMs,
    expectedSpanMs: declared.expectedSpanMs ?? null,
  };

  if (wallPeriodSec === null) {
    reasons.push(
      "the record publishes no usable wall cadence: every duration in these criteria is measured " +
        "on `wallMs`, so a leg without one is unmeasurable, not clean",
    );
  }
  if (clockDisagreementSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) {
    reasons.push(
      `the record's two clocks disagree by ${clockDisagreementSec.toFixed(2)} s over the leg ` +
        `(wall ${wallAdvanceSec.toFixed(2)} s of summed \`wallMs\` deltas against sim ` +
        `${simAdvanceSec.toFixed(2)} s of summed \`tSec\` deltas; median period wall ` +
        `${wallPeriodSec === null ? "none" : wallPeriodSec.toFixed(4)} s against sim ` +
        `${periodSec === null ? "none — the sim clock never advanced" : periodSec.toFixed(4)} s; ` +
        `${blindSim.length} sim gap(s) at or above laneKeepSustainSec, longest ` +
        `${metrics.longestSimGapSec.toFixed(2)} s), at or above laneKeepSustainSec ` +
        `${PRODUCT.LANE_KEEP_SUSTAIN_SEC} s: either the sim was stopped for one complete ` +
        `POOR_LANE_KEEPING episode's worth of time while the record kept writing rows ` +
        `(devrig/rig.ts:54-55), or one of the two clocks was rewritten — and this criterion cannot ` +
        `tell which, so the record is unmeasurable rather than clean`,
    );
  }
  if (blindWall.length > 0) {
    reasons.push(
      `${blindWall.length} wall-clock gap(s) at or above laneKeepSustainSec ` +
        `(longest ${metrics.longestWallGapMs} ms >= ${sustainMs} ms, ${metrics.blindWallMs} ms in ` +
        `those gaps in total): the record is blind for long enough to hide one complete ` +
        `POOR_LANE_KEEPING episode`,
    );
  }
  if (gapBlindMs !== null && gapBlindMs >= sustainMs) {
    reasons.push(
      `wall-clock gaps total ${Math.round(gapBlindMs)} ms across ${wallGaps.length} step(s) ` +
        `(longest ${metrics.longestWallGapMs} ms, each on its own under the per-step rule), at or ` +
        `above laneKeepSustainSec ${sustainMs} ms in aggregate: blindness is cumulative`,
    );
  }
  if (cadenceLostSec !== null && cadenceLostSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) {
    reasons.push(
      `the record's wall clock falls short of the record's OWN median cadence by ` +
        `${cadenceLostSec.toFixed(2)} s in total across ${steps.length} step(s) ` +
        `(median period ${wallPeriodSec.toFixed(4)} s), at or above laneKeepSustainSec ` +
        `${PRODUCT.LANE_KEEP_SUSTAIN_SEC} s: time the clock SWALLOWED, which is the half of the ` +
        `gap census that is measured against a median the record itself authors — either the ` +
        `cadence was compressed inside the leg to shorten what it contains, or the median is the ` +
        `hole`,
    );
  }
  if (simLostWallSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) {
    reasons.push(
      `the sim clock did not advance for ${simLostWallSec.toFixed(2)} s of wall time in total ` +
        `across ${steps.length} step(s) (longest single sim gap ` +
        `${metrics.longestSimGapSec.toFixed(2)} s, ${blindSim.length} at or above ` +
        `laneKeepSustainSec; net disagreement ${clockDisagreementSec.toFixed(2)} s, which a ` +
        `catch-up jump repays and this census does not), at or above laneKeepSustainSec ` +
        `${PRODUCT.LANE_KEEP_SUSTAIN_SEC} s: the sim was stopped for one complete ` +
        `POOR_LANE_KEEPING episode's worth of time while the record kept writing rows ` +
        `(devrig/rig.ts:54-55)`,
    );
  }
  if (simGainedWallSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) {
    reasons.push(
      `the sim clock advanced ${simGainedWallSec.toFixed(2)} s further than the wall clock in ` +
        `total across ${steps.length} step(s), at or above laneKeepSustainSec ` +
        `${PRODUCT.LANE_KEEP_SUSTAIN_SEC} s: sim time with no wall time behind it is either a ` +
        `catch-up jump repaying a freeze this record is not otherwise declaring, or a rewritten ` +
        `clock`,
    );
  }
  if (dropBlindSec !== null && dropBlindSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) {
    reasons.push(
      `${counts.droppedTicks} dropped tick(s) in total = ${dropBlindSec.toFixed(2)} s at this ` +
        `leg's own median cadence (${wallPeriodSec.toFixed(4)} s), at or above laneKeepSustainSec ` +
        `${PRODUCT.LANE_KEEP_SUSTAIN_SEC} s: the record admits losing more observation than one ` +
        `complete POOR_LANE_KEEPING episode occupies, however the losses were spread — ` +
        `${rows.length} row(s) plus ${counts.droppedTicks} dropped inside ` +
        `${Math.round(metrics.recordSpanMs)} ms is an implied ` +
        `${(metrics.recordSpanMs > 0 ? ((rows.length + counts.droppedTicks) / (metrics.recordSpanMs / 1000)) : 0).toFixed(1)} Hz ` +
        `against a measured ${(1 / wallPeriodSec).toFixed(1)} Hz`,
    );
  }
  if (blindSim.length > 0) {
    reasons.push(
      `${blindSim.length} sim-clock gap(s) at or above laneKeepSustainSec (longest ` +
        `${metrics.longestSimGapSec.toFixed(2)} s >= ${PRODUCT.LANE_KEEP_SUSTAIN_SEC} s): one ` +
        `step in which the sim advanced by a whole episode's worth of time is a step the sim was ` +
        `not running through, whatever the summed deltas come to`,
    );
  }
  if (impliedDropBlindSec !== null && impliedDropBlindSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) {
    reasons.push(
      `${counts.maxContiguousDrop} contiguously dropped tick(s) = ${impliedDropBlindSec.toFixed(2)} s ` +
        `at this leg's own cadence, at or above laneKeepSustainSec`,
    );
  }
  if (driverWallMs === null) {
    reasons.push(
      "no driver-clock span declared: the only check a fully rewritten record cannot defeat is a " +
        "duration it did not author, and `declared.expectedSpanMs` is absent",
    );
  } else if (unsampledWallMs !== null && unsampledWallMs >= sustainMs) {
    reasons.push(
      `record samples ${Math.round(sampledWallMs)} ms (${rows.length} ticks × ` +
        `${wallPeriodMs.toFixed(1)} ms) of a ${driverWallMs} ms leg on the driver's own clock: ` +
        `${Math.round(unsampledWallMs)} ms unsampled, at or above laneKeepSustainSec`,
    );
  }

  let verdict = "pass";
  if (nonMonotonic > 0 || nonMonotonicWall > 0) verdict = "fail";
  else if (reasons.length > 0) verdict = "unresolved";
  return { id: "AC-RECORD", verdict, reasons, counts, metrics };
}

/* ────────────────────────────────────────────────────────────────────────────
 * AC-REFERENT — REFERENT LIVENESS. A criterion over a record nobody checked is
 * worthless.
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Two halves, both required:
 *
 *  1. A KNOWN-OFFSET INJECTION. The leg declares a span in which the car was
 *     parked a known distance off the lane centre; the record must read it back.
 *     Tolerance is the locator's own LANE_SWITCH_DEADBAND_M (0.35 m,
 *     locator.ts:56) — below the deadband a disagreement cannot be told apart
 *     from the lane hysteresis holding a lane. A leg with NO injection is
 *     UNRESOLVED: "the probe looked plausible" is not a calibration.
 *
 *  2. A VARIANCE FLOOR. p95 − p05 of `laneOffsetM` over on-road rows must reach
 *     the same deadband. A record whose entire excursion is smaller than the
 *     smallest quantity the locator acts on has not demonstrated it can move,
 *     and is not distinguishable from a probe wired to a constant.
 *
 * DISCLOSED LIMIT: the injection certifies MAGNITUDE, not sign. `laneOffsetM`
 * is positive on both banks (the two-way branch of `computeLane` sets travelDir
 * from the bank and then computes the same scalar on both), so no injection can
 * prove the referent's sign is bank-correct. That is AC-FLOW's job and nothing
 * else's.
 */
export function assessReferentLiveness(rows, declared = {}) {
  const reasons = [];
  const onRoad = rows.filter((r) => r.edgeId !== null && r.edgeId !== undefined);
  const counts = { rows: rows.length, onRoadRows: onRoad.length };
  if (onRoad.length === 0) {
    return {
      id: "AC-REFERENT",
      verdict: "unresolved",
      reasons: ["no on-road rows: the referent was never asked"],
      counts,
      metrics: {},
    };
  }

  const values = onRoad.map((r) => r.laneOffsetM).filter((v) => Number.isFinite(v));
  counts.finiteOffsets = values.length;
  counts.distinctOffsets = new Set(values).size;
  const sorted = [...values].sort((a, b) => a - b);
  const spreadM = percentile(sorted, 0.95) - percentile(sorted, 0.05);
  const metrics = { spreadM, p05M: percentile(sorted, 0.05), p95M: percentile(sorted, 0.95) };

  let verdict = "pass";

  // The injection span is a declared span like any other: if it was not pinned
  // before the drive, "the car was parked 2.0 m off centre here" is a claim the
  // record's author could have written after reading the record.
  const decl = assessDeclaredSpans(rows, declared, medianWallPeriodSec(rows));
  Object.assign(counts, decl.counts);
  Object.assign(metrics, decl.metrics);
  if (!decl.ok) {
    reasons.push(...decl.reasons.map((r) => `[declared] ${r}`));
    verdict = worstVerdict([verdict, "unresolved"]);
  }

  const cal = declared.calibration ?? null;
  if (cal === null) {
    reasons.push(
      "no known-offset injection declared: the referent was never checked against a known truth",
    );
    verdict = worstVerdict([verdict, "unresolved"]);
  } else {
    const span = rows.filter((r) => r.seq >= cal.fromSeq && r.seq <= cal.toSeq);
    counts.calibrationRows = span.length;
    if (span.length === 0) {
      reasons.push(`declared injection span seq ${cal.fromSeq}..${cal.toSeq} contains no rows`);
      verdict = worstVerdict([verdict, "unresolved"]);
    } else {
      const read = median(span.map((r) => Math.abs(r.laneOffsetM)));
      const errM = Math.abs(read - Math.abs(cal.offsetM));
      metrics.injectionDeclaredM = cal.offsetM;
      metrics.injectionReadM = read;
      metrics.injectionErrM = errM;

      /* ── THE INJECTION MUST BE A PLACE THE REFERENT CAN STILL ANSWER FROM ──
       * WHAT THIS CLOSES. The check above certifies AGREEMENT — the record read
       * back what was injected — and says nothing about WHERE. Measured this
       * session: a 6.25 s calibration park declared at 40.00 m off the lane
       * centre and read back at 40.00 m reported injectionErrM 0.0000, so this
       * criterion congratulated it; `removalSpansOf` then made the span exempt
       * from the excursion census, declaredRemovedFrac came to 0.0993 under the
       * 0.1 ceiling, and LEG = pass certifying mayTestify ["lane position on
       * twoWay"].
       *
       * THE BOUND IS THE FILE'S OWN SATURATION CONSTANT, not a new judgement.
       * AC-LANE already declares that at or past LANE_WIDTH_M/2 (8.125/2 =
       * 4.0625 m) the offset is SATURATED and excludes those ticks from the
       * statistic, on the ground that the value is no longer a measurement of
       * where the car is. An injection placed there is certifying the clamp,
       * not the referent: the two would agree for any declared number at all.
       * A calibration is the one thing in this file that is supposed to prove
       * the referent MOVES, so it must be placed where movement is still
       * legible.
       * ────────────────────────────────────────────────────────────────────*/
      const saturationM = PRODUCT.LANE_WIDTH_M / 2;
      metrics.injectionSaturationM = saturationM;
      if (Math.abs(cal.offsetM) >= saturationM - EPS || read >= saturationM - EPS) {
        reasons.push(
          `injection declared at ${cal.offsetM} m and read at ${read.toFixed(4)} m, at or past the ` +
            `saturation bound LANE_WIDTH_M/2 = ${saturationM} m: past it AC-LANE already treats ` +
            `the offset as no longer a measurement of where the car is, so an injection and its ` +
            `read-back would agree there for any declared number — the referent is certified as ` +
            `clamped, not as live`,
        );
        verdict = worstVerdict([verdict, "fail"]);
      }
      if (errM > PRODUCT.LANE_SWITCH_DEADBAND_M) {
        reasons.push(
          `injection: parked at ${cal.offsetM} m off centre, record reads ${read.toFixed(4)} m ` +
            `(err ${errM.toFixed(4)} m > LANE_SWITCH_DEADBAND_M ${PRODUCT.LANE_SWITCH_DEADBAND_M} m): ` +
            `the referent does not answer for the road`,
        );
        verdict = worstVerdict([verdict, "fail"]);
      }
    }
  }

  if (spreadM < PRODUCT.LANE_SWITCH_DEADBAND_M) {
    reasons.push(
      `referent spread p95−p05 = ${spreadM.toFixed(4)} m over ${values.length} on-road rows, ` +
        `below the locator's own deadband ${PRODUCT.LANE_SWITCH_DEADBAND_M} m: indistinguishable ` +
        `from a probe wired to a constant`,
    );
    verdict = worstVerdict([verdict, "unresolved"]);
  }

  return { id: "AC-REFERENT", verdict, reasons, counts, metrics };
}

/* ────────────────────────────────────────────────────────────────────────────
 * AC-FLOW — TRAVELLING WITH THE FLOW, PER SURFACE, EACH WITH ITS OWN
 * PUBLISHED DENOMINATOR.
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Runs of against-flow ticks on one surface.
 *
 * A run ENDS on positive contrary evidence — a row on the same surface whose
 * discriminator says with-the-flow. A row that is merely UNCLASSIFIABLE (off
 * road, other surface, discriminator unknown) does not end it; it BRIDGES, up to
 * `laneKeepSustainSec` of bridging, and the bridged ticks are published.
 *
 * WHY BRIDGING. Without it, a controller that flickers `edgeId` to null every
 * other tick never accumulates 0.6 s of anything, and the threshold is dead.
 * With it, the only over-detection possible is the blind interval BETWEEN two
 * against-flow observations on the same surface — and claiming the car was fine
 * in there is the claim that needs the evidence, not the other way round.
 */
function flowRuns(rows, surface, periodSec) {
  const runs = [];
  let cur = null;
  let pending = [];
  const close = () => {
    if (cur) runs.push(cur);
    cur = null;
    pending = [];
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const surf = surfaceOf(row);
    const against = againstFlow(row, surf === surface ? surface : null);
    if (surf === surface && against === true) {
      if (!cur) {
        cur = {
          fromIdx: i, toIdx: i, ticks: 0, bridgedTicks: 0, slowTicks: 0, reverseTicks: 0,
          // THE LONGEST UNBROKEN STRETCH OF `true` INSIDE THE RUN, which is a
          // different quantity from the run's span and is the one the witness
          // floor needs. See the floor in `assessSurface` for the measurement
          // that forced the distinction.
          contiguousTicks: 0, runContiguous: 0,
        };
      } else {
        // A BRIDGE BREAKS CONTIGUITY. The bridge exists so a flickering
        // `edgeId` cannot dissolve an offence, and for the RUN that is right:
        // claiming the car was fine inside a blind interval is the claim that
        // needs evidence. For the WITNESS it is the opposite — a bridged
        // stretch is precisely where the channel did NOT say true.
        if (pending.length > 0) cur.runContiguous = 0;
        cur.bridgedTicks += pending.length;
        pending = [];
      }
      cur.toIdx = i;
      cur.ticks++;
      cur.runContiguous++;
      cur.contiguousTicks = Math.max(cur.contiguousTicks, cur.runContiguous);
      if (!engineMoving(row)) cur.slowTicks++;
      if (!engineForwardGear(row)) cur.reverseTicks++;
    } else if (cur) {
      if (surf === surface && against === false) {
        close();
      } else {
        pending.push(i);
        const bridgeSec = (rows[i].wallMs - rows[cur.toIdx].wallMs) / 1000;
        if (bridgeSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) close();
      }
    }
  }
  close();
  for (const r of runs) {
    r.fromSeq = rows[r.fromIdx].seq;
    r.toSeq = rows[r.toIdx].seq;
    r.sec = spanWallSec(rows, r.fromIdx, r.toIdx, periodSec);
    // On the record's own median cadence, never on the run's endpoints: the
    // endpoints span the bridge, which is the thing being excluded here.
    r.contiguousSec = r.contiguousTicks * periodSec;
  }
  return runs;
}

function assessSurface(rows, surface, declared, periodSec) {
  const reasons = [];
  const member = rows.filter((r) => surfaceOf(r) === surface);
  const against = member.filter((r) => againstFlow(r, surface) === true);
  const counts = {
    denominator: member.length,
    againstFlowTicks: against.length,
    // COUNTED, NEVER EXCLUDED. These are the two predicates the draft used to
    // drop out of the numerator, which is C1 and C2 exactly.
    slowAgainstFlowTicks: against.filter((r) => !engineMoving(r)).length,
    reverseAgainstFlowTicks: against.filter((r) => !engineForwardGear(r)).length,
    // Liveness is scanned ON THIS SURFACE ONLY. A `true` seen anywhere else
    // cannot arm this channel: the product sets `wrongWay` exclusively on
    // one-way edges (worldRuntime.ts:2306-2312), so a cross-surface scan would
    // let an unrelated row acquit a ring.
    discriminatorTrueTicks: member.filter((r) => againstFlow(r, surface) === true).length,
    discriminatorUnknownTicks: member.filter((r) => againstFlow(r, surface) === null).length,
  };
  // N14 — THE CONTRADICTORY ROW. `wrongWay` is set on ONE-WAY edges only
  // (worldRuntime.ts:2306-2312 gates it `edgeRt.edge.oneway && …`), so a row
  // that reads `wrongWay === true` while classifying as TWO-WAY is not a clean
  // drive with a stray field — it is a row whose SURFACE is wrong, and every
  // denominator it lands in is the wrong one. Measured this session: a tap that
  // defaults `oneway ?? false` puts 600 ring ticks carrying `wrongWay: true`
  // into the two-way denominator, which reports 0 against-flow ticks over 30 s
  // of declared wrong-way driving and LEG = pass.
  //
  // …AND THE SAME RULE IN THE OTHER DIRECTION, which was missing for four
  // revisions while the paragraph above described the mechanism. `opposingBank`
  // is published under `if (!edgeRt.edge.oneway) { … tick.opposingBank = true }`
  // — verified this session by the quoted code, not by a line number, because
  // a parallel lane is moving that file — so a row carrying `opposingBank: true`
  // while classifying as ONE-WAY is exactly as impossible as the row this rule
  // already refuses, and for the same reason. Measured before the mirror
  // existed: 600 wrong-BANK ticks (30.00 s) carrying `opposingBank: true` filed
  // under `oneway: true` reported oneWayContradictoryRows 0, oneWayFrac 0.0238
  // — because the one-way discriminator is `wrongWay`, which read a clean
  // false across all 600 — and LEG = pass certifying
  // mayTestify ["lane position on oneWay"].
  const contradictoryField = surface === SURFACE.TWO_WAY ? "wrongWay" : "opposingBank";
  counts.contradictoryRows = member.filter((r) => r[contradictoryField] === true).length;

  const fracCeiling = surfaceAgainstFlowFracCeiling(surface);
  const metrics = {
    againstFlowFrac: member.length ? against.length / member.length : null,
    againstFlowFracCeiling: fracCeiling,
    sustainSec: surfaceSustainSec(surface),
    discriminatorUnknownFrac: member.length
      ? counts.discriminatorUnknownTicks / member.length
      : null,
  };

  const channel = surface === SURFACE.TWO_WAY ? "opposingBank" : "wrongWay";
  const channels = declared.channels ?? null;
  if (channels === null || !channels.includes(channel)) {
    reasons.push(
      `the leg does not declare that its probe carries \`${channel}\`: a channel the record was ` +
        `never built to publish reads exactly like a clean drive`,
    );
    return { surface, verdict: "unresolved", reasons, counts, metrics, runs: [] };
  }

  if (member.length === 0) {
    reasons.push(`no ticks on this surface: zero denominator is UNRESOLVED, never a clean pass`);
    return { surface, verdict: "unresolved", reasons, counts, metrics, runs: [] };
  }

  if (counts.contradictoryRows > 0) {
    const where =
      surface === SURFACE.TWO_WAY
        ? "`wrongWay` is assigned only where `edgeRt.edge.oneway` holds (worldRuntime.ts, the " +
          "three-gate chain), so a row carrying it true cannot be on a two-way edge"
        : "`opposingBank` is set only inside `if (!edgeRt.edge.oneway)` (worldRuntime.ts, the " +
          "bank consult), so a row carrying it true cannot be on a one-way edge";
    reasons.push(
      `${counts.contradictoryRows} row(s) in this ${surface} denominator carry ` +
        `\`${contradictoryField}: true\`: ${where}. The surface these rows were filed under ` +
        `contradicts the runtime's own contract, so neither denominator is this record's to report`,
    );
    return { surface, verdict: "fail", reasons, counts, metrics, runs: [] };
  }

  // A surface whose discriminator was never answered for a large share of its
  // own denominator has not been asked. `null` is UNKNOWN and is never read as
  // with-the-flow (see `againstFlow`); this is the counter that makes the
  // unknowns cost something. On the two-way surface it is structurally zero —
  // `opposingBank` is set-only-when-true, so "unknown" is not expressible there
  // — and the check is kept on both surfaces so a future tap that starts
  // publishing a tri-state cannot land on a rule that was never written.
  if (metrics.discriminatorUnknownFrac > EXCLUDED_FRACTION_CEILING) {
    reasons.push(
      `\`${channel}\` is unknown on ${counts.discriminatorUnknownTicks} of ${member.length} ticks ` +
        `= ${metrics.discriminatorUnknownFrac.toFixed(3)} > ${EXCLUDED_FRACTION_CEILING}: the ` +
        `discriminator was not answered often enough for this denominator to mean anything`,
    );
    return { surface, verdict: "unresolved", reasons, counts, metrics, runs: [] };
  }

  // THE ONE-WAY LIVENESS GATE. See the header: `wrongWay === false` is two
  // meanings on one value (worldRuntime.ts:2306-2312), so this surface may only
  // acquit on a leg that proved the channel can say true.
  if (surface === SURFACE.ONE_WAY && counts.discriminatorTrueTicks === 0) {
    reasons.push(
      `\`wrongWay\` never reads true anywhere in this record, so its \`false\` cannot be told apart ` +
        `from "not evaluated" (worldRuntime.ts:2306-2312 publishes false when the district states ` +
        `no one-way streets and the edge is not a ring, and when the car is off the carriageway). ` +
        `The one-way surface needs its own declared witness excursion, exactly as the referent ` +
        `needs its injection`,
    );
    return { surface, verdict: "unresolved", reasons, counts, metrics, runs: [] };
  }

  const spans = declared.manoeuvreSpans ?? [];
  const runs = flowRuns(rows, surface, periodSec);
  const declaredRuns = [];
  const undeclaredRuns = [];
  for (const run of runs) {
    const covered = spans.some((s) => run.fromSeq >= s.fromSeq && run.toSeq <= s.toSeq);
    (covered ? declaredRuns : undeclaredRuns).push(run);
  }
  counts.declaredManoeuvreRuns = declaredRuns.length;
  counts.declaredManoeuvreTicks = declaredRuns.reduce((a, r) => a + r.ticks, 0);
  counts.undeclaredRuns = undeclaredRuns.length;
  metrics.longestUndeclaredRunSec = undeclaredRuns.reduce((a, r) => Math.max(a, r.sec), 0);
  // THE WITNESS, and it is every run — declared or not. The liveness gate below
  // asks how LONG the channel said true, and a declared run is still the
  // channel speaking; the declaration excuses the offence, it does not unsay it.
  //
  // TWO MEASURES, AND THE FLOOR READS THE SECOND. `r.sec` is the run's SPAN,
  // which `flowRuns` deliberately BRIDGES across unknown and off-surface ticks;
  // `r.contiguousSec` is the longest unbroken stretch of `true` inside it.
  // The span is published because it is what the conviction rules use. The
  // floor may not use it — see the BRIDGE paragraph in the floor below.
  metrics.longestWitnessRunSec = runs.reduce((a, r) => Math.max(a, r.sec), 0);
  metrics.longestContiguousWitnessSec = runs.reduce((a, r) => Math.max(a, r.contiguousSec), 0);

  // THE SURFACE'S OWN CLOCK. `solidLineCrossSustainSec` is CROSSED_SOLID_LINE's,
  // and that composite's condition is gated `tick.oneway === false`
  // (engine.ts:3518) — it can never run on a one-way road. The one-way clock is
  // `wrongWaySustainSec` (rules/types.ts:1902).
  const sustainSec = metrics.sustainSec;
  const clockName =
    surface === SURFACE.TWO_WAY ? "solidLineCrossSustainSec" : "wrongWaySustainSec";
  // The RE-ARM half of the ceiling, also the surface's own (see
  // `surfaceRearmSec`): `speedingRearmSec` on a two-way road,
  // `WRONG_WAY_REARM_SEC` on a one-way one. Equal figures today, different
  // constants, and the reason string names the one it actually used.
  const rearmSec = surfaceRearmSec(surface);
  const rearmName =
    surface === SURFACE.TWO_WAY ? "speedingRearmSec" : "WRONG_WAY_REARM_SEC";
  const convicting = undeclaredRuns.filter((r) => r.sec >= sustainSec);
  counts.convictingRuns = convicting.length;

  let verdict = "pass";
  if (convicting.length > 0) {
    const worst = convicting.reduce((a, r) => (r.sec > a.sec ? r : a));
    reasons.push(
      `${convicting.length} undeclared against-flow run(s) at or above ${clockName} ` +
        `(${sustainSec} s); longest ${worst.sec.toFixed(2)} s over ` +
        `${worst.ticks} tick(s) at seq ${worst.fromSeq}..${worst.toSeq} ` +
        `(slow ${worst.slowTicks}, reverse ${worst.reverseTicks}, bridged ${worst.bridgedTicks})`,
    );
    verdict = "fail";
  }

  // THE FRACTION RULE — see §THE PER-SURFACE CLOCKS for the derivation. This is
  // the consumer `againstFlowFrac` never had, and it is what the run rule
  // cannot do: no arrangement of separately-lawful runs can put more than
  // sustain/(sustain+rearm) of a surface's ticks against the flow, so a leg
  // that does is not a sequence of escapes — it is one offence the one-tick
  // reset chopped up.
  if (metrics.againstFlowFrac !== null && metrics.againstFlowFrac > fracCeiling) {
    reasons.push(
      `${against.length} of ${member.length} ticks on this surface are against the flow ` +
        `= ${metrics.againstFlowFrac.toFixed(4)} > ${fracCeiling.toFixed(6)} ` +
        `(${clockName} ${sustainSec} s / (${sustainSec} s + ${rearmName} ` +
        `${rearmSec} s), the highest duty cycle reachable with runs that are ` +
        `each separately lawful); ${counts.convictingRuns} run(s) convicted on length, longest ` +
        `${metrics.longestUndeclaredRunSec.toFixed(3)} s; of the ${against.length} against-flow ` +
        `ticks ${counts.declaredManoeuvreTicks} were acquitted by a declared manoeuvre, ` +
        `${counts.slowAgainstFlowTicks} were under movingSpeedKmh and ` +
        `${counts.reverseAgainstFlowTicks} were in reverse — all three COUNTED, none excluded`,
    );
    verdict = "fail";
  }

  /* ── THE WITNESS FLOOR (one-way only) ─────────────────────────────────────
   * WHAT IT CLOSES. The liveness gate above asks whether `wrongWay` can ever
   * say true. It does not ask whether it said true for long enough to MEAN
   * anything, and a channel armed by a blip acquits everything else in the
   * record for free. Measured this session on the cheat suite's N15b: 1260
   * one-way ticks, 20 of them (1.0 s) declared wrong-way at seq 200..219, the
   * other 1240 carrying the ambiguous `wrongWay: false` — againstFlowFrac
   * 0.0159 against a ceiling of 0.2727, declaredRemovedWallSec 6.00 s of 62.95
   * = 0.0953 against a ceiling of 0.1, convictingRuns 0, LEG = pass, and the
   * leg then certified `mayTestify ["lane position on oneWay"]`.
   *
   * THE RULE, AND IT IS THE PRODUCT'S OWN NUMBER. A witness the PRODUCT WOULD
   * NOT ITSELF HAVE BILLED is not a demonstration that the channel answers: the
   * engine arms WRONG_WAY on `wrongWaySustainSec` (1.5 s, rules/types.ts
   * `wrongWaySustainSec: 1.5`) and "dies on the first lawful frame"
   * (engine.ts:4036-4043), so a run shorter than that clock is a state the
   * engine never believed either. A leg whose longest against-flow run is under
   * its surface's own sustain has proven the channel can flicker, not that it
   * can report.
   *
   * WHY IT IS NOT A NUMBER THAT CAN BE WIDENED AROUND. Lengthening the witness
   * costs declared-removal budget, and §DECLARED already bounds that by
   * EXCLUDED_FRACTION_CEILING. On N15b's own leg the two rules meet with no gap
   * between them, measured: a witness of 1.25 s passes the budget (6.25 s of
   * 62.95 = 0.0993) and fails this floor, and a witness of 1.30 s clears this
   * floor's neighbourhood but breaks the budget (6.30 s of 62.95 = 0.1001), so
   * the declaration is stripped, the run reads undeclared, and it convicts on
   * length. There is no witness length that passes that leg. The cheat suite
   * asserts both ends.
   *
   * WHY ONE-WAY ONLY. `opposingBank` is set-only-when-true on a resolved
   * two-way edge (worldRuntime.ts:2416-2420), so its absence is a positive
   * statement and the two-way surface needs no witness to acquit. That
   * asymmetry is this file's oldest, and L2 in the header discloses the hole it
   * leaves on the two-way side rather than papering over it here.
   *
   * WHY IT IS THE LAST CHECK. It only ever DOWNGRADES a pass: `fail` dominates
   * `unresolved`, so a leg whose witness is long enough to convict stays
   * convicted, and does not get reclassified as merely unmeasurable.
   *
   * WHY IT MEASURES CONTIGUOUS TICKS AND NOT THE RUN'S SPAN, and this is the
   * hole the floor shipped with. `flowRuns` BRIDGES up to laneKeepSustainSec of
   * unknown or off-surface ticks, on purpose — without it a flickering
   * `edgeId` dissolves any offence. So the run's `sec` is a BRIDGED span, and
   * for one revision the floor tested that. Measured this session on the same
   * 1260-tick 62.95 s one-way leg the disclosure below argues over: TWO ticks
   * of `wrongWay: true` at seq 200 and seq 229 with the 28 ticks between them
   * carrying `wrongWay: null` produced a 1.50 s "witness" — exactly the
   * wrongWaySustainSec the floor asks for — on 0.10 s of channel evidence.
   * LEG = pass, mayTestify ["lane position on oneWay"], discriminatorTrueTicks
   * 2, convictingRuns 0, discriminatorUnknownFrac 0.0222 against a 0.1 ceiling,
   * declaredRemovedFrac 0.0397 against a 0.1 ceiling. A bridge made of
   * `edgeId: null` rows instead reads identically. The IDENTICAL leg with those
   * 28 ticks set to `wrongWay: false` reads unresolved, which is what shows the
   * bridge — and not the witness — was doing the work.
   *
   * AND THE BRIDGE IS FREE, which is why the budget argument above did not
   * bound it. Lengthening a witness costs declared-removal budget; unknown and
   * off-surface ticks are billed to no ceiling at all, so the bridged span
   * could be stretched to the sustain clock at no cost. The floor's own
   * justification — "a run shorter than the clock the engine arms WRONG_WAY on
   * is a state the product never believed either" — is a statement about
   * CONTIGUOUS frames: the engine's wrong-way state "dies on the first lawful
   * frame" (engine.ts:4036-4043), and two frames 1.45 s apart is exactly a
   * state it never held. So the floor reads `contiguousSec`.
   * ────────────────────────────────────────────────────────────────────────*/
  if (surface === SURFACE.ONE_WAY && metrics.longestContiguousWitnessSec < sustainSec) {
    reasons.push(
      `the only witness that \`wrongWay\` can say true in this record is ` +
        `${counts.discriminatorTrueTicks} tick(s), longest CONTIGUOUS run ` +
        `${metrics.longestContiguousWitnessSec.toFixed(3)} s (bridged span ` +
        `${metrics.longestWitnessRunSec.toFixed(3)} s) < ${clockName} ${sustainSec} s ` +
        `(${counts.declaredManoeuvreTicks} of those ticks were acquitted by a declared ` +
        `manoeuvre): a run shorter than the clock the engine arms WRONG_WAY on is a state the ` +
        `product never believed either, so it cannot stand as proof that the channel answers ` +
        `for the other ${member.length - counts.discriminatorTrueTicks} tick(s), whose ` +
        `\`wrongWay: false\` worldRuntime.ts:2306-2312 publishes both for "travelling with the ` +
        `flow" and for "nobody asked"`,
    );
    verdict = worstVerdict([verdict, "unresolved"]);
  }
  return { surface, verdict, reasons, counts, metrics, runs: undeclaredRuns };
}

/**
 * The bank criterion, restated as "travelling with the flow" over BOTH
 * surfaces, each with its own published denominator, and a zero denominator
 * reading UNRESOLVED PER SURFACE — so a ring lesson cannot pass on
 * approach-road ticks.
 *
 * The leg's verdict is the worst over the surfaces it actually VISITED. A
 * surface with no ticks does not red a leg that never drove on it; it scopes
 * what the leg may testify to, which is published in `surfacesJudged`.
 */
export function assessFlow(rows, declared = {}) {
  const periodSec = medianWallPeriodSec(rows) ?? 0;
  // A DECLARATION THAT IS NOT PINNED BUYS NOTHING. The spans are stripped
  // before they reach the surfaces, so an unpinned or over-budget declaration
  // cannot acquit a run; the leg then reads whatever the undeclared rows say,
  // and the declaration's own refusal is added on top.
  const decl = assessDeclaredSpans(rows, declared, periodSec);
  const effective = decl.ok ? declared : { ...declared, manoeuvreSpans: [] };
  const surfaces = {};
  for (const s of [SURFACE.TWO_WAY, SURFACE.ONE_WAY]) {
    surfaces[s] = assessSurface(rows, s, effective, periodSec);
  }

  // Unclassified rows are COUNTED. A long contiguous run of them is a blind
  // window by another name and gets the same sustain rule.
  const counts = {
    rows: rows.length,
    unclassifiedTicks: rows.filter((r) => surfaceOf(r) === null).length,
  };
  let longestUnclassifiedSec = 0;
  let runStart = -1;
  for (let i = 0; i <= rows.length; i++) {
    const unclassified = i < rows.length && surfaceOf(rows[i]) === null;
    if (unclassified && runStart < 0) runStart = i;
    if (!unclassified && runStart >= 0) {
      longestUnclassifiedSec = Math.max(
        longestUnclassifiedSec,
        spanWallSec(rows, runStart, i - 1, periodSec),
      );
      runStart = -1;
    }
  }

  /* ── THE UNCLASSIFIED CENSUS IS CUMULATIVE TOO ────────────────────────────
   * AC-RECORD's gap census and AC-LANE's excursion census were both made
   * cumulative because a contiguous-only rule is walked through by a controller
   * that keeps every single run under the clock. This one was left contiguous
   * for a revision while `unclassifiedTicks` was accumulated and compared to
   * nothing. Measured this session: 754 of 1260 ticks (59.8 %) with `edgeId`
   * null, arranged in 58-tick runs of 2.90 s each — every run under the 3.0 s
   * rule below — reported longestUnclassifiedRunSec 2.90, a two-way denominator
   * of 506, unclassifiedTicks 754 read by nothing, and LEG = pass certifying
   * mayTestify ["lane position on twoWay"].
   *
   * SAME DERIVATION, SAME CONSTANT, THIRD PLACE IT IS APPLIED: once the leg has
   * spent one complete POOR_LANE_KEEPING episode's worth of time with the flow
   * question unanswered, "the car was with the flow" is not a thing this leg
   * may say, however the unanswered time was chopped up.
   * ────────────────────────────────────────────────────────────────────────*/
  counts.unclassifiedWallSec = counts.unclassifiedTicks * periodSec;

  const reasons = [];
  const visited = Object.values(surfaces).filter((s) => s.counts.denominator > 0);
  let verdict = worstVerdict(visited.map((s) => s.verdict));
  if (visited.length === 0) {
    reasons.push("the record contains no ticks on any resolved surface");
    verdict = "unresolved";
  }
  if (longestUnclassifiedSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) {
    reasons.push(
      `a contiguous ${longestUnclassifiedSec.toFixed(2)} s run of unclassified ticks (no edge, or no ` +
        `\`oneway\`) at or above laneKeepSustainSec: the flow question is unanswered across it`,
    );
    verdict = worstVerdict([verdict, "unresolved"]);
  }
  if (periodSec && counts.unclassifiedWallSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) {
    reasons.push(
      `${counts.unclassifiedTicks} of ${rows.length} tick(s) are unclassified (no edge, or no ` +
        `\`oneway\`) = ${counts.unclassifiedWallSec.toFixed(2)} s in total (longest single run ` +
        `${longestUnclassifiedSec.toFixed(2)} s, each on its own under the per-run rule), at or ` +
        `above laneKeepSustainSec ${PRODUCT.LANE_KEEP_SUSTAIN_SEC} s in aggregate: the flow ` +
        `question is unanswered for one complete episode's worth of the leg`,
    );
    verdict = worstVerdict([verdict, "unresolved"]);
  }

  /* ── THE LEG-WIDE AGAINST-FLOW BOUND ──────────────────────────────────────
   * WHAT IT ADDS. The fraction ceiling in `assessSurface` is PER SURFACE, and
   * until this revision nothing at all was said about the leg. A leg that
   * visits both surfaces therefore spends both budgets and no number anywhere
   * records what it spent in total.
   *
   * THE BOUND IS THE LEG'S OWN SURFACE MIX, not a new judgement: each surface
   * may lawfully carry sustain/(sustain+rearm) of ITS OWN ticks against the
   * flow, so the most a leg can carry is that ceiling weighted by how many
   * ticks it spent on each surface. Nothing is chosen; the mix comes from the
   * record and the two ceilings come from the product.
   *
   * WHAT IT DOES NOT CLOSE, said plainly because the alternative is a chosen
   * number wearing a derivation. Measured this session on a leg of 630 two-way
   * ticks carrying 77 against-flow (0.1222 < 0.130434, in honest 0.55 s runs)
   * and 630 one-way ticks carrying 146 (0.2317 < 0.272727, in honest 1.45 s
   * runs): 223 against-flow ticks = 11.15 s = 17.70 % of the leg, against a mix
   * ceiling of (630 × 0.130434 + 630 × 0.272727) / 1260 = 0.201581. The leg is
   * UNDER its own mix ceiling and this rule does not red it — because every one
   * of its runs really is separately lawful, and the duty-cycle derivation
   * really does allow that much. Tightening the number to catch it would be
   * inventing a threshold, which is the thing this file refuses to do. It is
   * disclosed as L8 in the header instead.
   * ────────────────────────────────────────────────────────────────────────*/
  let legMembers = 0;
  let legAgainst = 0;
  let legCeilingNumerator = 0;
  for (const s of Object.values(surfaces)) {
    const n = s.counts.denominator;
    legMembers += n;
    legAgainst += s.counts.againstFlowTicks;
    legCeilingNumerator += n * surfaceAgainstFlowFracCeiling(s.surface);
  }
  counts.legAgainstFlowTicks = legAgainst;
  counts.legClassifiedTicks = legMembers;
  const legAgainstFlowFrac = legMembers ? legAgainst / legMembers : null;
  const legAgainstFlowFracCeiling = legMembers ? legCeilingNumerator / legMembers : null;
  if (
    legAgainstFlowFrac !== null &&
    legAgainstFlowFracCeiling !== null &&
    legAgainstFlowFrac > legAgainstFlowFracCeiling
  ) {
    reasons.push(
      `${legAgainst} of ${legMembers} classified tick(s) across the whole leg are against the ` +
        `flow = ${legAgainstFlowFrac.toFixed(4)} > ${legAgainstFlowFracCeiling.toFixed(6)}, the ` +
        `ceiling this leg's OWN surface mix affords (each surface's ` +
        `sustain/(sustain+rearm), weighted by the ticks the leg spent on it): a leg cannot ` +
        `spend two surfaces' budgets and call the total lawful`,
    );
    verdict = "fail";
  }
  if (!decl.ok) {
    reasons.push(...decl.reasons.map((r) => `[declared] ${r}`));
    verdict = worstVerdict([verdict, "unresolved"]);
  }
  for (const s of Object.values(surfaces)) reasons.push(...s.reasons.map((r) => `[${s.surface}] ${r}`));

  return {
    id: "AC-FLOW",
    verdict,
    reasons,
    counts: {
      ...counts,
      ...decl.counts,
      longestUnclassifiedRunSec: longestUnclassifiedSec,
      twoWayDenominator: surfaces[SURFACE.TWO_WAY].counts.denominator,
      oneWayDenominator: surfaces[SURFACE.ONE_WAY].counts.denominator,
    },
    metrics: {
      medianWallPeriodSec: periodSec,
      // CONSUMED by the leg-wide bound above. Published beside the per-surface
      // pair so a reader sees both budgets and the total in one place.
      legAgainstFlowFrac,
      legAgainstFlowFracCeiling,
      ...decl.metrics,
    },
    surfaces,
    surfacesJudged: visited.filter((s) => s.verdict === "pass").map((s) => s.surface),
  };
}

/**
 * THE DRAFT'S OWN RULE, kept executable so the cheats can be PROVEN live rather
 * than asserted. This is AC-2B as drafted: gated `oneway === false`, numerator
 * filtered by the engine's `moving` and `forwardGear`. Do not call it from a
 * criterion — it exists for the controls, which show it returning a clean 0 on
 * legs that drove on the wrong side of the road.
 */
export function draftWrongBankFrac(rows) {
  const member = rows.filter(
    (r) => r.edgeId !== null && r.edgeId !== undefined && r.oneway === false,
  );
  if (member.length === 0) return { frac: null, denominator: 0, numerator: 0 };
  const num = member.filter(
    (r) => r.opposingBank === true && engineMoving(r) && engineForwardGear(r),
  );
  return { frac: num.length / member.length, denominator: member.length, numerator: num.length };
}

/* ────────────────────────────────────────────────────────────────────────────
 * AC-LANE — LANE HOLDING, on ticks the product would itself have graded.
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * The filter is the engine's own, idiom for idiom:
 *
 *   edgeId != null                    the runtime resolved an edge
 *   laneLinesPainted !== false        engine.ts:3551. `=== true` selects ZERO
 *                                     ticks on every painted road, because the
 *                                     runtime publishes this field only in the
 *                                     disarming direction (worldRuntime.ts:2397).
 *                                     That filter is what killed draft 1.
 *   opposingBank !== true             engine.ts:3526 — an EXCLUSION from this
 *                                     statistic, never evidence of a correct
 *                                     bank. AC-FLOW judges the bank.
 *   |laneOffsetM| < LANE_WIDTH_M/2    saturation excluded, stated symbolically
 *   moving && forwardGear             engine.ts:3622-3631, POOR_LANE_KEEPING's
 *                                     own gates. A lane-holding number computed
 *                                     over ticks the product would not grade is
 *                                     a claim about ticks nobody disputed.
 */
export function assessLaneHolding(rows, declared = {}) {
  const reasons = [];
  const curvedSpans = declared.curvedSpans ?? null;
  if (curvedSpans === null) {
    return {
      id: "AC-LANE",
      verdict: "unresolved",
      reasons: [
        "no curved spans declared: the bucket must come from the route, before the drive exists, " +
          "or a car that drove straight through every bend has no curved samples and passes trivially",
      ],
      counts: { rows: rows.length },
      metrics: {},
    };
  }

  const periodSec = medianWallPeriodSec(rows);
  if (periodSec === null) {
    return {
      id: "AC-LANE",
      verdict: "unresolved",
      reasons: [
        "the record publishes no usable wall cadence, so no duration in this criterion can be " +
          "measured: a frozen or absent `wallMs` is unmeasurable, never clean",
      ],
      counts: { rows: rows.length },
      metrics: {},
    };
  }
  const decl = assessDeclaredSpans(rows, declared, periodSec);
  const exemptSpans = decl.ok ? removalSpansOf(declared) : [];
  const curved = rows.filter((r) => inAnySpan(r, curvedSpans));
  const counts = {
    rows: rows.length,
    curvedTicksTotal: curved.length,
    // ALL SIX PUBLISHED EXCLUSION CLASSES. Until this revision the ceiling read
    // `(offRoad + saturated) / curved` and the other four were counted and
    // spent by nobody: measured this session, 400 scattered unpainted ticks at
    // 4.0 m removed half of an 801-tick curved bucket and reported excludedFrac
    // 0.0000, and 400 scattered not-moving ticks did the same. The ceiling now
    // runs over the UNION — `curved − graded` — which is every class at once
    // and cannot grow
    // a new hole when a seventh class is added to the filter.
    offRoadTicks: curved.filter((r) => r.edgeId === null || r.edgeId === undefined).length,
    unpaintedTicks: curved.filter((r) => r.laneLinesPainted === false).length,
    opposingBankTicks: curved.filter((r) => r.opposingBank === true).length,
    saturatedTicks: curved.filter(
      (r) => Math.abs(r.laneOffsetM) >= PRODUCT.LANE_WIDTH_M / 2 - EPS,
    ).length,
    notMovingTicks: curved.filter((r) => !engineMoving(r)).length,
    reverseTicks: curved.filter((r) => !engineForwardGear(r)).length,
    outsideCurvedSpanTicks: rows.length - curved.length,
    ...decl.counts,
  };

  // ONE PREDICATE, TWO SCOPES. The same six classes the bucket ceiling runs
  // over are now also run over the whole leg — see the LEG-WIDE block below for
  // the measurement that forced it.
  const isGradable = (r) =>
    r.edgeId !== null &&
    r.edgeId !== undefined &&
    r.laneLinesPainted !== false &&
    r.opposingBank !== true &&
    Math.abs(r.laneOffsetM) < PRODUCT.LANE_WIDTH_M / 2 - EPS &&
    engineMoving(r) &&
    engineForwardGear(r);
  const graded = curved.filter(isGradable);
  counts.gradedTicks = graded.length;

  /* ── EVERY EXCLUSION CLASS IS METERED LEG-WIDE, NOT BUCKET-WIDE ───────────
   * WHAT THIS CLOSES, AND IT IS THE SAME SHAPE THREE TIMES OVER. `excludedFrac`
   * is computed as (curved − graded)/curved, so a class that does its work
   * OUTSIDE the declared curved span is charged to nothing at all — while
   * inside the bucket the identical flag is charged against
   * EXCLUDED_FRACTION_CEILING. Measured this session, all three LEG = pass
   * before this rule, each on a leg whose curved bucket was left clean:
   *
   *   · 900 of 1260 ticks (71 %) at 40.00 m flagged `laneLinesPainted: false`
   *     outside the bucket — excursionScanTicks 260 of 1260 (the flag ALSO
   *     drops the row from `excursionEligible`), excursionTicks 0,
   *     excludedFrac 0.
   *   · 754 of 1260 ticks with `edgeId` null — excludedFrac 0, and
   *     `unclassifiedTicks` compared to nothing (AC-FLOW now meters that too).
   *   · 600 ticks carrying `opposingBank: true` outside the bucket —
   *     excludedFrac 0.
   *
   * THE CEILING IS THE ONE ALREADY DECLARED, applied to the leg the same way it
   * is applied to the bucket. A tick the product could not have graded is an
   * excluded tick wherever it falls; the bucket boundary is a claim about
   * BENDS, and it was silently scoping what counts as evidence.
   *
   * DECLARED REMOVALS ARE NOT DOUBLE-CHARGED HERE. They are bounded, pinned and
   * counted by §DECLARED on their own budget, exactly as they are exempted from
   * the excursion census below; charging them twice would make the two ceilings
   * fight each other rather than cover different ground.
   * ────────────────────────────────────────────────────────────────────────*/
  const legScan = rows.filter((r) => !inAnySpan(r, exemptSpans));
  const legGraded = legScan.filter(isGradable);
  counts.legScanTicks = legScan.length;
  counts.legGradedTicks = legGraded.length;
  counts.legOffRoadTicks = legScan.filter((r) => r.edgeId === null || r.edgeId === undefined).length;
  counts.legUnpaintedTicks = legScan.filter((r) => r.laneLinesPainted === false).length;
  counts.legOpposingBankTicks = legScan.filter((r) => r.opposingBank === true).length;
  counts.legSaturatedTicks = legScan.filter(
    (r) => Math.abs(r.laneOffsetM) >= PRODUCT.LANE_WIDTH_M / 2 - EPS,
  ).length;
  counts.legNotMovingTicks = legScan.filter((r) => !engineMoving(r)).length;
  counts.legReverseTicks = legScan.filter((r) => !engineForwardGear(r)).length;

  // THE RATE IS THE WALL RATE. On the sim clock this collapsed: measured this
  // session with `tSec` pinned to 0, the period read null, the rate 0 Hz and
  // the floor fell 180 -> 30 — a leg could be graded on a thirtieth of the
  // evidence by freezing a clock the criteria were never supposed to consult.
  const tickRateHz = 1 / periodSec;
  const floor = Math.max(30, Math.ceil(3 * PRODUCT.LANE_KEEP_SUSTAIN_SEC * tickRateHz));
  counts.sampleFloor = floor;
  // THE SAMPLE'S WALL DURATION IS PUBLISHED, AND DELIBERATELY NOT A SECOND
  // FLOOR. A wall-seconds floor of 3 × laneKeepSustainSec was written here and
  // then removed, because it CANNOT FIRE: the tick floor is max(30, ceil(3 ×
  // laneKeepSustainSec × hz)), so `gradedTicks >= floor` already implies
  // `gradedTicks / hz >= 9 s` — searched hz 0.1..400 in 0.1 steps this session,
  // no counterexample. A rule that cannot fail is the shape this repo has
  // measured at 51 of 82 repairs; the number stays as a reported quantity and
  // makes no claim. What actually stops the floor collapsing is the RATE coming
  // off the wall clock a few lines above (measured: 180 -> 30 on the sim clock).
  const gradedWallSec = graded.length * periodSec;

  const abs = graded.map((r) => Math.abs(r.laneOffsetM)).sort((a, b) => a - b);
  const legAbs = legGraded.map((r) => Math.abs(r.laneOffsetM)).sort((a, b) => a - b);
  const metrics = {
    p90AbsOffsetM: percentile(abs, 0.9),
    // THE SAME STATISTIC OVER THE WHOLE LEG, against the same ceiling. See the
    // refusal below for the leg this exists because of.
    legP90AbsOffsetM: percentile(legAbs, 0.9),
    legExcludedFrac: legScan.length ? (legScan.length - legGraded.length) / legScan.length : null,
    maxAbsOffsetM: abs.length ? abs[abs.length - 1] : null,
    tickRateHz,
    gradedWallSec,
    // The UNION of every exclusion class, which is exactly what the graded
    // filter removed. Per-class counts stay in `counts` so a reader can see
    // WHICH class did it.
    excludedFrac: curved.length ? (curved.length - graded.length) / curved.length : null,
    ...decl.metrics,
  };

  let verdict = "pass";
  if (graded.length < floor) {
    reasons.push(
      `graded curved sample ${graded.length} < floor ${floor} ` +
        `(max(30, ceil(3 × laneKeepSustainSec × ${tickRateHz.toFixed(2)} Hz))): ` +
        `off-road ${counts.offRoadTicks}, unpainted ${counts.unpaintedTicks}, ` +
        `opposing-bank ${counts.opposingBankTicks}, saturated ${counts.saturatedTicks}, ` +
        `not-moving ${counts.notMovingTicks}, reverse ${counts.reverseTicks}`,
    );
    verdict = worstVerdict([verdict, "unresolved"]);
  }
  if (!decl.ok) {
    reasons.push(...decl.reasons.map((r) => `[declared] ${r}`));
    verdict = worstVerdict([verdict, "unresolved"]);
  }

  // The longest contiguous EXCLUDED run inside the curved bucket, on the same
  // sustain clock: a blind window that long can hide a whole episode.
  let longestExcludedSec = 0;
  let start = -1;
  const isGraded = new Set(graded);
  for (let i = 0; i <= curved.length; i++) {
    const excluded = i < curved.length && !isGraded.has(curved[i]);
    if (excluded && start < 0) start = i;
    if (!excluded && start >= 0) {
      longestExcludedSec = Math.max(longestExcludedSec, spanWallSec(curved, start, i - 1, periodSec));
      start = -1;
    }
  }
  metrics.longestExcludedRunSec = longestExcludedSec;
  if (longestExcludedSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) {
    reasons.push(
      `longest contiguous excluded run ${longestExcludedSec.toFixed(2)} s >= laneKeepSustainSec`,
    );
    verdict = worstVerdict([verdict, "unresolved"]);
  }
  if (metrics.excludedFrac !== null && metrics.excludedFrac > EXCLUDED_FRACTION_CEILING) {
    reasons.push(
      `(curved − graded) / curved = ${curved.length - graded.length}/${curved.length} = ` +
        `${metrics.excludedFrac.toFixed(3)} > ${EXCLUDED_FRACTION_CEILING} (a declared judgement, ` +
        `not a measurement) — off-road ${counts.offRoadTicks}, unpainted ${counts.unpaintedTicks}, ` +
        `opposing-bank ${counts.opposingBankTicks}, saturated ${counts.saturatedTicks}, ` +
        `not-moving ${counts.notMovingTicks}, reverse ${counts.reverseTicks} (classes overlap; ` +
        `the ceiling is over their union)`,
    );
    verdict = worstVerdict([verdict, "unresolved"]);
  }
  if (metrics.legExcludedFrac !== null && metrics.legExcludedFrac > EXCLUDED_FRACTION_CEILING) {
    reasons.push(
      `(leg − graded) / leg = ${legScan.length - legGraded.length}/${legScan.length} = ` +
        `${metrics.legExcludedFrac.toFixed(3)} > ${EXCLUDED_FRACTION_CEILING} over the WHOLE leg ` +
        `(the bucket's own figure is ${metrics.excludedFrac === null ? "null" : metrics.excludedFrac.toFixed(3)}) ` +
        `— off-road ${counts.legOffRoadTicks}, unpainted ${counts.legUnpaintedTicks}, ` +
        `opposing-bank ${counts.legOpposingBankTicks}, saturated ${counts.legSaturatedTicks}, ` +
        `not-moving ${counts.legNotMovingTicks}, reverse ${counts.legReverseTicks} (classes ` +
        `overlap; the ceiling is over their union): an exclusion outside the declared curved ` +
        `spans is still an exclusion`,
    );
    verdict = worstVerdict([verdict, "unresolved"]);
  }
  /* THE HARD GEOMETRIC REFUSAL IS LEG-WIDE, for the same reason the excursion
   * census below is. "The car left the authored world" is not a claim about a
   * bend, and scanning it with `curved.some(...)` meant the only unconditional
   * FAIL in this criterion could be walked around by declaring a curved span
   * somewhere else. Measured: `worldEdgeClearanceM` −12 m on 959 of 1260 ticks,
   * all outside the declared span — LEG = pass, and AC-LANE raised no reason at
   * all. */
  const offWorld = rows.filter(
    (r) => Number.isFinite(r.worldEdgeClearanceM) && r.worldEdgeClearanceM < 0,
  );
  counts.offWorldTicks = offWorld.length;
  counts.offWorldTicksInCurvedSpans = curved.filter(
    (r) => Number.isFinite(r.worldEdgeClearanceM) && r.worldEdgeClearanceM < 0,
  ).length;
  if (offWorld.length > 0) {
    reasons.push(
      `worldEdgeClearanceM < 0 on ${offWorld.length} tick(s) (${counts.offWorldTicksInCurvedSpans} ` +
        `of them inside the declared curved spans): the car left the authored world`,
    );
    verdict = "fail";
  }
  if (metrics.p90AbsOffsetM !== null && metrics.p90AbsOffsetM > LANE_HOLD_P90_CEILING_M) {
    reasons.push(
      `p90 |laneOffsetM| ${metrics.p90AbsOffsetM.toFixed(3)} m > ceiling ` +
        `${LANE_HOLD_P90_CEILING_M.toFixed(2)} m (laneKeepMaxOffsetM − half the car's width)`,
    );
    verdict = "fail";
  }
  /* ── AND THE SAME CEILING OVER THE WHOLE LEG ──────────────────────────────
   * WHAT THIS CLOSES. `curvedSpans` selects the bucket the p90 is computed
   * over, and the p90 ceiling (2.40 m) is TIGHTER than the excursion threshold
   * (laneKeepMaxOffsetM 3.25 m) that the leg-wide census uses. So the band
   * between 2.40 m and 3.25 m was judged inside the bucket and nowhere else.
   * Measured this session: 900 of 1260 ticks held at 3.00 m off centre, outside
   * a 260-tick declared curved bucket — under laneKeepMaxOffsetM so the
   * excursion census never fired, 25 % past the ceiling the leg is certified
   * against, p90AbsOffsetM 0.8929 inside the bucket, excludedFrac 0,
   * longestExcursionSec 0, cumulativeExcursionSec 0, LEG = pass certifying
   * mayTestify ["lane position on twoWay"].
   *
   * WHY NOT A COVERAGE FLOOR ON THE BUCKET INSTEAD, which is the other obvious
   * repair. A floor would have to say what fraction of a leg must be bends, and
   * no product constant says that — a route is mostly straight by construction,
   * so any figure would be chosen and would wear a derivation it does not have.
   * Applying the ceiling the leg is ALREADY certified against to the ticks it
   * was not applied to needs no new number at all.
   * ────────────────────────────────────────────────────────────────────────*/
  if (metrics.legP90AbsOffsetM !== null && metrics.legP90AbsOffsetM > LANE_HOLD_P90_CEILING_M) {
    reasons.push(
      `leg-wide p90 |laneOffsetM| ${metrics.legP90AbsOffsetM.toFixed(3)} m > ceiling ` +
        `${LANE_HOLD_P90_CEILING_M.toFixed(2)} m over ${legGraded.length} graded tick(s) of ` +
        `${legScan.length}, of which ${counts.outsideCurvedSpanTicks} fall outside the declared ` +
        `curved spans where the bucket statistic (p90 ` +
        `${metrics.p90AbsOffsetM === null ? "null" : metrics.p90AbsOffsetM.toFixed(3)} m) never ` +
        `looks: the band between this ceiling and laneKeepMaxOffsetM ` +
        `${PRODUCT.LANE_KEEP_MAX_OFFSET_M} m is judged by nothing else`,
    );
    verdict = "fail";
  }

  /* ── THE EXCURSION CENSUS ──────────────────────────────────────────────────
   * THREE THINGS CHANGED HERE, each measured, each a leg that used to pass.
   *
   * 1. IT IS LEG-WIDE, NOT CURVED-BUCKET. `curvedSpans` SELECTS the bucket the
   *    p90 lane-holding statistic is computed over — a claim about following a
   *    bend — and it was silently scoping the product's own POOR_LANE_KEEPING
   *    condition as well. Measured: a 4.00 s excursion to 4.0 m placed OUTSIDE
   *    the declared curved span reported longestExcursionSec 0.000 and LEG =
   *    pass, with 459 of 1260 rows graded by nothing at all.
   *
   * 2. IT DOES NOT CARRY `moving`, `forwardGear` OR THE SATURATION EXCLUSION.
   *    This is the header's own asymmetry, applied to the second question the
   *    same way it is applied to the first. Those three belong to the p90
   *    STATISTIC, where a clamped or ungraded value would bias a percentile.
   *    They do not belong to the question "was the car in its lane", and while
   *    they did, a saturation park put the car 4.1 m off the lane centre —
   *    past laneKeepMaxOffsetM AND past half a lane — and every one of those
   *    ticks left the census by being too far out to count. The manoeuvring
   *    student they used to protect is protected by `declared.manoeuvreSpans`
   *    instead, which §DECLARED now bounds and pins.
   *
   * 3. IT IS CUMULATIVE AS WELL AS CONTIGUOUS. Measured: two 2.00 s stops at
   *    4.1 m — each deliberately under the 3.0 s sustain — reported
   *    excursionSec 0.000, excludedFrac 0.0999 and LEG = pass. The cumulative
   *    ceiling is the contiguous rule's own constant restated over the leg:
   *    once the car has spent one complete episode's worth of time outside the
   *    band, "it held its lane" is not a thing this leg may say, however the
   *    time was chopped up. Same derivation as AC-RECORD's cumulative census.
   * ────────────────────────────────────────────────────────────────────────*/
  const excursionEligible = (r) =>
    r.edgeId !== null && r.edgeId !== undefined && r.laneLinesPainted !== false &&
    !inAnySpan(r, exemptSpans);
  let excursionSec = 0;
  let cumulativeExcursionSec = 0;
  let overTicks = 0;
  let runFrom = -1;
  let lastOver = -1;
  const closeRun = () => {
    if (runFrom >= 0) {
      excursionSec = Math.max(excursionSec, spanWallSec(rows, runFrom, lastOver, periodSec));
    }
    runFrom = -1;
    lastOver = -1;
  };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!excursionEligible(r)) {
      // Bridges, on the same clock and the same bound as `flowRuns`: an
      // ineligible tick is not evidence the excursion ended.
      if (runFrom >= 0 && (r.wallMs - rows[lastOver].wallMs) / 1000 >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) {
        closeRun();
      }
      continue;
    }
    if (Math.abs(r.laneOffsetM) > PRODUCT.LANE_KEEP_MAX_OFFSET_M) {
      if (runFrom < 0) runFrom = i;
      lastOver = i;
      overTicks++;
    } else {
      closeRun();
    }
  }
  closeRun();
  cumulativeExcursionSec = overTicks * periodSec;
  metrics.longestExcursionSec = excursionSec;
  metrics.cumulativeExcursionSec = cumulativeExcursionSec;
  counts.excursionTicks = overTicks;
  counts.excursionScanTicks = rows.filter(excursionEligible).length;
  if (excursionSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) {
    reasons.push(
      `excursion past laneKeepMaxOffsetM sustained ${excursionSec.toFixed(2)} s >= ` +
        `laneKeepSustainSec: the product's own POOR_LANE_KEEPING condition, scanned leg-wide over ` +
        `${counts.excursionScanTicks} eligible tick(s) — of which ${counts.outsideCurvedSpanTicks} ` +
        `fall OUTSIDE the declared curved spans, where the p90 bucket never looks`,
    );
    verdict = "fail";
  }
  if (cumulativeExcursionSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC) {
    reasons.push(
      `${overTicks} tick(s) past laneKeepMaxOffsetM = ${cumulativeExcursionSec.toFixed(2)} s in ` +
        `total (longest single run ${excursionSec.toFixed(2)} s), at or above laneKeepSustainSec ` +
        `${PRODUCT.LANE_KEEP_SUSTAIN_SEC} s in aggregate: one episode's worth of time outside the ` +
        `band, over ${counts.excursionScanTicks} eligible tick(s) of which ` +
        `${counts.outsideCurvedSpanTicks} fall outside the declared curved spans`,
    );
    verdict = "fail";
  }

  return { id: "AC-LANE", verdict, reasons, counts, metrics };
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE LEG
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * All four criteria over one leg. Returns the worst verdict and every criterion
 * with its own counts, because a metric without its sample count is how a leg
 * passes on nothing.
 */
export function assessLeg(leg) {
  const rows = leg.rows ?? [];
  const declared = leg.declared ?? {};
  const criteria = [
    assessRecordCompleteness(rows, declared),
    assessReferentLiveness(rows, declared),
    assessFlow(rows, declared),
    assessLaneHolding(rows, declared),
  ];
  const verdict = worstVerdict(criteria.map((c) => c.verdict));
  const flow = criteria.find((c) => c.id === "AC-FLOW");
  return {
    verdict,
    criteria: Object.fromEntries(criteria.map((c) => [c.id, c])),
    reasons: criteria.flatMap((c) => c.reasons.map((r) => `${c.id}: ${r}`)),
    testimony: {
      mayTestify:
        verdict === "pass"
          ? [`lane position on ${flow.surfacesJudged.join(", ")}`]
          : [],
      mayNotTestify: [
        "that a student could find this line from what is on the glass — the probe is not on the glass",
        ...(flow.surfacesJudged.includes(SURFACE.ONE_WAY)
          ? []
          : ["the flow of one-way traffic on this leg"]),
      ],
    },
  };
}
