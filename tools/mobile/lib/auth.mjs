// -----------------------------------------------------------------------------
// auth.mjs — sign in, and PROVE it.
//
// The failure this guards against, verbatim from the brief: "A WebKit sweep
// that is not signed in measures the login page six times and looks like data
// — that happened." So every navigation in this harness goes through
// `gotoAuthenticated`, which fails loudly if the final URL is /login instead of
// quietly measuring the wrong page.
//
// The sign-in itself drives the REAL form (next-auth credentials via
// signIn()), not a fabricated cookie: a hand-minted JWT would sail past
// src/proxy.ts and then fail differently inside requireUser(), which is the
// kind of half-authenticated state that produces numbers nobody can reproduce.
//
// ── THE SWEEP161 REFUSALS, AND WHY THIS FILE BLAMED THE WRONG THING ──────────
//
// Five BROKEN findings were routed here off logs that all end the same way:
//
//     Error: [mobile-harness] no session cookie after sign-in.
//     Form said: Имейл Парола Покажи Грешен имейл или парола. Влез
//
// and the audit read that string the only way it could be read — as a
// credentials problem. It is not one. Measured over the whole of
// `.audit-frames/sweep161` (2026-08-18):
//
//   653 lanes · 663 sign-in submits · 81 refusals (12.2%) · 826.8 min span
//
// The other 582 submits used THE SAME hardcoded credentials and were accepted.
// `sc-ov-crest-curve/pc-right/RUN.log` settles it on its own: the refusal at
// line 11 is followed at line 17 by a fresh sign-in, same address, same
// password, seconds later — which succeeds and drives 45 frames. A password is
// not wrong and then right.
//
// What actually happened is a RATE LIMIT, and the arithmetic is exact:
//
//   platform/src/modules/security/policy.ts
//     RATE_LIMITS.login = { limit: 10, windowSec: 600 }   // per IP
//   rateLimitForRequest() applies it to every POST /api/auth/callback/*
//   src/proxy.ts consumes it before the handler and answers 429.
//
//   10 permits / 10 min × 826.8 min  =  820 permitted sign-ins
//   the sweep asked for                 663
//
// i.e. the sweep ran at 81% of the ceiling ON AVERAGE, from one IP, through one
// tunnel — so every burst of parallel lanes spent the window and the next lane
// got a 429. 663 against 820 is the whole defect in two numbers.
//
// THE 429 THEN GOES INVISIBLE, by design. `tooManyRequestsResponse` returns
// `{error:"rate_limited", rule, retryAfterSec}` with a `url` carrying
// `error=RateLimited`; next-auth's client turns any such url into `res.error`;
// and login-form.tsx maps EVERY res.error to one string, with the comment
// "Always generic — must not reveal whether the e-mail exists." That is correct
// for a student and useless for a harness. Reading the rendered form was
// therefore never going to produce a true diagnosis — the form is built not to
// give one. So this file now reads the RESPONSE instead of the page:
// `classifySignInResponse` sees the 429, the rule name and the Retry-After,
// and the failure message says "rate limit", not "wrong password".
//
// Three consequences, in the order they matter:
//
//   1. A RATE LIMIT IS WAITED OUT, a rejection is not. `signInRetryPlan`
//      retries ONLY 429 and 5xx — server states that say nothing about the
//      password. `error=CredentialsSignin` fails on the FIRST attempt, with no
//      retry and no wait. A false pass and a false failure are the same crime:
//      a genuinely wrong password must still fail, and must fail faster than
//      before, not slower.
//   2. A REFUSAL COSTS SECONDS, NOT FIVE MINUTES. The old loop polled cookies
//      for 300 s and only then looked at the page — so each of the 81 refusals
//      burned the full deadline, ~6.7 hours of the sweep spent waiting for a
//      cookie a 429 had already guaranteed would never arrive.
//   3. THE SWEEP STOPS SPENDING THE BUDGET IT IS BLOWING. Waiting politely
//      would just serialise 663 sign-ins behind a 10-per-10-min gate. The cause
//      is that one account signs in once per LANE; so a successful session is
//      cached and re-verified against `GET /api/auth/session` (a cookie decode,
//      deliberately unbudgeted — see rateLimitForRequest) before reuse. This is
//      NOT the hand-minted JWT the paragraph above rejects: it is a cookie a
//      real form sign-in produced, and it is used only after the server hands
//      back a live session whose e-mail matches the one we were asked for.
//
// ── AND THIS FILE'S HTTP IS NOT GLOBAL `fetch`, BECAUSE OF O25 ───────────────
//
// Four lanes of sweep161 exited 127 — a code this harness has never returned —
// and every one of them had FINISHED: `sc-ov-narrow/mobile-wrong` holds a whole
// MACHINE SUMMARY, «10 наказателни точки», НЕИЗДЪРЖАН, the collision convicted,
// 29 frames on disk. Counted from the sweep's own ledger:
//
//   .audit-frames/sweep161/progress.txt  ->  28 exit=0 · 4 exit=127 · 2 exit=1
//
// A dispatcher reading those codes re-drives or discards four healthy lanes and
// one real finding goes with them. That is a FALSE FAILURE, and it is the same
// crime as a false pass: the evidence exists, was photographed, and gets thrown
// away because the runtime tripped over its own sockets on the way out.
//
// The abort is node's, not ours, and `httpGet` below carries the measurement.
// The sign-in path is where global `fetch` entered this process — `warmFromNode`
// warms /login and every retried route from node — so this is where it leaves.
// -----------------------------------------------------------------------------
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * How long a navigation to a route that may still be compiling may take.
 * Same budget `gotoAuthenticated` uses — stated once so the two cannot drift.
 */
