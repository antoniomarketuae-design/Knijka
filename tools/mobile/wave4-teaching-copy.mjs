// =============================================================================
// wave4-teaching-copy.mjs — §J-WAVE-4 item 2, LOOKED AT RATHER THAN ASSERTED.
//
// `controlPhrases.test.ts` proves the mapping is total and that the two
// readers are taught the same decision. It CANNOT prove the thing that decides
// which of the two a phone actually gets: `hasTouchScreen()` runs in a browser,
// against `(any-pointer: coarse)` — and the house rule for this harness exists
// because WebKit reports `maxTouchPoints === 0`. A vocabulary that is perfect
// and never selected is the defect with extra steps.
//
// So this reads, on a PRODUCTION build, on all six profiles:
//   · the four media queries `hasTouchScreen()` and its neighbours consult;
//   · the harness's own frame rate beside every reading (house rule: a false
//     defect was once published from a 0.4 fps rig);
//   · the ACTUAL text of the card that opens „Напреднал" — the worst string in
//     the audit — captured off the glass after switching the tier by thumb;
//   · the instrument cluster's engine cell, whose accessible name used to say
//     „рестартирай (Z + I)" to a screen reader on a phone.
//
//   node wave4-teaching-copy.mjs --base http://localhost:3244
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
// CHROMIUM, AND THE HOUSE RULE IS NOT BEING BENT — the same second opinion
// `wave4-upshift.mjs` takes, for a narrower reason. WebKit here never receives
// a session cookie from this login form (curl and Chromium both do, against
// this very server, with the same credentials — checked 2026-08-12), so the
// question cannot be put to it at all. And the question is about TEXT: which of
// two authored sentences the shell selected. The one thing that genuinely
// depends on the engine — whether `hasTouchScreen()` answers true on a phone —
// is measured on WEBKIT separately, and it is the stricter reading there
// (maxTouchPoints is 0 in WebKit; only `(any-pointer: coarse)` carries it).
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3244");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave4-teaching-copy`;
mkdirSync(OUT, { recursive: true });
mkdirSync(`${OUT}/shots`, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? [only] : undefined);

// RESET THE PASSWORD PER PROFILE, not once for the run. Several lanes share
// one dev database and each of their probes calls `ensureHarnessUser()` too —
// with no `KNIJKA_MOBILE_PASSWORD` that generates a RANDOM secret and rewrites
// this account's hash. Measured 2026-08-12: profile 1 signed in, profile 2 was
// told „Грешен имейл или парола" mid-run. It is a shared-fixture race, not a
// product defect, and re-asserting the credential per device closes it.
const browser = await chromium.launch();
const rows = [];

