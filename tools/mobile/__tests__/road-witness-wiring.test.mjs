/**
 * road-witness-wiring.test.mjs — THE ROAD PROBE IS READ ON EVERY RIBBON/NONE
 * LEG, OFF THE CONTROL PATH, INSIDE THE TICK'S OWN IDLE BUDGET, THROUGH A SINK
 * THAT NEVER SEES THE PAGE — AND NOT AT ALL ON AN AUTHORED-PATH LEG.
 *
 *   node --test tools/mobile/__tests__/road-witness-wiring.test.mjs
 *
 * lesson-audit.mjs cannot be imported (top-level await, a browser), so its
 * source is pinned here, and the per-tick block is also EXECUTED: its exact
 * text is lifted out of lesson-audit and run against the real sink with a slow
 * reader, so the claim "the read does not lengthen the tick" is a measured
 * period, not a reading of the code. What the witness object CAN leak is
 * proven by executing it (road-record.test.mjs §SINK). What this file proves:
 *   · the sink is handed ONE frozen reader function and a frozen options
 *     object whose log is a fresh frozen arrow — never `page`, never `note`,
 *     never an object lesson-audit reads;
 *   · on an authored-path leg the witness is never constructed (and run.log
 *     says so); the idle line the pc-path instrument pins is unchanged;
 *   · the per-tick poll starts after the tick's last actuation and runs
 *     during the idle wait: the period stays TICK_MS, and a read longer than
 *     the budget extends that tick only as far as the read AND is booked;
 *   · lesson-audit names the witness only at construction, the per-tick poll,
 *     the drive-end poll and the finish.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import * as RR from "../lib/road-record.mjs";
import {
  GUIDANCE_DENSIFY_STEP_M,
  ROAD_PROBE_VERSION_READ,
  ROAD_SIDECAR_FILE,
  ROAD_WITNESS_ENV,
  SPAN_KINK_REACH_M,
  createRoadWitness,
  parseRoadSidecar,
} from "../lib/road-record.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(HERE, "..", "lesson-audit.mjs"), "utf8").replace(/\r\n/g, "\n");
const LIB = readFileSync(resolve(HERE, "..", "lib", "road-record.mjs"), "utf8").replace(/\r\n/g, "\n");
const PLATFORM = resolve(HERE, "..", "..", "..", "platform", "src", "modules", "sim");
const GUIDANCE = readFileSync(resolve(PLATFORM, "scene", "guidanceRoute.ts"), "utf8").replace(/\r\n/g, "\n");
const PROBE = readFileSync(resolve(PLATFORM, "devrig", "roadProbe.ts"), "utf8").replace(/\r\n/g, "\n");

const IMPORT_LINE = 'import { createRoadWitness, roadProbePageRead } from "./lib/road-record.mjs";';
const CONSTRUCTION =
  "const roadWitness =\n" +
  '  STEER_BY === "authored-path"\n' +
  "    ? null\n" +
  "    : createRoadWitness(\n" +
  "        Object.freeze((arg) => page.evaluate(roadProbePageRead, arg)),\n" +
  "        Object.freeze({\n" +
  '          enabled: process.env.KNIJKA_ROAD_WITNESS !== "0",\n' +
  "          meta: Object.freeze({ scenario: SCENARIO, platform: PLATFORM, mode: LEG_MODE, steerBy: STEER_BY }),\n" +
  "          log: Object.freeze((line) => note(line)),\n" +
  "          tickBudgetMs: TICK_MS,\n" +
  "        }),\n" +
  "      );";
/** The idle line EXACTLY as the ratified pc-path instrument shipped it (path-follow-wiring W-8 pins it too). */
const IDLE_AS_SHIPPED =
  '  await timed("idle", () => (STEER_BY === "authored-path" && !pathState.done ? pathRun(TICK_MS) : page.waitForTimeout(TICK_MS)));\n';
