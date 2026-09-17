# SPEC: ADR-009, a practice lesson is not taken when the student commits its own mistake (Founder Ruling A, 2026-09-17)

> **COMMITTED COPY — read this one.** This spec was written in a machine-local scratchpad that is deleted with its session
> (ADR-009 §S9). It and its load-bearing evidence now live in the repo, and every lane works from these paths:
>
> | Spec reference | Repo path |
> |---|---|
> | `SPEC.md` | `docs/simulation/92_ADR009_LESSON_MISTAKE_SPEC.md` (this file) |
> | `targets-final.json` | `docs/simulation/adr-009/targets-final.json` — the derived target table (lane B diffs its generated fixture against this) |
> | `census-baseline.json`, `census-L25.json` | `docs/simulation/adr-009/` — the PRE-change census of 2,434 in-process drives (it cannot be regenerated once the change lands) |
> | `rev/analyse-rev.json` | `docs/simulation/adr-009/prototype-after-census.json` — the prototype AFTER-census and its comparison |
>
> Other scratchpad files named below (prototype scripts, probes, per-drive artefacts) were NOT committed; where a lane needs one, it
> regenerates it with the tool named beside it. The decision itself is ADR-009 in `docs/architecture/07_ARCHITECTURE_DECISION_RECORDS.md`.


**What this spec is built from.**
- The base is the "derived" design (judged 22.5 of 30), with grafts from "declared" (19.5) and "objective-gate" (15). Every judge flaw is fixed or disproved with file:line (§1).
- **Revision 2** applies the critic's 18 gaps. All 18 were accepted, and two sub-claims were corrected (see "CRITIC GAPS: accepted / rejected" at the end). The revision changed the grading mechanism in three places:
  - a target's re-bill is dropped;
  - a target's first teach is keyed on its own code;
  - Б1/Б2 act copy moves into the per-act table.
- Because of those changes, the acceptance numbers were **re-measured by driving all 2,434 tapes through a patched scratch copy of the product** (§9, "Revision evidence").

**Where it was written.**
- A read-only session at HEAD `98bf8ae`. No file in the repo was edited, and no git write was run. `git --no-optional-locks status` was the only git call against the worktree.
- The worktree carries another workflow's edits. At revision time, **11 tracked files are modified**:
  - `LessonScene.tsx`, `LessonPlayShell.tsx`, `queueTaskEcho.test.ts`
  - `HudToasts.tsx`, `hud-toast-fit.test.ts`
  - `advisor-route-hold.test.ts`, `advisor.test.ts`, `advisor.ts`
  - `lessons/types.ts`
  - `tools/mobile/__tests__/driveline.test.mjs`, `tools/mobile/lesson-audit.mjs`
- **5 files are untracked**: `followHintRouteHold.test.ts`, `advisorPeekSummary.test.tsx`, `toastColumnFold.test.ts`, `advisor-route-hold-carriageway.test.ts`, `yield-voice-convicted-episode.test.ts`.
- Line numbers are HEAD lines unless marked "anchor". For `LessonPlayShell.tsx`, use the quoted anchor string, because the worktree has moved by about 200 lines.

**Paths.** Relative paths are under `platform/src/` unless written in full. Scratchpad = `C:\Users\Ljh\AppData\Local\Temp\claude\E--AI-driver\f298781e-d6a0-4f00-bf01-d57edab47428\scratchpad\teachfirst\`.

**Evidence.** All files are in the scratchpad; none are in the repo.

| File | What it holds |
|---|---|
| `synth-final.mjs` → `targets-final.json` | The target table. Produced by running the real `compileScenario` and rules catalogue over 167 templates and every authored rung, with provenance and the ambiguity register |
| `census-baseline.json` + `census-L25.json` | The **pre-change** in-process census of 2,434 drives |
| `synth-census-final.json` | Revision 1's replay of the fold over that census. **Superseded for points** by `rev/` |
| `rev/patch-proto.mjs`, `rev/drive-proto.mjs` | **Revision 2 prototype.** A scratch copy of `platform/src/{modules,lib,generated}` taken from the worktree at revision time. It is patched with this spec's grading mechanism: the fold, regrade drop, own-code teach, first-card bypass, 1★ cap and Б1/Б2 act copy. Targets are injected from `targets-final.json`. Every tape × authored rung was driven through it with the production `inprocess-drive.mjs` chain, sequentially in one process (371 s, 0 errors) |
| `rev/drive-rev.json`, `rev/analyse-rev.cjs` → `rev/analyse-rev.json` | Per-drive results after the change, and the comparison with the baseline census (§9) |
| `rev/probe-rev.out.json` | The late brake-check probe re-driven through the prototype (T2) |
| `rev/topic-check.mjs` → `rev/topic-check.json` | Which target codes share a teach topic with a non-target code (64 of 105 lessons), and the policy each target code resolves to (0 always-grade) |
| `synth-catalog-targets.json` | Catalogue fields (title, lawRef, corrective, peek) for all 38 target codes |
| `synth-det/` | 6 L2/L5 drives re-run with the determinism check. All 6 digests equal the baseline |
| `critic-replay.cjs`, `critic-stars.cjs`, `critic-commend.cjs` | The critic's replays; cited where used |

---

## 0. The decision

**The derivation.** On every practice rung, `compileScenario` works out the lesson's **own-mistake target codes** from data the template already carries:

    targets = { c ∈ ⋃ demos (codeRefs − incidentalCodeRefs)  ∪  codes armed by ruleConfig keys whose default is false and whose compiled value is true
              : VIOLATIONS[c] is not опасна and not terminateSession }

- It writes the result to `LessonSpec.lessonMistakeTargets`.
- Exam rungs, the THEO-3 sandbox, curriculum lessons and exam-bank variants never carry the field.
- The server recompiles the same list from the lesson id.

**The ruling in the engine.** On a practice rung, a target code's **first** occurrence is always taught: 0 points and a card. This holds even when its topic was already taught by another code. Its continuing-breach re-bill is dropped. Repeats are graded exactly as today.

**The verdict.** One pure fold, `foldLessonMistakes(lesson, events, coachedMistakes)`, runs on the client in `buildLessonResult` and on the server in `gradeFinishWire`. Any target code on either record makes `passed` false and fills `LessonResult.lessonMistakes`.

**What the student sees.**
- Before the drive: one briefing line naming the mistakes that cost the lesson.
- At the moment of the mistake: a card saying the lesson will not count.
- After the drive:
  - a fourth verdict, «Не е взет»;
  - a reason block built only from catalogue text;
  - a 1★ cap;
  - a debrief branch with a theory link for the mistake's concept;
  - praise riders that no longer call the drive clean;
  - a history row that reads «Не е взет» with its cause.
- Calibration keeps measuring **exam** self-reading (§5.9).

**Measured result** (§9, through the patched prototype):

| | Before | After |
|---|---|---|
| Mistake tapes passing, L1 / L2 / L3 / L5 | 42 / 37 / 34 / 24 | **2 / 2 / 2 / 2** |
| Correct (shadow) tapes passing, L1–L5 | 808 / 808 | 808 / 808 |
| L4 exam rung, 488 drives | — | identical `passed`, stars, points, fault codes and coached codes |
| Shadow drives, 808 | — | identical on the same fields |
| Sheet points, practice drives | — | **147 of 1,946 drives lose points, 231 points in total, 0 drives gain.** Every one is a mistake tape with a lesson hit: 135 from a dropped re-bill, 12 from own-code teach |
| Sheet verdict | — | flips on 4 drives: `sc-ln-turn-lane-arrows/mistake-late-two-lanes` at L1/L2/L3/L5 goes from 9 т. «Неиздържан» to 6 т. «Не е взет» |

The 2 tapes still passing at each practice rung are the two whose offence comes after the session has already completed (§2.3 R10).

---

## 1. What changed from the three designs: graft and fix log

| # | Raised by | Issue | Resolution in this spec |
|---|---|---|---|
| 1 | J1 correctness, J2 fidelity | `sc-rb-lane-choice` indicator and mirror codes were marked incidental | **Fixed. No marker.** The objective title is «Премини през кръга и го напусни с включен десен мигач» (`templates-roundabout.ts:1453`). The demo text is at `:1512`, and the tags include «мигачи» (`:1354`). The lesson now targets 4 codes. Measured effect: 0 tape verdicts change |
| 2 | J3 buildability | The pseudo-diff shadowed an imported function with a local of the same name | **Fixed by naming:** `foldLessonMistakes`, local `lessonMistakes`, field `LessonResult.lessonMistakes` |
| 3 | J3 | Raising `MAX_COACHED_MISTAKES_WIRE` risks an old server rejecting the wire (`wire.ts:538` rejects > 100) | **Fixed** with a reserve inside the cap (§3.4b d). Both caps stay at 100 |
| 4 | J1, J2, J3 | Three teach-card sites print the stake sentence independently | **Grafted** one helper module, `lessons/lessonMistake.ts` (§3.2) |
| 5 | J1, J3 | An aborted run with a hit would read «Не е взет» | **Grafted** the `!aborted` guard (§5.1), plus an abort note variant (§5.2, critic gap 9) |
| 6 | J2 | A target mistake could be downgraded to the rate-limited toast and lose its lesson-costing sentence | **Grafted, then narrowed in revision 2.** The rate limit is bypassed only for the **first lesson-mistake card of the session**. Later target first-occurrences use today's rate limit, because the student has already been told the lesson will not count. Measured: 7 of 654 hit drives show a second lesson-mistake card (only when today's rules would pause anyway). `HudToasts.tsx` is not edited |
| 7 | J2 | `lessons/debrief.ts` and `lessons/lessonMistake.ts` are outside the point-scales guard (`rules/__tests__/point-scales.test.ts:87-93`) | **Grafted** explicit vocabulary assertions over both, each with a mutation test (T0, T7, M10) |
| 8 | J3 | Completeness of detector opt-ins was keyed on a naming convention | **Fixed:** keyed on value, plus classification of every authored ruleConfig key (T8b) |
| 9 | J3 | A future co-fault on `codeRefs` becomes a target silently | **Fixed:** the full target table is pinned as a fixture (T8a), and the markers are pinned (T8c) |
| 10 | J3 | `s-w7-bot-completion.test.ts:1211` was missing from the break list | **Added** (§8.3) |
| 11 | J1, J2 | Hold the law chip for the pooled bus-stop row | **Rejected with proof.** The teach card already prints that pooled row's `lawRef` for this code (`TeachMomentOverlay.tsx:419`, `:516`), so hiding it only in the reason block would make two cards disagree. The hold at `rules/types.ts:233-240` is not reopened |
| 12 | J1 | Stand-in detectors versus the ruling's "the mistake THAT LESSON EXISTS TO TEACH" | **An engineering rule, not a founder question** (R3): the author put the code on the demo, and the remedy is one `incidentalCodeRefs` line |
| 13 | J1 | Objective-gate's client/server split yields `objectiveId: null` | **Not applicable:** no objective is withdrawn |
| 14 | J2 | Curriculum lessons `l0`–`l8` | **Founder question F2** (§13) |
| 15 | J1 | `sc-jx-blocked-exit` `STANDSTILL_GAP_TOO_CLOSE` excluded on an unverified claim | **Kept as a target (stand-in)** (`templates-junctions4.ts:36-38`) |
| 16 | new | The roomy end bar prints «Издържан/Неиздържан» on its own | **Added** to lane G |
| 17 | new | Without a new debrief branch, the headline is broken on flips (`debrief.ts:447-451`) | **The branch is mandatory** (§5.6) |
| 18 | new | The calibration gate would show an exam verdict over a lesson rule | **Revised in revision 2** (critic gap 3): calibration keeps the exam-reading verdict, and the gate explains the lesson status separately (§5.9) |
| 19 | J1 graft | Name the demo only when unambiguous | **Grafted:** `demoTitleBg` only when exactly one demo cites the code |
| 20 | J2 graft | `openBesidesLessonMistake()` | **Not needed:** no objective is withdrawn |
| 21–38 | critic, revision 2 | 18 gaps | See "CRITIC GAPS: accepted / rejected" |

---

## 2. Target codes for every lesson

### 2.1 The rule, and the evidence for each source

| Source | What it is | Why it is legitimate | Measured |
|---|---|---|---|
| **D. Demos** | `MistakeDemo.codeRefs` minus the new optional `incidentalCodeRefs` | The field is required and validated against the catalogue (`lessons/scenario/validate.ts:283-290`). Its contract is "codes the demo trace MUST grade" (`lessons/scenario/types.ts:143-148`), pinned by every `traces/__tests__/*-traces.test.ts` | Covers 100 of the 105 lessons with targets |
| **A. Armed detectors** | A ruleConfig key whose `DEFAULT_RULE_CONFIG` value is `false` and whose compiled value is `true` → its codes (§3.3) | A template arms a detector «so the student's own attempt grades the taught fault» (`compile.ts:1466-1470`). The 7 default-false keys were verified by value in `synth-final.mjs` | Adds 5 codes that appear on no demo (R4) |
| **Filter** | Drop опасна and terminating codes | Already graded on first sight (`scenarios/policy.ts:77`), so there is nothing to change. This also stops a consequence such as COLLISION reading as "the mistake this lesson teaches" | 62 lessons end with an empty set |
| **Not a source** | `require*Clean` demands; concepts; law refs; title keywords | Every demand code is already in D ∪ A (`demandNotCovered: 0`). Concept overlap loses 59 targets (`design-derive-rules.json`) | T8d asserts demand codes ⊆ targets |

**Policy check (revision 2).** Every one of the 38 target codes resolves to `teach-first-then-grade`: none resolves to `always-grade` or `learn-only` (`rev/topic-check.json`, through `scenarios/policy.ts policyForViolation` and the scenario mapping). That is what makes "the first occurrence is always taught" (§3.4b c) a complete statement. T8e pins it.

### 2.2 Result (`targets-final.json`)

**Counts.**
- 167 templates: **105 have targets, 62 are empty.**
- 646 practice rungs. Set sizes {0: 243, 1: 260, 2: 120, 3: 19, 4: 4}; the four rungs with 4 codes are `sc-rb-lane-choice` L1/L2/L3/L5.
- 162 exam rungs, **all with no field.**
- No lesson's set differs between its practice rungs.
- `MAX_LESSON_MISTAKE_TARGETS = 8`; the measured maximum is 4.

**Most common target codes**, by number of lessons:

| Code | Lessons |
|---|---|
| HARSH_BRAKING_NO_CAUSE | 13 |
| SPEEDING_OVER_LIMIT | 11 |
| POOR_LANE_KEEPING | 11 |
| LANE_CHANGE_WITHOUT_INDICATOR | 8 |
| LANE_CHANGE_WITHOUT_MIRROR_CHECK | 8 |
| SPEED_TOO_FAST_FOR_CONDITIONS | 8 |
| ILLEGAL_STOP_IN_BAN_ZONE | 8 |
| FOLLOWING_TOO_CLOSE | 7 |

**Agreement with Reader 3's manual judgement** (`targets.json`): every derived code is in Reader 3's candidates except the 3 `sc-rb-lane-choice` codes (fix #1). `demandCodesNotInTargets` is empty.

**The six audit lessons** (practice rungs; L4 is empty):

| Lesson | Target codes |
|---|---|
| `sc-vu-pass-clearance` | VULNERABLE_PASS_TOO_CLOSE |
| `sc-vp-police-stop` | POLICE_STOP_SIGNAL_IGNORED, HARSH_BRAKING_NO_CAUSE (stand-in, demo «Паника в лентата»). NOT_KEEPING_RIGHT is incidental |
| `sc-vp-telltale-red` | WARNING_LAMP_IGNORED, HARSH_BRAKING_NO_CAUSE (stand-in, demo «Паническо спиране в активната лента») |
| `sc-follow-tailgater` | HARSH_BRAKING_NO_CAUSE, SPEEDING_OVER_LIMIT (stand-in, «Гузно ускоряване»), STOPPED_WITHOUT_CAUSE (armed detector) |
| `sc-pk-busstop-ban` | ILLEGAL_STOP_IN_BAN_ZONE (L1–L3; no L5 is authored) |
| `sc-signal-hesitation` | HESITATION_AT_GREEN |

### 2.3 Ambiguous lessons, and the rule applied to each

All entries are in `targets-final.json → ambiguity`.

- **R1. Precedence.** Exam rung, THEO-3 sandbox, curriculum lesson or exam-bank variant → no field.
- **R2. Incidental markers (4 codes on 3 demos),** only where the template's own source says so:
  - `sc-vp-police-stop/mistake-drive-past` → `NOT_KEEPING_RIGHT` (`templates-cockpit.ts:867-870`)
  - `sc-vp-telltale/mistake-ignore` → `SPEEDING_OVER_LIMIT` (`templates-cockpit.ts:1087-1090`)
  - `sc-ln-turn-lane-arrows/mistake-left-from-through` → `TURN_WITHOUT_INDICATOR`, `POOR_LANE_KEEPING` (`templates-lanes2.ts:153-156`)

  They change 0 tape verdicts, and T1a proves them by wiring.
- **R3. Stand-ins stay targets (32 pairs, 28 lessons).** Examples: HARSH_BRAKING_NO_CAUSE for "panic stop" in 9 lessons, POOR_LANE_KEEPING in 7, CENTER_LINE_TOUCHED in 4, SPEEDING_OVER_LIMIT in 3. Escape hatch: one `incidentalCodeRefs` line, pinned by T8c.
- **R4. Armed detectors with no demo are targets (5):**
  - `sc-follow-standstill` CLOSING_ON_LEAD_TOO_FAST
  - `sc-follow-tailgater` and `sc-jx-priority-confidence` STOPPED_WITHOUT_CAUSE (`templates-junctions3.ts:841-845`, per J1)
  - `sc-ed-poligon-chain` MOVE_OFF_WITHOUT_OBSERVATION
  - `sc-fo-motorway-gap` FOLLOWING_TOO_CLOSE_FOR_RAIN (`templates-following2.ts:558-562`, per J1)

  T1b proves this source by wiring.
- **R5. Only опасна codes → empty set (62 lessons).** 39 demos in 38 lessons cite only опасна codes. They are already graded on first sight; they are the detector backlog.
- **R6. A code named only by an objective title is not a target (7 lessons):** `sc-signal-response` HESITATION_AT_GREEN · `sc-crossing-rain-sprint` SPEED_TOO_FAST_FOR_CONDITIONS · `sc-follow-brake` FOLLOWING_TOO_CLOSE · `sc-ac-crosswind` SPEED_TOO_FAST_FOR_CONDITIONS · `sc-ed-d2-priority-run` FAILED_TO_YIELD · `sc-ed-d2-stop-address` ILLEGAL_STOP_IN_BAN_ZONE · `sc-rb-ped-exit` TURN_WITHOUT_INDICATOR. Route: content review.
- **R7. A disarmed or tuned detector is never a target (4):** `sc-ac-ice` `townCrawlEnabled: false`; `sc-hz-emergency-stop` and `sc-hz-brake-dont-swerve` `harshBrakeDecelMps2: 25`; `sc-jx-blocked-exit` `hesitationClearGapM: 63`.
- **R8. Exam-drill lessons (`sc-ed-*`) follow the same rule.**
- **R9. `sc-rb-lane-choice`:** targets, no marker (fix #1).
- **R10. The offence comes after the lesson has finished.**
  - `sc-follow-standstill/mistake-creep-up`: done at 67.0 s, offence at 73.6 s.
  - `sc-park-perp-forward/mistake-blind-exit`: done at 31.9 s, offence at 34.1 s.
  - `applyTick` returns early once completed (`lessons/engine.ts:1405-1407`). These are content rows, kept on a ratcheting allowlist (§9 criterion 2). Re-measured in revision 2: these are exactly the 2 passing mistake tapes at every practice rung.

---

## 3. Mechanism: file by file

### 3.1 Contracts: `modules/sim/contracts.ts` (lane A)

Add beside `mistakeExperience` (`contracts.ts:515-529`). `contracts.ts` is a shared hotspot (doc 61:52-56), so keep the edit additive.

```ts
/** ADR-009 — one of the lesson's own mistakes (Founder Ruling A). */
export interface LessonMistakeTarget {
  /** rules-catalog ViolationCode (plain string: contracts.ts may not depend on rules/). */
  code: string;
  source: "demo" | "detector";
  /** MistakeDemo.titleBg — ONLY when exactly one demo cites this code (stored text, ADR-002). */
  demoTitleBg?: string;
}
// in LessonSpec:
/**
 * ADR-009 — the coachable codes this PRACTICE rung exists to teach. Written ONLY by
 * compileScenario (deriveLessonMistakeTargets). Absent on exam rungs, THEO-3 sandboxes,
 * curriculum lessons and exam-bank variants — absent = today's behaviour, byte-identical.
 */
