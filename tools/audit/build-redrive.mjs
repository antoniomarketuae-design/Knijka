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
 *
 * A NAMED LESSON THAT RESOLVES TO ZERO LEGS IS A REFUSAL (exit 4), not a note.
 * See THE SILENT ZERO below.
 *
 * A `--lessons` FILE THAT NAMES NOTHING IS A REFUSAL TOO (exit 2) — and it is a
 * separate one, because an empty Set is TRUTHY and walks straight past the
 * refusal above. See THE LESSONS FILE THAT NAMES NOTHING.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { corpusCounts, findingId, openListLine, workedLine } from "./finding-reader.mjs";

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
/**
 * THE pc-path LEG — ROUTED FROM A FILE, NEVER FROM PROSE (DESIGN-v2 §9).
 *
 * A path leg is a GRADING instrument that exists for fourteen named parking /
 * reverse rows (`tools/audit/path-routing.json`). It is never derived from a
 * finding's sentence, never counted toward "all four", never satisfies `VALID`,
 * and a row is routed only once its lesson's canary has passed
 * (`canaryPassed === true`) — which is also the founder-ratification gate.
 */
export const PATH_LEGS = new Set(["pc-path"]);
export const PATH_ROUTING_FILE = path.join(HERE, "path-routing.json");

/** Lessons with at least one routed (canary-passed) path row. Unreadable file → none. */
export function routedPathLessons(routing) {
  const rows = Array.isArray(routing?.rows) ? routing.rows : Array.isArray(routing) ? routing : [];
  return new Set(rows.filter((r) => r && r.canaryPassed === true && PATH_LEGS.has(r.leg) && r.lesson).map((r) => r.lesson));
}

/**
 * APPENDING NEVER SHRINKS A LESSON'S RE-DRIVE (S-8). `[]` means "drive all four"
 * downstream, so appending `pc-path` to an empty list would turn four drives
 * into one: the list is expanded to the four VALID legs FIRST, and only when a
 * path leg is actually appended. A lesson with no routed path row keeps `[]`.
 */
export function withPathLeg(legs) {
  const base = legs.length ? legs : [...VALID].sort();
  return [...new Set([...base, "pc-path"])].sort();
}


/**
 * WITNESS LESSONS — DRIVEN NOT BECAUSE THEY CARRY A ROW, BUT BECAUSE A ROW IS
 * ABOUT THEM.
 *
 * The set is derived from `corpusCounts().open`, so a lesson with ZERO open rows
 * can never enter it. That is right for almost every lesson and wrong for every
 * CROSS-LESSON COMPARISON, because such a row names subjects that are not itself.
 *
 * THE ROW THAT FOUND THIS, measured 2026-09-19:
 *
 *   sc-ac-ice:86eab7e9 (major) — «sc-ac-aquaplane, sc-ac-ice and sc-ac-bridge-ice
 *   still render the same stretch of street — the same mid-rise block facades,
 *   the same tree line and the same unbroken kerbside parked-car row.»
 *
 * A three-way comparison. The other two subjects have NOTHING open:
 *   sc-ac-aquaplane   filed=13  open=0
 *   sc-ac-bridge-ice  filed= 4  open=0
 *   sc-ac-ice         filed=10  open=1   <- the only one the set can contain
 * and neither appeared in the 58-row `.audit-frames/waveC-redrive.json`. So the
 * row cannot be settled by any sweep: a judge is handed one of the three streets
 * and asked whether three streets are the same.
 *
 * WHICH LEGS A WITNESS IS DRIVEN ON — the legs of the finding that NEEDS it, not
 * all four. A comparison has to be like-for-like: 86eab7e9's frame is
 * `sweep161/sc-ac-ice/pc-right/03-ready.png`, so photographing the witnesses on
 * mobile-wrong would compare a different leg's street to the subject's. That is
 * also three drives cheaper per witness. When the needing finding names no leg at
 * all the witness falls back to all four, for the same reason the main set does:
 * see THE EMPTY GUARD.
 *
 * EVERY ENTRY CARRIES THE FINDING IDS THAT NEED IT, and that is not decoration:
 * a witness whose needing rows have all been retired DROPS OUT OF THE SET BY
 * ITSELF, so the line below is dead code you can delete on sight rather than a
 * skip-list entry that has to be argued about. `--lessons` naming a lesson in
 * that state refuses and says so — see THE SILENT ZERO.
 *
 * A LESSON THAT LATER CARRIES ITS OWN OPEN ROW is already in the set on its own
 * merits and its witness line is ignored; delete it then too. That is deliberate
 * — a lesson's own rows decide its legs — and it is the one case where a witness
 * can be IN the set on the wrong legs, so `witnessGaps` says so out loud.
 *
 * WHICH RUNS GET THE WITNESSES is the other half of this map being usable at all,
 * and it is a rule rather than a flag: see `neededHere`.
 */
