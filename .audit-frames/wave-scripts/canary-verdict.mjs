// What the canary must show before a 211-drive fleet is dispatched.
//
// Reads only fields that are actually recorded. See the block in
// sweep-preflight.sh for why the previous condition (`reachedVerdictCard` out of
// wave-c-results.jsonl) could never be true.
import fs from "node:fs";
import path from "node:path";

const DIR = process.env.CANARY_DIR;
if (!DIR) { console.log("NO-DIR"); process.exit(0); }
const results = path.join(DIR, "wave-c-results.jsonl");
if (!fs.existsSync(results)) { console.log("NO-RESULTS — the canary wrote nothing, so it did not drive"); process.exit(0); }
const lines = fs.readFileSync(results, "utf8").trim().split("\n").filter(Boolean);
if (lines.length !== 1) { console.log("EXPECTED-ONE-ROW-GOT-" + lines.length); process.exit(0); }

const r = JSON.parse(lines[0]);
// The three pills the product can actually stamp. Anything else — null, "(none)",
// a paywall — is not a graded drive.
const PILLS = ["\u0418\u0417\u0414\u042a\u0420\u0416\u0410\u041d", "\u041d\u0415\u0418\u0417\u0414\u042a\u0420\u0416\u0410\u041d", "\u041d\u0415\u0417\u0410\u0412\u042a\u0420\u0428\u0415\u041d"];
const why = [];
if (r.exit !== 0) why.push("exit=" + r.exit);
if (!PILLS.includes(String(r.verdict))) why.push("verdict=" + r.verdict + " is not one of the three pills");
if (!(r.frames > 0)) why.push("frames=" + r.frames);
if (r.treeMoved) why.push("the worktree moved during the drive");

// Stronger, when the lane wrote a status file: this is the original intent.
const lane = path.join(DIR, "frames", r.lesson + "__" + r.leg, "_audit-status.json");
let card = "(no status file)";
if (fs.existsSync(lane)) {
  try {
    const st = JSON.parse(fs.readFileSync(lane, "utf8"));
    card = String(st.reachedVerdictCard);
    if (st.reachedVerdictCard !== true) why.push("reachedVerdictCard=" + st.reachedVerdictCard + " in _audit-status.json");
  } catch { why.push("_audit-status.json did not parse"); }
}

const summary = r.verdict + " | exit=" + r.exit + " | frames=" + r.frames + " | reachedVerdictCard=" + card;
console.log((why.length ? "FAIL — " + why.join("; ") + " | " : "OK — ") + summary);
