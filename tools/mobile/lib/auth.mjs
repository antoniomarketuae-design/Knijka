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
// -----------------------------------------------------------------------------

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

/**
 * @param {import("playwright").Page} page
 * @param {{email:string,password:string}} credentials
 * @param {string} baseUrl
 */
export async function signIn(page, credentials, baseUrl) {
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
  // A sign-in on this box costs minutes and used to print NOTHING while it did,
  // so a stall and a slow compile looked identical from the outside. Every step
  // that can take minutes now says so before it starts.
  const step = (what) => console.log(`[mobile-harness] sign-in: ${what}`);

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
  step("submitting and waiting for the session cookie");
  await page.click('button[type="submit"]');
  const deadline = Date.now() + 300_000;
  for (;;) {
    const cookies = await page.context().cookies();
    if (cookies.some((c) => /authjs\.session-token/.test(c.name) && c.value)) break;
    if (Date.now() > deadline) {
      const message = await page
        .locator("form")
        .innerText()
        .catch(() => "");
      throw new Error(
        `[mobile-harness] no session cookie after sign-in. Form said: ${message.replace(/\s+/g, " ").slice(0, 200)}`,
      );
    }
    await page.waitForTimeout(500);
  }

  // Stop the in-flight push to /dashboard before navigating somewhere else:
  // otherwise the first route's goto dies with "interrupted by another
  // navigation", which cost a whole device column of a baseline.
  await page
    .goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: LOGIN_NAV_TIMEOUT_MS })
    .catch(() => {});
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
 */
export const WARM_TIMEOUT_MS = Number(process.env.KNIJKA_WARM_TIMEOUT_MS || 420_000);
async function warmFromNode(page, target, deadline = Infinity) {
  try {
    const cookies = await page.context().cookies();
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const budget = Math.max(1_000, Math.min(WARM_TIMEOUT_MS, deadline - Date.now()));
    const res = await fetch(target, {
      headers: { cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(budget),
    });
    await res.arrayBuffer();
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
