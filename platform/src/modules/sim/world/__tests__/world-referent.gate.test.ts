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
    // Doc 86 §10's arithmetic, pinned.
    expect(checked.size).toBe(45);
    expect(NO_WORLD_REFERENT.size).toBe(13);
    expect(all.length).toBe(58);
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
    // The corpus itself has not moved under us.
    expect(RESULT.districtFiles).toBe(90);
    // T2's district count is the one figure of the four still at its wave-0
    // value; nothing in this wave touched the compiled spawn pose.
    expect(RESULT.t2Districts).toBe(15);
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
