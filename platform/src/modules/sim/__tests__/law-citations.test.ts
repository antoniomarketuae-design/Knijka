/**
 * THE SIMULATOR'S CITATIONS, RESOLVED AGAINST THE ACTUAL CORPUS.
 *
 * WHAT WAS WRONG. 250 citation sites live under `modules/sim` — scenario
 * templates, the 58-entry rule catalogue, the recorded traces, the traffic
 * controller's bubble copy — and the only check on any of them was
 * `lessons/scenario/validate.ts`:
 *
 *     const LAW_REF_RE = /^(ЗДвП|ППЗДвП|Наредба)/;
 *
 * A test of the FIRST WORD. „ЗДвП чл. 9999" passes it. „ППЗДвП чл. 31" passes
 * it too — and ППЗДвП is an act this repo does not hold a single byte of, so
 * that article number was unverifiable BY CONSTRUCTION: no resolver here could
 * confirm or deny it, and 23 such numbers were being printed at students, one
 * of them PAINTED ONTO A CANVAS in the 3D scene by `TrafficLayer.tsx`.
 * Meanwhile the question bank next door had all 1,089 rows' citations
 * machine-pinned. Same product, same student, two standards.
 *
 * WHAT THIS FILE IS. The real resolver — `resolveLawRef` from
 * `@/lib/content/law`, reading `content/law/acts/*.json` — run over every
 * citation string in the module. Three outcomes, and the middle one is the
 * founder's standing ruling written as an assertion:
 *
 *   RESOLVABLE  the act is in the corpus and the unit exists in it.        OK
 *   NUMBERLESS  the act is NOT in the corpus and the citation names no
 *               article/§/annex NUMBER — it names the act and the SUBJECT
 *               („Наредба № РД-02-21-1/23.11.2023 правила за поставяне на
 *               знак Б3", the phrasing the question bank already froze).    OK
 *   REFUSED     anything else: a number on an act we cannot open, a number on
 *               an act we CAN open that is not in it, or a clause that does
 *               not begin with a recognised act name at all.             FAIL
 *
 * WHY A TEST AND NOT A CHECK INSIDE validate.ts. The corpus loader is
 * server-only (node:fs) while `validate.ts` is reachable from the browser, so
 * importing it there would break the client bundle. The gate therefore runs
 * where a gate can actually run: in the suite every PR has to pass.
 * `validate.ts` keeps its cheap prefix check for authoring-time feedback and
 * now points here for the real one.
 *
 * THE SCANNER IS ITSELF UNDER TEST (the eighth-instrument-defect rule): a probe
 * that silently matches nothing reports a clean tree. So the file count, the
 * site count and the classifier are all asserted — including NEGATIVE CONTROLS,
 * strings that appear nowhere in the tree and must be refused, because a
 * checker that cannot fail has not passed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { actIdForActName, ANNEX_RE, normaliseUnitRef, resolveLawRef } from "@/lib/content/law";

const SIM_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every file in the module — the scan is over the tree, never over a list. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function simFiles(): string[] {
  return walk(SIM_DIR).filter(
    (f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".json"),
  );
}

const rel = (f: string): string => path.relative(SIM_DIR, f).replace(/\\/g, "/");

/** This file. Excluded from the scan because its own prose is the specimen jar. */
const SELF = rel(fileURLToPath(import.meta.url));

/** `lawRef: "…"` in TS, `"lawRef": "…"` in the scenario JSON. */
const LAWREF_RE = /(?:"lawRef"|lawRef)\s*:\s*"((?:[^"\\]|\\.)*)"/g;

/**
 * A citation string is a SEMICOLON-SEPARATED LIST of clauses, and a clause that
 * starts straight at „чл." inherits the act named by the clause before it
 * („ЗДвП чл. 50, ал. 1; чл. 47" is two ЗДвП citations, not one plus a stray).
 * Reading it any other way makes the second half of every compound citation
 * invisible to the check — which is the shape of defect this file exists for.
 */
