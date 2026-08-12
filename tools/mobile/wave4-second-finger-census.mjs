// =============================================================================
// wave4-second-finger-census.mjs — EVERY CONTROL ON THE DRIVING SCREEN, ASKED
// THE ONE QUESTION WAVE 1 ANSWERED FOR FOUR OF THEM.
//
// C2's premise: a `click` born of a touch is a COMPATIBILITY MOUSE EVENT and
// the spec dispatches it only for the PRIMARY touch point. So any control whose
// only binding is `onClick` is unreachable while a second finger is on the
// glass — which is every second of driving.
//
// Wave 1 fixed four call sites. This file asks how many there are, and it does
// it in two halves that check each other:
//
//   RUNTIME — with a real finger planted on the road (CDP touch id 1), press
//     every visible control with a second finger (id 2) and record whether the
//     browser dispatched a `click` to it. Handlers are neutralised at document
//     capture (`stopPropagation`, never `preventDefault` — preventing the
//     default is what SUPPRESSES the compatibility click and would manufacture
//     the very finding) so the sweep can press «Пауза» and «Рестарт» without
//     wrecking the state it is measuring.
//   SOURCE — map each on-screen label back to the component that authored it
//     and report whether that component binds the pointer path.
//
// A control is DEAD under a second finger when the runtime says "no click" and
// the source says "onClick only". Either half alone is a guess.
//
//   node wave4-second-finger-census.mjs --base http://localhost:3242
// =============================================================================
import { mkdirSync, readFileSync, writeFileSync, globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://localhost:3242");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = `${HERE}/.out/wave4-census`;
mkdirSync(OUT, { recursive: true });

// ── the source half ─────────────────────────────────────────────────────────
const SRC = `${HERE}/../../platform/src`;
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const FILES = globSync("**/*.tsx", { cwd: SRC }).map((f) => f.split("\\").join("/"));
const SOURCE = new Map();
for (const rel of FILES) {
  const s = strip(readFileSync(`${SRC}/${rel}`, "utf8"));
  SOURCE.set(rel, {
    text: s,
    buttons: (s.match(/<button\b/g) || []).length,
    tap: (s.match(/\{\.\.\.tap[A-Za-z]*\}/g) || []).length,
    hold: (s.match(/\{\.\.\.handlers\}/g) || []).length,
    pointer: (s.match(/onPointerDown[=:]/g) || []).length,
  });
}
/**
 * Which component authored this accessible name?
 *
 * ANCHORED TO THE ATTRIBUTE, NOT TO THE SUBSTRING, and the first version of
 * this function shows why: a bare `includes("Пауза")` attributed the rail's
 * «Пауза» to `LessonScene.tsx` (which merely passes an `onPause` prop and
 * mentions the word) and printed it as the one DEAD control on the screen. It
 * is a `RailButton`, it has had `useTapActivation` since wave 1, and the report
 * would have sent someone to fix a button that works.
 */
function ownersOf(label) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attr = new RegExp(`(aria-label|labelBg|wordBg|textBg)=(\\{?)["\`]${esc}`);
  // …AND AS A JSX TEXT NODE. SimOverlay's «ЗАЩО» and «РАЗБРАХ» are children,
  // not attributes, so an attribute-only matcher missed the one file that
  // covers them and attributed «Защо» to `theory/PracticeSession.tsx` — a
  // component that is not even mounted on the driving screen.
  const text = new RegExp(`>\\s*${esc}\\s*<|["\`]${esc}["\`]`);
  const hits = [];
  for (const [rel, f] of SOURCE) if (attr.test(f.text) || text.test(f.text)) hits.push(rel);
  if (hits.length === 0) {
    // Fall back to a loose match, but SAY SO — an unanchored hit is a guess.
    for (const [rel, f] of SOURCE) if (f.text.includes(label.slice(0, 26))) hits.push(`${rel} (loose)`);
  }
  // TWO FILES CAN CARRY THE SAME NAME and one of them is the renderer: the rail
  // passes `wordBg="Пауза"`, and `LessonScene` names the same button in the
  // prop it hands down. Report BOTH and call the control dead only when NONE of
  // its candidates has a pointer path — a tiebreak by path length picked the
  // wrong one and printed a working «Пауза» as the screen's only dead control.
  return hits.sort((a, b) => a.includes("dev/") - b.includes("dev/") || a.length - b.length);
}
function coverage(relRaw) {
  const rel = String(relRaw).replace(" (loose)", "");
  const f = SOURCE.get(rel);
  if (!f) return "unknown";
  if (f.buttons === 0) return "no <button> (composed elsewhere)";
  const covered = f.tap + f.hold + f.pointer;
  if (covered === 0) return `NONE — ${f.buttons} <button>, 0 pointer paths`;
  if (f.tap + f.hold >= f.buttons) return `full — ${f.tap} tap + ${f.hold} hold over ${f.buttons}`;
  return `partial — ${f.tap} tap + ${f.hold} hold + ${f.pointer} raw over ${f.buttons} <button>`;
}

