// THE TEST THAT CAN FAIL THE WAY HIS PHONE FAILS.
//
// Every rig I have run measured a page at visualViewport.scale === 1, which is
// the one state in which this defect cannot exist. His three Safari frames show
// the interface sliced on BOTH edges at once — the signature of a shell laid
// out to the LAYOUT viewport while the student is looking at a zoomed VISUAL
// viewport.
//
// Playwright's own touchscreen API is single-point and cannot express a pinch,
// which is why no earlier sweep caught this. CDP's Input.dispatchTouchEvent
// takes an explicit two-point array, so it can.
//
// POSITIVE CONTROL FIRST, ALWAYS: if the pinch does not actually move
// visualViewport.scale, then every "0 off-screen" below is measuring an
// unzoomed page and means nothing. That is the exact failure that made six
// waves report clean while the founder's letters were being decapitated, so
// this aborts loudly rather than printing a reassuring zero.
//
// ── 2026-08-19 · AND IT WENT ROUND THE ONE DOOR, SO IT MEASURED A PHONE NOBODY
//    OWNS ─────────────────────────────────────────────────────────────────────
//
// This rig opened its own `browser.newContext({ viewport: {402, 874}, … })`.
// That is a bare Playwright context with no safe-area emulation, so
// `env(safe-area-inset-*)` resolved to 0 inside it — the desktop-port zero that
// lib/insets.mjs exists to end — and the app laid out with no home indicator
// and no camera housing. `insets.test.mjs:140` ("newDeviceContext is the one
// door") has convicted line 29 of this file since the day it was added, and
// nobody had run the gate that holds it: `node platform/scripts/tools-tests.mjs`
// = 387 tests, 386 pass, 1 fail, and the one failure was this file.
//
// WHY THREE GATES COULD NOT SEE IT. The repo has TWO test runners and they are
// partitioned by the import a test file declares. `insets.test.mjs` imports
// `node:test`, and vitest's include list names four tools/mobile files
// individually (a deliberate narrowing — a directory glob swallows the
// node:test files and hard-fails on them). So the vitest gate never collects
// this suite, and a brief that reports "tsc + vitest + content" as "the gates"
// is reporting three quarters of them. The tools gate is the fourth.
//
// WHAT THE BYPASS COST, READ OFF THE AXES RATHER THAN WAVED AT. The real
// portrait insets are t59 r0 b34 l0, and globals.css:560-562 pays back
// left/right/bottom on <body> (top deliberately not — devices.mjs explains
// why). So the published verdict splits cleanly in two:
//
//   * THE HORIZONTAL HALF SURVIVES UNTOUCHED. `safe-area-inset-left/right` are
//     0 on the real phone in portrait too, so no substitution can move
//     "shell 402 px inside a 350 px window" or "shell 349 px". The founder's
//     both-edges picture, and the §I8 fix that answered it, are about the
//     width axis and stand.
//   * THE VERTICAL HALF DOES NOT. `verdict.off` counts cutT/cutB as well as
//     cutL/cutR, so "0 off-screen" was a claim about all FOUR edges — and the
//     bottom edge was measured with 34 px of home indicator missing from
//     <body> and from every `env(safe-area-inset-bottom)` the HUD authors,
//     `--sim-touch-floor` among them (see lib/insets.mjs, verified on the
//     deployed product as `+ 34px` in portrait). devices.mjs's own header says
//     the driving controls live in exactly that band. That number has to be
//     re-measured, and this file is now able to.
//
// The stale reading is quoted in a file this lane does not own —
// platform/src/components/sim/lesson-ui/shellViewportContract.test.ts:86-91 —
// and in the commit message of 7e2fd21, which is immutable. Both say
// "0 off-screen" without saying on which axes.
//
// RUN IT BOTH WAYS. `argv[4]` takes real|none, so the historical notchless leg
// is reproducible on today's context, differing in the insets and nothing else.
// That A/B is the only honest way to read the old numbers against the new: the
// door also brings the ladder's locale, timezone, colour scheme and an explicit
// motion mode, so a delta against 2026-08-14 is a delta against all of them.
import { signIn } from "./lib/auth.mjs";
import { DEVICES, MOTION_MODES } from "./lib/devices.mjs";
import { assertInsetsApplied, insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { chromium } from "./lib/pw.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3];
const INSETS = process.argv[4] ?? "real";
const MOTION = "allow";

// THE FOUNDER'S PHONE, DERIVED FROM THE LADDER RATHER THAN RETYPED.
//
// 402x874 is the iPhone 16 PRO. `DEVICES` still carries only the base 16 at
// 393x852, so this profile is built here — and lib/devices.mjs is not this
// lane's file. ROUTE: the Pro belongs in DEVICES and in DEFAULT_DEVICE_IDS, so
// every sweep runs it and ladder.test.mjs guards it; until then this stays.
//
// It is SPREAD from the base iPhone row and overrides only the viewport, which
// keeps the notch numbers in exactly one place. The Pro's safe areas ARE the
// base 16's — same Dynamic Island, same status bar, same home indicator; the
// display is 9 px wider and 22 px taller and nothing about the cutout differs.
// A hand-typed `safeArea: {…}` here would be a second copy of the one fact this
// whole file is about, and the next person to correct devices.mjs would not
// correct the copy. `insets.test.mjs` pins that.
const IPHONE_16_PRO_PORTRAIT = {
  ...DEVICES["iphone16-portrait"],
  id: "iphone16pro-portrait",
  label: "iPhone 16 Pro — portrait (402x874)",
  width: 402,
  height: 874,
};

const browser = await chromium.launch({ headless: true });
// THE ONE DOOR. It builds the context from the profile AND installs the
// safe-area substitution before the first navigation, so the app lays out once,
// with the 34 px indicator it has on his phone, exactly as it does there.
//
// `motion` is stated rather than defaulted because devices.mjs requires it to
// be. "allow" is the right value here twice over: it is what a student's phone
// does, and it is what the ORIGINAL run of this rig used (Playwright's default
// is no-preference), so switching to "reduce" would have moved a second
// variable underneath a re-read. The two settle waits below are what makes
// geometry safe to read with transitions enabled.
const { context, inset } = await newDeviceContext(browser, IPHONE_16_PRO_PORTRAIT, {
  motion: MOTION,
  insets: INSETS,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

console.log(`  engine       : chromium (CDP can express a two-point gesture; Playwright's touchscreen cannot)`);
console.log(`  device       : ${IPHONE_16_PRO_PORTRAIT.label}`);
console.log(`  ${insetBanner(IPHONE_16_PRO_PORTRAIT, inset)}`);
console.log(`  motion       : ${MOTION_MODES[MOTION].says}`);

await signIn(page, { email: "founder@knijka.ai", password: "Knijka2026!" }, BASE);
await page.goto(`${BASE}/simulator?scenario=sc-zebra-approach&level=1`, {
  waitUntil: "domcontentloaded",
  timeout: 300_000,
});
await page.waitForTimeout(25_000);

// SECOND POSITIVE CONTROL, AND IT RANKS WITH THE FIRST.
//
// An emulation that rewrote nothing is indistinguishable from a phone with no
// notch — which is precisely what this rig was guilty of until today — so the
// page is asked what it actually DID before a single geometry number is read.
// In portrait `padding-left/right` are legitimately 0, so the teeth here are the
// rewrite COUNT and <body>'s padding-bottom: it has to be the 34 px the profile
// asked for. If it is not, the run stops instead of publishing.
if (inset.mode === "none") {
  console.log(
    `\n  !! INSETS DISABLED by argv — this is the historical notchless leg, kept only for the A/B.` +
      `\n     Nothing measured below is a claim about his phone.`,
  );
} else {
  try {
    const seen = await assertInsetsApplied(page, inset);
    console.log(
      `\n  inset control OK — engine env() ${JSON.stringify(seen.engine)} (0 is expected: desktop port), ` +
        `<body> padded l${seen.body.left} r${seen.body.right} b${seen.body.bottom}, ` +
        `${seen.agent.declarations} CSS + ${seen.agent.inlineDeclarations} inline declarations rewritten ` +
        `over ${seen.agent.passes} passes`,
    );
  } catch (error) {
    console.log(`\n  !! INSET CONTROL FAILED — ${error.message}`);
    console.log(`     Stopping HERE rather than publishing a number about a phone with no home indicator.`);
    await browser.close();
    process.exit(1);
  }
}

const vvState = () =>
  page.evaluate(() => {
    const vv = window.visualViewport;
    return {
      scale: +(vv?.scale ?? 1).toFixed(3),
      w: Math.round(vv?.width ?? innerWidth),
      h: Math.round(vv?.height ?? innerHeight),
      left: Math.round(vv?.offsetLeft ?? 0),
      top: Math.round(vv?.offsetTop ?? 0),
    };
  });

// ARRIVE ALREADY ZOOMED — which is his actual situation, not a pinch on the
// driving screen.
//
// The first version of this rig pinched at the centre of the road and the
// positive control caught that it did nothing: §I6's `touch-action: none` now
// suppresses pinches on the sim, correctly. But Safari stores zoom PER SITE, so
// a pinch on the lesson list, the dashboard or a theory screen (where it is
// deliberately allowed, for minors reading legal text) leaves every later
// simulator session zoomed from first paint. That is what he described — "from
// the start" — and no gesture on the driving screen can reproduce or undo it.
//
// Emulation.setPageScaleFactor models exactly that: the page is simply already
// scaled when the shell mounts, and the shell has to cope.
async function arriveZoomed(factor) {
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: factor });
  await page.waitForTimeout(1500);
}

const before = await vvState();
await arriveZoomed(1.15); // Safari's «AA» menu one notch up
const after = await vvState();

console.log(`  before zoom  : scale ${before.scale}  window ${before.w}x${before.h} @ ${before.left},${before.top}`);
console.log(`  after  zoom  : scale ${after.scale}  window ${after.w}x${after.h} @ ${after.left},${after.top}`);

if (!(after.scale > before.scale + 0.05)) {
  console.log(
    `\n  !! POSITIVE CONTROL FAILED — the page did not zoom (scale ${before.scale} -> ${after.scale}).`,
  );
  console.log(`     Anything measured below is an UNZOOMED page. Not evidence. Fix the rig first.`);
  await browser.close();
  process.exit(1);
}
console.log(`\n  positive control OK — the page really is zoomed ${before.scale} -> ${after.scale}\n`);

// Now: is any HUD element outside the window the student can actually see?
const verdict = await page.evaluate(() => {
  const vv = window.visualViewport;
  const L = vv.offsetLeft,
    R = vv.offsetLeft + vv.width;
  const T = vv.offsetTop,
    B = vv.offsetTop + vv.height;
  const off = [];
  for (const el of document.querySelectorAll("body *")) {
    const b = el.getBoundingClientRect();
    if (b.width < 4 || b.height < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(" ")
      .trim()
      .replace(/\s+/g, " ");
    if (!own || own.length < 2) continue;
    const cutL = L - b.left,
      cutR = b.right - R,
      cutT = T - b.top,
      cutB = b.bottom - B;
    if (cutL > 1 || cutR > 1 || cutT > 1 || cutB > 1) {
      off.push({
        t: own.slice(0, 30),
        l: Math.round(cutL),
        r: Math.round(cutR),
        tp: Math.round(cutT),
        bt: Math.round(cutB),
      });
    }
  }
  const shell = document.querySelector('[data-sim-play], [data-sim-compact]');
  const sb = shell?.getBoundingClientRect();
  return {
    off,
    shell: sb ? `${Math.round(sb.left)},${Math.round(sb.top)} ${Math.round(sb.width)}x${Math.round(sb.height)}` : "none",
    window: `${Math.round(L)},${Math.round(T)} ${Math.round(vv.width)}x${Math.round(vv.height)}`,
  };
});

console.log(`  visible window : ${verdict.window}`);
console.log(`  shell box      : ${verdict.shell}`);

// SPLIT BY AXIS, because one total hides which half of the verdict the notch
// could have changed. In portrait the substitution moves the BOTTOM edge (34 px)
// and nothing horizontal, so a run that reports a single "0 off-screen" cannot
// be read against the pre-emulation numbers at all. Two counts can.
const cutSides = verdict.off.filter((o) => o.l > 1 || o.r > 1);
const cutEnds = verdict.off.filter((o) => o.tp > 1 || o.bt > 1);
console.log(
  `\n  HUD text outside the visible window: ${verdict.off.length}` +
    `  (horizontal ${cutSides.length} — unaffected by the insets in portrait; ` +
    `vertical ${cutEnds.length} — the axis the 34 px indicator moves)`,
);
const bothEdges = verdict.off.filter((o) => o.l > 1).length > 0 && verdict.off.filter((o) => o.r > 1).length > 0;
verdict.off.slice(0, 14).forEach((o) => {
  const parts = [];
  if (o.l > 1) parts.push(`left ${o.l}px`);
  if (o.r > 1) parts.push(`right ${o.r}px`);
  if (o.tp > 1) parts.push(`top ${o.tp}px`);
  if (o.bt > 1) parts.push(`bottom ${o.bt}px`);
  console.log(`    "${o.t}"  cut ${parts.join(", ")}`);
});
if (bothEdges) console.log(`\n  <<< CUT ON BOTH EDGES AT ONCE — this is the founder's picture, reproduced.`);
else if (verdict.off.length === 0) console.log(`\n  nothing off-screen: the shell followed the zoomed window.`);
else console.log(`\n  <<< HUD text is off the visible window, on ${cutSides.length > 0 ? "the side" : "the top/bottom"} axis.`);

// THE FRAME WINS, so a frame that failed to save has to say so. This was
// `.screenshot({ path: `${OUT}/…` }).catch(() => {})` with OUT possibly
// undefined: a run given no third argument wrote to `undefined/pinch-after.png`,
// swallowed the ENOENT and printed nothing, so the reader went looking for a
// picture that was never taken and, finding none, trusted the numbers instead.
if (OUT) {
  const shot = `${OUT}/pinch-after.png`;
  await page.screenshot({ path: shot }).then(
    () => console.log(`\n  frame: ${shot}`),
    (error) => console.log(`\n  !! FRAME NOT SAVED to ${shot}: ${error.message}`),
  );
} else {
  console.log(`\n  !! no output directory given (argv[3]) — NO FRAME WAS SAVED. Pass one and LOOK at it.`);
}

await browser.close();
// A rig that reproduces the founder's picture and then returns success is the
// same reassuring instrument this file was fixed for, one level out: the exit
// code is what a wrapper or a CI step reads. Off-screen HUD text is a failure.
process.exit(verdict.off.length > 0 ? 1 : 0);
