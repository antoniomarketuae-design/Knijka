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
 *
 * ============================================================================
 * AND THE QUESTION UNDER ALL OF THEM: DID THE DRIVE HAPPEN? — 2026-08-28
 * ============================================================================
 *
 * Everything above asks what the RESULT SCREEN said. None of it asks whether
 * there was ever a car. `classifyDrive` below is that question, and it lives
 * here rather than in the harness for the reason the header already gives: the
 * harness's own exit code and the judge-side classification must be ONE ladder
 * or they drift, and the drift is always toward "fine".
 *
 * MEASURED on the w14 sweep, `.audit-frames/w14/frames/sc-sp-curve__pc-right/`:
 * 47 byte-identical PNGs of the PAYWALL («Шофьорският симулатор те чака · Виж
 * пакета — 21,99 €»), 113 speed samples every one of them −1, no gear letter
 * ever read, no camera, no result surface — and `run.log` ending
 *
 *     EVIDENCE: complete — this lane can be judged (exit 0)
 *
 * `sc-fo-motorway-gap__pc-wrong` in w13 is the same folder. Both signed in
 * («reused a live session»), and the session cache validates IDENTITY, not
 * ENTITLEMENT, so the harness photographed the upsell page for three and a half
 * minutes and certified it. Judges were handed those folders.
 *
 * THE THIRD CASE IS THE ONE THAT MAKES THIS HARD. `sc-vp-stall` starts in N
 * with a manual box; the harness's whole key vocabulary is W/S/A/D/B/Escape —
 * there is no clutch and no selector key (`[`/`]`), so its top speed of 0 км/ч
 * is HONEST and a re-drive reproduces it exactly. Telling an operator to
 * re-drive that lane is the same lie pointing the other way. So there are three
 * classes below, not two, and the middle one says DO NOT RE-DRIVE.
 */
import fs from "node:fs";
import path from "node:path";

/** The three words the product can put on the pill, uppercased as the harness records them. */
export const PILL_WORDS = ["ИЗДЪРЖАН", "НЕИЗДЪРЖАН", "НЕЗАВЪРШЕН"];

/**
 * The selector positions a car can be driven from.
 * `platform/src/modules/sim/vehicle/driveline.ts:49` —
 * `SelectorPosition = "P" | "R" | "N" | "D" | "M"`. P and N are not driving
 * positions; "M" is a manual box that has been put in gear. Read off the glass
 * as `[aria-label^="Скоростен лост: "]` (StatusDashboard.tsx:676).
 */
export const DRIVING_GEARS = ["D", "R", "M"];

/**
 * The three answers to "did this drive happen?", with the exit code the harness
 * must publish for each and the sentence its footer must print.
 *
 * `redrive` is the field an operator acts on and it is the whole reason there
 * are three classes: `null` means the question does not arise, `true` means
 * photograph this lane again, and `false` means a re-drive will reproduce
 * exactly this and the harness is what has to change.
 */
export const DRIVE_CLASSES = {
  drove: {
    exit: 0,
    redrive: null,
    headline: "the drive happened",
    tag: null,
  },
  "never-started": {
    exit: 7,
    redrive: true,
    headline: "THE DRIVE NEVER STARTED — this folder photographs something that is not a driving lesson",
    tag: "THE DRIVE NEVER STARTED",
  },
  "not-performable": {
    exit: 8,
    redrive: false,
    headline: "THIS HARNESS CANNOT PERFORM THIS LESSON — the cockpit was live and the car was never in a driving gear",
    tag: "THIS HARNESS CANNOT DRIVE THIS LESSON",
  },
};

const own = (o, k) => o != null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const list = (v) => (Array.isArray(v) ? v : null);

/**
 * THE FOUR INDEPENDENT READERS THAT CAN ONLY ANSWER FROM INSIDE A COCKPIT,
 * each reporting `present` (this ledger's harness looked) and `alive` (it saw
 * something).
 *
 * `present` is load-bearing and is the same discriminator as `surfaceRecorded`
 * above: a ledger that is SILENT about a reader must never be read as a ledger
 * that looked and saw nothing. Older drives carry only some of these, and the
 * whole synthetic corpus in the tests carries none — condemning on silence
 * would fail every one of them, and would fail them as "dead".
 *
 * INDEPENDENT IS THE WORD THAT MATTERS, and the first draft of this function
 * got it wrong. It counted a dead SPEEDOMETER and a dead CAMERA as two
 * witnesses when both are fields of `steering.channel` — one probe, read once,
 * at one instant. Two fields of one reader is one opinion, and a gate that
 * calls it two would condemn a lane on a single mistimed probe. These four are
 * genuinely separate: different code paths, different moments, different
 * elements on the glass.
 *
 *   the cockpit census     every named beat + every drive tick, both modes
 *   the steer-channel probe one deliberate wheel test, once per lane
 *   the control loop       the guidance sampler, `roll` phase only
 *   the gear reader        `[aria-label^="Скоростен лост: "]`, every tick
 */
