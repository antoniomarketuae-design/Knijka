// -----------------------------------------------------------------------------
// auth.test.mjs — THE 81 LANES THAT DIED OF A RATE LIMIT AND WERE FILED AS A
// WRONG PASSWORD.
//
//   node --test tools/mobile/lib/__tests__/auth.test.mjs
//   (or `node scripts/tools-tests.mjs` from platform/, which discovers it)
//
// THE DEFECT, measured over the whole of `.audit-frames/sweep161` on 2026-08-18:
//
//   653 lanes · 663 sign-in submits · 81 refusals · 826.8 min span
//   RATE_LIMITS.login = 10 per 600 s PER IP  ->  820 permits over that span
//
// Five BROKEN findings were routed to auth.mjs off logs ending
// „no session cookie after sign-in. Form said: … Грешен имейл или парола",
// and every one of them read that as a credentials problem. The same hardcoded
// address and password were ACCEPTED 582 times in the same sweep, and
// `sc-ov-crest-curve/pc-right/RUN.log` shows one refusal (line 11) followed
// seconds later by a success (line 17) in the same file. A password is not
// wrong and then right.
//
// The string is generic BY DESIGN — login-form.tsx maps every `res.error` to
// it, with the comment "Always regeneric — must not reveal whether the e-mail
// exists" — so no amount of reading the page could have produced a true
// diagnosis. Only the response can. These tests drive `signIn` against a fake
// Playwright page that replays the exact bytes the server sends.
//
// THE TWO DIRECTIONS, because a retry that fires on everything is worth exactly
// as much as one that fires on nothing:
//
//   A RATE LIMIT MUST BE SURVIVED — a 429 with a Retry-After is waited out and
//     the second submit succeeds. Against the old code this FAILS: it had no
//     retry at all, polled cookies for the full 300 s, and threw.
//
//   A REJECTION MUST NOT BE — `error=CredentialsSignin` fails on the FIRST
//     attempt, with no second submit and no wait. Against the old code the
//     wait assertion FAILS (it burned 300 s of poll before it looked at
//     anything) and the message assertion FAILS (it quoted the form). Against a
//     lazy "just retry everything" fix the submit-count assertion FAILS, which
//     is the point: five more attempts would trip LOGIN_LOCKOUT (freeAttempts
//     5) and the harness would then be reporting a lockout it manufactured.
//
//   A CACHED SESSION MUST BE THE RIGHT PERSON'S — reuse happens only when
//     `GET /api/auth/session` hands back a live session whose e-mail matches.
//     A session for somebody else, or none at all, falls through to a real
//     sign-in. Without both halves the cache is either useless or a way to
//     measure a whole sweep as the wrong account.
//
// TIME IS VIRTUAL HERE. The fake page's `waitForTimeout` advances a stubbed
// `Date.now` instead of sleeping, so a 300 s poll costs no wall clock and is
// still counted — which is how "a refusal now costs 0 ms of polling instead of
// 300,000" becomes an assertion rather than a claim.
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const CACHE_DIR = mkdtempSync(join(tmpdir(), "knijka-auth-test-"));
process.env.KNIJKA_SESSION_CACHE_DIR = CACHE_DIR;
process.on("exit", () => rmSync(CACHE_DIR, { recursive: true, force: true }));

// SESSION_CACHE_DIR is read at module load, so the env has to be set first —
// hence the dynamic import rather than a static one.
const {
  SIGNIN_ATTEMPTS,
  SIGNIN_OK,
  SIGNIN_RATE_LIMITED,
  SIGNIN_REJECTED,
  SIGNIN_SERVER_ERROR,
  SIGNIN_UNSEEN,
  SIGNIN_WAIT_CAP_MS,
  classifySignInResponse,
  liveSessionEmail,
  reuseCachedSession,
  sessionCachePath,
  signIn,
  signInRetryPlan,
} = await import("../auth.mjs");

