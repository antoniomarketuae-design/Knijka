# `tools/deploy` — the staging deploy, corrected

Audit 2026-07-24, finding **H-17**. These are the scripts that belong on the
VPS. They live in the repo so they are reviewed, tested and versioned like
code — but **nothing here runs automatically**. The founder has to copy them to
the box once. This file is the exact recipe and the reasoning behind it.

Everything in here is exercised by `tools/deploy/deploy.test.mjs`
(`node --test tools/deploy/deploy.test.mjs`, 23 tests) against a sandbox with
fake `npm`/`pm2`/`curl`/`pg_dump` — including the two failures that actually
happened.

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
| `pull-backups.sh` | *stays on the dev box* | Pulls the dumps off the VPS — a backup on the backed-up machine is not a backup |

The health gate is `platform/src/app/api/health/route.ts` (`/api/health`),
added in the same change. It has two probes and the deploy uses both:

* `/api/health` — **readiness**: the process *and* the database. Gate on this.
* `/api/health?probe=liveness` — **liveness**: the process only.

Both report `commit`, baked in at build time from `NEXT_PUBLIC_COMMIT_SHA`.
The deploy does not accept a 200 unless it names the commit it just deployed —
otherwise a stale process that never died reads as healthy, which is precisely
what 11.5 hours of downtime looked like from the outside.

**Why a database outage does not trigger a rollback:** the previous build talks
to the same database. Rolling back would add a restart's worth of downtime and
fix nothing. So when readiness fails but liveness answers with the new commit,
`deploy.sh` keeps the new build and exits **3** — "page a human", not "retry".

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
    tools/deploy/knijka.cron root@213.218.160.60:/root/deploy-install/
```

Then on the VPS:

```bash
cd /root/deploy-install
install -m 750 deploy.sh autodeploy.sh backup-db.sh /opt/knijka/
install -m 644 knijka.cron /etc/cron.d/knijka   # NOT executable — cron.d ignores +x files
systemctl restart cron
```

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

### Off the box — the half that is not optional

```bash
bash tools/deploy/pull-backups.sh          # from the dev machine, weekly
```

Backups on the VPS survive a bad migration. They do not survive losing the VPS.
Pull, don't push: the VPS never gets a credential that reaches your machine, so
compromising it cannot reach the backups.

### Restore drill (do this once, now, not during an incident)

```bash
createdb knijka_restore_test
pg_restore --no-owner --no-privileges -d knijka_restore_test <dump>
psql -d knijka_restore_test -c 'select count(*) from "User";'
dropdb knijka_restore_test
```

An untested backup is a belief, not a plan.

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
Plain git, no API token on the box.

**Optional alerting:** set `KNIJKA_ALERT_WEBHOOK` in `/etc/cron.d/knijka` to a
Slack/Discord/ntfy URL and failures get posted there. Keep the URL on the box —
it is a credential and never belongs in this repo.

**Log rotation:** both logs grow forever otherwise.

```
/var/log/knijka-*.log { weekly rotate 8 compress missingok notifempty }
```
in `/etc/logrotate.d/knijka`.

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
