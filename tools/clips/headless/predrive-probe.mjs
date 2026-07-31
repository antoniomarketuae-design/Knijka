// Quick diagnostic: open the pre-drive lesson and dump console + page errors.
import { chromium } from "./pw.mjs";
const BASE = process.argv[2] ?? "http://localhost:3742";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => console.log(`[console.${m.type()}] ${m.text().slice(0, 500)}`));
page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}\n${(e.stack ?? "").slice(0, 900)}`));
page.on("requestfailed", (r) => console.log(`[reqfail] ${r.url().slice(0, 160)} ${r.failure()?.errorText}`));
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) console.log(`[nav] ${f.url()}`);
});
await page.goto(`${BASE}/dev/hud-ux?lesson=l1-preparation`, { waitUntil: "domcontentloaded", timeout: 180_000 });
console.log(`[after goto] ${page.url()}`);
await page.waitForTimeout(25_000);
console.log(`[after wait] ${page.url()}`);
const state = await page.evaluate(() => ({
  canvases: document.querySelectorAll("canvas").length,
  checklist: document.querySelectorAll('[data-hud="predrive-checklist"]').length,
  pedals: document.querySelectorAll("[data-pedal]").length,
  bodyText: document.body.innerText.slice(0, 600),
}));
console.log(JSON.stringify(state, null, 2));
await browser.close();