function driveReaders(st) {
  const out = [];
  const c = st?.cockpit;
  if (typeof c?.reads === "number") {
    out.push({
      name: "the cockpit census",
      present: true,
      // Any of its three channels answering is enough: this reader is alive if
      // ANYTHING in the cabin was on the glass.
      alive:
        (typeof c.speedReadable === "number" && c.speedReadable > 0) ||
        (Array.isArray(c.gears) && c.gears.length > 0) ||
        (typeof c.shellReads === "number" && c.shellReads > 0),
    });
  }
  const ch = st?.steering?.channel;
  if (typeof ch?.kmhAtCheck === "number" || own(ch, "camera")) {
    out.push({
      name: "the steer-channel probe",
      present: true,
      // −1 is the harness's word for «the speedometer is not in the DOM», so
      // `>= 0` is the test and not `> 0`: a car standing still reads 0 and
      // that is a LIVE dial.
      alive:
        (typeof ch?.kmhAtCheck === "number" && ch.kmhAtCheck >= 0) ||
        (typeof ch?.camera === "string" && ch.camera.trim().length > 0),
    });
  }
  const samples = list(st?.guidance?.samples);
  if (samples && samples.length) {
    out.push({
      name: "the control loop",
      present: true,
      alive: samples.some((s) => typeof s?.kmh === "number" && s.kmh >= 0),
    });
  }
  const gs = list(st?.reverse?.gearSeen);
  if (gs) out.push({ name: "the gear reader", present: true, alive: gs.length > 0 });
  return out;
}

function gearSelector(st) {
  const fromCockpit = list(st?.cockpit?.gears);
  const fromReverse = list(st?.reverse?.gearSeen);
  if (!fromCockpit && !fromReverse) return { present: false, alive: false, seen: [], everDriving: null };
  const seen = [...new Set([...(fromCockpit ?? []), ...(fromReverse ?? [])].map((g) => String(g).trim().toUpperCase()))];
  return {
    present: true,
    alive: seen.length > 0,
    seen,
    everDriving: seen.length ? seen.some((g) => DRIVING_GEARS.includes(g)) : null,
  };
}

/** Not a cockpit reader — a result screen proves the lesson RAN even on a
 *  ledger whose cockpit fields predate this field. "absent" is not a proof of
 *  anything: it is the debrief reader saying it looked and found no surface. */
function resultSurface(st) {
  return {
    present: own(st, "reachedVerdictCard") || own(st, "verdictSurface"),
    alive: st?.reachedVerdictCard === true || st?.verdictSurface === "pill" || st?.verdictSurface === "no-pill",
  };
}

/**
 * DID THE CAR EVER MOVE, over the WHOLE drive — not at one instant.
 *
 * The one-shot channel probe is deliberately NOT a source here. It reads the
 * dial once, and "0 км/ч at 12 s" is not "0 км/ч all run"; using it would
 * condemn any lane whose probe happened to land at a stop line. Only
 * whole-drive witnesses count: the cockpit census (every named beat and every
 * drive tick, both modes) and, on ledgers written before it existed, the
 * control loop's samples.
 */
function everMoved(st) {
  const c = st?.cockpit;
  if (typeof c?.reads === "number" && typeof c?.speedReadable === "number" && c.speedReadable > 0) {
    return {
      known: true,
      moving: (c.movingReads ?? 0) > 0,
      top: typeof c.topKmh === "number" ? c.topKmh : null,
      from: `the cockpit census — ${c.speedReadable} readable reading(s) of ${c.reads}, top ${c.topKmh} км/ч`,
    };
  }
  const readable = (list(st?.guidance?.samples) ?? []).filter((s) => typeof s?.kmh === "number" && s.kmh >= 0);
  if (readable.length) {
    const top = Math.max(...readable.map((s) => s.kmh));
    return {
      known: true,
      moving: top >= 1,
      top,
      from: `${readable.length} readable control-loop sample(s), top ${top} км/ч`,
    };
  }
  // Every MODE=«wrong» lane takes this branch on a pre-census ledger: the
  // control loop is never invoked in the `flat` phase, so there is NO
  // whole-drive speed witness at all. UNKNOWN, and nothing may be built on it.
  return { known: false, moving: null, top: null, from: null };
}

