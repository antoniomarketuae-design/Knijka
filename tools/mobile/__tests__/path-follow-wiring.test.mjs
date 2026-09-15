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
    ];
    const definitions = /async function (pathRun|pathApply|pathYield|pathActuate|pathSelectorHold)\(|function (pathArmGateWait)\(/;
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
    for (const name of ["pathRun", "pathApply", "pathYield", "pathActuate", "pathSelectorHold"]) {
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
    assert.match(disarm, /await throttle\(true\); \/\/ …and press it again[\s\S]{0,200}?if \(STEER_BY === "authored-path"\) await pathSelectorHold\("D", REVERSE_HOLD_MS, throttle\);\s*\n\s*else await page\.waitForTimeout\(REVERSE_HOLD_MS\);[\s\S]{0,600}?await throttle\(false\);/);
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
    '    else if (a.ch === "S-brake") {',
    "      const p = { kmh: a.kmh };",
    "      if (a.down) await brake(true, p.kmh);",
    "      else await brake(false);",
    "    }",
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
