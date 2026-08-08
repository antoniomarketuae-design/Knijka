#!/usr/bin/env node
// =============================================================================
// fold-sweep.mjs — „it all have to be on the screen without scrolling", on the
// phone that exists.
//
//   node tools/mobile/fold-sweep.mjs --base-url http://localhost:3460
//   node tools/mobile/fold-sweep.mjs -d iphone16-landscape -m exam --shots all
//   node tools/mobile/fold-sweep.mjs --insets none      # the OLD, notch-less run
//
// WHAT IT MEASURES. Both runners — practice and exam — on the twenty questions
// the bank can least afford, inside the real app chrome (/dev/fold-rig), across
// the whole device ladder. A case is CLEAN when every answer option and the
// question text are at or above the fold, the document does not scroll, and the
// pinned bar does not overflow across.
//
// THREE THINGS THIS FIXES IN THE SHARED HARNESS.
//
//  1. THE INSETS ARE REAL AND THEY ARE THE DEFAULT. Playwright's WebKit is the
//     desktop port: env(safe-area-inset-*) is 0 there, so every fold number
//     this repo has ever published — including four „20 of 20" columns — was
//     measured on a phone with no notch and no home indicator. lib/insets.mjs
//     substitutes the profile's real values into the app's own declarations
//     before the first layout, and `assertInsetsApplied` refuses to measure a
//     page where that did not take.
//
//  2. THE FOLD IS THE TOP OF THE PINNED BAR, FOUND STRUCTURALLY. lib/probe.mjs
//     still measures against the viewport edge, which scores an answer painted
//     UNDER an opaque sticky strip as fitting — 58px of optimism on the exam.
//     Here the fold is whatever is `sticky`/`fixed` with its bottom on the
//     viewport's bottom edge, and a row where no such element was found is
//     REFUSED rather than quietly measured against the viewport.
//
//  3. THE ROW SAYS WHAT IT MOUNTED. The rig publishes the surface, the paper
//     size and the banner state it actually rendered; a row that does not match
//     what was asked for is thrown away. („?mode=exan" renders practice.)
//
// Frames and JSON go where --out says (a scratchpad), never into the repo.
// =============================================================================
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { webkit } from "./lib/pw.mjs";
import { DEVICES, DEFAULT_DEVICE_IDS, resolveMotion } from "./lib/devices.mjs";
import { assertInsetsApplied, insetBanner, newDeviceContext } from "./lib/insets.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const BASE = flag("--base-url", process.env.KNIJKA_MOBILE_BASE_URL || "http://localhost:3460");
const LABEL = flag("--label", "fold");
const OUT = flag("--out", join(HERE, ".out", "fold"));
const SHOTS = flag("--shots", "fail"); // none | fail | all
const INSETS = flag("--insets", "real"); // real | none
const ROTATION = flag("--rotation", "symmetric");
const MOTION = resolveMotion(flag("--motion", "reduce"));
const DEVICE_IDS = flag("-d", flag("--devices", DEFAULT_DEVICE_IDS.join(","))).split(",");
const MODES = flag("-m", flag("--modes", "practice,exam")).split(",");

mkdirSync(join(OUT, LABEL), { recursive: true });

// --- the tree these columns were measured against ----------------------------
// Other lanes edit this repo while this runs. The question is not „did a byte
// move" but „were column 1 and column 4 the same product", so the deciding
// files are hashed at both ends and the run prints the answer.
const FINGERPRINT = [
  "platform/src/components/exam/ExamRunner.tsx",
  "platform/src/components/theory/PracticeSession.tsx",
  "platform/src/components/theory/questionBudget.ts",
  "platform/src/components/theory/QuestionMedia.tsx",
  "platform/src/components/dashboard/DashboardShell.tsx",
  "platform/src/components/dashboard/autoHideTopbar.ts",
  "platform/src/app/dev/fold-rig/fold-rig-client.tsx",
  "platform/src/app/(dashboard)/layout.tsx",
  "platform/src/app/globals.css",
];
const fingerprint = () =>
  Object.fromEntries(
    FINGERPRINT.map((p) => [
      p.split("/").pop(),
      createHash("sha256").update(readFileSync(join(REPO, p))).digest("hex").slice(0, 12),
    ]),
  );

