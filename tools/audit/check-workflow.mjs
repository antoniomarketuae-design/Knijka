#!/usr/bin/env node
/**
 * Syntax-check a generated workflow script THE WAY THE RUNTIME EXECUTES IT.
 *
 * `node --check file.js` is the wrong instrument here and says so loudly: the
 * body runs inside an async function, so its trailing `return {...}` is legal
 * there and an "Illegal return statement" from a bare check is a false red. The
 * inverse is the dangerous case — a real syntax error inside a template literal
 * (a stray backtick terminated the v1 generator's output once) would not be
 * caught at all if nobody checked. So: check the meta block as a module, and the
 * body as an async function body, which is exactly the pair of contexts used.
 */
import fs from "node:fs";
import vm from "node:vm";

const file = process.argv[2];
if (!file) {
  console.error("usage: check-workflow.mjs <generated-workflow.js>");
  process.exit(2);
}
const src = fs.readFileSync(file, "utf8");

// --- 1. the meta block must be a pure literal -------------------------------
const m = src.match(/export const meta = (\{[\s\S]*?\n\})\s*\n/);
if (!m) {
  console.error("FAIL: no `export const meta = {...}` block found — the runtime requires one.");
  process.exit(1);
}
let meta;
try {
  meta = vm.runInNewContext("(" + m[1] + ")");
} catch (e) {
  console.error("FAIL: meta block does not evaluate as a literal: " + e.message);
  process.exit(1);
}
for (const k of ["name", "description"]) {
  if (!meta[k]) {
    console.error("FAIL: meta." + k + " is required and is missing/empty.");
    process.exit(1);
  }
}

// --- 2. the body must parse as an async function body -----------------------
const body = src.slice(m.index + m[0].length);
try {
  // eslint-disable-next-line no-new-func
  new vm.Script("(async function __wf(){\n" + body + "\n})");
} catch (e) {
  console.error("FAIL: body does not parse as an async function body:\n  " + e.message);
  process.exit(1);
}

// --- 3. the hooks it uses must be ones the runtime provides -----------------
const KNOWN = new Set(["agent", "parallel", "pipeline", "log", "phase", "workflow", "args", "budget"]);
const used = new Set([...body.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/g)].map((x) => x[1]));
const hooks = [...used].filter((u) => KNOWN.has(u));
const phasesInBody = [...body.matchAll(/phase\('([^']+)'\)/g)].map((x) => x[1]);
const phasesInOpts = [...body.matchAll(/phase:\s*'([^']+)'/g)].map((x) => x[1]);
const declared = (meta.phases || []).map((p) => p.title);
const undeclared = [...new Set([...phasesInBody, ...phasesInOpts])].filter((p) => !declared.includes(p));

console.log("OK  " + file);
console.log("  meta.name    : " + meta.name);
console.log("  meta.phases  : " + (declared.join(", ") || "(none)"));
console.log("  hooks used   : " + hooks.sort().join(", "));
console.log("  body bytes   : " + body.length);
if (undeclared.length) {
  console.log("  NOTE: phase(s) used but not declared in meta.phases: " + undeclared.join(", "));
  console.log("        (each gets its own progress group — harmless, but usually a typo)");
}
