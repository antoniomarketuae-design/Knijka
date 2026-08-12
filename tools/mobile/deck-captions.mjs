#!/usr/bin/env node
// =============================================================================
// deck-captions.mjs — DOES EVERY AUTHORED DEMONSTRATION CAPTION RENDER WHOLE?
//
//   node tools/mobile/deck-captions.mjs              # all profiles, WebKit
//   node tools/mobile/deck-captions.mjs -d small-landscape
//   node tools/mobile/deck-captions.mjs --json out.json
//   node tools/mobile/deck-captions.mjs --base-url http://localhost:3462
//
// Exit 0 when every caption in the trace bank fits the box it is given on every
// profile, 1 otherwise — so this is usable as a gate step on its own.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS, AND WHY IT IS A BROWSER AND NOT A CHARACTER COUNT
// ═════════════════════════════════════════════════════════════════════════════
// FOUNDER, 2026-08-11, portrait phone, demonstration deck open: «Спри НАПЪЛНО …
// броим до три» renders without „броим до три". He was right to the pixel — the
// shipped caption needed 94 px of a 78 px box, exactly one 16 px line, and the
// line it lost was the one that says HOW LONG to stand still at a Б2. A student
// read „stop completely, wheels still" and never learned the operative half.
//
// It was never one string. The box was sized against „the LONGEST annotation in
// the PILOT trace, 71 characters"; the bank holds 1 811 distinct captions with a
// median of 80 and a maximum of 249. That is the whole shape of the defect: a
// budget measured against a sample and then applied to a corpus.
//
// A CHARACTER BUDGET WOULD BE THE SAME MISTAKE ONE LEVEL UP. „Under 90
// characters" is not the requirement; „renders whole in the space it is given on
// the smallest supported phone" is. Bulgarian glyph widths, the card's own
// padding, the safe-area insets, where the transport row folds and how WebKit
// breaks a line at „Наредба № РД-02-21-1/23.11.2023" are all inputs, and none of
// them is a character count. So this measures in WebKit, in the real deck, at
// the real width the real CSS gives it, on the real device profiles.
//
// ═════════════════════════════════════════════════════════════════════════════
// HOW IT MEASURES, AND THE FOUR CONTROLS IT REFUSES TO REPORT WITHOUT
// ═════════════════════════════════════════════════════════════════════════════
// The caption card belongs to React and its text changes every few seconds as
// the ghost drives, so it cannot be written to. A TWIN of the card is cloned
// into the card's own DOM parent — same inheritance chain, therefore the same
// font stack — taken out of flow with `position: fixed`, and given the card's
// own measured border-box width. Every caption in the bank is laid out in that
// twin and its height compared against the box's CEILING.
//
// „Ceiling" and not `clientHeight`: since 2026-08-11 the portrait box is
// `height: auto` under a `max-height`, so its client height is whatever the
// caption that happens to be on screen needs. The ceiling is the smaller of the
// box's own `max-height` and what the deck's own ceiling leaves after the
// transport panel — and the deck's ceiling is a `calc()` the engine will not
// resolve for us, so it is MEASURED by forcing the deck past any screen height
// and reading what it becomes.
//
//   PC1  the twin, fed the caption that is LIVE on screen, must measure what
//        the real CARD measures for it (±1 px). A twin that is not faithful
//        makes every verdict under it worthless. It is compared against the
//        CARD and not against the box's `scrollHeight`, because a FIXED box
//        holding a short caption reports its own height (78) and not the text's
//        (58) — which failed a perfectly faithful twin on the desktop profile
//        the day this tool was written.
//   NC1  an empty caption must measure no overflow.
//   NC2  a 3 000-character caption must measure a LARGE overflow — i.e. the
//        mutation is not a no-op. (It must be WRAPPABLE: one 3 000-character
//        „word" does not wrap and measures a single line. That was a real bug
//        in the first draft of this probe.)
//   NC3  the twin's width must be > 0 and equal to the card's.
//
// A profile whose controls do not all pass is reported as UNMEASURED, never as
// clean. One probe on this project was caught reporting a clean screen while
// its own shift function was a no-op; that is what NC2 and NC3 are for.
//
// ═════════════════════════════════════════════════════════════════════════════
// DEV IS NOT THE ANSWER — RUN IT WITH `--prod`
// ═════════════════════════════════════════════════════════════════════════════
// The default route is `/dev/drive-rig`, which `page.tsx` answers with
// `notFound()` when NODE_ENV is production. `--prod` signs in and drives the
// real `/simulator` on a `next build && next start` instead. Only a `--prod`
// run may be frozen (see `--freeze` at the foot) — the frozen record is what
// the gate trusts when no browser is available, so it may only ever come from
// the shipped build.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHAT IT SAID ON 2026-08-12, ON PRODUCTION, BEFORE J-WAVE-4
// ═════════════════════════════════════════════════════════════════════════════
//   iPhone 16 portrait   369 × 174.0     0 / 1811
//   Android portrait     336 × 174.0     0 / 1811
//   Samsung portrait     336 × 174.0     0 / 1811
//   Desktop 1264 × 619   416 ×  78.0    78 / 1811
//   iPhone 16 landscape  410 ×  13.5  1811 / 1811   ← every caption, cut
//   Android landscape    456 ×   2.0  UNMEASURED — box smaller than an EMPTY card
//   Samsung landscape    456 × −22.0  UNMEASURED — the 58 px transport row does
//                                     not fit its own 40 px deck
//
// THAT IS NOT THE 298 THE AUDIT RECORDED, and the difference is one day old:
// J-WAVE-2 moved this deck below the top rail (rightly — the rail had 20 064 px²
// of it) and paid the 52 px out of the caption, predicting the loss would be
// confined to „the shortest sideways phone". It was the whole caption on every
// sideways phone, the founder's included, photographed sliced through the middle
// of its own glyphs. Landscape is how anyone drives.
//
// J-WAVE-4's answer is geometry, not a content wave: sideways the caption leaves
// the corridor and hangs below the deck over the road, in the lane the census
// says is empty (see notifyColumn.ts, DECK_TOUCH_CAPTION_ROAD_MAX_PX), and the
// desktop box is sized to the tallest caption actually in the bank rather than
// to whatever happened to be free. The residue this tool then names is a real
// residue.
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { engineByName } from "./lib/pw.mjs";
import { resolveDevices, DEVICES } from "./lib/devices.mjs";
import { newDeviceContext, insetBanner } from "./lib/insets.mjs";
import { ensureServer, DEFAULT_PORT, REPO } from "./lib/server.mjs";
import { signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";
// The corpus half lives in lib/ so the GATE can import it without pulling in
// Playwright, next-auth and Prisma behind it — see lib/captions.mjs for why.
import { FROZEN_PATH, corpusHash, readCaptions } from "./lib/captions.mjs";

/**
 * The lesson whose shadow trace is loaded to get a real, live deck on screen.
 * Any scenario would do — the corpus is measured in the box, not in this
 * lesson — but this is the one the founder reported, so its own caption is in
 * every run and the report can quote the verdict on it.
 */
const SCENARIO = "sc-junction-stop";

/**
 * ── `--prod`: THE SAME QUESTION, ASKED ON THE SURFACE THE STUDENT USES ────────
 *
 * The default route is `/dev/drive-rig`, which is fast, needs no account and
 * has no paywall — and which `page.tsx` answers with `notFound()` when
 * `NODE_ENV === "production"`. So the default run is a DEV run, and this
 * project has already published one wrong headline from a dev build (J-WAVE-3:
 * script bytes 4 247 KB dev → 1 270 KB production, „a different SHAPE, not a
 * scaled version").
 *
 * A caption box is CSS, and Tailwind emits the same CSS in both builds, so the
 * dev number SHOULD transfer. „Should" is exactly the word that produced the
 * other three false headlines this week, so `--prod` exists to check it rather
 * than argue it: it signs in as the harness user and drives the real
 * `/simulator?scenario=…&level=1` on a `next build && next start`, through a
 * TLS front (the enforced production CSP carries `upgrade-insecure-requests`
 * and WebKit upgrades loopback — plain http gives that engine a page with no
 * JavaScript on it).
 *
 *   node ../tools/mobile/deck-captions.mjs --prod --base-url https://localhost:3489
 *
 * The two runs are expected to agree to the pixel. When they do not, the
 * PRODUCTION number is the true one and the dev default is what needs fixing.
 */
const PROD_ROUTE = (base, scenario) =>
  `${base}/simulator?scenario=${scenario}&level=1&simPerf=0`;
const DEV_ROUTE = (base, scenario) =>
  `${base}/dev/drive-rig?scenario=${scenario}&level=1&quality=low&readout=0`;

/**
 * The DESKTOP is a profile here, not an afterthought. It is 34.7 % clamped
 * before the fix and 4.3 % after, and it is the screen the content is authored
 * on — a caption that looks fine to its author and is cut on the founder's
 * phone is exactly the failure this file is about.
 */
const ROOMY = {
  id: "desktop-roomy",
  label: "Desktop — 1264x619",
  width: 1264,
  height: 619,
  dpr: 1,
  // A desktop really has no notch and no home indicator, so `insets: "none"` is
  // the TRUE answer here rather than the lie it would be on a phone — and it
  // still goes through `newDeviceContext`, which `insets.test.mjs` requires of
  // every probe in this directory precisely so nobody opens a raw context and
  // publishes a number about a device nobody owns.
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  ua: undefined,
  orientation: "landscape",
};

// The corpus reader moved to lib/captions.mjs (imported above) when the gate
// test was written: `deck-captions.test.mjs` needs to read and fingerprint the
// captions in milliseconds, and importing THIS file would have dragged
// Playwright, next-auth and the Prisma client into `npm run test:tools`.

// -----------------------------------------------------------------------------
// the in-page measurement (see the header for what each control is for)
// -----------------------------------------------------------------------------
const SWEEP = String.raw`((texts) => {
  const deck = document.querySelector('[data-hud="demo-deck"]');
  if (!deck) return { ok: false, why: "no [data-hud=demo-deck] on the page" };
  const box = deck.querySelector('[data-hud="deck-caption"]');
  if (!box) return { ok: false, why: 'no [data-hud="deck-caption"] inside the deck' };
  if (box.getBoundingClientRect().width < 1) {
    // NAME THE SURFACE THAT IS HIDING IT. „the stage was not laid out" sent one
    // run round three identical retries with nothing to act on; the deck is
    // deliberately display:none behind the first-run hint and behind the open
    // sheet, and which of those is up is a one-line answer.
    // (No backticks anywhere in this block — it lives inside a String.raw
    //  template and one of them ends the whole literal.)
    const hidden = [];
    for (let n = box; n && n !== document.body; n = n.parentElement) {
      if (getComputedStyle(n).display === "none")
        hidden.push((n.getAttribute("data-hud") || n.tagName) + " is display:none");
    }
    const up = [...document.querySelectorAll("[data-hud]")]
      .map((n) => n.getAttribute("data-hud"))
      .filter((h) => h === "touch-hint" || h === "car-sheet");
    return {
      ok: false,
      why:
        "the caption box measured ZERO wide" +
        (hidden.length ? " — hidden because " + hidden.join(" < ") : " — the stage was not laid out") +
        (up.length ? "; up on screen: " + up.join(", ") : "") +
        "; sheet=" +
        (document.documentElement.getAttribute("data-sim-car-sheet") || "closed"),
    };
  }
  const card = box.firstElementChild;
  if (!card) return { ok: false, why: "the caption box is empty — no annotation is live" };

  const bcs = getComputedStyle(box);
  const ccs = getComputedStyle(card);
  const cardW = card.getBoundingClientRect().width;
  const liveText = card.textContent;
  // PC1 compares the twin against the CARD's own laid-out height, NOT the
  // box's scrollHeight: when the box is a FIXED height and the caption is
  // shorter than it, scrollHeight is the BOX (78) and the card is the text
  // (58), and PC1 would fail on a perfectly faithful twin. Caught on the
  // desktop profile the day this tool was written.
  const liveCardH = card.getBoundingClientRect().height;

  const asPx = (v) => {
    if (v === "none" || v == null) return Infinity;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : Infinity;
  };
  const boxMax = asPx(bcs.maxHeight);
  const prev = deck.style.height;
  deck.style.setProperty("height", "100000px", "important");
  const deckMax = deck.getBoundingClientRect().height;
  if (prev) deck.style.height = prev; else deck.style.removeProperty("height");
  const panel = box.nextElementSibling;
  const panelH = panel ? panel.getBoundingClientRect().height : 0;
  const rootGap = parseFloat(getComputedStyle(box.parentElement).rowGap || "0") || 0;

  // ── TWO GRAMMARS, AND THE SECOND ONE IS THE HONEST MEASUREMENT ───────────
  //
  // IN FLOW (portrait, desktop) the caption is a flex sibling above the
  // transport panel, so the deck's own ceiling minus that panel is what is
  // left for it. That is the formula this tool shipped with.
  //
  // OUT OF FLOW (landscape since J-WAVE-4) the caption hangs below the deck
  // over the road, and the flow formula is not merely wrong, it is NEGATIVE:
  // the deck is now exactly its 58 px transport row, so 58 − 58 − 4 = −4 and
  // three profiles reported a caption box of 258 × −4. The tool called that
  // UNMEASURED and refused to freeze it, which is the behaviour that caught
  // this — but a ceiling of max-height alone would have been the WEAK fix: it
  // would trust the declared number and never notice a caption growing into
  // the steering pad. (No backticks in this block: String.raw literal.)
  //
  // So out of flow the ceiling is the SPACE THAT IS ACTUALLY THERE: from the
  // top of the box down to the nearest thing painted underneath it inside its
  // own x-range, capped by its declared max-height. A lane that gets shorter
  // because a control moved fails this lint on the next run, which is the
  // whole requirement — „renders whole in the space it is given".
  const outOfFlow = bcs.position === "absolute" || bcs.position === "fixed";
  let ceiling;
  let floorBy = "flow";
  if (outOfFlow) {
    const r = box.getBoundingClientRect();
    let floorY = window.innerHeight;
    const under = document.querySelectorAll(
      'button,[role="slider"],[data-hud="dash-dock"],[data-hud="notify-column"],[data-hud="top-rail"],[data-hud="status-dashboard"]',
    );
    for (const el of under) {
      if (box.contains(el) || el.contains(box)) continue;
      const q = el.getBoundingClientRect();
      if (q.width < 1 || q.height < 1) continue;
      if (q.right <= r.left + 0.5 || q.left >= r.right - 0.5) continue; // no x overlap
      if (q.top < r.top + 1) continue; // not below us
      if (q.top < floorY) {
        floorY = q.top;
        floorBy = (el.getAttribute("data-hud") || el.getAttribute("aria-label") || el.tagName) + " @y" + Math.round(q.top);
      }
    }
    if (floorY === window.innerHeight) floorBy = "the bottom of the screen";
    ceiling = Math.min(boxMax, floorY - r.top);
  } else {
    ceiling = Math.min(boxMax, deckMax - panelH - rootGap);
  }

  const holder = document.createElement("div");
  holder.style.cssText =
    "position:fixed;left:-20000px;top:0;pointer-events:none;visibility:hidden;width:" + cardW + "px;";
  const twin = card.cloneNode(true);
  twin.style.width = "";
  holder.appendChild(twin);
  box.parentElement.appendChild(holder);

  const measure = (text) => { twin.textContent = text; return twin.getBoundingClientRect().height; };

  const twinLive = measure(liveText);
  const ncEmpty = measure("");
  const ncHuge = measure("Яя ".repeat(1000));
  const twinW = twin.getBoundingClientRect().width;

  const foldFor = (text) => {
    twin.textContent = text;
    const node = twin.firstChild;
    if (!node || node.nodeType !== 3 || text.length === 0) return null;
    const limit = twin.getBoundingClientRect().top + ceiling;
    const rng = document.createRange();
    const bottomAt = (i) => {
      rng.setStart(node, i);
      rng.setEnd(node, Math.min(i + 1, text.length));
      const rects = rng.getClientRects();
      return rects.length === 0 ? -Infinity : rects[rects.length - 1].bottom;
    };
    if (bottomAt(text.length - 1) <= limit) return null;
    let lo = 0, hi = text.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bottomAt(mid) <= limit) lo = mid + 1; else hi = mid;
    }
    return lo;
  };

  const rows = [];
  for (const text of texts) {
    const h = measure(text);
    const over = Math.round((h - ceiling) * 100) / 100;
    let lost = null;
    if (over > 0.5) {
      const idx = foldFor(text);
      if (idx !== null && idx < text.length) lost = text.slice(idx);
    }
    rows.push({ text, h: Math.round(h * 100) / 100, over, lost });
  }
  holder.remove();

  return {
    ok: true,
    geometry: {
      cardWidth: Math.round(cardW * 100) / 100,
      ceiling: Math.round(ceiling * 10) / 10,
      boxMaxHeight: boxMax === Infinity ? "none" : boxMax,
      // WHAT ENDED THE LANE — a control's own name and y, so a shrinking
      // ceiling can be read without opening a second tool.
      inFlow: !outOfFlow,
      floorBy,
      deckCeiling: Math.round(deckMax * 10) / 10,
      transportPanel: Math.round(panelH * 10) / 10,
      fontSize: ccs.fontSize,
      lineHeight: ccs.lineHeight,
      padding: [ccs.paddingTop, ccs.paddingRight, ccs.paddingBottom, ccs.paddingLeft].join(" "),
    },
    controls: {
      PC1_twinFaithful: Math.abs(twinLive - liveCardH) <= 1,
      PC1_twin: Math.round(twinLive * 100) / 100,
      PC1_realCard: Math.round(liveCardH * 100) / 100,
      NC1_emptyOverflow: Math.round((ncEmpty - ceiling) * 100) / 100,
      NC2_hugeOverflow: Math.round((ncHuge - ceiling) * 100) / 100,
      NC3_twinWidth: Math.round(twinW * 100) / 100,
      pass:
        Math.abs(twinLive - liveCardH) <= 1 &&
        ncEmpty - ceiling <= 0.5 &&
        ncHuge - ceiling > 200 &&
        twinW > 0 &&
        Math.abs(twinW - cardW) <= 1,
    },
    rows,
  };
})`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Open the deck (it starts collapsed on a phone) and put a caption on screen. */
async function stageDeck(page) {
  const notes = [];

  // ── THE DECK IS `display: none` ON THE LANDING FRAME, AND THAT IS CORRECT.
  //
  // `/dev/drive-rig` never renders the first-run touch hint, so the dev route
  // walks straight past this; the REAL route does not. PlayAreaStyles' rank-3
  // arbitration hides the deck while `[data-hud="touch-hint"]` is up
  // («Завърти телефона хоризонтално» had laid 897 px² across the deck's own
  // toggle), so on production the first thing this probe met was a deck with a
  // zero-width caption box — which the sweep correctly refused to measure
  // rather than reporting a clean corpus. Dismissing the hint the way a
  // student does is the fix; suppressing the rule would be measuring a screen
  // nobody sees.
  // It does not necessarily exist yet when the deck's node first appears — the
  // scene mounts before the hint does — so this waits for it rather than
  // sampling once and walking on. 20 s, then give up and let the sweep's own
  // zero-width guard say what is covering the box.
  for (let i = 0; i < 40; i += 1) {
    const up = await page.evaluate(`!!document.querySelector('[data-hud="touch-hint"]')`);
    if (!up) {
      if (i > 0) break;
      await sleep(500);
      continue;
    }
    const clicked = await page.evaluate(
      `(() => {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Разбрах");
        if (!b) return false;
        b.click();
        return true;
      })()`,
    );
    await sleep(600);
    if (clicked && !(await page.evaluate(`!!document.querySelector('[data-hud="touch-hint"]')`))) {
      notes.push("dismissed the first-run touch hint («Разбрах») — it hides the deck by design");
      break;
    }
    await sleep(500);
  }

  const openState = () =>
    page.evaluate(
      `document.querySelector('[data-hud="demo-deck"]')?.getAttribute("data-deck-open") ?? "gone"`,
    );
  if ((await openState()) === "false") {
    // A REAL, hit-tested click is tried first: a toggle that only answers a
    // synthetic click is a defect in its own right and belongs in the report.
    const btn = await page.$('[data-hud="demo-deck"] button');
    if (btn) {
      await btn.click({ timeout: 15000 }).catch((e) =>
        notes.push(
          `real click on the deck pill did not land inside 15 s (${String(e).split("\n")[0]}). ` +
            `NOT a product defect on the evidence so far: driven on its own with the scene ` +
            `settled, the pill samples ONE stable box in 1 s, elementFromPoint at its centre ` +
            `returns the pill, pointer-events computes auto, and both a real click and a real ` +
            `tap toggle it. On a loaded box Playwright's actionability wait simply outlasts the ` +
            `timeout while the 3D scene is still stabilising.`,
        ),
      );
      await sleep(500);
    }
    if ((await openState()) !== "true") {
      await page.evaluate(`document.querySelector('[data-hud="demo-deck"] button')?.click()`);
      await sleep(500);
      notes.push("deck opened with a synthetic click");
    }
  }
  // A caption is live for only 4 s (traces/sample.ts, windowSec). ⏮ seeks to
  // the previous annotation, which puts one back on screen.
  for (let i = 0; i < 12; i += 1) {
    const has = await page.evaluate(
      `!!document.querySelector('[data-hud="deck-caption"]')?.firstElementChild`,
    );
    if (has) break;
    await page.evaluate(
      `document.querySelector('[data-hud="demo-deck"] button[aria-label="Предишна стъпка"]')?.click()`,
    );
    await sleep(250);
  }
  return notes;
}

async function measureProfile(browser, device, baseUrl, texts, opts = {}) {
  const { prod = false, storageState = undefined } = opts;
  const roomy = device.id === ROOMY.id;
  // ONE DOOR, on every profile including the desktop one — `insets.test.mjs`
  // fails any probe in this directory that opens a Playwright context itself,
  // because a raw context lays the app out at env(safe-area-inset-*) = 0 and
  // then publishes numbers about a phone nobody owns. The desktop is the one
  // profile where zero is TRUE, so it says `insets: "none"` out loud and the
  // banner in the report says so too.
  const { context, inset } = await newDeviceContext(
    browser,
    device,
    roomy
      ? {
          // MOTION IS STATED, NOT DEFAULTED, and on this profile it is
          // `allow` for the same reason every other probe in this directory
          // was made to say it out loud: a geometry claim taken under
          // `prefers-reduced-motion: reduce` describes a screen whose
          // transitions never played. The deck's open/close IS a transition,
          // so the sweep settles and then re-reads the ceiling (see
          // `stableCeiling` below) rather than freezing the animation away.
          motion: "allow",
          insets: "none",
          isMobile: false,
          hasTouch: false,
          userAgent: undefined,
          ...(prod ? { storageState, ignoreHTTPSErrors: true } : {}),
        }
      : {
          motion: "allow",
          insets: "real",
          ...(prod ? { storageState, ignoreHTTPSErrors: true } : {}),
        },
  );

  const page = await context.newPage();
  const url = prod ? PROD_ROUTE(baseUrl, SCENARIO) : DEV_ROUTE(baseUrl, SCENARIO);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
    if (prod && /\/login/.test(page.url())) {
      return { ok: false, why: `bounced to ${page.url()} — NOT signed in, so this would have measured the login page` };
    }
    let mounted = false;
    for (let i = 0; i < 240; i += 1) {
      mounted = await page.evaluate(`!!document.querySelector('[data-hud="demo-deck"]')`);
      if (mounted) break;
      await sleep(1000);
    }
    if (!mounted) return { ok: false, why: "the deck never mounted (world did not build)" };
    const notes = await stageDeck(page);
    // ── THE CEILING MUST BE THE SAME TWICE, 600 ms APART ──────────────────
    // With motion ALLOWED the deck's open transition is real, and a ceiling
    // read mid-flight is a number about a frame nobody sees. Two agreeing
    // samples is the cheapest honest settle; a disagreement is reported as
    // UNMEASURED rather than averaged away.
    const ceilingNow = () =>
      page.evaluate(`(() => {
        const deck = document.querySelector('[data-hud="demo-deck"]');
        const box = deck && deck.querySelector('[data-hud="deck-caption"]');
        if (!box) return null;
        const r = box.getBoundingClientRect();
        return Math.round(r.width * 10) / 10 + ":" + Math.round(r.height * 10) / 10;
      })()`);
    await sleep(600);
    const s1 = await ceilingNow();
    await sleep(600);
    const s2 = await ceilingNow();
    if (s1 !== s2) {
      return { ok: false, why: `the caption box was still moving (${s1} → ${s2}) — geometry read mid-transition` };
    }
    const res = await page.evaluate(`${SWEEP}(${JSON.stringify(texts)})`);
    return {
      ...res,
      notes: [...notes, `motion=allow · box settled at ${s1} across two samples 600 ms apart`],
      insets: insetBanner(device, inset),
    };
  } finally {
    await context.close();
  }
}

