// Run: node --test tools/audit/stale-claims.test.mjs
//
// WHAT THIS DEFENDS. `stale-claims.mjs` compares an open row's own arithmetic
// against the newest sweep and queues the ones the sweep contradicts. It has
// exactly one job and it has already got it wrong once in the reassuring
// direction: the first cut of `credited-izdarzhan` matched «ИЗДЪРЖАН with»
// inside «НЕИЗДЪРЖАН» and flagged sc-park-gap-short:b1024483 — a row whose
// whole complaint is that both legs end НЕИЗДЪРЖАН — as contradicted. That is
// a row being retired for agreeing with itself, and the file carried the
// warning in its own comments while doing it.
//
// It shipped with no test at all until 2026-09-18, which is why the bug needed
// a human to notice. The cases below cover the substring trap it already paid
// for and the new word that can produce the same shape: ADR-009's «НЕ Е ВЗЕТ»
// (founder Ruling A, 2026-09-17), which about ten passing right legs are
// expected to start printing on the next sweep — five of them on legs this
// harness never steered (doc 92 §12 R3).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHECKS } from "./stale-claims.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

const check = (id) => {
  const k = CHECKS.find((c) => c.id === id);
  assert.ok(k, `UNRESOLVED: stale-claims.mjs no longer carries a check called "${id}" — re-anchor this test`);
  return k;
};

/** A leg as `legsOf` builds one: only the fields these checks read. */
const leg = (name, mode, verdict, score = 0) => ({ leg: name, mode, verdict, score, severity: null });

test("credited-izdarzhan: the row that complains about НЕИЗДЪРЖАН is never flagged by its own word", () => {
  const k = check("credited-izdarzhan");
  // The exact shape of the bug this file shipped.
  assert.equal(k.claims("both legs end НЕИЗДЪРЖАН with 9 т."), false);
  assert.equal(k.claims("the pc-right leg is credited ИЗДЪРЖАН with 0 т."), true);
});

test("ADR-009: a right leg reading «НЕ Е ВЗЕТ» is reported AS THAT WORD, with the R3 instruction", () => {
  const k = check("credited-izdarzhan");
  const why = k.test([
    leg("pc-right", "right", "НЕ Е ВЗЕТ"),
    leg("mobile-right", "right", "НЕ Е ВЗЕТ"),
    leg("pc-wrong", "wrong", "НЕИЗДЪРЖАН"),
  ]);
  assert.ok(why, "the filed sentence «credited ИЗДЪРЖАН» no longer describes the drive, so the row is queued");
  assert.match(why, /2 of them read «НЕ Е ВЗЕТ» \(ADR-009\)/);
  assert.match(why, /изпитен лист is within tolerance/);
  assert.match(why, /not a наказателна точка more than before/u, "the hit says the points did NOT move");
  assert.match(why, /check that leg's own inputs \(run\.log STEERING, route\/droveIt\)/);
  assert.match(why, /§12 R3/);
  // MUTATION WATCHED: drop the `notTaken` clause and this case reds with the
  // bare sentence — which reads as «the product now penalises this lesson» and
  // is, on half those legs, a description of the harness.
});

test("ADR-009: the clause is CONDITIONAL — a plain НЕИЗДЪРЖАН sweep still gets the plain sentence", () => {
  const k = check("credited-izdarzhan");
  const why = k.test([leg("pc-right", "right", "НЕИЗДЪРЖАН"), leg("mobile-right", "right", "НЕЗАВЪРШЕН")]);
  assert.ok(why);
  assert.match(why, /no right leg is credited ИЗДЪРЖАН any more/);
  assert.ok(!/ADR-009/.test(why), "a sweep with no not-taken leg must not carry ADR-009 prose");
  // Without this control the ADR-009 sentence would be wallpaper on every hit,
  // and a judge who reads it everywhere stops reading it anywhere.
});

test("a single right leg still credited ИЗДЪРЖАН leaves the row standing", () => {
  const k = check("credited-izdarzhan");
  assert.equal(k.test([leg("pc-right", "right", "ИЗДЪРЖАН"), leg("mobile-right", "right", "НЕ Е ВЗЕТ")]), null);
  // One leg still at the filed value is not a contradiction. Reporting it as
  // one would retire a row on a partial reading — the rule the file's own
  // header states and the reason every check here is an `every`, not a `some`.
});

test("the verdict is NORMALISED before it is compared — the ledger's casing is not the product's", () => {
  const k = check("credited-izdarzhan");
  // `lesson-audit.mjs` matches the pill case-insensitively and records what it
  // read; `SESSION_VERDICT_LABEL_BG` spells the word «Не е взет», and the older
  // sweeps on disk hold «ИЗДЪРЖАН» upper-cased. A comparison against the raw
  // string would silently stop recognising the new word the day the harness
  // recorded it in the product's own casing.
  const why = k.test([leg("pc-right", "right", "Не е взет")]);
  assert.match(why, /ADR-009/);
  assert.equal(k.test([leg("pc-right", "right", "издържан")]), null, "a lower-cased pass is still a pass");
});

test("importing this module runs NOTHING — the corpus is read only by the CLI", () => {
  // Before 2026-09-18 `corpusCounts()` ran at IMPORT time and logged the whole
  // queue, so no test of the check table could exist that a developer would
  // actually run. The report sits behind `report()` and an `isMain` guard now.
  //
  // THE CASE THAT USED TO STAND HERE COULD NOT FAIL. It asserted the shape of
  // `CHECKS` — true with the guard and true without it — so deleting
  // `if (isMain)` left it green. Measured 2026-09-18, and filed against this
  // lane by its own verifier. The only way to observe an import-time side
  // effect is to import the module in a process that does nothing else and read
  // what it printed: guarded that is 0 bytes, unguarded 2,375 — the whole
  // corpus report, «OPEN-LIST filed=… 6 row(s) assert …».
  //
  // `--input-type=module -e` leaves `process.argv[1]` undefined, which is the
  // NOT-main case by construction, so a guard of any correct shape passes here
  // and only the absence of one fails.
  const url = pathToFileURL(path.join(HERE, "stale-claims.mjs")).href;
  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(url)});`],
    { encoding: "utf8", cwd: REPO, timeout: 180_000 },
  );
  assert.equal(out, "", "importing stale-claims.mjs printed the corpus report — the isMain guard is gone");
});

test("the check table is the module's whole export surface — every entry is callable", () => {
  // The shape half of the old case above, kept as its own case rather than
  // dropped: it is a real (if weak) guard against a check losing its matcher,
  // and it had no business standing in for the import-time one.
  assert.ok(Array.isArray(CHECKS), "CHECKS is the exported table, in order");
  assert.ok(CHECKS.length >= 4);
  for (const k of CHECKS) {
    assert.equal(typeof k.claims, "function", `${k.id} has no claims matcher`);
    assert.equal(typeof k.test, "function", `${k.id} has no test`);
  }
});
