// wave6-ta-diag.mjs — WHERE DID `touch-action: none` GO ON THE IMMERSIVE ARM?
// One question, one page, printed as a DOM chain so it cannot be argued with.
import { engineByName } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://localhost:3491");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const ENGINE = engineByName(arg("engine", "chromium"));
const device = resolveDevices([arg("device", "iphone16-landscape")])[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await ENGINE.launcher.launch(ENGINE.name === "chromium" ? { args: ["--use-angle=d3d11", "--enable-unsafe-swiftshader"] } : {});
const { context } = await newDeviceContext(browser, device, { motion: "allow", insets: "real" });
if (process.argv.includes("--block-fullscreen")) {
  await context.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new TypeError("blocked"));
    try { Object.defineProperty(document, "fullscreenEnabled", { get: () => false }); } catch { /* frozen */ }
  });
}
const page = await context.newPage();
await signIn(page, { email: arg("email", ""), password: arg("password", "") }, BASE);
await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
await sleep(4000);

const out = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const chain = [];
  for (let el = c; el && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el);
    chain.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute("class") || "").slice(0, 70),
      hud: el.getAttribute("data-hud") || el.getAttribute("data-sim-stage") !== null ? "stage" : undefined,
      shell: el.hasAttribute("data-sim-shell") || undefined,
      inlineTA: el.style?.touchAction || "",
      computedTA: cs.touchAction,
      pos: cs.position,
    });
  }
  return {
    fullscreen: document.fullscreenElement != null,
    fullscreenEnabled: document.fullscreenEnabled,
    compact: document.querySelector("[data-sim-shell]")?.getAttribute("data-sim-compact"),
    canvasChain: chain,
    anyTouchActionNoneInDoc: [...document.querySelectorAll("*")].filter((e) => getComputedStyle(e).touchAction === "none").length,
    nodesWithInlineTouchAction: [...document.querySelectorAll('[style*="touch-action"]')].map((e) => ({
      tag: e.tagName.toLowerCase(), cls: (e.getAttribute("class") || "").slice(0, 50), ta: e.style.touchAction, kids: e.childElementCount,
      containsCanvas: e.contains(document.querySelector("canvas")),
    })),
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
