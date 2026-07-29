# DEPLOYMENT STRATEGY

> Status: v1.0 — 2026-07-08. Covers the launch deployment of `platform/` (Next.js 16 + Prisma/Postgres + Stripe + Anthropic API). Written to the decision standard: problem → options → recommendation → risks → scalability.

## 1. Problem

Ship Книжка.AI to real Bulgarian users with: a Next.js 16 App Router app (server components, server actions, API routes, streaming), a Postgres database (Prisma 7, `@prisma/adapter-pg`), Stripe webhooks, the Anthropic API, HTTPS (hard requirement for PWA install + secure auth cookies), and GDPR-compliant data residency for minors — operated by a solo founder with ~0 hours/week available for infrastructure.

## 2. Decision drivers

| Driver | Why it matters here |
|---|---|
| Zero-ops | Solo founder; every infra hour is a content/product hour lost |
| Next.js 16 fidelity | Server actions, PPR/streaming, image/OG pipeline must just work |
| EU data residency | Users are 16–18-year-olds in Bulgaria → GDPR, minors' data (ADR-004) |
| Cost at launch | ~0 revenue day one; free/cheap tiers matter |
| Escape hatch | Standard Next.js + Postgres + Stripe — nothing proprietary in app code |

## 3. Hosting options considered

Evaluated against the standard criteria (maintenance 10y+, performance, licensing, community, lock-in, cost, global scale):

| Criterion | **Vercel** | Railway | Fly.io | Hetzner + Coolify |
|---|---|---|---|---|
| Next 16 support | First-party, day-one | Good (nixpacks/Docker) | Good (Docker) | DIY (Docker) |
| Ops burden | ~None | Low | Medium (regions, VMs) | High (patching, SSL, backups, uptime = you) |
| Performance | Edge CDN + EU fn region (fra1) | Single region | Multi-region VMs | One DC (Falkenstein — EU ✓) |
| Cost (launch) | Free Hobby → $20/mo Pro | ~$5–20/mo | ~$5–20/mo | ~€5–10/mo |
| Cost (scale) | Can spike (bandwidth/fn invocations) | Linear | Linear | Cheapest at scale |
| Lock-in | Low-moderate: app is standard Next.js; leaving = redeploy container elsewhere | Low | Low | None |
| Community/longevity | Very large, well-funded, builds Next.js itself | Growing startup | Solid, smaller | Coolify = small OSS project; Hetzner = rock-solid host |
| Webhooks/API routes | Native | Native | Native | Native |

**Rejected:**
- **Railway** — fine, but no edge CDN, fewer Next-specific optimizations, similar price to Vercel Pro without the first-party integration.
- **Fly.io** — great control, but VM/region management is ops work the sprint budget doesn't have; no advantage for this workload.
- **Hetzner + Coolify** — cheapest long-term and zero lock-in, but the founder becomes the SRE (TLS, deploy pipeline, monitoring, backup discipline). Right answer at ~10k+ users if bills spike; wrong answer for launch week. Documented as the cost escape hatch.

## 4. Recommendation: Vercel

**Deploy `platform/` to Vercel, Hobby tier first, Pro ($20/mo) at paid launch** (Hobby forbids commercial use — flip to Pro before enabling Stripe live mode).

Setup:
1. Push repo to GitHub → "Import Project" in Vercel, root directory = `platform/`.
2. **Set function region to `fra1` (Frankfurt)** — keeps compute next to the EU database and users (Sofia ~25ms).
3. Framework preset Next.js; build command `next build` (default). Prisma client generates via the schema's `prisma-client` generator during `npm install`/build — no extra step needed beyond env vars.
4. Add env vars (§6), add domain (§8), done. Every push = preview deploy; `main` = production.