export const LOGIN_NAV_TIMEOUT_MS = 180_000;

/**
 * THE TOTAL A SINGLE NAVIGATION MAY SPEND, ACROSS EVERY RETRY.
 *
 * WITHOUT THIS THE RETRY LADDER MULTIPLIES OUT TO HOURS, and it did. Counted
 * from the code rather than guessed: `gotoQuiesced` makes 3 attempts of up to
 * 180 s and re-warms (up to 420 s) between them — 24.5 minutes — and the
 * offline-page check below then repeats that whole ladder up to 4 times, each
 * with another warm in front of it. Worst case is over two hours for ONE
 * iteration of ONE row. Observed on 2026-08-05: a landscape iteration sat in
 * this ladder for 31 minutes and was still going when the sweep was killed.
 *
 * Every individual timeout in there was defensible; nobody had multiplied them
 * together. That is the same shape as the other defects in this harness — each
 * piece correct, the composition never looked at — so the fix is a budget on
 * the COMPOSITION, stated once, in the currency that matters: how long a row is
 * allowed to spend before it is declared lost. Losing a run is loud now
 * (stability-probe's SAMPLE INTEGRITY block); losing an afternoon is not.
 */
export const NAV_BUDGET_MS = Number(process.env.KNIJKA_NAV_BUDGET_MS || 600_000);

/** The two POST paths `rateLimitForRequest` budgets as "login". */
const SIGNIN_POST_PATHS = ["/api/auth/callback/", "/api/auth/signin"];

/**
 * ONE GET ON `node:http`, AND DELIBERATELY NOT ON GLOBAL `fetch`.
 *
 * THE MEASUREMENT THAT DECIDED THIS, reproduced on this box on 2026-08-19,
 * node v24.18.0 / Windows 10, against a loopback server answering 2 MiB:
 *
 *     const r = await fetch(url, { signal: AbortSignal.timeout(30000),
 *                                  redirect: "manual" });
 *     await r.arrayBuffer();
 *     process.exit(6);
 *
 *     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
 *       file src\win\async.c, line 94        -> 25 trials out of 25
 *
 * A SUCCESSFUL global fetch leaves an undici client whose async handle is
 * mid-teardown, and the process aborts on top of it — so the exit code the
 * caller chose is gone. WHAT THE ABORT IS CALLED depends on the reader:
 * 3221226505 (0xC0000409, Windows fail-fast) to `child_process.execFile` and to
 * cmd, and 127 to Git Bash — which is what dispatched sweep161 and therefore
 * what its `progress.txt` recorded. Variants measured the same afternoon, same
 * server, 15–25 trials each:
 *
 *   · a 2-byte body instead of 2 MiB            -> 6, 25/25. The race needs a
 *     response big enough to still be tearing down. This is why the harness saw
 *     it on real pages and never in a unit test.
 *   · a FAILED fetch (host does not resolve)    -> 6. Every existing test of
 *     this harness's exit codes uses an unresolvable host, which is exactly why
 *     none of them ever caught it.
 *   · a fetch whose body is NEVER READ          -> 6, 12/12; and 12/12 again
 *     with `res.body.cancel()`. THE BODY MUST BE DRAINED for the race to
 *     exist, which is what routes this fix to THIS function and not to
 *     `lib/server.mjs`'s liveness probe, which reads only the status line.
 *   · ≥100 ms between the fetch and the exit    -> 6, 8/8. It is a race, not a
 *     poisoned process — which is why sweep161 lost 4 lanes of 34 and not all
 *     of them, and why it cannot be relied on to show up on demand.
 *   · `process.exitCode` with no `exit()`       -> 6, 15/15, in 277 ms
 *   · node:http with `agent: false`             -> 6, 15/15, in 166 ms
 *
 * The last is the only remedy that survives a caller that DOES call `exit()`,
 * and it also removes any dependence on the global dispatcher's keep-alive pool
 * — which is shared with whatever else the process has fetched, so a fix that
 * only changed this file's exit would still be at the mercy of another
 * module's socket. `lib/target.mjs` reached the same conclusion for its own
 * refusals; this is the same decision at the other end of the same process.
 *
 * ONE DRAINING `fetch` IS STILL IN THE HARNESS AND IS NOT IN THIS FILE:
 * `lib/measure.mjs` `warmRoutes()` does `await res.arrayBuffer()` once per
 * route, and `cli.mjs` runs it. That is why cli.mjs also stopped calling
 * `process.exit()` — the two remedies are belt and braces, and the transport
 * half for measure.mjs belongs to whoever owns that file.
 *
 * `maxBytes: 0` drains and discards, which is what a warm wants: the body is
 * read to the end (that is what forces the compile) and never accumulated.
 *
 * @returns {Promise<{status:number,bytes:number,body:string}>}
 */