const MARKER_RE = /(чл\.|Чл\.|§|приложение\s*№|Приложение\s*№|прил\.\s*№)/;

/**
 * „прил. № 2, знак Б2" — AN ANNEX NUMBER WEARING AN ABBREVIATION.
 *
 * This file used to carry its own private regex here, because
 * `normaliseUnitRef` recognised only the full word („приложение № 2") and the
 * abbreviated form therefore returned null and read as „numberless" to every
 * check in the repo — including the question bank's citation freeze. It is not
 * numberless: it points at annex 2 of an act nobody here can open. Measured on
 * the bank when this guard was written: 74 citations, 40 distinct, 100% of them
 * on Наредба № РД-02-21-1, an act `content/law/acts` does not hold. Those 74
 * have since been rewritten to the numberless form and `normaliseUnitRef`
 * itself was widened, so the private copy is gone: two regexes that are
 * supposed to agree are how the abbreviation got through in the first place.
 */
const ANNEX_ABBREV_RE: RegExp = ANNEX_RE;

/**
 * The act names this product is allowed to cite. Written out so that a clause
 * naming no recognised act — a typo, a half-deleted string, prose that drifted
 * into the field — is REFUSED rather than silently classified „numberless".
 * Acts the corpus holds and acts it does not both belong here; what separates
 * them is whether a NUMBER may ride along, and that is `classify`'s job.
 *
 * THE BOUNDARY IS WRITTEN OUT, NOT `\b`. JavaScript's `\b` is ASCII-only, so
 * `/^ЗДвП\b/` does not match „ЗДвП чл. 25" — it fails SILENTLY and every clause
 * in the module reads as „not an act". That is the same trap that made the
 * previous scan of this tree undercount, and it is why the negative controls
 * below include a real act name.
 */
const CYR_END = "(?![А-Яа-яЁёA-Za-z0-9])";
const ACT_HEADS: readonly RegExp[] = [
  `^ППЗДвП${CYR_END}`,
  `^ЗДвП${CYR_END}`,
  `^Наредба${CYR_END}`,
  `^НК${CYR_END}`,
  `^ЗБЛД${CYR_END}`,
  `^Закон${CYR_END}`,
].map((s) => new RegExp(s));

export interface Clause {
  file: string;
  line: number;
  raw: string;
  clause: string;
  actName: string | null;
  /** The tail after the act name — what a unit ref would be parsed out of. */
  tail: string;
}

function clausesOf(raw: string, file: string, line: number): Clause[] {
  const out: Clause[] = [];
  let currentAct: string | null = null;
  for (const part of raw.split(";")) {
    const clause = part.trim();
    if (clause === "") continue;
    const marker = MARKER_RE.exec(clause);
    let actName: string | null;
    let tail: string;
    if (marker && marker.index > 0) {
      actName = clause.slice(0, marker.index).trim().replace(/,+$/, "");
      tail = clause.slice(marker.index).trim();
    } else if (marker) {
      actName = currentAct; // inherited from the previous clause
      tail = clause;
    } else {
      actName = clause; // act (+ subject prose) only — no unit named
      tail = "";
    }
    if (actName !== null) currentAct = actName;
    out.push({ file, line, raw, clause, actName, tail });
  }
  return out;
}

function collectClauses(): { clauses: Clause[]; files: number; sites: number } {
  const files = simFiles();
  const clauses: Clause[] = [];
  let sites = 0;
  for (const file of files) {
    if (rel(file) === SELF) continue;
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes("lawRef")) continue;
    LAWREF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LAWREF_RE.exec(src)) !== null) {
      sites += 1;
      const line = src.slice(0, m.index).split("\n").length;
      clauses.push(...clausesOf(m[1], rel(file), line));
    }
  }
  return { clauses, files: files.length, sites };
}

