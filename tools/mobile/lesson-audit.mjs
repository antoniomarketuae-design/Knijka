/**
 * THE ONE DRIVE HARNESS THE WHOLE AUDIT ARMY USES.
 *
 * 153 scenarios x 2 platforms x 2 directions = ~612 drives. If 26 chunk agents
 * each invent their own way to enter a lesson, read a briefing and decide what
 * "credited" means, the ledger is 26 incompatible opinions. So there is one
 * script and they all call it.
 *
 * EVERY LESSON THIS FILE ENCODES WAS PAID FOR TODAY:
 *
 *  · CREDIT IS READ OFF THE DEBRIEF, NEVER THE TASK CHIP. The chip goes
 *    "2/2 -> null" when the session ends whether or not anything was ticked, so
 *    a run that credited nothing looks identical to a perfect one.
 *  · SPEED COMES FROM [aria-label^="Скорост "] AND NOTHING ELSE. Matching
 *    /км\/ч/ reads the speed-LIMIT sign and prints a plausible constant — it
 *    reported 50 км/ч for a stationary car for half a session.
 *  · THE PROBE ASSERTS 0 AT REST BEFORE IT IS BELIEVED. A speed probe that
 *    cannot read zero is not measuring the car.
 *  · NEVER LEAVE THE «ПРОЧЕТИ» SHEET OPEN. The read sheet pauses the sim by
 *    design; a driver that opens it and fails to close it photographs a frozen
 *    world and reports 0 км/ч for ninety seconds.
 *  · NEVER /dev/drive-rig, NEVER localhost. Both 404 in production and three
 *    earlier sweeps "verified" a page no student can open.
 *  · THE BUILD IS RECORDED WITH THE RUN. A proof phase once graded a build whose
 *    fixes had never been deployed.
 *
 * Usage:
 *   node tools/mobile/lesson-audit.mjs <outDir> <scenarioId> <mobile|pc> <right|wrong>
 */
import { webkit, chromium } from "./lib/pw.mjs";
import { newDeviceContext } from "./lib/insets.mjs";
import { DEVICES } from "./lib/devices.mjs";
import { signIn } from "./lib/auth.mjs";

const [OUT, SCENARIO, PLATFORM = "mobile", MODE = "right"] = process.argv.slice(2);
export const BASE =
  process.env.KNIJKA_BASE ?? "https://icon-undertaken-earliest-zope.trycloudflare.com";

const log = [];
const note = (s) => { log.push(s); console.log(s); };

async function open() {
  if (PLATFORM === "pc") {
    const b = await chromium.launch({ headless: true });
    const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    return { browser: b, context: c };
  }
  const b = await webkit.launch({ headless: true });
  const { context } = await newDeviceContext(b, DEVICES["iphone16-landscape"], { motion: "allow" });
  return { browser: b, context };
}

const { browser, context } = await open();
const page = await context.newPage();
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {}); };

// ── the reading surface ────────────────────────────────────────────────────
const read = () =>
  page.evaluate(() => {
    const txt = (el) => (el?.innerText || "").trim().replace(/\s+/g, " ");
    const sp = document.querySelector('[aria-label^="Скорост "]');
    const card = document.querySelector("[data-sim-overlay]");
    // Everything visible, deduped, in DOM order — the judge reads this beside
    // the frame rather than trusting any single selector.
    const seen = new Set(), strings = [];
    for (const el of document.querySelectorAll(
      "[data-hud],[role=alertdialog],[role=dialog],[role=status],h1,h2,h3,li,button,p",
    )) {
      const t = txt(el);
      const r = el.getBoundingClientRect();
      if (!t || t.length < 2 || r.width < 4 || r.height < 4 || seen.has(t)) continue;
      seen.add(t);
      strings.push(t.slice(0, 200));
    }
    return {
      kmh: sp ? Number((sp.getAttribute("aria-label").match(/Скорост (\d+)/) || [0, -1])[1]) : -1,
      overlay: card?.getAttribute("data-sim-overlay") ?? "-",
      state: card?.getAttribute("data-sim-overlay-state") ?? "-",
      strings: strings.slice(0, 26),
      body: document.body.innerText.replace(/\s+/g, " ").slice(0, 3000),
    };
  }).catch(() => ({ kmh: -1, overlay: "?", state: "?", strings: [], body: "" }));

const beat = async (label) => {
  const s = await read();
  note(`  [${label}] ${s.kmh} км/ч  card=${s.overlay}/${s.state}`);
  s.strings.forEach((t) => note(`      · ${t}`));
  await shot(label);
  return s;
};

// ── go ─────────────────────────────────────────────────────────────────────
await signIn(page, { email: "founder@knijka.ai", password: "Knijka2026!" }, BASE);
await page.goto(`${BASE}/simulator?scenario=${SCENARIO}&level=1`, {
  waitUntil: "domcontentloaded",
  timeout: 300_000,
});
await page.waitForTimeout(25_000);

note(`=== ${SCENARIO} · ${PLATFORM} · ${MODE} ===`);
await beat("01-arrival");

// THE FULL BRIEFING — open the sheet, read it, and CLOSE IT AGAIN. The close is
// asserted, not hoped for: an open sheet pauses the sim.
const readMore = page.locator('button:has-text("ПРОЧЕТИ"), button:has-text("Прочети"), button:has-text("СПИСЪК")').first();
let briefing = "";
if (await readMore.count().catch(() => 0)) {
  await readMore.click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(2500);
  briefing = (await read()).body;
  await beat("02-briefing");
  for (let i = 0; i < 4; i++) {
    const stillOpen = await page.evaluate(
      () => document.querySelector('[data-sim-overlay-state="open"]') !== null,
    ).catch(() => false);
    if (!stillOpen) break;
    const x = page.locator("[data-hud-close]").first();
    if (await x.count().catch(() => 0)) await x.click({ timeout: 4000 }).catch(() => {});
    else await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1200);
  }
}
for (const l of ["РАЗБРАХ", "Разбрах"]) {
  const b = page.locator(`button:has-text("${l}")`).first();
  if (await b.count().catch(() => 0)) { await b.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1200); }
}
await beat("03-ready");