lessonMistakeTargets?: readonly LessonMistakeTarget[];
```

### 3.2 Types and the pure module: `lessons/types.ts` and new `lessons/lessonMistake.ts` (lane A)

`lessons/types.ts` is **dirty in the worktree** (HEAD lines given; +33 in the worktree). Lane A starts only after the other workflow commits it.

- **`TeachMoment`** (:1420-1435): add
  - `lessonMistake?: true` — the code is one of the lesson's own mistakes;
  - `charged?: true` — this moment was also charged to the изпитен лист (the S1 pauseOnError arm).
- **`CoachedMistake`** (:1460-1467): add `detail?: string`.
- **New `LessonMistakeHit`**: `{ code: string; t: number; charged: boolean; detail?: string; titleBg: string; demoTitleBg?: string }`.
  - `t` is the first occurrence across both records.
  - `charged` means some occurrence reached the sheet. Under §3.4b that can only be a **repeat**: the first occurrence is always coached. Measured: 0 of 693 hits in the census are charged without an earlier coached occurrence.
  - `titleBg` is retrieved from the catalogue on both sides.
- **`LessonResult`** (:1817-1875): add `lessonMistakes?: LessonMistakeHit[]`. Change the `passed` doc to «official pass AND route completed AND not aborted AND (practice rung) none of the lesson's own mistakes occurred — ADR-009».

New `lessons/lessonMistake.ts`. It is pure, imports `rules` and `contracts`, and is exported from `lessons/index.ts`. It is a sibling of `escalation.ts`, which both `engine.ts` and `wire.ts` import (`wire.ts:717-730`).

```ts
export const MAX_LESSON_MISTAKE_TARGETS = 8;

/** THE applicability rule — the only place it is written. */
export function lessonMistakeTargetCodes(
  lesson: Pick<LessonSpec, "lessonMistakeTargets" | "examMode" | "mistakeExperience">,
): ReadonlyMap<string, LessonMistakeTarget> | null {
  if (lesson.examMode === true) return null;                 // ruling A: exam unchanged
  if (lesson.mistakeExperience !== undefined) return null;   // THEO-3: the mistake IS the assignment
  const t = lesson.lessonMistakeTargets;
  return t === undefined || t.length === 0 ? null : new Map(t.map((x) => [x.code, x]));
}

/** ONE fold, called by engine.ts buildLessonResult AND wire.ts gradeFinishWire. */
export function foldLessonMistakes(lesson, events: readonly ScorableEvent[], coached: readonly CoachedMistake[]): LessonMistakeHit[]
// targets === null -> []
// violations in events with a target code: see(code, e.t, e.detail, charged=true)
// coached entries with a target code:      see(code, c.t, c.detail, charged=false)
// see(): earliest t per code (and its detail); OR the charged flag;
//        titleBg = actCopy(code, detail)?.titleBg ?? VIOLATIONS[code].titleBg; demoTitleBg from the target
// sorted by (t, code)

/** Catalogue copy for one hit — retrieval only (ADR-002). */
export function lessonMistakeCopy(hit): { titleBg; explanationBg; correctiveBg: string | null; lawRef: string | null; peekBg: string | null; conceptId: string | null }
// = makeViolation(code, t, detail ? { detail } : {}); VIOLATIONS[code].correctiveBg ?? null;
//   violationPeekBg(code, detail); VIOLATIONS[code].conceptId ?? null

/** Concept ids of the hits, in hit order, de-duplicated (theory chips, §5.6). */
export function lessonMistakeConceptIds(hits: readonly { code: string }[]): string[]

/** „A“ · „A“ и „B“ · „A“, „B“ и още N */
export function lessonMistakeNamesBg(hits: readonly { titleBg: string }[]): string

/** The pre-drive rule line (§5.10): „Урокът не се зачита, ако допуснеш „A“ или „B“ — дори веднъж.“ Pooled titles. null when no targets. */
export function lessonMistakeRuleBg(lesson): string | null

export type TeachStakeKind = "free-first" | "lesson-first" | "lesson-charged" | "charged";
export function teachStakeKind(m: TeachMoment): TeachStakeKind
export interface StakeSegment { text: string; strong?: true }
/** ONE source for TeachMomentOverlay (compact + roomy) and the phone notification. */
export function teachStakeSegments(m: TeachMoment, opts: { citeMark: boolean; severityLabelBg?: string }): StakeSegment[]
export function teachStakeBg(m: TeachMoment, opts): string
export function teachChipBg(m: TeachMoment): string      // "Учебен момент" | "Грешката на урока"
export function teachSublineBg(m: TeachMoment): string   // roomy header subline, §5.5 (critic gap 8)
export const LESSON_MISTAKE_CHIP_BG = "урокът не се зачита";
```

For kind `free-first`, `teachStakeBg` and `teachSublineBg` must reproduce **today's rendered text byte for byte** at every site:
- compact: `TeachMomentOverlay.tsx:393-401`
- roomy: `:526-531`, with the subline at `:476`
- phone: `LessonPlayShell` anchor `chipBg: "Учебен момент"`

### 3.3 Rules data: new `rules/detectorOptIns.ts` and `rules/index.ts` re-export (lane B)

```ts
export const DETECTOR_OPT_IN_CODES: Readonly<Partial<Record<keyof RuleEngineConfig, readonly ViolationCode[]>>> = {
  handbrakeMoveOffEnabled: ["HANDBRAKE_LEFT_ON"],
  moveOffObservationEnabled: ["MOVE_OFF_WITHOUT_OBSERVATION"],
  leadClosingEnabled: ["CLOSING_ON_LEAD_TOO_FAST"],
  followRainAwareEnabled: ["FOLLOWING_TOO_CLOSE_FOR_RAIN"],
  needlessStopEnabled: ["STOPPED_WITHOUT_CAUSE"],
  junctionScanObservationEnabled: ["JUNCTION_SCAN_INCOMPLETE"],
  turnObservationEnabled: ["TURN_WITHOUT_OBSERVATION"],
};
export const NON_ARMING_RULE_CONFIG_KEYS: ReadonlySet<keyof RuleEngineConfig> = new Set([
  "followMinSpeedKmh", "townCrawlEnabled", "conditionSpeedNightFactor", "harshBrakeDecelMps2", "hesitationClearGapM",
]);
```

The detector gate lines in `rules/engine.ts` come from the derived design and were not re-verified. The 11 authored keys and their defaults were measured in `targets-final.json → meta.ruleConfigKeysAuthored`.

### 3.3b Rules act copy: `rules/engine.ts` and `rules/catalog.ts` (lane R, new in revision 2, critic gap 12)

**The problem.** Three `makeViolation` calls put per-control copy on the event through the `titleBg`/`explanationBg` override channel, **without a `detail`**:
- `rules/engine.ts:5857` — `JUNCTION_SCAN_COPY.giveWay`, «Непълно оглеждане при знак Б1»
- `:5882` — `JUNCTION_SCAN_COPY.stop`, «…при знак Б2»
- `:3940` — `SNOW_LIGHTS_COPY`

Those are the only three override-without-detail calls in the sim module (grep over `modules/sim`, excluding tests). The server rebuilds events from `(code, t, detail)` only (`wire.ts:598-620` → `makeViolation`, `catalog.ts:2880-2905`), so it prints the pooled «Непълно оглеждане на кръстовището» (`catalog.ts:1226`). That already happens today for charged events, and the fold and reason block would repeat it on the lesson built around Б1 (`sc-jx-giveway-b1`).

**The change.** Move the copy into detail-keyed `PER_ACT_COPY`, the way `WRONG_WAY_ROAD_COPY` already works (`catalog.ts:2532`, `:2830`):

```diff
 // rules/catalog.ts PER_ACT_COPY (:2826-2836)
   ILLEGAL_STOP_IN_BAN_ZONE: NO_STOP_BASIS_COPY,
+  JUNCTION_SCAN_INCOMPLETE: JUNCTION_SCAN_CONTROL_COPY,   // { "give-way": {...Б1}, stop: {...Б2} } — moved verbatim from engine.ts:2117-2129
+  HEADLIGHTS_OFF_IN_RAIN: { snow: SNOW_LIGHTS_ACT_COPY },  // moved verbatim from engine.ts:2167-2171
 // rules/engine.ts
-  makeViolation("JUNCTION_SCAN_INCOMPLETE", t, JUNCTION_SCAN_COPY.giveWay)
+  makeViolation("JUNCTION_SCAN_INCOMPLETE", t, { detail: "give-way" })
-  makeViolation("JUNCTION_SCAN_INCOMPLETE", t, JUNCTION_SCAN_COPY.stop)
+  makeViolation("JUNCTION_SCAN_INCOMPLETE", t, { detail: "stop" })
-  makeViolation("HEADLIGHTS_OFF_IN_RAIN", t, SNOW_LIGHTS_COPY)
+  makeViolation("HEADLIGHTS_OFF_IN_RAIN", t, { detail: "snow" })
```

The text is moved verbatim: no new wording, and the retrieved-article comments move with it.

**Known side effects.**
- `scenarios/coach.ts encounterKey` (:195-200) becomes act-aware for these two codes: Б1 and Б2 scan faults stop counting as repeats of each other. That affects the ×1.5/×2 **training** ladder only (official points are unaffected; `lessons/engine.ts` pushes the escalation record only when the multiplier is above 1).
- Debrief groups split per act.
- Prototype measurement (with lane C's changes on top): 0 differences in `passed`, stars, sheet points, fault codes or coached codes across the 488 L4 and 808 shadow drives. The Б1/Б2 details reach hits correctly: `sc-jx-giveway-b1/mistake-no-scan` carries `give-way`, and `sc-junction-scan/*` and `sc-ed-d2-priority-run/mistake-partial-scan` carry `stop`.
- The effect on hit drives was **not separated** from lane C's effect.
- The snow act is **not billed on any current target lesson**: `sc-ac-rain-lights` and `sc-ac-truck-spray` are rain lessons, and their coached `HEADLIGHTS_OFF_IN_RAIN` carries no detail. It is moved anyway so that no override-without-detail call remains.

**Gate.** This is a rules-engine change, so run the FP battery and the exam-bank bot (doc 61:40-44), and grep `hud/telltaleWarnings.ts:43`, `:172` (comment references only).

### 3.4 Scenario data and compile (lane B)

**`lessons/scenario/types.ts`**, in `MistakeDemo` after `codeRefs` (:149):

```ts
/** ADR-009: the subset of codeRefs this demo grades as a SIDE EFFECT — not the act the lesson
 *  teaches. Only when the template's own source says so. Must be ⊂ codeRefs, never all of it. */
incidentalCodeRefs?: string[];
```

**`lessons/scenario/validate.ts`**, inside the per-demo loop (:279-290). Reject:
- a value that is not an array of strings;
- a code not in `codeRefs` (message cites ADR-009);
- a duplicate;
- every code marked incidental.

**New `lessons/scenario/lessonMistakeTargets.ts`:**

```ts
export function deriveLessonMistakeTargets(spec: ScenarioSpec, level: ScenarioLevel,
    compiledRuleConfig: Partial<RuleEngineConfig>, examMode: boolean): LessonMistakeTarget[]
// examMode -> []
// D: each demo (identity traceRef.path): codeRefs − incidentalCodeRefs
// A: DETECTOR_OPT_IN_CODES rows with compiled === true && DEFAULT_RULE_CONFIG === false
// keep non-опасна, non-terminating; source = demo if any demo cites; demoTitleBg only if exactly one demo cites
// sort by code; > MAX_LESSON_MISTAKE_TARGETS -> ScenarioCompileError
```

**`lessons/scenario/compile.ts`:**

```diff
   const ruleConfig = { ...(spec.ruleConfig ?? {}), ...(rung.ruleConfig ?? {}) };      // :1376
   const hasRuleConfig = Object.keys(ruleConfig).length > 0;
+  const lessonMistakeTargets = deriveLessonMistakeTargets(spec, level, ruleConfig, examMode);
 …
     ...(hasRuleConfig ? { ruleConfig } : {}),
+    ...(lessonMistakeTargets.length > 0 ? { lessonMistakeTargets } : {}),
 …
     delete lesson.examMode;                                                            // :1530
+    delete lesson.lessonMistakeTargets;   // the sandbox's assignment IS the mistake
```

**Content, 3 lines:** `templates-cockpit.ts:883` and `:1091`, and `templates-lanes2.ts:157` (the R2 markers), each with a one-line comment citing ADR-009.

**Golden snapshot.** `compile.test.ts:165-169` snapshots `SC_PARK_PERP_REV`, whose target set is empty, so it does not change.

### 3.4b Engine and coach: `lessons/engine.ts` and `scenarios/coach.ts` (lane C)

**(a) Once per tick**, beside `coachOpts` (`lessons/engine.ts:1415-1421`):

```ts
const lessonTargets = lessonMistakeTargetCodes(prev.lesson);   // null on exam, sandbox, curriculum
```

**(b) The re-bill of a target is dropped** (`lessons/engine.ts:1508`). New in revision 2, critic gap 1.

```diff
-    if (e.regrade === true && alreadyCharged(e.code)) continue;
+    // ADR-009 — the re-bill of one continuing breach exists ONLY to reach the charge the free
+    // teach consumed (rules/engine.ts:1162-1166, :2536-2546). For the lesson's own mistake that
+    // charge is exactly what Ruling A forbids („NO exam points are taken for it"); what the re-bill
+    // protected — a drive that reaches its debrief looking clean (lessons/engine.ts:1467-1476) —
+    // is now carried by «Не е взет» and the reason block.
+    if (e.regrade === true && (alreadyCharged(e.code) || lessonTargets?.has(e.code) === true)) continue;
```

- **Affected re-bill sites** (every `regrade: true` in `rules/engine.ts`):
  - standing duties (`standingDutyBill`, :2549)
  - the unpaid-speeding settlement at the finish (:2752-2756)
  - SPEEDING_OVER_LIMIT at +`SPEED_REGRADE_SEC` 6 s (:1309, :3380)
  - SPEED_TOO_FAST_FOR_CONDITIONS (:3776), DRIVING_TOO_SLOW_FOR_MOTORWAY (:4290), DRIVING_TOO_SLOW_IN_TOWN (:4420)
  - STOPPED_WITHOUT_CAUSE (:4538), OFF_CARRIAGEWAY (:4717), WARNING_LAMP_IGNORED (:4748)
  - ILLEGAL_STOP_IN_BAN_ZONE (:4909), DRIVING_IN_BUS_LANE (:4974)
- A re-bill of an **already charged** occurrence (a genuine repeat episode) is dropped exactly as today.
- **Measured:** 135 practice drives lose a re-bill. Examples: `sc-follow-tailgater/mistake-speed-up` loses the 20.8 s bill after the coached 14.8 s one (1 → 0 т.); `sc-vp-readiness/mistake-no-belt` goes 3 → 0 т.; `sc-ov-bus-lane/mistake-cruise` goes 3 → 0 т.

**(c) A target's first occurrence is taught under its own code** (`scenarios/coach.ts`). New in revision 2, critic gap 2.

Today the teach key is the **topic** (`coach.ts:232`). A target whose topic was already taught by another code is therefore graded on sight, with points and no card. That covers "incidental-then-target", where 64 of the 105 target lessons share a topic between a target and a non-target code (`rev/topic-check.json`), and "target-then-target", e.g. no-mirror after no-indicator in one lane change.

```diff
 export interface CoachInput {                                                            // coach.ts:75
   …
+  /** ADR-009: one of the lesson's own mistakes on a practice rung. Its FIRST occurrence is
+   *  taught even when its topic was already taught by another code (Ruling A: no points the
+   *  first time). The topic still counts, so incidental codes keep today's behaviour. */
+  lessonMistakeTarget?: boolean;
 }
 …
