// Why does the canvas paint over the portalled tutorial dialog? Report the
// stacking facts instead of guessing.
import { chromium } from "./pw.mjs";
import { signIn } from "../../mobile/lib/auth.mjs";
import { ensureHarnessUser } from "../../mobile/lib/user.mjs";

const BASE = process.argv[2] ?? "http://localhost:3742";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const creds = await ensureHarnessUser();
await signIn(page, creds, BASE);
await page.goto(`${BASE}/dev/hud-ux?lesson=l1-preparation`, { waitUntil: "domcontentloaded", timeout: 240_000 });
await page.waitForSelector('div[role="dialog"]', { timeout: 240_000 });
await page.waitForTimeout(4000);

const facts = await page.evaluate(() => {
  const chain = (el) => {
    const out = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      out.push(
        `${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}.${(n.className || "").toString().split(" ").slice(0, 3).join(".")} ` +
          `pos=${cs.position} z=${cs.zIndex} iso=${cs.isolation} tr=${cs.transform === "none" ? "-" : "T"} ` +
          `bf=${cs.backdropFilter === "none" ? "-" : "B"} filt=${cs.filter === "none" ? "-" : "F"} ` +
          `pe=${cs.pointerEvents} vis=${cs.visibility} op=${cs.opacity} disp=${cs.display}`,
      );
    }
    return out;
  };
  const dialog = document.querySelector('div[role="dialog"]');
  const btn = dialog?.querySelector("button.btn-accent");
  const r = btn?.getBoundingClientRect();
  const hit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
  const canvas = document.querySelector("canvas");
  return {
    dialogParent: dialog?.parentElement?.tagName ?? null,
    dialogIndexInBody: dialog ? [...document.body.children].indexOf(dialog) : -1,
    bodyChildren: [...document.body.children].map((c) => `${c.tagName.toLowerCase()}.${(c.className||"").toString().split(" ")[0]}`),
    buttonRect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    hitTagAtButtonCentre: hit ? `${hit.tagName.toLowerCase()}.${(hit.className||"").toString().split(" ")[0]}` : null,
    dialogChain: dialog ? chain(dialog) : null,
    canvasChain: canvas ? chain(canvas) : null,
  };
});
console.log(JSON.stringify(facts, null, 2));
const { writeFileSync } = await import("node:fs");
writeFileSync("./.predrive/zprobe.png", await page.screenshot());
console.log("wrote .predrive/zprobe.png");
await browser.close();
