import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The pool the whole product shares.
 *
 * Nothing here talks to Postgres — it asserts the CONFIGURATION handed to
 * pg.Pool, because that configuration was empty and the defaults it fell
 * through to are what capped the product: max 10 and an unset acquire timeout,
 * which pg reads as 0, which means block forever.
 */

const h = vi.hoisted(() => ({ configs: [] as unknown[] }));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    constructor(config: unknown) {
      h.configs.push(config);
    }
  },
}));

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class {},
}));

interface PoolConfig {
  connectionString?: string;
  max?: number;
  connectionTimeoutMillis?: number;
  statement_timeout?: number;
}

async function loadPoolConfig(): Promise<PoolConfig> {
  const mod = await import("./db");
  expect(mod.db, "the module must construct a client").toBeDefined();
  expect(h.configs, "PrismaPg was constructed exactly once").toHaveLength(1);
  return h.configs[0] as PoolConfig;
}

describe("the Prisma pg pool", () => {
  beforeEach(() => {
    h.configs.length = 0;
    // db.ts memoises the client on globalThis outside production.
    delete (globalThis as { prisma?: unknown }).prisma;
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/knijka");
  });

  it("raises max above pg-pool's default of 10", async () => {
    // One dashboard render alone used to want 13 connections. Ten is not a
    // budget for a page — it is a budget for the whole process, shared with
    // every other concurrent request, the Stripe webhook and the cron.
    const config = await loadPoolConfig();
    expect(config.max, "pg.Pool defaults max to 10 when this is unset").toBe(20);
  });

  it("bounds how long a query may wait for a connection", async () => {
    // THE finding. `connectionTimeoutMillis` unset means 0 to pg, and 0 means
    // wait forever: the 11th concurrent query did not fail, it hung, and the
    // page simply never painted with nothing logged anywhere to say why.
    // A finite timeout turns that into a rejection the error boundary renders.
    const config = await loadPoolConfig();
    expect(
      config.connectionTimeoutMillis,
      "0 or undefined both mean 'block forever' to pg-pool",
    ).toBe(5_000);
    expect(config.connectionTimeoutMillis).toBeGreaterThan(0);
  });

  it("caps any single statement server-side", async () => {
    // Enforced by Postgres, so it still applies when the Node process is the
    // thing that is wedged — a runaway query cannot hold a pool slot forever.
    const config = await loadPoolConfig();
    expect(config.statement_timeout).toBe(10_000);
  });

  it("still passes the connection string through", async () => {
    const config = await loadPoolConfig();
    expect(config.connectionString).toBe(
      "postgresql://u:p@localhost:5432/knijka",
    );
  });

  it("does not leave the tuning to the URL's Prisma-engine parameters", async () => {
    // .env carries connection_limit / pool_timeout / connect_timeout. Those are
    // read by the Rust query engine's own pool, and with a driver adapter there
    // is no Rust pool: pg-connection-string passes unknown parameters through
    // as raw strings and pg.Pool reads none of them. If the pool config were
    // ever reduced back to just the URL, this fails.
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://u:p@localhost:5432/knijka?connection_limit=10&pool_timeout=0",
    );
    const config = await loadPoolConfig();
    expect(Object.keys(config).sort()).toEqual([
      "connectionString",
      "connectionTimeoutMillis",
      "max",
      "statement_timeout",
    ]);
  });
});