/**
 * THE TWENTY. Eighteen from the three families the rig ranks — text (the
 * ordinary heavy stem), rows (five and six options: a fifth row is ~46px
 * whatever it says) and media (a sign face or a top-down scene above the stem)
 * — plus the bank's two six-option items again with the exam's
 * under-five-minutes banner up, which is the state the fold has least room in.
 */
const CASES = [];
for (const family of ["text", "rows", "media"]) {
  for (let rank = 0; rank < 6; rank += 1) CASES.push({ family, rank });
}
const TIMELOW = [
  { q: "q-vehicle-063", timelow: 1, family: "timelow", rank: 0 },
  { q: "q-vehicle-005", timelow: 1, family: "timelow", rank: 1 },
];
const CASES_ARG = flag("--cases", null);
const ALL_CASES = CASES_ARG
  ? CASES_ARG.split(",").map((spec) => {
      const [family, rank] = spec.split("#");
      return family === "q" ? { q: rank, timelow: 0, family: "byid", rank: 0 } : { family, rank: Number(rank) };
    })
  : [...CASES, ...TIMELOW];

/** Runs in the page. Geometry and text only — no interpretation, no verdicts. */
const PROBE = () => {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const scroller = document.scrollingElement;
  const main = document.querySelector("#main-content");
  const root = document.querySelector("[data-fold-rig]");
  if (!main) return { id: null, noMain: true };

  const R = (el) => {
    const b = el.getBoundingClientRect();
    return {
      top: Math.round(b.top),
      bottom: Math.round(b.bottom),
      left: Math.round(b.left),
      right: Math.round(b.right),
      w: Math.round(b.width),
      h: Math.round(b.height),
    };
  };

  // -- THE FOLD: the top of whatever is pinned to the bottom edge -------------
  // Not „the parent of .btn-accent" (that is „Провери" and does not exist in
  // the exam) and not the viewport edge (an answer under an opaque bar is
  // neither readable nor tappable).
  let fold = vh;
  let barEl = null;
  for (const el of main.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.position !== "sticky" && cs.position !== "fixed") continue;
    const r = el.getBoundingClientRect();
    if (r.height < 4) continue;
    if (Math.abs(r.bottom - vh) > 4) continue;
    if (r.top < fold) {
      fold = Math.round(r.top);
      barEl = el;
    }
  }

  const worst = (sel, limit) => {
    let over = -1e9;
    for (const el of document.querySelectorAll(sel)) {
      over = Math.max(over, Math.round(el.getBoundingClientRect().bottom - limit));
    }
    return over === -1e9 ? null : over;
  };

  const optionSel = "#main-content label:has(input)";
  const options = [...document.querySelectorAll(optionSel)];
  const box = document.querySelector("#main-content [data-question-box]");
  const nav = document.querySelector('#main-content nav[aria-label="Навигация по въпросите"]');
  const legend = document.querySelector("#main-content legend");
  const card = document.querySelector("#main-content section");

  const cs = getComputedStyle(document.body);
  const barCs = barEl ? getComputedStyle(barEl) : null;

  return {
    id: root?.dataset.foldRig ?? null,
    ink: Number(root?.dataset.foldRigInk ?? 0),
    mountedMode: root?.dataset.foldRigMode ?? null,
    mountedPaper: Number(root?.dataset.foldRigPaper ?? 0),
    mountedTimeLow: root?.dataset.foldRigTimelow ?? null,
    fonts: document.fonts.status,
    vh,
    vw,
    // What the emulation actually did to this document, recorded in the row
    // rather than asserted once: a column can then be re-derived from raw and
    // still say which phone it describes.
    saEmulated: document.documentElement.dataset.saEmulated ?? null,
    saRewrites: Number(document.documentElement.dataset.saRewrites ?? 0),
    bodyPad: {
      left: Math.round(parseFloat(cs.paddingLeft)) || 0,
      right: Math.round(parseFloat(cs.paddingRight)) || 0,
      bottom: Math.round(parseFloat(cs.paddingBottom)) || 0,
    },
    fold,
    barPinned: barEl !== null,
    bar: barEl ? `${barEl.tagName.toLowerCase()}.${String(barEl.className).slice(0, 46)}` : null,
    barOverflowX: barEl ? Math.round(barEl.scrollWidth - barEl.clientWidth) : null,
    barRect: barEl ? R(barEl) : null,
    barPadBottom: barCs ? Math.round(parseFloat(barCs.paddingBottom)) || 0 : null,
    // How much empty room sits between the bar's last pixel and the bottom of
    // the screen. On a phone that is the home-indicator band — paid once by
    // <body>. Paid twice it is just lost screen.
    barGapBelow: barEl ? Math.round(vh - barEl.getBoundingClientRect().bottom) : null,
    options: options.length,
    overOptions: worst(optionSel, fold),
    lastOptionBottom: options.length
      ? Math.round(options[options.length - 1].getBoundingClientRect().bottom)
      : null,
    overLegend: worst("#main-content legend", fold),
    overButton: worst("#main-content button", vh),
    docScroll: Math.round(scroller.scrollHeight - scroller.clientHeight),
    questionBox: box
      ? {
          clientH: Math.round(box.clientHeight),
          scrollH: Math.round(box.scrollHeight),
          clipped: Math.round(box.scrollHeight - box.clientHeight),
          maxH: getComputedStyle(box).maxHeight,
        }
      : null,
    legendRect: legend ? R(legend) : null,
    cardRect: card ? R(card) : null,
    navigatorVisible: nav ? getComputedStyle(nav).display !== "none" : false,
    navCells: document.querySelectorAll("#main-content nav ol li").length,
    // Nothing on screen may say „loading" — a whole sweep has been spent
    // measuring a loading shell in this repo before.
    loadingWord: /Зареждан|Loading|Compiling/i.test(main.innerText || "")
      ? (main.innerText.match(/[^\n]*(Зареждан|Loading|Compiling)[^\n]*/i) || [""])[0].trim().slice(0, 60)
      : null,
    imgCount: main.querySelectorAll("img").length,
    imgComplete: [...main.querySelectorAll("img")].filter((i) => i.complete).length,
    imgPixels: [...main.querySelectorAll("img")].reduce(
      (n, i) => n + (i.naturalWidth || 0) * (i.naturalHeight || 0),
      0,
    ),
  };
};

