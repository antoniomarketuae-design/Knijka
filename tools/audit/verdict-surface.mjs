#!/usr/bin/env node
/**
 * WHY A DRIVE HAS NO VERDICT — the one ladder, so two consumers cannot drift.
 *
 * ============================================================================
 * THE BUG THIS FILE EXISTS TO END
 * ============================================================================
 *
 * Until 2026-08-21 the harness's verdict matcher knew two words, «ИЗДЪРЖАН» and
 * «НЕИЗДЪРЖАН». `SessionVerdict` has been three-way for months — passed /
 * failed / unfinished — and SESSION_VERDICT_LABEL_BG spells the third one
 * «Незавършен». So every unfinished drive was recorded as `verdict: null` and
 * printed «VERDICT: (none)».
 *
 * Two consumers were then written to COMPENSATE for that: seeing «(none)» they
 * said "this lesson is merely unfinished, the debrief card is there, read it".
 * That compensation was right about the corpus in front of them and wrong as a
 * rule, because «(none)» has always had more than one cause:
 *
 *     the pill said «Незавършен» and the matcher could not read it   ← instrument
 *     the result surface mounted and carries NO pill                 ← PRODUCT
 *     there is no result surface in the DOM at all                   ← PRODUCT
 *     the debrief reader threw before answering                      ← instrument
 *
 * With the matcher fixed, the first cause is gone — so the compensator now only
 * ever fires on the other three, and it labels a REAL PRODUCT DEFECT as "merely
 * unfinished, go read the card". That is the reassuring direction: it would
 * hand a judge a lesson whose result screen has no verdict on it and tell them
 * the verdict is there.
 *
 * ============================================================================
 * THE FOURTH STATE THAT IS NOT «(none)» AND IS NOT A DEFECT EITHER
 * ============================================================================
 *
 * `_audit-status.json` gained `verdictSurface` on 2026-08-21. MEASURED over the
 * standing Wave C corpus: the key is ABSENT on 376 of 376 drives, and 0 of 376
 * carry an `_audit-debrief.json` sidecar. Every drive we currently hold was made
 * by the harness that could not read «Незавършен».
 *
 * So a naive `verdictSurface === "no-pill"` test would come out `undefined` on
 * the whole corpus and fall into whatever the else-branch says — which is how
 * the previous bug was built. The states are told apart like this:
 *
 *   KEY ABSENT      the drive PREDATES the field. «Незавършен» and a missing
 *                   pill were one indistinguishable silence on that harness, so
 *                   the honest answer is UNKNOWN — re-drive to tell them apart.
 *                   It is not a defect and it is not an unfinished lesson.
 *   KEY PRESENT,
 *   VALUE null      `lesson-audit.mjs` writes `facts.verdictSurface ?? null`,
 *                   and `facts` is `{ error }` when the debrief reader threw.
 *                   Present-and-null therefore means THE INSTRUMENT DID NOT
 *                   ASK — it says nothing about the lesson in either direction.
 *   "pill"          a verdict was on the glass.
 *   "no-pill"       the surface mounted and carries none. PRODUCT DEFECT.
 *   "absent"        no result surface in the DOM. PRODUCT DEFECT.
 *
 * `hasOwnProperty` is the discriminator and it has to be — `?? null`, `== null`
 * and destructuring-with-default all collapse absent and null into one value,
 * and those two are opposite diagnoses.
 *
 * ============================================================================
 * AND THE LEDGER IS AUTHORITATIVE, NOT THE ROW
 * ============================================================================
 *
 * `wave-c-results.jsonl` rows carry `verdict` scraped out of the harness's
 * STDOUT by a regex in tools/mobile/wave-c.mjs. `_audit-status.json` is written
 * by the harness itself, in the lane, before any teardown that can abort — the
 * same reason `judgeLaneEvidence()` reads `exit` from there and not from the
 * process code. So the ledger wins, and a row that disagrees with its own
 * folder is reported rather than resolved (MEASURED across the standing corpus:
 * 264 legs where both are set, 0 disagreements, 0 one-sided — so this arm is a
 * guard for a future mismatched `out` path, not a description of today).
 *
 * NOTHING HERE FALLS BACK TO `08-debrief.png`. The harness writes that frame
 * unconditionally, so its existence is true on all 376 drives including the two
 * that photographed a live cockpit with an unclicked РЕЗУЛТАТ button. A
 * fallback onto it turns "I could not read the ledger" into "the card was
 * reached", which is the reassuring direction again.
 */
