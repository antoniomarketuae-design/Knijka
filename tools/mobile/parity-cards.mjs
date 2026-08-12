// =============================================================================
// parity-cards.mjs — THE ROWS THAT ONLY EXIST WHILE A CARD IS SPEAKING.
//
// §E rows 39 («РАЗБРАХ»), 40 («ЗАЩО») and 41 (dismiss ✕) are the audit's
// "session-killer" group, and none of them can be measured on a quiet screen.
// This file raises the most reproducible card the product has — drive with the
// seatbelt undone and «Движение без предпазен колан» arrives within seconds —
// and then answers it with a SECOND CDP touch point while the first is planted
// on the throttle, which is the state the founder was in when he reported it.
//
// It also drives the same sequence against the two `onClick`-only paused
// surfaces a phone can reach (the pause dialog, and the pre-drive tutorial's
// card when it is up), with a ONE-FINGER positive control on every failure —
// a control that did not fire may be dead or may have been missed, and only
// the second press tells you which.
//
//   node tools/mobile/parity-cards.mjs --base http://localhost:3481 \
//        --email <account> --password <pw> --device iphone16-portrait
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { newDeviceContext, insetBanner } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3481");
const EMAIL = arg("email", "");
const PASSWORD = arg("password", "");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/parity-e`;
mkdirSync(OUT, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? [only] : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fingerDown(cdp, pts) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 12, radiusY: 12, force: 1 })) });
}
async function fingerMove(cdp, pts) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 12, radiusY: 12, force: 1 })) });
}
async function fingerUp(cdp, pts) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id })) });
}

const browser = await chromium.launch();
// insets-exempt: sign-in only. This context reaches /login, harvests the
// session cookie and closes; the simulator is never laid out in it. The
// measuring contexts below all come from newDeviceContext with insets:"real".
const authCtx = await browser.newContext();
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();

const all = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("sim.touchHintSeen", "1");
      window.localStorage.setItem("aidrive.sim.quality.v1", JSON.stringify({ setting: "low" }));
    } catch { /* private mode */ }
  });
  const page = await context.newPage();
  const rec = { device: device.id, viewport: `${device.width}x${device.height}` };
  console.log(`\n${"=".repeat(92)}\n${device.label} — CHROMIUM · PRODUCTION · the card rows`);
  console.log(insetBanner(device, inset));
  try {
    await page.goto(`${BASE}/simulator`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    const fd = page.getByRole("button", { name: /Карай свободно/ }).first();
    await fd.waitFor({ state: "visible", timeout: 180_000 });
    await fd.click();
    await page.waitForSelector("canvas", { timeout: 180_000 });
    await page.waitForTimeout(9000);

    const cdp = await context.newCDPSession(page);
    const pad = await page.evaluate(() => {
      const el = document.querySelector('[data-hud="touch-controls"] [aria-label*="назад"], [data-hud="touch-controls"] [aria-label*="Газ"], [data-hud="touch-controls"] [aria-label*="спирачка"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), top: Math.round(r.top + r.height * 0.2) };
    });
    if (!pad) { rec.error = "no drive pad"; all.push(rec); await context.close(); continue; }

    // PLANT FINGER 1 AND KEEP IT THERE. The card will arrive on top of a thumb
    // that is accelerating, which is exactly the founder's state.
    await fingerDown(cdp, [{ x: pad.x, y: pad.y, id: 1 }]);
    await fingerMove(cdp, [{ x: pad.x, y: pad.top, id: 1 }]);

    // Wait for a compact card with chips on it — the belt fault is 2–10 s in.
    let card = null;
    for (let i = 0; i < 30 && card === null; i += 1) {
      await sleep(1000);
      card = await page.evaluate(() => {
        const chips = [];
        for (const b of document.querySelectorAll("button")) {
          const t = (b.textContent || "").replace(/\s+/g, " ").trim();
          const l = (b.getAttribute("aria-label") || "").trim();
          if (!/^(Разбрах|Защо|✕|×)$/i.test(t) && !/^Скрий известието/.test(l)) continue;
          const r = b.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
          const hit = document.elementFromPoint(cx, cy);
          chips.push({ text: t, label: l, w: Math.round(r.width), h: Math.round(r.height), cx, cy,
                       self: hit !== null && (hit === b || b.contains(hit)),
                       blocker: hit ? String(hit.getAttribute("aria-label") || hit.className || hit.tagName).slice(0, 34) : "nothing" });
        }
        const line = (document.querySelector('[data-hud="sim-overlay"], [data-sim-overlay]')?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90);
        return chips.length > 0 ? { chips, line } : null;
      });
    }
    rec.card = card;
    if (card === null) {
      console.log("  NO CARD APPEARED IN 30 s — nothing claimed for rows 39/40/41 on this profile.");
      await fingerUp(cdp, [{ x: pad.x, y: pad.top, id: 1 }]);
      all.push(rec); await context.close(); continue;
    }
    console.log(`  CARD UP: ${card.chips.map((c) => `«${c.text || c.label}» ${c.w}x${c.h}${c.self ? "" : ` BLOCKED by ${c.blocker}`}`).join(" · ")}`);

    // «ЗАЩО» first (it expands, it does not dismiss), then the acknowledgement.
    const why = card.chips.find((c) => /Защо/i.test(c.text));
    const ack = card.chips.find((c) => /Разбрах/i.test(c.text));
    const x = card.chips.find((c) => /^(✕|×)$/.test(c.text) || /Скрий известието/.test(c.label));
    const twoTap = async (t) => {
      await fingerDown(cdp, [{ x: pad.x, y: pad.top, id: 1 }, { x: t.cx, y: t.cy, id: 2 }]);
      await sleep(90);
      await fingerUp(cdp, [{ x: t.cx, y: t.cy, id: 2 }]);
      await sleep(1400);
    };
    const oneTap = async (t) => {
      await fingerUp(cdp, [{ x: pad.x, y: pad.top, id: 1 }]);
      await sleep(300);
      await fingerDown(cdp, [{ x: t.cx, y: t.cy, id: 3 }]);
      await sleep(90);
      await fingerUp(cdp, [{ x: t.cx, y: t.cy, id: 3 }]);
      await sleep(1400);
      await fingerDown(cdp, [{ x: pad.x, y: pad.top, id: 1 }]);
      await sleep(200);
    };
    const bodyLen = () => page.evaluate(() => (document.body.innerText || "").length);
    rec.results = {};
    if (why) {
      const before = await bodyLen();
      await twoTap(why);
      const after = await bodyLen();
      rec.results.why = { fired: after !== before, before, after };
      if (!rec.results.why.fired) { await oneTap(why); const a2 = await bodyLen(); rec.results.why.oneFinger = a2 !== before; }
      console.log(`    «ЗАЩО»    two fingers → ${rec.results.why.fired ? "LIVE" : "DEAD"}${rec.results.why.oneFinger === undefined ? "" : ` · one-finger control → ${rec.results.why.oneFinger ? "fires" : "also dead (tap missed, not a defect)"}`}`);
    }
    // RE-READ THE CHIP. «ЗАЩО» EXPANDS THE CARD, so the acknowledgement moves —
    // and the first run of this file tapped where it used to be and printed
    // DEAD. Only the one-finger positive control caught it. Coordinates cached
    // across a state change are not a measurement.
    const reread = async (want) => page.evaluate((w) => {
      for (const b of document.querySelectorAll("button")) {
        const t = (b.textContent || "").replace(/\s+/g, " ").trim();
        const l = (b.getAttribute("aria-label") || "").trim();
        if (t !== w && l !== w) continue;
        const r = b.getBoundingClientRect();
        if (r.width <= 0) continue;
        const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
        const hit = document.elementFromPoint(cx, cy);
        return { text: t, label: l, w: Math.round(r.width), h: Math.round(r.height), cx, cy,
                 self: hit !== null && (hit === b || b.contains(hit)),
                 blocker: hit ? String(hit.getAttribute("aria-label") || hit.className || hit.tagName).slice(0, 34) : "nothing" };
      }
      return null;
    }, want);

    let target = ack ?? x;
    if (target) {
      const fresh = await reread(target.text || target.label);
      if (fresh) { target = fresh; console.log(`    (re-read «${fresh.text || fresh.label}» at ${fresh.cx},${fresh.cy} — ${fresh.w}x${fresh.h}${fresh.self ? "" : ` BLOCKED by ${fresh.blocker}`})`); }
    }
    if (target) {
      const gone = () => page.evaluate((lbl) => {
        for (const b of document.querySelectorAll("button")) {
          const t = (b.textContent || "").replace(/\s+/g, " ").trim();
          if (t === lbl) return false;
        }
        return true;
      }, target.text || "Разбрах");
      await twoTap(target);
      let dismissed = await gone();
      rec.results.ack = { chip: target.text || target.label, fired: dismissed };
      if (!dismissed) {
        await oneTap(target);
        dismissed = await gone();
        rec.results.ack.oneFinger = dismissed;
      }
      console.log(`    «${target.text || target.label}»  two fingers → ${rec.results.ack.fired ? "LIVE" : "DEAD"}${rec.results.ack.oneFinger === undefined ? "" : ` · one-finger control → ${rec.results.ack.oneFinger ? "FIRES (so the second finger is the only variable)" : "also dead (tap missed — no claim)"}`}`);
    }
    await fingerUp(cdp, [{ x: pad.x, y: pad.top, id: 1 }]);
  } catch (e) {
    rec.error = String(e && e.message ? e.message : e);
    console.log(`  *** ${device.id} FAILED: ${rec.error}`);
  }
  all.push(rec);
  await context.close();
}
await browser.close();
writeFileSync(`${OUT}/cards.json`, JSON.stringify({ base: BASE, when: new Date().toISOString(), all }, null, 2));
console.log(`\n[parity-cards] wrote ${OUT}/cards.json`);