export function httpGet(url, { headers = {}, timeoutMs = 30_000, maxBytes = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const href = String(url);
    const client = href.startsWith("https:") ? https : http;
    let bytes = 0;
    let body = "";

    // `signal: AbortSignal.timeout(…)`, WHICH IS THE SAME DEADLINE THE `fetch`
    // HERE USED TO CARRY — kept deliberately, and not only because
    // settle.test.mjs reads this file for it. That deadline is TOTAL. node's own
    // `timeout` request option is an INACTIVITY timer, so a server that dribbles
    // one byte a second resets it for ever, and the failure this guards is
    // exactly that shape: MEASURED 2026-08-05, Turbopack ran a filesystem cache
    // compaction for 7.0 minutes, the dev server stopped answering mid-response,
    // and a warm with no deadline sat on the connection until the run was killed
    // at 15.5 minutes having printed nothing. Swapping the transport must not
    // quietly swap the timeout semantics with it; lib/__tests__/exit-integrity
    // asserts both halves against a real trickling socket.
    //
    // No redirect following, exactly like the `redirect: "manual"` it replaces:
    // a 302 to /login is an ANSWER about this route, not a reason to go and
    // measure another one.
    const req = client.get(
      href,
      { agent: false, headers, signal: AbortSignal.timeout(timeoutMs) },
      (res) => {
        if (maxBytes > 0) res.setEncoding("utf8");
        res.on("data", (chunk) => {
          bytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
          if (maxBytes > 0 && body.length < maxBytes) body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, bytes, body }));
        // Attached, not decorative: an unhandled 'error' on a stream ends the
        // process, and an abort mid-body emits one here as well as on the
        // request. The promise is already settled by then and ignores the second.
        res.on("error", reject);
      },
    );
    req.on("error", reject);
  });
}

/** What the SERVER said about a sign-in — never what the form rendered. */
export const SIGNIN_OK = "ok";
export const SIGNIN_RATE_LIMITED = "rate-limited";
export const SIGNIN_REJECTED = "rejected";
export const SIGNIN_SERVER_ERROR = "server-error";
export const SIGNIN_UNSEEN = "unseen";

/** How many sign-in attempts one call may make. Six covers a full 10-minute
 *  window at the observed Retry-After values without letting a lane idle for
 *  an hour; a rejection never reaches attempt 2 regardless. */
export const SIGNIN_ATTEMPTS = Number(process.env.KNIJKA_SIGNIN_ATTEMPTS || 6);

/** Ceiling on any single wait between attempts. `RATE_LIMITS.login.windowSec`
 *  is 600, so a Retry-After can legitimately ask for ten minutes; anything
 *  beyond that window is a bug on one side or the other and is clamped. */
export const SIGNIN_WAIT_CAP_MS = Number(process.env.KNIJKA_SIGNIN_WAIT_CAP_MS || 660_000);

/**
 * READ THE RESPONSE, NOT THE PAGE.
 *
 * The rendered form cannot tell a rate limit from a typo — login-form.tsx maps
 * every `res.error` to one deliberately generic sentence. The response can, and
 * carries the rule name while it is at it:
 *
 *   429 + Retry-After + {error:"rate_limited", rule, retryAfterSec}
 *        -> the per-IP `login` budget (proxy.ts) or the per-e-mail lockout
 *           (api/auth/[...nextauth]/route.ts). Both are `tooManyRequestsResponse`.
 *   5xx  -> the box, not the credentials. This dev server is on a 7200 rpm HDD
 *           with a 10-slot database; it does fall over under 78 lanes.
 *   2xx/3xx whose url or Location carries `error=` -> next-auth rejected the
 *           attempt. `error=CredentialsSignin` is the real thing.
 *   2xx with no `error=` -> accepted; the cookie is on its way.
 *
 * @param {{status:number,retryAfter?:string|null,location?:string|null,body?:string}|null} observed
 */