function parseArgs(argv) {
  const out = { devices: [], flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--base-url") out.baseUrl = argv[++i];
    else if (a === "--device" || a === "-d") out.devices.push(argv[++i]);
    else if (a === "--json") out.json = argv[++i];
    else if (a === "--engine") out.engine = argv[++i];
    else if (a === "--freeze") out.freeze = true;
    else if (a.startsWith("--")) out.flags.add(a.slice(2));
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { files, captions } = readCaptions();
  const texts = captions.map((c) => c.text);
  const traceOf = new Map(captions.map((c) => [c.text, c.traces]));
  console.log(
    `[deck-captions] ${captions.length} distinct captions from ${files} traces under platform/public/traces`,
  );

  const server = args.baseUrl
    ? { url: args.baseUrl, started: false, stop: () => {} }
    : await ensureServer({ port: DEFAULT_PORT });

  // `desktop-roomy` is this tool's own profile and is not in devices.mjs (that
  // ladder is phones); it is resolved here so `-d desktop-roomy` still works.
  const devices = args.devices.length
    ? args.devices.map((id) => (id === ROOMY.id ? ROOMY : resolveDevices([id])[0]))
    : [...resolveDevices([]), ROOMY];
  void DEVICES;

  const prod = args.flags.has("prod");
  console.log(
    prod
      ? `[deck-captions] PRODUCTION run — real route ${PROD_ROUTE("", SCENARIO)}, signed in.`
      : `[deck-captions] DEV run — ${DEV_ROUTE("", SCENARIO)} (that route 404s on a production build). ` +
          `Re-run with --prod --base-url https://localhost:<tls> to confirm the same numbers on the shipped build.`,
  );

  const engine = engineByName(args.engine ?? "webkit");
  if (!engine.primary) {
    console.log(
      `[deck-captions] ⚠ engine=${engine.name} is a SECOND OPINION. No claim about the founder's phone may be made from it.`,
    );
  }
  const browser = await engine.launcher.launch();

  // `/simulator` is behind src/proxy.ts AND the €21.99 entitlement gate. A run
  // that is not signed in measures the LOGIN page once per profile and hands
  // back a table that looks exactly like data — the failure lib/auth.mjs was
  // written against. Sign in once, reuse the storage state on every profile.
  let storageState;
  if (prod) {
    const user = await ensureHarnessUser();
    const { context: authContext } = await newDeviceContext(browser, devices[0], {
      motion: "allow",
      insets: "real",
      ignoreHTTPSErrors: true,
    });
    const authPage = await authContext.newPage();
    await signIn(authPage, { email: user.email, password: user.password }, server.url);
    storageState = await authContext.storageState();
    await authContext.close();
    console.log(`[deck-captions] signed in as ${user.email}`);
  }

  const report = [];
  let failed = false;
  for (const device of devices) {
    process.stdout.write(`\n── ${device.label} ──\n`);
    let res = null;
    for (let attempt = 1; attempt <= 3 && (res === null || !res.ok); attempt += 1) {
      try {
        res = await measureProfile(browser, device, server.url, texts, { prod, storageState });
      } catch (e) {
        res = { ok: false, why: `threw: ${String(e).split("\n")[0]}` };
      }
      if (!res.ok) console.log(`  attempt ${attempt}: ${res.why}`);
    }
    if (!res.ok) {
      failed = true;
      console.log(`  UNMEASURED — ${res.why}`);
      report.push({ device: device.id, label: device.label, ok: false, why: res.why });
      continue;
    }
    for (const n of res.notes) console.log(`  note: ${n}`);
    const g = res.geometry;
    console.log(
      `  caption box ${g.cardWidth} × ${g.ceiling} px  ` +
        (g.inFlow
          ? `(deck ceiling ${g.deckCeiling}, transport ${g.transportPanel})`
          : `(OUT OF FLOW over the road; max-height ${g.boxMaxHeight}, lane ends at ${g.floorBy})`) +
        `  ${g.fontSize}/${g.lineHeight}`,
    );
    if (!res.controls.pass) {
      failed = true;
      console.log(`  UNMEASURED — controls did not pass: ${JSON.stringify(res.controls)}`);
      report.push({ device: device.id, label: device.label, ok: false, why: "controls", controls: res.controls });
      continue;
    }
    console.log(`  controls: PASS (${JSON.stringify(res.controls)})`);
    const clamped = res.rows.filter((r) => r.over > 0.5);
    const verdict = clamped.length === 0 ? "OK" : "CLAMPED";
    console.log(
      `  ${verdict}: ${clamped.length} / ${res.rows.length} captions cannot render whole` +
        (clamped.length ? ` (worst ${Math.max(...clamped.map((r) => r.over))} px)` : ""),
    );
    for (const r of clamped.slice(0, 5)) {
      console.log(`    +${r.over}px  ${traceOf.get(r.text)?.[0] ?? "?"}`);
      console.log(`      LOST: ${JSON.stringify(r.lost)}`);
    }
    if (clamped.length > 5) console.log(`    …and ${clamped.length - 5} more (use --json for all)`);
    if (clamped.length) failed = true;
    const tallest = res.rows.reduce((a, b) => (b.h > a.h ? b : a), res.rows[0]);
    report.push({
      device: device.id,
      label: device.label,
      ok: true,
      insets: res.insets,
      geometry: g,
      controls: res.controls,
      clamped: clamped.map((r) => ({
        over: r.over,
        lost: r.lost,
        text: r.text,
        traces: traceOf.get(r.text) ?? [],
      })),
      // The tallest caption in the bank AT THIS WIDTH is what the freeze below
      // is built from: it is the single row that decides whether the ceiling is
      // big enough, and quoting it makes the frozen number auditable by hand.
      tallest: {
        px: tallest.h,
        chars: tallest.text.length,
        trace: traceOf.get(tallest.text)?.[0] ?? "?",
        text: tallest.text,
      },
      total: res.rows.length,
    });
  }

  await browser.close();
  if (server.started) server.stop();

  if (args.json) {
    mkdirSync(dirname(args.json), { recursive: true });
    writeFileSync(args.json, JSON.stringify(report, null, 1));
    console.log(`\nwrote ${relative(REPO, args.json)}`);
  }

  // ── THE FREEZE — what turns this from a tool into a GATE ────────────────
  //
  // This probe needs WebKit, a production build, a signed-in account and about
  // four minutes. Nothing that expensive runs on every commit, and a check that
  // only runs when somebody remembers is the exact failure this project has now
  // been bitten by three times in one week.
  //
  // So the browser run publishes its verdict as a frozen record, and a
  // millisecond-cheap `node:test` beside it (`deck-captions.test.mjs`) refuses
  // to pass unless that record still describes the tree it is looking at: the
  // corpus hash, the per-profile ceiling against the constant that produces it,
  // and the tallest caption measured against that ceiling. Add a caption, edit
  // a caption, or change one of the geometry constants and the freeze is stale
  // by construction — the test says so and names this command.
  //
  // It is deliberately NOT a character budget and deliberately NOT a stored
  // pass/fail flag. It stores the MEASUREMENT (a height in pixels at a measured
  // width) and re-checks the inequality that matters. The same repo already
  // uses this shape for `freeze-lesson-citations` and `freeze-question-citations`.
  if (args.freeze) {
    if (!prod) {
      console.log(
        `\n[deck-captions] REFUSING to freeze a DEV run. The frozen record is what the gate ` +
          `trusts when no browser is available, so it may only ever come from the shipped ` +
          `build. Re-run with --prod --base-url https://localhost:<tls>.`,
      );
      process.exit(1);
    }
    const bad = report.filter((p) => !p.ok);
    if (bad.length) {
      console.log(
        `\n[deck-captions] REFUSING to freeze: ${bad.length} profile(s) were UNMEASURED ` +
          `(${bad.map((p) => p.device).join(", ")}). A freeze with a hole in it is worse than no freeze.`,
      );
      process.exit(1);
    }
    const frozen = {
      note:
        "Written by `deck-captions.mjs --prod --freeze`. Do not hand-edit: " +
        "`tools/mobile/deck-captions.test.mjs` re-checks every number in here against the tree.",
      measuredAt: new Date().toISOString(),
      build: "production",
      engine: engine.name,
      route: PROD_ROUTE("", SCENARIO),
      corpus: { traces: files, captions: captions.length, sha256: corpusHash(texts) },
      profiles: report.map((p) => ({
        device: p.device,
        label: p.label,
        cardWidth: p.geometry.cardWidth,
        ceiling: p.geometry.ceiling,
        fontSize: p.geometry.fontSize,
        lineHeight: p.geometry.lineHeight,
        clamped: p.clamped.length,
        tallest: p.tallest,
      })),
    };
    writeFileSync(FROZEN_PATH, `${JSON.stringify(frozen, null, 2)}\n`);
    console.log(`\nfroze ${relative(REPO, FROZEN_PATH)}`);
  }

  console.log(
    failed
      ? "\n[deck-captions] FAIL — at least one authored caption cannot render whole in the space it is given."
      : "\n[deck-captions] PASS — every authored caption renders whole on every profile.",
  );
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("deck-captions.mjs")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