export const WITNESS_LESSONS = new Map([
  ["sc-ac-aquaplane", {
    needs: ["sc-ac-ice:86eab7e9"],
    why: "subject 1 of 3 in sc-ac-ice:86eab7e9's «render the same stretch of street» claim; 13 filed, 0 open, so the set cannot reach it",
  }],
  ["sc-ac-bridge-ice", {
    needs: ["sc-ac-ice:86eab7e9"],
    why: "subject 3 of 3 in sc-ac-ice:86eab7e9's «render the same stretch of street» claim; 4 filed, 0 open, so the set cannot reach it",
  }],
]);

/**
 * The legs ONE finding names — its frame's leg, widened by its own prose.
 *
 * Returns `[]` when the frame names no leg, and the caller must read that as
 * "all four" rather than as "none": narrowing on prose alone is the one way this
 * file can REDUCE coverage, which is THE EMPTY GUARD above, and a witness
 * inherits it from the row it serves.
 */
function legsOfFinding(f) {
  const frameLeg = legOfFrame(f.frame);
  if (!frameLeg) return [];
  const lesson = f.scenario || f.lesson;
  return [...new Set([frameLeg, ...legsInProse(f.what, { frameLeg, lesson })])].sort();
}

/**
 * THE ROWS A WITNESS ENTRY SERVES THAT **THIS RUN** IS ACTUALLY DRIVING.
 *
 * WHY A NAMED LESSON BRINGS ITS WITNESSES WITH IT, AUTOMATICALLY.
 *
 * The gate used to be `only.has(<the WITNESS's own name>)`, which made a witness
 * reachable only by an operator who already knew the witness names — which is
 * exactly the knowledge `WITNESS_LESSONS` exists to supply. MEASURED 2026-09-20
 * on the pre-fix file, with a lessons file holding the single line `sc-ac-ice`,
 * the natural targeted redrive of sc-ac-ice:86eab7e9:
 *
 *   node tools/audit/build-redrive.mjs --lessons ice.txt --out <tmp>
 *     lessons in the drive set : 1  (restricted to 1 named)
 *     drives it will dispatch  : 1
 *     [{"lesson":"sc-ac-ice","total":1,"critical":0,"legs":["pc-right"]}]
 *     EXIT 0 — no `witnessFor`, no warning, no mention of the other two.
 *
 * One of the three streets that row's «render the same stretch of street» claim
 * compares, photographed, and reported as success. So a run that names the
 * SUBJECT gets the witnesses too.
 *
 * NOT BEHIND A FLAG, and that was weighed rather than skipped. A flag only ever
 * buys a run that deliberately under-photographs a claim — the failure this file
 * exists to refuse — and it would put the knowledge back where the operator has
 * to already have it. The cost of always is bounded and PRINTED: a witness
 * carries 0 open rows (so no ledger moves), sorts to the tail, and gets its own
 * line naming the row it serves and the legs. Measured on the live corpus the
 * same day: 2 witnesses, 1 drive each, 124 drives against 122 without them.
 *
 * `only.has(lesson)` stays as its own branch because the pair has two ends:
 * `--lessons sc-ac-aquaplane` names the WITNESS and not the subject, and the
 * needing row lives in a different lesson, so filtering `open` first would make
 * a witness unreachable by exactly the command that asks for it — §8(g).
 *
 * ONE DEFINITION, TWO READERS: `redriveSet` decides inclusion with it and
 * `witnessGaps` decides with it whether a witness this run needs went missing.
 * Two copies of this rule would drift, and the drifted half would be the
 * warning — the half nobody is watching.
 */
function neededHere(open, lesson, w, only) {
  const needed = open.filter((f) => (w.needs || []).includes(findingId(f)));
  if (!only || only.has(lesson)) return needed;
  return needed.filter((f) => only.has(f.scenario || f.lesson));
}

