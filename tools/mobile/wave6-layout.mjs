// =============================================================================
// wave6-layout.mjs — THE DEPLOYED /simulator, MEASURED. NO /dev/* ANYWHERE.
//
// WHY THIS FILE EXISTS. Waves 2–4 reported „portrait is the CLEAN orientation,
// 0 dead controls, 0 overlap" and every one of those numbers came off
// `/dev/drive-rig`, which `notFound()`s in production. The founder's own
// handset shows the opposite: in portrait the mirror captions sit at both
// screen edges and the 3D view is a horizontal band with black above and below.
// So this probe measures the surface a student opens and nothing else, and it
// REFUSES to print a number unless a live canvas with a non-zero rect is on the
// page (five previous probes reported „overflowCount: 0" from a login page).
//
// THE ONE INSTRUMENT NO PREVIOUS WAVE HAD: A LUMA PROFILE OF THE CANVAS.
// „94.1 % of the stage is canvas" is TRUE in portrait and it is not the claim
// the founder is making. He is not talking about the <canvas> box; he is
// talking about what is INSIDE it — headliner above, dashboard below, a strip
// of world between. A DOM rect cannot see that and every wave so far has only
// had DOM rects. So this one screenshots the canvas and walks it in horizontal
// bands, classifying each band as WORLD (bright, textured) or CABIN (dark,
// flat), and reports the world band's height as a share of the canvas. That
// number is comparable across orientations, which is what §K9 needs.
//
// WHAT IT CLOSES, by row:
//   I10  the minimap column against the thumb band — rect, overlap in px².
//   I23  «Изглед» in the top rail: present, 44 px, topmost at its own centre,
//        and its popover opened BY TOUCH (not .click()).
//   I13  the flank captions, checked for CLIPPING for the first time.
//   N6   portrait: the world band inside the canvas, and every HUD box that
//        leaves the viewport on either side.
//   K9   the rotate-nag: what it covers, and what portrait actually costs.
//
//   node wave6-layout.mjs --base https://…trycloudflare.com
// =============================================================================
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";
import { frameVitals } from "./lib/ready.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://icon-undertaken-earliest-zope.trycloudflare.com");
const EMAIL = arg("email", "founder@knijka.ai");
const PASSWORD = arg("password", "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const TAG = arg("tag", "layout");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave6-layout`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? only.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];

const browser = await chromium.launch({ args: GL });

// ONE SIGN-IN FOR THE WHOLE SWEEP — modules/security/policy.ts budgets /login
// at 10 per 10 minutes per IP, and six profiles × a few sweeps walks into it.
const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
console.log(`[w6-layout] signed in ONCE as ${EMAIL} against ${BASE}`);

const results = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const rec = { device: device.id, label: device.label, orientation: device.orientation, inset: insetBanner(device, inset), viewport: { w: device.width, h: device.height } };
  console.log(`\n${"=".repeat(96)}\n${device.label}\n  ${rec.inset}`);

  const tap = async (x, y, id = 7) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id, radiusX: 12, radiusY: 12, force: 1 }] });
    await sleep(90);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ x, y, id, radiusX: 12, radiusY: 12, force: 1 }] });
    await sleep(420);
  };
  const centreOf = (re) => page.evaluate((r) => {
    const rx = new RegExp(r);
    for (const el of document.querySelectorAll("button,[aria-label]")) {
      if (!rx.test(el.getAttribute("aria-label") || "")) continue;
      const q = el.getBoundingClientRect();
      if (q.width < 1) continue;
      const x = Math.round(q.x + q.width / 2), y = Math.round(q.y + q.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, w: Math.round(q.width), h: Math.round(q.height),
        self: !!hit && (hit === el || el.contains(hit)),
        onTop: hit ? (hit.closest("[aria-label]")?.getAttribute("aria-label")?.slice(0, 50) ?? hit.tagName) : null };
    }
    return null;
  }, re);
  const tapLabel = async (re) => { const c = await centreOf(re); if (!c) return null; await tap(c.x, c.y); return c; };
  const centreOfText = (re) => page.evaluate((r) => {
    const rx = new RegExp(r);
    for (const el of document.querySelectorAll("button,[role='menuitem'],a")) {
      if (!rx.test((el.textContent || "").trim())) continue;
      const q = el.getBoundingClientRect();
      if (q.width < 1) continue;
      return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2), w: Math.round(q.width), h: Math.round(q.height), text: (el.textContent || "").trim().slice(0, 30) };
    }
    return null;
  }, re);
  const tapText = async (re) => { const c = await centreOfText(re); if (!c) return null; await tap(c.x, c.y); return c; };

  // ── THE LUMA PROFILE. The instrument the DOM cannot supply. ──────────────
  const worldBand = async (name, canvas) => {
    const path = `${OUT}/shots/${device.id}__${name}.png`;
    await page.screenshot({ path, timeout: 120_000 });
    const png = readFileSync(path);
    const scale = device.dpr;
    const BANDS = 24;
    const bandH = (canvas.h * scale) / BANDS;
    const rows = [];
    for (let i = 0; i < BANDS; i += 1) {
      const v = frameVitals(png, {
        x: canvas.x * scale, y: canvas.y * scale + i * bandH,
        width: canvas.w * scale, height: Math.max(1, Math.floor(bandH)),
      });
      rows.push({
        band: i,
        yTop: Math.round(canvas.y + (i * canvas.h) / BANDS),
        meanLuma: Math.round(v.meanLuma * 10) / 10,
        stdLuma: Math.round(v.stdLuma * 10) / 10,
        busyShare: Math.round(v.busyShare * 1000) / 1000,
        darkShare: Math.round(v.darkShare * 1000) / 1000,
      });
    }
    // WORLD = bright AND textured. CABIN = dark or flat. The thresholds are the
    // harness's own WORLD_FRAME numbers, applied per band rather than to a
    // single centre crop: darkShare ≤ 0.6 is exactly "a cleared buffer is
    // black, a rendered street is not", and busyShare ≥ 0.06 is the spatial
    // texture a flat panel cannot fake.
    const isWorld = (r) => r.darkShare <= 0.6 && r.busyShare >= 0.06;
    const flags = rows.map(isWorld);
    // longest contiguous run of world bands
    let best = { start: -1, len: 0 }, cur = { start: -1, len: 0 };
    flags.forEach((w, i) => {
      if (w) { if (cur.len === 0) cur.start = i; cur.len += 1; if (cur.len > best.len) best = { ...cur }; }
      else cur = { start: -1, len: 0 };
    });
    return {
      rows, worldBands: flags.filter(Boolean).length, bands: BANDS,
      worldSharePct: Math.round((flags.filter(Boolean).length / BANDS) * 1000) / 10,
      largestRunBands: best.len,
      largestRunPx: Math.round((best.len / BANDS) * canvas.h),
      largestRunTopPx: best.start >= 0 ? Math.round(canvas.y + (best.start / BANDS) * canvas.h) : null,
      largestRunSharePct: Math.round((best.len / BANDS) * 1000) / 10,
      canvas,
    };
  };

  const readCanvas = () => page.evaluate(() => {
    let best = null;
    for (const c of document.querySelectorAll("canvas")) {
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (!best || r.width * r.height > best.w * best.h) best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }
    return best;
  });

  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(4600);

    // ── THE GATE. Nothing below is believed without it. ─────────────────────
    const gate = await page.evaluate(() => {
      let best = null;
      for (const c of document.querySelectorAll("canvas")) {
        const r = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (!best || r.width * r.height > best.w * best.h) best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      }
      const stage = document.querySelector("[data-sim-compact]");
      return {
        hasCanvas: best !== null, canvas: best,
        url: location.pathname + location.search,
        touchControls: !!document.querySelector('[data-hud="touch-controls"]'),
        compact: stage ? stage.getAttribute("data-sim-compact") : null,
        loading: /Зареждане на|Светът не се зареди/.test(document.body.innerText || ""),
      };
    });
    rec.gate = gate;
    console.log(`  GATE · hasCanvas ${gate.hasCanvas} · canvas ${JSON.stringify(gate.canvas)} · url ${gate.url} · data-sim-compact ${gate.compact} · loading ${gate.loading}`);
    if (!gate.hasCanvas || !gate.canvas || gate.canvas.w < 40 || gate.canvas.h < 40 || gate.loading) {
      rec.fatal = "NO LIVE CANVAS — refusing to report geometry";
      console.log(`  FATAL · ${rec.fatal}`);
      results.push(rec); writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1)); await context.close(); continue;
    }

    // ── K9 · WHAT THE FIRST-RUN HINT COVERS, BEFORE IT IS DISMISSED ─────────
    rec.touchHint = await page.evaluate(() => {
      const host = document.querySelector('[data-hud="touch-hint"]');
      if (!host) return { present: false };
      const r = host.getBoundingClientRect();
      const btn = [...host.querySelectorAll("button")].map((b) => (b.textContent || "").trim());
      const rot = /Завърти телефона хоризонтално/.test(host.innerText || "");
      // what does it stand ON? every control whose own centre answers the hint
      const buried = [];
      for (const el of document.querySelectorAll('button,[role="slider"]')) {
        const q = el.getBoundingClientRect();
        if (q.width < 1) continue;
        const hit = document.elementFromPoint(Math.round(q.x + q.width / 2), Math.round(q.y + q.height / 2));
        if (hit && host.contains(hit)) buried.push(el.getAttribute("aria-label")?.slice(0, 40) ?? el.tagName);
      }
      return {
        present: true, rotateNag: rot,
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        sharePct: Math.round(((r.width * r.height) / (window.innerWidth * window.innerHeight)) * 1000) / 10,
        buttons: btn, buried,
        text: (host.innerText || "").replace(/\s+/g, " ").trim().slice(0, 160),
      };
    });
    console.log(`  K9 · first-run hint ${rec.touchHint.present ? `${JSON.stringify(rec.touchHint.box)} ${rec.touchHint.sharePct}% · rotate-nag ${rec.touchHint.rotateNag}` : "absent"}`);
    if (rec.touchHint.present) console.log(`  K9 · it says: ${rec.touchHint.text}`);
    if (rec.touchHint.present) console.log(`  K9 · controls whose own centre answers the hint: ${rec.touchHint.buried.join(", ") || "none"}`);

    // …and the world band WITH the hint up, because that is the first frame a
    // student ever sees.
    rec.worldWithHint = await worldBand("with-hint", gate.canvas);

    // ── DISMISS IT the way a student does, then measure the DRIVING HUD ─────
    for (let i = 0; i < 6; i += 1) {
      const hit = await tapText(/^(Разбрах|Продължи|Започни)$/);
      if (!hit) break;
      await sleep(500);
    }
    await sleep(1200);
    const canvas = await readCanvas();
    rec.canvasAfterDismiss = canvas;

    // ── N6 · THE WORLD BAND INSIDE THE CANVAS ──────────────────────────────
    rec.world = await worldBand("driving", canvas);
    const W = rec.world;
    console.log(`  N6 · canvas ${JSON.stringify(canvas)} — WORLD band ${W.largestRunPx}px of ${canvas.h}px = ${W.largestRunSharePct}% (top at y ${W.largestRunTopPx}); world bands total ${W.worldBands}/${W.bands}`);
    console.log(`  N6 · luma profile ${W.rows.map((r) => (r.darkShare <= 0.6 && r.busyShare >= 0.06 ? "#" : ".")).join("")}   (# = world, . = cabin/flat)`);

    // ── N6b · EVERY HUD BOX THAT LEAVES THE VIEWPORT ───────────────────────
    rec.overflow = await page.evaluate(() => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const overflows = [];
      for (const el of document.querySelectorAll("[data-hud], [aria-label], [role='slider'], [role='toolbar']")) {
        const q = el.getBoundingClientRect();
        if (q.width < 1 || q.height < 1) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
        const cutL = Math.max(0, 0 - q.x), cutR = Math.max(0, q.x + q.width - vw);
        const cutT = Math.max(0, 0 - q.y), cutB = Math.max(0, q.y + q.height - vh);
        if (cutL + cutR + cutT + cutB > 0.5) {
          overflows.push({
            what: el.getAttribute("data-hud") || el.getAttribute("aria-label")?.slice(0, 46) || el.tagName,
            x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height),
            cutL: Math.round(cutL), cutR: Math.round(cutR), cutT: Math.round(cutT), cutB: Math.round(cutB),
            text: (el.textContent || "").trim().slice(0, 30),
          });
        }
      }
      return {
        vw, vh, overflows,
        docScrollW: document.documentElement.scrollWidth, docScrollH: document.documentElement.scrollHeight,
        simVh: getComputedStyle(document.documentElement).getPropertyValue("--sim-vh").trim(),
      };
    });
    console.log(`  N6 · document ${rec.overflow.docScrollW}x${rec.overflow.docScrollH} vs viewport ${rec.overflow.vw}x${rec.overflow.vh} · --sim-vh ${rec.overflow.simVh || "(unset on :root)"}`);
    if (rec.overflow.overflows.length === 0) console.log(`  N6 · OFF-SCREEN · none`);
    for (const o of rec.overflow.overflows) console.log(`  N6 · OFF-SCREEN «${o.what}» [${o.x},${o.y},${o.w}x${o.h}] cut L${o.cutL} R${o.cutR} T${o.cutT} B${o.cutB}`);

    // ── I13 · THE FIVE FLANK CAPTIONS, CHECKED FOR CLIPPING ────────────────
    rec.captions = await page.evaluate(() => {
      const want = ["Мигач наляво", "Мигач надясно", "Поглед в дясното огледало", "Поглед в огледалото за задно виждане", "Поглед в лявото огледало"];
      const vw = window.innerWidth, vh = window.innerHeight;
      const out = [];
      for (const label of want) {
        const b = [...document.querySelectorAll("button")].find((e) => e.getAttribute("aria-label") === label);
        if (!b) { out.push({ label, present: false }); continue; }
        const r = b.getBoundingClientRect();
        const spans = [...b.querySelectorAll("span")];
        const cap = spans[spans.length - 1] ?? null;
        const cr = cap ? cap.getBoundingClientRect() : null;
        out.push({
          label, present: true,
          box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          caption: cap ? (cap.textContent || "").trim() : null,
          capBox: cr ? { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) } : null,
          cutL: cr ? Math.round(Math.max(0, 0 - cr.x)) : 0,
          cutR: cr ? Math.round(Math.max(0, cr.x + cr.width - vw)) : 0,
          cutB: cr ? Math.round(Math.max(0, cr.y + cr.height - vh)) : 0,
          overflowsButton: cr ? Math.round(Math.max(0, cr.width - r.width)) : 0,
          scrollVsClient: cap ? { sw: cap.scrollWidth, cw: cap.clientWidth } : null,
          // and the BUTTON's own distance from each screen edge — his photo
          // shows the caption AT the edge, which is a different complaint
          // from "off the edge" and needs its own number.
          gapLeft: Math.round(r.x), gapRight: Math.round(vw - (r.x + r.width)), gapBottom: Math.round(vh - (r.y + r.height)),
        });
      }
      return out;
    });
    for (const c of rec.captions) {
      if (!c.present) { console.log(`  I13 · «${c.label}» ABSENT`); continue; }
      const bad = c.cutL + c.cutR + c.cutB + c.overflowsButton;
      console.log(`  I13 · «${c.label.slice(0, 34)}» "${c.caption}" ${JSON.stringify(c.capBox)} cutL${c.cutL} cutR${c.cutR} cutB${c.cutB} wider-than-button ${c.overflowsButton} · gaps L${c.gapLeft}/R${c.gapRight}/B${c.gapBottom} ${bad > 0 ? "← CLIPPED" : ""}`);
    }

    // ── THE DEAD-CONTROL CENSUS, on the deployed surface ────────────────────
    rec.census = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('button,[role="slider"]')) {
        const q = el.getBoundingClientRect();
        if (q.width < 1 || q.height < 1) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        const cx = Math.round(q.x + q.width / 2), cy = Math.round(q.y + q.height / 2);
        const hit = document.elementFromPoint(cx, cy);
        const self = !!hit && (hit === el || el.contains(hit));
        out.push({
          label: el.getAttribute("aria-label")?.slice(0, 46) ?? (el.textContent || "").trim().slice(0, 24),
          x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height),
          self, onTop: self ? null : (hit ? (hit.closest("[aria-label]")?.getAttribute("aria-label")?.slice(0, 46) ?? hit.tagName) : "nothing"),
          under44: q.width < 44 || q.height < 44,
        });
      }
      return out;
    });
    const dead = rec.census.filter((c) => !c.self);
    console.log(`  CENSUS · ${rec.census.length} controls · dead ${dead.length} · under-44px ${rec.census.filter((c) => c.under44).length}`);
    for (const d of dead) console.log(`  CENSUS · DEAD «${d.label}» [${d.x},${d.y},${d.w}x${d.h}] → a finger there hits «${d.onTop}»`);

    // ── I10 · THE MINIMAP COLUMN AGAINST THE THUMB BAND ────────────────────
    const readColumn = () => page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const inter = (a, b) => {
        if (!a || !b) return 0;
        const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        return w * h;
      };
      const col = document.querySelector('[data-hud="minimap-column"]');
      const legend = document.querySelector('[data-hud="ribbon-legend"]');
      const sliders = [...document.querySelectorAll('[role="slider"]')];
      const steer = sliders.find((e) => /Волан/.test(e.getAttribute("aria-label") || ""));
      const drive = sliders.find((e) => !/Волан/.test(e.getAttribute("aria-label") || ""));
      const stations = [...document.querySelectorAll("button")]
        .filter((b) => /^(Мигач|Поглед)/.test(b.getAttribute("aria-label") || ""))
        .map((b) => ({ label: b.getAttribute("aria-label").slice(0, 40), ...box(b) }));
      const colBox = col ? box(col) : null;
      const hits = [];
      if (colBox && colBox.w > 0) {
        if (drive) hits.push({ against: `drive pad ${drive.getAttribute("aria-label")?.slice(0, 24)}`, px2: inter(colBox, box(drive)), rect: box(drive) });
        if (steer) hits.push({ against: "steer pad", px2: inter(colBox, box(steer)), rect: box(steer) });
        for (const s of stations) hits.push({ against: s.label, px2: inter(colBox, s), rect: { x: s.x, y: s.y, w: s.w, h: s.h } });
      }
      return {
        column: colBox, legend: legend ? box(legend) : null,
        computedBottom: col ? getComputedStyle(col).bottom : null,
        hudFloorVar: col ? getComputedStyle(col).getPropertyValue("--sim-hud-floor").trim() : null,
        hits: hits.filter((h) => h.px2 > 0), allHits: hits,
        mapOn: !!(col && col.querySelector("svg,canvas")),
      };
    });
    rec.minimapClosed = await readColumn();
    console.log(`  I10 · column(map off) ${JSON.stringify(rec.minimapClosed.column)} computed bottom ${rec.minimapClosed.computedBottom} (--sim-hud-floor ${rec.minimapClosed.hudFloorVar})`);

    // turn the map ON the way a student does (micro menu → «Карта»)
    rec.menuOpened = await tapLabel(/^Меню на урока$|^Меню$/);
    await sleep(600);
    rec.mapRowTapped = await tapText(/Карта/);
    await sleep(900);
    // close the menu if it stayed up
    await tapText(/^(Затвори|Назад)$/).catch(() => null);
    await sleep(400);
    rec.minimapOpen = await readColumn();
    console.log(`  I10 · map ON via «Карта» ${rec.mapRowTapped ? "hit" : "MISSED"} · column ${JSON.stringify(rec.minimapOpen.column)} · drawn ${rec.minimapOpen.mapOn} · bottom ${rec.minimapOpen.computedBottom}`);
    for (const h of rec.minimapOpen.hits) console.log(`  I10 · OVERLAP column ∩ ${h.against} = ${h.px2} px²  (control at ${JSON.stringify(h.rect)})`);
    if (rec.minimapOpen.hits.length === 0) console.log(`  I10 · OVERLAP none`);
    await page.screenshot({ path: `${OUT}/shots/${device.id}__map.png`, timeout: 120_000 }).catch(() => {});

    // ── I23 · «Изглед» IN THE TOP RAIL, PRESSED BY A FINGER ────────────────
    const camBefore = await centreOf(/^Изглед \(камера\)/);
    rec.camera = { button: camBefore };
    if (camBefore) {
      const viewBefore = await page.evaluate(() => document.querySelector('[aria-label^="Изглед (камера)"]')?.getAttribute("aria-label") ?? null);
      await tap(camBefore.x, camBefore.y);
      await sleep(700);
      rec.camera.popover = await page.evaluate(() => {
        const labels = [...document.querySelectorAll("button,[aria-label]")].map((e) => e.getAttribute("aria-label")).filter(Boolean);
        return {
          hasZoom: labels.some((l) => /Мащаб отгоре/.test(l)),
          hasNorth: labels.some((l) => /Отгоре: (посоката|север)/.test(l)),
          options: labels.filter((l) => /^Изглед: /.test(l)),
        };
      });
      // …and the rail's own geometry while the popover is open — the founder's
      // frame shows two word-buttons touching in this corner.
      rec.camera.rail = await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button")].filter((b) => /^(Изглед|Пауза|Клаксон|Контроли|Затвори|Колан)/.test(b.getAttribute("aria-label") || ""));
        const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
        const rows = btns.map((b) => ({ label: b.getAttribute("aria-label").slice(0, 40), ...box(b) }));
        const pairs = [];
        for (let i = 0; i < rows.length; i += 1) for (let j = i + 1; j < rows.length; j += 1) {
          const a = rows[i], c = rows[j];
          const w = Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x));
          const h = Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
          if (w * h > 0) pairs.push({ a: a.label, b: c.label, px2: w * h });
        }
        return { rows, pairs };
      });
      const optRe = (rec.camera.popover.options ?? [])[2] ?? (rec.camera.popover.options ?? [])[0];
      if (optRe) { await tapLabel(new RegExp(`^${optRe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)); await sleep(800); }
      rec.camera.viewBefore = viewBefore;
      rec.camera.viewAfter = await page.evaluate(() => document.querySelector('[aria-label^="Изглед (камера)"]')?.getAttribute("aria-label") ?? null);
      rec.camera.changedByTouch = viewBefore !== null && rec.camera.viewAfter !== null && viewBefore !== rec.camera.viewAfter;
    }
    console.log(`  I23 · «Изглед» ${JSON.stringify(camBefore)}`);
    console.log(`  I23 · popover ${JSON.stringify(rec.camera.popover ?? null)}`);
    console.log(`  I23 · camera changed BY TOUCH: ${rec.camera.changedByTouch} (${rec.camera.viewBefore} → ${rec.camera.viewAfter})`);
    for (const p of rec.camera.rail?.pairs ?? []) console.log(`  I23 · RAIL OVERLAP «${p.a}» ∩ «${p.b}» = ${p.px2} px²`);

    await page.screenshot({ path: `${OUT}/shots/${device.id}.png`, timeout: 120_000 }).catch(() => {});
  } catch (e) {
    rec.error = String(e?.message || e).split("\n")[0].slice(0, 220);
    console.log(`  ERROR · ${rec.error}`);
  }
  results.push(rec);
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
  await context.close();
}
await browser.close();

console.log(`\n${"=".repeat(96)}\nSUMMARY — deployed /simulator, ${BASE}`);
for (const r of results) {
  const capBad = (r.captions ?? []).filter((c) => c.present && (c.cutL + c.cutR + c.cutB + c.overflowsButton) > 0).length;
  const mm = (r.minimapOpen?.hits ?? []).reduce((a, h) => a + h.px2, 0);
  console.log(
    `${r.device.padEnd(30)} world-band ${r.world ? `${r.world.largestRunPx}px = ${r.world.largestRunSharePct}%` : "—"} · off-screen ${r.overflow?.overflows.length ?? "?"} · dead ${(r.census ?? []).filter((c) => !c.self).length} · clipped captions ${capBad} · minimap∩thumbs ${mm} px² · «Изглед» ${r.camera?.button ? (r.camera.changedByTouch ? "works by touch" : "PRESENT but did not change view") : "ABSENT"}${r.fatal ? ` · FATAL ${r.fatal}` : ""}${r.error ? ` · ERROR ${r.error}` : ""}`,
  );
}
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
