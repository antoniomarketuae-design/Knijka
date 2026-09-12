#!/usr/bin/env node
/**
 * inprocess-drive.mjs — DRIVE THE GRADING CHAIN WITHOUT PAINTING A PIXEL.
 *
 *   node tools/audit/inprocess-drive.mjs --lesson sc-rb-ped-exit --rung 3
 *   node tools/audit/inprocess-drive.mjs --lesson sc-rb-ped-exit --rung 3 --tape mistake-panic-brake
 *   node tools/audit/inprocess-drive.mjs --lesson sc-hz-emergency-stop --rung 3 --finding 9d07cc7c
 *   node tools/audit/inprocess-drive.mjs --tapes sc-park-wall      (what tapes exist)
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Of the 108 open audit rows, 52 are UNJUDGED — no drive competent to settle
 * them — and of the 43 CRITICAL rows it is 30 UNJUDGED against 13 STILL. A
 * repair wave cannot move an unjudged row, so those 30 are the endgame.
 *
 * The standing assumption was that they need a harness that can drive a
 * junction. Read all 30 and that is refuted: exactly 2 are claims about the
 * guidance ribbon, the FOV or the turn. 19 are explicitly about grading and
 * credit, and the remaining 9 read the same way — «the wrong leg finishes 0
 * опасни / 0 основни / 0 второстепенни, Общо 0», «the right legs score the
 * same as or worse than the wrong drives», «this lesson has never once been
 * observed WORKING».
 *
 * THEY ARE PROPOSITIONS ABOUT WHAT THE PRODUCT DOES ONCE THE CAR REACHES A
 * STATE, NOT ABOUT HOW IT GOT THERE. You do not need to drive the junction.
 * You need to reach the state — and an authored tape reaches it.
 *
 * Several repair lanes have already done exactly this ad hoc, thrown the
 * snippet away afterwards, and written none of it down. One settled
 * sc-rb-ped-exit at every authored rung in seconds. MEASURED on this tree:
 * 0.31 s for a complete 3,423-tick lesson drive in-process, against minutes
 * and ~1.2 GB of RAM per browser lane.
 *
 * ============================================================================
 * THE ADMISSIBILITY CONTRACT IS THE HARD PART, AND IT IS NOT NEGOTIABLE
 * ============================================================================
 *
 * This runs the real grading chain and paints NOTHING. It can therefore never
 * testify about what a card looks like, whether text is cut, contrast, layout,
 * z-order, the camera, the FOV, the guidance ribbon, or whether a student can
 * SEE anything at all. Every one of those is a real finding class in this
 * corpus and several open rows are exactly that.
 *
 * A verdict from this instrument that strays into those classes is worse than
 * no verdict, because it retires a row nobody photographed. This corpus has
 * been burned by that precise shape before: closures resting on absence, on a
 * frame nobody opened, on a leg that never drove the manoeuvre.
 *
 * So the contract is a FIELD, not a comment. Every artefact this file emits
 * carries `admissibility` with both halves spelled out, and a judge reading
 * only the JSON cannot mistake it for a photographed drive: `painted: false`,
 * `photographed: false`, and a `mayNotBeCitedFor` list longer than the
 * `mayBeCitedFor` one.
 *
 * TWO KINDS OF LIMIT, AND THEY ARE NOT THE SAME KIND — see `admissibilityFor`:
 *
 *   BLOCKER  the class is INVISIBLE to this instrument (paint, chrome,
 *            typography, the ribbon). Asking it to speak to such a claim is
 *            REFUSED: `kind: "refusal"`, exit 3, no drive run, and the emitted
 *            object carries none of the verdict-shaped keys — no sheet, no
 *            objectives, no passed, no score. §2 of the test file pins that.
 *
 *   CAVEAT   the class is visible but the SCOPE is wider than one in-process
 *            drive: a platform cross (this drives no platform), a sweep leg
 *            (this drives an AUTHORED tape, not the sweep's bot), a rate claim
 *            («passes one time in eight»). These do NOT refuse — refusing them
 *            would kill the instrument on most of the 30 — they stamp the
 *            artefact with the half of the claim it did not touch.
 *
 * The asymmetry that sets the vocabulary: a false "admissible" retires a row
 * nobody photographed; a false "blocked" costs one wasted call. So the blocker
 * list leans towards blocking, and every deliberate over-match is named in the
 * tests. MEASURED over the live open list at ebc56e1 (108 rows / 43 critical):
 *
 *              blocked   caveated   clean
 *   all open      35        38        35
 *   critical       4        28        11
 *
 * The four blocked criticals are the four picture-class criticals, and every
 * one of them blocks on `paint` — «the windscreen is filled edge to edge with a
 * flat orange facade», «the whole windscreen is grass and a hedge at
 * point-blank range», «a large untextured translucent grey plane», «a wide grey
 * paved area … the blue guidance line runs off to the left». That is the list
 * working, not the list being cautious.
 *
 * ============================================================================
 * ANTI-NEUTRALISATION
 * ============================================================================
 *
 * Silence where evidence should be loudest is the failure this programme keeps
 * paying for. Every way this file can fail to do its job has a CODE, a printed
 * block on stderr and a non-zero exit — never an empty result that reads like
 * a clean one. `FAILURE_CODES` is the closed list; §5 of the test file drives
 * each path. A lesson that will not compile, a tape that does not exist, a rung
 * nobody authored, a drive that delivers zero ticks or ends in a phase this
 * file cannot interpret — all of them stop the run and say so by name, with the
 * alternatives that DO exist printed beside them.
 *
 * DETERMINISM IS ASSERTED BY MEASUREMENT, NOT BY CLAIM. The drive runs TWICE by
 * default and the two projections are compared byte-for-byte; the artefact
 * carries the sha256 and `reran: true`. `--single-run` exists and cannot hide:
 * it stamps `reran: false`, which is what a judge reads.
 *
 * ============================================================================
 * WHAT IT DRIVES
 * ============================================================================
 *
 * The chain is the production one, the same wiring `LessonPlayShell` and
 * `simulator/actions` run:
 *
 *   compileScenario(spec, rung)
 *     -> createLessonSession(lesson)
 *     -> recordScriptedDrive's onTick feeds applyTick EVERY production tick
 *     -> buildLessonResult(session)
 *     -> buildDebrief(lesson, result, { coachedMistakes })   [+ scoreRubric]
 *
 * The input is one of three sources:
 *   · `--tape shadow-correct`  the lesson's own authored correct demonstration
 *   · `--tape mistake-*`       one of its authored mistake demonstrations
 *   · `--script <file.json>`   a supplied `{ steps: [...] }` DriveScript
 *
 * The tape recorders are resolved from source, not from a hand-kept table: a
 * traces module claims a lesson when the lesson's id appears in it as a string
 * literal outside comments AND it exports a `record…Drive`. MEASURED: 176
 * lessons resolve, 0 ambiguous, 0 with an unreadable signature — and all 167
 * committed tape folders are covered. A table would rot; an ambiguity here
 * REFUSES rather than picking one.
 *
 * `--script` needs to rebuild the recorder's world options itself, and it can
 * only reproduce the ones the compiled lesson carries. A lesson whose recorder
 * passes `obstacles`, `ruleConfig`, `signalOffsets` or `signalModes` is
 * REFUSED for `--script` by name — grading a supplied script in a world missing
 * its parked cars is the silent-wrong-answer this file exists to prevent.
 * MEASURED over the 148 recorder modules: 92 support `--script`, 56 refuse
 * (obstacles ×29, ruleConfig ×10, signalOffsets ×6, signalModes ×2).
 *
 * ADR-002 holds: nothing here writes law, generates text or re-prices a fault.
 * It reads what the product's own deterministic chain produced.
 */

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// § THE CONTRACT — a field, never a comment
// ---------------------------------------------------------------------------

