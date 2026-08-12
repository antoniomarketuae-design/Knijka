// -----------------------------------------------------------------------------
// insets.mjs — THE NOTCH, MODELLED. A device profile that does not model the
// cutout is not modelling the device.
//
// THE DEFECT THIS FILE CLOSES (the eighth instrument defect).
// Playwright's WebKit is the DESKTOP WebKit port. It has no camera housing and
// no home indicator, so `env(safe-area-inset-*)` resolves to 0 there no matter
// what viewport, user agent or `isMobile` flag the context was built with. The
// app ships `viewportFit: "cover"`, which on a real iPhone hands the page the
// whole display and makes those four values NON-zero — and globals.css pays the
// inset back on <body> (`padding-left/right/bottom: env(safe-area-inset-*)`).
//
// Consequence, stated plainly: EVERY mobile number this project has ever
// produced — every fold sweep, every screen-share percentage, every „20 of 20"
// — was measured on a phone with no notch and no home indicator. On the
// founder's iPhone 16 that is 34px of height in portrait and 118px of WIDTH
// plus 21px of height in landscape that the measurement never charged. Parity
// was won by exactly the margin the insets eat.
//
// WHAT THIS DOES ABOUT IT. env() cannot be given a value from outside the
// engine — there is no Playwright, CDP or WebKit-remote API for it. So the next
// honest thing: every place the AUTHORED CSS asks for `env(safe-area-inset-X)`
// is rewritten, in the page, to the profile's real number for X, BEFORE the
// document's first layout. Two mechanisms, because the app uses both:
//
//   * CSSOM      — every rule in every stylesheet (including nested rules,
//                  @media/@supports/@layer groups and adoptedStyleSheets) has
//                  its declarations rewritten IN PLACE, so specificity, order
//                  and the cascade are exactly what the app authored.
//   * inline     — React writes `style={{paddingLeft:"calc(1rem + env(...))"}}`
//                  on the topbar, the drawer and the skip link; a style
//                  ATTRIBUTE beats every stylesheet, so those are rewritten too
//                  and re-rewritten whenever React puts them back.
//
// WHAT IT IS NOT. It does not make `env()` itself return a number: a probe that
// asks the engine still gets 0, and every report prints BOTH („engine env() = 0,
// emulated = 59/0/34/0"). Anything authored with a hard-coded pixel that HAPPENS
// to equal an inset is unaffected, as it should be — this substitutes values,
// it does not invent geometry.
//
// WHAT IS AND IS NOT IN REACH — 2026-08-12, written down because a fix was
// deliberately shaped around it. The rewrite reaches CUSTOM PROPERTIES too:
// `walkInline` scans `[style*="safe-area-inset"]` and `CSSStyleDeclaration`
// enumerates `--custom` names, so a React inline style like
// `["--sim-touch-floor"]: "calc(… + env(safe-area-inset-bottom,0px) + …)"`
// IS substituted. Verified on the deployed product: it came back as
// `… + 21px + …` on iPhone 16 landscape and `+ 34px` in portrait
// (tools/mobile/wave6-edges.mjs, row I11, field `touchFloorWasEmulated`).
//
// What is NOT in reach is any inset a component computes in JAVASCRIPT — the
// engine's own `env()` is 0 here, so such a number is 21–34 px short and the
// harness cannot tell. That is the rule the sim layout now follows on purpose:
// published lengths stay AUTHORED CSS. If a future fix has to compute an inset
// in JS, it needs a new mechanism here first, or the next sweep reports green
// on a band it mis-measured — which is how five sweeps came back green on a
// screen the founder could see was broken.
//
// AND IT MUST BE ABLE TO FAIL. An emulation that silently rewrites nothing is
// indistinguishable from a phone with no notch — which is the exact shape of
// the defect it exists to close. So the install COUNTS what it rewrote and
// `assertInsetsApplied()` refuses a page where the count is zero or where the
// body's own padding did not move. If that assertion ever passes on an app that
// stopped using env(), the harness has gone blind, not the app gone healthy.
// -----------------------------------------------------------------------------

