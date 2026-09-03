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

/**
 * WHICH CHANNEL DROVE THE CAR — `sc-speed-creep:dff70553`.
 *
 * The row that closes here: „the brake-drop family is mis-named — the harness
 * never dispatches a touch, so it cannot exercise TouchControls.tsx, the
 * suspect file all five rows name." The harness now states its channel on
 * every lane (`lesson-audit.mjs`, the INPUT line beside DRIVE:), and this is
 * what carries it into `wave-c-results.jsonl`, where routing is decided.
 *
 * WITHOUT THE COLUMN THE ATTESTATION IS UNREACHABLE. It is one line in an
 * ~84 KB transcript that only a reader who already suspects the answer would
 * grep for — which is exactly how five criticals came to name a file no drive
 * had touched. A dispatcher reading the ledger can now see `touchEvents: 0`
 * beside every mobile row and refuse the address without opening a log.
 *
 * ABSENCE IS NULL, NEVER "keyboard". A drive that died before its summary
 * stated no channel; answering „keyboard" there would be this module inventing
 * an attestation the harness never made, in the reassuring direction.
 */
export const INPUT_ATTESTATION = {
  /** «  INPUT: keyboard · 214 pedal/steer key events · …» */
  channel: /^\s*INPUT:\s*(\S+)\s*·/m,
  // ANCHORED TO THE `INPUT:` LINE, and that is not tidiness. Since
  // `TOUCH PROBE:` prints its own «N touch events dispatched» clause directly
  // underneath, a floating `/·\s*(\d+)\s*touch events dispatched/` reads
  // whichever line the emitter happens to print first — i.e. the ledger's
  // channel column would silently follow the transcript's ORDER. Each regex
  // now names the line it belongs to.
  driveKeyEvents: /^\s*INPUT:[^\n]*·\s*(\d+)\s*pedal\/steer key events/m,
  touchEvents: /^\s*INPUT:[^\n]*·\s*(\d+)\s*touch events dispatched/m,
  /** «… · touch overlay mounted» — mounted | absent | unreadable */
  touchOverlay: /^\s*INPUT:[^\n]*·\s*touch overlay\s+(mounted|absent|unreadable)/m,
};

/**
 * WHAT HAPPENED WHEN THE HARNESS ACTUALLY PRESSED THE PAD — the closing half
 * of `sc-speed-creep:dff70553`.
 *
 * The attestation above could only ever report a NEGATIVE: this lane sent no
 * touch. Seven verdicts (w11–w14, w23–w25) upheld the row on exactly that,
 * every one of them saying it „needs a harness change to close", because a
 * column reading `touchEvents: 0` still leaves `TouchControls.tsx` a surface
 * no drive in the corpus has ever reached. `lesson-audit.mjs` now actuates the
 * drivetrain pad once the drive is over (`lib/touch-probe.mjs`), and this is
 * what carries the result into `wave-c-results.jsonl`.
 *
 * FOUR FIELDS, NOT ONE, BECAUSE THEY FAIL SEPARATELY. „the pad answered"
 * (actuated), „and still owned the finger half a second later" (hold — the
 * brake-drop question itself), „and let go on the way out" (release), and how
 * many events it cost. A single boolean would collapse a pad that dropped its
 * ownership mid-hold into a pad that was never reached, and those are the two
 * halves of the family this row is about.
 *
 * ABSENCE IS NULL. A lane that died before the probe ran states nothing, and
 * „not actuated" is a measurement, not a default.
 */
export const TOUCH_PROBE = {
  /** «  TOUCH PROBE: actuated · 4 touch events dispatched · hold survived · release clean — …» */
  actuated: /^\s*TOUCH PROBE:\s*(actuated|NOT actuated)\s*·/m,
  events: /^\s*TOUCH PROBE:[^\n]*·\s*(\d+)\s*touch events dispatched/m,
  hold: /^\s*TOUCH PROBE:[^\n]*·\s*hold\s+(survived|did NOT survive)/m,
  release: /^\s*TOUCH PROBE:[^\n]*·\s*release\s+(clean|NOT observed)/m,
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
  /** A count the emitter prints UNCONDITIONALLY: present means the number,
   *  absent means nobody looked. Never `drove ? 0 : null` — that reading
   *  belongs to the two clauses that are appended only when non-zero. */
  const num = (re) => {
    const m = re.exec(stdout);
    return m ? Number(m[1]) : null;
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
    // The channel attestation. Every field is null when the harness did not
    // print the INPUT line — an unstated channel, not a defaulted one.
    inputChannel: grab(INPUT_ATTESTATION.channel),
    driveKeyEvents: num(INPUT_ATTESTATION.driveKeyEvents),
    touchEvents: num(INPUT_ATTESTATION.touchEvents),
    touchOverlay: grab(INPUT_ATTESTATION.touchOverlay),
    // The pad actuation. Same rule: a lane that printed no TOUCH PROBE line
    // measured nothing, and null is what that is.
    touchProbe: grab(TOUCH_PROBE.actuated),
    touchProbeEvents: num(TOUCH_PROBE.events),
    touchProbeHold: grab(TOUCH_PROBE.hold),
    touchProbeRelease: grab(TOUCH_PROBE.release),
  };
}