// ── THE NETWORK IS REAL HERE, ON LOOPBACK ────────────────────────────────────
//
// These tests used to replace `globalThis.fetch`. They cannot any more, and
// should not: O25 is a defect OF THE TRANSPORT — a successful global fetch can
// abort node during handle teardown and replace the process's exit code with
// 127 — so auth.mjs moved to `node:http`, and a test that swaps the transport
// out for a function would be testing the one thing that is not shipped. The
// stub also hid the failure by construction: every case it replayed either
// threw or answered from memory, and the abort needs a socket that succeeded.
//
// So: one loopback server for the file, scripted per test through
// `sessionHandler`, plus a port nothing listens on for the offline cases
// (`http://127.0.0.1:9`, the same address navigation.test.mjs uses). It costs
// milliseconds and it exercises the bytes.
const DEAD = "http://127.0.0.1:9";
let sessionHandler = () => ({ status: 500, body: "" });
const server = createServer((req, res) => {
  if ((req.url ?? "").startsWith("/api/auth/session")) {
    const { status = 200, body = "", headers } = sessionHandler(req) ?? {};
    res.writeHead(status, headers ?? { "content-type": "application/json" });
    res.end(body);
    return;
  }
  // Everything else is a page being warmed. `warmFromNode` reads it to the end
  // and keeps none of it; the body is here so that the read is a real read.
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<html><body>warm</body></html>");
});
const LIVE = await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
});
// Unref'd so a forgotten close cannot hang the runner — the loop must not be
// held open by the fixture.
server.unref();

const BASE = LIVE;
const CREDS = { email: "founder@knijka.ai", password: "Knijka2026!" };
const SESSION_COOKIE = { name: "authjs.session-token", value: "a-real-one", domain: "127.0.0.1", path: "/" };

// ── the exact bytes the server sends ─────────────────────────────────────────
// `tooManyRequestsResponse` (platform/src/modules/security/request.ts) — status,
// Retry-After header and body copied field for field.
const RATE_LIMITED = {
  status: 429,
  headers: { "retry-after": "412", "cache-control": "no-store" },
  body: JSON.stringify({
    error: "rate_limited",
    rule: "login",
    retryAfterSec: 412,
    messageBg: "Твърде много опити.",
    url: `${BASE}/login?error=RateLimited`,
  }),
};
// next-auth's `redirect:false` shape for a genuinely wrong password.
const REJECTED = {
  status: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: `${BASE}/login?error=CredentialsSignin` }),
};
const ACCEPTED = {
  status: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: `${BASE}/dashboard` }),
};

/**
 * A Playwright page with the six surfaces `signIn` touches, and a script of one
 * response per submit. `setsCookie` on an entry means the browser committed the
 * Set-Cookie, which is the only thing `signIn` accepts as proof.
 */
function fakePage(script) {
  const state = {
    submits: 0,
    waitedMs: 0,
    // Every read of the cookie jar: one per `warmFromNode` (it builds a Cookie
    // header), one per trip round the cookie-poll loop, one for `cacheSession`.
    // The poll is the term that mattered — the old code ran it to 600 (300 s at
    // 500 ms) on every failure before it looked at why.
    cookieReads: 0,
    now: 1_760_000_000_000,
    cookies: [],
    added: [],
    values: {},
    gotos: [],
    formText: "Имейл Парола Покажи Грешен имейл или парола. Влез",
    listeners: [],
  };

  const context = {
    cookies: async () => {
      state.cookieReads += 1;
      return state.cookies.slice();
    },
    addCookies: async (c) => {
      state.added.push(...c);
      state.cookies.push(...c);
    },
  };

  const locator = (selector) => ({
    click: async () => {},
    press: async () => {},
    pressSequentially: async (value) => {
      state.values[selector] = value;
    },
    innerText: async () => state.formText,
  });

  const page = {
    on: (event, fn) => {
      if (event === "response") state.listeners.push(fn);
    },
    off: (event, fn) => {
      const i = state.listeners.indexOf(fn);
      if (i >= 0) state.listeners.splice(i, 1);
    },
    context: () => context,
    goto: async (url) => {
      state.gotos.push(url);
    },
    waitForSelector: async () => {},
    locator,
    $eval: async (selector) => state.values[selector],
    waitForTimeout: async (ms) => {
      state.waitedMs += ms;
      state.now += ms;
    },
    url: () => `${BASE}/login`,
    click: async () => {
      const entry = script[Math.min(state.submits, script.length - 1)];
      state.submits += 1;
      if (entry.setsCookie) state.cookies.push({ ...SESSION_COOKIE });
      const response = {
        url: () => `${BASE}/api/auth/callback/credentials`,
        status: () => entry.status,
        allHeaders: async () => entry.headers ?? {},
        text: async () => entry.body ?? "",
      };
      for (const fn of state.listeners.slice()) await fn(response);
    },
  };
  return { page, state };
}

