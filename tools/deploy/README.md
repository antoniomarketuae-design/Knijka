# `tools/deploy` — the staging deploy, corrected

Audit 2026-07-24, finding **H-17**. These are the scripts that belong on the
VPS. They live in the repo so they are reviewed, tested and versioned like
code — but **nothing here runs automatically**. The founder has to copy them to
the box once. This file is the exact recipe and the reasoning behind it.

Everything in here is exercised by the `*.test.mjs` files next to it —
`deploy.test.mjs` (24 tests, the deploy order and the rollback, against a
sandbox with fake `npm`/`pm2`/`curl`/`pg_dump`, including the two failures that
actually happened), `pull-backups.test.mjs` (14), `check-migrations.test.mjs`
(16), `ci-workflow.test.mjs` (6) and `ops-docs.test.mjs` (9, which pins the
facts in THIS file that the scripts depend on it stating).

They run in CI via `npm run test:tools`; locally,
`node --test tools/deploy/<file>.test.mjs`.

---

## What was broken

`/opt/knijka/autodeploy.sh` ran, every 5 minutes, **inside the live directory**:

```
git reset --hard → npm ci → prisma migrate deploy → rm -rf .next
→ npm run build → pm2 restart          # …and then declared success
```

Three separate faults, all proven from the box's own logs:

1. **The live process was left without its build for ~2m24s per deploy.**
   `rm -rf .next` deleted the directory the running server serves from.
   `knijka-error.log` holds six `ENOENT … .next/required-server-files.json`.
2. **Nothing ever checked that the new process could serve.** Success meant
   "`pm2 restart` returned". `/var/log/knijka-autodeploy.log` shows 31
   `deploying` lines and 30 `deployed`.
3. **A failed deploy was never retried.** `[ "$LOCAL" = "$REMOTE" ] && exit 0`
   was evaluated *after* `git reset --hard` had already moved `HEAD`, so the
   attempt itself convinced the next tick there was nothing to do. Staging was
   down from 23:03 on 07-19 to 10:24 on 07-20 — **~11.5 hours** — and only an
   unrelated push fixed it.

Plus: the deploy matched on the branch SHA alone, so a commit whose CI gate was
**red** shipped anyway. And there were **no database backups at all**, while
`prisma migrate deploy` ran unattended from cron against the only copy of every
student's progress.

---

## What replaces it

| File | Goes to | Does |
|---|---|---|
| `deploy.sh` | `/opt/knijka/deploy.sh` | Build in a separate workspace → back up the DB → migrate → atomic swap → restart → **health-gate** → **roll back** if unhealthy |
| `autodeploy.sh` | `/opt/knijka/autodeploy.sh` | The 5-min tick: deploy the CI-green tag, retry failures with backoff, never race itself |
| `backup-db.sh` | `/opt/knijka/backup-db.sh` | Verified `pg_dump`, retention, called before every migration |
| `knijka.cron` | `/etc/cron.d/knijka` | The schedule (deploy tick + daily backup) |
| `logrotate.knijka` | `/etc/logrotate.d/knijka` | Caps the two cron logs. They are the only forensics this system has, and they had no ceiling |
| `pull-backups.sh` | *stays on the dev box* | Pulls the dumps off the VPS — a backup on the backed-up machine is not a backup |
| `check-migrations.mjs` | *runs in CI* | Refuses a migration that would break the build currently running (see "Expand / contract") |

The health gate is `platform/src/app/api/health/route.ts` (`/api/health`),
added in the same change. It has two probes and the deploy uses both:

* `/api/health` — **readiness**: the process, the database *and the migration
  state*. Gate on this.
* `/api/health?probe=liveness` — **liveness**: the process only.

Both report `commit`, baked in at build time from `NEXT_PUBLIC_COMMIT_SHA`.
The deploy does not accept a 200 unless it names the commit it just deployed —
otherwise a stale process that never died reads as healthy, which is precisely
what 11.5 hours of downtime looked like from the outside.

Readiness can now fail for **two different reasons that need opposite
remedies**, and `deploy.sh` tells them apart by reading the body:

| `checks` | What happened | What the deploy does |
|---|---|---|
| `db.ok: false` | Postgres is unreachable | **No rollback.** The previous build faces the same database. Exit **3** — page a human. |
| `migrations.ok: false` | `prisma migrate deploy` fell over and left a row in `_prisma_migrations` with `finished_at` NULL | **Roll back the code.** The previous build predates that migration and does not need the schema it failed to create. Exit **1**. |