/**
 * The legs a witness must be photographed on: the union of the legs of the
 * findings that need it, and `[]` — which means all four downstream — as soon as
 * ONE of them names no leg. That is THE EMPTY GUARD inherited: narrowing a
 * witness onto a leg the subject only maybe used is the same reduction §3(b)
 * forbids for a lesson's own rows.
 */
function witnessLegs(needed) {
  const legs = new Set();
  for (const f of needed) {
    const L = legsOfFinding(f);
    if (!L.length) return [];
    for (const x of L) legs.add(x);
  }
  return [...legs].sort();
}

export function redriveSet(open, { only = null, includeUndrivable = false, witnesses = WITNESS_LESSONS, pathRouting = null } = {}) {
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

  // The witnesses. `neededHere` scans ALL of `open`, deliberately NOT the rows
  // `only` let through: the finding that needs a witness lives in a DIFFERENT
  // lesson, so either end of the pair may be the one a run names.
  for (const [lesson, w] of witnesses) {
    const needed = neededHere(open, lesson, w, only);
    // Either every needing row has retired — the entry is dead code, delete it —
    // or this run drives none of them, so it needs no witness.
    if (!needed.length) continue;
    // The two ways a witness this run NEEDS is dropped anyway. Both are silent
    // here by construction — `redriveSet` returns a drive set, not a report —
    // so `witnessGaps` reads the same rule back and names what is missing.
    if (per.has(lesson)) continue; // it carries open rows of its own — delete the entry
    if (!includeUndrivable && NO_SIMULATOR_ROUTE.has(lesson)) continue;
    per.set(lesson, {
      lesson,
      // ZERO, and it must stay zero: these counts are the open list, and a
      // witness carries none. Counting it would inflate the ledger to buy a
      // drive. It also sorts the witnesses to the tail, which is where the
      // cheapest-to-drop work belongs.
      total: 0,
      critical: 0,
      // Reuses the emit step's empty guard: an unconstrained witness gets no
      // frame legs, so it emits `[]`, so it is driven on all four.
      frameLegs: new Set(witnessLegs(needed)),
      proseLegs: new Set(),
      witnessFor: needed.map((f) => findingId(f)).sort(),
    });
  }

  // Heaviest-in-critical first: the sweep dispatcher interleaves shards, so the
  // expensive lessons spread across drivers instead of piling on shard 0.
  const pathLessons = routedPathLessons(pathRouting);
  return [...per.values()]
    .sort((a, b) => b.critical - a.critical || b.total - a.total || a.lesson.localeCompare(b.lesson))
    .map((x) => {
      // Union only when a frame named a leg — see THE EMPTY GUARD above.
      const legs = x.frameLegs.size ? [...new Set([...x.frameLegs, ...x.proseLegs])].sort() : [];
      return {
        lesson: x.lesson,
        total: x.total,
        critical: x.critical,
        legs: pathLessons.has(x.lesson) ? withPathLeg(legs) : legs,
        // Only witnesses carry it, so a reader of the work-list can tell a lesson
        // driven for its own rows from one driven for somebody else's.
        ...(x.witnessFor ? { witnessFor: x.witnessFor } : {}),
      };
    });
}

/**
 * THE WITNESSES THIS RUN NEEDS AND WILL NOT PHOTOGRAPH.
 *
 * `neededHere` decides that a run needs a witness; `redriveSet` then drops it
 * anyway in exactly two places, and both were silent:
 *
 *   · NO_SIMULATOR_ROUTE without --include-undrivable. A witness is a reason to
 *     point the camera at a lesson, not a claim that a camera can reach it — and
 *     §8(i) keeps that precedence. The run must still say the claim is short a
 *     subject, because the row stays open either way and the next judge is owed
 *     the reason.
 *   · the witness CARRIES OPEN ROWS OF ITS OWN. Then its own rows decide its
 *     legs (§8(h), deliberate) and those legs need not include the ones the
 *     claim compares — a like-for-like comparison photographed on unlike legs.
 *     Nothing is changed here: the legs stay its own, and the gap is reported.
 *
 * REPORTS, NEVER REFUSES. An under-photographed witness is not a reason to throw
 * away the rest of the set — the 57 lessons in it for their own rows today
 * (measured 2026-09-20: 59 in the set, 2 of them witnesses) are still worth
 * driving — it is a reason for the run to name the claim it will not settle. The
 * refusals in main are for a request that cannot be served AT ALL.
 *
 * COMPOSED FROM `redriveSet`, not re-derived from `open`, so the warning can
 * never describe a set other than the one about to be written.
 */
