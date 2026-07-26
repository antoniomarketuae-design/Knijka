import { chromium } from "./pw.mjs";
const OUT = "C:/Users/Ljh/AppData/Local/Temp/claude/E--AI-driver/8942546c-780e-450f-ae95-3aa94e28222a/scratchpad";
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
