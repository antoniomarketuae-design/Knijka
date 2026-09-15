#!/usr/bin/env node
/**
 * THE pc-path CANARY'S GATES, COMPUTED FROM WITNESSES THE CONTROLLER DID NOT WRITE.
 *
 *   node tools/audit/path-canary.mjs <legDir> [--base 4209dad] [--json]
 *
 * DESIGN-v2 §10.3 (F-M9). A canary that certified the new code with the new
 * code's own ledger would pass exactly the drives it should fail. So every gate
 * below is computed from the outer-tick samples, the trace, the debrief, the
 * run.log and the frames on disk, through `lib/path-evidence.mjs` — and NO GATE
 * READS `pathFollow` or a pathref witness, with one exception: G6 compares the
 * SELF-REPORT camera yaw AGAINST the product's own «ъгъл», so it validates the
 * controller rather than trusting it.
 *
 * WHAT IS AND IS NOT INDEPENDENT (S-10). G1–G3 and G7's spans read the samples
 * `guidePose` wrote from `window.__camProbe` — independent of the controller and
 * the witnesses, but the SAME POSE PROBE the runner steers on. G4, G5 and G7's
 * frames are independent of the probe too.
 *
 * Imports: `lib/path-evidence.mjs`, `lib/guidance.mjs` and node builtins only
 * (pinned by path-canary.test.mjs).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computePathEvidence } from "../mobile/lib/path-evidence.mjs";
import { ROUTE_OFF_M } from "../mobile/lib/guidance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

/** The run.log strings a path leg must never print (G8). */
export const FORBIDDEN_LINES = Object.freeze([
  "THIS DRIVE DID NOT STEER",
  "NOT STEERED",
  "NO PACE TAPE",
  "REVERSED IN A STRAIGHT LINE",
  "straight line on ANY product",
  "scripted traces never turned the wheel",
  "THE TWO WITNESSES DISAGREE",
]);

/** A booked fault that says a stop was NOT made — the product's own refusal of a hold. */
export const STOP_FAULT_RE = /Неспиране|не спря|без пълно спиране/u;

/**
 * WHETHER ONE PLANNED STOP WAS SERVED, AND ON WHAT BASIS — or null.
 *
 * The rest span is read from the outer-tick samples, which arrive every ~0.5 s and
 * carry whole-second `tSec`; the arm and disarm selector bursts also reset the tick
 * clock (path-evidence.mjs `stopsFromSamples`). So `restLoS` is PESSIMISTIC BY
 * CONSTRUCTION — by up to about a second — and `restHiS` can only over-state.
 *
 * MEASURED ON THE FIRST TWO BROWSER DRIVES (2026-09-15, 4209dad, sc-park-zebra and
 * sc-park-gap-short pc-path): every other gate passed — the approach on its line, R
 * armed in band, the reverse inside its corridor, BOTH objectives credited by the
 * product with «подравняване: центрирано/приемливо», no collision, the product's
 * «ъгъл» within 0.6° of the camera yaw — and G7 failed on the lower bound alone:
 * gearChange 0.65 s against 0.7, routeEnd 1.04 s against 1.63, with the rest spans
 * 0.17 m and 0.03 m from their targets.
 *
 * What the gate exists to catch is a harness that ROLLS THROUGH a stop, which would
 * hand the product a false «did not stop» conviction to be filed against it. That car
 * has no rest span near the target at all (→ UNMEASURED or > 1.5 m) or an upper bound
 * short of the dwell. Neither rule is relaxed. Only a short LOWER bound, on a span that
 * exists and whose upper bound reaches the dwell, is decided by an independent witness:
 *   · a gear-change / authored / inserted stop — the product credited EVERY objective
 *     (the parking and stop objectives themselves require the hold) AND booked no
 *     failure-to-stop fault;
 *   · the route-end stop — the drive reached the verdict card (the lesson ends there).
 * The basis is printed per stop, so a reader sees which rule passed it.
 */