- **Advantages:** zero-ops, first-party Next 16, preview deploys for a solo founder are a free QA environment, HTTPS automatic (PWA requirement), EU function region.
- **Disadvantages:** bandwidth/invocation pricing can spike; Hobby→Pro required for commerce; serverless = no long-lived processes (fine — we have none; the simulator is client-side).
- **Technical risks:** (a) serverless function 10s/60s+ limits vs AI tutor streaming — responses stream, and `maxDuration` can be raised per-route if debriefs run long; (b) Prisma on serverless needs a pooled connection string (§5); (c) cost surprise — set a Vercel spend alert at $50/mo day one.
- **Scalability:** CDN + serverless scales past any plausible year-1 load; the documented exit (Docker on Hetzner/Fly) exists because the app uses zero Vercel-proprietary APIs. Revisit hosting only when the bill exceeds ~€100/mo.

## 5. Production Postgres

| | **Neon** | Supabase | Vercel Postgres |
|---|---|---|---|
| EU region | ✓ Frankfurt (eu-central-1) | ✓ Frankfurt/Zurich | Neon-powered, region selectable |
| Free tier | Generous (0.5GB, autosuspend) | 500MB, pauses after 1wk idle | Marketplace billing via Vercel |
| Fit | Pure Postgres, serverless driver, branching | Whole BaaS (auth/storage we don't need) | Same as Neon + one bill |
| Prisma | First-class | Fine (use the pooler) | First-class |

**Recommendation: Neon, project region `eu-central-1` (Frankfurt).** Pure Postgres (no platform lock-in beyond a connection string), DB branching pairs perfectly with Vercel preview deploys, and EU residency satisfies GDPR. Supabase would drag in a parallel auth/storage stack we deliberately don't use; Vercel Postgres is acceptable too (it *is* Neon) if one-bill simplicity wins.

**GDPR note (minors):** Frankfurt keeps personal data (email, name, birth year, progress) inside the EU. Sign Neon's DPA (dashboard → settings). Anthropic API calls send tutor *questions* (should contain no PII by design — threads store text in our DB, not Anthropic's training set); note this in the privacy policy.

### Migration: local → production

Local dev uses `npx prisma dev` (embedded Prisma Postgres). Production:

```bash
# 1. Create Neon project (eu-central-1) → copy BOTH connection strings:
#    pooled (…-pooler.…neon.tech) → runtime DATABASE_URL
#    direct (no -pooler)          → migrations (and SHADOW_DATABASE_URL if prompted)

# 2. Apply committed migrations (prisma/migrations/000_init) against prod:
cd platform
DATABASE_URL="<direct-url>" npx prisma migrate deploy

# 3. Verify:
DATABASE_URL="<direct-url>" npx prisma migrate status
```

- `migrate deploy` only *applies* migrations — it never diffs or drops; safe for prod. Run it manually per release for now (solo founder, no CI/CD pipeline yet); automate in CI post-launch.
- The **runtime** `DATABASE_URL` on Vercel must be the **pooled** string (serverless functions exhaust direct connections).
- `SHADOW_DATABASE_URL` (see `prisma.config.ts`) is only needed for `migrate dev` locally — never set it in Vercel.
- No data to migrate: prod starts empty (learning content is file-based in `content/`, shipped with the app).

## 6. Environment variables (Vercel → Project → Settings)

| Var | Value / source | Notes |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** connection string | Runtime queries |
| `AUTH_SECRET` | `openssl rand -base64 32` — **generate fresh for prod** | Session JWTs; never reuse the dev value |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Tutor + debriefs; set a monthly spend limit in the Anthropic console |
| `STRIPE_SECRET_KEY` | Stripe dashboard → **live** key (`sk_live_…`) | App degrades gracefully without it (pricing shows "Скоро") |
| `STRIPE_WEBHOOK_SECRET` | From §7 (`whsec_…`) | Live-mode endpoint secret, not the CLI one |
| `NEXT_PUBLIC_APP_URL` | `https://<final-domain>` | Stripe redirects, `metadataBase` (OG/absolute URLs). No trailing slash |

