# Founder-only items — ONE sitting (rewritten 2026-08-27)

Every item here is blocked on a decision or a signature only the founder can give.
None can be unblocked by more engineering — each was reached by a repair lane that
stopped rather than invent a law, a producer, or a signature. They are ordered by
what they cost a student.

---

## 0. ✅ THE DATABASE NOW HAS A BACKUP — resolved 2026-08-28, but read the last paragraph

**What was found:** there were **no database backups at all.** Not on this machine,
not on the VPS. `/var/backups/knijka` did not exist, no `*.dump` existed anywhere on
the server, and the crontab held two jobs — both for nexflow. Every student record
and content revision living in the database was one hardware failure from gone.

Two bugs had kept it invisible, and both fail in the reassuring direction:

- `pull-backups.sh` defaulted to `$HOME/knijka-backups` — **C:**, 12.9 GB free —
  while the project lives on **E:** with 669 GB. You caught this one: *"we keep E
  drive… we must always have local copy in E."* I had even used "C: is full" as the
  reason not to run it.
- `knijka.cron` named `/opt/knijka/backup-db.sh`; the script is at
  `/opt/knijka/tools/deploy/backup-db.sh`. Installed exactly as written, cron would
  have run a nonexistent file every night for ever — and a backup job that fails
  silently is indistinguishable from one that works, until the day you need a dump.

**What now exists:**

- A verified dump on the VPS and a checksum-verified copy at **`E:/knijka-backups`**
  (548 K, 20 tables).
- **`knijka-backup.timer`**, daily at 03:15 UTC — installed *and proved* by running
  the service, not just enabling it: `Result=success`, dump written, verified,
  retention applied.
- I deliberately did **not** install the cron file's autodeploy line: autodeploy
  already runs from a systemd timer, and cron would have deployed twice.
- `pull-backups.sh` now defaults beside the checkout, so it lands on E: here and on
  the correct volume on the second developer's box.

**THREE THINGS STILL YOURS, and none is a formality:**

1. ~~The restore drill has never been run.~~ **RUN 2026-08-29 — and it FAILED,
   which is what drills are for.** The documented command died with Permission
   denied: the backup dir is deliberately 0700 root-only (ADR-004) and pg_restore
   runs as postgres. The dump itself was fine — 20 tables and the User rows came
   back once root piped the file to postgres on stdin. Corrected commands are
   committed in tools/deploy/README.md (commit 7725e6c). Nothing is left for you
   in this item; 2 and 3 below remain. (Original text kept for the record:)** The script's own reminder is right: *a
   dump that has never been restored is a belief, not a plan.* Four commands, in
   `tools/deploy/README.md`. Until one dump has been read back, the recovery
   position is zero rather than "backed up".
2. **This protects against losing the VPS, not against losing E:** — repo and backup
   share one disk. A third copy off this machine is still owed.
3. **The pull is still manual on this box.** Automating it means a Windows scheduled
   task, which is persistent configuration on your machine, so I have not created
   one. Say the word.

## 1. SIGN THE 29 FIRST-AID QUESTIONS — unblocks the only two red tests

**Status:** all 29 sit at `needs-review`. They were `approved` and were deliberately
moved back.

**Why they moved:** every one cited ЗДвП чл. 123 and nothing else. Чл. 123, retrieved
verbatim from `content/law/acts/zdvp.json` (ДВ бр. 55/16.06.2026), contains no
compression depth, no rate, no breathing check and no ratio — it is the duty to stop
and assist. The citation was not thin, it was **decorative**.

**What was done:** first aid is medical, not legal, so the right sources were fetched —
European Resuscitation Council Guidelines 2021: Basic Life Support (Resuscitation
2021;161:98-114, doi 10.1016/j.resuscitation.2021.02.009), full text extracted.

**Rows:** q-ptp-013..022, q-ptp-033..042, q-ptp-056..064.
**Unblocks:** `content-bank` "has no dark, threadbare or under-represented topic" and
`compose` "gives every lesson at least one quiz beat" — the ONLY two red tests in a
suite of 16,444. Also `content/lessons/l-accidents-first-aid.json` is still `draft`.
**Decision:** sign, or name what else you want checked first.