import fs from "node:fs";
import path from "node:path";

/** The three words the product can put on the pill, uppercased as the harness records them. */
export const PILL_WORDS = ["ИЗДЪРЖАН", "НЕИЗДЪРЖАН", "НЕЗАВЪРШЕН"];

/**
 * "", "-", null and EVERY «(none …)» form mean "no verdict string".
 *
 * THE `=== "(none)"` TEST IS ALREADY DEAD AND NOTHING NOTICED — 2026-08-21.
 *
 * Round 1 made the harness print the REASON beside the silence:
 *
 *     VERDICT: (none — the surface mounted and carries NO pill) · SCORE: …
 *
 * `tools/mobile/wave-c.mjs` builds each results row by scraping that line with
 * `/VERDICT:\s*(.+?)\s*·/`, so from the next wave onward the row carries the
 * whole parenthetical, not the literal «(none)». MEASURED against the real
 * regex and the real format string: all three reasons come through in full.
 *
 * Every `verdict === "(none)"` comparison in this repo therefore stops matching
 * the moment a new wave is driven — and stops matching in the REASSURING
 * direction, because a non-matching row reads as a row that HAS a verdict. The
 * standing corpus was driven before that change and still says «(none)», so a
 * test written against today's files would pass and the failure would arrive
 * with the next wave, silently.
 */
export function normaliseVerdict(v) {
  const s = String(v ?? "").trim();
  if (!s || s === "-") return null;
  if (/^\(\s*none\b/i.test(s)) return null;
  return s.toUpperCase();
}

/**
 * Read one lane's ledger. Never throws: an unreadable ledger is a STATE, and
 * the state is "this lane certifies nothing", not "this lane is fine".
 *
 * @param {string} outDir the lane's frame directory
 */
export function readLaneLedger(outDir) {
  const file = outDir ? path.join(outDir, "_audit-status.json") : null;
  const miss = (why) => ({
    ok: false, why, surfaceRecorded: false, surface: undefined,
    reached: null, verdict: null, error: null, phase: null, exit: null, file,
  });
  if (!file) return miss("no output directory was recorded for this lane");
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    return miss(`${file} could not be read (${String(e?.message ?? e)})`);
  }
  let st;
  try {
    st = JSON.parse(raw);
  } catch (e) {
    return miss(`${file} did not parse (${String(e?.message ?? e)})`);
  }
  if (!st || typeof st !== "object") return miss(`${file} is not an object`);
  return {
    ok: true,
    why: null,
    // The load-bearing line. See the header: absent and null are opposite.
    surfaceRecorded: Object.prototype.hasOwnProperty.call(st, "verdictSurface"),
    surface: st.verdictSurface,
    reached: st.reachedVerdictCard === true ? true : st.reachedVerdictCard === false ? false : null,
    verdict: normaliseVerdict(st.verdict),
    error: typeof st.error === "string" ? st.error : null,
    // THE TWO FIELDS THE LEDGER IS ACTUALLY AUTHORITATIVE ABOUT — see the note
    // above `classifyLeg`. Read as-is: a missing `phase` is not "complete" and
    // a non-numeric `exit` is not zero.
    phase: typeof st.phase === "string" ? st.phase : null,
    exit: typeof st.exit === "number" ? st.exit : null,
    file,
  };
}

