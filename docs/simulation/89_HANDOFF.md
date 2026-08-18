# HANDOFF — read this first, then continue

> Written 2026-08-18, at the end of the session that ran the full 161-lesson
> catalogue audit. The founder is switching to a second Anthropic account because
> the first is at ~95 % of its weekly limit. **Nothing about the work changes.**
> `~/.claude` belongs to the Windows user, not the account, so memory, recaps,
> hooks and every transcript survive the switch untouched.
>
> **You are continuing a conversation, not starting a project.** The founder and
> the assistant will swap between two accounts for a while. Behave as though the
> previous session never ended.

---

## 0 · THE ONE-LINE STATE

`HEAD = 2f5ce8f`, pushed to `origin/scenario-engine`, **and the tree is RED on
purpose** — 22 tests in 6 files. Two are standing content debt only the founder
can clear; **four are this wave's own cross-lane collisions and are your first
job.** See §3.

---

## 1 · WHAT JUST HAPPENED, IN ORDER

1. Every one of the **161 catalogue lessons was driven** — right and wrong, on
   mobile (WebKit, iPhone 16 landscape, real safe-area insets) and PC (Chromium
   1440×900). **16,649 frames across 174 lesson folders.**
2. Each was judged **from its own frames**, not from metrics. 1,712 finding rows,
   **1,012 standing BROKEN** (318 critical) across 137 suspect files, plus 512
   UNPOLISHED which are the founder's to rule on and which nobody may "fix".
3. Two six-lane repair waves closed **7 findings of 1,012.** That arithmetic —
   six lanes against 137 files is 145 waves — forced the change to **one lane per
   file**.
4. The 83-lane wave launched (one per file carrying a critical). **124 agents
   started, 51 returned, 69 were killed by `API Error: 529 Overloaded`** — a
   platform incident Anthropic confirmed on status.claude.com at 16:20 and 17:12
   UTC ("elevated errors on requests to Claude Opus 5"). The 529s ran 1–5 per
   minute from 16:45 to 17:13+.
5. A lane whose **fix** died never spawned its **refuter** (the pipeline drops the
   item and skips later stages). That is why the refute count is 46 and not 83 —
   those refuters were never created, not failed.

---

## 2 · WHERE EVERYTHING LIVES (none of it is session-scoped)

| what | where |
|---|---|
| frames | `E:\AI driver\.audit-frames\sweep161\<lesson>\<platform>-<mode>\*.png` |
| findings | `E:\AI driver\.audit-frames\findings\*.jsonl` — one JSON per line |
| the 83-lane plan | `E:\AI driver\.audit-frames\lanes-crit.json` |
| the ledger | `docs/simulation/88_LESSON_AUDIT.md` (6,007 lines) |
| the founder register | `docs/simulation/87_FOUNDER_ITEM_REGISTER.md` |
| the drive harness | `tools/mobile/lesson-audit.mjs` |
| workflow scripts | `~/.claude/projects/E--AI-driver/workflows/scripts/*.js` |
| this session's transcript | `~/.claude/projects/E--AI-driver/8942546c-780e-450f-ae95-3aa94e28222a.jsonl` |

`.audit-frames/` is gitignored on purpose — 10 GB of evidence, not source.

**Recompute the finding counts** (the ledger states this rule; there is no
`build.js`, a previous claim to the contrary was false and is corrected): read
every `.jsonl`; a lesson re-driven in `chunk-redrive.jsonl` has its OLDER records
superseded by the re-drive's own. That yields 1,686 standing records.

---

## 3 · FIRST JOB — the four cross-lane collisions

83 concurrent lanes collided: one lane's fixture encodes what another lane
changed. Predicted, and it happened.

```
b58-gate-never-over-posted.test.ts   (2 tests) advisor card vs posted limit
s-w8-bot-completion.test.ts          sc-hz-accident-scene L3 squeeze
signals-sweep161.test.ts             sc-sflash-conflict carDist vs authored offset
```

Not blockers, and NOT yours to "fix" by deleting: `content-bank.test.ts`
(`ptp-i-parva-pomosht` 31/64 against a 50 % floor) and `compose.test.ts`
(`l-accidents-first-aid` has no quiz beat). **Only the founder can sign content.**

---

## 4 · SECOND JOB — resume the 37 dead lanes