## 2. THREE QUESTIONS WITH UNCONFIRMED LEGAL CITATIONS

`needs-review` with an explicit `[REVIEW]` marker. The ANSWER is sound in each case;
only the citation is uncertain, and ADR-002 forbids shipping an unconfirmed citation
as fact.

- **q-ptp-032** — vest obligation, ref «чл. 139?» unconfirmed.
- **q-ptp-050** — insurer-notification deadline, «Кодекс за застраховането ?», 7-day figure unconfirmed.
- **q-ptp-052** — sanction for leaving a material-only ПТП, «чл. 175?», penalty/точки unconfirmed.

**Decision:** confirm the references, or approve with the citation softened.

## 3. A NEW OFFENCE CODE NEEDS YOUR lawRef — «left the carriageway»

**Why it is yours:** the simulator currently convicts a student of «Движение в обратна
посока по еднопосочна улица» (10 points, опасна) **while the car is off the road
entirely**. `worldRuntime.ts:1961` computes `wrongWay` from the nearest-centreline fix
on a 30 m lock even when `offCarriageway` is already true. Proof:
`w13/frames/sc-ed-d2-city-run__pc-right/04-t095s.png` — 14 км/ч, nose-first into a
building face, no carriageway in the windscreen, four seconds before the third such
conviction.

The lane refused to silence the flag, because `worldRuntime`'s own header rules that
doing so «trades a wrong charge for NO charge». The right repair bills the REAL fault —
leaving the carriageway — which needs **a new catalogue code and a founder-signed
lawRef**. Nothing ships until you name the article.

**Related and also yours:** the world has **137 one-way edges of 283** in `d2-v1.json`,
and the builder draws **no В1/В2 sign and no М10 arrow on any of the 125 ordinary
streets**. A student is convicted under a rule the world never showed him. Fixing the
signs is engineering; deciding whether the rule may fire at all before they exist is not.

## 4. THE 163 UNJUDGED — the question, with its premise corrected 2026-08-28

**THE NUMBER THIS ITEM USED TO REST ON WAS WRONG, AND I AM THE ONE WHO CARRIED IT.**
This item previously said *"the harness is ~13% deterministic (measured, not
estimated)"* and recommended accepting 163 rows as unmeasurable on that basis.
The 13% is real, but it is not a determinism rate. **It is the PASS rate of one
lesson**: `sc-ln-obstacle-meeting__pc-right`, driven eight times at commit
`641a4475`, returned 6× НЕИЗДЪРЖАН · 1× ИЗДЪРЖАН · 1× НЕЗАВЪРШЕН. One pass in
eight is 12.5%. That got written down as "13% deterministic" and has been repeated
in four places since, including twice in the handoff.

**What the corpus actually contains, measured across all 78 frame directories and
3,146 drives:**

- 794 groups look like the same (lesson, leg, commit) driven more than once.
- **787 of them are byte-identical status files** — the same drive copied into
  both a `fill-*` shard directory and its `w*` round directory by
  `wave-c-merge --copy`. They are one drive counted twice and prove nothing.
  (I nearly reported "99.87% verdict-stable" off that number before checking the
  hashes. That is the reassuring direction, again.)
- **Genuinely distinct repeat drives in the entire corpus: 20, in 7 groups, across
  3 lessons.** Six groups agree (2 runs each, all ИЗДЪРЖАН). One differs — the
  eight-run `sc-ln-obstacle-meeting` above.

So the honest statement is: **the harness's determinism has never been measured.**
Not "it is 13%", not "it is 99%". One lesson is demonstrably flaky at 6-of-8 modal
agreement; three lessons in total have ever been driven twice at one commit.

**AND THE RECOMMENDATION CHANGES, because the diagnosis was wrong.** The 163 rows
are mostly not blocked by *flake*. They are blocked by *capability* — things the
harness structurally cannot do, each now traced to specific lines:

