#!/usr/bin/env node
// =============================================================================
// sheet-fold.mjs — THE READ SHEET'S OWN FOLD, in authored characters.
//
// `brief-fold.mjs` answers this question for the PEEK. This is the same probe
// pointed one surface deeper, and that surface turned out to be worse: the OPEN
// «ПРОЧЕТИ» sheet is where a student is SENT because the peek could not finish
// printing, and sweep 161 filed it for cutting its own last numbered step
// through the glyph tops with «Разбрах» pinned 8 px under the cut.
//
// WHY IT NEEDED ITS OWN FILE. Every fold probe in this family selects
// `[data-sim-overlay-text]`, which is the PEEK's window; the sheet's scroller is
// a different element, on a surface that only exists after a tap, and no probe
// had ever opened it. „Nobody looked" is the recurring cause in this catalogue,
// and the tool that cannot look is half of it.
//
// METHOD is brief-fold's, verbatim: Range-per-character against the scroller's
// own visible band (its box minus the mask's fade tail), so the answer is in
// the units the author types rather than in pixels or in `innerText` — which
// answers for the DOM and not for the eye, and is how six waves reported „the
// whole sentence" about text nobody could see.
//
// MEASURED WITH IT, BEFORE THE 2026-08-17 FIX (WebKit, real insets, iPhone 16
// landscape 852 × 393, staging):
//
//   sc-hz-accident-scene@L1
//     section    672 × 341 at (90, 12) — AT its cap
//     scroller   646 × 220 · clientH 220 · scrollH 256 · OVERFLOW 36 px
//     body       769 authored · 638 visible (83 %)
//     LOST       «6. Щом подминеш сцената и платното пред теб е чисто…»
//     announced  NOTHING — no counter, no fade, no scrollbar
//
// Usage:
//   node tools/mobile/sheet-fold.mjs [--scenario a,b] [--device id,id] [--level 1]
// =============================================================================
import { webkit } from "./lib/pw.mjs";
import { newDeviceContext } from "./lib/insets.mjs";
import { DEVICES } from "./lib/devices.mjs";
import { signIn } from "./lib/auth.mjs";

const BASE =
  process.env.KNIJKA_BASE ?? "https://icon-undertaken-earliest-zope.trycloudflare.com";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const SCENARIOS = arg("scenario", "sc-hz-accident-scene,sc-ed-poligon-chain").split(",");
const DEVICE_IDS = arg("device", "iphone16-landscape,small-landscape").split(",");
const LEVEL = arg("level", "1");

/** Runs IN THE PAGE. Exported so a rig script can reuse it without a drive. */
export const PROBE = () => {
  const R = (n) => Math.round(n * 10) / 10;
  const sheet = document.querySelector('[data-sim-overlay-state="open"]');
  if (sheet === null) return { error: "the read sheet is not open" };
  const section = sheet.querySelector("section");
  const scroller = section && section.querySelector("[data-sim-overlay-sheet-text]");
  if (!scroller) return { error: "no scroller inside the sheet" };
  const cs = getComputedStyle(scroller);
  // The fade is a mask ending in `transparent`; its tail is not readable text,
  // so the visible band stops there. `padding-bottom` is authored to match it.
  const pad = Number.parseFloat(cs.paddingBottom);
  const faded = /transparent/.test(cs.maskImage || cs.webkitMaskImage || "none");
  const fadePx = faded && Number.isFinite(pad) ? pad : 0;
  const r = scroller.getBoundingClientRect();
  const bandTop = r.top;
  const bandBottom = r.top + scroller.clientHeight - fadePx;

  const foldOf = (el) => {
    if (!el) return null;
    const text = el.textContent || "";
    const nodes = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n);
    let idx = 0;
    let fold = null;
    for (const n of nodes) {
      const s = n.nodeValue || "";
      for (let i = 0; i < s.length; i++) {
        const rg = document.createRange();
        rg.setStart(n, i);
        rg.setEnd(n, i + 1);
        const rect = rg.getBoundingClientRect();
        const ok =
          rect.height === 0 || (rect.top >= bandTop - 0.5 && rect.bottom <= bandBottom + 0.5);
        if (!ok && fold === null) fold = idx;
        idx++;
      }
    }
    return {
      chars: text.length,
      visibleChars: fold === null ? text.length : fold,
      lost: fold === null ? "" : text.slice(fold),
    };
  };

  const box = (el) => {
    const b = el.getBoundingClientRect();
    return { x: R(b.x), y: R(b.y), w: R(b.width), h: R(b.height) };
  };
  return {
    viewport: { w: innerWidth, h: innerHeight },
    section: box(section),
    scroller: {
      box: box(scroller),
      clientH: scroller.clientHeight,
      scrollH: scroller.scrollHeight,
      scrollTop: R(scroller.scrollTop),
      overflowPx: R(scroller.scrollHeight - scroller.clientHeight - fadePx),
      fadePx,
      leadingPx: R(Number.parseFloat(cs.lineHeight)),
    },
    title: foldOf(section.querySelector("h2")),
    body: foldOf(section.querySelector("[data-sim-overlay-sheet-text] p")),
    // THE QUESTION THE WHOLE ROW IS ABOUT: does anything on the glass SAY there
    // is more? A fold the student cannot detect is indistinguishable from a
    // finished list, which is what makes it worse than a visible truncation.
    announced: [...sheet.querySelectorAll("[data-sim-overlay-sheet-fold]")].map((e) =>
      (e.textContent || "").trim(),
    ),
  };
};