/** Run `fn` with `Date.now` reading the fake page's virtual clock. */
async function withVirtualClock(state, fn) {
  const real = Date.now;
  Date.now = () => state.now;
  try {
    return await fn();
  } finally {
    Date.now = real;
  }
}

/**
 * Script the loopback server's /api/auth/session for one test, and put it back.
 * Same shape `stubFetch` had, so every assertion below is unchanged — only the
 * thing being scripted moved from a function to a socket.
 */
function serveSession(handler) {
  const previous = sessionHandler;
  sessionHandler = handler;
  return () => {
    sessionHandler = previous;
  };
}
/** No session behind this cookie, whatever the cookie is. */
const NO_SESSION = () => ({ status: 500, body: "" });

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE CLASSIFIER — the whole fix rests on telling these two apart, and the
//    rendered form cannot.
// ─────────────────────────────────────────────────────────────────────────────

test("a 429 is a rate limit, and carries the rule and the Retry-After", () => {
  const v = classifySignInResponse({
    status: RATE_LIMITED.status,
    retryAfter: RATE_LIMITED.headers["retry-after"],
    body: RATE_LIMITED.body,
  });
  assert.equal(v.kind, SIGNIN_RATE_LIMITED);
  assert.equal(v.rule, "login");
  assert.equal(v.retryAfterSec, 412);
});

test("error=CredentialsSignin is a rejection, not a rate limit", () => {
  const v = classifySignInResponse({ status: 200, body: REJECTED.body });
  assert.equal(v.kind, SIGNIN_REJECTED);
  assert.equal(v.error, "CredentialsSignin");
});

test("a 200 with no error= is acceptance; a 5xx is the box; nothing seen is unseen", () => {
  assert.equal(classifySignInResponse({ status: 200, body: ACCEPTED.body }).kind, SIGNIN_OK);
  assert.equal(classifySignInResponse({ status: 503, body: "" }).kind, SIGNIN_SERVER_ERROR);
  assert.equal(classifySignInResponse(null).kind, SIGNIN_UNSEEN);
});