export function witnessGaps(open, { only = null, includeUndrivable = false, witnesses = WITNESS_LESSONS } = {}) {
  const set = redriveSet(open, { only, includeUndrivable, witnesses });
  const byLesson = new Map(set.map((r) => [r.lesson, r]));
  const ALL = [...VALID].sort();
  const gaps = [];
  for (const [lesson, w] of witnesses) {
    const needed = neededHere(open, lesson, w, only);
    if (!needed.length) continue;
    const witnessFor = needed.map((f) => findingId(f)).sort();
    // `[]` from witnessLegs is the all-four fallback, so spell it out here: this
    // is a list of legs that will NOT be photographed, and "none of four" has to
    // read as four names rather than as an empty list.
    const want = witnessLegs(needed);
    const wanted = want.length ? want : ALL;
    const row = byLesson.get(lesson);
    if (!row) {
      gaps.push({
        lesson,
        witnessFor,
        missing: wanted,
        why:
          !includeUndrivable && NO_SIMULATOR_ROUTE.has(lesson)
            ? NO_SIMULATOR_ROUTE.get(lesson) + " — pass --include-undrivable to dispatch it anyway"
            : "it is not in the drive set",
      });
      continue;
    }
    // In the set AS a witness: `redriveSet` built its legs from the same
    // `needed`, so they are exactly `wanted` — or `[]`, which is all four.
    if (row.witnessFor) continue;
    // In the set on its own rows. `[]` there means all four downstream, which
    // covers anything `wanted` can ask for.
    if (!row.legs.length) continue;
    const missing = wanted.filter((l) => !row.legs.includes(l));
    if (missing.length) {
      gaps.push({
        lesson,
        witnessFor,
        missing,
        why:
          "it is in the set for its OWN open rows, driven on " + row.legs.join(",") +
          " — a lesson's own rows decide its legs, and those are not the legs this claim compares",
      });
    }
  }
  return gaps;
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

    /**
     * THE LESSONS FILE THAT NAMES NOTHING — a second silent zero, and one THE
     * SILENT ZERO below CANNOT catch, because it is the empty case of the very
     * list that refusal iterates.
     *
     * `only` becomes `new Set()`. AN EMPTY SET IS TRUTHY, so every `if (only &&
     * ...)` gate stays armed and filters every lesson out, and then the refusal
     * at the bottom asks `[...only].filter(...)` — of an empty list — and finds
     * nothing missing. MEASURED 2026-09-20 on the pre-fix file, both variants:
     *
     *   --lessons <0-byte file> --out <tmp>
     *   --lessons <file of only spaces, tabs and newlines> --out <tmp>
     *     -> "lessons in the drive set : 0  (restricted to 0 named)"
     *        "drives it will dispatch  : 0"
     *        a 3-byte `[]` written to --out, EXIT 0
     *
     * ON THE DEFAULT `--out` THAT IS THE LIVE WORK-LIST. Measured the same day:
     * `.audit-frames/waveC-redrive.json` held 58 rows and 119 drives, and this
     * command replaces it with `[]`.
     *
     * THE BLAST RADIUS STOPS ONE RUNG LATER, NOT TWO. `.audit-frames/wave-scripts/
     * sweep-preflight.sh:273` refuses an empty work-list — «waveC-redrive.json is
     * empty or unreadable — there is nothing to sweep» — so an empty file
     * DESTROYS the list a sweep is planned from rather than certifying a hollow
     * sweep. That script is gitignored and untracked, so it is not a guard this
     * file may lean on. The zero is made here and it is refused here.
     *
     * EXIT 2, SHARED WITH "no such lessons file". Both are one class — a
     * `--lessons` argument that resolves to no names at all — and both print the
     * path, so an operator tells them apart by reading.
     *   NOT "before the corpus is read", which an earlier draft of this comment
     *   claimed. MEASURED 2026-09-20: `corpusCounts()` is called at :754, the
     *   `if (LESSONS_FILE)` block opens at :758 and this refusal is at :806, so
     *   every empty-file run prints the `OPEN-LIST filed=…` stamp on stdout
     *   BEFORE the REFUSING block appears. Nothing fails open — exit 2 stands
     *   and no file is written — but the order was wrong as stated, and the
     *   stamp appearing first is what an operator will actually see.
     *   AND THE REFUSAL IS ON THE FILE'S CONTENTS, NOT THE FLAG'S ARGUMENT.
     *   `flag()` (:48-51) returns its default when the next argv is missing or
     *   empty, so a trailing `--lessons`, or `--lessons ""`, never reaches here:
     *   it reads as "no restriction" and builds the whole set at exit 0. Same at
     *   HEAD, so it is not a regression — but do not read this block as covering
     *   it. A bare trailing `--out` resolves to the live work-list the same way. Exit 4 stays reserved for the other question: a name the
     * corpus cannot serve. Nothing branches on either code today
     * (count-agreement.mjs runs this tool with `--out <tmp>` and no `--lessons`),
     * and the first consumer that needs to is the reason to split the code.
     *
     * NOT READ AS "no restriction". Treating an empty request as a request for
     * everything is the louder version of the same mistake: it would overwrite
     * the work-list with all 59 lessons and 124 drives nobody asked for.
     */
    if (!only.size) {
      console.error("");
      console.error("[build-redrive] REFUSING: the --lessons file names no lesson at all.");
      console.error("   " + LESSONS_FILE + " — empty, or nothing but whitespace and commas.");
      console.error("");
      console.error("  An empty name list is a request for NOTHING, and this tool used to serve it:");
      console.error("  every lesson filtered out, an empty [] written to --out, exit 0. On the default");
      console.error("  --out that REPLACES the work-list a sweep is planned from. Nothing was written to");
      console.error("  " + OUT + " — the previous work-list is intact.");
      console.error("");
      console.error("  Drop --lessons entirely to build the set from every open lesson.");
      process.exit(2);
    }
  }

  const used = only ? counts.open.filter((f) => only.has(f.scenario || f.lesson)) : counts.open;
  console.log(workedLine("open", used));

  const includeUndrivable = process.argv.includes("--include-undrivable");
  let pathRouting = null;
  try {
    pathRouting = JSON.parse(fs.readFileSync(PATH_ROUTING_FILE, "utf8"));
  } catch {
    pathRouting = null;
  }
  const set = redriveSet(counts.open, { only, includeUndrivable, pathRouting });
  {
    const routed = routedPathLessons(pathRouting);
    console.log("pc-path lessons routed (canaryPassed === true): " + routed.size + (routed.size ? " — " + [...routed].join(", ") : " — none; path legs are dispatched only with wave-c.mjs --with-path-legs"));
  }
  const drives = set.reduce((n, r) => n + (r.legs.length || 4), 0);

  // `set.length` can now EXCEED `only.size`, because a named lesson brings the
  // witnesses its rows need. "(restricted to 1 named)" printed beside a 3 reads
  // as a contradiction, so the two are counted apart. Measured 2026-09-20:
  // `--lessons <file holding only sc-ac-ice>` is 1 named + 2 witness = 3.
  const wit = set.filter((r) => r.witnessFor);
  console.log(
    "lessons in the drive set : " + set.length +
      (only
        ? "  (restricted to " + only.size + " named" +
          (wit.length ? " + " + wit.length + " witness" : "") + ")"
        : ""),
  );
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

  // A witness carries 0 open rows, so without this line it reads as a lesson the
  // set picked up by accident — which is how a skip-list entry gets deleted by
  // someone tidying. It names the row that needs it, so it can be checked.
  if (wit.length) {
    console.log("witness lesson(s) driven for another row's claim (0 open rows of their own):");
    for (const r of wit) {
      console.log("   " + r.lesson + " — for " + r.witnessFor.join(", ") + " on " + (r.legs.length ? r.legs.join(",") : "all four"));
    }
  }

  /**
   * AND THE WITNESSES THIS RUN NEEDS BUT WILL NOT DRIVE — the other half of the
   * block above, and the one that must never be absent from a run that has one.
   *
   * ON stderr, NOT stdout, unlike the "NOT DRIVEN" block. That block is about
   * rows nobody expected this run to photograph; this one says the evidence this
   * run produces CANNOT settle a claim it was asked to settle, which is the same
   * family as the REFUSING blocks. `node build-redrive.mjs ... > plan.log` would
   * put a stdout line in a file nobody reads until afterwards, and afterwards is
   * where every silent zero in this file's history has been discovered.
   * count-agreement.mjs scans stdout AND stderr for the OPEN-LIST stamp, so
   * neither stream costs it anything.
   */
  const gaps = witnessGaps(counts.open, { only, includeUndrivable });
  if (gaps.length) {
    console.error("");
    console.error(
      "[build-redrive] UNDER-PHOTOGRAPHED: " + gaps.length +
        " witness lesson(s) a row's claim is ABOUT will not be driven on the legs it compares.",
    );
    for (const g of gaps) {
      console.error("   " + g.lesson + " — needed by " + g.witnessFor.join(", ") +
        " on " + g.missing.join(",") + "; " + g.why);
    }
    console.error("  A judge handed only the subject is being asked whether two things are alike.");
  }

  /**
   * THE SILENT ZERO — the defect this refusal exists for, measured 2026-09-19.
   *
   * `wave-c.mjs` SELECTS from this file and never adds to it:
   *     if (ONLY.length) rows = rows.filter((r) => ONLY.includes(r.lesson));
   * so a lesson the set does not contain is not an error there either — it is
   * zero rows, zero planned drives, "0 lesson(s) · 0 drive(s) to run", exit 0.
   * Replayed that filter against the live 58-row set with
   * ONLY=[sc-ac-aquaplane, sc-ac-bridge-ice]: 58 rows in, 0 out, 0 planned.
   * A batch would run, report success and photograph nothing.
   *
   * And THIS is where the silence starts. The same two names produced
   * «lessons in the drive set : 0», an empty `[]` written to --out, exit 0, and
   * the line this block replaces: "(that is not an error — a lesson with nothing
   * open has nothing to prove)". It is an error. Somebody typed a name and asked
   * for it to be driven; answering with a file that cannot drive it, and a 0,
   * puts the discovery two hours downstream in a judge's empty evidence list.
   *
   * WHY IT REFUSES ONLY WHEN LESSONS WERE NAMED. An argument-free run that comes
   * back empty is already legible — the open-list line says open=0 and there is
   * nothing to drive. It is also how `count-agreement.mjs` probes this tool
   * (RECIPES["build-redrive.mjs"], `--out <tmp>` and no `--lessons`), so a
   * refusal there would couple that check's exit code to the corpus being
   * non-empty. A NAMED lesson is a request, and a request that cannot be served
   * is refused.
   *
   * Exit 4: 2 is already "no such lessons file" here, and wave-c.mjs spends 2
   * and 3 on --base and a dirty tree.
   */
  if (only) {
    const missing = [...only].filter((l) => !set.some((r) => r.lesson === l));
    if (missing.length) {
      const witnessHint = (l) =>
        WITNESS_LESSONS.has(l)
          ? "it IS a witness (" + WITNESS_LESSONS.get(l).needs.join(", ") +
            "), but every finding that needed it has been retired — delete the WITNESS_LESSONS entry"
          : "it carries no open finding. If another row's claim is ABOUT this lesson, add it to " +
            "WITNESS_LESSONS with that finding's id; otherwise drop it from the lessons file";
      const why = (l) =>
        !includeUndrivable && NO_SIMULATOR_ROUTE.has(l)
          ? "excluded: " + NO_SIMULATOR_ROUTE.get(l) + " — pass --include-undrivable to dispatch it anyway"
          : witnessHint(l);
      console.error("");
      console.error(
        "[build-redrive] REFUSING: " + missing.length + " of " + only.size +
          " named lesson(s) resolve to ZERO legs, and nothing downstream would say so.",
      );
      for (const m of missing) console.error("   " + m + " — " + why(m));
      console.error("");
      console.error("  wave-c.mjs FILTERS this set, it never adds to it, so dispatching these names");
      console.error("  would print \"0 lesson(s) · 0 drive(s) to run\" and exit 0. Nothing was written to");
      console.error("  " + OUT + " — the previous work-list is intact.");
      process.exit(4);
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(set, null, 1) + "\n");
  console.log("");
  console.log("wrote " + OUT);
}