- **`-wrong` legs cannot steer.** `lesson-audit.mjs:3794` starts them in a phase
  called `"flat"` that has no branch in the tick loop, and `guideTick` — the only
  caller of `steer()` — runs only under `phase === "roll"`. 0 of 43 wrong legs
  steer, by construction. Spec written:
  `.audit-frames/patches/wave8/SPEC-wrong-leg-steering.md`.
- **The harness cannot drive a manual.** No clutch key, no gear key, so
  `sc-vp-stall`'s four criticals can never be settled.
- **The harness cannot drive a motorway.** Best speed ever reached on a 140-cap
  lesson is 45–52 км/ч, and the median `-right` drive makes 17 full stops.

**Those are engineering, not a ruling.** They do not need you.

**WHAT I AM ACTUALLY ASKING YOU, now that the premise is fixed** — one question,
and it is cheap either way:

> Spend one sweep's worth of machine time measuring determinism properly —
> ~10 lessons × 5 runs each at a single commit, ~50 drives — before deciding
> anything about the 163?

If the answer comes back stable, most of those rows can be judged from single
drives and the bucket collapses. If it comes back flaky, rate mode is justified by
a number instead of by an anecdote. Today the choice between "accept and ship",
"build rate mode" and "sample" is being made on a figure that means something else,
and that is the one situation where waiting is cheaper than deciding.

**(a) run the 50-drive determinism sweep first · (b) accept and ship regardless ·
(c) build rate mode regardless.**

---

### ⬆ UPDATE 2026-08-28, later the same day — IT HAS NOW BEEN MEASURED, AND THE FIX IS NOT RATE MODE

The item above says determinism "has never been measured". Today's own runs measured
it by accident, and the result changes what to build.

**Same lesson, same leg, same platform, same commit `32505eb5`, four minutes apart:**

| run | verdict | score | frames | duration |
|---|---|---|---|---|
| 07:25 canary | НЕИЗДЪРЖАН | **31** | 32 | 205 s |
| 07:29 sweep | НЕЗАВЪРШЕН | **1** | 19 | 115 s |

A second pair at commit `ea62d4f7`, 4.5 minutes apart, gave 2 and 1. So yes — the
harness is variable, and a single drive's score is not a property of the product.

**But look at the last two columns, because they say what KIND of variance it is.**
The run that scored 31 drove for 205 s and 32 frames; the one that scored 1 drove
for 115 s and 19 frames. **The score tracks how far the car got.** A verifier
reached the same conclusion from the other end — *"score in this family tracks
duration"* — and used it to overturn a retirement that rested on comparing two
drives of different lengths.

**That is not grading noise. It is variable EXPOSURE**, and it means the earlier
recommendation was pointed at the wrong repair:

- **Rate mode — drive N times, judge the rate — would be measuring the wrong
  thing.** It would faithfully record the distribution of how far the harness
  happens to get, and call that a property of the lesson. Five drives of a car
  that travels a different distance each time is five different experiments.
- **The cheaper and more correct fix is to make the drive REPRODUCIBLE**: same
  route, same distance, same number of graded beats, every time. Then one drive is
  worth having, and the 163 rows are judgeable without any rate machinery.
- This is the same root as the biggest instrument gap already on the list — the
  harness has no sustained-cruise phase (`CRUISE_KMH = 12`, 20–27 full stops per
  drive), so how far it gets depends on how the box was feeling. **Fixing the
  drive fixes the variance and the coverage together.**

**So the question changes, and it is smaller than it was:** not "accept, or build
rate mode?" but "**is a reproducible-distance drive worth one instrument wave?**"
On today's evidence it buys back the whole UNJUDGED bucket rather than a slice of
it, and it removes the need for the rate machinery entirely.

**(a) build the reproducible drive · (b) accept and ship as-is · (c) rate mode anyway.**

## 5. TWO EXPOSED CREDENTIALS — flagged 6+ times, still open

- The **Poyo API key**.
- The **SSH key** at `C:\Users\Ljh\.ssh\id_ed25519_flokinet`, whose contents were
  surfaced in a session. It is the VPS deploy key and it still works.