const rows = [];
const treeBefore = fingerprint();
console.log(`base      ${BASE}`);
console.log(`tree      ${JSON.stringify(treeBefore)}`);
console.log(`motion    ${MOTION.id} — ${MOTION.says}`);
console.log(`cases     ${ALL_CASES.length} per surface per profile; surfaces ${MODES.join("+")}`);

let browser = await webkit.launch();

for (const deviceId of DEVICE_IDS) {
  const device = DEVICES[deviceId];
  if (!device) throw new Error(`unknown device ${deviceId}`);
  let inset = null;
  const newPage = async () => {
    if (!browser.isConnected()) browser = await webkit.launch();
    // serviceWorkers:"block" — public/sw.js answers a navigation whose fetch
    // threw with /offline.html, and „Телефонът ти е офлайн" has been published
    // as this app's theory hub once already.
    const made = await newDeviceContext(browser, device, {
      motion: MOTION.id,
      insets: INSETS,
      rotation: ROTATION,
      serviceWorkers: "block",
    });
    inset = made.inset;
    return { context: made.context, page: await made.context.newPage() };
  };
  let { context, page } = await newPage();
  console.log(`\n--- ${device.label} (${device.width}x${device.height}) ---`);
  console.log(`    ${insetBanner(device, inset)}`);
  let insetCheck = null;

  for (const mode of MODES) {
    for (const c of ALL_CASES) {
      const qs = c.q
        ? `mode=${mode}&q=${c.q}&timelow=${c.timelow ?? 0}`
        : `mode=${mode}&family=${c.family}&rank=${c.rank}`;
      const url = `${BASE}/dev/fold-rig?${qs}`;
      let m = null;
      let lastError = null;
      for (let attempt = 0; attempt < 4 && m === null; attempt += 1) {
        try {
          // Warm from node first: a plain fetch has no navigation timeout, so
          // it waits out a Turbopack rebuild instead of handing the browser a
          // request that dies mid-compile.
          await fetch(url).then((r) => r.text());
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240_000 });
          await page.waitForSelector("[data-fold-rig]", { timeout: 240_000 });
          await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1", {
            timeout: 240_000,
          });
          if (insetCheck === null) {
            insetCheck = await assertInsetsApplied(page, inset);
            console.log(
              `    engine env() ${JSON.stringify(insetCheck.engine)} · <body> padding ` +
                `${insetCheck.body.left}/${insetCheck.body.right}/${insetCheck.body.bottom} · ` +
                `${insetCheck.agent?.declarations ?? 0} rules + ${insetCheck.agent?.inlineDeclarations ?? 0} inline styles rewritten`,
            );
          }
          // The display face changes how a question wraps: a probe that races
          // the webfont reports whatever the network did that second.
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          // Three identical consecutive samples, 200ms apart, up to 8s — both
          // height budgets converge over a rAF chain and a ResizeObserver.
          let probe = null;
          let prevKey = null;
          let same = 0;
          for (let i = 0; i < 40; i += 1) {
            probe = await page.evaluate(PROBE);
            const key = `${probe.overOptions}|${probe.docScroll}|${probe.fold}|${probe.lastOptionBottom}|${probe.overLegend}|${probe.questionBox?.clientH}`;
            if (key === prevKey) {
              same += 1;
              if (same >= 3) break;
            } else {
              same = 0;
              prevKey = key;
            }
            await page.waitForTimeout(200);
          }
          // --- the refusals ---------------------------------------------------
          if (same < 3) throw new Error("layout never settled (8s, 3 identical samples)");
          if (probe.id === null) throw new Error("rig root missing");
          if (probe.mountedMode !== mode) throw new Error(`mounted ${probe.mountedMode}, asked ${mode}`);
          if (mode === "exam" && probe.mountedPaper !== 45) {
            throw new Error(`paper is ${probe.mountedPaper} questions, expected 45`);
          }
          if (probe.mountedTimeLow !== String(c.timelow ?? 0)) {
            throw new Error(`timelow ${probe.mountedTimeLow}, asked ${c.timelow ?? 0}`);
          }
          if (probe.loadingWord) throw new Error(`loading text on screen: ${probe.loadingWord}`);
          if (probe.imgCount !== probe.imgComplete || (probe.imgCount > 0 && probe.imgPixels === 0)) {
            throw new Error(`artwork not settled (${probe.imgComplete}/${probe.imgCount})`);
          }
          if (probe.fonts !== "loaded") throw new Error(`fonts ${probe.fonts}`);
          if (INSETS === "real" && probe.saRewrites === 0) {
            throw new Error("safe-area emulation rewrote nothing on this page");
          }
          probe.settled = true;
          m = probe;
        } catch (error) {
          lastError = error;
          console.log(
            `  retry ${attempt + 1} ${deviceId} ${mode} ${c.family}#${c.rank}: ` +
              `${String(error.message).split("\n")[0].slice(0, 110)}`,
          );
          await page.close().catch(() => {});
          await context.close().catch(() => {});
          insetCheck = null;
          ({ context, page } = await newPage());
        }
      }
      if (m === null) {
        throw new Error(`${deviceId} ${mode} ${c.family}#${c.rank} unmeasurable: ${lastError?.message}`);
      }
      const row = {
        device: deviceId,
        viewport: `${device.width}x${device.height}`,
        mode,
        family: c.family,
        rank: c.rank,
        insets: INSETS,
        rotation: ROTATION,
        insetAsked: { top: inset.top, right: inset.right, bottom: inset.bottom, left: inset.left },
        motion: MOTION.id,
        url,
        ...m,
      };
      rows.push(row);
      appendFileSync(join(OUT, `${LABEL}.jsonl`), `${JSON.stringify(row)}\n`);
      const bad = row.docScroll > 0 || row.overOptions > 0 || row.overButton > 0 || row.overLegend > 0;
      if (SHOTS === "all" || (SHOTS === "fail" && bad)) {
        await page.screenshot({
          path: join(OUT, LABEL, `${deviceId}--${mode}--${c.family}${c.rank}-${row.id}.png`),
        });
      }
      console.log(
        `${bad ? "FAIL" : " ok "} ${deviceId.padEnd(19)} ${mode.padEnd(8)} ` +
          `${(c.family + "#" + c.rank).padEnd(9)} ${String(row.id).padEnd(21)} ` +
          `opt ${String(row.options).padStart(2)} overOpt ${String(row.overOptions).padStart(5)} ` +
          `overLeg ${String(row.overLegend).padStart(5)} doc ${String(row.docScroll).padStart(4)} ` +
          `bar ${row.barPinned ? "pin" : "---"}@${String(row.fold).padStart(3)} ` +
          `padB ${String(row.barPadBottom).padStart(2)} gap ${String(row.barGapBelow).padStart(3)} ` +
          `qbox ${row.questionBox ? `${row.questionBox.clientH}/${row.questionBox.scrollH}` : "-"}`,
      );
    }
  }
  await context.close().catch(() => {});
}
await browser.close();