-  const prior = encounters[teachKey] ?? 0;                                               // :235
+  const ownKey =
+    v.lessonMistakeTarget === true && opts?.examMode !== true && opts?.learnOnly !== true
+      ? `teach-own:${v.code}` : null;
+  const prior = ownKey !== null ? (encounters[ownKey] ?? 0) : (encounters[teachKey] ?? 0);
 …
-  const nextEncounters = recordEncounter(recordEncounter(encounters, teachKey), seenKey); // :244
+  const topicCounted = recordEncounter(recordEncounter(encounters, teachKey), seenKey);
+  const nextEncounters = ownKey !== null ? recordEncounter(topicCounted, ownKey) : topicCounted;
```

- The engine passes `lessonMistakeTarget: lessonTargets?.has(e.code) === true` in the `coachStep` input literal (`lessons/engine.ts`, beside `detail: e.detail`).
- The repeat ladder (`gradedKey`) is untouched.
- The comment block at `coach.ts:206-225` must be amended. It records that keying teach by code once turned `sc-ln-turn-lane-arrows` (late two-lane swerve) from FAILED to PASSED. Under ADR-009 the own-code teach cannot certify, because `foldLessonMistakes` refuses the pass.
- **Measured** on that very tape: sheet 9 → 6 т., verdict «Неиздържан» → «Не е взет». It is taught at 8.2 s, then both codes are graded at 9.7 s as repeats.
- **Measured:** 12 practice drives (3 tapes × 4 rungs: `sc-follow-standstill/mistake-bumper-kiss`, `sc-ln-turn-lane-arrows/mistake-late-two-lanes`, `sc-rb-lane-choice/mistake-exit-across-outer`) lose a first-time charge. The census tapes contain **0** incidental-then-target cases, so T-coach and T1d prove that path by construction.

**(d) `recordCoached`** (`lessons/engine.ts:1461-1466`) carries `detail` and reserves room for targets inside the existing cap:

```diff
-  const recordCoached = (e: { code: string; titleBg: string; t: number }): void => {
-    if (coachedCount >= MAX_COACHED_MISTAKES) return;
-    coachedNew.push({ code: e.code, titleBg: e.titleBg, t: e.t });
+  const reserve = lessonTargets?.size ?? 0;
+  const recordCoached = (e: { code: string; titleBg: string; t: number; detail?: string }): void => {
+    const firstOfTarget =
+      lessonTargets?.has(e.code) === true &&
+      !coachedPrev.some((c) => c.code === e.code) && !coachedNew.some((c) => c.code === e.code);
+    if (coachedCount >= (firstOfTarget ? MAX_COACHED_MISTAKES : MAX_COACHED_MISTAKES - reserve)) return;
+    coachedNew.push({ code: e.code, titleBg: e.titleBg, t: e.t, ...(e.detail !== undefined ? { detail: e.detail } : {}) });
```

`coached-mistakes-channel.test.ts:117-133` drives the cap on a sandbox (reserve 0), so it is unchanged.

**(e) Teach arm** (`lessons/engine.ts:1597-1612`): flag the moment, and bypass the rate limit only for the session's **first** lesson-mistake card.

```diff
+      const isTarget = lessonTargets?.has(e.code) === true;
+      // ADR-009: the card that says „урокът няма да се зачете" is never downgraded to the toast the
+      // FIRST time. Later target first-occurrences follow today's rate limit — the student has
+      // already been told; the reason block lists every hit after the drive.
+      const firstLessonCard = isTarget &&
+        !coachedPrev.some((c) => lessonTargets.has(c.code)) &&
+        !coachedNew.slice(0, -1).some((c) => lessonTargets.has(c.code));
       const canPause =
+        firstLessonCard ||
         lastTeachAt === null || lastTeachAt === tick.t || tick.t - lastTeachAt >= TEACH_PAUSE_MIN_GAP_S;
         teachMoments.push({ …,
+          ...(isTarget ? { lessonMistake: true as const } : {}),
```

Measured: 654 hit drives, 661 lesson-mistake cards. 7 drives show two (`sc-ln-turn-lane-arrows/mistake-late-two-lanes` ×4 rungs, `sc-sig-green-wave/mistake-sprint` ×3 rungs), both at the same tick or outside the gap.

**(f) S1 pauseOnError scored arm** (`lessons/engine.ts:1560-1577`): add `charged: true as const`, plus `lessonMistake: true` for a target. There is no bypass here.

**(g) `buildLessonResult`** (`lessons/engine.ts:3066-3113`):

```diff
+  // ADR-009 — IN THE FOLD, NOT IN THE LOOP. Reads both records, writes neither.
+  const lessonMistakes = foldLessonMistakes(state.lesson, state.events, state.coachedMistakes ?? []);
 …
-    passed: summary.passed && completedAll && !aborted,
+    passed: summary.passed && completedAll && !aborted && lessonMistakes.length === 0,
+    ...(lessonMistakes.length > 0 ? { lessonMistakes } : {}),
```

### 3.5 Wire: `lessons/wire.ts` (lane C)

- **`WireCoachedMistake`** (:123-126): add `detail?: string`. Rewrite the docblock (:113-122) with the **corrected trust statement** (critic gap 10):

  > The server never re-runs the rules. It re-titles what the client reports: `rebuildRuleEvents` rebuilds catalogue events from the client's `(code, t, detail)` list (:598-620), and this list is taken the same way. A client that leaves out a target mistake — from either list — reproduces the pre-ADR-009 pass. Leaving out a charged event also lowers the sheet, as it always could. This is the same trust level as the client-claimed objective flags (`reconcileObjectiveOutcomes`, :635-658). M4a and M4b pin both channels.

- **`serializeCoachedMistakes`** (:261-267): write `detail` when defined. `LessonPlayShell` already passes `r.coachedMistakes`, so no shell edit is needed for this.
- **`parseCoachedMistakes`** (:536-548): keep `detail` only when it is a string of length ≤ `MAX_DETAIL_LEN` (:168). Otherwise drop it silently, never `"invalid"`. An old server ignores the key.
- **`gradeFinishWire`** (:753-771):

```diff
   const coachedMistakes = (wire.coachedMistakes ?? []).flatMap((c) =>
     c.code in VIOLATIONS
-      ? [{ code: c.code, titleBg: VIOLATIONS[c.code as ViolationCode].titleBg, t: c.t }]
+      ? [{ code: c.code, titleBg: VIOLATIONS[c.code as ViolationCode].titleBg, t: c.t,
+           ...(c.detail !== undefined ? { detail: c.detail } : {}) }]   // titles UNCHANGED: hit-free debriefs stay byte-identical (T7)
       : [],
   );
+  const lessonMistakes = foldLessonMistakes(lesson, events, coachedMistakes);   // the fold titles hits by act
 …
-    passed: summary.passed && completedAll && !wire.aborted,
+    passed: summary.passed && completedAll && !wire.aborted && lessonMistakes.length === 0,
+    ...(lessonMistakes.length > 0 ? { lessonMistakes } : {}),
```

The server recompiles the rung from its id (`wire.ts:693-697` → `resolve.ts`), so its targets equal the client's. Only `engine.ts:3093` and `wire.ts:765` compute `passed`.

### 3.6 Dead-predicate ledger: every new thing and its live reader

| New thing | Producer | Live reader(s) | Test that fails if the reader is removed |
|---|---|---|---|
| `MistakeDemo.incidentalCodeRefs` | 3 template entries | `deriveLessonMistakeTargets`; `validate.ts` | T1a, T8c, T4 |
| `DETECTOR_OPT_IN_CODES` / `NON_ARMING_RULE_CONFIG_KEYS` | rules table | derivation; T8b | T1b, T8b |
| `LessonSpec.lessonMistakeTargets` | `compile.ts` | `lessonMistakeTargetCodes` ← engine (regrade guard, coach flag, cap reserve, first-card bypass, fold) and wire (fold); `lessonMistakeRuleBg` ← briefing | M1 |
| `CoachInput.lessonMistakeTarget` | engine coach literal | `coachStep` own-code teach key | T-coach, M12 |
| Regrade-guard target clause | engine | the same loop | T-regrade, M11 |
| `foldLessonMistakes` | `lessonMistake.ts` | `passed` at `engine.ts:3093` and `wire.ts:765` | T2, T3, M4, M7 |
| `LessonResult.lessonMistakes` | engine and wire | the readers below | the tests below |
| — | | rubric cap (`rubric.ts:815`, client and server `actions.ts:294`) and NO_QUALITY variant (`rubric.ts:553-556`) | T10 |
| — | | `sessionVerdict`, notes, reason block, grade reason and riders in `SessionEndScreen` | T5 |
| — | | `buildDebrief` branches, riders, conceptIds | T7 |
| — | | `actions.ts` payload, concept titles, persistence | T14 |
| — | | history label, top title and expanded block | T11 |
| — | | phone end line, roomy end bar, calibration prop | G-tests, T12 |
| `SimSessionEventsJson.sheetRoutePassed` | `actions.ts` | `calibrationStore.ts readSessionPassed` → `actualPass` | T12, M14 |
| `TeachMoment.lessonMistake` / `.charged` | engine teach and pause arms | `teachStakeSegments`, `teachChipBg`, `teachSublineBg` ← `TeachMomentOverlay` (compact and roomy), phone notification | T6, M8 |
| `CoachedMistake.detail` / `WireCoachedMistake.detail` | `recordCoached`; serializer | `foldLessonMistakes` title | T3 |
| Act `detail` for JUNCTION_SCAN_INCOMPLETE and snow lights | `rules/engine.ts` | `makeViolation` / `actCopy` on client and server; `encounterKey` | T15 |
| `lessonMistakeRuleBg` | `lessonMistake.ts` | shell briefing (lane G) | T16 |
| `lessonMistakeConceptIds` | `lessonMistake.ts` | `buildDebrief` `conceptIds`; `actions.ts` concept titles → theory chips | T7, T14 |

**Rollback.** Delete the one `compile.ts` spread and every reader sees an absent field. That is today's behaviour byte for byte, except lane R's act copy, which is independent and valid on its own (M1).

---

## 4. Modes and rungs

| Session | Field | Coach | Verdict under ADR-009 |
|---|---|---|---|
| L1 «Пълна помощ» (pauseOnError), L2, L3, L5 (practice: `rungExamMode(rung)` false, `compile.ts:703-706`) | derived | teach-first; **a target's first occurrence is taught under its own code, and its re-bill is dropped** | Not passed when any target code occurs |
| L4 «Изпитни условия», and any `examMode: true` rung | **absent** | everything graded ×1, no cards (`coach.ts:246-262`) | Unchanged: 488/488 drives identical |
| THEO-3 sandbox `~m<i>` | **deleted** | learn-only | Unchanged; never persisted |
| Graded retry after the sandbox | derived | as L1–L5 | ADR-009 applies |
| Curriculum `l0`–`l8`, exam-bank variants, exam card | absent | as today | Unchanged. **Founder question F2** |

**Points.** Nothing writes `events`, `summary`, `score` or escalations **for** ADR-009, but two coach inputs now withhold bills that used to be charged on practice rungs:

| Case | Today | After |
|---|---|---|
| A target's first occurrence | taught, 0 points (unless its topic was already taught) | **always** taught, 0 points |
| The automatic re-bill of that same continuing episode | charged at +6 s or +10 s, or at the finish | **dropped** |
| A genuine repeat of a target (a new episode after the teach) | graded, escalated | **unchanged** (founder question F1, narrowed) |
| Incidental mistakes | teach-first, topic-keyed | **unchanged, byte-identical** |

Measured on practice drives: 147 drives, 231 points withheld, all mistake tapes with a hit.

| Rung | Mistake-tape sheet points before → after |
|---|---|
| L1 | 2,128 → 2,069 |
| L2 | 2,128 → 2,069 |
| L3 | 2,131 → 2,072 |
| L5 | 1,930 → 1,876 |
| L4 | 2,206 → 2,206 |

Shadow points: 0 before and after.

---

## 5. What the student sees: Bulgarian copy

### 5.0 Where the copy comes from

**Retrieved (ADR-002):**
- `VIOLATIONS[code].titleBg` / `explanationBg` / `lawRef` / `peekBg` / `correctiveBg` / `conceptId`, through `makeViolation(code, t, {detail})`, `actCopy` (`rules/catalog.ts:2848-2854`) and `violationPeekBg`. Every one of the 38 target codes has a corrective and a peek (`synth-catalog-targets.json`).
- `MistakeDemo.titleBg`; `lesson.titleBg`.

**Existing product words reused:**
- «не е взет» (`sessionEndCtas.ts:68-69`), «взето» (`ScenarioCatalog.tsx:115`)
- «правило: …» (`TeachMomentOverlay.tsx:419`, `:516`), «✔ Правилното действие:» (`FaultCard.tsx:590`)
- `EXAM_POINTS_SHORT_NOTE_BG`, `examMarkCitationBg`, `minusPointsBg`, `pointsWordsBg`, `examPointsWordBg` (`rules/scales.ts:107-142`, `lib/content/pointScales`)

**Rules for new text.** No new law text. Every mention of points is qualified («наказателни точки», «изпитния лист»).

**Placeholders.** `{T}` = `lessonMistakeNamesBg(hits)`; `{one}` = exactly one hit; `{L}` = `lesson.titleBg`.

### 5.1 Verdict: `hud/SessionEndScreen.tsx:493-518` (lane E)

```ts
export type SessionVerdict = "passed" | "failed" | "lessonMistake" | "unfinished";
export function sessionVerdict(result: LessonResult): SessionVerdict {
  if (result.passed) return "passed";
  if (!result.summary.passed) return "failed";
  if (!result.aborted && (result.lessonMistakes?.length ?? 0) > 0) return "lessonMistake";
  return "unfinished";
}
SESSION_VERDICT_LABEL_BG.lessonMistake = "Не е взет";
VERDICT_PILL_CLASS.lessonMistake = "bg-warning/15 text-warning";
```

Both tables are `Record<SessionVerdict, string>`, so `tsc` forces every exhaustive map to handle the new member. `xpChipBg` (:605-629) prints the new label with no code change.

### 5.2 Notes under the pill (lane E)

Extract `sheetStandingBg(result)` from `unfinishedVerdictNoteBg` (:531-534). Its output for «Незавършен» stays byte-identical. It returns «Изпитният лист остана чист» | «{pointsWordsBg("exam", score)} — в допустимото по изпитния лист».

**`lessonMistakeVerdictNoteBg(result)`**, for verdict `lessonMistake`:

> {sheetStandingBg}, затова тук не пише „Неиздържан“. Но {T} {one ? "е грешката, която" : "са грешките, които"} този урок учи — щом {one ? "тя се случи" : "някоя от тях се случи"}, урокът не се зачита, дори първия път. Защо е грешка и как се прави правилно — веднага отдолу. Карай урока отново: ще го вземеш, когато мине без {one ? "нея" : "тях"}.

**Aborted run with a hit** (critic gap 9). `unfinishedVerdictNoteBg` (:527-558) returns this variant when `result.aborted && hits.length > 0`, instead of «…зачита се само урок, изкаран докрай. Карай го отново и стигни до края, за да получиш оценка» (:555-556):

> {sheetStandingBg}, затова тук не пише „Неиздържан“; прекъсна урока преди края, затова няма и оценка. Но и изкаран докрай, урокът нямаше да се зачете: {T} {one ? "е грешката, която" : "са грешките, които"} той учи. Карай го отново — до края и без {one ? "нея" : "тях"}.

Without a hit, the note is byte-identical.

### 5.3 Reason block: new section after the verdict card (lane E)

**Placement.** After `SessionEndScreen.tsx:1418`, before «Оценка на маневрата» (:1423).

**Markup.** `<section aria-label="Грешката на този урок">`. The heading is «Грешката на този урок» or «Грешките на този урок»; the `aria-label` stays fixed.

**When it renders:** whenever `hits.length > 0` and the verdict is not `passed` (lessonMistake, failed, or an aborted «Незавършен»).
- The first occurrence is always coached, so no FaultCard ever explains the lesson rule.
- Revision 1's "only uncharged hits on a failed sheet" filter is removed.
- Measured renders: 171 / 171 / 171 / 141 at L1 / L2 / L3 / L5.

**Each entry**, from `lessonMistakeCopy(hit)`:

> **✗ {titleBg}** · {m:ss}
> *(only when `demoTitleBg`)* Това е грешката от демонстрацията „{demoTitleBg}“.
> {explanationBg}
> ✔ Правилното действие: {correctiveBg} *(omitted when null)*
> [правило: {lawRef}] *(omitted when null)*
> *not charged:* При първа поява тази грешка не влиза в наказателните точки. Но урокът съществува, за да научи точно нея — затова не се зачита, докато не го изкараш без нея.
> *charged (a repeat):* Първия път не влезе в наказателните точки; повторението ѝ влезе в изпитния лист — виж „Грешки“ по-долу. Урокът не се зачита, защото това е грешката, която той учи.

**Rendered for `sc-vu-pass-clearance/mistake-squeeze@L3`** (catalogue text from `catalog.ts:1761-1795`; the time is measured at 20.9 s; no demo line, because two demos cite the code):

> ✗ Тясно изпреварване на велосипедист · 0:20
> Мина покрай велосипедиста почти без странично разстояние. Законът изисква ДОСТАТЪЧНА странична дистанция … На половин метър всяко негово клатушкане е сблъсък.
> ✔ Правилното действие: Преди велосипедист: огледало, мигач наляво и се отмести с реален метър и половина …
> [правило: ЗДвП чл. 42, ал. 2, т. 1]
> При първа поява тази грешка не влиза в наказателните точки. Но урокът съществува, за да научи точно нея — затова не се зачита, докато не го изкараш без нея.

Phone fit is measured in lane P (§7). It was not measured here.

### 5.4 End lines: helpers in `SessionEndScreen.tsx` (lane E), wired in `LessonPlayShell.tsx` (lane G)

- **`sessionEndLineBg(result)`** replaces the phone end line (anchor `"Неиздържан — виж разбора"`, worktree :6063):
  - aborted → «Прекратена сесия»
  - otherwise «{SESSION_VERDICT_LABEL_BG[v]} — виж {v === "lessonMistake" ? "защо" : "разбора"}»
  - The tone is warn unless passed.
- **`sessionEndBarLabelBg(result)`** replaces the roomy end-bar label (anchor `data-hud="end-bar"`, worktree :8888):
  - aborted → «Прекратена сесия»
  - otherwise `SESSION_VERDICT_LABEL_BG[v]`
  - Success colour only for `passed`.

### 5.5 Live teach card: `TeachMomentOverlay.tsx` (lane E) and the phone notification (lane G)

All three sites render `teachStakeSegments(moment, …)`. A `strong` segment renders as `<strong>`.

| Kind | When | Stake sentence |
|---|---|---|
| `free-first` | not a target, not charged | **Unchanged, byte-identical:** «Първа среща — **не се брои в резултата**. При повторение: **{minus}** ({SEV}) по {cite}, а повторните грешки тежат още повече (×1.5 / ×2.0).» |
| `lesson-first` | `lessonMistake`, not charged | «Това е грешката, която този урок учи — затова **урокът няма да се зачете**, дори да е първа среща. В наказателните точки не влиза; при повторение: **{minus}** ({SEV}) по {cite}, а повторните грешки тежат още повече (×1.5 / ×2.0).» This is now **true without exception**, because the re-bill is dropped (§3.4b b) |
| `lesson-charged` | `lessonMistake` and `charged` (L1 pause-on-error; always a repeat, since a target's first occurrence is always taught) | «Отново грешката, която този урок учи — **урокът не се зачита**. Повторението влиза в изпитния лист: **{minus}** ({SEV}) по {cite}.» |
| `charged` | `charged` only (L1 pause-on-error; a repeat **or** a first опасна) | «Влиза в изпитния лист: **{minus}** ({SEV}) по {cite}, а повторните грешки тежат още повече (×1.5 / ×2.0).» This fixes today's false «не се брои в резултата» on the charged L1 pause card (`TeachMomentOverlay.tsx:396`, `:528` are unconditional) |

`{minus}` = `minusPointsBg("exam", points)`. `{cite}` = `examMarkCitationBg(severity)`. The roomy card has no «по {cite}» (`citeMark: false`), and the phone has no «({SEV})», both as today. `EXAM_POINTS_SHORT_NOTE_BG` stays under every variant.

**Headers, all visible without «Повече»** (critic gap 8):

| Kind | Header (`teachChipBg`) | Roomy subline (`teachSublineBg`), replacing the fixed «Пауза — първа среща с тази ситуация» at `:476` |
|---|---|---|
| `free-first` | «Учебен момент» | «Пауза — първа среща с тази ситуация» (unchanged) |
| `lesson-first` | «Грешката на урока» | «Пауза — грешката, която този урок учи» |
| `lesson-charged` | «Грешката на урока» | «Пауза — повторена грешка на урока» |
| `charged` | «Учебен момент» | «Пауза — грешка, която влиза в изпитния лист» |

- **Compact header** (:359-377): the label becomes `teachChipBg(m)`. Target moments get the chip «· урокът не се зачита» (`LESSON_MISTAKE_CHIP_BG`).
- **Roomy header** (:473-476): `<h2>` = `teachChipBg(m)`, `<p>` = `teachSublineBg(m)`.
- If the fit suite (`components/sim/lesson-ui/__tests__/teachSurfaceFold.test.tsx`) fails at phone width, drop the severity span **for target moments only**.

**Phone notification** (lane G, anchor `chipBg: "Учебен момент"`, worktree :6107):
- `chipBg: teachChipBg(m)`
- `detailBg: \`${m.explanationBg}\n\n${teachStakeBg(m, { citeMark: true })}\n\n${EXAM_POINTS_SHORT_NOTE_BG}\``

### 5.6 Debrief: `lessons/debrief.ts` (lane D)

The student reads the server copy (`actions.ts:315`). `hits = result.lessonMistakes ?? []`.

1. **Headline, a mandatory new branch** before `else if (!result.completedAll)` (:440), guarded by `summary.passed && hits.length > 0` (the abort branch at :305 comes first):
   > Урокът „{L}“ не е взет: допусна {T} — точно {one ? "грешката, която" : "грешките, които"} този урок учи. По изпитния лист карането е в допустимото ({examPointsWordBg(total)} при допустими 9) и там нищо не се променя; но упражнение се зачита само когато собствената му грешка не се случи нито веднъж.

   When `!result.completedAll`, append « Маршрутът: {unfinishedTaskPhrase(result)}.» (:1256-1267).
2. **Failed sheet with hits.** After the criteria headline, add:
   > Отделно от изпитния лист: {T} {one ? "е грешката, която този урок учи — и сама по себе си тя не позволява" : "са грешките, които този урок учи — и сами по себе си те не позволяват"} урокът да се зачете.
3. **Abort branch** (:325-337, critic gap 9). When `criteriaBroken.length === 0 && hits.length > 0`, replace «Нищо страшно — …» with:
   > {head} Урокът и без прекъсването нямаше да се зачете: допусна {T} — {one ? "грешката, която" : "грешките, които"} той учи. Запазихме наблюденията, а маршрутът те чака отново — този път без {one ? "нея" : "тях"}.

   When `criteriaBroken.length > 0 && hits.length > 0`, append sentence 2.
4. **The «spotless sheet» block** (:544-557): add `&& hits.length === 0` to its guard.
5. **The «tasks done, sheet failed» line** (:579-588): add `&& !summary.passed`. For `hits.length > 0 && completedAll && objectives.length > 0`, print:
   > Задачите от маршрута са изпълнени — този урок не пада заради маршрута, а заради грешката, която учи (по-горе).
6. **«Какво се получи добре: чисто каране…»** (:672-674): not printed when `hits.length > 0`.
7. **Commendation riders** (critic gap 5). Change the shared derivation `commendationRiderFlags(summary, c, lessonMistakes = [])` (:1755-1765):
   - `contradicted ||= c.conceptId !== undefined && lessonMistakes.some((h) => VIOLATIONS[h.code].conceptId === c.conceptId)`
   - `unclean = c.code === "CLEAN_DRIVING" && (summary.mistakes.length > 0 || lessonMistakes.length > 0)`

   `commendationRiderBg(summary, flags, lessonMistakes = [])`: when `summary.mistakes.length === 0` and hits exist, `cleanDrivingScopeBg`'s third branch (:1799-1804) reads «в същия урок се случи грешката, която той учи» instead of «в същия урок има и отбелязани грешки».
   - Callers: `commendationLines` (:1706, lane D) and `SessionEndScreen.tsx:969` (lane E) pass `result.lessonMistakes`.
   - The critic measured 58 L1/L3 hit drives carrying «Чисто и спокойно каране» (`critic-commend.cjs`; not re-run here), and bare skill praise of the same concept, e.g. FULL_STOP_AT_STOP_SIGN and JUNCTION_SCAN_INCOMPLETE, both `c-give-way-stop-behavior` (`catalog.ts:2086`, `:1251`).
8. **Teach section** (:1036-1042): coached rows whose code is a hit move into their own block, first:
   > {one ? "Грешката на този урок" : "Грешките на този урок"} (при първа поява не влиза в наказателните точки, но урокът не се зачита):
   > • {titleBg}   ← the hit's act-aware title (§3.5)
   >   → Защо: {explanationBg}
   >   → Правилното действие: {correctiveBg}
   > При повторение вече влиза и в изпитния лист.

   «Учебни моменти (не влизат в точките):» and its closer print only when incidental rows remain, with unchanged text.
9. **Theory chips and focus** (critic gap 14). `buildDebrief` returns `conceptIds = unique([...lessonMistakeConceptIds(hits), ...summary.conceptIds])` (:1127, :1186). When hits exist, the «what to practice» focus (:1131) is the first hit's concept. `actions.ts` builds `conceptTitles` (:303-312) over the same union (lane F), so `enrichConcepts` (:472) links the lesson's mistake to theory.
10. **«Какво да упражниш»** (:1128-1180): when `hits.length > 0` and no concept title resolved:
    > Какво да упражниш: повтори урока без „{first titleBg}“ — {correctiveBg}

    or, with no corrective, «…повтори урока и този път без „{first titleBg}“.»

A drive with no hit must produce **byte-identical** debrief text.

### 5.7 Stars (lane E)

**`lessons/scenario/rubric.ts:815`:**

```diff
-  if (result.summary.terminated || result.summary.score.hasDangerous || result.aborted || !result.completedAll) {
+  if (result.summary.terminated || result.summary.score.hasDangerous || result.aborted || !result.completedAll
+      || (result.lessonMistakes?.length ?? 0) > 0) {   // ADR-009: a lesson not taken cannot read „взето" (progress.ts:333)
```

**The no-measurement row** (`rubric.ts:553-556`, critic gap 6). When `nothingMeasured && hits.length > 0`, append `NO_QUALITY_MEASURED_LESSON_MISTAKE_BG` instead of `NO_QUALITY_MEASURED_BG` (:123-126):

> Нито един показател за качеството на маневрата не бе измерен на това каране: звездите горе идват от изпитния лист и изпълнените задачи — и тук са само една, защото се случи грешката, която този урок учи.

The critic measured 44 L1/L3 hit drives rendering this row, 16 of them flips (`sc-merge-lane-end/mistake-no-indicator`, `sc-vp-handbrake/mistake-no-observation`, `sc-vu-blindspot-moto/mistake-no-indicator` and others). Not re-run here.

**`manoeuvreGradeReasonBg`** (`SessionEndScreen.tsx:261-288`): when hits exist, add the floor «допусна {T} — {one ? "грешката, която" : "грешките, които"} този урок учи». When it is the only floor, return:

> Само една звезда, защото допусна {T} — {one ? "грешката, която" : "грешките, които"} този урок учи. Звездите не могат да кажат „взето“ за урок, който не е взет.

**The agreement test does not yet cover this** (critic gap 7). `hud/__tests__/session-end-numbers.test.tsx:269-285` has six fixed cases, none with `lessonMistakes`. Lane E adds `["lesson mistake, clean sheet, route finished", resultOf([], { lessonMistakes: [hit], passed: false })]`. With either the cap or the floor removed, that case fails.

**Why 1★.** «взето» is ≥ 2★ (`progress.ts:333`). This is not the reverted wave-7 cap (`rubric.ts:620-723`), which charged a star for any coached code without a target split or a reason.

### 5.8 History (lane F) — revised, critic gap 4

- **`lessons/store.ts`** (`SimSessionEventsJson` :31-60, parse :76-122) gains two optional fields:
  - `lessonMistakes?: { code: string; t: number; charged: boolean; detail?: string }[]`, parsed shape-checked (malformed entries dropped);
  - `sheetRoutePassed?: boolean` (§5.9).
- **`app/(dashboard)/simulator/actions.ts`** payload (:327-368): write `lessonMistakes` when non-empty, and `sheetRoutePassed: result.summary.passed && result.completedAll && !result.aborted` on every row.
- **`page.tsx`** (:229-252) adds entry fields:
  - `notTaken` = non-empty `ev.lessonMistakes` && !aborted.
  - `lessonMistakeTitlesBg: string[]`, retitled from the catalogue through the sim module's public index (`lessonMistakeCopy`, retrieval).
  - `topMistakeTitleBg` = the first lesson-mistake title when `notTaken`; otherwise as today (:249). A charged-mistake count of 0 no longer implies «без грешки».
- **`session-history.tsx`:**
  - The label (:99-107) becomes «Прекъснат» / «Издържан» / **«Не е взет»** (warning) / «Неиздържан».
  - «без грешки» (:130-134) is suppressed when `notTaken`.
  - The expanded panel (:148) starts with «Грешката на урока: „A“, „B“» (no points: a first occurrence has none) above the charged list.
- **Stored rows are not regraded** (§6).

### 5.9 Calibration — revised, critic gap 3 (lanes F and G)

**Decision.** Self-calibration measures **exam self-reading**:
- the trend page is «разликата между твоя отговор и този на изпитната логика» (`app/(dashboard)/review/self-calibration/page.tsx:60-66`);
- `verdictAgrees` is «the claim that maps onto the real exam» (`modules/learning/calibration.ts:227-230`).

Ruling A's lesson rule is not an exam rule (L4 is untouched). So the calibration verdict stays the pre-ADR-009 sheet-and-route verdict, stored explicitly. Revision 1's approach — relabel the tile and suppress the clause only inside the gate, while `actualPass` became the lesson verdict — is withdrawn: it left the trend page counting a clean-sheet not-taken drive as a wrong call (`calibration.ts:229`, page.tsx `:114`, `:286`).

- **`modules/learning/calibrationStore.ts` `readSessionPassed`** (:74-78) becomes `o.version === 1 && (typeof o.sheetRoutePassed === "boolean" ? o.sheetRoutePassed : o.passed === true)`. Rows from before ADR-009 carry no field, and their `passed` is that same verdict. `actualPass` (:113) follows. `calibration.ts` and the trend page are unchanged.
- **`components/sim/lesson-ui/CalibrationGate.tsx`** gets two optional props. When they are absent the render is today's, so the `popup-rig` literal is unaffected.
  - `lessonHasTargets?: boolean` — a lesson-level fact that reveals nothing about this drive. Under the «Издържах ли?» legend (:137-142) it adds one line:
    > Отговори за изпитния лист — дали урокът се зачита, ще видиш веднага след това.
  - `lessonMistake?: { namesBg: string; one: boolean }` — reveal branch only. Under the tiles (:325-347), which stay unchanged («Изпитът каза … издържан/неиздържан» is now literally true), it adds:
    > {reveal.actualPass ? "По изпитния лист: издържан. Урокът обаче не е взет" : "Урокът също не е взет"} — {namesBg} {one ? "е грешката, която той учи" : "са грешките, които той учи"}.
  - The «сгреши и самата присъда» clause (:367) is **not suppressed**: agreement is computed on the verdict the tile shows.
- **Lane G** passes both props from the shell (anchor `<CalibrationGate`, worktree :5578): `lessonHasTargets` from `lesson.lessonMistakeTargets`, and `lessonMistake` from the client `result`.

### 5.10 The rule before the drive — new, critic gap 16

THEO-4 as this codebase reads it calls grading against an unstated threshold a bare verdict (`lessons/scenario/compile.ts:384-405`). Stand-in targets such as HARSH_BRAKING_NO_CAUSE (13 lessons) cannot be guessed. So:

- `lessonMistakeRuleBg(lesson)` (lane A), with pooled catalogue titles:
  > Урокът не се зачита, ако допуснеш „A“ или „B“ — дори веднъж.

  For 3 or more codes: «„A“, „B“ или „C“».
- **Lane G** renders it as one unnumbered line after the numbered briefing (anchor `const briefing = lesson.briefingBg ?? [];`, worktree :4653) and in the folded form (anchor `data-hud="briefing-folded"`, :3552). It must pass `components/sim/lesson-ui/briefingOverflow.test.tsx` at phone width.
- Authored briefing steps are **not** shortened to make room: commit `4209dad` already trimmed briefings for fit. If the line does not fit, see **founder question F3** (§13).

### 5.11 Unchanged, and why

- **The THEO-3 consequence overlay:** the sandbox is exempt.
- **`HudToasts.tsx`:** a target's first card never reaches the toast; later target first-occurrences use today's toast (§3.4b e).
- **The live objective ribbon:** ADR-009 withdraws no tick.
- **The learner model** (`recordSimObservations`, `actions.ts:417-437`; readiness `modules/learning/store.ts:114-133`): evidence stays charged events plus commendations, as for every coached first occurrence of any code today. Stated in the ADR as a follow-up (§11.1).
- **The my-drive reel and «Карта на грешките»** (`review/my-drive/[simSessionId]/page.tsx:66-70`): charged events only, as today; ADR follow-up. The session's verdict and debrief there carry the lesson rule.
- **XP for CLEAN_DRIVING** (`actions.ts:451-453`): the credit is booked off the event, as `debrief.ts:1694-1698` argues. The praise now carries its rider (§5.6.7). ADR follow-up.

---

## 6. Progress, XP, unlock, and the escape hatch

**What «Не е взет» costs.** All of this follows automatically from `passed` or the stars:
- the 60 XP pass bonus and the 50 first-pass bonus (`xp.ts:34-38` via `actions.ts:454-460`). The 40 for completing the drive stays;
- stored `passed: false` and `rubricStars: 1`. Best stars are the maximum across attempts (`progress.ts:280-283`);
- «Следващо ниво» is withheld (`nextStep.ts:147-165`);
- `previouslyPassed` for the first-pass bonus (`actions.ts:250`) reads the lesson verdict.

**What it does not change:** calibration's `actualPass` (§5.9).

**What it does not block:**
- Rungs unlock by attempt (`progress.ts:207`, `:304-313`; server `LEVEL_LOCKED` `actions.ts:272-291`).
- «Продължи напред» (`sessionEndCtas.ts:68-70`).
- Retry, and the sandbox followed by its graded retry.
- Curriculum progression and the exam card (F2).

**If detection is wrong:**
1. The student saw, before the drive, which mistakes cost the lesson (§5.10), and after it what fired, when, why, and the correct action.
2. Content fix: one `incidentalCodeRefs` line (T8c).
3. A later clean attempt restores «взето».
4. Kill switch: delete the compile spread (M1).
5. Stored history is not regraded.

---

## 7. Lanes: process, file ownership and order

**Process for every lane** (doc 61:24-44, critic gap 18):
1. **Claim first.** One GitHub Issue per lane, self-assigned before the first edit; `docs/development/CLAIMS.md` when GitHub is unreachable.
2. **Branch** `antonio/<slug>` (or `<colleague>/<slug>`). Never commit to `scenario-engine` directly.
3. **Full gate before the PR**, from `platform/`: `rm -rf .next/dev/types && npx tsc --noEmit`; `npx vitest run` (FULL) with **one worker** (two workers starve the source-scanning suites); `node scripts/sim-harness.mjs` 13/13; `npm run build`. Lane R also runs the FP battery and the exam-bank bot (doc 61:43-44).
4. **The other developer reviews.** Rebase on the integration branch before merge. The merger redeploys staging.
5. **Shared hotspots** (`contracts.ts`, `rules/{engine,catalog,types}.ts`, doc 61:52-56): additive edits only; the second PR rebases.

**Precondition for every lane.** The other workflow has committed, i.e. the 11 modified and 5 untracked files listed at the top. Run `git status --short` and confirm every file in the lane's list is clean before branching; re-check before merging. Lanes never edit the same file. During development, test one file at a time: `cd platform && npx vitest run <file> --maxWorkers=1`. Nobody edits source while an adversarial verifier is measuring.

| Lane | Owns (exclusive) | Depends on | Done when |
|---|---|---|---|
| **0. ADR and docs** | `docs/architecture/07_ARCHITECTURE_DECISION_RECORDS.md`, `docs/simulation/65_SCENARIO_BASED_LEARNING_ENGINE.md`, `docs/simulation/76_SCENARIO_STUDIO_ARCHITECTURE.md`, `docs/development/64_FUTURE_EXPANSION_ROADMAP.md`, `docs/simulation/87_FOUNDER_ITEM_REGISTER.md`, `docs/simulation/68_ALPHA_RECONSTRUCTION_PLAN.md`, `docs/00_PRODUCT_MAP.md` | — | ADR-009 (with the five feature questions) and the §11 amendments merged. **Lands first** |
| **R. Rules act copy** | `modules/sim/rules/engine.ts`, `modules/sim/rules/catalog.ts`, NEW `modules/sim/rules/__tests__/act-copy-control.test.ts` | 0 | T15 green; FP battery and exam-bank bot green; existing JU-23 and snow-lights suites green, run one by one |
| **A. Contracts and pure module** | `modules/sim/contracts.ts`, `modules/sim/lessons/types.ts` (**dirty**), NEW `modules/sim/lessons/lessonMistake.ts`, `modules/sim/lessons/index.ts`, NEW `modules/sim/lessons/__tests__/lessonMistake.test.ts` | 0 | T0 green, vocabulary assertion and M10 included |
| **B. Data and derivation** | NEW `modules/sim/rules/detectorOptIns.ts`, `modules/sim/rules/index.ts`, `lessons/scenario/types.ts`, `lessons/scenario/validate.ts`, NEW `lessons/scenario/lessonMistakeTargets.ts`, `lessons/scenario/compile.ts`, `lessons/scenario/templates-cockpit.ts`, `lessons/scenario/templates-lanes2.ts`, NEW `lessons/scenario/__tests__/lesson-mistake-targets.test.ts` + `lesson-mistake-targets.fixture.json`, NEW `lessons/scenario/__tests__/incidental-code-refs-validate.test.ts` | A | T8a–T8e green. **The fixture is generated from the implementation and committed; its PR description shows an empty diff against the scratchpad `targets-final.json`** (critic gap 17) |
| **C. Engine, coach and wire** | `lessons/engine.ts`, `lessons/wire.ts`, `scenarios/coach.ts`, `scenarios/coach.test.ts`, NEW `lessons/__tests__/lesson-mistake-verdict.test.ts`, NEW `lesson-mistake-wiring.test.ts`, NEW `lesson-mistake-wire-parity.test.ts`, NEW `lesson-mistake-teach-arm.test.ts`, NEW `lesson-mistake-regrade.test.ts`, `lessons/__tests__/busstop-ban-fail-path.test.ts`, `lessons/__tests__/coached-mistakes-channel.test.ts`, every `lessons/scenario/__tests__/*bot-completion*.test.ts`, `following-claim-gates.test.ts`, `vru-staged-encounter-reach.test.ts`, `traces/__tests__/sc-mw-discipline-traces.test.ts` | A, B, R | T1–T4, T6-engine, T-coach, T-regrade green. Assertions are on `passed`, `score` and `lessonMistakes` **only** — no stars, no `sessionVerdict` (critic gap 11). §8.3 files run one by one |
| **D. Debrief** | `lessons/debrief.ts`, `lessons/__tests__/debrief-truthfulness.test.ts`, `lessons/scenario/__tests__/follow-tailgater-sweep161.test.ts`, NEW `lessons/__tests__/lesson-mistake-debrief.test.ts` | A | T7 green; hit-free drives byte-identical |
| **E. Result screen, stars, teach card** | `lessons/scenario/rubric.ts`, `lessons/scenario/__tests__/rubric.test.ts`, `hud/SessionEndScreen.tsx`, `hud/__tests__/session-end-verdict.test.tsx`, `hud/__tests__/session-end-numbers.test.tsx`, NEW `hud/__tests__/lesson-mistake-reason-block.test.tsx`, `components/sim/lesson-ui/TeachMomentOverlay.tsx`, `components/sim/lesson-ui/point-scales-rendered.test.tsx`, `components/sim/lesson-ui/__tests__/teachSurfaceFold.test.tsx`, NEW `components/sim/lesson-ui/__tests__/teach-stake.test.tsx` | A, **D** (rider signature) | T5, T6-surface, T10 green; `rules/__tests__/point-scales.test.ts` green (run alone) |
| **F. Persistence, history, calibration** | `app/(dashboard)/simulator/actions.ts`, `app/(dashboard)/simulator/page.tsx`, `app/(dashboard)/simulator/session-history.tsx`, `modules/sim/lessons/store.ts`, `components/sim/lesson-ui/CalibrationGate.tsx`, `modules/learning/calibrationStore.ts` + its test, NEW `app/(dashboard)/simulator/__tests__/finish-lesson-mistake.test.ts` (mock harness from `finish-pool-timeout.test.ts`), NEW tests beside each | A, D | T11, T12, T14 green |
| **H. Harness and judges, early** | `tools/audit/inprocess-drive.mjs` (+`.test.mjs`), `tools/audit/verdict-surface.mjs` (+`.test.mjs`), `tools/audit/make-verdicts2.mjs`, `tools/audit/stale-claims.mjs`, NEW `tools/audit/lesson-mistake-census.mjs` + `lesson-mistake-census.expected.json` | A | T13 green; the census tool runs. The expected JSON is typed from §9 of this spec, not copied from the scratchpad (critic gap 17) |
| **P. Phone-fit rig** | `app/dev/popup-rig/popup-rig-client.tsx` (and `page.tsx` if needed) | E, F | Rig fixtures exist for: the four teach kinds (compact and roomy); «Не е взет» with 1 and 4 hits; the aborted-with-hit note; the CalibrationGate hint and reveal line. Photographed at 360 px (R8). Also replace the literal «Неиздържан» at `:488` with the exported label |
| **G. Late: shell and mobile harness** | `components/sim/lesson-ui/LessonPlayShell.tsx`, `tools/mobile/lesson-audit.mjs`, `tools/mobile/lib/driveline.mjs`, `tools/mobile/__tests__/driveline.test.mjs`, `components/sim/lesson-ui/briefingOverflow.test.tsx` | E, F, P, **and the other workflow landed** (these files are under its edit; re-check `git status` immediately before editing) | G1–G5 green; phone fit measured |
| **I. Integration** | NEW `lessons/__tests__/lesson-mistake-integration.test.ts`; merges only | all | Full gate with one worker; acceptance census §9 exact; six re-drives §10; the integration test holds the star and `sessionVerdict` assertions moved out of lane C |

**Lane G's edits in `LessonPlayShell.tsx`**, all by anchor:
1. Phone end line (`"Неиздържан — виж разбора"`).
2. Roomy end bar (`data-hud="end-bar"`).
3. Teach notification (`chipBg: "Учебен момент"`).
4. `<CalibrationGate lessonHasTargets={…} lessonMistake={…}>`.
5. The briefing rule line (`const briefing = lesson.briefingBg ?? [];`, `data-hud="briefing-folded"`).
6. The client-side debrief `conceptTitles`, if the shell builds them, over the §5.6.9 union (not verified whether it does).

**Lane G, mobile harness:**
- `tools/mobile/lesson-audit.mjs` regex `/^(издържан|неиздържан|незавършен)$/i` → adds `|не е взет`; the facts record `lessonMistakeRows` from `section[aria-label="Грешката на този урок"] li`.
- `tools/mobile/lib/driveline.mjs` `classifyVerdict` (:662-669) maps «НЕ Е ВЗЕТ» to `"lessonMistake"`, and `passRate.counts` gains that key.

**Lane H** (critic gap 13):
- `verdict-surface.mjs:113` `PILL_WORDS` gains «НЕ Е ВЗЕТ».
- `inprocess-drive.mjs:947-963` projects `verdict.lessonMistakes`, `coachedMistakes[].detail` and the teach-moment `lessonMistake` flag. Its human block (:1418) prints the four-way verdict.
- `make-verdicts2.mjs:335-400`, the judge brief:
  - four pills, and what «НЕ Е ВЗЕТ» means;
  - «0 наказателни точки» on a first-time lesson mistake is **ruled** behaviour (option B rejected);
  - a right leg that reads «НЕ Е ВЗЕТ» is checked against the leg's own inputs before a product regression is filed (R3).
- `stale-claims.mjs:99-106`: the ИЗДЪРЖАН claim treats «НЕ Е ВЗЕТ» as its own word, with a test.
- `wave-c-merge.mjs` needs no change (it reads no pill words; verified by grep in revision 1).

---

## 8. Test plan

### 8.1 Unit and wiring (lanes A, R, B, C)

- **T0** `lessonMistake.test.ts`:
  - applicability (exam, sandbox, absent → null);
  - fold: coached only → uncharged; coached t=3 plus charged t=9 → one hit `{t:3, charged:true}`; duplicates; non-targets; act title for `JUNCTION_SCAN_INCOMPLETE` `give-way` and `ILLEGAL_STOP_IN_BAN_ZONE` basis; `demoTitleBg`;
  - `lessonMistakeNamesBg` for 1, 2 and 4 hits; `lessonMistakeRuleBg` for 1, 2 and 4 codes; `lessonMistakeConceptIds` de-duplication;
  - `teachStakeBg` and `teachSublineBg` for `free-first` equal the literal strings today's three sites render.
  - **Vocabulary assertion** (critic gap 7): every string the module can produce (all four kinds × severities, the rule line, the names) has no bare `/\bт\./` and no «точк» without «наказателн» or «изпитн». **M10**: the same assertion fails on a synthetic «0 точки».
- **T15** `act-copy-control.test.ts` (lane R):
  - `makeViolation("JUNCTION_SCAN_INCOMPLETE", t, { detail: "give-way" }).titleBg === "Непълно оглеждане при знак Б1"`, and `stop` → «…Б2»;
  - `rebuildRuleEvents([{kind:"violation", code, t, detail:"give-way"}])` gives the same title (server parity);
  - `detail: "snow"` → the snow title;
  - the engine bills `give-way` at a Б1 line and `stop` at a Б2 line (extend the existing JU-23 fixture; its file name was not verified here);
  - no `makeViolation` call in `modules/sim` (excluding tests) passes `titleBg`/`explanationBg` without `detail`, except the pre-drive machine that already sends `detail` (`procedures/machine.ts:97`, `:140`). This is a source scan that reports unresolved call shapes as failures.
- **T-coach** `scenarios/coach.test.ts` (lane C, critic gap 2). Hand-built encounters:
  - (i) an incidental same-topic code first (graded or taught as today), then the target with `lessonMistakeTarget: true` → `mode: "teach"`, `scored: false`;
  - (ii) the target first, then an incidental same-topic code → graded, as today;
  - (iii) the target twice → the second is graded at the base multiplier;
  - (iv) a second target code of the same topic → taught;
  - (v) `examMode` and `learnOnly` ignore the flag;
  - (vi) the flag absent → byte-identical decisions over the existing coach fixtures.
- **T-regrade** `lesson-mistake-regrade.test.ts` (lane C, critic gap 1). Real tapes, measured in `rev/drive-rev.json`:
  - `sc-follow-tailgater/mistake-speed-up@L3` → `score 0`; SPEEDING_OVER_LIMIT coached at 14.8 s; no fault at 20.8 s.
  - `sc-vp-readiness/mistake-no-belt@L3` → 0 (was 3).
  - `sc-ac-night-lights/mistake-never-on@L3` → 0 (was 3).
  - Control: the same tapes at L4 keep today's points (`sc-follow-tailgater/mistake-speed-up@L4` = 1).
  - **M11**: remove the target clause → red.
- **T1** `lesson-mistake-wiring.test.ts` (compile, fold and `buildLessonResult` on hand-built state):
  - T1a marker, with its control;
  - T1b detector, with its control;
  - T1c: an incidental mistake stays teach-first.
  - **T1d (new)**: through `applyTick` with `vi.mock` of `rules/engine.ts reduceTick` returning, on consecutive ticks, an incidental code and then a same-topic target code on `sc-ov-keep-right@L3` (POOR_LANE_KEEPING, then NOT_KEEPING_RIGHT). Expect: the target is coached with 0 points, a TeachMoment with `lessonMistake: true`, and not passed. **M12** (own key removed) → the target is charged and the card is absent.
- **T2** `lesson-mistake-verdict.test.ts`:
  - `sc-vu-pass-clearance/mistake-squeeze` and `mistake-fast-close` at L1/L2/L3/L5 → `passed: false`, `score: 0`, one uncharged hit. At L4 → `passed: true`, `score: 3`, no field.
  - Shadows pass with no field.
  - `sc-vp-stall/mistake-stall-repeat@L1` → hit `charged: true` (a repeat).
  - The late brake-check probe (script **inlined** from `probe-ftg-late-brakecheck.json`) on `sc-follow-tailgater@L3` → not passed, `score 0`, one uncharged HARSH_BRAKING_NO_CAUSE hit at 30.5 s, both objectives done (`rev/probe-rev.out.json`). Today it is ИЗДЪРЖАН 3★.
  - The THEO-3 sandbox → no field.
  - **No star assertions** (moved to lane I).
- **T3** `lesson-mistake-wire-parity.test.ts`:
  - for every Appendix B tape at L1 and L3, build `FinishLessonWire` as the shell does, then `gradeFinishWire`: the server's `passed`, `score` and `lessonMistakes` deep-equal the client's;
  - hit titles match on both sides for a ban-zone basis act and for `JUNCTION_SCAN_INCOMPLETE` `give-way` (needs lane R);
  - **server coached-row titles for hit-free drives are unchanged** (pooled);
  - `detail` over 64 chars → the wire parses and the title is pooled;
  - non-string `detail` → dropped silently.
- **T4** `busstop-ban-fail-path.test.ts` §1: `lessonMistakes[0].code === "ILLEGAL_STOP_IN_BAN_ZONE"`. §6 (strip control): still not passed through ADR-009, with the reason written in the test. `sessionVerdict` is asserted in lane I.
- **T6-engine** `lesson-mistake-teach-arm.test.ts`:
  - the first target teach inside `TEACH_PAUSE_MIN_GAP_S` → a TeachMoment with `lessonMistake: true`;
  - **a second target first-occurrence** inside the gap on a later tick → a `kind: "lesson"` hudEvent (today's downgrade);
  - control without the field → downgraded;
  - pauseOnError arm carries `charged: true`;
  - cap reserve: 99 incidental entries then a target → recorded, length ≤ 100.

### 8.2 Derivation guards (lane B)

- **T8a.** The full derived table equals the committed fixture (167 templates). On mismatch, print the lesson, the code and the two remedies. Also assert the histogram {0:243, 1:260, 2:120, 3:19, 4:4}, 162 exam rungs with no field, and 105 lessons with targets.
- **T8b.** Every boolean-`false` `DEFAULT_RULE_CONFIG` key has a `DETECTOR_OPT_IN_CODES` row, keyed on value. Every authored key is classified. Mutation: an unknown key is reported.
- **T8c.** `incidentalCodeRefs` is exactly the 3 demos and 4 codes.
- **T8d.** `require*Clean` demand codes ⊆ targets (except SPEEDING_DANGEROUS). An unknown demand key fails. Mutation included.
- **T8e.** Every target code resolves to `teach-first-then-grade` through `policyForViolation` and the mapping (measured: 38/38, `rev/topic-check.json`). An `always-grade` or `learn-only` target fails with "Ruling A cannot hold for this code: decide before shipping".

### 8.3 Existing tests expected to change (lane C unless noted)

Update each deliberately, with the reason in a comment; never delete a test to get to green.

**Confirmed by reading:**
- `lessons/scenario/__tests__/s-w7-bot-completion.test.ts:1211`: `mistake-sleep-at-green` L3 `passed: true` becomes false, with a HESITATION_AT_GREEN hit.
- `lessons/scenario/__tests__/follow-tailgater-sweep161.test.ts:252-259` (lane D): «не е завършен» becomes «не е взет»; «Учебни моменти» moves to «Грешката на този урок». Also expect the speed-up leg's sheet to read 0 т. instead of 1 т. (§3.4b b), if the file asserts it (not verified).
- **New in revision 2:** any test pinning points on a tape in the 147-drive list. The list is `rev/analyse-rev.json → pointsChanged`; lane H regenerates it in the repo by running the census tool (§9). Candidates by lesson: sc-ac-{aquaplane, fog, night-lights, night-overdrive, rain-lights, snow, truck-spray, wet-braking}, sc-follow-{standstill, tailgater}, sc-hz-breakdown-pulloff, sc-ln-turn-lane-arrows, sc-mw-{discipline, min-speed}, sc-ov-bus-lane, sc-park-night, sc-rb-lane-choice, sc-sig-green-wave, sc-sign-warning, sc-sp-{limit-end, wet-limit-plate}, sc-speed-{creep, dangerous, rain, transition, zone}, sc-vp-{handbrake, readiness}.
- **`scenarios/coach.test.ts`**: a test pinning the sc-ln-turn-lane-arrows "graded not taught" decision stays green, because the flag is absent there. Confirm by running.

**Candidates** (heuristic scan, run each alone):
- `s7-stall-brake-bot-completion`, `s10-vru-pack-bot-completion`
- `s-w2-`, `s-w3-`, `s-w4-`, `s-w5-`, `s-w6-`, `s-w8-bot-completion`
- `s-final-harvest-bot-completion`, `s-mw-bot-completion`
- `following-claim-gates`, `vru-staged-encounter-reach`
- `traces/__tests__/sc-mw-discipline-traces.test.ts`

Lane R additionally runs every trace test that names JUNCTION_SCAN_INCOMPLETE or HEADLIGHTS_OFF_IN_RAIN one by one: a test asserting `detail === undefined` on those events would break (not verified).

### 8.4 Surfaces (lanes D, E, F, G, P, I)

- **T5** `lesson-mistake-reason-block.test.tsx` plus `session-end-verdict.test.tsx`:
  - four verdicts; aborted with a hit → «Незавършен» with the **abort variant note** (no «стигни до края» alone);
  - pill «Не е взет»; the note;
  - the section with catalogue explanation, corrective and lawRef chip, rendered for lessonMistake, failed and aborted verdicts;
  - the repeat sentence for a charged hit;
  - `sessionEndLineBg` and `sessionEndBarLabelBg`.
- **session-end-numbers** (lane E): the new lesson-mistake case in the cap/floor agreement test (§5.7).
- **T6-surface** `teach-stake.test.tsx`: compact and roomy for all four kinds; headers and sublines per kind; `free-first` byte-identical; the fold suite at phone width.
- **T7** `lesson-mistake-debrief.test.ts`:
  - each §5.6 sentence under its guard, including the abort clause (§5.6.3) and the riders (§5.6.7: CLEAN_DRIVING gets the rider; same-concept praise gets «не всеки път»);
  - `conceptIds` union and focus;
  - every hit-free drive byte-identical;
  - vocabulary assertion over every added line; **M10** included; **M13** (riders ignore `lessonMistakes`) → red.
- **T10** `rubric.test.ts`: a result with `lessonMistakes` → 1★ and, when nothing is measured, the variant row.
- **T11** (lane F): store parse (malformed entries dropped; `sheetRoutePassed` boolean or absent); page mapping (`notTaken`, `topMistakeTitleBg` from the lesson mistake, «без грешки» suppressed); history label «Не е взет»; expanded block.
- **T12** (lane F):
  - `readSessionPassed({version:1, passed:false, sheetRoutePassed:true}) === true`; `readSessionPassed({version:1, passed:true}) === true` (old rows);
  - **M14**: ignore the field → red;
  - `CalibrationGate`: the hint line only with `lessonHasTargets`; the reveal line only with `lessonMistake`, in both sheet states; the clause not suppressed; nothing about the result rendered before the answer.
- **T13** (lane H):
  - `verdict-surface.test.mjs` recognises «НЕ Е ВЗЕТ» and fails if it is removed from `PILL_WORDS`;
  - `inprocess-drive.test.mjs` asserts the projection;
  - a `stale-claims` test for «НЕ Е ВЗЕТ» on a right leg;
  - a `make-verdicts2` brief snapshot containing the four pills.
- **T14** `finish-lesson-mistake.test.ts` (lane F, critic gap 15), with the mocked harness from `finish-pool-timeout.test.ts`. A wire for `sc-vu-pass-clearance@L3` with a coached VULNERABLE_PASS_TOO_CLOSE, stored events assert:
  - `passed: false`, `sheetRoutePassed: true`, `rubricStars: 1`, `lessonMistakes[0].code`;
  - `recordActivity` called with `passed: false`, `firstPass: false`;
  - the returned `concepts` include the hit's concept.
- **T16** (lanes A and G): `lessonMistakeRuleBg` text (A); `briefingOverflow.test.tsx` passes with the rule line on `sc-rb-lane-choice@L3` (4 codes) and `sc-vu-pass-clearance@L3` at phone width (G).
- **G1–G5 (lane G):**
  - `driveline.test.mjs`: `classifyVerdict("НЕ Е ВЗЕТ")`, with a removal-fails check;
  - `lesson-audit` regex fixture;
  - shell end line and end bar call the exported helpers (a render test, or a source assertion that reports unresolved anchors as failures);
  - `CalibrationGate` props wired;
  - briefing line rendered.
- **P1 (lane P):** rig fixtures render without console errors, and the 360 px photographs are attached to the PR.
- **I1** `lesson-mistake-integration.test.ts` (lane I, critic gap 11):
  - `scoreRubric(result, spec.rubric).stars === 1` for squeeze @L1/L2/L3/L5 and 2 at L4;
  - `sessionVerdict === "lessonMistake"` for squeeze @L3 and `sc-pk-busstop-ban/mistake-stop-on-pocket@L1`;
  - the probe drive at 1★.

### 8.5 Mutation tests (each must go red, run once in the lane's PR)

| # | Mutation | Must fail |
|---|---|---|
| M1 | `delete lesson.lessonMistakeTargets` before `createLessonSession` | T2 squeeze @L3 passes; I1 3★ |
| M2 | `examMode: true` on a practice lesson | T0, T2 applicability |
| M3 | `mistakeExperience` on a practice lesson | T0 |
| M4a | Omit the target from `wire.coachedMistakes` | T3: server `passed` becomes true. **Pinned trust boundary** |
| M4b | Omit a charged target repeat from `wire.ruleEvents` and from `coachedMistakes` | T3: server `passed` true and sheet lower. **Pinned trust boundary** (critic gap 10) |
| M5 | Delete a demo's `incidentalCodeRefs` | T1a control flips |
| M6 | Delete `needlessStopEnabled` | T1b control flips |
| M7 | `vi.mock` `foldLessonMistakes` → `[]` | T2, T5 red |
| M8 | Drop `lessonMistake` from the TeachMoment | T6-surface prints «Първа среща — не се брои в резултата» |
| M9 | Unknown ruleConfig key / unknown demand key | T8b / T8d report it |
| M10 | Bare-points synthetic string | T0 and T7 vocabulary assertions |
| M11 | Remove the target clause from the regrade guard | T-regrade: speed-up @L3 back to 1 т. |
| M12 | Remove the own-code teach key | T-coach (i)(iv) and T1d red; `sc-ln-turn-lane-arrows/mistake-late-two-lanes@L3` back to 9 т. |
| M13 | Rider flags ignore `lessonMistakes` | T7 rider assertions |
| M14 | `readSessionPassed` ignores `sheetRoutePassed` | T12 |

---

## 9. Acceptance census (lane I)

**Instrument.** `node tools/audit/lesson-mistake-census.mjs`, one sequential process. It drives every tape × authored rung (2,434 drives) with `drive({ singleRun: true })`: 371 s in the revision-2 prototype. It compares against `lesson-mistake-census.expected.json`, whose numbers are this section's.

**Revision evidence.** The numbers below were measured by driving all 2,434 drives through `rev/proto`, a scratch copy of the worktree at HEAD `98bf8ae` (with the 11 dirty files) patched with §3.3b, §3.4b and §3.5's grading, targets injected from `targets-final.json` (`rev/patch-proto.mjs`, `rev/drive-proto.mjs`). The results were compared field by field with the pre-change census (`rev/analyse-rev.cjs`).
- Errors: 0.
- Drift on non-hit practice drives, on `passed`, stars, points, fault codes or coached codes: 0.

| Rung | Shadow pass (before → after) | Mistake tapes | Mistake pass (before → after) | ★★★ mistake (before → after) | → «Не е взет» (from pass / unfinished / failed) | «Неиздържан» with hit | Reason block renders | «Незавършен» after | Mistake-tape sheet points (before → after) | Drives losing points |
|---|---|---|---|---|---|---|---|---|---|---|
| L1 | 167 → **167** | 336 | 42 → **2** | 34 → **2** | **146** (40 / 105 / 1) | 25 | 171 | **0** | 2,128 → **2,069** | 38 |
| L2 | 167 → **167** | 336 | 37 → **2** | 32 → **2** | **146** (35 / 110 / 1) | 25 | 171 | **0** | 2,128 → **2,069** | 38 |
| L3 (default rung for all 167) | 167 → **167** | 336 | 34 → **2** | 29 → **2** | **146** (32 / 113 / 1) | 25 | 171 | **0** | 2,131 → **2,072** | 38 |
| L4 exam | 162 → **162** | 326 | 32 → **32** | 2 → **2** | 0 | 0 | 0 | 110 (unchanged) | 2,206 → **2,206** | 0 |
| L5 | 145 → **145** | 292 | 24 → **2** | 21 → **2** | **120** (22 / 97 / 1) | 21 | 141 | **0** | 1,930 → **1,876** | 33 |

**Pass criteria:**
1. The table above, exactly.
2. The two mistake tapes still passing at every practice rung are exactly `sc-follow-standstill/mistake-creep-up` and `sc-park-perp-forward/mistake-blind-exit` (R10 allowlist, which ratchets). Measured.
3. Mistake tapes not passed: 334/336 at L1/L2/L3, 290/292 at L5.
4. **Points (revised):**
   - (a) L4 and every shadow drive: `totalPoints` and `effectiveScore` identical to the baseline;
   - (b) every practice drive whose `totalPoints` differs is a mistake tape with a non-empty `lessonMistakes`, and its points only fall (147 drives; 38/38/38/33 by rung);
   - (c) **invariant**: no charged violation of a target code on a practice drive lacks an earlier coached occurrence of the same code (measured: 0 of 693 hits);
   - (d) the only sheet-verdict flips are `sc-ln-turn-lane-arrows/mistake-late-two-lanes` at L1/L2/L3/L5 (9 → 6 т., «Неиздържан» → «Не е взет»).
5. L4 `passed`, stars, `totalPoints`, fault codes and coached codes identical on all 488 drives. Measured.
6. 0 shadow drives carry `lessonMistakes`. Measured.
7. **Stars.**
   - Every flip falls to 1★.
   - On already-failing drives, stars fall only on `sc-ln-turn-lane-arrows/mistake-late-two-lanes` (2★ → 1★, L1/L2/L3/L5) and `sc-vu-cyclist-group/mistake-narrow` (2★ → 1★, L1 only). Measured.
8. The flip lists match Appendix B (measured identical to revision 1's lists; only the `*` charged markers changed).
9. Lesson-mistake cards: 661 across 654 hit drives, with 7 drives showing two (§3.4b e).
10. Two census runs give equal digests. **Not measured by the reviser:** the prototype ran once with `singleRun`; revision 1's 6-drive sample in `synth-det/` is the only determinism evidence.

**Training score.** `effectiveScore` changed on 76 of the L1/L3 hit drives where the baseline records it (e.g. `sc-ln-turn-lane-arrows/mistake-late-two-lanes` 10.5 → 6, `sc-rb-lane-choice/mistake-exit-across-outer` 23 → 20). The L2/L5 baseline did not record it.

---

## 10. The six audit rows: what a re-drive must photograph

Row text comes from `node tools/audit/finding-reader.mjs <lesson>`, saved as `design-finding-*.txt`. "In-process" figures are from `rev/analyse-rev.json → auditRows`. The harness steps of lanes H and G must land **before** these legs are judged.

| Row | What the row says | In-process today → after (revision 2) | The re-drive frame must show | Closable by this change? |
|---|---|---|---|---|
| **sc-vu-pass-clearance:260b13fd** (critical) | «ticks ЗАДАЧА 2/2 at t017s while … 59 км/ч past the cyclist»; «0 наказателни точки … ИЗДЪРЖАН … ★★★» | Both tapes at L1/L2/L3/L5: ИЗДЪРЖАН 3★ 0 т. → **«Не е взет» 1★ 0 т.**, hit VULNERABLE_PASS_TOO_CLOSE (uncharged, 20.9 s). L4: ИЗДЪРЖАН 2★ 3 т. (unchanged) | pc-wrong and mobile-wrong `08-debrief`: pill «НЕ Е ВЗЕТ»; section «Грешката на този урок» with «Тясно изпреварване на велосипедист», its corrective and «правило: ЗДвП чл. 42, ал. 2, т. 1»; ★☆☆ with the single-floor sentence. `04-t0xx` teach frame: «Грешката на урока · урокът не се зачита». The briefing frame shows the rule line | **Conditional.** Needs the harness wrong leg to fire the detector (the w45 mobile-right leg coached it; the wrong leg was not verified). The ИЗДЪРЖАН/★★★ half closes. The **tick** half does not: `sc-vup-pass` is «Прибери се в лентата и продължи по улицата» with `maxSpeedKmh: 46` (`templates-vru.ts:1390-1393`) |
| **sc-vp-police-stop:44cfeff6** (minor) | Convicted for the collision, not for disobeying the officer | drive-past L1/L2/L3/L5: «Незавършен» 1★ 0 т. → **«Не е взет»**, hit POLICE_STOP_SIGNAL_IGNORED only (the marker works). panic-stop: «Незавършен» → «Не е взет», hit HARSH_BRAKING_NO_CAUSE | pc-wrong `08-debrief`: section naming «Подминаване на полицейски сигнал» and «правило: ЗДвП чл. 103». If the leg crashes: «НЕИЗДЪРЖАН» plus that section | **Plausible.** Driving past needs no steering; the section renders under «НЕИЗДЪРЖАН» too, provided the signal detector fires before any collision (not verified on the harness leg) |
| **sc-vp-telltale-red:c172d48b** (major) | «a student who … keeps driving without crashing would be recorded as faultless» | drive-on L1/L2/L3/L5: «Неиздържан» 10 т. → same pill **plus** the section (WARNING_LAMP_IGNORED; its re-bill dropped). panic-lane: «Незавършен» 0 т. → «Не е взет», HARSH_BRAKING_NO_CAUSE with «Това е грешката от демонстрацията „Паническо спиране в активната лента“» | A wrong leg that drives on **without colliding**: «НЕ Е ВЗЕТ» plus «Продължаване с червена контролна лампа» and «правило: ЗДвП чл. 101, ал. 1». Weaker frame: a colliding leg showing the section under «НЕИЗДЪРЖАН» | **Partly.** The row's counterfactual needs a non-colliding leg (harness work). In-process proof: T1 with a hand-built coached lamp |
| **sc-follow-tailgater:63c0c28c** (critical) | «wrong drive escapes entirely: 0 наказателни точки … only reason НЕИЗДЪРЖАН is that not all route tasks were done … teach card and no penalty» | brake-check: «Незавършен» 0 т. → «Не е взет», HARSH_BRAKING_NO_CAUSE. speed-up: «Незавършен» **1 т.** → «Не е взет» **0 т.** (the 20.8 s re-bill is dropped; coached at 14.8 s). Late brake-check probe @L3: ИЗДЪРЖАН 3★ → «Не е взет» 1★ 0 т. | pc-wrong and mobile-wrong: pill «НЕ Е ВЗЕТ»; a section naming the brake check or «Превишена скорост» (demo line «Гузно ускоряване»); a headline that is not «мини целия маршрут». The verdict must cite Ruling A for the «0 points» half: **0 points for a first-time lesson mistake is now the ruled behaviour** | **Plausible.** Sibling `f42dce4f` (PC and mobile disagree) is a separate row (R1) |
| **sc-pk-busstop-ban:105f805c** (major) | «Nothing proves a student who stops inside the bus-stop zone is penalised» | Both tapes L1–L3: «Незавършен» 0 т. → «Не е взет», ILLEGAL_STOP_IN_BAN_ZONE. L4: 3 т. (unchanged) | A logged-in wrong leg that **stops in the zone**: «НЕ Е ВЗЕТ» plus «Спиране в забранена зона» with the pooled chip (the same one the teach card prints today) | **Not by photograph with today's leg** (sibling `b103c282`: the leg hits an obstacle at 28 s). In-process proof strengthens (T4, I1) |
| **sc-signal-hesitation:440b1f7c** (critical) | «bare verdict on both platforms»; «НЕИЗДЪРЖАН · 0 наказателни точки · mistakes=0 · top 59 км/ч» | filter and freeze L1/L2/L3/L5: «Незавършен» 0 т. → «Не е взет», «Колебание на зелен сигнал», its corrective and «правило: Наредба № 38 приложение № 5, т. 10, б. „б“». The rule line names it before the drive | pc and mobile: a leg that **freezes on green**; pill plus section; no «стигни до края» | **Conditional.** «top 59 км/ч» says the old leg sprinted; SPEEDING_OVER_LIMIT is not this lesson's target |

**Right legs will move** (R3). 10 of the 44 w45–w47 right legs that pass today carry a target title, text-matched on the debrief (`design-derived-rightlegs.json`):
- `sc-ed-reverse-line` ×4
- `sc-jx-giveway-b1` ×2
- `sc-ac-truck-spray` ×2
- `sc-vu-pass-clearance` mobile
- `sc-ac-crosswind`

5 of the 10 have `droveIt=false`. The judge brief (lane H) tells judges to check leg inputs first.

---

## 11. Docs and ADR

### 11.1 ADR-009 (lane 0): **required, and written before the code**

**Why it is required:**
- It changes the cross-module meaning of `LessonResult.passed`.
- It adds a template contract field.
- It changes two coach inputs.
- It partly reverses doc 65 §5.
- `rubric.ts:790-793` calls moving a grade's meaning an ADR.
- CLAUDE.md: «changes to strategy/architecture get an ADR first».

`docs/architecture/07_ARCHITECTURE_DECISION_RECORDS.md` ends at ADR-008 (:78-87). Append in ADR-008's field format, **plus the recorded decision standard's fields** (problem; approaches; alternatives; recommendation; advantages and disadvantages; technical risks; scalability) and **the five feature questions** (critic gap 18):

- **Title:** `## ADR-009: A practice lesson is not taken when its own mistake occurs (Founder Ruling A)`
- **Date / Status:** 2026-09-17 · **Accepted** (founder ruling, given in chat).
- **Problem:**
  - The 336-tape census detected the offence in 336/336, yet wrong drives **passed** 42, 37, 34 and 24 times at L1, L2, L3 and L5, 34 of them ★★★ at L1.
  - Cause: teach-first (doc 65 §5), with only a few hand-coded `require*Clean` gates.
  - Also: on 135 practice drives the "free" first occurrence was billed anyway 6–10 s later by the continuing-breach re-bill. On 12 it was billed at once because its topic was already taught.
- **Options:**
  - A: own mistake → not passed, no points the first time, card explains; incidental mistakes teach-first; exam unchanged (**chosen**).
  - B: also charge points the first time (rejected).
  - C: keep today's rule (rejected).
  - Derivation alternatives: per-template declaration (167 literals); withdrawing the objective tick (not idempotent across client and server); concept overlap (loses 59 targets); `codeRefs` alone (7 false and 5 missed targets).
- **Chosen:**
  - compile-time derivation;
  - one fold on client and server;
  - own-code first teach and re-bill drop for targets;
  - a fourth verdict «Не е взет»;
  - a catalogue-only reason block;
  - 1★ cap;
  - teach-card stake;
  - a pre-drive rule line;
  - theory chip for the hit's concept;
  - praise riders;
  - calibration kept on the exam-reading verdict;
  - Б1/Б2 act copy moved to the per-act table so both sides title a hit the same.
- **Advantages:** zero per-lesson authoring beyond 3 markers; one kill switch; hit-free drives byte-identical (L4 and 808 shadows measured identical).
- **Disadvantages and trade-offs:**
  - Practice and exam now disagree: `sc-vu-pass-clearance/mistake-squeeze` is «Не е взет» 0 т. 1★ at L3 and ИЗДЪРЖАН 3 т. 2★ at L4 (measured).
  - 231 sheet points on 147 practice drives are no longer charged. The lesson refusal replaces them.
  - A target's first card bypasses the pause rate limit once per session.
  - Stand-in detectors now cost a pass (32 pairs).
- **Technical risks:**
  - stand-in false positives;
  - **trust — the server never re-runs the rules; it re-titles what the client reports. A modified client can omit a target from either list and reproduce the old pass. This is the same trust level as the objective flags, pinned by M4a and M4b;**
  - a stale tab across the deploy;
  - two lessons end before their hazard;
  - the act-copy move changes the Б1/Б2 training repeat ladder.
- **Consequences deliberately not taken (follow-ups):**
  - (1) the learner model (`recordSimObservations`) still counts only charged events and commendations: a coached target is not negative evidence, and same-concept praise still counts positive;
  - (2) the my-drive reel and «Карта на грешките» mark charged events only;
  - (3) CLEAN_DRIVING XP is still booked off the event.

  Each is a learning-model or display decision not implied by Ruling A.
- **Five questions:**
  1. *Learning outcomes?* Yes. «взето» now certifies the taught act did not happen. Every refusal is explained before, during and after the drive (THEO-4).
  2. *Safer drivers?* Yes. Wrong drives such as squeezing past a cyclist at 59 км/ч stop earning ★★★ practice passes (34 at L3).
  3. *Retention?* **Risk.** More «Не е взет» and 1★ results (146 of 336 mistake tapes per practice rung). Stand-ins may refuse drivers with correct intent. Mitigations: rungs unlock by attempt (`progress.ts:207`); «Продължи напред» stays (`sessionEndCtas.ts:68-70`); the 40 XP for finishing stays; the rule is stated before the drive; one-line content escape hatch. Monitor the not-taken rate per lesson in real sessions. **No real-student measurement exists yet.**
  4. *Measurable progress?* Yes. A pass is a stronger signal; history names the cause; calibration stays an exam-reading instrument.
  5. *Business value?* A pass that parents or schools can trust, against the retention risk in (3). Not quantified.
- **Scalability:** targets derive from data every new template already authors. New detectors enter through `DETECTOR_OPT_IN_CODES` (T8b fails on an unclassified key).
- **Migration:** stored rows are not regraded. Calibration reads `sheetRoutePassed` when present and `passed` otherwise.
- **Future:** curriculum lessons (F2); points on repeats (F1); detectors to replace stand-ins (R5 backlog); finish zones after the taught hazard; the three follow-ups above.

### 11.2 Amendments (lane 0), each citing ADR-009

| Document | Passage | Amendment |
|---|---|---|
| `docs/simulation/65_SCENARIO_BASED_LEARNING_ENGINE.md` | §5 `teach-first-then-grade` (:70-72) | «**Exception — the lesson's own mistake (ADR-009):** on a practice rung, a code in `lessonMistakeTargets` is always taught on its first occurrence (even when its topic was taught by another code), its continuing-breach re-bill is not charged, and the lesson is not taken; repeats grade as before; incidental mistakes and exam mode are unchanged.» |
| `docs/simulation/76_SCENARIO_STUDIO_ARCHITECTURE.md` | §2 (:117) | `incidentalCodeRefs?[]` on `MistakeDemo`, with the R2 rule |
| same | §5 (:167-168) | «every mistake demo ends NOT passed at every practice rung (ADR-009), except the named allowlist» |
| same | §6 (:180-183) | fourth verdict «Не е взет»; reason block; «stars ≤ 1 when the lesson's own mistake occurred»; the pre-drive rule line |
| same | §7 (:186-190) | L1/L2/L3/L5 «+ own-mistake refusal (ADR-009)»; L4 «official sheet only» |
| same | §9 stage 5 (:216) | «; a code the demo grades only as a side effect is listed in `incidentalCodeRefs`» |
| `docs/development/64_FUTURE_EXPANSION_ROADMAP.md` | THEO-3 note (:99-112) | «— except the lesson's own mistake, which costs the lesson (not points) on first occurrence (ADR-009)» |
| `docs/simulation/87_FOUNDER_ITEM_REGISTER.md` | Row 21 (:4619) | Ruling A answers it for a lesson's own mistake: `CROSSED_SOLID_LINE` is a target in sc-ov-solid-line, sc-ov-solid-return, sc-vu-door-zone, sc-mv-uturn-ban and sc-animal-hazard; elsewhere teach-first; the recommender half stays open. Add F3 if it arises |
| `docs/simulation/68_ALPHA_RECONSTRUCTION_PLAN.md` | A12 (:278) | «warn-once governs points for incidental mistakes; for the lesson's own второстепенна the first occurrence and its re-bill are free and the pass is withheld (ADR-009)» |
| `docs/00_PRODUCT_MAP.md` | scenario grading line (:21) | Status note plus a link to F1–F3 |
| `content/SCHEMA.md` | — | **No change** (`MistakeDemo` lives in doc 76 §2) |

---

## 12. Risks

| # | Risk | Handling |
|---|---|---|
| **R1** | **A stand-in detector's tolerance now costs a pass.** Most exposed: HARSH_BRAKING_NO_CAUSE (13 lessons), POOR_LANE_KEEPING (11), SPEEDING_OVER_LIMIT (11). Known instability: `sc-follow-tailgater:f42dce4f` | Monitor the lesson-mistake card rate per lesson. Remedy: `incidentalCodeRefs`. Re-drive the 30 flipping lessons on both platforms after lanes G and H |
| R2 | Two lessons finish before their taught hazard | Content row; ratcheting allowlist |
| **R3** | **About 10 right legs will read «Не е взет»** on the next sweep | Pill parsers and the judge brief first (lanes H, G) |
| R4 | Four of six rows need a steered or non-colliding leg | In-process proofs T1, T2, T4, I1 |
| **R5** | **Trust (corrected, critic gap 10):** the server never re-runs the rules; omitting a target from either client list reproduces the old pass | Pinned by M4a/M4b; the same level as objective `done`; stated in the ADR |
| R6 | A stale client across the deploy shows ИЗДЪРЖАН while the server stores not taken | Transient; stated in the ADR |
| R7 | Pacing: one bypassed pause per session | T6-engine; measured 661 cards on 654 hit drives |
| R8 | Phone fit: header chip, roomy subline, reason section, end line, calibration hint and reveal line, **briefing rule line** | Lane P rig photographs; T16; fallbacks §5.5, F3 |
| **R9** | **Concurrent edits.** The dirty set grew during this session from 7 to **11 modified and 5 untracked** files, including `lessons/types.ts`, `LessonScene.tsx` and the mobile harness | Precondition in §7; lane G last |
| R10 | The live objective ribbon still ticks, e.g. «ЗАДАЧА 2/2» | The end screen explains |
| **R11** | **Retention** (§11.1 Q3) | Monitor; escape hatch; unlock by attempt |
| R12 | Lane R's act keys split the Б1/Б2 **training** repeat ladder and the debrief grouping | T15; official points unaffected by construction; FP battery and exam-bank bot |
| R13 | 147 practice drives' sheet numbers change; any existing test pinning them breaks | §8.3 list; lane H regenerates the changed-drive list from the repo |

---

## 13. Founder questions (neither blocks the build; defaults ship)

**F1 (narrowed in revision 2). Repeats of the lesson's own mistake: graded as today?**

Revision 1 asked about three shapes. Two are now decided by the ruling's own words, «NO exam points are taken for it», for the first time:
- **(b)** the automatic re-bill of the same continuing episode is the first occurrence billed late, so it is dropped (§3.4b b);
- **(c)** a first occurrence charged because its topic was already taught is still a first occurrence, so it is taught (§3.4b c).

What remains is **(a)**: a genuine repeat — a new episode after the card, e.g. stalling twice.
- Measured: 43 practice drives on 11 tapes carry a charged repeat.
- **Default shipped:** graded exactly as today (×1.5/×2 training ladder). Rejected option B is "also charge the first time", which implies repeats keep today's grading.
- If the founder wants "never points for the lesson's own mistake in practice", one line in the coach decision drops the repeat's score for targets.

**F2. Are curriculum lessons (`l0`–`l8`) in scope?** Unchanged from revision 1:
- they author no mistake demos;
- their pass **locks** the exam card (`progression.ts:163-171`, `specs.ts:703`) and the полигон (`specs.ts:958`).

**Default shipped:** scenario lessons only.

**F3 (conditional, new). If the pre-drive rule line (§5.10) does not fit the phone briefing without cutting authored steps: where should it go?** Options: the rung card in the catalogue; the first teach card only; a shortened briefing step. **Default:** none ships until answered. The card at the moment of the mistake and the reason block still carry the rule.

**Already ruled, for awareness:** the practice/exam asymmetry; the bus-stop citation hold (`rules/types.ts:233-240`) is untouched.

---

## 14. Not verified

- **Harness wrong legs** for the six rows: whether each commits its target code.
- **Rendered appearance and phone fit** of any new copy. Nothing was rendered.
- **Which §8.3 test files break.** None were run, by constraint.
- **`rules/engine.ts` detector gate lines** in §3.3, and J1's template quotes (`templates-junctions3.ts:841-845`, `templates-following2.ts:558-562`).
- **Determinism of the revision-2 prototype run** (single run). The L2/L5 baseline was sampled 6/6 in revision 1.
- **How far the prototype matches the final code.**
  - Targets were injected, not derived by new code.
  - The fold, regrade guard, own-code key, first-card bypass, cap reserve, star cap and act copy were patched into a scratch copy.
  - Debrief, screens, wire, persistence and calibration were **not** patched or exercised.
  - The prototype's `source` field on injected targets is a placeholder, so `demoTitleBg` was not exercised.
- **The act-copy (lane R) effect on hit drives**, separately from lane C's effect. The snow act is not billed on any current target lesson.
- **The critic's own measurements** cited without re-running: 58 CLEAN_DRIVING hit drives; 44 NO_QUALITY rows.
- **Whether the shell builds client-side `conceptTitles`** (§7 lane G item 6).
- **Whether any trace test asserts `detail === undefined`** on JUNCTION_SCAN_INCOMPLETE or HEADLIGHTS_OFF_IN_RAIN.
- **The file name of the JU-23 engine fixture** for T15.
- **The in-drive bypass's interaction with `HudToasts` queueing.**

---

## Appendix A: target codes per lesson (105 lessons; 62 others are empty)

`(D)` = armed detector with no demo. `(S)` = stand-in. Full provenance is in `targets-final.json`.

| Lesson | Target codes (every practice rung) |
|---|---|
| `sc-roundabout-entry` | TURN_WITHOUT_INDICATOR |
| `sc-lane-change` | LANE_CHANGE_WITHOUT_INDICATOR, LANE_CHANGE_WITHOUT_MIRROR_CHECK |
| `sc-signal-response` | STOP_LINE_OVERSHOOT, YELLOW_LIGHT_NOT_STOPPED |
| `sc-turn-left-oncoming` | TURN_WITHOUT_INDICATOR |
| `sc-junction-scan` | JUNCTION_SCAN_INCOMPLETE |
| `sc-jx-giveway-b1` | JUNCTION_SCAN_INCOMPLETE |
| `sc-signal-hesitation` | HESITATION_AT_GREEN |
| `sc-signal-redyellow` | RED_YELLOW_CROSSED |
| `sc-crossing-rain-sprint` | HEADLIGHTS_OFF_AT_NIGHT |
| `sc-speed-rain` | SPEED_TOO_FAST_FOR_CONDITIONS |
| `sc-speed-creep` | SPEEDING_OVER_LIMIT |
| `sc-speed-dangerous` | SPEEDING_OVER_LIMIT |
| `sc-speed-zone` | SPEEDING_OVER_LIMIT |
| `sc-speed-transition` | SPEEDING_OVER_LIMIT |
| `sc-sp-harsh-brake` | HARSH_BRAKING_NO_CAUSE |
| `sc-sp-curve` | SPEED_TOO_FAST_FOR_CURVE |
| `sc-mw-discipline` | DRIVING_TOO_SLOW_FOR_MOTORWAY, NOT_KEEPING_RIGHT |
| `sc-follow-distance` | FOLLOWING_TOO_CLOSE |
| `sc-follow-standstill` | CLOSING_ON_LEAD_TOO_FAST (D), STANDSTILL_GAP_TOO_CLOSE |
| `sc-follow-rain-gap` | FOLLOWING_TOO_CLOSE_FOR_RAIN |
| `sc-follow-truck` | FOLLOWING_TOO_CLOSE |
| `sc-follow-cutin` | FOLLOWING_TOO_CLOSE |
| `sc-follow-tailgater` | HARSH_BRAKING_NO_CAUSE, SPEEDING_OVER_LIMIT (S), STOPPED_WITHOUT_CAUSE (D) |
| `sc-ov-keep-right` | NOT_KEEPING_RIGHT |
| `sc-ov-lane-keeping` | CENTER_LINE_TOUCHED, POOR_LANE_KEEPING |
| `sc-ov-oneway` | WRONG_LANE_FOR_DIRECTION |
| `sc-ov-ban-overtake` | OVERTAKING_IN_BAN_ZONE |
| `sc-ov-solid-line` | CROSSED_SOLID_LINE |
| `sc-ov-bus-lane` | DRIVING_IN_BUS_LANE |
| `sc-ov-return-gap` | OVERTAKE_RETURN_TOO_EARLY |
| `sc-vu-pass-clearance` | VULNERABLE_PASS_TOO_CLOSE |
| `sc-vu-door-zone` | CROSSED_SOLID_LINE |
| `sc-pk-ban-stop` | ILLEGAL_STOP_IN_BAN_ZONE |
| `sc-vp-readiness` | HANDBRAKE_LEFT_ON, SEATBELT_OFF_WHILE_MOVING |
| `sc-pk-move-off` | MOVE_OFF_WITHOUT_OBSERVATION |
| `sc-vp-stall` | ENGINE_STALLED |
| `sc-vp-police-stop` | HARSH_BRAKING_NO_CAUSE (S), POLICE_STOP_SIGNAL_IGNORED |
| `sc-vp-telltale` | HARSH_BRAKING_NO_CAUSE (S), WARNING_LAMP_IGNORED |
| `sc-ac-night-lights` | HEADLIGHTS_OFF_AT_NIGHT |
| `sc-ac-rain-lights` | HEADLIGHTS_OFF_IN_RAIN |
| `sc-ac-highbeam-lead` | HIGH_BEAM_NOT_DIPPED |
| `sc-ac-wet-braking` | SPEED_TOO_FAST_FOR_CONDITIONS |
| `sc-ac-fog` | FOG_LIGHTS_OFF_IN_FOG, SPEED_TOO_FAST_FOR_CONDITIONS |
| `sc-ac-snow` | SPEED_TOO_FAST_FOR_CONDITIONS |
| `sc-ac-crosswind` | CENTER_LINE_TOUCHED (S), POOR_LANE_KEEPING (S) |
| `sc-ac-aquaplane` | CENTER_LINE_TOUCHED (S), SPEED_TOO_FAST_FOR_CONDITIONS |
| `sc-ac-ice` | POOR_LANE_KEEPING (S) |
| `sc-rx-tram-left` | TURN_WITHOUT_INDICATOR |
| `sc-jx-priority-confidence` | HARSH_BRAKING_NO_CAUSE, STOPPED_WITHOUT_CAUSE (D) |
| `sc-sig-green-wave` | HARSH_BRAKING_NO_CAUSE, HESITATION_AT_GREEN, SPEEDING_OVER_LIMIT |
| `sc-pk-crossing-ban` | ILLEGAL_STOP_IN_BAN_ZONE |
| `sc-pk-busstop-ban` | ILLEGAL_STOP_IN_BAN_ZONE |
| `sc-pk-stop-vs-park` | ILLEGAL_STOP_IN_BAN_ZONE |
| `sc-pk-double-park` | ILLEGAL_STOP_IN_BAN_ZONE |
| `sc-mv-uturn-ban` | CROSSED_SOLID_LINE |
| `sc-pk-rail-ban` | ILLEGAL_STOP_IN_BAN_ZONE |
| `sc-ln-turn-lane-arrows` | LANE_CHANGE_WITHOUT_INDICATOR (S), LANE_CHANGE_WITHOUT_MIRROR_CHECK (S), WRONG_LANE_FOR_DIRECTION |
| `sc-ov-night-gap` | HIGH_BEAM_NOT_DIPPED |
| `sc-ov-being-overtaken` | CENTER_LINE_TOUCHED (S), SPEEDING_OVER_LIMIT (S) |
| `sc-ov-crest-curve` | SPEED_TOO_FAST_FOR_CURVE |
| `sc-ov-solid-return` | CROSSED_SOLID_LINE, OVERTAKE_RETURN_TOO_EARLY |
| `sc-ln-boulevard-discipline` | LANE_CHANGE_WITHOUT_INDICATOR, NOT_KEEPING_RIGHT, POOR_LANE_KEEPING |
| `sc-ln-obstacle-meeting` | CENTER_LINE_TOUCHED (S) |
| `sc-pe-school-patrol` | SPEEDING_OVER_LIMIT |
| `sc-pe-night-unlit` | HEADLIGHTS_OFF_AT_NIGHT |
| `sc-pe-parked-row-scan` | SPEEDING_OVER_LIMIT (S) |
| `sc-rb-exit-signal` | TURN_WITHOUT_INDICATOR |
| `sc-rb-circulate-priority` | HARSH_BRAKING_NO_CAUSE (S), POOR_LANE_KEEPING (S) |
| `sc-rb-lane-choice` | LANE_CHANGE_WITHOUT_INDICATOR, LANE_CHANGE_WITHOUT_MIRROR_CHECK, POOR_LANE_KEEPING (S), TURN_WITHOUT_INDICATOR |
| `sc-merge-accel-lane` | HARSH_BRAKING_NO_CAUSE (S), LANE_CHANGE_WITHOUT_MIRROR_CHECK |
| `sc-merge-lane-end` | LANE_CHANGE_WITHOUT_INDICATOR, LANE_CHANGE_WITHOUT_MIRROR_CHECK |
| `sc-merge-roadworks-shift` | LANE_CHANGE_WITHOUT_INDICATOR, POOR_LANE_KEEPING |
| `sc-merge-bus-pullout` | FOLLOWING_TOO_CLOSE |
| `sc-ed-d2-priority-run` | JUNCTION_SCAN_INCOMPLETE |
| `sc-ed-d2-stop-address` | HARSH_BRAKING_NO_CAUSE (S), MOVE_OFF_WITHOUT_OBSERVATION |
| `sc-ed-reverse-line` | MOVE_OFF_WITHOUT_OBSERVATION (S) |
| `sc-ed-poligon-chain` | ENGINE_STALLED, MOVE_OFF_WITHOUT_OBSERVATION (D) |
| `sc-vu-blindspot-moto` | LANE_CHANGE_WITHOUT_INDICATOR, LANE_CHANGE_WITHOUT_MIRROR_CHECK (S) |
| `sc-vu-cyclist-group` | FOLLOWING_TOO_CLOSE, VULNERABLE_PASS_TOO_CLOSE |
| `sc-vu-child-cyclist` | VULNERABLE_PASS_TOO_CLOSE |
| `sc-rx-queue-clear` | STANDSTILL_GAP_TOO_CLOSE |
| `sc-ac-night-overdrive` | HEADLIGHTS_OFF_AT_NIGHT, SPEED_TOO_FAST_FOR_CONDITIONS |
| `sc-ac-truck-spray` | FOLLOWING_TOO_CLOSE_FOR_RAIN, HEADLIGHTS_OFF_IN_RAIN |
| `sc-ac-bridge-ice` | POOR_LANE_KEEPING (S) |
| `sc-ac-wind-truck-pass` | POOR_LANE_KEEPING (S) |
| `sc-sp-limit-end` | SPEEDING_OVER_LIMIT |
| `sc-mw-min-speed` | DRIVING_TOO_SLOW_FOR_MOTORWAY, NOT_KEEPING_RIGHT |
| `sc-sp-wet-limit-plate` | SPEEDING_OVER_LIMIT, SPEED_TOO_FAST_FOR_CONDITIONS |
| `sc-hz-emergency-stop` | POOR_LANE_KEEPING |
| `sc-hz-brake-dont-swerve` | LANE_CHANGE_WITHOUT_MIRROR_CHECK (S) |
| `sc-hz-accident-scene` | ILLEGAL_STOP_IN_BAN_ZONE (S) |
| `sc-hz-breakdown-pulloff` | HARSH_BRAKING_NO_CAUSE (S), WARNING_LAMP_IGNORED |
| `sc-fo-brakelight-chain` | FOLLOWING_TOO_CLOSE (S) |
| `sc-fo-motorway-gap` | FOLLOWING_TOO_CLOSE, FOLLOWING_TOO_CLOSE_FOR_RAIN (D) |
| `sc-vp-handbrake` | HANDBRAKE_LEFT_ON, MOVE_OFF_WITHOUT_OBSERVATION |
| `sc-vp-telltale-red` | HARSH_BRAKING_NO_CAUSE (S), WARNING_LAMP_IGNORED |
| `sc-jx-blocked-exit` | STANDSTILL_GAP_TOO_CLOSE (S) |
| `sc-merge-motorway-exit` | HARSH_BRAKING_NO_CAUSE (S), SPEED_TOO_FAST_FOR_CURVE |
| `sc-rb-ped-exit` | HARSH_BRAKING_NO_CAUSE (S) |
| `sc-sp-eco-coast` | HESITATION_AT_GREEN, STOP_LINE_OVERSHOOT (S) |
| `sc-ln-decisive-change` | LANE_CHANGE_WITHOUT_INDICATOR, LANE_CHANGE_WITHOUT_MIRROR_CHECK, POOR_LANE_KEEPING (S) |
| `sc-sign-warning` | SPEED_TOO_FAST_FOR_CONDITIONS |
| `sc-animal-hazard` | CROSSED_SOLID_LINE |
| `sc-park-zebra` | ILLEGAL_STOP_IN_BAN_ZONE |
| `sc-park-night` | HEADLIGHTS_OFF_AT_NIGHT |

**Empty (62):** sc-park-perp-rev, sc-park-parallel, sc-park-45, sc-park-narrow, sc-park-perp-forward, sc-park-parallel-exit, sc-zebra-approach, sc-junction-rhr, sc-junction-stop, sc-junction-gap, sc-junction-blind, sc-junction-left, sc-signal-dead, sc-signal-flashing, sc-signal-controller, sc-crossing-let-pass, sc-crossing-slow-crosser, sc-crossing-dart, sc-crossing-bus-shadow, sc-crossing-child-ball, sc-crossing-white-cane, sc-pe-jaywalker, sc-follow-brake, sc-ov-crossing-overtake, sc-ov-narrow, sc-mw-emergency-lane, sc-ov-oncoming-gap, sc-ov-abort, sc-vu-cyclist-hook, sc-vu-emergency, sc-vu-emergency-junction, sc-pk-smooth-stop, sc-pk-driveway, sc-maneuver-3point, sc-maneuver-uturn, sc-hazard-obstacle, sc-rx-unguarded, sc-rx-guarded, sc-rx-tram-island, sc-rx-barrier-drop, sc-jx-equal-left, sc-sig-flash-amber-ped, sc-sig-controller-live, sc-sig-controller-postures, sc-park-bay-exit-rev, sc-pe-zone-living, sc-rb-busy-gap, sc-merge-from-property, sc-ed-d2-city-run, sc-vu-bikelane-turn, sc-rx-tram-stop-doors, sc-driver-distraction, sc-accident-own-conduct, sc-lane-control-signal, sc-park-gap-short, sc-park-gap-long, sc-park-van, sc-park-45-rev, sc-park-left, sc-park-wall, sc-park-double, sc-park-judge.

## Appendix B: verdict flips (mistake tapes passing today → «Не е взет»)

Measured in revision 2 (`rev/analyse-rev.json → flipsByRung`), with the same tape lists as revision 1. `*` means the hit was also charged, which after revision 2 means **a genuine repeat**. The revision-1 `*` markers on sc-ac-truck-spray, sc-sign-warning, sc-vp-handbrake/handbrake-on, sc-sp-limit-end and sc-speed-transition were re-bills and are now uncharged.

**L3, 32 flips. Every one also flips at L1 and L2:**
- sc-ac-truck-spray/lights-off [HEADLIGHTS_OFF_IN_RAIN]
- sc-animal-hazard/cross-line [CROSSED_SOLID_LINE]
- sc-ed-d2-stop-address/no-observation, sc-ed-reverse-line/no-look [MOVE_OFF_WITHOUT_OBSERVATION]
- sc-jx-priority-confidence/phantom-brake [HARSH_BRAKING_NO_CAUSE]
- sc-lane-change/no-indicator, no-mirror
- sc-merge-bus-pullout/glue-behind [FOLLOWING_TOO_CLOSE]
- sc-merge-lane-end/no-indicator
- sc-merge-motorway-exit/brake-on-carriageway [HARSH_BRAKING_NO_CAUSE], ramp-too-fast [SPEED_TOO_FAST_FOR_CURVE]
- sc-merge-roadworks-shift/no-indicator
- sc-ov-being-overtaken/drifting-left [CENTER_LINE_TOUCHED]
- sc-ov-lane-keeping/center-line, straddle
- sc-pk-move-off/curb-glance, no-look
- sc-rb-circulate-priority/panic-brake, wandering-line
- sc-rx-tram-left/no-indicator
- sc-sign-warning/no-slowdown [SPEED_TOO_FAST_FOR_CONDITIONS]
- sc-sp-eco-coast/sleep-at-green [HESITATION_AT_GREEN]
- sc-sp-harsh-brake/phantom-stop, stab-crawl
- sc-turn-left-oncoming/no-indicator
- sc-vp-handbrake/handbrake-on [HANDBRAKE_LEFT_ON], no-observation
- sc-vp-stall/stall-once [ENGINE_STALLED], stall-repeat [ENGINE_STALLED*]
- sc-vu-blindspot-moto/no-indicator
- sc-vu-pass-clearance/fast-close, squeeze

**L2 adds 3 (so L2 = 35):**
- sc-pk-ban-stop/stop-at-edge, stop-in-zone [ILLEGAL_STOP_IN_BAN_ZONE]
- sc-vu-child-cyclist/pass-in-wobble [VULNERABLE_PASS_TOO_CLOSE]

**L1 adds 5 more (so L1 = 40):**
- sc-follow-rain-gap/gap-melts [FOLLOWING_TOO_CLOSE_FOR_RAIN]
- sc-mw-discipline/left-hog [NOT_KEEPING_RIGHT]
- sc-sig-green-wave/sprint [SPEEDING_OVER_LIMIT*, HARSH_BRAKING_NO_CAUSE]
- sc-sp-limit-end/early-accel [SPEEDING_OVER_LIMIT]
- sc-speed-transition/half-slow [SPEEDING_OVER_LIMIT]

**L5 = the L3 list minus 10 (22).** None of these lessons authors an L5 rung: sc-animal-hazard/cross-line, sc-ed-d2-stop-address/no-observation, sc-ed-reverse-line/no-look, sc-merge-motorway-exit/brake-on-carriageway and ramp-too-fast, sc-ov-being-overtaken/drifting-left, sc-rb-circulate-priority/panic-brake and wandering-line, sc-sign-warning/no-slowdown, sc-sp-eco-coast/sleep-at-green.

L1: 40 · L2: 35 · L3: 32 · L5: 22 · across 30 lessons.

---

## CRITIC GAPS: accepted / rejected

18 gaps: **18 accepted**. Two sub-claims inside accepted gaps are corrected (marked "sub-claim rejected"). The critic's replay of the revision-1 acceptance table was confirmed, then superseded by the revision-2 re-measurement (§9).

| # | Gap | Verdict | Evidence and what changed |
|---|---|---|---|
| 1 | The re-bill charges the first episode on many codes, not only belt, handbrake and lamp | **Accepted** | `rules/engine.ts:1162-1166` states the second bill exists «ONLY to reach the charge the free lesson consumed». `regrade: true` sites verified at :2549, :2755, :3380, :3776, :4290, :4420, :4538, :4717, :4748, :4909, :4974, and the guard at `lessons/engine.ts:1508`. **Change:** §3.4b(b) drops a target's re-bill. **Measured:** 135 practice drives lose it (e.g. `sc-follow-tailgater/mistake-speed-up` 1 → 0 т.). F1 narrowed to repeats; §0, §4, §9 criterion 4 re-measured. The critic's split (47 at +6 s, 24 at +10 s of 111) was not re-derived; the reviser's own count is used |
| 2 | Incidental-then-target: first-time points, no stake card | **Accepted** | Teach key is the topic (`scenarios/coach.ts:232`, `:235`). **64 of 105** target lessons share a topic with a non-target code (`rev/topic-check.json`). **Change:** own-code first teach for targets (§3.4b c), T-coach, T1d. It also fixes target-then-target: 12 drives measured. 0 incidental-then-target cases exist on tapes, so hand-built tests prove it |
| 3 | The calibration trend page is uncovered | **Accepted**, resolved by keeping calibration on the exam-reading verdict | `calibrationStore.ts:74-78`, `:113`; `calibration.ts:227-230`; trend page `:60-66`, `:114`, `:286`. **Change:** `sheetRoutePassed` stored and read (§5.9); the gate's clause is no longer suppressed; a hint and a reveal line explain the lesson status; the tile is unchanged and now literally true; the store is in lane F. `calibration.ts` and the trend page need no edit under this resolution |
| 4 | History row: «Не е взет» beside «без грешки» | **Accepted** | `page.tsx:231`, `:249`; `session-history.tsx:107`, `:130-134`. **Change:** §5.8 (`notTaken`, top title from the lesson mistake, suppression, expanded block), T11 |
| 5 | Praise on a lesson not taken | **Accepted** | `debrief.ts:1755-1765` (riders read charged mistakes only), `:1796-1810`; `SessionEndScreen.tsx:958-972`. The critic's 58-drive count (`critic-commend.cjs`) is cited, not re-run. **Change:** §5.6.7 riders read `lessonMistakes`; lane E depends on D; M13 |
| 6 | NO_QUALITY row contradicts the 1★ cap | **Accepted** | `rubric.ts:123-126`, `:553-556`. **Change:** §5.7 variant row, T10 |
| 7 | Tests that stay green with a gate removed | **Accepted** | `session-end-numbers.test.tsx:269-285` (six cases, no `lessonMistakes`); `point-scales.test.ts:87-93` does not scan `modules/sim/lessons`. **Change:** a new agreement case (§5.7); a vocabulary assertion over every `lessonMistake.ts` output with M10 (T0) |
| 8 | Roomy teach header unchanged | **Accepted** | `TeachMomentOverlay.tsx:473-476`. **Change:** `teachChipBg` and `teachSublineBg` per kind (§5.5), T6-surface |
| 9 | Abort path gives false advice | **Accepted** | `SessionEndScreen.tsx:555-556`; `debrief.ts:335`. **Change:** abort note variant (§5.2), abort debrief clause (§5.6.3), T5, T7 |
| 10 | The trust claim is refutable | **Accepted** | `wire.ts:598-620` re-titles client events; no rule re-run. **Change:** §3.5 docblock, R5 and the ADR corrected; M4 split into M4a and M4b |
| 11 | Lane order wrong | **Accepted** | Stars (`rubric.ts`) and `sessionVerdict` are lane E's. **Change:** lane C asserts `passed`, `score` and `lessonMistakes` only; star and verdict assertions moved to lane I's `lesson-mistake-integration.test.ts` (I1) |
| 12 | Titles diverge on overridden copy | **Accepted, one sub-claim rejected** | The three override-without-detail calls are verified (`rules/engine.ts:5857`, `:5882`, `:3940`; the only such calls in `modules/sim` outside tests); the pooled title is at `catalog.ts:1226`. **Change:** new lane R moves them into `PER_ACT_COPY` (§3.3b); T15; server coached-row titling left pooled so hit-free debriefs stay byte-identical (§3.5, T3). Measured: `sc-jx-giveway-b1` hits carry `give-way`. **Sub-claim rejected:** that the snow copy reaches `sc-ac-rain-lights` and `sc-ac-truck-spray`. Those are rain lessons, and their coached HEADLIGHTS_OFF_IN_RAIN carries no detail (`rev/drive-rev.json`), so the card there already printed the pooled rain title. The snow copy is moved anyway, for uniformity |
| 13 | Judge and harness readers in no lane | **Accepted** | `make-verdicts2.mjs:335-400` (three-pill brief), `stale-claims.mjs:99-106` (literal ИЗДЪРЖАН), `inprocess-drive.mjs:1418` (binary verdict). **Change:** added to lane H with T13 |
| 14 | Learner model, theory links and replay ignore the mistake | **Accepted** | `actions.ts:417-437` (charged events plus commendations), `modules/learning/store.ts:114-133`, `debrief.ts:1127`, `:1186`, `actions.ts:303-312`, `:472`, `SessionEndScreen.tsx:1775-1785`, `review/my-drive/[simSessionId]/page.tsx:66-70`. **Change:** theory chip and focus for the hit's concept (§5.6.9, lanes D and F, T7, T14); the learner model, reel and CLEAN_DRIVING XP stated as deliberately unchanged follow-ups in the ADR (§5.11, §11.1) |
| 15 | Server persistence untested | **Accepted** | `app/(dashboard)/simulator/__tests__/finish-pool-timeout.test.ts` exists. **Change:** T14 in lane F |
| 16 | The rule is never stated before the drive | **Accepted** | `compile.ts:384-405` (THEO-4: unstated threshold = bare verdict). **Change:** `lessonMistakeRuleBg`, a briefing line (§5.10), T16, conditional founder question F3 for fit |
| 17 | Phone-fit rig and evidence files have no owner | **Accepted** | `app/dev/popup-rig/popup-rig-client.tsx:194`, `:207`, `:234`, `:449` (and a literal «Неиздържан» at `:488`). **Change:** new lane P. Lane B commits a fixture generated by the implementation (empty diff against `targets-final.json` shown in the PR); lane C inlines the probe script; lane H types the expected census from §9 |
| 18 | Process gaps | **Accepted** | Decision standard (the user's memory file, "five questions"); doc 61:24-44 (claim, branch, gate, FP battery and exam-bank bot for rules changes); `git --no-optional-locks status` shows **11 modified and 5 untracked**. **Change:** §11.1 five questions plus retention, §7 process block, R9 and the header updated |

**Also re-verified while revising** (no critic gap, recorded so the next reader does not re-open them):
- Every one of the 38 target codes resolves to `teach-first-then-grade`, 0 `always-grade` (`rev/topic-check.json`), which makes "first occurrence always taught" complete (T8e).
- 0 of 693 hits in the revised census are charged without an earlier coached occurrence (§9 criterion 4c).
- L4 (488) and shadow (808) drives are identical to the baseline on `passed`, stars, points, fault codes and coached codes after all three revision-2 mechanism changes.

---

## FOUNDER ANSWERS (2026-09-17, in chat — binding; supersede §13 defaults where they differ)

- **F1: repeats cost points as today.** A genuine repeat of a target code (a new episode after the lesson-mistake card) is graded
  exactly as today (×1.5/×2 training ladder). The first occurrence stays taught and free (§3.4b b/c unchanged).
- **F2: scenario lessons only.** Curriculum lessons l0–l8, exam-bank variants and the exam card are out of scope; they never carry
  `lessonMistakeTargets`.
- **F3:** still conditional (only asked if the §5.10 rule line does not fit the phone briefing).
