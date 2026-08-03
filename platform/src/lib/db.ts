import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * THE POOL IS THE CEILING, AND UNTIL NOW NOBODY HAD SET IT.
 *
 * `new PrismaPg({ connectionString })` hands the string to `pg.Pool` and takes
 * every default: `max` 10, and `connectionTimeoutMillis` unset — which pg
 * reads as 0, which means WAIT FOREVER. So the eleventh concurrent query did
 * not fail, it queued silently behind the ten in flight, and a page that
 * fanned out to more reads than the pool could hold simply stopped painting
 * with no error anywhere to explain it.
 *
 * The `connection_limit` / `pool_timeout` / `connect_timeout` parameters in the
 * DATABASE_URL are not the tuning they look like: they are Prisma ENGINE
 * parameters, honoured only by the Rust query engine's own pool. With a driver
 * adapter there is no Rust pool — pg-connection-string passes unknown query
 * parameters through as raw strings and `pg.Pool` reads none of them. That
 * `connection_limit=10` in .env has never once been applied.
 *
 * Each number below buys one specific thing:
 *
 *  - max 20 — headroom for one page's fan-out plus whatever else the box is
 *    serving. The dashboard render is down to six queries, but six is a floor
 *    for ONE visitor; the pool is shared by every concurrent request, the
 *    webhook handler and the cron.
 *  - connectionTimeoutMillis 5000 — the important one. It converts an
 *    unbounded hang into a rejected query, which the (dashboard) error
 *    boundary already renders as a card with a working „Опитай отново"
 *    (app/(dashboard)/error.tsx). A student who is shown a failure can retry;
 *    a student watching a spinner cannot.
 *  - statement_timeout 10000 — a server-side ceiling on any single statement,
 *    so one pathological query cannot hold a connection (and therefore a slot)
 *    open indefinitely. It is enforced by Postgres, not by us, which is why it
 *    still applies when the Node process is the thing that is wedged.
 */
export const POOL_MAX = 20;
export const POOL_ACQUIRE_TIMEOUT_MS = 5_000;
export const POOL_STATEMENT_TIMEOUT_MS = 10_000;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (see .env.example)");
  }
  const adapter = new PrismaPg({
    connectionString,
    max: POOL_MAX,
    connectionTimeoutMillis: POOL_ACQUIRE_TIMEOUT_MS,
    statement_timeout: POOL_STATEMENT_TIMEOUT_MS,
  });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
