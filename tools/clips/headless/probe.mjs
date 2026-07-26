import { chromium } from "./pw.mjs";
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const p = await ctx.newPage();
const failed = [];
p.on("requestfailed", (r) => failed.push(r.url().slice(-70)));
p.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(-70)}`); });
await p.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await p.evaluate(() => window.scrollTo(0, 1400));
await p.waitForTimeout(3000);
const media = await p.evaluate(() => {
  const out = [];
  for (const v of document.querySelectorAll("video")) out.push({ tag: "video", src: (v.currentSrc||v.src||"").slice(-45), w: v.videoWidth, ready: v.readyState });
  for (const i of document.querySelectorAll("img")) out.push({ tag: "img", src: (i.currentSrc||i.src||"").slice(-45), w: i.naturalWidth });
  return out;
});
console.log("MEDIA:", JSON.stringify(media, null, 1));
console.log("FAILED/4xx:", failed.length ? failed.slice(0, 8) : "none");
await b.close();
