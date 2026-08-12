// =============================================================================
// wave8-quality.mjs — §I26(c): IS THERE A QUALITY CONTROL IN THE LESSON MENU,
// DOES IT WORK MID-LESSON, AND WHAT DOES OPENING THE MENU COST THE TOP RAIL?
//
// THREE QUESTIONS, ONE PASS, ON THE SURFACE A STUDENT OPENS (`/simulator`).
// The four mobile waves before this one closed rows on `/dev/drive-rig`, which
// `notFound()`s in production; every number below is taken with a LIVE CANVAS
// asserted first (`hasCanvas === true` AND a non-zero rect), because a probe
// that reports "0 dead controls" over a login redirect has happened here.
//
//   A · THE ROW EXISTS AND IT ACTS. Press it, and read the applied device pixel
//       ratio straight off the drawing buffer: `canvas.width / rect.width` is
//       what THREE actually asked the GPU for. `low → 1.00`, `high → 3.00` on a
//       dpr-3 profile is the whole §I26(c) + dpr claim in one number, and it
//       cannot be faked by a store that changed and a renderer that did not.
//
//   B · IT IS HONEST. The row's own value word and its trade caption are read
//       back verbatim for every tier, so "a student who picks Високо and drops
//       to 20 fps should have been told" is a string in a report, not a promise.
//
//   C · IT DOES NOT MAKE §I11 WORSE. With the menu OPEN, every control on the
//       driving surface is hit-tested at its own centre (`elementFromPoint`),
//       and the menu ∩ top-rail intersection is priced in px². Run this against
//       the deployed build BEFORE and AFTER the change: the delta is the cost of
//       the row.
//
//   node wave8-quality.mjs --base https://…trycloudflare.com --tag before
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://icon-undertaken-earliest-zope.trycloudflare.com");
const EMAIL = arg("email", "founder@knijka.ai");
const PASSWORD = arg("password", "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const TAG = arg("tag", "after");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave8-quality`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? only.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];

const browser = await chromium.launch({ args: GL });
const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
console.log(`[w8-quality] signed in ONCE as ${EMAIL} against ${BASE} · tag "${TAG}"`);

const results = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("sim.touchHintSeen", "1");
      // START FROM THE PRODUCT'S OWN COLD STATE. A stored preset left by an
      // earlier iteration would make "the row starts at Авто" unfalsifiable.
      window.localStorage.removeItem("sim.quality");
      window.localStorage.removeItem("aidrive.sim.quality.v1");
      window.localStorage.removeItem("aidrive.sim.quality.ledger.v1");
    } catch { /* private mode */ }
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const rec = { device: device.id, label: device.label, tag: TAG, inset: insetBanner(device, inset), viewport: { w: device.width, h: device.height, dpr: device.dpr } };
  console.log(`\n${"=".repeat(96)}\n${device.label}\n  ${rec.inset}`);

  const active = new Map();
  const pt = (id, p) => ({ id, x: p.x, y: p.y, radiusX: 12, radiusY: 12, force: 1 });
  const fingerDown = async (id, x, y) => {
    active.set(id, { x, y });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [...active.entries()].map(([i, p]) => pt(i, p)) });
  };
  const fingerUp = async (id) => {
    const p = active.get(id);
    if (!p) return;
    active.delete(id);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [pt(id, p)] });
  };
  const tap = async (x, y, id = 9) => { await fingerDown(id, x, y); await sleep(90); await fingerUp(id); await sleep(420); };
  const centreOf = (re) => page.evaluate((r) => {
    const rx = new RegExp(r);
    for (const el of document.querySelectorAll("button,[aria-label]")) {
      if (!rx.test(el.getAttribute("aria-label") || "")) continue;
      const q = el.getBoundingClientRect();
      if (q.width < 1) continue;
      return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2), w: Math.round(q.width), h: Math.round(q.height) };
    }
    return null;
  }, re);
  const tapLabel = async (re) => { const c = await centreOf(re); if (!c) return null; await tap(c.x, c.y); return c; };
  const tapText = async (re) => {
    const c = await page.evaluate((r) => {
      const rx = new RegExp(r);
      for (const el of document.querySelectorAll("button,[role='menuitem'],a")) {
        if (!rx.test((el.textContent || "").trim())) continue;
        const q = el.getBoundingClientRect();
        if (q.width < 1) continue;
        return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2), text: (el.textContent || "").trim().slice(0, 30) };
      }
      return null;
    }, re);
    if (!c) return null;
    await tap(c.x, c.y);
    return c;
  };
  const clearCards = async () => { for (let i = 0; i < 8; i += 1) { const h = await tapText(/^(Разбрах|Продължи|Започни)$/); if (!h) return i; await sleep(420); } return 8; };

  // THE ONE NUMBER THIS FILE EXISTS FOR. `canvas.width` is the DRAWING BUFFER
  // — what the renderer was told to allocate — and the CSS rect is the box it
  // is stretched over. Their ratio is the dpr that was actually applied, not
  // the one a store believes.
  const canvasNow = () => page.evaluate(() => {
    let best = null;
    for (const c of document.querySelectorAll("canvas")) {
      const r = c.getBoundingClientRect();
      if (r.width < 40) continue;
      if (!best || r.width * r.height > best.cssW * best.cssH) {
        best = {
          cssW: Math.round(r.width), cssH: Math.round(r.height),
          bufW: c.width, bufH: c.height,
          dprApplied: r.width > 0 ? Number((c.width / r.width).toFixed(3)) : null,
          lost: typeof c.getContext === "function" ? null : null,
        };
      }
    }
    return { hasCanvas: !!best, canvas: best, devicePixelRatio: window.devicePixelRatio, url: location.pathname + location.search,
      loading: /Зареждане на|Светът не се зареди/.test(document.body.innerText || "") };
  });

  // Page-side rAF median — printed beside every timing per §G0. This is THIS
  // MACHINE at phone dimensions (ANGLE/D3D11 on a desktop GPU), NOT a handset.
  const harnessFps = () => page.evaluate(() => new Promise((resolve) => {
    const d = []; let last = -1; const t0 = performance.now();
    const tick = (now) => {
      if (last >= 0) d.push(now - last);
      last = now;
      if (now - t0 < 1500) { requestAnimationFrame(tick); return; }
      const v = d.filter((x) => x > 0 && x <= 250).sort((a, b) => a - b);
      resolve(v.length ? Number((1000 / v[Math.floor(v.length / 2)]).toFixed(1)) : null);
    };
    requestAnimationFrame(tick);
  }));

  // EVERY CONTROL ON THE DRIVING SURFACE, HIT-TESTED AT ITS OWN CENTRE.
  // "Dead" is not "covered" — it is `elementFromPoint(centre)` answering
  // something that is not the control, which is what a thumb would find.
  const census = () => page.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const rail = document.querySelector('[data-hud="top-rail"]');
    const menu = document.querySelector('[role="menu"][aria-label="Меню на урока"]');
    const controls = [];
    const seen = new Set();
    const push = (el, zone) => {
      if (seen.has(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      seen.add(el);
      const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
      const hit = document.elementFromPoint(cx, cy);
      controls.push({
        zone,
        label: (el.getAttribute("aria-label") || (el.textContent || "").trim()).slice(0, 40),
        ...box(el), cx, cy,
        self: !!hit && (hit === el || el.contains(hit)),
        onTop: hit ? (hit.closest("[aria-label],[role='menuitem']")?.getAttribute("aria-label")?.slice(0, 46)
          ?? (hit.closest("[role='menuitem']") ? (hit.closest("[role='menuitem']").textContent || "").trim().slice(0, 46) : hit.tagName)) : null,
      });
    };
    if (rail) for (const b of rail.querySelectorAll("button")) push(b, "top-rail");
    if (menu) for (const b of menu.querySelectorAll("[role='menuitem']")) push(b, "menu");
    for (const b of document.querySelectorAll('[data-hud="touch-controls"] [role="slider"], [data-hud="touch-controls"] button')) push(b, "thumb");
    const inter = (a, b) => {
      if (!a || !b) return 0;
      const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return w * h;
    };
    return {
      rail: rail ? box(rail) : null,
      menu: menu ? box(menu) : null,
      menuRailPx2: inter(rail ? box(rail) : null, menu ? box(menu) : null),
      controls,
    };
  });

  // The quality row, by the two things a student sees: its value word and the
  // sentence under it.
  const qualityRow = () => page.evaluate(() => {
    const menu = document.querySelector('[role="menu"][aria-label="Меню на урока"]');
    if (!menu) return { menuOpen: false, present: false };
    for (const item of menu.querySelectorAll("[role='menuitem']")) {
      const label = (item.querySelector("[data-menu-label]")?.textContent || "").trim();
      if (!/^Качество/.test(label)) continue;
      const r = item.getBoundingClientRect();
      return {
        menuOpen: true, present: true,
        label,
        value: (item.querySelector("[data-menu-value]")?.textContent || "").trim(),
        hint: (item.querySelector("[data-menu-hint]")?.textContent || "").trim(),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2),
      };
    }
    // Fall back to raw text so a build WITHOUT the row still reports the menu.
    const rows = [...menu.querySelectorAll("[role='menuitem']")].map((b) => (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40));
    return { menuOpen: true, present: false, rows };
  });

  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(5200);

    // ── GATE. Nothing below is believed without this. ─────────────────────────
    const gate = await canvasNow();
    rec.gate = gate;
    console.log(`  GATE · hasCanvas ${gate.hasCanvas} ${JSON.stringify(gate.canvas)} · window.devicePixelRatio ${gate.devicePixelRatio} · url ${gate.url}`);
    if (!gate.hasCanvas || !gate.canvas || gate.canvas.cssW < 40 || gate.loading) {
      rec.fatal = "NO LIVE CANVAS";
      console.log(`  FATAL · ${rec.fatal} — refusing to report any number from this profile`);
      results.push(rec); writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1)); await context.close(); continue;
    }
    await clearCards();
    await sleep(700);
    rec.fpsIdle = await harnessFps();
    rec.canvasBefore = (await canvasNow()).canvas;
    console.log(`  BEFORE · buffer ${rec.canvasBefore.bufW}x${rec.canvasBefore.bufH} over ${rec.canvasBefore.cssW}x${rec.canvasBefore.cssH} css → dpr APPLIED ${rec.canvasBefore.dprApplied} · harness fps ${rec.fpsIdle} (this machine at phone dimensions)`);

    // ── C · THE MENU OPEN, AND WHAT IT COSTS ──────────────────────────────────
    rec.censusClosed = await census();
    const menuBtn = await tapLabel(/^Меню на урока$/);
    rec.menuButton = menuBtn;
    await sleep(600);
    rec.censusOpen = await census();
    const deadOpen = rec.censusOpen.controls.filter((c) => !c.self);
    const deadClosed = rec.censusClosed.controls.filter((c) => !c.self);
    console.log(`  MENU · rect ${JSON.stringify(rec.censusOpen.menu)} · rail ${JSON.stringify(rec.censusOpen.rail)}`);
    console.log(`  MENU · menu ∩ top-rail = ${rec.censusOpen.menuRailPx2} px²`);
    console.log(`  DEAD · closed ${deadClosed.length}/${rec.censusClosed.controls.length} · OPEN ${deadOpen.length}/${rec.censusOpen.controls.length}`);
    for (const c of deadOpen) console.log(`  DEAD · [${c.zone}] «${c.label}» at ${c.cx},${c.cy} → a finger there hits «${c.onTop}»`);

    // ── A + B · THE ROW, PRESSED ──────────────────────────────────────────────
    const row0 = await qualityRow();
    rec.row = row0;
    if (!row0.present) {
      console.log(`  §I26(c) · NO QUALITY ROW. The menu is: ${(row0.rows ?? []).join(" · ")}`);
    } else {
      console.log(`  §I26(c) · row present: «${row0.label}» = «${row0.value}» ${row0.w}x${row0.h}`);
      console.log(`            hint: „${row0.hint}"`);
      const steps = [];
      for (let i = 0; i < 4; i += 1) {
        const before = await qualityRow();
        if (!before.present) break;
        await tap(before.cx, before.cy, 7);
        await sleep(1500);
        const after = await qualityRow();
        const cv = await canvasNow();
        const fps = await harnessFps();
        const step = {
          from: before.value, to: after.value, hint: after.hint,
          rowH: after.h,
          canvas: cv.canvas, alive: cv.hasCanvas && !!cv.canvas && cv.canvas.cssW > 40,
          dprApplied: cv.canvas?.dprApplied ?? null,
          fps,
        };
        steps.push(step);
        console.log(`  PRESS ${i + 1} · «${step.from}» → «${step.to}» · buffer ${cv.canvas?.bufW}x${cv.canvas?.bufH} → dpr APPLIED ${step.dprApplied} · canvas alive ${step.alive} · harness fps ${fps}`);
        console.log(`            hint: „${step.hint}"`);
      }
      rec.steps = steps;
      rec.dprLadder = steps.map((s) => `${s.to}:${s.dprApplied}`).join(" ");
      rec.everLostCanvas = steps.some((s) => !s.alive);

      // MID-LESSON MEANS THE LESSON IS STILL THERE AFTERWARDS. Close the menu,
      // put a thumb on the pad, and see the car move at the tier just chosen.
      await tapLabel(/^Затвори менюто на урока$/);
      await sleep(600);
      const pad = await page.evaluate(() => {
        const el = [...document.querySelectorAll('[role="slider"]')].find((e) => /^Ход/.test(e.getAttribute("aria-label") || ""));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
      });
      if (pad) {
        const speed = () => page.evaluate(() => {
          const el = document.querySelector('[aria-label^="Скорост "]');
          const m = el ? /Скорост ([\d.,]+)/.exec(el.getAttribute("aria-label")) : null;
          return m ? Number(m[1].replace(",", ".")) : null;
        });
        const b = await speed();
        await fingerDown(3, pad.cx, pad.cy - 55);
        await sleep(3200);
        const during = await speed();
        const fpsDriving = await harnessFps();
        await fingerUp(3);
        rec.drivesAfterSwitch = { before: b, during, moved: (during ?? 0) > (b ?? 0) + 0.5, fpsDriving };
        console.log(`  MID-LESSON · after the switch the car still drives: ${b} → ${during} km/h · MOVED ${rec.drivesAfterSwitch.moved} · harness fps while driving ${fpsDriving}`);
        rec.canvasAfterDrive = (await canvasNow()).canvas;
        console.log(`  MID-LESSON · buffer after driving ${rec.canvasAfterDrive?.bufW}x${rec.canvasAfterDrive?.bufH} → dpr ${rec.canvasAfterDrive?.dprApplied}`);
      }
    }
    await page.screenshot({ path: `${OUT}/shots/${TAG}-${device.id}.png`, timeout: 120_000 }).catch(() => {});
  } catch (e) {
    rec.error = String(e?.message || e).split("\n")[0].slice(0, 240);
    console.log(`  ERROR · ${rec.error}`);
  }
  results.push(rec);
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
  await context.close();
}
await browser.close();

console.log(`\n${"=".repeat(96)}\nSUMMARY — ${BASE} · tag "${TAG}"`);
for (const r of results) {
  console.log(
    `${r.device.padEnd(30)} canvas ${r.gate?.hasCanvas ?? "—"} · dpr ${r.canvasBefore?.dprApplied ?? "—"} → [${r.dprLadder ?? "—"}] · row ${r.row?.present ?? "—"} · ` +
      `dead(menu open) ${r.censusOpen ? r.censusOpen.controls.filter((c) => !c.self).length : "—"}/${r.censusOpen?.controls.length ?? "—"} · ` +
      `menu∩rail ${r.censusOpen?.menuRailPx2 ?? "—"} px² · drives after ${r.drivesAfterSwitch?.moved ?? "—"}${r.fatal ? ` · FATAL ${r.fatal}` : ""}${r.error ? ` · ERROR ${r.error}` : ""}`,
  );
}
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