- **Also:** `platform/.env` carries `SEED_FOUNDER_PASSWORD` in plaintext. Gitignored, so
  not in any remote, but it is the admin password for the dev database on a machine
  whose C: drive filled to 1.1 GB this week.

**I cannot do this one for you** — creating or changing credentials is yours by
definition.

## 6. PRODUCT RULINGS THAT BLOCK SPECIFIC REPAIRS

- **The HUD claims a billing relationship that does not exist.** `StatusDashboard.tsx`
  prints «задачата иска ≤N» under a comment calling it «THE NUMBER THE STUDENT IS
  ACTUALLY BILLED AGAINST». `taskCapKmh` appears NOWHERE in `rules/`, and nothing on
  SimTick carries a task cap — **no rule is ever billed against that number**. Either
  the copy stops claiming it, or the enforcement moves to objective crediting. This is
  the whole of `sc-signal-response:a1989c9a` and half of `sc-ac-truck-spray:990e5f64`.
- **sc-vp-stall transmission channel** — the lesson needs a way to express a stall.
- **world-edge ENDING rule** — what should happen when a student drives to the edge of
  the built world? Undefined today, and drives end inconsistently, which corrupts verdicts.
- **ptp-i-parva-pomosht supply** — how many first-aid items should the bank carry?

## 7. THREE "IS THIS A DEFECT AT ALL?" ROWS — the observation is right, the ruling is yours

Wave 8 (2026-08-28) reached three rows where the lane agreed the observation was
**correct** and could not say whether it was a **defect**. That is not something
engineering can settle, and one of them has a real north-star argument on each side.

- **`sc-ed-reverse-line:1f812456` (major)** — *"There is no rear-facing camera image."*
- **`sc-ed-reverse-line:e05f2cee` (major)** — *"There is no rear proximity read-out on
  screen at any point of the reverse manoeuvre."*
- **`sc-pk-stop-vs-park:e788ce46` (minor)** — *"The cluster has no tachometer, no fuel
  gauge and no odometer — one analogue dial, a digital км/ч and a gear letter."*

**The argument for calling them defects:** a student reversing with no distance cue
and no rear view is being asked to judge a manoeuvre on information the interface
does not give him, and «Наблюдение» is graded on it. The cluster is what a driver
reads to know the car is healthy, and three of its instruments are absent.

**The argument against, and it is not weak:** the category-B practical exam is
taken in a basic car. A learner who acquires the habit of reversing on a camera and
a beeper is a *worse* real driver at the moment those are absent — which is most
cars he will ever borrow. Under the north star (does this produce a safer, more
competent real driver?) withholding the camera may be the pedagogically correct
choice, and adding it would teach a dependence the exam is designed to prevent.
The same is arguable for the cluster: a lesson about stopping-versus-parking has
nothing to do with fuel or revs, and an instrument that is never graded is another
number on a screen the student must learn to ignore.

**What is NOT arguable either way:** if the omission is deliberate, the product
must SAY so. Under THEO-4 nothing may be a bare absence — «Наблюдение» graded on a
shoulder check with no camera should tell the student *that is the point*. Today it
is silent, and silence reads as a missing feature rather than as a choice.

**Decision:** (a) they are defects — build the camera / the proximity read-out /
the missing dials; (b) they are deliberate — I will write the sentence that says so
and close all three; (c) split — name which.

---

## FOR INFORMATION — not asking you, just so the record is straight

- **`sc-ac-night-lights` cannot be passed at all.** Finish zone at y=330 on a 360 m map
  whose route ends at 282 m — proven on a steered and an unsteered leg to within half a
  metre. The debrief says «Стигна края на маршрута» while withholding the tick for
  reaching it. A repair must move the zone or extend the route; loosening the objective
  would push an incomplete drive through the gate.
- **72 rows cannot be settled by any sweep of the current shape** — they are filed on
  `-wrong` legs, and 0 of 43 of those steer, because the drive path runs the steering
  loop only in its `roll` phase.
- **The debrief never says the licence is taken.** `gatedLineBg` drops `banBg`: a
  wrong-way debrief contains «три месеца» zero times; the 1-month and 6-month bans are
  silent too.
