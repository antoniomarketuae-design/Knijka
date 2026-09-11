#!/usr/bin/env node
/**
 * BUILD THE SWEEP'S DRIVE SET FROM THE LIVE CORPUS.
 *
 * For each open lesson, drive exactly the legs its OPEN findings were filed on.
 * Driving a leg no finding cites photographs nothing anyone is waiting for;
 * missing a leg a finding cites leaves that row unprovable for another round.
 *
 * WHY THIS REPLACES `.audit-frames/wave-scripts/build-redrive.mjs`. That one read
 * `.audit-frames/still-batches.json` — a snapshot written by one adjudication
 * round — and `.audit-frames/` is gitignored, so neither the script nor its
 * input was version-controlled and both drifted silently.
 *
 * MEASURED 2026-08-30, and it cost a whole sweep: the w18 run dispatched 29
 * lessons across two shards and drove FIVE DRIVES. The work-list held 87 entries
 * built from a two-day-old batch file containing 222 findings against a live open
 * list of 259, and only 2 of the 29 w18 lessons appeared in it. `wave-c.mjs`
 * SELECTS from this file — `--lessons` filters it, it never adds — so shard 1
 * reported "0 lesson(s) · 0 drive(s) to run" and exited clean. A sweep that
 * drives nothing and exits 0 is the reassuring direction: it looks like a fast
 * round rather than an empty one.
 *
 * So the set is now derived from `corpusCounts().open` at the moment of the
 * sweep, and this file is tracked and tested like every other counter.
 *
 *   node tools/audit/build-redrive.mjs                        every open lesson
 *   node tools/audit/build-redrive.mjs --lessons <file>       restrict to a list
 *   node tools/audit/build-redrive.mjs --out <path>           default waveC-redrive.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { corpusCounts, openListLine, workedLine } from "./finding-reader.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const BS = String.fromCharCode(92);

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const OUT = flag("--out", path.join(REPO, ".audit-frames", "waveC-redrive.json"));
const LESSONS_FILE = flag("--lessons", null);

const VALID = new Set(["pc-right", "pc-wrong", "mobile-right", "mobile-wrong"]);

/**
 * The leg a frame was photographed on. TWO SHAPES EXIST IN THIS CORPUS and
 * both are load-bearing:
 *
 *   modern  .../<sweep>/frames/<lesson>__<leg>/<file>.png
 *   sweep161 .../sweep161/<lesson>/<leg>/<file>.png
 *
 * Reading only the modern one leaves 44 of the 58 open rows in the w18 lesson
 * set with no leg, which makes the builder fall back to driving ALL FOUR legs
 * for 20 of 29 lessons — 90 drives where 34 would do, most of them
 * photographing legs no finding ever cited. Measured 2026-08-30.
 *
 * Both are answered the same way: a path segment that IS one of the four legs,
 * or a segment ending `__<leg>`. Nothing else counts, so an unrecognised shape
 * returns null and the caller drives all four rather than guessing one.
 */
export function legOfFrame(p) {
  const segments = String(p ?? "").split(BS).join("/").split("/");
  for (let k = segments.length - 1; k >= 0; k -= 1) {
    const seg = segments[k];
    if (VALID.has(seg)) return seg;
    const j2 = seg.indexOf("__");
    if (j2 >= 0 && VALID.has(seg.slice(j2 + 2))) return seg.slice(j2 + 2);
  }
  return null;
}