const user = await ensureHarnessUser();
const devices = resolveDevices([arg("device", "iphone16-portrait")]);
const browser = await chromium.launch();
const report = [];

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real" });
  await context.addInitScript(() => { try { window.localStorage.setItem("sim.touchHintSeen", "1"); } catch { /* private */ } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  console.log(`\n${"=".repeat(96)}\n${device.label}\n  ${insetBanner(device, inset)}`);

  const active = new Map();
  const pt = (id, p) => ({ id, x: p.x, y: p.y, radiusX: 12, radiusY: 12, force: 1 });
  const down = async (id, x, y) => {
    active.set(id, { x, y });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [...active.entries()].map(([i, p]) => pt(i, p)) });
  };
  const up = async (id) => {
    const p = active.get(id); if (!p) return;
    active.delete(id);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [pt(id, p)] });
  };

  await signIn(page, { email: user.email, password: user.password }, BASE);
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 180_000 });
  await page.waitForTimeout(3200);
  for (let i = 0; i < 6; i += 1) {
    const hit = await page.evaluate(() => {
      for (const b of document.querySelectorAll("button")) if (/^(Разбрах|Продължи|Започни)$/.test((b.textContent || "").trim())) { b.click(); return true; }
      return false;
    });
    if (!hit) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(600);
  // Open the ⚙ sheet and the lesson menu so their cells are in the census too.
  const tapOnce = async (re) => {
    const c = await page.evaluate((r) => {
      const rx = new RegExp(r);
      for (const b of document.querySelectorAll("button")) {
        // TEXT CONTENT TOO. The deck's own toggle is «🎬 Демонстрация ▸» — a
        // child text node with no `aria-label` — so an attribute-only matcher
        // never opened the deck and the census reported „0 new" for the one
        // state it was added to reach.
        if (!rx.test(b.getAttribute("aria-label") || "") && !rx.test((b.textContent || "").trim())) continue;
        const q = b.getBoundingClientRect();
        if (q.width > 0) return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
      }
      return null;
    }, re);
    if (!c) return false;
    await down(9, c.x, c.y); await page.waitForTimeout(70); await up(9); await page.waitForTimeout(450);
    return true;
  };
  // EVERY STATE THE DRIVING SCREEN HAS, not just the bare one. A control that
  // only exists behind the ⚙ or the ☰ is still a control a driving student
  // reaches for with a second thumb on the glass.
  const STATES = [
    { name: "bare · driving", open: async () => {} },
    { name: "⚙ sheet open", open: async () => { await tapOnce("^Контроли на автомобила$"); } },
    { name: "☰ lesson menu open", open: async () => { await tapOnce("^Контроли на автомобила$"); await tapOnce("^Меню на урока$"); } },
    { name: "demonstration deck expanded", open: async () => { await tapOnce("Демонстрац"); } },
  ];
  const seenLabels = new Set();

  // ── the recorder ──────────────────────────────────────────────────────────
  await page.evaluate(() => {
    window.__cn = { clicks: [], pdowns: [], pups: [], block: false };
    const key = (t) => { const el = t instanceof Element ? t.closest("[aria-label]") : null; return el ? el.getAttribute("aria-label") : (t?.tagName ?? "?"); };
    // `block` is OFF while the sweep is opening a panel and ON while it is
    // pressing: the first version blocked from the moment it was installed, so
    // the ⚙ and the ☰ never opened and the census reported the bare screen
    // three times over and called it four states.
    //
    // stopPropagation ONLY. `preventDefault()` on pointerdown/touchstart is
    // exactly what suppresses the compatibility click — using it here would
    // fabricate the finding this file exists to test.
    document.addEventListener("click", (e) => { window.__cn.clicks.push({ on: key(e.target), detail: e.detail }); if (window.__cn.block) e.stopPropagation(); }, true);
    document.addEventListener("pointerdown", (e) => { window.__cn.pdowns.push({ on: key(e.target), id: e.pointerId }); if (window.__cn.block) e.stopPropagation(); }, true);
    document.addEventListener("pointerup", (e) => { window.__cn.pups.push({ on: key(e.target), id: e.pointerId }); if (window.__cn.block) e.stopPropagation(); }, true);
  });

  const rows = [];
  for (const state of STATES) {
    await page.evaluate(() => { window.__cn.block = false; });
    await state.open();
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.__cn.block = true; });
    const inventory = await page.evaluate(() => {
      const out = [];
      for (const b of document.querySelectorAll("button")) {
        const q = b.getBoundingClientRect();
        if (q.width < 8 || q.height < 8) continue;
        const cs = getComputedStyle(b);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
        const x = Math.round(q.x + q.width / 2), y = Math.round(q.y + q.height / 2);
        const hit = document.elementFromPoint(x, y);
        out.push({
          label: b.getAttribute("aria-label") || (b.textContent || "").trim().slice(0, 40) || "(unnamed)",
          x, y, w: Math.round(q.width), h: Math.round(q.height),
          reachable: !!hit && (hit === b || b.contains(hit)),
        });
      }
      return out;
    });
    // PLANT THE FIRST FINGER ON THE ROAD — not on a pad, so nothing in the car
    // changes while the census runs, and it is not pointer capture either.
    await down(1, Math.round(device.width / 2), Math.round(device.height * 0.32));
    await page.waitForTimeout(200);
    let fresh = 0;
    for (const c of inventory) {
      if (seenLabels.has(c.label)) continue;
      seenLabels.add(c.label);
      fresh += 1;
      if (!c.reachable) { rows.push({ ...c, state: state.name, click: null, note: "buried — a finger cannot reach it" }); continue; }
      await page.evaluate(() => { window.__cn.clicks.length = 0; window.__cn.pdowns.length = 0; window.__cn.pups.length = 0; });
      await down(2, c.x, c.y);
      await page.waitForTimeout(90);
      await up(2);
      await page.waitForTimeout(240);
      const seen = await page.evaluate(() => ({ clicks: window.__cn.clicks.slice(), pdowns: window.__cn.pdowns.slice(), pups: window.__cn.pups.slice() }));
      rows.push({ ...c, state: state.name, click: seen.clicks.length > 0, pdown: seen.pdowns.length > 0, pup: seen.pups.length > 0 });
    }
    await up(1);
    console.log(`  ${state.name.padEnd(32)} ${inventory.length} visible · ${fresh} new`);
  }

  console.log(`\n  ${"CONTROL".padEnd(44)} ${"pdn".padEnd(5)} ${"pup".padEnd(5)} ${"CLICK".padEnd(6)} OWNER / POINTER PATH`);
  const dead = [];
  for (const r of rows) {
    const owners = ownersOf(r.label);
    const covs = owners.map((o) => `${o} · ${coverage(o)}`);
    const anyCovered = owners.some((o) => !/^NONE/.test(coverage(o)));
    const isDead = r.click === false && owners.length > 0 && !anyCovered;
    if (isDead) dead.push({ ...r, owners, covs });
    console.log(
      `  ${String(r.label).slice(0, 43).padEnd(44)} ${String(r.pdown ?? "-").padEnd(5)} ${String(r.pup ?? "-").padEnd(5)} ${String(r.click ?? "-").padEnd(6)} ${covs.join("  |  ") || "?"}${isDead ? "   ← DEAD" : ""}`,
    );
  }
  report.push({ device: device.id, inventory: rows.length, dead });
  console.log(`\n  DEAD UNDER A SECOND FINGER: ${dead.length} of ${rows.length}`);
  writeFileSync(`${OUT}/census.json`, JSON.stringify(report, null, 1));
  await context.close();
}
await browser.close();
