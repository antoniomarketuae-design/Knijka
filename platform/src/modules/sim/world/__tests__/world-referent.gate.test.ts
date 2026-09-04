/**
 * scenario-world-referent — THE GATE (doc 86 §10, §11).
 *
 * One sentence, made machine-checkable: *a scenario may not grade something
 * its world does not contain.*
 *
 * WAVE 1: ENFORCING. Wave 0 ran report-only so fourteen lanes could watch their
 * own counts fall; they have, so the gate now fails instead of narrating.
 *
 *   1. the falsehood budget — a code that CONVICTS a student on a world with no
 *      referent. A code absent from expected-failures.json's `falsehoodBudget`
 *      must be at zero. That is the flip. The budget drains itself: a code
 *      below its committed numbers fails too, with the number to write back.
 *   2. the census ratchet — every class must EQUAL its committed number, may
 *      not exceed doc 86's published figure, and may not exceed its wave-0
 *      number without a written entry in `raised`.
 *   3. allowlist hygiene — an allowlisted entry that starts passing fails, so
 *      the list can only shrink.
 *
 * `WORLD_REFERENT_GATE=report` restores the wave-0 behaviour for a bisect.
 *
 * NOT enforced, and said out loud in the report footer: the INERT band. An
 * inert code is a declared surface the world can never arm — a broken lesson,
 * not a lie — and L12 already carries that class.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { COMMENDATIONS, VIOLATIONS } from "../../rules";
import {
  DEFERRED,
  LEDGER_BASELINE,
  NO_WORLD_REFERENT,
  REFERENT_RULES,
  allFaultCodes,
  censusLines,
  formatBlock,
  runWorldReferentGate,
  worldFactsFor,
  type CodeViolation,
  type FaultCode,
  type GateResult,
  type LedgerDefectId,
} from "../referents";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_FILE = path.join(HERE, "expected-failures.json");

interface AllowEntry {
  scenario: string;
  rung: number;
  code: string;
  reason: string;
  owner: string;
  issue: string;
}
interface BudgetEntry {
  scenarios: number;
  rungs: number;
  ledger: string;
  owner: string;
  reason: string;
}
interface AllowFile {
  waveZero: Record<string, number | null>;
  census: Record<string, number>;
  raised: Record<string, string>;
  falsehoodBudget: Record<string, BudgetEntry>;
  allowlist: AllowEntry[];
}

const allow = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, "utf8")) as AllowFile;

/** Wave 1 flipped the default. `=report` restores wave-0 behaviour for a bisect. */
const ENFORCING = process.env.WORLD_REFERENT_GATE !== "report";
/** How many §10-format blocks to print. The full sweep produces thousands. */
const BLOCKS = Number(process.env.WORLD_REFERENT_GATE_BLOCKS ?? 14);

const RESULT: GateResult = runWorldReferentGate();

const keyOf = (v: CodeViolation) => `${v.scenarioId}@L${v.level}|${v.code}`;

// ---------------------------------------------------------------------------
// O42 — the independent measurement behind the SPEED_TOO_FAST_FOR_CURVE budget
// ---------------------------------------------------------------------------

/** A post is "on" an edge when it projects within this of the centreline —
 *  referents.ts uses the same 20 m for the same question. */
const POST_ON_EDGE_M = 20;
/** Two edges are ONE road for a warning's purposes when the heading break
 *  across their join is inside this; zoneSigns.ts places against the same
 *  number (UPSTREAM_HEADING_BREAK_DEG) and measured 0.0° at the mw-exit gore. */
const UPSTREAM_BREAK_DEG = 20;

/**
 * How far BEFORE a hazard span its warning post stands — measured along the
 * road the DRIVER drives, which is the question „warned in advance" means and
 * the question `REFERENT_RULES.SPEED_TOO_FAST_FOR_CURVE` does not ask (O42).
 *
 * Derived here from the BUILT world (`worldFactsFor` — the same signs and the
 * same index the gate reads), deliberately independently of both other
 * instruments in the tree, so an agreement between them is evidence:
 *   · zoneSigns.ts `warningStation` PLACES against this rule;
 *   · builders/__tests__/hazard-warning-advance.test.ts `advanceM` measures it
 *     from the authored district files through `buildZoneSigns`;
 *   · this reads it back off the built geometry.
 * All three say 61.0 m for mw-exit-v1's А1, on `mwx-e-nb-decel`.
 */
