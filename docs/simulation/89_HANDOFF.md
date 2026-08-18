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

---

## 8 · THE AUTO-QUEUE — computed, not left to be derived

The founder's standing instruction is that waves chain **without asking him**.
This is the chain. Each stage launches the moment the previous one gates.

**Files are already on disk — do not recompute them:**

| file | what it holds |
|---|---|
| `E:\AI driver\.audit-frames\lanes-crit.json` | all 83 critical-bearing lanes |
| `E:\AI driver\.audit-frames\lanes-remaining.json` | **the 34 that still need running** |
| `~/.claude/projects/E--AI-driver/workflows/scripts/knijka-all-lanes.js` | the lane workflow; takes the array as `args` |

### WAVE A — the 34 lanes the outage killed  ← START HERE

**49 of 83 fix lanes completed** before the 529 band; 34 did not.
**133 findings, 35 critical.** Launch `knijka-all-lanes.js` with the contents of
`lanes-remaining.json` as `args`.

Do **not** pass all 83 again — the 49 that finished have already written their
changes into the tree (they are in commit `2f5ce8f`), and re-running them would
undo or duplicate that work.

The heaviest rows in the remainder: `hud/SimOverlay.tsx` (1 critical but **60
findings**, the largest single file in the corpus), `modules/sim/rules` (2c/5),
`tools/mobile/lib/auth.mjs` (1c/5 — this is the **login rate-limiter** that made
22 lessons look broken; worth doing early so no future sweep loses legs to it).

### WAVE B — the 54 files with findings but no criticals

`lanes-crit.json` is the 83 files carrying at least one critical. The corpus has
**137 suspect files**, so ~54 remain with major/minor findings only. Derive them
by recomputing from `.audit-frames\findings\*.jsonl` and subtracting the 83.
Same workflow, same rules.

### WAVE C — verify and close

Re-drive every lesson that had a BROKEN finding closed in waves A/B, read the
**debrief**, and confirm it is actually gone. Then update
`docs/simulation/88_LESSON_AUDIT.md`'s open list.

### THE LOOP CONDITION

Keep chaining until **the open list is empty** *and* `sc-zebra-approach` still
passes both directions on both platforms. Report to the founder only when that
holds, or when something genuinely cannot be fixed — named, with the reason.

**Concurrency reality:** this box is 8 CPUs / 16 GB, so the workflow cap is **6
concurrent agents** regardless of how many lanes are queued. 34 lanes ≈ 6 hours.
That is the price of finishing; do not shrink the lane count to make the number
look better — that mistake cost two waves and closed 7 findings out of 1,012.

---

## 9 · CORRECTIONS — the final gate contradicted two things I told the founder

Both are recorded because trusting the earlier numbers would waste the next session's time.

### 9.1 The red is 20 new failures, not 4

Commit `2f5ce8f`'s message names four. **There are twenty**, and the whole of
`world/builders/__tests__/markings-paint-truth.test.ts` (15) went unnamed — a
bigger red surface than every named row combined. The gate split them by
`git cat-file -e 730da10:<file>`, and the split matters because the two classes
mean different things:

**3 are TRUE REGRESSIONS** (green before wave 3, in pre-existing files):

- `b58-gate-never-over-posted.test.ts` ×2 — **collision, no product defect.** A
  later lane rewrote `lessons/advisor.ts` with `spokenCapKmh`, which is *stronger*:
  a card may print a number only from the halt band, the authored title, or a
  binding sign — otherwise **no number at all** (494 of 953 cards). B58's survey
  regex then matches nothing, `Number(undefined)` is `NaN`, and `!(NaN <= posted)`
  books every numberless card as an offender. **Fix B58's two rows to the newer
  contract.**
- `s-w8-bot-completion.test.ts` — **judge on the engine, not the test.**
  `sc-hz-accident-scene` L3 now scores `["COLLISION","COLLISION"]` against a
  pinned `["COLLISION"]`. That is precisely the defect C3 claims to have closed
  (one continuous shunt billed as many accidents); a wave-3 `rules/engine.ts`
  lane moved the boundary C3 installed.
- `signals-sweep161.test.ts` ×2 — **also a real finding.** `stageActor` returns
  `carDistM` **90** where two independent districts author **95**. Two maps
  clamping to the same wrong number means a placement clamp changed in
  `traffic/staged.ts`.