/**
 * WHICH SIDE THE NOTCH IS ON, IN LANDSCAPE — a real question with a
 * conservative answer.
 *
 * Held sideways the cutout is on ONE physical side and which one depends on
 * the direction you rotated. iOS's own reported values are symmetric (both
 * `safe-area-inset-left` and `-right` come back as the inset, so a page laid
 * out between them is centred rather than shifted), and that is also what
 * `devices.mjs` has asserted since it was written.
 *
 * The two are not the same measurement, so both are available and the run says
 * which it used:
 *   symmetric  59 left AND 59 right — what iOS publishes, 118px of width gone.
 *              THE DEFAULT, because it is the harder case: any layout that fits
 *              here fits either single-sided rotation, which has 59px more room.
 *   left       the cutout to the left  — 59 left, 0 right.
 *   right      the cutout to the right — 0 left, 59 right.
 *
 * Portrait is unaffected by rotation.
 */
import { contextOptions } from "./devices.mjs";

export const ROTATIONS = ["symmetric", "left", "right"];

/**
 * The insets to emulate for a profile.
 *
 * `none` is the OLD behaviour — every historical number in this repo was taken
 * this way — and it is kept only so a run can reproduce one deliberately.
 *
 * @param {{id:string,safeArea:{top:number,right:number,bottom:number,left:number},orientation:string}} device
 * @param {{mode?: "real"|"none", rotation?: "symmetric"|"left"|"right"}} [options]
 */
export function insetsFor(device, options = {}) {
  const mode = options.mode ?? "real";
  const rotation = options.rotation ?? "symmetric";
  if (mode !== "real" && mode !== "none") {
    throw new Error(`[mobile-harness] insets mode must be real|none — got ${JSON.stringify(mode)}`);
  }
  if (!ROTATIONS.includes(rotation)) {
    throw new Error(
      `[mobile-harness] rotation must be one of ${ROTATIONS.join(", ")} — got ${JSON.stringify(rotation)}`,
    );
  }
  if (mode === "none") {
    return { mode, rotation, top: 0, right: 0, bottom: 0, left: 0, says: "env(safe-area-inset-*) left at 0 — A PHONE WITH NO NOTCH AND NO HOME INDICATOR" };
  }
  const sa = device.safeArea;
  let left = sa.left;
  let right = sa.right;
  if (device.orientation === "landscape" && rotation !== "symmetric") {
    const side = Math.max(sa.left, sa.right);
    left = rotation === "left" ? side : 0;
    right = rotation === "right" ? side : 0;
  }
  return {
    mode,
    rotation,
    top: sa.top,
    right,
    bottom: sa.bottom,
    left,
    says:
      `env(safe-area-inset-*) emulated at t${sa.top} r${right} b${sa.bottom} l${left}` +
      (device.orientation === "landscape" ? ` (rotation: ${rotation})` : ""),
  };
}

/**
 * Replace every `env(safe-area-inset-…)` in a CSS value with the given pixels.
 *
 * A SCANNER, NOT A REGEX, because the fallback argument nests: this app ships
 * `env(safe-area-inset-left, 0px)` and `calc(1rem + env(safe-area-inset-bottom))`
 * today and a `var()` fallback tomorrow, and a regex that stops at the first
 * `)` turns `calc(1rem + env(safe-area-inset-bottom, var(--x)))` into a syntax
 * error — which the CSSOM then DROPS SILENTLY, i.e. the declaration disappears
 * and the harness measures a layout with less padding than either phone has.
 *
 * Returns the same string when there is nothing to do, so callers can use
 * identity to decide whether to write back.
 *
 * @param {string} value
 * @param {{top:number,right:number,bottom:number,left:number}} inset
 */
export function rewriteEnv(value, inset) {
  if (typeof value !== "string" || value.indexOf("safe-area-inset") === -1) return value;
  let out = "";
  let i = 0;
  while (i < value.length) {
    const at = value.toLowerCase().indexOf("env(", i);
    if (at === -1) {
      out += value.slice(i);
      break;
    }
    // Only a real function token — `myenv(` must not match.
    const prev = at > 0 ? value[at - 1] : "";
    if (/[-\w]/.test(prev)) {
      out += value.slice(i, at + 4);
      i = at + 4;
      continue;
    }
    let depth = 1;
    let j = at + 4;
    for (; j < value.length && depth > 0; j += 1) {
      if (value[j] === "(") depth += 1;
      else if (value[j] === ")") depth -= 1;
    }
    const inner = value.slice(at + 4, depth === 0 ? j - 1 : value.length);
    const name = inner.split(",")[0].trim().toLowerCase();
    const side = /^safe-area-inset-(top|right|bottom|left)$/.exec(name);
    out += value.slice(i, at);
    if (side) {
      out += `${inset[side[1]]}px`;
    } else {
      out += value.slice(at, j);
    }
    i = j;
  }
  return out;
}