export function classifySignInResponse(observed) {
  if (!observed) {
    return {
      kind: SIGNIN_UNSEEN,
      why: `no POST to ${SIGNIN_POST_PATHS[0]}credentials was ever observed — the form never reached the server`,
    };
  }

  let json = null;
  try {
    json = JSON.parse(observed.body ?? "");
  } catch {
    /* a non-JSON body is normal on the 302 shape; the headers still classify it */
  }

  const status = Number(observed.status);
  const rule = typeof json?.rule === "string" ? json.rule : null;
  const url = typeof json?.url === "string" ? json.url : observed.location || "";
  const error = /[?&]error=([^&#]*)/.exec(url)?.[1] ?? null;

  // Retry-After is authoritative when present; the body repeats it as
  // `retryAfterSec`. Neither is trusted blindly — a missing or nonsensical
  // value must not turn into a zero-length wait that re-spends the budget
  // immediately, so it falls back to a whole window.
  if (status === 429 || error === "RateLimited") {
    const header = Number(observed.retryAfter);
    const body = Number(json?.retryAfterSec);
    const retryAfterSec =
      Number.isFinite(header) && header > 0
        ? header
        : Number.isFinite(body) && body > 0
          ? body
          : 600;
    return {
      kind: SIGNIN_RATE_LIMITED,
      retryAfterSec,
      rule,
      why:
        `HTTP ${status || 429} rate_limited${rule ? ` (rule "${rule}")` : ""}, ` +
        `Retry-After ${retryAfterSec}s — the server refused to LOOK at these credentials`,
    };
  }

  if (status >= 500) {
    return { kind: SIGNIN_SERVER_ERROR, why: `HTTP ${status} from the sign-in endpoint — the server, not the password` };
  }

  if (error) {
    return { kind: SIGNIN_REJECTED, error, why: `next-auth rejected the attempt with error=${error}` };
  }

  if (status >= 400) {
    return { kind: SIGNIN_REJECTED, error: null, why: `HTTP ${status} from the sign-in endpoint` };
  }

  if (status >= 200) return { kind: SIGNIN_OK, why: `HTTP ${status} with no error= — accepted` };

  return { kind: SIGNIN_UNSEEN, why: `unreadable sign-in response (status ${observed.status})` };
}

/**
 * RETRY THE SERVER'S PROBLEMS. NEVER RETRY A REJECTION.
 *
 * This is the line the whole fix balances on. Retrying a 429 recovers 81 lost
 * lanes; retrying a `CredentialsSignin` would turn a wrong password into six
 * wrong passwords, trip the per-e-mail lockout in
 * api/auth/[...nextauth]/route.ts (freeAttempts 5), and then report the lockout
 * as the failure — a harness that manufactures the fault it diagnoses. So a
 * rejection returns `retry:false` at every attempt number, including the first.
 *
 * @param {{kind:string,retryAfterSec?:number}} verdict
 * @param {number} attempt 1-based
 */
export function signInRetryPlan(verdict, attempt, options = {}) {
  const attempts = options.attempts ?? SIGNIN_ATTEMPTS;
  const waitCapMs = options.waitCapMs ?? SIGNIN_WAIT_CAP_MS;

  const transient = verdict.kind === SIGNIN_RATE_LIMITED || verdict.kind === SIGNIN_SERVER_ERROR;

  // THE CAP IS CHECKED BEFORE THE KIND, deliberately. Written the other way
  // round — cap nested inside the transient branch — a later edit that adds one
  // more kind to `transient` also hands that kind an unbounded ladder, and the
  // lane hangs instead of failing. That is not hypothetical: it is what the
  // mutation run of this very function did on the first draft.
  if (attempt >= attempts) {
    return {
      retry: false,
      waitMs: 0,
      why: transient ? `gave up after ${attempts} attempt(s): ${verdict.why}` : verdict.why,
    };
  }
  if (!transient) return { retry: false, waitMs: 0, why: verdict.why };

  // +1 s past the stated Retry-After: the window is a wall clock on the server
  // and landing exactly on its edge spends an attempt on the same 429.
  const asked =
    verdict.kind === SIGNIN_RATE_LIMITED
      ? Math.max(1_000, (verdict.retryAfterSec || 600) * 1_000) + 1_000
      : Math.min(60_000, 5_000 * 2 ** (attempt - 1));
  const waitMs = Math.min(waitCapMs, asked);
  return {
    retry: true,
    waitMs,
    why: `waiting ${Math.round(waitMs / 1000)}s before attempt ${attempt + 1}/${attempts} — ${verdict.why}`,
  };
}

/**
 * Watch the sign-in POST. Playwright hands the response to a listener; the body
 * is read there because a `Response` is not readable after the page moves on.
 */
function watchSignInPosts(page) {
  const seen = [];
  const handler = async (response) => {
    try {
      const { pathname } = new URL(response.url());
      if (!SIGNIN_POST_PATHS.some((p) => pathname.startsWith(p))) return;
      const headers = (await response.allHeaders?.().catch(() => ({}))) ?? {};
      seen.push({
        status: response.status(),
        retryAfter: headers["retry-after"] ?? null,
        location: headers["location"] ?? null,
        body: (await response.text().catch(() => "")).slice(0, 2_000),
      });
    } catch {
      /* an unreadable response is not itself a failure — the cookie decides */
    }
  };
  page.on("response", handler);
  return {
    latest: () => (seen.length > 0 ? seen[seen.length - 1] : null),
    clear: () => {
      seen.length = 0;
    },
    stop: () => page.off?.("response", handler),
  };
}

/** Whatever the form is showing, for the tail of a failure message. Never the
 *  diagnosis — see the header — only corroboration for a human reading a log. */
async function formText(page) {
  const raw = await page
    .locator("form")
    .innerText()
    .catch(() => "");
  return raw.replace(/\s+/g, " ").slice(0, 200);
}

/**
 * Wait for the session cookie, and STOP THE MOMENT THE SERVER SAYS NO.
 *
 * The cookie is still the proof (see the long note at the submit site) — this
 * only adds the second exit. Order matters: cookies are checked first every
 * pass, so a response that arrives microseconds before the browser commits the
 * Set-Cookie cannot lose a race it would win on the next poll.
 */
async function waitForSessionCookie(page, watch, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const cookies = await page.context().cookies();
    if (cookies.some((c) => /authjs\.session-token/.test(c.name) && c.value)) return { ok: true };

    const observed = watch.latest();
    const verdict = classifySignInResponse(observed);
    if (observed && verdict.kind !== SIGNIN_OK) {
      return { ok: false, verdict, observed, form: await formText(page) };
    }

    if (Date.now() > deadline) {
      return {
        ok: false,
        timedOut: true,
        // A 200-with-no-error that never produced a cookie is its own fault,
        // and calling it OK here would make the caller retry a success.
        verdict: observed
          ? { kind: SIGNIN_UNSEEN, why: `accepted (HTTP ${observed.status}) but no session cookie in ${Math.round(timeoutMs / 1000)}s` }
          : verdict,
        observed,
        form: await formText(page),
      };
    }
    await page.waitForTimeout(500);
  }
}

// ── THE CACHED SESSION ───────────────────────────────────────────────────────
//
// Keyed on baseUrl + e-mail, so the rotating quick-tunnel URL invalidates it for
// free and two accounts can never collide. Written atomically because ~78 lanes
// share it; a write that loses the race costs one sign-in and nothing else.

export const SESSION_CACHE_DIR =
  process.env.KNIJKA_SESSION_CACHE_DIR || join(tmpdir(), "knijka-mobile-session");

export function sessionCachePath(baseUrl, email) {
  const key = createHash("sha256")
    .update(`${baseUrl}\n${String(email).trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
  return join(SESSION_CACHE_DIR, `${key}.json`);
}

/**
 * WHO DOES THIS COOKIE JAR ACTUALLY BELONG TO, ACCORDING TO THE SERVER?
 *
 * `GET /api/auth/session` is a cookie decode and `rateLimitForRequest` returns
 * null for it on purpose ("those must stay free"), so asking costs nothing from
 * the budget this whole change exists to stop overspending. Returns the
 * lower-cased e-mail of a LIVE session, or null. Null on anything doubtful —
 * an expired cookie, a 500, a body that is not the shape we expect — because
 * the fallback is a real sign-in, i.e. the safe direction.
 *
 * `httpGet`, not global fetch — see its header. 64 KiB is a generous cap for a
 * body whose whole content is one e-mail address and an expiry; past that it is
 * a tunnel error page, and reading it whole would turn a probe into a download.
 */
export async function liveSessionEmail(baseUrl, cookieHeader, timeoutMs = 30_000) {
  try {
    const res = await httpGet(new URL("/api/auth/session", baseUrl).toString(), {
      headers: { cookie: cookieHeader },
      timeoutMs,
      maxBytes: 64 * 1024,
    });
    // `res.ok` in fetch terms, restated: 200–299 and nothing else.
    if (res.status < 200 || res.status >= 300) return null;
    const json = JSON.parse(res.body);
    const email = json?.user?.email;
    return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Reuse a cached session, or say so and let the caller sign in properly.
 *
 * The check is deliberately strict in the direction that matters: the server
 * must return a live session AND its e-mail must be the one we were asked to
 * be. A cache that quietly handed back somebody else's session would be the
 * `rightCredited` bug one layer down — a whole sweep measured as the wrong
 * account — which is worse than the refusals it is fixing.
 */
export async function reuseCachedSession(page, credentials, baseUrl, log = () => {}) {
  if (process.env.KNIJKA_NO_SESSION_CACHE === "1") return false;
  const wanted = String(credentials.email).trim().toLowerCase();

  let cached;
  try {
    cached = JSON.parse(readFileSync(sessionCachePath(baseUrl, credentials.email), "utf8"));
  } catch {
    return false; // no cache yet, or an unreadable one — sign in for real
  }
  if (!Array.isArray(cached?.cookies) || cached.cookies.length === 0) return false;

  const header = cached.cookies
    .filter((c) => c && c.name && c.value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (!header) return false;

  const who = await liveSessionEmail(baseUrl, header);
  if (who !== wanted) {
    log(`cached session rejected (server says ${who ?? "no live session"}, wanted ${wanted}) — signing in`);
    return false;
  }

  // ── `SameSite=None` WITHOUT `Secure` IS AN INVALID COOKIE, AND CHROMIUM SAYS SO
  //
  // 2026-08-28. Every `pc` leg of the w15 sweep landed on «Влез в акаунта си» —
  // the sign-in wall — while the `mobile` legs of the SAME lessons drove and
  // returned real verdicts. Not concurrency: one driver alone reproduced it.
  //
  // The two legs are different browsers. `pc` is chromium, `mobile` is webkit
  // (lesson-audit.mjs:518). The cached cookies read back as:
  //
  //     authjs.session-token  domain=localhost secure=false sameSite=None
  //
  // and `SameSite=None` REQUIRES `Secure` — Chromium has rejected the pair since
  // Chrome 80. So `addCookies` took them and chromium never sent them, while
  // webkit, which is laxer here, sent them fine. The cache is written from
  // whichever browser signed in last, so a webkit-minted entry silently disabled
  // every chromium leg that reused it.
  //
  // WHAT MADE IT INVISIBLE, and it is the reason this is worth the paragraph: the
  // server-side check above (`liveSessionEmail`) passes — it sends the cookies as
  // a raw HTTP header, where SameSite does not apply at all. So the log line says
  // «reused a live session», truthfully, about a session the browser will not use.
  // The failure surfaced two steps later as "no verdict surface in the DOM", which
  // reads as a product defect.
  //
  // The repair is to make the cookie valid rather than to special-case a browser:
  // over plain http a `None` cookie cannot be Secure, and `Lax` is what the app
  // actually wants for a same-site session cookie. Left alone when `secure` is
  // true, because there the pair is legal and meant.
  const usable = cached.cookies.map((c) =>
    c && c.sameSite === "None" && c.secure !== true ? { ...c, sameSite: "Lax" } : c,
  );
  const repaired = usable.filter((c, i) => c !== cached.cookies[i]).length;
  try {
    await page.context().addCookies(usable);
  } catch {
    return false; // e.g. an expired cookie Playwright refuses — sign in for real
  }
  log(
    `reused a live session for ${who} — no POST to the budgeted sign-in endpoint` +
      (repaired ? ` (${repaired} cookie(s) had an invalid SameSite=None without Secure — sent as Lax)` : ""),
  );
  return true;
}

/** Best-effort. A cache we cannot write costs a sign-in, never a wrong answer. */
async function cacheSession(page, credentials, baseUrl) {
  try {
    const cookies = await page.context().cookies();
    if (!cookies.some((c) => /authjs\.session-token/.test(c.name) && c.value)) return;
    mkdirSync(SESSION_CACHE_DIR, { recursive: true });
    const file = sessionCachePath(baseUrl, credentials.email);
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ savedAt: Date.now(), baseUrl, cookies }));
    renameSync(tmp, file);
  } catch {
    /* see above */
  }
}

/**
 * @param {import("playwright").Page} page
 * @param {{email:string,password:string}} credentials
 * @param {string} baseUrl
 */
export async function signIn(page, credentials, baseUrl) {
  // A sign-in on this box costs minutes and used to print NOTHING while it did,
  // so a stall and a slow compile looked identical from the outside. Every step
  // that can take minutes says so before it starts.
  const step = (what) => console.log(`[mobile-harness] sign-in: ${what}`);

  // THE CHEAPEST SIGN-IN IS THE ONE THAT DOES NOT HAPPEN. 663 of these in
  // 826.8 minutes against a 10-per-10-minute budget is the cause; everything
  // below this line only handles what is left when the cache misses.
  if (await reuseCachedSession(page, credentials, baseUrl, step)) return;

  const watch = watchSignInPosts(page);
  try {
    await signInThroughForm(page, credentials, baseUrl, step, watch);
  } finally {
    watch.stop();
  }
  await cacheSession(page, credentials, baseUrl);

  // Stop the in-flight push to /dashboard before navigating somewhere else:
  // otherwise the first route's goto dies with "interrupted by another
  // navigation", which cost a whole device column of a baseline.
  await page
    .goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: LOGIN_NAV_TIMEOUT_MS })
    .catch(() => {});
}

/**
 * Drive the real form, and repeat ONLY for the states that belong to the server.
 *
 * The loop reloads /login on every attempt rather than re-clicking the button
 * on a page that is already showing an error: after a 429 the form's `pending`
 * flag has fallen back and its fields are disabled-then-enabled, and a re-click
 * on that DOM was the sort of half-state this harness has been burned by.
 * Reloading costs one warm and buys a form in a known condition.
 */
async function signInThroughForm(page, credentials, baseUrl, step, watch) {
  for (let attempt = 1; ; attempt += 1) {
    // A COLD /login COMPILE ON THIS BOX TAKES MINUTES, AND THIS LINE USED TO
    // ACCEPT PLAYWRIGHT'S 30 s DEFAULT.
    //
    // That single missing argument is why row C8 (doc 87:243) was never
    // re-measured and why two full sweeps died before they measured anything:
    // `page.goto: Timeout 30000ms exceeded ... navigating to /login`. It is also
    // silently worse than it looks — `waitUntil:"load"` waits for every subresource,
    // and public/sw.js answers a navigation whose fetch THREW with /offline.html,
    // so the retry could hand back a page with no #email on it and a 60 s selector
    // wait to discover that.
    //
    // Three changes, in the order that matters:
    //   1. WARM FROM NODE FIRST. A plain fetch has no service worker in front of
    //      it and no navigation timeout, so it waits for the real response however
    //      long Turbopack takes. `gotoAuthenticated` already does this on the
    //      retry path; the login page needed it on the FIRST one, because it is
    //      the one route that is always cold.
    //   2. domcontentloaded, not load — the form is interactive well before the
    //      last font arrives.
    //   3. An explicit budget, stated once, that matches the rest of the harness.
    step(`warming ${baseUrl}/login from node`);
    await warmFromNode(page, `${baseUrl}/login`);
    step("navigating to /login");
    await page.goto(`${baseUrl}/login`, {
      waitUntil: "domcontentloaded",
      timeout: LOGIN_NAV_TIMEOUT_MS,
    });
    step("waiting for the form to hydrate (#email)");
    await page.waitForSelector("#email", { timeout: 120_000 });

    // WEBKIT + A REACT-CONTROLLED type="email" INPUT DOES NOT ACCEPT
    // `page.fill()`. This is not a hydration race and it is not theoretical —
    // measured on this form, in this engine:
    //
    //   page.fill("#email", …)  -> DOM value set, React state stays ""
    //   page.fill("#password",…)-> React state SET (password works)
    //   ... the next re-render then wipes the e-mail box, the form submits with
    //       an empty e-mail, and the page says "Въведи валиден имейл адрес."
    //       while the screenshot shows the address sitting in the field.
    //
    // `fill` writes the value through the native setter and dispatches one
    // `input` event; the e-mail field in WebKit does not turn that into a React
    // change. Real key events do. So: click the field and type it, exactly like
    // a student would — then verify BOTH values survive a render, because the
    // first field only reverts once the SECOND one re-renders the form and a
    // per-field check would pass on a login that is about to fail.
    //
    // This is precisely the class of bug rule 1 exists for: in Chromium,
    // `fill` works here.
    step("typing credentials with real key events");
    await fillCredentials(page, credentials);

    // WAIT FOR THE COOKIE, NOT FOR /dashboard.
    //
    // The form's success path is `router.push("/dashboard")`, and Next's App
    // Router only commits that navigation once the destination's RSC payload
    // arrives. /dashboard is one of the slowest pages in the app: 45-70 s
    // normally on this box, and past 300 s when several lanes are hammering the
    // shared 10-slot dev database. Waiting on the URL therefore reports "login
    // broken" for a login that worked — the server log said
    // `POST /api/auth/callback/credentials 200` every single time — and it burns
    // a full page render per device for a page nobody is measuring.
    //
    // The session cookie is the actual fact we need, it appears the moment the
    // credentials POST returns, and it is what every subsequent request uses.
    // `watch.clear()` first, so attempt N never reads attempt N-1's 429 and
    // declares a fresh, healthy submit rate-limited.
    step("submitting and waiting for the session cookie");
    watch.clear();
    await page.click('button[type="submit"]');
    const outcome = await waitForSessionCookie(page, watch);
    if (outcome.ok) return;

    const plan = signInRetryPlan(outcome.verdict, attempt);
    if (!plan.retry) throw new Error(signInFailure(outcome, attempt));
    step(plan.why);
    await page.waitForTimeout(plan.waitMs);
  }
}

/**
 * The message the next reader of a RUN.log gets. It must name the CAUSE, because
 * the five sweep161 findings routed to this file were all written off the old
 * one, which quoted the form and so said "wrong password" 81 times about a rate
 * limit. The quoted form text stays — as corroboration, last, clearly labelled.
 */
function signInFailure(outcome, attempts) {
  const lines = [
    `[mobile-harness] sign-in failed after ${attempts} attempt(s): ${outcome.verdict.why}`,
  ];
  if (outcome.verdict.kind === SIGNIN_RATE_LIMITED) {
    lines.push(
      "  THIS IS NOT A BAD PASSWORD. The budget is RATE_LIMITS.login = 10 POSTs / 10 min PER IP " +
        "(platform/src/modules/security/policy.ts), consumed in src/proxy.ts. Sweep161 asked for 663 " +
        "sign-ins in 826.8 min against 820 permits and lost 81 lanes to it. Fewer sign-ins, not a new password: " +
        "the session cache above exists for exactly this, so a miss here means every lane is signing in cold.",
    );
  } else if (outcome.verdict.kind === SIGNIN_REJECTED) {
    lines.push(
      "  The server looked at these credentials and said no. NOT retried on purpose: five more would trip " +
        "LOGIN_LOCKOUT (freeAttempts 5) and the lockout would then be reported as the failure.",
    );
  }
  if (outcome.observed) {
    lines.push(`  Observed: HTTP ${outcome.observed.status} ${String(outcome.observed.body || "").slice(0, 160)}`);
  }
  lines.push(`  Form said (corroboration only — it is generic by design): ${outcome.form}`);
  return lines.join("\n");
}


/**
 * NAVIGATE FROM A STOPPED PAGE, AND RETRY THE TWO FAILURES THAT ARE THE BOX.
 *
 * A `--repeat 4` sweep lost run #04 in BOTH of its passes — once to
 * „interrupted by another navigation", once to „Timeout was reached" — and a
 * quarter of the sample silently vanishing is fatal to a verdict decided by
 * 10 ms. Neither error was about the app:
 *
 *   INTERRUPTED — the driving shell is a client-routed React app that is still
 *     doing things when the next iteration starts: a `router.replace` settling
 *     the deep link, a server action returning, a prefetch. Starting a fresh
 *     `page.goto` while the previous page's router is mid-push aborts one of
 *     the two, and Playwright reports whichever it was as a hard failure. The
 *     fix is to STOP being on that page first: `about:blank` tears the old
 *     document down, cancels its pending navigations, and costs milliseconds.
 *   TIMEOUT — the same cold-compile problem the rest of this file is about,
 *     hit on a route the previous iteration had already warmed, i.e. the box
 *     under load rather than the route being uncompiled. Re-warm from node
 *     (no navigation timeout, no service worker) and try again.
 *
 * Three attempts, and the failure carries all of them so a genuine breakage
 * cannot hide behind a retry.
 */
async function gotoQuiesced(page, target, attempts = 3, deadline = Infinity) {
  const failures = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const left = deadline - Date.now();
    if (left <= 0) {
      throw new Error(
        `[mobile-harness] ${target} ran out of its total navigation budget after ${attempt - 1} ` +
          `attempt(s): ${failures.join(" | ") || "no error yet — the budget simply expired"}`,
      );
    }
    try {
      await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch {
      /* a page too busy to tear down is not itself a failure — the goto below decides */
    }
    try {
      await page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: Math.max(1_000, Math.min(180_000, deadline - Date.now())),
      });
      if (attempt > 1) {
        console.log(`[mobile-harness] ${target} needed ${attempt} navigation attempts: ${failures.join(" | ")}`);
      }
      return;
    } catch (error) {
      failures.push(`#${attempt} ${String(error?.message || error).split("\n")[0]}`);
      if (attempt === attempts) {
        throw new Error(
          `[mobile-harness] ${target} would not load in ${attempts} attempts: ${failures.join(" | ")}`,
        );
      }
      await warmFromNode(page, target, deadline);
    }
  }
}