export const INSTRUMENT = "tools/audit/inprocess-drive.mjs";
export const CONTRACT_VERSION = "1";

/**
 * Shipped verbatim inside every artefact. Two rules govern edits:
 *   1. `mayNotBeCitedFor` may GROW freely and may only shrink when the
 *      instrument genuinely gains the sense in question.
 *   2. `mayBeCitedFor` may only grow when a test drives the new claim.
 */
export const CONTRACT = Object.freeze({
  instrument: INSTRUMENT,
  contractVersion: CONTRACT_VERSION,
  painted: false,
  photographed: false,
  browser: false,
  device: null,
  headline:
    "THIS IS NOT A PHOTOGRAPHED DRIVE. Nothing was rendered, nothing was displayed, " +
    "and no human eye could have been present. It is the production grading chain " +
    "run in-process over an authored input tape.",
  chain: [
    "compileScenario(spec, rung)",
    "createLessonSession(lesson)",
    "applyTick(session, tick) for every production tick the recorder emits",
    "buildLessonResult(session)",
    "buildDebrief(lesson, result, { coachedMistakes })",
    "scoreRubric(result, spec.rubric, observationFromTrace) when the template authors a rubric",
  ],
  mayBeCitedFor: Object.freeze([
    "whether an objective ticks at all, and the session time it ticks at",
    "which fault codes the grading chain books, at what session time, in which official severity class, for how many points",
    "the exam-sheet totals (опасни / основни / второстепенни / Общо) and the pass/fail verdict those totals produce",
    "which commendations the chain books",
    "which teach moments were raised and which mistakes were coached (shown, deliberately not charged)",
    "the star count scoreRubric derives from that result",
    "the debrief TEXT the deterministic template generates from that result (the words, not their rendering)",
    "whether two identical inputs produce two identical gradings",
    "whether a lesson compiles at a rung, and which rungs are authored",
  ]),
  mayNotBeCitedFor: Object.freeze([
    "anything a student SEES: what is on the glass at any moment of the drive",
    "what a card, panel, modal, banner, toast or result surface looks like, or whether one mounted at all",
    "whether text is cut, truncated, overflowing, wrapped, clipped or legible",
    "contrast, colour, font, weight, size, spacing, z-order, or what is hidden behind what",
    "the camera, the FOV, the cockpit, the windscreen or the mirrors as rendered",
    "the guidance ribbon, the blue line, world markers, signs or plaques as drawn",
    "whether a HUD counter, chip or badge agrees with the model measured here — a model/display disagreement is exactly what this cannot see",
    "the scene: geometry as it appears, terrain, buildings, props, textures, weather as rendered",
    "anything about a browser leg (pc-right / pc-wrong / mobile-right / mobile-wrong): this drove an authored tape on no device, in no browser",
    "frame rate, load time, responsiveness or any other timing of the real client",
  ]),
  notTheSweepLeg:
    "The input was an AUTHORED tape (or a supplied script), not the sweep bot's own driving. " +
    "A row whose claim is about what the sweep's leg did is CORROBORATED by this artefact, never settled by it.",
  ifYouNeedMore:
    "For any class in mayNotBeCitedFor: photograph it. This instrument cannot be extended to answer them; it has no renderer.",
});

// ---------------------------------------------------------------------------
// § FAILURE CODES — the closed list. Silence is the enemy.
// ---------------------------------------------------------------------------

export const FAILURE_CODES = Object.freeze([
  "REPO_NOT_FOUND",
  "JITI_MISSING",
  "LESSON_UNKNOWN",
  "RUNG_NOT_AUTHORED",
  "LESSON_WILL_NOT_COMPILE",
  "NO_RECORDER",
  "AMBIGUOUS_RECORDER",
  "UNKNOWN_RECORDER_SHAPE",
  "TAPE_NOT_FOUND",
  "TAPE_AMBIGUOUS",
  "DISTRICT_MISSING",
  "SCRIPT_UNREADABLE",
  "SCRIPT_CANNOT_REPRODUCE_WORLD",
  "RECORDER_THREW",
  "NO_TICKS",
  "STUCK_IN_PREDRIVE",
  "UNINTERPRETABLE_PHASE",
  "NONDETERMINISTIC",
  "FINDING_UNKNOWN",
  "USAGE",
]);

export class InProcessDriveError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "InProcessDriveError";
    if (!FAILURE_CODES.includes(code)) {
      // A code outside the list is itself a defect: an unlisted code is a
      // failure nobody can grep for.
      this.code = "USAGE";
      this.message = `unlisted failure code "${code}" — add it to FAILURE_CODES. Original: ${message}`;
      this.detail = { ...detail, unlistedCode: code };
      return;
    }
    this.code = code;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// § ADMISSIBILITY — blockers refuse, caveats stamp
// ---------------------------------------------------------------------------