const TICK_BLOCK =
  "  const roadRead = roadWitness === null ? null : roadWitness.poll();\n" +
  "  // pc-path: the runner replaces ONLY this idle wait (§5.2); right and wrong legs wait as before.\n" +
  IDLE_AS_SHIPPED +
  "  if (roadRead !== null) await roadRead;\n";
const DRIVE_END = "\n}\nif (roadWitness !== null) await roadWitness.poll();\nawait throttle(false);\nawait brake(false);\n";
const FINISH = "\nif (roadWitness !== null) await roadWitness.finish(OUT);\nelse note(";
const PATH_OFF_LINE =
  'else note("  ROAD (witness, baseline — not a verdict): OFF — not constructed on an authored-path (pc-path) leg: the parking instrument runs untouched and no _audit-road.json.gz is written");';
const LOOP_HEAD = "while (!ended && Date.now() - t0 < budgetMs) {\n";
const PROBE_LINE = '  const p = await timed("probe", probe);\n';
const LAST_TICK = "  tickMs.push(Date.now() - tickStart);\n  lastTickAt = Date.now();\n";
const ACTUATION = /keyboard\.|mouse\.|\.press\(|\bsteer\(|\bthrottle\(|\bbrake\(|\bpathRun\(|\btap\(|touchscreen|timed\("probe"|\bprobe\(\)/;

const count = (hay, needle) => hay.split(needle).length - 1;

/** The source with comment lines removed — a comment may NAME the witness. */
function codeLines(src) {
  return src.split("\n").filter((l) => {
    const t = l.trim();
    return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
  });
}

/** lesson-audit's per-tick block, lifted out VERBATIM and made runnable. */
function tickBlock() {
  const i = SRC.indexOf(TICK_BLOCK);
  assert.ok(i > 0, "the per-tick witness block is gone or reshaped");
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  return new AsyncFunction("roadWitness", "timed", "page", "pathRun", "STEER_BY", "pathState", "TICK_MS", SRC.slice(i, i + TICK_BLOCK.length));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timedStub = async (_label, fn) => fn();

describe("§A the sink is handed a narrow reader — never the page — and nothing lesson-audit reads", () => {
  it("is imported once: createRoadWitness and roadProbePageRead, nothing else", () => {
    assert.equal(count(SRC, 'from "./lib/road-record.mjs"'), 1, "road-record is imported more than once, or not at all");
    assert.equal(count(SRC, IMPORT_LINE), 1, `the import is not exactly: ${IMPORT_LINE}`);
  });

  it("is constructed once: null on authored-path, else a frozen reader + frozen options (kill switch, identity, fresh log, tick budget)", () => {
    assert.equal(count(SRC, CONSTRUCTION), 1, "the construction is gone or has been reshaped");
    assert.match(CONSTRUCTION, new RegExp(`process\\.env\\.${ROAD_WITNESS_ENV} !== "0"`));
    assert.ok(SRC.indexOf(CONSTRUCTION) < SRC.indexOf(LOOP_HEAD), "the witness must exist before the drive loop");
    assert.ok(SRC.indexOf("const TICK_MS = ") < SRC.indexOf(CONSTRUCTION), "TICK_MS must be declared before it is handed over");
  });

  it("`page` reaches the sink ONLY inside the reader's body, and `note` only inside the log's body", () => {
    const args = CONSTRUCTION.slice(CONSTRUCTION.indexOf("createRoadWitness("));
    const outsideReader = args.replace("(arg) => page.evaluate(roadProbePageRead, arg)", "READER");
    assert.doesNotMatch(outsideReader, /\bpage\b/, "the page itself is handed to the sink");
    const outsideLog = outsideReader.replace("(line) => note(line)", "LOG");
    assert.doesNotMatch(outsideLog, /\bnote\b/, "lesson-audit's own note() is handed to the sink as an object");
    // Every object handed over is a fresh literal, frozen at the call.
    assert.equal(count(args, "Object.freeze("), 4, "the reader, the options, meta and log are each frozen where they are made");
  });

  it("roadProbePageRead is named once in code: inside the reader", () => {
    const code = codeLines(SRC).join("\n").replace(IMPORT_LINE, "");
    assert.equal(count(code, "roadProbePageRead"), 1);
  });

  it("the sink module itself never names a page: its only door to the browser is the function it is handed", () => {
    // Strings blanked first: a message may say "the page"; code may not name one.
    const code = codeLines(LIB)
      .join("\n")
      .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
    assert.ok(code.includes("export function createRoadWitness(readProbe, opts = {}) {"), "the blanking ate the code it reads");
    assert.doesNotMatch(code, /\bpage\b/, "road-record.mjs names `page` in code");
    assert.doesNotMatch(code, /\.evaluate\(/, "road-record.mjs calls evaluate itself");
  });
});

describe("§B NOT constructed on an authored-path leg — the ratified parking instrument is untouched", () => {
  it("every use is guarded by a null check, and the idle line is byte-for-byte the one that shipped", () => {
    for (const l of codeLines(SRC).filter((x) => /\broadWitness\b/.test(x) && !x.includes("const roadWitness ="))) {
      assert.match(l, /roadWitness === null \?|roadWitness !== null/, `an unguarded use: ${l.trim()}`);
    }
    assert.equal(count(SRC, IDLE_AS_SHIPPED), 1, "the idle wait is not the line the pc-path instrument shipped");
  });

  it("EXECUTED: on an authored-path leg the tick block runs exactly the runner — no read started, nothing awaited, nothing else", async () => {
    const run = tickBlock();
    const calls = [];
    await run(null, async (label, fn) => { calls.push(`timed:${label}`); return fn(); }, { waitForTimeout: async (ms) => calls.push(`wait:${ms}`) }, async (ms) => calls.push(`pathRun:${ms}`), "authored-path", { done: false }, 500);
    assert.deepEqual(calls, ["timed:idle", "pathRun:500"]);
  });

  it("run.log states it in the one ROAD line an authored-path leg gets (no sidecar)", () => {
    assert.equal(count(SRC, FINISH), 1);
    assert.equal(count(SRC, PATH_OFF_LINE), 1);
    assert.ok(SRC.indexOf(PATH_OFF_LINE) > SRC.indexOf(FINISH));
  });
});

describe("§C the per-tick poll: after the tick's last actuation, INSIDE its idle budget", () => {
  it("the block follows the tick's own bookkeeping with no actuation between them", () => {
    const i = SRC.indexOf(TICK_BLOCK);
    assert.ok(i > 0);
    assert.equal(count(SRC, TICK_BLOCK), 1);
    const before = SRC.slice(0, i);
    const lastTick = before.lastIndexOf(LAST_TICK);
    assert.ok(lastTick > 0);
    assert.doesNotMatch(before.slice(lastTick), ACTUATION, "an actuation runs between the tick's bookkeeping and the poll");
    // …and it is followed directly by the pc-path refusal check that shipped:
    // nothing is inserted after the await that could act on what the read left.
    assert.ok(
      SRC.slice(i + TICK_BLOCK.length).startsWith('  if (STEER_BY === "authored-path" && pathState.done) {\n'),
      "a statement now follows the awaited read inside the tick",
    );
  });

  it("lesson-audit reads no global — the one channel a sink could write that no argument carries", () => {
    assert.deepEqual(codeLines(SRC).filter((l) => /\bglobalThis\b|\bglobal\./.test(l)), [], "lesson-audit now reads a global");
  });

  it("no poll between the loop head and the pose probe, nor between the probe and the actuation it feeds", () => {
    const head = SRC.indexOf(LOOP_HEAD);
    const probeAt = SRC.indexOf(PROBE_LINE, head);
    assert.ok(head > 0 && probeAt > head);
    assert.doesNotMatch(SRC.slice(head, probeAt), /roadWitness/, "the witness is read before the pose probe again");
    const pollAt = SRC.indexOf(TICK_BLOCK);
    assert.doesNotMatch(SRC.slice(probeAt, pollAt), /\broadWitness\b/, "the witness is touched between sensing and acting");
    assert.ok(SRC.lastIndexOf(LAST_TICK, pollAt) > probeAt, "the poll must follow the tick's actuation");
  });

  it("EXECUTED: a read that fits the budget does NOT lengthen the tick (period ≈ TICK_MS, not TICK_MS + read)", async () => {
    const run = tickBlock();
    const TICK = 240;
    const READ = 160;
    const dir = mkdtempSync(join(os.tmpdir(), "road-fold-"));
    const w = createRoadWitness(async () => { await sleep(READ); return { present: false, nowMs: 0 }; }, { tickBudgetMs: TICK });
    const page = { waitForTimeout: (ms) => sleep(ms) };
    const t0 = performance.now();
    await run(w, timedStub, page, async () => { throw new Error("the runner ran on a ribbon leg"); }, "ribbon", { done: false }, TICK);
    const withRead = performance.now() - t0;
    const off = createRoadWitness(async () => { throw new Error("a disabled witness read"); }, { enabled: false, tickBudgetMs: TICK });
    const t1 = performance.now();
    await run(off, timedStub, page, null, "ribbon", { done: false }, TICK);
    const withoutRead = performance.now() - t1;
    assert.ok(withRead < TICK + READ / 2, `the read lengthened the tick: ${withRead.toFixed(0)} ms (sequential would be ${TICK + READ})`);
    assert.ok(Math.abs(withRead - withoutRead) < READ / 2, `period with the witness ${withRead.toFixed(0)} ms vs off ${withoutRead.toFixed(0)} ms`);
    await w.finish(dir);
    assert.equal(parseRoadSidecar(readFileSync(join(dir, ROAD_SIDECAR_FILE))).pollBudget.overBudget, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("EXECUTED: a read LONGER than the budget extends that tick only to the read's end, and the sink BOOKS it", async () => {
    const run = tickBlock();
    const TICK = 160;
    const READ = 320;
    const dir = mkdtempSync(join(os.tmpdir(), "road-over-"));
    const w = createRoadWitness(async () => { await sleep(READ); return { present: false, nowMs: 0 }; }, { tickBudgetMs: TICK });
    const t0 = performance.now();
    await run(w, timedStub, { waitForTimeout: (ms) => sleep(ms) }, null, "ribbon", { done: false }, TICK);
    const took = performance.now() - t0;
    assert.ok(took >= READ - 5, "the tick ended before its read — the read would bleed into the next tick");
    assert.ok(took < READ + TICK / 2, `the budget was ADDED to an over-long read: ${took.toFixed(0)} ms`);
    await w.finish(dir);
    const b = parseRoadSidecar(readFileSync(join(dir, ROAD_SIDECAR_FILE))).pollBudget;
    assert.equal(b.polls, 1);
    assert.equal(b.overBudget, 1, "an over-budget read was absorbed silently");
    rmSync(dir, { recursive: true, force: true });
  });

  it("the drive-end poll stamps the watermark as the loop exits, BEFORE the keys are released", () => {
    assert.equal(count(SRC, DRIVE_END), 1, "the drive-end poll is not the first statement after the loop, before throttle(false)/brake(false)");
    assert.ok(SRC.indexOf(DRIVE_END) > SRC.lastIndexOf(LAST_TICK), "the drive-end poll must follow the whole drive loop");
  });

  it("finishes once, after the drive's DRIVE line", () => {
    const drive = SRC.indexOf("`  DRIVE: ${LEG_MODE}");
    assert.ok(drive > SRC.indexOf(DRIVE_END) && SRC.indexOf(FINISH) > drive, "finish must follow the DRIVE line, which follows the drive-end poll");
  });
});

describe("§D lesson-audit holds a SINK and does nothing else with it", () => {
  it("roadWitness is named in code ONLY by its construction, the per-tick poll, the drive-end poll and the finish", () => {
    const hits = codeLines(SRC).filter((l) => /\broadWitness\b/.test(l)).map((l) => l.trim());
    assert.deepEqual(
      hits,
      [
        "const roadWitness =",
        "const roadRead = roadWitness === null ? null : roadWitness.poll();",
        "if (roadWitness !== null) await roadWitness.poll();",
        "if (roadWitness !== null) await roadWitness.finish(OUT);",
      ],
      "an alias, a global or another use of the witness",
    );
    // …and the per-tick promise is only awaited, never read.
    assert.deepEqual(codeLines(SRC).filter((l) => /\broadRead\b/.test(l)).map((l) => l.trim()), [
      "const roadRead = roadWitness === null ? null : roadWitness.poll();",
      "if (roadRead !== null) await roadRead;",
    ]);
  });

  it("no other road-record export is referenced anywhere in lesson-audit's code", () => {
    const allowed = new Set(["createRoadWitness", "roadProbePageRead"]);
    const code = codeLines(SRC).join("\n").replace(IMPORT_LINE, "");
    for (const name of Object.keys(RR)) {
      if (allowed.has(name)) continue;
      assert.doesNotMatch(code, new RegExp(`\\b${name}\\b`), `${name} is referenced outside the sink`);
    }
  });

  it("the probe itself is never named in lesson-audit's code — only in the witness block's comment", () => {
    assert.deepEqual(codeLines(SRC).filter((l) => l.includes("__roadProbe")), []);
  });

  it("the pc-path RULING-1 exception is not widened: «WHY THE PIXELS» still names only the authored-path leg", () => {
    assert.match(SRC, /EXCEPTION: authored-path leg — see PATH_TESTIMONY in lib\/path-follow\.mjs;/);
    assert.match(SRC, /The RULING-1 exception for the\n \* pc-path leg's pose input is NOT widened to it\./);
  });
});

describe("§E the product facts the reader relies on have not drifted", () => {
  it("the route pitch and the 3-tap pass the kink reach is built from are the product's", () => {
    const m = GUIDANCE.match(/const DENSIFY_STEP_M = (\d+(?:\.\d+)?);/);
    assert.ok(m, "DENSIFY_STEP_M is no longer declared in guidanceRoute.ts");
    assert.equal(Number(m[1]), GUIDANCE_DENSIFY_STEP_M);
    assert.match(GUIDANCE, /sx\[i\] = xs\[i - 1\] \* 0\.25 \+ xs\[i\] \* 0\.5 \+ xs\[i \+ 1\] \* 0\.25;/, "finalizeRoute's one 3-tap pass changed");
    assert.equal(count(GUIDANCE, "One gentle 3-tap pass"), 1, "a second smoothing pass would widen the reach");
    assert.equal(SPAN_KINK_REACH_M, 2 * GUIDANCE_DENSIFY_STEP_M);
  });

  it("the product publishes the lane-align span on every derived route, from the marks the shift used", () => {
    assert.match(GUIDANCE, /laneAlign\?: LaneAlignSpan \| null;/);
    assert.match(GUIDANCE, /return \{ pts, arc, count, totalLen, turns, goalS, laneAlign \};/);
    assert.match(GUIDANCE, /legStartIdx: lastAtOrBefore\(legStartS\),\n {4}rampEndIdx: firstAtOrAfter\(legStartS \+ rampIn\),/);
    assert.match(GUIDANCE, /holdToIdx: lastAtOrBefore\(holdToS\),\n {4}decayEndIdx: firstAtOrAfter\(holdToS \+ LANE_ALIGN_RAMP_M\),/);
  });

  it("the probe copies laneAlign onto the published route, absent staying absent", () => {
    assert.match(PROBE, /if \(route\.laneAlign !== undefined\) r\.laneAlign = laneAlignRecordOf\(route\.laneAlign\);/);
  });

  it("the probe version this reader was written against is the product's", () => {
    const m = PROBE.match(/export const ROAD_PROBE_VERSION = (\d+);/);
    assert.ok(m);
    assert.equal(Number(m[1]), ROAD_PROBE_VERSION_READ);
  });
});
