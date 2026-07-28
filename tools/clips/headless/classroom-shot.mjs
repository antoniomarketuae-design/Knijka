/**
 * Photograph /classroom on a phone, in both orientations, with the board
 * actually playing a real recorded trace pair.
 *
 *   node tools/clips/headless/classroom-shot.mjs [outDir] [port]
 *
 * The point of the run is NOT "does it render" — it is "does the pair read".
 * So the script waits for the board canvas to have painted (the trace + the
 * district JSON are two real fetches) before every frame, and it takes the
 * mistake side as well as the correct one.
 *
 * Notes that are load-bearing here as elsewhere in this folder:
 *   - Playwright + browsers live on E:; import chromium from ./pw.mjs.
 *   - page.screenshot() can hang on "waiting for fonts to load…", so frames
 *     are grabbed over CDP Page.captureScreenshot.
 */

import { chromium } from "file:///E:/AI%20driver/tools/clips/headless/pw.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const OUTDIR = process.argv[2] ?? "E:/AI driver/.classroom-shots";
const PORT = process.argv[3] ?? "3370";
mkdirSync(OUTDIR, { recursive: true });

/** iPhone-class phone, both ways up, plus a tablet-ish width for the pair. */
const VIEWS = [
  ["portrait", 390, 844, 3],
  ["landscape", 844, 390, 3],
  ["desktop", 1280, 800, 1],
];

const browser = await chromium.launch({ headless: true });

async function shoot(page, out) {
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(data, "base64"));
  console.log("  wrote", out);
}

for (const [name, W, H, dsf] of VIEWS) {
  console.log(`\n=== ${name} ${W}×${H} @${dsf}x`);
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: dsf,
    isMobile: dsf > 1,
    hasTouch: dsf > 1,
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("  [console.error]", m.text().slice(0, 300));
  });

  await page.goto(`http://localhost:${PORT}/classroom`, {
    waitUntil: "domcontentloaded",
    timeout: 300_000,
  });

  // 1. The room before the lesson starts.
  await page.waitForSelector(".cl-room", { timeout: 300_000 });
  await page.waitForTimeout(1200);
  await shoot(page, `${OUTDIR}/classroom_${name}_0_intro.png`);

  // 2. Start, then walk to the first board beat.
  await page.getByRole("button", { name: /Започни урока/ }).click();
  await page.waitForTimeout(400);

  // The first two beats are talk; the board beat is the third. Rather than
  // waiting out the clock, press the pips' own progression by raising a hand
  // is not possible — so wait for the canvas to appear on its own.
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 300_000 });
  // Let the trace + district land and a few frames of the replay run.
  await page.waitForTimeout(4500);
  await shoot(page, `${OUTDIR}/classroom_${name}_1_board_correct.png`);

  // 3. The other half of the pair.
  try {
    // Narrow layouts render the pair as ARIA tabs, wide ones as plain buttons —
    // match on the text so the same step works in both.
    await page.getByText(/Ето какво се обърка/).first().click({ timeout: 5000 });
    await page.waitForTimeout(4000);
    await shoot(page, `${OUTDIR}/classroom_${name}_2_board_mistake.png`);
  } catch {
    console.log("  (no mistake tab — wide layout shows both)");
  }

  // 4. The interruption: hand raised, board dimmed, chips out.
  try {
    await page.getByRole("button", { name: /Вдигни ръка/ }).click({ timeout: 5000 });
    await page.waitForTimeout(900);
    await shoot(page, `${OUTDIR}/classroom_${name}_3_listening.png`);

    await page.getByRole("button", { name: /Защо е грешка/ }).click({ timeout: 5000 });
    await page.waitForTimeout(1200);
    await shoot(page, `${OUTDIR}/classroom_${name}_4_answering.png`);
  } catch (e) {
    console.log("  (interruption step skipped)", String(e).slice(0, 160));
  }

  await ctx.close();
}

await browser.close();
console.log("\ndone →", OUTDIR);
