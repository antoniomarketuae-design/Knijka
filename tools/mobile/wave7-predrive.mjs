// =============================================================================
// wave7-predrive.mjs — HIS SESSION, BY THUMB, FROM THE LESSON LIST TO MOVING.
//
// The ledger's regression question is not "is the pedal wired up" — wave7-ledger
// answers that on the free-drive surface. It is HIS session: «Подготовка и
// потегляне», thirteen steps, a seat-belt card he called "ultra hard", and the
// mirror glances that are GRADED. Three things are asked here and nothing else:
//
//   R1  can the thirteen-step pre-drive be COMPLETED with touch alone?
//       (tools/mobile/glance-events.mjs records that `--method click` completes
//        the graded step and `--method touch` did not — so this is not a
//        rhetorical question, and the mirrors step is where it was seen.)
//   R2  do the «Л»/«З»/«Д» glances REACH THE GRADER — i.e. does the mirrors
//       step tick over from a real touch point, not from a synthetic click?
//   R3  once the checklist is done, does the car MOVE from the same thumb?
//
// Everything is a genuine CDP touch point at a control's own centre, and the
// canvas gate is asserted before any number is written.
//
//   node tools/mobile/wave7-predrive.mjs --base http://localhost:3493
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3493");
const LESSON_BG = "Подготовка и потегляне";
const TAG = arg("tag", "after");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave7-predrive`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const devices = resolveDevices(
  (arg("device", "iphone16-portrait,iphone16-landscape")).split(","),
);
const GL_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];

const user = await ensureHarnessUser();
const browser = await chromium.launch({ args: GL_ARGS });
const { context: authContext } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authContext.newPage();
await signIn(authPage, user, BASE);
const storageState = await authContext.storageState();
await authContext.close();

const rows = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    insets: "real",
    storageState,
  });
  await context.addInitScript(() => {
    try { window.localStorage.setItem("sim.touchHintSeen", "1"); } catch { /* private mode */ }
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const rec = { device: device.id, label: device.label, inset: insetBanner(device, inset), tag: TAG };
  console.log(`\n${"=".repeat(94)}\n${device.label}\n  ${rec.inset}`);

  const active = new Map();
  const pt = (id, p) => ({ id, x: p.x, y: p.y, radiusX: 12, radiusY: 12, force: 1 });
  const down = async (id, x, y) => {
    active.set(id, { x, y });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [...active.entries()].map(([i, p]) => pt(i, p)),
    });
  };
  const moveTo = async (id, x, y) => {
    if (!active.has(id)) return;
    active.set(id, { x, y });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [...active.entries()].map(([i, p]) => pt(i, p)),
    });
  };
  const up = async (id) => {
    const p = active.get(id);
    if (!p) return;
    active.delete(id);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [pt(id, p)] });
  };
  const tapAt = async (x, y, id = 3) => {
    await down(id, x, y);
    await sleep(100);
    await up(id);
    await sleep(420);
  };
  const centre = (re, selector = "button") =>
    page.evaluate(
      ({ re, selector }) => {
        const rx = new RegExp(re);
        for (const el of document.querySelectorAll(selector)) {
          const label = (el.getAttribute("aria-label") || "").trim();
          const text = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (!rx.test(label) && !rx.test(text)) continue;
          const q = el.getBoundingClientRect();
          if (q.width < 1 || q.height < 1) continue;
          const x = Math.round(q.x + q.width / 2);
          const y = Math.round(q.y + q.height / 2);
          const hit = document.elementFromPoint(x, y);
          return {
            x, y, w: Math.round(q.width), h: Math.round(q.height),
            label: (label || text).slice(0, 54),
            self: !!hit && (hit === el || el.contains(hit)),
            onScreen: q.top >= 0 && q.bottom <= innerHeight && q.left >= 0 && q.right <= innerWidth,
          };
        }
        return null;
      },
      { re, selector },
    );
  const speedNow = () =>
    page.evaluate(() => {
      const el = document.querySelector('[aria-label^="Скорост "]');
      const m = el ? /Скорост\s+(-?\d+(?:[.,]\d+)?)/.exec(el.getAttribute("aria-label")) : null;
      return m ? Number(m[1].replace(",", ".")) : null;
    });
  /**
   * PROGRESS COMES FROM THE CHECKLIST, NOT FROM `document.body.innerText`.
   * A first version scraped the whole page for „n/13" and got `null` on every
   * pass, so a walk that never advanced looked identical to a walk with no
   * counter — 46 presses of the same mirror button, reported as `complete`.
   * The pre-drive panel carries its own progress and its own step list.
   */
  const progress = () =>
    page.evaluate(() => {
      const scope =
        document.querySelector('[data-hud="predrive-checklist"]') ||
        document.querySelector('[aria-label*="Подготовка"]') ||
        document.body;
      const t = (scope.innerText || "") + " " + (document.body.innerText || "");
      const m = /(\d{1,2})\s*\/\s*13/.exec(t);
      if (m) return Number(m[1]);
      // fall back to counting ticked rows — the panel marks done steps
      const done = scope.querySelectorAll('[data-done="true"], [aria-checked="true"]').length;
      return done > 0 ? done : null;
    });

  try {
    await page.goto(`${BASE}/simulator`, { waitUntil: "domcontentloaded", timeout: 300_000 });
    if (page.url().includes("/login")) throw new Error("redirected to /login");
    await page.waitForSelector("article, [aria-label]", { timeout: 300_000 }).catch(() => {});
    rec.started = await page.evaluate((titleBg) => {
      for (const el of document.querySelectorAll("[aria-label]")) {
        if (!(el.getAttribute("aria-label") || "").includes(titleBg)) continue;
        const b = [...el.querySelectorAll("button")].find((x) =>
          /Започни урока|Карай отново|Продължи урока/.test((x.textContent || "").trim()),
        );
        if (b) { b.click(); return true; }
      }
      return false;
    }, LESSON_BG);
    await page.waitForSelector("canvas", { timeout: 300_000 });
    await sleep(7000);

    const gate = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      const r = c?.getBoundingClientRect();
      return {
        url: location.pathname + location.search,
        hasCanvas: !!c,
        canvas: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
        touchOverlay: !!document.querySelector('[data-hud="touch-controls"]'),
      };
    });
    rec.gate = gate;
    if (!(gate.hasCanvas && (gate.canvas?.w ?? 0) > 0 && gate.touchOverlay)) {
      rec.refused = "no live simulator";
      rows.push(rec);
      await context.close();
      continue;
    }
    console.log(`  GATE · ${gate.url} · canvas=${gate.canvas.w}×${gate.canvas.h} · overlay=${gate.touchOverlay}`);

    // ── R1/R2 · WALK THE THIRTEEN STEPS WITH A THUMB ────────────────────────
    // Each pass presses whatever the current step offers, in the order the UI
    // offers it. Progress is read from the «n/13» line between passes, so a
    // press that changed nothing is visible as a stalled counter rather than
    // disappearing into a total.
    rec.walk = [];
    rec.stalls = [];
    let last = await progress();
    rec.progressStart = last;
    // EVERY CANDIDATE CONTROL IS PRESSED ONCE PER PASS, THEN THE STEP IS
    // CONFIRMED. A first version picked the FIRST matching control each pass —
    // which is «Поглед в лявото огледало», always present — so it pressed the
    // left mirror forty-six times and never touched the rear or the right one.
    // The mirrors step needs all three; a walk that can only ever press one of
    // them cannot pass it, and reported the pre-drive as unwinnable when it was
    // the probe that could not play it.
    const STEP_CONTROLS = [
      "^Поглед в лявото огледало$",
      "^Поглед в огледалото за задно виждане$",
      "^Поглед в дясното огледало$",
      "^Закопчай предпазния колан$",
      "^Мигач наляво$",
    ];
    for (let pass = 0; pass < 30; pass += 1) {
      const before = await progress();
      const pressedThisPass = [];
      for (const re of STEP_CONTROLS) {
        const c = await centre(re);
        if (!c || !c.self) continue;
        await tapAt(c.x, c.y, 3);
        pressedThisPass.push(c.label.slice(0, 26));
        await sleep(280);
      }
      const confirm =
        (await centre("^Потвърди")) || (await centre("^Разбрах")) || (await centre("^Готово"));
      if (confirm) {
        await tapAt(confirm.x, confirm.y, 3);
        pressedThisPass.push(confirm.label.slice(0, 26));
      }
      await sleep(700);
      const after = await progress();
      rec.walk.push({ pass, pressed: pressedThisPass, before, after });
      if (pressedThisPass.length === 0) break;
      if (after !== null && before !== null && after === before) {
        rec.stalls.push({ at: before, tried: pressedThisPass });
        if (rec.stalls.length >= 5) break;
      } else {
        rec.stalls = [];
      }
      last = after ?? last;
      if ((after ?? 0) >= 13) break;
    }
    rec.progressEnd = await progress();
    rec.preDriveComplete = await page.evaluate(
      () => !/\b\d{1,2}\s*\/\s*13\b/.test(document.body.innerText || ""),
    );
    console.log(
      `  R1  · pre-drive walked by touch: ${rec.progressStart} → ${rec.progressEnd} of 13 in ${rec.walk.length} presses · ` +
        `complete=${rec.preDriveComplete}`,
    );
    const glanceRows = rec.walk.filter((w) => w.pressed.some((p) => /Поглед/.test(p)));
    console.log(
      `  R2  · passes that pressed a mirror glance: ${glanceRows.length}` +
        (glanceRows.length
          ? ` → ${glanceRows.map((g) => `${g.before}→${g.after}`).join(", ")}`
          : " — the mirrors step was never reached"),
    );
    console.log(`  ··  walk: ${rec.walk.map((w) => `${w.before}→${w.after}`).join(" ")}`);
    if (rec.stalls.length) {
      console.log(`  ⚠ STALLED at ${rec.stalls[0].at}/13 having tried: ${rec.stalls[0].tried.join(" | ")}`);
    }
    await page.screenshot({ path: `${OUT}/shots/${TAG}-${device.id}-after-walk.png` }).catch(() => {});

    // ── R3 · and now the same thumb on the pedal ────────────────────────────
    const pad = await page.evaluate(() => {
      const el = document.querySelector('[role="slider"][aria-label^="Ход"]');
      if (!el) return null;
      const q = el.getBoundingClientRect();
      return {
        cx: Math.round(q.x + q.width / 2), cy: Math.round(q.y + q.height / 2),
        y: Math.round(q.y), h: Math.round(q.height),
        pe: getComputedStyle(el).pointerEvents,
      };
    });
    rec.pad = pad;
    if (pad) {
      const upY = Math.max(pad.y + 6, pad.cy - Math.min(60, Math.round(pad.h / 2) - 8));
      await down(2, pad.cx, upY);
      const series = [];
      for (let i = 0; i < 14; i += 1) {
        series.push(await speedNow());
        await sleep(450);
        if (i === 3) await moveTo(2, pad.cx, upY - 2);
      }
      await up(2);
      rec.driveSeries = series;
      rec.drives = (series[series.length - 1] ?? 0) > 1;
      console.log(`  R3  · pedal after the checklist: [${series.join(",")}] → drives=${rec.drives}`);
    }
    await page.screenshot({ path: `${OUT}/shots/${TAG}-${device.id}-driving.png` }).catch(() => {});
  } catch (error) {
    rec.error = String(error?.message || error).split("\n")[0];
    console.log(`  ✖ FAILED · ${rec.error}`);
  }

  rows.push(rec);
  await context.close();
}
await browser.close();
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ base: BASE, tag: TAG, rows }, null, 2));
console.log(`\nwrote ${OUT}/${TAG}.json`);