/**
 * Every answer this ladder can give. `judgeable` is the only field a caller
 * should branch on to decide whether a leg may close anything; `about` says who
 * the finding is about when it is not judgeable, because "the product has no
 * pill" and "our instrument did not ask" must never be counted together again.
 *
 *   about: "lesson"     a fact about the driving lesson
 *          "product"    a defect in the result screen itself
 *          "instrument" a failure of this harness — says nothing about the lesson
 *          "unknown"    genuinely undetermined; re-drive to find out
 *
 * `tag` is what gets printed BESIDE A LEG, and it is short on purpose: the full
 * sentence is in `why`, and a lesson with four legs would otherwise repeat a
 * 250-character explanation three times in one line a judge has to read. The
 * tags are the keys of the legend make-verdicts2.mjs ships in the prompt, so
 * changing one here without changing it there breaks the lookup.
 */
export const LEG_STATES = {
  verdict: { judgeable: true, about: "lesson", tag: null },
  "not-reached": { judgeable: false, about: "unknown", tag: "NO VERDICT CARD REACHED" },
  "no-pill": { judgeable: false, about: "product", tag: "PRODUCT DEFECT: no verdict pill" },
  "no-surface": { judgeable: false, about: "product", tag: "PRODUCT DEFECT: no result surface" },
  "reader-threw": { judgeable: false, about: "instrument", tag: "INSTRUMENT: the debrief reader threw" },
  "pre-matcher": { judgeable: false, about: "unknown", tag: "VERDICT UNREADABLE BY THIS DRIVE'S HARNESS" },
  "no-ledger": { judgeable: false, about: "instrument", tag: "NO LEDGER" },
  disagreement: { judgeable: false, about: "instrument", tag: "LEDGER DISAGREES WITH THE ROW" },
  "unknown-surface": { judgeable: false, about: "instrument", tag: "UNRECOGNISED verdictSurface" },
  died: { judgeable: false, about: "instrument", tag: "THE HARNESS DIED MID-LANE" },
  "evidence-incomplete": { judgeable: false, about: "instrument", tag: "THE LANE ITSELF SAYS ITS EVIDENCE IS INCOMPLETE" },
};

/**
 * Classify one re-driven leg.
 *
 * @param {{ leg?: string, verdict?: string|null, out?: string|null }} row a
 *        wave-c-results.jsonl row (or anything with the same three fields)
 * @returns {{ state: string, judgeable: boolean, about: string, verdict: string|null,
 *             label: string, why: string }}
 */
