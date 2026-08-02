// srt-pair.mjs — two frames side by side under captions, so „is lesson 33 the
// same map as lesson 36" is one image instead of two paragraphs.
//
//   node srt-pair.mjs <out.png> <a.png> "<caption A>" <b.png> "<caption B>"

import { chromium } from "./pw.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [outPath, aPath, aCap, bPath, bCap] = process.argv.slice(2);
if (!outPath || !aPath || !bPath) {
  console.error('usage: node srt-pair.mjs <out.png> <a.png> "capA" <b.png> "capB"');
  process.exit(64);
}
const enc = (p) => "data:image/png;base64," + readFileSync(resolve(p)).toString("base64");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1300, height: 420 } });
await page.setContent(`
<body style="margin:0;background:#111;font:13px/1.4 system-ui,sans-serif;color:#eee">
 <div id="w" style="display:flex;gap:8px;padding:8px">
  <figure style="margin:0;flex:1">
    <img src="${enc(aPath)}" style="width:100%;display:block;border:1px solid #444">
    <figcaption style="padding:6px 2px">${aCap ?? aPath}</figcaption>
  </figure>
  <figure style="margin:0;flex:1">
    <img src="${enc(bPath)}" style="width:100%;display:block;border:1px solid #444">
    <figcaption style="padding:6px 2px">${bCap ?? bPath}</figcaption>
  </figure>
 </div>
</body>`);
await page.waitForTimeout(300);
writeFileSync(resolve(outPath), await page.locator("#w").screenshot());
await browser.close();
console.error(`[pair] ${outPath}`);
