// =============================================================================
// wave5-glance-prod.mjs — THE GLANCE ENVELOPE, RE-PROVED ON PRODUCTION.
//
// WHY IT HAD TO BE DONE AGAIN. Wave 3's 30–97 % road-band figures and its
// mirror-order card both came off `/dev/drive-rig`. That route calls
// `notFound()` under NODE_ENV=production, so no student has ever seen it — and
// the SAME dev-route instrument is what missed three dead controls that a
// production sweep then found. A number measured only where the product does
// not exist is a number nobody should stand behind, so this asks the identical
// question on the authenticated `/simulator` route of a `next build`.
//
// WHAT THE DEV ROUTE GAVE US THAT PRODUCTION DOES NOT:
//   · `window.__driveRig.press()` — gone. The positive control is now a REAL
//     held KeyboardEvent through Playwright, which is what a student's keyboard
//     sends and is strictly closer to the truth than the rig's synthetic one.
//   · `window.__glanceProbe` — gone. So the head turn is measured in PIXELS,
//     which was always the ground truth anyway (glance-probe.mjs).
//
// THE TIMING IS THE INSTRUMENT. A key is HELD; a BUTTON is a tap, and
// `GLANCE_TAP_HOLD_S = 0.9` (modules/sim/scene/cabin.ts) auto-releases it, then
// the head eases home over GLANCE_EASE_S = 0.18 s. A frame taken a second later
// shows a camera back where it started — indistinguishable from one that never
// moved. So every sample carries the delay it was taken at, and +1800 ms is
// kept as the control-for-the-control: by then a tap MUST read as baseline.
//
// PART B closes the loop to the GRADER, on production, with no driving at all.
// `PRE_DRIVE_STEPS["adjust-mirrors"].validate = (s) => s.seatAdjusted`, so three
// glances before the seat step is an out-of-order completion and the procedure
// machine raises «Нарушен ред: настройка на огледалата» (machine.ts:98). If a
// thumb can produce that sentence, the thumb reached the grader.
//
//   node wave5-glance-prod.mjs --base http://localhost:3491
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";
import { decodePng } from "./lib/ready.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://localhost:3491");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/j5-glance`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const devices = resolveDevices(arg("device", null) ? arg("device", null).split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GL_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];

const STATIONS = [
  ["Л", "Поглед в лявото огледало", "KeyQ"],
  ["З", "Поглед в огледалото за задно виждане", "KeyF"],
  ["Д", "Поглед в дясното огледало", "KeyE"],
];
const DELAYS = [250, 600, 1800];

/** Fraction of pixels differing by more than `tol` on any channel. */
function diffFraction(aPng, bPng, tol = 10) {
  const a = decodePng(aPng), b = decodePng(bPng);
  if (a.width !== b.width || a.height !== b.height) throw new Error("frame size changed");
  const n = a.width * a.height;
  let changed = 0;
  for (let i = 0; i < n; i += 1) {
    const o = i * a.channels;
    if (Math.abs(a.data[o] - b.data[o]) > tol || Math.abs(a.data[o + 1] - b.data[o + 1]) > tol || Math.abs(a.data[o + 2] - b.data[o + 2]) > tol) changed += 1;
  }
  return changed / n;
}
const pct = (f) => `${(f * 100).toFixed(1)}%`;

const user = await ensureHarnessUser();
const browser = await chromium.launch({ args: GL_ARGS });
const results = [];

// ── SIGN IN ONCE. THE SECOND HALF OF EVERY SWEEP IN THIS PROGRAMME DIED HERE ─
//
// Three lanes have now reported a six-profile run that lost its session
// mid-sweep and blamed `ensureHarnessUser()` for randomising a shared password.
// That is one cause and it is not this one. `modules/security/policy.ts:43`:
//
//     login: { name: "login", limit: 10, windowSec: 10 * 60 }
//
// — the PRODUCT's own brute-force budget, ten logins per ten minutes per IP,
// and `route.ts:93` deliberately answers a tripped budget with the SAME
// message as a wrong password so it cannot become an account-enumeration
// oracle. A six-profile sweep signs in six times; two sweeps back to back is
// twelve, and profiles 4-6 of the second one are told «Грешен имейл или
// парола» by an app that is working exactly as designed. That is what killed
// this file's first run, at profile 4, and there is nothing to fix in the app.
//
// One sign-in, storage state reused — the pattern `deck-captions.mjs --prod`
// already uses (its own line 597).
const { context: authContext } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authContext.newPage();
await signIn(authPage, { email: user.email, password: user.password }, BASE);
const storageState = await authContext.storageState();
await authContext.close();
console.log(`[j5-glance] signed in ONCE as ${user.email}; ${devices.length} profiles will reuse the session (login budget is 10 per 10 min per IP)`);

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
  await context.addInitScript(() => {
    try { window.localStorage.setItem("sim.touchHintSeen", "1"); } catch { /* private */ }
    if (typeof navigator.getGamepads !== "function") {
      Object.defineProperty(navigator, "getGamepads", { configurable: true, writable: true, value: () => [] });
    }
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const rec = { device: device.id, label: device.label, inset: insetBanner(device, inset), stations: {} };
  console.log(`\n${"=".repeat(94)}\n${device.label}\n  ${rec.inset}`);

  const touchTap = async (x, y, holdMs = 90) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 7, radiusX: 12, radiusY: 12, force: 1 }] });
    await sleep(holdMs);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ x, y, id: 7, radiusX: 12, radiusY: 12, force: 1 }] });
  };
  const station = (labelBg) => page.evaluate((l) => {
    const b = document.querySelector(`[aria-label="${l}"]`);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    // WHAT WOULD A FINGER HIT? `getBoundingClientRect` says where the button is
    // LAID OUT; a card on top of it leaves the rect exactly where it was.
    return { x, y, w: Math.round(r.width), h: Math.round(r.height), self: !!hit && (hit === b || b.contains(hit)), onTop: hit?.closest?.("[aria-label]")?.getAttribute("aria-label") ?? hit?.tagName ?? null };
  }, labelBg);
  const clearCards = async () => {
    for (let i = 0; i < 8; i += 1) {
      const hit = await page.evaluate(() => {
        for (const b of document.querySelectorAll("button")) {
          if (/^(Разбрах|Продължи|Започни)$/.test((b.textContent || "").trim())) { b.click(); return true; }
        }
        return false;
      });
      if (!hit) return i;
      await sleep(460);
    }
    return 8;
  };

  // ══ PART A · THE ENVELOPE, IN PIXELS, ON /simulator ══════════════════════
  await page.goto(`${BASE}/simulator?scenario=sc-zebra-approach&level=1`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
  await sleep(4000);
  await clearCards();
  await sleep(1200);

  const canvas = await page.evaluate(() => {
    let best = null;
    for (const c of document.querySelectorAll("canvas")) {
      const r = c.getBoundingClientRect();
      if (!best || r.width * r.height > best.width * best.height) best = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return best;
  });
  if (!canvas) { rec.fatal = "no canvas"; results.push(rec); await context.close(); continue; }
  // The CENTRE BAND of the canvas — that is the road, and no control paints
  // there. Identical definition to glance-probe.mjs so dev and production are
  // the same measurement.
  const clip = {
    x: Math.round(canvas.x + canvas.width * 0.2),
    y: Math.round(canvas.y + canvas.height * 0.2),
    width: Math.round(canvas.width * 0.6),
    height: Math.round(canvas.height * 0.6),
  };
  rec.roadBand = clip;
  const shoot = () => page.screenshot({ clip, animations: "allow", timeout: 120_000 });
  console.log(`  ROAD BAND ${clip.width}x${clip.height} at ${clip.x},${clip.y}`);

  // BASELINE NOISE. The world is not still — traffic drives, lamps blink. Wait
  // until it IS, then state the residue: anything at or under it is "nothing
  // moved", and the number is printed so nobody has to trust it.
  let noise = [], noiseMax = 1;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    noise = [];
    for (let i = 0; i < 4; i += 1) { const a = await shoot(); await sleep(320); noise.push(diffFraction(a, await shoot())); }
    noiseMax = Math.max(...noise);
    if (noiseMax < 0.12) break;
    await sleep(2400);
  }
  rec.noise = { samples: noise, max: noiseMax };
  console.log(`  BASELINE NOISE (nothing pressed): ${noise.map(pct).join(" · ")} → floor ${pct(noiseMax)}${noiseMax >= 0.12 ? "  ⚠ never went still — read every row against THIS" : ""}`);

  const measure = async (label, act, release) => {
    const rows = [];
    for (const delay of DELAYS) {
      await sleep(1700);                       // fully home before the next arm
      const before = await shoot();
      await act();
      await sleep(delay);
      const after = await shoot();
      if (release) await release();
      rows.push({ delay, frac: diffFraction(before, after) });
    }
    console.log(`  ${label}`);
    for (const r of rows) console.log(`     +${String(r.delay).padStart(4)} ms   road pixels changed ${pct(r.frac).padStart(6)}`);
    return rows;
  };

  // POSITIVE CONTROL — a HELD Q, through a REAL KeyboardEvent (there is no
  // `__driveRig` in production). If this does not move the road, the instrument
  // is broken and no negative result below means anything.
  rec.positiveControl = await measure(
    "POSITIVE CONTROL — keyboard Q HELD (real KeyboardEvent, never released during the capture)",
    () => page.keyboard.down("KeyQ"),
    () => page.keyboard.up("KeyQ"),
  );

  for (const [glyph, labelBg] of STATIONS) {
    const st = await station(labelBg);
    rec.stations[glyph] = { labelBg, box: st };
    if (!st) { console.log(`  «${glyph}» ABSENT from this screen`); continue; }
    if (!st.self) console.log(`  ⚠ «${glyph}» is COVERED at its own centre — a finger there hits ${st.onTop}`);
    rec.stations[glyph].rows = await measure(
      `«${glyph}» ${labelBg} — REAL TOUCH at ${st.x},${st.y} (${st.w}x${st.h}, self-hit ${st.self})`,
      () => touchTap(st.x, st.y),
      null,
    );
    rec.stations[glyph].peak = Math.max(...rec.stations[glyph].rows.filter((r) => r.delay < 1800).map((r) => r.frac));
    rec.stations[glyph].tail = rec.stations[glyph].rows.find((r) => r.delay === 1800)?.frac ?? null;
  }
  rec.positivePeak = Math.max(...rec.positiveControl.filter((r) => r.delay < 1800).map((r) => r.frac));
  await page.screenshot({ path: `${OUT}/shots/${device.id}-envelope.png`, timeout: 120_000 }).catch(() => {});

  // ══ PART B · THE SAME THREE TAPS, AT THE GRADER ══════════════════════════
  // No driving: three glances before the seat step is an out-of-order
  // completion, so the sentence itself is the receipt.
  const grade = { reached: false };
  try {
    await page.goto(`${BASE}/simulator`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForTimeout(3000);
    // Harness plumbing: the lesson card is not the control under test.
    grade.started = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("article,section,div")].filter((n) => /Подготовка и потегляне/.test(n.textContent || ""));
      for (const c of cards.reverse()) {
        const b = [...c.querySelectorAll("button")].find((x) => /^(Започни урока|Карай отново)$/.test((x.textContent || "").trim()));
        if (b) { b.click(); return true; }
      }
      return false;
    });
    if (grade.started) {
      await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
      await sleep(5000);
      await clearCards();
      await sleep(1500);
      grade.textBefore = await page.evaluate(() => (document.body.innerText || "").replace(/\n+/g, " · "));
      grade.wrongOrderBefore = /Нарушен ред/.test(grade.textBefore);
      grade.taps = [];
      for (const [glyph, labelBg] of STATIONS) {
        const st = await station(labelBg);
        if (!st) { grade.taps.push({ glyph, hit: false, reason: "absent" }); continue; }
        await touchTap(st.x, st.y, 120);
        grade.taps.push({ glyph, hit: true, x: st.x, y: st.y, self: st.self });
        await sleep(1500);
      }
      await sleep(2500);
      const screen = await page.evaluate(() => (document.body.innerText || "").replace(/\n+/g, " · "));
      grade.textAfter = screen;
      grade.card = /Нарушен ред[^·]*/.exec(screen)?.[0]?.trim() ?? null;
      grade.reached = /Нарушен ред:\s*настройка на огледалата/i.test(screen);
      grade.mirrorsStepSeen = /настройка на огледалата|Настройка на огледалата/i.test(screen);
      await page.screenshot({ path: `${OUT}/shots/${device.id}-grader.png`, timeout: 120_000 }).catch(() => {});
    }
  } catch (e) { grade.error = String(e).slice(0, 200); }
  rec.grader = grade;
  console.log(`  GRADER · lesson started ${grade.started} · three taps → «${grade.card ?? "(nothing)"}» · WRONG-ORDER CARD RAISED ${grade.reached}`);

  results.push(rec);
  writeFileSync(`${OUT}/glance.json`, JSON.stringify(results, null, 1));
  await context.close();
}
await browser.close();

console.log(`\n${"=".repeat(94)}\nSUMMARY — glance envelope, PRODUCTION /simulator, real touch`);
for (const r of results) {
  const s = (g) => (r.stations?.[g]?.peak === undefined ? "  --  " : pct(r.stations[g].peak).padStart(6));
  console.log(
    `${r.device.padEnd(30)} noise ${pct(r.noise?.max ?? NaN).padStart(6)} · held-Q ${pct(r.positivePeak ?? NaN).padStart(6)} ·` +
    ` Л ${s("Л")} · З ${s("З")} · Д ${s("Д")} · wrong-order card ${r.grader?.reached ? "RAISED" : "no"}`,
  );
}
writeFileSync(`${OUT}/glance.json`, JSON.stringify(results, null, 1));