/**
 * Compile a route server-side with the page's own session cookies.
 *
 * WITH A DEADLINE. "A plain fetch has no navigation timeout" was the point of
 * this helper and it was also, unnoticed, a way for the whole sweep to stop
 * dead: a dev server that stops answering mid-request (Turbopack's filesystem
 * cache compaction has been measured at 7 minutes on this box) leaves this
 * `await` with nothing to wake it, and a probe that hangs in silence looks
 * exactly like a probe doing slow work. Generous — a genuinely cold route on a
 * mechanical disk is minutes — but finite.
 *
 * AND ON `node:http`, WHICH IS THE O25 FIX. This is the one call that put
 * global fetch into every lane process — it runs before every sign-in and again
 * on every navigation retry — and a successful one can abort node on the way
 * out with exit 127 (see `httpGet`). Exported so a test can drive the real
 * thing rather than a stand-in: the defect lives in the transport, so a test
 * that swaps the transport tests nothing.
 */
export const WARM_TIMEOUT_MS = Number(process.env.KNIJKA_WARM_TIMEOUT_MS || 420_000);
export async function warmFromNode(page, target, deadline = Infinity) {
  try {
    const cookies = await page.context().cookies();
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const budget = Math.max(1_000, Math.min(WARM_TIMEOUT_MS, deadline - Date.now()));
    // maxBytes 0: read the body to the end and keep none of it. Reading it IS
    // the warm; keeping a compiled page in memory is just a leak.
    await httpGet(target, { headers: { cookie }, timeoutMs: budget, maxBytes: 0 });
  } catch {
    /* the retry will surface the problem with a better message */
  }
}

