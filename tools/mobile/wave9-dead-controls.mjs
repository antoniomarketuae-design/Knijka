// =============================================================================
// wave9-dead-controls.mjs — CAN A THUMB REACH EVERY CONTROL, IN EVERY STATE?
//
// THE RULE THIS PROBE EXISTS TO ENFORCE, stated before the code so it cannot be
// quietly narrowed later:
//
//   ► A STATE YOU DID NOT ENTER IS A STATE YOU DID NOT TEST. „0 dead" measured
//     from a screen with no panel up is the shape of green this project keeps
//     shipping — doc 91 §R2/§W2 was reported green twice from exactly that.
//
// So this walks SIX states on SIX profiles and reports the same three numbers
// for each, from one function, so they can be subtracted:
//
//   A · idle          nothing raised; the driving state
//   B · card up       a peek card in the notification column (not expanded)
//   C · READ OPEN     the instruction panel expanded — §I11 + §W2, the defect
//   D · sheet open    the ⚙ «Кола» car-controls strip
//   E · menu open     «Меню на урока»
//   F · «Напреднал»   the tier just switched, with the sheet still open —
//                     the state that decides whether the delivered clutch
//                     «СЪЕД» is usable at all (doc 91 §M2/§I24)
//
// TWO MEASUREMENTS PER STATE, AND THE SECOND ONE IS THE HONEST ONE:
//
//   DEAD          `document.elementFromPoint` at a control's OWN CENTRE answers
//                 something that is not that control. One point, one verdict —
//                 the number §I11 and §W2 are written in.
//   COVERED px²   the control's box sampled on a 4 px grid, counting the area
//                 that does not answer to the control. A centre that survives
//                 while three quarters of the target is buried is a control the
//                 student misses, and a centre-only census cannot see it.
//
// ⚠ EFFECTIVE OPACITY, NOT COMPUTED OPACITY — this is the instrument error the
// commit before this wave is named after (`d795eab`). A control inside a
// zero-opacity wrapper reads `opacity: 1` on ITSELF. With a card up,
// `[data-hud="touch-controls"]` is `opacity: 0` + `pointer-events: none` — both
// pads are deliberately inert (TouchControls' „ANY HIDE LETS GO OF EVERYTHING")
// and a control nobody can see is NOT a buried control. The opacity is
// multiplied up the ancestor chain and anything at or below 0.05 is excluded
// from both numbers, and COUNTED SEPARATELY as `inert`, so the exclusion is
// visible rather than silent.
//
// THAT EXCLUSION IS ALSO THE POINT OF THE WAVE, so the probe reports the fact it
// turns on: `paused` (the touch root carries `data-sim-touch-inert`) is printed
// for every state. The read mode is allowed to cover the controls ONLY because
// it stops the car; if a future edit removes the pause, state C reports live
// controls under a full-bleed panel and this probe goes red.
//
// GATE, per §O.5, before a single number is believed:
//   hasCanvas === true · a non-zero canvas rect · [data-hud="touch-controls"]
//   mounted. Six probes in this project have reported „0 defects" from a page
//   with no simulator on it.
//
//   node wave9-dead-controls.mjs --base https://…trycloudflare.com
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { webkit } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://icon-undertaken-earliest-zope.trycloudflare.com");
const EMAIL = arg("email", "founder@knijka.ai");
const PASSWORD = arg("password", "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave9-dead`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? only.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -----------------------------------------------------------------------------
// THE PAGE-SIDE CENSUS — one function, serialised into the page, so all six
// states are measured by identical code and can be subtracted from each other.
// -----------------------------------------------------------------------------
const CENSUS = (gridStep) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const effOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden") return 0;
      const v = Number(cs.opacity);
      if (Number.isFinite(v)) o *= v;
      if (o <= 0.001) return 0;
    }
    return Math.round(o * 1000) / 1000;
  };

  const nameOf = (el) => {
    if (!el) return "(nothing)";
    const layer = el.closest?.("[data-sim-overlay-state],[data-hud],[role='toolbar'],[role='menu']");
    const tag = el.tagName?.toLowerCase() ?? "?";
    if (!layer) return tag === "canvas" ? "canvas(road)" : tag;
    return (
      layer.getAttribute("data-hud") ??
      (layer.getAttribute("data-sim-overlay-state")
        ? `overlay:${layer.getAttribute("data-sim-overlay-state")}`
        : (layer.getAttribute("aria-label") ?? layer.getAttribute("role") ?? tag))
    );
  };

  const out = { vw, vh, live: [], inert: [], dead: [], coveredPx2: 0, liveAreaPx2: 0 };
  for (const el of document.querySelectorAll('button,[role="slider"],[role="menuitem"],a[href]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    // Off-screen is a different defect and a different probe; a control that is
    // not on the glass cannot be buried by something that is.
    if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
    const label = (el.getAttribute("aria-label") || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 46);
    const opacity = effOpacity(el);
    const rail = el.closest('[data-hud="top-rail"]') !== null;
    const rec = {
      label,
      rail,
      opacity,
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
    // ⚠ THE d795eab RULE. A control nobody can see is not a buried control.
    if (opacity <= 0.05) {
      out.inert.push(rec);
      continue;
    }

    // ── the CENTRE verdict: the number §I11 and §W2 are written in ──────────
    const cx = Math.round(r.x + r.width / 2);
    const cy = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    const answers = hit !== null && (hit === el || el.contains(hit));

    // ── the AREA verdict: how much of the target does not answer to it ──────
    let samples = 0;
    let buried = 0;
    for (let sx = r.left + gridStep / 2; sx < r.right; sx += gridStep) {
      for (let sy = r.top + gridStep / 2; sy < r.bottom; sy += gridStep) {
        if (sx < 0 || sy < 0 || sx >= vw || sy >= vh) continue;
        samples += 1;
        const h = document.elementFromPoint(Math.round(sx), Math.round(sy));
        if (!(h !== null && (h === el || el.contains(h)))) buried += 1;
      }
    }
    const area = r.width * r.height;
    const covered = samples > 0 ? Math.round((buried / samples) * area) : 0;
    rec.coveredPx2 = covered;
    rec.coveredPct = samples > 0 ? Math.round((buried / samples) * 1000) / 10 : 0;
    out.liveAreaPx2 += Math.round(area);
    out.coveredPx2 += covered;
    out.live.push(rec);
    if (!answers) {
      out.dead.push({ ...rec, onTop: nameOf(hit), onTopText: (hit?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 56) });
    }
  }
  out.coveredPx2 = Math.round(out.coveredPx2);

  const touchRoot = document.querySelector('[data-hud="touch-controls"]');
  const panel = document.querySelector('[data-sim-overlay-state="open"]');
  const peek = document.querySelector('[data-hud="notify-column"]');
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      coversPct: Math.round(((r.width * r.height) / (vw * vh)) * 1000) / 10,
      fullBleed: r.width >= vw - 2,
    };
  };
  out.paused = touchRoot?.getAttribute("data-sim-touch-inert") === "on";
  out.readModeAttr = document.documentElement.dataset.simOverlayRead ?? null;
  out.carSheetAttr = document.documentElement.dataset.simCarSheet ?? null;
  out.panel = box(panel);
  out.peek = box(peek);
  out.overlayKind = (panel ?? peek)?.getAttribute?.("data-sim-overlay") ?? null;
  return out;
};