/**
 * THE LEGS A FINDING NAMES IN PROSE — not the one its screenshot came from.
 *
 * A cross-leg claim is a claim about TWO legs and carries ONE frame, because a
 * frame is one leg. `legOfFrame` therefore contributes half of it, and the
 * sweep photographs half of a two-halved sentence. `sc-turn-left-oncoming`'s
 * row d079e687 — "pc-right records 1 опасна грешка and 10 points, mobile-right
 * records 0 mistakes and 0 points" — has collected TEN verdict lines, and nine
 * of them say the same thing: only the two PC legs of this lesson were
 * re-driven. The judge was right every time; the work-list never sent the
 * mobile half.
 *
 * The other half exists only in `what`, so that is where it is read from.
 *
 * WHY SUBSTRING MATCHING ON THE FOUR LITERALS WAS NOT ENOUGH — measured
 * 2026-09-11 on the five rows an adversarial verifier called "settleable by leg
 * selection alone". FINDINGS DO NOT WRITE `pc-wrong`. THEY WRITE ENGLISH:
 *
 *   440b1f7c  "On PC the wrong drive books no mistake either"       -> []
 *   d7531206  "PC ticks 0 of 3 objectives ..., mobile ticks 2 of 3" -> []
 *   9d07cc7c  "The careful drive and the reckless drive ... on both platforms"
 *                                                                   -> []
 *   d867ca4c  "In both drives the car finishes INSIDE a building"   -> []
 *
 * All four returned the empty list, so each lesson was driven on the half its
 * screenshot happened to come from, and 440b1f7c's pc-wrong leg went unphoto-
 * graphed for two consecutive waves while the row stayed open.
 *
 * THE TWO FAILURE DIRECTIONS ARE NOT SYMMETRIC, and that asymmetry is the whole
 * design. Under-matching leaves a row open forever and indistinguishable from a
 * real defect. Over-matching costs a minute of a 90-drive sweep per spurious leg
 * AND DILUTES — a judge handed four legs for a row that names one has more to
 * read and more chances to settle on the wrong frame. So: greedy about a leg the
 * sentence genuinely names, strict about one it only brushes past.
 *
 * WHAT COUNTS AS NAMING A LEG. The corpus says a leg six ways, all present in
 * the 111 open rows and all tested:
 *
 *   1. the literal            "pc-wrong", "mobile-right"
 *   2. platform + mode        "On PC the wrong drive", "the mobile wrong drive",
 *                             "the reckless driver ... the careful driver"
 *   3. a platform cross       "on both platforms", "by platform", "the two
 *                             legs", or simply two different platforms compared
 *                             in one sentence ("a modal on mobile, a side panel
 *                             on PC")
 *   4. a mode cross           "In both drives", "the two drives", "either lane"
 *   5. all four, counted      "any of the four legs", "all four debriefs"
 *   6. all four, quantified   "no leg has completed it", "never ticks in any
 *                             leg", "every run scores 0/5", "Each leg writes
 *                             exactly one 08-debrief frame"
 *
 * 3 AND 4 ARE DECIDED BY THE NOUN, NOT BY THE QUANTIFIER, and the two nouns pull
 * opposite ways — `drive`/`run`/`lane` are the MODE words here and `leg` is the
 * PLATFORM word. That is counter-intuitive enough that it was first written
 * backwards; the census that settles it sits on THE TWO-WAY NOUNS below.
 *
 * THE MISSING HALF COMES FROM THE FRAME. "PC ticks 0, mobile ticks 2" names two
 * platforms and no mode; "the wrong leg never passes the truck" names a mode and
 * no platform. The frame supplies whichever axis the sentence leaves out, which
 * is why `frameLeg` is an argument: mirroring the frame's own mode onto the
 * other platform adds exactly ONE drive, where guessing both modes would add two.
 *
 * WHAT MUST NOT PULL A DRIVE, each one a shape found in the corpus rather than
 * imagined:
 *   · a leg belonging to ANOTHER lesson — f0023997 cites "sc-fo-brakelight-chain
 *     pc-wrong" as a look-alike; 114706e0 cites "sc-ln-obstacle-meeting/pc-right",
 *     its own. Same syntax, opposite answers, so the lesson name is compared.
 *   · a malformed leg token — "desktop-right" is not one of the four.
 *   · `pc` inside a word — word boundaries only, never `includes`.
 *   · a lone platform word with no mode ("On mobile the teach card fades"). In
 *     every open row this only restates the platform the frame already proves,
 *     so it buys nothing and would fire on any passing mention.
 *   · `right` as a direction — a mode word counts only when it governs a drive:
 *     "the right drive", never "the right-hand mirror" or "grass to the right".
 *
 * DO NOT NORMALISE, TRIM OR REWRITE `what` ANYWHERE. `findingId` is
 * `scenario + ":" + sha1(what + "\0" + frame)`; one character edited there
 * orphans every verdict line the row has accumulated. This reads a COPY and
 * throws it away.
 */

/** pc/mobile are the two halves of `VALID`, derived so there is one definition. */
const PLATFORMS = [...new Set([...VALID].map((l) => l.split("-")[0]))]; // pc, mobile
const MODES = [...new Set([...VALID].map((l) => l.split("-")[1]))]; //  right, wrong