**17 ARRIVED RED — a lane shipped a test file it never ran.** Of the 15 in
`markings-paint-truth.test.ts`: 3 die inside `world/builders/network.ts:415`
because `assertDistrict` (`world/types.ts:320`) **never checks `intersections` or
`roundabouts`** although `District` declares both required and `analyzeNetwork`
dereferences both unguarded — a validator returning a `District` it never
validated. 8 are the instrument, not the paint: `clusterAlongS(centre,
DASH_LENGTH_M / 2)` puts a dash quad's corners 5.0 m apart against a 2.5 m
threshold, so **every dash counts twice** (16 for 8, 46 for 23, exactly).

### 9.2 The remaining-lane count: mine said 34, the gate says 39

I derived 34 from agent transcripts (a lane "done" if it returned without a 529).
The gate derived **39 never landed, carrying 177 findings / 91 critical** — from
files actually **written**, which is the stronger test: a lane can return cleanly
and still have changed nothing.

**Trust the gate's method, and re-derive before launching Wave A.** Its list
includes `lessons/objectives.ts` (51 findings / 32 critical) and
`lessons/finish.ts` (22 / 13) — two of the largest lanes in the corpus, which my
`lanes-remaining.json` does **not** contain. Take the union of both lists, or
recompute from the diff.

Coverage across all three waves, recomputed over the frozen corpus:

| | files | BROKEN | critical |
|---|---:|---:|---:|
| ever opened | **53** | 765 | 272 |
| never opened | **85** | 247 | 46 |

### 9.3 Ten things wave 3's lanes said they could not close (doc 88 §2.6)

Three are *classes* covering **16 lessons**, each a green tick for a skill never
measured: **O2** eight gates certifying another road user's behaviour a disc
cannot witness · **O3** three lamp gates where the night/lamp channel reaches
neither grader · **O5** five crossing gates capping above чл. 119's 30 км/ч.
Four are typed `KNOWN_OPEN` arrays whose staleness is self-asserting.

---

## 10 · WHERE THIS IS GOING — read before you decide anything

Everything above is tactics. This is the part that tells you when to stop, and
what to refuse.

### The product

**Книжка.AI** — a Bulgarian driving academy for 17–18-year-olds. Two halves that
must eventually be one: a **theory** side (1,089 questions, official exam format —
45 questions / 97 points / ≥87 to pass / 40 minutes / 1-2-3 weights) and a
**browser simulator** (161 lessons on real Sofia street topology). B2C, Bulgaria
first, EUR only.

### The test every decision passes or fails

From `CLAUDE.md`, founder-ratified, and it is not decoration:

> **Does this produce safer, more competent real drivers?**

And its sharpest corollary, **THEO-4 requirement zero**: the product is a *virtual
driving instructor that explains every decision*. **No bare correct/wrong verdicts,
anywhere, ever.**

That is why this entire audit exists. A lesson that hands out a green tick for a
skill it never measured is not a cosmetic bug — it teaches a seventeen-year-old
that something they did wrong was right, and then puts them on a real road. The
founder's own complaint is the mirror image: he signalled a roundabout exit
correctly and the engine failed him. **Both directions are the same crime.** When
you are choosing between a fix that is convenient and one that is true, that is
the tiebreak.

### What "done" means, at three scales

1. **This audit** — the open list in `88_LESSON_AUDIT.md` is empty, and
   `sc-zebra-approach` still passes both directions on both platforms. 1,012
   findings standing, 85 files never opened. **You are perhaps a third of the way.**
2. **The simulator** — every one of the 161 lessons can be passed by driving it
   correctly and fails you when you drive it badly, on a phone and on a PC. Today
   eleven lessons cannot be passed by anyone, and two cannot fail anyone.
3. **The product** — a 17-year-old can learn the theory, practise the exam in its
   real format, and drive the lessons, and comes out a safer driver than the
   textbook alone would produce. See `docs/00_PRODUCT_MAP.md` (injected on every
   session start) for the full component checklist and status; it is the net that
   catches forgotten pieces.

### What you may not decide alone

- **Content signatures.** 0 of 1,089 questions are human-signed while 796 marked
  "approved" are served today. Only the founder signs content. Never flip a
  `status` field to make a gate go green.
- **The 512 UNPOLISHED findings** — empty pavements, repeated buildings, flat sky.
  His taste, his call. Ledger them with frames; do not spend a wave on them.
- **Strategy and architecture** — `CLAUDE.md`: changes there get an **ADR first**.
  ADR-001 fictional vehicles, ADR-002 the AI never free-recalls Bulgarian law
  (retrieval + citation only), ADR-005 browser-first.

### And when he switches back

He alternates between two accounts. **Write a dated recap to
`~/.claude/recaps/AI driver/` before the hand-back**, the same way this one was
written — the hook injects the newest one automatically, and it is the only thing
that carries your reasoning across. Commit and push everything first: the working
tree does not travel, git does.