Preview deployments: keep Stripe in **test** mode and point `DATABASE_URL` at a Neon branch, or leave Stripe vars unset there.

## 7. Stripe production webhook

1. Stripe dashboard → **Developers → Webhooks → Add endpoint**: `https://<domain>/api/stripe/webhook`.
2. Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded` (exactly what `src/app/api/stripe/webhook/route.ts` handles).
3. Copy the endpoint's signing secret → `STRIPE_WEBHOOK_SECRET` in Vercel → redeploy.
4. Verify: dashboard "Send test event" → expect 200; then one real €X checkout with a live card before announcing launch (refund it).
5. Also complete Stripe account activation (business details, payout bank) — takes days, start early.

## 8. Domain & DNS

`knizhka.ai` availability/price is **unverified** (.ai domains ≈ $70–100/yr, 2-year minimum). Check first; fallbacks in order of preference:

1. **`knizhka.app`** — .app fits a PWA, forces HTTPS at the TLD level, cheap (~$15/yr).
2. **`knizhka-ai.com`** — safe, boring, matches the brand wordmark.
3. **`knizhka.bg`** — strongest local trust signal, but .bg registration requires a Bulgarian company/trademark and costs ~€25–50/yr — viable once the company entity exists.

DNS: buy at Cloudflare Registrar (at-cost) or Namecheap → in Vercel add the domain → set the offered A/CNAME records (or delegate nameservers to Vercel). If using Cloudflare, set the proxy to "DNS only" (grey cloud) — Vercel terminates TLS itself. `www` → apex redirect: Vercel handles automatically. After the domain is live, update `NEXT_PUBLIC_APP_URL`.

## 9. PWA / installability

Shipped in the app: `src/app/manifest.ts` (name Книжка.AI, `standalone`, `start_url: /dashboard`, theme `#0a101e`), full icon set in `public/icons/` + `src/app/favicon.ico` (regenerate: `node scripts/generate-icons.mjs`), Apple touch icon + iOS meta via root layout.

- **HTTPS is the missing precondition** — install prompts only fire on https (or localhost). Nothing to configure on Vercel; just verify after first deploy: Chrome DevTools → Application → Manifest → "Installability" should show no errors; test Add-to-Home-Screen on one Android and one iPhone.
- **No service worker in v1** (Chrome no longer requires one to install). Offline caching of theory content is the obvious post-launch win — add via `next-pwa`/Workbox or a hand-rolled SW later; scope it deliberately (content JSON + shell, *not* API responses).

## 10. Onboarding data: client → server

Onboarding answers (exam date, daily-minutes goal) live in **versioned localStorage keys** (`knizhka.v1.examDate`, `knizhka.v1.dailyGoalMin`, `knizhka.v1.onboardingCompletedAt` — see `platform/src/components/onboarding/storage.ts`). v1 tradeoff: zero schema churn during the sprint; cost: preferences don't follow the user across devices.

**Post-launch plan:** add nullable `examDate DateTime?` and `dailyGoalMin Int?` to `User` via a normal Prisma migration; on first authenticated load, a small server action reads the v1 keys, persists them, and clears localStorage. The dashboard exam-countdown card should read localStorage now and the User columns later behind the same accessor.

## 11. Pre-launch checklist

**Blocking gates — do not take money before these:**

