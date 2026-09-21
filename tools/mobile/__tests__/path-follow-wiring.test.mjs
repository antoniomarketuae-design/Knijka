/**
 * path-follow-wiring.test.mjs — THE pc-path LEG IS CONNECTED, AND ONLY TO ITSELF.
 *
 * Run: node --test tools/mobile/__tests__/path-follow-wiring.test.mjs
 *
 * Modelled on `guidance-wiring.test.mjs` and `reverse-aim-wiring.test.mjs`, and
 * for the same reason: `path-follow.test.mjs` passes with every call into the
 * reducer deleted from the drive path. This file is about WIRING (DESIGN-v2
 * §12.4, W-1 … W-19) and it has two jobs:
 *
 *   · the path leg's blocks exist and are reached (a leg that cannot steer must
 *     not publish a block that says it did);
 *   · NONE of them can be reached from a right or wrong leg — every call site is
 *     attributed to a `STEER_BY === "authored-path"` guard, and the arm gate is
 *     EVALUATED against HEAD's on a random grid, not read.
 *
 * EVERY MATCHER REPORTS WHAT IT CANNOT READ (memory
 * `a-matcher-must-report-what-it-cannot-read.md`): a missing anchor is
 * `unresolved` and the test fails on it; each pin is mutation-checked against a
 * synthetic source in this file.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = resolve(HERE, "..", "lesson-audit.mjs");
const SRC = readFileSync(SELF, "utf8");
const LIB = readFileSync(resolve(HERE, "..", "lib", "path-follow.mjs"), "utf8");
const { REFUSAL_CODES } = await import("../lib/path-follow.mjs");

/* ═══════════════════════ a small scanner that knows what it cannot read ═══════════════════════ */

/**
 * Walk JS source and return every `{ … }` block with its header (the text from
 * the previous statement boundary to the brace), skipping strings, template
 * literals (with nested `${}`), regex literals and comments. `ok: false` when the
 * braces do not balance — the caller must treat that as UNRESOLVED.
 */
export function scanBlocks(src) {
  const blocks = [];
  const stack = [];
  let i = 0;
  let lastSig = "";
  let stmtStart = 0;
  const n = src.length;
  const skipString = (q) => {
    i += 1;
    while (i < n && src[i] !== q) {
      if (src[i] === "\\") i += 1;
      i += 1;
    }
    i += 1;
  };
  const skipTemplate = () => {
    i += 1;
    while (i < n && src[i] !== "`") {
      if (src[i] === "\\") { i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") {
        i += 2;
        let depth = 1;
        while (i < n && depth > 0) {
          const c = src[i];
          // a comment inside `${ … }` may hold an apostrophe (lesson-audit.mjs's debrief writer)
          if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i += 1; continue; }
          if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
          if (c === "'" || c === '"') { skipString(c); continue; }
          if (c === "`") { skipTemplate(); continue; }
          if (c === "{") depth += 1;
          else if (c === "}") depth -= 1;
          i += 1;
        }
        continue;
      }
      i += 1;
    }
    i += 1;
  };
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i += 1; continue; }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "'" || c === '"') { skipString(c); lastSig = "a"; continue; }
    if (c === "`") { skipTemplate(); lastSig = "a"; continue; }
    if (c === "/" && (lastSig === "" || "(,=:[!&|?{};+-*%<>~^".includes(lastSig) || /\b(return|typeof|case|in|of)$/.test(src.slice(Math.max(0, i - 8), i).trimEnd()))) {
      i += 1;
      let cls = false;
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "[") cls = true;
        else if (src[i] === "]") cls = false;
        else if (src[i] === "/" && !cls) break;
        else if (src[i] === "\n") break;
        i += 1;
      }
      i += 1;
      while (i < n && /[a-z]/.test(src[i])) i += 1;
      lastSig = "a";
      continue;
    }
    if (c === "{") {
      stack.push({ open: i, header: src.slice(stmtStart, i) });
      stmtStart = i + 1;
      lastSig = "{";
      i += 1;
      continue;
    }
    if (c === "}") {
      const b = stack.pop();
      if (!b) return { ok: false, why: `unbalanced } at ${i}`, blocks };
      blocks.push({ ...b, close: i });
      stmtStart = i + 1;
      lastSig = "}";
      i += 1;
      continue;
    }
    if (c === ";") stmtStart = i + 1;
    if (!/\s/.test(c)) lastSig = c;
    i += 1;
  }
  return stack.length ? { ok: false, why: `${stack.length} unclosed {`, blocks } : { ok: true, blocks };
}

const GUARD = /STEER_BY === "authored-path"/;
const HELPER_GUARD = /^\s*\{\s*if \(STEER_BY !== "authored-path"\) return\b/;

/** Comments out of a code fragment, string- and template-aware. */
export function stripCode(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i += 1; out += "\n"; continue; }
    if (c === "/" && text[i + 1] === "*") { const e = text.indexOf("*/", i + 2); i = e < 0 ? text.length : e + 1; out += " "; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      out += c;
      i += 1;
      while (i < text.length && text[i] !== q) { if (text[i] === "\\") { out += text[i]; i += 1; } out += text[i]; i += 1; }
      out += q;
      continue;
    }
    out += c;
  }
  return out;
}

/**
 * The top-level shape of a JS condition: its `&&` conjuncts, and whether `||`, `??`
 * or a ternary appears OUTSIDE every bracket. Strings are skipped; `?.` is not a
 * ternary. `unbalanced` when a closer has no opener (the fragment began inside one).
 */
export function topLevel(cond) {
  const conjuncts = [];
  let depth = 0;
  let start = 0;
  const flags = { or: false, nullish: false, ternary: false, unbalanced: false };
  for (let i = 0; i < cond.length; i++) {
    const c = cond[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i += 1;
      while (i < cond.length && cond[i] !== q) { if (cond[i] === "\\") i += 1; i += 1; }
      continue;
    }
    if ("([{".includes(c)) depth += 1;
    else if (")]}".includes(c)) { depth -= 1; if (depth < 0) { flags.unbalanced = true; depth = 0; } }
    else if (depth === 0) {
      if (c === "&" && cond[i + 1] === "&") { conjuncts.push(cond.slice(start, i)); start = i + 2; i += 1; }
      else if (c === "|" && cond[i + 1] === "|") { flags.or = true; i += 1; }
      else if (c === "?" && cond[i + 1] === "?") { flags.nullish = true; i += 1; }
      else if (c === "?" && !(cond[i + 1] === "." && !/\d/.test(cond[i + 2] ?? ""))) flags.ternary = true;
    }
  }
  conjuncts.push(cond.slice(start));
  return { conjuncts: conjuncts.map((s) => s.trim()), ...flags };
}

const unwrap = (s) => {
  let t = s.trim();
  while (t.startsWith("(") && t.endsWith(")") && !topLevel(t.slice(1, -1)).unbalanced) t = t.slice(1, -1).trim();
  return t;
};

/**
 * THE CONTROLLING-CONDITION TEST (CODE-REVIEW-2 M4). `guard` when the guard token is
 * the WHOLE condition or a TOP-LEVEL `&&` conjunct of it — never negated, never under
 * `||`, `??` or `?:`; `none` when the token is absent; `unresolved` for every other
 * text that carries the token. The v1 test accepted any header CONTAINING the token,
 * so `if (!(STEER_BY === "authored-path" && …))` — a block every ribbon leg runs —
 * attributed an unguarded call inside it as guarded.
 */
export function guardShape(cond, token = 'STEER_BY === "authored-path"') {
  const text = stripCode(cond);
  if (!text.includes(token)) return "none";
  const tl = topLevel(text);
  if (tl.or || tl.nullish || tl.ternary || tl.unbalanced) return "unresolved";
  return tl.conjuncts.some((c) => unwrap(c) === token) ? "guard" : "unresolved";
}