test("a 429 with no usable Retry-After waits a whole window rather than zero", () => {
  // A zero-length wait would re-spend the budget on the same instant and turn
  // one 429 into SIGNIN_ATTEMPTS of them.
  const v = classifySignInResponse({ status: 429, retryAfter: "not-a-number", body: "{}" });
  assert.equal(v.kind, SIGNIN_RATE_LIMITED);
  assert.equal(v.retryAfterSec, 600); // RATE_LIMITS.login.windowSec
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. THE POLICY — retry the server's problems, never a rejection.
// ─────────────────────────────────────────────────────────────────────────────

test("a rate limit is retried and waits past the stated Retry-After", () => {
  const plan = signInRetryPlan({ kind: SIGNIN_RATE_LIMITED, retryAfterSec: 30, why: "" }, 1);
  assert.equal(plan.retry, true);
  assert.equal(plan.waitMs, 31_000);
});

test("a rejection is NEVER retried — not on attempt 1, not on any attempt", () => {
  for (let attempt = 1; attempt <= SIGNIN_ATTEMPTS; attempt += 1) {
    assert.equal(signInRetryPlan({ kind: SIGNIN_REJECTED, why: "" }, attempt).retry, false);
  }
});

test("the retry ladder ends, and no single wait exceeds the cap", () => {
  const last = signInRetryPlan({ kind: SIGNIN_RATE_LIMITED, retryAfterSec: 30, why: "" }, SIGNIN_ATTEMPTS);
  assert.equal(last.retry, false);
  const absurd = signInRetryPlan({ kind: SIGNIN_RATE_LIMITED, retryAfterSec: 99_999, why: "" }, 1);
  assert.equal(absurd.waitMs, SIGNIN_WAIT_CAP_MS);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. THE LANE — the 81 refusals, replayed.
// ─────────────────────────────────────────────────────────────────────────────

test("a rate-limited sign-in is waited out and the next attempt succeeds", async () => {
  const { page, state } = fakePage([
    { ...RATE_LIMITED },
    { ...ACCEPTED, setsCookie: true },
  ]);
  const restore = serveSession(NO_SESSION);
  try {
    await withVirtualClock(state, () => signIn(page, CREDS, BASE));
  } finally {
    restore();
  }

  // OLD BEHAVIOUR: one submit, 600 cookie polls, then a throw. This is the
  // assertion that recovers the 81 lanes.
  assert.equal(state.submits, 2);
  // 250 ms of fillCredentials settle per attempt, plus one backoff of the
  // server's own 412 s Retry-After + the 1 s edge margin. No poll time at all.
  assert.equal(state.waitedMs, 250 + 413_000 + 250);
  // Per attempt: one warm + one poll. Plus the one cacheSession makes to read
  // what to save. Five. The old code's single attempt spent 601 on its own.
  assert.equal(state.cookieReads, 5);
  assert.ok(
    state.cookies.some((c) => c.name === "authjs.session-token"),
    "the session cookie is still the only accepted proof",
  );
});

test("a genuinely wrong password fails on the FIRST submit, fast, and says why", async () => {
  const { page, state } = fakePage([{ ...REJECTED }]);
  const restore = serveSession(NO_SESSION);
  let error;
  try {
    await withVirtualClock(state, () => signIn(page, CREDS, BASE)).catch((e) => {
      error = e;
    });
  } finally {
    restore();
  }

  assert.ok(error, "a rejected credential must still fail — this is the false-pass guard");
  // Against a "retry everything" fix this is 6, and the account would be
  // locked out by LOGIN_LOCKOUT before the sixth landed.
  assert.equal(state.submits, 1);
  // One warm read plus ONE poll. Against the OLD code this is 601 — it polled
  // the full 300 s deadline before it ever looked at why, which is where ~6.7
  // hours of sweep161 went (81 refusals × 300 s).
  assert.equal(state.cookieReads, 2);
  // The only wait left is fillCredentials' own 250 ms settle; not one 500 ms poll.
  assert.equal(state.waitedMs, 250);
  // Against the OLD code the message was the form's generic sentence.
  assert.match(error.message, /CredentialsSignin/);
  assert.doesNotMatch(
    error.message.split("Form said")[0],
    /Грешен имейл или парола/,
    "the diagnosis must not be the string the app prints for every failure alike",
  );
});

test("a rate limit that never lifts gives up with the CAUSE, not with 'wrong password'", async () => {
  const { page, state } = fakePage([{ ...RATE_LIMITED }]);
  const restore = serveSession(NO_SESSION);
  let error;
  try {
    await withVirtualClock(state, () => signIn(page, CREDS, BASE)).catch((e) => {
      error = e;
    });
  } finally {
    restore();
  }
  assert.ok(error);
  assert.equal(state.submits, SIGNIN_ATTEMPTS);
  assert.match(error.message, /rate_limited/);
  assert.match(error.message, /THIS IS NOT A BAD PASSWORD/);
  assert.match(error.message, /10 POSTs \/ 10 min PER IP/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. THE CAUSE — 663 sign-ins where a handful would do.
// ─────────────────────────────────────────────────────────────────────────────

test("a cached session whose e-mail the server confirms is reused, and skips the form", async () => {
  writeCache(CREDS.email, [SESSION_COOKIE]);
  const { page, state } = fakePage([{ ...ACCEPTED, setsCookie: true }]);
  const restore = serveSession(sessionServing(CREDS.email));
  try {
    await signIn(page, CREDS, BASE);
  } finally {
    restore();
  }
  // The whole point: nothing was POSTed to the budgeted endpoint.
  assert.equal(state.submits, 0);
  assert.deepEqual(state.added, [SESSION_COOKIE]);
});

test("a cached session belonging to SOMEBODY ELSE is refused and the form is driven", async () => {
  writeCache(CREDS.email, [SESSION_COOKIE]);
  const { page, state } = fakePage([{ ...ACCEPTED, setsCookie: true }]);
  const restore = serveSession(sessionServing("someone.else@knijka.ai"));
  try {
    await withVirtualClock(state, () => signIn(page, CREDS, BASE));
  } finally {
    restore();
  }
  // A cache that handed back the wrong account would measure a whole sweep as
  // the wrong person — a false pass one layer down from the one being fixed.
  assert.equal(state.submits, 1);
  assert.deepEqual(state.added, []);
});

test("no live session behind the cached cookie means no reuse", async () => {
  writeCache(CREDS.email, [SESSION_COOKIE]);
  const { page } = fakePage([]);
  const restore = serveSession(() => ({ status: 200, body: "null" }));
  try {
    assert.equal(await reuseCachedSession(page, CREDS, BASE), false);
  } finally {
    restore();
  }
});

// ── THE STATUS CHECK, ASSERTED WHERE IT CAN ACTUALLY FAIL ────────────────────
// The first version of the list below refused a 304 and a 302 with EMPTY
// bodies, and the mutation run showed the whole status check could then be
// DELETED with this test still green: an empty body fails to parse and returns
// null anyway, so every case was being decided by JSON.parse rather than by the
// rule under test. A non-2xx must be refused BECAUSE IT IS A NON-2XX, so each
// of those cases now carries a perfectly well-formed session for the real
// address — which is the only shape that can tell the two rules apart.
const BELIEVABLE = JSON.stringify({ user: { email: "founder@knijka.ai" }, expires: "2099-01-01" });

test("liveSessionEmail returns null on every doubtful answer, never a guess", async () => {
  const cases = [
    ["a 500", () => ({ status: 500, body: "" })],
    ["a non-JSON body", () => ({ status: 200, body: "<html>" })],
    ["a session with no user", () => ({ status: 200, body: JSON.stringify({ expires: "x" }) })],
    ["a 500 carrying a session-shaped body", () => ({ status: 500, body: BELIEVABLE })],
    ["a 304 carrying a session-shaped body", () => ({ status: 304, body: BELIEVABLE })],
    ["a 302 to /login carrying one too", () => ({ status: 302, body: BELIEVABLE, headers: { location: "/login" } })],
    // 429 is not hypothetical here: this harness exists because the login
    // budget answers 429, and `tooManyRequestsResponse` returns JSON.
    ["a 429 from the rate limiter", () => ({ status: 429, body: BELIEVABLE })],
  ];
  for (const [what, handler] of cases) {
    const restore = serveSession(handler);
    try {
      assert.equal(await liveSessionEmail(BASE, "authjs.session-token=x"), null, what);
    } finally {
      restore();
    }
  }
  // And a refused connection, which is the whole of the "server is not there"
  // class now that there is no fetch to throw on command.
  assert.equal(await liveSessionEmail(DEAD, "authjs.session-token=x"), null, "a refused connection");
});

test("liveSessionEmail is bounded by its own timeout, not by the server's patience", async () => {
  // THE FAILURE THIS FORBIDS is the one `httpGet` was written around: node's
  // `timeout` option is an INACTIVITY timer, so a server that sends headers and
  // then falls silent resets it for ever. The old code used
  // `AbortSignal.timeout`, which is total; this asserts the replacement is too.
  const restore = serveSession(() => null); // handler returns nothing: never responds
  const silent = createServer(() => {
    /* accept the socket and answer nothing, ever */
  });
  const url = await new Promise((resolve) => {
    silent.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${silent.address().port}`));
  });
  silent.unref();
  const started = Date.now();
  try {
    assert.equal(await liveSessionEmail(url, "authjs.session-token=x", 400), null);
    const spent = Date.now() - started;
    assert.ok(spent >= 300, `gave up in ${spent}ms — that is not the timeout doing it`);
    assert.ok(spent < 5_000, `waited ${spent}ms on a 400ms budget`);
  } finally {
    restore();
    silent.close();
  }
});

test("the cache key separates accounts and base URLs", () => {
  assert.notEqual(sessionCachePath(BASE, "a@x.io"), sessionCachePath(BASE, "b@x.io"));
  assert.notEqual(sessionCachePath(BASE, CREDS.email), sessionCachePath("https://other.test", CREDS.email));
});

function writeCache(email, cookies) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(sessionCachePath(BASE, email), JSON.stringify({ savedAt: Date.now(), baseUrl: BASE, cookies }));
}

/** A /api/auth/session that reports the given signed-in address. */
function sessionServing(email) {
  return () => ({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user: { email }, expires: "2099-01-01" }),
  });
}
