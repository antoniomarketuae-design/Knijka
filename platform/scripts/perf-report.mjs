#!/usr/bin/env node
// File a PerfProbe run as a committable artifact.
//
// WHY THIS EXISTS. `docs/simulation/68_ALPHA_RECONSTRUCTION_PLAN.md:191` —
// "runs on a mid-range Android: 30+ fps median at tier-low, <10 s load" — has
// been an unchecked box since it was written, and there is no .har, Lighthouse
// run or trace anywhere in the repo. doc 82 §6.2 makes phases P2 onward
// conditional on that box being ticked WITH AN ARTIFACT, because every number
// in §2.2 is a prediction until one exists. An artifact that lives only in a
// DevTools console is not an artifact; this is the two-minute path from
// "I ran it" to "here is the file, dated, with the device in it".
//
// THE PROCEDURE (doc 82 §2.4 — €125 + 4 hours closes the gate permanently):
//
//   1. Build and serve PRODUCTION. A dev build reports a load time and a parse
//      cost that describe no student's session:
//        npm run build && npm run start
//   2. Phone on the same network (or `adb reverse tcp:3000 tcp:3000`), USB
//      debugging on, chrome://inspect on the laptop, inspect the phone tab.
//   3. Open the sim with `?simPerf=1`. In the inspected console:
//        __simPerf.scene('d2-v1 city run')
//   4. Drive the reference route for at least 60 s. The report prints itself;
//      `__simPerf.report()` re-prints it at any time.
//   5. Copy the whole markdown block, then on the laptop:
//        node scripts/perf-report.mjs --stdin        (paste, then Ctrl-D)
//      or, for the raw JSON from `__simPerf.json()`:
//        node scripts/perf-report.mjs --json run.json
//   6. Commit what lands in docs/simulation/perf/.
//
// DevTools device emulation and Android emulators do NOT emulate the GPU and
// will give a false green (§2.4). The artifact records the UNMASKED renderer
// string precisely so a reader can tell an emulated run from a real one.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../../docs/simulation/perf");

function usage(message) {
  if (message) console.error(`perf-report: ${message}\n`);
  console.error(
    [
      "usage:",
      "  node scripts/perf-report.mjs --stdin            paste the markdown from __simPerf.report()",
      "  node scripts/perf-report.mjs --md <file>        a file holding that markdown",
      "  node scripts/perf-report.mjs --json <file>      raw output of __simPerf.json()",
      "",
      "options:",
      "  --label <slug>   appended to the filename (default: the tier)",
      "  --stdout         print instead of writing a file",
    ].join("\n"),
  );
  process.exit(message ? 1 : 0);
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * Re-score raw JSON without importing the TS module (this script must run with
 * bare `node`, no bundler). Deliberately NOT a second copy of the scoring
 * rules: it hands the numbers to the same markdown shape and marks the file so
 * a reader knows it was re-scored offline rather than by the probe itself.
 */
function markdownFromJson(json) {
  const lines = [];
  lines.push(`# Sim perf run — tier \`${json.tier}\` — ${json.recordedAt}`);
  lines.push("");
  lines.push(
    "> Filed from raw `__simPerf.json()` output. The scored table lives in the probe's own",
    "> `report()`; prefer `--stdin` with that markdown. This form preserves the samples.",
  );
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(json, null, 2));
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

/** `tier` and the ISO date out of the report's first line. */
function parseHeader(markdown) {
  const first = markdown.split("\n").find((l) => l.startsWith("# Sim perf run"));
  const tier = first?.match(/tier `([a-z]+)`/)?.[1] ?? "unknown";
  const iso = first?.match(/— (\d{4}-\d{2}-\d{2})T/)?.[1] ?? new Date().toISOString().slice(0, 10);
  return { tier, date: iso };
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) usage();

const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

let markdown = null;
if (args.includes("--stdin")) {
  markdown = readStdin();
} else if (flag("--md")) {
  markdown = readFileSync(flag("--md"), "utf8");
} else if (flag("--json")) {
  markdown = markdownFromJson(JSON.parse(readFileSync(flag("--json"), "utf8")));
} else {
  usage("no input — pass --stdin, --md <file> or --json <file>");
}

markdown = (markdown ?? "").trim();
if (!markdown) usage("empty input");
if (!markdown.startsWith("# Sim perf run")) {
  usage(
    'input does not look like a PerfProbe report (expected it to start with "# Sim perf run")',
  );
}

if (args.includes("--stdout")) {
  process.stdout.write(`${markdown}\n`);
  process.exit(0);
}

const { tier, date } = parseHeader(markdown);
const label = flag("--label") ?? tier;
mkdirSync(OUT_DIR, { recursive: true });

// Never clobber a filed measurement: two runs on the same day are two runs.
let file = path.join(OUT_DIR, `${date}-${label}.md`);
let n = 2;
while (existsSync(file)) file = path.join(OUT_DIR, `${date}-${label}-${n++}.md`);

writeFileSync(file, `${markdown}\n`, "utf8");
console.log(`perf-report: wrote ${path.relative(process.cwd(), file)}`);

const verdict = markdown.match(/\*\*Verdict: (PASS|WARN|FAIL)\*\*/)?.[1];
if (verdict) console.log(`perf-report: verdict ${verdict}`);
console.log(
  "perf-report: commit it, then tick docs/simulation/68_ALPHA_RECONSTRUCTION_PLAN.md:191 if it passed.",
);
