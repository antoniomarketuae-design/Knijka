/**
 * THE CLASSIFICATION PIN.
 *
 * `catalog.test.ts` asserts `spec.points === SEVERITY_POINTS[spec.severityClass]`.
 * That is arithmetic about the catalogue's own declaration: it asks „if you
 * called it опасна, did you charge 10?" and passes no matter WHICH class a code
 * sits in. Every one of the ten-point charges could have been wrong and it
 * would have stayed green. One of them was.
 *
 * This file asks the other question — „does Наредба № 38 put this act in that
 * class?" — and it asks the ACT, not us. The three point values, the six
 * enumerated опасна cases and both pass thresholds are re-derived at run time
 * from `content/law/acts/naredba-38.json` (the ingested SARS text, pinned by
 * sha256 in `content/law/sources.json`) and compared against what the code
 * believes. Re-ingest the act after an amendment and this suite goes red at the
 * exact provision that moved.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VIOLATIONS } from "../catalog";
import {
  N38_ACT_ID,
  N38_BASIS,
  N38_CLAUSE_CLASS,
  N38_OPASNA_CASES,
  N38_OPASNA_HEADER,
  N38_OSNOVNA_DEF,
  N38_PASS_RULE,
  N38_UNIT_REF,
  N38_VTOROSTEPENNA_DEF,
  type N38Basis,
} from "../n38";
import { PASS_MAX_OSNOVNI_POINTS, PASS_MAX_TOTAL_POINTS } from "../scoring";
import { SEVERITY_POINTS, type ViolationCode } from "../types";

// --- the ingested act ------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");

interface Act {
  actId: string;
  sourceId: string;
  units: Array<{ ref: string; contextBg: string | null; textBg: string }>;
}

const act = JSON.parse(
  readFileSync(path.join(repoRoot, "content/law/acts/naredba-38.json"), "utf-8"),
) as Act;

const classificationUnit = act.units.find((u) => u.ref === N38_UNIT_REF);
/** Whitespace is an extraction artifact (line wrapping); words are not. */
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const unitText = norm(classificationUnit?.textBg ?? "");

/** т. 10 verbatim, sliced out of the act between its own numbered neighbours. */
const t10 = unitText.slice(unitText.indexOf("10. Председателят"), unitText.indexOf("11. Изпитът"));

describe("Наредба № 38 — the act we grade against", () => {
  it("is the ingested SARS text, addressed at the unit that classifies faults", () => {
    expect(act.actId).toBe(N38_ACT_ID);
    expect(act.sourceId).toBe("src-naredba-38-sars");
    expect(classificationUnit).toBeDefined();
    // приложение № 5 is issued под чл. 36, ал. 1, т. 1 — if the ingestion ever
    // re-anchors this unit elsewhere, the quotes below are addressing something
    // other than the practical-exam declaration.
    expect(classificationUnit?.contextBg).toBe("към чл. 36, ал. 1, т. 1");
    expect(t10.length).toBeGreaterThan(0);
  });

  it("т. 10 is the ONLY fault classification in the act", () => {
    // If a second unit ever starts defining error classes, this file is
    // grounding against a partial picture and must be revisited.
    const classifying = act.units.filter(
      (u) => /за основни грешки се считат/.test(norm(u.textBg)) && u.ref !== N38_UNIT_REF,
    );
    // чл. 59 is the known extraction artifact: the tail of the document (the
    // заключителни разпоредби plus every приложение) folded into it, so it
    // carries a DUPLICATE of the same т. 10 text. Any OTHER hit is new.
    expect(classifying.map((u) => u.ref)).toEqual(["чл. 59"]);
    expect(norm(act.units.find((u) => u.ref === "чл. 59")!.textBg)).toContain(N38_OPASNA_HEADER);
  });
});

describe("the point values come from the act, not from us", () => {
  it("all three clause texts appear verbatim in приложение № 5", () => {
    expect(t10).toContain(N38_OSNOVNA_DEF);
    expect(t10).toContain(N38_VTOROSTEPENNA_DEF);
    expect(t10).toContain(N38_OPASNA_HEADER);
  });

  it("SEVERITY_POINTS equals the numbers written in the clauses", () => {
    // Parsed out of the act's own sentences — never read back off SEVERITY_POINTS.
    const osnovna = /начисляват се по (\d+) наказателни точки/.exec(N38_OSNOVNA_DEF);
    const vtorostepenna = /начислява се по (\d+) наказателна точка/.exec(N38_VTOROSTEPENNA_DEF);
    const opasna = /се поставят (\d+) наказателни точки/.exec(N38_OPASNA_HEADER);

    expect(Number(osnovna?.[1])).toBe(SEVERITY_POINTS.osnovna);
    expect(Number(vtorostepenna?.[1])).toBe(SEVERITY_POINTS.vtorostepenna);
    expect(Number(opasna?.[1])).toBe(SEVERITY_POINTS.opasna);
  });

  it("the pass thresholds come from т. 11", () => {
    expect(unitText).toContain(N38_PASS_RULE);
    const m = /не повече от (\d+) наказателни точки, като не повече от (\d+) са от основни грешки/.exec(
      N38_PASS_RULE,
    );
    expect(Number(m?.[1])).toBe(PASS_MAX_TOTAL_POINTS);
    expect(Number(m?.[2])).toBe(PASS_MAX_OSNOVNI_POINTS);
  });
});

