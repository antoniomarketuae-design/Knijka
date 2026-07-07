# Книжка.AI — platform

Next.js 16 app (TypeScript, App Router, Tailwind 4, Prisma 7 + Postgres, Auth.js, Stripe, Anthropic API). This package is the product; **strategy and architecture live in [`../docs/`](../docs/README.md)** — code follows docs, and architectural changes get an ADR first (see root `CLAUDE.md`).

## Run locally

Prereqs: Node 20+, npm.

```bash
cd platform
npm install

# 1. Environment
cp .env.example .env        # then fill in values (see comments in the file)

# 2. Database — local Prisma Postgres (simplest), leave it running:
npx prisma dev
#    …or point DATABASE_URL at any Postgres you have.

# 3. Apply migrations (prisma/migrations/000_init):
npx prisma migrate deploy

# 4. Go
npm run dev                 # http://localhost:3000
```

Minimum `.env` to boot: `DATABASE_URL`, `AUTH_SECRET` (`openssl rand -base64 32`). Without `ANTHROPIC_API_KEY` the AI tutor is disabled; without Stripe keys the pricing page shows disabled buttons and the webhook answers 503 — the app runs fine either way.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest |
| `npm run validate:content` | Validates `../content/` JSON against the schema contract |
| `node scripts/generate-icons.mjs` | Regenerates PWA icons, favicon and `public/og.png` from the SVG mark (sharp). Outputs are committed — run only when the mark changes |
| `node scripts/sim-harness.mjs` | Simulator rule-engine harness |

## Layout

```
src/app/         routes (App Router) — (auth), (dashboard), onboarding, api/
src/modules/     business logic behind public index.ts APIs — auth, learning,
                 exam, tutor, payments, gamification, sim
src/components/  presentational components per feature area
src/lib/         db client, content loaders
prisma/          schema + migrations (user state only — learning content is
                 file-based in ../content/)
public/icons/    generated app icons (see scripts/generate-icons.mjs)
```

Hard boundary: modules talk only through their public `index.ts` (docs/architecture/05). Business logic stays out of components.

## PWA & onboarding notes

- `src/app/manifest.ts` + `public/icons/` make the app installable (requires https in prod; verify in DevTools → Application → Manifest).
- `/onboarding` runs once after registration; answers are stored in versioned localStorage keys — see `src/components/onboarding/storage.ts` for the keys and the planned server-side migration.

## Deploying

See [`../docs/development/54_DEPLOYMENT_STRATEGY.md`](../docs/development/54_DEPLOYMENT_STRATEGY.md) — Vercel + Neon (EU), env checklist, Stripe webhook setup, and the pre-launch gates (content review + legal pages).