async function fillCredentials(page, credentials, attempts = 10) {
  for (let i = 0; i < attempts; i += 1) {
    for (const [selector, value] of [
      ["#email", credentials.email],
      ["#password", credentials.password],
    ]) {
      const field = page.locator(selector);
      await field.click();
      await field.press("Meta+A").catch(() => {});
      await field.press("Control+A").catch(() => {});
      await field.press("Delete").catch(() => {});
      await field.pressSequentially(value, { delay: 15 });
    }
    await page.waitForTimeout(250);
    const [email, password] = await Promise.all([
      page.$eval("#email", (el) => el.value),
      page.$eval("#password", (el) => el.value),
    ]);
    if (email === credentials.email && password === credentials.password) return;
  }
  throw new Error(
    "[mobile-harness] the login form never kept both field values — page did not hydrate.",
  );
}

/**
 * Navigate and assert we landed where we asked. Returns the settled URL.
 *
 * `waitFor` is per-route (a selector that only exists once the route's real
 * content has mounted) so the 3D simulator is not measured mid-boot with a
 * loading card filling the screen — that would score 0% road and be a lie in
 * the opposite direction.
 */
export async function gotoAuthenticated(page, baseUrl, route, { budgetMs = NAV_BUDGET_MS } = {}) {
  const target = new URL(route.path, baseUrl).toString();
  const deadline = Date.now() + budgetMs;
  await gotoQuiesced(page, target, 3, deadline);

  // THE SERVICE WORKER CAN HAND YOU A DIFFERENT PAGE AND STILL SAY 200.
  // public/sw.js answers a navigation whose fetch THREW with /offline.html.
  // On a cold dev server that is a normal outcome (WebKit gives up before a
  // 60 s first compile finishes), and the harness's very first run screenshotted
  // „Телефонът ти е офлайн" and reported it as /theory. Retry once — by now the
  // route is compiled — and refuse to measure it if it happens again.
  const ATTEMPTS = 4;
  for (let i = 0; i < ATTEMPTS; i += 1) {
    const offline = await page
      .evaluate(() => document.body?.dataset?.offlineFallback === "true" ||
        /Телефонът ти е офлайн/.test(document.body?.innerText || ""))
      .catch(() => false);
    if (!offline) break;
    if (i === ATTEMPTS - 1) {
      throw new Error(
        `[mobile-harness] ${route.path} served the service worker's offline page ${ATTEMPTS} times — ` +
          `refusing to measure it. The dev server is still compiling this route.`,
      );
    }
    // Re-warm from NODE, not from the browser: a plain fetch has no service
    // worker in front of it, so it waits for the real response however long the
    // compile takes, and the next navigation finds a warm route. Retrying the
    // navigation alone just re-triggers the same abort.
    await warmFromNode(page, target, deadline);
    await gotoQuiesced(page, target, 3, deadline);
  }

  const landed = new URL(page.url());
  if (landed.pathname.startsWith("/login")) {
    throw new Error(
      `[mobile-harness] ${route.path} redirected to /login — the sweep is NOT authenticated. ` +
        `Refusing to report login-page geometry as ${route.id} numbers.`,
    );
  }
  if (route.expectPath && !landed.pathname.startsWith(route.expectPath)) {
    throw new Error(
      `[mobile-harness] ${route.path} landed on ${landed.pathname}, expected ${route.expectPath}. ` +
        `(A paywall or gate is in the way — measuring it as "${route.id}" would be wrong.)`,
    );
  }
  return landed.toString();
}