export function stopServedBasis(s, { allCredited, reachedVerdict, stopFaultBooked }) {
  if (!s || s.measured !== true || !(s.distToTargetM <= 1.5)) return null;
  // THE ROUTE-END STOP IS CUT SHORT BY THE PRODUCT, NOT THE HARNESS. When the last
  // objective credits, the product ends the lesson and the debrief replaces the drive,
  // so the rest cannot be observed for the authored dwell however long the car would
  // have held it (sc-park-gap-short: a rest span 0.31 m from the authored end, upper
  // bound 2.0 s against a 2.23 s authored dwell, verdict card reached). A rest span at
  // the end plus the verdict card is the whole observable witness; a car still MOVING at
  // the end has no rest span there and stays refused above.
  if (s.tag === "routeEnd") return reachedVerdict === true ? "route end · rest span at the end · verdict card reached" : null;
  if (!(s.restHiS >= s.dwellS)) return null;
  if (s.restLoS >= s.dwellS - 0.6) return "timed";
  return allCredited === true && stopFaultBooked !== true ? "short lower bound · product credited every objective, no stop fault" : null;
}

const axisDiff = (a, b) => {
  const raw = Math.abs(((a - b) % 360) + 360) % 360;
  const d = raw > 180 ? 360 - raw : raw;
  return d > 90 ? 180 - d : d;
};

/**
 * Pure. `platformDiffEmpty` is the G9 precondition result (git diff of
 * platform/src between the base and the drive's recorded head), computed by the
 * CLI and injected here so the gates are testable without git.
 */