/** The words the corpus uses for each platform. `desktop`/`phone` are synonyms. */
const PLATFORM_WORD = new Map([
  ["pc", "pc"], ["desktop", "pc"],
  ["mobile", "mobile"], ["phone", "mobile"], ["handset", "mobile"],
]);
const PLATFORM_RE = new RegExp(`\\b(${[...PLATFORM_WORD.keys()].join("|")})\\b`, "gi");

/**
 * A mode word counts only when it GOVERNS A DRIVE. `right` is a direction far
 * more often than it is a leg in this corpus ("the right-hand mirror", "Дръж
 * дясната лента", "grass to the right"), so the adjective alone is never enough
 * — it must be followed by one of the nouns the corpus uses for a leg.
 *
 * `lane` is deliberately NOT one of those nouns. "the right lane" is a road.
 *
 * `driver` IS one, added 2026-09-11 and it cost a CRITICAL row a whole wave.
 * sc-fo-motorway-gap:d18105c7 — the lesson's ONLY open row — reads «the reckless
 * driver gets the route credit the careful driver is denied». Both modes are
 * named, in one clause, in the corpus's plainest English; `legsInProse` returned
 * `[]` because the sentence says WHO drove rather than WHAT was driven, so the
 * reckless half was never photographed. A census of all 1,511 filed rows for
 * <mode adjective> + driver returns FIVE matches and all five are the mode axis
 * ("fails the correct driver and acquits the incorrect one", ×2 on this row,
 * "fails a correct driver") — zero false positives. It was a vocabulary
 * omission, not a design decision: nothing in the 36-test suite went red when it
 * was added, which is itself why this paragraph exists.
 */
const MODE_NOUN = "drivers?|drives?|runs?|legs?|scripts?|ones?";
const MODE_RE = new RegExp(
  `\\b(correct|right|careful|model|proper|reference|scripted|perfect|good` +
    `|wrong|reckless|bad|mistake|incorrect)\\s+(${MODE_NOUN})\\b`,
  "gi",
);
const WRONG_ADJ = new Set(["wrong", "reckless", "bad", "mistake", "incorrect"]);

/**
 * "on both platforms", "by platform", "the platform split" — the platform axis.
 *
 * AND "both legs" / "the two legs", which is NOT the mode axis however much it
 * looks like one. See THE TWO-WAY NOUNS below for the census that settles it.
 */
const PLATFORM_CROSS_RE =
  /\b(?:both|either|each|the two|two)\s+platforms?\b|\bby platform\b|\bplatform split\b|\bacross platforms\b/i;

/**
 * THE TWO-WAY NOUNS — "both X", "either X", "neither X", "the two X" — AND WHICH
 * AXIS EACH ONE RANGES OVER. Measured 2026-09-11 over all 1,511 filed rows, by
 * reading every sentence that uses one. This was got WRONG in the first version:
 * `legs?` and `debriefs?` sat in MODE_CROSS_RE on the assumption that "leg" is a
 * drive and "drive" is a mode. In this corpus it is the other way round for
 * `leg`, and the corpus proves it about itself in five places.
 *
 *   `drives?`, `runs?` -> THE MODE AXIS. sc-ed-poligon-chain:dceba965 names its
 *      own antecedents: "The wrong run ... the careful run ... — the two drives
 *      differ only in penalties". sc-vu-cyclist-hook: "neither drive ever
 *      performs the right turn — the right drive crawls off the road at t184
 *      and the wrong drive does the same at t023".
 *
 *   `lanes?` -> THE MODE AXIS TOO, and this one is easy to get backwards in the
 *      other direction. sc-vp-handbrake puts both axes in one breath: "in any
 *      frame, ON EITHER PLATFORM, IN EITHER LANE". A lane is contrasted WITH a
 *      platform, so it cannot be one. sc-signal-response's open row uses the
 *      same vocabulary — "the mistake lane is less exercised".
 *
 *   `legs?` -> THE PLATFORM AXIS. Four rows disambiguate themselves and all four
 *      say platform; none says mode:
 *        sc-speed-dangerous   "pc-right and mobile-right both return НЕИЗДЪРЖАН
 *                              ... The two legs agree to the point"
 *        sc-hz-emergency-stop "Both re-driven legs peaked at 16 км/ч (pc-right)
 *                              and 19 км/ч (mobile-right) ... BOTH legs read
 *                              ИЗДЪРЖАН"
 *        sc-ac-night-lights   "the STEERED pc-right leg ... and the unsteered
 *                              mobile-right leg ... Both legs finish НЕЗАВЪРШЕН"
 *        sc-follow-tailgater  "sc-follow-tailgater both legs, ... so THE
 *                              REFERENCE RUN — the one a student is told to
 *                              imitate — is not survivable"  (mode fixed = right)
 *      Which is consistent with how the same corpus counts legs elsewhere: "the
 *      ONLY leg of the four", "any of the four legs", "Each leg writes exactly
 *      one 08-debrief frame". `leg` is the FOUR-way word, so a two-way
 *      quantifier over it has to be fixing the mode and ranging over platforms.
 *
 *   `debriefs?` -> GENUINELY MIXED, one row each way, so it takes the union.
 *        sc-vp-telltale  "The same wrong drive is scored 10 on mobile and 20 on
 *                         PC ... both debriefs quote the identical rule" -> the
 *                         mode is fixed, so this is PLATFORM;
 *        sc-vu-cyclist-hook "neither drive ever performs the right turn ...
 *                         Nothing in either debrief cites a cyclist code" -> the
 *                         antecedent is two drives, so this is MODE.
 *      Under-matching leaves a row unprovable forever; over-matching costs a
 *      minute of a sweep. So an ambiguous two-way crosses BOTH axes. That emits
 *      four where the truth is two or three; it lands on ZERO open rows today,
 *      and the day one is filed it will be driven rather than missed.
 */
