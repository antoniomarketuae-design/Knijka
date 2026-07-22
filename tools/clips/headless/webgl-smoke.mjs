// WebGL feasibility smoke test for the headless clip renderer.
//
// The one real risk in the "Claude records the clips himself" plan is whether
// headless Chromium can produce a real WebGL frame on this box. This proves it
// two ways: (1) a WebGL context exists and readPixels returns the cleared
// color, (2) the frame lands in a screenshot saved to smoke.png (I inspect it
// with vision). No extra deps beyond playwright.
//
// Run: node webgl-smoke.mjs   (from tools/clips/headless, after playwright install)

import { chromium } from "./pw.mjs";
import { writeFileSync } from "node:fs";

// Force a working software-GL (SwiftShader via ANGLE) so WebGL renders even
// with no usable GPU in a headless session — the reliable, machine-independent
// path for an offline render farm.
const GL_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

const HTML = `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="c" width="320" height="240"></canvas>
<script>
  const c = document.getElementById("c");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  window.__glOk = !!gl;
  if (gl) {
    gl.clearColor(0.13, 0.62, 0.49, 1.0); // distinctive teal
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.finish();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    window.__renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : String(gl.getParameter(gl.RENDERER));
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    window.__pixel = Array.from(px);
  }
</script>
</body></html>`;

const browser = await chromium.launch({ headless: true, args: GL_ARGS });
const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
await page.setContent(HTML, { waitUntil: "load" });
await page.waitForTimeout(300);

const glOk = await page.evaluate(() => window.__glOk);
const renderer = await page.evaluate(() => window.__renderer ?? "(none)");
const pixel = await page.evaluate(() => window.__pixel ?? null);

const buf = await page.locator("#c").screenshot();
writeFileSync("smoke.png", buf);
await browser.close();

console.log(JSON.stringify({ glOk, renderer, glReadPixel: pixel }, null, 2));

// Pass when the GL readback shows the teal we cleared to (g high, r/b lower).
const [r, g, b] = pixel ?? [0, 0, 0];
if (!glOk) { console.error("FAIL: no WebGL context in headless Chromium"); process.exit(2); }
const isTeal = g > 120 && g > r && b > 90 && b < g;
if (!isTeal) { console.error(`FAIL: WebGL context exists but readback is ${JSON.stringify(pixel)}, not teal`); process.exit(3); }
console.log("PASS: headless Chromium has WebGL and renders the cleared color. See smoke.png.");
