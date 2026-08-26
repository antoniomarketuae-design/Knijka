// -----------------------------------------------------------------------------
// resume.mjs — WHICH (lesson, leg) PAIRS A PREVIOUS RUN ACTUALLY MEASURED.
//
// This is the predicate that decides what a resumed sweep SKIPS, and it used to
// live inline in `wave-c.mjs` reading:
//
//     if (j.head === HEAD) done.add(`${j.lesson}/${j.leg}`);
//
// — the exit code was never consulted. A drive that died at «loading-lesson»
// with zero frames was therefore filed as measured FOR EVER, even though the
// harness's own run.log ends:
//
//     !! this lane produced no verdict of its own; RE-DRIVE it.
//        Nothing below is a finding about the lesson.
//
// The harness told the truth and the bookkeeping threw it away. Measured on
// 2026-08-26: three drives crashed that way during the 204-leg fill sweep
// (sc-vp-stall/mobile-wrong, sc-rx-tram-left/mobile-wrong,
// sc-follow-brake/mobile-right). Left alone they would have been three holes
// inside a sweep reporting 204/204 — and two of the three carried rows that
// judges were about to adjudicate, so the holes would have come back as
// UNJUDGED «no frame» and been blamed on the lesson.
//
// THE LINE BETWEEN MEASURED AND NOT, from lesson-audit.mjs's own codes:
//   0 EXIT_JUDGEABLE            the drive happened and its frames exist
//   1 EXIT_EVIDENCE_INCOMPLETE  it drove, but frames and/or the log were lost
//   ── everything at or above 2 never reached the lesson ──
//   2 EXIT_USAGE                nothing was dispatched
//   3 EXIT_SIGNIN_REFUSED       the lane never reached the lesson
//   4 EXIT_CRASHED              the harness itself died
//   5 EXIT_TARGET_UNSET         no base was given
//   6 EXIT_TARGET_UNVERIFIED    the target cannot say which build it is
//
// 0 and 1 are real measurements — 1 is a drive that happened and lost some of
// its evidence, which is a finding about the harness, not an absence of work.
// 2 and above are NOT measurements, and recording them as done is how a sweep
// reports full coverage over holes.
//
// It lives in lib/ for the same reason `summary.mjs` does: `wave-c.mjs` drives
// every lesson at import, so nothing inside it can be tested without starting a
// wave. That is exactly how the previous version of this predicate survived
// unexamined.
// -----------------------------------------------------------------------------

export const EXIT_JUDGEABLE = 0;
export const EXIT_EVIDENCE_INCOMPLETE = 1;

/**
 * Did this ledger row measure the lesson, at the build we are driving now?
 * A row from another commit is not a measurement of THIS build, and a row that
 * never reached the lesson is not a measurement at all.
 */
export function countsAsMeasured(row, head) {
  if (!row || typeof row !== "object") return false;
  if (row.head !== head) return false;
  return row.exit === EXIT_JUDGEABLE || row.exit === EXIT_EVIDENCE_INCOMPLETE;
}

/**
 * The set of `lesson/leg` keys a resumed run may skip.
 * A torn tail line is skipped, not fatal: an interrupted append is not a reason
 * to re-drive everything.
 */
export function measuredLegs(text, head) {
  const done = new Set();
  for (const line of String(text ?? "").split("\n")) {
    if (!line.trim()) continue;
    let row = null;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (countsAsMeasured(row, head)) done.add(`${row.lesson}/${row.leg}`);
  }
  return done;
}