/** Unicode-aware word boundary: `\b` is ASCII-only and this corpus is bilingual. */
const W = (body) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])`, "iu");

/**
 * CLASSES THIS INSTRUMENT IS BLIND TO. A claim touching any of them is refused.
 *
 * Every entry is here because the corpus writes it. The counts in the comments
 * are occurrences across the 108 open rows, measured 2026-09-12.
 */
export const BLOCKERS = Object.freeze([
  {
    class: "paint",
    why: "what the 3-D scene renders — this instrument has no renderer and produced no image",
    // windscreen ×6, cockpit ×3, camera ×2, render* ×8, texture ×2
    re: W(
      "windscreen|windscreens|windshield|windshields|cockpit|cockpits|camera|cameras|fov|" +
        "render|renders|rendered|rendering|renderer|texture|textures|textured|untextured|" +
        "drawn|draws|screenshot|screenshots|viewport|viewports|facade|facades|hedge|planter|" +
        "kiosk|plaza|skybox",
    ),
  },
  {
    class: "paint",
    why: "a phrase that can only describe a picture",
    re: /field of view|in frame|in the frame|out of frame|edge to edge|point[- ]blank|on the glass/iu,
  },
  {
    class: "ui-chrome",
    why: "a surface that exists only when something paints it",
    re: W("overlay|overlays|tooltip|tooltips|pill|pills|banner|banners|modal|modals|hud"),
  },
  {
    class: "ui-chrome",
    why: "an explicit statement about what was on screen, or about whether a surface mounted at all",
    re: /on screen|on-screen|off[- ]screen|result surface|z-order/iu,
  },
  {
    class: "typography",
    why: "legibility, layout and colour — none of it exists without a renderer",
    // readable ×2, headline ×2, colour ×2, clipped ×2, cut off ×1
    re: W(
      "font|fonts|colour|colours|color|colors|legible|legibility|illegible|readable|" +
        "unreadable|truncated|truncates|truncation|overflow|overflows|overflowing|clipped|" +
        "ellipsis|wraps|layout|italic|bold",
    ),
  },
  {
    class: "typography",
    why: "layout and clipping phrasing the corpus actually uses",
    // `contrast` is DELIBERATELY not a bare token — see the note under
    // APPEARANCE_PREDICATES. sc-sp-wet-limit-plate:d9fd3821 writes "the
    // template header states the contrast IS the lesson", about dry versus
    // wet, and blocking on it cost a settleable CRITICAL row.
    re: /cut off|cut-off|↓\s*ОЩЕ|mid-phrase|fades out|contrast ratio|(?:low|poor|weak|insufficient|colou?r|text)\s+contrast|contrast against/iu,
  },
  {
    class: "guidance-ribbon",
    why: "the world-drawn route aids — geometry this instrument never asks to be drawn",
    re: /(?<![\p{L}\p{N}_])(?:ribbon|ribbons)(?![\p{L}\p{N}_])|guidance line|blue line|blue guidance|guidance marker|world marker|route line/iu,
  },
  {
    class: "bg-visual",
    why: "the Bulgarian half of the same vocabulary",
    re: W(
      "вижда|видим|видима|видимо|надпис|надписа|надписът|екран|екрана|екранът|шрифт|шрифта|" +
        "цвят|цвета|цветът|отрязан|отрязана|отрязано|кадър|кадъра|кадърът|изображение|изображението",
    ),
  },
]);

/**
 * SURFACE NOUNS THAT ARE NOT, BY THEMSELVES, A PICTURE CLAIM.
 *
 * The first draft blocked on `card`, `counter`, `chip` and `screen` outright,
 * and MEASURED over the open list it cost two CRITICAL rows that are squarely
 * in this instrument's competence:
 *
 *   sc-follow-tailgater:63c0c28c  «0 наказателни точки, 0 опасни, 0 основни,
 *                                 0 второстепенни … drew a teach card and no
 *                                 penalty» — a grading row that mentions a card
 *   sc-merge-motorway-exit:2b903830 «the task counter never leaves 1/3, the
 *                                 exit … is never reached and nothing about it
 *                                 is assessed»
 *
 * So a surface noun blocks only when the SAME SENTENCE carries an appearance
 * predicate; on its own it is a CAVEAT. The binding is per sentence for the
 * same reason build-redrive.test.mjs §4(b) binds per sentence: a clause split
 * severs the noun from the verb that makes it a picture claim.
 *
 * KNOWN HOLE, recorded rather than papered over: a row that names the surface
 * in one sentence and its appearance two sentences later is caveated, not
 * blocked. The always-block lists above cover the genuinely visual rows in
 * today's corpus (measured: every one of the 4 picture-class criticals blocks
 * on `paint`), and widening the sentence window would re-block the two rows
 * this rule exists to release.
 */
export const SURFACE_NOUNS = W(
  "card|cards|panel|panels|chip|chips|badge|badges|counter|counters|headline|headlines|" +
    "toast|toasts|screen|screens|dialog|button|buttons|menu|menus|label|labels",
);

export const APPEARANCE_PREDICATES =
  /(?<![\p{L}\p{N}_])(?:hidden|behind|obscured|covered|covers|overlaps|invisible|blank|empty|fits|fades|greyed|grayed|styled)(?![\p{L}\p{N}_])|never appears|does not appear|is not shown|not visible|longer than|wider than|taller than|does not fit|off the screen|no pill|carries no/iu;

/** Sentences, split the neighbourhood's way: a terminator followed by an opener. */
export function splitSentences(text) {
  return String(text ?? "")
    .split(/\n+|(?<=[.!?])\s+(?=[«"„(A-ZА-Я])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * CLASSES WIDER THAN ONE IN-PROCESS DRIVE. These do NOT refuse — they stamp.
 *
 * Refusing them would block most of the 30, and wrongly: «the wrong leg
 * finishes Общо 0» is a grading proposition wearing a leg's name. What the
 * artefact must never do is let a reader forget which half was measured.
 */
export const CAVEATS = Object.freeze([
  {
    class: "platform-cross",
    why: "this drove no platform. Any claim that two platforms DIFFER is untouched by it — the chain graded one input, once.",
    re: /(?<![\p{L}\p{N}_])(?:pc-right|pc-wrong|mobile-right|mobile-wrong)(?![\p{L}\p{N}_])|on pc\b|on mobile\b|on desktop\b|on the phone\b|both platforms|either platform|two platforms|per platform|the device they use/iu,
  },
  {
    class: "sweep-leg",
    why: "a sweep leg is the harness bot's own driving. This drove an AUTHORED tape, so the leg's inputs are not reproduced — corroboration, not identity.",
    re: W("leg|legs|re-driven|redriven|sweep"),
  },
  {
    class: "rate",
    why: "a claim about how OFTEN something happens needs repetition under the conditions it was observed in; one deterministic pair of runs does not supply it.",
    re: /one time in|times in eight|consecutive times|intermittent|flake|flaky|sometimes|non-deterministic|nondeterministic/iu,
  },
]);

/**
 * Read a claim and say what this instrument may do with it.
 *
 * Returns `{ admissible, blockers, caveats }`. `admissible === false` is the
 * refusal path — the caller MUST NOT run a drive or emit a verdict-shaped
 * object. Empty text is admissible with no caveats: a caller that supplies no
 * claim is asking for a MEASUREMENT, which is never verdict-shaped anyway.
 */
export function admissibilityFor(text) {
  const s = typeof text === "string" ? text : "";
  const hit = (table) => {
    const out = [];
    for (const entry of table) {
      const m = entry.re.exec(s);
      if (m === null) continue;
      out.push({ class: entry.class, matched: m[0], why: entry.why });
    }
    return out;
  };
  const blockers = hit(BLOCKERS);
  const caveats = hit(CAVEATS);

  // The conditional half: a surface noun is a picture claim only when the same
  // sentence says something about how it LOOKS.
  for (const sentence of splitSentences(s)) {
    const noun = SURFACE_NOUNS.exec(sentence);
    if (noun === null) continue;
    const pred = APPEARANCE_PREDICATES.exec(sentence);
    if (pred !== null) {
      blockers.push({
        class: "ui-chrome",
        matched: `${noun[0]} … ${pred[0]}`,
        why: "a surface and a statement about how it looks, in one sentence — this instrument measured the model behind it and never the surface",
      });
    } else {
      caveats.push({
        class: "surface-mention",
        matched: noun[0],
        why: `«${noun[0]}» is a rendered surface. This artefact measured the MODEL behind it; whether the two agree is exactly what an in-process drive cannot see.`,
      });
    }
  }
  return { admissible: blockers.length === 0, blockers, caveats };
}

/** The refusal artefact. Deliberately carries NO verdict-shaped key. */
export function refusalFor(claim, admissibility) {
  return {
    kind: "refusal",
    instrument: INSTRUMENT,
    contractVersion: CONTRACT_VERSION,
    refusedBecause: "CLAIM_OUT_OF_SCOPE",
    noVerdict: true,
    headline:
      "REFUSED. This claim names a class this instrument is blind to. It ran no drive and " +
      "states nothing about the lesson in either direction.",
    claim: { text: claim.text ?? null, findingId: claim.findingId ?? null, lesson: claim.lesson ?? null },
    blockers: admissibility.blockers,
    caveats: admissibility.caveats,
    whatWouldSettleIt:
      "A photographed drive. Every blocker above is a picture-class claim; no in-process " +
      "instrument can be extended to answer it.",
    admissibility: CONTRACT,
  };
}

/** The keys a refusal must never carry — a verdict-shape detector, used by the tests. */
export const VERDICT_SHAPED_KEYS = Object.freeze([
  "sheet",
  "objectives",
  "faults",
  "commendations",
  "passed",
  "score",
  "debrief",
  "rubric",
  "drive",
  "determinism",
]);

// ---------------------------------------------------------------------------
// § DETERMINISM PLUMBING
// ---------------------------------------------------------------------------

/** Key-sorted JSON. Two runs that grade identically must serialize identically. */
export function stableStringify(value) {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
}

export function sha256(text) {
  return "sha256:" + crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * The first place two projections diverge, as a path — because "the two runs
 * differ" is not a report anybody can act on. Returns null when they agree.
 */
export function firstDifference(a, b, at = "") {
  if (a === b) return null;
  const ta = a === null ? "null" : Array.isArray(a) ? "array" : typeof a;
  const tb = b === null ? "null" : Array.isArray(b) ? "array" : typeof b;
  if (ta !== tb) return { path: at || "/", a, b, why: `type ${ta} vs ${tb}` };
  if (ta === "array") {
    if (a.length !== b.length) {
      return { path: at || "/", a: a.length, b: b.length, why: `length ${a.length} vs ${b.length}` };
    }
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${at}/${i}`);
      if (d) return d;
    }
    return null;
  }
  if (ta === "object") {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      const d = firstDifference(a[k], b[k], `${at}/${k}`);
      if (d) return d;
    }
    return null;
  }
  return { path: at || "/", a, b, why: "value" };
}

