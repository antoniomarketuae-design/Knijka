// -----------------------------------------------------------------------------
// summary.mjs — the reader for `lesson-audit.mjs`'s MACHINE SUMMARY, i.e. the
// only part of an 84 KB drive transcript that becomes a ledger row.
//
// WHY IT IS ITS OWN MODULE. It used to be a closure halfway down `wave-c.mjs`,
// and `wave-c.mjs` drives 376 lessons the moment it is imported — argv, dirty-
// tree refusal, spawn loop, all at the top level. So nothing could call the
// reader without starting a wave, and a reader nobody can call is a reader
// nobody checks: it went fifteen rounds lifting nine fields off the summary
// line and silently dropping the two that say whether the drive's own INPUT
// arrived. `__tests__/wave-c-summary.test.mjs` drives this module against real
// run.log transcripts out of `.audit-frames/`.
//
// THE FIELDS ARE THE SUMMARY'S, NOT THIS MODULE'S. Every regex here reads a
// line `lesson-audit.mjs` prints; when that emitter's wording moves, this moves
// with it and the test says so by going red on the corpus rather than by
// quietly returning null — a null here is indistinguishable from „the drive did
// not do that", which is the reassuring direction every instrument bug in this
// programme has failed in.
// -----------------------------------------------------------------------------

/**
 * The `DRIVE:` machine-summary line (`lesson-audit.mjs` :4453, printed once per
 * drive whatever happened). Its PRESENCE is what lets an absent guard clause
 * below mean „zero" instead of „never measured".
 */
export const DRIVE_SUMMARY_RE = /^\s*DRIVE:\s.*$/m;

/**
 * THE TWO GUARD COUNTERS THE LEDGER USED TO DROP ON THE FLOOR.
 *
 * `sc-speed-creep:84ba5dbf`, and this is the row's own prescribed fix, quoted:
 * „add lostKeys and refusedReversePress to parseSummary so the signal lands in
 * the ledger row". Keeping the transcript (see wave-c.mjs's `writeFileSync`)
 * made the signal RECOVERABLE — it is in run.log, at ~84 KB a drive — but a
 * reader of `wave-c-results.jsonl` still could not see that a drive had lost
 * the brake twice, so five criticals in the brake-drop family stayed
 * unjudgeable from the ledger alone.
 *
 * MEASURED on the proof2 corpus, which is what makes these worth a column and
 * not a footnote: the lost-key guard fired on 83 of 122 mobile-right drives and
 * on 1 of 121 pc-right drives. Same script, same keystrokes, 68 % against
 * 0.8 % — the shape of a key dropped in the WebKit iPhone context, and the
 * reason a ledger row that cannot show it is a ledger row that mis-attributes
 * every speed finding taken on a phone.
 *
 * The emitter appends each clause ONLY when its counter is non-zero
 * (`lesson-audit.mjs` :4457-4458), so ABSENCE is the common case and has to be
 * read as 0 — but only once the `DRIVE:` line itself is on the transcript. A
 * drive that died before its summary measured neither counter, and reporting
 * „0 lost keys" for a drive that never reported is exactly the silence this
 * harness exists to refuse.
 */
export const INPUT_GUARDS = {
  /** «… · re-asserted the brake 2× after the sim lost the key» */
  lostKeys: /re-asserted the brake\s+(\d+)×\s+after the sim lost the key/,
  /** «… · refused 8 standstill brake presses (would have selected R)» */
  refusedReversePress:
    /refused\s+(\d+)\s+standstill brake press(?:es)?\s+\(would have selected R\)/,
};

/** Pull the machine summary the harness prints, which is the judgeable surface. */
export function parseSummary(stdout) {
  const grab = (re) => {
    const m = re.exec(stdout);
    return m ? m[1].trim() : null;
  };
  const drove = DRIVE_SUMMARY_RE.test(stdout);
  const guard = (re) => {
    const m = re.exec(stdout);
    if (m) return Number(m[1]);
    return drove ? 0 : null;
  };
  return {
    verdict: grab(/VERDICT:\s*(.+?)\s*·/),
    score: grab(/SCORE:\s*(\d+)\s*наказателни/),
    stars: grab(/(\d+)\s*от\s*3\s*звезди/),
    frames: grab(/frames:\s*(\d+)\s*captured/),
    lost: grab(/captured\s*·\s*(\d+)\s*LOST/),
    endedNaturally: /endedNaturally:\s*true/.test(stdout),
    forcedBy: grab(/forcedBy:\s*(.+?)\s*$/m),
    treeMoved: /THE SOURCE TREE MOVED DURING THIS DRIVE/.test(stdout),
    attested: grab(/serving\s+([0-9a-f]{12})/),
    // null = the drive never printed a summary, so neither counter was taken.
    lostKeys: guard(INPUT_GUARDS.lostKeys),
    refusedReversePress: guard(INPUT_GUARDS.refusedReversePress),
  };
}
