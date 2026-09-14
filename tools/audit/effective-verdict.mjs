// -----------------------------------------------------------------------------
// effective-verdict.mjs — WHICH VERDICT LINE IS THE FINAL WORD ON A FINDING,
// written ONCE so the tools that act on it cannot disagree.
//
// THE RULE (the poster's, `wave-c-post.mjs` — it decides the open count):
//   1. a LATER ROUND outranks an earlier one — a round that looked at fresh
//      frames must be able to overturn a verifier from the round before;
//   2. WITHIN one round, a `verify` line outranks the judge — the verifier is
//      the appeal court, whatever order the lines were appended in.
// The `verify` tag carries no round of its own, so a line's round is the round
// whose block it falls in: rounds are recognised by where each non-verify
// `correctedBy` tag FIRST appears, in file order. Ties keep last-wins.
//
// WHY THIS FILE EXISTS — measured 2026-09-14, building wave 47.
// Three tools resolved the same ledger three ways:
//   · wave-c-post.mjs        round-aware rank (above)            -> the count
//   · make-repair-wave.mjs   every verify line beats every judge  -> the lanes
//   · apply-reroute.mjs      plain last line in the file          -> the routing
// So `sc-ed-reverse-line:d6fb0f3c` — verified STILL in w45, judged UNJUDGED by
// the fresh w46 round — was UNJUDGED to the poster and to the router, and STILL
// to the generator. The generator's own header says UNJUDGED rows NEVER enter a
// repair wave; it put three of them into wave 47, and the router refused their
// reroutes because it (correctly) saw UNJUDGED. A lane sent at a row nobody
// could judge spends a day proving what a drive would show in four minutes.
//
// wave-c-post.mjs keeps its own inline copy on purpose — it is the authority and
// is not touched by this fix — and `effective-verdict.test.mjs` pins that the
// copy's rank expression is still the one below, so the two cannot drift apart
// silently.
// -----------------------------------------------------------------------------

/** Round-aware effective verdict per findingId, from verdict rows in FILE ORDER. */
export function effectiveVerdicts(rows) {
  const roundStart = [];
  rows.forEach((r, i) => {
    const tag = (r && r.correctedBy) || "";
    if (!tag || tag === "verify") return;
    if (!roundStart.some((x) => x.tag === tag)) roundStart.push({ tag, at: i });
  });
  const roundOf = (i) => {
    let n = 0;
    for (let k = 0; k < roundStart.length; k += 1) if (i >= roundStart[k].at) n = k + 1;
    return n;
  };
  const rank = (r, i) => roundOf(i) * 2 + (r.correctedBy === "verify" ? 1 : 0);
  const final = new Map();
  const finalRank = new Map();
  rows.forEach((r, i) => {
    if (!r || !r.findingId) return;
    const s = rank(r, i);
    if (!final.has(r.findingId) || s >= finalRank.get(r.findingId)) {
      final.set(r.findingId, r);
      finalRank.set(r.findingId, s);
    }
  });
  return final;
}

/** Parse a verdicts.jsonl text into rows in file order, skipping torn lines. */
export function parseVerdictRows(text) {
  const rows = [];
  for (const l of String(text || "").split("\n")) {
    if (!l.trim()) continue;
    try { rows.push(JSON.parse(l)); } catch { /* torn tail line */ }
  }
  return rows;
}