/**
 * The page-side agent, as a function so `context.addInitScript` can serialise
 * it. Runs at document-start in every frame, before the app's first script and
 * before the first layout.
 *
 * It keeps working after that: Next's dev server injects stylesheets late, and
 * React rewrites inline style attributes on every render, so a one-shot pass
 * would rewrite the shell and then have it put straight back.
 *
 * @param {{inset:{top:number,right:number,bottom:number,left:number}, source:string}} config
 */
function agent(config) {
  const inset = config.inset;
  const state = {
    inset,
    declarations: 0, // CSS declarations rewritten
    inlineDeclarations: 0, // style="" properties rewritten
    sheets: 0, // stylesheets successfully walked
    unreadableSheets: 0, // cross-origin / not-yet-loaded
    passes: 0,
  };
  window.__knijkaInsets = state;

  const rewrite = (value) => {
    if (typeof value !== "string" || value.indexOf("safe-area-inset") === -1) return value;
    let out = "";
    let i = 0;
    const lower = value.toLowerCase();
    while (i < value.length) {
      const at = lower.indexOf("env(", i);
      if (at === -1) {
        out += value.slice(i);
        break;
      }
      const prev = at > 0 ? value[at - 1] : "";
      if (/[-\w]/.test(prev)) {
        out += value.slice(i, at + 4);
        i = at + 4;
        continue;
      }
      let depth = 1;
      let j = at + 4;
      for (; j < value.length && depth > 0; j += 1) {
        if (value[j] === "(") depth += 1;
        else if (value[j] === ")") depth -= 1;
      }
      const innerEnd = depth === 0 ? j - 1 : value.length;
      const name = value.slice(at + 4, innerEnd).split(",")[0].trim().toLowerCase();
      const m = /^safe-area-inset-(top|right|bottom|left)$/.exec(name);
      out += value.slice(i, at);
      out += m ? inset[m[1]] + "px" : value.slice(at, j);
      i = j;
    }
    return out;
  };

  const doDeclaration = (style) => {
    // `style.cssText` is the cheap gate: iterating every declaration of every
    // rule in a Tailwind build is tens of thousands of string reads per pass.
    if (!style || !style.cssText || style.cssText.indexOf("safe-area-inset") === -1) return;
    for (let i = style.length - 1; i >= 0; i -= 1) {
      const prop = style.item(i);
      const value = style.getPropertyValue(prop);
      const next = rewrite(value);
      if (next !== value) {
        style.setProperty(prop, next, style.getPropertyPriority(prop));
        state.declarations += 1;
      }
    }
  };

  const walkRules = (rules) => {
    if (!rules) return;
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      // BOTH, never either/or. CSS nesting gave plain style rules a (usually
      // empty) `cssRules` list, so the shape `if (rule.cssRules) { recurse;
      // continue; }` skips every style rule in a modern stylesheet — that exact
      // mistake reported this app's entire landscape column as unprotected once
      // already (see the stability probe's notes).
      if (rule.style) doDeclaration(rule.style);
      if (rule.cssRules) walkRules(rule.cssRules);
    }
  };

  // A SHEET IS WALKED ONCE PER SHAPE, NOT ONCE PER PASS. The belt-and-braces
  // chain below fires ~40 times, and this app's Tailwind build is tens of
  // thousands of rules; `style.cssText` is a fresh serialisation per rule, so
  // an unmemoised re-walk costs hundreds of thousands of string builds on the
  // same main thread the page is trying to lay out on. That is the instrument
  // inside the number again — the settling time the sweep then measures would
  // be partly this agent's.
  //
  // The key is the rule COUNT: a stylesheet that grew (Next dev appends, HMR
  // replaces) is re-walked in full; one that did not is skipped. Declarations
  // are not mutated in place by anything in this app, and the rewrite itself is
  // idempotent (it removes the `safe-area-inset` token it matches on), so a
  // skipped sheet cannot be a missed rewrite.
  const walked = new WeakMap();
  const walkSheet = (sheet) => {
    let rules = null;
    try {
      rules = sheet.cssRules;
    } catch {
      state.unreadableSheets += 1; // cross-origin
      return;
    }
    if (!rules) return; // <link> not loaded yet — a later pass gets it
    if (walked.get(sheet) === rules.length) return;
    if (!walked.has(sheet)) state.sheets += 1;
    walked.set(sheet, rules.length);
    walkRules(rules);
  };

  const walkInline = (root) => {
    if (!root || !root.querySelectorAll) return;
    const scan = (el) => {
      const attr = el.getAttribute && el.getAttribute("style");
      if (!attr || attr.indexOf("safe-area-inset") === -1) return;
      const before = state.declarations;
      doDeclaration(el.style);
      state.inlineDeclarations += state.declarations - before;
      state.declarations = before;
    };
    if (root.getAttribute) scan(root);
    const found = root.querySelectorAll('[style*="safe-area-inset"]');
    for (let i = 0; i < found.length; i += 1) scan(found[i]);
  };

  const pass = () => {
    state.passes += 1;
    const sheets = document.styleSheets;
    for (let i = 0; i < sheets.length; i += 1) walkSheet(sheets[i]);
    const adopted = document.adoptedStyleSheets;
    if (adopted) for (let i = 0; i < adopted.length; i += 1) walkSheet(adopted[i]);
    walkInline(document.documentElement);
    if (document.documentElement) {
      document.documentElement.dataset.saEmulated = [inset.top, inset.right, inset.bottom, inset.left].join(",");
      document.documentElement.dataset.saRewrites = String(state.declarations + state.inlineDeclarations);
    }
  };

  const start = () => {
    pass();
    // Stylesheets and inline styles both arrive later than document-start: Next
    // dev streams <style> tags in, and React re-renders put the shell's own
    // `style=""` back. A MutationObserver callback is a microtask, so a rewrite
    // triggered by an insertion still lands BEFORE the next rendering
    // opportunity — the app never lays out with the app's env() and this
    // harness's numbers in the same frame.
    const observer = new MutationObserver((records) => {
      let touched = false;
      for (const r of records) {
        if (r.type === "attributes") {
          walkInline(r.target);
          touched = true;
          continue;
        }
        for (const node of r.addedNodes) {
          if (node.nodeType !== 1) continue;
          const tag = node.tagName;
          if (tag === "STYLE" || tag === "LINK") {
            touched = true;
            if (tag === "LINK") node.addEventListener("load", () => pass(), { once: true });
          } else {
            walkInline(node);
          }
        }
      }
      if (touched) pass();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    document.addEventListener("DOMContentLoaded", pass);
    window.addEventListener("load", pass);
    // A short belt-and-braces chain for stylesheets that finish loading without
    // firing anything we observed.
    let n = 0;
    const tick = () => {
      pass();
      n += 1;
      if (n < 40) setTimeout(tick, 100);
    };
    setTimeout(tick, 50);
  };

  if (document.documentElement) start();
  else document.addEventListener("readystatechange", start, { once: true });
}

/**
 * Install the emulation on a Playwright BrowserContext. Call BEFORE the first
 * navigation — the whole point is that the app lays out once, with the inset
 * already there, exactly as it does on a phone.
 *
 * @param {import("playwright").BrowserContext} context
 * @param {{top:number,right:number,bottom:number,left:number,mode:string,rotation:string}} inset
 */
export async function installInsetEmulation(context, inset) {
  if (inset.mode === "none") return inset;
  await context.addInitScript(agent, { inset: { top: inset.top, right: inset.right, bottom: inset.bottom, left: inset.left }, source: "tools/mobile/lib/insets.mjs" });
  return inset;
}

/**
 * THE NEGATIVE CONTROL, and it is not optional.
 *
 * A column that has only ever printed „insets: real" is indistinguishable from
 * one whose rewrite matched nothing. So after the page is up, ask it what it
 * actually did: how many declarations moved, and — the load-bearing one — what
 * <body> ended up padded by. globals.css pays the inset back on <body>, so on a
 * real emulation body's padding-bottom IS the bottom inset. If it is 0 while we
 * asked for 34, the instrument is measuring a phone that does not exist and the
 * run must stop rather than publish.
 *
 * Returns the reading either way so the report can print engine-vs-emulated.
 *
 * @param {import("playwright").Page} page
 * @param {{top:number,right:number,bottom:number,left:number,mode:string}} inset
 */
export async function assertInsetsApplied(page, inset) {
  const seen = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;" +
      "padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);" +
      "padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px)";
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const engine = {
      top: Math.round(parseFloat(cs.paddingTop)) || 0,
      right: Math.round(parseFloat(cs.paddingRight)) || 0,
      bottom: Math.round(parseFloat(cs.paddingBottom)) || 0,
      left: Math.round(parseFloat(cs.paddingLeft)) || 0,
    };
    probe.remove();
    const body = getComputedStyle(document.body);
    return {
      engine,
      body: {
        left: Math.round(parseFloat(body.paddingLeft)) || 0,
        right: Math.round(parseFloat(body.paddingRight)) || 0,
        bottom: Math.round(parseFloat(body.paddingBottom)) || 0,
      },
      agent: window.__knijkaInsets
        ? {
            declarations: window.__knijkaInsets.declarations,
            inlineDeclarations: window.__knijkaInsets.inlineDeclarations,
            sheets: window.__knijkaInsets.sheets,
            passes: window.__knijkaInsets.passes,
          }
        : null,
    };
  });
  if (inset.mode === "none") return seen;
  const rewrote = (seen.agent?.declarations ?? 0) + (seen.agent?.inlineDeclarations ?? 0);
  const problems = [];
  if (!seen.agent) problems.push("the init script never ran (window.__knijkaInsets is missing)");
  if (rewrote === 0) problems.push("it rewrote ZERO declarations — no env(safe-area-inset-*) was found in any stylesheet");
  if (seen.body.bottom !== inset.bottom) {
    problems.push(
      `<body> padding-bottom is ${seen.body.bottom}px, expected ${inset.bottom}px ` +
        `(globals.css pays the inset back there — if that rule moved, this emulation is measuring the wrong element)`,
    );
  }
  if (seen.body.left !== inset.left || seen.body.right !== inset.right) {
    problems.push(`<body> side padding is ${seen.body.left}/${seen.body.right}px, expected ${inset.left}/${inset.right}px`);
  }
  if (problems.length > 0) {
    throw new Error(
      `[mobile-harness] SAFE-AREA EMULATION IS NOT ON THIS PAGE — the run would have measured a ` +
        `phone with no notch and called it an iPhone:\n  - ${problems.join("\n  - ")}\n` +
        `  engine env() reports ${JSON.stringify(seen.engine)} (0 is expected: this is the desktop WebKit port)`,
    );
  }
  return seen;
}