function drivenPathAdvanceM(
  districtId: string,
  zoneId: string,
): { leadM: number; hostEdgeId: string; postAtM: number } | null {
  const w = worldFactsFor(districtId);
  const zone = (w.district.zones ?? []).find((z) => z.id === zoneId);
  if (!zone) return null;
  const own = w.index.edgeRtById(zone.edgeId);
  if (!own) return null;
  const posts = w.signs.filter((s) => s.kind === "curve" || s.kind === "slippery");
  const headX = own.pts[0]!;
  const headY = own.pts[1]!;
  const headTanX = own.pts[2]! - headX;
  const headTanY = own.pts[3]! - headY;
  let best: { leadM: number; hostEdgeId: string; postAtM: number } | null = null;
  for (const rt of w.index.edges) {
    const isOwn = rt.edge.id === zone.edgeId;
    if (!isOwn) {
      // A candidate approach must FLOW INTO the hazard edge's head (the join is
      // inside its own drawn cross-section) and must CONTINUE rather than turn.
      const n = rt.pts.length;
      const ex = rt.pts[n - 2]!;
      const ey = rt.pts[n - 1]!;
      if (Math.hypot(ex - headX, ey - headY) > rt.halfWidthM) continue;
      let d =
        ((Math.atan2(headTanY, headTanX) - Math.atan2(ey - rt.pts[n - 3]!, ex - rt.pts[n - 4]!)) *
          180) /
        Math.PI;
      while (d > 180) d -= 360;
      while (d <= -180) d += 360;
      if (Math.abs(d) > UPSTREAM_BREAK_DEG) continue;
    }
    for (const p of posts) {
      const hit = w.index.projectOnEdge(rt.idx, p.at.x, p.at.y, {
        edgeIdx: -1,
        distM: Infinity,
        sM: 0,
        latSignedM: 0,
        tanX: 0,
        tanY: 1,
        outsideM: Infinity,
      });
      if (hit.distM > POST_ON_EDGE_M) continue;
      const leadM = isOwn ? zone.fromM - hit.sM : rt.totalLen - hit.sM + zone.fromM;
      if (!best || leadM > best.leadM) {
        best = { leadM, hostEdgeId: rt.edge.id, postAtM: hit.sM };
      }
    }
  }
  return best;
}

