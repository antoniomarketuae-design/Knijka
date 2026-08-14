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
import { chromium } from "file:///E:/AI%20driver/tools/mobile/lib/pw.mjs";
import { signIn } from "file:///E:/AI%20driver/tools/mobile/lib/auth.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3];
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const browser = await chromium.launch({ headless: true });
// 402x874 — the iPhone 16 PRO, the founder's actual phone. The whole ladder
// only ever had the base iPhone 16 (393x852).
const context = await browser.newContext({
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: IOS_UA,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

await signIn(page, { email: "founder@knijka.ai", password: "Knijka2026!" }, BASE);
await page.goto(`${BASE}/simulator?scenario=sc-zebra-approach&level=1`, {
  waitUntil: "domcontentloaded",
  timeout: 300_000,
});
await page.waitForTimeout(25_000);

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
console.log(`\n  HUD text outside the visible window: ${verdict.off.length}`);
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

await page.screenshot({ path: `${OUT}/pinch-after.png` }).catch(() => {});
await browser.close();
