// =============================================================================
// wave5-landscape-burial.mjs — THE CARD THAT TEACHES «M►» IS STANDING ON «M►».
//
// wave5-manual-drive.mjs found the manual tier unplayable on two of the three
// landscape profiles and intermittently broken on the third — the FOUNDER'S OWN
// PHONE held sideways. `elementFromPoint` at the gear cell's own centre
// answered a NOTIFICATION CARD, and on two profiles that card is titled
// «Скоростният лост е на N»: the card `transmissionSwitchHint()` raises the
// instant you choose «Напреднал», whose text is
//
//     „…За да тръгнеш, задръж „СЪЕД“ и включи първа с „M►“…"
//
// So the sentence naming the control and the rectangle burying it are the same
// object. This file measures that, exactly, so it can be priced rather than
// argued about: both rects, their intersection in px², which cells are lost,
// and how long the card stands there.
//
// The prior wave attributed this to ONE profile (galaxy-gesturebar-landscape,
// 34.6 % of the Bulgarian market). This checks all six.
//
//   node wave5-landscape-burial.mjs --base http://localhost:3491
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://localhost:3491");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/j5-burial`;
mkdirSync(`${OUT}/shots`, { recursive: true });
// THE DESKTOP ROW IS NOT DECORATION — it is item 4's other half. The brief asks
// that the «Напреднал» card teach the TOUCH gesture and that a keyboard reader
// still get the key names. A unit test can prove the mapping; only a second
// viewport on the SAME build, same route, same code path, differing in nothing
// but the input predicate, can prove the shell actually SELECTS between them.
// `insets: "none"` is the true answer on a desktop rather than the lie it would
// be on a phone, and it still goes through `newDeviceContext` because
// `insets.test.mjs` fails any probe here that opens a raw context.
const ROOMY = {
  id: "desktop-roomy",
  label: "Desktop — 1264x619 (the keyboard reader)",
  width: 1264, height: 619, dpr: 1,
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  ua: undefined, orientation: "landscape",
};
const devices = [
  ...resolveDevices(arg("device", null) ? arg("device", null).split(",") : undefined),
  ...(process.argv.includes("--no-desktop") ? [] : [ROOMY]),
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GL_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];

const user = await ensureHarnessUser();
const browser = await chromium.launch({ args: GL_ARGS });
const results = [];

// ONE SIGN-IN FOR THE WHOLE SWEEP. `modules/security/policy.ts:43` budgets the
// login route at 10 per 10 minutes PER IP and answers a tripped budget with the
// same sentence as a wrong password (route.ts:93, so it cannot be an
// enumeration oracle). Six profiles × several sweeps an hour walks straight
// into it, which is what has been killing the second half of this programme's
// six-profile runs — not the shared-password race the lanes blamed.
const { context: authContext } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authContext.newPage();
await signIn(authPage, { email: user.email, password: user.password }, BASE);
const storageState = await authContext.storageState();
await authContext.close();
console.log(`[j5-burial] signed in ONCE as ${user.email}; ${devices.length} profiles reuse the session`);