// ---------------------------------------------------------------------------
// § THE REPO, THE RECORDERS, THE TAPES
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ANCHOR = path.join("platform", "src", "modules", "sim", "lessons", "engine.ts");

/**
 * Walk up for the repo, never count directory levels — the same lesson
 * finding-reader.mjs records: counting levels makes a tool that works from
 * tools/audit/ and nowhere else, and "nowhere else" is where the next reader
 * will try it first.
 */
export function findRepoRoot(starts = [HERE, process.cwd()]) {
  const seen = [];
  for (const start of starts) {
    let d = path.resolve(start);
    for (;;) {
      seen.push(d);
      if (fs.existsSync(path.join(d, ANCHOR))) return d;
      const up = path.dirname(d);
      if (up === d) break;
      d = up;
    }
  }
  throw new InProcessDriveError(
    "REPO_NOT_FOUND",
    `could not find ${ANCHOR} by walking up from this file or the cwd`,
    { looked: seen.slice(0, 16) },
  );
}

const tracesDir = (root) => path.join(root, "platform", "src", "modules", "sim", "traces");
const worldDir = (root) => path.join(root, "content", "world");
const tapesDir = (root) => path.join(root, "content", "traces");

/** Comments are not code. A lesson id inside a header note claims nothing. */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/**
 * Parameter NAMES of a signature, split on TOP-LEVEL commas.
 *
 * A naive `sig.split(",")` reads `extra?: Pick<RecordScriptedDriveOptions,
 * "onTick">` as two parameters and reports the shape
 * `districtRaw,name,"onTick">`. That is what the first version did, and the
 * cost was the right answer for the wrong reason: it refused every one of the
 * 148 recorders as UNKNOWN_RECORDER_SHAPE. Loud, at least — but a shape reader
 * that cannot read a shape is not a shape reader.
 */
export function splitParams(sig) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of sig) {
    if ("<([{".includes(ch)) depth++;
    else if (">)]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((p) => p.split(":")[0].trim().replace(/\?$/, "")).filter(Boolean);
}

/** The `(...)` of the first match, paren-balanced. null when it never closes. */
export function balancedAfter(code, from, open = "(", close = ")") {
  const start = code.indexOf(open, from);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    if (code[i] === open) depth++;
    else if (code[i] === close) {
      depth--;
      if (depth === 0) return { start, end: i, body: code.slice(start + 1, i) };
    }
  }
  return null;
}

/**
 * Top-level keys of the options object literal a `recordScriptedDrive(…)` call
 * passes — including SHORTHAND keys (`kind,`), which the first version missed
 * because it only matched `name:`. It over-collects rather than under-collects
 * on purpose: an extra key can only make `--script` refuse, and refusing is the
 * safe direction when the question is "can I rebuild this lesson's world".
 */
export function optionKeysOf(code) {
  const call = code.indexOf("recordScriptedDrive(");
  if (call < 0) return [];
  const args = balancedAfter(code, call);
  if (args === null) return [];
  const obj = balancedAfter(args.body, 0, "{", "}");
  if (obj === null) return [];
  const keys = [];
  let depth = 0;
  for (const line of obj.body.split("\n")) {
    const trimmed = line.trim();
    if (depth === 0) {
      const m = /^([A-Za-z][A-Za-z0-9]*)\s*[:,]/.exec(trimmed);
      if (m) keys.push(m[1]);
    }
    for (const ch of line) {
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth--;
    }
  }
  return [...new Set(keys)];
}

/**
 * The four recorder call shapes, keyed by their parameter names. Detected from
 * the SOURCE signature rather than guessed from arity: `fn.length` cannot tell
 * `(district, name, extra?)` from `(district, templateId, name)`, and calling
 * the wrong one grades a different lesson while exiting 0.
 */
export const RECORDER_SHAPES = Object.freeze({
  "districtRaw,name": (fn, { district, lesson, tape, extra }) => fn(district, tape, extra),
  "districtRaw,templateId,name": (fn, { district, lesson, tape, extra }) => fn(district, lesson, tape, extra),
  "districtRaw,drillId,traceName": (fn, { district, lesson, tape, extra }) => fn(district, lesson, tape, extra),
  "scenarioId,name,districtRaw": (fn, { district, lesson, tape, extra }) => fn(lesson, tape, district, extra),
});

/** Option keys `--script` can rebuild from the compiled lesson. */
export const SCRIPT_REPRODUCIBLE_OPTIONS = Object.freeze([
  "scenarioId",
  "kind",
  "seed",
  "stagedEvents",
  "collisionMinKmh",
  "vehicleCount",
  "pedestrianCount",
  "isNight",
  "rain",
  "fog",
  "snow",
  "maxDurationSec",
  "onTick",
]);

/**
 * lessonId -> { file, fn, shape, worldOptionKeys }.
 *
 * A module claims a lesson when the id appears in it as a STRING LITERAL
 * outside comments and the module exports a `record…Drive`. MEASURED over the
 * 167 committed tape folders: 167 claimed, 0 unclaimed, 0 claimed twice. Two
 * claimants is an AMBIGUOUS_RECORDER refusal, never a pick.
 */
export function recorderIndex(root) {
  const dir = tracesDir(root);
  const claims = new Map();
  const modules = new Map();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".ts") || file.endsWith(".d.ts") || file.endsWith(".test.ts")) continue;
    const code = stripComments(fs.readFileSync(path.join(dir, file), "utf8"));
    const sig = /export function (record[A-Za-z0-9_]*Drive)\s*\(/.exec(code);
    if (sig === null) continue;
    const args = balancedAfter(code, sig.index);
    if (args === null) continue;
    const shape = splitParams(args.body)
      .filter((p) => p !== "extra")
      .join(",");
    modules.set(file, { file, fn: sig[1], shape, worldOptionKeys: optionKeysOf(code) });
    for (const lit of code.matchAll(/"(sc-[a-z0-9]+(?:-[a-z0-9]+)*)"/g)) {
      const id = lit[1];
      if (!claims.has(id)) claims.set(id, new Set());
      claims.get(id).add(file);
    }
  }
  const index = new Map();
  for (const [id, files] of claims) {
    const real = [...files].filter((f) => modules.has(f)).sort();
    if (real.length === 0) continue;
    index.set(id, real.length === 1 ? modules.get(real[0]) : { ambiguous: real });
  }
  return index;
}