// POSITIVE CONTROL — the car must leave zero, or nothing after this is evidence.
await page.keyboard.down("KeyW");
await page.waitForTimeout(5000);
const moved = (await read()).kmh;
note(`  POSITIVE CONTROL: ${moved} км/ч after 5 s of throttle`);
if (moved <= 0) {
  note(`  !! CAR DID NOT MOVE — every frame after this is a frozen world, not a drive.`);
  await beat("03b-frozen");
}

// The drive. `right` follows the briefing: ease off, brake, wait, resume.
// `wrong` holds it flat out — the direction that catches a lesson which credits
// correctly but convicts nothing.
let ended = false;
for (let i = 0; i < 30 && !ended; i++) {
  await page.waitForTimeout(3500);
  // Integer seconds, zero-padded. `i * 3.5` produces «04-t92.5s», which sorts
  // between «04-t089s» and «04-t096s» as a STRING — a judge reading the folder
  // in name order would see the drive out of sequence and narrate a car that
  // jumps backwards. The frames are the evidence; their order is part of it.
  const s = await beat(`04-t${String(Math.round(i * 3.5 + 5)).padStart(3, "0")}s`);
  if (s.overlay === "teach") {
    await page.keyboard.up("KeyW");
    for (const l of ["РАЗБРАХ", "Разбрах"]) {
      const b = page.locator(`button:has-text("${l}")`).first();
      if (await b.count().catch(() => 0)) { await b.click({ timeout: 4000 }).catch(() => {}); break; }
    }
    await page.waitForTimeout(1000);
    await page.keyboard.down("KeyW");
  }
  if (MODE === "right" && i === 4) {
    await page.keyboard.up("KeyW");
    await page.keyboard.down("KeyS");
    await page.waitForTimeout(3000);
    await page.keyboard.up("KeyS");
    await beat("05-stopped");
    await page.waitForTimeout(7000);
    await beat("06-waited");
    await page.keyboard.down("KeyW");
  }
  if (/Сесията завърши|РЕЗУЛТАТ|Резултат/i.test(s.body)) ended = true;
}
await page.keyboard.up("KeyW").catch(() => {});
await page.waitForTimeout(2500);
await beat("07-end");

// ── THE DEBRIEF — AND IT IS FORCED, NOT HOPED FOR ──────────────────────────
//
// THE DEFECT THIS BLOCK EXISTS TO CLOSE. Engine pass 2 produced four saved
// artifacts and every one ended:
//     DEBRIEF {"objectives":[],"mistakes":null,"good":null,"rubric":null}  ended:false
// The session never ended in ANY run, so every "credited"/"refused" verdict in
// that wave — including a whole 0%/50%/75% roundabout table — came from
// transient HUD toasts and the banner bar, which is the one source the brief
// forbade. A sweep of 644 drives with this hole is 644 folders that cannot
// answer the only question that matters: was correct driving credited?
//
// The task chip is not a substitute: it goes «2/2 -> null» when the session ends
// whether or not anything was ticked, so a run that credited NOTHING is
// indistinguishable from a perfect one.
//
// So: if the drive did not end on its own, END IT — the lesson menu carries
// «Завърши сесията» exactly for this. A forced end is a weaker result than a
// natural one and is RECORDED AS SUCH (`endedNaturally`), because "the session
// had to be forced" is itself a finding about the lesson.
let endedNaturally = ended;
if (!ended) {
  note(`  session did not end on its own — forcing it through the menu`);
  const menu = page.locator('button:has-text("МЕНЮ"), button:has-text("Меню"), [aria-label*="менюто"]').first();
  if (await menu.count().catch(() => 0)) {
    await menu.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1800);
    await shot("07b-menu");
  }
  for (const l of ["Завърши сесията", "Завърши", "Приключи"]) {
    const b = page.locator(`button:has-text("${l}")`).first();
    if (await b.count().catch(() => 0)) {
      await b.click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(3500);
      break;
    }
  }
}
for (const l of ["РЕЗУЛТАТ", "Резултат"]) {
  const b = page.locator(`button:has-text("${l}")`).first();
  if (await b.count().catch(() => 0)) { await b.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(4500); break; }
}
const debrief = await beat("08-debrief");

// The debrief must actually contain a verdict, or say so loudly. A silent empty
// debrief is how the last wave convinced itself it had measured credit.
const hasVerdict = /ИЗДЪРЖАН|НЕИЗДЪРЖАН|Резултат|точк|★|✓|–/.test(debrief.body);
note(`  DEBRIEF REACHED: ${hasVerdict ? "yes" : "NO — this run cannot answer whether credit was given"}`);
note(`  ended naturally: ${endedNaturally}${endedNaturally ? "" : "  (forced via menu — itself a finding)"}`);

note(`\n--- MACHINE SUMMARY (${SCENARIO}/${PLATFORM}/${MODE}) ---`);
note(`ended: ${ended} · final ${debrief.kmh} км/ч`);
note(`briefing chars: ${briefing.length}`);
note(`DEBRIEF TEXT >>> ${debrief.body.slice(0, 1800)}`);
await browser.close();
