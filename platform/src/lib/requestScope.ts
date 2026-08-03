/**
 * ONE READ PER REQUEST, NOT ONE READ PER CALLER.
 *
 * The dashboard renders seven independent data functions in one `Promise.all`.
 * Each was written to be self-sufficient — every one calls `requireUser()` and
 * then fetches whatever it needs — which is the right shape for a page that
 * composes them freely, and the wrong shape for a connection pool: the same
 * `Progress` rows were read five times, the same `SimSession` rows three times
 * and the same `GamificationState` row three times, thirteen queries for one
 * paint against a pool of ten.
 *
 * React's `cache()` is the intended fix (auth/session.ts already uses it for
 * the per-request role lookup) but it cannot be gated on its own: under the
 * `react-server` condition it memoises per request
 * (node_modules/react/cjs/react.react-server.development.js:575), while under
 * the default condition — which is what vitest resolves — it is a bare
 * pass-through (node_modules/react/cjs/react.development.js:917). A test can
 * therefore never observe a `cache()` hit, and a dedupe nobody can fail on is
 * exactly the kind of "fix" that rots.
 *
 * So `cache()` keeps its job (allocating one container per server render) and
 * the memo itself lives here, where the suite can enter a scope explicitly via
 * `withRequestScope()` and count the queries a render actually issues.
 *
 * Two properties worth stating, because both are load-bearing:
 *
 *  - It memoises the PROMISE, not the value. The dashboard's callers all start
 *    inside one `Promise.all`, so the second caller usually arrives while the
 *    first query is still in flight; caching the resolved value would miss
 *    every one of them.
 *  - Outside a request it degrades to no dedupe at all, never to a shared
 *    cache. A CLI script, a background job or a unit test with an injected
 *    fake store sees every call it makes — one student's rows can never leak
 *    into another's response.
 */

import { cache } from "react";

/** Key → the in-flight (or settled) read. One map per request. */
type Scope = Map<string, Promise<unknown>>;

/**
 * The per-render container. `cache()` returns the same Map for every call
 * within one Server Component render and a fresh one everywhere else.
 */
const renderScope = cache((): Scope => new Map());

/**
 * An explicitly entered scope. Only `withRequestScope()` sets this, and only
 * tests and scripts call that — production relies on `renderScope` above.
 */
let enteredScope: Scope | null = null;

/**
 * Run `fn` inside one request scope, so reads inside it dedupe exactly as they
 * do in a server render.
 *
 * TESTS AND SCRIPTS ONLY. It is a plain module variable, not AsyncLocalStorage
 * (which would drag `node:async_hooks` into every module that imports a store,
 * including ones the client bundle can reach), so overlapping concurrent
 * scopes would share one map. Run them one at a time.
 */
export async function withRequestScope<T>(fn: () => Promise<T>): Promise<T> {
  const previous = enteredScope;
  enteredScope = new Map();
  try {
    return await fn();
  } finally {
    enteredScope = previous;
  }
}

function currentScope(): Scope {
  return enteredScope ?? renderScope();
}

/** Values allowed in a scope key — anything with a stable `toString`. */
export type ScopeKeyPart = string | number | boolean | null;

/**
 * Wrap a read so that all callers within one request share a single execution.
 *
 * `name` namespaces the key, so two different reads that happen to take the
 * same arguments (both keyed by `userId`) never collide.
 */
export function requestScoped<A extends readonly ScopeKeyPart[], R>(
  name: string,
  load: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args: A): Promise<R> => {
    const scope = currentScope();
    const key = scopeKey(name, args);
    const inFlight = scope.get(key);
    if (inFlight !== undefined) return inFlight as Promise<R>;
    const pending = load(...args);
    scope.set(key, pending);
    return pending;
  };
}

/**
 * Forget one memoised read.
 *
 * A write must call this for the row it just changed: a request that reads,
 * writes and reads again (`recordActivity` → `saveState` → a later
 * `getState`) has to see its own write, and a memo without an eviction path
 * would hand it the pre-write row.
 */
export function invalidateRequestScoped(
  name: string,
  ...args: ScopeKeyPart[]
): void {
  currentScope().delete(scopeKey(name, args));
}

/**
 * `name::arg::arg`. The separator only has to be absent from the arguments
 * actually used as keys — cuids ([a-z0-9]) and epoch milliseconds — so `::`
 * costs nothing and stays readable in a debugger.
 */
function scopeKey(name: string, args: readonly ScopeKeyPart[]): string {
  return args.length === 0 ? name : [name, ...args].join("::");
}