const MODE_CROSS_RE = /\b(?:both|either|neither|the two)\s+(?:drives?|runs?|lanes?)\b/i;
/** `legs?` is the platform axis — unless negated, see A NEGATIVE UNIVERSAL below. */
const TWO_WAY_LEG_RE = /\b(both|either|neither|the two|two)\s+legs?\b/i;
/** One row each way in 1,511. Cross both axes rather than pick the wrong one. */
const AMBIGUOUS_CROSS_RE = /\b(?:both|either|neither|the two)\s+debriefs?\b/i;

/**
 * A NEGATIVE UNIVERSAL IS AN ALL-FOUR CLAIM.
 *
 * "no leg has completed it", "never ticks in any leg", "no drive has completed
 * the roundabout" — a judge handed ONE leg cannot settle any of them, which is
 * the documented failure this whole file exists for. Four open rows were left
 * unprovable by their absence, two of them CRITICAL and each its lesson's ONLY
 * open row:
 *
 *   49af2940 sc-park-bay-exit-rev  "no leg has completed it successfully"
 *                                  prose=[] -> the set drove pc-wrong alone
 *   5ee56710 sc-rb-busy-gap        "never ticks in any leg — no drive has
 *                                   completed the roundabout"
 *   d9fd3821 sc-sp-wet-limit-plate "no leg of levels 3-5 has ever been driven"
 *   24ccb58b sc-park-45-rev        "never ticks on either leg" — and the SAME
 *                                  lesson's closed row says the same thing the
 *                                  unambiguous way, "Neither of the two route
 *                                  tasks ticks in any leg of this lesson"
 *
 * WHY `lanes?` IS NOT IN THIS LIST, and it is not a judgement call: of the 14
 * corpus sentences matching «no|any|every|each + lane», THIRTEEN are road paint
 * — "no lane markings", "no lane-ends sign", "no lane lines at all", "no lane
 * arrows", "no lane channelisation". One universal over legs is worth less than
 * thirteen spurious four-drive lessons, and "in either lane" is still read as
 * the mode axis by MODE_CROSS_RE above.
 *
 * WHY `debriefs?` IS NOT IN IT EITHER. Two reasons, the second measured rather
 * than asserted because the first draft of this paragraph OVERSTATED it:
 *   · no open row needs it — every corpus universal over a debrief («No debrief
 *     ever charges a seatbelt fault», «never appears in any debrief») is on a
 *     closed row, and the one open row that would match, sc-junction-left's
 *     "dash on every debrief", is already all four from «any of the four runs»
 *     in the same sentence;
 *   · it would blunt HALF of §4(i)'s mutation watch. That test's first fixture
 *     ends "dash on every debrief", so with ALL_FOUR_RE's noun list shrunk to
 *     `legs` — the mutation §4(i) names — assertion 1 goes from [] back to all
 *     four and stops noticing. It is HALF and not the whole: assertion 2 («all
 *     four lanes») still goes red, so the test still fails. Measured both ways
 *     2026-09-11. A rule that covers for another rule's mutation is worth
 *     avoiding even when a second assertion happens to catch the fall.
 */