describe("б. „в“ is a CLOSED list — and this is that list", () => {
  /** Every dashed item between the „в)" header and т. 11, straight from the act. */
  const enumerated = t10
    .slice(t10.indexOf(N38_OPASNA_HEADER) + N38_OPASNA_HEADER.length)
    .split(/(?=- )/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("- "));

  it("the act enumerates exactly six cases", () => {
    // The number is the point. „в)" reads „в следните случаи:" — an exhaustive
    // enumeration. A 10-point charge that maps to none of these six has no
    // basis in law, and an amendment that adds or removes one must be seen.
    expect(enumerated).toHaveLength(6);
  });

  it("our six constants ARE the act's six, verbatim", () => {
    expect(new Set(Object.values(N38_OPASNA_CASES))).toEqual(new Set(enumerated));
  });
});

// --- the catalogue, judged against the above -------------------------------

const entries = Object.entries(N38_BASIS) as Array<[ViolationCode, N38Basis]>;

describe("every violation is grounded in a clause of т. 10", () => {
  it("every catalogued code has a basis, and every basis a catalogued code", () => {
    expect(Object.keys(N38_BASIS).sort()).toEqual(Object.keys(VIOLATIONS).sort());
  });

  it("the declared severity class IS the class its clause carries", () => {
    // THE PIN. catalog.test.ts checks points against the class; this checks the
    // CLASS against the act. A code moved between classes without moving clause
    // — or grounded on a clause that does not carry its charge — fails here.
    for (const [code, basis] of entries) {
      expect(N38_CLAUSE_CLASS[basis.clause], code).toBe(VIOLATIONS[code].severityClass);
    }
  });

  it("only clause „в“ names an enumerated case, and it always names one", () => {
    for (const [code, basis] of entries) {
      if (basis.clause === "в") {
        expect(basis.opasnaCase, code).toBeDefined();
        expect(Object.keys(N38_OPASNA_CASES), code).toContain(basis.opasnaCase);
      } else {
        expect(basis.opasnaCase, code).toBeUndefined();
        expect(basis.conflictEvidence, code).toBeUndefined();
      }
    }
  });

  it("every basis carries a written rationale", () => {
    for (const [code, basis] of entries) {
      expect(basis.rationaleBg.length, code).toBeGreaterThan(40);
    }
  });
});

describe("the ten-point charges, one at a time", () => {
  const opasni = entries.filter(([, b]) => b.clause === "в");

  it("exactly the codes charging 10 points are grounded on б. „в“", () => {
    const charging10 = Object.entries(VIOLATIONS)
      .filter(([, s]) => s.points === SEVERITY_POINTS.opasna)
      .map(([c]) => c)
      .sort();
    expect(opasni.map(([c]) => c).sort()).toEqual(charging10);
  });

  it("the four concrete cases are used only by acts the clause actually names", () => {
    // These four name a specific act, so the mapping is checkable rather than
    // arguable — and it is where a mis-grounded code would hide most easily.
    const byCase = (c: string) =>
      opasni
        .filter(([, b]) => b.opasnaCase === c)
        .map(([code]) => code)
        .sort();
    expect(byCase("signal")).toEqual(["CONTROLLER_SIGNAL_VIOLATED", "RED_LIGHT_CROSSED"]);
    expect(byCase("wrongWay")).toEqual(["WRONG_WAY"]);
    expect(byCase("b2")).toEqual(["STOP_SIGN_NO_FULL_STOP"]);
    expect(byCase("speeding")).toEqual(["SPEEDING_DANGEROUS"]);
    // „намеса на комисията" is an EXAMINER action. The sim has no committee, so
    // nothing may be charged under it — a code claiming it would be charging a
    // student for something only an examiner can do.
    expect(byCase("intervention")).toEqual([]);
  });

  it("case 2 belongs to one-way roads and junctions only", () => {
    // The clause reads „навлезе срещу движението на пътен възел или път с
    // ЕДНОПОСОЧНО движение". Entering the oncoming half of a TWO-WAY road is
    // neither, which is precisely why CROSSED_SOLID_LINE could not be grounded
    // there and fell through to case 5, where it established nothing.
    expect(N38_OPASNA_CASES.wrongWay).toContain("еднопосочно движение");
    expect(N38_OPASNA_CASES.wrongWay).not.toContain("двупосочно");
  });

  it("every code resting on „предпоставка за ПТП“ declares what its detector establishes", () => {
    // Case 5 is the only elastic clause and the only one that can absorb an
    // arbitrary act. A code may use it — but never silently.
    for (const [code, basis] of opasni) {
      if (basis.opasnaCase === "accidentPrecondition") {
        expect(basis.conflictEvidence, code).toBeDefined();
      }
    }
  });

  it("NO ten-point charge rests on geometry alone", () => {
    // The instrument this whole file exists for, and the rule that would have
    // caught CROSSED_SOLID_LINE years earlier. „Създаде предпоставка за
    // допускане на ПТП" is a statement about danger. A detector that convicts
    // on position and elapsed time alone — no other road user queried, and no
    // conflict entailed by the graded act's own definition — has established no
    // danger, so a 10-point charge from it rests on the act's shape rather than
    // on the clause. Такъв код се понижава, не се обяснява.
    const geometric = opasni.filter(([, b]) => b.conflictEvidence === "geometric").map(([c]) => c);
    expect(geometric).toEqual([]);
  });

  it("a structural ten-point charge is on the record with its own argument", () => {
    // "structural" means no other road user is required — the weaker of the two
    // admissible grounds. Each one must name why the ACT's own definition
    // carries the предпоставка, at length, so the next reviewer can disagree.
    for (const [code, basis] of opasni) {
      if (basis.conflictEvidence === "structural") {
        expect(basis.rationaleBg.length, code).toBeGreaterThan(120);
      }
    }
  });
});

