#!/usr/bin/env node
// =============================================================================
// The mobile harness — one command, real numbers, on the founder's phone.
//
//   node tools/mobile/cli.mjs                       full sweep, WebKit
//   node tools/mobile/cli.mjs --route simulator-drive --device iphone16-landscape
//   node tools/mobile/cli.mjs --list                 routes + devices
//   node tools/mobile/cli.mjs --engine chromium      SECOND opinion only
//   node tools/mobile/cli.mjs --json                 machine-readable report
//   node tools/mobile/cli.mjs --cleanup-user         delete the throwaway account
//
// Routes are named by ID, never by path, on purpose: Git Bash on Windows
// rewrites any argument that starts with "/" into a C:\Program Files\Git\...
// path, so `--route /theory` silently becomes a navigation to
// http://localhost:3460C:/Program Files/Git/theory. Measured, not guessed.
//
// EXIT CODE. 0 when every route met its budget, 1 when any budget failed or any
// route errored — so this is usable as a gate step directly, not only through
// vitest.
// =============================================================================
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEVICES } from "./lib/devices.mjs";
import { ROUTES } from "./lib/routes.mjs";
import { sweep } from "./lib/measure.mjs";
import { ensureServer, DEFAULT_PORT } from "./lib/server.mjs";
import { dropHarnessUser, HARNESS_EMAIL } from "./lib/user.mjs";
import { evaluate, formatDelta, formatReport, summarize } from "./lib/budget.mjs";

/** Tracked on purpose: later phases are measured against this file. */
const BASELINE_FILE = join(dirname(fileURLToPath(import.meta.url)), "baseline.json");

function parseArgs(argv) {
  const out = { routes: [], devices: [], flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--route" || arg === "-r") out.routes.push(next());
    else if (arg === "--device" || arg === "-d") out.devices.push(next());
    else if (arg === "--engine") out.engine = next();
    else if (arg === "--port") out.port = Number(next());
    else if (arg === "--base-url") out.baseUrl = next();
    else if (arg.startsWith("--")) out.flags.add(arg.slice(2));
    else out.routes.push(arg);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.flags.has("help") || args.flags.has("h")) {
  console.log(
    [
      "node tools/mobile/cli.mjs [options]",
      "",
      "  -r, --route <id>     route id (repeatable). Default: all",
      "  -d, --device <id>    device id (repeatable). Default: iPhone 16 portrait + landscape + small",
      "      --engine <name>  webkit (default) | chromium | firefox",
      "      --port <n>       dev server port (default 3460)",
      "      --base-url <url> measure an already-running server instead",
      "      --no-screenshots skip PNG capture",
      "      --no-server      fail instead of starting a dev server",
      "      --keep-server    leave the dev server running for the next run",
      "      --json           print the raw report",
      "      --save-baseline  write tools/mobile/baseline.json from this run",
      "      --list           list routes and devices, then exit",
      "      --cleanup-user   delete the throwaway harness account, then exit",
      "",
      "Routes:  " + ROUTES.map((r) => r.id).join(", "),
      "Devices: " + Object.keys(DEVICES).join(", "),
    ].join("\n"),
  );
  process.exit(0);
}

if (args.flags.has("list")) {
  console.log("ROUTES");
  for (const r of ROUTES) {
    console.log(
      `  ${r.id.padEnd(18)} ${r.path.padEnd(46)} content=${r.contentSelectors.join("+")} ` +
        `budget>=${Math.round(r.budget.contentMin * 100)}%${r.budget.foldMustPass ? " fold" : ""}`,
    );
  }
  console.log("\nDEVICES");
  for (const d of Object.values(DEVICES)) {
    console.log(
      `  ${d.id.padEnd(20)} ${d.width}x${d.height} dpr${d.dpr}  safe-area ` +
        `t${d.safeArea.top} r${d.safeArea.right} b${d.safeArea.bottom} l${d.safeArea.left}` +
        (d.primary ? "   <- founder's device" : ""),
    );
  }
  process.exit(0);
}

if (args.flags.has("cleanup-user")) {
  const result = await dropHarnessUser();
  console.log(
    result.deleted
      ? `[mobile-harness] deleted ${result.email}`
      : `[mobile-harness] no account named ${HARNESS_EMAIL} to delete`,
  );
  process.exit(0);
}

const port = args.port || DEFAULT_PORT;
let server = { started: false, stop: () => {}, url: args.baseUrl };

if (!args.baseUrl) {
  if (args.flags.has("no-server")) {
    throw new Error("[mobile-harness] --no-server given but no --base-url to measure");
  }
  server = await ensureServer({ port });
}

let report;
try {
  report = await sweep({
    routes: args.routes,
    devices: args.devices,
    engine: args.engine,
    baseUrl: server.url,
    screenshots: !args.flags.has("no-screenshots"),
    onResult: (r) =>
      console.log(
        r.ok
          ? `  ${r.route.padEnd(18)} ${r.device.padEnd(20)} content ` +
            `${(r.coverage.contentFraction * 100).toFixed(1)}%  chrome ` +
            `${(r.coverage.chromeFraction * 100).toFixed(1)}%  fold ${r.fold.pass ? "ok" : "FAIL"}` +
            `  touch<44 ${r.touch.violations.length}`
          : `  ${r.route.padEnd(18)} ${r.device.padEnd(20)} ERROR ${r.error}`,
      ),
  });
} finally {
  if (server.started && !args.flags.has("keep-server")) server.stop();
}

const baseline = existsSync(BASELINE_FILE)
  ? JSON.parse(readFileSync(BASELINE_FILE, "utf8"))
  : null;

const verdict = evaluate(report);
if (args.flags.has("json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatReport(report, verdict));
  // The baseline is the whole point of a harness that runs more than once.
  if (baseline) console.log(formatDelta(baseline, report));
}

if (args.flags.has("save-baseline")) {
  writeFileSync(BASELINE_FILE, `${JSON.stringify(summarize(report, baseline), null, 2)}\n`);
  console.log(`  baseline written: ${BASELINE_FILE}`);
}

process.exit(verdict.pass ? 0 : 1);