export function classifyLeg(row) {
  const rowVerdict = normaliseVerdict(row?.verdict);
  const led = readLaneLedger(row?.out);
  const done = (state, why, verdict = null) => ({
    state,
    judgeable: LEG_STATES[state].judgeable,
    about: LEG_STATES[state].about,
    tag: LEG_STATES[state].tag,
    verdict,
    why,
    label: (row?.leg ?? "?") + " " + (state === "verdict" ? `(${verdict})` : `[${LEG_STATES[state].tag}]`),
  });

  if (!led.ok) {
    // NOT a fallback onto the frame — see the header. No ledger, no certificate.
    return done("no-ledger", `NO LEDGER — ${led.why}; this lane certifies nothing`);
  }
  // ── THE LEDGER IS AUTHORITATIVE ABOUT `phase` AND `exit` TOO — 2026-08-21 (verifier)
  //
  // The header above argues the ledger outranks the row, "the same reason
  // `judgeLaneEvidence()` reads `exit` from there and not from the process
  // code" — and then read three fields from it and not those two. Both callers
  // gate certifiability on the ROW's `exit`, which `tools/mobile/wave-c.mjs`
  // fills from `res.status`: the node process's own code, the exact value
  // lesson-audit.mjs:4104 says not to trust ("READ `exit` OUT OF
  // `_audit-status.json`, and treat a process code that disagrees with it as
  // evidence about node, not about the lesson").
  //
  // The direction that matters: a lane whose PROCESS exits 0 while its LEDGER
  // records EXIT_EVIDENCE_INCOMPLETE — frames lost, or stdout broken — sails
  // through `row.exit === 0` and, if a pill happens to be recorded, comes back
  // `judgeable`. That certifies a lane which says of itself that part of its
  // evidence is missing.
  //
  // MEASURED over the standing 376: 376 `phase: "complete"`, 0 rows where
  // `row.exit !== ledger.exit`, 0 non-numeric ledger exits — so this changes
  // nothing today and exists for the lane that eventually disagrees, exactly
  // like the row/ledger verdict arm below.
  if (led.phase !== "complete") {
    return done(
      "died",
      `THE HARNESS DIED MID-LANE — ${led.file} records phase «${led.phase ?? "(none)"}», not «complete». ` +
        "Whatever is in this folder is a fragment, not an answer, and it certifies nothing",
    );
  }
  if (led.exit !== 0) {
    return done(
      "evidence-incomplete",
      `THE LANE ITSELF SAYS ITS EVIDENCE IS INCOMPLETE — ${led.file} records exit ` +
        `${led.exit === null ? "(none — phase is complete but no exit was written)" : `«${led.exit}»`}. ` +
        "The ledger outranks the process code the results row carries; re-drive this lane",
    );
  }
  if (led.reached !== true) {
    return done(
      "not-reached",
      "NO VERDICT CARD REACHED — 08-debrief.png is whatever was on the glass, not a verdict; closes nothing",
    );
  }
  // ONLY AN UNAMBIGUOUS ROW MAY RAISE A DISAGREEMENT. The row's `verdict` is a
  // REGEX SCRAPE OF STDOUT, and stdout now carries prose in that position (see
  // normaliseVerdict). A scrape that produced something which is not one of the
  // three pill words is noise, not a contradicting observation, and letting it
  // manufacture a "disagreement" would bury the real diagnosis — which the
  // ledger, sitting right there, already gives.
  const rowPill = PILL_WORDS.includes(rowVerdict) ? rowVerdict : null;
  if (rowPill && rowPill !== led.verdict) {
    return done(
      "disagreement",
      `LEDGER DISAGREES WITH THE ROW — the row says «${rowPill}», ${led.file} says ` +
        `«${led.verdict ?? "no verdict"}»; the ledger is authoritative and this lane certifies nothing`,
    );
  }
  if (led.verdict) return done("verdict", "a verdict pill was read off the debrief", led.verdict);

  if (!led.surfaceRecorded) {
    return done(
      "pre-matcher",
      "VERDICT UNREADABLE BY THE HARNESS THAT DROVE IT — this drive predates the three-verdict matcher, " +
        "so «НЕЗАВЪРШЕН» and a result screen with no pill were the same silence. Which one this is, is " +
        "UNKNOWN: re-drive it. Do not read it as unfinished and do not read it as a defect",
    );
  }
  switch (led.surface) {
    case "no-pill":
      return done(
        "no-pill",
        "PRODUCT DEFECT — the result screen mounted and carries NO verdict pill. This is a finding about " +
          "the lesson's debrief, not an unfinished drive; file it, do not close anything from it",
      );
    case "absent":
      return done(
        "no-surface",
        "PRODUCT DEFECT — the card was reached yet there is NO result surface in the DOM; closes nothing",
      );
    case null:
    case undefined:
      return done(
        "reader-threw",
        `THE DEBRIEF READER NEVER ANSWERED — ${led.error ?? "no verdictSurface was recorded"}. This says ` +
          "NOTHING in either direction and is a finding about this harness, not about the lesson",
      );
    case "pill":
      return done(
        "disagreement",
        "LEDGER CONTRADICTS ITSELF — verdictSurface says «pill» while no verdict string was recorded; " +
          "that is an instrument fault and this lane certifies nothing",
      );
    default:
      return done("unknown-surface", `UNRECOGNISED verdictSurface «${String(led.surface)}» — closes nothing`);
  }
}

/** Count states across many rows, in a fixed order so two runs are comparable. */
export function tallyStates(rows) {
  const out = new Map(Object.keys(LEG_STATES).map((k) => [k, 0]));
  for (const r of rows) out.set(r.state, (out.get(r.state) ?? 0) + 1);
  return out;
}