Do **not** re-run all 83. The workflow script is
`~/.claude/projects/E--AI-driver/workflows/scripts/knijka-all-lanes.js` and takes
the lane array as `args` (`E:\AI driver\.audit-frames\lanes-crit.json`).

`resumeFromRunId: 'wf_f767146c-f48'` replays completed agents from cache **only
inside the session that made them**. Across accounts that cache is gone, so
**re-launch fresh with the lanes that did not complete**, which you can derive by
comparing `lanes-crit.json` against the lanes whose fixes are visible in
`git log`/the diff.

Then keep chaining until the open list is empty. The founder's standing
instruction, verbatim: *"Fix absolutely everything ... queue back to back to back
automatically ... do not come to me for checkpoints."*

---

## 5 · THE RULES THAT WERE PAID FOR IN BLOOD

Do not relearn these.

- **THE FRAME WINS.** Every "0 defects" report in this project was an instrument
  bug. Probes that lied, all in the reassuring direction: `scrollWidth` only
  (blind to vertical clipping); a parser anchored on `/id:/` that matched nested
  objective ids; a speed probe reading the **limit sign** instead of the
  speedometer; a device profile for an iPhone 16 **base** when the founder is on
  a **Pro**; a whole rig ladder that only ran at `visualViewport.scale === 1`; a
  verdict regex matching «точк» inside «изпитни т.» on a teach card. **Every probe
  must self-check against a case verified by eye and exit non-zero if it misses
  it.**
- **A FALSE REFUSAL IS AS BAD AS A FALSE CERTIFICATE.** The founder's own
  complaint is a false failure ("I signalled my roundabout exit correctly and it
  failed me"). Never answer a missing credit by loosening a check until it
  credits everybody. Prove **both** directions, always.
- **CREDIT IS READ OFF THE DEBRIEF**, never the task chip (it goes `2/2 → null`
  on session end whether or not anything ticked) and never a toast.
- **NEVER pipe `tsc` or `vitest` through `tail`/`echo`/`head`** — you read the
  pipe's exit code. A red suite was reported here as `EXIT:0` that way.
- `--maxWorkers=4` yields phantom failures on this 8-CPU box; use `2`.
- **PC leg must run on the real GPU**: `--use-angle=d3d11`. Without it Chromium
  falls back to SwiftShader, a control tick costs 3.3 s instead of 3 ms, and the
  same drive returns passed/failed/collision across three runs.
- **The reference lesson** is `sc-zebra-approach`: driven right → **ИЗДЪРЖАН, 0
  точки, 3★**; driven wrong at ~59 км/ч → **НЕИЗДЪРЖАН, 20 точки**, «Твърде бързо
  приближаване» −10 and «Непропускане на пешеходец» −10. If that ever breaks,
  something upstream is wrong.

---

## 6 · THE BIGGEST THINGS STILL BROKEN

- **A regression this work created:** closing the collision-reopen duplication
  made the latch **global, not per-actor** — a pedestrian struck 30 s after a car
  crash is now **unbilled** (2 bills before, 1 after). It replaced something
  worse (one contact charging 130–140 точки against an allowance of 9), but it is
  first in `rules/engine.ts`'s lane.
- **The brake key never reaches the sim on mobile** — fired on 20 of 22 lessons,
  never on PC. This is the mechanism behind lessons that pass on a computer and
  fail on a phone.
- **Eleven lessons nobody can pass** on either platform in either direction: all
  four roundabouts, `sc-signal-dead`, the four parking-depth rows,
  `sc-ov-solid-return`, `sc-ln-boulevard-discipline`.
- **Two lessons that convict nothing**: `sc-signal-hesitation` and
  `sc-sig-controller-postures` give 0 точки and 0 mistakes to a 59 км/ч
  blast-through.
- **Eight tests that guard nothing**, proven by mutation — killing
  TouchControls' axis-watchdog outright leaves 867 tests green, because the
  guards assert against comment-stripped **source text**.

---

## 7 · FOR THE FOUNDER ONLY

The content gate is red and no agent may touch it: **0 of 1,089 questions are
human-signed**, while **796 marked "approved" are being served to students
today**, and `ptp-i-parva-pomosht` sits at 31/64 against a 50 % floor. This is a
signature problem, not a code problem.

Blocked on his Blender machine: register rows **B52** and the *bodies* half of
**B60**.

And the **UNPOLISHED** bucket — 512 findings, empty pavements, repeated
buildings, flat sky — is his ruling to make. Nobody spends a wave on it until he
does.
