// Run: node --test tools/audit/finding-reader.test.mjs
// (collected automatically by `npm run test:tools`.)
//
// THESE RUN AGAINST THE REAL CORPUS, not a fixture, because `findCorpus()`
// walks up to `.audit-frames/findings` and cannot be pointed anywhere else —
// and because the property that matters is a property of the real corpus.
//
// SO THEY ASSERT RELATIONSHIPS, NOT TODAY'S TOTALS. `filed` was 1,012, then
// 1,043; it will move again with the next wave, and a test pinned to a number
// would be edited to whatever the code printed, which is how a test stops being
// evidence. The relationships below cannot be satisfied by a wrong loader.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  loadStandingBroken,
  loadClosures,
  loadOpenFindings,
  supersessionReport,
  findingId,
} from "./finding-reader.mjs";

test("finding ids are collision-free across the whole standing corpus", () => {
  const broken = loadStandingBroken();
  assert.ok(broken.length > 0, "an empty corpus reads exactly like a clean one — that is the bug, not the pass");
  const ids = new Set(broken.map((j) => j.findingId));
  assert.equal(ids.size, broken.length, "two findings sharing an id join a verdict to the wrong row");
});

test("the id is derived from content, so it survives a reload unchanged", () => {
  const [first] = loadStandingBroken();
  assert.equal(findingId(first), first.findingId);
});

test("open == filed - retired, exactly, with no orphan retirements", () => {
  const broken = loadStandingBroken();
  const retired = loadClosures();
  const open = loadOpenFindings();
  const ids = new Set(broken.map((j) => j.findingId));

  // A closure citing an id that is not in the corpus would inflate `retired`
  // while reducing `open` by nothing, and the two printed numbers would stop
  // reconciling. That silent gap is what this catches.
  const orphans = [...retired.keys()].filter((k) => !ids.has(k));
  assert.deepEqual(orphans, [], "closures.jsonl retires findings that are not in the corpus");
  assert.equal(open.length, broken.length - retired.size, "filed - retired must equal open");
});

test("no UNCLASSIFIED corpus source is being eaten by supersession", () => {
  // THE REGRESSION. Dropping chunk-wavec-new.jsonl into the corpus discarded 5
  // rows, 4 of them critical, because the rule assumed anything chunk-redrive
  // also covers is a stale observation. The only symptom was a total that rose
  // by 25 instead of 30 — a number nobody was looking for.
  //
  // Every future findings file is unclassified by construction (it will not be
  // named `chunk-<digits>.jsonl`), so this goes RED the next time one is added
  // without a decision being made about it.
  const sup = supersessionReport();
  assert.deepEqual(
    sup.atRisk.map((r) => `${r.src} loses ${r.wouldEat} row(s), ${r.wouldEatCritical} critical`),
    [],
    "an unclassified source is losing rows — declare it ADDITIVE or record why it is stale",
  );
});

test("the additive declaration is load-bearing, not decoration", () => {
  // If a file is declared ADDITIVE it must actually be rescuing something. A
  // declaration that saves nothing means either the corpus moved under it or
  // somebody guessed, and both are worth knowing before the totals are quoted.
  const sup = supersessionReport();
  const additive = sup.rows.filter((r) => r.additive);
  assert.ok(additive.length > 0, "no source is declared additive — has the set been emptied?");
  for (const r of additive) {
    assert.ok(
      r.wouldEat > 0,
      `${r.src} is declared ADDITIVE but supersession would not touch it — the declaration is doing nothing`,
    );
    assert.equal(r.actuallyEaten, 0, `${r.src} is declared ADDITIVE and is still losing rows`);
  }
});

test("every standing finding carries the fields a judge is told to read", () => {
  // finding-reader prints severity / what / frame / quote per finding, and the
  // judge prompt instructs judges to open the frame and compare the quote. A
  // row missing one prints "undefined", which reads as "nothing to compare".
  const missing = loadStandingBroken().filter(
    (j) => !j.findingId || !j.severity || !j.what || !j.scenario,
  );
  assert.deepEqual(missing.map((j) => j.findingId ?? j.scenario), []);
});

test("every retirement carries a frame that RESOLVES and a quote — checked at READ time", () => {
  // THE GAP THIS CLOSES, MEASURED 2026-08-21 by hand-retiring one real OPEN
  // critical (sc-vp-readiness:a3bdda5c) with no evidenceFrame and no
  // evidenceQuote: the open list fell 668 -> 667 and 248 -> 247 criticals, and
  // NOTHING objected. finding-reader.test.mjs passed 6/6, count-agreement.test
  // .mjs passed 7/7, count-agreement.mjs printed "AGREED — every counter
  // reports the same open list", and verdict-coverage.mjs said nothing at all,
  // because it audits wave-c/verdicts.jsonl and this row was never in it.
  //
  // The evidence rule WAS enforced — `evidenced()` in wave-c-post.mjs — but only
  // on the WRITE path, and a rule enforced only where it is written is a rule
  // about one tool rather than about the file. closures.jsonl is the thing that
  // subtracts from the open list, so the assertion belongs on the READ path,
  // where every consumer of loadClosures() is standing.
  //
  // "Resolves" is deliberately the test, not "is a .png": one legitimate
  // retirement (sc-signal-controller:ba4a6215, a finding about frame-collection
  // integrity) cites `_audit-status.json`, which is the right evidence for that
  // claim. What must never pass is a field that names a file nobody can open —
  // the sibling check in verdict-coverage.mjs exists because two CLOSED lines
  // arrived with Windows paths mangled by JSON escaping: field present, file
  // absent, check passed.
  const retired = loadClosures();
  assert.ok(retired.size > 0, "no retirements at all reads exactly like a clean sweep — that is the bug, not the pass");

  const bad = [];
  for (const [id, c] of retired) {
    if (!c.evidenceFrame) {
      bad.push(`${id}: retires a finding with NO evidenceFrame`);
      continue;
    }
    const tries = [c.evidenceFrame, String(c.evidenceFrame).split("\\").join("/")];
    const found = tries.some((t) => {
      try {
        return Boolean(t) && fs.existsSync(t);
      } catch {
        return false;
      }
    });
    if (!found) bad.push(`${id}: evidenceFrame DOES NOT RESOLVE — ${JSON.stringify(String(c.evidenceFrame).slice(0, 80))}`);
    if (!String(c.evidenceQuote ?? "").trim()) bad.push(`${id}: retires a finding with no evidenceQuote`);
  }
  assert.deepEqual(bad, [], "a retirement without readable evidence still subtracts from the open list");
});