// ── the taps that put the product into each state ───────────────────────────
const findButton = (page, re, opts = {}) =>
  page.evaluate(
    ({ src, attr }) => {
      const rx = new RegExp(src);
      for (const el of document.querySelectorAll("button")) {
        const hay =
          attr === "label"
            ? el.getAttribute("aria-label") || ""
            : (el.textContent || "").trim();
        if (!rx.test(hay)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        return {
          x: Math.round(r.x + r.width / 2),
          y: Math.round(r.y + r.height / 2),
          label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 60),
        };
      }
      return null;
    },
    { src: re.source, attr: opts.attr ?? "text" },
  );

const tapIf = async (page, hit, settleMs = 900) => {
  if (!hit) return false;
  await page.touchscreen.tap(hit.x, hit.y);
  await sleep(settleMs);
  return true;
};

const results = [];
const browser = await webkit.launch();

// ONE SIGN-IN FOR THE WHOLE SWEEP — /login is rate-limited per IP.
const { context: authCtx } = await newDeviceContext(browser, devices[0], {
  motion: "allow",
  insets: "real",
});
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
console.log(`[w9-dead] signed in ONCE as ${EMAIL} against ${BASE}`);

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    insets: "real",
    storageState,
  });
  const page = await context.newPage();
  const rec = {
    device: device.id,
    orientation: device.orientation,
    viewport: { w: device.width, h: device.height },
    inset: insetBanner(device, inset),
    states: {},
  };
  console.log(`\n${"=".repeat(104)}\n${device.id} ${device.width}x${device.height}\n  ${rec.inset}`);
  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(5200);

    // ── THE GATE ────────────────────────────────────────────────────────────
    const gate = await page.evaluate(() => {
      let best = null;
      for (const c of document.querySelectorAll("canvas")) {
        const r = c.getBoundingClientRect();
        if (getComputedStyle(c).display === "none") continue;
        if (!best || r.width * r.height > best.w * best.h)
          best = {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
      }
      return {
        hasCanvas: !!best,
        canvas: best,
        touchRoot: !!document.querySelector('[data-hud="touch-controls"]'),
      };
    });
    rec.gate = gate;
    console.log(
      `  GATE · hasCanvas ${gate.hasCanvas} ${JSON.stringify(gate.canvas)} · touch root ${gate.touchRoot}`,
    );
    if (!gate.hasCanvas || !gate.canvas || gate.canvas.w < 40 || !gate.touchRoot) {
      rec.fatal = "no live canvas / no touch root — refusing to report numbers";
      console.log(`  FATAL ${rec.fatal}`);
      results.push(rec);
      await context.close();
      continue;
    }

    const record = async (name) => {
      const c = await page.evaluate(CENSUS, 4);
      rec.states[name] = c;
      const railDead = c.dead.filter((d) => d.rail).length;
      console.log(
        `  ${name.padEnd(14)} live ${String(c.live.length).padStart(2)} · inert ${String(
          c.inert.length,
        ).padStart(2)} · DEAD ${String(c.dead.length).padStart(2)} (${railDead} rail) · covered ${c.coveredPx2}px² of ${c.liveAreaPx2}px² · paused ${c.paused} · read=${c.readModeAttr ?? "-"} sheet=${c.carSheetAttr ?? "-"}` +
          (c.panel ? ` · panel ${c.panel.w}x${c.panel.h}@${c.panel.y} ${c.panel.coversPct}%${c.panel.fullBleed ? " FULL-BLEED" : ""}` : ""),
      );
      for (const d of c.dead)
        console.log(`      DEAD «${d.label}» [${d.x},${d.y},${d.w}x${d.h}] ← ${d.onTop} „${d.onTopText}"`);
      return c;
    };

    // ── clear the landing cards ─────────────────────────────────────────────
    for (let i = 0; i < 8; i += 1) {
      const ack = await findButton(page, /^(Разбрах|Продължи|Започни|Ясно|Напред)$/);
      if (!(await tapIf(page, ack, 600))) break;
    }
    // …and let the belt warning age out into the instruction hint, so state C
    // expands the INSTRUCTION panel and not the warning. That confound is the
    // whole subject of the commit before this wave.
    for (let i = 0; i < 20; i += 1) {
      const kind = await page.evaluate(
        () => document.querySelector("[data-sim-overlay]")?.getAttribute("data-sim-overlay") ?? null,
      );
      if (kind === "hint") break;
      await sleep(1000);
    }

    // ── A · idle, and B · card up ───────────────────────────────────────────
    // They are the same frame when a peek is present, so both are recorded and
    // the peek's own box is reported with each: „idle" is honest only if what
    // was on screen is stated.
    await record("A-idle");
    const dismissed = await tapIf(page, await findButton(page, /^Скрий известието/, { attr: "label" }), 900);
    if (dismissed) await record("A-idle-clean");
    // bring the line back for state B / C
    for (let i = 0; i < 12; i += 1) {
      const kind = await page.evaluate(
        () => document.querySelector("[data-sim-overlay]")?.getAttribute("data-sim-overlay") ?? null,
      );
      if (kind !== null) break;
      await sleep(1000);
    }
    await record("B-card-up");

    // ── C · THE READ MODE — §I11 + §W2, the state the wave exists for ───────
    const why = await findButton(page, /^(Защо|Инструкции|Списък|СПИСЪК)$/);
    rec.whyControl = why;
    if (await tapIf(page, why, 1400)) {
      await record("C-read-open");
      await page
        .screenshot({ path: `${OUT}/shots/${device.id}__C-read-open.png`, timeout: 120_000 })
        .catch(() => {});
      await tapIf(page, await findButton(page, /^Затвори$/, { attr: "label" }), 900);
    } else {
      rec.states["C-read-open"] = { skipped: "no «Защо» / «Инструкции» control on screen" };
      console.log("  C-read-open  SKIPPED — no «Защо» control found");
    }

    // ── D · the ⚙ car sheet ─────────────────────────────────────────────────
    const carBtn = await findButton(page, /^Контроли на автомобила$/, { attr: "label" });
    if (await tapIf(page, carBtn, 900)) {
      await record("D-sheet-open");
    } else {
      rec.states["D-sheet-open"] = { skipped: "no «Кола» control on screen" };
    }

    // ── F · «Напреднал», WITH THE SHEET OPEN, because that is where «СЪЕД» is
    // The tier cell cycles НАЧ → НОРМ → НАПР; tap until the label says so.
    let tier = null;
    for (let i = 0; i < 4; i += 1) {
      tier = await findButton(page, /^Ниво на помощта/, { attr: "label" });
      if (tier === null || /Напреднал/.test(tier.label)) break;
      await tapIf(page, tier, 1200);
    }
    rec.tierControl = tier;
    if (tier && /Напреднал/.test(tier.label)) {
      await sleep(1500); // let transmissionSwitchHint() raise its card
      const c = await record("F-advanced");
      c.clutch = await page.evaluate(() => {
        const el = [...document.querySelectorAll("button")].find((b) =>
          /^Съединител/.test(b.getAttribute("aria-label") || ""),
        );
        if (!el) return { present: false };
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          Math.round(r.x + r.width / 2),
          Math.round(r.y + r.height / 2),
        );
        return {
          present: true,
          reachable: hit !== null && (hit === el || el.contains(hit)),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        };
      });
      console.log(`      «СЪЕД» ${JSON.stringify(c.clutch)}`);
      await page
        .screenshot({ path: `${OUT}/shots/${device.id}__F-advanced.png`, timeout: 120_000 })
        .catch(() => {});
    } else {
      rec.states["F-advanced"] = { skipped: "tier cell not reachable (the sheet may not have opened)" };
      console.log("  F-advanced   SKIPPED — tier cell not found");
    }
    // close the sheet again
    await tapIf(page, await findButton(page, /^Затвори контролите$/, { attr: "label" }), 700);

    // ── E · the lesson menu ─────────────────────────────────────────────────
    const menuBtn = await findButton(page, /^Меню на урока$/, { attr: "label" });
    if (await tapIf(page, menuBtn, 1100)) {
      await record("E-menu-open");
    } else {
      rec.states["E-menu-open"] = { skipped: "no «Меню на урока» control on screen" };
    }
  } catch (e) {
    rec.error = String(e?.message || e).split("\n")[0];
    console.log(`  ERROR ${rec.error}`);
  }
  results.push(rec);
  writeFileSync(`${OUT}/dead-controls.json`, JSON.stringify(results, null, 1));
  await context.close();
}

