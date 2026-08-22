import { chromium } from "./pw.mjs";
// KNIJKA_SHOT_OUT, else the OS temp dir. This was an absolute path into one
// agent session's scratchpad, which stopped existing when that session's temp
// directory was cleaned up — a committed script cannot depend on a dead
// session's working directory. Its sibling b15-roundabout-wait.probe.test.ts
// had the same path and failed at import for the same reason.
import os from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";
const OUT = process.env.KNIJKA_SHOT_OUT || path.join(os.tmpdir(), "knijka-shots");
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
// walk down slowly so every reveal fires, then come back to the reel section
for (let y = 0; y <= 4500; y += 450) { await p.evaluate((v)=>window.scrollTo(0,v), y); await p.waitForTimeout(500); }
await p.evaluate(()=>window.scrollTo(0,1250)); await p.waitForTimeout(3500);
await p.screenshot({ path: OUT + "/reel_section.png" });
await p.evaluate(()=>window.scrollTo(0,3300)); await p.waitForTimeout(3000);
await p.screenshot({ path: OUT + "/schools_section.png" });
console.log("captured");
await b.close();