The migration probe is the answer to a specific, cheap-to-hit outage: add a
column, write code against it, forget the migration — and everything is green
until students start getting 500s. CI now applies migrations to a real
postgres so that shape cannot merge (`.github/workflows/ci.yml`); this probe is
the same question asked of the box.

**After a rollback for a half-applied schema, readiness stays red** — and it
should. Rolling back the code does not clean up `_prisma_migrations`; only
`npx prisma migrate resolve --rolled-back <name>` (or `--applied`) does, and
only a human can decide which. Staging is serving the previous build the whole
time. The deploy log ends with `rollback did NOT restore health`, which is the
literal truth and the signal to look.

---

## Install (founder, once, ~15 minutes)

Run as root on `213.218.160.60`.

### 1. Give GitHub's green tag a way onto the box

CI moves a `staging-green` tag to a commit **only after the whole gate passes**
(`.github/workflows/ci.yml`, job `deployable`). The box currently fetches from
the `vps` bare remote, which never sees that tag.

```bash
cd /opt/knijka
git remote add origin https://github.com/antoniomarketuae-design/Knijka.git   # if absent
git fetch --tags origin
git rev-list -n 1 staging-green      # must print a SHA. If not, push to an
                                     # integration branch and let CI run once.
```

A public HTTPS fetch is enough — nothing on the box needs to push, so **no
GitHub token has to live on the VPS**. Rolling back to any older commit is
`git tag -f staging-green <sha> && git push -f origin refs/tags/staging-green`
from your machine; the next tick picks it up.

### 2. Create the build workspace and the state directory

```bash
git clone /opt/knijka.git /opt/knijka-build
cd /opt/knijka-build && git remote add origin https://github.com/antoniomarketuae-design/Knijka.git
mkdir -p /var/lib/knijka-deploy /var/backups/knijka && chmod 700 /var/backups/knijka
# Seed "what is live now" so the first run does not think it is deploying blind:
git -C /opt/knijka rev-parse HEAD > /var/lib/knijka-deploy/deployed_sha
```

`/opt/knijka-build` **must be on the same filesystem as `/opt/knijka`** (under
`/opt`, it is). The swap uses hardlink-copy plus rename, which only works
within one filesystem — the script falls back to a full copy otherwise, but
that is slower and gives up the atomic-rename property.

Disk: budget ~2× the current build. `deploy.sh` refuses to start below 3 GB
free and says so, rather than half-building and corrupting `.next`.

### 3. Install the scripts

From the dev box:

```bash
scp -i ~/.ssh/id_ed25519_flokinet tools/deploy/{deploy,autodeploy,backup-db}.sh \
    tools/deploy/knijka.cron tools/deploy/logrotate.knijka \
    root@213.218.160.60:/root/deploy-install/
```

Then on the VPS:

```bash
cd /root/deploy-install
install -m 750 deploy.sh autodeploy.sh backup-db.sh /opt/knijka/
install -m 644 knijka.cron /etc/cron.d/knijka   # NOT executable — cron.d ignores +x files
install -m 644 logrotate.knijka /etc/logrotate.d/knijka
systemctl restart cron
```

(Copy `logrotate.knijka` across in the `scp` above too. Log rotation is not
optional here — see "Log rotation" below for what an unbounded log costs on a
box that also holds the database and the backups.)

All three `.sh` files must land in the **same** directory: `deploy.sh` finds
`backup-db.sh` next to itself, and `autodeploy.sh` finds `deploy.sh` the same
way.

Check the `PATH` line at the top of `/etc/cron.d/knijka`: cron's default PATH
has neither `node`/`npm` (nvm, `/usr/local/bin`) nor `pm2`. Compare against
`dirname "$(command -v node)"` and `command -v pm2` and edit if needed. A
deploy that cannot find `pm2` fails **at the restart, with the build already
swapped in** — the worst possible place.

### 4. Prove it works before trusting it

```bash
curl -sS localhost:3100/api/health | head -c 200          # expect ok:true + a commit
KNIJKA_FORCE=1 /opt/knijka/deploy.sh                      # a full deploy, watched
/opt/knijka/backup-db.sh manual-first-run                 # expect "ok: knijka-….dump"
```

While `deploy.sh` runs, from another shell: `curl -s -o /dev/null -w '%{http_code}\n'
localhost:3100/` in a loop. It must never leave `200` — that is the fix, visible.