/**
 * Did this drive happen, and if not, which kind of not?
 *
 * @param {object} st a parsed `_audit-status.json` (or the object about to be
 *        written as one — the harness classifies itself with this function, so
 *        its exit code and its footer cannot disagree with its own ledger).
 * @returns {{ class: string, exit: number, redrive: boolean|null, headline: string,
 *             why: string, looked: string[], alive: string[] }}
 */
export function classifyDrive(st) {
  const readers = driveReaders(st);
  const looked = readers.filter((r) => r.present);
  const alive = looked.filter((r) => r.alive);
  const result = resultSurface(st);
  const gear = gearSelector(st);
  const moved = everMoved(st);
  const done = (cls, why) => ({
    class: cls,
    exit: DRIVE_CLASSES[cls].exit,
    redrive: DRIVE_CLASSES[cls].redrive,
    headline: DRIVE_CLASSES[cls].headline,
    tag: DRIVE_CLASSES[cls].tag,
    why,
    looked: looked.map((r) => r.name),
    alive: alive.map((r) => r.name),
  });

  // ── NOTHING IN THE COCKPIT ANSWERED, AND NO RESULT SURFACE EITHER ────────
  //
  // TWO INDEPENDENT READERS, not one. One dead reading is a reading that could
  // have been taken at the wrong moment or by a selector that moved; two
  // separate readers, at different moments, both present and both silent, with
  // no result screen, is a page that is not a driving lesson. That is the bar
  // the two paywall lanes clear by three readers and that no live lane in the
  // 356-lane w13+w14 corpus comes near.
  if (looked.length >= 2 && alive.length === 0 && !result.alive) {
    return done(
      "never-started",
      `NOT ONE of ${looked.length} independent cockpit reader(s) — ${looked.map((r) => r.name).join(", ")} — ever answered, and no ` +
        "result surface mounted. Nothing in this folder is evidence about a driving lesson: the frames are a " +
        "photograph of whatever page the harness was left on. WHOSE fault that is, is NOT decided here — a paywall " +
        "on an unentitled session and a lesson that crashed into its error boundary leave the same silence — so read " +
        "«DEBRIEF TEXT >>>» at the end of run.log and 01-arrival.png before filing anything. RE-DRIVE this lane.",
    );
  }

  // ── THE CAR WAS NEVER PUT IN GEAR, AND THIS HARNESS HAS NO KEY THAT COULD ─
  //
  // Both halves are required and both must be POSITIVELY known. «Never moved»
  // alone is a real product finding (sc-vp-readiness and sc-vp-handbrake sit
  // at 0 км/ч in D — the lesson is refusing to release the car, which is
  // exactly what a judge should see). It is the SELECTOR still reading P/N at
  // the end of the drive that says the harness never got as far as asking.
  if (moved.known && !moved.moving && gear.present && gear.seen.length > 0 && gear.everDriving === false) {
    return done(
      "not-performable",
      `the cockpit was live and the selector NEVER left ${gear.seen.join("/")} — no driving position ` +
        `(${DRIVING_GEARS.join("/")}) was on the glass at any point, and ${moved.from}. This harness's whole key ` +
        "vocabulary is W/S/A/D/B/Escape. The controls this car needs are not in it: " +
        "platform/src/modules/sim/scene/cabin.ts:515 binds gearUp/gearDown/clutch to " +
        "BracketRight/BracketLeft/KeyZ, and engine/stuckStart.ts:72 records that «Z + ]» is the product's own way " +
        "out of neutral on a manual — the same instruction the teach card paints on the glass (seen in " +
        ".audit-frames/w14/frames/sc-vp-stall__pc-right/04-t011s.png, beside a live cluster reading 0 км/ч and N). " +
        "So the harness could not have put this car in gear, and 0 км/ч here is HONEST rather than a finding about " +
        "the lesson. DO NOT RE-DRIVE — a " +
        "re-drive reproduces this exactly. Nothing about DRIVING, objectives, the verdict or the score may be " +
        "attributed to the product from this lane; its debrief COPY, layout and paint are real and may still be " +
        "read. To make this lane drivable the harness needs those three keys, not another run.",
    );
  }

  return done("drove", `${alive.length} of ${looked.length} independent cockpit reader(s) answered${result.alive ? ", and a result surface mounted" : ""}`);
}

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
    reached: null, verdict: null, error: null, phase: null, exit: null, drive: null, file,
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
    // DID THE DRIVE HAPPEN — derived from the ledger's own instrument fields,
    // NOT from its `exit`. It has to be derived rather than read, because the
    // 356 lanes already on disk were written by a harness that could not ask
    // the question and all 356 of them recorded `exit: 0`. Two of those are
    // 47 photographs of the paywall. A consumer that trusted the recorded
    // integer would keep handing both to judges until every wave is re-driven.
    drive: classifyDrive(st),
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
  // ── THE TWO STATES THE LADDER COULD NOT SEE UNTIL 2026-08-28 ─────────────
  //
  // `about: "unknown"` on the first one is deliberate and is the honest
  // answer: a paywall on an unentitled session and a lesson page that crashed
  // into its error boundary leave the SAME silence in this ledger, and one of
  // those is a product defect. The folder's own DEBRIEF TEXT tells them apart;
  // this field must not pretend to.
  "never-started": { judgeable: false, about: "unknown", tag: DRIVE_CLASSES["never-started"].tag },
  "not-performable": { judgeable: false, about: "instrument", tag: DRIVE_CLASSES["not-performable"].tag },
};