for (const device of devices) {
  const user = await ensureHarnessUser({ password: process.env.KNIJKA_MOBILE_PASSWORD });
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    insets: "real",
  });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("sim.touchHintSeen", "1");
    } catch {
      /* private mode */
    }
  });
  const page = await context.newPage();
  const rec = { device: device.id, label: device.label, inset: insetBanner(device, inset) };
  console.log(`\n${"=".repeat(90)}\n${device.label}\n  ${rec.inset}`);

  await signIn(page, { email: user.email, password: user.password }, BASE);
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
  await page.waitForTimeout(3500);

  // ── THE PREDICATE, READ IN THE ENGINE THAT DECIDES IT ─────────────────────
  rec.signals = await page.evaluate(() => ({
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    anyPointerCoarse: matchMedia("(any-pointer: coarse)").matches,
    pointerCoarse: matchMedia("(pointer: coarse)").matches,
    hoverNone: matchMedia("(hover: none)").matches,
    // …and the answer `hasTouchScreen()` itself computes, same expression.
    hasTouchScreen:
      (navigator.maxTouchPoints ?? 0) > 0 || matchMedia("(any-pointer: coarse)").matches,
  }));
  console.log(
    `  maxTouchPoints ${rec.signals.maxTouchPoints} · any-pointer:coarse ${rec.signals.anyPointerCoarse} · ` +
      `hasTouchScreen ${rec.signals.hasTouchScreen}`,
  );

  // ── THE HARNESS'S OWN FRAME RATE, printed beside every reading ────────────
  rec.fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          n += 1;
          if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
          else resolve(Math.round((n * 1000) / (performance.now() - t0)));
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(`  harness fps ${rec.fps} (valid for TEXT and geometry, never for timing)`);

  const clearCards = async () => {
    for (let i = 0; i < 8; i += 1) {
      const hit = await page.evaluate(() => {
        for (const b of document.querySelectorAll("button")) {
          const t = (b.textContent || "").trim();
          if (/^(Разбрах|Продължи|Започни)$/.test(t)) {
            b.click();
            return t;
          }
        }
        return null;
      });
      if (!hit) return;
      await page.waitForTimeout(450);
    }
  };
  const tap = async (labelRe) => {
    const box = await page.evaluate((re) => {
      const rx = new RegExp(re);
      for (const el of document.querySelectorAll("button,[aria-label]")) {
        if (!rx.test(el.getAttribute("aria-label") || "")) continue;
        const q = el.getBoundingClientRect();
        if (q.width < 1) continue;
        return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
      }
      return null;
    }, labelRe);
    if (!box) return false;
    await page.touchscreen.tap(box.x, box.y);
    await page.waitForTimeout(450);
    return true;
  };

  await clearCards();

  // ── THE ENGINE CELL, before anything is touched ───────────────────────────
  rec.engineCell = await page.evaluate(() => {
    for (const el of document.querySelectorAll("[aria-label]")) {
      const l = el.getAttribute("aria-label") || "";
      if (/^Двигателят/.test(l)) return { label: l, text: (el.textContent || "").trim() };
    }
    return null;
  });
  console.log(`  engine cell: ${JSON.stringify(rec.engineCell)}`);

  // ── THE TIER SWITCH, BY THUMB — and the card it raises ────────────────────
  rec.sheetOpened = await tap(/^Контроли на автомобила$/);
  let tierOk = false;
  for (let i = 0; i < 4 && !tierOk; i += 1) {
    const on = await page.evaluate(() => {
      const el = [...document.querySelectorAll("[aria-label]")].find((e) =>
        (e.getAttribute("aria-label") || "").startsWith("Ниво на помощта"),
      );
      return el ? el.getAttribute("aria-label") : null;
    });
    if (on === null) break;
    if (/^Ниво на помощта: Напреднал/.test(on)) {
      tierOk = true;
      break;
    }
    await tap(/^Ниво на помощта/);
  }
  rec.tierOk = tierOk;
  await page.waitForTimeout(900);

  // The card is a HUD toast; read the whole notification column's text.
  rec.card = await page.evaluate(() => {
    const t = document.body.innerText || "";
    const i = t.indexOf("Скоростният лост е на");
    return i >= 0 ? t.slice(i, i + 520).replace(/\s+/g, " ").trim() : null;
  });
  // …and expand the WHY if the compact card folded it behind «ЗАЩО».
  if (rec.card && !/СЪЕД/.test(rec.card)) {
    await page.evaluate(() => {
      // SimOverlay's compact card folds the WHY behind a control whose label
      // is „Защо" (upper-cased by CSS, so match case-insensitively).
      for (const b of document.querySelectorAll("button,[role='button']")) {
        if (/^(защо|повече)$/i.test((b.textContent || "").trim())) {
          b.click();
          return;
        }
      }
    });
    await page.waitForTimeout(400);
    rec.card = await page.evaluate(() => {
      const t = document.body.innerText || "";
      const i = t.indexOf("Скоростният лост е на");
      return i >= 0 ? t.slice(i, i + 520).replace(/\s+/g, " ").trim() : null;
    });
  }
  console.log(`  tier=Напреднал ${tierOk} · card: ${rec.card ?? "(none)"}`);

  rec.verdict = {
    touchSelected: rec.signals.hasTouchScreen === true,
    cardNamesTouchCells: rec.card !== null && /СЪЕД/.test(rec.card) && /M►/.test(rec.card),
    cardNamesNoKeys: rec.card !== null && !/Z \+ \]|клавиш|\(Z\)/.test(rec.card),
    engineCellHasNoKeyCap:
      rec.engineCell !== null && !/\bИзкл\. I\b/.test(rec.engineCell.text),
  };
  console.log(`  VERDICT ${JSON.stringify(rec.verdict)}`);

  await page.screenshot({ path: `${OUT}/shots/${device.id}.png` });
  rows.push(rec);
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(rows, null, 2));
console.log(`\n${"=".repeat(90)}\nSUMMARY`);
for (const r of rows) {
  console.log(
    `  ${r.device.padEnd(30)} fps ${String(r.fps).padStart(3)} · ` +
      `touch ${r.verdict.touchSelected ? "Y" : "N"} · cells ${r.verdict.cardNamesTouchCells ? "Y" : "N"} · ` +
      `no-keys ${r.verdict.cardNamesNoKeys ? "Y" : "N"} · cluster ${r.verdict.engineCellHasNoKeyCap ? "Y" : "N"}`,
  );
}