const UNIVERSAL_LEG_RE =
  /\b(?:no|any|every|each)\s+(?:legs?|drives?|runs?)\b|\b(?:not\s+(?:a\s+single|one)|none\s+of\s+the)\s+(?:legs?|drives?|runs?)\b/i;

/**
 * A negation only makes a two-way phrase universal if it SCOPES it, and in this
 * corpus scope is position: "never ticks on either leg" is all four, while "The
 * two legs agree ... and not a timing accident" is two legs and a trailing
 * clause about determinism. So the negation must stand BEFORE the quantifier.
 * `neither` carries its own negation and is therefore its own antecedent.
 */
const NEGATION_RE = /\b(?:no|not|never|neither|none|nothing|cannot|can't|fails? to|without|zero)\b/i;
function negatedLegPair(sentence) {
  const m = TWO_WAY_LEG_RE.exec(sentence);
  if (!m) return false;
  if (m[1].toLowerCase() === "neither") return true;
  return NEGATION_RE.test(sentence.slice(0, m.index));
}

/**
 * "the ONLY leg of the four", "in ANY of the four legs", "all four debriefs".
 *
 * `four` alone is not enough and neither is "of the four": the same row that
 * says "all four debriefs" opens with "Three of four route tasks", and tasks are
 * not legs. So the count has to sit next to a leg noun, on either side of it.
 */
const ALL_FOUR_RE =
  /\b(?:legs?|drives?|runs?|lanes?|debriefs?)\s+of\s+the\s+four\b|\b(?:all|the)\s+four\s+(?:legs?|drives?|runs?|lanes?|debriefs?)\b/i;

const LEG_LITERAL_RE = new RegExp(`\\b(?:${PLATFORMS.join("|")})-(?:${MODES.join("|")})\\b`, "gi");
/** `sc-<lesson><sep><leg>` — a leg attributed to a named lesson. */
const QUALIFIED_LEG_RE = new RegExp(
  `\\b(sc-[a-z0-9-]+?)(?:__|[\\s/]+)((?:${PLATFORMS.join("|")})-(?:${MODES.join("|")}))\\b`,
  "gi",
);
/** `<word>-right` / `<word>-wrong` that is not one of the four. Not a leg. */
const PSEUDO_LEG_RE = new RegExp(`\\b[a-zа-я]+-(?:${MODES.join("|")})\\b`, "gi");

/**
 * Sentence boundary = terminator + space + an opening capital. Naive `.` splitting
 * tears this corpus apart: "PC numbers all six steps 1.–6.; mobile drops the «1.»"
 * is ONE sentence, and severing it is how the platform half and the mode half stop
 * seeing each other — the exact bug being fixed.
 */
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[«„"A-ZА-Я])/;

export function legsInProse(what, { frameLeg = null, lesson = null } = {}) {
  let s = String(what ?? "");
  if (!s) return [];
  const out = new Set();

  // (1) A qualified leg belongs to the lesson that qualifies it. Same syntax,
  //     opposite answers: keep it when the lesson matches, drop it when it does
  //     not — and blank it either way so step (2) cannot re-harvest it.
  s = s.replace(QUALIFIED_LEG_RE, (_m, who, leg) => {
    if (!lesson || who.toLowerCase() === String(lesson).toLowerCase()) out.add(leg.toLowerCase());
    return " ";
  });
  // (2) Bare literals. Blanked so `pc-wrong` cannot also be read as a loose
  //     mention of the pc platform in step (4)'s cross-platform test.
  s = s.replace(LEG_LITERAL_RE, (m) => {
    out.add(m.toLowerCase());
    return " ";
  });
  // (3) `desktop-right` and friends: shaped like a leg, not one of the four.
  s = s.replace(PSEUDO_LEG_RE, " ");

  // (4) What is left is English.
  for (const sentence of s.split(SENTENCE_SPLIT)) {
    // "all four debriefs" counts them; "no leg has completed it" and "never
    // ticks on either leg" quantify over them without counting. Same claim.
    if (ALL_FOUR_RE.test(sentence) || UNIVERSAL_LEG_RE.test(sentence) || negatedLegPair(sentence)) {
      for (const leg of VALID) out.add(leg);
      continue;
    }

    const named = new Set();
    for (const m of sentence.matchAll(PLATFORM_RE)) named.add(PLATFORM_WORD.get(m[1].toLowerCase()));

    const modes = new Set();
    let modePlural = false;
    for (const m of sentence.matchAll(MODE_RE)) {
      modes.add(WRONG_ADJ.has(m[1].toLowerCase()) ? "wrong" : "right");
      if (/s$/i.test(m[2])) modePlural = true;
    }

    // Two different platforms compared in one sentence IS the cross-platform
    // claim, marker word or not. So is a plural mode with no platform attached
    // ("Both correct legs come back ...", "The right legs also collide"), and so
    // is an un-negated two-way over legs ("The two legs agree to the point").
    const ambiguousAxis = AMBIGUOUS_CROSS_RE.test(sentence);
    const crossPlatform =
      PLATFORM_CROSS_RE.test(sentence) || TWO_WAY_LEG_RE.test(sentence) || ambiguousAxis
      || named.size >= 2 || (modePlural && named.size === 0);
    const crossMode = MODE_CROSS_RE.test(sentence) || ambiguousAxis;

    const platforms = crossPlatform
      ? PLATFORMS
      : named.size === 1
        ? [...named]
        : frameLeg
          ? [frameLeg.split("-")[0]]
          : [];

    const wanted = modes.size
      ? [...modes]
      : crossMode
        ? MODES
        : crossPlatform && frameLeg
          ? [frameLeg.split("-")[1]]
          : [];

    // A sentence that names no mode and only one platform names no leg — it
    // restates the platform the frame already proves. Adding nothing is correct.
    if (!platforms.length || !wanted.length) continue;
    for (const p of platforms) for (const mode of wanted) out.add(p + "-" + mode);
  }

  return [...out].filter((leg) => VALID.has(leg)).sort();
}

/**
 * lesson -> { total, critical, legs } over the rows given.
 *
 * A lesson whose findings name NO leg gets an empty list, and `wave-c.mjs`
 * reads that as "drive all four" — which is correct and deliberate: the finding
 * could be on any of them, and guessing one is how coverage counts go wrong.
 *
 * TWO SETS, AND THE UNION CAN ONLY GROW. `frameLegs` is what a screenshot
 * proves; `proseLegs` is what the finding's sentence names. The emitted list is
 * their union — a SUPERSET of what this function returned before, for every
 * lesson, or empty for both.
 *
 * THE EMPTY GUARD IS LOAD-BEARING, and it is the one way this could REDUCE
 * coverage. If no frame names a leg the list must stay `[]`, because `[]` means
 * "drive all four" downstream and all four already contains any prose leg —
 * letting prose populate an otherwise-empty list would turn 4 drives into 1.
 * Measured 2026-08-30: 0 of 114 open lessons are all-frameless, so the guard is
 * LATENT, which is exactly when someone tidying deletes it. `build-redrive.test.mjs`
 * §3(b) goes red if they do.
 *
 * THE SECOND WAY IT COULD REDUCE, added 2026-09-11: `legsInProse` now DROPS a leg
 * that prose attributes to another lesson, where the old substring matcher kept
 * it. A prose leg going away can never cost a frame leg, because the union keeps
 * every frame leg unconditionally — §4(p). Measured over all 111 open rows when
 * the English reading landed: 24 lessons gained legs, 90 drives became 134, and
 * NO lesson lost one.
 */
/**
 * LESSONS THE SWEEP CANNOT DRIVE, AND WHY THEY ARE NAMED HERE RATHER THAN SKIPPED.
 *
 * A `-right` / `-wrong` leg is a drive of `/simulator/<lesson>`. `app-login`
 * is not a lesson: its finding is about the /login form's layout at 852x393,
 * the viewport the harness itself drives. Every round it was dispatched four
 * drives and returned exit=7 four times — «no verdict surface» — because there
 * is no verdict card to read. w30 spent ~20 minutes of a two-hour sweep on it.
 *
 * The row STAYS OPEN and stays in every count. This list only says which
 * lessons the CAMERA cannot reach, so the sweep stops pointing it at them. A
 * row here needs a different instrument — for app-login, a viewport
 * measurement — and until someone builds one it is honest for it to sit open
 * rather than to accumulate exit=7 drives that certify nothing.
 *
 * Adding a name here is a claim that no drive can EVER photograph it. That is a
 * strong claim, so it carries a reason, and `--include-undrivable` overrides
 * the whole list for anyone who wants to re-test one.
 */
export const NO_SIMULATOR_ROUTE = new Map([
  ["app-login", "the /login form, not a lesson — there is no /simulator/app-login to drive"],
]);
export function redriveSet(open, { only = null, includeUndrivable = false } = {}) {
  const per = new Map();
  for (const f of open) {
    const lesson = f.scenario || f.lesson;
    if (!lesson) continue;
    if (only && !only.has(lesson)) continue;
    if (!includeUndrivable && NO_SIMULATOR_ROUTE.has(lesson)) continue;
    const cur = per.get(lesson) || {
      lesson, total: 0, critical: 0, frameLegs: new Set(), proseLegs: new Set(),
    };
    cur.total += 1;
    if (String(f.severity).toLowerCase() === "critical") cur.critical += 1;
    const leg = legOfFrame(f.frame);
    if (leg) cur.frameLegs.add(leg);
    // The frame is passed in because half of a cross-leg sentence is usually
    // missing from the prose: "PC ticks 0, mobile ticks 2" names no mode, and
    // the frame is the only thing that knows which one was driven.
    for (const L of legsInProse(f.what, { frameLeg: leg, lesson })) cur.proseLegs.add(L);
    per.set(lesson, cur);
  }
  // Heaviest-in-critical first: the sweep dispatcher interleaves shards, so the
  // expensive lessons spread across drivers instead of piling on shard 0.
  return [...per.values()]
    .sort((a, b) => b.critical - a.critical || b.total - a.total || a.lesson.localeCompare(b.lesson))
    .map((x) => ({
      lesson: x.lesson,
      total: x.total,
      critical: x.critical,
      // Union only when a frame named a leg — see THE EMPTY GUARD above.
      legs: x.frameLegs.size ? [...new Set([...x.frameLegs, ...x.proseLegs])].sort() : [],
    }));
}

// ---------------------------------------------------------------------- main
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].split(BS).join("/")}`).href;
if (isMain || process.argv[1]?.endsWith("build-redrive.mjs")) {
  const counts = corpusCounts();
  console.log(openListLine(counts));

  let only = null;
  if (LESSONS_FILE) {
    if (!fs.existsSync(LESSONS_FILE)) {
      console.error("no such lessons file: " + LESSONS_FILE);
      process.exit(2);
    }
    only = new Set(
      fs.readFileSync(LESSONS_FILE, "utf8").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
    );
  }

  const used = only ? counts.open.filter((f) => only.has(f.scenario || f.lesson)) : counts.open;
  console.log(workedLine("open", used));

  const includeUndrivable = process.argv.includes("--include-undrivable");
  const set = redriveSet(counts.open, { only, includeUndrivable });
  const drives = set.reduce((n, r) => n + (r.legs.length || 4), 0);

  console.log("lessons in the drive set : " + set.length + (only ? "  (restricted to " + only.size + " named)" : ""));
  console.log("drives it will dispatch  : " + drives);
  if (!includeUndrivable) {
    const skipped = counts.open
      .map((f) => f.scenario || f.lesson)
      .filter((l) => NO_SIMULATOR_ROUTE.has(l));
    const uniq = [...new Set(skipped)];
    if (uniq.length) {
      console.log(
        "NOT DRIVEN — no /simulator route (" + skipped.length + " open row(s) stay open):",
      );
      for (const l of uniq) console.log("   " + l + " — " + NO_SIMULATOR_ROUTE.get(l));
      console.log("   (pass --include-undrivable to dispatch them anyway)");
    }
  }
  const noLeg = set.filter((r) => r.legs.length === 0).length;
  if (noLeg) console.log("lessons whose findings name no leg (all four will be driven): " + noLeg);

  if (only) {
    const missing = [...only].filter((l) => !set.some((r) => r.lesson === l));
    if (missing.length) {
      console.log("");
      console.log(missing.length + " named lesson(s) carry NO open finding and will not be driven:");
      for (const m of missing.slice(0, 20)) console.log("   " + m);
      console.log("   (that is not an error — a lesson with nothing open has nothing to prove)");
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(set, null, 1) + "\n");
  console.log("");
  console.log("wrote " + OUT);
}
