# 88 — Resume after the usage limit

> Written 2026-07-31 while a 5-hour usage limit was about to pause everything mid-wave.
> **Read this first in the next session.** Everything needed to continue is here; nothing is lost.

---

## 1. The one command that matters

A wave was running when the limit hit. Resume it — **agents that already finished replay from
cache instantly, and only the unfinished ones re-run**:

```bash
Workflow({
  scriptPath: "C:\\Users\\Ljh\\.claude\\projects\\E--AI-driver-platform\\8942546c-780e-450f-ae95-3aa94e28222a\\workflows\\scripts\\knijka-finish-the-founder-list-wf_743fed73-e45.js",
  resumeFromRunId: "wf_743fed73-e45"
})
```

⚠️ **The script path is under `E--AI-driver-platform`, not `E--AI-driver`.** That is not a typo and
it is not where you would guess. The transcript directory is under `E--AI-driver`; the script is not.
Verified by hand before writing this.

**Before resuming**, check whether the run is still alive — if it is, do not start a second copy:

```bash
node -e "const f='C:/Users/Ljh/.claude/projects/E--AI-driver/8942546c-780e-450f-ae95-3aa94e28222a/subagents/workflows/wf_743fed73-e45/journal.jsonl';const fs=require('fs');console.log('agent results so far:',fs.readFileSync(f,'utf8').split('\n').filter(l=>l.includes('\"type\":\"result\"')).length,'of 13')"
```

At the moment of the snapshot: **2 of 13**.

---

## 2. State of the tree

| | |
|---|---|
| branch | `scenario-engine` (also the integration branch) |
| last **gated** commit | `93f76c7` — tsc 0 · 634 files · 9,559 tests · 0 failed |
| last commit | `1376e7f` — **WIP SNAPSHOT, NOT GATED** |
| pushed | `93f76c7` to `origin` + `vps`. **`1376e7f` was NOT pushed** — it is a local safety net only. |

`1376e7f` is 235 files of mid-flight agent work committed purely so a usage limit could not lose it.
**tsc and the suite were never run against it.** Do not build on it as though it were good; let the
wave's own close-out phase gate and re-commit.

If the resumed wave turns out to have left the tree in a worse state than it found it, the clean
fallback is:

```bash
git reset --hard 93f76c7
```

…and re-run the wave from scratch. Nothing before `93f76c7` is at risk.

---

## 3. What the paused wave was doing

**`wf_743fed73-e45` — "finish the founder list".** Launched after the founder said, correctly, that
we had not finished and had softened his asks. Five phases:

1. **Requirements** — read `150 verdict hand written most important.txt` word by word and extract
   every *"we must / we need / find solution"* sentence as a **build specification**, not a symptom.
   This is the step that had never been done.
2. **Build** — six lanes: Q/E rear windows · the roundabout becoming an actual circle · ten real
   parking variants · the mouse-only pre-drive · school + children + plural pedestrians + В1 faces ·
   the engine/progression defects.
3. **Reach56** — five sweeps rendering every register row that has never been rendered.
4. **P0P7** — the same word-by-word revision of the mobile wave, which the founder predicted would
   also be unfinished.
5. **Close** — gate, update doc 87, count it honestly.

**Half-done work visible in the snapshot:** `app/dev/scene-still/roundaboutIsland.ts` and its test
are **deleted**. That is the roundabout lane doing what it was told — porting the island derivation
into `modules/sim/world/builders/`. **If the ported version is not there, the port is half-finished
and is the first thing to check on resume.**

---

## 4. Where the truth lives

| document | what it holds |
|---|---|
| `docs/simulation/87_FOUNDER_ITEM_REGISTER.md` | **All 107 of his findings**, one row each, in his order and his words, each with a verdict and a frame path. The register is the acceptance test. |
| `docs/simulation/86_FOUNDER_REVIEW_150_LEDGER.md` | The 58 deduplicated **causes**, the 15-lane fix plan, §7 the six observations that are refuted with evidence, §12.5 what to replay. |
| `platform/src/modules/sim/world/__tests__/expected-failures.json` | The gate's committed baseline — per-class counts, the falsehood budget with owners, allowlist (currently **0** entries). |

Counts as of the pause: **25 FIXED-SEEN · 21 PARTIAL · 3 BROKEN · 2 NOT-A-DEFECT · 56 UNVERIFIABLE.**

---

## 5. The standing corrections — do not re-make these mistakes

- **"We must" is a specification, not a preference.** The founder caught two rows where an explicit
  requirement was rewritten into something easier: Q/E rear windows marked FIXED because a *centre*
  mirror exists, and "ten parking variants" marked NOT-A-DEFECT by counting four non-parking drills.
  If you catch yourself writing *"arguably"*, *"effectively"*, or *"what he actually asked for is
  delivered"* — stop.
- **The roundabout is not done.** His words: *"a Round a bout is a Cyrcle, it has sphere shape not a
  triangle or square shape in any kind."* The count of rings was refuted; the **shape was never
  fixed**. Do not let the refuted half make the whole thing read as closed.
- **Signs and traffic lights DO exist** — synthesised at build time by `props.ts`, pinned by tests.
  Reading the district schema and concluding otherwise was a real error that nearly sent a wave to
  build the wrong thing.
- **The box is slow, not a blocker.** The founder has said explicitly: *"we have enough time we are
  not in a hurry in anyway."* 56 rows went unrendered and not one failed for a product reason. Use
  `tools/clips/headless/clip-rig.mjs` on :3200 — deterministic, ~6 min, no login.
- **Two ways verification lies:** a stale `.next-*` scratch dir injects phantom tsc errors (guarded
  now by `src/lib/tsconfigHygiene.test.ts`), and `[vitest-pool]: Failed to start forks worker` is
  memory pressure rather than a test failure. Both are written up in `platform/AGENTS.md`.

---

## 6. Housekeeping that pays for itself

- Agents leave `.next-<lane>` scratch dirs at 0.2–1.1 GB each. Thirteen idle ones were 5.83 GB.
  Delete them when a wave ends; **never** add a tsconfig glob for one.
- An interrupted agent can leave `.git/index.lock`. If no `git` process is alive and the lock is
  older than a minute, it is stale and safe to remove — that happened during this very snapshot.
- `prisma dev`'s journal grows without bound: `node tools/ops/disk-guard.mjs` reports it,
  `--purge` reclaims it safely. It hit **25.6 GB** once and took `C:` to 1.6 GB free.

---

## 7. Owed to the founder the moment work resumes

He asked for a full per-item account and got headlines instead. He now has the register and the
artifact. What is still owed:

1. **Finish the wave** and give him the count per requirement — built / not built, no softening.
2. **The P0–P7 revision he predicted.** He said he believes the same gaps exist there. He has been
   right twice.
3. **The honest answer about the first wave**, which is: it closed 45 of 58 causes and drove
   convicting falsehoods from 1,090 rung-codes to 113 — real structural work — but it worked from a
   deduplicated cause list rather than his 92 sentences, and it verified itself with tests rather
   than eyes. That is why the revision found so much.