for (const device of devices) {
  const roomy = device.id === "desktop-roomy";
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: roomy ? "none" : "real", storageState });
  await context.addInitScript(() => { try { window.localStorage.setItem("sim.touchHintSeen", "1"); } catch { /* private */ } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const rec = { device: device.id, label: device.label, inset: insetBanner(device, inset), viewport: { w: device.width, h: device.height } };
  console.log(`\n${"=".repeat(94)}\n${device.label}\n  ${rec.inset}`);

  const tap = async (x, y) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 3, radiusX: 12, radiusY: 12, force: 1 }] });
    await sleep(90);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ x, y, id: 3, radiusX: 12, radiusY: 12, force: 1 }] });
    await sleep(430);
  };
  const centreOf = (re) => page.evaluate((r) => {
    const rx = new RegExp(r);
    for (const el of document.querySelectorAll("button,[aria-label]")) {
      if (!rx.test(el.getAttribute("aria-label") || "")) continue;
      const q = el.getBoundingClientRect();
      if (q.width < 1) continue;
      return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
    }
    return null;
  }, re);
  const tapLabel = async (re) => { const c = await centreOf(re); if (!c) return false; await tap(c.x, c.y); return true; };

  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
  await sleep(3400);
  for (let i = 0; i < 6; i += 1) {
    const hit = await page.evaluate(() => {
      for (const b of document.querySelectorAll("button")) if (/^(Разбрах|Продължи|Започни)$/.test((b.textContent || "").trim())) { b.click(); return true; }
      return false;
    });
    if (!hit) break;
    await sleep(460);
  }
  await sleep(600);

  // Choose «Напреднал». On a phone that is the ⚙ sheet's tier cell — the exact
  // two presses a student makes, the second of which raises the card. On the
  // DESKTOP row the sheet does not exist at all (it is the touch overlay) and
  // the tier lives on the segmented pill, which `PlayAreaStyles` hides on every
  // compact stage. Two different controls, ONE card, and that is the point:
  // the sentence must differ by reader and by nothing else.
  if (roomy) {
    rec.tierControl = "the segmented difficulty pill (desktop)";
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /^Напреднал$/.test((x.textContent || "").trim()));
      if (b) b.click();
      return !!b;
    });
    await sleep(900);
  } else {
    rec.tierControl = "the ⚙ sheet's tier cell (touch)";
    await tapLabel(/^Контроли на автомобила$/);
    await sleep(600);
    for (let i = 0; i < 4; i += 1) {
      const on = await page.evaluate(() => document.querySelector('[aria-label^="Ниво на помощта"]')?.getAttribute("aria-label") ?? null);
      if (on === null || /^Ниво на помощта: Напреднал/.test(on)) break;
      await tapLabel(/^Ниво на помощта/);
      await sleep(500);
    }
  }
  await sleep(900);   // the card is up NOW — this is the state under test

  // ── the measurement ───────────────────────────────────────────────────────
  const shot = await page.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const cards = [...document.querySelectorAll("[aria-label]")]
      .filter((el) => /^(Скоростният лост|Инструкции|Лостът е на)/.test(el.getAttribute("aria-label") || ""))
      .map((el) => ({ label: el.getAttribute("aria-label").slice(0, 90), ...box(el) }));
    const sheet = document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]');
    const cells = sheet
      ? [...sheet.querySelectorAll("button")].map((b) => {
          const r = b.getBoundingClientRect();
          const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
          const hit = document.elementFromPoint(cx, cy);
          return {
            label: b.getAttribute("aria-label"),
            text: (b.textContent || "").trim().slice(0, 8),
            ...box(b), cx, cy,
            self: !!hit && (hit === b || b.contains(hit)),
            onTop: hit ? (hit.closest("[aria-label]")?.getAttribute("aria-label")?.slice(0, 70) ?? hit.tagName) : null,
          };
        })
      : [];
    return {
      sheet: sheet ? box(sheet) : null, cells, cards,
      // THE CARD, VERBATIM. Item 4 asks what it SAYS, so nothing is normalised.
      cardText: /„Напреднал“[^]{0,460}/.exec(document.body.innerText)?.[0]?.replace(/s+/g, " ").trim() ?? null,
      // …and the predicate that chose it, read the way the app reads it.
      coarse: window.matchMedia("(any-pointer: coarse)").matches,
      maxTouchPoints: navigator.maxTouchPoints,
      compact: document.documentElement.dataset.simCompact ?? document.querySelector("[data-sim-compact]")?.getAttribute("data-sim-compact") ?? null,
    };
  });

  const inter = (a, b) => {
    const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return w * h;
  };
  rec.sheet = shot.sheet;
  rec.cards = shot.cards;
  rec.cells = shot.cells;
  rec.buried = shot.cells.filter((c) => !c.self);
  rec.overlapPx2 = shot.sheet && shot.cards.length ? shot.cards.map((c) => ({ card: c.label.slice(0, 40), px2: inter(shot.sheet, c) })) : [];
  rec.cardTeachesTheBuriedCell = /M►|„M►“/.test(shot.cardText ?? "") && rec.buried.some((c) => /по-висока/.test(c.label || ""));

  console.log(`  SHEET  ${JSON.stringify(shot.sheet)}   cells ${shot.cells.length}`);
  for (const c of shot.cards) console.log(`  CARD   [${c.x},${c.y},${c.w}x${c.h}]  «${c.label}»`);
  for (const o of rec.overlapPx2) console.log(`  OVERLAP sheet ∩ card = ${o.px2} px²   («${o.card}»)`);
  if (rec.buried.length === 0) console.log(`  BURIED · none — every one of the ${shot.cells.length} cells answers itself at its own centre`);
  for (const c of rec.buried) console.log(`  BURIED · «${c.text}» ${c.label?.slice(0, 46)} at ${c.cx},${c.cy} → a finger there hits «${c.onTop}»`);
  rec.cardText = shot.cardText;
  rec.predicate = { coarse: shot.coarse, maxTouchPoints: shot.maxTouchPoints, compact: shot.compact };
  console.log(`  PREDICATE · (any-pointer:coarse)=${shot.coarse} · maxTouchPoints=${shot.maxTouchPoints} · compact=${shot.compact}`);
  console.log(`  CARD TEXT · ${shot.cardText ?? "(no card on screen)"}`);
  console.log(`  THE CARD THAT NAMES «M►» IS THE CARD BURYING IT: ${rec.cardTeachesTheBuriedCell}`);

  await page.screenshot({ path: `${OUT}/shots/${device.id}.png`, timeout: 120_000 }).catch(() => {});

  // ── WAVE-2 GUARD, RE-CHECKED HERE BECAUSE IT LIVES IN THE SAME PIXELS ─────
  // The demonstration deck and the ⚙ sheet stand on ONE floor
  // (`TOUCH_CONTROLS_FLOOR`), so LessonScene passes `suppressed={touchSheetOpen}`
  // to DemoDeck: opening the sheet must hide the deck. It is measured on a
  // lesson that HAS a demonstration — `sc-zebra-approach` carries none, and a
  // deck that was never there proves nothing.
  const excl = { route: "sc-junction-stop" };
  try {
    await page.goto(`${BASE}/simulator?scenario=sc-junction-stop&level=1`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(3600);
    for (let i = 0; i < 6; i += 1) {
      const hit = await page.evaluate(() => {
        for (const b of document.querySelectorAll("button")) if (/^(Разбрах|Продължи|Започни)$/.test((b.textContent || "").trim())) { b.click(); return true; }
        return false;
      });
      if (!hit) break;
      await sleep(460);
    }
    const deckVisible = () => page.evaluate(() => {
      const d = document.querySelector('[data-hud="deck"], [data-hud="demo-deck"]');
      if (!d) return null;
      const s = getComputedStyle(d);
      const r = d.getBoundingClientRect();
      return {
        display: s.display, visibility: s.visibility, w: Math.round(r.width), h: Math.round(r.height),
        shown: s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0,
        // The hiding is done by `html[data-sim-car-sheet="open"] [data-hud="demo-deck"]`
        // in PlayAreaStyles — `suppressed` only stops the clock. Read the flag
        // too, so a rule that stops matching is distinguishable from an
        // attribute that stopped being written.
        carSheetAttr: document.documentElement.dataset.simCarSheet ?? null,
      };
    });
    excl.deckToggleFound = await tapLabel(/Демонстрац/);
    await sleep(1000);
    excl.deckWithSheetClosed = await deckVisible();
    excl.sheetOpened = await tapLabel(/^Контроли на автомобила$/);
    await sleep(900);
    excl.deckWithSheetOpen = await deckVisible();
    excl.sheetRectWhileOpen = await page.evaluate(() => {
      const s = document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]');
      if (!s) return null;
      const r = s.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    excl.mutuallyExclusive =
      excl.deckWithSheetClosed?.shown === true && excl.deckWithSheetOpen?.shown === false && excl.sheetRectWhileOpen !== null;
  } catch (e) { excl.error = String(e).slice(0, 160); }
  rec.deckSheetExclusion = excl;
  console.log(`  DECK/SHEET · deck shown with sheet closed ${excl.deckWithSheetClosed?.shown} → with sheet open ${excl.deckWithSheetOpen?.shown} · MUTUALLY EXCLUSIVE ${excl.mutuallyExclusive}`);

  results.push(rec);
  writeFileSync(`${OUT}/burial.json`, JSON.stringify(results, null, 1));
  await context.close();
}
await browser.close();

console.log(`\n${"=".repeat(94)}\nSUMMARY — the ⚙ sheet under the notification column, production, «Напреднал» just chosen`);
for (const r of results) {
  console.log(`${r.device.padEnd(30)} cells ${String(r.cells.length).padStart(2)} · buried ${String(r.buried.length).padStart(2)} · overlap ${r.overlapPx2.map((o) => `${o.px2}px²`).join(" + ") || "0"} · ${r.buried.map((c) => c.text).join(", ") || "—"}`);
}
writeFileSync(`${OUT}/burial.json`, JSON.stringify(results, null, 1));