- [ ] 🔴 **CONTENT REVIEW GATE: 188 flagged questions** (`content/review/FLAGGED-FOR-REVIEW.md`) must be founder-cleared or permanently excluded. They are already excluded from exams, but nothing ships to paying users with `needs-review` items reachable in practice mode. This is the critical-path item.
- [ ] 🔴 **LEGAL PAGES: `/terms`, `/privacy`, `/cookies`, `/contact` are footer links with NO pages behind them (404 today).** Before paid launch we need, minimum: real GDPR privacy policy (users are **minors** — data list, purpose, retention, right to erasure, parental info; the registration consent text is itself marked "wording pending legal review"), terms of sale (one-time packs, 14-day EU withdrawal right / digital-content waiver), cookie note (auth cookie only — no analytics cookies yet). Get a Bulgarian lawyer's pass; template-only is a risk the founder must explicitly accept.
- [ ] Stripe: account activated, live keys set, webhook verified (§7), pricing pages show correct amounts, refund path tested.
- [ ] Fresh prod `AUTH_SECRET`; `.env` never committed (verify).

**Launch-quality gates:**

- [ ] `npm run build`, `npm run test`, `npm run validate:content` green on the deploy commit.
- [ ] `prisma migrate status` clean against prod DB (§5).
- [ ] Full happy path on production URL: register → onboarding → practice session → mock exam → tutor question → (test-mode) purchase.
- [ ] PWA install check on real Android + iOS devices (§9).
- [ ] OG/social preview check (paste URL into a chat app; `/og.png` should render).
- [ ] Cross-browser: Chrome, Safari iOS, Firefox; the simulator page must *degrade politely* on WebGL-poor devices.
- [ ] Vercel spend alert + Anthropic spend limit + Stripe email notifications on.
- [ ] Uptime ping (UptimeRobot free) on `/` and error tracking decision (Sentry free tier) — or an explicit "not yet" note.
- [ ] Neon: confirm PITR/backup retention on the chosen plan.

## 12. Post-launch (first month)

Watch: Vercel analytics (traffic), Anthropic token spend per tutor thread (`TutorThread.costMicroUsd` is already instrumented), Stripe disputes, Neon storage. Automate `migrate deploy` in CI once releases are weekly. Revisit hosting cost at ~€100/mo (§4 exit hatch). Add service worker + offline theory (§9) as the first PWA upgrade.

## 13. Local dev box maintenance — the prisma-dev journal

**Symptom to recognise:** MCP servers start failing with `UtilityProcess spawn
timeout after 5000ms`, tools get slow, builds fail in odd ways. Check free disk
**before** debugging any of it.

On 2026-07-29 `C:` fell to **1.58 GB free of 118.6 GB**. One file was responsible:

```
%LOCALAPPDATA%\prisma-dev-nodejs\Data\durable-streams\default\durable-streams.sqlite
   25.61 GB
```

`prisma dev` records every database mutation in a `wal` table inside that
sqlite file. A compaction job is supposed to roll those rows into a `segments`
table and truncate the WAL. **It has never run on this machine** — `wal` held
24,761,558 rows, `segments` held 0. `freelist_count` was 13 pages, so the rows
were live: `VACUUM` would have reclaimed nothing, and could not have run anyway
(it needs free space equal to the database size — the exact thing we had run
out of).

The database being journalled is **8.4 MB / 9 tables / 557 rows**. The journal
was ~3,000× the size of its own subject. It is derived state — the Postgres
data lives in `Data\<namespace>\.pglite` — so deleting it is safe, and was
verified so: every table's row count identical before and after, admin accounts
intact.

**This recurs.** Within minutes of a fresh start the new journal had already
logged 1,013 rows with `segments` still at 0. Check it periodically:

```bash
node tools/ops/disk-guard.mjs
```

Reports every namespace's journal size, WAL row count and the journal-to-data
ratio. Warns at 2 GB, fails at 8 GB. To reclaim:

```bash
node tools/ops/disk-guard.mjs --purge
```

`--purge` refuses to run while anything holds a connection to the dev database,
copies every namespace's `.pglite` to `E:\ai-driver-backups\` first, stops the
daemon, deletes only the three `durable-streams.sqlite*` files (leaving
`server.json` / `server.lock`), and restarts. Take a logical dump too if the dev
data matters to you — the schema rebuilds from 8 migrations plus
`node scripts/seed-founder.mjs`.