/**
 * THE ONE WAY THIS HARNESS OPENS A CONTEXT — so „real insets" is the default
 * everywhere rather than in whichever probe remembered.
 *
 * `insets` defaults to "real". That is deliberate and it is the opposite of how
 * `motion` is handled next door (required, no default): motion has two
 * defensible answers, and this has one. A profile that does not model the notch
 * is not modelling the device, so the phone that exists is what you get unless
 * you say `none` out loud — and either way the caller is expected to print
 * `insetBanner()`.
 *
 * @param {import("playwright").Browser} browser
 * @param {object} device profile from devices.mjs
 * @param {{motion:"reduce"|"allow", insets?:"real"|"none", rotation?:string, colorScheme?:"dark"|"light"}} options
 *        plus anything else Playwright's newContext takes (serviceWorkers, storageState…)
 */
export async function newDeviceContext(browser, device, options) {
  const { motion, insets, rotation, colorScheme, ...rest } = options ?? {};
  const inset = insetsFor(device, { mode: insets ?? "real", rotation });
  const context = await browser.newContext({
    ...contextOptions(device, { motion, colorScheme }),
    ...rest,
  });
  await installInsetEmulation(context, inset);
  context.__knijkaInset = inset;
  return { context, inset };
}

/** One line for the head of every report that used this. */
export function insetBanner(device, inset) {
  if (inset.mode === "none") {
    return `insets: NONE — env(safe-area-inset-*)=0, i.e. a phone with no notch and no home indicator. NO CLAIM ABOUT ${device.label} CAN BE MADE FROM THIS RUN.`;
  }
  return (
    `insets: REAL — ${device.label} t${inset.top} r${inset.right} b${inset.bottom} l${inset.left}` +
    (device.orientation === "landscape" ? ` (rotation ${inset.rotation})` : "") +
    ` substituted into every env(safe-area-inset-*) the app authored; the engine's own env() is still 0.`
  );
}
