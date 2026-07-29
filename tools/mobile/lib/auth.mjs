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
 * @param {import("playwright").Page} page
 * @param {{email:string,password:string}} credentials
 * @param {string} baseUrl
 */
export async function signIn(page, credentials, baseUrl) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "load" });
  await page.waitForSelector("#email", { timeout: 60_000 });

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
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" }).catch(() => {});
}

/** Compile a route server-side with the page's own session cookies. */
async function warmFromNode(page, target) {
  try {
    const cookies = await page.context().cookies();
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await fetch(target, { headers: { cookie }, redirect: "manual" });
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
export async function gotoAuthenticated(page, baseUrl, route) {
  const target = new URL(route.path, baseUrl).toString();
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 180_000 });

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
    await warmFromNode(page, target);
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 180_000 });
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