Then remove the old scripts so nobody runs them by muscle memory:

```bash
mv /opt/knijka/autodeploy.sh.old /root/  2>/dev/null || true
```

---

## Backups

* **Daily 03:15 UTC** plus **before every migration** (`deploy.sh` calls
  `backup-db.sh` and refuses to migrate if it fails).
* Every dump is verified with `pg_restore --list` before it counts. A dump that
  has not been read back is not a backup — a disk that fills mid-dump produces
  a file that looks perfect and restores nothing.
* Retention: 14 days of dailies, 8 weeks of Sunday dumps, in
  `/var/backups/knijka` (mode 700 — this is a minors' database, ADR-004).
* `checksums.txt` accumulates a SHA-256 per dump.

### Off the box — the half that has never once run

```bash
bash tools/deploy/pull-backups.sh           # from the dev machine, weekly
bash tools/deploy/pull-backups.sh --check   # "is the newest local dump < 8 days old?"
```

**Read this before assuming it is handled.** `$HOME/knijka-backups` does not
exist on the dev machine. The old script `mkdir -p`'d it on line 25, before any
network call — so the directory's absence is proof the script was never invoked
at all, not even unsuccessfully. Every dump the company owns is on the VPS and
only on the VPS: safe from a bad migration, one dead box away from being the
entire history of every student's progress, gone.

Two things were in the way and both are fixed:

* **`rsync` is not on the dev box.** Git Bash on Windows ships `ssh` and `scp`
  and no `rsync`, so the old script's single transfer line died with `command
  not found` under `set -e`. There is now an `scp` path with the same
  never-overwrite guarantee.
* **A failed run used to leave an empty `knijka-backups` behind** — a directory
  with a plausible name and nothing in it, which is what "we have backups"
  looks like to every human who checks. Nothing is created now until the VPS
  has answered.

`--check` fails when the newest local dump is older than 8 days (weekly, plus a
day of slack), when the directory holds no dumps, and when it does not exist.
A plain pull ends by running the same check, so a run that copied nothing new
over a stale set still comes out red.

Pull, don't push: the VPS never gets a credential that reaches your machine, so
compromising it cannot reach the backups.

### Restore drill (do this once, now, not during an incident)

**RUN FOR THE FIRST TIME 2026-08-29, AND IT FAILED — the commands below are the
corrected ones.** The drill as originally written ended in
`pg_restore: error: could not open input file … Permission denied`, and the cause
is a deliberate decision made two files away: `backup-db.sh` does
`chmod 700 "$BACKUP_DIR"` because *"a dump of a minors' database is not
world-readable (ADR-004)"*. The directory is root's; `pg_restore` was running as
`postgres`; postgres cannot read root's 0700 directory. Nothing was wrong with the
backup — the RECOVERY PATH was wrong, and the only way to learn that was to run it.
This is the entire argument for drills: the failure surfaced on a Saturday morning
with the site up, instead of during the incident it was written for.

So root reads the file and postgres receives it on **stdin**:

```bash
DUMP=/var/backups/knijka/<newest>.dump
sudo -u postgres createdb knijka_restore_test
cat "$DUMP" | sudo -u postgres pg_restore --no-owner --no-privileges -d knijka_restore_test
sudo -u postgres psql -d knijka_restore_test -tAc 'select count(*) from "User";'
sudo -u postgres psql -d knijka_restore_test -tAc "select count(*) from information_schema.tables where table_schema='public';"
sudo -u postgres dropdb knijka_restore_test
```

Do NOT "fix" this by loosening the 0700 — the permission is protecting a minors'
database and the pipe costs nothing.

MEASURED on `knijka-20260829T031501Z-daily-scheduled.dump` (560,527 bytes): restored
clean, **20 tables**, `User` = 2 rows, `Payment` = 0. Count the tables as well as the
rows — a restore that produces an empty schema also returns 0 rows and looks calm.

**Until a dump has been RESTORED, the recovery position is zero — not "backed
up".** A dump that has never been read back is a belief. `backup-db.sh` proves
the file parses (`pg_restore --list`); only this drill proves the rows come
back, that the version of Postgres you would restore onto accepts them, and
that you know the commands without looking them up. Twenty minutes now, once.

---

## Operating it

**Where things are:**

| | |
|---|---|
| Deploy log | `/var/log/knijka-autodeploy.log` |
| Backup log | `/var/log/knijka-backup.log` |
| What is actually live | `cat /var/lib/knijka-deploy/deployed_sha` |
| Retry state | `fail_sha`, `fail_count`, `next_attempt_at`, `gave_up_on` in the same directory |
| Artefacts of a rolled-back deploy | `/opt/knijka/platform/.next.failed` (kept on purpose) |

**A deploy failed.** The tick retries at 5, 10 and 20 minutes, then stops and
writes `gave_up_on`. Staging is still serving the last good build the whole
time — that is what the rollback is for. Pushing a fix clears everything: a new
green commit resets the budget and deploys on the next tick.

**Roll back deliberately:** move the tag from your machine —
`git tag -f staging-green <older-sha> && git push -f origin refs/tags/staging-green`.
Plain git, no API token on the box. **What a rollback does not put back is the
schema** — read the next section before relying on it.

**Optional alerting:** set `KNIJKA_ALERT_WEBHOOK` in `/etc/cron.d/knijka` to a
Slack/Discord/ntfy URL and failures get posted there. Keep the URL on the box —
it is a credential and never belongs in this repo.

---

## Expand / contract — what the rollback does NOT undo

Read this next to the rollback above, because it is the sentence that section
leaves out.

> **A rollback restores the CODE. The schema is deliberately NOT reverted.**
> The database stays exactly as the migration left it. The restore point is the
> dump `backup-db.sh` took immediately before the migration:
> **`/var/backups/knijka/knijka-<timestamp>-daily-pre-deploy-<sha12>.dump`**
> (`ls -t /var/backups/knijka/*pre-deploy* | head -1` finds the newest).

That is a choice, not an oversight. A down-migration run automatically by a
cron job at 03:00, against the only copy of every student's progress, is a
worse idea than the outage it is trying to fix — `prisma migrate deploy` does
not even have a down step, and an improvised one is a `DROP` written under
pressure by nobody in particular.

**The consequence, and the whole reason for the rule below:** since the schema
moves forward and stays there, the previous build has to keep working against
the new schema. Otherwise the rollback restores a build that cannot serve
either, and the deploy's safety net is decoration.

So every schema change ships in two deploys:

**1 — expand (this deploy).** Only additive statements. `ADD COLUMN` (nullable,
or `NOT NULL DEFAULT`, which is catalogue-only on Postgres 11+ and safe at any
row count), `CREATE TABLE`, `CREATE INDEX`. New code writes both the old and
the new shape and reads the new one. The old build, if it comes back, ignores
everything it does not know about.

**2 — contract (a later deploy, after this one has soaked).** Once nothing that
could still be running refers to the old thing, drop it — in its own migration,
carrying an override marker that says the expand already happened:

```sql
-- knijka:allow-destructive  expanded in 20260803150000_admin_action_audit, live since 08-05
ALTER TABLE "User" DROP COLUMN "legacyFlag";
```

`tools/deploy/check-migrations.mjs` enforces this in CI. Without the marker it
rejects `DROP COLUMN`, `DROP TABLE`, `SET NOT NULL`, `DROP CONSTRAINT` and
`DROP INDEX`, and the message names which one and why:

| Statement | What it does to the build that is running |
|---|---|
| `DROP COLUMN` | it still `SELECT`s the column — every query 500s, and so does the build the rollback restores |
| `DROP TABLE` | the same, wholesale, and the rows are gone; the only copy is the pre-deploy dump |
| `SET NOT NULL` | it still `INSERT`s rows without that column — **writes** start failing while **reads** look fine, the hardest version of this to diagnose at 3am |
| `DROP CONSTRAINT` / `DROP INDEX` | something its queries or writes rely on stops existing |

The marker is not a hurdle. It exists so that the drop is a sentence a human
wrote on purpose, in the migration, visible in the diff and in `git blame` and
to whoever is reading that file while the site is down.

Run it locally before pushing:

```bash
node tools/deploy/check-migrations.mjs --all
```

## Log rotation — install it, do not read it

This used to be a four-line snippet in this file with the words "in
`/etc/logrotate.d/knijka`" after it. Nobody ran it, so nothing rotates and the
logs have grown without a ceiling since the day the deploy was set up. They are
also the only forensics this system has — the six
`ENOENT … .next/required-server-files.json` lines that finally explained the
11.5-hour outage came out of `knijka-error.log`. Unbounded, they eventually
fill the disk, and a full disk takes out the database *and* the backups on the
same box: the evidence and the data go together.

It is now a file in the repo, so it can be copied and dry-run instead of typed.

**The cron logs** (`knijka-autodeploy.log`, `knijka-backup.log` — cron reopens
these on every run, so plain rotation is safe):

```bash
install -m 644 tools/deploy/logrotate.knijka /etc/logrotate.d/knijka
logrotate -d /etc/logrotate.d/knijka      # dry run — prints what it WOULD do
logrotate -f /etc/logrotate.d/knijka      # force one rotation now, to prove it
```

**The app's own logs** (`~/.pm2/logs/knijka-*.log`) need `pm2-logrotate`, not
logrotate: pm2 holds those file descriptors open, so rotating them from
`/etc/logrotate.d` leaves pm2 writing into a deleted inode and the new file
empty forever — the worst outcome, because it looks fixed.

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'   # daily at midnight
pm2 save
```

Check it took: `pm2 conf pm2-logrotate` and `ls -la ~/.pm2/logs/`.

## Support: `/admin`, instead of psql over SSH

Every support case used to be a hand-written `UPDATE` against production over
SSH, with no record of who ran it and no undo. `/admin` is that, with a ledger.
It is gated on `User.role = "admin"` read from the database on every request —
the same gate `/review/calibration` uses — and answers `404` to everyone else,
because an internal tool should not confirm its own existence to a student.

Search by e-mail; see entitlements, payments, exam attempts and tutor spend.
Four buttons: grant a pack (recorded as `provider: "promo"`, never `stripe` —
a gift that claims to be a purchase corrupts every revenue figure forever),
revoke, give back a free mock exam, delete a stuck in-progress attempt. Each
needs a written reason and writes an `AdminAction` row naming you, in the same
transaction as the change.

**The case it exists for**: a free student taps „Започни пробен изпит", their
phone drops connection, and the exam gate counts *started* attempts — so the
one lifetime free exam they were ever going to get is spent on a paper they
never saw. „Върни безплатния изпит" gives back exactly one exam: no pack, no
history rewritten.

Making an account admin is the one thing this surface cannot do for itself —
it is the bootstrap. `scripts/seed-founder.mjs` refuses to run against anything
that looks like production (`NODE_ENV=production` or a non-localhost
`DATABASE_URL`), and deliberately so, which leaves exactly one command on the
VPS:

```sql
UPDATE "User" SET role = 'admin' WHERE email = 'you@example.com';
```

Run it once, for your own account. `/admin` deliberately has **no button that
grants admin**: a support tool that can promote accounts is a support tool that
can hand over the whole product, and the four buttons it does have are all
reversible or bounded. Promotion stays a deliberate act at the database, rare
enough to notice.

## Kill switch — turning a feature off without a deploy

`DISABLED_FEATURES` (`platform/src/lib/features.ts`) takes any of `simulator`,
`hazard`, `tutor`, comma- or space-separated. Set it in
`/opt/knijka/platform/.env` and restart:

```bash
echo 'DISABLED_FEATURES=simulator' >> /opt/knijka/platform/.env
pm2 restart knijka --update-env
```

Without it, turning the simulator off on launch day because it melts phones
means a code change, a CI run and a five-minute deploy tick while students are
hitting it. The switch is checked in the page guard **and** in the server
actions — a page guard alone leaves the POST endpoints live, and the endpoints
are where the expensive work happens.

Students see „временно изключено" and are told their access is intact; they are
never shown the paywall for something we switched off ourselves.

**Verify it took effect on `/admin`**, which prints the parsed value. That
matters more than it sounds: `DISABLED_FEATURES=simulater` looks like it
worked, disables nothing, and leaves every student driving — `/admin` shows the
unrecognised token in red. It is deliberately *not* on `/api/health`, which is
public and reports no configuration at all.

---

## Still open (not fixable from the repo)

* **Branch protection.** H-12b needs `gate` required as a status check and
  direct pushes to `scenario-engine`/`main` forbidden, in GitHub's settings.
  Until that is on, the `staging-green` tag is the only thing keeping a red
  commit off staging.
* **Uptime monitoring.** The health gate catches a bad *deploy*. It cannot
  catch staging dying at 04:00 on its own. Point any external monitor at
  `/api/health` on the tunnel URL — that is the remaining path from "down" to
  "someone knows".