const treeAfter = fingerprint();
const coherent = JSON.stringify(treeBefore) === JSON.stringify(treeAfter);
writeFileSync(
  join(OUT, `${LABEL}.json`),
  JSON.stringify({ label: LABEL, insets: INSETS, rotation: ROTATION, motion: MOTION.id, base: BASE, treeBefore, treeAfter, coherent, rows }, null, 2),
);

const groups = new Map();
for (const r of rows) {
  const k = `${r.mode} @ ${r.device}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
console.log(`\n===== ${LABEL} (insets ${INSETS}${INSETS === "real" ? `, rotation ${ROTATION}` : ""}) =====`);
for (const [k, list] of groups) {
  const clean = list.filter(
    (r) => r.docScroll <= 0 && r.overOptions <= 0 && r.overButton <= 0 && r.overLegend <= 0,
  );
  console.log(
    `${k.padEnd(30)} ${String(clean.length).padStart(2)}/${list.length} clean   ` +
      `worst option ${String(Math.max(...list.map((r) => r.overOptions ?? 0))).padStart(4)}px   ` +
      `worst legend ${String(Math.max(...list.map((r) => r.overLegend ?? 0))).padStart(4)}px   ` +
      `worst doc ${String(Math.max(...list.map((r) => r.docScroll))).padStart(4)}px   ` +
      `stem clamped on ${list.filter((r) => (r.questionBox?.clipped ?? 0) > 0).length}`,
  );
}
console.log(`\nTREE COHERENT ACROSS ALL COLUMNS: ${coherent}`);
if (!coherent) console.log(`  start ${JSON.stringify(treeBefore)}\n  end   ${JSON.stringify(treeAfter)}`);
console.log(`rows: ${rows.length} -> ${join(OUT, `${LABEL}.json`)}`);