export type Verdict =
  | { kind: "resolvable" }
  | { kind: "numberless" }
  | { kind: "refused"; why: string };

/**
 * THE RULING, as a function. Exported so the negative controls can drive it
 * with strings that appear nowhere in the tree.
 */
export function classify(actName: string | null, tail: string): Verdict {
  const name = actName === null ? "" : actName.trim();
  if (name === "") return { kind: "refused", why: "clause names no act at all" };
  if (!ACT_HEADS.some((re) => re.test(name))) {
    return { kind: "refused", why: `„${name}" does not begin with a recognised act name` };
  }
  const abbrev = ANNEX_ABBREV_RE.exec(tail);
  const unit =
    tail === "" ? null : abbrev ? `приложение № ${abbrev[1]}` : normaliseUnitRef(tail);
  const actId = actIdForActName(name);

  if (actId === null) {
    return unit === null
      ? { kind: "numberless" }
      : {
          kind: "refused",
          why:
            `names ${unit} of „${name}" — an act the corpus does not hold, so nobody ` +
            `can check the number. Drop it and keep the SUBJECT (e.g. ` +
            `„${name} правила за поставяне на знак Б3").`,
        };
  }
  if (unit === null) {
    // The act is ours and no unit is named — a subject-level citation into an
    // act we can open. Honest, and how „Наредба № 38" is cited across the sim.
    return { kind: "numberless" };
  }
  const found = resolveLawRef({ act: name, ref: tail });
  return found.found
    ? { kind: "resolvable" }
    : {
        kind: "refused",
        why: `„${name} ${unit}" does not exist in the corpus (${found.reason})`,
      };
}

// ---------------------------------------------------------------------------
// The second surface: the same number, written INSIDE a sentence
// ---------------------------------------------------------------------------

/**
 * A citation chip is not the only way an article number reaches a student —
 * and it is the LESS read of the two. „…Б3 не може да се поставя там (Наредба
 * № РД-02-21-1/23.11.2023, чл. 61, ал. 5)…" sits in the middle of a `whyBg`
 * that every student on that lesson reads, and no check ever looked inside a
 * sentence.
 *
 * So the scan enumerates FIELDS, not files: every key ending in `Bg` is
 * student-facing Bulgarian by this module's own naming convention (`whyBg`,
 * `whatWentWrongBg`, `textBg`, `examinerBg`, `poseBg`, …). That convention is
 * what makes the enumeration complete rather than a list somebody remembered.
 *
 * WHAT IS DELIBERATELY NOT SCANNED: code comments and the English design notes.
 * Those are PROVENANCE — they record which article a rule was derived from so
 * the next person can check it the day the act is ingested. Deleting the number
 * there would destroy the only trail back to the source. The ruling is about
 * what reaches a 17-year-old, not about what an engineer may write down.
 */
const BG_FIELD_RE = /(\w+Bg)\s*:\s*"((?:[^"\\]|\\.)*)"/g;
const JSON_BG_FIELD_RE = /"(\w+Bg)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
/** An act named immediately before an article number — unambiguous by construction. */
const INLINE_CITE_RE =
  /(ППЗДвП|ЗДвП|Наредба\s*№?\s*[^\s,;)"]+)\s*,?\s*(чл\.\s*\d+[а-я]?)/g;

interface ProseHit {
  file: string;
  line: number;
  field: string;
  cite: string;
  why: string;
}

function collectProse(): { hits: ProseHit[]; fields: number } {
  const hits: ProseHit[] = [];
  let fields = 0;
  for (const file of simFiles()) {
    if (rel(file) === SELF) continue;
    const src = fs.readFileSync(file, "utf8");
    const re = file.endsWith(".json") ? JSON_BG_FIELD_RE : BG_FIELD_RE;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      fields += 1;
      const [field, value] = [m[1], m[2]];
      INLINE_CITE_RE.lastIndex = 0;
      let c: RegExpExecArray | null;
      while ((c = INLINE_CITE_RE.exec(value)) !== null) {
        const verdict = classify(c[1], c[2]);
        if (verdict.kind === "refused") {
          hits.push({
            file: rel(file),
            line: src.slice(0, m.index).split("\n").length,
            field,
            cite: c[0],
            why: verdict.why,
          });
        }
      }
    }
  }
  return { hits, fields };
}

