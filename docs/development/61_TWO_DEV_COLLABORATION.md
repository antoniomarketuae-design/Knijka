# 61 · Two-developer collaboration protocol (2026-07-19)

Two developers (Antonio + colleague), each with their own machine and their own
Claude, work the same repo. This protocol is what prevents the „question 77"
collision — both people building the same item, or stepping on the same files.
**Both Claudes load this via CLAUDE.md; follow it exactly.**

## The layout

- **origin** → `git@github.com:antoniomarketuae-design/Knijka.git` (the claim board + PR review + CI — the `gate` workflow runs tsc+vitest+harness+build on every PR).
- **vps** → `ssh://root@213.218.160.60/opt/knijka.git` (bare; staging deploy
  source + offsite backup). Push here too — it is the disaster copy.
- **Staging** → the VPS runs the production build from `scenario-engine`
  (later: `main`), pm2 app `knijka` on :3100, pm2 quick tunnel `knijka-tunnel`.
  Redeploy: `ssh <vps> /opt/knijka/deploy.sh`. The trycloudflare URL **rotates
  every tunnel restart** — current one:
  `grep -ohE "https://[a-z0-9-]+\.trycloudflare\.com" /root/.pm2/logs/knijka-tunnel-*.log | tail -1`.
  Note the `*`: **cloudflared prints its URL on stderr**, so it lands in
  `knijka-tunnel-error.log` and `-out.log` stays 0 bytes. Globbing both is the
  difference between finding the URL and concluding the tunnel is down.
- Each developer runs their **own local dev server + own local DB**
  (`npx prisma dev`). Nobody develops on the VPS.

## The claim rule (the question-77 rule)

**No work starts without a claim.** One GitHub Issue per work item (template,
fix, feature). Claiming = assigning yourself BEFORE the first edit. If the
issue you want is assigned to the other person — pick another. When GitHub is
not reachable, claim in `docs/development/CLAIMS.md` on a pushed branch (a
one-line `- <item> — <name> — <date>` append) — push it before you start.

## Branch + merge discipline

- Branch names: `antonio/<slug>` / `<colleague>/<slug>`. Never commit to the
  integration branch (`scenario-engine`, later `main`) directly.
- PR when your gate is green. The OTHER person (or their Claude) reviews.
- Rebase on the integration branch before merge; merge order = whoever is
  green first. After merge, the merger redeploys staging.

## The gate (unchanged, per person, before any PR)

From `platform/`: `rm -rf .next/dev/types && npx tsc --noEmit` → 0 ·
`npx vitest run` (FULL) → 0 fail · `node scripts/sim-harness.mjs` → 13/13 ·
`npm run build` → clean. Rules-engine changes also need the FP battery +
exam-bank bot green.

## File-ownership hotspots (the agent-army rule, now for humans)

Per work item you OWN: your `templates-<family>*.ts` export, your
`tools/maps/gen_*.mjs` + district JSONs, your `traces/sc*.ts` + trace gate +
recorded trace JSONs, your world battery test.
SHARED files — touch only in the PR that needs them, keep the edit additive,
rebase before merge: `templates.ts` (import+spread), the roster test
(`s2-catalog-integrity.test.ts`), `worldNames.ts`, `contracts.ts`,
`rules/{engine,catalog,types}.ts`, `runtime/stoplines.ts`, `LessonScene.tsx`.
If both PRs must touch a shared file, the second one rebases — the conflict is
mechanical (append lines).

## Trace + content law (do not relearn these the hard way)

- Committed trace JSONs are **byte-frozen**. Re-record only your own template's
  traces, only deliberately, with the gate proving exact codes.
- Never weaken an assertion to make a drive pass. A blocked item with a precise
  engine reason beats a faked green — that rule found three real engine gaps.
- ADR-002: never free-recall Bulgarian law — retrieve from `content/` and cite.

## Secrets

`.env` never enters git. VPS secrets live only on the VPS
(`/root/.knijka-dbpass`, `/root/.knijka-founder-pass`). Each dev's local `.env`
is their own. The colleague gets their OWN SSH key added to the VPS
(`authorized_keys`) and their own GitHub access — private keys are never
copied between people.
