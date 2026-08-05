// -----------------------------------------------------------------------------
// navigation.test.mjs — THE SWEEP MUST NOT SILENTLY LOSE A QUARTER OF ITS RUNS.
//
//   node --test tools/mobile/navigation.test.mjs
//   (or `npm run test:tools` from platform/, which discovers it automatically)
//
// The `--repeat 4` sweep behind row C8 lost run #04 in BOTH of its passes —
// once to „interrupted by another navigation", once to „Timeout was reached" —
// and printed a table with no mark on it. At a 10 ms margin, dropping 25% of
// the sample and keeping the quieter three is not a measurement.
//
// Neither error was about the app:
//
//   INTERRUPTED  the driving shell is a client-routed React app that is still
//                working when the next iteration starts — a `router.replace`
//                settling a deep link, a server action returning, a prefetch.
//                A fresh `page.goto` into that aborts one of the two.
//   TIMEOUT      the box, not the route: a cold compile on a mechanical disk
//                while four other lanes are building.
//   OFFLINE      and the third one, which the frames show and the register
//                never mentioned: `public/sw.js` answers a navigation whose
//                fetch THREW with /offline.html — a 200, with „Телефонът ти е
//                офлайн" in it. `FAILED__simulator-drive__iphone16-portrait.png`
//                from the sweep that produced C8 is exactly that page. No
//                exception is raised, so a retry-on-throw cannot see it.
//
// These tests drive `gotoAuthenticated` with a fake page, so every one of those
// three failures can be reproduced deterministically, in milliseconds, with no
// browser and no dev server.
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import test from "node:test";

import { gotoAuthenticated } from "./lib/auth.mjs";

/** A port nothing listens on, so `warmFromNode`'s fetch fails fast and is swallowed. */
const BASE = "http://127.0.0.1:9/";
const ROUTE = { id: "simulator-drive", path: "/simulator/drive", expectPath: "/simulator" };

/**
 * A page whose behaviour is scripted per navigation.
 *
 * `gotos` is consumed one entry per `page.goto` to a REAL target (navigations
 * to about:blank are counted separately and always succeed, because that is
 * what tearing a document down does). Each entry is either an Error to throw or
 * a string: "ok" | "offline".
 */
function fakePage(gotos, landsOn = "simulator/drive") {
  const state = { blanks: 0, targets: [], body: "ok", url: `${BASE}${landsOn}` };
  return {
    state,
    context: () => ({ cookies: async () => [] }),
    url: () => state.url,
    goto: async (target) => {
      if (target === "about:blank") {
        state.blanks += 1;
        state.body = "blank";
        return null;
      }
      state.targets.push(target);
      const next = gotos.shift() ?? "ok";
      if (next instanceof Error) throw next;
      state.body = next;
      state.url = `${BASE}${landsOn}`;
      return null;
    },
    evaluate: async () => state.body === "offline",
  };
}

test("a navigation aborted by the app's own router is retried, not lost", async () => {
  const page = fakePage([new Error("page.goto: interrupted by another navigation"), "ok"]);
  await gotoAuthenticated(page, BASE, ROUTE);
  assert.equal(page.state.targets.length, 2, "the failed navigation must be retried exactly once");
  assert.ok(
    page.state.blanks >= 2,
    `each attempt must first STOP being on the busy page (about:blank ${page.state.blanks} times) — ` +
      `that is what cancels the pending client-side navigation`,
  );
});

test("a timeout on a warm route is retried too — that failure is the box, not the app", async () => {
  const page = fakePage([new Error("page.goto: Timeout 180000ms exceeded"), "ok"]);
  await gotoAuthenticated(page, BASE, ROUTE);
  assert.equal(page.state.targets.length, 2);
});

test("two bad attempts still succeed on the third — but a third failure is a real failure", async () => {
  const twice = fakePage([
    new Error("page.goto: interrupted by another navigation"),
    new Error("page.goto: Timeout was reached"),
    "ok",
  ]);
  await gotoAuthenticated(twice, BASE, ROUTE);
  assert.equal(twice.state.targets.length, 3, "three attempts are available");

  const never = fakePage([
    new Error("page.goto: interrupted by another navigation"),
    new Error("page.goto: Timeout was reached"),
    new Error("page.goto: net::ERR_ABORTED"),
    "ok", // must never be reached
  ]);
  await assert.rejects(
    () => gotoAuthenticated(never, BASE, ROUTE),
    (error) => {
      // ALL THREE, not just the last. A retry that hides the earlier failures
      // turns a genuine breakage into a mystery.
      assert.match(error.message, /would not load in 3 attempts/);
      assert.match(error.message, /interrupted by another navigation/);
      assert.match(error.message, /Timeout was reached/);
      assert.match(error.message, /ERR_ABORTED/);
      return true;
    },
    "three consecutive navigation failures must be reported, with every attempt's reason",
  );
  assert.equal(never.state.targets.length, 3, "and it must not keep trying forever");
});

test("THE OFFLINE PAGE IS A 200 — it must be detected by content, not by an exception", async () => {
  // The exact shape of the lost run: the service worker answers, nothing
  // throws, and the page says „Телефонът ти е офлайн".
  const page = fakePage(["offline", "ok"]);
  await gotoAuthenticated(page, BASE, ROUTE);
  assert.equal(
    page.state.targets.length,
    2,
    "the offline page must trigger a re-warm and a fresh navigation, not be measured",
  );
});

test("an offline page that never clears is refused, not measured", async () => {
  const page = fakePage(["offline", "offline", "offline", "offline", "offline"]);
  await assert.rejects(
    () => gotoAuthenticated(page, BASE, ROUTE),
    /service worker's offline page 4 times — refusing to measure it/,
    "measuring the offline card's geometry as the driving shell is the same class of lie as " +
      "measuring the loading screen",
  );
});

test("a redirect to /login is refused — an unauthenticated sweep is not a sweep", async () => {
  await assert.rejects(
    () => gotoAuthenticated(fakePage(["ok"], "login"), BASE, ROUTE),
    /is NOT authenticated/,
    "login-page geometry must never be reported as a route's numbers",
  );
});

test("landing somewhere else is refused — a paywall is not the driving shell", async () => {
  await assert.rejects(
    () => gotoAuthenticated(fakePage(["ok"], "dashboard"), BASE, ROUTE),
    /landed on \/dashboard, expected \/simulator/,
  );
});