// -----------------------------------------------------------------------------
// THE VERDICT — one table, and the one line that decides whether this shipped.
// -----------------------------------------------------------------------------
console.log(`\n${"=".repeat(104)}\nDEAD CONTROLS PER STATE — the whole sweep\n`);
const STATES = ["A-idle", "A-idle-clean", "B-card-up", "C-read-open", "D-sheet-open", "F-advanced", "E-menu-open"];
console.log(
  `${"profile".padEnd(30)}${STATES.map((s) => s.padEnd(14)).join("")}`,
);
let worstDead = 0;
let worstState = null;
for (const r of results) {
  const cells = STATES.map((s) => {
    const c = r.states?.[s];
    if (!c) return "—".padEnd(14);
    if (c.skipped) return "skip".padEnd(14);
    if (c.dead.length > worstDead) {
      worstDead = c.dead.length;
      worstState = `${r.device} · ${s}`;
    }
    return `${c.dead.length}d/${c.coveredPx2}px²`.padEnd(14);
  });
  console.log(`${(r.device + (r.fatal ? " FATAL" : "")).padEnd(30)}${cells.join("")}`);
}
console.log(
  `\nWORST: ${worstDead} dead control(s)${worstState ? ` — ${worstState}` : ""}.  ` +
    `${worstDead === 0 ? "PASS — every live control answers at its own centre in every state entered." : "FAIL — see the per-state lines above."}`,
);
writeFileSync(`${OUT}/dead-controls.json`, JSON.stringify(results, null, 1));
console.log(`\n[w9-dead] wrote ${OUT}/dead-controls.json`);
await browser.close();
