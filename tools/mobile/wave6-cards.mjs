// =============================================================================
// wave6-cards.mjs — THE CARDS LANE, MEASURED ON A PRODUCTION BUILD OF THE REAL
// /simulator, SIGNED IN, WITH A LIVE CANVAS ASSERTED BEFORE ANY NUMBER IS
// BELIEVED.
//
// WHY THIS FILE EXISTS AND NOT ANOTHER RIG. Doc 91's own post-mortem: three of
// the four mobile waves measured `/dev/drive-rig`, which 404s in production, and
// three probes against the live URL reported „overflowCount: 0" while returning
// `hasCanvas: false` — they were measuring a login redirect. So the first thing
// every row below does is refuse to run:
//
//     hasCanvas === true  AND  canvas.width > 0  AND  canvas.height > 0
//
// …and the route is `/simulator?scenario=…&level=1`, the deep link a student
// actually opens, on `next build && next start`.
//
// ROWS MEASURED (doc 91 §I):
//   I4a   the belt trap — the CARD scrolls, «Разбрах» is on screen at every size
//   I4b   no tutorial modal opens by itself on compact
//   I5a   the pre-drive line has no ✕ (the 4 px dead end)
//   I5b   «Подготовка n/13» is in the lesson menu — the way back
//   I12   the pre-drive copy speaks to the device in his hands
//   I13   the glyph captions are not clipped
//   I14   hit rects ≥ 44 px on the controls §L9 named
//   I15   no mirror chip renders off the canvas
//   CARD  the peek card's BODY is on the screen (THEO-4), not behind «ЗАЩО»
//   EDGE  is the card clipped at the right edge? (the other lane's defect —
//         answered here because a card with no visible title and a card whose
//         title runs off the edge are the same screenshot)
//
//   node wave6-cards.mjs --base http://localhost:3491
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { DEFAULT_DEVICE_IDS, resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3491");
// ── THE ROUTE HAS TO BE THE ONE WITH A PRE-DRIVE ON IT. ──────────────────────
// `?scenario=…&level=1` is the only DEEP LINK the shell has, and a compiled
// scenario drill has `preDrive: false` — a first run of this probe against it
// measured a seat-belt WARNING card (priority 70) and reported „no checklist",
// which would have been a false negative on five of the rows below. The only
// lessons with `preDrive: true` are l1-preparation (instruction), the полигон
// drill (practice) and the exam (assess), and none of them is deep-linkable —
// so the probe does what a student does: opens /simulator and presses
// «Започни урока» on «Подготовка и потегляне».
const ROUTE = "/simulator";
const LESSON_BG = "Подготовка и потегляне";
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave6-cards`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const devices = resolveDevices((arg("device", DEFAULT_DEVICE_IDS.join(","))).split(","));
const KEEP_HINT = process.argv.includes("--keep-hint");

const user = await ensureHarnessUser();
const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
});
const { context: authContext } = await newDeviceContext(browser, devices[0], {
  motion: "allow",
  insets: "real",
});
const authPage = await authContext.newPage();
await signIn(authPage, { email: user.email, password: user.password }, BASE);
const storageState = await authContext.storageState();
await authContext.close();

/** The ::before/::after-aware hit rect — the same ruler lib/probe.mjs uses. */
const HIT_RECT_FN = `
  function hitRect(el) {
    const r = el.getBoundingClientRect();
    let hit = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      if (!ps || ps.content === "none" || ps.position !== "absolute") continue;
      if (ps.pointerEvents === "none") continue;
      const px = (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : 0; };
      hit = {
        left: Math.min(hit.left, r.left + px(ps.left)),
        top: Math.min(hit.top, r.top + px(ps.top)),
        right: Math.max(hit.right, r.right - px(ps.right)),
        bottom: Math.max(hit.bottom, r.bottom - px(ps.bottom)),
      };
    }
    return {
      x: Math.round(hit.left), y: Math.round(hit.top),
      w: Math.round((hit.right - hit.left) * 10) / 10,
      h: Math.round((hit.bottom - hit.top) * 10) / 10,
    };
  }`;

const rows = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    insets: "real",
    storageState,
  });
  // ── `--keep-hint`: LEAVE THE TOUCH HINT UP. ───────────────────────────────
  // The default suppresses it so the PRE-DRIVE card is the one in the column —
  // otherwise the hint outranks it and five of these rows measure the wrong
  // card. But the hint IS the card that carries «Разбрах» on a phone (§L
  // measured it at [704.9, 70.3, 76.1×44], under the right indicator), and
  // «РАЗБРА[Х] runs off the right edge» is his own report. A sweep that
  // silences the card it is asking about answers nothing, so the EDGE rows can
  // be re-taken with the hint left alone.
  if (!KEEP_HINT) {
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("sim.touchHintSeen", "1");
      } catch {
        /* private mode */
      }
    });
  }
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  console.log(`\n${"=".repeat(94)}\n${device.label}\n  ${insetBanner(device, inset)}`);

  const tapAt = async (x, y) => {
    const pt = [{ x, y, id: 3, radiusX: 12, radiusY: 12, force: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
    await sleep(90);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: pt });
    await sleep(500);
  };
  /** Tap a control BY ITS OWN CENTRE — the same thing a thumb does. */
  const tapMatching = async (selector, textRe) => {
    const c = await page.evaluate(
      ({ selector, textRe }) => {
        const rx = textRe ? new RegExp(textRe) : null;
        for (const el of document.querySelectorAll(selector)) {
          const t = `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`;
          if (rx && !rx.test(t)) continue;
          const q = el.getBoundingClientRect();
          if (q.width < 1 || q.height < 1) continue;
          return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
        }
        return null;
      },
      { selector, textRe },
    );
    if (!c) return false;
    await tapAt(c.x, c.y);
    return true;
  };

  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  if (page.url().includes("/login")) {
    console.log("  ✖ REDIRECTED TO /login — refusing to report login-page geometry.");
    rows.push({ device: device.id, refused: true, gate: { url: page.url() } });
    await context.close();
    continue;
  }
  // Press «Започни урока» on the lesson that HAS a pre-drive.
  await page.waitForSelector("article, [aria-label]", { timeout: 240_000 }).catch(() => {});
  const started = await page.evaluate((titleBg) => {
    for (const el of document.querySelectorAll("[aria-label]")) {
      if (!(el.getAttribute("aria-label") || "").includes(titleBg)) continue;
      const b = [...el.querySelectorAll("button")].find((x) =>
        /Започни урока|Карай отново/.test((x.textContent || "").trim()),
      );
      if (b) {
        b.click();
        return true;
      }
    }
    return false;
  }, LESSON_BG);
  console.log(`  ENTRY · «${LESSON_BG}» started = ${started}`);
  await page.waitForSelector("canvas", { timeout: 240_000 });
  await sleep(6000);

  // ── THE GATE. Five probes have reported „0 overflow" from a page with no
  //    simulator on it; this one refuses to produce a row instead.
  const gate = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const r = c?.getBoundingClientRect();
    return {
      url: location.pathname + location.search,
      hasCanvas: !!c,
      canvas: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
      compact: document.querySelector("[data-sim-compact]")?.getAttribute("data-sim-compact") ?? null,
      coarse: window.matchMedia("(any-pointer: coarse)").matches,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
  const live = gate.hasCanvas && (gate.canvas?.w ?? 0) > 0 && (gate.canvas?.h ?? 0) > 0;
  console.log(
    `  GATE · url=${gate.url} · hasCanvas=${gate.hasCanvas} · canvas=${gate.canvas ? `${gate.canvas.w}×${gate.canvas.h}` : "none"} ` +
      `· compact=${gate.compact} · coarse=${gate.coarse} · viewport=${gate.vw}×${gate.vh}`,
  );
  if (!live) {
    console.log("  ✖ REFUSING TO MEASURE — no live canvas. Nothing below would mean anything.");
    rows.push({ device: device.id, gate, refused: true });
    await context.close();
    continue;
  }

  // The shell opens with a full-screen „Караш направо от телефона" dialog and a
  // sound prompt. Clear them the way a student does, then let the pre-drive
  // card arrive.
  for (let i = 0; i < 8; i += 1) {
    const hit = await page.evaluate((keepHint) => {
      const dialog = [...document.querySelectorAll('[role="dialog"]')].pop();
      // With `--keep-hint` the sweep may only clear MODALS — the touch hint is
      // not a dialog, and clicking its «Разбрах» is exactly what we are trying
      // not to do.
      if (keepHint && !dialog) return false;
      const scope = dialog ?? document;
      for (const b of scope.querySelectorAll("button")) {
        if (/^(Разбрах|Продължи|Започни|Затвори)$/.test((b.textContent || "").trim())) {
          b.click();
          return true;
        }
      }
      return false;
    }, KEEP_HINT);
    if (!hit) break;
    await sleep(600);
  }
  await sleep(1200);

  const shot = async (name) =>
    page.screenshot({ path: `${OUT}/shots/${device.id}-${name}.png` }).catch(() => {});
  await shot("01-landed");

  // ══════════════════════════════════════════════════════════════════════════
  // THE PEEK CARD — its body, its edges, its ✕. (THEO-4 · I5a · EDGE)
  // ══════════════════════════════════════════════════════════════════════════
  const card = await page.evaluate(
    (hitSrc) => {
      // eslint-disable-next-line no-new-func
      const hitRect = new Function(`${hitSrc}; return hitRect;`)();
      const col = document.querySelector('[data-sim-overlay-state="peek"]');
      if (!col) return { present: false };
      const box = col.querySelector("[data-sim-overlay-card]");
      const r = (box ?? col).getBoundingClientRect();
      const body = col.querySelector("[data-sim-overlay-body]");
      const bodyR = body?.getBoundingClientRect() ?? null;
      const lineEl = col.querySelector("span.line-clamp-3");
      const lineR = lineEl?.getBoundingClientRect() ?? null;
      const dismiss = col.querySelector("[data-hud-close]");
      // EDGE: does anything inside this card lie outside the viewport, and does
      // any text box clip its own content?
      const overflow = [];
      for (const el of col.querySelectorAll("*")) {
        const q = el.getBoundingClientRect();
        if (q.width < 1 || q.height < 1) continue;
        if (q.right > window.innerWidth + 0.5 || q.left < -0.5) {
          overflow.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || "").trim().slice(0, 32),
            x: Math.round(q.x),
            right: Math.round(q.right),
          });
        }
      }
      const clipped = [];
      for (const el of col.querySelectorAll("span,p,button")) {
        if (el.children.length > 0) continue;
        if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
          clipped.push({
            text: (el.textContent || "").trim().slice(0, 32),
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
          });
        }
      }
      return {
        present: true,
        kind: col.getAttribute("data-sim-overlay"),
        card: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        rightEdgeGap: Math.round(window.innerWidth - r.right),
        line: lineEl ? (lineEl.textContent || "").trim() : null,
        lineRect: lineR ? { w: Math.round(lineR.width), h: Math.round(lineR.height) } : null,
        bodyPresent: !!body,
        bodyText: body ? (body.textContent || "").trim() : null,
        bodyRect: bodyR ? { w: Math.round(bodyR.width), h: Math.round(bodyR.height) } : null,
        dismissPresent: !!dismiss,
        dismissRect: dismiss ? hitRect(dismiss) : null,
        controls: [...col.querySelectorAll("button")].map((b) => ({
          text: (b.textContent || "").trim().slice(0, 24),
          label: b.getAttribute("aria-label"),
          ...hitRect(b),
        })),
        overflow,
        clipped,
      };
    },
    HIT_RECT_FN,
  );
  console.log(`  CARD · ${card.present ? `kind=${card.kind} box=${card.card.w}×${card.card.h} @${card.card.x},${card.card.y} (gap to right edge ${card.rightEdgeGap}px)` : "NO PEEK CARD ON SCREEN"}`);
  if (card.present) {
    console.log(`    line     : «${(card.line ?? "").slice(0, 70)}»`);
    console.log(
      `    THEO-4   : body inline = ${card.bodyPresent ? `YES (${card.bodyRect.w}×${card.bodyRect.h}) «${(card.bodyText ?? "").slice(0, 70)}»` : "NO — the instruction is behind a press"}`,
    );
    console.log(`    I5a      : ✕ present = ${card.dismissPresent} ${card.dismissPresent ? "(the 4 px dead end is OPEN)" : "(noDismiss holds)"}`);
    console.log(`    EDGE     : off-viewport children = ${card.overflow.length}, self-clipping text = ${card.clipped.length}`);
    for (const o of card.overflow) console.log(`               ⚠ <${o.tag}> «${o.text}» x=${o.x} right=${o.right} (viewport ${gate.vw})`);
    for (const c of card.clipped) console.log(`               ⚠ «${c.text}» scrollW ${c.scrollW} > clientW ${c.clientW}`);
    for (const c of card.controls) {
      const bad = c.w < 44 || c.h < 44;
      console.log(`    ctrl     : «${c.text || c.label}» ${c.w}×${c.h} ${bad ? "✖ UNDER 44" : "✓"}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EDGE — „the teach card is CLIPPED at the right edge, «РАЗБРА[Х]» runs off."
  //
  // §NR1 proved there is no DOCUMENT-level horizontal overflow, and that
  // negative was then read as covering this, which it does not: a card whose
  // own box clips its own label produces the identical screenshot and leaves
  // `document.scrollWidth === innerWidth`. So this asks the two questions §NR1
  // could not: does any element cross the right edge, and does any text box
  // clip its own content? Whole stage, not just the peek card, because
  // «РАЗБРАХ» lives on four different surfaces.
  // ══════════════════════════════════════════════════════════════════════════
  const edge = await page.evaluate(() => {
    const past = [];
    const clipped = [];
    const razbrah = [];
    const stage = document.querySelector("[data-sim-shell]") ?? document.body;
    for (const el of stage.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;
      const text = (el.textContent || "").trim();
      if (r.right > window.innerWidth + 0.5) {
        past.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute("class") || "").slice(0, 40),
          text: text.slice(0, 30),
          right: Math.round(r.right),
          over: Math.round(r.right - window.innerWidth),
        });
      }
      const leaf = el.children.length === 0 && text.length > 0;
      if (leaf) {
        if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
          clipped.push({
            text: text.slice(0, 30),
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
            over: el.scrollWidth - el.clientWidth,
          });
        }
      }
      // HIS OWN SENTENCE, AS A MEASUREMENT: «РАЗБРА[Х]» runs off the edge.
      if (/Разбрах/.test(text) && (el.tagName === "BUTTON" || leaf)) {
        razbrah.push({
          tag: el.tagName.toLowerCase(),
          text: text.slice(0, 40),
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
          gapToRightEdge: Math.round(window.innerWidth - r.right),
          scrollW: el.scrollWidth, clientW: el.clientWidth,
          pastEdge: r.right > window.innerWidth + 0.5,
          clipsOwnText: el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0,
        });
      }
    }
    return {
      past: past.slice(0, 12),
      pastCount: past.length,
      clipped: clipped.slice(0, 12),
      clippedCount: clipped.length,
      razbrah,
      docScrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    };
  });
  console.log(
    `  EDGE · docScrollW=${edge.docScrollW} innerW=${edge.innerW} · elements past the right edge=${edge.pastCount} · text boxes clipping their own content=${edge.clippedCount}`,
  );
  for (const p of edge.past) console.log(`    ✖ <${p.tag}> «${p.text}» right=${p.right} (+${p.over})`);
  for (const c of edge.clipped) console.log(`    ✖ «${c.text}» clipped by ${c.over}px (scrollW ${c.scrollW} > clientW ${c.clientW})`);
  console.log(`  «РАЗБРАХ» · ${edge.razbrah.length} on screen`);
  for (const b of edge.razbrah) {
    console.log(
      `    <${b.tag}> «${b.text}» ${b.w}×${b.h} @${b.x},${b.y} gap-to-right-edge=${b.gapToRightEdge}px ` +
        `scrollW=${b.scrollW}/clientW=${b.clientW}` +
        `${b.pastEdge ? " ✖ PAST THE VIEWPORT EDGE" : ""}${b.clipsOwnText ? " ✖ CLIPS ITS OWN TEXT" : ""}`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // I13 — THE GLYPH CAPTIONS, AND WHETHER THEY ARE CLIPPED.
  // ══════════════════════════════════════════════════════════════════════════
  const captions = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[data-hud="touch-controls"] *')) {
      const t = (el.textContent || "").trim();
      if (el.children.length > 0) continue;
      if (!/^(Ляв|Дясн|Задн|Ляво)$/.test(t)) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.push({
        text: t,
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        overflow: cs.overflow,
        offViewport: r.left < -0.5 || r.right > window.innerWidth + 0.5 || r.top < -0.5 || r.bottom > window.innerHeight + 0.5,
        clipsOwnText: el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0,
      });
    }
    return out;
  });
  const capBad = captions.filter((c) => c.offViewport || c.clipsOwnText);
  console.log(`  I13 · captions found=${captions.length} · clipped/off-screen=${capBad.length}`);
  for (const c of captions) {
    console.log(
      `    «${c.text}» ${c.w}×${c.h} @${c.x},${c.y} scrollW=${c.scrollW}/clientW=${c.clientW}` +
        `${c.offViewport ? " ✖ OFF-VIEWPORT" : ""}${c.clipsOwnText ? " ✖ CLIPS OWN TEXT" : ""}`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // I15 — THE MIRROR CHIPS. A chip at x −76 is the row's whole subject.
  // ══════════════════════════════════════════════════════════════════════════
  const chips = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("div,span")) {
      const t = (el.textContent || "").trim();
      if (!/^🖱\s*(Щракни|Задръж)/.test(t)) continue;
      if (el.children.length > 3 && !/огледал|колан|светл/i.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue;
      out.push({
        text: t.slice(0, 40),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        off: r.left < -0.5 || r.top < -0.5 || r.right > window.innerWidth + 0.5,
      });
    }
    // de-duplicate the wrapper/child pairs by text
    const seen = new Set();
    return out.filter((c) => (seen.has(c.text) ? false : (seen.add(c.text), true)));
  });
  console.log(`  I15 · cockpit chips on screen=${chips.length} · off-canvas=${chips.filter((c) => c.off).length}`);
  for (const c of chips) console.log(`    «${c.text}» ${c.w}×${c.h} @${c.x},${c.y}${c.off ? " ✖ OFF-CANVAS" : ""}`);

  // ══════════════════════════════════════════════════════════════════════════
  // I5b — «Подготовка n/13» in the lesson menu, and I14 for the menu rows.
  // ══════════════════════════════════════════════════════════════════════════
  await tapMatching("button[aria-label='Меню на урока']", null);
  await sleep(600);
  await shot("02-menu");
  const menu = await page.evaluate(
    (hitSrc) => {
      // eslint-disable-next-line no-new-func
      const hitRect = new Function(`${hitSrc}; return hitRect;`)();
      const rows = [...document.querySelectorAll('[role="menuitem"]')].map((b) => ({
        text: (b.textContent || "").trim().slice(0, 40),
        ...hitRect(b),
      }));
      return { open: rows.length > 0, rows };
    },
    HIT_RECT_FN,
  );
  const recall = menu.rows.find((r) => /Подготовка/.test(r.text)) ?? null;
  console.log(`  I5b · menu open=${menu.open} · rows=${menu.rows.length} · «Подготовка» recall = ${recall ? `PRESENT «${recall.text}»` : "ABSENT"}`);
  const menuUnder44 = menu.rows.filter((r) => r.h < 44);
  console.log(`  I14 · menu rows under 44 px = ${menuUnder44.length}/${menu.rows.length}${menu.rows[0] ? ` (first row ${menu.rows[0].w}×${menu.rows[0].h})` : ""}`);
  for (const r of menuUnder44) console.log(`    ✖ «${r.text}» ${r.w}×${r.h}`);
  // close the menu again
  await tapMatching("button[aria-label='Затвори менюто на урока']", null);
  await sleep(500);

  // ══════════════════════════════════════════════════════════════════════════
  // I4b + I12 + I14 — OPEN THE CHECKLIST SHEET THE WAY A STUDENT DOES.
  // ══════════════════════════════════════════════════════════════════════════
  const openedSheet = await tapMatching(
    '[data-sim-overlay-state="peek"] button',
    "Списък|Защо",
  );
  await sleep(900);
  await shot("03-sheet");
  const sheet = await page.evaluate(
    (hitSrc) => {
      // eslint-disable-next-line no-new-func
      const hitRect = new Function(`${hitSrc}; return hitRect;`)();
      const panel = document.querySelector('[data-hud="predrive-checklist"]');
      const modal = [...document.querySelectorAll('[role="dialog"]')].find((d) =>
        /^Стъпка\s\d+\sот\s\d+/.test(d.getAttribute("aria-label") || ""),
      );
      if (!panel) return { present: false, autoModal: !!modal };
      const subtitle = [...panel.querySelectorAll("p")]
        .map((p) => (p.textContent || "").trim())
        .find((t) => /Всяка стъпка се прави/.test(t));
      const action = [...panel.querySelectorAll("p")]
        .map((p) => (p.textContent || "").trim())
        .find((t) => /^(🖱|☝)/.test(t));
      const buttons = [...panel.querySelectorAll("button")].map((b) => ({
        text: (b.textContent || "").trim().slice(0, 30),
        ...hitRect(b),
      }));
      const r = panel.getBoundingClientRect();
      // ── THE SHEET'S OWN GEOMETRY. A panel measured at y −319 is not a
      //    layout opinion, it is a control the thumb cannot reach, so the box
      //    that decides it gets measured too rather than reasoned about.
      const section = document.querySelector('[data-sim-overlay-state="open"] section');
      const sr = section?.getBoundingClientRect() ?? null;
      const scroller = section?.querySelector(".overflow-y-auto") ?? null;
      const qr = scroller?.getBoundingClientRect() ?? null;
      const cs = section ? getComputedStyle(section) : null;
      const root = getComputedStyle(document.documentElement);
      const shell = document.querySelector("[data-sim-shell]");
      const shellCs = shell ? getComputedStyle(shell) : null;
      return {
        present: true,
        autoModal: !!modal,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        section: sr
          ? {
              x: Math.round(sr.x), y: Math.round(sr.y),
              w: Math.round(sr.width), h: Math.round(sr.height),
              maxHeight: cs?.maxHeight, overflowY: cs?.overflowY,
            }
          : null,
        scroller: qr
          ? {
              y: Math.round(qr.y), h: Math.round(qr.height),
              scrollH: scroller.scrollHeight, clientH: scroller.clientHeight,
              scrolls: scroller.scrollHeight > scroller.clientHeight + 1,
            }
          : null,
        vars: {
          simVh: (shellCs ?? root).getPropertyValue("--sim-vh").trim() || root.getPropertyValue("--sim-vh").trim(),
          dashH: (shellCs ?? root).getPropertyValue("--sim-dash-h").trim() || root.getPropertyValue("--sim-dash-h").trim(),
          innerH: window.innerHeight,
        },
        subtitle,
        action,
        buttons,
      };
    },
    HIT_RECT_FN,
  );
  console.log(`  SHEET · opened=${openedSheet} · checklist present=${sheet.present}`);
  console.log(`  I4b · a tutorial modal opened BY ITSELF = ${sheet.autoModal ? "YES ✖" : "no ✓"}`);
  if (sheet.present) {
    console.log(
      `    SHEET BOX : section ${sheet.section ? `${sheet.section.w}×${sheet.section.h} @${sheet.section.x},${sheet.section.y} max-h=${sheet.section.maxHeight}` : "?"} · ` +
        `scroller ${sheet.scroller ? `h=${sheet.scroller.h} scrollH=${sheet.scroller.scrollH} scrolls=${sheet.scroller.scrolls}` : "?"} · ` +
        `--sim-vh=${sheet.vars.simVh || "(unset)"} --sim-dash-h=${sheet.vars.dashH || "(unset)"} innerH=${sheet.vars.innerH}`,
    );
    console.log(
      `    CHECKLIST : ${sheet.rect.w}×${sheet.rect.h} @${sheet.rect.x},${sheet.rect.y}` +
        `${sheet.rect.y < 0 ? ` ✖ ${-sheet.rect.y} px ABOVE THE TOP OF THE SCREEN` : ""}`,
    );
    console.log(`    I12 subtitle: «${(sheet.subtitle ?? "(none)").slice(0, 96)}»`);
    console.log(`    I12 action  : «${(sheet.action ?? "(none)").slice(0, 96)}»`);
    const under = sheet.buttons.filter((b) => b.h < 44);
    console.log(`    I14 checklist buttons under 44 px = ${under.length}/${sheet.buttons.length}`);
    for (const b of sheet.buttons) console.log(`      «${b.text}» ${b.w}×${b.h}${b.h < 44 ? " ✖" : ""}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // I4a — THE BELT TRAP. Open the tutorial ON PURPOSE and ask whether the card
  // fits and whether «Разбрах» is on the screen.
  // ══════════════════════════════════════════════════════════════════════════
  let openedTutorial = await tapMatching(
    '[data-hud="predrive-checklist"] button',
    "Покажи ми как",
  );
  await sleep(900);
  // IF THE THUMB COULD NOT REACH IT, SAY SO AND THEN OPEN IT ANYWAY. The card's
  // own geometry is this lane's row (§I4a) and it is a fact about the card, not
  // about how the card was reached; but „the control was not reachable" is
  // itself a finding and must never be swallowed to make a number appear.
  let tutorialNeededProgrammaticOpen = false;
  if (!(await page.$('[role="dialog"][aria-label^="Стъпка"]'))) {
    tutorialNeededProgrammaticOpen = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-hud="predrive-checklist"] button')].find(
        (x) => /Покажи ми как/.test((x.textContent || "").trim()),
      );
      if (!b) return false;
      b.click();
      return true;
    });
    if (tutorialNeededProgrammaticOpen) {
      console.log(
        "  ⚠ «Покажи ми как» DID NOT ANSWER A REAL TOUCH — opened programmatically so the card " +
          "below can still be measured. THAT IS A BUG ON THE SCREEN, not a harness detail.",
      );
      openedTutorial = false;
    }
    await sleep(900);
  }
  await shot("04-tutorial");
  const tutorial = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((d) =>
      /^Стъпка\s\d+\sот\s\d+/.test(d.getAttribute("aria-label") || ""),
    );
    if (!dialog) return { present: false };
    const cardEl = dialog.firstElementChild;
    const r = cardEl.getBoundingClientRect();
    const cta = [...dialog.querySelectorAll("button")].find((b) => /^Разбрах/.test((b.textContent || "").trim()));
    const cr = cta?.getBoundingClientRect() ?? null;
    return {
      present: true,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      card: {
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        scrollH: cardEl.scrollHeight, clientH: cardEl.clientHeight,
        scrolls: cardEl.scrollHeight > cardEl.clientHeight + 1,
        overflowY: getComputedStyle(cardEl).overflowY,
      },
      backdropScrolls: dialog.scrollHeight > dialog.clientHeight + 1,
      cta: cr
        ? {
            text: (cta.textContent || "").trim(),
            x: Math.round(cr.x), y: Math.round(cr.y),
            w: Math.round(cr.width), h: Math.round(cr.height),
            belowFoldPx: Math.round(cr.bottom - window.innerHeight),
            onScreen: cr.top >= -0.5 && cr.bottom <= window.innerHeight + 0.5,
            position: getComputedStyle(cta.parentElement).position,
          }
        : null,
    };
  });
  if (tutorial.present) {
    console.log(
      `  I4a · card ${tutorial.card.w}×${tutorial.card.h} in ${tutorial.viewport.w}×${tutorial.viewport.h} · ` +
        `card scrolls=${tutorial.card.scrolls} (overflow-y:${tutorial.card.overflowY}) · backdrop scrolls=${tutorial.backdropScrolls}`,
    );
    console.log(
      tutorial.cta
        ? `    «${tutorial.cta.text}» ${tutorial.cta.w}×${tutorial.cta.h} @${tutorial.cta.x},${tutorial.cta.y} · ` +
            `on screen = ${tutorial.cta.onScreen ? "YES ✓" : `NO ✖ (${tutorial.cta.belowFoldPx} px below the fold)`} · row position=${tutorial.cta.position}`
        : "    ✖ no «Разбрах» button found",
    );
  } else {
    console.log(`  I4a · tutorial did not open (tap hit=${openedTutorial}) — nothing measured`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // I15 — THE MIRROR CHIPS, ON THE STEP THAT ASKS FOR THEM.
  //
  // Step 1 (`adjust-seat`) is an INFO step with no hotspots, so no chip renders
  // and „0 chips off-canvas" would be a vacuous pass. Step 2 IS `adjust-mirrors`
  // — the step whose chips §L10 photographed at x −76 and y −83 — so the probe
  // advances one step and looks again. The confirm is programmatic and said so:
  // reaching step 2 is not the row being measured.
  // ══════════════════════════════════════════════════════════════════════════
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('[role="dialog"] button, [data-hud="predrive-checklist"] button')) {
      const t = (b.textContent || "").trim();
      if (/^Разбрах/.test(t) || t === "Потвърди") {
        b.click();
        return;
      }
    }
  });
  await sleep(1400);
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('[data-hud="predrive-checklist"] button')) {
      if ((b.textContent || "").trim() === "Потвърди") {
        b.click();
        return;
      }
    }
  });
  await sleep(2200);
  await shot("05-step2");
  const step2 = await page.evaluate(() => {
    const chips = [];
    for (const el of document.querySelectorAll("div")) {
      const t = (el.textContent || "").trim();
      if (!/^🖱\s*(Щракни|Задръж)/.test(t)) continue;
      if (el.querySelector("div")) continue; // the innermost box only
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue;
      chips.push({
        text: t.slice(0, 40),
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        off: r.left < -0.5 || r.top < -0.5 || r.right > window.innerWidth + 0.5 || r.bottom > window.innerHeight + 0.5,
      });
    }
    const panel = document.querySelector('[data-hud="predrive-checklist"]');
    const step = panel
      ? ([...panel.querySelectorAll("strong")].map((s) => (s.textContent || "").trim())[0] ?? null)
      : null;
    const looks = panel
      ? [...panel.querySelectorAll("button")]
          .map((b) => (b.textContent || "").trim())
          .filter((t) => t.startsWith("👁"))
      : [];
    return { chips, step, looks };
  });
  console.log(
    `  I15 · step now = «${step2.step ?? "?"}» · chips=${step2.chips.length} · off-canvas=${step2.chips.filter((c) => c.off).length} · head-turns offered=[${step2.looks.join(" | ")}]`,
  );
  for (const c of step2.chips) console.log(`    «${c.text}» ${c.w}×${c.h} @${c.x},${c.y}${c.off ? " ✖ OFF-CANVAS" : ""}`);

  rows.push({
    device: device.id,
    gate,
    card,
    step2,
    captions,
    chips,
    menu,
    recall: !!recall,
    sheet,
    tutorial,
    tutorialNeededProgrammaticOpen,
    edge,
  });
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/rows.json`, JSON.stringify(rows, null, 2));

// ── THE VERDICT TABLE ────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(94)}\nSUMMARY — every row names the §I row it closes\n${"=".repeat(94)}`);
const pad = (s, n) => String(s).padEnd(n);
console.log(
  `${pad("device", 30)}${pad("canvas", 12)}${pad("body", 6)}${pad("no✕", 6)}${pad("recall", 8)}${pad("I4a", 6)}${pad("I4b", 6)}${pad("I12", 6)}${pad("I13", 6)}${pad("I14", 8)}${pad("I15", 6)}${pad("EDGE", 8)}`,
);
for (const r of rows) {
  if (r.refused) {
    console.log(`${pad(r.device, 30)}REFUSED — no live canvas`);
    continue;
  }
  const capBad = r.captions.filter((c) => c.offViewport || c.clipsOwnText).length;
  const menuBad = r.menu.rows.filter((x) => x.h < 44).length;
  const sheetBad = (r.sheet.buttons ?? []).filter((x) => x.h < 44).length;
  console.log(
    pad(r.device, 30) +
      pad(`${r.gate.canvas.w}×${r.gate.canvas.h}`, 12) +
      pad(r.card.bodyPresent ? "YES" : "no", 6) +
      pad(r.card.dismissPresent ? "✖" : "✓", 6) +
      pad(r.recall ? "✓" : "✖", 8) +
      pad(r.tutorial.present ? (r.tutorial.cta?.onScreen ? "✓" : "✖") : "-", 6) +
      pad(r.sheet.autoModal ? "✖" : "✓", 6) +
      pad(r.sheet.action && /^☝/.test(r.sheet.action) ? "✓" : "✖", 6) +
      pad(capBad === 0 ? "✓" : `✖${capBad}`, 6) +
      pad(menuBad + sheetBad === 0 ? "✓" : `✖${menuBad + sheetBad}`, 8) +
      pad(
        (r.step2?.chips?.length ?? 0) === 0
          ? "n/a"
          : r.step2.chips.filter((c) => c.off).length === 0
            ? "✓"
            : `✖${r.step2.chips.filter((c) => c.off).length}`,
        6,
      ) +
      pad(r.edge.pastCount + r.edge.clippedCount === 0 ? "✓" : `✖${r.edge.pastCount}/${r.edge.clippedCount}`, 8),
  );
}
console.log(`\nrows.json + screenshots → ${OUT}`);