export function recorderFor(root, lessonId, index = recorderIndex(root)) {
  const hit = index.get(lessonId);
  if (hit === undefined) {
    throw new InProcessDriveError(
      "NO_RECORDER",
      `no traces module claims "${lessonId}" — nothing in platform/src/modules/sim/traces names it as a string literal`,
      { lesson: lessonId, drivable: [...index.keys()].sort().slice(0, 12), drivableCount: index.size },
    );
  }
  if (hit.ambiguous) {
    throw new InProcessDriveError(
      "AMBIGUOUS_RECORDER",
      `${hit.ambiguous.length} traces modules claim "${lessonId}" — picking one would grade a lesson you did not ask for`,
      { lesson: lessonId, claimants: hit.ambiguous },
    );
  }
  if (!Object.hasOwn(RECORDER_SHAPES, hit.shape)) {
    throw new InProcessDriveError(
      "UNKNOWN_RECORDER_SHAPE",
      `${hit.file}:${hit.fn} has parameters (${hit.shape}), which is not one of the four known shapes`,
      { lesson: lessonId, ...hit, known: Object.keys(RECORDER_SHAPES) },
    );
  }
  return hit;
}

/** The committed tape names for a lesson, sorted; loud when the folder is absent. */
export function tapesFor(root, lessonId) {
  const dir = path.join(tapesDir(root), lessonId);
  if (!fs.existsSync(dir)) {
    throw new InProcessDriveError(
      "TAPE_NOT_FOUND",
      `no committed tapes for "${lessonId}" — ${path.relative(root, dir)} does not exist`,
      { lesson: lessonId, looked: dir },
    );
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".trace.json"))
    .map((f) => f.slice(0, -".trace.json".length))
    .sort();
}

/**
 * Resolve `--tape`. Exact name wins; "shadow" and "mistake" are prefix
 * shorthands that REFUSE when they are not unique, because silently taking the
 * first of three mistake tapes is a verdict about a drive nobody chose.
 */
export function resolveTape(tapes, requested, lessonId = "?") {
  const want = requested ?? "shadow";
  if (tapes.includes(want)) return want;
  const matches = tapes.filter((t) => t === want || t.startsWith(want + "-") || t.startsWith(want));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new InProcessDriveError("TAPE_NOT_FOUND", `"${lessonId}" has no tape matching "${want}"`, {
      lesson: lessonId,
      requested: want,
      available: tapes,
    });
  }
  throw new InProcessDriveError(
    "TAPE_AMBIGUOUS",
    `"${want}" matches ${matches.length} tapes on "${lessonId}" — name one`,
    { lesson: lessonId, requested: want, matches, available: tapes },
  );
}

// ---------------------------------------------------------------------------
// § LOADING THE PRODUCT
// ---------------------------------------------------------------------------

let CHAIN = null;

/**
 * The TypeScript product, loaded through jiti (platform's own dependency; the
 * tree has no tsx and no ts-node). `@/` resolves the way vitest.config.ts and
 * tsconfig paths resolve it — a mismatch here would silently load a different
 * module than the app does.
 */
export async function loadChain(root) {
  if (CHAIN !== null) return CHAIN;
  const jitiEntry = path.join(root, "platform", "node_modules", "jiti", "lib", "jiti.mjs");
  if (!fs.existsSync(jitiEntry)) {
    throw new InProcessDriveError(
      "JITI_MISSING",
      "platform/node_modules/jiti is not installed — run npm install inside platform/",
      { looked: jitiEntry },
    );
  }
  const { createJiti } = await import(pathToFileURL(jitiEntry).href);
  const jiti = createJiti(pathToFileURL(path.join(HERE, "inprocess-drive.mjs")).href, {
    fsCache: true,
    interopDefault: true,
    alias: { "@": path.join(root, "platform", "src") },
  });
  const sim = path.join(root, "platform", "src", "modules", "sim");
  const load = (rel) => jiti.import(path.join(sim, rel));
  const [engine, compile, templates, debrief, rubric, observation, contracts] = await Promise.all([
    load("lessons/engine.ts"),
    load("lessons/scenario/compile.ts"),
    load("lessons/scenario/templates.ts"),
    load("lessons/debrief.ts"),
    load("lessons/scenario/rubric.ts"),
    load("lessons/scenario/observation.ts"),
    load("contracts.ts"),
  ]);
  CHAIN = { jiti, sim, engine, compile, templates, debrief, rubric, observation, contracts };
  return CHAIN;
}