/**
 * The one-line sentence a report prints beside a count of each state. It lives
 * HERE, beside the state, because the copy used to live in a `WHAT` map inside
 * `wave-c-merge.mjs` keyed by state name — so a state added here printed
 * `undefined` there, in exactly the run where an operator most needed the
 * sentence. A consumer should read `LEG_STATES[state].what`.
 */
export const LEG_STATE_WHAT = {
  verdict: "a pill was read off the debrief — judgeable",
  "not-reached": "the ladder never reached a verdict card — closes nothing",
  "no-pill": "PRODUCT DEFECT: result screen mounted, NO verdict pill — file it",
  "no-surface": "PRODUCT DEFECT: no result surface in the DOM — file it",
  "reader-threw": "INSTRUMENT: the debrief reader threw — says nothing either way",
  "pre-matcher": "UNKNOWN: drove before verdictSurface existed — «НЕЗАВЪРШЕН» and a pill-less card are indistinguishable here; re-drive",
  "no-ledger": "INSTRUMENT: no readable _audit-status.json — certifies nothing",
  disagreement: "INSTRUMENT: the row and the lane ledger disagree — certifies nothing",
  "unknown-surface": "INSTRUMENT: unrecognised verdictSurface value",
  died: "INSTRUMENT: the ledger records a phase other than «complete» — a fragment, not an answer",
  "evidence-incomplete": "INSTRUMENT: the ledger's OWN exit is non-zero — the lane says its evidence is incomplete",
  "never-started": "UNKNOWN: no cockpit instrument ever answered — these frames are not of a driving lesson. RE-DRIVE",
  "not-performable": "INSTRUMENT: the car was never in a driving gear and this harness has no gear key — DO NOT re-drive, fix the harness",
};
for (const [k, v] of Object.entries(LEG_STATES)) v.what = LEG_STATE_WHAT[k];

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
  // ── DID THE DRIVE HAPPEN — ASKED BEFORE `exit`, AND DERIVED, NOT READ ────
  //
  // BEFORE, for two reasons that pull the same way. (1) A NEW lane that never
  // started records exit 7 and a not-performable one records 8; letting the
  // generic arm below catch them prints «the lane says its evidence is
  // incomplete … re-drive this lane», which is right for a lost frame, useless
  // for a paywall and an outright lie for sc-vp-stall, where a re-drive
  // reproduces the same non-drive forever. (2) Every lane ALREADY ON DISK
  // records exit 0, including the two that photographed the paywall 47 times,
  // so an arm that keys off the integer would leave the standing corpus exactly
  // as wrong as it is today until every wave is driven again.
  if (led.drive && led.drive.class !== "drove") {
    return done(led.drive.class, `${led.drive.headline.toUpperCase()} — ${led.drive.why}`);
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
