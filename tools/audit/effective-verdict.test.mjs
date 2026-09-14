// -----------------------------------------------------------------------------
// effective-verdict.test.mjs — ONE RULE FOR WHICH VERDICT COUNTS.
//
//   node --test tools/audit/effective-verdict.test.mjs
//
// §1 the rule's two halves, §2 the case that put UNJUDGED rows into wave 47,
// §3 the three tools that act on the ledger all use it (source pins), and the
// poster's inline copy has not drifted.
// -----------------------------------------------------------------------------
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { effectiveVerdicts, parseVerdictRows } from "./effective-verdict.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(resolve(REPO, p), "utf8");
const v = (id, verdict, correctedBy) => ({ findingId: id, verdict, correctedBy });

describe("§1 the two halves of the rule", () => {
  it("a LATER round outranks an earlier round's verifier", () => {
    const rows = [v("a", "STILL", "w45"), v("a", "STILL", "verify"), v("a", "CLOSED", "w46")];
    assert.equal(effectiveVerdicts(rows).get("a").verdict, "CLOSED");
  });
  it("WITHIN a round the verifier outranks the judge, whatever the append order", () => {
    const rows = [v("x", "UNJUDGED", "w46"), v("a", "STILL", "verify"), v("a", "CLOSED", "w46")];
    // `a`'s verify line falls in the w46 block (after w46's first line), and the
    // judge line appended AFTER it does not outrank it.
    assert.equal(effectiveVerdicts(rows).get("a").verdict, "STILL");
  });
  it("genuine ties keep last-wins (a second verifier on one finding)", () => {
    const rows = [v("a", "CLOSED", "w46"), v("a", "STILL", "verify"), v("a", "UNJUDGED", "verify")];
    assert.equal(effectiveVerdicts(rows).get("a").verdict, "UNJUDGED");
  });
  it("skips rows without a findingId and torn lines", () => {
    const rows = parseVerdictRows('{"findingId":"a","verdict":"STILL","correctedBy":"w1"}\n{torn\n{"verdict":"CLOSED"}\n');
    assert.equal(rows.length, 2);
    assert.equal(effectiveVerdicts(rows).size, 1);
  });
});

describe("§2 the wave-47 case — a verified STILL, then a fresh round's UNJUDGED", () => {
  it("is UNJUDGED, so it must NOT enter a repair wave", () => {
    // sc-ed-reverse-line:d6fb0f3c, verbatim shape of its last lines.
    const rows = [
      v("sc-ed-reverse-line:d6fb0f3c", "REFUTED", "w45"),
      v("sc-ed-reverse-line:d6fb0f3c", "STILL", "verify"),
      v("other:00000000", "STILL", "w46"),
      v("sc-ed-reverse-line:d6fb0f3c", "UNJUDGED", "w46"),
    ];
    assert.equal(effectiveVerdicts(rows).get("sc-ed-reverse-line:d6fb0f3c").verdict, "UNJUDGED");
  });
  it("the OLD generator rule (every verify beats every judge) gets it wrong — the control", () => {
    const rows = [
      v("r", "STILL", "verify"),
      v("q", "STILL", "w46"),
      v("r", "UNJUDGED", "w46"),
    ];
    const old = new Map();
    for (const r of rows) if (r.correctedBy !== "verify") old.set(r.findingId, r);
    for (const r of rows) if (r.correctedBy === "verify") old.set(r.findingId, r);
    assert.equal(old.get("r").verdict, "STILL", "the control no longer reproduces the defect it pins");
    assert.equal(effectiveVerdicts(rows).get("r").verdict, "UNJUDGED");
  });
});

describe("§3 every tool that acts on the ledger resolves it the same way", () => {
  it("wave-c-post.mjs's inline rank is still this rule", () => {
    const S = src("tools/audit/wave-c-post.mjs");
    assert.ok(S.includes('const rank = (r, i) => roundOf(i) * 2 + (r.correctedBy === "verify" ? 1 : 0);'), "the poster's rank expression changed — update effective-verdict.mjs to match it, or import it");
    assert.ok(S.includes("if (!final.has(r.findingId) || s >= finalRank.get(r.findingId))"), "the poster's tie rule changed");
  });
  it("make-repair-wave.mjs selects lanes on effectiveVerdicts, not on verify-always-wins", () => {
    const S = src("tools/audit/make-repair-wave.mjs");
    assert.ok(/import \{[^}]*effectiveVerdicts[^}]*\} from "\.\/effective-verdict\.mjs"/.test(S), "the generator no longer imports the shared rule");
    assert.ok(!/r\.correctedBy === "verify"\) eff\.set/.test(S), "the generator's old two-pass verify-always-wins resolution is back");
  });
  it("apply-reroute.mjs refuses non-STILL rows on effectiveVerdicts, not on the last line", () => {
    const S = src("tools/audit/apply-reroute.mjs");
    assert.ok(/import \{[^}]*effectiveVerdicts[^}]*\} from "\.\/effective-verdict\.mjs"/.test(S), "the router no longer imports the shared rule");
  });
});