describe("the codes that were moved, and why they may not drift back", () => {
  it("CROSSED_SOLID_LINE is основна and carries the downgrade argument", () => {
    // Named explicitly so the ruling cannot be reverted by a one-word edit: the
    // reversal has to delete this assertion, and deleting it is the review.
    // The finding, in one line: the detector convicts on an authored М1 span +
    // opposing bank + 0.6 s with no other road user of any kind, and б. „в“ is
    // a closed list of six that contains no such case.
    expect(VIOLATIONS.CROSSED_SOLID_LINE.severityClass).toBe("osnovna");
    expect(VIOLATIONS.CROSSED_SOLID_LINE.points).toBe(SEVERITY_POINTS.osnovna);
    expect(N38_BASIS.CROSSED_SOLID_LINE.clause).toBe("а");
    expect(N38_BASIS.CROSSED_SOLID_LINE.contestedBg).toContain("ПОНИЖЕН ОТ ОПАСНА");
  });

  it("the paint may not out-charge the sign that says the same thing", () => {
    // The contradiction that settled the ruling. OVERTAKING_IN_BAN_ZONE (знак
    // В24) requires a denoised lane change AND a lead vehicle to overtake;
    // CROSSED_SOLID_LINE requires position alone. The weaker factual case may
    // never carry the heavier charge.
    const paint = VIOLATIONS.CROSSED_SOLID_LINE.points;
    const sign = VIOLATIONS.OVERTAKING_IN_BAN_ZONE.points;
    expect(paint).toBeLessThanOrEqual(sign);
  });

  it("OVERTAKE_INSUFFICIENT_GAP stays опасна — it is the measured one", () => {
    // The other code the audit put on trial. It survives because it convicts on
    // a gap in SECONDS to a real oncoming vehicle and acquits every abort: that
    // is a предпоставка the runtime established, not one the shape implied.
    expect(VIOLATIONS.OVERTAKE_INSUFFICIENT_GAP.severityClass).toBe("opasna");
    expect(N38_BASIS.OVERTAKE_INSUFFICIENT_GAP.conflictEvidence).toBe("measured");
  });
});

describe("б. „а“ and б. „б“ stay on the right side of the line", () => {
  it("no lesser charge claims an enumerated опасна case", () => {
    for (const [code, basis] of entries) {
      if (basis.clause !== "в") {
        expect(VIOLATIONS[code].severityClass, code).not.toBe("opasna");
      }
    }
  });

  it("the SPEEDING pair splits exactly where case 6 splits it", () => {
    // „с повече от 10 km/h" is the clause's own boundary: above it the act
    // names the fault опасна, below it nothing in б. „в" applies. The two codes
    // must therefore sit on opposite sides — the one place in the catalogue
    // where the law draws the line numerically.
    expect(N38_BASIS.SPEEDING_DANGEROUS.clause).toBe("в");
    expect(N38_BASIS.SPEEDING_DANGEROUS.opasnaCase).toBe("speeding");
    expect(N38_BASIS.SPEEDING_OVER_LIMIT.clause).toBe("б");
    expect(N38_OPASNA_CASES.speeding).toContain("повече от 10 km/h");
  });
});