function wrap(s: string, width: number): string[] {
  const words = s.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if (line.length + w.length + 1 > width) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

// ---------------------------------------------------------------------------
// The printed report — this is the deliverable of wave 0
// ---------------------------------------------------------------------------

function report(): string {
  const L: string[] = [];
  const push = (s = "") => L.push(s);

  push();
  push("=".repeat(78));
  push(`scenario-world-referent gate — ${ENFORCING ? "ENFORCING" : "REPORT ONLY"} (doc 86 §10)`);
  push("=".repeat(78));

  // -- where the gate DISAGREES with the document it implements -------------
  push();
  push("-- corrections to doc 86, measured -------------------------------------------");
  push(
    `  · the catalog is ${RESULT.scenarios} templates / ${RESULT.rungs} rungs, not 154 / 660. ` +
      "The ledger's own",
  );
  push(
    "    catalog-order table (positions 1, 6, 9, 20, 29, 37, 46, 50) reproduces EXACTLY at " +
      `${RESULT.scenarios},`,
  );
  push(
    "    and s2-catalog-integrity.test.ts:19 pins 155 by name — so the headline is off by one,",
  );
  push("    not the walk. Every per-class figure below was checked at 155.");
  push(
    "  · T3: doc 86 says \"nine of eleven passSignal objectives author x:0, y:0\" and then names a " +
      "set",
  );
  push(
    "    that is not the (0,0) set — sc-sig-green-wave twice (sc-sgw-tl3 is at (0,528)) and no",
  );
  push(
    "    sc-ln-turn-lane-arrows. Both readings are in the table: T3 = 9 (the literal (0,0) " +
      "criterion,",
  );
  push(
    `    reproduced) and T3b = ${RESULT.census.get("T3b")} (markers actually past the graded cut — one more than the`,
  );
  push("    ledger, because its named list dropped sc-ln-turn-lane-arrows/sc-lnta-signal).");
  push(
    `  · B1: doc 86 says ten scenarios have no automatic finish. routeFinishZone returns null for ` +
      `${RESULT.census.get("B1")} —`,
  );
  push("    see the cause breakdown; it counts one of three causes.");
  push(
    "  · T3 sits at 9 on purpose. It reproduces doc 86's AUTHORED-coordinate criterion and is the",
  );
  push(
    "    gate's agreement proof. Lane 2 made the class unauthorable instead of re-authoring nine",
  );
  push(
    `    templates, so what SHIPS is T3b = ${RESULT.census.get("T3b")}. Expect this row at 9 forever.`,
  );
  push(
    `  · B4 = ${RESULT.census.get("B4")} because the evaluator probe passes ` +
      `(memory ${RESULT.reachZoneProbe.memory}, voice ${RESULT.reachZoneProbe.voice}).`,
  );
  push(
    `    One stateless stepReachZone broke all ${RESULT.census.get("B4raw")} at once; one latch repaired all of them.`,
  );

  const lies = RESULT.violations.filter((v) => v.band === "falsehood");
  const inerts = RESULT.violations.filter((v) => v.band === "inert");

  // -- a bounded sample of the §10 failure block, one per code, from the
  //    teaches-falsehood band and spread across distinct scenarios ----------
  const bySample = new Map<string, CodeViolation>();
  const seenScenarios = new Set<string>();
  for (const pass of [0, 1]) {
    for (const v of lies) {
      if (bySample.has(v.code)) continue;
      // First pass takes one block per scenario so the sample is not eight
      // views of the same map; the second fills the remaining codes.
      if (pass === 0 && seenScenarios.has(v.scenarioId)) continue;
      bySample.set(v.code, v);
      seenScenarios.add(v.scenarioId);
    }
  }
  const sample = [...bySample.values()].slice(0, BLOCKS);
  push();
  push(
    `-- sample failure blocks: teaches-falsehood band (${sample.length} of ${lies.length}; ` +
      `set WORLD_REFERENT_GATE_BLOCKS to widen) --`,
  );
  for (const v of sample) {
    push();
    push(formatBlock(v, RESULT.s1.get(v.scenarioId) ?? []));
  }

  // -- per-code table -------------------------------------------------------
  interface CodeRow {
    lieRungs: number;
    lieScen: Set<string>;
    inertRungs: number;
    inertScen: Set<string>;
  }
  const perCode = new Map<FaultCode, CodeRow>();
  for (const v of RESULT.violations) {
    const e =
      perCode.get(v.code) ??
      ({ lieRungs: 0, lieScen: new Set(), inertRungs: 0, inertScen: new Set() } as CodeRow);
    if (v.band === "falsehood") {
      e.lieRungs += 1;
      e.lieScen.add(v.scenarioId);
    } else {
      e.inertRungs += 1;
      e.inertScen.add(v.scenarioId);
    }
    perCode.set(v.code, e);
  }
  push();
  push("-- per-code referent failures ------------------------------------------------");
  push("   a FALSEHOOD fires anyway and convicts the student; an INERT one can never fire.");
  push("  code                              falsehood(scen/rung)    inert(scen/rung)");
  const rows = [...perCode.entries()].sort((a, b) => b[1].lieScen.size - a[1].lieScen.size);
  for (const [code, e] of rows) {
    push(
      `  ${code.padEnd(32)}` +
        `${`${e.lieScen.size}/${e.lieRungs}`.padStart(20)}` +
        `${`${e.inertScen.size}/${e.inertRungs}`.padStart(20)}`,
    );
  }
  const clean = Object.keys(REFERENT_RULES).filter((c) => !perCode.has(c as FaultCode));
  push(`  (${clean.length} checked codes never failed: ${clean.join(", ") || "none"})`);

  // -- the ledger census ----------------------------------------------------
  push();
  push("-- doc 86 ledger census ------------------------------------------------------");
  push("  id    unit         measured   ledger   status");
  for (const c of censusLines(RESULT)) {
    const mark = c.precise ? " *" : "  ";
    push(
      `  ${c.id.padEnd(5)} ${c.unit.padEnd(12)}${String(c.measured).padStart(8)}` +
        `${String(c.ledger ?? "—").padStart(9)}   ${c.status}${mark}`,
    );
    push(`          ${c.what}`);
    if (c.ledgerNote) {
      for (const chunk of wrap(c.ledgerNote, 84)) push(`          ! ${chunk}`);
    }
  }
  push("  * = doc 86 §10 counts this class to ±0; the gate reproduces it exactly.");
  push(
    `  T1 districts = ${RESULT.t1DistrictsAllFiles} of ${RESULT.districtFiles} files ` +
      `(ledger: 62 of 90) · ${RESULT.t1Districts} of them are referenced by a scenario`,
  );
  push(`  T2 districts = ${RESULT.t2Districts} (ledger: 15)`);
  push();
  push("  B1 cause breakdown (doc 86 counts only the first line):");
  const causes = new Map<string, number>();
  for (const c of RESULT.b1Cause.values()) causes.set(c, (causes.get(c) ?? 0) + 1);
  for (const [cause, n] of [...causes.entries()].sort((a, b) => b[1] - a[1])) {
    push(`    ${String(n).padStart(3)}  ${cause}`);
  }

  // -- structural assertions ------------------------------------------------
  push();
  push("-- Part B structural assertions ----------------------------------------------");
  push(`  S1 GUIDANCE TRUTH       ${RESULT.census.get("S1")} markers past a graded stop line`);
  for (const [id, fs2] of RESULT.s1) {
    for (const f of fs2) {
      push(
        `      ${id} obj ${f.objectiveIndex + 1} "${f.objectiveId}" (${f.kind}) — ` +
          `${f.pastByM.toFixed(2)} m PAST ${f.lineId}`,
      );
    }
  }
  push(`  S2 SPAWN LEGALITY       ${RESULT.s2Fail.length} scenarios spawn already in violation`);
  push(`  S3 TERMINABILITY        ${RESULT.s3Fail.size} scenarios (static half only — see DEFERRED)`);
  push(`  S4 RUNG DISTINCTNESS    ${RESULT.s4Fail.size} scenarios have two identical rungs`);
  push(`  S5 SURVIVABLE COMPLY    ${RESULT.s5Fail.size} scenarios where obeying the cap hits the walker`);
  for (const [id, fs3] of RESULT.s5Fail) {
    for (const f of fs3) {
      push(`      ${id}/${f.eventId}: at the objective's own ${f.capKmh} km/h cap, closest approach ${f.closestM.toFixed(2)} m`);
    }
  }

  push();
  push("-- NOT implemented in wave 0 (named, not hidden) -----------------------------");
  for (const d of DEFERRED) {
    push(`  · ${d.what}`);
    push(`      needs: ${d.needs}`);
  }

  // -- footer (doc 86 §10) --------------------------------------------------
  const lieScen = new Set(lies.map((v) => v.scenarioId)).size;
  const sClass =
    (RESULT.census.get("S1") ?? 0) +
    RESULT.s2Fail.length +
    RESULT.s3Fail.size +
    RESULT.s4Fail.size +
    RESULT.s5Fail.size;
  push();
  push(
    `world-referent gate: ${RESULT.scenarios} scenarios x ${RESULT.rungs} rungs | ` +
      `${RESULT.codesChecked} codes checked, ${RESULT.codesExempt} exempt`,
  );
  push(
    `  FAIL  teaches-falsehood ${lies.length} rung-codes across ${lieScen} scenarios` +
      `   S-class (structural) ${sClass}`,
  );
  push(
    `  INERT ${inerts.length} rung-codes — a declared surface the world can never arm ` +
      `(broken lessons, not lies). NOT ENFORCED: see L12.`,
  );
  push(`  total referent failures ${RESULT.violations.length}`);
  const budgeted = Object.entries(allow.falsehoodBudget);
  push(
    `  falsehood budget ${budgeted.length} code(s), ` +
      `${budgeted.reduce((n, [, b]) => n + b.rungs, 0)} rung-codes — every other code is ENFORCED at zero:`,
  );
  for (const [code, b] of budgeted.sort((a, b) => b[1].rungs - a[1].rungs)) {
    push(`    ${code.padEnd(28)} ${`${b.scenarios}/${b.rungs}`.padStart(8)}  ${b.ledger} · ${b.owner}`);
  }
  // O42 — the one budgeted code whose fault is in the PREDICATE, printed here
  // because `rule.fixIn` (referents.ts, not this lane's file) still routes
  // every reader to a builder that was fixed on 2026-08-19, which is where
  // several rounds of „move the sign" work went. Prints only while the dispute
  // exists, so it disappears with the entry.
  if (allow.falsehoodBudget.SPEED_TOO_FAST_FOR_CURVE) {
    push(
      "  ! SPEED_TOO_FAST_FOR_CURVE: its fixIn still names world/builders/zoneSigns.ts:129. That",
    );
    push(
      "    is DONE — the А1 stands 61.0 m before the arc on mwx-e-nb-decel (s=219.0 of 280), and",
    );
    push(
      "    the fault left is the predicate: it projects posts onto the zone's OWN edge only, and",
    );
    push(
      "    mwx-z-ramp-curve starts at fromM 0, so `fromM - sM` is <= 0 for every placement there.",
    );
  }
  push(
    `  allowlisted ${allow.allowlist.length}   newly-passing allowlist entries ` +
      `${allow.allowlist.filter((a) => !RESULT.violations.some((v) => keyOf(v) === `${a.scenario}@L${a.rung}|${a.code}`)).length}`,
  );
  push(`  mode: ${ENFORCING ? "ENFORCING" : "REPORT-ONLY (WORLD_REFERENT_GATE=report)"}`);
  push("=".repeat(78));
  push();
  return L.join("\n");
}

// ---------------------------------------------------------------------------

describe("scenario-world-referent gate", () => {
  it("prints the ledger as a machine-checked baseline", () => {
    const text = report();
    // eslint-disable-next-line no-console
    console.log(text);
    // CI/lane convenience: WORLD_REFERENT_GATE_OUT=<file> also drops the report
    // on disk, because a lane watching its own count fall wants to diff it.
    const outFile = process.env.WORLD_REFERENT_GATE_OUT;
    if (outFile) fs.writeFileSync(outFile, text);
    expect(RESULT.scenarios).toBeGreaterThan(0);
  });

  it("accounts for EVERY fault code: checked + exempt = the whole catalog", () => {
    const all = allFaultCodes();
    expect(all.length).toBe(Object.keys(VIOLATIONS).length + Object.keys(COMMENDATIONS).length);
    const checked = new Set(Object.keys(REFERENT_RULES) as FaultCode[]);
    const missing = all.filter((c) => !checked.has(c) && !NO_WORLD_REFERENT.has(c));
    const both = all.filter((c) => checked.has(c) && NO_WORLD_REFERENT.has(c));
    // A new code must be either checked or explicitly exempted — never neither.
    expect(missing).toEqual([]);
    expect(both).toEqual([]);
    expect(checked.size + NO_WORLD_REFERENT.size).toBe(all.length);
    // Doc 86 §10's arithmetic, pinned — and the pin MOVES ONLY WITH A REASON
    // written here, which is the point of pinning it at all.
    //
    // 45 → 46 / 58 → 59 (2026-08-05, doc 87 item 7): CLOSING_ON_LEAD_TOO_FAST,
    // the FO-08 closing-rate code. It is CHECKED (a `stagedActorRule` on
    // brakingLeadCar | cutInLeadCar — the same referent its two siblings in the
    // following family carry), not exempted: a lesson with no lead vehicle
    // cannot arm it and the gate must keep saying so.
    //
    // 13 → 14 / 59 → 60 (2026-08-30): OFF_CARRIAGEWAY, чл. 15, ал. 1 — the code
    // for a car that has left the carriageway. It is EXEMPTED, not checked, and
    // the reason is a different one from the other thirteen: those are facts
    // about the car or the driver's procedure, this one is about the street but
    // is a SURFACE query rather than a body the world must contain. A referent
    // rule for it could only assert „this district has a road", which is true of
    // all 105 by construction — a check that can never fail is the very thing
    // this gate exists to prevent. `referents.ts NO_WORLD_REFERENT` carries the
    // full argument and names what guards it instead
    // (`runtime/__tests__/off-carriageway-consult.test.ts`: 248 spawns, 117 bay
    // centres, 57,000 lane/parking-band poses, worst outsideKerbM 0.000 m).
    // `checked` does NOT move: 46 is unchanged.
    //
    // 46 → 47 / 60 → 61 (2026-09-01, audit sc-vu-emergency-junction:853790f7):
    // DRIVING_TOO_SLOW_IN_TOWN, the town half of the speed envelope. Until it
    // landed the engine graded only the FAST side — a reference drive held
    // 10–11 км/ч for over two minutes on a street posted 40 and booked nothing,
    // while the flat-out leg of the same lesson was billed once a tick. It is
    // CHECKED, not exempted, and the check is the mirror of its motorway
    // sibling's: „at least one non-motorway route edge posted >= 40". That can
    // really fail — mw-v1 is motorway end to end, and the fourteen `lot-*`
    // aisles, `poligon-v1`, `pk-drive-v1` and `sp-zone30-v1` are posted 20/30,
    // which is a place signed slow on purpose. `NO_WORLD_REFERENT` does NOT
    // move: 14 is unchanged.
    //
    // 47 → 48 / 61 → 62 (2026-09-01, audit sc-jx-priority-confidence:9c987e7b):
    // STOPPED_WITHOUT_CAUSE, чл. 24, ал. 2 — the limit case of the same
    // envelope. Both crawl codes require the car to be MOVING, so the one thing
    // neither could see was a car that had stopped; on the lesson NAMED „без
    // излишни спирания" the credited drive stood still through most of 88 s
    // against a 40 s par and read «Второстепенни 0 0 · ★★★». It is CHECKED, and
    // on the SAME world fact as the town crawl (it shares that detector's
    // arming gate): a `lot-*` aisle posted 20 has no movement to hinder and a
    // motorway is the sibling family's road, so on either the row is INERT
    // rather than silently armed. `NO_WORLD_REFERENT` does NOT move: 14 again.
    //
    // 48 → 48 / 62 → 63 (2026-09-02, audit sc-vp-telltale-red:c172d48b):
    // WARNING_LAMP_IGNORED, ЗДвП чл. 101, ал. 1 — the основна for driving on
    // past a RED dashboard telltale instead of pulling over. It is EXEMPTED,
    // and for the plainest of the fourteen reasons rather than for
    // OFF_CARRIAGEWAY's: the referent is a `telltaleStimulus` staged on the
    // LESSON, a cockpit channel with no world body, so no district can be
    // wrong about it and a rule here could only restate the staging. What
    // arms it instead is structural and much tighter than a config flag —
    // only a scenario that STAGES a red telltale can ever produce the
    // situation key, which is three lessons in the whole corpus. `checked`
    // does NOT move: 48 is unchanged.
    //
    // 48 → 49 / 63 → 64 (2026-09-04, audit sc-sig-controller-live:bf4c6bab):
    // CONTROLLER_SIGNAL_OBEYED, the PRAISE half of CONTROLLER_SIGNAL_VIOLATED
    // — ЗДвП чл. 7, ал. 1, credited for crossing on the регулировчик's
    // permission while the lamp forbids it. Until it landed the reducer's
    // controller arm could only convict, so the три drills built on чл. 7 had
    // no reachable commendation at all and a flawless run of one printed
    // «COMMENDATIONS (0)». It is CHECKED, and on the SAME rule the violation
    // carries (`controllerActorRule`) rather than a second one: convicting a
    // student for ignoring an officer and crediting one for obeying him make
    // the identical demand of the world — a staged trafficController within
    // 25 m of a graded stop line. Every lesson without one is therefore INERT
    // on both codes, exactly as it already was on the violation.
    // `NO_WORLD_REFERENT` does NOT move: 15 is unchanged.
    //
    // 49 → 50 / 64 → 65 (2026-09-04, audit sc-vp-police-stop:44cfeff6):
    // POLICE_STOP_SIGNAL_IGNORED, ЗДвП чл. 103 — the основна for driving past a
    // контролен орган's stop signal instead of pulling over. Until it landed the
    // drill's own ❌ demo billed NOT_KEEPING_RIGHT, lane discipline standing in
    // for the duty, and a student who ignored the officer without crashing was
    // recorded as faultless. It is CHECKED and NOT exempted, which is where it
    // parts company with its telltale twin four paragraphs up: a warning lamp is
    // a cockpit channel with no world body, while the officer is a staged
    // pedestrian posed "stopSignal" that a district either contains or does not
    // — and the 2026-07-27 ruling on `PS_OFFICER` (the figure was buried in the
    // curb-parked row and invisible) is exactly why that difference is worth
    // gating. `stagedActorRule(["policeStop"])`, so every lesson without an
    // officer is INERT on it. `NO_WORLD_REFERENT` does NOT move: 15 again.
    expect(checked.size).toBe(50);
    expect(NO_WORLD_REFERENT.size).toBe(15);
    expect(all.length).toBe(65);
  });

  it("never exceeds doc 86 on the four classes §10 counts to ±0 (T1 90 · T2 31 · T3 9 · T4 83)", () => {
    // Wave 0's job was to REPRODUCE these four exactly, which it did, and that
    // is what made the gate worth trusting: it agreed with the document because
    // the tree said so. Wave 1's job is the ratchet half of the same rule —
    // they may only ever fall. T1 90 → 0 and T4 83 → 0 are the fall.
    const measured: Record<string, number> = {};
    for (const c of censusLines(RESULT)) if (c.precise) measured[c.id] = c.measured;
    expect(Object.keys(measured).sort()).toEqual(["T1", "T2", "T3", "T4"]);
    const doc86: Record<string, number> = { T1: 90, T2: 31, T3: 9, T4: 83 };
    for (const [id, n] of Object.entries(measured)) {
      expect(n, `${id} = ${n} is ABOVE doc 86's ${doc86[id]}`).toBeLessThanOrEqual(doc86[id]!);
    }
    // The corpus itself has not moved under us — except deliberately, and here
    // is the deliberate move. 90 → 100 is the ten parking districts built for
    // the founder's „10 at least which to teach how to park the students":
    // lot-45rev, lot-double, lot-gap-judge, lot-gap-long, lot-gap-short,
    // lot-left, lot-night, lot-van, lot-wall, lot-zebra. Ten NEW MAPS, not ten
    // new defects — every per-class count above still falls or holds, which is
    // the assertion that actually protects us. This number is spelled out
    // rather than relaxed to a `>=` so the next corpus change also has to be
    // explained here before it can pass.
    //
    // 100 → 105 is doc 87 B40(b), and it is the same shape of move: FIVE NEW
    // SIGNALISED JUNCTIONS, one per signals lesson. Measured on the shipped
    // catalogue, positions 12 / 19 / 20 / 21 / 22 / 23 all ran `sx-v1` from
    // `sx-spawn-south` — one street wearing six titles, and four of the six
    // photographed within 1.76–3.20 mean |ΔRGB| of each other at that spawn.
    // `sxd-v1` (a collector crossing), `sxf-v1` (a bare narrow boulevard),
    // `sxh-v1` (built so the far stop line stays readable), `sxc-v1` (two
    // collectors + a posted В24) and `sxr-v1` (a tight centre with a closed
    // horizon) each carry the SAME node ids, N–S carriageway, spawn poses and
    // derived stop line — `gen_signal_x.mjs` re-derives and asserts all three
    // numbers — so every committed trace replays byte-identically and no
    // per-class count below rises.
    //
    // 105 → 106 is `sc-junction-scan:28e782ab`, and it is B40(b) one map
    // smaller: the SAME defect (separately-named drills on one street) at the
    // Б2 T-junctions instead of the signalised X. `sc-junction-stop` (JU-03)
    // and `sc-junction-scan` (JU-23) both declared `tj-stop-v1`, the same
    // spawn and the same three gate coordinates, so the audit read three
    // junction drills as „three names, one lesson"; `sc-junction-gap` already
    // had its own map (`tj-emerge-v1`). `tj-scan-v1` is generated by the same
    // generator as that one with its own arms (130 m / 110 m), which is what
    // makes the streetwall pass — its jitter keys on the EDGE ID every tj map
    // shares — slot a frontage of its own rather than hand out a copy. The
    // DERIVED Б2 line is deliberately unmoved at 27.725 m from the node
    // (`tj-junctions2-districts.test.ts` asserts it across all three Б2 T-maps),
    // so the drill's three gates and its three committed traces still stand.
    expect(RESULT.districtFiles).toBe(106);
    // T2's district count was the one figure of the four still at its wave-0
    // value (15) — the spawn poses themselves. Doc 87's founder wave moved them:
    // every generator now ends its spawn list with tools/maps/lib/lane.mjs
    // toCurbLane(), so a pose authored on the road CENTRELINE lands in the curb
    // lane instead, and no scenario begins astride the осева it is graded on.
    expect(RESULT.t2Districts).toBe(0);
  });

  it("the census is a ratchet: equal to the committed number, and no silent rise", () => {
    const drift: string[] = [];
    for (const row of LEDGER_BASELINE) {
      const measured = RESULT.census.get(row.id) ?? 0;
      if (row.ledger !== null && measured > row.ledger) {
        drift.push(
          `${row.id}: ${measured} is ABOVE doc 86's ${row.ledger} — a lane made this class worse`,
        );
      }
      const zero = allow.waveZero[row.id];
      if (zero === undefined) {
        drift.push(`${row.id}: missing from expected-failures.json waveZero`);
      } else if (zero !== null && measured > zero && !allow.raised[row.id]) {
        drift.push(
          `${row.id}: ${measured} is above the wave-0 ${zero} with no entry in \`raised\` — ` +
            "say in one line why the class legitimately grew, or fix it",
        );
      }
      const committed = allow.census[row.id];
      if (committed === undefined) {
        drift.push(`${row.id}: missing from expected-failures.json census`);
      } else if (measured !== committed) {
        drift.push(
          measured < committed
            ? `${row.id}: ${measured} (was ${committed}) — a real win. Lower it in expected-failures.json in THIS PR.`
            : `${row.id}: ${measured} (committed ${committed}) — REGRESSION.`,
        );
      }
    }
    // A `raised` note for a row that is no longer above its wave-0 number is a
    // stale excuse; the escape hatch drains from this end too.
    for (const id of Object.keys(allow.raised)) {
      const measured = RESULT.census.get(id as LedgerDefectId) ?? 0;
      const zero = allow.waveZero[id];
      if (zero === null || zero === undefined || measured <= zero) {
        drift.push(`raised.${id} is stale (${measured} <= wave-0 ${zero}) — delete it`);
      }
    }
    expect(drift).toEqual([]);
  });

  it("ENFORCING: a code that convicts on a world with no referent is at zero, or budgeted", () => {
    if (!ENFORCING) return;
    const perCode = new Map<string, { scen: Set<string>; rungs: number }>();
    for (const v of RESULT.violations) {
      if (v.band !== "falsehood") continue;
      if (allow.allowlist.some((a) => `${a.scenario}@L${a.rung}|${a.code}` === keyOf(v))) continue;
      const e = perCode.get(v.code) ?? { scen: new Set<string>(), rungs: 0 };
      e.scen.add(v.scenarioId);
      e.rungs += 1;
      perCode.set(v.code, e);
    }
    const drift: string[] = [];
    for (const [code, e] of perCode) {
      const budget = allow.falsehoodBudget[code];
      if (!budget) {
        const worst = RESULT.violations.find((v) => v.code === code && v.band === "falsehood")!;
        drift.push(
          `${code}: ${e.scen.size} scenario(s) / ${e.rungs} rung(s) CONVICT on a world that does ` +
            `not contain the referent, and the code is not in falsehoodBudget. ` +
            `e.g. ${worst.scenarioId}@L${worst.level} — ${worst.worldHas}. ` +
            "Fix it, or write the budget entry with a reason, an owner and a ledger id.",
        );
        continue;
      }
      if (e.scen.size > budget.scenarios || e.rungs > budget.rungs) {
        drift.push(
          `${code}: ${e.scen.size}/${e.rungs} exceeds its budget of ` +
            `${budget.scenarios}/${budget.rungs} — REGRESSION.`,
        );
      } else if (e.scen.size < budget.scenarios || e.rungs < budget.rungs) {
        drift.push(
          `${code}: ${e.scen.size}/${e.rungs} is BELOW its budget of ` +
            `${budget.scenarios}/${budget.rungs} — a real win. Lower it in THIS PR.`,
        );
      }
    }
    for (const [code, b] of Object.entries(allow.falsehoodBudget)) {
      if (!perCode.has(code)) {
        drift.push(`${code}: budgeted ${b.scenarios}/${b.rungs} but now CLEAN — delete the entry.`);
      }
      expect(
        Boolean(b.ledger && b.owner && b.reason),
        `falsehoodBudget.${code} needs ledger, owner and reason`,
      ).toBe(true);
    }
    expect(drift).toEqual([]);
  });

  /**
   * O42 — THE CURVE BUDGET IS A DISPUTE WITH THE PREDICATE, NOT A DEFECT IN THE
   * WORLD, AND IT MUST DRAIN FROM BOTH ENDS.
   *
   * A budget entry says „this code convicts on a world that lacks the referent,
   * and we accept that for now". This one does not: the referent IS there and
   * `checkSPEED_TOO_FAST_FOR_CURVE` cannot see it. Measured 2026-08-19 over all
   * 167 scenarios / 808 rungs:
   *
   *   · the four red rungs are ONE scenario, sc-merge-motorway-exit L1–L4, and
   *     all four report the same sentence — „curve post is not on the zone's own
   *     edge". They are the EDGE-LOCAL branch: the А1 stands 61.0 m before the
   *     arc on `mwx-e-nb-decel`, the deceleration lane the driver arrives down,
   *     which is where a motorway exit is signed in life; the rule projects
   *     candidates onto `mwx-e-ramp` alone and drops it at 20 m.
   *   · behind that sits a second, LATENT bug and it is why „move the sign"
   *     could never work: the rule's arithmetic is `fromM - sM`, and
   *     mwx-z-ramp-curve has `fromM = 0`, so ANY post that did project onto the
   *     ramp would score `lead <= 0 < 40`. The zone is unsatisfiable from every
   *     placement in the plane. (Corpus-wide the code is NOT unsatisfiable — it
   *     returns ok on 10 rungs, sp-curve-v1 and ov-crest-v1 at 60.0 m each — so
   *     nothing that counts per-CODE would ever have found this.)
   *   · replacing the check with the driven-path measurement below and
   *     re-running the whole gate: SPEED_TOO_FAST_FOR_CURVE 1/4 → 0/0, total
   *     falsehoods 33 → 29, and NO new falsehood anywhere. The counter-direction
   *     was measured too, because a predicate that credits everybody is the same
   *     crime pointing the other way: with the demand raised to 70 m it convicts
   *     3/14, and with the А1 removed from the build it convicts 3/14 — 14 being
   *     every rung that actually routes over a curveAdvisory span.
   *
   * So the entry cannot be deleted here (deleting it while the predicate stands
   * turns the gate red for everyone), and it must not be allowed to sit and
   * silently absorb a REAL falsehood later. This test is the receipt: it pins
   * the world as correct and the gate as wrong, and it goes red the moment
   * either half moves — including the wrong fix, which is moving the sign back
   * onto the ramp to satisfy the broken arithmetic.
   *
   * WHEN referents.ts LEARNS TO FOLLOW THE JOIN: delete this test AND the
   * falsehoodBudget entry in the same commit. Neither survives alone.
   */
  it("O42: the curve budget is the predicate's fault — the world is measured right", () => {
    const budget = allow.falsehoodBudget.SPEED_TOO_FAST_FOR_CURVE;
    if (!budget) return; // the entry is gone: the predicate was fixed, and so was this.

    // HALF 1 — THE WORLD. The А1 stands a full advance before the arc, on the
    // carriageway the driver is on. If this number falls, a sign moved.
    const adv = drivenPathAdvanceM("mw-exit-v1", "mwx-z-ramp-curve");
    expect(adv, "mw-exit-v1 has no curve warning at all").not.toBeNull();
    expect(adv!.hostEdgeId).toBe("mwx-e-nb-decel");
    expect(adv!.postAtM).toBeCloseTo(219.0, 1);
    expect(
      adv!.leadM,
      "the А1 no longer stands 61.0 m before the ramp arc — a lane moved the post",
    ).toBeCloseTo(61.0, 1);
    expect(adv!.leadM).toBeGreaterThanOrEqual(40);

    // HALF 2 — THE GATE, disagreeing, in the words of the bug.
    const rows = RESULT.violations.filter(
      (v) => v.code === "SPEED_TOO_FAST_FOR_CURVE" && v.band === "falsehood",
    );
    expect(
      rows.map((r) => `${r.scenarioId}@L${r.level}`),
      "the curve falsehoods changed — if they are GONE the predicate was fixed: " +
        "delete this test and the falsehoodBudget entry together",
    ).toEqual([
      "sc-merge-motorway-exit@L1",
      "sc-merge-motorway-exit@L2",
      "sc-merge-motorway-exit@L3",
      "sc-merge-motorway-exit@L4",
    ]);
    expect([...new Set(rows.map((r) => r.worldHas))]).toEqual([
      "curve post is not on the zone's own edge",
    ]);
  });

  it("the allowlist drains itself: an entry that starts passing fails the gate", () => {
    const live = new Set(RESULT.violations.map(keyOf));
    const stale = allow.allowlist.filter(
      (a) => !live.has(`${a.scenario}@L${a.rung}|${a.code}`),
    );
    expect(
      stale.map((a) => `${a.scenario}@L${a.rung}|${a.code} now PASSES — delete this entry`),
    ).toEqual([]);
    // Schema: an escape hatch nobody signed is not an escape hatch.
    for (const a of allow.allowlist) {
      expect(
        Boolean(a.scenario && a.rung && a.code && a.reason && a.owner && a.issue),
        `allowlist entry ${JSON.stringify(a)} is missing a required field`,
      ).toBe(true);
    }
  });

  it("the B4 evaluator probe is the reason the B4 row reads 0 — it is asserted, not assumed", () => {
    // The one row whose 0 comes from a behavioural probe rather than a count.
    // If stepReachZone ever loses its latch, B4 springs back to 139 scenarios
    // and this line says which half broke.
    expect(RESULT.reachZoneProbe).toEqual({ memory: true, voice: true });
  });
});

// A LedgerDefectId that is not in the census map would silently read 0.
const _ids: LedgerDefectId[] = LEDGER_BASELINE.map((r) => r.id);
void _ids;