const scan = collectClauses();
const prose = collectProse();

describe("modules/sim law citations resolve against content/law", () => {
  it("the scanner actually sees the module (a probe that matches nothing passes everything)", () => {
    expect(scan.files).toBeGreaterThan(300);
    expect(scan.sites).toBeGreaterThan(200);
    expect(scan.clauses.length).toBeGreaterThan(scan.sites);
    // The catalogue nobody had named — its lawRef is painted onto a canvas in
    // the 3D scene (traffic/TrafficLayer.tsx). If the scanner stops seeing it,
    // the scanner is broken, not the tree.
    expect(scan.clauses.some((c) => c.file === "traffic/controllerGestures.ts")).toBe(true);
    expect(scan.clauses.some((c) => c.file === "rules/catalog.ts")).toBe(true);
    expect(scan.clauses.some((c) => c.file.endsWith(".json"))).toBe(true);
  });

  it("the classifier can fail — negative controls", () => {
    // An act we hold, an article it does not have.
    expect(classify("ЗДвП", "чл. 9999").kind).toBe("refused");
    // An act we do not hold, with a number: the exact defect this file closes.
    expect(classify("ППЗДвП", "чл. 31").kind).toBe("refused");
    // An act we do not hold, named with its SUBJECT: the founder's ruling.
    expect(classify("ППЗДвП надлъжна пътна маркировка", "").kind).toBe("numberless");
    // An annex number hiding behind an abbreviation the normaliser does not
    // know. Reads as „numberless" to every other check in the repo; is not.
    expect(
      classify("Наредба № РД-02-21-1/23.11.2023", "прил. № 2, знак Б2").kind,
    ).toBe("refused");
    // Not an act at all.
    expect(classify("правилото на дясната ръка", "").kind).toBe("refused");
    // An act we hold, an article it really has.
    expect(classify("ЗДвП", "чл. 50, ал. 1").kind).toBe("resolvable");
  });

  it("no citation names an article of an act the repo cannot open", () => {
    const refused = scan.clauses
      .map((c) => ({ c, v: classify(c.actName, c.tail) }))
      .filter(
        (x): x is { c: Clause; v: { kind: "refused"; why: string } } =>
          x.v.kind === "refused",
      );

    const report = refused
      .map((x) => `  ${x.c.file}:${x.c.line}  „${x.c.clause}"\n      -> ${x.v.why}`)
      .join("\n");

    expect(
      refused.length,
      refused.length === 0
        ? ""
        : `${refused.length} citation clause(s) under modules/sim cannot be checked ` +
            `against content/law:\n${report}\n\n` +
            `The ruling (content/law/README.md): the rule and the act with NO ARTICLE ` +
            `NUMBER beats a number nobody can check.`,
    ).toBe(0);
  });

  it("no *Bg sentence names an article of an act the repo cannot open", () => {
    // Same probe discipline: prove the field scan sees the copy it is judging.
    expect(prose.fields).toBeGreaterThan(1000);

    const report = prose.hits
      .map((h) => `  ${h.file}:${h.line}  ${h.field}: „${h.cite}"\n      -> ${h.why}`)
      .join("\n");

    expect(
      prose.hits.length,
      prose.hits.length === 0
        ? ""
        : `${prose.hits.length} student-facing sentence(s) under modules/sim carry an ` +
            `article number nobody can check:\n${report}\n\n` +
            `Keep the SUBJECT, drop the number — the same edit the citation chips took.`,
    ).toBe(0);
  });
});