/** `if (COND)` / `else if (COND)` / `while (COND)` headers → COND (and the text after its `)`), else null. */
function ifCondition(text) {
  const m = stripCode(text).match(/^\s*(?:else\s+)?(?:if|while)\s*\(/);
  if (!m) return null;
  const t = stripCode(text);
  let depth = 1;
  let i = m[0].length;
  for (; i < t.length && depth > 0; i++) {
    const c = t[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i += 1;
      while (i < t.length && t[i] !== q) { if (t[i] === "\\") i += 1; i += 1; }
      continue;
    }
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
  }
  if (depth !== 0) return null;
  return { cond: t.slice(m[0].length, i - 1), rest: t.slice(i) };
}

const tokenOf = (guard) => guard.source.replace(/\\(.)/g, "$1");

/**
 * Attribute one call site at `idx`. Innermost scope first:
 *  · its own statement: `if (G …) <call>`, or `G && … ? <call>` / `G && … && <call>` where
 *    nothing between the token and the call is `||`, `??`, `:` or a closer of a bracket
 *    opened before the token, and the token is not negated;
 *  · each enclosing block, innermost out: a FUNCTION opening with
 *    `if (STEER_BY !== "authored-path") return` is guarded; an `if`/`else if`/`while`
 *    header whose CONTROLLING CONDITION passes `guardShape` is guarded; ANY OTHER header
 *    that carries the token is `unresolved`, and the caller fails on it.
 */
export function attribute(src, scan, idx, guard = GUARD) {
  const token = tokenOf(guard);
  const enclosing = scan.blocks.filter((b) => b.open < idx && idx < b.close).sort((a, b) => b.open - a.open);
  // The statement, from code with its comments removed: slice from the innermost block's
  // brace (never mid-comment), strip, then cut at the last statement boundary.
  const from = enclosing.length ? enclosing[0].open + 1 : 0;
  const code = stripCode(src.slice(from, idx));
  const stmtCode = code.slice(Math.max(code.lastIndexOf(";"), code.lastIndexOf("{"), code.lastIndexOf("}")) + 1);
  if (stmtCode.includes(token)) {
    const ic = ifCondition(stmtCode);
    if (ic) {
      if (guardShape(ic.cond, token) === "guard" && !ic.rest.includes(token)) return { guarded: true, by: "statement", header: stmtCode.trim().slice(0, 120) };
      return { guarded: false, unresolved: true, by: null, header: stmtCode.trim().slice(0, 160) };
    }
    const at = stmtCode.lastIndexOf(token);
    const lead = stmtCode.slice(0, at).trimEnd();
    const tail = stmtCode.slice(at);
    const negated = /!\s*\(?\s*$/.test(lead);
    const tl = topLevel(tail);
    const endsRight = /(\?|&&)\s*(await\s+)?\(?\s*$/.test(tail);
    if (!negated && !tl.or && !tl.nullish && !tl.unbalanced && !/:/.test(tail.replace(/\?\.(?!\d)/g, "")) && endsRight) return { guarded: true, by: "statement", header: tail.slice(0, 120) };
    return { guarded: false, unresolved: true, by: null, header: stmtCode.trim().slice(-160) };
  }
  for (const b of enclosing) {
    const header = stripCode(b.header).trim();
    if (/function\b[\s\S]*\)\s*$/.test(header) && HELPER_GUARD.test(src.slice(b.open, b.open + 80))) return { guarded: true, by: "helper", header: header.slice(-80) };
    if (!header.includes(token)) continue;
    const ic = ifCondition(header);
    if (ic && ic.rest.trim() === "" && guardShape(ic.cond, token) === "guard") return { guarded: true, by: "block", header: header.slice(-120) };
    return { guarded: false, unresolved: true, by: null, header: header.slice(-160) };
  }
  return { guarded: false, by: null, header: stmtCode.slice(-160) };
}

const SCAN = scanBlocks(SRC);

/* ═══════════════════════ the matchers' own mutation checks ═══════════════════════ */

describe("§0 the matchers can fail", () => {
  it("the scanner balances lesson-audit.mjs (else every attribution below is UNRESOLVED)", () => {
    assert.equal(SCAN.ok, true, SCAN.why);
    assert.ok(SCAN.blocks.length > 500, `${SCAN.blocks.length} blocks`);
  });

  it("attribute: guarded block, helper, ternary pass; an else branch, an unguarded call and a template brace do not", () => {
    const synth = [
      "async function pathRun(b) {",
      '  if (STEER_BY !== "authored-path") return;',
      "  pathStep(s, o);",
      "}",
      'if (STEER_BY === "authored-path") {',
      "  x = `${'{'}`; pathRun(1);",
      "} else {",
      "  pathRun(2);",
      "}",
      'await (STEER_BY === "authored-path" ? pathRun(3) : wait(3));',
      "pathRun(4);",
      "const re = /[{]/; pathRun(5);",
    ].join("\n");
    const sc = scanBlocks(synth);
    assert.equal(sc.ok, true, sc.why);
    const at = (needle) => attribute(synth, sc, synth.indexOf(needle)).guarded;
    assert.equal(at("pathStep(s, o)"), true);
    assert.equal(at("pathRun(1)"), true);
    assert.equal(at("pathRun(2)"), false, "an else branch of the guard is NOT guarded");
    assert.equal(at("pathRun(3)"), true);
    assert.equal(at("pathRun(4)"), false);
    assert.equal(at("pathRun(5)"), false);
    assert.equal(scanBlocks("if (a) { `${b}` ").ok, false, "unbalanced source is unresolved, never green");
  });

  it("attribute (CODE-REVIEW-2 M4): a header that merely CONTAINS the token is unresolved — negated, ternary, ||, ?? — and a real conjunct passes", () => {
    const T = 'STEER_BY === "authored-path"';
    const blocks = [
      [`if (!(${T} && (await speedNow()) === 0)) {`, false],
      [`if (phase !== "reverse" && (${T} ? pathFollow.atGearChange === true : p.reverseWant !== null && !reverse.armed) && reverse.blocked === null) {`, false],
      [`if ((${T} ? pathFollow.wantStop === true : rollM >= lookM || cappedOut) && phaseTicks >= 1) {`, false],
      [`} else if ((${T} ? pathFollow.segmentDone === true : p.reverseStay === null) || now - phaseAt >= REVERSE_MS) {`, false],
      [`if (exitIsBackwards !== null || (${T} && PATH_PLAN.segments[0].gear === -1)) {`, false],
      [`if (x ?? ${T}) {`, false],
      [`if (${T}) {`, true],
      [`} else if (${T} && pathFollow.atGearChange === true && phase !== "reverse") {`, true],
      [`if ((${T}) && ok) {`, true],
      [`// ${T}\nif (other) {`, false],
    ];
    for (const [header, want] of blocks) {
      const synth = `${header}\n  await pathYield("MUTANT");\n}\n`.replace(/^\} /, "if (q) {} ");
      const sc = scanBlocks(synth);
      assert.equal(sc.ok, true, `${header}: ${sc.why}`);
      const r = attribute(synth, sc, synth.indexOf('pathYield("MUTANT")'));
      assert.equal(r.guarded, want, `${header} → ${JSON.stringify(r)}`);
    }
    // statement-level forms
    const stmts = [
      [`await (${T} && !pathState.done ? pathRun(1) : wait(1));`, "pathRun(1)", true],
      [`if (${T}) g = await pathSelectorHold("R", 1, sChannel);`, "pathSelectorHold(", true],
      [`!(${T}) && pathYield("x");`, "pathYield(", false],
      [`(${T} || other) && pathYield("x");`, "pathYield(", false],
      [`const q = ${T} ? a : pathYield("x");`, "pathYield(", false],
      [`if (${T} || other) pathYield("x");`, "pathYield(", false],
      [`if (!(${T})) pathYield("x");`, "pathYield(", false],
    ];
    for (const [text, needle, want] of stmts) {
      const synth = `${text}\n`;
      const sc = scanBlocks(synth);
      assert.equal(attribute(synth, sc, synth.indexOf(needle)).guarded, want, text);
    }
    // THE THREE MUTANTS CODE-REVIEW-2 MEASURED BLIND, on the real source: red now
    for (const [anchor, label] of [
      ["      if (!reverse.demanded) {\n", "the arm-gate body"],
      ["        if (cappedOut && rollM < lookM) {", "the roll-exit body"],
      ["    await sChannel(false);\n    await throttle(true);\n    for (let i = 0; i < 8; i++) {", "the disarm stop-first body"],
    ]) {
      const at0 = SRC.indexOf(anchor);
      assert.ok(at0 > 0, `unresolved anchor for ${label}`);
      const mutated = `${SRC.slice(0, at0)}      await pathYield("MUTANT");\n${SRC.slice(at0)}`;
      const sc = scanBlocks(mutated);
      assert.equal(sc.ok, true);
      const r = attribute(mutated, sc, mutated.indexOf('pathYield("MUTANT")'));
      assert.equal(r.guarded, false, `an unguarded call in ${label} must not attribute (${JSON.stringify(r)})`);
    }
  });
});

/* ═══════════════════════ W-1 … W-3 the leg literal ═══════════════════════ */

const idxOf = (re, from = 0) => {
  const m = SRC.slice(from).search(re);
  return m < 0 ? -1 : from + m;
};

describe("W-1 … W-3 the leg literal, its refusals and its writers", () => {
  it("W-1 LEG_MODE parse, validation, MODE normalisation, STEER_BY, and every refusal before mkdirSync(OUT)", () => {
    assert.match(SRC, /const \[OUT, SCENARIO, PLATFORM = "mobile", LEG_MODE = "right"\] = process\.argv\.slice\(2\);/);
    assert.match(SRC, /if \(!\["right", "wrong", "path"\]\.includes\(LEG_MODE\)\) \{/);
    assert.match(SRC, /const MODE = LEG_MODE === "wrong" \? "wrong" : "right";/);
    assert.match(SRC, /const STEER_BY = LEG_MODE === "path" \? "authored-path" : LEG_MODE === "right" \? "ribbon" : "none";/);
    const mk = idxOf(/mkdirSync\(OUT, \{ recursive: true \}\);/);
    const exitBack = idxOf(/if \(exitIsBackwards !== null/);
    const plan = idxOf(/const PATH_PLAN = /);
    assert.ok(mk > 0 && exitBack > 0 && plan > 0, "unresolved anchor");
    for (const re of [/refused \(platform\)/, /refused \(folder\)/, /refused \(\$\{error\?\.code \?\? "no-pathref"\}\)/, /unknown leg «/]) {
      const at = idxOf(re);
      assert.ok(at > 0, `unresolved refusal ${re}`);
      assert.ok(at < mk, `${re} after mkdirSync(OUT)`);
    }
    assert.ok(plan < mk && plan < exitBack, "const PATH_PLAN = must precede mkdirSync(OUT) and the exitIsBackwards read (S-3)");
    assert.match(SRC, /mobile-path is not in Slice 1/);
    // mutation: move the binding after the exitIsBackwards read → red
    const moved = SRC.replace(/const PATH_PLAN = PATH_PLAN_RESOLVED;\n/, "").replace(/if \(exitIsBackwards !== null/, "const PATH_PLAN = PATH_PLAN_RESOLVED;\nif (exitIsBackwards !== null");
    assert.ok(moved.search(/const PATH_PLAN = /) > moved.search(/mkdirSync\(OUT, \{ recursive: true \}\);/));
  });

  it("W-2 the folder walk accepts rep-NN and sits inside `if (LEG_MODE === \"path\")` with its header", () => {
    const walk = idxOf(/\.reverse\(\)\s*\n\s*\.find\(\(segment\) => \/__\(pc\|mobile\)-\(right\|wrong\|path\)\$\/\.test\(segment\)\)/);
    const header = idxOf(/folder names no leg/);
    assert.ok(walk > 0 && header > 0, "unresolved");
    const guard = /LEG_MODE === "path"/;
    assert.equal(attribute(SRC, SCAN, walk, guard).guarded, true);
    assert.equal(attribute(SRC, SCAN, header, guard).guarded, true);
    // behaviour of the walk itself on a repeat child
    const segs = "out/w48/frames/sc-park-wall__pc-path/rep-03".split(/[\\/]+/).reverse();
    assert.equal(segs.find((s) => /__(pc|mobile)-(right|wrong|path)$/.test(s)), "sc-park-wall__pc-path");
    // mutation: hoist the header out of the guard → red
    const hoisted = SRC.replace(/if \(LEG_MODE === "path"\) \{\n  if \(PLATFORM !== "pc"\)/, 'console.log("folder names no leg");\nif (LEG_MODE === "path") {\n  if (PLATFORM !== "pc")');
    const sc = scanBlocks(hoisted);
    assert.equal(attribute(hoisted, sc, hoisted.indexOf('console.log("folder names no leg")'), guard).guarded, false);
  });

  it("W-3 the repeat spawn, the headers and the mode writers carry LEG_MODE", () => {
    assert.match(SRC, /spawnSync\(process\.execPath, \[SELF, dir, SCENARIO, PLATFORM, LEG_MODE\]/);
    assert.ok((SRC.match(/mode: LEG_MODE/g) ?? []).length >= 3, "three mode writers");
    assert.ok((SRC.match(/\$\{LEG_MODE\}/g) ?? []).length >= 3, "the headers");
    assert.doesNotMatch(SRC, /spawnSync\(process\.execPath, \[SELF, dir, SCENARIO, PLATFORM, MODE\]/);
  });
});

/* ═══════════════════════ W-4 every call site is attributed ═══════════════════════ */

describe("W-4 every path call site sits behind the guard", () => {
  it("attributes every call; publishes the count; any unattributable site fails", () => {
    const sites = [];
    const patterns = [
      [/\bpathRun\(/g, GUARD],
      [/\bpathStep\(/g, GUARD],
      [/\bpathApply\(/g, GUARD],
      [/\bpathYield\(/g, GUARD],
      [/\bpathActuate\(/g, GUARD],
      [/\bpathObservation\(/g, GUARD],
      [/\bloadPathRef\(/g, /LEG_MODE === "path"/],
      [/\bsteer\([^)]*"path"\)/g, GUARD],
      [/\bpathOnPauseDrain\(/g, GUARD],
      [/\bpathReverseOutcome\(/g, GUARD],
      [/\bpathUncreditedLine\(/g, GUARD],
      [/\bpathSelectorHold\(/g, GUARD],
      [/\bpathArmGateWait\(/g, GUARD],
      // the disarm's landing (path-follow.mjs §10c, 2026-09-17)
      [/\bpathGearProbe\(/g, GUARD],
      [/\bpathDisarmHold\(/g, GUARD],
      [/\bpathDisarmLanding\(/g, GUARD],
      [/\bpathDispatchInOrder\(/g, GUARD],
    ];
    const definitions = /async function (pathRun|pathApply|pathYield|pathActuate|pathSelectorHold|pathGearProbe|pathDisarmHold|pathDisarmLanding|pathDispatchInOrder)\(|function (pathArmGateWait)\(/;
    for (const [re, guard] of patterns) {
      for (const m of SRC.matchAll(re)) {
        const lineStart = SRC.lastIndexOf("\n", m.index) + 1;
        const line = SRC.slice(lineStart, SRC.indexOf("\n", m.index));
        if (definitions.test(line) || /^\s*(\*|\/\/)/.test(line) || /import|from "/.test(line)) continue;
        if (/`[^`]*$/.test(SRC.slice(lineStart, m.index)) && /^[^`]*`/.test(SRC.slice(m.index))) continue; // inside a template string on this line
        const at = attribute(SRC, SCAN, m.index, guard);
        sites.push({ call: m[0], line: SRC.slice(0, m.index).split("\n").length, ...at });
      }
    }
    const bad = sites.filter((s) => !s.guarded);
    console.log(`W-4: ${sites.length} path call site(s) over ${patterns.length} names, ${sites.length - bad.length} attributed, ${sites.filter((s) => s.unresolved).length} unresolved`);
    assert.ok(sites.length >= 15, `only ${sites.length} call sites found — an anchor moved`);
    assert.deepEqual(bad.map((s) => `${s.call} at :${s.line} («${s.header}»)`), []);
  });
});

/* ═══════════════════════ W-5 books ═══════════════════════ */

describe("W-5 the steering books", () => {
  it("names path in the banking ternary, books steering.path under by === \"path\", creates it only on path legs", () => {
    assert.match(SRC, /steerHeldBy === "path" \? steering\.path\.heldMs/);
    assert.match(SRC, /\} else if \(by === "path"\) \{\s*\n\s*steering\.path\.commands \+= 1;/);
    assert.match(SRC, /\.\.\.\(STEER_BY === "authored-path" \? \{ path: \{ commands: 0, heldMs: \{ left: 0, right: 0 \} \} \} : \{\}\),/);
    const ever = [...SRC.matchAll(/steering\.everSteered = true;/g)];
    assert.ok(ever.length >= 1);
    for (const m of ever) {
      const before = SRC.slice(Math.max(0, m.index - 1500), m.index);
      assert.match(before, /by === "trace"/, "everSteered is written only under by === \"trace\"");
      assert.doesNotMatch(before.slice(before.lastIndexOf('by === "trace"')), /by === "path"/);
    }
  });
});

/* ═══════════════════════ W-6 the arm gate, evaluated ═══════════════════════ */

const HEAD_ARM_IF = `if (
      phase !== "reverse" &&
      p.kmh >= 0 &&
      p.kmh <= 1 &&
      p.lawfulWait === null &&
      p.reverseWant !== null &&
      !reverse.armed &&
      // ── THE GATE DOES NOT LATCH — 2026-08-21 ──────────────────────────────
      reverse.blocked === null &&
      reverse.attempted < REVERSE_ARM_BUDGET
    ) {`;

const ARM_RE = /if \(\s*\n\s*phase !== "reverse",?[\s\S]*?\n\s*\) \{/;
const condOf = (ifText) => ifText.replace(/^if \(/, "").replace(/\)\s*\{\s*$/, "").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const compile = (cond) => new Function("phase", "p", "reverse", "pathFollow", "STEER_BY", "REVERSE_ARM_BUDGET", `return (${cond});`);

describe("W-6 the arm gate, by evaluation (N1)", () => {
  const m = SRC.match(ARM_RE);
  it("the gate is matched by the regex HEAD's harness pin uses", () => {
    assert.ok(m, "unresolved: the arm if is not matched");
  });
  const gate = m ? compile(condOf(m[0])) : null;
  const head = compile(condOf(HEAD_ARM_IF));
  const base = (o = {}) => ({
    phase: "roll",
    p: { kmh: 0, lawfulWait: null, reverseWant: null, gear: ["D"] },
    reverse: { armed: true, blocked: null, attempted: 1 },
    pathFollow: { atGearChange: true },
    STEER_BY: "authored-path",
    REVERSE_ARM_BUDGET: 9,
    ...o,
  });
  const run = (g, o) => g(o.phase, o.p, o.reverse, o.pathFollow, o.STEER_BY, o.REVERSE_ARM_BUDGET);

  it("(a) path, three arms: open at R3 and R5 with reverse.armed still true; closed in reverse, without atGearChange, or in «R»", () => {
    assert.ok(gate);
    // poligon: after R1 the flag `reverse.armed` stays true — the R3 and R5 gear changes must still open
    for (const attempted of [1, 2]) assert.equal(run(gate, base({ reverse: { armed: true, blocked: null, attempted } })), true);
    assert.equal(run(gate, base({ phase: "reverse" })), false);
    assert.equal(run(gate, base({ pathFollow: { atGearChange: false } })), false);
    assert.equal(run(gate, base({ p: { kmh: 0, lawfulWait: null, reverseWant: null, gear: ["R"] } })), false);
    assert.equal(run(gate, base({ p: { kmh: 2, lawfulWait: null, reverseWant: null, gear: ["D"] } })), false);
    assert.equal(run(gate, base({ reverse: { armed: true, blocked: null, attempted: 9 } })), false);
    // mutation: `!reverse.armed &&` moved back outside the ternary → (a) red
    const mutated = compile(condOf(m[0]).replace("(STEER_BY", "!reverse.armed && (STEER_BY"));
    assert.equal(run(mutated, base()), false, "the mutation closes R3 — so this assertion can fail");
  });

  it("(b) ribbon and wrong legs: identical to HEAD's condition on a 1,000-state random grid", () => {
    let s = 11;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    for (let i = 0; i < 1000; i++) {
      const o = {
        phase: pick(["roll", "stop", "reverse", "flat"]),
        p: { kmh: pick([-1, 0, 1, 2, 3]), lawfulWait: pick([null, "wait"]), reverseWant: pick([null, "Премести лоста на R"]), gear: pick([["D"], ["R"], [], ["D", "R"]]) },
        reverse: { armed: rnd() < 0.5, blocked: pick([null, "x"]), attempted: Math.floor(rnd() * 11) },
        pathFollow: { atGearChange: rnd() < 0.5 },
        STEER_BY: pick(["ribbon", "none"]),
        REVERSE_ARM_BUDGET: 9,
      };
      assert.equal(run(gate, o), run(head, o), `state ${i}: ${JSON.stringify(o)}`);
    }
    // mutation: drop `!reverse.armed` from the ribbon arm → (b) red
    const mutated = compile(condOf(m[0]).replace(": p.reverseWant !== null && !reverse.armed)", ": p.reverseWant !== null)"));
    const o = base({ STEER_BY: "ribbon", p: { kmh: 0, lawfulWait: null, reverseWant: "R", gear: ["D"] }, reverse: { armed: true, blocked: null, attempted: 1 } });
    assert.notEqual(run(mutated, o), run(head, o));
  });

  it("the stall arm exists", () => {
    assert.match(SRC, /\} else if \(STEER_BY === "authored-path" && pathFollow\.atGearChange === true && phase !== "reverse"\) \{\s*\n[\s\S]{0,300}?pathArmGateWait\(p, now\);/);
  });
});

/* ═══════════════════════ W-7 … W-19 ═══════════════════════ */

const fnBody = (name) => {
  const at = SRC.search(new RegExp(`(async )?function ${name}\\(|const ${name} = (\\(\\(\\)|\\(\\)) =>`));
  if (at < 0) return null;
  const b = SCAN.blocks.filter((x) => x.open > at).sort((x, y) => x.open - y.open)[0];
  return b ? SRC.slice(b.open, b.close + 1) : null;
};

describe("W-7 … W-19", () => {
  it("W-7 pathRun is try { … } finally { await pathYield(", () => {
    const body = fnBody("pathRun");
    assert.ok(body, "unresolved");
    assert.match(body, /try \{[\s\S]*\} finally \{\s*\n\s*await pathYield\(/);
  });

  it("W-8 the idle ternary and the beat conjunct", () => {
    assert.match(SRC, /await timed\("idle", \(\) => \(STEER_BY === "authored-path" && !pathState\.done \? pathRun\(TICK_MS\) : page\.waitForTimeout\(TICK_MS\)\)\);/);
    assert.match(SRC, /&& \(STEER_BY !== "authored-path" \|\| pathFollow\.shutterOk \|\| now - lastFrame >= 3 \* FRAME_MS\)\) \{/);
  });

  it("W-9 the recovery gate excludes the path leg", () => {
    const at = idxOf(/STEER_BY !== "authored-path" &&\s*\n/);
    assert.ok(at > 0, "unresolved");
    assert.match(SRC.slice(at - 400, at + 400), /recover/i);
  });

  it("W-10 path branches at STEERING, tracesSteer, NO PACE TAPE, REVERSE AIM, REVERSE OUTCOME, tracking and the uncredited alarm", () => {
    assert.match(SRC, /if \(STEER_BY === "authored-path"\) note\(`\$\{pathSteeringLine\(steering\.path\)\}/);
    assert.match(SRC, /steering\.tracesSteer = STEER_BY === "authored-path" \? steering\.path\.commands > 0 : steering\.everSteered;/);
    assert.match(SRC, /if \(paceTape === null && STEER_BY === "authored-path"\) \{\s*\n\s*note\(`  \$\{PATH_PACE_LINE\}`\);/);
    assert.match(SRC, /pathReverseLine\(/);
    const outcome = idxOf(/\} else if \(STEER_BY === "authored-path"\) \{\s*\n\s*\/\/ pc-path \(§8\.3\.8\)/);
    const legNull = idxOf(/\} else if \(reverseAim\.legLengthM === null \|\| reverseAim\.ticks === 0\) \{/);
    assert.ok(outcome > 0 && legNull > 0 && outcome < legNull, "REVERSE OUTCOME's path branch precedes the straight-line branch");
    const summarise = idxOf(/guidance\.tracking = summariseTracking\(guidance\.samples\);/);
    const override = idxOf(/guidance\.tracking\.verdict = tw\.word;/);
    const notInvoked = idxOf(/if \(tr\.verdict === "not-invoked"/);
    assert.ok(summarise > 0 && override > summarise && notInvoked > override, "tracking override between summariseTracking and not-invoked");
    assert.match(SRC, /if \(STEER_BY !== "authored-path" && !steering\.everSteered && uncredited\.length\) \{/);
  });

  it("W-11 PATH_TESTIMONY is in the status writer and the STEERED BY headline", () => {
    assert.match(SRC, /mayTestify: PATH_TESTIMONY\.mayTestify,\s*\n\s*mayNotTestify: PATH_TESTIMONY\.mayNotTestify,/);
    assert.match(SRC, /MAY testify: \$\{PATH_TESTIMONY\.mayTestify\.join/);
    assert.match(SRC, /MAY NOT testify: \$\{PATH_TESTIMONY\.mayNotTestify\.join/);
    assert.match(SRC, /steeredByLine\(/);
    assert.match(LIB, /It CANNOT show that the ribbon, the briefing or the glass would lead a student there/);
  });

  it("W-12 no raw keyboard call inside the path helpers; STEER_KEYS unchanged", () => {
    for (const name of ["pathRun", "pathApply", "pathYield", "pathActuate", "pathSelectorHold", "pathDisarmLand", "pathFramesSince"]) {
      const body = fnBody(name);
      assert.ok(body, `unresolved ${name}`);
      assert.doesNotMatch(body, /keyboard\.(down|up|press)\(/, name);
    }
    assert.match(SRC, /const STEER_KEYS = \{ left: "KeyA", right: "KeyD" \};/);
  });

  it("W-13 loadPaceTape, reversePlan and aimEnterLeg return early on a path leg", () => {
    for (const name of ["loadPaceTape", "reversePlan", "aimEnterLeg"]) {
      const body = fnBody(name);
      assert.ok(body, `unresolved ${name}`);
      assert.match(body.slice(0, 900), /STEER_BY === "authored-path"/, name);
    }
    assert.ok((SRC.match(/if \(STEER_BY === "authored-path"\) \{/g) ?? []).length >= 3);
  });

  it("W-14 the path budget expression", () => {
    assert.match(SRC, /STEER_BY === "authored-path"\s*\n\s*\? Math\.max\(DRIVE_BUDGET_MS, \(1\.6 \* \(PATH_PLAN\.durationSec \?\? 0\) \+ 15 \* PATH_PLAN\.reverseSegments \+ 30\) \* 1000\)\s*\n\s*: DRIVE_BUDGET_MS;/);
  });

  it("W-15 the roll branch still ticks the ribbon and leaves the roll through guideLeaveRoll", () => {
    assert.match(SRC, /await timed\("guide", \(\) => guideTick\(p\.kmh, now - t0, now - lastTickAt\)\);/);
    assert.match(SRC, /await guideLeaveRoll\(\);\n\s*phase = "stop";/);
  });

  it("W-16 the wrong-leg gates are unchanged", () => {
    assert.match(SRC, /if \(MODE !== "right"\) \{\s*\n\s*pace\.why =/);
    assert.match(SRC, /if \(MODE !== "right"\) \{\s*\n\s*reverseAim\.why =/);
    assert.match(SRC, /let phase = MODE === "right" \? "roll" : "flat";/);
    assert.ok((SRC.match(/if \(MODE !== "right"\) \{/g) ?? []).length >= 4);
  });

  it("W-17 the selector bursts lift through their own helpers the instant the gear lands (N2)", () => {
    const arm = fnBody("armReverse");
    const disarm = fnBody("disarmReverse");
    assert.ok(arm && disarm, "unresolved");
    assert.match(arm, /await sChannel\(true\);[\s\S]{0,700}?if \(STEER_BY === "authored-path"\) g = await pathSelectorHold\("R", REVERSE_HOLD_MS, sChannel\);\s*\n\s*else \{\s*\n\s*await page\.waitForTimeout\(REVERSE_HOLD_MS\);\s*\n\s*g = await gear\(\);/);
    // THE DISARM LANDS THROUGH path-follow.mjs §10c, AND `pathDisarmLand` IS REACHABLE FROM NOTHING (2026-09-17).
    // This case has pinned three landings in one day. First §10b «W ENCLOSES S» wired into this D hold; then, when §10b
    // was refuted on the product's pedal priority (VehicleSim reads no brake while the throttle is above zero, so its S
    // brakes nothing and its hold drives the car ~4.8 m — path-follow.test.mjs T6.7d), cde40a6's bare `throttle` lift on
    // «D»; now §10c, the re-derivation, proven on a MOVING car in the product frame order (path-disarm.test.mjs T14):
    //  · the D hold lands through `pathDisarmHold(REVERSE_HOLD_MS, attempt === 1 && !stopFirstRan)` — the flag is the
    //    only press known to be the flipping press with the car not moving forward, and the brake's gate depends on it;
    //  · every key of the landing is `pathLandingActions` / `pathLandingHoldActions`, and a braking pair goes through
    //    `pathDispatchInOrder` (S's call started before W's, the two awaited together), never key by key;
    //  · the stop-first loop's dial read IS `pathGearProbe` (no extra round trip) and «D» there lands as the flipping
    //    press, after which attempt 1 presses nothing.
    // `pathDisarmLand` stays declared and never called, passed or aliased; its frame collector `pathFramesSince` is
    // reached only from inside it. Comments are stripped first, so prose cannot satisfy a pin. Every pin is mutation-checked.
    const code = stripCode(disarm);
    const disarmPin = /await throttle\(true\);\s*\n\s*if \(STEER_BY === "authored-path"\) await pathDisarmHold\(REVERSE_HOLD_MS, attempt === 1 && !stopFirstRan\);\s*\n\s*else await page\.waitForTimeout\(REVERSE_HOLD_MS\);\s*\n\s*\}\s*\n\s*await throttle\(false\);/;
    assert.match(code, disarmPin, "the pc-path D hold no longer lands through pathDisarmHold with the flipping-press flag");
    for (const [name, from, to] of [
      ["§10b rewired into the D hold", "await pathDisarmHold(REVERSE_HOLD_MS, attempt === 1 && !stopFirstRan);", 'await pathSelectorHold("D", REVERSE_HOLD_MS, pathDisarmLand);'],
      ["cde40a6's bare lift", "await pathDisarmHold(REVERSE_HOLD_MS, attempt === 1 && !stopFirstRan);", 'await pathSelectorHold("D", REVERSE_HOLD_MS, throttle);'],
      ["every press taken for the flipping press", "pathDisarmHold(REVERSE_HOLD_MS, attempt === 1 && !stopFirstRan)", "pathDisarmHold(REVERSE_HOLD_MS, true)"],
      ["git HEAD 4209dad's fixed REVERSE_HOLD_MS with W down in D", 'if (STEER_BY === "authored-path") await pathDisarmHold(REVERSE_HOLD_MS, attempt === 1 && !stopFirstRan);\n', ""],
    ]) {
      const mutated = code.replace(from, to);
      assert.notEqual(mutated, code, `UNREADABLE: mutation «${name}» found nothing to change — the pin cannot be shown to fail`);
      assert.doesNotMatch(mutated, disarmPin, `mutation «${name}» must break the D-hold pin`);
    }
    const stopFirstPin = /for \(let i = 0; i < 8; i\+\+\) \{\s*\n\s*await page\.waitForTimeout\(600\);\s*\n\s*const read = STEER_BY === "authored-path" \? await pathGearProbe\(\) : null;\s*\n\s*if \(STEER_BY === "authored-path" && read\.gear\.length === 1 && read\.gear\[0\] === "D"\) \{\s*\n\s*await pathDisarmLanding\(read, true\);\s*\n\s*landedStopFirst = true;\s*\n\s*break;\s*\n\s*\}\s*\n\s*const v = read !== null \? read\.dial : await speedNow\(\);\s*\n\s*if \(v === 0 \|\| v < 0\) break;/;
    assert.match(code, stopFirstPin, "the stop-first loop no longer reads the cluster in its dial read and lands «D» as the flipping press");
    for (const [name, from, to] of [
      ["the stop-first flip landed as a re-press", "await pathDisarmLanding(read, true);", "await pathDisarmLanding(read, false);"],
      ["an extra poll before the dial read", "await page.waitForTimeout(600);\n", "await page.waitForTimeout(600);\n      await pathGearProbe();\n"],
    ]) {
      const mutated = code.replace(from, to);
      assert.notEqual(mutated, code, `UNREADABLE: mutation «${name}» found nothing to change`);
      assert.doesNotMatch(mutated, stopFirstPin, `mutation «${name}» must break the stop-first pin`);
    }
    assert.match(code, /const rest = landedStopFirst \? 0 : await speedNow\(\);/, "the rest-in-R test no longer steps aside for a stop-first landing");
    assert.match(code, /const pressAgain = !\(landedStopFirst && attempt === 1\);\s*\n\s*if \(pressAgain\) \{\s*\n\s*await throttle\(true\);/, "attempt 1 presses W again after a stop-first landing — D's accelerator on a car just braked to rest");
    // THE LANDING EXECUTES THE PLANNERS AND DECIDES NOTHING; A BRAKING PAIR IS DISPATCHED IN ORDER
    const landingBody = stripCode(fnBody("pathDisarmLanding") ?? "");
    assert.ok(landingBody, "UNREADABLE: pathDisarmLanding");
    const landingPin = /const land = pathLandingActions\(\{ held: \{ W: holdW, S: holdS, steer: steerHeld \}, read, firstPress \}\);\s*\n\s*if \(land\.dispatch === "in-order"\) await pathDispatchInOrder\(land\.actions\);\s*\n\s*else await pathActuate\(land\.actions\);[\s\S]*?hold = pathLandingHoldActions\(\{ held: \{ W: holdW, S: holdS, steer: steerHeld \}, v: r\.v, gear: r\.gear, sinceLandS: \(Date\.now\(\) - t0\) \/ 1000 \}\);\s*\n\s*await pathActuate\(hold\.actions\);/;
    assert.match(landingBody, landingPin);
    assert.doesNotMatch(landingBody, /\b(throttle|brake|sChannel)\(|keyboard/, "pathDisarmLanding presses a key itself");
    assert.doesNotMatch(landingBody.replace("await pathDispatchInOrder(land.actions);", "await pathActuate(land.actions);"), landingPin, "mutation: the braking pair awaited key by key must break the landing pin");
    const dispatchBody = stripCode(fnBody("pathDispatchInOrder") ?? "");
    const dispatchPin = /^\{\s*if \(STEER_BY !== "authored-path"\) return;\s*\n\s*const sent = \[\];\s*\n\s*for \(const a of actions\) \{\s*\n\s*if \(a\.ch === "S-hold"\) sent\.push\(sChannel\(a\.down\)\);\s*\n\s*else if \(a\.ch === "W"\) sent\.push\(throttle\(a\.down\)\);\s*\n\s*else throw new Error\([^\n]*\);\s*\n\s*\}\s*\n\s*await Promise\.all\(sent\);\s*\n\}$/;
    assert.match(dispatchBody, dispatchPin, "pathDispatchInOrder no longer STARTS every call in order and awaits them together");
    for (const [name, from, to] of [
      ["each call awaited before the next", "sent.push(sChannel(a.down));", "sent.push(await sChannel(a.down));"],
      ["the channels unguarded", "else throw new Error(", "else void ("],
    ]) {
      const mutated = dispatchBody.replace(from, to);
      assert.notEqual(mutated, dispatchBody, `UNREADABLE: mutation «${name}» found nothing to change`);
      assert.doesNotMatch(mutated, dispatchPin, `mutation «${name}» must break the dispatch pin`);
    }
    const dHold = stripCode(fnBody("pathDisarmHold") ?? "");
    assert.match(dHold, /while \(Date\.now\(\) - t0 < holdMs\) \{\s*\n\s*await page\.waitForTimeout\(ARM_POLL_MS\);\s*\n\s*const r = await pathGearProbe\(\);\s*\n\s*if \(r\.gear\.length === 1 && r\.gear\[0\] === "D"\) \{\s*\n\s*await pathDisarmLanding\(r, firstPress\);\s*\n\s*return r\.gear;/, "pathDisarmHold no longer polls the cluster with the speed and lands on «D»");
    assert.match(dHold, /const r = await pathGearProbe\(\);\s*\n\s*if \(r\.gear\.length === 1 && r\.gear\[0\] === "D"\) await pathDisarmLanding\(r, firstPress\);\s*\n\s*return r\.gear;\s*\n\}$/, "pathDisarmHold's final read no longer lands a late «D»");
    const probeBody = fnBody("pathGearProbe") ?? "";
    assert.match(probeBody, /const p = window\.__camProbe;[\s\S]*?v: p && Number\.isFinite\(p\.speedKmh\) \? p\.speedKmh : null, dial \}/, "pathGearProbe no longer reads the probe's speed (null when unread) and the dial in the same evaluate");
    assert.match(probeBody, /\.catch\(\(\) => \(\{ gear: \[\], v: null, dial: -1 \}\)\);/, "an unreadable page must read as no cluster, no speed, no dial — never a speed that brakes");
    const stripped = stripCode(SRC);
    /** every reference to `name` in comment-stripped source that is not its own `async function` declaration */
    const refsTo = (src, name) => [...src.matchAll(new RegExp(`\\b${name}\\b`, "g"))].filter((m) => !src.slice(0, m.index).endsWith("async function "));
    assert.equal((stripped.match(/async function pathDisarmLand\(/g) ?? []).length, 1, "UNREADABLE: pathDisarmLand's declaration is not exactly one `async function pathDisarmLand(` — the no-reference pin cannot be read");
    const landRefs = (src) => refsTo(src, "pathDisarmLand").map((m) => src.slice(Math.max(0, m.index - 70), m.index + 40).replace(/\s+/g, " "));
    assert.deepEqual(landRefs(stripped), [], "pathDisarmLand is referenced — the landing that drives the car forward in the product is reachable again");
    for (const [name, mutated] of [
      ["passed to the D hold", stripped.replace("await pathDisarmHold(REVERSE_HOLD_MS, attempt === 1 && !stopFirstRan);", 'await pathSelectorHold("D", REVERSE_HOLD_MS, pathDisarmLand);')],
      ["called directly", stripped.replace("await throttle(false);", "await pathDisarmLand(); await throttle(false);")],
      ["aliased", `${stripped}\nconst landing = pathDisarmLand;\n`],
    ]) {
      assert.notEqual(mutated, stripped, `UNREADABLE: mutation «${name}» found nothing to change`);
      assert.ok(landRefs(mutated).length >= 1, `mutation «${name}» must be seen as a reference to pathDisarmLand`);
    }
    // …AND THE BENCH RUNS THE HARNESS'S DISARM BY DEFAULT: path-bench.mjs mirrors this flow, so its default must be §10c,
    // with cde40a6's lift (`disarmBrake: false`) and §10b (`true`) reachable only by asking for them, and its landing
    // must dispatch a braking pair in order. A bench whose default disarm is not the harness's measures a drive nobody runs.
    const benchSrc = stripCode(readFileSync(resolve(HERE, "..", "lib", "path-bench.mjs"), "utf8"));
    const benchPin = (src) => {
      const defaults = [...src.matchAll(/\bdisarmBrake = (true|false|null)\b/g)];
      if (defaults.length !== 1) return `UNREADABLE: path-bench.mjs runBench's disarmBrake default is not exactly one literal (${defaults.length})`;
      if (defaults[0][1] !== "null") return "path-bench.mjs does not run the harness's §10c disarm by default — the bench no longer mirrors the harness";
      if (!/const disarmFlow = disarmBrake === null \? "landing" : "head";/.test(src)) return "UNREADABLE: path-bench.mjs's disarm flow selector";
      if ((src.match(/if \(disarmFlow === "landing"\) disarmHold\(attempt === 1 && !stopFirstRan\);\s*\n\s*else selectorHold\("D", disarmBrake \? disarmLand : throttle\);/g) ?? []).length !== 1) return "UNREADABLE: path-bench.mjs's D hold is not the §10c hold with the head and §10b holds behind `disarmBrake`";
      if (!/if \(landed\.dispatch === "in-order"\) dispatchInOrder\(landed\.actions\);\s*\n\s*else actuate\(landed\.actions\);/.test(src)) return "path-bench.mjs's landing no longer dispatches a braking pair in order";
      return null;
    };
    assert.equal(benchPin(benchSrc), null);
    assert.match(benchPin(benchSrc.replace("disarmBrake = null", "disarmBrake = false")) ?? "", /no longer mirrors/, "mutation: a head-disarm default must break the bench pin");
    assert.match(benchPin(benchSrc.replace("if (disarmFlow === \"landing\") disarmHold(attempt === 1 && !stopFirstRan);", "if (disarmFlow === \"landing\") disarmHold(true);")) ?? "", /UNREADABLE/, "mutation: every bench press taken for the flipping press must break the bench pin");
    assert.match(benchPin(benchSrc.replace('if (landed.dispatch === "in-order") dispatchInOrder(landed.actions);', 'if (landed.dispatch === "in-order") actuate(landed.actions);')) ?? "", /dispatches/, "mutation: an awaited bench pair must break the bench pin");
    const land = fnBody("pathDisarmLand");
    assert.ok(land, "UNREADABLE: pathDisarmLand's body — where its frame collector may be reached from cannot be read");
    const framesRefs = refsTo(stripped, "pathFramesSince").length;
    assert.ok(framesRefs >= 1, "UNREADABLE: no reference to pathFramesSince at all — the reachability pin reads nothing");
    assert.equal(refsTo(stripCode(land), "pathFramesSince").length, framesRefs, "pathFramesSince is reached from outside the unwired pathDisarmLand");
    // THE ORDER OF A PLANNER'S KEYS: the executor still runs an action list in order, one awaited key call at a time
    // (pathApply and pathYield go through it). A parallel dispatch would not guarantee the order a planner decided.
    const actuate = fnBody("pathActuate");
    assert.ok(actuate, "unresolved pathActuate");
    assert.match(actuate, /for \(const a of actions\) \{/);
    assert.doesNotMatch(actuate, /Promise\.all|forEach\(/, "pathActuate dispatches keys in parallel — the release order is no longer guaranteed");
    // THE FRAME EVIDENCE IS THE PAGE'S OWN rAF TIMESTAMPS, RETURNED RAW (§10b): the page stops on both conditions
    // and computes no verdict and no span — `brakeReadOf` decides, as it does for the bench. Its timeout resolves
    // with the timestamps it saw and nothing else: until 2026-09-17 it resolved `ms: performance.now() − first`,
    // and three frames before a 2.5 s render stall «proved» 1996 ms of reading.
    const frames = fnBody("pathFramesSince");
    assert.ok(frames, "unresolved pathFramesSince");
    assert.match(frames, /^\{\s*if \(STEER_BY !== "authored-path"\) return null;/);
    const framesPin = /if \(over\) return;\s*\n\s*times\.push\(t\);\s*\n\s*if \(times\.length >= minFrames && t - times\[0\] >= minMs\) \{\s*\n\s*over = true;\s*\n\s*clearTimeout\(timer\);\s*\n\s*done\(\{ times: times\.slice\(\), timedOut: false \}\);\s*\n\s*\} else requestAnimationFrame\(tick\);\s*\n\s*\};\s*\n\s*requestAnimationFrame\(tick\);/;
    assert.match(frames, framesPin);
    assert.match(frames, /const timer = setTimeout\(\(\) => \{\s*\n\s*over = true;\s*\n\s*done\(\{ times: times\.slice\(\), timedOut: true \}\);\s*\n\s*\}, maxMs\);/);
    assert.doesNotMatch(frames, /performance\.now\(\)|Date\.now\(\)|\bms:/, "pathFramesSince reads a clock or returns a span — a wall-clock span can stand in for a frame again");
    assert.doesNotMatch(frames.replace("times.length >= minFrames && t - times[0] >= minMs", "times.length >= minFrames || t - times[0] >= minMs"), framesPin, "mutation: either condition alone must break the pin");
    const lift = idxOf(/if \(STEER_BY === "authored-path"\) \{\s*\n\s*await sChannel\(false\);/);
    const shot = idxOf(/await shot\("05r-reverse-R"\);/);
    assert.ok(lift > 0 && shot > 0 && lift < shot, "sChannel(false) before shot(\"05r-reverse-R\")");
    const hold = fnBody("pathSelectorHold");
    assert.match(hold, /await releasePedal\(false\);/);
    assert.doesNotMatch(hold, /keyboard/);
    // mutation: the lift after the shot → red
    const mutated = SRC.replace(/if \(STEER_BY === "authored-path"\) \{\s*\n\s*await sChannel\(false\);/, "if (false) {").replace(/await shot\("05r-reverse-R"\);/, 'await shot("05r-reverse-R");\nif (STEER_BY === "authored-path") {\n await sChannel(false);');
    assert.ok(mutated.search(/if \(STEER_BY === "authored-path"\) \{\s*\n\s*await sChannel\(false\);/) > mutated.search(/await shot\("05r-reverse-R"\);/));
    // the at-rest skip of the disarm's stop-first press (N4)
    assert.match(disarm, /if \(!\(STEER_BY === "authored-path" && \(await speedNow\(\)\) === 0\)\) \{/);
  });

  /* W-17b THE PAGE AND THE BENCH RUN ONE DECISION PROCEDURE (§10b). The page cannot import `brakeReadOf`, so its
   * stop rule is text; the bench stops on `brakeReadOf(...).proven` and the planner decides on `brakeReadOf` for
   * both. So the page's OWN rAF callback — extracted from lesson-audit.mjs, not copied — is run against frame
   * streams, and must stop at exactly the frame where `brakeReadOf` over the prefix first proves (the bench's stop),
   * return exactly that prefix, and on a timeout return every frame before the timer and nothing else. The bench
   * (path-bench.mjs framesSince) was the other disagreement the adversary found: it counted from the frame AFTER the
   * first and returned the frame span on a timeout — both removed; it now collects the same raw timestamps. */
  it("W-17b pathFramesSince's page code stops where brakeReadOf proves, returns that exact prefix, and times out with only what it saw", async () => {
    const { brakeReadOf, DISARM_BRAKE } = await import("../lib/path-follow.mjs");
    const frames = fnBody("pathFramesSince");
    assert.ok(frames, "unresolved pathFramesSince");
    const m = frames.match(/\.evaluate\(\s*\n\s*(\(\{ minFrames, minMs, maxMs \}\) =>[\s\S]*?\}\)),\s*\n\s*\{ minFrames, minMs, maxMs \},\s*\n\s*\)/);
    assert.ok(m, "UNREADABLE: the page callback inside pathFramesSince could not be extracted — this differential cannot run");
    const pageFn = new Function("requestAnimationFrame", "setTimeout", "clearTimeout", `return (${m[1]});`);
    const runPage = async (frameTimes, maxMs) => {
      // one fake page: rAF callbacks fire at the stream's frame times, the timer at maxMs after the evaluate starts (t = 0)
      let pending = [];
      let timer = null;
      const fn = pageFn((cb) => pending.push(cb), (cb, ms) => { timer = { cb, at: ms }; return 1; }, () => { timer = null; });
      const p = fn({ minFrames: DISARM_BRAKE.brakeReadFrames, minMs: DISARM_BRAKE.brakeFullMs, maxMs });
      for (const t of frameTimes) {
        if (timer && t > timer.at) break;
        const cbs = pending;
        pending = [];
        for (const cb of cbs) cb(t);
      }
      if (timer) timer.cb();
      return p;
    };
    const streams = [];
    for (const period of [1000 / 144, 1000 / 60, 1000 / 30, 1000 / 12, 250, 400]) streams.push(Array.from({ length: 200 }, (_, i) => 1 + i * period));
    // jittered, with a render stall after the 3rd frame (the adversary's shape), and one that never renders enough
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 40; k++) { let t = rnd() * 5; streams.push(Array.from({ length: 80 }, () => (t += 2 + rnd() * 60))); }
    streams.push([2.5, 9.4, 16.4, 2516.4, 2523.3, 2530.3]);
    streams.push([10, 135, 260, 400]); // spans EXACTLY brakeFullMs at the 3rd frame: the boundary is inclusive on both sides
    streams.push([5, 12, 19]);
    streams.push([]);
    let proved = 0;
    let timedOut = 0;
    for (const s of streams) {
      const maxMs = DISARM_BRAKE.maxHoldS * 1000;
      const out = await runPage(s, maxMs);
      const seen = s.filter((t) => t <= maxMs);
      const stopAt = seen.findIndex((_, i) => brakeReadOf({ times: seen.slice(0, i + 1) }).proven);
      const expected = stopAt >= 0 ? seen.slice(0, stopAt + 1) : seen;
      assert.deepEqual(Object.keys(out).sort(), ["timedOut", "times"], `the page returned ${JSON.stringify(Object.keys(out))} — a verdict or a span computed on the page`);
      assert.deepEqual(out.times, expected, `stream ${JSON.stringify(s.slice(0, 6))}: the page stopped elsewhere than brakeReadOf`);
      assert.equal(out.timedOut, stopAt < 0);
      assert.equal(brakeReadOf(out).proven, stopAt >= 0);
      if (stopAt >= 0) proved += 1;
      else timedOut += 1;
    }
    // the count is reported, never recited: 6 periodic + 40 jittered + 4 hand-made streams (a prior claim said 49)
    assert.equal(proved + timedOut, streams.length, `${streams.length} streams built, ${proved + timedOut} judged`);
    assert.ok(proved >= 5 && timedOut >= 3, `the ${streams.length} streams exercised ${proved} stops and ${timedOut} timeouts — not both sides`);
    // mutation: either condition alone in the page's stop rule is caught by this differential, not only by the text pin
    const mutated = m[1].replace("times.length >= minFrames && t - times[0] >= minMs", "times.length >= minFrames || t - times[0] >= minMs");
    assert.notEqual(mutated, m[1]);
    const mutFn = new Function("requestAnimationFrame", "setTimeout", "clearTimeout", `return (${mutated});`);
    let pending = [];
    const mp = mutFn((cb) => pending.push(cb), () => 1, () => {})({ minFrames: DISARM_BRAKE.brakeReadFrames, minMs: DISARM_BRAKE.brakeFullMs, maxMs: 2000 });
    for (const t of streams[0]) { const cbs = pending; pending = []; for (const cb of cbs) cb(t); }
    const mout = await mp;
    assert.notDeepEqual(mout.times, streams[0].slice(0, streams[0].findIndex((_, i) => brakeReadOf({ times: streams[0].slice(0, i + 1) }).proven) + 1), "mutation: an OR stop rule must disagree with brakeReadOf");
    // the bench's collector: every frame counted from the first, the raw timestamps, the one verdict — never a span
    const bench = readFileSync(resolve(HERE, "..", "lib", "path-bench.mjs"), "utf8");
    const fs0 = bench.indexOf("const framesSince = (maxMs) => {");
    assert.ok(fs0 > 0, "UNREADABLE: path-bench.mjs framesSince");
    const benchFrames = bench.slice(fs0, bench.indexOf("\n  };", fs0));
    assert.match(benchFrames, /times\.push\(plant\.ft \* 1000\);\s*\n[^\n]*\n\s*if \(brakeReadOf\(\{ times \}\)\.proven\) \{ timedOut = false; break; \}/);
    assert.match(benchFrames, /return \{ times, timedOut \};/);
    assert.doesNotMatch(benchFrames, /frame - f0|ms:/, "path-bench framesSince counts from a later frame or returns a span again");
  });

  /* W-17c THE POLL WAIT IS A SAFETY DEPENDENCY (path-follow.mjs §10b, restated 2026-09-17, third pass). When the
   * disarm lands on a W pressed AGAIN in D (the stop-first branch, attempts 2–3), «no press arms» holds under
   * resolve-after-handled keys only because S's key-down reaches the page at least REVERSE_ASSIST_PEDAL_ON ×
   * THROTTLE_ATTACK_S after the re-pressed W's — and the only thing between the two is pathSelectorHold's
   * ARM_POLL_MS wait BEFORE the cluster read that lands. path-follow.test.mjs «T6.7b ARM_POLL_MS» measures what is lost
   * when it is shortened (presses arm at 0–25 ms); this pins the constant against the bound read off the product,
   * the wait's place before the read, and the bench's mirror of the number. Each check is mutation-tested. */
  it("W-17c ARM_POLL_MS ≥ REVERSE_ASSIST_PEDAL_ON × THROTTLE_ATTACK_S (read off the product), waited BEFORE every cluster read of pathSelectorHold, and the bench polls the same number", () => {
    const engine = resolve(HERE, "..", "..", "..", "platform", "src", "modules", "sim", "engine");
    const constant = (file, name) => {
      const m = readFileSync(resolve(engine, file), "utf8").match(new RegExp(`export const ${name} = ([0-9.]+);`));
      assert.ok(m, `UNREADABLE: ${file} ${name} — the bound ARM_POLL_MS is held to cannot be read`);
      return Number(m[1]);
    };
    const boundMs = constant("reverseAssist.ts", "REVERSE_ASSIST_PEDAL_ON") * constant("input.ts", "THROTTLE_ATTACK_S") * 1000;
    assert.ok(boundMs > 0 && boundMs < constant("reverseAssist.ts", "REVERSE_ASSIST_HOLD_S") * 1000, `bound ${boundMs} ms`);
    const pollOf = (src) => {
      const m = [...src.matchAll(/^const ARM_POLL_MS = (\d+);\r?$/gm)];
      return m.length === 1 ? Number(m[0][1]) : null;
    };
    const bodyIn = (src, name) => {
      const at = src.search(new RegExp(`async function ${name}\\(`));
      if (at < 0) return null;
      const scan = scanBlocks(src);
      if (!scan.ok) return null;
      const b = scan.blocks.filter((x) => x.open > at).sort((x, y) => x.open - y.open)[0];
      return b ? src.slice(b.open, b.close + 1) : null;
    };
    const holdPin = /while \(Date\.now\(\) - t0 < holdMs\) \{\s*\n\s*await page\.waitForTimeout\(ARM_POLL_MS\);\s*\n\s*const g = await gear\(\);\s*\n\s*if \(g\.length === 1 && g\[0\] === want\) \{/;
    const check = (src) => {
      const poll = pollOf(src);
      if (poll === null) return "UNREADABLE: lesson-audit.mjs ARM_POLL_MS is not exactly one integer constant";
      if (!(poll >= boundMs - 1e-9)) return `ARM_POLL_MS ${poll} ms is below the ${boundMs} ms the re-press paths' «no press arms» rests on`;
      const hold = bodyIn(src, "pathSelectorHold");
      if (hold === null) return "UNREADABLE: pathSelectorHold";
      if (!holdPin.test(hold)) return "pathSelectorHold no longer waits ARM_POLL_MS before each cluster read";
      return null;
    };
    assert.equal(check(SRC), null);
    // mutations: a poll below the bound, the wait moved after the read, a constant that is no longer one integer
    assert.match(check(SRC.replace(/^const ARM_POLL_MS = \d+;/m, "const ARM_POLL_MS = 20;")) ?? "", /below the/);
    assert.match(check(SRC.replace(/^const ARM_POLL_MS = \d+;/m, `const ARM_POLL_MS = ${Math.floor(boundMs) - 1};`)) ?? "", /below the/);
    const swapped = SRC.replace(/await page\.waitForTimeout\(ARM_POLL_MS\);\n(\s*)const g = await gear\(\);/, "const g = await gear();\n$1await page.waitForTimeout(ARM_POLL_MS);");
    assert.notEqual(swapped, SRC, "UNREADABLE: the wait-then-read pair in pathSelectorHold was not found to mutate");
    assert.match(check(swapped) ?? "", /no longer waits/);
    assert.match(check(SRC.replace(/^const ARM_POLL_MS = \d+;/m, "const ARM_POLL_MS = Number(process.env.ARM_POLL_MS ?? 60);")) ?? "", /UNREADABLE/);
    // the bench's selectorHold and disarmLand poll the same number
    const bench = readFileSync(resolve(HERE, "..", "lib", "path-bench.mjs"), "utf8");
    const bm = [...bench.matchAll(/^\s*armPollMs: (\d+),\r?$/gm)];
    assert.equal(bm.length, 1, "UNREADABLE: path-bench.mjs BENCH.armPollMs");
    assert.equal(Number(bm[0][1]), pollOf(SRC), "path-bench.mjs BENCH.armPollMs no longer mirrors lesson-audit.mjs ARM_POLL_MS");
  });

  /* W-22 THE DISPATCH ORDER §10c RESTS ON (2026-09-17). The landing's safety needs S's key-down to reach the page before
   * W's key-up; its «no further than the head disarm» needs W's key-up not to wait for S's round trip. pathDispatchInOrder
   * gets both by STARTING `sChannel` then `throttle` and awaiting them together — which sends in order only while each
   * helper's first `await` is its own `page.keyboard` call (the call is evaluated, and its protocol message queued, before
   * the helper yields). An await, a delay or a read placed before that call would let the second helper's key overtake
   * the first. This pins that shape on both helpers, and that the landing starts S's call before W's. Beyond it the
   * dependency is Playwright's: calls made in order are dispatched to the page in order — the same assumption every
   * «a call that resolves before its key is handled» case in path-follow.test.mjs T6.7b and path-disarm.test.mjs makes. */
  it("W-22 throttle() and sChannel() reach page.keyboard before their first await, and the landing starts S's call before W's", () => {
    const helper = (name) => {
      const m = SRC.match(new RegExp(`const ${name} = async \\(on\\) => \\{[\\s\\S]*?\\n\\};`));
      return m ? stripCode(m[0]) : null;
    };
    const firstAwaitIsTheKey = (body, key) => {
      const i = body.indexOf("await ");
      if (i < 0) return "no await at all";
      if (!body.slice(i).startsWith(`await page.keyboard[on ? "down" : "up"]("${key}")`)) return `the first await is «${body.slice(i, i + 60)}», not the ${key} call`;
      if (/\bthen\(|queueMicrotask|setTimeout/.test(body.slice(0, i))) return "something defers the key before its call";
      return null;
    };
    for (const [name, key] of [["throttle", "KeyW"], ["sChannel", "KeyS"]]) {
      const body = helper(name);
      assert.ok(body, `UNREADABLE: lesson-audit.mjs ${name}`);
      assert.equal(firstAwaitIsTheKey(body, key), null, `${name}: its key is not on the wire before it yields`);
      // mutation: anything awaited ahead of the key call
      const mutated = body.replace(`await page.keyboard[on ? "down" : "up"]("${key}")`, `await Promise.resolve();\n  await page.keyboard[on ? "down" : "up"]("${key}")`);
      assert.notEqual(mutated, body, `UNREADABLE: the ${name} mutation found nothing to change`);
      assert.notEqual(firstAwaitIsTheKey(mutated, key), null, `mutation: an await ahead of ${name}'s key call must be caught`);
    }
    // the planner orders the pair S first (path-disarm.test.mjs T14.1 over every cell); the dispatcher keeps that order
    const dispatch = stripCode(fnBody("pathDispatchInOrder") ?? "");
    assert.match(dispatch, /for \(const a of actions\) \{\s*\n\s*if \(a\.ch === "S-hold"\) sent\.push\(sChannel\(a\.down\)\);/, "pathDispatchInOrder no longer starts each call in the planner's order");
    assert.doesNotMatch(dispatch, /\.reverse\(|\.sort\(/, "pathDispatchInOrder reorders the planner's actions");
  });

  it("W-18 the stall detector's wiring: pathRead takes PAUSE_SEL and returns pz; a drain resets it; pose-stale lives in the lib only", () => {
    const read = fnBody("pathRead");
    assert.ok(read, "unresolved");
    assert.match(read, /\}, \{ pauseSel: PAUSE_SEL, gearSel: GEAR_SEL \}\)/);
    assert.match(read, /\bpz\b/);
    assert.match(SRC, /if \(STEER_BY === "authored-path"\) pathState = pathOnPauseDrain\(pathState\);/);
    assert.doesNotMatch(SRC, /"pose-stale"/);
    assert.match(LIB, /refusePathState\(state, "pose-stale"/);
    assert.match(LIB, /stall: \{ \.\.\.state\.stall, frameAt: null, entries: 0, onset: null, drained: true \}/);
  });

  it("W-19 pathSafeKmh returns 0 below PRESS_MIN; the four stop exits carry the routeEnd conjunct", () => {
    assert.match(LIB, /return !\(g >= pressMin\) \? 0 : g;/);
    assert.match(SRC, /await brake\(true, STEER_BY === "authored-path" \? pathSafeKmh\(p\.kmh, pathFollow\.lastAbsKmh\) : p\.kmh\);/);
    assert.equal((SRC.match(/&& pathStopExit\(\)\) \{/g) ?? []).length, 4);
    assert.match(SRC, /const pathStopExit = \(\) => STEER_BY !== "authored-path" \|\| \(pathFollow\.stopRelease === true && pathFollow\.routeEnd !== true\);/);
  });

  /* W-20 (CODE-REVIEW-1 M2, M4). THE PAGE SIDE DECIDES NOTHING. Every key decision is
   * `pathApplyActions` / `pathYieldActions` (unit-tested with mutants in path-follow.test.mjs
   * T6.5) and the observation is `pathObservation`; lesson-audit keeps a thin executor whose
   * body is pinned VERBATIM here, and the bench must call the same three functions. */
  const EXECUTOR = [
    "{",
    '  if (STEER_BY !== "authored-path") return;',
    "  for (const a of actions) {",
    '    if (a.ch === "steer") {',
    '      await steer(a.dir, a.kmh, "path");',
    "      pathFollow.edge = { seq: pathFollow.edge.seq + 1, atMs: Date.now() };",
    '    } else if (a.ch === "W") await throttle(a.down);',
    '    else if (a.ch === "S-accel") await sChannel(a.down);',
    // the disarm brake (path-follow.mjs §10b) — the deliberate standstill helper, never brake()
    '    else if (a.ch === "S-hold") await sChannel(a.down);',
    '    else if (a.ch === "S-brake") {',
    "      const p = { kmh: a.kmh };",
    "      if (a.down) await brake(true, p.kmh);",
    "      else await brake(false);",
    // a channel the executor cannot read is a named refusal, never a silently dropped key
    "    } else throw new Error(`pathActuate: unknown action channel ${JSON.stringify(a.ch)} — refusing to drop a key decision it cannot execute`);",
    "  }",
    "}",
  ].join("\n");

  it("W-20 the executor is verbatim; pathApply / pathYield only plan; pathRun builds the lib's observation; pathRead reads the dial and cluster itself", () => {
    const norm = (t) => (t ?? "").replace(/\r\n/g, "\n");
    const exec = norm(fnBody("pathActuate"));
    assert.equal(exec, EXECUTOR, "pathActuate's body changed — every decision belongs in lib/path-follow.mjs");
    // the pin can fail: each CODE-REVIEW-1 wmut-style deletion or a made-up press speed differs
    for (const [from, to] of [
      ['    } else if (a.ch === "W") await throttle(a.down);\n', "    }\n"],
      ['      await steer(a.dir, a.kmh, "path");\n', ""],
      ["      const p = { kmh: a.kmh };", "      const p = { kmh: 99 };"],
      ['    else if (a.ch === "S-hold") await sChannel(a.down);\n', ""],
      ['    else if (a.ch === "S-hold") await sChannel(a.down);', '    else if (a.ch === "S-hold") await brake(a.down, 0);'],
      ["    } else throw new Error(", "    } else void (0, "],
    ]) assert.notEqual(EXECUTOR.replace(from, to), EXECUTOR, `mutation ${JSON.stringify(to)} must change the body`);
    const apply = norm(fnBody("pathApply"));
    assert.match(apply, /await pathActuate\(pathApplyActions\(cmd, \{ phase, held: \{ W: holdW, S: holdS, steer: steerHeld \}, vAbs: Math\.abs\(obs\?\.v \?\? 0\), dialKmh: obs\?\.dialKmh \}\)\.actions\);/);
    const yieldBody = norm(fnBody("pathYield"));
    assert.match(yieldBody, /await pathActuate\(pathYieldActions\(\{ phase, held: \{ W: holdW, S: holdS, steer: steerHeld \}, latch: pathState\.latch, mode: pathState\.mode, vAbs: Math\.abs\(pathState\.last\?\.v \?\? 0\) \}\)\.actions\);/);
    for (const [name, body] of [["pathApply", apply], ["pathYield", yieldBody]]) {
      assert.doesNotMatch(body, /\b(throttle|brake|sChannel|steer)\(/, `${name} presses a key itself`);
      assert.doesNotMatch(body, /\bhold[WS] &&|&& !?hold[WS]\b/, `${name} makes a key decision itself`);
    }
    const run = norm(fnBody("pathRun"));
    assert.match(run, /const pobs = pathObservation\(obs, \{/);
    assert.match(run, /const step = pathStep\(pathState, pobs\);/);
    assert.match(run, /await pathApply\(step\.cmd, pobs\);/);
    assert.match(run, /edge: pathFollow\.edge,/);
    assert.doesNotMatch(SRC, /pathFollow\.lastProbe/, "the runner must never read the outer probe's tick-old dial or cluster");
    const read = norm(fnBody("pathRead"));
    assert.match(read, /document\.querySelector\('\[aria-label\^="Скорост "\]'\)/);
    assert.match(read, /shell\.querySelectorAll\(gearSel\)/);
    assert.match(read, /pz, dial, gear \}/);
  });

  it("W-21 (2026-09-15) the runner's budget is the lib's, re-read every sub-tick, on both sides; the product's crash banner reaches the reducer; the yield is unchanged", () => {
    const norm = (t) => (t ?? "").replace(/\r\n/g, "\n");
    const run = norm(fnBody("pathRun"));
    assert.match(run, /pathState = pathRunnerEntry\(pathState, pathMeasured\(\), budgetMs\);/);
    assert.match(run, /while \(Date\.now\(\) - enteredAt < pathRunnerBudgetMs\(pathState, budgetMs\) && !pathState\.done\) \{/);
    assert.match(run, /untilMs: enteredAt \+ pathRunnerBudgetMs\(pathState, budgetMs\),/);
    assert.match(run, /crash: lastRouteHold === "crash-pinned",/);
    assert.doesNotMatch(run, /const until = Date\.now\(\) \+ budgetMs;/, "a fixed deadline would ignore the near-lock budget");
    assert.match(run, /try \{[\s\S]*\} finally \{\s*\n\s*await pathYield\(/, "every runner exit still yields");
    // the call site is unchanged: the base is TICK_MS
    assert.match(SRC, /pathRun\(TICK_MS\)/);
    const bench = readFileSync(resolve(HERE, "..", "lib", "path-bench.mjs"), "utf8").replace(/\r\n/g, "\n");
    assert.match(bench, /while \(now\(\) - enteredAt < pathRunnerBudgetMs\(state, baseMs\) && !state\.done\) \{/);
    assert.match(bench, /state = pathRunnerEntry\(state, m, baseMs\);/);
    // the routeHold value the crash test reads is the one the probe writes
    assert.match(SRC, /\? "crash-pinned"/);
    assert.match(SRC, /lastRouteHold = p\.routeHold \?\? null;/);
  });

  it("W-20b the bench calls the SAME observation and planners, and decides no key itself", () => {
    const bench = readFileSync(resolve(HERE, "..", "lib", "path-bench.mjs"), "utf8").replace(/\r\n/g, "\n");
    assert.match(bench, /const obs = pathObservation\(read, \{/);
    assert.match(bench, /actuate\(pathApplyActions\(cmd, \{ phase, held: heldNow\(\), vAbs: Math\.abs\(obs\?\.v \?\? 0\), dialKmh: obs\?\.dialKmh \}\)\.actions\)/);
    assert.match(bench, /actuate\(pathYieldActions\(\{ phase, held: heldNow\(\), latch: state\.latch, mode: state\.mode, vAbs: Math\.abs\(state\.last\?\.v \?\? 0\) \}\)\.actions\)/);
    assert.doesNotMatch(bench, /cmd\.(W|S) && !sentKeys/, "the bench re-implements a key decision");
    assert.match(bench, /if \(down && kmh !== null && kmh >= 0 && kmh <= 1\) return; \/\/ lesson-audit\.mjs brake\(\)'s refusal, verbatim/);
    assert.match(SRC, /if \(on && kmh !== null && kmh >= 0 && kmh <= 1\) \{/, "…and it is still lesson-audit's refusal");
    // the readers see the HUD, never the plant's true speed or gear
    assert.match(bench, /const p = \{ kmh: hudDialKmh\(plant\), gear: \[hudGear\(plant\)\] \};/);
    assert.match(bench, /const gearRead = \(\) => \{ call\(\); return \[hudGear\(plant\)\]; \};/);
    assert.match(bench, /const speedNow = \(\) => \{ call\(\); return hudDialKmh\(plant\); \};/);
  });
});

/* ═══════════════════════ behaviour: refusals leave no directory ═══════════════════════ */

describe("spawned refusals exit 2 and make no directory", () => {
  const run = (args, env = {}) => spawnSync(process.execPath, [SELF, ...args], { encoding: "utf8", env: { ...process.env, KNIJKA_BASE: "", ...env }, timeout: 60_000 });
  it("an unknown leg literal, mobile-path and a lesson with no pathref", async () => {
    const { mkdtempSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const root = mkdtempSync(resolve(tmpdir(), "path-wiring-"));
    for (const [args, re] of [
      [[resolve(root, "a"), "sc-park-wall", "pc", "sideways"], /unknown leg/],
      [[resolve(root, "b"), "sc-park-wall", "mobile", "path"], /refused \(platform\)/],
      [[resolve(root, "c"), "sc-no-such-lesson", "pc", "path"], /refused \(no-pathref\)/],
      [[resolve(root, "x__pc-right"), "sc-park-wall", "pc", "path"], /refused \(folder\)/],
    ]) {
      const r = run(args);
      assert.equal(r.status, 2, `${args.join(" ")}: ${r.stderr}`);
      assert.match(r.stderr, re);
      assert.equal(existsSync(args[0]), false, "no directory is made");
    }
  });
});

/**
 * REFUSAL_CODES HAD NO READER (found 2026-09-16 while adding `body-clearance` to it).
 *
 * It is the follower's published list of every way it can refuse, and nothing in the harness
 * read it, so a code added to the reducer and left out of the list — or left in the list after
 * the branch that emitted it was deleted — was invisible. That is the dead-predicate shape
 * this programme has measured 51 times.
 *
 * This is its reader. It scans the reducer's own source for every literal refusal code it can
 * emit, both shapes: `refusePathState(state, "code", …)` and the `{ refusal: "code" }` gates
 * (`witnessBodyGate`, `selectWitness`) whose value is handed straight to `refusePathState`. A
 * code emitted and not listed fails; a code listed and never emitted fails; and a call this
 * matcher cannot resolve to a literal is reported as UNRESOLVED and fails too, rather than
 * being silently skipped — a matcher must report what it cannot read.
 */
describe("REFUSAL_CODES is the reducer's own list, and something reads it", () => {
  it("every code the reducer can emit is listed, every listed code is emitted, and nothing is unresolved", () => {
    const src = readFileSync(resolve(HERE, "..", "lib", "path-follow.mjs"), "utf8");
    const emitted = new Set();
    const unresolved = [];
    // shape 1: refusePathState(state, <code>, …) — `state`/`s` as the first argument
    // the lookbehind skips the DECLARATION — `export function refusePathState(state, code, …)`
    // — which is the one place the second argument is legitimately a parameter name
    for (const m of src.matchAll(/(?<!function )refusePathState\(\s*[A-Za-z_$][\w$]*\s*,\s*([^,]+),/g)) {
      const a = m[1].trim();
      const lit = /^"([a-zA-Z-]+)"$/.exec(a);
      if (lit) { emitted.add(lit[1]); continue; }
      // a variable is only acceptable when it is a `refusal` field the gates below produce
      if (/^(gate|sel|[a-z]+)\.refusal$/.test(a)) continue;
      unresolved.push(`refusePathState(…, ${a.slice(0, 40)})`);
    }
    // shape 2: the gates' own `refusal:` fields, which flow into shape 1's variable form
    for (const m of src.matchAll(/refusal:\s*([^,}\n]+)/g)) {
      const a = m[1].trim();
      if (a === "null") continue;
      const lit = /^"([a-zA-Z-]+)"$/.exec(a);
      if (lit) { emitted.add(lit[1]); continue; }
      unresolved.push(`refusal: ${a.slice(0, 40)}`);
    }
    assert.deepEqual(unresolved, [], "this matcher could not read a refusal code — fix the matcher, do not let it pass blind");
    assert.ok(emitted.size >= 12, `only ${emitted.size} codes were read out of the source — the matcher has gone blind`);
    const listed = new Set(REFUSAL_CODES);
    const missing = [...emitted].filter((c) => !listed.has(c)).sort();
    assert.deepEqual(missing, [], "the reducer can emit a code REFUSAL_CODES does not list");
    // the list may also carry codes raised elsewhere in the leg (the runner, not the reducer);
    // those are named here so an ENTIRELY dead entry cannot hide among them.
    const RAISED_OUTSIDE_THE_REDUCER = ["no-pathref", "reference-stale", "platform", "reverse-not-armed", "arm-gate-stalled", "lost-R", "frozen"];
    const never = [...listed].filter((c) => !emitted.has(c) && !RAISED_OUTSIDE_THE_REDUCER.includes(c)).sort();
    assert.deepEqual(never, [], "REFUSAL_CODES lists a code nothing emits and nothing outside the reducer raises");
    // and the two the body guard added really are in there
    assert.ok(listed.has("body-clearance") && listed.has("body-clearance-unreadable"));
    assert.ok(emitted.has("body-clearance") && emitted.has("body-clearance-unreadable"));
  });

  it("MUTATION: a code the reducer emits but the list forgets is caught", () => {
    // the matcher's own failure mode, tested against a synthetic source
    const fake = 'refusePathState(state, "brand-new-refusal", "why");';
    const found = [...fake.matchAll(/refusePathState\(\s*[A-Za-z_$][\w$]*\s*,\s*([^,]+),/g)].map((m) => /^"([a-zA-Z-]+)"$/.exec(m[1].trim())?.[1]);
    assert.deepEqual(found, ["brand-new-refusal"]);
    assert.equal(REFUSAL_CODES.includes("brand-new-refusal"), false, "…and it is not in the list, which is what the test above would report");
  });
});