if (process.argv[1] && process.argv[1].endsWith("sheet-fold.mjs")) {
  const browser = await webkit.launch({ headless: true });
  const { context: authCtx } = await newDeviceContext(browser, DEVICES[DEVICE_IDS[0]], {
    motion: "allow",
  });
  const ap = await authCtx.newPage();
  await signIn(ap, { email: "founder@knijka.ai", password: "Knijka2026!" }, BASE);
  const storageState = await authCtx.storageState();
  await authCtx.close();

  for (const id of DEVICE_IDS) {
    for (const sc of SCENARIOS) {
      const { context } = await newDeviceContext(browser, DEVICES[id], {
        motion: "allow",
        storageState,
      });
      const page = await context.newPage();
      console.log(`\n${"=".repeat(90)}\n${id}  ${sc}@L${LEVEL}`);
      try {
        await page.goto(`${BASE}/simulator?scenario=${sc}&level=${LEVEL}`, {
          waitUntil: "domcontentloaded",
          timeout: 300_000,
        });
        // The same 25 s the drive harness waits before its first beat. Shorter
        // and the peek is still showing the pre-drive step, whose «СПИСЪК»
        // opens a different sheet — measured, and it is how a first run of this
        // probe reported a 21-character title and no overflow.
        await page.waitForTimeout(25_000);
        const more = page
          .locator('button:has-text("ПРОЧЕТИ"), button:has-text("Прочети")')
          .first();
        if (!(await more.count().catch(() => 0))) {
          console.log("  !! no «ПРОЧЕТИ» on this frame — nothing to open");
          await context.close();
          continue;
        }
        await more.click({ timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(2000);
        const d = await page.evaluate(PROBE);
        if (d.error) {
          console.log(`  !! ${d.error}`);
          await context.close();
          continue;
        }
        console.log(
          `  viewport ${d.viewport.w}×${d.viewport.h} · section ${d.section.w}×${d.section.h} at ${d.section.x},${d.section.y}`,
        );
        console.log(
          `  scroller ${d.scroller.box.w}×${d.scroller.box.h} · clientH ${d.scroller.clientH} · scrollH ${d.scroller.scrollH} · OVERFLOW ${d.scroller.overflowPx}px · fade ${d.scroller.fadePx}px · leading ${d.scroller.leadingPx}px`,
        );
        for (const [n, v] of [
          ["TITLE", d.title],
          ["BODY ", d.body],
        ]) {
          if (!v) {
            console.log(`  ${n}: absent`);
            continue;
          }
          const pct = v.chars ? Math.round((100 * v.visibleChars) / v.chars) : 0;
          console.log(`  ${n}: ${v.chars} authored · ${v.visibleChars} visible (${pct}%)`);
          if (v.lost) console.log(`      LOST: «${v.lost.slice(0, 240)}»`);
        }
        console.log(
          `  announced: ${d.announced.length ? d.announced.join(" | ") : "NOTHING — no counter, no fade, no scrollbar"}`,
        );
      } catch (e) {
        console.log(`  ERROR ${e.message}`);
      }
      await context.close();
    }
  }
  await browser.close();
}