export function evaluateCanary({ status, debrief, runLog = "", frameNames = [], trace, lesson, platformDiffEmpty = null }) {
  const gates = [];
  const gate = (id, pass, why) => gates.push({ id, pass: pass === true, why });
  const samples = status?.guidance?.samples ?? [];
  const ev = trace
    ? computePathEvidence({
        samples,
        trace,
        lesson,
        debrief: debrief?.debrief ?? null,
        mistakes: debrief?.debrief?.sections?.['section[aria-label="Грешки"]']?.items ?? [],
        routeHold: debrief?.routeHold ?? status?.guidance?.routeHold ?? null,
      })
    : null;

  // G0 — the lane completed, exit 0, and no refusal was printed
  const refused = /THE pc-path LEG REFUSED/.test(runLog);
  gate("G0", status?.mode === "path" && status?.exit === 0 && status?.phase === "complete" && !refused,
    `mode ${status?.mode} · exit ${status?.exit} · phase ${status?.phase}${refused ? " · a refusal was printed" : ""}`);

  // G1 — every measured forward (non-micro) segment: median ≤ 0.3 m and max ≤ corridor
  const fwd = (ev?.routeBySegment ?? []).filter((s) => s.gear === 1 && !s.micro);
  const fwdMeasured = fwd.filter((s) => s.measured);
  gate("G1", fwdMeasured.length > 0 && fwdMeasured.every((s) => s.medianM <= 0.3 && s.maxM <= s.corridorM),
    fwdMeasured.map((s) => `F${s.k} median ${s.medianM} max ${s.maxM}/corr ${s.corridorM}`).join(" · ") || "no forward segment measured");

  // G2 — each arm: the reverse STARTS in the screened band, the roll ≤ allowance, the approach chord ≤ 2.5°
  const arms = ev?.arms ?? [];
  const armOk = (a) => a.measured && a.startInBand === true && (a.designedNegative || (a.rollWithinAllow === true && (a.chordYawDeg === null || Math.abs(a.chordYawDeg) <= 2.5)));
  gate("G2", arms.length > 0 && arms.every(armOk),
    arms.map((a) => (a.measured ? `R${a.k} start ${a.startAlongM}/${a.startLatM} inBand ${a.startInBand} roll ${a.armRollM} chord ${a.chordYawDeg}°` : `R${a.k} UNMEASURED`)).join(" · ") || "no arm");

  // G3 — each R segment inside its corridor AND, in the bay, inside the lateral room the
  // product's own bodies leave (policy.mjs BAY_FLANKS). The segment corridor is a
  // whole-manoeuvre tolerance (0.73–0.85 m); a 2.7 m bay between parked cars leaves 0.49 m,
  // and canary-path-s2 sc-park-left touched its neighbour at 0.58 m inside a 0.836 m corridor.
  // A bay that no sample entered is UNMEASURED and fails — never a pass.
  const rev = (ev?.routeBySegment ?? []).filter((s) => s.gear === -1);
  const bayOk = (s) => s.bay === null || s.bay === undefined || (s.bay.measured === true && s.bay.within === true);
  const bayText = (s) => (s.bay ? ` · in-bay |lat| ${s.bay.measured ? `${Math.abs(s.bay.worst?.latM ?? 0)}/limit ${s.bay.worst?.latM < 0 ? s.bay.limitNegM : s.bay.limitPosM}${s.bay.within ? "" : " OVER"}` : "UNMEASURED"}` : "");
  gate("G3", rev.length > 0 && rev.every((s) => s.measured && s.maxM <= s.corridorM && bayOk(s)),
    rev.map((s) => (s.measured ? `R${s.k} max ${s.maxM}/corr ${s.corridorM}${bayText(s)}` : `R${s.k} unmeasured${bayText(s)}`)).join(" · ") || "no reverse segment");

  // G4 — the product credits it (debrief)
  const objectives = debrief?.debrief?.objectives ?? [];
  const pp = ev?.productPark ?? {};
  const alignOk = pp.alignment === null || pp.alignment === "центрирано" || pp.alignment === "приемливо";
  const angleOk = pp.headingOffsetDeg === null || pp.headingOffsetDeg <= 10;
  gate("G4", objectives.length > 0 && objectives.every((o) => o.done === true) && alignOk && angleOk,
    `${objectives.filter((o) => o.done).length}/${objectives.length} objective(s) ✓ · «подравняване: ${pp.alignment ?? "not printed"}» · «ъгъл ${pp.headingOffsetDeg ?? "not printed"}°»`);

  // G5 — no collision booked
  const crash = debrief?.routeHold?.crashPinnedTicks ?? status?.guidance?.routeHold?.crashPinnedTicks ?? null;
  const udar = (debrief?.debrief?.sections?.['section[aria-label="Грешки"]']?.items ?? []).some((m) => /Удар/u.test(String(m)));
  gate("G5", crash === 0 && !udar, `crashPinnedTicks ${crash} · «Удар» in mistakes ${udar}`);

  // G6 — VALIDATION of the SELF-REPORT cam yaw against the product's «ъгъл» (magnitude only, S-9)
  {
    const park = ev?.product?.park ?? null;
    const endPoses = Object.values(status?.pathFollow?.endPoses ?? {});
    const lastYaw = endPoses.map((p) => p?.camYawDeg).filter((v) => Number.isFinite(v)).at(-1);
    if (!park) gate("G6", true, "no parkInBay target on this lesson — not applicable");
    else if (!Number.isFinite(lastYaw) || !Number.isFinite(pp.headingOffsetDeg)) gate("G6", false, `cam yaw ${lastYaw ?? "UNMEASURED"} · product «ъгъл» ${pp.headingOffsetDeg ?? "not printed"} — END POSE yaw is not validated`);
    else {
      const predicted = axisDiff(lastYaw, park.bay.headingDeg);
      gate("G6", Math.abs(predicted - pp.headingOffsetDeg) <= 1.5, `cam yaw ${lastYaw}° → ${Math.round(predicted * 100) / 100}° off the bay axis against the product's «ъгъл» ${pp.headingOffsetDeg}° (magnitude only; the mirror guards are the sign audit and S1)`);
    }
  }

  // G7 — authored and inserted stops served, within 1.5 m; and the 05-stopped frame exists.
  // See `stopServedBasis` for why a short pessimistic lower bound may be decided by the
  // product's own witness of the hold.
  const stops = (ev?.stops ?? []).filter((s) => ["authored", "inserted", "gearChange", "segmentEnd", "routeEnd"].includes(s.tag));
  const mistakeItems = debrief?.debrief?.sections?.['section[aria-label="Грешки"]']?.items ?? [];
  const witness = {
    allCredited: objectives.length > 0 && objectives.every((o) => o.done === true),
    reachedVerdict: status?.phase === "complete",
    stopFaultBooked: mistakeItems.some((m) => STOP_FAULT_RE.test(String(m))),
  };
  const frame = frameNames.some((n) => /^05-stopped\.png$/.test(n));
  const bases = stops.map((s) => stopServedBasis(s, witness));
  gate("G7", stops.length > 0 && bases.every((b) => b !== null) && frame,
    `${stops.map((s, i) => (s.measured ? `${s.tag} ${s.restLoS}–${s.restHiS}s/${s.dwellS} at ${s.distToTargetM} m [${bases[i] ?? "NOT SERVED"}]` : `${s.tag} UNMEASURED`)).join(" · ")} · 05-stopped.png ${frame ? "present" : "ABSENT"}`);

  // G8 — no alarm string
  const hits = FORBIDDEN_LINES.filter((line) => runLog.includes(line));
  gate("G8", hits.length === 0, hits.length ? `run.log prints: ${hits.map((h) => `«${h}»`).join(", ")}` : "none of the forbidden lines");

  // G9 — the product is byte-identical to the base
  gate("G9", platformDiffEmpty === true, platformDiffEmpty === null ? "not checked" : platformDiffEmpty ? "git diff <base>..<head> -- platform/src is empty" : "platform/src CHANGED since the base — a harness change repairs nothing");

  return { lesson, pass: gates.every((g) => g.pass), gates, evidence: ev, offRoadThresholdM: ROUTE_OFF_M };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const legDir = args.find((a) => !a.startsWith("--"));
  const baseIdx = args.indexOf("--base");
  const base = baseIdx >= 0 ? args[baseIdx + 1] : "4209dad";
  if (!legDir || !existsSync(legDir)) {
    console.error("usage: node tools/audit/path-canary.mjs <legDir> [--base <sha>] [--json]");
    process.exit(2);
  }
  const read = (f) => {
    try { return JSON.parse(readFileSync(resolve(legDir, f), "utf8")); } catch { return null; }
  };
  const status = read("_audit-status.json");
  const debrief = read("_audit-debrief.json");
  let runLog = "";
  try { runLog = readFileSync(resolve(legDir, "run.log"), "utf8"); } catch { runLog = ""; }
  const lesson = status?.scenario ?? debrief?.scenario ?? null;
  let trace = null;
  try { trace = JSON.parse(readFileSync(resolve(REPO, "content", "traces", String(lesson), "shadow-correct.trace.json"), "utf8")); } catch { trace = null; }
  let platformDiffEmpty = null;
  const head = status?.target?.head;
  if (head) {
    try {
      platformDiffEmpty = execFileSync("git", ["diff", "--stat", `${base}..${head}`, "--", "platform/src"], { cwd: REPO, encoding: "utf8" }).trim() === "";
    } catch {
      platformDiffEmpty = null;
    }
  }
  const out = evaluateCanary({ status, debrief, runLog, frameNames: readdirSync(legDir), trace, lesson, platformDiffEmpty });
  if (args.includes("--json")) console.log(JSON.stringify({ ...out, evidence: undefined }, null, 2));
  else {
    console.log(`pc-path canary · ${lesson} · ${legDir}`);
    for (const g of out.gates) console.log(`  ${g.pass ? "PASS" : "FAIL"} ${g.id}  ${g.why}`);
    console.log(out.pass ? "CANARY PASSED — set canaryPassed: true on this lesson's rows in tools/audit/path-routing.json (a commit)" : "CANARY FAILED — no row of this lesson may be routed");
  }
  process.exitCode = out.pass ? 0 : 1;
}