/** Which rungs the template actually authors — probed, not assumed. */
export function authoredRungs(chain, spec) {
  const out = [];
  for (const level of [1, 2, 3, 4, 5]) {
    try {
      chain.compile.compileScenario(spec, level);
      out.push(level);
    } catch {
      /* an unauthored rung is not our payload — compile.ts's own rule */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// § THE DRIVE
// ---------------------------------------------------------------------------

function loadDistrict(root, districtId) {
  const p = path.join(worldDir(root), `${districtId}.json`);
  if (!fs.existsSync(p)) {
    throw new InProcessDriveError("DISTRICT_MISSING", `content/world/${districtId}.json does not exist`, {
      districtId,
      looked: p,
    });
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** Only the graded shape — nothing wall-clock, nothing this file invented. */
function projectFault(e) {
  return {
    code: e.code,
    t: e.t,
    severityClass: e.severityClass,
    points: e.points,
    titleBg: e.titleBg,
    lawRef: e.lawRef ?? null,
    conceptId: e.conceptId ?? null,
    terminateSession: e.terminateSession === true,
    detail: e.detail ?? null,
  };
}

/**
 * One complete drive, projected to the graded facts. Everything in here is
 * derived from the product; nothing is a timestamp or a machine fact, so two
 * runs of the same input must serialize identically.
 */
export function runOnce(chain, plan) {
  const { engine, debrief, rubric, observation } = chain;
  const lesson = plan.lesson;
  let session = engine.createLessonSession(lesson);
  let ticks = 0;
  const teachMoments = [];
  const onTick = (tick) => {
    ticks++;
    const step = engine.applyTick(session, tick);
    session = step.state;
    for (const m of step.teachMoments ?? []) {
      teachMoments.push({ code: m.code, t: m.t, severity: m.severity, points: m.points, titleBg: m.titleBg });
    }
  };

  let drive;
  try {
    drive = plan.record(onTick);
  } catch (err) {
    throw new InProcessDriveError(
      "RECORDER_THREW",
      `the recorder threw while driving ${plan.lessonId}/${plan.source.name}: ${err && err.message}`,
      { lesson: plan.lessonId, source: plan.source, error: String(err && err.stack ? err.stack : err) },
    );
  }

  if (ticks === 0) {
    throw new InProcessDriveError(
      "NO_TICKS",
      `${plan.lessonId}/${plan.source.name} delivered ZERO production ticks — nothing was graded, and an empty result reads exactly like a clean one`,
      { lesson: plan.lessonId, source: plan.source },
    );
  }
  if (session.phase === "preDrive") {
    throw new InProcessDriveError(
      "STUCK_IN_PREDRIVE",
      `${plan.lessonId} ended in the pre-drive phase: the tape drives, it does not perform pre-drive steps, so nothing about this lesson's grading was exercised`,
      { lesson: plan.lessonId, ticks },
    );
  }
  if (!["driving", "completed", "aborted"].includes(session.phase)) {
    throw new InProcessDriveError(
      "UNINTERPRETABLE_PHASE",
      `${plan.lessonId} ended in phase "${session.phase}", which this file cannot interpret`,
      { lesson: plan.lessonId, phase: session.phase, ticks },
    );
  }

  const result = engine.buildLessonResult(session);
  const deb = debrief.buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes });

  let stars = null;
  let rubricBreakdown = null;
  if (plan.spec.rubric !== undefined) {
    const moments = plan.spec.rubric.observation?.moments;
    let obs;
    if (moments !== undefined && moments.length > 0) {
      obs = observation.parkingObservationFromTrace(drive.trace, moments) ?? undefined;
    }
    const scored = rubric.scoreRubric(result, plan.spec.rubric, obs);
    stars = scored.stars;
    rubricBreakdown = scored.breakdownBg;
  }

  return {
    drive: {
      ticks,
      endPhase: session.phase,
      // `completed` is the route-finish gate firing; `driving` means the tape
      // ran out with the drive still open. Both are real answers and the
      // difference is load-bearing on «has this lesson ever been observed
      // WORKING» rows — so it is stated, never inferred from the score.
      reachedItsOwnEnd: session.phase === "completed",
      durationSec: result.durationSec,
      yieldWaitSec: result.yieldWaitSec ?? null,
      traceSamples: drive.trace.samples.length,
    },
    sheet: {
      ...result.summary.score,
      passed: result.summary.passed,
      failReasons: result.summary.failReasons,
      terminated: result.summary.terminated,
    },
    verdict: {
      passed: result.passed,
      completedAll: result.completedAll,
      aborted: result.aborted,
      score: result.score,
      effectiveScore: result.effectiveScore,
    },
    objectives: result.objectives.map((o) => ({
      id: o.id,
      titleBg: o.titleBg,
      done: o.done,
      completedAtSec: o.completedAtSec,
      detail: o.detail ?? null,
    })),
    faults: result.summary.mistakes.map(projectFault),
    commendations: result.summary.commendations.map((c) => ({ code: c.code, t: c.t, titleBg: c.titleBg })),
    coachedMistakes: (result.coachedMistakes ?? []).map((c) => ({ code: c.code, t: c.t, titleBg: c.titleBg })),
    teachMoments,
    escalations: (result.escalations ?? []).map((e) => ({ ...e })),
    stagedOutcomes: drive.outcomes.map((o) => ({
      eventId: o.eventId,
      success: o.success,
      detail: o.detail ?? null,
    })),
    recorderRuleEvents: drive.ruleEvents.map((e) => ({ kind: e.kind, code: e.code, t: e.t })),
    rubric: stars === null ? null : { stars, breakdownBg: rubricBreakdown },
    debrief: { text: deb.text, conceptIds: deb.conceptIds },
  };
}

/** git provenance. A null head is stated, never omitted — the corpus certifies against a worktree. */
export function worktreeStamp(root) {
  const run = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    const head = run(["rev-parse", "HEAD"]).trim();
    const porcelain = run(["status", "--porcelain", "--", "platform/src", "content"]).trim();
    return {
      head,
      productDirty: porcelain.length > 0,
      productDirtyFiles: porcelain === "" ? 0 : porcelain.split("\n").length,
      note:
        porcelain.length > 0
          ? "platform/src or content is DIRTY — this artefact grades the worktree, not the commit"
          : null,
    };
  } catch (err) {
    return {
      head: null,
      productDirty: null,
      productDirtyFiles: null,
      note: `git unavailable (${String(err && err.message).split("\n")[0]}) — provenance UNKNOWN, do not cite this artefact against a commit`,
    };
  }
}

/**
 * Build the plan: compile the lesson, resolve the input source, and hand back
 * a `record(onTick)` closure. Everything that can be refused is refused here,
 * before a single tick is graded.
 */
export async function planDrive(opts) {
  const root = opts.root ?? findRepoRoot();
  const chain = await loadChain(root);
  const spec = chain.templates.scenarioById(opts.lesson);
  if (spec === undefined) {
    throw new InProcessDriveError("LESSON_UNKNOWN", `no scenario template with id "${opts.lesson}"`, {
      lesson: opts.lesson,
    });
  }
  const rungs = authoredRungs(chain, spec);
  if (rungs.length === 0) {
    throw new InProcessDriveError(
      "LESSON_WILL_NOT_COMPILE",
      `"${opts.lesson}" compiles at NO rung — compileScenario threw for every level 1-5`,
      { lesson: opts.lesson },
    );
  }
  const rung = opts.rung ?? (rungs.includes(3) ? 3 : rungs[0]);
  if (!rungs.includes(rung)) {
    throw new InProcessDriveError(
      "RUNG_NOT_AUTHORED",
      `"${opts.lesson}" does not author rung L${rung}`,
      { lesson: opts.lesson, requested: rung, authored: rungs },
    );
  }
  const lesson = chain.compile.compileScenario(spec, rung);
  const districtId = chain.contracts.lessonDistrictId(lesson);
  const district = loadDistrict(root, districtId);
  const rec = recorderFor(root, opts.lesson);

  let source;
  let record;
  if (opts.scriptPath) {
    const unreproducible = rec.worldOptionKeys.filter((k) => !SCRIPT_REPRODUCIBLE_OPTIONS.includes(k));
    if (unreproducible.length > 0) {
      throw new InProcessDriveError(
        "SCRIPT_CANNOT_REPRODUCE_WORLD",
        `--script cannot drive "${opts.lesson}": its recorder stages the world with ${unreproducible.join(", ")}, ` +
          "which this file cannot rebuild from the compiled lesson. Grading a supplied script in a world " +
          "missing those is a silent wrong answer — use --tape instead.",
        { lesson: opts.lesson, recorder: `${rec.file}:${rec.fn}`, unreproducible, reproducible: SCRIPT_REPRODUCIBLE_OPTIONS },
      );
    }
    let script;
    try {
      script = JSON.parse(fs.readFileSync(opts.scriptPath, "utf8"));
    } catch (err) {
      throw new InProcessDriveError("SCRIPT_UNREADABLE", `could not read --script ${opts.scriptPath}: ${err.message}`, {
        path: opts.scriptPath,
      });
    }
    if (!script || !Array.isArray(script.steps) || script.steps.length === 0) {
      throw new InProcessDriveError(
        "SCRIPT_UNREADABLE",
        `--script ${opts.scriptPath} must be { "steps": [ … ] } with at least one step`,
        { path: opts.scriptPath, got: script === null ? "null" : typeof script },
      );
    }
    const recorder = await chain.jiti.import(path.join(chain.sim, "traces", "recorder.ts"));
    const env = lesson.environment ?? {};
    const options = {
      scenarioId: opts.lesson,
      kind: opts.kind ?? "mistake",
      seed: opts.seed ?? 7,
      stagedEvents: [...(lesson.stagedEvents ?? [])],
      collisionMinKmh: lesson.collisionMinKmh ?? 10,
      vehicleCount: 0,
      pedestrianCount: 0,
      isNight: env.timeOfDay === "night",
      rain: env.rain === true,
      fog: env.fog === true,
      snow: env.snow === true,
    };
    source = {
      kind: "supplied-script",
      name: path.basename(opts.scriptPath),
      path: path.relative(root, opts.scriptPath).split("\\").join("/"),
      sha256: sha256(stableStringify(script)),
      steps: script.steps.length,
      worldOptions: options,
      note:
        "A SUPPLIED SCRIPT IS NOT AN AUTHORED DEMONSTRATION. The world options above were rebuilt " +
        "from the compiled lesson; they are not the recorder's own.",
    };
    record = (onTick) => recorder.recordScriptedDrive(district, script, { ...options, onTick });
  } else {
    const tapes = tapesFor(root, opts.lesson);
    const tape = resolveTape(tapes, opts.tape, opts.lesson);
    const mod = await chain.jiti.import(path.join(chain.sim, "traces", rec.file));
    const fn = mod[rec.fn];
    if (typeof fn !== "function") {
      throw new InProcessDriveError(
        "NO_RECORDER",
        `${rec.file} does not export ${rec.fn} at runtime, though its source declares it`,
        { lesson: opts.lesson, ...rec },
      );
    }
    const call = RECORDER_SHAPES[rec.shape];
    source = {
      kind: tape.startsWith("shadow") ? "authored-shadow-tape" : "authored-mistake-tape",
      name: tape,
      path: `content/traces/${opts.lesson}/${tape}.trace.json`,
      recorder: `platform/src/modules/sim/traces/${rec.file}:${rec.fn}`,
      available: tapes,
    };
    record = (onTick) => call(fn, { district, lesson: opts.lesson, tape, extra: { onTick } });
  }

  return { root, chain, spec, lesson, lessonId: opts.lesson, rung, rungs, districtId, source, record };
}

/**
 * "Deterministic" is a claim, and a claim this corpus does not accept from a
 * comment. Run the thunk twice, compare the serialized projections, and hand
 * back the stamp that says which of those two things happened.
 *
 * `--single-run` cannot hide: it stamps `reran: false`, and every consumer of
 * the artefact reads that field before it reads a number.
 */
export function verifyDeterminism(thunk, { singleRun = false, label = "drive" } = {}) {
  const first = thunk();
  if (singleRun) {
    return {
      first,
      determinism: {
        runs: 1,
        reran: false,
        identical: null,
        digest: sha256(stableStringify(first)),
        note:
          "NOT VERIFIED — --single-run was passed, so this grading was produced once and never " +
          "reproduced. Determinism is asserted by nothing here.",
      },
    };
  }
  const second = thunk();
  const a = stableStringify(first);
  const b = stableStringify(second);
  if (a !== b) {
    const diff = firstDifference(first, second);
    throw new InProcessDriveError(
      "NONDETERMINISTIC",
      `two identical in-process runs of ${label} graded DIFFERENTLY at ${diff === null ? "(no structural difference — the serializer disagrees with the comparator)" : diff.path}`,
      { label, firstDifference: diff },
    );
  }
  return {
    first,
    determinism: {
      runs: 2,
      reran: true,
      identical: true,
      digest: sha256(a),
      note: "The drive was run twice in one process and the two graded projections are byte-identical.",
    },
  };
}

/**
 * The whole job. Runs the drive twice unless `singleRun`, compares, and returns
 * the artefact. Throws InProcessDriveError for every way it can fail.
 */
export async function drive(opts) {
  const plan = await planDrive(opts);
  const { first, determinism } = verifyDeterminism(() => runOnce(plan.chain, plan), {
    singleRun: opts.singleRun === true,
    label: `${plan.lessonId}@L${plan.rung}/${plan.source.name}`,
  });

  const claimText = opts.claim ?? null;
  const adm = admissibilityFor(claimText);
  return {
    kind: "in-process-drive",
    admissibility: {
      ...CONTRACT,
      claim:
        claimText === null
          ? {
              text: null,
              findingId: opts.findingId ?? null,
              note: "NO CLAIM WAS SUPPLIED. This artefact is a MEASUREMENT, not a verdict about any finding.",
            }
          : {
              text: claimText,
              findingId: opts.findingId ?? null,
              admissible: adm.admissible,
              blockers: adm.blockers,
              caveats: adm.caveats,
              untouched:
                adm.caveats.length === 0
                  ? null
                  : "The caveats above name halves of this claim that this artefact does NOT settle.",
            },
    },
    input: {
      lesson: plan.lessonId,
      rung: plan.rung,
      authoredRungs: plan.rungs,
      districtId: plan.districtId,
      source: plan.source,
      worktree: worktreeStamp(plan.root),
    },
    determinism,
    ...first,
  };
}

// ---------------------------------------------------------------------------
// § CLI
// ---------------------------------------------------------------------------

export const USAGE = `inprocess-drive — run the production grading chain over an authored tape, painting nothing.

  --lesson <sc-id>       the scenario template to drive          (required to drive)
  --rung <1..5>          the authored rung                       (default 3, or the lowest authored)
  --tape <name>          a committed tape name, or the shorthand "shadow" / "mistake"
  --script <file.json>   drive a supplied { "steps": [...] } DriveScript instead of a tape
  --kind shadow|mistake  the trace kind recorded for --script     (default mistake)
  --seed <n>             recorder seed for --script               (default 7)
  --claim "<text>"       the finding prose this drive is meant to speak to (gates admissibility)
  --finding <id>         read the claim from the audit corpus by findingId (implies --claim).
                         Costs ~100 s on this disk — finding-reader stats every retired
                         row's evidence frame. Paste the prose into --claim to skip it.
  --single-run           skip the determinism re-run and STAMP the artefact as unverified
  --out <file.json>      also write the artefact to a file
  --tapes <sc-id>        list the committed tapes for a lesson and exit
  --rungs <sc-id>        list the authored rungs for a lesson and exit
  --list                 list every lesson this instrument can drive and exit

stdout is the JSON artefact. stderr is the human block. Exit 0 ok, 2 usage,
3 refusal (the claim names a class this instrument is blind to), 4 loud failure.`;

export function parseArgs(argv) {
  const out = { singleRun: false };
  const need = (i, flag) => {
    if (i + 1 >= argv.length) throw new InProcessDriveError("USAGE", `${flag} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--lesson": out.lesson = need(i, a); i++; break;
      case "--rung": out.rung = Number(need(i, a)); i++; break;
      case "--tape": out.tape = need(i, a); i++; break;
      case "--script": out.scriptPath = need(i, a); i++; break;
      case "--kind": out.kind = need(i, a); i++; break;
      case "--seed": out.seed = Number(need(i, a)); i++; break;
      case "--claim": out.claim = need(i, a); i++; break;
      case "--finding": out.findingId = need(i, a); i++; break;
      case "--out": out.out = need(i, a); i++; break;
      case "--tapes": out.listTapes = need(i, a); i++; break;
      case "--rungs": out.listRungs = need(i, a); i++; break;
      case "--single-run": out.singleRun = true; break;
      case "--list": out.list = true; break;
      case "-h": case "--help": out.help = true; break;
      default:
        throw new InProcessDriveError("USAGE", `unknown argument "${a}"`, { argv });
    }
  }
  if (out.rung !== undefined && !Number.isInteger(out.rung)) {
    throw new InProcessDriveError("USAGE", `--rung must be an integer 1..5, got "${out.rung}"`);
  }
  if (out.scriptPath && out.tape) {
    throw new InProcessDriveError("USAGE", "--script and --tape name two different input sources; pass one");
  }
  return out;
}

function loud(lines) {
  const bar = "=".repeat(78);
  process.stderr.write(`\n${bar}\n${lines.join("\n")}\n${bar}\n`);
}

/**
 * Pull one finding's prose out of the audit corpus. Loud when it is not there.
 *
 * The wait is announced because it is long and it is NOT the drive: the drive
 * is 0.3 s, and `loadOpenFindings` stats every retired row's evidence frame —
 * MEASURED on this tree, 1m44 against 12 s for the same drive with an inline
 * `--claim`. A tool that goes quiet for a hundred seconds teaches its user to
 * kill it.
 */
async function claimFromFinding(findingId) {
  process.stderr.write(
    `# reading the audit corpus for ${findingId} — finding-reader stats every retired row's\n` +
      "# evidence frame, which is ~100 s on this disk. --claim \"<text>\" skips it entirely.\n",
  );
  const reader = await import(pathToFileURL(path.join(HERE, "finding-reader.mjs")).href);
  const rows = reader.loadOpenFindings();
  const hit = rows.find((r) => reader.findingId(r) === findingId || reader.findingId(r).endsWith(":" + findingId));
  if (hit === undefined) {
    throw new InProcessDriveError(
      "FINDING_UNKNOWN",
      `no OPEN finding with id "${findingId}" — a row already retired is not open, and a paraphrased id joins to nothing`,
      { findingId, openRows: rows.length },
    );
  }
  return { text: String(hit.what ?? ""), lesson: hit.scenario, findingId: reader.findingId(hit) };
}

export async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    loud([`USAGE ERROR: ${err.message}`, "", USAGE]);
    return 2;
  }
  if (opts.help || argv.length === 0) {
    process.stderr.write(USAGE + "\n");
    return argv.length === 0 ? 2 : 0;
  }

  try {
    const root = findRepoRoot();

    if (opts.list) {
      const index = recorderIndex(root);
      for (const id of [...index.keys()].sort()) {
        const e = index.get(id);
        process.stdout.write(`${id}\t${e.ambiguous ? "AMBIGUOUS " + e.ambiguous.join(",") : e.file + ":" + e.fn}\n`);
      }
      process.stderr.write(`# ${index.size} lessons resolvable\n`);
      // THE STAMP THIS TOOL OWES, AND WHY IT SITS IN --list.
      // count-agreement compares every corpus-reading tool's OPEN-LIST line
      // against every other's. A reader that prints none passes every equality
      // test BY SILENCE, which is how four tools once printed four different
      // totals. This tool reads the corpus on the --finding path, so it owes a
      // stamp — and --list is the one mode cheap enough to probe: it drives
      // nothing and touches no lesson, tape or ledger.
      {
        const reader = await import(pathToFileURL(path.join(HERE, "finding-reader.mjs")).href);
        process.stdout.write(reader.openListLine(reader.corpusCounts()) + "\n");
        // AND WHAT THIS TOOL OPERATED ON, which the stamp alone does not say.
        // A tool can print a correct corpus stamp while iterating something else
        // entirely, so count-agreement demands the array too. --list enumerates
        // recorders and touches no finding, so the honest thing to report is the
        // one piece of findings work this instrument genuinely owns: which OPEN
        // rows its admissibility contract can ever speak to.
        //
        // Computed through the same admissibilityFor() a real run uses, so this
        // number cannot drift from the contract it describes.
        const open = reader.loadOpenFindings();
        const admissible = open.filter((f) => {
          const a = admissibilityFor(String(f.what ?? ""));
          return !a.blockers.length;
        });
        process.stdout.write(reader.workedLine("open", admissible) + "\n");
        process.stderr.write(
          "# " + admissible.length + " of " + open.length + " open rows are inside this " +
            "instrument's contract; " + (open.length - admissible.length) + " are picture " +
            "claims it is blind to and must never answer\n",
        );
      }
      return 0;
    }
    if (opts.listTapes) {
      for (const t of tapesFor(root, opts.listTapes)) process.stdout.write(t + "\n");
      return 0;
    }
    if (opts.listRungs) {
      const chain = await loadChain(root);
      const spec = chain.templates.scenarioById(opts.listRungs);
      if (spec === undefined) throw new InProcessDriveError("LESSON_UNKNOWN", `no template "${opts.listRungs}"`);
      process.stdout.write(authoredRungs(chain, spec).join(",") + "\n");
      return 0;
    }
    if (!opts.lesson && !opts.findingId) {
      loud(["USAGE ERROR: --lesson is required to drive anything.", "", USAGE]);
      return 2;
    }

    // -- the claim, and the refusal path -----------------------------------
    let claim = { text: opts.claim ?? null, findingId: opts.findingId ?? null, lesson: opts.lesson ?? null };
    if (opts.findingId) {
      const fromCorpus = await claimFromFinding(opts.findingId);
      claim = { ...fromCorpus, lesson: opts.lesson ?? fromCorpus.lesson };
      opts.lesson = opts.lesson ?? fromCorpus.lesson;
      opts.claim = fromCorpus.text;
    }
    if (claim.text !== null) {
      const adm = admissibilityFor(claim.text);
      if (!adm.admissible) {
        const artefact = refusalFor(claim, adm);
        const json = JSON.stringify(artefact, null, 2);
        process.stdout.write(json + "\n");
        if (opts.out) fs.writeFileSync(opts.out, json + "\n");
        loud([
          "REFUSED — the claim names a class this instrument is blind to.",
          ...adm.blockers.map((b) => `  · ${b.class}: «${b.matched}» — ${b.why}`),
          "",
          "No drive was run. Nothing here says the row is closed OR still broken.",
          "Photograph it.",
        ]);
        return 3;
      }
    }

    // -- the drive ----------------------------------------------------------
    const artefact = await drive({ ...opts, root });
    const json = JSON.stringify(artefact, null, 2);
    process.stdout.write(json + "\n");
    if (opts.out) fs.writeFileSync(opts.out, json + "\n");

    const s = artefact.sheet;
    loud([
      `IN-PROCESS DRIVE — ${artefact.input.lesson}@L${artefact.input.rung} · ${artefact.input.source.name}`,
      `  NOTHING WAS PAINTED. This is the grading chain, not a photograph.`,
      `  ticks ${artefact.drive.ticks} · end ${artefact.drive.endPhase} · ${artefact.drive.durationSec.toFixed(1)} s`,
      `  sheet  опасни ${s.opasniCount}/${s.opasniPoints}т · основни ${s.osnovniCount}/${s.osnovniPoints}т ` +
        `· второстепенни ${s.vtorostepenniCount}/${s.vtorostepenniPoints}т · Общо ${s.totalPoints}`,
      `  verdict ${artefact.verdict.passed ? "ИЗДЪРЖАН" : "НЕИЗДЪРЖАН"}` +
        `${artefact.rubric ? ` · ${artefact.rubric.stars}★` : ""}` +
        ` · objectives ${artefact.objectives.filter((o) => o.done).length}/${artefact.objectives.length}`,
      `  determinism ${artefact.determinism.reran ? "verified over 2 runs" : "NOT VERIFIED (--single-run)"} · ${artefact.determinism.digest}`,
      ...(artefact.admissibility.claim.caveats?.length
        ? ["", "  CAVEATS — halves of the claim this artefact does NOT settle:",
           ...artefact.admissibility.claim.caveats.map((c) => `    · ${c.class}: «${c.matched}» — ${c.why}`)]
        : []),
    ]);
    return 0;
  } catch (err) {
    if (err instanceof InProcessDriveError) {
      const payload = { kind: "failure", instrument: INSTRUMENT, code: err.code, message: err.message, detail: err.detail };
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
      loud([
        `FAILED: ${err.code}`,
        `  ${err.message}`,
        ...Object.entries(err.detail ?? {}).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`.slice(0, 400)),
        "",
        "This is a REFUSAL TO GUESS, not a result. Nothing about the lesson was measured.",
      ]);
      return err.code === "USAGE" ? 2 : 4;
    }
    loud([`UNEXPECTED: ${err && err.stack ? err.stack : err}`]);
    return 4;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
