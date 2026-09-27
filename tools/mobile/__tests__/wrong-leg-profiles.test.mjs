/**
 * wrong-leg-profiles.test.mjs — §5 of lib/driveline.mjs: the per-lesson
 * WRONG-LEG PROFILES, and the proof that every OTHER lesson's wrong leg drives
 * byte-for-byte as it did.
 *
 * Run: node --test tools/mobile/__tests__/wrong-leg-profiles.test.mjs
 *
 * §W0 is the load-bearing half: a profile table is a change to ~200 `wrong`
 * lanes unless it provably is not, so W0 reads the cadence constants OUT OF
 * `lesson-audit.mjs` and runs every §5 function for lanes with no profile,
 * comparing each answer with the neutral one.
 *
 * ROUND 7 (the integrator's decision after the round-6 verifier's REFUTED):
 *   · §W1 — NOTHING READS PRODUCT SOURCE. Every sizing number is a declared
 *     design constant with its provenance («sized from … at 4112566»); no test
 *     here opens a product file either, and one test spies on the file system
 *     while every profile is built, driven and finished, and finds no product
 *     read at all. A comment-only or whitespace-only product edit can
 *     therefore turn nothing here red.
 *   · §W7 — THE LINES ARE STRUCTURAL. Every template is enumerated and its
 *     words checked against a CLOSED observation vocabulary (below) that holds
 *     no product actor, no product action, no modal and no causal connective;
 *     the renderer refuses free text; no other code path in §5 or in the
 *     harness emits profile text; every line the battery prints matches a
 *     template.
 *   · the readings are TRUE: rest opportunities per stretch, the wall interval
 *     uncapped with each tick's work in it, the end gap checked, the disc
 *     unread after its first reading counted — each checked against the tally
 *     it names.
 * §W8 is the wiring half (`driveline.test.mjs` §J's reason): a right predicate
 * that nothing reads is the failure this programme keeps paying for.
 *
 * ROUND 10 (§W11, the round-9 verifier's findings; the threat model is quoted
 * above §W11): every «sized on» / «measured» / «census» sentence names its
 * population and cites only declared bounds; five imprecise self-statements are
 * made true and checked against the harness's code; the lib prints nothing and
 * its builtins are checked AT RUNTIME in a child process; the name bans read
 * code tokens; the harness's spelling-evading constructs, its reads of the
 * scenario id and its claim literals are censuses; its leg-mode guards are
 * derived from its own code.
 */
import fs, { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as LIBNS from "../lib/driveline.mjs";
import {
  banZoneRestThresholdSec,
  createWrongLegProfile,
  DIAL_FRAME_ALLOWANCE_MS,
  DIAL_HALF_QUANTUM_KMH,
  DIAL_LONG_FRAME_ALLOWANCE_MS,
  dialLagAllowanceMs,
  finishOpenSizing,
  flatRestDue,
  flatRestHoldDone,
  FOLLOW_CHIP_METRE_QUANTUM_M,
  FOLLOW_CHIP_SECONDS_HALF_QUANTUM,
  HELD_AS_SIZED,
  NEUTRAL_PROFILE_STEP,
  NOT_HELD_AS_SIZED,
  ODO_RATIO_MAX,
  ODO_RATIO_MIN,
  OPENING_WINDOW_MS,
  OVER_LIMIT_STEP_CAP_SEC,
  PHYSICS_MAX_FRAME_MS,
  POSTED_LIMIT_SEL,
  postedLimitKmh,
  PROFILE_DESIGN,
  PROFILE_LINE_TEMPLATES,
  PROFILE_SIZED_AT,
  PROFILE_STEP_CAP_MS,
  PROFILE_SUSTAIN_MARGIN_SEC,
  profileText,
  readZoneRouteSpan,
  renderProfileText,
  resumeThrottleAfterPause,
  SIZING_LABEL,
  STINT_MARGIN_SEC,
  stopDistanceM,
  WITHDRAWN_PROFILE_ROUTES,
  WITHDRAWN_WRONG_LEG_PROFILES,
  WRONG_LEG_PROFILES,
  wrongLegFlatStep,
  wrongLegProfileFinish,
  wrongLegProfileFor,
  wrongLegProfileOutcomeLine,
  wrongLegProfileOutcomeSpec,
  wrongLegProfileStartLine,
  wrongLegProfileStartSpec,
  wrongLegRestBooked,
  wrongLegRestEnded,
  wrongLegRestHoldNote,
  wrongLegRestHoldNoteSpec,
  wrongLegRestHoldsClause,
  wrongLegRestHoldsSpec,
  wrongLegRestOpportunity,
  wrongLegRestSummary,
  wrongLegRestSummarySpec,
  wrongLegRestTick,
  ZONE_REST_CREEP_M,
  ZONE_REST_MARGIN_SEC,
  ZONE_REST_PLATFORMS,
  ZONE_REST_REACT_MAX_S,
  ZONE_REST_REACT_MIN_S,
  ZONE_REST_RESIDUAL_M,
  ZONE_REST_WALL_CEILING_MS,
  ZONE_TRACE_FILE,
  zoneBrakingModel,
  zoneRestEngaged,
  zoneRestInterval,
  zoneRouteSpanFrom,
} from "../lib/driveline.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(HERE, "..", "lesson-audit.mjs"), "utf8");
/** The HARNESS (not the product) with its comments stripped. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const LIB = readFileSync(resolve(HERE, "..", "lib", "driveline.mjs"), "utf8");
/** §5 of the lib, raw — sliced from its header comment's own opening. */
const SEC5_RAW = (() => {
  const head = LIB.indexOf(" * 5 · WRONG-LEG PROFILES");
  assert.ok(head > 0, "§5 could not be located in lib/driveline.mjs");
  const at = LIB.lastIndexOf("/*", head);
  assert.ok(at > 0 && !LIB.slice(at, head).includes("*/"), "§5's header comment could not be located");
  return LIB.slice(at);
})();
/** …and with its comments stripped: only code is left. */
const SEC5 = SEC5_RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
/** This test file's own code, comments stripped — it must open no product file either. */
const SELF_CODE = readFileSync(fileURLToPath(import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** A cadence constant, read out of the harness the way driveline.test.mjs reads them. */
const harnessConst = (name) => {
  const m = CODE.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d[\\d_]*)\\s*;`));
  assert.ok(m, `${name} could not be read out of lesson-audit.mjs`);
  return Number(m[1].replace(/_/g, ""));
};
const EVERY_M = harnessConst("FLAT_REST_EVERY_M");
const MAX_MS = harnessConst("FLAT_REST_MAX_MS");
const HOLD_MS = harnessConst("FLAT_REST_HOLD_MS");

/** The zone's span from AUTHORED CONTENT (JSON), not product source. */
const SPAN = readZoneRouteSpan("sc-pk-busstop-ban", wrongLegProfileFor("sc-pk-busstop-ban").zone);
/** A profile as a pc `wrong` leg builds it (the zone census's platform). */
const make = (id, over = {}) => createWrongLegProfile(id, { zoneSpan: id === "sc-pk-busstop-ban" ? SPAN : null, platform: "pc", ...over });
/** A spec's text (or null). */
const R = (spec) => (spec === null || spec === undefined ? null : renderProfileText(spec));
/** A design constant's value. */
const D = (k) => PROFILE_DESIGN[k].value;
/** The zone profile's SIZING label (round 8): it names the two authored content files its span and basis are read from. */
const ZONE_SIZING_LABEL = R(profileText("sizing.labelZone", { at: PROFILE_SIZED_AT, world: "pk-busstop-v1.json", trace: "shadow-correct.trace.json" }));
/** The label a profile's sizing starts with, by kind. */
const labelFor = (kind) => (kind === "zone-rest" ? ZONE_SIZING_LABEL : SIZING_LABEL);

/** THE DIAL A FLAT THROTTLE PRODUCES on a domain-50 map under the Нормален
 *  governor, at the archived median flat tick (516 ms) from the 8 км/ч the
 *  positive control leaves — the round-1 verifier's re-derivation. A MODEL,
 *  used here to build fixtures, never a claim about the product. */
const FLAT_TICK_MS = 516;
const FLAT_SERIES = [8, 11, 17, 22, 27, 32, 37, 42, 46, 50, 54, 57, 58, 58, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59, 59];
const SXF_145_TICKS = 22;

/** Drive a profile through a speed series of fixed ticks; returns every step.
 *  Each reading is filed at the instant its probe was sent (`probeAt: now`). */
function drive(state, series, extra = () => ({}), dtMs = 500) {
  let st = state;
  let now = 10_000;
  const steps = [];
  for (let i = 0; i < series.length; i++) {
    const kmh = series[i];
    const r = wrongLegFlatStep(st, {
      now,
      t0: 10_000,
      kmh,
      flatStepM: (Math.max(0, kmh) / 3.6) * (dtMs / 1000),
      dtMs,
      postedKmh: 50,
      follow: null,
      probeAt: now,
      ...extra(i, now),
    });
    st = r.state;
    steps.push(r);
    now += dtMs;
  }
  return { state: st, steps, now };
}

/** Drive a profile THE WAY lesson-audit.mjs's flat phase does: the profile's
 *  tick, `flatM` charged the same metres, the rest opportunity counted on the
 *  transition's own inputs, and the transition itself — a rest (taken as
 *  instant here) restarting the phase. `pauses` is a set of tick indices after
 *  which a pause drain resets the phase clock. */
function driveCadence(state, series, { dtMs = 500, extra = () => ({}), pauses = new Set(), holdRest = () => false } = {}) {
  let st = state;
  let now = 10_000;
  let flatM = 0;
  let phaseAt = now;
  let phaseTicks = 0;
  let rests = 0;
  for (let i = 0; i < series.length; i++) {
    const kmh = series[i];
    const flatStepM = (Math.max(0, kmh) / 3.6) * (dtMs / 1000);
    const prof = wrongLegFlatStep(st, { now, t0: 10_000, kmh, flatStepM, dtMs, postedKmh: 50, follow: null, probeAt: now, ...extra(i, now) });
    st = prof.state;
    phaseTicks++;
    flatM += flatStepM;
    const args = { holdRest: holdRest(i), suppress: prof.suppressRest, force: prof.forceRest, flatM, sincePhaseMs: now - phaseAt, phaseTicks, everyM: EVERY_M, maxMs: MAX_MS };
    st = wrongLegRestOpportunity(st, args);
    if (flatRestDue(args)) {
      rests++;
      flatM = 0;
      phaseAt = now;
      phaseTicks = 0;
    }
    if (pauses.has(i)) phaseAt = now;
    now += dtMs;
  }
  return { state: st, now, rests, flatM };
}

/** The zone profile holding the ordinary cadence back for 20 s at 1 км/ч (a dial at the full-stop line books no
 *  braking), then its odometer certainly past the far edge: one rest held back, none booked, MISSED. */
const zoneHeldThenMissed = () => driveCadence(make("sc-pk-busstop-ban"), Array(46).fill(1), { extra: (i) => ({ flatStepM: i < 45 ? 1 : 200 }) }).state;

/** THIS TEST'S OWN RENDERER (round 8) — the slot grammar written again, independently of the lib's, so a
 *  renderer that adds text (or a wrapper that adds text around it) differs from it. It validates nothing: the
 *  lib's refusals are tested on their own. */
function referenceRender(spec) {
  const t = PROFILE_LINE_TEMPLATES[spec.tpl];
  assert.equal(typeof t, "string", `no template «${spec?.tpl}»`);
  return t.replace(/\{([A-Za-z][A-Za-z0-9]*):([a-z0-9]+)(?:\|([^{}]*))?\}/g, (_, name, kind, fb) => {
    const v = spec.f[name];
    if (v === null || v === undefined) return kind === "opt" ? "" : fb;
    if (kind === "n") return String(v);
    if (kind === "r") return String(Math.round(v));
    if (kind === "n1" || kind === "n2" || kind === "n3") return v.toFixed(Number(kind[1]));
    if (kind === "tok" || kind === "txt") return v;
    if (kind === "toks") return v.join(" + ");
    if (kind === "frag" || kind === "opt") return referenceRender(v);
    if (kind === "frags") return v.map(referenceRender).join("; ");
    throw new Error(`kind ${kind}`);
  });
}

/* ── THE CLOSED OBSERVATION VOCABULARY (round 7) ──────────────────────────────
 * Every word a template or a table text can put on a line. A word that is not
 * here fails §W7 — so a new sentence needs a deliberate edit HERE, in the open
 * — and this list is itself checked against FORBIDDEN_WORDS: no product actor,
 * no product action, no modal, no causal connective. (Words carrying a digit —
 * finding ids, «w61», «v²» — are ids and units, not vocabulary.) */
const VOCABULARY = new Set([
  "a", "above", "above-band", "absent", "act", "after", "against", "ahead", "allowance", "already", "and", "antecedent", "any", "applies",
  "approach", "are", "as", "at", "authored", "back", "ban_zone_rest_regrade_sec", "band", "bands", "banzonestoprestsec", "base", "bases",
  "basis", "before", "below", "beside", "best", "between", "beyond", "booked", "both", "brake", "brake_force_n", "braking", "break",
  "bus-stop", "busstopdropoffmaxsec", "by", "cadence", "came", "capped", "car", "careless", "carries", "carry", "ceiling", "ceilings",
  "census", "census-sized", "centred", "certainly", "change", "changed", "chassis_mass", "checked", "chip", "clock",
  "close-on-the-truck-into-its-spray", "closes", "come-to-rest-inside-the-bus-stop-zone", "comes", "constants", "contiguous", "continuous",
  "continuously", "counted", "credited", "creep", "critical", "d", "dangerousspeedoverkmh", "dashboard_poll_ms", "dead", "dead-reckoned",
  "deceleration", "declared", "design", "dial", "did", "different", "dip", "disc", "drill", "drive", "drives", "drop-off", "drove", "due",
  "each", "edge", "edges", "end", "ended", "estimate", "estimated", "every", "far", "fell", "fewer", "file", "finish", "finish-open",
  "first", "flat", "floor", "follow-gap", "followfireratio", "followminspeedkmh", "followrainsecondsfactor", "followrainsustainsec",
  "followrecoveryratemps", "followsafeseconds", "followsustainsec", "for", "force", "frame", "frames", "from", "front",
  "fullstopmaxspeedkmh", "gap", "geometry", "governor", "grip", "had", "harness", "has", "have", "heading", "held", "here",
  "hold", "holds", "ids", "ies", "in", "in-band", "inside", "instrument", "interval", "intervals", "is", "it", "its",
  "keeprightsustainsec", "kept", "kg", "lane", "last", "lasted", "law-bus-stop", "layer", "lead", "least", "leaves", "left", "leg",
  "legs", "length", "lesson", "level", "lies", "line", "long-frame", "longer", "longest", "low", "m", "margin", "measured", "meet", "met",
  "metres", "mid-hold", "middle", "min", "minimum", "mobile", "model", "moves", "moving", "movingspeedkmh", "ms", "n", "never", "no",
  "no-careless-rest-to-the-finish", "none", "nostopping", "not", "nothing", "now", "observed", "odometer", "odometers", "of", "off", "on",
  "once", "one", "one-run-past-the-keep-right-sustain", "only", "open", "opening", "opportunity", "or", "ordinary", "other", "out",
  "outcome", "outside", "over", "own", "past", "path", "pause", "paused", "place", "placed", "plain", "platform",
  "plus", "pose", "position", "possible-in-band", "posted", "prediction", "pressed", "probe", "profile", "rain", "ran", "rate", "ratio",
  "reach", "reached", "reaction", "read", "readable", "reading", "reading-age", "readings", "reads", "rear", "reckoning", "record",
  "recorded", "refused", "released", "rest", "rested", "rests", "resumes", "road", "rounding", "route", "run", "runs", "s", "samples",
  "sc-ac-truck-spray", "sc-ov-keep-right", "sc-pk-busstop-ban", "sc-signal-flashing", "screen", "seconds", "seen",
  "sized", "sizing", "span", "speed", "speed_regrade_sec", "speedinggracemaxkmh", "speedinggraceratio",
  "speedingminorsustainsec", "split", "spread", "stand", "stands", "start", "started", "starts", "steers", "still", "stir", "stop",
  "stopped", "stopping", "straightness", "stretch", "sums", "surface", "t", "take", "taken", "takes", "tally", "target", "taught",
  "template", "than", "that", "the", "them", "then", "there", "these", "this", "throttle", "through", "tick", "time", "to", "top",
  "trace", "truck", "true", "turns", "two", "under", "unknown", "unparsed", "unread", "unreadable", "until", "up", "uses", "verified",
  "wait", "wall", "was", "were", "when", "where", "which", "while", "whole", "whose", "wiped", "with", "without", "work",
  "world", "wrong", "wrong-leg", "yet", "zone", "zones",
  // round 8: the sizing label names what is read; the braking model names only the model; the drill gap is a design constant
  "an", "bounds", "constant", "content", "drilltaughtgapsec", "finite", "identifier", "json", "lower", "shadow-correct", "size", "slope",
  // round 9: what the harness reads and records (the pose, the lane), what no profile decision reads, and the census's population
  "among", "archived", "audit-road", "decision", "dev", "does", "flat-rest", "guidance", "gz", "input", "phase", "publishes", "records",
  "returns", "use", "what", "wheel", "witness",
  // round 10: the population every census band is sized on, the pedal acts on the booking and flat-rest ticks, the
  // harness's own holds, and the truck row's first stretch — none a product actor, action, modal or connective
  "allowances", "book", "down", "gave", "high", "highest", "holding", "larger", "lets", "maximum", "most", "name", "named", "over-limit",
  "percentile", "population", "puts", "same", "stated", "stays", "task-cap", "tick-cost", "times", "transitions", "waiting", "waits", "widened",
  // the TOKENS a slot can carry (`how`, `done`, `kind`, the zone ids, the platform, an error code) — harness words too
  "finish-in-band", "gap-rain", "gap-base", "zone-rest", "stint", "lead-close", "held-as-sized", "metres", "blind", "missed", "no-rest",
  "short-hold", "unverified-place", "pkbs-z-stop-marking", "pkbs-z-stop-pocket", "pc", "tablet", "enoent", "syntaxerror",
  "дистанция", "зона", "км", "м", "на", "с", "спирката", "ч",
]);

/** The word classes no line may use: a product ACTOR, a product ACTION, a
 *  MODAL, or a CAUSAL connective. The vocabulary above must hold none of them
 *  — so no sentence built from it can say what the product does, will do, or
 *  did because of the leg. */
const FORBIDDEN_WORDS = Object.freeze({
  actor: ["product", "products", "engine", "engines", "reducer", "grader", "debrief", "rule", "rules", "app", "backend", "scorer", "scoring", "examiner", "instructor", "session"],
  action: [
    "bill", "bills", "billed", "billing", "settle", "settles", "settled", "settling", "settlement", "charge", "charges", "charged", "grade", "grades", "graded",
    "grading", "re-grade", "re-grades", "regrade", "fire", "fires", "fired", "firing", "convict", "convicts", "convicted", "conviction", "penalise", "penalised",
    "penalize", "penalized", "penalty", "owe", "owes", "owed", "books", "clears", "cleared", "accrue", "accrues", "accrued", "award", "awards", "awarded",
    "passes", "passed", "fails", "failed", "fault", "faults", "show", "shows", "showed", "shown", "display", "displays", "displayed", "achieved", "punish",
  ],
  modal: ["will", "would", "can", "cannot", "could", "may", "might", "must", "should", "shall"],
  causal: ["so", "therefore", "thus", "hence", "because", "since", "consequently", "implies", "means"],
});
const FORBIDDEN = new Set(Object.values(FORBIDDEN_WORDS).flat());
const TEMPLATE_SLOT_RE = /\{([A-Za-z][A-Za-z0-9]*):([a-z0-9]+)(?:\|([^{}]*))?\}/g;
/** The words of a text, lower-cased; ids and units (anything with a digit) skipped. */
const wordsOf = (text) =>
  (String(text).match(/[\p{L}][\p{L}\p{N}_'’-]*/gu) ?? [])
    .map((w) => w.toLowerCase().replace(/[’']s$/, "").replace(/[’']$/, ""))
    .filter((w) => !/\p{N}/u.test(w));
/** Every word of `text` outside the vocabulary, or in a forbidden class. */
function vocabularyViolations(text) {
  return wordsOf(text).filter((w) => !VOCABULARY.has(w) || FORBIDDEN.has(w));
}
/** A template's printable words: its text with the slots removed, plus its fallbacks. */
const templateText = (t) => `${t.replace(TEMPLATE_SLOT_RE, " ")} ${[...t.matchAll(TEMPLATE_SLOT_RE)].map((m) => m[3] ?? "").join(" ")}`;
/** The templates a whole LINE starts from — a line is one of these, filled. */
const TOP_TEMPLATES = ["start.on", "start.refused", "say.held", "say.notHeld", "say.notHeldEnd", "say.braking", "outcome.refused", "outcome.noTicks", "outcome.held", "outcome.notHeld", "rest.zone", "rest.plain", "rest.holds", "summary", "summary.unchanged", "rest.holdsPlain"];
const templateLineRe = (id) =>
  new RegExp(
    `^${PROFILE_LINE_TEMPLATES[id]
      .split(TEMPLATE_SLOT_RE)
      .map((part, k) => (k % 4 === 0 ? part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : k % 4 === 1 ? "[\\s\\S]*?" : ""))
      .join("")}$`,
    "u",
  );
/** A line: it matches a top-level template, and every word on it is vocabulary. */
function assertObservationLine(line, label) {
  assert.equal(typeof line, "string", `${label}: no line`);
  assert.ok(TOP_TEMPLATES.some((id) => templateLineRe(id).test(line)), `${label}: the line matches no line template — it was not rendered from the table: ${line}`);
  const bad = vocabularyViolations(line);
  assert.deepEqual(bad, [], `${label}: words outside the observation vocabulary — ${bad.join(", ")} — in: ${line}`);
}
/** A line that says the readings did NOT meet the sizing, and nothing more. */
function assertNotHeldLine(line, label) {
  assert.ok(line.includes(NOT_HELD_AS_SIZED), `${label}: «${NOT_HELD_AS_SIZED}» missing — ${line}`);
  assert.ok(!line.includes(HELD_AS_SIZED), `${label}: says «${HELD_AS_SIZED}» as well — ${line}`);
  assertObservationLine(line, label);
}

// ---------------------------------------------------------------------------
describe("§W0 every lesson WITHOUT a profile drives byte-for-byte as it did", () => {
  it("reads today's cadence constants out of the harness", () => {
    assert.equal(EVERY_M, 45);
    assert.equal(MAX_MS, 20_000);
    assert.equal(HOLD_MS, 8000);
  });

  const NONE = [
    ["a lesson with no row", createWrongLegProfile("sc-pk-ban-stop", {})],
    ["a `right` leg (scenario null)", createWrongLegProfile(null, {})],
    ["a declared lesson on a `right` leg", createWrongLegProfile(null, { zoneSpan: SPAN, platform: "pc" })],
    ["the WITHDRAWN motorway lesson", createWrongLegProfile("sc-fo-motorway-gap", { platform: "pc" })],
  ];

  for (const [label, st] of NONE) {
    it(`${label}: declared:false, and every §5 function hands back the neutral answer — the same state object, no line`, () => {
      assert.equal(st.declared, false);
      assert.equal(st.on, false);
      for (const kmh of [-1, 0, 1, 12, 49, 55, 58, 61, 130]) {
        for (const follow of [null, { present: true, parsed: true, meters: 10, heldSec: 0.4, needSec: 2, short: true }]) {
          const r = wrongLegFlatStep(st, { now: 99_000, t0: 1000, kmh, flatStepM: 7, dtMs: 500, postedKmh: 50, follow });
          assert.equal(r.state, st, "the no-profile state was replaced — a lane with no profile is being tracked");
          assert.deepEqual({ ...r, state: undefined }, { state: undefined, suppressRest: false, forceRest: false, say: null });
        }
      }
      // THE REST OPPORTUNITY counter (round 7) is neutral too, over a grid.
      for (const suppress of [false, true]) {
        for (const flatM of [0, EVERY_M, 200]) {
          for (const ms of [0, MAX_MS, 90_000]) {
            assert.equal(wrongLegRestOpportunity(st, { holdRest: false, suppress, force: false, flatM, sincePhaseMs: ms, phaseTicks: 3, everyM: EVERY_M, maxMs: MAX_MS }), st);
          }
        }
      }
      assert.equal(resumeThrottleAfterPause(st), true, "a lane with no profile no longer re-presses the throttle after a pause drain");
      const b = wrongLegRestBooked(st, { now: 5000, t0: 0, holdMs: HOLD_MS, kmh: 0 });
      assert.deepEqual([b.state === st, b.holdMs, b.zone], [true, HOLD_MS, false]);
      assert.equal(wrongLegRestTick(st, { kmh: 9, dtMs: 500 }), st);
      assert.equal(wrongLegRestEnded(st, { now: 1, t0: 0 }).say, null);
      assert.equal(wrongLegProfileStartLine(st, { everyM: EVERY_M }), null, "a lane with no profile prints a profile line");
      assert.equal(wrongLegProfileOutcomeLine(st), null);
      assert.equal(wrongLegProfileFinish(st, { now: 1, t0: 0, driveEnded: true }).state, st);
      assert.equal(zoneRestEngaged(st), false);
      // …and the two clauses the harness prints: `null` keeps the rest note that always stood, "" the summary.
      assert.equal(wrongLegRestHoldNote(st, b, { holdMs: HOLD_MS }), null);
      assert.equal(wrongLegRestSummary(st), "");
    });
  }

  it("the transition, over a grid, IS `!holdRest && (flatM >= 45 || ms >= 20000) && phaseTicks >= 1`", () => {
    let n = 0;
    for (const holdRest of [false, true]) {
      for (const flatM of [0, 10, EVERY_M - 0.001, EVERY_M, EVERY_M + 0.001, 200]) {
        for (const ms of [0, 5000, MAX_MS - 1, MAX_MS, MAX_MS + 1, 90_000]) {
          for (const phaseTicks of [0, 1, 2, 40]) {
            const was = !holdRest && (flatM >= EVERY_M || ms >= MAX_MS) && phaseTicks >= 1;
            const now = flatRestDue({
              holdRest,
              suppress: NEUTRAL_PROFILE_STEP.suppressRest,
              force: NEUTRAL_PROFILE_STEP.forceRest,
              flatM,
              sincePhaseMs: ms,
              phaseTicks,
              everyM: EVERY_M,
              maxMs: MAX_MS,
            });
            assert.equal(now, was, `holdRest=${holdRest} flatM=${flatM} ms=${ms} ticks=${phaseTicks}`);
            n++;
          }
        }
      }
    }
    assert.equal(n, 288);
  });

  it("a profile can HOLD the transition back (suppress) or BOOK it (force) — both executed, over the same grid", () => {
    for (const holdRest of [false, true]) {
      for (const flatM of [0, EVERY_M, 200]) {
        for (const ms of [0, MAX_MS, 90_000]) {
          for (const phaseTicks of [0, 1, 3]) {
            const g = { holdRest, flatM, sincePhaseMs: ms, phaseTicks, everyM: EVERY_M, maxMs: MAX_MS };
            assert.equal(flatRestDue({ ...g, suppress: true }), false, `suppress is read by nothing (${JSON.stringify(g)})`);
            assert.equal(flatRestDue({ ...g, force: true }), phaseTicks >= 1, `force is read by nothing, or books on a phase's first tick (${JSON.stringify(g)})`);
            assert.equal(flatRestDue({ ...g, suppress: true, force: true }), phaseTicks >= 1, "a forced rest must win over the profile's own suppression");
          }
        }
      }
    }
  });

  it("the rest's end, over a grid, IS `now - flatRestAt >= FLAT_REST_HOLD_MS`", () => {
    for (const st of [null, NONE[0][1], make("sc-signal-flashing"), make("sc-ov-keep-right")]) {
      for (const dt of [0, 1, HOLD_MS - 1, HOLD_MS, HOLD_MS + 1, 60_000]) {
        assert.equal(flatRestHoldDone({ now: 100_000 + dt, restAt: 100_000, holdMs: HOLD_MS, state: st }), dt >= HOLD_MS, `dt=${dt}`);
      }
    }
  });

  it("the NEUTRAL answer is frozen, and carries NO throttle — no profile governs the throttle", () => {
    assert.ok(Object.isFrozen(NEUTRAL_PROFILE_STEP));
    assert.deepEqual({ ...NEUTRAL_PROFILE_STEP }, { suppressRest: false, forceRest: false, say: null });
  });

  it("a DECLARED profile that is refused (the zone off its census's platform) is neutral too, and says so as an observation", () => {
    const st = createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: SPAN, platform: "mobile" });
    assert.deepEqual([st.declared, st.on], [true, false]);
    const r = wrongLegFlatStep(st, { now: 1, t0: 0, kmh: 58, flatStepM: 8, dtMs: 500, postedKmh: 50 });
    assert.deepEqual([r.state === st, r.suppressRest, r.forceRest, r.say], [true, false, false, null]);
    assert.equal(wrongLegRestOpportunity(st, { suppress: true, flatM: 99, sincePhaseMs: 0, phaseTicks: 2, everyM: EVERY_M, maxMs: MAX_MS }), st);
    assert.equal(wrongLegRestSummary(st), "", "a refused profile claims a summary clause");
    const start = wrongLegProfileStartLine(st, { everyM: 45 });
    assert.match(start, /^WRONG-LEG PROFILE: come-to-rest-inside-the-bus-stop-zone — REFUSED, NOT RUN: .* holds nothing back for sc-pk-busstop-ban:b103c282/);
    assertObservationLine(start, "refused start");
    const out = wrongLegProfileOutcomeLine(st);
    assert.match(out, /^WRONG-LEG PROFILE OUTCOME: come-to-rest-inside-the-bus-stop-zone — ANTECEDENT NOT HELD AS SIZED \(REFUSED, NOT RUN\): .*This leg drove the ordinary cadence\.$/);
    assertNotHeldLine(out, "refused");
  });
});

// ---------------------------------------------------------------------------
describe("§W1 THE DESIGN CONSTANTS — every sizing number declared, sized at 4112566, and NOTHING reads product source", () => {
  it("the design constants are these numbers (a change here is a change to the harness, made in the open, and the report is re-derived)", () => {
    assert.equal(PROFILE_SIZED_AT, "4112566");
    assert.deepEqual(Object.fromEntries(Object.entries(PROFILE_DESIGN).map(([k, r]) => [k, r.value])), {
      speedingGraceRatio: 0.1,
      speedingGraceMaxKmh: 5,
      dangerousSpeedOverKmh: 10,
      speedingMinorSustainSec: 2,
      SPEED_REGRADE_SEC: 6,
      DASHBOARD_POLL_MS: 100,
      dialHalfQuantumKmh: 0.5,
      physicsMaxFrameMs: 500,
      movingSpeedKmh: 5,
      keepRightSustainSec: 12,
      followSafeSeconds: 1.8,
      followFireRatio: 0.7,
      followSustainSec: 2,
      followMinSpeedKmh: 20,
      followRecoveryRateMps: 0.5,
      followRainSecondsFactor: 1.6,
      followRainSustainSec: 3,
      chipMetreQuantumM: 1,
      chipSecondsHalfQuantum: 0.05,
      banZoneStopRestSec: 4,
      busStopDropOffMaxSec: 20,
      BAN_ZONE_REST_REGRADE_SEC: 6,
      fullStopMaxSpeedKmh: 1,
      BRAKE_FORCE_N: 11000,
      CHASSIS_MASS: 1220,
      drillTaughtGapSec: 3,
    });
  });

  it("each constant carries its PROVENANCE — the product source it was sized from and the commit — in its record AND in a «// sized from … at 4112566» comment on its line", () => {
    assert.ok(Object.isFrozen(PROFILE_DESIGN));
    const lines = SEC5_RAW.split("\n");
    for (const [k, r] of Object.entries(PROFILE_DESIGN)) {
      assert.ok(Object.isFrozen(r), `${k} is mutable`);
      assert.deepEqual(Object.keys(r).sort(), ["at", "from", "unit", "value"], `${k}: ${JSON.stringify(r)}`);
      assert.ok(typeof r.value === "number" && Number.isFinite(r.value), `${k} is not a number`);
      assert.equal(typeof r.unit, "string", k);
      assert.equal(r.at, PROFILE_SIZED_AT, `${k} was sized at ${r.at}, not ${PROFILE_SIZED_AT}`);
      // A reference, never a sentence: «file.ts identifier[, file.ts identifier]».
      assert.match(r.from, /^[A-Za-z][\w-]*\.tsx? [\w$.()]+(?:, [A-Za-z][\w-]*\.tsx? [\w$.()]+)*$/, `${k}'s provenance is not a source reference: «${r.from}»`);
      // …and the comment on its line says the same, verbatim.
      const decl = lines.findIndex((l) => new RegExp(`^  ${k}: sizedAt\\(`).test(l));
      assert.ok(decl > 0, `${k} is not declared as \`${k}: sizedAt(\` in §5`);
      assert.equal(lines[decl - 1], `  // sized from ${r.from} at ${PROFILE_SIZED_AT}`, `${k}'s provenance comment is missing or does not match its record`);
      assert.ok(lines[decl].includes(`"${r.from}"`), `${k}'s record and its declaration disagree`);
    }
    // One provenance comment per constant, and no stray ones.
    assert.equal(lines.filter((l) => /^ {2}\/\/ sized from .+ at \w+$/.test(l)).length, Object.keys(PROFILE_DESIGN).length);
  });

  it("the exported quanta ARE the design constants, and every profile's numbers are its `sizedBy` design values — no constant is dead, none is unknown", () => {
    assert.equal(DIAL_HALF_QUANTUM_KMH, D("dialHalfQuantumKmh"));
    assert.equal(PHYSICS_MAX_FRAME_MS, D("physicsMaxFrameMs"));
    assert.equal(FOLLOW_CHIP_METRE_QUANTUM_M, D("chipMetreQuantumM"));
    assert.equal(FOLLOW_CHIP_SECONDS_HALF_QUANTUM, D("chipSecondsHalfQuantum"));
    assert.equal(PROFILE_STEP_CAP_MS, OVER_LIMIT_STEP_CAP_SEC * 1000);
    const used = new Set();
    for (const [id, p] of WRONG_LEG_PROFILES) {
      assert.ok(Object.isFrozen(p.sizedBy) && p.sizedBy.length > 0, `${id} is sized from nothing`);
      for (const k of p.sizedBy) {
        assert.ok(Object.hasOwn(PROFILE_DESIGN, k), `${id} is sized from an unknown constant ${k}`);
        used.add(k);
      }
      const st = make(id);
      assert.equal(st.on, true, `${id}: ${R(st.refused)}`);
      assert.deepEqual(st.c, Object.fromEntries(p.sizedBy.map((k) => [k, D(k)])), `${id}'s numbers are not its design values`);
    }
    assert.deepEqual(Object.keys(PROFILE_DESIGN).filter((k) => !used.has(k)), [], "a design constant no profile is sized from is a dead predicate in waiting");
  });

  it("NOTHING in §5 reads product source: no product path, no source reader, no pin, no refusal on drift — the round-6 readers are gone from the lib", () => {
    for (const gone of ["readProfileConstants", "profileConstantsFrom", "profileSizingPinsFrom", "PROFILE_SIZING_PINS", "PROFILE_SOURCES", "PROFILE_READS", "stripSourceComments"]) {
      assert.equal(gone in LIBNS, false, `§5 still exports ${gone}`);
      assert.ok(!new RegExp(`\\b${gone}\\b`).test(SEC5), `§5's code still names ${gone}`);
    }
    assert.ok(!/platform\/|\.tsx?["'`]|RULES_TYPES_PATH|readSpeedingConfig/.test(SEC5), "§5's code names a product path or a product reader");
    // The only file reads left are the two AUTHORED CONTENT files — and `readFileSync` is NAMED only there, so no
    // alias of it can be taken where the runtime spy below cannot see it (round 8, the verifier's V7-E1), and no
    // other file API, dynamic import or require is named in §5 at all.
    assert.equal((SEC5.match(/\breadFileSync\b/g) ?? []).length, 2, "readFileSync is named outside its two authored-content calls (an alias the spy cannot see)");
    assert.equal((SEC5.match(/\breadFileSync\(/g) ?? []).length, 2);
    assert.ok(!/\b(?:openSync|readSync|readFile|createReadStream|readdirSync|existsSync|statSync|promises|require|execSync|spawnSync|execFileSync|fetch)\b|\bimport\s*\(/.test(SEC5), "§5 names another file API, a process call or a dynamic import");
    // …and the WHOLE lib names no road to a builtin that bypasses its two imports (round 8 finish, R8-F04/F05/F12):
    // `process.getBuiltinModule`, `globalThis`, `eval`, the Function constructor (by name or as `.constructor`), `Reflect`.
    const WHOLE_LIB = LIB.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.ok(WHOLE_LIB.length > 0);
    // (round 10: CODE NAMES — identifier tokens and plain-string computed keys — not the prose inside a literal)
    assert.deepEqual(codeNames(LIB).filter((x) => ["process", "globalThis", "getBuiltinModule", "eval", "Function", "constructor", "Reflect"].includes(x.name)).map((x) => x.name), [], "the lib reaches a builtin without an import");
    assert.match(SEC5, /readFileSync\(root \+ "content\/world\/" \+ zone\.world \+ "\.json", "utf8"\)/);
    assert.match(SEC5, /readFileSync\(root \+ "content\/traces\/" \+ scenario \+ "\/shadow-correct\.trace\.json", "utf8"\)/);
    // …and no profile refuses on a number any more: the only refusals are the zone's span and platform.
    assert.deepEqual(Object.keys(PROFILE_LINE_TEMPLATES).filter((k) => k.startsWith("refused.")).sort(), ["refused.platform", "refused.span"]);
  });

  it("…and THIS TEST FILE opens no product file either (so a product comment or re-indent can turn nothing here red)", () => {
    assert.ok(!/["'`][^"'`\n]*platform\/(?:src|modules|components)|resolve\([^)]*["']platform["']/.test(SELF_CODE), "this test file names a product path in its code");
    // Its only file reads: the harness, the lib, itself — and (round 9, `harnessFacts`) the harness's own road-record
    // lib, tools/ code whose columns the keep-right line's sentence about the lane is checked against.
    // (A Set: the expected forms below are themselves string literals in this file.)
    assert.deepEqual([...new Set(SELF_CODE.match(/\breadFileSync\((?:resolve|fileURLToPath)\([^)]*\)/g) ?? [])].sort(), [
      "readFileSync(fileURLToPath(import.meta.url)",
      'readFileSync(resolve(HERE, "..", "lesson-audit.mjs")',
      'readFileSync(resolve(HERE, "..", "lib", "driveline.mjs")',
      'readFileSync(resolve(HERE, "..", "lib", "road-record.mjs")',
    ]);
  });

  it("AT RUNTIME: building, driving, resting and finishing every declared profile on both platforms reads NO product file — only the two authored content files (a spy on the file system) — and the zone's SIZING label names exactly the files read", () => {
    const reads = [];
    const orig = fs.readFileSync;
    const origOpen = fs.openSync;
    const origRead = fs.readFile;
    fs.readFileSync = function spy(p, ...rest) {
      reads.push(String(p));
      return orig.call(this, p, ...rest);
    };
    fs.openSync = function spyOpen(p, ...rest) {
      reads.push(`openSync:${String(p)}`);
      return origOpen.call(this, p, ...rest);
    };
    fs.readFile = function spyRead(p, ...rest) {
      reads.push(`readFile:${String(p)}`);
      return origRead.call(this, p, ...rest);
    };
    syncBuiltinESMExports();
    const labels = [];
    try {
      for (const platform of ["pc", "mobile"]) {
        for (const id of WRONG_LEG_PROFILES.keys()) {
          const decl = wrongLegProfileFor(id);
          let st = createWrongLegProfile(id, { zoneSpan: decl.kind === "zone-rest" ? readZoneRouteSpan(id, decl.zone) : null, platform });
          wrongLegProfileStartLine(st, { everyM: EVERY_M });
          if (st.on) labels.push([st.kind, R(st.sizedFrom.f.label)]);
          st = driveCadence(st, FLAT_SERIES, { dtMs: FLAT_TICK_MS, extra: () => ({ follow: { present: true, parsed: true, meters: 40, heldSec: 1.1 } }) }).state;
          const b = wrongLegRestBooked(st, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh: 0 });
          wrongLegRestHoldNote(b.state, b, { holdMs: HOLD_MS });
          st = wrongLegRestTick(b.state, { kmh: 0, dtMs: 500 });
          st = wrongLegRestEnded(st, { now: 60_000, t0: 10_000 }).state;
          st = wrongLegProfileFinish(st, { now: 70_000, t0: 10_000, driveEnded: true }).state;
          wrongLegProfileOutcomeLine(st);
          wrongLegRestSummary(st);
        }
      }
    } finally {
      fs.readFileSync = orig;
      fs.openSync = origOpen;
      fs.readFile = origRead;
      syncBuiltinESMExports();
    }
    assert.ok(reads.length >= 2, `the spy saw ${reads.length} read(s) — it is not wired (the zone profile reads its authored geometry)`);
    assert.deepEqual(reads.filter((p) => /platform[\\/]/.test(p)), [], "a profile read a product file");
    for (const p of reads) {
      assert.match(p.replace(/\\/g, "/"), /\/content\/(?:world\/pk-busstop-v1\.json|traces\/sc-pk-busstop-ban\/shadow-correct\.trace\.json)$/, `an unexpected file was read: ${p}`);
    }
    // ROUND 8 (the verifier's FALSE-SELF-CLAIMS b): the SIZING label says exactly what was read. A profile sized
    // from design constants alone says no file is read; the zone profile names the two files the spy just saw.
    const readNames = [...new Set(reads.map((p) => p.replace(/\\/g, "/").split("/").pop()))].sort();
    assert.deepEqual(readNames, ["pk-busstop-v1.json", ZONE_TRACE_FILE].sort());
    for (const [kind, label] of labels) {
      if (kind === "zone-rest") {
        assert.equal(label, ZONE_SIZING_LABEL);
        for (const n of readNames) assert.ok(label.includes(` ${n}`), `the zone's SIZING label does not name ${n}, a file it was read from: ${label}`);
        assert.match(label, /read at drive time from authored content: the world file pk-busstop-v1\.json and the lesson's trace file shadow-correct\.trace\.json; no other file is read to size them/);
      } else {
        assert.equal(label, SIZING_LABEL, `${kind}: ${label}`);
        assert.match(label, /no file is read to size them/);
      }
      assert.ok(!/nothing is read at drive time/.test(label), `the round-7 label is back: ${label}`);
    }
    assert.deepEqual([...new Set(labels.map(([k]) => k))].sort(), ["finish-open", "lead-close", "stint", "zone-rest"]);
  });

  it("AT RUNTIME, ON A FRESH COPY OF THE LIB EVALUATED UNDER THE SPY (round 8 finish — V7-E1's class by BEHAVIOUR, not by name): every fs reader is spied before the copy is evaluated, so an alias it takes at load time IS the spy; the copy reads only the two authored content files, and prints exactly the lines the lib prints", async () => {
    const SPIED = ["readFileSync", "readFile", "openSync", "open", "readSync", "read", "readvSync", "createReadStream", "readdirSync", "opendirSync", "statSync", "lstatSync", "existsSync", "accessSync"];
    /** Build, drive, rest, end and finish every declared profile on both platforms through the module `L`. */
    const battery = (L) => {
      const out = [];
      for (const platform of ["pc", "mobile"]) {
        for (const id of L.WRONG_LEG_PROFILES.keys()) {
          const decl = L.wrongLegProfileFor(id);
          let st = L.createWrongLegProfile(id, { zoneSpan: decl.kind === "zone-rest" ? L.readZoneRouteSpan(id, decl.zone) : null, platform });
          out.push(L.wrongLegProfileStartLine(st, { everyM: EVERY_M }));
          let now = 10_000, flatM = 0, phaseAt = now, phaseTicks = 0;
          for (const kmh of FLAT_SERIES) {
            now += FLAT_TICK_MS;
            const flatStepM = (Math.max(0, kmh) / 3.6) * (FLAT_TICK_MS / 1000);
            const r = L.wrongLegFlatStep(st, { now, t0: 10_000, kmh, flatStepM, dtMs: FLAT_TICK_MS, postedKmh: 50, follow: { present: true, parsed: true, meters: 40, heldSec: 1.1 }, probeAt: now });
            st = r.state;
            if (r.say) out.push(r.say.line);
            phaseTicks++;
            flatM += flatStepM;
            const args = { holdRest: false, suppress: r.suppressRest, force: r.forceRest, flatM, sincePhaseMs: now - phaseAt, phaseTicks, everyM: EVERY_M, maxMs: MAX_MS };
            st = L.wrongLegRestOpportunity(st, args);
            if (L.flatRestDue(args)) { flatM = 0; phaseAt = now; phaseTicks = 0; }
          }
          const b = L.wrongLegRestBooked(st, { now: now + 1000, t0: 10_000, holdMs: HOLD_MS, kmh: 0 });
          out.push(L.wrongLegRestHoldNote(b.state, b, { holdMs: HOLD_MS }));
          st = b.state;
          for (let i = 0; i < 80; i++) st = L.wrongLegRestTick(st, { kmh: 0, dtMs: 500 });
          const e = L.wrongLegRestEnded(st, { now: now + 50_000, t0: 10_000 });
          if (e.say) out.push(e.say.line);
          st = L.wrongLegProfileFinish(e.state, { now: now + 51_000, t0: 10_000, driveEnded: true }).state;
          out.push(L.wrongLegProfileOutcomeLine(st), L.wrongLegRestSummary(st), L.wrongLegRestHoldsClause(st, { stops: 3, holdMs: HOLD_MS }));
        }
      }
      return out;
    };
    const reads = [];
    const orig = Object.fromEntries(SPIED.map((k) => [k, fs[k]]));
    const origP = fs.promises.readFile;
    // Only the OUTERMOST call is recorded: `readFileSync` itself opens and reads through the public `openSync` /
    // `readSync`, and those inner calls are its own, not a second read.
    let depth = 0;
    for (const k of SPIED) {
      fs[k] = function spy(p, ...rest) {
        if (depth === 0) reads.push(`${k}:${String(p)}`);
        depth++;
        try {
          return orig[k].call(this, p, ...rest);
        } finally {
          depth--;
        }
      };
    }
    fs.promises.readFile = function spyP(p, ...rest) {
      reads.push(`promises.readFile:${String(p)}`);
      return origP.call(this, p, ...rest);
    };
    syncBuiltinESMExports();
    let freshLines;
    const freshUrl = `${pathToFileURL(resolve(HERE, "..", "lib", "driveline.mjs")).href}?fresh-under-spy=${Date.now()}`;
    try {
      const fresh = await import(freshUrl);
      assert.notEqual(fresh.createWrongLegProfile, createWrongLegProfile, "UNREADABLE: the copy is the module already loaded, evaluated before the spy");
      freshLines = battery(fresh);
    } finally {
      for (const k of SPIED) fs[k] = orig[k];
      fs.promises.readFile = origP;
      syncBuiltinESMExports();
    }
    // THE SPY WAS IN PLACE BEFORE THE COPY WAS EVALUATED: the module loader's own read of the copy's source is the
    // FIRST read it saw, exactly once. That read is the loader's, not the lib's, and is the only one set aside.
    assert.equal(reads[0], `readFileSync:${freshUrl}`, `the spy did not see the copy being loaded — it was installed too late (${reads[0]})`);
    assert.equal(reads.filter((r) => r.includes(freshUrl)).length, 1, "the copy's source was read more than once");
    const libReads = reads.slice(1);
    assert.equal(libReads.length, 4, `the spy saw ${libReads.length} read(s) by the copy, not the two zone builds' two files each: ${JSON.stringify(libReads)}`);
    for (const r of libReads) {
      assert.match(r.replace(/\\/g, "/"), /^readFileSync:.*\/content\/(?:world\/pk-busstop-v1\.json|traces\/sc-pk-busstop-ban\/shadow-correct\.trace\.json)$/, `the fresh copy read something other than the two authored content files: ${r}`);
    }
    // …and the copy IS the lib: the same battery through the module every other test imports prints the same lines.
    const libLines = battery(LIBNS);
    // (8 builds — 4 profiles × 2 platforms — each a start line, a rest note, an outcome and a summary at least.)
    assert.ok(freshLines.filter((l) => l !== null && l !== "").length >= 32, `the battery has gone thin: ${freshLines.filter((l) => l !== null && l !== "").length}`);
    assert.deepEqual(freshLines, libLines);
  });

  it("the drop-off follows the zone's basis — a bus stop is NOT the 4 s", () => {
    const c = { busStopDropOffMaxSec: D("busStopDropOffMaxSec"), banZoneStopRestSec: D("banZoneStopRestSec") };
    assert.equal(banZoneRestThresholdSec("law-bus-stop", c), 20);
    for (const b of ["sign", "law-alongside", "law-junction", "law-crossing", "law-rail", undefined]) {
      assert.equal(banZoneRestThresholdSec(b, c), 4, `basis ${b}`);
    }
    assert.equal(banZoneRestThresholdSec("law-bus-stop", {}), null);
  });
});

// ---------------------------------------------------------------------------
describe("§W2 the zone, placed on the route from AUTHORED geometry (content JSON, not product source)", () => {
  it("sc-pk-busstop-ban: pkbs-z-stop-marking + pkbs-z-stop-pocket are [135, 195] m of route, basis law-bus-stop", () => {
    assert.equal(SPAN.ok, true, R(SPAN.why) ?? "");
    assert.ok(Math.abs(SPAN.fromM - 135) < 0.01, `fromM ${SPAN.fromM}`);
    assert.ok(Math.abs(SPAN.toM - 195) < 0.01, `toM ${SPAN.toM}`);
    assert.equal(SPAN.basis, "law-bus-stop");
    assert.equal(SPAN.edgeId, "pkbs-e-street");
  });

  const world = (over = {}) => ({
    zones: [
      { id: "a", kind: "noStopping", edgeId: "e", fromM: 100, toM: 130, basis: "law-bus-stop" },
      { id: "b", kind: "noStopping", edgeId: "e", fromM: 130, toM: 160, basis: "law-bus-stop" },
      ...(over.extraZones ?? []),
    ],
    roads: { edges: [{ id: "e", geometry: [[0, 0], [0, 400]] }] },
  });
  const straight = Array.from({ length: 50 }, (_, i) => ({ x: 4, y: 20 + i * 5, headingDeg: 0 }));

  it("a straight authored route: the span is measured from the authored start", () => {
    const r = zoneRouteSpanFrom({ world: world(), zoneIds: ["a", "b"], trace: straight });
    assert.deepEqual([r.ok, r.fromM, r.toM], [true, 80, 140]);
  });

  it("a route running the other way along the edge is measured the other way", () => {
    const back = Array.from({ length: 50 }, (_, i) => ({ x: 4, y: 380 - i * 5, headingDeg: 180 }));
    const r = zoneRouteSpanFrom({ world: world(), zoneIds: ["a", "b"], trace: back });
    assert.deepEqual([r.ok, r.fromM, r.toM], [true, 220, 280]);
  });

  it("refuses every shape dead reckoning cannot survive — each reason a template, never free text", () => {
    const cases = [
      [{ world: world(), zoneIds: ["a", "zz"], trace: straight }, /zone «zz» is not in the world file/],
      [{ world: { ...world(), zones: [world().zones[0], { ...world().zones[1], fromM: 135 }] }, zoneIds: ["a", "b"], trace: straight }, /not contiguous/],
      [{ world: { ...world(), zones: [world().zones[0], { ...world().zones[1], basis: "sign" }] }, zoneIds: ["a", "b"], trace: straight }, /different bases/],
      [{ world: world(), zoneIds: ["a", "b"], trace: straight.map((p) => ({ ...p, x: 40 })) }, /off edge «e»/],
      [{ world: world(), zoneIds: ["a", "b"], trace: straight.map((p, i) => ({ ...p, headingDeg: i > 20 ? 15 : 0 })) }, /turns 15\.0° before the far edge/],
      [{ world: world(), zoneIds: ["a", "b"], trace: straight.map((p) => ({ ...p, y: p.y + 200 })) }, /not ahead of it/],
      [{ world: null, zoneIds: ["a"], trace: straight }, /not readable/],
      [{ world: world(), zoneIds: ["a"], trace: [straight[0]] }, /fewer than two/],
    ];
    for (const [arg, re] of cases) {
      const r = zoneRouteSpanFrom(arg);
      assert.equal(r.ok, false, `accepted: ${re}`);
      assert.ok(r.why && typeof r.why.tpl === "string" && r.why.tpl.startsWith("span."), `the reason is not a span template: ${JSON.stringify(r.why)}`);
      assert.match(R(r.why), re);
      // …and a refused zone profile carries it, rendered, on its start line.
      const st = createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: r, platform: "pc" });
      assert.equal(st.on, false);
      assert.match(wrongLegProfileStartLine(st, { everyM: 45 }), re);
    }
    // An unreadable file refuses with its error CODE only (an identifier), never its message.
    const missing = readZoneRouteSpan("sc-no-such-lesson", { world: "no-such-world", zoneIds: ["x"] });
    assert.equal(missing.ok, false);
    assert.equal(R(missing.why), "the authored geometry was not readable (ENOENT)");
  });
});

// ---------------------------------------------------------------------------
describe("§W3 finish-open (sc-signal-flashing) — rest suppression only; the verdict word is about the READINGS", () => {
  const sxf = () => drive(make("sc-signal-flashing"), FLAT_SERIES.slice(0, SXF_145_TICKS), () => ({}), FLAT_TICK_MS);

  it("F1: NO GOVERNOR — every step holds the rest back and none carries a throttle; the table says so", () => {
    const { steps } = sxf();
    assert.ok(steps.every((s) => s.suppressRest === true && s.forceRest === false));
    assert.ok(steps.every((s) => !("throttle" in s)), "a profile step carries a throttle again — the round-1 governor is back");
    assert.equal(WRONG_LEG_PROFILES.get("sc-signal-flashing").kind, "finish-open");
    assert.match(WRONG_LEG_PROFILES.get("sc-signal-flashing").told, /plain flat throttle every wrong leg uses \(no governor\)/);
    assert.ok(!/\bthrottle\s*:/.test(SEC5), "a `throttle:` field reached §5's code");
    assert.ok(!/onBelowKmh|offAtKmh|throttleFlips/.test(SEC5), "the governor's thresholds are still in §5");
  });

  it("the band at the dial's resolution: (55, 60] counts only readings 56..59 — a whole-км/ч 60 may be 60.4", () => {
    const st = drive(make("sc-signal-flashing"), [55, 56, 59, 60, 61]);
    assert.deepEqual(st.steps.map((s) => s.state.finish.lastInBand), [false, true, true, false, false]);
    assert.equal(st.state.finish.gradedAboveKmh, 55);
    assert.equal(st.state.finish.dangerousAboveKmh, 60);
    assert.equal(st.state.finish.aboveBandTicks, 1, "only 61 is above the опасна line; 60 is ambiguous, not above");
  });

  it("the in-band tally runs on the profile clock: a frozen wall-clock gap adds nothing, a stalled interval adds ≤ the step cap", () => {
    let st = make("sc-signal-flashing");
    for (const now of [10_000, 10_500, 41_000, 41_500]) st = wrongLegFlatStep(st, { now, t0: 10_000, kmh: 58, flatStepM: 8, dtMs: 500, postedKmh: 50 }).state;
    assert.equal(st.finish.inBandSec, 1.5, "the frozen 30 s leaked into the in-band tally");
    let s2 = make("sc-signal-flashing");
    for (const dtMs of [500, 30_000]) s2 = wrongLegFlatStep(s2, { now: 20_000, t0: 10_000, kmh: 58, flatStepM: 8, dtMs, postedKmh: 50 }).state;
    assert.equal(s2.finish.inBandSec, PROFILE_STEP_CAP_MS / 1000);
    assert.equal(s2.clockMs, 500 + PROFILE_STEP_CAP_MS, "the profile clock took a stalled interval past the cap");
  });

  it("a dip to the posted number wipes the in-band tally (and is counted); a tick above the band stops it and keeps it (§2b)", () => {
    const wiped = drive(make("sc-signal-flashing"), [...Array(9).fill(58), 50]).state;
    assert.deepEqual([wiped.finish.inBandSec, wiped.finish.dips], [0, 1]);
    const above = drive(make("sc-signal-flashing"), [...Array(5).fill(58), 65, 65, 58]).state;
    assert.equal(above.finish.inBandSec, 2);
  });

  it("THE RE-DERIVED 145 m: the plain flat throttle ends inside the band with ~5 s in-band → HELD AS SIZED (finish-in-band), every reading on the line", () => {
    const { state, now } = sxf();
    assert.equal(state.heldAsSized, false, "nothing may be held as sized mid-drive — the finish-open verdict is the drive's end");
    assert.equal(state.finish.lastKmh, 59);
    assert.ok(state.finish.inBandSec >= 3 && state.finish.inBandSec < 7, `in-band ${state.finish.inBandSec}`);
    // The finish comes one flat tick after the last reading, as in the harness.
    const f = wrongLegProfileFinish(state, { now, t0: 10_000, driveEnded: true }).state;
    assert.equal(f.heldAsSized, true, R(f.observed));
    assert.deepEqual([f.how, f.done, f.driveEnded], ["finish-in-band", "held-as-sized", true]);
    const LAG = dialLagAllowanceMs("pc", D("DASHBOARD_POLL_MS"));
    assert.ok(Math.abs(f.finish.possibleSec - (12 * 0.516 + LAG / 1000)) < 1e-9, `possible ${f.finish.possibleSec}`);
    assert.ok(Math.abs(f.finish.ageCreditSec - LAG / 1000) < 1e-9);
    // THE END GAP, measured: 516 ms, inside the longest wall interval between two flat readings (516 ms).
    assert.deepEqual([f.finish.finalMs, f.maxWallMs], [FLAT_TICK_MS, FLAT_TICK_MS]);
    const obs = R(f.observed);
    assert.match(obs, new RegExp(`the possible-in-band tally ${(12 * 0.516 + LAG / 1000).toFixed(1).replace(".", "\\.")} s of wall clock \\(sized < 8 s; ${(LAG / 1000).toFixed(1).replace(".", "\\.")} s of it the reading-age allowance\\)`));
    assert.match(obs, new RegExp(`the last flat reading was taken 516 ms of wall clock before the finish's clock, inside the longest wall interval between two flat readings \\(516 ms\\), and by the harness's estimate up to ${LAG} ms before its tick$`));
    assert.match(obs, /the posted disc read 50 on every one of them/);
    const line = wrongLegProfileOutcomeLine(f);
    assert.match(line, /^WRONG-LEG PROFILE OUTCOME: no-careless-rest-to-the-finish — ANTECEDENT HELD AS SIZED \(finish-in-band\) at t=\d+s — OBSERVED: no careless rest was taken on 22 flat tick\(s\), the posted disc read 50 on every one of them, and the drive reached its end screen/);
    assertObservationLine(line, "sxf held");
    // THE SIZING, labelled «sized at 4112566», never «read at drive time».
    assert.ok(line.includes(`${SIZING_LABEL}: band over a disc D = (D + min(D × speedingGraceRatio 0.1, speedingGraceMaxKmh 5), D + dangerousSpeedOverKmh 10]`), line);
    assert.ok(line.includes("sized at 4112566"), line);
    assert.ok(!/product source|read from source|source read/.test(line), line);
    assert.match(line, /possible-in-band target < speedingMinorSustainSec 2 s \+ SPEED_REGRADE_SEC 6 s = 8 s/);
    // (round 10: the allowance names the census it is sized on — 5 of this lesson's archived pc wrong legs)
    assert.match(line, /reading-age allowance 300 ms = DASHBOARD_POLL_MS 100 ms \+ two frames 100 ms \+ this platform's long-frame allowance 100 ms \(sized on a census of 5 of this lesson's archived pc wrong legs, whose longest probe waits read at most 99 ms\)/);
    assert.match(line, / · the drive reached its end screen\. /);
  });

  it("each sizing target, unmet, is ANTECEDENT NOT HELD AS SIZED — with the reading that missed it", () => {
    const { state, now } = sxf();
    const d = (series, extra = () => ({}), dt = 500) => {
      const r = drive(make("sc-signal-flashing"), series, extra, dt);
      return [r.state, r.now];
    };
    const cases = [
      ["drive not ended", [state, now], { driveEnded: false }, /^the readings did not meet the finish-open sizing: the drive did not reach its end screen$/],
      ["last reading 60", d([...FLAT_SERIES.slice(0, 20), 60], () => ({}), FLAT_TICK_MS), { driveEnded: true }, /the last flat reading \(60 км\/ч\) was not inside \(55, 60\] by the dial's 0\.5 км\/ч rounding/],
      ["last reading unread", d([...FLAT_SERIES.slice(0, 20), -1], () => ({}), FLAT_TICK_MS), { driveEnded: true }, /the last flat reading \(UNREAD км\/ч\)/],
      ["too little in band", d([30, 58, 58, 58, 58]), { driveEnded: true }, /the in-band tally read 1\.5 s against the sized 3 s \(speedingMinorSustainSec 2 \+ 1\)/],
      ["past the sustain, short of the margin", d([30, 58, 58, 58, 58, 58, 58]), { driveEnded: true }, /the in-band tally read 2\.5 s against the sized 3 s/],
      ["past the window", d([30, ...Array(16).fill(58)]), { driveEnded: true }, /the possible-in-band tally read 8\.8 s, not under the sized 8 s \(speedingMinorSustainSec 2 \+ SPEED_REGRADE_SEC 6\)/],
      ["no disc", d(Array(10).fill(58), () => ({ postedKmh: null })), { driveEnded: true }, /no posted disc was read, and no band was sized/],
      ["a limit change", d([30, 58, 58, 58, 58, 58, 58, 58, 47], (i) => ({ postedKmh: i < 8 ? 50 : 40 })), { driveEnded: true }, /the posted disc changed 1 time\(s\) while the profile held \(last disc 40\), and the profile is sized on one disc/],
      ["a limit increase", d([30, 58, 58, 58, 58, 58, 58, 58, 68], (i) => ({ postedKmh: i < 8 ? 50 : 60 })), { driveEnded: true }, /the posted disc changed 1 time\(s\) while the profile held \(last disc 60\)/],
      ["already in the band at the first reading", d(Array(10).fill(58)), { driveEnded: true }, /the first flat reading \(58 км\/ч\) was not certainly below the band's floor 55 by the dial's 0\.5 км\/ч rounding/],
      ["the first tick unread", d([-1, 30, 58, 58, 58, 58, 58, 58, 58]), { driveEnded: true }, /the first flat reading \(UNREAD км\/ч\) was not certainly below the band's floor 55/],
      // ROUND 7 — the disc unread after its first reading (OBS-DISC-UNREAD, the verifier's P7).
      ["the disc unread after its first reading", d([30, 58, 58, 58, 58, 58, 58, 58, 58], (i) => ({ postedKmh: i < 3 ? 50 : null })), { driveEnded: true }, /the posted disc was unread on 6 of 9 flat tick\(s\) \(6 of them after its first reading\), and the profile is sized on one disc read on every tick/],
      // ROUND 7 — the end gap longer than any flat interval (OBS-END-GAP-AND-INTERVAL, the verifier's P3).
      ["an end gap past every flat interval", [state, now - FLAT_TICK_MS + 1500], { driveEnded: true }, /the last flat reading was taken 1500 ms of wall clock before the finish's clock, and the longest wall interval between two flat readings was 516 ms/],
    ];
    for (const [label, [st, at], opt, re] of cases) {
      const f = wrongLegProfileFinish(st, { now: at, t0: 10_000, ...opt }).state;
      assert.equal(f.heldAsSized, false, label);
      assert.equal(f.done, "ended", label);
      assert.match(R(f.observed), re, label);
      const line = wrongLegProfileOutcomeLine(f);
      assertNotHeldLine(line, label);
      assert.ok(line.includes(`${SIZING_LABEL}: band over a disc D = `), `${label}: the sizing is not on the line`);
      assert.match(line, opt.driveEnded ? / · the drive reached its end screen\. / : / · the drive did NOT reach its end screen\. /, label);
    }
  });

  it("finishOpenSizing is the sizing, one target each — the disc read on EVERY tick and the end gap inside the longest interval among them", () => {
    const f = {
      gradedAboveKmh: 55, dangerousAboveKmh: 60, postedKmh: 50, limitChanges: 0, firstSeen: true, firstKmh: 8, discReadTicks: 20, discUnreadBefore: 0, discUnreadAfter: 0,
      lastInBand: true, lastKmh: 58, inBandSec: 4, sizedInBandSec: 3, minorSustainSec: 2, regradeSec: 6, sizedWindowSec: 8, possibleSec: 6, finalMs: 400,
    };
    const opt = { active: true, driveEnded: true, maxWallMs: 520 };
    const ok = (over, o = opt) => finishOpenSizing({ ...f, ...over }, o).held;
    assert.deepEqual(finishOpenSizing(f, opt), { held: true, unmet: [] });
    assert.equal(ok({}, { ...opt, active: false }), false);
    assert.equal(ok({}, { ...opt, driveEnded: false }), false);
    assert.equal(ok({ inBandSec: 2.99 }), false);
    assert.equal(ok({ inBandSec: 3 }), true);
    assert.equal(ok({ inBandSec: 7.5, possibleSec: 7.9 }), true);
    assert.equal(ok({ possibleSec: 7.99 }), true);
    assert.equal(ok({ possibleSec: 8 }), false);
    assert.equal(ok({ limitChanges: 1 }), false);
    assert.equal(ok({ firstKmh: 54 }), true);
    assert.equal(ok({ firstKmh: 55 }), false);
    assert.equal(ok({ firstKmh: null }), false);
    assert.equal(ok({ firstSeen: false }), false);
    assert.equal(ok({ lastInBand: false }), false);
    assert.equal(ok({ gradedAboveKmh: null }), false);
    // ROUND 7: ONE unread disc tick, before or after the first reading, is unmet.
    assert.equal(ok({ discUnreadAfter: 1 }), false);
    assert.equal(ok({ discUnreadBefore: 1 }), false);
    // ROUND 7: the end gap — inside the longest wall interval (equal is inside), and never unknown.
    assert.equal(ok({ finalMs: 520 }), true);
    assert.equal(ok({ finalMs: 521 }), false);
    assert.equal(ok({ finalMs: null }), false);
    assert.equal(ok({}, { ...opt, maxWallMs: null }), false);
    assert.equal(finishOpenSizing(null).held, false);
    // Every unmet reason is a template, and says only what was read.
    const all = finishOpenSizing({ ...f, inBandSec: 0, possibleSec: 99, limitChanges: 2, firstKmh: 57, lastInBand: false, lastKmh: 61, discUnreadAfter: 3, finalMs: 9000 }, {}).unmet;
    assert.equal(all.length, 9);
    for (const u of all) {
      assert.ok(u.tpl.startsWith("unmet."), u.tpl);
      assert.deepEqual(vocabularyViolations(R(u)), [], R(u));
    }
  });

  it("THE POSSIBLE-IN-BAND TALLY, rule by rule: wall time, credited unless both readings are certainly outside on one side, never reset, no step cap", () => {
    const LAG = dialLagAllowanceMs("pc", D("DASHBOARD_POLL_MS"));
    const T = (runMs) => Math.min(runMs, LAG) / 1000;
    const step = (st, now, kmh, dtMs = 500, postedKmh = 50) => wrongLegFlatStep(st, { now, t0: 0, kmh, flatStepM: 5, dtMs, postedKmh, probeAt: now }).state;
    const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} ≠ ${b}`);
    let s = step(make("sc-signal-flashing"), 1000, 54);
    assert.equal(s.finish.possibleSec, 0);
    assert.equal(s.finish.uncreditedMs, 500);
    assert.equal(step(make("sc-signal-flashing"), 1000, 55).finish.possibleSec, 0.5);
    for (const edge of [55, 60]) {
      let e = step(make("sc-signal-flashing"), 1000, edge);
      e = step(e, 1500, edge);
      assert.equal(e.finish.possibleSec, 1, `an interval between two readings of ${edge} was called certainly outside the band`);
    }
    s = step(s, 1500, 54);
    assert.equal(s.finish.possibleSec, 0);
    s = step(s, 2400, 61, 100);
    near(s.finish.possibleSec, 0.9 + T(1000), "wall, not the harness's dtMs");
    s = step(s, 3000, 61);
    near(s.finish.possibleSec, 0.9 + T(1000), "61 → 61");
    s = step(s, 3500, 58);
    near(s.finish.possibleSec, 1.4 + T(1000) + T(600), "61 → 58");
    s = step(s, 4000, 58);
    s = step(s, 4500, 50);
    assert.equal(s.finish.inBandSec, 0);
    near(s.finish.possibleSec, 2.4 + T(1000) + T(600), "the possible-in-band tally was reset");
    s = step(s, 5000, -1);
    near(s.finish.possibleSec, 2.9 + T(1000) + T(600), "unread");
    s = step(s, 35_000, 58, 30_000);
    near(s.finish.possibleSec, 32.9 + T(1000) + T(600), "a stalled interval was clamped");
    let n = step(make("sc-signal-flashing"), 1000, 20, 500, null);
    n = step(n, 1500, 20, 500, null);
    assert.equal(n.finish.possibleSec, 1);
    const f = wrongLegProfileFinish(s, { now: 35_700, t0: 0, driveEnded: true }).state;
    assert.equal(f.finish.finalMs, 700);
    near(f.finish.possibleSec, 33.6 + T(1000) + T(600), "finish");
    near(f.finish.ageCreditSec, T(1000) + T(600), "the reading-age allowance is tallied apart");
  });

  it("N-REGRADE-STALE: a reading is OLDER than its `now` — the interval that ends an uncredited run is credited back by the closing reading's AGE BOUND, capped at the run", () => {
    assert.equal(dialLagAllowanceMs("pc", 100), 100 + DIAL_FRAME_ALLOWANCE_MS + DIAL_LONG_FRAME_ALLOWANCE_MS.pc);
    assert.equal(dialLagAllowanceMs("mobile", 100), 100 + DIAL_FRAME_ALLOWANCE_MS + DIAL_LONG_FRAME_ALLOWANCE_MS.mobile);
    assert.equal(dialLagAllowanceMs("tablet", 100), 100 + DIAL_FRAME_ALLOWANCE_MS + Math.max(...Object.values(DIAL_LONG_FRAME_ALLOWANCE_MS)));
    assert.equal(dialLagAllowanceMs(null, 100), dialLagAllowanceMs("tablet", 100));
    assert.equal(dialLagAllowanceMs("pc", null), null);
    for (const lf of Object.values(DIAL_LONG_FRAME_ALLOWANCE_MS)) assert.ok(lf <= PHYSICS_MAX_FRAME_MS);
    assert.deepEqual({ ...DIAL_LONG_FRAME_ALLOWANCE_MS }, { pc: 100, mobile: 0 });
    assert.equal(DIAL_FRAME_ALLOWANCE_MS, 100);
    const LAG = dialLagAllowanceMs("pc", D("DASHBOARD_POLL_MS"));
    assert.equal(make("sc-signal-flashing").finish.dialLagMs, LAG);
    assert.equal(make("sc-signal-flashing", { platform: "mobile" }).finish.dialLagMs, dialLagAllowanceMs("mobile", D("DASHBOARD_POLL_MS")));
    const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} ≠ ${b}`);
    const run = (ticks, over = {}) => {
      let st = make("sc-signal-flashing", over);
      for (const t of ticks) st = wrongLegFlatStep(st, { t0: 0, flatStepM: 5, postedKmh: 50, dtMs: 500, ...t }).state;
      return st;
    };
    const entry = run([{ now: 1000, kmh: 50, probeAt: 1000 }, { now: 1500, kmh: 53, probeAt: 1500 }, { now: 2000, kmh: 54, probeAt: 1920 }, { now: 2500, kmh: 57, probeAt: 2500 }]);
    near(entry.finish.possibleSec, 0.5 + (80 + LAG) / 1000, "the entry interval + the 54's age bound");
    near(entry.finish.ageCreditSec, (80 + LAG) / 1000, "reading-age tally");
    assert.equal(entry.finish.uncreditedMs, 0);
    const fresh = run([{ now: 1000, kmh: 50, probeAt: 1000 }, { now: 1500, kmh: 53, probeAt: 1500 }, { now: 2000, kmh: 54, probeAt: 2000 }, { now: 2500, kmh: 57, probeAt: 2500 }]);
    near(fresh.finish.possibleSec, 0.5 + LAG / 1000, "fresh");
    const short = run([{ now: 1000, kmh: 57, probeAt: 1000 }, { now: 1150, kmh: 54, probeAt: 1150 }, { now: 1300, kmh: 54, probeAt: 1300 }, { now: 1800, kmh: 57, probeAt: 1800 }]);
    near(short.finish.possibleSec, 0.5 + 0.15 + 0.5 + Math.min(150, LAG) / 1000, "capped at the run");
    const noRun = run([{ now: 1000, kmh: 57, probeAt: 1000 }, { now: 1500, kmh: 54, probeAt: 1500 }, { now: 2000, kmh: 57, probeAt: 2000 }]);
    near(noRun.finish.possibleSec, 1.5, "a tail was credited with no uncredited run before it");
    assert.equal(noRun.finish.ageCreditSec, 0);
    const above = run([{ now: 1000, kmh: 58, probeAt: 1000 }, { now: 1500, kmh: 61, probeAt: 1500 }, { now: 2000, kmh: 61, probeAt: 1990 }, { now: 2500, kmh: 59, probeAt: 2500 }]);
    near(above.finish.possibleSec, 0.5 + 0.5 + 0.5 + Math.min(500, 10 + LAG) / 1000, "re-entry from above");
    const mob = run([{ now: 1000, kmh: 50, probeAt: 1000 }, { now: 1500, kmh: 53, probeAt: 1500 }, { now: 2000, kmh: 54, probeAt: 1920 }, { now: 2500, kmh: 57, probeAt: 2500 }], { platform: "mobile" });
    near(mob.finish.possibleSec, 0.5 + Math.min(1500, 80 + dialLagAllowanceMs("mobile", 100)) / 1000, "mobile");
    for (const bad of [undefined, 2600]) {
      const un = run([{ now: 1000, kmh: 50 }, { now: 1500, kmh: 53 }, { now: 2000, kmh: 54, probeAt: bad, dtMs: 480 }, { now: 2500, kmh: 57 }]);
      near(un.finish.possibleSec, 0.5 + Math.min(1500, 480 + LAG) / 1000, `probeAt ${bad}`);
      assert.equal(un.finish.probeUnmeasured, 4, "a tick with no usable probeAt was not counted");
    }
    const blind = run([{ now: 1000, kmh: 50, probeAt: 1000 }, { now: 1500, kmh: 53, probeAt: 1500 }, { now: 2000, kmh: 54, dtMs: NaN }, { now: 2500, kmh: 57, probeAt: 2500 }]);
    near(blind.finish.possibleSec, 0.5 + 1.5, "an unknown age credited less than the whole run");
    const fin = run([{ now: 1000, kmh: 57, probeAt: 1000 }, { now: 1500, kmh: 54, probeAt: 1500 }, { now: 2000, kmh: 54, probeAt: 1900 }]);
    const ended = wrongLegProfileFinish(fin, { now: 2400, t0: 0, driveEnded: true }).state;
    near(ended.finish.possibleSec, 0.5 + 0.5 + 0.4 + Math.min(500, 100 + LAG) / 1000, "finish tail");
  });

  it("N13 / V3-03: the band FOLLOWS a disc change, down or up — and a drive across one is not held as sized", () => {
    const r = drive(make("sc-signal-flashing"), [30, 58, 58, 58, 58, 58, 58, 58, 58], (i) => ({ postedKmh: i < 7 ? 50 : 40 }));
    assert.deepEqual([r.state.finish.postedKmh, r.state.finish.gradedAboveKmh, r.state.finish.dangerousAboveKmh, r.state.finish.limitChanges], [40, 44, 50, 1]);
    assert.equal(r.state.finish.lastInBand, false, "the band did not follow the disc");
    const up = drive(make("sc-signal-flashing"), [30, 58, 58, 58, 58, 58, 58, 58, 68], (i) => ({ postedKmh: i < 8 ? 50 : 60 }));
    assert.deepEqual([up.state.finish.gradedAboveKmh, up.state.finish.lastInBand, up.state.finish.limitChanges], [65, true, 1]);
    const fu = wrongLegProfileFinish(up.state, { now: up.now, t0: 10_000, driveEnded: true }).state;
    assert.equal(fu.heldAsSized, false);
    assert.match(R(fu.observed), /posted disc changed 1 time\(s\) while the profile held \(last disc 60\)/);
    const r3 = drive(make("sc-signal-flashing"), [30, 58, 58, 58, 58, 58, 58, 58, 58]);
    assert.equal(wrongLegProfileFinish(r3.state, { now: r3.now, t0: 10_000, driveEnded: true }).state.heldAsSized, true, "the same drive with no change is held — so the change is what is unmet");
    assert.equal(r3.state.finish.limitChanges, 0);
    const back = drive(make("sc-signal-flashing"), [30, 58, 58, 58, 58, 58], (i) => ({ postedKmh: i === 3 ? 60 : 50 }));
    assert.deepEqual([back.state.finish.limitChanges, back.state.finish.gradedAboveKmh], [2, 55]);
  });

  /** A flat throttle on sxf-v1 in SIM time (verify/longsim.mjs), tabulated
   *  from 8 км/ч. A MODEL used to check how the tallies are BUILT. */
  const V_MODEL = [[0, 8], [0.88, 15], [1.57, 22], [2.07, 27], [2.78, 34], [3.1, 37], [3.9, 44], [4.52, 49], [4.92, 52], [5.35, 55], [5.55, 56], [5.85, 57], [6.38, 58], [6.98, 58.5], [8.5, 58.9], [1e9, 58.9]];
  const vAt = (t) => {
    for (let i = 1; i < V_MODEL.length; i++) {
      const [a, va] = V_MODEL[i - 1];
      const [b, vb] = V_MODEL[i];
      if (t <= b) return va + ((vb - va) * (t - a)) / (b - a);
    }
    return 58.9;
  };
  /** Drive the REAL §5 functions over a route of `endM` metres at a harness
   *  tick of `P` s, on a whole-millisecond clock (so the tick intervals are
   *  exact). The finish is the first millisecond the route is done — never
   *  later than the tick that did not come — as the harness's end detection
   *  lands inside the last tick. Returns the verdict and the MODEL's time in
   *  (55, 60]. */
  function routeRun(endM, P, { probeMs = 0, domAgeMs = 0 } = {}) {
    let st = make("sc-signal-flashing");
    const Pms = Math.round(P * 1000);
    let x = 0, ms = 0, model = 0, nextTick = 0, lastTick = 0;
    const DT = 0.001;
    const ageS = (probeMs + domAgeMs) / 1000;
    while (x < endM) {
      const t = ms / 1000;
      if (ms >= nextTick) {
        const dial = Math.round(vAt(Math.max(0, t - ageS)));
        st = wrongLegFlatStep(st, { now: ms, t0: 0, kmh: dial, flatStepM: (dial / 3.6) * ((ms - lastTick) / 1000), dtMs: ms - lastTick, postedKmh: 50, probeAt: ms - probeMs }).state;
        lastTick = ms;
        nextTick += Pms;
      }
      const v = vAt(t);
      if (v > 55 && v <= 60) model += DT;
      x += (v / 3.6) * DT;
      ms += 1;
    }
    const f = wrongLegProfileFinish(st, { now: ms, t0: 0, driveEnded: true }).state;
    return { f, model, inBandSec: st.finish.inBandSec };
  }

  it("the possible-in-band tally covers the MODEL's in-band time on 175–235 m, and the readings never read as held where the model left the sized window", () => {
    let pastWindow = 0, round2WouldHold = 0;
    for (const P of [0.45, 0.516, 0.8, 1.155]) {
      for (let endM = 175; endM <= 235; endM += 5) {
        const { f, model, inBandSec } = routeRun(endM, P);
        assert.ok(f.finish.possibleSec >= model, `P=${P} end=${endM}: possible ${f.finish.possibleSec.toFixed(2)} < model ${model.toFixed(2)}`);
        if (model >= 8) {
          pastWindow++;
          assert.equal(f.heldAsSized, false, `P=${P} end=${endM}: held as sized with the model past the window`);
          assert.match(R(f.observed), /the possible-in-band tally read \d+\.\d s, not under the sized 8 s/);
          if (inBandSec >= 3 && inBandSec < 7 && f.finish.lastInBand === true) round2WouldHold++;
        }
      }
    }
    assert.ok(pastWindow >= 40, `the fixture no longer reaches the window (${pastWindow} runs)`);
    assert.ok(round2WouldHold > 0, "the fixture no longer contains a drive round 2's in-band-only rule would have held");
  });

  it("…and on the archived route end (139–147 m) the readings still hold as sized at the archived ~0.5 s tick", () => {
    for (const P of [0.45, 0.516, 0.6]) {
      for (let endM = 139; endM <= 147; endM += 2) {
        const { f, model } = routeRun(endM, P);
        assert.ok(model < 8, `P=${P} end=${endM}: the model left the window on the short route (${model})`);
        assert.ok(f.finish.possibleSec >= model);
        assert.equal(f.heldAsSized, true, `P=${P} end=${endM}: ${R(f.observed)}`);
      }
    }
  });

  it("N-REGRADE-STALE on the model: readings up to the lag allowance OLD keep the tally over the model; older ones fall under it by at most the excess — the stated limit, executed", () => {
    const LAG = dialLagAllowanceMs("pc", D("DASHBOARD_POLL_MS"));
    let pastWindow = 0;
    for (const P of [0.45, 0.516, 0.8, 1.155]) {
      for (let endM = 165; endM <= 235; endM += 10) {
        for (const probeMs of [0, 120, 400]) {
          for (const domAgeMs of [0, LAG / 2, LAG]) {
            const { f, model } = routeRun(endM, P, { probeMs, domAgeMs });
            assert.ok(f.finish.possibleSec >= model - 1e-9, `P=${P} end=${endM} probe=${probeMs} dom=${domAgeMs}`);
            if (model >= 8) {
              pastWindow++;
              assert.equal(f.heldAsSized, false);
            }
          }
        }
      }
    }
    assert.ok(pastWindow >= 100, `the fixture no longer reaches the window (${pastWindow})`);
    const EXCESS = 400;
    let under = 0, worst = 0;
    for (const P of [0.45, 0.516, 0.8, 1.155]) {
      for (let endM = 165; endM <= 235; endM += 5) {
        const { f, model } = routeRun(endM, P, { probeMs: 50, domAgeMs: LAG + EXCESS });
        const gap = model - f.finish.possibleSec;
        if (gap > 1e-9) under++;
        if (gap > worst) worst = gap;
      }
    }
    assert.ok(under > 0, "no run fell under the model with readings past the allowance — the stated limit is not exercised");
    assert.ok(worst <= EXCESS / 1000 + 0.002, `the tally fell ${worst.toFixed(3)} s under the model — more than the ${EXCESS} ms excess`);
  });

  it("the two CEILINGS release it, loudly, ANTECEDENT NOT HELD AS SIZED — and a released profile is not held at the end either", () => {
    const st = make("sc-signal-flashing");
    const byClock = drive(st, Array(125).fill(52), () => ({ flatStepM: 1 }));
    const rel = byClock.steps.findIndex((s) => s.state.done === "clock");
    assert.equal(rel, 120, "the 60 s clock ceiling did not fire at 60 s");
    assert.equal(byClock.steps[rel].suppressRest, false);
    assert.equal(byClock.steps[rel].say.loud, true);
    // The ceiling tick releases the rest, so it is NOT a held tick (round 7): 120 held, then none.
    assert.deepEqual([byClock.steps[rel - 1].state.heldTicks, byClock.steps[rel].state.heldTicks, byClock.state.heldTicks], [rel, rel, rel]);
    assert.equal(byClock.steps[rel].say.line, "WRONG-LEG PROFILE no-careless-rest-to-the-finish: ANTECEDENT NOT HELD AS SIZED — OBSERVED: 60 s after the profile started reached its 60 s ceiling before the readings met the sizing; the ordinary cadence resumes.");
    assertNotHeldLine(byClock.steps[rel].say.line, "clock ceiling");
    assert.equal(byClock.steps[rel + 1].suppressRest, false);
    const byMetres = drive(st, Array(40).fill(58), () => ({ flatStepM: 11 }));
    assert.equal(byMetres.state.done, "metres");
    const exact = drive(make("sc-signal-flashing"), Array(12).fill(58), () => ({ flatStepM: 40 }));
    assert.equal(exact.steps.findIndex((s) => s.state.done === "metres"), 9, "the 400 m ceiling fired a tick late (or early)");
    assert.equal(exact.steps[9].state.odoM, 400);
    const f = wrongLegProfileFinish(byMetres.state, { now: 90_000, t0: 10_000, driveEnded: true }).state;
    assert.equal(f.heldAsSized, false, "a profile a ceiling released was held anyway");
    assert.equal(f.done, "metres");
    assert.match(R(f.observed), /400 m ceiling before the readings met the sizing$/);
    const early = drive(make("sc-signal-flashing"), Array(9).fill(58), () => ({ flatStepM: 50 }));
    assert.equal(early.state.done, "metres");
    const g = wrongLegProfileFinish(early.state, { now: 90_000, t0: 10_000, driveEnded: true }).state;
    assert.deepEqual([g.heldAsSized, g.done], [false, "metres"]);
  });
});

// ---------------------------------------------------------------------------
describe("§W4 stint (sc-ov-keep-right) — ONE run past keepRightSustainSec", () => {
  it("holds every rest back until a moving run of 12 + 4 s, then lets the cadence rest — HELD AS SIZED, said as a reading", () => {
    const st = make("sc-ov-keep-right");
    assert.equal(st.stint.targetSec, 12 + STINT_MARGIN_SEC);
    const r = drive(st, Array(40).fill(40));
    const at = r.steps.findIndex((s) => s.state.heldAsSized);
    assert.equal(at, 31, "32 ticks × 0.5 s = 16 s");
    assert.ok(r.steps.slice(0, at).every((s) => s.suppressRest));
    assert.equal(r.steps[at].suppressRest, false);
    assert.ok(r.steps.slice(at + 1).every((s) => s.suppressRest === false && s.say === null), "the profile did not release after its run");
    const say = r.steps[at].say.line;
    assert.equal(say, "      WRONG-LEG PROFILE one-run-past-the-keep-right-sustain: ANTECEDENT HELD AS SIZED (stint) at t=16s — OBSERVED: one moving run of 16.0 s on the profile clock — every reading above movingSpeedKmh 5 км/ч, no rest held, no dip, 0 unread tick(s) inside it not credited — against the sized 16 s (keepRightSustainSec 12 + 4); which lane the car ran in is no profile input, and the harness's road witness, when it is on, records the lane the dev road probe publishes in _audit-road.json.gz");
    // (Round 9: the old «which lane the car ran in is not a harness reading» was false — the road witness records the
    // lane on a wrong leg; §W10 A checks the new sentence against the harness's code.)
    assert.ok(!/not a harness reading/.test(say));
    assertObservationLine(say, "stint held");
    const line = wrongLegProfileOutcomeLine(wrongLegProfileFinish(r.state, { now: r.now, t0: 10_000, driveEnded: true }).state);
    assertObservationLine(line, "stint outcome");
    assert.ok(line.includes(`${SIZING_LABEL}: one moving run sized to keepRightSustainSec 12 s + the harness's 4 s = 16 s; moving line movingSpeedKmh 5 км/ч.`), line);
  });

  it("a dip to movingSpeedKmh breaks the run and is counted ONCE per broken run — readings at the line with no run to break are not dips; a dial of −1 neither grows nor breaks it, and is counted", () => {
    const dip = drive(make("sc-ov-keep-right"), [...Array(20).fill(40), 5, ...Array(10).fill(40)]).state;
    assert.deepEqual([dip.stint.curSec, dip.stint.dips, dip.heldAsSized], [5, 1, false]);
    // (round 7, the verifier's V6-L8) — standing at the line before any run, and a second low reading after the break: still ONE dip.
    const low = drive(make("sc-ov-keep-right"), [3, 3, 3, ...Array(8).fill(40), 4, 2, 5, ...Array(6).fill(40), 1]).state;
    assert.equal(low.stint.dips, 2, "a reading at the line with no run to break was counted as a dip");
    assert.equal(low.stint.bestSec, 4);
    const blind = drive(make("sc-ov-keep-right"), [...Array(10).fill(40), -1, -1, ...Array(4).fill(40)]).state;
    assert.equal(blind.stint.curSec, 7);
    assert.deepEqual([blind.stint.unreadTicks, blind.stint.unreadInRun, blind.stint.unreadInBest], [2, 2, 2]);
    // An unread tick with no run going is counted, but not inside a run.
    const pre = drive(make("sc-ov-keep-right"), [-1, 40, 40, 40]).state;
    assert.deepEqual([pre.stint.unreadTicks, pre.stint.unreadInRun], [1, 0]);
  });

  it("OBS (round 7): unread ticks INSIDE the held run are printed on the held line — never a silent «every reading»", () => {
    const r = drive(make("sc-ov-keep-right"), [...Array(10).fill(40), -1, -1, ...Array(30).fill(40)]);
    const at = r.steps.findIndex((s) => s.state.heldAsSized);
    assert.match(r.steps[at].say.line, /one moving run of 16\.0 s on the profile clock — every reading above movingSpeedKmh 5 км\/ч, no rest held, no dip, 2 unread tick\(s\) inside it not credited/);
    const out = wrongLegProfileOutcomeLine(wrongLegProfileFinish(r.state, { now: r.now, t0: 10_000, driveEnded: true }).state);
    assert.match(out, /READINGS: best moving run 16\.0 s on the profile clock \(sized 16 s\) · 0 dip\(s\) to ≤ movingSpeedKmh · 2 unread tick\(s\), 2 of them inside the best run · /);
  });

  it("a stalled interval credits at most the per-frame cap", () => {
    let st = make("sc-ov-keep-right");
    st = wrongLegFlatStep(st, { now: 1, t0: 0, kmh: 40, flatStepM: 5, dtMs: 30_000 }).state;
    assert.equal(st.stint.curSec, PROFILE_STEP_CAP_MS / 1000);
  });

  it("with no dial the clock ceiling ends it, ANTECEDENT NOT HELD AS SIZED, with keepRightSustainSec 12 s in the sizing", () => {
    const r = drive(make("sc-ov-keep-right"), Array(125).fill(-1));
    assert.equal(r.state.done, "clock");
    const line = wrongLegProfileOutcomeLine(wrongLegProfileFinish(r.state, { now: 80_000, t0: 10_000, driveEnded: true }).state);
    assertNotHeldLine(line, "stint");
    assert.ok(line.includes(`${SIZING_LABEL}: one moving run sized to keepRightSustainSec 12 s`), line);
  });
});

// ---------------------------------------------------------------------------
const chip = (meters, heldSec) => ({ present: true, parsed: true, meters, heldSec, needSec: 2, short: true, label: "x" });

describe("§W5 lead-close (sc-ac-truck-spray)", () => {
  it("the chip's seconds inside the rain band for followRainSustainSec + 1 s → HELD AS SIZED (gap-rain), said as the chip's readings", () => {
    const st = make("sc-ac-truck-spray");
    assert.ok(Math.abs(st.lead.rainLineSec - 1.8 * 1.6 * 0.7) < 1e-9);
    assert.equal(st.lead.rainSustainSec, 3 + PROFILE_SUSTAIN_MARGIN_SEC);
    const r = drive(st, Array(12).fill(110), () => ({ follow: chip(58, 1.9) }));
    const at = r.steps.findIndex((s) => s.state.heldAsSized);
    assert.equal(at, 8);
    assert.equal(r.state.how, "gap-rain");
    const say = r.steps[at].say.line;
    assert.match(say, /ANTECEDENT HELD AS SIZED \(gap-rain\) at t=4s — OBSERVED: the chip's seconds read inside \[1\.26, 2\.016\) s \(by its 0\.05 s rounding\) on every reading of a 4\.0 s run on the profile clock, with the dial at ≥ followMinSpeedKmh 20 км\/ч by its 0\.5 км\/ч rounding and the chip's metres not opening, against the sized 4 s \(followRainSustainSec 3 \+ 1\); chip minimum 1\.9 с \/ 58 м$/);
    assertObservationLine(say, "gap-rain");
    const w61 = drive(make("sc-ac-truck-spray"), Array(12).fill(55), () => ({ follow: chip(47, 3.1) }));
    assert.equal(w61.state.heldAsSized, false);
    assert.ok(w61.steps.every((s) => s.suppressRest));
    assert.equal(w61.state.lead.underLessonRuleSec, 0);
  });

  it("under the base line for followSustainSec + 1 s → HELD AS SIZED (gap-base); the first qualifying tick credits nothing", () => {
    const st = make("sc-ac-truck-spray");
    assert.ok(Math.abs(st.lead.baseLineSec - 1.26) < 1e-9);
    const r = drive(st, Array(10).fill(130), () => ({ follow: chip(40, 1.1) }));
    assert.equal(r.steps.findIndex((s) => s.state.heldAsSized), 6);
    assert.equal(r.state.how, "gap-base");
    assertObservationLine(r.steps[6].say.line, "gap-base");
    assert.match(r.steps[6].say.line, /the chip's seconds read under 1\.26 s \(by its 0\.05 s rounding\) on every reading of a 3\.0 s run/);
  });

  it("a band EDGE at the chip's tenths is neither band: 2.0 may be 2.04 (outside the rain line), 1.3 may be 1.25 (the base band)", () => {
    for (const sec of [2.0, 1.3]) {
      const r = drive(make("sc-ac-truck-spray"), Array(14).fill(110), () => ({ follow: chip(58, sec) })).state;
      assert.equal(r.heldAsSized, false, `chip ${sec} counted as inside a band`);
      assert.equal(r.lead.edgeTicks, 14, `chip ${sec}`);
    }
    assert.equal(drive(make("sc-ac-truck-spray"), Array(12).fill(110), () => ({ follow: chip(58, 1.4) })).state.how, "gap-rain");
    assert.equal(drive(make("sc-ac-truck-spray"), Array(12).fill(110), () => ({ follow: chip(58, 1.2) })).state.how, "gap-base");
  });

  it("no lead on the chip → no rest is held back; a lead → it is", () => {
    const r = drive(make("sc-ac-truck-spray"), [60, 60, 60, 60], (i) => ({ follow: i < 2 ? null : chip(70, 3.5) }));
    assert.deepEqual(r.steps.map((s) => s.suppressRest), [false, false, true, true]);
  });

  it("F7: a steady gap FLICKERING by the chip's rounding (58 ↔ 59 m) is not opening; a single +1 m step is not either", () => {
    const r = drive(make("sc-ac-truck-spray"), Array(12).fill(110), (i) => ({ follow: chip(i % 2 ? 59 : 58, 1.9) }));
    assert.equal(r.state.lead.openingTicks, 0);
    assert.equal(r.state.how, "gap-rain");
    const step = drive(make("sc-ac-truck-spray"), Array(12).fill(110), (i) => ({ follow: chip(i < 5 ? 58 : 59, 1.9) }));
    assert.equal(step.state.lead.openingTicks, 0);
    assert.equal(step.state.how, "gap-rain");
  });

  it("F7: a GENUINE opening (2 m/s) is still opening, and the run cannot reach its sizing", () => {
    const r = drive(make("sc-ac-truck-spray"), Array(16).fill(110), (i) => ({ follow: chip(40 + i, 1.9) }));
    assert.ok(r.state.lead.openingTicks >= 13, `opening ${r.state.lead.openingTicks}`);
    assert.equal(r.state.heldAsSized, false);
    assert.ok(r.state.lead.rainBestSec <= 0.5, `best ${r.state.lead.rainBestSec}`);
    assert.equal(OPENING_WINDOW_MS, 2000);
  });

  it("F7: the window anchors on the profile clock and is emptied when the lead leaves the chip", () => {
    const st = drive(make("sc-ac-truck-spray"), [110, 110, 110, 110], (i) => ({ follow: i === 2 ? null : chip(58, 1.9) })).state;
    assert.deepEqual(st.lead.recent.map((q) => q.m), [58], "the window survived a tick with no lead");
    let s2 = make("sc-ac-truck-spray");
    s2 = wrongLegFlatStep(s2, { now: 1000, t0: 0, kmh: 110, flatStepM: 15, dtMs: 500, follow: chip(58, 1.9) }).state;
    s2 = wrongLegFlatStep(s2, { now: 31_000, t0: 0, kmh: 110, flatStepM: 15, dtMs: 500, follow: chip(60, 1.9) }).state;
    assert.equal(s2.lead.openingTicks, 1, "2 m over 0.5 s of un-paused time is opening; over 30 s of wall clock it would not be");
  });

  it("«fast enough» is at the DIAL's resolution: a dial under followMinSpeedKmh, or a whole-км/ч 20 (may be 19.6), is not counted; 21 is", () => {
    assert.equal(drive(make("sc-ac-truck-spray"), Array(12).fill(19), () => ({ follow: chip(5, 1.0) })).state.lead.baseBestSec, 0);
    const at20 = drive(make("sc-ac-truck-spray"), Array(12).fill(20), () => ({ follow: chip(5, 1.0) })).state;
    assert.equal(at20.lead.baseBestSec, 0, "a dial of 20 was counted as ≥ 20 км/ч");
    assert.equal(at20.heldAsSized, false);
    assert.equal(drive(make("sc-ac-truck-spray"), Array(12).fill(21), () => ({ follow: chip(5, 1.0) })).state.how, "gap-base");
  });

  it("N-CURTAIN: the chip's METRES alone hold nothing — the curtain route is WITHDRAWN, with its evidence, and cannot come back silently", () => {
    for (const m of [0, 10, 21, 22]) {
      const st = drive(make("sc-ac-truck-spray"), [100, 100, 100], () => ({ follow: chip(m, 3.5) })).state;
      assert.equal(st.heldAsSized, false, `chip ${m} м held something on its own`);
      assert.ok(st.lead.leadTicks === 3 && st.active === true, `chip ${m} м released the profile`);
    }
    const row = WRONG_LEG_PROFILES.get("sc-ac-truck-spray");
    assert.ok(!("curtain" in row), "the truck row carries a curtain flag again");
    assert.ok(!/SPRAY_NEAR_M|near line/.test(row.told), "the table still tells the leg about a spray line");
    assert.ok(!/curtainM|"curtain"/.test(SEC5.replace(/export const WITHDRAWN_PROFILE_ROUTES[\s\S]*?\n\]\);/, "")), "a curtain route is back in §5's code");
    const w = WITHDRAWN_PROFILE_ROUTES.get("sc-ac-truck-spray/curtain");
    assert.ok(w && Object.isFrozen(w));
    for (const n of ["eyeGapM", "COCKPIT_EYE z −0.255", "2.305 m behind the nose", "22.8–23.8 m", "chip ≤ 10 m", "58.2 m", "LEAD_CORRIDOR_M 4.0", "100 %", "dead-predicate"]) {
      assert.ok(w.why.includes(n), `the withdrawal reason lost «${n}»`);
    }
  });

  it("no task-cap route: a dial far over any cap holds nothing, and §5 reads no cap", () => {
    const t = drive(make("sc-ac-truck-spray"), [120, 140, 150, 160], () => ({ follow: chip(76, 2.5), taskCapKmh: 80 })).state;
    assert.equal(t.heldAsSized, false);
    assert.ok(!/taskCapKmh|capCounts|capKmh/.test(SEC5), "a cap route is still in §5");
  });

  it("an unparseable chip is counted and held for nothing", () => {
    const r = drive(make("sc-ac-truck-spray"), [80, 80], () => ({ follow: { present: true, parsed: false, meters: null, heldSec: null } }));
    assert.equal(r.state.lead.unparsedTicks, 2);
    assert.ok(r.steps.every((s) => s.suppressRest === false));
  });

  it("the distance ceiling releases it, ANTECEDENT NOT HELD AS SIZED, with the sustains in the sizing", () => {
    const r = drive(make("sc-ac-truck-spray"), Array(60).fill(110), () => ({ follow: chip(60, 2.5), flatStepM: 20 }));
    assert.equal(r.state.done, "metres");
    assert.match(R(r.state.observed), /1000 m ceiling before the readings met the sizing$/);
    const line = wrongLegProfileOutcomeLine(r.state);
    assertNotHeldLine(line, "truck ceiling");
    assert.match(line, /^WRONG-LEG PROFILE OUTCOME: close-on-the-truck-into-its-spray — ANTECEDENT NOT HELD AS SIZED \(metres\) — OBSERVED: \d+ m of flat after the profile started reached its 1000 m ceiling before the readings met the sizing · READINGS: /);
    assert.match(line, /runs sized to followSustainSec 2 s \/ followRainSustainSec 3 s \+ the harness's 1 s/);
  });
});

// ---------------------------------------------------------------------------
describe("§W6 zone-rest (sc-pk-busstop-ban) — dead reckoning to the middle of the зона", () => {
  const series = FLAT_SERIES;

  it("the state: a hold of 20 s drop-off + 6 s + the 8 s margin = 34 s, the sized hold 20 + 6 + 1 s; the CENSUS bands ride it", () => {
    const st = make("sc-pk-busstop-ban");
    assert.equal(st.on, true, R(st.refused) ?? "");
    assert.deepEqual([st.zone.thresholdSec, st.zone.regradeSec, st.zone.holdSec, st.zone.sizedHoldSec], [20, 6, 20 + 6 + ZONE_REST_MARGIN_SEC, 20 + 6 + PROFILE_SUSTAIN_MARGIN_SEC]);
    assert.ok(Math.abs(st.zone.aimM - 165) < 0.01);
    assert.ok(Math.abs(st.zone.decel - 11000 / 1220) < 1e-9);
    assert.deepEqual(
      [st.zone.ratioMin, st.zone.ratioMax, st.zone.creepM, st.zone.residualM, st.zone.reactMinS, st.zone.reactMaxS],
      [ODO_RATIO_MIN, ODO_RATIO_MAX, ZONE_REST_CREEP_M, ZONE_REST_RESIDUAL_M, ZONE_REST_REACT_MIN_S, ZONE_REST_REACT_MAX_S],
    );
    assert.equal(
      R(st.sizedFrom),
      `${ZONE_SIZING_LABEL}: drop-off busStopDropOffMaxSec 20 s for the law-bus-stop basis (banZoneStopRestSec 4 s for any other); BAN_ZONE_REST_REGRADE_SEC 6 s; ` +
        "hold = 20 + 6 + the harness's 8 s = 34 s; sized hold = 20 + 6 + 1 s = 27 s; rest line fullStopMaxSpeedKmh 1 км/ч, moving line movingSpeedKmh 5 км/ч; " +
        "deceleration BRAKE_FORCE_N 11000 N / CHASSIS_MASS 1220 kg = 9.02 m/s²",
    );
  });

  it("R-F9: the census numbers hold every census measurement they are sized from", () => {
    const ODO = { w41: 0.935, w42: 1.0, w43: 1.007, w45: 0.977, w46: 0.96, w47: 0.958, w51: 1.011, w52: 1.023, w61: 1.008, w62: 0.946, "canary-54c02a8-152043": 1.004, "canary-54c02a8-152435": 1.028 };
    for (const [w, r] of Object.entries(ODO)) assert.ok(r >= ODO_RATIO_MIN && r <= ODO_RATIO_MAX, `${w} ${r}`);
    assert.deepEqual([ODO_RATIO_MIN, ODO_RATIO_MAX], [0.911, 1.028]);
    for (const c of [1.75, 0.84, 0.93, 0.93, 0.96, 1.77, 2.01, 1.48, 1.46, 0.85, 1.88, 1.38]) assert.ok(c >= 0 && c <= ZONE_REST_CREEP_M, `creep ${c}`);
    assert.deepEqual([ZONE_REST_REACT_MIN_S, ZONE_REST_REACT_MAX_S], [0.48, 1.9]);
    for (const r of [0.83, 0.83, 0.85, 0.86, 0.86, 0.86, 0.86, 0.97, 1.12, 1.14, 1.32]) assert.ok(r >= ZONE_REST_REACT_MIN_S && r <= ZONE_REST_REACT_MAX_S, `busstop reaction ${r}`);
    const decel = 11000 / 1220;
    assert.ok(stopDistanceM(55, { reactS: ZONE_REST_REACT_MIN_S, decel }) <= 26.1);
    assert.ok(stopDistanceM(55, { reactS: ZONE_REST_REACT_MAX_S, decel }) >= 30.2);
    assert.equal(stopDistanceM(-1, { reactS: 1, decel: 9 }), null);
    assert.equal(stopDistanceM(50, { reactS: 1, decel: 0 }), null);
    assert.equal(stopDistanceM(50, { decel: 9 }), null, "a stop with no reaction given was computed anyway");
    assert.ok(!/MEASURED, NOT ASSUMED|MEASURED rather than|the measured ratio|narrowest band around the model/.test(SEC5_RAW), "§5 still calls a census band a measured bound");
  });

  it("R-F9: the zone profile REFUSES every platform its census does not cover — pc only", () => {
    assert.deepEqual([...ZONE_REST_PLATFORMS], ["pc"]);
    for (const platform of ["mobile", null, "tablet"]) {
      const st = createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: SPAN, platform });
      assert.deepEqual([st.declared, st.on], [true, false], `${platform}: ran on a platform with no odometer census`);
      // (round 10: the band names the population it is sized on — FALSE-SELF-STATEMENT-REFUSAL-SIZING)
      assert.match(R(st.refused), /the dead reckoning's census odometer ratio 0\.911–1\.028, sized on a census of 12 of this lesson's archived pc wrong legs \(0\.935–1\.028\) with its low end widened to 0\.911, the reading of a sc-signal-flashing mobile wrong leg; this leg is «(?:mobile|unknown|tablet)», and in the harness's odometer census of 328 archived wrong legs/);
      assert.ok(!/archived pc legs only/.test(R(st.refused)), "round 9's false sizing sentence is back");
      const r = wrongLegFlatStep(st, { now: 1, t0: 0, kmh: 59, flatStepM: 8, dtMs: 500 });
      assert.deepEqual([r.suppressRest, r.forceRest], [false, false], "a refused zone profile still changes the cadence");
      assertNotHeldLine(wrongLegProfileOutcomeLine(st), `refused on ${platform}`);
    }
    for (const id of ["sc-signal-flashing", "sc-ov-keep-right", "sc-ac-truck-spray"]) {
      assert.equal(createWrongLegProfile(id, { platform: "mobile" }).on, true, id);
    }
  });

  it("zoneRestInterval: the odometer over the census ratio, the stop over the census reaction band, and the creep on the far end only", () => {
    const decel = 11000 / 1220;
    const iv = zoneRestInterval(100, 59, { decel });
    const v = 59 / 3.6;
    const brake = (v * v) / (2 * decel);
    assert.ok(Math.abs(iv.lo - (100 / ODO_RATIO_MAX + v * ZONE_REST_REACT_MIN_S + brake)) < 1e-9);
    assert.ok(Math.abs(iv.hi - (100 / ODO_RATIO_MIN + ZONE_REST_CREEP_M + v * ZONE_REST_REACT_MAX_S + brake)) < 1e-9);
    assert.ok(Math.abs(iv.mid - (iv.lo + iv.hi) / 2) < 1e-12);
    assert.equal(zoneRestInterval(100, -1, { decel }), null);
    assert.equal(zoneRestInterval(NaN, 50, { decel }), null);
  });

  it("holds every rest back, then books EXACTLY ONE rest on the tick whose interval's middle reaches the aim — the braking line prints the harness's estimate as intervals, with the braking model it assumes", () => {
    const r = drive(make("sc-pk-busstop-ban"), series, () => ({}), FLAT_TICK_MS);
    const at = r.steps.findIndex((s) => s.forceRest);
    assert.ok(at > 0, "no rest was ever booked");
    assert.ok(r.steps.slice(0, at).every((s) => s.suppressRest && !s.forceRest), "a default rest could fall before the zone");
    assert.equal(r.steps.filter((s) => s.forceRest).length, 1);
    const dec = r.state.zone.decision;
    assert.equal(dec.kmh, 59);
    assert.equal(dec.inside, true, JSON.stringify(dec));
    assert.ok(dec.restLoM >= SPAN.fromM + ZONE_REST_RESIDUAL_M && dec.restHiM <= SPAN.toM - ZONE_REST_RESIDUAL_M, JSON.stringify(dec));
    const halfTickM = (59 / 3.6) * (FLAT_TICK_MS / 1000);
    assert.ok(Math.abs((dec.restLoM + dec.restHiM) / 2 - 165) <= halfTickM + 0.1, `middle ${(dec.restLoM + dec.restHiM) / 2}`);
    assert.equal(r.state.zone.phase, "braking");
    assert.equal(zoneRestEngaged(r.state), true);
    assert.equal(resumeThrottleAfterPause(r.state), false, "a pause mid-brake would re-press the throttle");
    const odo = r.steps[at].state.odoM;
    assert.equal(dec.odoM, Number(odo.toFixed(1)));
    assert.equal(dec.trueLoM, Number((odo / ODO_RATIO_MAX).toFixed(1)));
    assert.equal(dec.trueHiM, Number((odo / ODO_RATIO_MIN + ZONE_REST_CREEP_M).toFixed(1)));
    const iv = zoneRestInterval(odo, 59, { decel: 11000 / 1220 });
    assert.deepEqual([dec.restLoM, dec.restHiM, dec.nearStopM, dec.farStopM], [iv.lo, iv.hi, iv.nearStopM, iv.farStopM].map((x) => Number(x.toFixed(1))));
    const say = r.steps[at].say.line;
    // (round 10: each census band names the population it is sized on)
    assert.ok(say.includes(`flat odometer ${dec.odoM} m → true path ${dec.trueLoM}–${dec.trueHiM} m (census odometer ratio 0.911–1.028, sized on a census of 12 of this lesson's archived pc wrong legs (0.935–1.028) with its low end widened to 0.911, the reading of a sc-signal-flashing mobile wrong leg; creep up to 2.1 m, over the same 12 legs' 0.84–2.01 m)`), say);
    assert.ok(say.includes(`+ a stop of ${dec.nearStopM}–${dec.farStopM} m at 59 км/ч (census reaction 0.48–1.9 s, from percentile 5 to the maximum of a census of 322 flat to flat-rest transitions on archived wrong legs; ${zoneBrakingModel(11000 / 1220)})`), say);
    assert.ok(say.includes(`→ rest estimated at [${dec.restLoM}, ${dec.restHiM}] m of route against the authored span [135.0, 195.0] m (inside, ≥ 5 m from both edges)`), say);
    assert.match(say, /HARNESS ESTIMATE \(dead reckoning over the census bands named here, each with the population it is sized on; not a measured position\)/);
    // ROUND 8 (the verifier's RESIDUAL-PRODUCT-CLAIM): the model names what the MODEL holds — design constants,
    // sized at 4112566 — and no product physics structure (no gripFactor, wetGrip, snowGrip, surface patches).
    assert.equal(zoneBrakingModel(9.016), "braking model v²/(2 × 9.02 m/s²), BRAKE_FORCE_N / CHASSIS_MASS (design constants sized at 4112566): the whole brake force at the road on a level surface at grip 1, with no lower grip, no slope and no front/rear split in the model");
    assert.ok(!/gripFactor|wetGrip|snowGrip|physics|patches|template's/.test(zoneBrakingModel(9.016)));
    assert.match(zoneBrakingModel(NaN), /^braking model v²\/\(2 × \? m\/s²\)/);
    assertObservationLine(say, "zone braking");
  });

  it("N03: the decision ANTICIPATES by half a tick", () => {
    const decel = 11000 / 1220;
    const P = FLAT_TICK_MS;
    const stepM = (59 / 3.6) * (P / 1000);
    const half = stepM / 2;
    const midAt = (odo) => zoneRestInterval(odo, 59, { decel }).mid;
    let found = null;
    for (let off = 0; off < stepM && found === null; off += 0.25) {
      for (let k = 0; k < 40; k++) {
        const odo = off + k * stepM;
        if (midAt(odo) + half >= SPAN.fromM + (SPAN.toM - SPAN.fromM) / 2) {
          if (midAt(odo) < 165) found = { off, k };
          break;
        }
      }
    }
    assert.ok(found, "no fixture puts the anticipating tick short of the aim");
    const r = drive(make("sc-pk-busstop-ban"), Array(found.k + 3).fill(59), (i) => ({ flatStepM: i === 0 ? found.off : stepM }), P);
    assert.equal(r.steps.findIndex((s) => s.forceRest), found.k);
  });

  it("N04: the residual guards EACH edge on its own", () => {
    const at = (aimM) => {
      const st = make("sc-pk-busstop-ban");
      st.zone.aimM = aimM;
      return drive(st, FLAT_SERIES, () => ({}), FLAT_TICK_MS).state.zone.decision;
    };
    const { fromM, toM } = SPAN;
    let far = null, near = null, both = null;
    for (let aim = 150; aim <= 180; aim += 0.25) {
      const d = at(aim);
      if (!d) continue;
      if (far === null && d.restLoM >= fromM + 5 + 0.1 && d.restHiM > toM - 5 + 0.1 && d.restHiM <= toM) far = d;
      if (near === null && d.restLoM < fromM + 5 - 0.1 && d.restLoM >= fromM && d.restHiM <= toM - 5 - 0.1) near = d;
      if (both === null && d.restLoM >= fromM + 5 + 0.1 && d.restHiM <= toM - 5 - 0.1) both = d;
    }
    assert.ok(far && near && both);
    assert.equal(far.inside, false);
    assert.equal(near.inside, false);
    assert.equal(both.inside, true);
  });

  it("N05: MISSED means the odometer is CERTAINLY past the far edge", () => {
    const { toM } = SPAN;
    const between = toM * (ODO_RATIO_MIN + ODO_RATIO_MAX) / 2;
    const r = drive(make("sc-pk-busstop-ban"), [1, 1], (i) => ({ flatStepM: i === 0 ? between : 0 }));
    assert.equal(r.state.done, null);
    const past = drive(make("sc-pk-busstop-ban"), [1, 1], (i) => ({ flatStepM: i === 0 ? toM * ODO_RATIO_MAX + 0.5 : 0 }));
    assert.equal(past.state.done, "missed");
  });

  it("F9: an UNREAD dial on the approach is REFUSED, loudly", () => {
    const r = drive(make("sc-pk-busstop-ban"), [...series.slice(0, 10), -1, ...series.slice(10)], () => ({}), FLAT_TICK_MS);
    const blind = r.steps[10];
    assert.equal(blind.state.done, "blind");
    assert.equal(blind.say.loud, true);
    assert.equal(blind.suppressRest, false);
    assert.match(blind.say.line, /^WRONG-LEG PROFILE come-to-rest-inside-the-bus-stop-zone: ANTECEDENT NOT HELD AS SIZED — OBSERVED: the dial was unreadable on the approach at t=5s with the flat odometer at .* m — the dead reckoning has a gap of unknown length from here, and no rest was booked from it; the ordinary cadence resumes\.$/);
    assertNotHeldLine(blind.say.line, "blind say");
    assert.equal(r.steps.filter((s) => s.forceRest).length, 0);
    assert.ok(r.steps.slice(11).every((s) => s.suppressRest === false && s.say === null));
    assertNotHeldLine(wrongLegProfileOutcomeLine(wrongLegProfileFinish(r.state, { now: 90_000, t0: 10_000, driveEnded: true }).state), "blind");
  });

  it("the hold is a CONTINUOUS rest on the dial: it grows only at ≤ fullStopMaxSpeedKmh; a stir or a break zeroes it; −1 is no reading", () => {
    let st = drive(make("sc-pk-busstop-ban"), series, () => ({}), FLAT_TICK_MS).state;
    const b = wrongLegRestBooked(st, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh: 0 });
    assert.deepEqual([b.zone, b.holdMs], [true, 34_000]);
    st = b.state;
    assert.equal(resumeThrottleAfterPause(st), false);
    for (let i = 0; i < 20; i++) st = wrongLegRestTick(st, { kmh: 0, dtMs: 500 });
    assert.equal(st.zone.heldMs, 10_000, "the booking tick read 0, so the first tick after it credits");
    st = wrongLegRestTick(st, { kmh: 3, dtMs: 500 });
    assert.deepEqual([st.zone.heldMs, st.zone.stirs, st.zone.breaks], [0, 1, 0]);
    st = wrongLegRestTick(st, { kmh: 0, dtMs: 500 });
    assert.equal(st.zone.heldMs, 0, "the first at-rest tick after a stir credited the interval it stirred in");
    st = wrongLegRestTick(st, { kmh: 6, dtMs: 500 });
    assert.deepEqual([st.zone.heldMs, st.zone.breaks], [0, 1]);
    st = wrongLegRestTick(st, { kmh: 0, dtMs: 500 });
    st = wrongLegRestTick(st, { kmh: -1, dtMs: 500 });
    assert.deepEqual([st.zone.heldMs, st.zone.unreadTicks], [0, 1]);
    st = wrongLegRestTick(st, { kmh: 0, dtMs: 30_000 });
    assert.equal(st.zone.heldMs, PROFILE_STEP_CAP_MS);
    for (let i = 0; i < 63; i++) st = wrongLegRestTick(st, { kmh: 0, dtMs: 500 });
    assert.equal(flatRestHoldDone({ now: 60_000, restAt: 50_000, holdMs: HOLD_MS, state: st }), false, "33.5 s is not 34 s");
    st = wrongLegRestTick(st, { kmh: 1, dtMs: 500 });
    assert.equal(flatRestHoldDone({ now: 60_000, restAt: 50_000, holdMs: HOLD_MS, state: st }), true);
    const e = wrongLegRestEnded(st, { now: 90_000, t0: 10_000 });
    assert.equal(e.state.heldAsSized, true);
    assert.equal(e.state.how, "zone-rest");
    assert.equal(resumeThrottleAfterPause(e.state), true);
    const line = wrongLegProfileOutcomeLine(e.state);
    assert.match(line, /^WRONG-LEG PROFILE OUTCOME: come-to-rest-inside-the-bus-stop-zone — ANTECEDENT HELD AS SIZED \(zone-rest\) at t=80s — OBSERVED: the dial read ≤ fullStopMaxSpeedKmh 1 км\/ч continuously for 34\.0 s on the profile clock \(1 stir\(s\), 1 break\(s\), 1 unread tick\(s\) not credited\), against the sized 27 s; braking was booked at t=\d+s at 59 км\/ч/);
    assert.match(line, /inside the authored law-bus-stop span \[135\.0, 195\.0\] m by ≥ 5 m/);
    assertObservationLine(line, "zone held");
    assertObservationLine(e.say.line, "zone held say");
  });

  it("P5 (round 7): the continuous rest starts from the booking tick only when THAT reading is at the full-stop line — a booking at a dial over it credits nothing from it", () => {
    const base = drive(make("sc-pk-busstop-ban"), series, () => ({}), FLAT_TICK_MS).state;
    const at = (kmh) => {
      let st = wrongLegRestBooked(base, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh }).state;
      st = wrongLegRestTick(st, { kmh: 0, dtMs: 500 });
      return st.zone.heldMs;
    };
    assert.equal(at(0), 500);
    assert.equal(at(D("fullStopMaxSpeedKmh")), 500);
    assert.equal(at(D("fullStopMaxSpeedKmh") + 1), 0, "a booking reading over the full-stop line was credited as at rest");
    assert.equal(at(null), 0, "an unread booking reading was credited as at rest");
    assert.equal(at(-1), 0);
  });

  it("the w61 rest itself: 8 s inside the zone is not the sized 27 s — ANTECEDENT NOT HELD AS SIZED, said as the dial's reading", () => {
    let st = drive(make("sc-pk-busstop-ban"), series, () => ({}), FLAT_TICK_MS).state;
    st = wrongLegRestBooked(st, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh: 0 }).state;
    for (let i = 0; i < 16; i++) st = wrongLegRestTick(st, { kmh: 0, dtMs: 500 });
    assert.equal(flatRestHoldDone({ now: 50_000 + ZONE_REST_WALL_CEILING_MS, restAt: 50_000, holdMs: HOLD_MS, state: st }), true, "the wall ceiling must end a hold that cannot finish");
    const e = wrongLegRestEnded(st, { now: 150_000, t0: 10_000 });
    assert.deepEqual([e.state.heldAsSized, e.state.done, e.say.loud], [false, "short-hold", true]);
    assert.equal(R(e.state.observed), "the dial read ≤ fullStopMaxSpeedKmh 1 км/ч continuously for 8.0 s on the profile clock (0 stir(s), 0 break(s), 0 unread tick(s) not credited), against the sized 27 s");
    assert.equal(e.say.line, `WRONG-LEG PROFILE come-to-rest-inside-the-bus-stop-zone: ANTECEDENT NOT HELD AS SIZED — OBSERVED: ${R(e.state.observed)}.`);
    assertNotHeldLine(wrongLegProfileOutcomeLine(e.state), "short-hold");
  });

  it("N07: the sized hold is 20 + 6 + 1 s — 27.0 s held is HELD AS SIZED, 26.5 s is not, and a 30 s hold cut short still counts", () => {
    const held = (n) => {
      let st = drive(make("sc-pk-busstop-ban"), FLAT_SERIES, () => ({}), FLAT_TICK_MS).state;
      st = wrongLegRestBooked(st, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh: 0 }).state;
      for (let i = 0; i < n; i++) st = wrongLegRestTick(st, { kmh: 0, dtMs: 500 });
      return wrongLegRestEnded(st, { now: 150_000, t0: 10_000 }).state;
    };
    assert.equal(held(54).zone.heldMs, 27_000);
    assert.deepEqual([held(54).heldAsSized, held(54).done], [true, "held-as-sized"]);
    assert.deepEqual([held(53).heldAsSized, held(53).done], [false, "short-hold"]);
    assert.equal(held(60).heldAsSized, true);
  });

  it("F9: a zone the interval cannot fit in is reported «not placed inside» — never «outside»", () => {
    const narrow = { ...SPAN, fromM: 135, toM: 150 };
    let st = drive(createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: narrow, platform: "pc" }), series, () => ({}), FLAT_TICK_MS).state;
    assert.equal(st.zone.decision.inside, false);
    st = wrongLegRestBooked(st, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh: 0 }).state;
    for (let i = 0; i < 70; i++) st = wrongLegRestTick(st, { kmh: 0, dtMs: 500 });
    const e = wrongLegRestEnded(st, { now: 90_000, t0: 10_000 });
    assert.deepEqual([e.state.heldAsSized, e.state.done], [false, "unverified-place"]);
    assert.match(R(e.state.observed), /— not inside the authored span \[135\.0, 150\.0\] m by 5 m, and the harness's dead reckoning did not place the car inside it$/);
    const line = wrongLegProfileOutcomeLine(e.state);
    assertNotHeldLine(line, "unverified place");
    assert.ok(!/\boutside\b/.test(line), `the line asserts a place the leg never showed — ${line}`);
  });

  it("a brake that never brings the car to rest is ANTECEDENT NOT HELD AS SIZED (no-rest)", () => {
    const st = drive(make("sc-pk-busstop-ban"), series, () => ({}), FLAT_TICK_MS).state;
    const e = wrongLegRestEnded(st, { now: 70_000, t0: 10_000, gaveUp: true });
    assert.deepEqual([e.state.done, e.say.loud], ["no-rest", true]);
    // (round 10, IMPRECISE-SELF-STATEMENTS d: the harness BOOKED braking; whether a flat-rest tick pressed the brake is
    // not this function's to say, and the harness gave the rest up)
    assert.match(R(e.state.observed), /^braking was booked for the zone rest, and no flat-rest tick after it read the dial at 0–1 км\/ч before the harness gave the rest up — the car was not seen at rest on the dial; braking was booked at t=\d+s/);
    assertNotHeldLine(e.say.line, "no-rest");
  });

  it("the drive ending mid-hold closes it, and only a hold past the sizing counts", () => {
    let st = drive(make("sc-pk-busstop-ban"), series, () => ({}), FLAT_TICK_MS).state;
    st = wrongLegRestBooked(st, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh: 0 }).state;
    for (let i = 0; i < 30; i++) st = wrongLegRestTick(st, { kmh: 0, dtMs: 500 });
    const f = wrongLegProfileFinish(st, { now: 70_000, t0: 10_000, driveEnded: true }).state;
    assert.deepEqual([f.heldAsSized, f.done], [false, "ended"]);
    assert.match(R(f.observed), /^the drive ended mid-hold — the dial read ≤ fullStopMaxSpeedKmh 1 км\/ч continuously for 15\.0 s/);
    assertNotHeldLine(wrongLegProfileOutcomeLine(f), "mid-hold");
  });

  it("an odometer certainly past the far edge with no decision is MISSED, loudly, and the cadence resumes", () => {
    const r = drive(make("sc-pk-busstop-ban"), [1, 1, 30], (i) => ({ flatStepM: i < 2 ? 110 : 1 }));
    assert.equal(r.state.done, "missed");
    assert.equal(r.steps[1].say.loud, true);
    assertNotHeldLine(r.steps[1].say.line, "missed");
    assert.match(r.steps[1].say.line, /OBSERVED: the flat odometer read 220\.0 m \(at least 214\.0 m of true path by the census odometer ratio's high end 1\.028, the highest of a census of 12 of this lesson's archived pc wrong legs\) — past the far edge of the zone \(195\.0 m\) with no braking booked/);
    assert.equal(r.steps[2].suppressRest, false, "a missed zone still holds rests back");
  });
});

// ---------------------------------------------------------------------------
/** Every string, template and regex literal of `src` — a small lexer (comments
 *  skipped, `${…}` inside templates lexed recursively). */
function lexLiterals(src) {
  const out = [];
  let i = 0;
  let last = "punct";
  const n = src.length;
  const KW = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await"]);
  function run(stopAtBrace) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"' || c === "'") {
        const s = i;
        i++;
        while (i < n && src[i] !== c && src[i] !== "\n") { if (src[i] === "\\") i++; i++; }
        i++;
        out.push({ type: "str", at: s, text: src.slice(s + 1, i - 1) });
        last = "lit";
        continue;
      }
      if (c === "`") { tpl(); last = "lit"; continue; }
      if (c === "/" && (last === "punct" || last === "kw")) {
        const s = i;
        i++;
        let cls = false;
        while (i < n) {
          const d = src[i];
          if (d === "\\") { i += 2; continue; }
          if (d === "[") cls = true;
          else if (d === "]") cls = false;
          else if ((d === "/" && !cls) || d === "\n") break;
          i++;
        }
        i++;
        while (i < n && /[a-z]/i.test(src[i])) i++;
        out.push({ type: "regex", at: s, text: src.slice(s, i) });
        last = "lit";
        continue;
      }
      if (/[\p{L}_$]/u.test(c)) { const s = i; while (i < n && /[\p{L}\p{N}_$]/u.test(src[i])) i++; last = KW.has(src.slice(s, i)) ? "kw" : "id"; continue; }
      if (/\d/.test(c)) { while (i < n && /[\w.]/.test(src[i])) i++; last = "num"; continue; }
      if (c === "{") { depth++; i++; last = "punct"; continue; }
      if (c === "}") { if (stopAtBrace && depth === 0) { i++; return; } depth--; i++; last = "close"; continue; }
      if (c === ")" || c === "]") { i++; last = "close"; continue; }
      i++;
      last = "punct";
    }
  }
  function tpl() {
    const s = i;
    i++;
    let text = "";
    while (i < n && src[i] !== "`") {
      if (src[i] === "\\") { text += src.slice(i, i + 2); i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") { i += 2; const keep = last; last = "punct"; run(true); last = keep; text += "${}"; continue; }
      text += src[i];
      i++;
    }
    i++;
    out.push({ type: "tpl", at: s, text });
  }
  run(false);
  return out;
}
/** The source span of a declaration: from `head` to the bracket that closes the
 *  first `{` / `[` / `(` after it (strings, templates, comments skipped). */
function declSpan(src, head) {
  const a = src.indexOf(head);
  assert.ok(a >= 0 && src.indexOf(head, a + 1) < 0, `UNREADABLE: «${head}» is not unique in §5`);
  let depth = 0;
  let i = a + head.length - 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") {
      depth--;
      if (depth === 0) return [a, i + 1];
    }
    i++;
  }
  assert.fail(`UNREADABLE: «${head}» never closes`);
}
/** §5 code with the TEXT REGIONS cut out: the template table, the design table,
 *  the profile table (its `told` / `row`), the two evidence records, and the
 *  one renderer. What is left may carry no text a line could print. */
function sec5OutsideTextRegions(sec5 = SEC5) {
  let code = sec5;
  for (const head of [
    "export const PROFILE_DESIGN = Object.freeze({",
    "export const PROFILE_LINE_TEMPLATES = Object.freeze({",
    "export const WRONG_LEG_PROFILES = new Map([",
    "export const WITHDRAWN_WRONG_LEG_PROFILES = new Map([",
    "export const WITHDRAWN_PROFILE_ROUTES = new Map([",
    // round 9: the odometer census's evidence record (its provenance strings are never printed; a line takes only its
    // numbers and its date — the census test pins which fields the refusal reads)
    "export const ODO_CENSUS_ALL_WRONG_LEGS = Object.freeze({",
    // round 10: the populations every census band is sized on — evidence records; a line takes their numbers only
    "export const REACTION_CENSUS = Object.freeze({",
    "export const ODO_CENSUS_ZONE_PC = Object.freeze({",
    "export const ODO_RATIO_LOW_END = Object.freeze({",
    "export function renderProfileText(spec) {",
  ]) {
    const [a, b] = declSpan(code, head);
    code = code.slice(0, a) + code.slice(b);
  }
  return code;
}

/* ── ROUND 8: THE SINGLE EMISSION PATH, AS GATES THAT CAN FAIL ────────────────
 * The round-7 verifier (GATE-BYPASS) planted lines the round-7 gates could not
 * see: a LOUD harness line keyed on `wrongProfileDecl` (the scan matched only
 * `wrongProfile`), text appended to a rendered line with whitespace-free
 * strings, and a say line edited after rendering. The gates below are written
 * as functions of a SOURCE so the test can run them on planted copies too:
 *   · §5 — every text a profile hands the harness is `renderProfileText(spec)`:
 *     each text function is a pinned two-line wrapper over its `…Spec` twin,
 *     every `say` is `null` or a frozen `sayLine(…)`, and nothing assigns a
 *     line after rendering;
 *   · THE HARNESS — every line naming ANY profile value (every `wrongProfile*`
 *     name and every §5 export) is one of the enumerated forms, each a pinned
 *     number of times; every statement a condition naming a profile value
 *     controls is pinned; §5 is imported once and nowhere else; and no literal
 *     names a declared lesson, so no line can be keyed on the lesson instead. */

/** `lexTokensRaw`, memoised on the source text (round 9: the gates lex the 12,500-line harness several times for
 *  every planted copy). The cache lives on the function, so it exists before any module-level line runs; the token
 *  arrays are never mutated by a caller. */
function lexTokens(src) {
  const cache = (lexTokens.cache ??= new Map());
  const hit = cache.get(src);
  if (hit) return hit;
  const T = lexTokensRaw(src);
  cache.set(src, T);
  if (cache.size > 16) cache.delete(cache.keys().next().value);
  return T;
}
/** Every token of `src` — identifiers, numbers, strings, templates (their
 *  `${…}` parts lexed too), regexes, punctuation — with source offsets, in
 *  source order. Comments are skipped. */
function lexTokensRaw(src) {
  const out = [];
  let i = 0;
  let last = "punct";
  const n = src.length;
  const KW = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await", "if", "while", "for"]);
  const push = (type, s, e, text) => out.push({ type, at: s, end: e, text });
  // Round 9: ASCII fast paths for the character classes the lexer tests on every character; anything past «~» falls
  // back to the same regex as before (the token stream is identical — scratchpad/pedal/r9/lex-equivalence.mjs).
  const ws = (ch) => ch === " " || ch === "\n" || ch === "\t" || ch === "\r" || ch === "\v" || ch === "\f" || (ch > "~" && /\s/.test(ch));
  const idStart = (ch) => (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_" || ch === "$" || (ch > "~" && /\p{L}/u.test(ch));
  const idPart = (ch) => idStart(ch) || (ch >= "0" && ch <= "9") || (ch > "~" && /\p{N}/u.test(ch));
  const digit = (ch) => ch >= "0" && ch <= "9";
  const numPart = (ch) => (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch === "_" || ch === ".";
  const asciiLetter = (ch) => (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
  function run(stopAtBrace) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
      if (ws(c)) { i++; continue; }
      if (c === '"' || c === "'") {
        const s = i;
        i++;
        while (i < n && src[i] !== c && src[i] !== "\n") { if (src[i] === "\\") i++; i++; }
        i++;
        push("str", s, i, src.slice(s + 1, i - 1));
        last = "lit";
        continue;
      }
      if (c === "`") { tpl(); last = "lit"; continue; }
      if (c === "/" && (last === "punct" || last === "kw")) {
        const s = i;
        i++;
        let cls = false;
        while (i < n) {
          const d = src[i];
          if (d === "\\") { i += 2; continue; }
          if (d === "[") cls = true;
          else if (d === "]") cls = false;
          else if ((d === "/" && !cls) || d === "\n") break;
          i++;
        }
        i++;
        while (i < n && asciiLetter(src[i])) i++;
        push("regex", s, i, src.slice(s, i));
        last = "lit";
        continue;
      }
      if (idStart(c)) {
        const s = i;
        while (i < n && idPart(src[i])) i++;
        const w = src.slice(s, i);
        push("id", s, i, w);
        last = KW.has(w) ? "kw" : "id";
        continue;
      }
      if (digit(c)) { const s = i; while (i < n && numPart(src[i])) i++; push("num", s, i, src.slice(s, i)); last = "num"; continue; }
      if (c === "{") { depth++; push("punct", i, i + 1, c); i++; last = "punct"; continue; }
      if (c === "}") { if (stopAtBrace && depth === 0) { i++; return; } depth--; push("punct", i, i + 1, c); i++; last = "close"; continue; }
      if (c === ")" || c === "]") { push("punct", i, i + 1, c); i++; last = "close"; continue; }
      push("punct", i, i + 1, c);
      i++;
      last = "punct";
    }
  }
  function tpl() {
    const s = i;
    i++;
    let text = "";
    while (i < n && src[i] !== "`") {
      if (src[i] === "\\") { text += src.slice(i, i + 2); i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") { i += 2; const keep = last; last = "punct"; run(true); last = keep; text += "${}"; continue; }
      text += src[i];
      i++;
    }
    i++;
    push("tpl", s, i, text);
  }
  run(false);
  return out.sort((a, b) => a.at - b.at);
}
/** The index of the token that closes the bracket at `T[j]`. */
function closeOf(T, j) {
  let depth = 0;
  for (let k = j; k < T.length; k++) {
    const t = T[k];
    if (t.type !== "punct") continue;
    if (t.text === "(" || t.text === "[" || t.text === "{") depth++;
    else if (t.text === ")" || t.text === "]" || t.text === "}") {
      depth--;
      if (depth === 0) return k;
    }
  }
  return -1;
}
/** The index just past the statement starting at `T[j]` — a block, or up to its
 *  `;` — with any `else` chain after it. */
function statementEnd(T, j) {
  let e;
  if (T[j]?.type === "punct" && T[j].text === "{") e = closeOf(T, j) + 1;
  else {
    let depth = 0;
    e = j;
    for (; e < T.length; e++) {
      const t = T[e];
      if (t.type !== "punct") continue;
      if ("([{".includes(t.text)) depth++;
      else if (")]}".includes(t.text)) depth--;
      else if (t.text === ";" && depth === 0) break;
    }
    e += 1;
  }
  if (T[e]?.type === "id" && T[e].text === "else") {
    if (T[e + 1]?.text === "if" && T[e + 2]?.text === "(") return statementEnd(T, closeOf(T, e + 2) + 1);
    return statementEnd(T, e + 1);
  }
  return e;
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const squash = (s) => stripComments(s).replace(/\s+/g, " ").trim();

/** The names §5 exports — every one a profile value if the harness names it. */
const SEC5_EXPORTS = [...SEC5.matchAll(/^export (?:const|function|let) (\w+)/gm)].map((m) => m[1]);
/** The §5 functions the harness imports — the whole list, in its order. */
const HARNESS_SEC5_IMPORTS = [
  "createWrongLegProfile", "flatRestDue", "flatRestHoldDone", "readZoneRouteSpan", "resumeThrottleAfterPause", "wrongLegFlatStep", "wrongLegProfileFinish",
  "wrongLegProfileFor", "wrongLegProfileOutcomeLine", "wrongLegProfileStartLine", "wrongLegRestBooked", "wrongLegRestEnded", "wrongLegRestHoldNote",
  "wrongLegRestHoldsClause", "wrongLegRestOpportunity", "wrongLegRestSummary", "wrongLegRestTick",
];
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** EVERY line of the harness that names a profile value, and how many times each
 *  may occur. A line not here — or one of these a different number of times —
 *  is a profile line composed outside §5, or wiring that moved. */
const HARNESS_ALLOWED_LINES = [
  [new RegExp(`^import \\{ ${HARNESS_SEC5_IMPORTS.map(reEsc).join(", ")} \\} from "\\./lib/driveline\\.mjs";$`), 1],
  [/^const wrongProfileDecl = MODE === "right" \? null : wrongLegProfileFor\(SCENARIO\);$/, 1],
  [/^let wrongProfile = createWrongLegProfile\(wrongProfileDecl === null \? null : SCENARIO, \{$/, 1],
  [/^zoneSpan: wrongProfileDecl !== null && wrongProfileDecl\.kind === "zone-rest" \? readZoneRouteSpan\(SCENARIO, wrongProfileDecl\.zone\) : null,$/, 1],
  [/^const wrongProfileStart = wrongLegProfileStartLine\(wrongProfile, \{ everyM: FLAT_REST_EVERY_M \}\);$/, 1],
  [/^if \(wrongProfileStart !== null && !STEER_PROOF\) loud\(wrongProfileStart\);$/, 1],
  [/^if \(MODE !== "right" && resumeThrottleAfterPause\(wrongProfile\)\) await throttle\(true\);$/, 1],
  [/^const wrongProfileStep = wrongLegFlatStep\(wrongProfile, \{$/, 1],
  [/^postedKmh: wrongProfile\.on \? postedLimitKmh\(p\.postedLabels\) : null,$/, 1],
  [/^follow: wrongProfile\.on \? parseHazard\(p\.hazard\)\.follow : null,$/, 1],
  [/^wrongProfile = wrongProfileStep\.state;$/, 1],
  [/^if \(wrongProfileStep\.say !== null\) \(wrongProfileStep\.say\.loud \? loud : note\)\(wrongProfileStep\.say\.line\);$/, 1],
  [/^wrongProfile = wrongLegRestOpportunity\(wrongProfile, \{$/, 1],
  [/^suppress: wrongProfileStep\.suppressRest,$/, 2],
  [/^force: wrongProfileStep\.forceRest,$/, 2],
  [/^flatRestDue\(\{$/, 1],
  [/^const wrongProfileRest = wrongLegRestBooked\(wrongProfile, \{ now, t0, holdMs: FLAT_REST_HOLD_MS, kmh: p\.kmh \}\);$/, 1],
  [/^wrongProfile = wrongProfileRest\.state;$/, 1],
  [/^const wrongProfileRestNote = wrongLegRestHoldNote\(wrongProfile, wrongProfileRest, \{ holdMs: FLAT_REST_HOLD_MS \}\);$/, 1],
  [/^\(wrongProfileRestNote \?\?$/, 1],
  [/^wrongProfile = wrongLegRestTick\(wrongProfile, \{ kmh: p\.kmh, dtMs: now - lastTickAt \}\);$/, 1],
  [/^if \(restLogged && flatRestHoldDone\(\{ now, restAt: flatRestAt, holdMs: FLAT_REST_HOLD_MS, state: wrongProfile \}\)\) \{$/, 1],
  [/^const wrongProfileRestEnd = wrongLegRestEnded\(wrongProfile, \{ now, t0 \}\);$/, 1],
  [/^const wrongProfileRestEnd = wrongLegRestEnded\(wrongProfile, \{ now, t0, gaveUp: true \}\);$/, 1],
  [/^wrongProfile = wrongProfileRestEnd\.state;$/, 2],
  [/^if \(wrongProfileRestEnd\.say !== null\) \(wrongProfileRestEnd\.say\.loud \? loud : note\)\(wrongProfileRestEnd\.say\.line\);$/, 2],
  [/^wrongProfile = wrongLegProfileFinish\(wrongProfile, \{ now: Date\.now\(\), t0, driveEnded: ended \}\)\.state;$/, 1],
  [/^const wrongProfileRestHolds = wrongLegRestHoldsClause\(wrongProfile, \{ stops: stopsMade, holdMs: FLAT_REST_HOLD_MS \}\);$/, 1],
  [/^\(wrongProfileRestHolds \?\? `each held \$\{FLAT_REST_HOLD_MS \/ 1000\}s`\) \+$/, 1],
  [/^wrongLegRestSummary\(wrongProfile\),$/, 1],
  [/^const wrongProfileOutcome = wrongLegProfileOutcomeLine\(wrongProfile\);$/, 1],
  [/^if \(wrongProfileOutcome !== null\) \(wrongProfile\.heldAsSized \? note : loud\)\(wrongProfileOutcome\);$/, 1],
  [/^\.\.\.\(MODE !== "right" && wrongProfile\.declared \? \{ wrongLegProfile: wrongProfile \} : \{\}\),$/, 1],
];
/** EVERY statement a condition naming a profile value controls (its consequent
 *  and any `else` chain), whitespace-squashed and comments stripped — and the
 *  one bare block that exists only for the outcome line. The text found is
 *  printed when one differs. */
const HARNESS_CONTROLLED = [
  ["the start line's sink", { text: "loud(wrongProfileStart);" }],
  ["the pause drain's guarded re-press", { text: "await throttle(true);" }],
  ["the flat tick's say sink", { text: "(wrongProfileStep.say.loud ? loud : note)(wrongProfileStep.say.line);" }],
  ["the transition", { text: '{ phase = "flat-rest"; phaseAt = now; phaseTicks = 0; flatM = 0; flatRestAt = 0; restLogged = false; }' }],
  ["the rest's end and the give-up", { text: "{ const wrongProfileRestEnd = wrongLegRestEnded(wrongProfile, { now, t0 }); wrongProfile = wrongProfileRestEnd.state; if (wrongProfileRestEnd.say !== null) (wrongProfileRestEnd.say.loud ? loud : note)(wrongProfileRestEnd.say.line); await brake(false); phase = \"flat\"; phaseAt = now; phaseTicks = 0; flatM = 0; } else if (!restLogged && now - phaseAt >= FLAT_REST_GIVEUP_MS) { loud( `the wrong leg would not come to rest in ${FLAT_REST_GIVEUP_MS / 1000}s (${p.kmh} км/ч, brake ` + `${holdS ? \"down\" : \"UP\"}, throttle ${holdW ? \"DOWN\" : \"up\"}) — rolling on, and no „stopping where forbidden\" ` + `finding may be drawn from this stretch.`, ); const wrongProfileRestEnd = wrongLegRestEnded(wrongProfile, { now, t0, gaveUp: true }); wrongProfile = wrongProfileRestEnd.state; if (wrongProfileRestEnd.say !== null) (wrongProfileRestEnd.say.loud ? loud : note)(wrongProfileRestEnd.say.line); await brake(false); phase = \"flat\"; phaseAt = now; phaseTicks = 0; flatM = 0; }" }],
  ["the rest end's say sink", { text: "(wrongProfileRestEnd.say.loud ? loud : note)(wrongProfileRestEnd.say.line);" }],
  ["the give-up's say sink", { text: "(wrongProfileRestEnd.say.loud ? loud : note)(wrongProfileRestEnd.say.line);" }],
  ["the outcome sink", { text: "(wrongProfile.heldAsSized ? note : loud)(wrongProfileOutcome);" }],
  ["the outcome's bare block", { text: "{ const wrongProfileOutcome = wrongLegProfileOutcomeLine(wrongProfile); if (wrongProfileOutcome !== null) (wrongProfile.heldAsSized ? note : loud)(wrongProfileOutcome); }" }],
];
/** Every text a harness literal must never carry: a declared (or withdrawn)
 *  lesson, a profile's name, the zone's authored ids — a line keyed on those
 *  is keyed on the profile declaration by another name. */
const DECLARED_NAMES = () => [
  ...WRONG_LEG_PROFILES.keys(),
  ...[...WRONG_LEG_PROFILES.values()].map((p) => p.name),
  ...WITHDRAWN_WRONG_LEG_PROFILES.keys(),
  ...[...WITHDRAWN_WRONG_LEG_PROFILES.values()].map((p) => p.name),
  ...[...WRONG_LEG_PROFILES.values()].filter((p) => p.zone).flatMap((p) => [p.zone.world, ...p.zone.zoneIds]),
  // …and each lesson id's own tail («busstop-ban», «truck-spray», …), so a fragment of the id keys nothing either.
  ...[...WRONG_LEG_PROFILES.keys(), ...WITHDRAWN_WRONG_LEG_PROFILES.keys()].map((id) => id.split("-").slice(-2).join("-")),
];
/** The ids a line could be keyed on by a FRAGMENT (round 8 finish): the declared and withdrawn lessons, and the
 *  zone's authored world and zone ids. */
const DECLARED_IDS = () => [
  ...WRONG_LEG_PROFILES.keys(),
  ...WITHDRAWN_WRONG_LEG_PROFILES.keys(),
  ...[...WRONG_LEG_PROFILES.values()].filter((p) => p.zone).flatMap((p) => [p.zone.world, ...p.zone.zoneIds]),
];
/** The segments of those ids that ordinary harness literals carry at 4112566 («signal» in «the signal is a road
 *  centreline», «right» as the right leg, «keep» in «keeping», «stop» in a hundred notes). Every OTHER segment of
 *  four letters or more is DISTINCTIVE: no harness literal carries it, and one that does is keyed on a lesson. The
 *  test below checks each generic one IS carried today — an exemption with no evidence is not an exemption. */
const GENERIC_ID_SEGMENTS = ["signal", "keep", "right", "stop"];
const DISTINCTIVE_ID_SEGMENTS = () =>
  [...new Set(DECLARED_IDS().flatMap((id) => id.split("-")).filter((s) => s.length >= 4 && !GENERIC_ID_SEGMENTS.includes(s)))].sort();
/** A harness identifier that names a profile value: every `wrongProfile*` local, the sidecar's `wrongLegProfile`
 *  key and anything else spelled `wrongLegProfile*` (round 8 finish: a line keyed on the sidecar key passed the
 *  round-8 partial's gate), and every §5 export. */
const PROFILE_NAME_ALT = () => `wrong(?:Leg)?Profile\\w*|${SEC5_EXPORTS.map(reEsc).join("|")}`;
const isProfileNameWord = (w) => /^wrong(?:Leg)?Profile\w*$/.test(w) || SEC5_EXPORTS.includes(w);
/** THE SINKS every profile line reaches the log through, as they stand at 4112566: `note` pushes the line into
 *  the transcript and prints it, `loud` prefixes it. A sink that edits what it is handed is text added after
 *  rendering, in the harness (round 8 finish). `loud` is compared RAW — its template literal's spaces are the
 *  line's own. */
const HARNESS_NOTE_SINK = "const note = (s) => { log.push(s); try { console.log(s); } catch (error) { stdoutBroken ??= String(error?.code ?? error?.message ?? error); } };";
const HARNESS_LOUD_SINK = "const loud = (s) => note(`  !! ${s}`);";

/** The controlled statements of a source, as squashed text, in source order. */
function harnessControlled(src, isProfileName) {
  const T = lexTokens(src);
  const spans = [];
  for (let k = 0; k < T.length; k++) {
    if (T[k].type !== "id" || T[k].text !== "if" || T[k + 1]?.text !== "(") continue;
    const close = closeOf(T, k + 1);
    if (close < 0) { spans.push(["UNREADABLE", `an if at ${T[k].at} never closes`]); continue; }
    if (!T.slice(k + 2, close).some((t) => t.type === "id" && isProfileName(t.text))) continue;
    const end = statementEnd(T, close + 1);
    spans.push(["if", squash(src.slice(T[close + 1].at, T[end - 1].end))]);
  }
  // …and the bare block the outcome line lives in.
  const at = T.findIndex((t, k) => t.type === "id" && t.text === "wrongProfileOutcome" && T[k - 1]?.text === "const");
  if (at > 0 && T[at - 2]?.text === "{") spans.push(["block", squash(src.slice(T[at - 2].at, T[closeOf(T, at - 2)].end))]);
  else spans.push(["block", "UNREADABLE: the outcome line's bare block"]);
  return spans.map(([, s]) => s);
}

/** THE HARNESS GATE — every way a profile line could reach the log without §5's
 *  renderer, as a list of violations (empty = the harness passes). */
function harnessGateViolations(src) {
  const v = [];
  const code = stripComments(src);
  const names = new RegExp(`\\b(?:${PROFILE_NAME_ALT()})\\b`);
  const isProfileName = isProfileNameWord;
  // H1 — every line naming a profile value is an enumerated form, each the pinned number of times.
  const touching = code.split("\n").map((l) => l.trim()).filter((l) => names.test(l));
  for (const l of touching) if (!HARNESS_ALLOWED_LINES.some(([re]) => re.test(l))) v.push(`H1 a line names a profile value outside the enumerated forms: «${l}»`);
  for (const [re, n] of HARNESS_ALLOWED_LINES) {
    const got = touching.filter((l) => re.test(l)).length;
    if (got !== n) v.push(`H1 ${re} occurs ${got} time(s), not ${n}`);
  }
  // H2 — §5 is imported by exactly the two static imports, and nowhere else.
  const refs = (code.match(/driveline\.mjs/g) ?? []).length;
  const statics = (code.match(/^import \{[^}]*\} from "\.\/lib\/driveline\.mjs";$/gm) ?? []).length;
  if (refs !== 2 || statics !== 2) v.push(`H2 lib/driveline.mjs is referenced ${refs} time(s), ${statics} of them a static import (expected 2 and 2)`);
  // H3 — no literal names a declared lesson, a profile, or the zone's authored ids.
  const T = lexTokens(src);
  for (const t of T.filter((x) => x.type === "str" || x.type === "tpl")) {
    for (const id of DECLARED_NAMES()) if (t.text.includes(id)) v.push(`H3 a harness literal names «${id}»: ${JSON.stringify(t.text.slice(0, 80))}`);
    // H3b (round 8 finish) — …nor a dashed FRAGMENT of one («stop-ban», «pk-busstop»): any literal piece of five
    //      characters or more (round 9: five, not six — «sc-pk», «sc-ac», «sc-ov» are a declared lesson's family
    //      prefix, and no harness literal carries a dashed id fragment shorter than six today), with a dash in it,
    //      that is part of a declared id.
    for (const piece of (t.type === "tpl" ? t.text.split("${}") : [t.text])) {
      if (piece.length >= 5 && piece.includes("-") && DECLARED_IDS().some((id) => id.includes(piece))) v.push(`H3b a harness literal is a fragment of a declared id: «${piece}»`);
    }
    // H3c — …nor a DISTINCTIVE segment of one («busstop», «truck», «flashing»), in any case.
    for (const seg of DISTINCTIVE_ID_SEGMENTS()) if (t.text.toLowerCase().includes(seg)) v.push(`H3c a harness literal carries «${seg}», a segment of a declared id: ${JSON.stringify(t.text.slice(0, 80))}`);
  }
  // H4 — every statement a profile condition controls, and the outcome's block, is pinned.
  const got = harnessControlled(src, isProfileName);
  const want = HARNESS_CONTROLLED.map(([, w]) => w);
  if (got.length !== want.length) v.push(`H4 ${got.length} controlled statement(s), not ${want.length}: ${got.map((s) => s.slice(0, 60)).join(" ‖ ")}`);
  for (let k = 0; k < Math.min(got.length, want.length); k++) {
    const w = want[k];
    if (got[k] !== w.text) v.push(`H4 «${HARNESS_CONTROLLED[k][0]}» is not the pinned statement: ${got[k]}`);
  }
  // H5 — no literal says anything a profile line says.
  for (const re of [/wrong-leg profile/i, /held as sized/i, /\bSIZING \(/, /sized at \d/, /rest opportunit/i, /changed when these rests fell/i, /zone profile's own tally/i]) {
    if (re.test(code)) v.push(`H5 the harness composes profile text itself (${re})`);
  }
  // H6 (round 8 finish) — THE SINKS are the 4112566 sinks: `note` and `loud` as they stood, each declared once and
  //      never shadowed, re-bound, destructured or taken as a parameter; the transcript array `log` declared once,
  //      pushed ONLY inside `note`, and read only by its four `log.join` writes. A sink that edits the line it is
  //      handed — or a second `loud` in scope around a pinned sink statement — is text added after rendering.
  if ((squash(code).split(HARNESS_NOTE_SINK).length - 1) !== 1) v.push("H6 the note sink is not the 4112566 `note`");
  if (code.split("\n").filter((l) => l === HARNESS_LOUD_SINK).length !== 1) v.push("H6 the loud sink is not the 4112566 `loud`");
  const decls = [...code.matchAll(/\b(?:const|let|var|function|class)\s+(note|loud)\b/g)].map((m) => m[1]);
  if (JSON.stringify(decls) !== JSON.stringify(["note", "loud"])) v.push(`H6 the sinks are declared ${JSON.stringify(decls)}, not once each`);
  if (/\b(?:const|let|var)\s*[{[][^=;]*\b(?:note|loud)\b[^=;]*[}\]]\s*=/.test(code)) v.push("H6 a sink is bound by destructuring");
  if (/[(,=]\s*(?:note|loud)\s*(?:[,);]|=>)|\b(?:note|loud)\s*=>/.test(code)) v.push("H6 a sink is a parameter, or handed on as a value");
  const rebinds = [...code.matchAll(/(?<![\w$.])(?:note|loud)\s*(?:\+|-|\?\?|\|\||&&)?=(?![=>])/g)].length;
  if (rebinds !== 2) v.push(`H6 the sinks are bound ${rebinds} time(s), not the two declarations`);
  const logForms = [];
  for (let k = 0; k < T.length; k++) {
    if (T[k].type !== "id" || T[k].text !== "log" || T[k - 1]?.text === ".") continue;
    // an object KEY named `log` (the road witness's `log: Object.freeze((line) => note(line))`) is not the array
    if (T[k + 1]?.text === ":" && (T[k - 1]?.text === "{" || T[k - 1]?.text === ",")) continue;
    logForms.push(`${T[k + 1]?.text ?? ""}${T[k + 2]?.text ?? ""}`);
  }
  if (JSON.stringify(logForms.sort()) !== JSON.stringify([".join", ".join", ".join", ".join", ".push", "=["])) v.push(`H6 the transcript array is used as ${JSON.stringify(logForms)}, not declared, pushed in note and joined four times`);
  // ROUND 9 — the effect gate (H7), the claim literals (H8), the mechanism bans (M1–M7), the state keys (H10), the
  // direct prints (H11) and the status forms (H12).
  v.push(...round9HarnessViolations(src));
  // ROUND 10 — the three censuses (M8–M10) and every read of the scenario id (H3d).
  v.push(...round10HarnessViolations(src));
  return v;
}

/** THE §5 GATE — every way a profile text could leave §5 without being
 *  `renderProfileText(spec)`, as a list of violations. `lib` is the whole lib. */
const SEC5_PINNED_DECLS = [
  "function sayLine(loud, tpl, f) { const spec = profileText(tpl, f); return Object.freeze({ loud, line: renderProfileText(spec), spec }); }",
  "export function zoneBrakingModel(decel) { return renderProfileText(zoneModelSpec(decel)); }",
  "export function wrongLegProfileStartLine(state, opts) { const spec = wrongLegProfileStartSpec(state, opts); return spec === null ? null : renderProfileText(spec); }",
  "export function wrongLegProfileOutcomeLine(state) { const spec = wrongLegProfileOutcomeSpec(state); return spec === null ? null : renderProfileText(spec); }",
  "export function wrongLegRestHoldNote(state, booked, opts) { const spec = wrongLegRestHoldNoteSpec(state, booked, opts); return spec === null ? null : renderProfileText(spec); }",
  'export function wrongLegRestSummary(state) { const spec = wrongLegRestSummarySpec(state); return spec === null ? "" : renderProfileText(spec); }',
  "export function wrongLegRestHoldsClause(state, opts) { const spec = wrongLegRestHoldsSpec(state, opts); return spec === null ? null : renderProfileText(spec); }",
];
function sec5GateViolations(lib) {
  const v = [];
  const head = lib.indexOf(" * 5 · WRONG-LEG PROFILES");
  const raw = lib.slice(lib.lastIndexOf("/*", head));
  const sec5 = stripComments(raw);
  const rest = sec5OutsideTextRegions(sec5);
  // L1 — no text outside the text regions.
  const lits = lexLiterals(rest);
  for (const l of lits.filter((x) => x.type === "tpl")) v.push(`L1 a template literal outside the template table: ${l.text.slice(0, 60)}`);
  for (const l of lits.filter((x) => x.type === "str" && /\s/.test(x.text))) v.push(`L1 a string with whitespace outside the template table: ${l.text.slice(0, 60)}`);
  // L2 — every say is null or sayLine's frozen object, and nothing edits a line after rendering.
  for (const m of rest.matchAll(/\bsay\s*:\s*/g)) {
    const after = rest.slice(m.index + m[0].length, m.index + m[0].length + 9);
    if (!after.startsWith("null") && !after.startsWith("sayLine(")) v.push(`L2 a say that is neither null nor sayLine(…): «say: ${after}…»`);
  }
  for (const m of rest.matchAll(/\.say\s*=(?!=)\s*/g)) {
    if (!rest.slice(m.index + m[0].length).startsWith("sayLine(")) v.push(`L2 a say assigned from something other than sayLine(…)`);
  }
  if (/\.line\s*(?:\+|\?\?|\|\||&&)?=(?!=)/.test(rest)) v.push("L2 a line is assigned after rendering");
  const lineKeys = [...rest.matchAll(/\bline\s*:\s*([^,}\n]+)/g)].map((m) => m[1].trim()).sort();
  if (JSON.stringify(lineKeys) !== JSON.stringify(["L.baseLineSec", "decl.line", "renderProfileText(spec)"])) v.push(`L2 a \`line:\` key outside sayLine and the lead's state: ${JSON.stringify(lineKeys)}`);
  // L3 — every text function is its pinned wrapper.
  const sq = squash(sec5);
  for (const d of SEC5_PINNED_DECLS) if (!sq.includes(d)) v.push(`L3 not pinned any more: ${d.slice(0, 90)}…`);
  // L4 — renderProfileText is called in exactly the pinned places: the wrappers, sayLine, zoneBrakingModel, the
  //      three rendered constants and profileText's validation — and nowhere else outside the renderer.
  const calls = (rest.match(/\brenderProfileText\(/g) ?? []).length;
  if (calls !== 11) v.push(`L4 renderProfileText is called ${calls} time(s) outside the renderer, not 11`);
  // L5 — no alias of readFileSync the runtime spy cannot see (the verifier's V7-E1).
  if ((sec5.match(/\breadFileSync\b/g) ?? []).length !== 2) v.push("L5 readFileSync is named outside its two authored-content calls");
  // …nor anywhere else in the lib, where an alias taken at load time would reach §5 as another name: the whole
  // lib names it four times (its import, §2's own reader, §5's two calls), imports two builtins and nothing else,
  // and loads no module at run time.
  const whole = stripComments(lib);
  if ((whole.match(/\breadFileSync\b/g) ?? []).length !== 4) v.push("L5 readFileSync is named in the lib outside its import, §2's reader and §5's two calls");
  const imports = whole.split("\n").filter((l) => /^\s*import\b/.test(l) && !/^\s*import\s*\(/.test(l));
  if (JSON.stringify(imports) !== JSON.stringify(['import { readFileSync } from "node:fs";', 'import { fileURLToPath } from "node:url";'])) v.push(`L5 the lib's imports changed: ${JSON.stringify(imports)}`);
  if (/\bimport\s*\(|\brequire\s*\(|\bcreateRequire\b/.test(whole)) v.push("L5 the lib loads a module at run time");
  // L6 (round 8 finish) — …and no path to a builtin that names no import: `process` (getBuiltinModule, binding),
  //      `globalThis`, `eval`, the Function constructor by name or through any function's `.constructor`, and
  //      `Reflect`. With a computed property name («"read" + "FileSync"») none of those names `readFileSync`, so
  //      L5's count could not see them (R8-F04, F05, F12 SURVIVED on the round-8 partial). The lib uses none.
  // (Round 10: CODE NAMES — a lib string whose prose says «Function» is no road to anything.)
  const esc = codeNames(lib).filter((x) => ["process", "globalThis", "getBuiltinModule", "eval", "Function", "constructor", "Reflect"].includes(x.name)).map((x) => x.name);
  if (esc.length) v.push(`L6 the lib reaches a builtin without an import: ${JSON.stringify([...new Set(esc)])}`);
  // ROUND 9 — the mechanism bans (clause ii of the threat model), the renderer pinned, and no declared id outside §5.
  v.push(...round9LibViolations(lib));
  // ROUND 10 — no print in the lib, its claim literals, and its censuses.
  v.push(...round10LibViolations(lib));
  return v;
}

/* ═══ ROUND 9 GATES (region start — scratchpad/pedal/r9/make-pins.mjs slices this region to compute the pins) ═══
 *
 * THE MECHANISM BANS, clause (ii) of the threat model (it is quoted in full above §W10): in the WHOLE lib (the
 * renderer and §1–§4 included) and the WHOLE harness, every mechanism an obfuscated bypass needs is a violation —
 *   eval · Function · a computed property name built from strings · assignment to, redefinition of, or aliasing of
 *   any builtin (and every road to a prototype) · caller introspection · every road to a builtin that names no
 *   import (globalThis, global, getBuiltinModule, constructor, Reflect, require, eval-capable modules, a child
 *   `node -e`) · an escaped identifier.
 * Each file's own uses of a mechanism at 4112566 are ENUMERATED allowances, pinned exactly (a page-side
 * `Wrapped.prototype`, the crash handler's `error?.stack`, `process.exitCode = exit`, five `.filter(Boolean)`, five
 * computed keys, three dynamic imports), so a new use is a violation. Each ban is proven by planting the mechanism in
 * a copy of the file (§W10 C). */

/** The globals a bypass would redefine, alias or reach through: every builtin a Node ESM module can name bare. */
const BUILTIN_ROOTS = new Set([
  "console", "process", "globalThis", "global", "Array", "Object", "String", "Number", "Boolean", "Symbol", "BigInt", "Math", "JSON",
  "Date", "RegExp", "Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "EvalError", "URIError", "AggregateError",
  "Promise", "Map", "Set", "WeakMap", "WeakSet", "WeakRef", "FinalizationRegistry", "Reflect", "Proxy", "Function", "Intl", "Atomics",
  "ArrayBuffer", "SharedArrayBuffer", "DataView", "Uint8Array", "Int8Array", "Uint16Array", "Int16Array", "Uint32Array", "Int32Array",
  "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array", "Uint8ClampedArray", "Buffer", "URL", "URLSearchParams",
  "TextEncoder", "TextDecoder", "structuredClone", "setTimeout", "setInterval", "setImmediate", "clearTimeout", "clearInterval",
  "queueMicrotask", "performance", "crypto", "fetch", "Iterator", "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
  "escape", "unescape", "isNaN", "isFinite", "parseInt", "parseFloat", "eval", "WebAssembly",
]);
const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "&=", "|=", "^=", "&&=", "||=", "??="]);
/** The operator whose first character is `T[j]` (the lexer emits punctuation one character at a time). */
function opAt(T, j) {
  let s = "";
  for (let k = j; k < Math.min(T.length, j + 4); k++) {
    if (T[k].type !== "punct" || (k > j && T[k].at !== T[k - 1].end)) break;
    s += T[k].text;
  }
  for (const op of [">>>=", "**=", "<<=", ">>=", "&&=", "||=", "??=", "===", "!==", "==", "!=", "=>", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "="]) if (s.startsWith(op)) return op;
  return s.slice(0, 1);
}
/** EVERY USE OF A BUILTIN GLOBAL in `src`: its root, its member chain (a computed step is `[…]`), the token after it,
 *  and what the use is — `assign` (an assignment, update or delete lands on it), `call`, `new`, `member` (read),
 *  `callback` (`.filter(Boolean)` — a constructor handed on as a mapper) or `bare` (the global itself handed on or
 *  bound: an alias). */
function builtinUses(src) {
  const T = lexTokens(src);
  const uses = [];
  for (let k = 0; k < T.length; k++) {
    const t = T[k];
    if (t.type !== "id" || !BUILTIN_ROOTS.has(t.text)) continue;
    const prev = T[k - 1];
    const spread = prev?.text === "." && T[k - 2]?.text === "." && T[k - 3]?.text === ".";
    if (!spread && prev?.type === "punct" && prev.text === ".") continue; // a member that shares a builtin's name
    if (T[k + 1]?.text === ":" && (prev?.text === "{" || prev?.text === ",")) continue; // an object key
    let j = k + 1;
    const chain = [];
    for (;;) {
      if (T[j]?.text === "?" && T[j + 1]?.text === "." && T[j + 1].at === T[j].end) { j += 1; continue; }
      if (T[j]?.text === "." && T[j + 1]?.type === "id") { chain.push(`.${T[j + 1].text}`); j += 2; continue; }
      if (T[j]?.text === "[" && T[j].at === (T[j - 1]?.end ?? -1)) { const c = closeOf(T, j); chain.push(`[${src.slice(T[j].end, T[c].at).replace(/\s+/g, " ")}]`); j = c + 1; continue; }
      break;
    }
    const after = opAt(T, j);
    const before = prev?.text === "+" && T[k - 2]?.text === "+" ? "++" : prev?.text === "-" && T[k - 2]?.text === "-" ? "--" : prev?.text;
    let form;
    if (ASSIGN_OPS.has(after) || after === "++" || after === "--" || before === "++" || before === "--" || prev?.text === "delete") form = "assign";
    else if (chain.length === 0 && prev?.text === "new") form = "new";
    else if (chain.length === 0 && after === "(") form = "call";
    else if (chain.length === 0 && (prev?.text === "typeof" || prev?.text === "instanceof")) form = prev.text;
    else if (chain.length === 0 && !spread && prev?.text === "(" && T[j]?.text === ")" && T[k - 2]?.type === "id" && T[k - 3]?.text === "." && ["Boolean", "Number", "String"].includes(t.text)) form = "callback";
    else if (chain.length === 0) form = "bare";
    else form = "member";
    const lineAt = src.lastIndexOf("\n", t.at) + 1;
    uses.push({ root: t.text, chain: chain.join(""), form, after, text: src.slice(lineAt, src.indexOf("\n", t.at) < 0 ? src.length : src.indexOf("\n", t.at)).trim() });
  }
  return uses;
}
/** Undo a literal's escapes, so «product» is read as the word it prints. */
const decodeEscapes = (s) =>
  s.replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})|\\([\s\S])/g, (m, a, b, c, d) =>
    a ? String.fromCodePoint(parseInt(a, 16)) : b ? String.fromCharCode(parseInt(b, 16)) : c ? String.fromCharCode(parseInt(c, 16)) : "ntrvfb0".includes(d) ? " " : d,
  );
const pinHash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
/** A pinned, ORDERED list of code lines (or statements): violations naming what is new, what is gone, and the
 *  re-pin string an honest editor pastes after re-reading the change for a claim. */
function orderedPinViolations(label, items, pinned) {
  const want = pinned.split(/\s+/).filter(Boolean);
  const got = items.map((text) => ({ text, h: pinHash(text) }));
  if (JSON.stringify(got.map((x) => x.h)) === JSON.stringify(want)) return [];
  const added = got.filter((x) => !want.includes(x.h)).map((x) => x.text);
  const gone = want.filter((h) => !got.some((x) => x.h === h)).length;
  return [`${label} is not the pinned code — ${got.length} pinned against ${want.length}; ${added.length} new or changed${added.length ? `: ${added.slice(0, 3).map((t) => JSON.stringify(t.slice(0, 110))).join(" | ")}` : ""}; ${gone} pinned gone${added.length === 0 && gone === 0 ? "; the order moved" : ""}. Re-read the change for a claim keyed on the profile, then re-pin: ${got.map((x) => x.h).join(" ")}`];
}
/** A pinned MULTISET of texts (hashes, any order). */
function multisetPinViolations(label, items, pinned) {
  const want = pinned.split(/\s+/).filter(Boolean).sort();
  const got = items.map((text) => ({ text, h: pinHash(text) }));
  if (JSON.stringify(got.map((x) => x.h).sort()) === JSON.stringify(want)) return [];
  const left = [...want];
  const added = [];
  for (const x of got) {
    const i = left.indexOf(x.h);
    if (i >= 0) left.splice(i, 1);
    else added.push(x.text);
  }
  return [`${label} is not the pinned census — ${got.length} against ${want.length}; ${added.length} new${added.length ? `: ${added.slice(0, 3).map((t) => JSON.stringify(t.slice(0, 110))).join(" | ")}` : ""}; ${left.length} gone. Re-read each new one for a claim about the product, then re-pin: ${got.map((x) => x.h).sort().join(" ")}`];
}

/** Every computed member access in `src` whose key is BUILT from strings, whitespace-squashed. */
function builtComputedKeys(src, T = lexTokens(src)) {
  const out = [];
  for (let k = 1; k < T.length; k++) {
    if (T[k].type !== "punct" || T[k].text !== "[") continue;
    const p = T[k - 1];
    const member = (p.type === "id" && !["return", "typeof", "case", "in", "of", "new", "delete", "void", "throw", "yield", "await", "else", "do", "const", "let", "var"].includes(p.text)) || (p.type === "punct" && (p.text === ")" || p.text === "]")) || p.type === "str" || p.type === "tpl" || (p.type === "punct" && p.text === "." && T[k - 2]?.text === "?");
    if (!member || T[k].at !== p.end) continue;
    const inner = T.slice(k + 1, closeOf(T, k));
    const built = (inner.some((x) => x.type === "str" || x.type === "tpl") && inner.length > 1) || (inner.length === 1 && inner[0].type === "tpl" && inner[0].text.includes("${}"));
    if (built) out.push(squash(src.slice(p.at, T[closeOf(T, k)].end)));
  }
  return out;
}
/** How `console` and `process` are used: «root.first.second form next» → count. */
function consoleProcessForms(uses) {
  const cp = {};
  for (const u of uses.filter((x) => x.root === "console" || x.root === "process")) {
    const key = `${u.root}${u.chain.split(/(?=[.[])/).slice(0, 2).join("")} ${u.form} ${u.after}`;
    cp[key] = (cp[key] ?? 0) + 1;
  }
  return cp;
}
/** The mechanisms, by class — `lib` and `harness` share them; each class is labelled per file (lib L6–L12, harness
 *  M1–M7). The file's enumerated allowances are `LIB_MECHANISM_ALLOWANCES` / `HARNESS_MECHANISM_ALLOWANCES`. */
function mechanismViolations(src, file) {
  const P = file === "lib"
    ? { eval: "L6", fn: "L6", computed: "L9", builtin: "L7", caller: "L8", noImport: "L6", escape: "L12" }
    : { eval: "M1", fn: "M2", computed: "M3", builtin: "M4", caller: "M5", noImport: "M6", escape: "M7" };
  const A = file === "lib" ? LIB_MECHANISM_ALLOWANCES : HARNESS_MECHANISM_ALLOWANCES;
  const v = [];
  const code = stripComments(src);
  const lines = code.split("\n").map((l) => l.trim());
  const T = lexTokens(src);
  // ROUND 10 (BANS-HONEST-AND-OVERBREADTH): every NAME ban below reads CODE NAMES — identifier tokens and plain-string
  // computed keys (`codeNames`) — never the contents of a literal or a comment, so a log note whose prose says
  // «arguments», «prototype», «constructor» or «eval» is no mechanism. A literal's words are H8's (and L14's), and a
  // key BUILT from strings is the computed-key rule's. Each name ban reports the code line it is on, once.
  const N = codeNames(src, T);
  const namedLines = (pred) => [...new Set(N.filter(pred).map((x) => codeLineAt(src, x.at)))];
  // eval, and Function — as a code name. Playwright's `page.$eval` / `$$eval` are their own tokens, not eval.
  for (const l of namedLines((x) => x.name === "eval" && !x.member)) v.push(`${P.eval} eval: ${l.slice(0, 100)}`);
  for (const l of namedLines((x) => x.name === "Function" && !x.member)) v.push(`${P.fn} the Function constructor: ${l.slice(0, 100)}`);
  // A COMPUTED PROPERTY NAME BUILT FROM STRINGS — `x["wrongLeg" + "Profile"]`, `x[\`${a}b\`]`: the key holds a string
  // or template piece together with anything else, or a template with a substitution. A plain `x["key"]` is a name,
  // and the name gates read it.
  const computed = builtComputedKeys(src, T);
  for (const c of computed.filter((c) => !A.computed.includes(c))) v.push(`${P.computed} a computed property name built from strings: ${c.slice(0, 100)}`);
  if (computed.filter((c) => A.computed.includes(c)).length !== A.computed.length) v.push(`${P.computed} the enumerated computed keys are not the 4112566 ones: ${JSON.stringify(computed)}`);
  // BUILTINS: never assigned, updated, deleted or aliased; never reached through a computed step; a constructor
  // handed on only as a `.filter(Boolean)`-shaped callback, the pinned number of times; `Object.assign` never writes
  // into one; and every road to a prototype or a property descriptor is closed.
  const uses = builtinUses(src);
  for (const u of uses) {
    const shown = `${u.root}${u.chain} ${u.after}`;
    if (u.form === "assign" && !A.assign.includes(u.text)) v.push(`${P.builtin} a builtin is assigned, updated or deleted (${shown}): ${u.text.slice(0, 100)}`);
    if (u.form === "bare") v.push(`${P.builtin} a builtin handed on or bound as a value — an alias a patch can go through (${shown}): ${u.text.slice(0, 100)}`);
    if (u.chain.includes("[")) v.push(`${P.builtin} a builtin reached through a computed step (${shown}): ${u.text.slice(0, 100)}`);
  }
  if (uses.filter((u) => u.form === "assign").length !== A.assign.length) v.push(`${P.builtin} ${uses.filter((u) => u.form === "assign").length} assignment(s) to a builtin, not the ${A.assign.length} enumerated`);
  // (Round 10: `.filter(Boolean)`-shaped callbacks are no longer COUNTED — handing Boolean, Number or String to a
  // mapper calls it and redefines nothing; round 9's count pin turned one more honest `.filter(Boolean)` red.)
  for (let k = 0; k + 3 < T.length; k++) {
    if (T[k].text === "Object" && T[k + 1]?.text === "." && ["assign", "defineProperty", "defineProperties", "setPrototypeOf"].includes(T[k + 2]?.text) && T[k + 3]?.text === "(" && BUILTIN_ROOTS.has(T[k + 4]?.text ?? "")) v.push(`${P.builtin} Object.${T[k + 2].text} writes into the builtin ${T[k + 4].text}`);
  }
  const PROTO_ROADS = new Set(["prototype", "__proto__", "defineProperty", "defineProperties", "setPrototypeOf", "getPrototypeOf", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__", "getOwnPropertyDescriptor", "getOwnPropertyDescriptors", "Proxy"]);
  for (const l of namedLines((x) => PROTO_ROADS.has(x.name))) if (!A.prototypeLines.includes(l)) v.push(`${P.builtin} a road to a prototype, a descriptor or a proxy: ${l.slice(0, 100)}`);
  // console and process — the run.log sink and the process — only in the enumerated forms (a new form, such as
  // `process.stdout` bound to a name, is an alias of a sink).
  if (file === "harness") {
    const cp = consoleProcessForms(uses);
    for (const [key, n] of Object.entries(cp)) if (A.consoleProcess[key] !== n) v.push(`${P.builtin} console/process used as «${key}» ${n} time(s), not the ${A.consoleProcess[key] ?? 0} enumerated`);
    for (const key of Object.keys(A.consoleProcess)) if (!(key in cp)) v.push(`${P.builtin} console/process form «${key}» is gone`);
  }
  // CALLER INTROSPECTION — code names: a `.stack` / `["stack"]` member, the stack-trace hooks anywhere, a bare
  // `arguments`, a `.caller` / `.callee` member, the call-site APIs.
  const CALLER_ANYWHERE = new Set(["captureStackTrace", "prepareStackTrace", "stackTraceLimit", "getCallSites", "callSite", "callSites"]);
  for (const l of namedLines((x) => (x.member && ["stack", "caller", "callee"].includes(x.name)) || (!x.member && x.name === "arguments") || CALLER_ANYWHERE.has(x.name))) if (!A.stackLines.includes(l)) v.push(`${P.caller} caller introspection: ${l.slice(0, 100)}`);
  // EVERY ROAD TO A BUILTIN THAT NAMES NO IMPORT (round 8's L6, now in both files) — code names — eval-capable or
  // introspecting modules, a child `node -e`, and a dynamic import beyond the enumerated ones.
  const NO_IMPORT = new Set(["globalThis", "getBuiltinModule", "constructor", "Reflect", "WebAssembly", "createRequire", "_linkedBinding", "dlopen", "mainModule"]);
  for (const l of namedLines((x) => NO_IMPORT.has(x.name) || (x.member && x.name === "binding" && T[x.k - 2]?.text === "process") || (!x.member && x.name === "require" && T[x.k + 1]?.text === "(") || (!x.member && x.name === "global" && !(T[x.k + 1]?.text === ":" && (T[x.k - 1]?.text === "{" || T[x.k - 1]?.text === ","))))) v.push(`${P.noImport} a builtin reached without an import: ${l.slice(0, 100)}`);
  for (let k = 0; k < T.length; k++) {
    const t = T[k];
    if (t.type !== "str" && t.type !== "tpl") continue;
    const spec = T[k - 1]?.type === "id" && (T[k - 1].text === "from" || T[k - 1].text === "import") ? true : T[k - 1]?.text === "(" && T[k - 2]?.type === "id" && T[k - 2].text === "import";
    if (spec && /^(?:node:)?(?:vm|module|inspector|worker_threads|repl|v8|async_hooks|wasi|trace_events)$/.test(t.text)) v.push(`${P.noImport} an eval-capable or introspecting module: ${codeLineAt(src, t.at).slice(0, 100)}`);
  }
  for (const t of T.filter((x) => x.type === "str" && ["-e", "--eval", "-p", "--print", "--import", "--require", "-r", "--loader", "--experimental-loader", "--input-type"].includes(x.text))) v.push(`${P.noImport} a child node told to evaluate code («${t.text}»)`);
  const dyn = [...new Set(T.filter((t, k) => t.type === "id" && t.text === "import" && T[k + 1]?.text === "(" && T[k - 1]?.text !== ".").map((t) => codeLineAt(src, t.at)))];
  if (JSON.stringify(dyn) !== JSON.stringify(A.dynamicImports)) v.push(`${P.noImport} the dynamic imports are not the enumerated ones: ${JSON.stringify(dyn).slice(0, 200)}`);
  // AN ESCAPED IDENTIFIER — a name spelt with a unicode escape (a backslash, «u», 0065 for «e», then «val») is `eval`
  // to the engine and to no name gate; outside a literal, a backslash has no other use.
  if (T.some((t) => t.type === "punct" && t.text === "\\")) v.push(`${P.escape} an escaped identifier (a backslash outside every literal)`);
  return v;
}

/** THE WRONG-LEG CADENCE — where every EFFECT of a profile lands (round 9, from the round-8 verifier's V8-H3). A
 *  profile only ever changes WHEN this leg rests and, once, books a brake; so a line keyed on its effect — a rest held
 *  long, a stretch driven, a brake booked, a count of rests, the rest phase — must read the cadence's own state, or
 *  sit inside the cadence, or sit under a guard on the leg being wrong. All three are pinned:
 *    H7a the wrong-leg cadence block itself (`if (MODE !== "right") { if (phase === "flat") … }`), line for line;
 *    H7b outside it, every line naming the cadence's own state, a wrong-leg phase literal, or a leg-mode test;
 *    H7c outside it, every statement a condition on that state, or a guard on the leg being wrong, controls. */
const CADENCE_STATE_RE = /\b(?:flatM|flatRestAt|restLogged|stopsMade|shotStopped|FLAT_REST_EVERY_M|FLAT_REST_MAX_MS|FLAT_REST_HOLD_MS|FLAT_REST_GIVEUP_MS)\b|["'`]flat(?:-rest)?["'`]/;
const LEG_MODE_TEST_RE = /\b(?:LEG_)?MODE\s*(?:!==|===|!=|==)\s*["'`](?:right|wrong|path)["'`]|["'`](?:right|wrong|path)["'`]\s*(?:!==|===|!=|==)\s*(?:LEG_)?MODE\b/;
const WRONG_LEG_GUARD_RE = /\b(?:LEG_)?MODE\s*!==?\s*["'`]right["'`]|\b(?:LEG_)?MODE\s*===?\s*["'`]wrong["'`]|["'`]right["'`]\s*!==?\s*(?:LEG_)?MODE\b|["'`]wrong["'`]\s*===?\s*(?:LEG_)?MODE\b/;
/** The wrong-leg cadence block's source span, or null. */
function cadenceBlockSpan(src) {
  const T = lexTokens(src);
  for (let k = 0; k < T.length; k++) {
    if (T[k].type !== "id" || T[k].text !== "if" || T[k + 1]?.text !== "(") continue;
    const c = closeOf(T, k + 1);
    if (squash(src.slice(T[k + 2].at, T[c].at)) !== 'MODE !== "right"' || T[c + 1]?.text !== "{") continue;
    if (T[c + 2]?.text !== "if" || T[c + 3]?.text !== "(" || squash(src.slice(T[c + 4].at, T[closeOf(T, c + 3)].at)) !== 'phase === "flat"') continue;
    return [T[k].at, T[closeOf(T, c + 1)].end];
  }
  return null;
}
const codeLinesOf = (s) => stripComments(s).split("\n").map((l) => l.trim()).filter(Boolean);
function effectGateViolations(src) {
  const span = cadenceBlockSpan(src);
  if (span === null) return ['H7a UNREADABLE: the wrong-leg cadence block — `if (MODE !== "right") { if (phase === "flat") …` — is not in the harness'];
  const v = [...orderedPinViolations("H7a the wrong-leg cadence block", codeLinesOf(src.slice(span[0], span[1])), CADENCE_BLOCK_PIN)];
  const outside = `${src.slice(0, span[0])}\n${src.slice(span[1])}`;
  // ROUND 10 (N09): the leg-mode tests are DERIVED from the harness's own code (`legModeVariables`) — `STEER_BY ===
  // "none"` is true on exactly the wrong legs — on top of round 9's `MODE` / `LEG_MODE` forms.
  const lm = legModeVariables(src);
  v.push(...orderedPinViolations("H7b a line outside the cadence block naming its state, a wrong-leg phase or a leg-mode test", codeLinesOf(outside).filter((l) => CADENCE_STATE_RE.test(l) || LEG_MODE_TEST_RE.test(l) || lineHasLegModeTest(l, lm) || lineNamesLegCarrier(l, lm)), EFFECT_LINES_PIN));
  const T = lexTokens(src);
  const controlled = [];
  for (let k = 0; k < T.length; k++) {
    if (T[k].type !== "id" || !["if", "while"].includes(T[k].text) || T[k + 1]?.text !== "(" || (T[k].at >= span[0] && T[k].at < span[1])) continue;
    const c = closeOf(T, k + 1);
    const head = src.slice(T[k + 2].at, T[c].at);
    const guard = legGuardKind(T, k + 2, c, lm);
    if (!CADENCE_STATE_RE.test(head) && !WRONG_LEG_GUARD_RE.test(head) && guard !== "wrong" && !lineNamesLegCarrier(head, lm)) {
      // …and a guard that always holds on a right leg: its ELSE runs on wrong legs, so the else chain is pinned.
      if (guard === "else" && T[k].text === "if") {
        let thenEnd = c + 1;
        if (T[c + 1]?.text === "{") thenEnd = closeOf(T, c + 1) + 1;
        else {
          for (let d = 0; thenEnd < T.length; thenEnd++) {
            const x = T[thenEnd];
            if (x.type !== "punct") continue;
            if ("([{".includes(x.text)) d++;
            else if (")]}".includes(x.text)) d--;
            else if (x.text === ";" && d === 0) break;
          }
          thenEnd += 1;
        }
        if (T[thenEnd]?.type === "id" && T[thenEnd].text === "else") {
          const e = statementEnd(T, c + 1);
          controlled.push(`else of if (${squash(head)}): ${squash(src.slice(T[thenEnd].at, T[e - 1].end))}`);
        }
      }
      continue;
    }
    const e = statementEnd(T, c + 1);
    controlled.push(squash(src.slice(T[k].at, T[e - 1].end)));
  }
  v.push(...orderedPinViolations("H7c a statement a condition on the cadence's state, or on the leg being wrong, controls", controlled, EFFECT_CONTROLLED_PIN));
  return v;
}
/** THE CLAIM LITERALS — «a literal» of clause (i): every harness literal (escapes undone) that carries a product
 *  ACTOR or ACTION word or the booking verb is one of the pinned 4112566 literals; a new one, anywhere in the harness,
 *  is a claim about the product nobody has read yet. */
const HARNESS_CLAIM_WORDS = new Set([
  ...FORBIDDEN_WORDS.actor,
  ...FORBIDDEN_WORDS.action,
  // …and the verdict verbs a claim about the product is also made of
  "booked", "booking", "book", "counts", "counted", "offence", "offences", "offense", "offenses", "violation", "violations", "triggers",
  "triggered", "flags", "flagged", "deducts", "deducted", "scores", "scored", "fined", "verdict", "verdicts", "judge", "judges", "judged", "judging",
  // round 10 (N06–N08): «the sim» is the harness's own everyday word for the product, so a claim in its idiom is one
  "sim", "sims", "simulator", "simulators",
]);
function claimLiteralViolations(src) {
  // (round 10: `carriesClaim` — the words above, or a «…» quote holding Cyrillic, which is a product title)
  return multisetPinViolations("H8 a harness literal carrying a product actor, action or verdict word, «sim», or a quoted Cyrillic title", claimLiteralsOf(src), CLAIM_LITERALS_PIN);
}
/** THE PROFILE'S STATE KEYS — every key of every declared profile's state, built and driven here — that no harness
 *  line named at 4112566 (`HARNESS_NAMED_STATE_KEYS` holds the ones it does, most of them words of its own): a
 *  harness line that names one is keyed on the profile's state, whatever object it reached it through. */
function profileStateKeys() {
  if (profileStateKeys.cache) return profileStateKeys.cache;
  const keys = new Set();
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    for (const [k, x] of Object.entries(o)) { keys.add(k); if (!Array.isArray(x)) walk(x); }
  };
  for (const id of WRONG_LEG_PROFILES.keys()) {
    for (const platform of ["pc", "mobile"]) {
      let st = createWrongLegProfile(id, { zoneSpan: id === "sc-pk-busstop-ban" ? SPAN : null, platform });
      walk(st);
      const r = wrongLegFlatStep(st, { now: 1000, t0: 0, kmh: 30, flatStepM: 4, dtMs: 500, postedKmh: 50, follow: null, probeAt: 1000 });
      walk(r);
      st = wrongLegRestOpportunity(r.state, { holdRest: false, suppress: true, force: false, flatM: 50, sincePhaseMs: 1000, phaseTicks: 1, everyM: 45, maxMs: 20_000 });
      const b = wrongLegRestBooked(st, { now: 2000, t0: 0, holdMs: 8000, kmh: 0 });
      walk(b);
      walk(wrongLegProfileFinish(b.state, { now: 3000, t0: 0, driveEnded: true }).state);
    }
  }
  profileStateKeys.cache = Object.freeze([...keys].filter((k) => !/^\d+$/.test(k)).sort());
  return profileStateKeys.cache;
}
/** A state key is DISTINCTIVE when no ordinary harness word could be it: camelCase or an ALL_CAPS design key of five
 *  characters or more, or `opportunities` (a plain word, but only ever the profile's tally). */
const distinctiveStateKey = (k) => (k.length >= 5 && /[A-Z_]/.test(k)) || k === "opportunities";
function stateKeyViolations(src) {
  const code = stripComments(src);
  const banned = profileStateKeys().filter((k) => distinctiveStateKey(k) && !HARNESS_NAMED_STATE_KEYS.includes(k));
  const v = [];
  const seen = new Set();
  for (const m of code.matchAll(new RegExp(`(?<![\\w$])(?:${banned.map((k) => k.replace(/[$]/g, "\\$")).join("|")})(?![\\w$])`, "g"))) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    const line = code.slice(code.lastIndexOf("\n", m.index) + 1, code.indexOf("\n", m.index) < 0 ? code.length : code.indexOf("\n", m.index)).trim();
    v.push(`H10 the harness names «${m[0]}», a key of the profile's state no harness line named at 4112566: ${line.slice(0, 100)}`);
  }
  return v;
}
/** THE DIRECT PRINTS — every harness line that writes to stdout, stderr or a file (clause i, «a direct print that
 *  skips the renderer»), pinned; and THE STATUS OBJECT AND THE SIDECAR — the one object and the one file the profile's
 *  state rides after the drive — reached only in the enumerated forms (clause ii, «computed property access that
 *  names a declared profile key»: with them pinned, no computed name has anything to index). */
function directPrintViolations(src) {
  // (round 10, N05: any `.stdout` / `.stderr` member, whatever object reached the process — `P.stdout.write(…)`)
  const printed = codeLinesOf(src).filter((l) => /\bconsole\s*\.|\bprocess\s*\.\s*std(?:out|err)\b|\.\s*std(?:out|err)\b|\bwriteFileSync\s*\(|\bappendFileSync\b|\bcreateWriteStream\b|\bwriteSync\b|\bfs\s*\.\s*write\w*\s*\(/.test(l));
  return orderedPinViolations("H11 a direct print", printed, DIRECT_PRINTS_PIN);
}
function statusFormViolations(src) {
  const T = lexTokens(src);
  const forms = {};
  for (let k = 0; k < T.length; k++) {
    if (T[k].type !== "id" || T[k].text !== "status") continue;
    const spread = T[k - 1]?.text === "." && T[k - 2]?.text === "." && T[k - 3]?.text === ".";
    if (!spread && T[k - 1]?.text === ".") continue;
    if (T[k + 1]?.text === ":" && (T[k - 1]?.text === "{" || T[k - 1]?.text === ",")) continue;
    const f = `${spread ? "..." : T[k - 1]?.text ?? ""} status ${T[k + 1]?.text ?? ""}${T[k + 1]?.text === "." ? T[k + 2]?.text ?? "" : ""}`;
    forms[f] = (forms[f] ?? 0) + 1;
  }
  const v = [];
  if (JSON.stringify(Object.entries(forms).sort()) !== JSON.stringify(Object.entries(STATUS_FORMS_PIN).sort())) v.push(`H12 the status object is reached as ${JSON.stringify(forms)}, not the enumerated ${JSON.stringify(STATUS_FORMS_PIN)}`);
  const code = codeLinesOf(src);
  v.push(...orderedPinViolations("H12 a line naming the status file or its path", code.filter((l) => /_audit-status\.json|\bSTATUS\b/.test(l)), STATUS_FILE_LINES_PIN));
  return v;
}
/** ROUND 9, the harness: the effect gate, the claim literals, the mechanism bans, the state keys, the direct prints
 *  and the status forms. */
function round9HarnessViolations(src) {
  return [...effectGateViolations(src), ...claimLiteralViolations(src), ...mechanismViolations(src, "harness"), ...stateKeyViolations(src), ...directPrintViolations(src), ...statusFormViolations(src)];
}
/** ROUND 9, the lib: the mechanism bans over the WHOLE lib, the renderer's own text pinned (L10 — V8-L1 edited the
 *  one function L1 does not read), and no declared lesson, profile or zone id in §1–§4's code (L11). */
function round9LibViolations(lib) {
  const v = [...mechanismViolations(lib, "lib")];
  const head = lib.indexOf(" * 5 · WRONG-LEG PROFILES");
  const sec5 = stripComments(lib.slice(lib.lastIndexOf("/*", head)));
  const sq = squash(sec5);
  for (const d of RENDERER_PINNED) if (!sq.includes(d)) v.push(`L10 the renderer is not its pinned text any more: ${d.slice(0, 90)}…`);
  if ((sq.match(/\bfunction renderProfileText\(/g) ?? []).length !== 1 || (sq.match(/\bfunction profileText\(/g) ?? []).length !== 1) v.push("L10 the renderer or profileText is declared other than once");
  const before = stripComments(lib.slice(0, lib.lastIndexOf("/*", head)));
  const lits = lexTokens(before).filter((t) => t.type === "str" || t.type === "tpl").map((t) => t.text.toLowerCase());
  for (const id of DECLARED_NAMES()) if (lits.some((l) => l.includes(id.toLowerCase()))) v.push(`L11 §1–§4 of the lib name «${id}», a declared or withdrawn profile's id, name or zone`);
  for (const seg of DISTINCTIVE_ID_SEGMENTS()) if (lits.some((l) => l.includes(seg))) v.push(`L11 §1–§4 of the lib carry «${seg}», a distinctive segment of a declared id`);
  return v;
}
/* ═══ ROUND 9 GATES (region end) ═══ */

/* ═══ ROUND 10 GATES (region start — scratchpad/pedal/r10/make-pins-r10.mjs slices this region to compute the pins) ═══
 *
 * The round-9 verifier showed the name bans were SPELLING bans (BAN-IS-A-SPELLING-BAN: `[][kC][kP]` with kC built by
 * join), that the lib had a print no gate read (LIB-DIRECT-PRINT-N17), and that H8 and H3 had word and fragment
 * gaps (H8-WORD-GAP-AND-ID-FRAGMENTS). Round 10 answers each STRUCTURALLY, under the corrected threat model (quoted
 * above §W11):
 *   · the NAME bans read CODE TOKENS — identifiers and literal computed keys — never string contents or comments;
 *   · THE LIB: no `console`, `process`, `stdout` or `stderr` token anywhere in it (L13), its claim literals a pinned
 *     census over the WHOLE file (L14), three censuses (L15–L17), and a RUNTIME integrity check in a child process
 *     that no spelling evades (`libRuntimeViolations`);
 *   · THE HARNESS: three censuses — computed access whose key is not a literal (M8), destructuring rooted in a
 *     builtin (M9), member access on a literal or constructed receiver (M10) — and every read of the scenario id
 *     (H3d); the leg-mode guards H7 reads are DERIVED from the harness's own code (`legModeVariables`); H8 reads
 *     «sim» and a quoted Cyrillic title. */

/** The code line (comments stripped, trimmed) holding offset `at` of `src`. */
function codeLineAt(src, at) {
  const a = src.lastIndexOf("\n", at - 1) + 1;
  const e = src.indexOf("\n", at);
  return stripComments(src.slice(a, e < 0 ? src.length : e)).trim();
}
/** Is `t` the end of an expression (so a `[` right after it is a member access, not an array literal)? */
const EXPR_KEYWORDS = new Set(["return", "typeof", "case", "in", "of", "new", "delete", "void", "throw", "yield", "await", "else", "do", "const", "let", "var", "if", "while", "for", "instanceof", "export", "import", "from", "extends"]);
const exprEnd = (t) => !!t && ((t.type === "id" && !EXPR_KEYWORDS.has(t.text)) || t.type === "str" || t.type === "tpl" || t.type === "num" || t.type === "regex" || (t.type === "punct" && (t.text === ")" || t.text === "]")));
/** Is `T[k]` (a `[`) a COMPUTED MEMBER ACCESS — `x[…]`, `f()[…]`, `a[0][…]`, `x?.[…]`? */
const computedAt = (T, k) => T[k]?.type === "punct" && T[k].text === "[" && k > 0 && ((exprEnd(T[k - 1]) && T[k - 1].end === T[k].at) || (T[k - 1].text === "." && T[k - 2]?.text === "?" && T[k - 2].end === T[k - 1].at));
/** EVERY NAME THE CODE USES (round 10, BANS-HONEST-AND-OVERBREADTH): each identifier token, and each computed key that
 *  is a plain string (`x["constructor"]` names «constructor» as surely as `x.constructor`). Literal CONTENTS are not
 *  names: «arguments» in a log note is prose. `member` marks a name reached as a property. */
function codeNames(src, T = lexTokens(src)) {
  const out = [];
  for (let k = 0; k < T.length; k++) {
    const t = T[k];
    if (t.type === "id") {
      const member = T[k - 1]?.type === "punct" && T[k - 1].text === "." && !(T[k - 2]?.text === "." && T[k - 3]?.text === ".");
      out.push({ name: t.text, member, at: t.at, k });
    } else if (computedAt(T, k)) {
      const c = closeOf(T, k);
      const inner = T.slice(k + 1, c);
      if (inner.length === 1 && (inner[0].type === "str" || (inner[0].type === "tpl" && !inner[0].text.includes("${}")))) out.push({ name: decodeEscapes(inner[0].text), member: true, at: t.at, k, key: true });
    }
  }
  return out;
}
/** The operator starting at `T[j]`, `&&` `||` `??` and the comparisons included (the lexer emits one character a token). */
const HEAD_OPS = ["===", "!==", "&&", "||", "??", "==", "!=", ">=", "<=", "=>"];
function mergedOps(T, a, b) {
  const out = [];
  for (let k = a; k < b; k++) {
    const t = T[k];
    if (t.type !== "punct") { out.push(t); continue; }
    let s = t.text;
    let e = k;
    while (e + 1 < b && T[e + 1].type === "punct" && T[e + 1].at === T[e].end && HEAD_OPS.some((m) => m.startsWith(s + T[e + 1].text))) { s += T[e + 1].text; e++; }
    out.push({ type: "punct", text: s, at: t.at, end: T[e].end });
    k = e;
  }
  return out;
}

/* ── THE LEG MODE, DERIVED FROM THE HARNESS'S OWN CODE (round 10, from N09) ──────────────────────────────────────
 * Round 9's guards knew `MODE` and `LEG_MODE` by name; `STEER_BY === "none"` is true on exactly the wrong legs and
 * no gate read it. So the list is DERIVED, never hand-listed: the ROOT is the identifier the harness validates
 * against a literal list holding "wrong" (`["right", "wrong", "path"].includes(LEG_MODE)`), its values that list,
 * and every `const X = …` whose initializer names a known leg-mode variable is evaluated for each leg mode — other
 * free names ranging over true/false, up to two of them — until nothing new is found. A variable whose initializer
 * calls anything or builds an object is not evaluable, and is reported, not guessed. */
function legModeVariables(src) {
  // memoised on the source text (the gate reads it for H7b, H7c and H3d on every planted copy)
  const cache = (legModeVariables.cache ??= new Map());
  if (cache.has(src)) return cache.get(src);
  const r = legModeVariablesRaw(src);
  cache.set(src, r);
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  return r;
}
function legModeVariablesRaw(src) {
  const code = stripComments(src);
  const m = code.match(/if \(!\[((?:\s*"[a-z]+",?)+)\]\.includes\((\w+)\)\)/);
  if (!m || !/"wrong"/.test(m[1])) return { root: null, modes: [], vars: new Map(), opaque: [] };
  const modes = JSON.parse(`[${m[1]}]`);
  const root = m[2];
  const vars = new Map([[root, Object.fromEntries(modes.map((x) => [x, [x]]))]]);
  const decls = [...code.matchAll(/^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*(.+?);\s*$/gm)].map((d) => ({ name: d[1], expr: d[2] }));
  const opaque = new Set();
  for (let changed = true; changed; ) {
    changed = false;
    for (const d of decls) {
      if (vars.has(d.name)) continue;
      const known = [...vars.keys()].filter((k) => new RegExp(`(?<![\\w$.])${k.replace(/\$/g, "\\$")}(?![\\w$])`).test(d.expr));
      if (!known.length) continue;
      const T = lexTokensRaw(d.expr); // (not the memo: a one-line lex would evict the harness's token array)
      const free =[...new Set(T.filter((t, k) => t.type === "id" && T[k - 1]?.text !== "." && !known.includes(t.text) && !["true", "false", "null", "undefined", "typeof", "void"].includes(t.text)).map((t) => t.text))];
      if (free.length > 2) { opaque.add(d.name); continue; }
      const vals = {};
      let ok = true;
      for (const mode of modes) {
        const got = new Set();
        // every combination of the known variables' possible values on this mode and of each free name as a boolean
        let combos = [[]];
        for (const k of known) combos = combos.flatMap((c) => vars.get(k)[mode].map((x) => [...c, x]));
        for (const c of combos) {
          for (let bits = 0; bits < 1 << free.length && ok; bits++) {
            try {
              const r = new Function(...known, ...free, `return (${d.expr});`)(...c, ...free.map((_, i) => ((bits >> i) & 1) === 1));
              if (r !== null && (typeof r === "object" || typeof r === "function")) ok = false;
              else got.add(r);
            } catch {
              ok = false;
            }
          }
        }
        vals[mode] = [...got].sort();
      }
      if (ok) {
        vars.set(d.name, vals);
        changed = true;
      } else opaque.add(d.name);
    }
  }
  // THE MODE-CARRYING OBJECTS: a top-level (column-0) declaration built by a CALL one of whose direct arguments is a
  // leg-mode expression that reads differently on a right leg and a wrong one (`createHazardBooks(MODE === "right",
  // MODE)` — its `.active` is false on exactly the wrong legs). Its fields cannot be evaluated here, so every line
  // naming it is a leg-mode line (H7b) and every statement a condition naming it controls is pinned (H7c). A profile
  // name is H1's, never a carrier.
  const carriers = [];
  const T = lexTokens(src);
  const evalArg = (text) => {
    const known = [...vars.keys()].filter((k) => new RegExp(`(?<![\\w$.])${k.replace(/\$/g, "\\$")}(?![\\w$])`).test(text));
    if (!known.length) return null;
    const out = {};
    for (const mode of ["right", "wrong"]) {
      let combos = [[]];
      for (const k of known) combos = combos.flatMap((c) => (vars.get(k)[mode] ?? []).map((x) => [...c, x]));
      const got = new Set();
      for (const c of combos) {
        try { got.add(JSON.stringify(new Function(...known, `return (${text});`)(...c))); } catch { return null; }
      }
      out[mode] = [...got].sort().join("|");
    }
    return out;
  };
  for (let k = 0; k < T.length; k++) {
    const t = T[k];
    if (t.type !== "id" || !["const", "let"].includes(t.text) || !(t.at === 0 || src[t.at - 1] === "\n")) continue;
    if (T[k + 1]?.type !== "id" || T[k + 2]?.text !== "=" || T[k + 3]?.text === "=") continue;
    const name = T[k + 1].text;
    if (vars.has(name) || /^wrong(?:Leg)?Profile/.test(name)) continue;
    const f = k + 3;
    if (T[f]?.type !== "id" || T[f + 1]?.text !== "(") continue;
    const close = closeOf(T, f + 1);
    const args = [];
    for (let q = f + 2, a = f + 2, d = 0; q <= close; q++) {
      const x = T[q];
      if (x.type === "punct" && "([{".includes(x.text)) d++;
      else if (x.type === "punct" && ")]}".includes(x.text)) { if (q === close) { if (q > a) args.push(src.slice(T[a].at, T[q - 1].end)); break; } d--; }
      else if (x.type === "punct" && x.text === "," && d === 0) { if (q > a) args.push(src.slice(T[a].at, T[q - 1].end)); a = q + 1; }
    }
    if (args.some((a) => { const v = evalArg(a); return v !== null && v.right !== v.wrong; })) carriers.push(name);
  }
  return { root, modes, vars, opaque: [...opaque].filter((n) => !vars.has(n)).sort(), carriers: [...new Set(carriers)] };
}
/** Does this line name a mode-carrying object, or compare anything with the «wrong» leg's own literal (`x.mode ===
 *  "wrong"`, `dir.endsWith("-wrong")`)? */
function lineNamesLegCarrier(line, lm) {
  if ((lm.carriers ?? []).some((c) => new RegExp(`(?<![\\w$.])${c.replace(/\$/g, "\\$")}(?![\\w$])`).test(line))) return true;
  return /(?:===|!==|==|!=)\s*["'`][^"'`]*\bwrong["'`]|["'`][^"'`]*\bwrong["'`]\s*(?:===|!==|==|!=)|\.\s*(?:includes|startsWith|endsWith|indexOf|match|test|search)\s*\(\s*["'`/][^"'`/]*\bwrong\b/.test(line);
}
/** Three-valued truth of a condition head (tokens `T[a..b)`) on a leg of `mode`: "T", "F" or "U". Its leg-mode atoms
 *  — a derived variable compared with a literal, or a bare derived boolean — are evaluated; every other operand is
 *  unknown. */
function headTruth(T, a, b, lm, mode) {
  const toks = mergedOps(T, a, b);
  let i = 0;
  const and3 = (x, y) => (x === "F" || y === "F" ? "F" : x === "T" && y === "T" ? "T" : "U");
  const or3 = (x, y) => (x === "T" || y === "T" ? "T" : x === "F" && y === "F" ? "F" : "U");
  const not3 = (x) => (x === "T" ? "F" : x === "F" ? "T" : "U");
  const truthOf = (vals, test) => {
    const r = vals.map(test);
    return r.every(Boolean) ? "T" : r.some(Boolean) ? "U" : "F";
  };
  const atom = (xs) => {
    if (xs.length >= 2 && xs[0].text === "(" && closeOf(xs, 0) === xs.length - 1) return evalFrom(xs.slice(1, -1));
    const isVar = (x) => x?.type === "id" && lm.vars.has(x.text);
    if (xs.length === 1 && isVar(xs[0])) return truthOf(lm.vars.get(xs[0].text)[mode], (v) => !!v);
    if (xs.length === 3 && ["===", "!==", "==", "!="].includes(xs[1].text)) {
      const [l, , r] = xs;
      const v = isVar(l) && r.type === "str" ? [l, r.text] : isVar(r) && l.type === "str" ? [r, l.text] : null;
      if (v) return truthOf(lm.vars.get(v[0].text)[mode], (x) => (xs[1].text.startsWith("=") ? x === v[1] : x !== v[1]));
    }
    return "U";
  };
  function evalFrom(xs) {
    const save = [toksRef, i];
    toksRef = xs;
    i = 0;
    const r = orExpr();
    [toksRef, i] = save;
    return r;
  }
  let toksRef = toks;
  function orExpr() {
    let v = andExpr();
    while (toksRef[i]?.text === "||" || toksRef[i]?.text === "??") {
      const op = toksRef[i++].text;
      const r = andExpr();
      v = op === "||" ? or3(v, r) : "U";
    }
    return v;
  }
  function andExpr() {
    let v = notExpr();
    while (toksRef[i]?.text === "&&") { i++; v = and3(v, notExpr()); }
    return v;
  }
  function notExpr() {
    if (toksRef[i]?.text === "!") { i++; return not3(notExpr()); }
    const start = i;
    let depth = 0;
    while (i < toksRef.length) {
      const t = toksRef[i];
      if (t.type === "punct" && "([{".includes(t.text)) depth++;
      else if (t.type === "punct" && ")]}".includes(t.text)) depth--;
      else if (depth === 0 && t.type === "punct" && (t.text === "&&" || t.text === "||" || t.text === "??")) break;
      i++;
    }
    return atom(toksRef.slice(start, i));
  }
  return orExpr();
}
/** What a condition head says about the leg: `wrong` (it can hold on a wrong leg and never on a right one), `else`
 *  (it always holds on a right leg and can fail on a wrong one — so its ELSE runs on wrong legs), or null. */
function legGuardKind(T, a, b, lm) {
  if (!lm.vars.size) return null;
  const can = (mode, want) => headTruth(T, a, b, lm, mode) !== want;
  if (can("wrong", "F") && !can("right", "F")) return "wrong";
  if (can("wrong", "T") && !can("right", "T")) return "else";
  return null;
}
/** Does this line hold a leg-mode atom whose truth DIFFERS between a wrong leg and a right one? */
function lineHasLegModeTest(line, lm) {
  if (!lm.vars.size) return false;
  if (![...lm.vars.keys()].some((k) => line.includes(k))) return false;
  const T = lexTokensRaw(line); // (not the memo: a one-line lex would evict the harness's token array)
  const toks = mergedOps(T, 0, T.length);
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.type !== "id" || !lm.vars.has(t.text) || toks[k - 1]?.text === ".") continue;
    const vals = lm.vars.get(t.text);
    const cmp = toks[k + 1] && ["===", "!==", "==", "!="].includes(toks[k + 1].text) && toks[k + 2]?.type === "str" ? [toks[k + 1].text, toks[k + 2].text]
      : toks[k - 1] && ["===", "!==", "==", "!="].includes(toks[k - 1].text) && toks[k - 2]?.type === "str" ? [toks[k - 1].text, toks[k - 2].text] : null;
    const test = cmp ? (x) => (cmp[0].startsWith("=") ? x === cmp[1] : x !== cmp[1]) : (x) => !!x;
    if (!cmp && !vals.wrong.every((x) => typeof x === "boolean")) continue;
    const w = vals.wrong.map(test);
    const r = vals.right.map(test);
    if (JSON.stringify([...new Set(w)].sort()) !== JSON.stringify([...new Set(r)].sort())) return true;
  }
  return false;
}

/* ── THE CENSUSES (round 10, item C) — every construct a spelling-evading mechanism needs, pinned, so any new one is a
 *    visible red that needs a re-pin ─────────────────────────────────────────────────────────────────────────────── */
/** (1) Every COMPUTED member access whose key is not a string or number literal, as `receiver[key]` text. */
function computedKeyCensus(src) {
  const T = lexTokens(src);
  const out = [];
  for (let k = 1; k < T.length; k++) {
    if (!computedAt(T, k)) continue;
    const c = closeOf(T, k);
    const inner = T.slice(k + 1, c);
    const literal = inner.length === 1 && (inner[0].type === "str" || inner[0].type === "num" || (inner[0].type === "tpl" && !inner[0].text.includes("${}")));
    if (literal) continue;
    const recv = T[k - 1].text === "." ? "?." : T[k - 1].type === "str" || T[k - 1].type === "tpl" ? `"${T[k - 1].text}"` : T[k - 1].text;
    out.push(squash(`${recv}${src.slice(T[k].at, T[c].end)}`));
  }
  return out;
}
/** (2) Every DESTRUCTURING whose right-hand side, or one of whose targets, is rooted in a builtin — `const { log } =
 *  console`, `({ log: console.log } = …)`, `for (const [k, v] of Object.entries(…))` — as its statement text. */
function builtinDestructuringCensus(src) {
  const T = lexTokens(src);
  const out = [];
  const rooted = (a, b) => {
    for (let k = a; k < b; k++) {
      const t = T[k];
      if (t.type !== "id" || !BUILTIN_ROOTS.has(t.text)) continue;
      if (T[k - 1]?.type === "punct" && T[k - 1].text === "." && !(T[k - 2]?.text === "." && T[k - 3]?.text === ".")) continue;
      if (T[k + 1]?.text === ":" && (T[k - 1]?.text === "{" || T[k - 1]?.text === ",")) continue; // an object key
      return true;
    }
    return false;
  };
  for (let k = 0; k < T.length; k++) {
    const t = T[k];
    if (t.type !== "punct" || (t.text !== "{" && t.text !== "[")) continue;
    const prev = T[k - 1];
    const decl = prev?.type === "id" && ["const", "let", "var"].includes(prev.text);
    if (!decl && t.text === "[" && computedAt(T, k)) continue; // an index
    const c = closeOf(T, k);
    if (c < 0) continue;
    const after = mergedOps(T, c + 1, Math.min(T.length, c + 4))[0];
    const assign = after?.type === "punct" && after.text === "=";
    const forOf = decl && after?.type === "id" && after.text === "of";
    if (!(decl && (assign || forOf)) && !(!decl && assign && (prev?.text === "(" || prev?.text === ";" || prev?.text === "{" || prev?.text === "}" || !prev))) continue;
    // the right-hand side: to the first `;` `,` or unmatched `)` at depth 0 (for-of: to the loop's `)`)
    let e = c + 1;
    while (e < T.length && !(T[e].type === "punct" && T[e].text === "=") && !(T[e].type === "id" && T[e].text === "of")) e++;
    let depth = 0;
    let r = e + 1;
    for (; r < T.length; r++) {
      const x = T[r];
      if (x.type !== "punct") continue;
      if ("([{".includes(x.text)) depth++;
      else if (")]}".includes(x.text)) { if (depth === 0) break; depth--; }
      else if ((x.text === ";" || x.text === ",") && depth === 0) break;
    }
    if (rooted(k, c + 1) || rooted(e + 1, r)) out.push(squash(src.slice(t.at, T[Math.max(e + 1, r - 1)].end)));
  }
  return out;
}
/** (3) Every MEMBER ACCESS on a LITERAL or CONSTRUCTED receiver — `[…].x`, `"…".x`, `` `…`.x ``, a number, a regex,
 *  `({…}).x`, `(() => 0).x` / `(function …).x`, `new X(…).x`, `Builtin(…).x` — dot or computed, as receiver text +
 *  member. */
const BUILTIN_CTORS = new Set(["Array", "Object", "String", "Number", "Boolean", "Symbol", "BigInt", "Error", "TypeError", "RangeError", "SyntaxError", "Function", "RegExp", "Date", "Promise", "Map", "Set", "WeakMap", "WeakSet", "Proxy"]);
function openOf(T, j) {
  let d = 0;
  for (let k = j; k >= 0; k--) {
    const x = T[k];
    if (x.type !== "punct") continue;
    if (")]}".includes(x.text)) d++;
    else if ("([{".includes(x.text)) { d--; if (d === 0) return k; }
  }
  return -1;
}
function literalReceiverCensus(src) {
  const T = lexTokens(src);
  const out = [];
  for (let k = 1; k < T.length; k++) {
    const t = T[k];
    let recvEnd;
    if (t.type === "punct" && t.text === "." && T[k + 1]?.type === "id" && !(T[k - 1]?.text === "." || T[k + 1]?.text === ".")) recvEnd = T[k - 1]?.text === "?" && T[k - 2] && T[k - 1].end === t.at ? k - 2 : k - 1;
    else if (computedAt(T, k)) recvEnd = T[k - 1].text === "." ? k - 3 : k - 1;
    else continue;
    const p = T[recvEnd];
    if (!p) continue;
    let kind = null;
    let from = recvEnd;
    if (p.type === "str" || p.type === "tpl" || p.type === "num" || p.type === "regex") kind = p.type;
    else if (p.type === "punct" && p.text === "]") {
      const o = openOf(T, recvEnd);
      if (o >= 0 && !computedAt(T, o)) { kind = "array"; from = o; }
    } else if (p.type === "punct" && p.text === ")") {
      const o = openOf(T, recvEnd);
      if (o < 0) continue;
      const before = T[o - 1];
      const inner = T.slice(o + 1, recvEnd);
      const top = mergedOps(inner, 0, inner.length);
      let arrow = false;
      for (let q = 0, d = 0; q < top.length; q++) {
        if (top[q].type === "punct" && "([{".includes(top[q].text)) d++;
        else if (top[q].type === "punct" && ")]}".includes(top[q].text)) d--;
        else if (d === 0 && top[q].text === "=>") arrow = true;
      }
      if (!exprEnd(before) || before?.type === "id" && EXPR_KEYWORDS.has(before.text)) {
        if (arrow || (inner[0]?.type === "id" && (inner[0].text === "function" || inner[0].text === "async"))) { kind = "function"; from = o; }
        else if (inner[0]?.text === "{" && closeOf(T, o + 1) === recvEnd - 1) { kind = "object"; from = o; }
        else if (inner[0]?.text === "[" && closeOf(T, o + 1) === recvEnd - 1) { kind = "array"; from = o; }
      } else if (before?.type === "id" && T[o - 2]?.text === "new") { kind = "new"; from = o - 2; }
      else if (before?.type === "id" && BUILTIN_CTORS.has(before.text) && T[o - 2]?.text !== ".") { kind = "constructed"; from = o - 1; }
    } else if (p.type === "punct" && p.text === "}") {
      const o = openOf(T, recvEnd);
      const b = T[o - 1];
      if (o >= 0 && b && ((b.type === "punct" && ["=", "(", ",", ":", "?", "["].includes(b.text)) || (b.type === "id" && b.text === "return"))) { kind = "object"; from = o; }
    }
    if (kind === null) continue;
    const memberEnd = t.text === "." ? T[k + 1].end : T[closeOf(T, k)].end;
    out.push(`${kind} ${squash(src.slice(T[from].at, memberEnd))}`);
  }
  return out;
}
/** THE SCENARIO ID, READ (round 10, H3d, from N06/N07): every code line naming the scenario id's variable — the
 *  binding the harness hands the product as `?scenario=${…}` — and every line that reads the other argv bindings as
 *  a receiver or a comparison operand (the out dir carries the lesson id by the sweep's convention, N16), or reads the
 *  page's URL. A line keyed on a fragment of ANY length is a new line here. */
function scenarioIdCarriers(src) {
  const code = stripComments(src);
  const scenario = code.match(/[?&]scenario=\$\{(\w+)\}/)?.[1] ?? null;
  const argv = code.match(/^const \[([^\]]*)\] = process\.argv\.slice\(2\);$/m)?.[1]?.split(",").map((s) => s.trim().split(/\s*=/)[0]) ?? [];
  return { scenario, argv };
}
function scenarioReadCensus(src) {
  const T = lexTokens(src);
  const { scenario, argv } = scenarioIdCarriers(src);
  const root = legModeVariables(src).root;
  // the other argv bindings that carry the lesson id by convention (the out dir), not the leg mode or the platform
  const others = argv.filter((a) => a !== scenario && a !== root && a !== "PLATFORM");
  const isCmp = (x) => x?.type === "punct" && (x.text === "=" || x.text === "!");
  const lineStarts = new Set();
  for (let k = 0; k < T.length; k++) {
    const t = T[k];
    if (t.type !== "id") continue;
    const member = T[k - 1]?.text === ".";
    const read =
      (!member && t.text === scenario) ||
      (!member && others.includes(t.text) && ((T[k + 1]?.text === "." && T[k + 3]?.text === "(") || (isCmp(T[k + 1]) && isCmp(T[k + 2])) || (isCmp(T[k - 1]) && isCmp(T[k - 2])))) ||
      (!member && t.text === "location") ||
      (member && t.text === "url" && T[k + 1]?.text === "(");
    if (read) lineStarts.add(src.lastIndexOf("\n", t.at - 1) + 1);
  }
  return [...lineStarts].sort((a, b) => a - b).map((a) => codeLineAt(src, a));
}

/** THE CLAIM PREDICATE H8 AND L14 SHARE (round 10: «sim» / «simulator», and a «…» quote holding Cyrillic — a fault
 *  title is the product's own words, N06–N08). */
const QUOTED_CYRILLIC = /«[^»]*\p{Script=Cyrillic}[^»]*»/u;
const carriesClaim = (s) => wordsOf(s).some((w) => HARNESS_CLAIM_WORDS.has(w)) || QUOTED_CYRILLIC.test(s);
const claimLiteralsOf = (src) => lexTokens(src).filter((t) => t.type === "str" || t.type === "tpl").map((t) => decodeEscapes(t.text)).filter(carriesClaim);

/** ROUND 10, the harness: the three censuses and every read of the scenario id. */
function round10HarnessViolations(src) {
  return [
    ...multisetPinViolations("M8 a computed member access whose key is not a string or number literal", computedKeyCensus(src), CENSUS_COMPUTED_PIN),
    ...multisetPinViolations("M9 a destructuring whose right-hand side or target is rooted in a builtin", builtinDestructuringCensus(src), CENSUS_DESTRUCTURE_PIN),
    ...multisetPinViolations("M10 a member access on a literal or constructed receiver", literalReceiverCensus(src), CENSUS_RECEIVER_PIN),
    ...multisetPinViolations("H3d a line that reads the scenario id (or the out dir, or the page's URL)", scenarioReadCensus(src), SCENARIO_READS_PIN),
  ];
}
/** ROUND 10, the lib: no print (L13), the claim literals of the WHOLE lib (L14), the three censuses (L15–L17). */
function round10LibViolations(lib) {
  const v = [];
  for (const x of codeNames(lib).filter((x) => ["console", "process", "stdout", "stderr"].includes(x.name))) v.push(`L13 the lib names «${x.name}» in its code — the lib prints nothing, and reaches no process: ${codeLineAt(lib, x.at).slice(0, 100)}`);
  v.push(...multisetPinViolations("L14 a lib literal carrying a product actor, action or verdict word, «sim», or a quoted Cyrillic title", claimLiteralsOf(lib), LIB_CLAIM_LITERALS_PIN));
  v.push(...multisetPinViolations("L15 a computed member access whose key is not a string or number literal", computedKeyCensus(lib), LIB_CENSUS_COMPUTED_PIN));
  v.push(...multisetPinViolations("L16 a destructuring whose right-hand side or target is rooted in a builtin", builtinDestructuringCensus(lib), LIB_CENSUS_DESTRUCTURE_PIN));
  v.push(...multisetPinViolations("L17 a member access on a literal or constructed receiver", literalReceiverCensus(lib), LIB_CENSUS_RECEIVER_PIN));
  return v;
}

/* ── THE LIB'S RUNTIME INTEGRITY CHECK (round 10, item C) ───────────────────────────────────────────────────────
 * The lib is importable, so its bans are ALSO enforced where no spelling can evade them: a CHILD process snapshots
 * every own property descriptor (value, getter, setter, flags) and the extensibility of the builtin prototypes and
 * namespaces the threat model names — and their constructors, `console`, `process`, `globalThis`, `process.stdout` /
 * `process.stderr` and their prototype chains — then imports the lib and drives EVERY export over the profile
 * fixtures, diffing after the import, after each export's first 40 calls and every 200th after them, after the battery's last
 * call and after the event loop has turned (a change is attributed to the first diff that sees it). Any change is a
 * violation, however it was spelt. The child's own stdout and stderr must stay EMPTY (it reports on fd 3), and it
 * must report. The driving module is served under the HARNESS's own URL and `process.argv` reads as the harness's,
 * so a lib that gates a patch or a print on its caller's file name fires here too. */
const INTEGRITY_CHILD = [
  'import { registerHooks, builtinModules } from "node:module";',
  'import { readFileSync, writeSync } from "node:fs";',
  "const input = JSON.parse(readFileSync(0, \"utf8\"));",
  "process.argv.splice(0, process.argv.length, process.execPath, input.harnessPath, input.outDir, \"sc-pk-busstop-ban\", \"pc\", \"wrong\");",
  "process.execArgv.splice(0, process.execArgv.length);",
  "registerHooks({ load(url, context, next) {",
  "  if (url === input.harnessUrl) return { format: \"module\", source: input.battery, shortCircuit: true };",
  "  if (url === input.libUrl && typeof input.planted === \"string\") return { format: \"module\", source: input.planted, shortCircuit: true };",
  "  return next(url, context);",
  "} });",
  // Lazy globals replace their getter with a value on first read: read each one now, so the lib's first read of one is
  // not a change. (`--eval` exposes every builtin module as a lazy global too — `punycode`, `sys`, `wasi` warn when
  // read — and a real harness has none of them: those are left as getters, so a lib that reads one is a change.)
  "for (const k of Reflect.ownKeys(globalThis)) { if (typeof k === \"string\" && builtinModules.includes(k)) continue; try { void globalThis[k]; } catch {} }",
  "const targets = [];",
  "const add = (name, o) => { if (o && (typeof o === \"object\" || typeof o === \"function\") && !targets.some(([, x]) => x === o)) targets.push([name, o]); };",
  "for (const n of [\"Array\", \"String\", \"Object\", \"Function\", \"Error\", \"Number\", \"Boolean\", \"RegExp\", \"Symbol\", \"Promise\", \"Map\", \"Set\", \"Date\", \"TypeError\", \"RangeError\", \"SyntaxError\"]) { add(n, globalThis[n]); add(`${n}.prototype`, globalThis[n].prototype); }",
  "add(\"ArrayIterator.prototype\", Object.getPrototypeOf([][Symbol.iterator]()));",
  "add(\"Iterator.prototype\", Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())));",
  "for (const n of [\"JSON\", \"Math\", \"Reflect\", \"console\", \"process\", \"globalThis\"]) add(n, globalThis[n]);",
  "for (const s of [\"stdout\", \"stderr\"]) { let o = process[s]; let i = 0; while (o && o !== Object.prototype) { add(`process.${s}${\".__proto__\".repeat(i)}`, o); o = Object.getPrototypeOf(o); i++; } }",
  "const snap = () => { const m = new Map(); for (const [name, o] of targets) { m.set(`${name} [extensible]`, { value: Object.isExtensible(o) }); for (const k of Reflect.ownKeys(o)) { const d = Object.getOwnPropertyDescriptor(o, k); if (/^process\\.std(?:out|err)/.test(name) && \"value\" in d && typeof d.value !== \"function\") continue; m.set(`${name} ${String(k)}`, d); } } return m; };",
  "const same = (a, b) => a && b && Object.is(a.value, b.value) && a.get === b.get && a.set === b.set && a.writable === b.writable && a.enumerable === b.enumerable && a.configurable === b.configurable;",
  "const S0 = snap();",
  "const active0 = process.getActiveResourcesInfo();",
  "const diffs = []; const seen = new Set(); const calls = new Map();",
  // Every export's first 40 calls are each followed by a full diff, then every 200th; the import, the battery's end
  // and the turned event loop always are. (A full diff after each of ~40,000 calls took 150 s.)
  "const after = (label, force = false) => { const n = (calls.get(label) ?? 0) + 1; calls.set(label, n); if (!force && n > 40 && n % 200 !== 0) return; const S = snap(); for (const k of new Set([...S0.keys(), ...S.keys()])) { if (seen.has(k)) continue; const a = S0.get(k), b = S.get(k); if (!same(a, b)) { seen.add(k); diffs.push({ at: label, key: k, change: !a ? \"added\" : !b ? \"removed\" : \"redefined\" }); } } };",
  "let res = null; let err = null;",
  "try { const B = await import(input.harnessUrl); after(\"import\", true); res = B.run(after); after(\"the battery's last call\", true); } catch (e) { err = String(e && e.name); }",
  "const activeMid = process.getActiveResourcesInfo();",
  "await new Promise((r) => setImmediate(r));",
  "await new Promise((r) => setTimeout(r, 30));",
  "after(\"the event loop turning\", true);",
  "const count = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});",
  "const c0 = count(active0), c1 = count(activeMid);",
  "const activeNew = Object.keys(c1).filter((k) => (c1[k] ?? 0) > (c0[k] ?? 0)).map((k) => `${k} ×${c1[k] - (c0[k] ?? 0)}`);",
  "writeSync(3, JSON.stringify({ stage: \"done\", err, diffs, called: res ? res.called : [], functions: res ? res.functions : [], errors: res ? res.errors.length : null, activeNew, props: S0.size, targets: targets.map(([n]) => n), diffsRun: [...calls.values()].reduce((a, n) => a + Math.min(n, 40) + Math.floor(Math.max(0, n - 40) / 200), 0), calls: [...calls.values()].reduce((a, n) => a + n, 0) }));",
  "process.exit(0);",
].join("\n");
/** THE BATTERY the child drives every export with — stringified and served as the harness's own module. It is
 *  self-contained (no name from this file): the harness's own sequence over every declared profile, every platform
 *  and five kinds of leg, then every template, then every other export with generic arguments. */
function integrityBattery(L, after) {
  const called = new Set();
  const errors = [];
  const call = (name, ...args) => {
    called.add(name);
    let out;
    try { out = L[name](...args); } catch (e) { errors.push(`${name}: ${e && e.name}`); }
    after(name);
    return out;
  };
  const EVERY_M = 45, MAX_MS = 20000, HOLD_MS = 8000, TICK = 516, GIVEUP_MS = 11000, T0 = 10000;
  const lead = { present: true, parsed: true, meters: 40, heldSec: 1.1, needSec: 2, short: true, label: "x" };
  const kinds = [
    { name: "plain", ticks: 80 },
    { name: "lead", ticks: 110, follow: (i) => (i % 17 < 12 ? lead : null) },
    { name: "discs", ticks: 90, posted: (i) => (i < 70 ? 50 : 60), unread: (i) => i % 23 === 5 },
    { name: "held", ticks: 90, hold: (i) => i > 10 && i < 50 },
    { name: "never-rests", ticks: 120, noRest: true },
    { name: "long", ticks: 260 },
  ];
  for (const platform of ["pc", "mobile", null]) {
    for (const id of [...L.WRONG_LEG_PROFILES.keys(), "sc-no-such-lesson", null]) {
      for (const k of kinds) {
        const decl = call("wrongLegProfileFor", id);
        const span = decl && decl.kind === "zone-rest" ? call("readZoneRouteSpan", id, decl.zone) : null;
        let st = call("createWrongLegProfile", id, { zoneSpan: span, platform });
        call("wrongLegProfileStartSpec", st, { everyM: EVERY_M });
        call("wrongLegProfileStartLine", st, { everyM: EVERY_M });
        let now = T0, flatM = 0, phaseAt = now, phaseTicks = 0, phase = "flat", restAt = 0, restLogged = false, stops = 0, v = 8;
        for (let i = 0; i < k.ticks; i++) {
          now += TICK;
          if (phase === "flat") v = Math.min(59, v + 5);
          else v = k.noRest ? Math.max(3, v - 20) : Math.max(0, v - 20);
          const kmh = k.unread && k.unread(i) ? -1 : Math.round(v);
          if (phase === "flat") {
            const flatStepM = (Math.max(0, kmh) / 3.6) * (TICK / 1000);
            const r = call("wrongLegFlatStep", st, { now, t0: T0, kmh, flatStepM, dtMs: TICK, postedKmh: k.posted ? k.posted(i) : 50, follow: k.follow ? k.follow(i) : null, probeAt: now - 7 });
            st = r ? r.state : st;
            phaseTicks++;
            flatM += flatStepM;
            const args = { holdRest: k.hold ? k.hold(i) : false, suppress: r ? r.suppressRest : false, force: r ? r.forceRest : false, flatM, sincePhaseMs: now - phaseAt, phaseTicks, everyM: EVERY_M, maxMs: MAX_MS };
            st = call("wrongLegRestOpportunity", st, args);
            if (call("flatRestDue", args)) { phase = "flat-rest"; phaseAt = now; phaseTicks = 0; flatM = 0; restLogged = false; }
          } else {
            phaseTicks++;
            const atRest = kmh >= 0 && kmh <= 1;
            if (atRest && !restLogged) {
              restLogged = true;
              restAt = now;
              stops++;
              const b = call("wrongLegRestBooked", st, { now, t0: T0, holdMs: HOLD_MS, kmh });
              st = b ? b.state : st;
              call("wrongLegRestHoldNoteSpec", st, b, { holdMs: HOLD_MS });
              call("wrongLegRestHoldNote", st, b, { holdMs: HOLD_MS });
            } else if (restLogged) st = call("wrongLegRestTick", st, { kmh, dtMs: TICK });
            call("zoneRestEngaged", st);
            call("resumeThrottleAfterPause", st);
            if (restLogged && call("flatRestHoldDone", { now, restAt, holdMs: HOLD_MS, state: st })) {
              const e = call("wrongLegRestEnded", st, { now, t0: T0 });
              st = e ? e.state : st;
              phase = "flat"; phaseAt = now; phaseTicks = 0; flatM = 0;
            } else if (!restLogged && now - phaseAt >= GIVEUP_MS) {
              const e = call("wrongLegRestEnded", st, { now, t0: T0, gaveUp: true });
              st = e ? e.state : st;
              phase = "flat"; phaseAt = now; phaseTicks = 0; flatM = 0;
            }
          }
        }
        const fin = call("wrongLegProfileFinish", st, { now: now + 300, t0: T0, driveEnded: k.name !== "held" });
        st = fin ? fin.state : st;
        for (const f of ["wrongLegProfileOutcomeSpec", "wrongLegProfileOutcomeLine", "wrongLegRestSummarySpec", "wrongLegRestSummary"]) call(f, st);
        for (const s of [0, 1, stops]) { call("wrongLegRestHoldsSpec", st, { stops: s, holdMs: HOLD_MS }); call("wrongLegRestHoldsClause", st, { stops: s, holdMs: HOLD_MS }); }
      }
    }
  }
  // every template, filled
  const SLOT = /\{([A-Za-z][A-Za-z0-9]*):([a-z0-9]+)(?:\|([^{}]*))?\}/g;
  const txt = [...L.WRONG_LEG_PROFILES.values()][0].name;
  for (const tpl of Object.keys(L.PROFILE_LINE_TEMPLATES)) {
    const f = {};
    for (const [, name, kind] of L.PROFILE_LINE_TEMPLATES[tpl].matchAll(SLOT)) {
      f[name] = kind === "tok" ? "x" : kind === "toks" ? ["x"] : kind === "txt" ? txt : kind === "frag" || kind === "opt" ? L.profileText("verdict.held") : kind === "frags" ? [L.profileText("verdict.held")] : 1;
    }
    const spec = call("profileText", tpl, f);
    call("renderProfileText", spec);
    call("profileText", tpl, {});
  }
  // the pure helpers, with their own fixtures
  call("zoneRestInterval", 100, 59, { decel: 9 });
  call("stopDistanceM", 55, { reactS: 1, decel: 9 });
  call("banZoneRestThresholdSec", "law-bus-stop", { busStopDropOffMaxSec: 20, banZoneStopRestSec: 4 });
  call("dialLagAllowanceMs", "pc", 100);
  call("zoneBrakingModel", 9);
  call("postedLimitKmh", ["Ограничение 50 км/ч"]);
  call("zoneRouteSpanFrom", {});
  call("finishOpenSizing", {}, { active: true, driveEnded: true, maxWallMs: 600 });
  for (let i = 0, s = 0, q = null, r = 0; i < 12; i++) { const x = call("overLimitLedgerStep", { kmh: 58, now: 1000 + i * 500, postedKmh: 50, needKmh: 55, dangerousAboveKmh: 60, overSec: s, resets: r, qualAt: q }); if (x) { s = x.overSec; r = x.resets; q = x.qualAt; } }
  // every other export: called with generic arguments, so a lazy patch in any of them runs here
  // (1.5, not 1: a reader handed a whole number reads that FILE DESCRIPTOR — `readSpeedingConfig(1)` blocked on fd 1)
  const GENERIC = [[], [{}], [null], ["x"], [1.5], [[]], [{ now: 1000, kmh: 60, postedKmh: 50, text: "x", dom: {} }]];
  const functions = Object.keys(L).filter((n) => typeof L[n] === "function");
  for (const n of functions) if (!called.has(n)) for (const a of GENERIC) call(n, ...a);
  // every value export, read through
  const walk = (x, d) => { if (d > 6 || x === null || typeof x !== "object") return; for (const v of x instanceof Map ? x.values() : Object.values(x)) walk(v, d + 1); };
  for (const n of Object.keys(L)) { walk(L[n], 0); after(`read ${n}`); }
  return { called: [...called], functions, errors };
}
/** What the integrity child is handed on stdin: the lib's URL (a planted SOURCE is served under it), the harness's
 *  URL (the battery is served under it) and path, and the battery. */
function integrityInput(libSource) {
  const libUrl = pathToFileURL(resolve(HERE, "..", "lib", "driveline.mjs")).href;
  const harnessPath = resolve(HERE, "..", "lesson-audit.mjs");
  const harnessUrl = pathToFileURL(harnessPath).href;
  const battery = `import * as L from ${JSON.stringify(libUrl)};\nexport function run(after) {\n  return (${integrityBattery.toString()})(L, after);\n}\n`;
  return JSON.stringify({ libUrl, harnessUrl, harnessPath, outDir: resolve(HERE, "..", "..", "..", ".audit-frames", "integrity", "sc-pk-busstop-ban__pc-wrong"), planted: libSource, battery });
}
/** The child's run, as violations: R1 anything on its stdout or stderr, R0 no report or a throw, R2 a builtin
 *  descriptor that changed, R3 an export the battery never called, R4 work the lib left scheduled. */
function integrityVerdict({ stdout, stderr, fd3, status, signal, error }) {
  const v = [];
  if (stdout) v.push(`R1 the lib wrote to stdout while it was imported and driven: ${JSON.stringify(stdout.slice(0, 160))}`);
  if (stderr) v.push(`R1 the lib wrote to stderr while it was imported and driven: ${JSON.stringify(stderr.slice(0, 160))}`);
  let rep = null;
  try { rep = JSON.parse(fd3 ?? ""); } catch { rep = null; }
  if (!rep || rep.stage !== "done") return { v: [...v, `R0 the integrity child did not report (status ${status}, signal ${signal}, error ${error ?? "-"})`], rep: null };
  if (rep.err) v.push(`R0 importing or driving the lib threw ${rep.err}`);
  for (const d of rep.diffs) v.push(`R2 a builtin was ${d.change}: ${d.key} — first seen after ${d.at}`);
  const uncalled = rep.functions.filter((n) => !rep.called.includes(n));
  if (uncalled.length) v.push(`R3 the battery drove no call of: ${uncalled.join(", ")}`);
  if (rep.activeNew.length) v.push(`R4 the lib left work scheduled after its calls returned: ${rep.activeNew.join(", ")}`);
  return { v, rep };
}
/** Run the lib (or a planted copy of its SOURCE, served under the lib's own URL) through the integrity child. */
function libRuntimeViolations(libSource = null) {
  const r = spawnSync(process.execPath, ["--input-type=module", "--eval", INTEGRITY_CHILD], {
    input: integrityInput(libSource),
    stdio: ["pipe", "pipe", "pipe", "pipe"],
    encoding: "utf8",
    maxBuffer: 64 << 20,
    timeout: 180_000,
  });
  const { v, rep } = integrityVerdict({ stdout: r.stdout, stderr: r.stderr, fd3: r.output?.[3], status: r.status, signal: r.signal, error: r.error?.code });
  libRuntimeViolations.last = rep;
  return v;
}
/** …the same, as a promise, so the test can run several planted copies at once (each child is its own process). */
function libRuntimeViolationsAsync(libSource = null) {
  return new Promise((done) => {
    const ch = spawn(process.execPath, ["--input-type=module", "--eval", INTEGRITY_CHILD], { stdio: ["pipe", "pipe", "pipe", "pipe"] });
    const bufs = { 1: [], 2: [], 3: [] };
    for (const k of [1, 2, 3]) ch.stdio[k].on("data", (d) => bufs[k].push(d));
    const timer = setTimeout(() => ch.kill(), 180_000);
    ch.on("error", () => {});
    ch.on("close", (status, signal) => {
      clearTimeout(timer);
      const text = (k) => Buffer.concat(bufs[k]).toString("utf8");
      done(integrityVerdict({ stdout: text(1), stderr: text(2), fd3: text(3), status, signal, error: null }).v);
    });
    ch.stdin.end(integrityInput(libSource));
  });
}
/** Run several sources through the child, `n` at a time. */
async function libRuntimeViolationsAll(sources, n = 4) {
  const out = new Array(sources.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, sources.length) }, async () => {
    while (next < sources.length) {
      const i = next++;
      out[i] = await libRuntimeViolationsAsync(sources[i]);
    }
  }));
  return out;
}

/* ── THE SIZING CLAIMS (round 10, from FALSE-SELF-STATEMENT-REFUSAL-SIZING) ─────────────────────────────────────
 * Every «sized on», «measured» or «census» a template or a table text says is REGISTERED with the population its
 * number is over, which the sentence must name; and every bound such a sentence cites is checked, on specs the lib
 * itself builds, against the declared constant (`sizingBoundViolations`). */
const SIZING_CLAIM_WORDS = /\bsized on\b|\bmeasured\b|\bcensus\b/gi;
const SIZING_CLAIMS = [
  // [template, the sentence, the population it names]
  ["refused.platform", "in the harness's odometer census of {legs:n} archived wrong legs ({mobile:n} of them mobile, measured {at:tok})", "{legs:n} archived wrong legs ({mobile:n} of them mobile"],
  ["census.odo", "census odometer ratio {rmin:n}–{rmax:n}, sized on a census of {legs:n} of this lesson's archived pc wrong legs ({lo:n}–{hi:n}) with its low end widened to {rmin:n}, the reading of a sc-signal-flashing mobile wrong leg", "a census of {legs:n} of this lesson's archived pc wrong legs"],
  ["census.react", "census reaction {min:n}–{max:n} s, from percentile 5 to the maximum of a census of {n:n} flat to flat-rest transitions on archived wrong legs", "a census of {n:n} flat to flat-rest transitions on archived wrong legs"],
  ["census.lfPc", "sized on a census of {legs:n} of this lesson's archived pc wrong legs", "a census of {legs:n} of this lesson's archived pc wrong legs"],
  ["census.lfMobile", "in a census of {legs:n} of this lesson's archived mobile wrong legs", "a census of {legs:n} of this lesson's archived mobile wrong legs"],
  ["census.lfOther", "for a platform this lesson's tick-cost census does not name", "this lesson's tick-cost census"],
  ["say.braking", "dead reckoning over the census bands named here, each with the population it is sized on; not a measured position", "each with the population it is sized on"],
  ["obs.zoneMissed", "by the census odometer ratio's high end {rmax:n}, the highest of a census of {legs:n} of this lesson's archived pc wrong legs", "a census of {legs:n} of this lesson's archived pc wrong legs"],
  ["zone.est", "dead reckoning over census bands sized on {legs:n} of this lesson's archived pc wrong legs and {n:n} flat to flat-rest transitions on archived wrong legs, not a measured position", "{legs:n} of this lesson's archived pc wrong legs and {n:n} flat to flat-rest transitions on archived wrong legs"],
  ["sizing.finish", "beside each probe's measured wait", "each probe's"],
  ["unmet.discUnread", "the profile is sized on one disc read on every tick", "one disc"],
  ["unmet.discChanged", "the profile is sized on one disc", "one disc"],
];
/** …and in the profile table's printed texts: [lesson, field, the sentence, the population]. */
const TABLE_SIZING_CLAIMS = [
  ["sc-pk-busstop-ban", "told", "the odometer ratio band sized on a census of 12 of this lesson's archived pc wrong legs with its low end widened to the reading of a sc-signal-flashing mobile wrong leg", "a census of 12 of this lesson's archived pc wrong legs"],
  ["sc-pk-busstop-ban", "told", "the reaction band of a census of 322 flat to flat-rest transitions on archived wrong legs", "a census of 322 flat to flat-rest transitions on archived wrong legs"],
];
function sizingClaimViolations(templates = PROFILE_LINE_TEMPLATES, profiles = WRONG_LEG_PROFILES) {
  const v = [];
  const covered = (text, list, at) => list.some(([says]) => { const i = text.indexOf(says); return i >= 0 && at >= i && at < i + says.length; });
  for (const [id, t] of Object.entries(templates)) {
    for (const re of FALSE_SELF_STATEMENTS) if (re.test(t)) v.push(`${id}: a false self-statement is back (${re})`);
    const mine = SIZING_CLAIMS.filter(([tpl]) => tpl === id).map(([, says, pop]) => [says, pop]);
    for (const m of t.matchAll(SIZING_CLAIM_WORDS)) if (!covered(t, mine, m.index)) v.push(`${id}: «${m[0]}» in a sentence nobody registered with its population: ${t.slice(Math.max(0, m.index - 60), m.index + 60)}`);
  }
  for (const [id, says, pop] of SIZING_CLAIMS) {
    if (!(templates[id] ?? "").includes(says)) v.push(`${id}: does not carry its registered sizing sentence «${says.slice(0, 80)}»`);
    if (!says.includes(pop)) v.push(`${id}: the registered sentence does not name its population «${pop}»`);
  }
  // the braking line's «named here»: the three census fragments ARE its slots
  for (const slot of ["{odoBand:frag}", "{creepBand:frag}", "{reactBand:frag}"]) if (!(templates["say.braking"] ?? "").includes(slot)) v.push(`say.braking: «the census bands named here» — ${slot} is not in it`);
  for (const [lesson, field] of [...profiles].flatMap(([id, p]) => [[id, "told", p.told], [id, "row", p.row]].map(([a, b]) => [a, b]))) {
    const text = profiles.get(lesson)[field];
    const mine = TABLE_SIZING_CLAIMS.filter(([l, f]) => l === lesson && f === field).map(([, , says, pop]) => [says, pop]);
    for (const re of FALSE_SELF_STATEMENTS) if (re.test(text)) v.push(`${lesson}.${field}: a false self-statement is back (${re})`);
    for (const m of text.matchAll(SIZING_CLAIM_WORDS)) if (!covered(text, mine, m.index)) v.push(`${lesson}.${field}: «${m[0]}» in a sentence nobody registered with its population`);
  }
  for (const [lesson, field, says, pop] of TABLE_SIZING_CLAIMS) {
    if (!(profiles.get(lesson)?.[field] ?? "").includes(says)) v.push(`${lesson}.${field}: does not carry its registered sizing sentence`);
    if (!says.includes(pop)) v.push(`${lesson}.${field}: the registered sentence does not name its population`);
  }
  return v;
}
/** The specs every sizing sentence is printed from, built by the lib's own code paths. */
function sizingSpecsFromLib(L = LIBNS) {
  const span = L.readZoneRouteSpan("sc-pk-busstop-ban", L.wrongLegProfileFor("sc-pk-busstop-ban").zone);
  const refused = L.createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: span, platform: "mobile" }).refused;
  let st = L.createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: span, platform: "pc" });
  let braking = null;
  let now = 10_000;
  for (const kmh of FLAT_SERIES) {
    now += FLAT_TICK_MS;
    const r = L.wrongLegFlatStep(st, { now, t0: 10_000, kmh, flatStepM: (kmh / 3.6) * (FLAT_TICK_MS / 1000), dtMs: FLAT_TICK_MS, postedKmh: 50, follow: null, probeAt: now });
    st = r.state;
    if (r.forceRest) { braking = r.say.spec; break; }
  }
  const noRest = L.wrongLegRestEnded(st, { now, t0: 10_000, gaveUp: true }).state.observed;
  const missed = L.wrongLegFlatStep(L.createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: span, platform: "pc" }), { now: 1, t0: 0, kmh: 1, flatStepM: 1000, dtMs: 500 }).state.observed;
  const finish = Object.fromEntries(["pc", "mobile", "null"].map((p) => [p, L.createWrongLegProfile("sc-signal-flashing", { platform: p === "null" ? null : p }).sizedFrom.f.detail]));
  return { refused, odoBand: refused?.f?.odo, braking, brakingOdo: braking?.f?.odoBand, creepBand: braking?.f?.creepBand, reactBand: braking?.f?.reactBand, est: noRest?.f?.est, missed, finish, told: L.WRONG_LEG_PROFILES.get("sc-pk-busstop-ban").told };
}
/** Every bound a sizing sentence cites, against the declared constant it must be. */
function sizingBoundViolations(S = sizingSpecsFromLib(), L = LIBNS) {
  const v = [];
  const eq = (label, got, want) => { if (!Object.is(got, want)) v.push(`${label} is ${got}, not the declared ${want}`); };
  const Z = L.ODO_CENSUS_ZONE_PC, LOW = L.ODO_RATIO_LOW_END, RC = L.REACTION_CENSUS, CC = L.ZONE_CREEP_CENSUS, TC = L.TICKCOST_CENSUS, AW = L.ODO_CENSUS_ALL_WRONG_LEGS;
  if (!Z || !LOW || !RC || !CC || !TC || !AW) return ["a census the sizing sentences cite is not declared"];
  eq("ODO_RATIO_MIN, the band's low end", L.ODO_RATIO_MIN, LOW.ratio);
  eq("ODO_RATIO_MAX, the band's high end", L.ODO_RATIO_MAX, Z.max);
  eq("ZONE_REST_REACT_MIN_S", L.ZONE_REST_REACT_MIN_S, RC.p5);
  eq("ZONE_REST_REACT_MAX_S", L.ZONE_REST_REACT_MAX_S, RC.max);
  if (!(L.ZONE_REST_CREEP_M >= CC.max)) v.push(`ZONE_REST_CREEP_M ${L.ZONE_REST_CREEP_M} is under its census's ${CC.max}`);
  for (const [where, s] of [["the refusal's band", S.odoBand], ["the braking line's band", S.brakingOdo]]) {
    if (s?.tpl !== "census.odo") { v.push(`${where} is not printed through census.odo`); continue; }
    eq(`${where}: the low end`, s.f.rmin, L.ODO_RATIO_MIN);
    eq(`${where}: the high end`, s.f.rmax, L.ODO_RATIO_MAX);
    eq(`${where}: the pc legs`, s.f.legs, Z.legs);
    eq(`${where}: the pc low`, s.f.lo, Z.min);
    eq(`${where}: the pc high`, s.f.hi, Z.max);
  }
  if (S.refused?.tpl !== "refused.platform") v.push("the mobile refusal is not refused.platform");
  else {
    eq("the refusal's census legs", S.refused.f.legs, AW.legs);
    eq("the refusal's census mobile legs", S.refused.f.mobile, AW.mobileLegs);
    eq("the refusal's census minimum", S.refused.f.min, AW.mobileMinRatio);
    eq("the refusal's census date", S.refused.f.at, AW.measured);
    eq("the refusal's band low end", S.refused.f.rmin, L.ODO_RATIO_MIN);
    eq("the refusal's band high end", S.refused.f.rmax, L.ODO_RATIO_MAX);
  }
  if (S.creepBand?.tpl !== "census.creep") v.push("the braking line's creep is not printed through census.creep");
  else {
    eq("the creep", S.creepBand.f.creep, L.ZONE_REST_CREEP_M);
    eq("the creep's legs", S.creepBand.f.legs, CC.legs);
    eq("the creep's low", S.creepBand.f.lo, CC.min);
    eq("the creep's high", S.creepBand.f.hi, CC.max);
  }
  if (S.reactBand?.tpl !== "census.react") v.push("the braking line's reaction band is not printed through census.react");
  else {
    eq("the reaction band's low end", S.reactBand.f.min, L.ZONE_REST_REACT_MIN_S);
    eq("the reaction band's high end", S.reactBand.f.max, L.ZONE_REST_REACT_MAX_S);
    eq("the reaction census's transitions", S.reactBand.f.n, RC.transitions);
  }
  if (S.braking) eq("the braking line's full-stop line", S.braking.f.fs, L.PROFILE_DESIGN.fullStopMaxSpeedKmh.value);
  else v.push("the pc zone profile booked no braking over FLAT_SERIES");
  if (S.missed?.tpl !== "obs.zoneMissed") v.push("the missed line is not obs.zoneMissed");
  else {
    eq("the missed line's high end", S.missed.f.rmax, L.ODO_RATIO_MAX);
    eq("the missed line's pc legs", S.missed.f.legs, Z.legs);
  }
  if (S.est?.tpl !== "zone.est") v.push("the estimate is not zone.est");
  else {
    eq("the estimate's pc legs", S.est.f.legs, Z.legs);
    eq("the estimate's transitions", S.est.f.n, RC.transitions);
  }
  const lf = (p) => S.finish?.[p]?.f?.lfBasis;
  if (lf("pc")?.tpl !== "census.lfPc" || lf("mobile")?.tpl !== "census.lfMobile" || lf("null")?.tpl !== "census.lfOther") v.push("the long-frame allowance is not printed through its census fragment on each platform");
  else {
    eq("the pc long-frame census legs", lf("pc").f.legs, TC.pc.legs);
    eq("the pc long-frame census longest wait", lf("pc").f.max, TC.pc.longestMaxMs);
    eq("the mobile long-frame census legs", lf("mobile").f.legs, TC.mobile.legs);
    eq("the mobile long-frame census low", lf("mobile").f.lo, TC.mobile.longestMinMs);
    eq("the mobile long-frame census high", lf("mobile").f.hi, TC.mobile.longestMaxMs);
    if (!(L.DIAL_LONG_FRAME_ALLOWANCE_MS.pc >= TC.pc.longestMaxMs)) v.push("the pc long-frame allowance is under its census's longest wait");
    eq("the mobile long-frame allowance", L.DIAL_LONG_FRAME_ALLOWANCE_MS.mobile, 0);
  }
  if (!String(S.told).includes(`a census of ${Z.legs} of this lesson's archived pc wrong legs`)) v.push("the zone told names a pc population that is not the declared census's");
  if (!String(S.told).includes(`a census of ${RC.transitions} flat to flat-rest transitions on archived wrong legs`)) v.push("the zone told names a reaction population that is not the declared census's");
  return v;
}
/* ═══ ROUND 10 GATES (region end) ═══ */

describe("§W7 THE LINES ARE STRUCTURAL — one template table, one renderer, a closed vocabulary; and every reading printed is the tally it names", () => {
  it("the closed vocabulary holds NO product actor, NO product action, NO modal and NO causal connective", () => {
    for (const [cls, ws] of Object.entries(FORBIDDEN_WORDS)) {
      for (const w of ws) assert.equal(VOCABULARY.has(w), false, `the vocabulary holds the ${cls} word «${w}»`);
    }
  });

  it("EVERY template is enumerated: its slots parse into the six kinds, and every word it can print is vocabulary", () => {
    const KINDS = new Set(["n", "n1", "n2", "n3", "r", "tok", "toks", "txt", "frag", "opt", "frags"]);
    assert.ok(Object.isFrozen(PROFILE_LINE_TEMPLATES));
    const ids = Object.keys(PROFILE_LINE_TEMPLATES);
    assert.ok(ids.length >= 90, `only ${ids.length} templates — the table has gone thin`);
    for (const id of ids) {
      const t = PROFILE_LINE_TEMPLATES[id];
      assert.equal(typeof t, "string", id);
      for (const m of t.matchAll(TEMPLATE_SLOT_RE)) assert.ok(KINDS.has(m[2]), `${id}: slot «${m[1]}» has an unknown kind «${m[2]}»`);
      assert.ok(!/\{[^{}]*\}/.test(t.replace(TEMPLATE_SLOT_RE, "")), `${id}: a brace that is not a slot`);
      const bad = vocabularyViolations(templateText(t));
      assert.deepEqual(bad, [], `${id}: words outside the observation vocabulary — ${bad.join(", ")}`);
    }
    // …and the verdict words are the only «HELD AS SIZED» a template carries.
    for (const id of ids) {
      const t = PROFILE_LINE_TEMPLATES[id];
      const held = (t.match(/ANTECEDENT (?:NOT )?HELD AS SIZED/g) ?? []).length;
      if (held) assert.ok(t.includes(HELD_AS_SIZED) || t.includes(NOT_HELD_AS_SIZED), id);
    }
    assert.equal(HELD_AS_SIZED, "ANTECEDENT HELD AS SIZED");
    assert.equal(NOT_HELD_AS_SIZED, "ANTECEDENT NOT HELD AS SIZED");
    assert.equal(SIZING_LABEL, "SIZING (the harness's design constants, sized at 4112566; no file is read to size them, and nothing here is a prediction)");
    assert.equal(ZONE_SIZING_LABEL, "SIZING (the harness's design constants, sized at 4112566, and the zone's span and basis, read at drive time from authored content: the world file pk-busstop-v1.json and the lesson's trace file shadow-correct.trace.json; no other file is read to size them, and nothing here is a prediction)");
  });

  it("the profile table's printed texts (`name`, `told`, `row`) are vocabulary too — and no row quotes a claim about the product any more", () => {
    for (const [id, p] of WRONG_LEG_PROFILES) {
      for (const k of ["name", "told", "row"]) {
        const bad = vocabularyViolations(p[k]);
        assert.deepEqual(bad, [], `${id}.${k}: words outside the observation vocabulary — ${bad.join(", ")}`);
      }
      assert.match(p.row, new RegExp(`^${id}:[0-9a-f]{8}`), `${id}'s row does not name its finding`);
    }
    // The residual strings the round-6 verifier named are gone (PRODUCT-CLAIMS-IN-EMITTED-TEXT).
    const sxf = WRONG_LEG_PROFILES.get("sc-signal-flashing");
    for (const gone of ["stepEpisode", "activeSince", "CLEARS", "58.9", "re-derived", "speedingBands puts"]) {
      assert.ok(!sxf.told.includes(gone) && !sxf.row.includes(gone), `sc-signal-flashing still prints «${gone}»`);
    }
    assert.ok(!/\b12 s\b/.test(WRONG_LEG_PROFILES.get("sc-ov-keep-right").row), "the keep-right row still hard-codes 12 s");
  });

  it("THE RENDERER REFUSES FREE TEXT: an unknown template, a missing slot, an extra field, a string where a number belongs, a token with a space, a `txt` not from the table, a fragment that is not a spec", () => {
    const refuses = (spec, re, label) => assert.throws(() => renderProfileText(spec), re, label);
    refuses({ tpl: "no.such.template", f: {} }, /not a profile template spec/, "unknown template");
    refuses("the engine bills it", /not a profile template spec/, "a bare string");
    refuses({ tpl: "ceiling.metres", f: { m: 400 } }, /slot «max» is empty/, "missing slot");
    refuses({ tpl: "ceiling.metres", f: { m: 400, max: 400, note: 1 } }, /slot «note» is not in the template/, "extra field");
    refuses({ tpl: "ceiling.metres", f: { m: "400 m, so the product books it", max: 400 } }, /slot «m» is not a finite number/, "a string in a number slot");
    refuses({ tpl: "ceiling.metres", f: { m: Infinity, max: 400 } }, /not a finite number/, "infinity");
    refuses({ tpl: "obs.open", f: { kind: "finish open and billed" } }, /slot «kind» is not a token/, "a token with spaces");
    refuses({ tpl: "start.zone", f: { zones: ["a b"], basis: "x", from: 1, to: 2, hold: 3 } }, /slot «zones» is not a list of tokens/, "toks with a space");
    refuses({ tpl: "rest.plain", f: { hold: 8, name: "so the product books the stop there" } }, /slot «name» is not one of the profile table's own texts/, "free text in a txt slot");
    refuses({ tpl: "obs.ceiling", f: { why: "the engine fires here" } }, /not a profile template spec/, "a string where a fragment belongs");
    refuses({ tpl: "obs.finishUnmet", f: { unmet: [] } }, /slot «unmet» is not a list of templates/, "an empty list");
    // profileText validates on creation, and its specs are frozen and JSON-safe.
    assert.throws(() => profileText("ceiling.metres", { m: 1 }), /slot «max» is empty/);
    const spec = profileText("ceiling.metres", { m: 400.4, max: 400 });
    assert.ok(Object.isFrozen(spec) && Object.isFrozen(spec.f));
    assert.deepEqual(JSON.parse(JSON.stringify(spec)), spec);
    assert.equal(R(spec), "400 m of flat after the profile started reached its 400 m ceiling");
    // The formats, executed.
    assert.equal(R(profileText("zone.stood", { fs: 1, held: 26.96, stirs: 0, breaks: 0, unread: 0, bar: 27 })).includes("continuously for 27.0 s"), true);
    assert.equal(R(profileText("unmet.endGap", { gap: null, maxWall: null })), "the last flat reading was taken ? ms of wall clock before the finish's clock, and the longest wall interval between two flat readings was NONE ms");
  });

  it("NO OTHER CODE PATH IN §5 EMITS TEXT: outside the template table, the design and profile tables, the evidence records and the one renderer, §5's code holds no template literal and no string with whitespace; the template table is read by the renderer alone", () => {
    const rest = sec5OutsideTextRegions();
    const lits = lexLiterals(rest);
    assert.ok(lits.filter((l) => l.type === "str").length >= 40, "UNREADABLE: the lexer found too few strings in §5");
    assert.deepEqual(lits.filter((l) => l.type === "tpl").map((l) => l.text), [], "a template literal outside the template table — a line built around the renderer");
    assert.deepEqual(lits.filter((l) => l.type === "str" && /\s/.test(l.text)).map((l) => l.text), [], "a string with whitespace outside the template table — text built around the renderer");
    // The table is named in exactly two places in §5's code: its declaration and the renderer.
    assert.equal((SEC5.match(/\bPROFILE_LINE_TEMPLATES\b/g) ?? []).length, 3, "PROFILE_LINE_TEMPLATES is read outside the renderer");
    const [ra, rb] = declSpan(SEC5, "export function renderProfileText(spec) {");
    assert.equal((SEC5.slice(ra, rb).match(/\bPROFILE_LINE_TEMPLATES\b/g) ?? []).length, 2);
    // Every `line:` a profile step or a rest end hands the harness comes from sayLine → the renderer.
    assert.deepEqual(rest.match(/\{\s*loud\b[^}]*\}/g), ["{ loud, line: renderProfileText(spec), spec }"]);
    assert.equal((rest.match(/\bout\.say = /g) ?? []).length, (rest.match(/\bout\.say = sayLine\(/g) ?? []).length, "a mid-drive line is set without sayLine");
    // The lexer can see: a planted template literal and a planted string with a space are found.
    assert.equal(lexLiterals("const a = `WRONG-LEG PROFILE ${x}`;").filter((l) => l.type === "tpl").length, 1);
    assert.equal(lexLiterals('const a = x / 2; const b = "a b"; const r = /"/;').filter((l) => l.type === "str" && /\s/.test(l.text)).length, 1);
  });

  it("ROUND 8 — THE §5 GATE: every text a profile hands the harness is renderProfileText(spec) — pinned wrappers over their …Spec twins, every say null or a FROZEN sayLine, no line assigned after rendering", () => {
    assert.deepEqual(sec5GateViolations(LIB), [], "§5 emits text outside its one renderer");
    // The say objects are frozen and carry the spec they were rendered from.
    const r = drive(make("sc-ov-keep-right"), Array(40).fill(40));
    const say = r.steps.find((s) => s.say !== null).say;
    assert.ok(Object.isFrozen(say), "a say line can be edited after rendering");
    assert.deepEqual(Object.keys(say).sort(), ["line", "loud", "spec"]);
    assert.equal(say.line, renderProfileText(say.spec));
    assert.throws(() => { say.line += " and the product books it"; }, TypeError);
  });

  it("THE §5 GATE CAN FAIL: the round-7 verifier's V7-B1, V7-B2 and V7-E1, re-aimed at round 8's code, and their siblings, planted in a copy of the lib, are caught", () => {
    const plant = (label, anchor, to) => {
      const n = LIB.split(anchor).length - 1;
      assert.equal(n, 1, `${label}: the anchor occurs ${n} time(s)`);
      return [label, LIB.replace(anchor, to)];
    };
    const SP = "String.fromCharCode(32)";
    const OUT_WRAP = "  const spec = wrongLegProfileOutcomeSpec(state);\n  return spec === null ? null : renderProfileText(spec);\n}";
    const HELD_ZONE = '    return { state: s, say: sayLine(false, "say.held", { name: s.name, how: "zone-rest", at: atSec, obs: s.observed }) };';
    const cases = [
      // V7-B1: whitespace-free words joined by a computed space, appended to the outcome line on a mobile leg.
      plant("V7-B1", OUT_WRAP, `  const spec = wrongLegProfileOutcomeSpec(state);\n  const said = spec === null ? null : renderProfileText(spec);\n  return state && state.finish && state.finish.dialLagMs === 200 ? said + ["", "the", "product", "books", "the", "speeding", "here"].join(${SP}) : said;\n}`),
      // V7-B2: text appended to the zone HELD say line after rendering.
      plant("V7-B2", HELD_ZONE, `    const said = sayLine(false, "say.held", { name: s.name, how: "zone-rest", at: atSec, obs: s.observed });\n    return { state: s, say: { ...said, line: said.line + ["", "and", "the", "car", "was", "seen"].join(${SP}) } };`),
      // …the same through an assignment to a fresh object's line.
      plant("a line assigned after rendering", HELD_ZONE, `    const said = { ...sayLine(false, "say.held", { name: s.name, how: "zone-rest", at: atSec, obs: s.observed }) };\n    said.line += ["", "seen"].join(${SP});\n    return { state: s, say: said };`),
      // …a wrapper that renders a DIFFERENT spec than its twin.
      plant("a wrapper off its twin", "  const spec = wrongLegRestSummarySpec(state);\n  return spec === null ? \"\" : renderProfileText(spec);", "  const spec = wrongLegRestSummarySpec(state);\n  return spec === null ? \"\" : renderProfileText(spec) + String.fromCharCode(46);"),
      // …a second rendering path for a line the harness prints.
      plant("a second rendering", "export function wrongLegRestHoldsClause(state, opts) {", "export function wrongLegRestHoldsClauseX(state) {\n  return renderProfileText(profileText(\"end.reached\"));\n}\nexport function wrongLegRestHoldsClause(state, opts) {"),
      // V7-E1: a module-level alias of readFileSync, taken before any spy is installed.
      plant("V7-E1", "const fin = (v) => (typeof v === \"number\" && Number.isFinite(v) ? v : null);\n\n/** A profile's design values", "const fin = (v) => (typeof v === \"number\" && Number.isFinite(v) ? v : null);\nconst rfs = readFileSync;\n\n/** A profile's design values"),
      // V7-E1's sibling: the alias taken OUTSIDE §5, after the lib's imports, where §5 names only the alias.
      plant("the alias outside §5", "import { fileURLToPath } from \"node:url\";\n", "import { fileURLToPath } from \"node:url\";\nconst rfs = readFileSync;\n"),
      // …a module loaded at run time.
      plant("a dynamic import in the lib", "import { fileURLToPath } from \"node:url\";\n", "import { fileURLToPath } from \"node:url\";\nconst fsp = await import(\"node:fs/promises\");\n"),
      // ROUND 8 FINISH — V7-E1's siblings with a COMPUTED name, so no «readFileSync» token anywhere (R8-F04, F05, F12
      // each SURVIVED on the partial): through process.getBuiltinModule, through globalThis, through `.constructor`.
      plant("an alias through getBuiltinModule", "import { fileURLToPath } from \"node:url\";\n", "import { fileURLToPath } from \"node:url\";\nconst rfs = process.getBuiltinModule(\"node:fs\")[\"read\" + \"FileSync\"];\n"),
      plant("an alias through globalThis", "import { fileURLToPath } from \"node:url\";\n", "import { fileURLToPath } from \"node:url\";\nconst rfs = globalThis[\"pro\" + \"cess\"][\"getBuilt\" + \"inModule\"](\"node:fs\")[\"read\" + \"FileSync\"];\n"),
      plant("an alias through .constructor", "import { fileURLToPath } from \"node:url\";\n", "import { fileURLToPath } from \"node:url\";\nconst rfs = (() => 0).constructor(\"return pro\" + \"cess\")().getBuiltinModule(\"node:fs\")[\"read\" + \"FileSync\"];\n"),
      // …and the round-7 bypasses the round-7 gate already caught, kept caught.
      plant("R7-B01", '    out.say = sayLine(false, "say.held", { name: s.name, how, at: atSec, obs });', '    out.say = { loud: false, line: "held at t=" + atSec };'),
    ];
    for (const [label, lib] of cases) {
      assert.notEqual(lib, LIB, `${label}: nothing was planted`);
      assert.ok(sec5GateViolations(lib).length > 0, `${label}: the planted bypass passed the §5 gate`);
    }
  });

  it("NO OTHER CODE PATH IN THE HARNESS EMITS PROFILE TEXT (round 8: the gate reads EVERY profile name, and every statement a profile condition controls)", () => {
    // THE GATE, on the harness as it is: nothing.
    assert.deepEqual(harnessGateViolations(SRC), [], "the harness composes, keys or prints a profile line outside §5's renderer");
    // …and it can see: every line it scans exists (a moved wiring is a violation too, not a silent pass).
    const touching = CODE.split("\n").filter((l) => new RegExp(`\\b(?:${PROFILE_NAME_ALT()})\\b`).test(l));
    assert.equal(touching.length, HARNESS_ALLOWED_LINES.reduce((a, [, n]) => a + n, 0), "UNREADABLE: the lines naming a profile value are not the enumerated ones");
    assert.equal(harnessControlled(SRC, isProfileNameWord).length, HARNESS_CONTROLLED.length);
    // …the sidecar key is one of the names it reads (round 8 finish), and it occurs on exactly one line — the spread.
    assert.deepEqual(touching.filter((l) => /\bwrongLegProfile\b/.test(l)).map((l) => l.trim()), ['...(MODE !== "right" && wrongProfile.declared ? { wrongLegProfile: wrongProfile } : {}),']);
    // …every generic id segment it exempts IS carried by a harness literal today, and no distinctive one is.
    const lits = lexTokens(SRC).filter((t) => t.type === "str" || t.type === "tpl").map((t) => t.text.toLowerCase());
    for (const seg of GENERIC_ID_SEGMENTS) assert.ok(lits.some((l) => l.includes(seg)), `«${seg}» is exempted as generic, and no harness literal carries it`);
    assert.deepEqual(DISTINCTIVE_ID_SEGMENTS(), ["busstop", "flashing", "marking", "motorway", "pkbs", "pocket", "spray", "truck"]);
    // …and the sinks it pins are the ones every profile line is printed through.
    assert.equal(CODE.split("\n").filter((l) => l === HARNESS_LOUD_SINK).length, 1);
    assert.equal(squash(CODE).split(HARNESS_NOTE_SINK).length - 1, 1);
    // The fields the harness reads off the state: three flags, nothing a line could print.
    assert.deepEqual([...new Set([...CODE.matchAll(/\bwrongProfile\.(\w+)/g)].map((m) => m[1]))].sort(), ["declared", "heldAsSized", "on"]);
    assert.deepEqual([...new Set([...CODE.matchAll(/\bwrongProfileStep\.(\w+)/g)].map((m) => m[1]))].sort(), ["forceRest", "say", "state", "suppressRest"]);
    assert.deepEqual([...new Set([...CODE.matchAll(/\bwrongProfileRest\.(\w+)/g)].map((m) => m[1]))].sort(), ["state"]);
    assert.deepEqual([...new Set([...CODE.matchAll(/\bwrongProfileRestEnd\.(\w+)/g)].map((m) => m[1]))].sort(), ["say", "state"]);
    // No template interpolates a profile value — except the pinned fallback of the holds clause, which is the old words.
    assert.deepEqual([...CODE.matchAll(/\$\{[^}]*\b(?:wrongProfile\w*|wrongLeg\w+)\b[^}]*\}/g)].map((m) => m[0]), [], "a template in the harness interpolates a profile value");
    // THE SINKS: each text §5 renders reaches the log at exactly one statement shape.
    assert.equal((CODE.match(/\bwrongProfileStart\b/g) ?? []).length, 3);
    assert.equal((CODE.match(/\bwrongProfileStep\.say\b/g) ?? []).length, 3);
    assert.equal((CODE.match(/\bwrongProfileRestEnd\.say\b/g) ?? []).length, 6);
    assert.equal((CODE.match(/\bwrongProfileRestNote\b/g) ?? []).length, 2);
    assert.equal((CODE.match(/\bwrongProfileRestHolds\b/g) ?? []).length, 2);
    assert.equal((CODE.match(/\bwrongProfileOutcome\b/g) ?? []).length, 3);
    assert.match(CODE, /\(wrongProfileRestNote \?\?\s*`\$\{FLAT_REST_HOLD_MS \/ 1000\}s — twice the engine's 4 s ban-zone sustain\. Where it stopped is the product's ` \+\s*`question, not this harness's\.`\)/);
    assert.match(CODE, /: ""\) \+\s*wrongLegRestSummary\(wrongProfile\),\s*\);/);
    // Each text-returning §5 function is called exactly once.
    for (const fn of ["wrongLegProfileStartLine", "wrongLegProfileOutcomeLine", "wrongLegRestHoldNote", "wrongLegRestSummary", "wrongLegRestHoldsClause"]) {
      assert.equal((CODE.match(new RegExp(`\\b${fn}\\(`, "g")) ?? []).length, 1, fn);
    }
  });

  it("THE HARNESS GATE CAN FAIL: the round-7 verifier's V7-B3 verbatim, and every sibling of it, planted in a copy of the harness, is caught", () => {
    const plant = (label, anchor, insert, where = "after") => {
      const n = SRC.split(anchor).length - 1;
      assert.equal(n, 1, `${label}: the anchor occurs ${n} time(s)`);
      return [label, SRC.replace(anchor, where === "after" ? anchor + insert : where === "before" ? insert + anchor : insert)];
    };
    const START = "if (wrongProfileStart !== null && !STEER_PROOF) loud(wrongProfileStart);";
    const cases = [
      // V7-B3, verbatim: a LOUD line keyed on `wrongProfileDecl` — the round-7 scan read only `wrongProfile`.
      plant("V7-B3", START, '\nif (wrongProfileDecl !== null && !STEER_PROOF) loud("WRONG LEG: the product books every stop on this lane as the fault the lesson teaches");'),
      // …the same, with the condition on its own line and the sink in a block.
      plant("block form", START, '\nif (\n  wrongProfileDecl !== null\n) {\n  loud("the product books every stop");\n}'),
      // …through an alias, so no line with the sink names a profile value.
      plant("alias", START, '\nconst wpd = wrongProfileDecl;\nif (wpd) loud("the product books every stop");'),
      // …keyed on the LESSON instead of the declaration.
      plant("keyed on the lesson", START, '\nif (SCENARIO === "sc-pk-busstop-ban") loud("the product books every stop");'),
      // …keyed on a profile's NAME, or on the zone's authored world.
      plant("keyed on the name", START, '\nif (String(process.argv).includes("come-to-rest-inside-the-bus-stop-zone")) loud("the product books every stop");'),
      // …through a §5 value the harness did not import before (a second import, then a use).
      plant("a second import", START, '\nimport { renderProfileText as rpt } from "./lib/driveline.mjs";'),
      plant("a dynamic import", START, '\nconst L5 = await import("./lib/driveline.mjs");'),
      // …appended to a §5 text the harness prints.
      plant("appended to the summary", "      wrongLegRestSummary(wrongProfile),", '      wrongLegRestSummary(wrongProfile) + " and the product books it",', "replace"),
      plant("appended to the outcome", "if (wrongProfileOutcome !== null) (wrongProfile.heldAsSized ? note : loud)(wrongProfileOutcome);", 'if (wrongProfileOutcome !== null) (wrongProfile.heldAsSized ? note : loud)(wrongProfileOutcome + " the product books it");', "replace"),
      // …a sink inside a statement a profile condition controls, or inside the outcome's block.
      plant("inside the transition", 'phase = "flat-rest";', '\n        note("the product books this stop");'),
      plant("inside the rest's end", "const wrongProfileRestEnd = wrongLegRestEnded(wrongProfile, { now, t0 });", '\n        note("the product books the rest");'),
      plant("inside the outcome block", "if (wrongProfileOutcome !== null) (wrongProfile.heldAsSized ? note : loud)(wrongProfileOutcome);", '\n  loud("the product books the speeding");'),
      // …the start line printed twice, or a profile line composed with the old words.
      plant("a sink duplicated", START, "\n" + START),
      // …keyed on a FRAGMENT of the lesson id (round 8, second batch).
      plant("keyed on an id fragment", START, '\nif (String(process.argv).includes("busstop-ban")) loud("the product books every stop");'),
      plant("composed with profile words", START, '\nnote(`      WRONG-LEG PROFILE: held the rest back`);'),
      // ROUND 8 FINISH — siblings the partial's gate let through (R8-F01 … F14, each SURVIVED on the partial):
      // …keyed on the SIDECAR key, read back from the status file (no `wrongProfile*` name on the line).
      plant("keyed on the sidecar key", START, '\nif (MODE !== "right" && existsSync(`${OUT}/_audit-status.json`) && JSON.parse(readFileSync(`${OUT}/_audit-status.json`, "utf8")).wrongLegProfile) loud("WRONG LEG: the product books every stop on this lane");'),
      // …a SINK that edits what it is handed: `loud` appending to a line that carries PROFILE, `note` rewriting an OUTCOME.
      plant("the loud sink edits its line", "const loud = (s) => note(`  !! ${s}`);", "const loud = (s) => note(`  !! ${s}${/PROFILE/.test(s) ? \" — the product books it\" : \"\"}`);", "replace"),
      plant("the note sink edits its line", "const note = (s) => {\n  log.push(s);", "const note = (s) => {\n  log.push(/OUTCOME/.test(s) ? s + \" (the product books it)\" : s);", "replace"),
      // …a SHADOWED loud in a block around a pinned sink statement (the sink's own line unchanged).
      plant("a shadowed loud", START, "{\nconst loud = (s) => note(`  !! ${s} — the product books every stop`);\n" + START + "\n}", "replace"),
      // …the transcript array written to outside `note`.
      plant("the transcript pushed outside note", START, '\nlog.push("the product books every stop");'),
      // …keyed on a dashed FRAGMENT of the lesson id, or a distinctive SEGMENT of it through `&&` (no `if`).
      plant("keyed on a dashed fragment", START, '\nif (SCENARIO.endsWith("stop-ban")) loud("the product books every stop");'),
      plant("keyed on a distinctive segment", START, '\nMODE !== "right" && String(process.argv).includes("busstop") && loud("the product books every stop");'),
      plant("keyed on a zone id's segment", START, '\nif (JSON.stringify(p).includes("pocket")) loud("the product books every stop");'),
    ];
    for (const [label, src] of cases) {
      assert.notEqual(src, SRC, `${label}: nothing was planted`);
      const v = harnessGateViolations(src);
      assert.ok(v.length > 0, `${label}: the planted bypass passed the harness gate`);
    }
  });

  /** EVERY LINE A PROFILE CAN PRINT — start, mid-drive, rest, outcome, and the
   *  harness's three clauses, held, not held and refused, for all four profiles,
   *  on pc AND mobile (round 8). Each entry carries the SPEC its text was
   *  rendered from — the text function's `…Spec` twin, or the say's own spec —
   *  and, for a say, the object itself. */
  function everyLine() {
    const lines = [];
    const add = (label, line, spec, say = null) => {
      if (line !== null && line !== undefined && line !== "") lines.push([label, line, spec, say]);
      else assert.ok(spec === null, `${label}: no text, and yet a spec`);
    };
    const says = (label, r) => r.steps.forEach((s, i) => s.say && add(`${label} say ${i}`, s.say.line, s.say.spec, s.say));
    const say1 = (label, r) => add(label, r.say.line, r.say.spec, r.say);
    const start = (label, st, o) => add(label, wrongLegProfileStartLine(st, o), wrongLegProfileStartSpec(st, o));
    const outc = (label, st) => add(label, wrongLegProfileOutcomeLine(st), wrongLegProfileOutcomeSpec(st));
    const note = (label, st, b, o) => add(label, wrongLegRestHoldNote(st, b, o), wrongLegRestHoldNoteSpec(st, b, o));
    const holds = (label, st, o) => add(label, wrongLegRestHoldsClause(st, o), wrongLegRestHoldsSpec(st, o));
    const out = (label, st, opt = { now: 99_000, t0: 10_000, driveEnded: true }) => {
      const f = wrongLegProfileFinish(st, opt).state;
      outc(`${label} outcome`, f);
      add(`${label} summary`, wrongLegRestSummary(f), wrongLegRestSummarySpec(f));
      holds(`${label} holds`, f, { stops: 3, holdMs: HOLD_MS });
      return f;
    };
    for (const platform of ["pc", "mobile"]) {
      const mk = (id) => make(id, { platform });
      const P = platform === "pc" ? "" : " (mobile)";
      for (const id of WRONG_LEG_PROFILES.keys()) {
        start(`${id}${P} start`, mk(id), { everyM: 45 });
        start(`${id}${P} start (no cadence given)`, mk(id));
        outc(`${id}${P} zero ticks`, mk(id));
        note(`${id}${P} rest note`, mk(id), { state: mk(id), holdMs: HOLD_MS, zone: false }, { holdMs: HOLD_MS });
        const byClock = drive(mk(id), Array(125).fill(-1), () => ({ follow: null }));
        says(`${id}${P} clock`, byClock);
        out(`${id}${P} clock`, byClock.state);
        const byMetres = drive(mk(id), Array(40).fill(1), () => ({ flatStepM: 60, follow: chip(60, 2.5) }));
        says(`${id}${P} metres`, byMetres);
        out(`${id}${P} metres`, byMetres.state, { now: 99_000, t0: 10_000, driveEnded: false });
        out(`${id}${P} short`, drive(mk(id), [20, 40], () => ({ follow: chip(50, 2.5) })).state);
        out(`${id}${P} cadence`, driveCadence(mk(id), FLAT_SERIES, { dtMs: FLAT_TICK_MS }).state);
        // round 8: a profile that held no due rest back and booked none (no lead on the chip for the truck).
        out(`${id}${P} unchanged`, driveCadence(mk(id), Array(120).fill(58), { extra: () => ({ follow: null }) }).state);
      }
      const sxf = drive(mk("sc-signal-flashing"), FLAT_SERIES.slice(0, SXF_145_TICKS), () => ({}), FLAT_TICK_MS);
      out(`sxf${P} held`, sxf.state, { now: sxf.now, t0: 10_000, driveEnded: true });
      out(`sxf${P} not ended`, sxf.state, { now: sxf.now, t0: 10_000, driveEnded: false });
      out(`sxf${P} end gap`, sxf.state, { now: sxf.now + 5000, t0: 10_000, driveEnded: true });
      out(`sxf${P} window`, drive(mk("sc-signal-flashing"), [30, ...Array(16).fill(58)]).state);
      out(`sxf${P} disc change`, drive(mk("sc-signal-flashing"), [30, 58, 58, 58, 47], (i) => ({ postedKmh: i < 4 ? 50 : 40 })).state);
      out(`sxf${P} no disc`, drive(mk("sc-signal-flashing"), Array(6).fill(58), () => ({ postedKmh: null })).state);
      out(`sxf${P} disc unread`, drive(mk("sc-signal-flashing"), [30, 58, 58, 58, 58], (i) => ({ postedKmh: i < 2 ? 50 : null })).state);
      const stint = drive(mk("sc-ov-keep-right"), Array(40).fill(40));
      says(`stint${P}`, stint);
      out(`stint${P} held`, stint.state);
      for (const [label, c] of [["gap-rain", chip(58, 1.9)], ["gap-base", chip(40, 1.1)]]) {
        const r = drive(mk("sc-ac-truck-spray"), Array(12).fill(110), () => ({ follow: c }));
        says(`${label}${P}`, r);
        out(`${label}${P}`, r.state);
      }
    }
    const zone = drive(make("sc-pk-busstop-ban"), FLAT_SERIES, () => ({}), FLAT_TICK_MS);
    says("zone", zone);
    says("zone blind", drive(make("sc-pk-busstop-ban"), [...FLAT_SERIES.slice(0, 10), -1, 59], () => ({}), FLAT_TICK_MS));
    says("zone missed", drive(make("sc-pk-busstop-ban"), [1, 1, 30], (i) => ({ flatStepM: i < 2 ? 110 : 1 })));
    out("zone held then missed", zoneHeldThenMissed());
    const hold = (n, st = zone.state) => {
      const b = wrongLegRestBooked(st, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh: 0 });
      note(`zone rest note ${n}`, b.state, b, { holdMs: HOLD_MS });
      let h = b.state;
      for (let i = 0; i < n; i++) h = wrongLegRestTick(h, { kmh: i === 3 ? 3 : 0, dtMs: 500 });
      return h;
    };
    for (const [label, n] of [["zone held", 70], ["zone short", 16]]) {
      const e = wrongLegRestEnded(hold(n), { now: 90_000, t0: 10_000 });
      say1(`${label} say`, e);
      out(label, e.state);
      holds(`${label} holds (one stop)`, e.state, { stops: 1, holdMs: HOLD_MS });
    }
    const narrow = drive(createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: { ...SPAN, fromM: 135, toM: 150 }, platform: "pc" }), FLAT_SERIES, () => ({}), FLAT_TICK_MS).state;
    const un = wrongLegRestEnded(hold(70, narrow), { now: 90_000, t0: 10_000 });
    say1("zone unverified say", un);
    out("zone unverified", un.state);
    const nr = wrongLegRestEnded(zone.state, { now: 70_000, t0: 10_000, gaveUp: true });
    say1("zone no-rest say", nr);
    out("zone no-rest", nr.state);
    out("zone mid-hold", hold(30));
    // round 10: a zone rest still braking when the drive ended (IMPRECISE-SELF-STATEMENTS d)
    out("zone still braking at the drive's end", zone.state);
    for (const platform of ["mobile", null, "tablet"]) {
      const st = createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: SPAN, platform });
      start(`zone refused ${platform} start`, st, { everyM: 45 });
      outc(`zone refused ${platform} outcome`, st);
      note(`zone refused ${platform} rest note`, st, { state: st, holdMs: HOLD_MS, zone: false }, { holdMs: HOLD_MS });
    }
    for (const why of [{ ok: false, why: profileText("span.turns", { deg: 15 }) }, { ok: false, why: null }, null, { ...SPAN, basis: null }, { ...SPAN, basis: "law bus stop" }, { ...SPAN, fromM: NaN }]) {
      const st = createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: why, platform: "pc" });
      start(`zone no span ${JSON.stringify(why)}`, st, { everyM: 45 });
      outc(`zone no span ${JSON.stringify(why)} outcome`, st);
    }
    return lines;
  }

  it("EVERY line every profile can print matches a line template and uses only the vocabulary — and the battery reaches every verdict word and every kind of line", () => {
    const lines = everyLine();
    assert.ok(lines.length >= 180, `only ${lines.length} lines were produced — the battery has gone thin`);
    for (const [label, line] of lines) assertObservationLine(line, label);
    const all = lines.map(([, l]) => l).join("\n");
    for (const needed of [`${HELD_AS_SIZED} (finish-in-band)`, `${HELD_AS_SIZED} (stint)`, `${HELD_AS_SIZED} (gap-rain)`, `${HELD_AS_SIZED} (gap-base)`, `${HELD_AS_SIZED} (zone-rest)`, `${NOT_HELD_AS_SIZED} (REFUSED, NOT RUN)`, "braking BOOKED", "HARNESS ESTIMATE", "each held on the ordinary 8s hold of wall clock", "before the harness gave the rest up", "before the drive ended", "REFUSED, NOT RUN", " AND A WRONG-LEG PROFILE (", "(no zone rest was booked)", "the zone rest's longest continuous run was", "a hold sized from", "the harness's ordinary hold", "HELD NO DUE REST BACK AND BOOKED NONE", "held on the zone profile's own tally", "carry no basis that is an identifier", "has no finite bounds"]) {
      assert.ok(all.includes(needed), `the battery never printed «${needed}»`);
    }
    // Every template that can start a line was reached.
    for (const id of TOP_TEMPLATES) assert.ok(lines.some(([, l]) => templateLineRe(id).test(l)), `the battery never printed a «${id}» line`);
    for (const [label, line] of lines.filter(([l, x]) => / outcome$/.test(l) && !x.includes("REFUSED, NOT RUN") && !x.includes("not one flat tick ran"))) {
      assert.match(line, / — OBSERVED: /, label);
      assert.match(line, / · READINGS: /, label);
      assert.ok(line.includes(`${SIZING_LABEL}: `) || line.includes(`${ZONE_SIZING_LABEL}: `), `${label}: no sizing — ${line}`);
      assert.ok(!/product source|read from source|source read/.test(line), `${label}: ${line}`);
    }
  });

  it("ROUND 8 — ONE EMISSION PATH AT RUNTIME: every text the battery produced, on pc and mobile, IS its twin spec rendered — by this test's OWN renderer — and every say is frozen", () => {
    const lines = everyLine();
    let says = 0;
    for (const [label, line, spec, say] of lines) {
      assert.ok(spec && typeof spec === "object", `${label}: a text with no spec behind it`);
      assert.equal(line, referenceRender(spec), `${label}: the text is not its spec rendered — something was added around the renderer`);
      if (say !== null) {
        says++;
        assert.ok(Object.isFrozen(say), `${label}: a say line that can be edited after rendering`);
        assert.deepEqual(Object.keys(say).sort(), ["line", "loud", "spec"], label);
      }
    }
    assert.ok(says >= 20, `only ${says} say lines — the battery has gone thin`);
    assert.ok(lines.some(([l]) => / \(mobile\) /.test(` ${l} `)), "the battery drove no mobile leg");
  });

  it("ROUND 8 — THE RENDERER IS PINNED: for EVERY template, filled and with every nullable slot empty, renderProfileText gives exactly what this test's own renderer gives", () => {
    const sample = { n: 12.345, n1: 12.345, n2: 12.345, n3: 12.345, r: 12.5, tok: "tok-a", toks: ["a1", "b2"], txt: WRONG_LEG_PROFILES.get("sc-signal-flashing").name };
    const frag = profileText("end.reached");
    let n = 0;
    for (const [id, t] of Object.entries(PROFILE_LINE_TEMPLATES)) {
      const full = {};
      const empty = {};
      for (const m of t.matchAll(TEMPLATE_SLOT_RE)) {
        const [, name, kind, fb] = m;
        full[name] = kind === "frag" || kind === "opt" ? frag : kind === "frags" ? [frag, profileText("end.unknown")] : sample[kind];
        empty[name] = kind === "opt" || fb !== undefined ? null : full[name];
      }
      for (const f of [full, empty]) {
        const spec = { tpl: id, f };
        assert.equal(renderProfileText(spec), referenceRender(spec), `${id}: the renderer does not render the table`);
        n++;
      }
    }
    assert.ok(n >= 2 * 95, `only ${n} renders`);
  });

  it("THE GATE CAN FAIL: every claim rounds 1–6 printed (and the round-6 verifier's «the product books the stop there»), planted in a real template, is caught — and so is a line not rendered from the table", () => {
    const base = PROFILE_LINE_TEMPLATES["obs.zoneHeld"];
    assert.deepEqual(vocabularyViolations(templateText(base)), []);
    for (const planted of [
      ", so the product books the stop there",
      " ACHIEVED (settle)",
      " — the state settleUnpaidSpeedingTeach bills on its final frame",
      ", so the engine will bill it",
      "; the re-grade cannot have billed",
      ". The engine's own bar is lower than this leg's: 2 s",
      "; the product did not charge it",
      "; the stop counts as the fault the lesson teaches",
      "; a settle is owed",
      "; NOT_KEEPING_RIGHT is graded on this run",
      "; the debrief will show «Превишена скорост»",
      "; these are the thresholds the engine applies",
      "; stepEpisode nulls activeSince, and the rest CLEARS the speeding episode",
      "; the rest is counted because the timer passed",
    ]) {
      const bad = vocabularyViolations(templateText(base + planted));
      assert.ok(bad.length > 0, `«${planted}» slipped past the vocabulary`);
    }
    // A line with the right words but built outside the table matches no line template.
    const outside = "WRONG-LEG PROFILE: no-careless-rest-to-the-finish held the rest back on every flat tick.";
    assert.ok(!TOP_TEMPLATES.some((id) => templateLineRe(id).test(outside)));
    assert.throws(() => assertObservationLine(outside, "planted"), /matches no line template/);
  });

  it("OBSERVATION TRUTH — finish-open: every number on the line is the tally it names (first, top and last differ; a dip, an unread, an above-band, a probe-less tick and a disc unread after its first reading)", () => {
    const series = [30, 58, 58, 58, 50, 57, -1, 58, 59, 61, 58, 56];
    const r = drive(make("sc-signal-flashing"), series, (i, now) => ({ probeAt: i === 6 ? undefined : now, postedKmh: i === 8 ? null : 50, now: now + (i === 5 ? 1300 : 0) + (i > 5 ? 1300 : 0) }));
    const f = wrongLegProfileFinish(r.state, { now: r.now + 1300 - 200, t0: 10_000, driveEnded: false }).state;
    const F = f.finish;
    assert.deepEqual([F.firstKmh, F.topKmh, F.lastKmh, F.dips, F.unreadTicks, F.aboveBandTicks, F.probeUnmeasured, F.discUnreadAfter, F.discReadTicks], [30, 61, 56, 1, 1, 1, 1, 1, 11], "the fixture no longer separates the readings");
    // THE WALL INTERVAL: the 1800 ms one (500 + the 1300 ms stall) is the longest, uncapped; the end gap 300 ms.
    assert.deepEqual([f.maxWallMs, F.finalMs], [1800, 300]);
    const line = wrongLegProfileOutcomeLine(f);
    const m = line.match(
      /READINGS: disc (\d+) \((\d+) change\(s\)\), read on (\d+) of (\d+) flat tick\(s\) \((\d+) unread after its first reading, (\d+) before it\) · band \((\d+), (\d+)\] sized over that disc · in-band tally (\d+\.\d) s on the profile clock \((\d+) dip\(s\) to ≤ the disc wiped it\) · possible-in-band tally (\d+\.\d) s of wall clock \((\d+\.\d) s of it reading-age allowance; allowance (\d+) ms beyond each probe's wait; (\d+) tick\(s\) without a probe clock\) · (\d+) in-band \/ (\d+) above-band \/ (\d+) unread dial reading\(s\) of (\d+) flat tick\(s\) · first (\S+) · top (\S+) · last (\S+) км\/ч · longest wall interval between two flat readings (\d+) ms \(each tick's own work in it, not capped\) · end gap (\d+) ms · (\d+) rest opportunity\(ies\) held back \(the (\S+) m \/ (\S+) s cadence came due (\d+) time\(s\) while the harness's own task-cap and over-limit holds were not holding and the profile held it, each stretch counted once\) on (\d+) held flat tick\(s\), (\d+) rest\(s\) booked by the profile · the drive did NOT reach its end screen\./,
    );
    assert.ok(m, `the READINGS clause is not in its shape — ${line}`);
    assert.deepEqual(m.slice(1), [
      F.postedKmh, F.limitChanges, F.discReadTicks, f.flatTicks, F.discUnreadAfter, F.discUnreadBefore, F.gradedAboveKmh, F.dangerousAboveKmh,
      F.inBandSec.toFixed(1), F.dips, F.possibleSec.toFixed(1), F.ageCreditSec.toFixed(1), F.dialLagMs, F.probeUnmeasured,
      F.inBandTicks, F.aboveBandTicks, F.unreadTicks, f.flatTicks, F.firstKmh, F.topKmh, F.lastKmh, f.maxWallMs, F.finalMs,
      f.opportunities.count, "?", "?", f.opportunities.count, f.heldTicks, f.restsForced,
    ].map(String));
    assert.equal(f.heldTicks, 12, "every flat tick of a finish-open profile holds the rest back");
    assert.match(wrongLegProfileOutcomeLine(wrongLegProfileFinish(r.state, { now: r.now, t0: 10_000, driveEnded: true }).state), / · the drive reached its end screen\. /);
    // THE HELD LINE's observed sentence names the same readings, and its end gap is the measured one.
    const sxf = drive(make("sc-signal-flashing"), FLAT_SERIES.slice(0, SXF_145_TICKS), () => ({}), FLAT_TICK_MS);
    const h = wrongLegProfileFinish(sxf.state, { now: sxf.now - 200, t0: 10_000, driveEnded: true }).state;
    const o = R(h.observed).match(/^no careless rest was taken on (\d+) flat tick\(s\), the posted disc read (\d+) on every one of them, and the drive reached its end screen; the first flat reading, (\d+) км\/ч, was certainly below the band \((\d+), (\d+)\] and the last, (\d+) км\/ч, certainly inside it .*; the in-band tally read (\d+\.\d) s on the profile clock \(sized ≥ (\d+) s\) and the possible-in-band tally (\d+\.\d) s of wall clock \(sized < (\d+) s; (\d+\.\d) s of it the reading-age allowance\); the last flat reading was taken (\d+) ms of wall clock before the finish's clock, inside the longest wall interval between two flat readings \((\d+) ms\), and by the harness's estimate up to (\d+) ms before its tick$/);
    assert.ok(o, R(h.observed));
    const H = h.finish;
    assert.deepEqual(o.slice(1), [h.flatTicks, H.postedKmh, H.firstKmh, H.gradedAboveKmh, H.dangerousAboveKmh, H.lastKmh, H.inBandSec.toFixed(1), H.sizedInBandSec, H.possibleSec.toFixed(1), H.sizedWindowSec, H.ageCreditSec.toFixed(1), H.finalMs, h.maxWallMs, H.prevAgeMs].map(String));
    assert.equal(H.finalMs, FLAT_TICK_MS - 200);
  });

  it("OBS-END-GAP (round 7, the verifier's P2/P3): the longest interval is the WALL clock between two flat readings, never capped — a 3100 ms interval prints 3100 — and a HELD line never claims an end gap longer than it", () => {
    let st = make("sc-signal-flashing");
    const at = [1000, 1500, 2000, 5100, 5600];
    for (const now of at) st = wrongLegFlatStep(st, { now, t0: 0, kmh: 58, flatStepM: 8, dtMs: 500, postedKmh: 50, probeAt: now }).state;
    assert.equal(st.maxWallMs, 3100, "the longest wall interval was capped or taken from the profile clock");
    assert.equal(st.clockMs, 2500, "the profile clock took wall time");
    assert.match(wrongLegProfileOutcomeLine(wrongLegProfileFinish(st, { now: 6000, t0: 0, driveEnded: true }).state), /longest wall interval between two flat readings 3100 ms/);
    // One reading has no interval: NONE, and the end gap target is unmet.
    const one = wrongLegFlatStep(make("sc-signal-flashing"), { now: 1000, t0: 0, kmh: 30, flatStepM: 4, dtMs: 500, postedKmh: 50 }).state;
    assert.equal(one.maxWallMs, null);
    const oneF = wrongLegProfileFinish(one, { now: 1200, t0: 0, driveEnded: true }).state;
    assert.match(R(oneF.observed), /the longest wall interval between two flat readings was NONE ms/);
    // The verifier's P3 exactly: a 516 ms tick, a 1500 ms end gap — NOT HELD, and the line says 1500.
    const sxf = drive(make("sc-signal-flashing"), FLAT_SERIES.slice(0, SXF_145_TICKS), () => ({}), FLAT_TICK_MS);
    const lastNow = sxf.now - FLAT_TICK_MS;
    for (const [gap, held] of [[300, true], [516, true], [517, false], [1500, false]]) {
      const f = wrongLegProfileFinish(sxf.state, { now: lastNow + gap, t0: 10_000, driveEnded: true }).state;
      assert.equal(f.heldAsSized, held, `end gap ${gap} ms`);
      assert.equal(f.finish.finalMs, gap);
      if (held) assert.match(R(f.observed), new RegExp(`the last flat reading was taken ${gap} ms of wall clock before the finish's clock, inside the longest wall interval between two flat readings \\(516 ms\\)`));
      else assert.match(R(f.observed), new RegExp(`the last flat reading was taken ${gap} ms of wall clock before the finish's clock, and the longest wall interval between two flat readings was 516 ms`));
    }
  });

  it("OBS-DISC-UNREAD (round 7, the verifier's P7/P8): a disc unread after its first reading is counted, and HELD needs the disc on every flat tick", () => {
    const series = [8, 11, 17, 22, 27, 32, 37, 42, 46, 50, 54, 57, 58, 58, 59, 59, 59, 59, 59, 59, 59, 59];
    const p7 = drive(make("sc-signal-flashing"), series, (i) => ({ postedKmh: i < 4 ? 50 : null }), FLAT_TICK_MS);
    const f7 = wrongLegProfileFinish(p7.state, { now: p7.now, t0: 10_000, driveEnded: true }).state;
    assert.deepEqual([f7.finish.discReadTicks, f7.finish.discUnreadAfter, f7.finish.discUnreadBefore, f7.heldAsSized], [4, 18, 0, false]);
    assert.match(wrongLegProfileOutcomeLine(f7), /disc 50 \(0 change\(s\)\), read on 4 of 22 flat tick\(s\) \(18 unread after its first reading, 0 before it\)/);
    assert.match(R(f7.observed), /the posted disc was unread on 18 of 22 flat tick\(s\) \(18 of them after its first reading\)/);
    // P8: read on the first and the last tick only — the same number both times — is NOT one disc read throughout.
    const p8 = drive(make("sc-signal-flashing"), [30, 40, 50, 56, 57, 58, 58, 58, 58, 58, 58, 58], (i) => ({ postedKmh: i === 0 || i === 11 ? 50 : null }));
    const f8 = wrongLegProfileFinish(p8.state, { now: p8.now, t0: 10_000, driveEnded: true }).state;
    assert.deepEqual([f8.finish.limitChanges, f8.finish.discUnreadAfter, f8.heldAsSized], [0, 10, false]);
    // …and the same drives with the disc read on every tick are held (so the disc is what is unmet).
    assert.equal(wrongLegProfileFinish(drive(make("sc-signal-flashing"), series, () => ({}), FLAT_TICK_MS).state, { now: p7.now, t0: 10_000, driveEnded: true }).state.heldAsSized, true);
    // Unread BEFORE the first reading is counted apart.
    const late = drive(make("sc-signal-flashing"), [30, 40, 58], (i) => ({ postedKmh: i === 0 ? null : 50 }));
    assert.deepEqual([late.state.finish.discUnreadBefore, late.state.finish.discUnreadAfter], [1, 0]);
  });

  it("OBS-RESTS-HELD-BACK (round 7): REST OPPORTUNITIES are counted per stretch of the cadence — 45 m or 20 s after the last one — never per tick, restarted by a rest or a pause's phase clock, and not counted under the harness's own hold", () => {
    // The archived 22-tick series (142.0 m of flat): the cadence came due at 49.6 m (tick 10), then 45 m past
    // that at 99.7 m (tick 16); the third needs 144.7 m and the flat ends at 142.0 — 2, on 22 held ticks.
    const sxf = driveCadence(make("sc-signal-flashing"), FLAT_SERIES.slice(0, SXF_145_TICKS), { dtMs: FLAT_TICK_MS });
    assert.ok(Math.abs(sxf.flatM - 142.0) < 0.1, `flat ${sxf.flatM}`);
    assert.deepEqual([sxf.state.opportunities.count, sxf.state.heldTicks, sxf.rests], [2, 22, 0]);
    assert.deepEqual([sxf.state.opportunities.everyM, sxf.state.opportunities.maxMs], [EVERY_M, MAX_MS]);
    // PER TICK it would have been 12: the ticks on which the ordinary cadence was due while held (the verifier's P1).
    let dueTicks = 0;
    {
      let flatM = 0;
      for (const kmh of FLAT_SERIES.slice(0, SXF_145_TICKS)) {
        flatM += (kmh / 3.6) * (FLAT_TICK_MS / 1000);
        if (flatM >= EVERY_M) dueTicks++;
      }
    }
    assert.equal(dueTicks, 12);
    // All 40 ticks (294 m): stretches at ticks 10, 16, 22, 28, 34 — 5.
    assert.equal(driveCadence(make("sc-signal-flashing"), FLAT_SERIES, { dtMs: FLAT_TICK_MS }).state.opportunities.count, 5);
    // SLOW (5 км/ч, 0.69 m a tick, 69 m in 50 s): the 20 s CLOCK comes due first, at tick 40 and again at tick 80 — 2,
    // though the ordinary cadence was due on all 60 ticks from 40 on.
    const slow = driveCadence(make("sc-signal-flashing"), Array(100).fill(5), { dtMs: 500 });
    assert.equal(slow.state.opportunities.count, 2);
    // A pause drain restarts the phase clock — and the stretch's time half with it — but not the metres: with
    // drains after ticks 50 and 85 the clock never runs 20 s again, and 45 m past tick 40 is never reached — 1.
    const paused = driveCadence(make("sc-signal-flashing"), Array(100).fill(5), { dtMs: 500, pauses: new Set([50, 85]) });
    assert.equal(paused.state.opportunities.count, 1);
    // …and a drain after tick 45 restarts the time half FROM THE DRAIN: 20 s after it (tick 85) is a second
    // stretch — 2. Counted from the last count on a clock the drain reset, it would have been 1.
    assert.equal(driveCadence(make("sc-signal-flashing"), Array(100).fill(5), { dtMs: 500, pauses: new Set([45]) }).state.opportunities.count, 2);
    // THE RESTARTS, call by call — including a drain seen on a tick where the ordinary cadence was NOT due (the
    // harness's own hold was on), and a new flat phase after a real rest.
    {
      // `phaseTicks` is passed as the harness passes it (round 9): counting up through a flat phase — a pause drain
      // resets the phase CLOCK, never the tick count — and back to 1 on the first tick after a rest. (A constant
      // count, as this fixture passed until round 8, reads as a new phase on every call now, and let R7-T21 pass.)
      const call = (st, a) => wrongLegRestOpportunity(st, { holdRest: false, suppress: true, force: false, everyM: EVERY_M, maxMs: MAX_MS, ...a });
      let st = make("sc-signal-flashing");
      st = call(st, { flatM: 50, sincePhaseMs: 1000, phaseTicks: 1 }); // due by the metres: 1
      assert.equal(st.opportunities.count, 1);
      st = call(st, { flatM: 51, sincePhaseMs: 200, phaseTicks: 2, holdRest: true }); // a drain, the hold on: nothing due, the clock restarts
      st = call(st, { flatM: 52, sincePhaseMs: 5000, phaseTicks: 3, holdRest: true });
      st = call(st, { flatM: 53, sincePhaseMs: 20_000, phaseTicks: 4 }); // 20 s after the DRAIN: 2
      assert.equal(st.opportunities.count, 2, "the time half was measured from the last count, not from the drain");
      st = call(st, { flatM: 2, sincePhaseMs: 100, phaseTicks: 1 }); // a rest ran: a new flat phase, nothing due
      st = call(st, { flatM: 46, sincePhaseMs: 8000, phaseTicks: 2 }); // the new phase's first due tick: 3
      assert.equal(st.opportunities.count, 3, "a new flat phase did not restart the stretch");
      // (Round 9: both at 30 s on the phase clock — 22 s after the last count, so the stretch IS due and a count here
      // would be a real one. At 9 s, as until round 8, nothing was due, and «booked counted as held back» — R7-T20 —
      // passed once `phaseTicks` counted as the harness counts it.)
      st = call(st, { flatM: 99, sincePhaseMs: 30_000, phaseTicks: 3, force: true }); // a rest the profile BOOKED is not one it held back
      st = call(st, { flatM: 99, sincePhaseMs: 31_000, phaseTicks: 4, suppress: false }); // nor is one it let through
      assert.equal(st.opportunities.count, 3);
      const stopped = { ...st, active: false };
      assert.equal(call(stopped, { flatM: 500, sincePhaseMs: 90_000, phaseTicks: 5 }), stopped, "a profile that has stopped holding still counts");
      // The clock is watched on EVERY tick, not only on the ticks a rest was held back: here the phase clock ran on
      // to 15 s under the hold, and the drain brought it back to 2 s — still above the 1 s of the last held tick.
      let w = make("sc-signal-flashing");
      w = call(w, { flatM: 50, sincePhaseMs: 1000, phaseTicks: 1 }); // held and due: 1
      w = call(w, { flatM: 51, sincePhaseMs: 15_000, phaseTicks: 2, holdRest: true }); // the hold on: nothing due
      w = call(w, { flatM: 52, sincePhaseMs: 2000, phaseTicks: 3, holdRest: true }); // a drain, seen only on this unheld tick
      w = call(w, { flatM: 53, sincePhaseMs: 20_500, phaseTicks: 4 }); // 20 s after the drain, 19.5 s after the last count: 2
      assert.equal(w.opportunities.count, 2, "the drain was missed because it was seen on a tick with no rest held back");
    }
    // The harness's own hold (the task cap) holds the ORDINARY cadence too: that is not the profile holding a rest back.
    const capped = driveCadence(make("sc-signal-flashing"), FLAT_SERIES.slice(0, SXF_145_TICKS), { dtMs: FLAT_TICK_MS, holdRest: () => true });
    assert.equal(capped.state.opportunities.count, 0);
    // A profile that RESTS (the stint after its run at tick 31): 50, 100 and 150 m while held — 3 — then real rests, none held back.
    const stint = driveCadence(make("sc-ov-keep-right"), Array(80).fill(40), { dtMs: 500 });
    assert.ok(stint.rests >= 1, "the stint profile never let a rest through");
    assert.equal(stint.state.opportunities.count, 3);
    // The line prints the stretch count, the ticks apart, and the cadence it counted against.
    const line = wrongLegProfileOutcomeLine(wrongLegProfileFinish(sxf.state, { now: sxf.now, t0: 10_000, driveEnded: true }).state);
    assert.match(line, / · 2 rest opportunity\(ies\) held back \(the 45 m \/ 20 s cadence came due 2 time\(s\) while the harness's own task-cap and over-limit holds were not holding and the profile held it, each stretch counted once\) on 22 held flat tick\(s\), 0 rest\(s\) booked by the profile · /);
  });

  it("OBSERVATION TRUTH — stint, lead-close and zone-rest: the printed best run, chip minima, runs and rest are the tallies (best ≠ current in every fixture)", () => {
    const s = drive(make("sc-ov-keep-right"), [...Array(10).fill(40), 3, ...Array(6).fill(40)]).state;
    assert.deepEqual([s.stint.bestSec, s.stint.curSec, s.stint.dips], [5, 3, 1]);
    assert.match(wrongLegProfileOutcomeLine(wrongLegProfileFinish(s, { now: 99_000, t0: 10_000, driveEnded: true }).state), /READINGS: best moving run 5\.0 s on the profile clock \(sized 16 s\) · 1 dip\(s\) to ≤ movingSpeedKmh · 0 unread tick\(s\), 0 of them inside the best run · /);
    const ls = [chip(60, 2.5), chip(58, 1.9), chip(58, 1.9), chip(58, 1.9), chip(59, 1.9), chip(55, 2.6), chip(59, 2.5)];
    const L = drive(make("sc-ac-truck-spray"), Array(ls.length).fill(110), (i) => ({ follow: ls[i] })).state;
    assert.deepEqual([L.lead.minSec, L.lead.minM, L.lead.rainBestSec, L.lead.rainRunSec, L.lead.baseBestSec], [1.9, 55, 1.5, 0, 0]);
    assert.match(wrongLegProfileOutcomeLine(L), /READINGS: lead on the chip 7 tick\(s\), absent 0, unparsed 0, on a band edge 0, opening 0 · chip minimum 1\.9 с \/ 55 м · best run under 1\.26 s: 0\.0 s \(sized 3 s\) · best run in \[1\.26, 2\.016\) s: 1\.5 s \(sized 4 s\) · 3\.5 s under the drill's taught 3 s \(a design constant sized at 4112566\) · top 110 км\/ч · 0 rest opportunity\(ies\) held back \(the \? m \/ \? s cadence came due 0 time\(s\) while the harness's own task-cap and over-limit holds were not holding and the profile held it, each stretch counted once\) on 7 held flat tick\(s\), 0 rest\(s\) booked by the profile/);
    let z = drive(make("sc-pk-busstop-ban"), FLAT_SERIES, () => ({}), FLAT_TICK_MS).state;
    z = wrongLegRestBooked(z, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh: 0 }).state;
    for (const kmh of [...Array(20).fill(0), 3, ...Array(11).fill(0)]) z = wrongLegRestTick(z, { kmh, dtMs: 500 });
    assert.deepEqual([z.zone.bestHeldMs, z.zone.heldMs, z.zone.stirs], [10_000, 5_000, 1]);
    const e = wrongLegRestEnded(z, { now: 90_000, t0: 10_000 }).state;
    const zl = wrongLegProfileOutcomeLine(e);
    const d = e.zone.decision;
    assert.ok(zl.includes(`READINGS: braking booked at t=${d.atSec}s at ${d.kmh} км/ч, flat odometer ${d.odoM} m, estimated rest [${d.restLoM}, ${d.restHiM}] m (harness estimate) · longest continuous rest 10.0 s of the 34 s hold (sized 27 s) · 1 stir(s), 0 break(s), 0 unread tick(s) · `), zl);
    assert.equal(R(e.observed), "the dial read ≤ fullStopMaxSpeedKmh 1 км/ч continuously for 5.0 s on the profile clock (1 stir(s), 0 break(s), 0 unread tick(s) not credited), against the sized 27 s");
    assert.match(zl, new RegExp(` on ${e.heldTicks} held flat tick\\(s\\), 1 rest\\(s\\) booked by the profile · `));
  });

  it("ZONE-SUMMARY-CLAUSE (round 7): the harness's summary says what the zone rest's hold READ — or that none was booked — never a flat «held 34 s»", () => {
    const zone = drive(make("sc-pk-busstop-ban"), FLAT_SERIES, () => ({}), FLAT_TICK_MS).state;
    let h = wrongLegRestBooked(zone, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh: 0 }).state;
    for (let i = 0; i < 24; i++) h = wrongLegRestTick(h, { kmh: 0, dtMs: 500 });
    const mid = wrongLegProfileFinish(h, { now: 70_000, t0: 10_000, driveEnded: true }).state;
    assert.equal(wrongLegRestSummary(mid), ` AND A WRONG-LEG PROFILE (come-to-rest-inside-the-bus-stop-zone) CHANGED WHEN THESE RESTS FELL: ${R(profileText("rests", { opp: 0, every: null, maxS: null, held: mid.heldTicks, forced: 1 }))} (the zone rest's longest continuous run was 12.0 s on the profile clock, against a 34 s hold and a sized 27 s). Each rest above has its own «came to REST» line, the harness reads the dev pose probe on every flat and flat-rest tick and records what it returns among its guidance samples, and every stop is still this instrument's act.`);
    // A zone profile that held a due rest back (20 s at 1 км/ч under the hold) and then MISSED the zone: it changed
    // when a rest fell, and no zone rest was booked.
    const missed = zoneHeldThenMissed();
    assert.deepEqual([missed.opportunities.count, missed.restsForced, missed.done], [1, 0, "missed"]);
    assert.match(wrongLegRestSummary(missed), /CHANGED WHEN THESE RESTS FELL: .* \(no zone rest was booked\)\. Each rest above has its own «came to REST» line/);
    assert.ok(!/34 s of un-paused time, not 8 s/.test(wrongLegRestSummary(missed)));
    assert.equal(wrongLegRestSummary(make("sc-signal-flashing")).includes("zone rest"), false);
  });

  it("the state is JSON-safe (it rides the sidecar), and §5's code carries none of the round-1..6 machinery", () => {
    for (const id of WRONG_LEG_PROFILES.keys()) {
      const st = wrongLegProfileFinish(driveCadence(make(id), [20, 40, 60], { extra: () => ({ follow: chip(50, 2.5) }) }).state, { now: 99_000, t0: 10_000, driveEnded: true }).state;
      assert.deepEqual(JSON.parse(JSON.stringify(st)), st, id);
      for (const gone of ["achieved", "achievedAtSec", "engineBar", "why", "restsSuppressed", "maxDtMs"]) assert.equal(gone in st, false, `${id}: the state still carries «${gone}»`);
      assert.equal(st.sizedAt, PROFILE_SIZED_AT);
    }
    // (Outside the text regions: the evidence records keep their words, e.g. «FALSE-ACHIEVED».)
    const hit = sec5OutsideTextRegions().match(/\bACHIEVED\b|NOT MEASURED BY THIS LEG|\bengineBar\b|\bachieved\b|settleUnpaidSpeedingTeach|SPEEDING_SETTLE_RULE_RES|\brestsSuppressed\b|\bmaxDtMs\b/);
    assert.equal(hit, null, `a round-1..6 field or verdict word is back in §5's code: «${hit?.[0]}»`);
    const printable = [...Object.values(PROFILE_LINE_TEMPLATES), ...[...WRONG_LEG_PROFILES.values()].flatMap((p) => [p.name, p.told, p.row])].join("\n");
    assert.ok(!/ACHIEVED|NOT MEASURED BY THIS LEG/.test(printable), "a round-1..5 verdict word is printable again");
  });
});

// ---------------------------------------------------------------------------
describe("§W7b the table's rows — four declared, one declined, one withdrawn", () => {
  it("four rows; sc-jx-priority-confidence is declined on purpose; sc-fo-motorway-gap is WITHDRAWN with its evidence and cannot come back silently", () => {
    assert.deepEqual([...WRONG_LEG_PROFILES.keys()].sort(), ["sc-ac-truck-spray", "sc-ov-keep-right", "sc-pk-busstop-ban", "sc-signal-flashing"]);
    assert.equal(wrongLegProfileFor("sc-jx-priority-confidence"), null);
    for (const id of WITHDRAWN_WRONG_LEG_PROFILES.keys()) {
      assert.equal(WRONG_LEG_PROFILES.has(id), false, `${id} was WITHDRAWN on evidence and is back in the table`);
      assert.equal(wrongLegProfileFor(id), null);
    }
    const mw = WITHDRAWN_WRONG_LEG_PROFILES.get("sc-fo-motorway-gap");
    assert.ok(Object.isFrozen(mw));
    for (const n of ["34 m/s", "2.08 s", "1.6–1.8 s", "3.0 s", "145", "~135", "y ≈ 852", "~96 км/ч", "w47"]) assert.ok(mw.why.includes(n), `the withdrawal reason lost «${n}»`);
    for (const [id, p] of WRONG_LEG_PROFILES) {
      assert.ok(Object.isFrozen(p), `${id} is mutable`);
      assert.ok(p.maxM > 0 && p.maxMs > 0, `${id} has no ceiling`);
      assert.equal("needs" in p || "pins" in p, false, `${id} still carries the round-6 product reads`);
    }
    // The evidence records are never printed: no template can name them.
    assert.ok(!/WITHDRAWN/.test(Object.values(PROFILE_LINE_TEMPLATES).join("\n")));
  });

  it("every declared profile's start line is «WRONG-LEG PROFILE: <name> — <told>» with its ceilings and its sizing", () => {
    for (const id of WRONG_LEG_PROFILES.keys()) {
      const st = make(id);
      const line = wrongLegProfileStartLine(st, { everyM: 45 });
      assert.ok(line.startsWith(`WRONG-LEG PROFILE: ${st.name} — ${st.told}. For ${st.row}.`), line);
      assert.match(line, /Ceilings \d+ m \/ \d+ s from its first flat tick, after which the ordinary 45 m cadence resumes\./);
      assert.ok(line.endsWith(` ${R(st.sizedFrom)}.`), line);
      assert.ok(R(st.sizedFrom).startsWith(`${labelFor(st.kind)}: `));
      assertObservationLine(line, `${id} start`);
    }
  });

  it("a profile that never ran a flat tick says the harness has no readings, not «0 s in band»", () => {
    const line = wrongLegProfileOutcomeLine(make("sc-signal-flashing"));
    assert.match(line, /ANTECEDENT NOT HELD AS SIZED: not one flat tick ran, and the harness has no readings\. SIZING/);
    assertNotHeldLine(line, "zero ticks");
  });
});

// ---------------------------------------------------------------------------
/** A block of the comment-stripped harness between two anchors that must each
 *  occur exactly once. */
function between(startAnchor, endAnchor) {
  const a = CODE.indexOf(startAnchor);
  assert.ok(a >= 0 && CODE.indexOf(startAnchor, a + 1) < 0, `anchor «${startAnchor}» is not unique in lesson-audit.mjs`);
  const b = CODE.indexOf(endAnchor, a + startAnchor.length);
  assert.ok(b > a, `anchor «${endAnchor}» does not follow «${startAnchor}»`);
  return CODE.slice(a, b + endAnchor.length);
}
const PAUSE = () => between("if (p.pause !== null) {", "\n    continue;\n  }");
const FLAT = () => between('if (phase === "flat") {', '} else if (phase === "flat-rest") {');
const FLAT_REST = () => between('} else if (phase === "flat-rest") {', "const readDear = (cost.read ?? []).at(-1) > 1000;");
/** Index of `needle` in `hay`, asserting it is there exactly once. */
const once = (hay, needle, label) => {
  const i = hay.indexOf(needle);
  assert.ok(i >= 0, `${label}: «${needle}» is gone`);
  assert.equal(hay.indexOf(needle, i + 1), -1, `${label}: «${needle}» occurs more than once`);
  return i;
};

describe("§W8 the harness actually wires it — and no profile steers or reads a pose", () => {
  it("imports §5 (no source reader) and creates the state only for a `wrong` leg, with no product read, printing the start line LOUD", () => {
    const imp = CODE.match(/import \{([^}]*\bwrongLegFlatStep\b[^}]*)\} from "\.\/lib\/driveline\.mjs";/);
    assert.ok(imp, "the §5 import is gone");
    assert.deepEqual(imp[1].split(",").map((s) => s.trim()).filter(Boolean).sort(), [
      "createWrongLegProfile", "flatRestDue", "flatRestHoldDone", "readZoneRouteSpan", "resumeThrottleAfterPause", "wrongLegFlatStep", "wrongLegProfileFinish",
      "wrongLegProfileFor", "wrongLegProfileOutcomeLine", "wrongLegProfileStartLine", "wrongLegRestBooked", "wrongLegRestEnded", "wrongLegRestHoldNote",
      "wrongLegRestHoldsClause", "wrongLegRestOpportunity", "wrongLegRestSummary", "wrongLegRestTick",
    ]);
    assert.ok(!/readProfileConstants|consts:/.test(CODE), "the harness still hands the profile product numbers");
    assert.match(CODE, /const wrongProfileDecl = MODE === "right" \? null : wrongLegProfileFor\(SCENARIO\);/);
    assert.match(CODE, /let wrongProfile = createWrongLegProfile\(wrongProfileDecl === null \? null : SCENARIO, \{\s*zoneSpan: wrongProfileDecl !== null && wrongProfileDecl\.kind === "zone-rest" \? readZoneRouteSpan\(SCENARIO, wrongProfileDecl\.zone\) : null,\s*platform: PLATFORM,\s*\}\);/);
    assert.match(CODE, /if \(wrongProfileStart !== null && !STEER_PROOF\) loud\(wrongProfileStart\);/);
  });

  it("the flat tick: the odometer is flatM's own increment, the throttle is the flat `throttle(true)` it always was, flatM is charged the same metres", () => {
    const flat = FLAT();
    assert.match(flat, /const flatStepM = \(Math\.max\(0, p\.kmh\) \/ 3\.6\) \* \(\(now - lastTickAt\) \/ 1000\);/);
    const call = flat.match(/const wrongProfileStep = wrongLegFlatStep\(wrongProfile, \{([\s\S]*?)\}\);/);
    assert.ok(call, "the flat tick no longer calls wrongLegFlatStep");
    const keys = call[1].split(",").map((s) => s.trim().split(":")[0].trim()).filter(Boolean);
    assert.deepEqual(keys, ["now", "t0", "kmh", "flatStepM", "dtMs", "postedKmh", "follow", "probeAt"]);
    assert.match(call[1], /dtMs: now - lastTickAt/);
    assert.match(call[1], /follow: wrongProfile\.on \? parseHazard\(p\.hazard\)\.follow : null/);
    assert.match(call[1], /^\s*probeAt: tickStart,?\s*$/m);
    once(CODE, 'const tickStart = Date.now();\n  const p = await timed("probe", probe);', "tickStart right before the probe");
    assert.equal((CODE.match(/\btickStart\s*=/g) ?? []).length, 1);
    assert.match(call[1], /^\s*now,\s*t0,\s*kmh: p\.kmh,\s*flatStepM,/);
    const pauseEnd = CODE.indexOf(PAUSE()) + PAUSE().length;
    const nowAt = CODE.indexOf("const now = Date.now();", pauseEnd);
    assert.ok(nowAt > pauseEnd && nowAt < CODE.indexOf('if (phase === "flat") {', pauseEnd), "the loop's `now` is no longer the wall clock read after the pause block");
    assert.match(flat, /wrongProfile = wrongProfileStep\.state;/);
    once(flat, 'await timed("pedals", () => throttle(true));', "flat throttle");
    assert.ok(!/wrongProfileStep\.throttle/.test(CODE));
    assert.match(flat, /flatM \+= flatStepM;/);
    assert.ok(!/flatM \+= \(Math\.max/.test(CODE), "flatM is charged from a second copy of the expression");
  });

  it("ROUND 7: the REST OPPORTUNITY is counted on the transition's OWN inputs, right before the transition, after the tick is counted", () => {
    const flat = FLAT();
    const opp = flat.match(/wrongProfile = wrongLegRestOpportunity\(wrongProfile, \{([\s\S]*?)\}\);/);
    assert.ok(opp, "the flat phase no longer counts rest opportunities");
    const due = flat.match(/if \(\s*flatRestDue\(\{([\s\S]*?)\}\)\s*\) \{/);
    assert.ok(due, "the transition is gone");
    const norm = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
    assert.deepEqual(norm(opp[1]), norm(due[1]), "the opportunity count does not read the transition's own inputs");
    assert.deepEqual(norm(opp[1]), ["holdRest", "suppress: wrongProfileStep.suppressRest", "force: wrongProfileStep.forceRest", "flatM", "sincePhaseMs: now - phaseAt", "phaseTicks", "everyM: FLAT_REST_EVERY_M", "maxMs: FLAT_REST_MAX_MS"]);
    const iOpp = flat.indexOf(opp[0]);
    assert.ok(flat.indexOf("phaseTicks++;") < iOpp && flat.indexOf("flatM += flatStepM;") < iOpp && iOpp < flat.indexOf(due[0]), "the count is not between the tick's counting and the transition");
    // …and nothing reads its count to decide anything: the harness never reads `.opportunities`.
    assert.ok(!/\.opportunities\b/.test(CODE));
  });

  it("N14: the posted disc reaching the profile is the В26 DISC'S OWN READING — never null, never a constant, never another label", () => {
    const call = FLAT().match(/const wrongProfileStep = wrongLegFlatStep\(wrongProfile, \{([\s\S]*?)\}\);/)[1];
    const posted = call.match(/^\s*postedKmh:\s*(.+?),\s*$/m);
    assert.ok(posted, "the flat tick no longer hands the profile a postedKmh");
    assert.equal(posted[1], "wrongProfile.on ? postedLimitKmh(p.postedLabels) : null");
    assert.match(CODE, /postedSel: POSTED_LIMIT_SEL,/);
    assert.match(CODE, /for \(const el of document\.querySelectorAll\(postedSel\)\) \{\s*const l = el\.getAttribute\("aria-label"\);/);
    assert.equal(POSTED_LIMIT_SEL, '[aria-label^="Ограничение "]');
    assert.equal(postedLimitKmh(["Ограничение 50 км/ч", "Ограничение 50 км/ч"]), 50);
    assert.equal(postedLimitKmh(null), null);
    const fed = wrongLegFlatStep(make("sc-signal-flashing"), { now: 1, t0: 0, kmh: 30, flatStepM: 4, dtMs: 500, postedKmh: postedLimitKmh(["Ограничение 50 км/ч"]) }).state;
    assert.deepEqual([fed.finish.gradedAboveKmh, fed.finish.dangerousAboveKmh], [55, 60]);
    const starved = drive(make("sc-signal-flashing"), [30, 58, 58, 58, 58, 58, 58, 58], () => ({ postedKmh: null }));
    assert.equal(wrongLegProfileFinish(starved.state, { now: starved.now, t0: 10_000, driveEnded: true }).state.heldAsSized, false);
  });

  it("the profile is created with the leg's PLATFORM — the zone profile's census gate reads it", () => {
    assert.match(CODE, /const \[OUT, SCENARIO, PLATFORM = "mobile", LEG_MODE = "right"\] = process\.argv\.slice\(2\);/);
  });

  it("F12/V10: the flat phase counts its ticks BEFORE the transition reads them", () => {
    const flat = FLAT();
    assert.ok(once(flat, "phaseTicks++;", "flat phaseTicks") < once(flat, "flatRestDue({", "flat transition"));
    assert.equal(flatRestDue({ force: true, phaseTicks: 0, everyM: 45, maxMs: 20_000 }), false);
    assert.equal(flatRestDue({ force: true, phaseTicks: 1, everyM: 45, maxMs: 20_000 }), true);
  });

  it("F12/V06 + V11: the pause drain resets `lastTickAt` and lets go of BOTH pedal keys — the profile clocks and the zone hold rest on it", () => {
    const pause = PAUSE();
    const drained = once(pause, "const drained = await drainPause();", "pause drain");
    assert.ok(once(pause, "lastTickAt = Date.now();", "pause lastTickAt reset") > drained);
    const upW = once(pause, 'await page.keyboard.up("KeyW").catch(() => {});', "pause KeyW up");
    const upS = once(pause, 'await page.keyboard.up("KeyS").catch(() => {});', "pause KeyS up");
    const holdW = once(pause, "holdW = false;", "pause holdW");
    const holdS = once(pause, "holdS = false;", "pause holdS");
    assert.ok(drained < upW && upW < upS && upS < holdW && holdW < holdS, "the drain's key release is out of order");
    const repress = once(pause, 'if (MODE !== "right" && resumeThrottleAfterPause(wrongProfile)) await throttle(true);', "guarded re-press");
    assert.ok(holdS < repress && repress < pause.lastIndexOf("continue;"));
    // The pause resets the phase clock too — the rest-opportunity stretch's time half restarts with it.
    once(pause, "phaseAt = Date.now();", "pause phaseAt reset");
    assert.equal((CODE.match(/if \(MODE !== "right"\) await throttle\(true\);/g) ?? []).length, 1, "an unconditional re-press is back in the pause drain");
  });

  it("F12/V09 + V07: the rest presses the brake, and books the rest at the full-stop line the zone hold is sized on (the design constant, harness to harness)", () => {
    const rest = FLAT_REST();
    const off = once(rest, "await throttle(false);", "rest throttle off");
    const press = once(rest, "await brake(true, p.kmh);", "rest brake press");
    const m = rest.match(/const atRest = p\.kmh >= 0 && p\.kmh <= (\d+(?:\.\d+)?);/);
    assert.ok(m, "the rest's at-rest test is gone");
    assert.ok(off < press && press < rest.indexOf(m[0]));
    assert.equal(Number(m[1]), D("fullStopMaxSpeedKmh"), `the rest is booked at ${m[1]} км/ч, not the full-stop line the zone hold is sized on`);
    let st = drive(make("sc-pk-busstop-ban"), FLAT_SERIES, () => ({}), FLAT_TICK_MS).state;
    st = wrongLegRestBooked(st, { now: 1, t0: 0, holdMs: HOLD_MS, kmh: 0 }).state;
    st = wrongLegRestTick(st, { kmh: D("fullStopMaxSpeedKmh") + 1, dtMs: 500 });
    assert.equal(st.zone.stirs, 1);
  });

  it("the rest: booked with THIS tick's dial, tallied, ended through the profile — the rest note is §5's on a declared lane and the sentence that always stood on every other", () => {
    const rest = FLAT_REST();
    assert.match(rest, /const wrongProfileRest = wrongLegRestBooked\(wrongProfile, \{ now, t0, holdMs: FLAT_REST_HOLD_MS, kmh: p\.kmh \}\);/);
    assert.match(rest, /wrongProfile = wrongLegRestTick\(wrongProfile, \{ kmh: p\.kmh, dtMs: now - lastTickAt \}\);/);
    assert.match(rest, /if \(restLogged && flatRestHoldDone\(\{ now, restAt: flatRestAt, holdMs: FLAT_REST_HOLD_MS, state: wrongProfile \}\)\) \{/);
    assert.equal((rest.match(/const wrongProfileRestEnd = wrongLegRestEnded\(wrongProfile, \{ now, t0(?:, gaveUp: true)? \}\);\s*wrongProfile = wrongProfileRestEnd\.state;/g) ?? []).length, 2);
    assert.ok(!/const ended = wrongLegRestEnded/.test(CODE));
    // The note: `wrongProfileRestNote ?? <the sentence that always stood>`, and it is null on every lane with no profile.
    assert.match(rest, /holds it for ` \+\s*\(wrongProfileRestNote \?\?\s*`\$\{FLAT_REST_HOLD_MS \/ 1000\}s — twice the engine's 4 s ban-zone sustain\. Where it stopped is the product's ` \+\s*`question, not this harness's\.`\) \+/);
    for (const st of [createWrongLegProfile("sc-pk-ban-stop", {}), createWrongLegProfile(null, {})]) {
      assert.equal(wrongLegRestHoldNote(st, { state: st, holdMs: HOLD_MS, zone: false }, { holdMs: HOLD_MS }), null);
    }
    // …and on EVERY declared lane — running or refused — the note is §5's, with no sentence about the product.
    for (const st of [...[...WRONG_LEG_PROFILES.keys()].map((id) => make(id)), createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: SPAN, platform: "mobile" })]) {
      const note = wrongLegRestHoldNote(st, { state: st, holdMs: HOLD_MS, zone: false }, { holdMs: HOLD_MS });
      // (Round 9: «Where it stopped is not a harness reading» was FALSE — `guidePose` records the pose on every
      // flat-rest tick; the note now says so, and §W10 A checks the sentence against the harness's code.)
      assert.equal(note, `8s, the harness's ordinary hold (WRONG-LEG PROFILE ${st.name} is declared on this lane). The harness reads the dev pose probe on every flat and flat-rest tick and records what it returns among its guidance samples; no profile decision reads it.`);
      assert.ok(!/not a harness reading|never read/.test(note));
      assert.ok(!/engine|product|ban-zone sustain/.test(note));
    }
    const z = drive(make("sc-pk-busstop-ban"), FLAT_SERIES, () => ({}), FLAT_TICK_MS).state;
    const b = wrongLegRestBooked(z, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh: 0 });
    assert.equal(wrongLegRestHoldNote(b.state, b, { holdMs: HOLD_MS }), "34s on the profile clock — WRONG-LEG PROFILE come-to-rest-inside-the-bus-stop-zone: a hold sized from 20 s (the law-bus-stop basis) + BAN_ZONE_REST_REGRADE_SEC 6 s + the harness's 8 s, sized at 4112566. The profile placed this rest by DEAD RECKONING, not by the pose: the harness reads the dev pose probe on every flat and flat-rest tick and records what it returns among its guidance samples, and no profile decision reads it.");
  });

  it("the drive's end: closed with the loop's own `ended` flag, the outcome printed (LOUD unless held as sized), the summary from §5, published on the sidecar", () => {
    assert.match(CODE, /wrongProfile = wrongLegProfileFinish\(wrongProfile, \{ now: Date\.now\(\), t0, driveEnded: ended \}\)\.state;/);
    assert.match(CODE, /const wrongProfileOutcome = wrongLegProfileOutcomeLine\(wrongProfile\);\s*if \(wrongProfileOutcome !== null\) \(wrongProfile\.heldAsSized \? note : loud\)\(wrongProfileOutcome\);/);
    assert.match(CODE, /\.\.\.\(MODE !== "right" && wrongProfile\.declared \? \{ wrongLegProfile: wrongProfile \} : \{\}\),/);
    assert.ok(!/wrongLegProfile: MODE === "right"/.test(CODE), "a null key is published on every lane again");
    // The summary clause is §5's, appended to the rest note that always stood; "" on every lane with no running profile.
    assert.match(CODE, /`the product judging THOSE stops[\s\S]{0,2400}?: ""\) \+\s*wrongLegRestSummary\(wrongProfile\),\s*\);/);
    assert.ok(!/restsSuppressed|zone rest is held/.test(CODE), "the harness still composes the round-6 summary clause");
  });

  it("§5 never reads a pose and never touches the wheel", () => {
    // (Round 9: §5's CODE — its templates now say, truly, that the harness reads the pose; a word is not a read.)
    assert.ok(!/__roadProbe|__camProbe|roadProbe|camProbe|\bwx\b|\bwz\b|guidePose|pose\s*[:.(]/.test(blankLiterals(SEC5)), "a pose read reached §5");
    assert.ok(!/KeyA|KeyD|STEER_KEYS|steerRelease|sChannel|keyboard|page\./.test(SEC5), "a steering or key command reached §5");
  });
});

// ---------------------------------------------------------------------------
/** lesson-audit.mjs's rest-summary note AT 4112566, verbatim — the block the
 *  profile wiring was added to. Every lane without a running zone rest must
 *  still print exactly this. */
function restSummaryAt4112566({ stopsMade, FLAT_REST_HOLD_MS, FLAT_REST_EVERY_M, overLimit }) {
  return (
    `  WRONG-LEG RESTS: ${stopsMade} careless full stop${stopsMade === 1 ? "" : "s"}, each held ${FLAT_REST_HOLD_MS / 1000}s ` +
    `(FLAT_REST_EVERY_M = ${FLAT_REST_EVERY_M} m). Any «Рязко спиране без причина» or «Спиране в забранена зона» below is ` +
    `the product judging THOSE stops — the instrument's behaviour, not the lesson script's. AND IT CUTS THE OTHER WAY: a ` +
    `careless rest can land on a „спри на разрешеното място" mark and CREDIT it, so a wrong leg that PASSES may have ` +
    `stopped by luck rather than by driving well — measured on sc-pk-ban-stop/mobile/wrong, 2026-08-28.` +
    (overLimit.on
      ? ` AND THE FIRST STOP ON THIS LANE IS LATER THAN 45 m: SUSTAINED_OVER_LIMIT_LANES held the cadence back (${overLimit.why ?? "-"}). ` +
        `That changes WHEN the first rest fell, not WHOSE act it is — every stop above is still this instrument's, the first one included.`
      : "")
  );
}
/** The harness's rest-summary block AS IT IS NOW, executed: its body is lifted
 *  out of lesson-audit.mjs and run with the real §5 functions and a stub `note`. */
function restSummaryNow(vars) {
  const at = SRC.indexOf('if (MODE !== "right" && stopsMade > 0) {');
  assert.ok(at > 0 && SRC.indexOf('if (MODE !== "right" && stopsMade > 0) {', at + 1) < 0, "UNREADABLE: the rest-summary block");
  const T = lexTokens(SRC);
  const open = T.findIndex((t) => t.at >= at && t.text === "{");
  const body = SRC.slice(T[open].end, T[closeOf(T, open)].at);
  const printed = [];
  // eslint-disable-next-line no-new-func
  new Function("note", "stopsMade", "FLAT_REST_HOLD_MS", "FLAT_REST_EVERY_M", "overLimit", "wrongProfile", "wrongLegRestHoldsClause", "wrongLegRestSummary", body)(
    (s) => printed.push(s), vars.stopsMade, vars.FLAT_REST_HOLD_MS, vars.FLAT_REST_EVERY_M, vars.overLimit, vars.wrongProfile, wrongLegRestHoldsClause, wrongLegRestSummary,
  );
  assert.equal(printed.length, 1, "the rest-summary block printed other than one note");
  return printed[0];
}
/** A zone profile whose zone rest was BOOKED and held `n` ticks at rest (a stir on the 4th). */
const zoneBooked = (n = 70) => {
  let h = wrongLegRestBooked(drive(make("sc-pk-busstop-ban"), FLAT_SERIES, () => ({}), FLAT_TICK_MS).state, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh: 0 }).state;
  for (let i = 0; i < n; i++) h = wrongLegRestTick(h, { kmh: i === 3 ? 3 : 0, dtMs: 500 });
  return h;
};

describe("§W9 ROUND 8 — the round-7 verifier's conditions, each one executed", () => {
  it("C1 THE DRILL'S 3 s IS A DESIGN CONSTANT: provenance, «sized at 4112566» on the reading and in the sizing, and no number of the lesson's left in the table", () => {
    const d = PROFILE_DESIGN.drillTaughtGapSec;
    assert.deepEqual({ ...d }, { value: 3, unit: "s", from: "templates-conditions2.ts SC_AC_TRUCK_SPRAY.instructionsBg(5)", at: "4112566" });
    const truck = WRONG_LEG_PROFILES.get("sc-ac-truck-spray");
    assert.equal("lessonRuleSec" in truck, false, "the truck row still carries the lesson's number itself");
    assert.ok(truck.sizedBy.includes("drillTaughtGapSec"));
    const st = make("sc-ac-truck-spray");
    assert.equal(st.lead.lessonRuleSec, D("drillTaughtGapSec"));
    const L = drive(st, Array(7).fill(110), () => ({ follow: chip(58, 1.9) })).state;
    const line = wrongLegProfileOutcomeLine(L);
    assert.match(line, / · 3\.5 s under the drill's taught 3 s \(a design constant sized at 4112566\) · /);
    assert.match(line, /; the drill's taught gap drillTaughtGapSec 3 s, a reading only \(no run is sized to it\)\.$/);
    // The line prints the DESIGN value, whatever the table says: a row with a number of its own changes nothing.
    assert.ok(!/lessonRuleSec: \d/.test(SEC5), "a lesson number is hard-coded in §5's code again");
    // …and the zone model names what the MODEL holds, sized at 4112566 — no product physics structure.
    assert.ok(!/gripFactor|wetGrip|snowGrip|surface patches|physics\./.test(Object.values(PROFILE_LINE_TEMPLATES).join("\n")));
    assert.match(PROFILE_LINE_TEMPLATES["zone.model"], /\(design constants sized at \{at:tok\}\)/);
  });

  it("C2a THE SUMMARY SAYS «CHANGED WHEN THESE RESTS FELL» ONLY WHEN THE PROFILE HELD A DUE REST BACK OR BOOKED ONE (the verifier's P1a and P1b, with real rests)", () => {
    // P1a: the truck profile with no lead on the chip — 20-odd ordinary rests, none held back, none booked.
    const a = driveCadence(make("sc-ac-truck-spray"), Array(120).fill(58), { dtMs: 516, extra: () => ({ follow: null }) });
    assert.ok(a.rests >= 10, `only ${a.rests} rests`);
    assert.deepEqual([a.state.opportunities.count, a.state.restsForced, a.state.heldTicks], [0, 0, 0]);
    const sa = wrongLegRestSummary(wrongLegProfileFinish(a.state, { now: a.now, t0: 10_000, driveEnded: true }).state);
    assert.ok(!/CHANGED WHEN THESE RESTS FELL/.test(sa), sa);
    assert.equal(sa, ` AND A WRONG-LEG PROFILE (close-on-the-truck-into-its-spray) WAS ON FOR THIS LANE AND HELD NO DUE REST BACK AND BOOKED NONE: ${R(profileText("rests", { opp: 0, every: EVERY_M, maxS: MAX_MS / 1000, held: 0, forced: 0 }))}. Every rest above fell on a tick where the 45 m / 20 s cadence was due and the harness's own task-cap and over-limit holds were not holding, and every stop is still this instrument's act.`);
    assertObservationLine(sa, "P1a summary");
    // P1b: the zone profile blind at its third tick — held two ticks, but no due rest among them.
    const b = driveCadence(make("sc-pk-busstop-ban"), [8, 11, -1, ...Array(80).fill(58)], { dtMs: 516 });
    assert.ok(b.rests >= 5);
    assert.deepEqual([b.state.done, b.state.opportunities.count, b.state.restsForced], ["blind", 0, 0]);
    assert.match(wrongLegRestSummary(b.state), /HELD NO DUE REST BACK AND BOOKED NONE: 0 rest opportunity\(ies\) held back .* on 2 held flat tick\(s\), 0 rest\(s\) booked by the profile\. Every rest above/);
    // …and a profile that DID hold a due rest back, or booked one, says CHANGED.
    assert.match(wrongLegRestSummary(driveCadence(make("sc-signal-flashing"), FLAT_SERIES, { dtMs: FLAT_TICK_MS }).state), /CHANGED WHEN THESE RESTS FELL: 5 rest opportunity/);
    assert.match(wrongLegRestSummary(zoneBooked(10)), /CHANGED WHEN THESE RESTS FELL: 0 rest opportunity\(ies\) .*, 1 rest\(s\) booked by the profile \(the zone rest's longest/);
  });

  it("C2a …AND THE CHOICE IS TRUE: over 1500 random legs with real rests, drains, the harness's own hold and a lead that comes and goes, «CHANGED» is printed exactly when some tick held a DUE rest back (an independent recount) or the profile booked one", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    let changed = 0, unchanged = 0;
    for (let k = 0; k < 1500; k++) {
      const id = ["sc-signal-flashing", "sc-ac-truck-spray", "sc-ov-keep-right", "sc-pk-busstop-ban"][k % 4];
      const len = 10 + Math.floor(rnd() * 120);
      const series = Array.from({ length: len }, () => (rnd() < 0.04 ? -1 : Math.round(rnd() * 70)));
      const lead = Array.from({ length: len }, () => rnd() < 0.5);
      const h0 = Math.floor(rnd() * len), h1 = h0 + Math.floor(rnd() * 20);
      const pauses = new Set(Array.from({ length: Math.floor(rnd() * 3) }, () => Math.floor(rnd() * len)));
      // The same loop as driveCadence, recounting on the side whether a due rest was held back while active.
      let st = make(id);
      let now = 10_000, flatM = 0, phaseAt = now, phaseTicks = 0, heldBackDue = false;
      for (let i = 0; i < len; i++) {
        const kmh = series[i];
        const flatStepM = (Math.max(0, kmh) / 3.6) * 0.5;
        const prof = wrongLegFlatStep(st, { now, t0: 10_000, kmh, flatStepM, dtMs: 500, postedKmh: 50, follow: lead[i] ? chip(40, 2.6) : null, probeAt: now });
        const wasActive = prof.state.on === true && prof.state.active === true;
        st = prof.state;
        phaseTicks++;
        flatM += flatStepM;
        const args = { holdRest: i >= h0 && i < h1, suppress: prof.suppressRest, force: prof.forceRest, flatM, sincePhaseMs: now - phaseAt, phaseTicks, everyM: EVERY_M, maxMs: MAX_MS };
        const ordinaryDue = !args.holdRest && (flatM >= EVERY_M || args.sincePhaseMs >= MAX_MS) && phaseTicks >= 1;
        if (wasActive && ordinaryDue && prof.suppressRest && !prof.forceRest) heldBackDue = true;
        st = wrongLegRestOpportunity(st, args);
        if (flatRestDue(args)) { flatM = 0; phaseAt = now; phaseTicks = 0; }
        if (pauses.has(i)) phaseAt = now;
        now += 500;
      }
      if (st.on !== true) continue;
      const s = wrongLegRestSummary(st);
      const says = /CHANGED WHEN THESE RESTS FELL/.test(s);
      assert.equal(says, heldBackDue || st.restsForced > 0, `${id} leg ${k}: the summary says ${says ? "CHANGED" : "unchanged"}, the recount says a due rest was ${heldBackDue ? "" : "not "}held back and ${st.restsForced} booked`);
      if (says) changed++;
      else unchanged++;
    }
    assert.ok(changed > 100 && unchanged > 100, `the random legs did not reach both clauses (${changed} / ${unchanged})`);
  });

  it("C2b THE SIZING LABEL SAYS EXACTLY WHAT IS READ — nothing, or the zone's authored world file and trace — and the zone's label names them for any basis the world file carries (the verifier's P2)", () => {
    for (const id of ["sc-signal-flashing", "sc-ov-keep-right", "sc-ac-truck-spray"]) assert.equal(R(make(id).sizedFrom.f.label), SIZING_LABEL, id);
    const bus = make("sc-pk-busstop-ban");
    const sign = createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: { ...SPAN, basis: "sign" }, platform: "pc" });
    assert.deepEqual([bus.zone.holdSec, sign.zone.holdSec], [34, 18], "the basis read at drive time no longer sizes the hold");
    for (const st of [bus, sign]) {
      assert.equal(R(st.sizedFrom.f.label), ZONE_SIZING_LABEL);
      assert.ok(R(st.sizedFrom).includes("read at drive time from authored content"));
    }
    assert.ok(!/nothing is read at drive time/.test(Object.values(PROFILE_LINE_TEMPLATES).join("\n")), "a template still says nothing is read at drive time");
    assert.equal(ZONE_TRACE_FILE, "shadow-correct.trace.json");
    assert.match(SEC5, /readFileSync\(root \+ "content\/traces\/" \+ scenario \+ "\/shadow-correct\.trace\.json", "utf8"\)/, "the label names a trace file readZoneRouteSpan does not read");
  });

  it("C2c THE OLDER REST SUMMARY PRINTS THE TRUE HOLDS: on a lane whose zone rest was BOOKED, «each held 8s» gives way to the zone tally; on every other lane it is the 4112566 sentence byte for byte", () => {
    const base = { FLAT_REST_HOLD_MS: HOLD_MS, FLAT_REST_EVERY_M: EVERY_M };
    // EVERY lane without a booked zone rest — no profile, a right leg, a declared profile of each kind, a refused
    // zone, a zone that braked but never came to rest, a zone that never braked — prints the 4112566 sentence.
    const nr = wrongLegRestEnded(drive(make("sc-pk-busstop-ban"), FLAT_SERIES, () => ({}), FLAT_TICK_MS).state, { now: 70_000, t0: 10_000, gaveUp: true }).state;
    const states = [
      createWrongLegProfile("sc-pk-ban-stop", {}),
      createWrongLegProfile(null, {}),
      ...["sc-signal-flashing", "sc-ov-keep-right", "sc-ac-truck-spray"].map((id) => driveCadence(make(id), FLAT_SERIES, { dtMs: FLAT_TICK_MS }).state),
      createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: SPAN, platform: "mobile" }),
      nr,
      zoneHeldThenMissed(),
    ];
    // ROUND 10 (the round-9 verifier's IMPRECISE-SELF-STATEMENTS c): «each held 8s» is not true when the drive ends
    // mid-hold, so on every DECLARED lane — the profile on or refused — it gives way to the true holds too; only a lane
    // with NO declared profile keeps the 4112566 words byte for byte.
    const PLAIN = "each held on the ordinary 8s hold of wall clock, and the drive's end ended any hold still open";
    for (const wrongProfile of states) {
      for (const stopsMade of [1, 2, 5]) {
        for (const overLimit of [{ on: false }, { on: true, why: "the task cap" }]) {
          const v = { ...base, stopsMade, overLimit, wrongProfile };
          const at4112566 = restSummaryAt4112566(v);
          const want = (wrongProfile.declared ? at4112566.replace("each held 8s ", `${PLAIN} `) : at4112566) + wrongLegRestSummary(wrongProfile);
          assert.equal(restSummaryNow(v), want, `${wrongProfile.scenario}: the rest summary is not the 4112566 sentence with the true holds`);
          assert.equal(wrongLegRestHoldsClause(wrongProfile, { stops: stopsMade, holdMs: HOLD_MS }), wrongProfile.declared ? PLAIN : null);
        }
      }
    }
    // A BOOKED zone rest: the true holds, rendered from the table.
    const z = wrongLegRestEnded(zoneBooked(70), { now: 90_000, t0: 10_000 }).state;
    const clause = wrongLegRestHoldsClause(z, { stops: 3, holdMs: HOLD_MS });
    // (Round 9: «held 8s each» was not true of a hold the drive's end cut short; the clause names the hold each rest
    // was held ON, and says the end ends any hold still open.)
    assert.equal(clause, `2 held on the ordinary 8s hold of wall clock and 1 held on the zone profile's own tally (a 34 s hold of continuous rest on the profile clock, with a wall ceiling of 90 s; its longest continuous run read ${(z.zone.bestHeldMs / 1000).toFixed(1)} s); the drive's end ended any hold still open`);
    assert.equal(z.zone.bestHeldMs / 1000, (70 - 5) * 0.5, "the fixture's run");
    assert.equal(ZONE_REST_WALL_CEILING_MS / 1000, 90);
    const now = restSummaryNow({ ...base, stopsMade: 3, overLimit: { on: false }, wrongProfile: z });
    assert.ok(now.startsWith(`  WRONG-LEG RESTS: 3 careless full stops, ${clause} (FLAT_REST_EVERY_M = 45 m). Any «Рязко спиране без причина»`), now);
    assert.ok(!/each held 8s/.test(now), "the zone lane still says every rest was held 8 s");
    assert.match(now, /\(the zone rest's longest continuous run was 32\.5 s on the profile clock, against a 34 s hold and a sized 27 s\)\. Each rest above has its own «came to REST» line/);
    // One stop, the zone rest alone.
    assert.match(wrongLegRestHoldsClause(z, { stops: 1, holdMs: HOLD_MS }), /^0 held on the ordinary 8s hold of wall clock and 1 held on the zone profile's own tally/);
    assert.equal(wrongLegRestHoldsClause(z, { stops: 0, holdMs: HOLD_MS }), null);
  });

  it("C3 THE READINGS PIPELINE, PINNED — the round-7 verifier's six surviving mutants T01, T03, T04, T07, T10 and T11, each a fixture that separates the truth from the mutant", () => {
    // T01 — the wall interval's anchor moves on EVERY flat reading, an unread one too: 1000 → 1500 (unread) → 2600.
    let s = make("sc-signal-flashing");
    for (const [now, kmh] of [[1000, 58], [1500, -1], [2600, 58]]) s = wrongLegFlatStep(s, { now, t0: 0, kmh, flatStepM: 8, dtMs: 500, postedKmh: 50, probeAt: now }).state;
    assert.deepEqual([s.prevFlatAt, s.maxWallMs], [2600, 1100], "the longest wall interval skipped the unread reading (1600 ms from 1000 to 2600)");
    assert.match(wrongLegProfileOutcomeLine(s), /longest wall interval between two flat readings 1100 ms/);
    // T03 — «read on D of T» is the disc's READ ticks: unread BEFORE its first reading is not read.
    const late = drive(make("sc-signal-flashing"), [30, 40, 58], (i) => ({ postedKmh: i === 0 ? null : 50 })).state;
    assert.match(wrongLegProfileOutcomeLine(late), /disc 50 \(0 change\(s\)\), read on 2 of 3 flat tick\(s\) \(0 unread after its first reading, 1 before it\)/);
    // T04 — the summary's longest continuous run is the BEST run, not the current one (10 s, a stir, then 4.5 s).
    let z = wrongLegRestBooked(drive(make("sc-pk-busstop-ban"), FLAT_SERIES, () => ({}), FLAT_TICK_MS).state, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh: 0 }).state;
    for (const kmh of [...Array(20).fill(0), 3, ...Array(10).fill(0)]) z = wrongLegRestTick(z, { kmh, dtMs: 500 });
    assert.deepEqual([z.zone.bestHeldMs, z.zone.heldMs], [10_000, 4_500]);
    assert.match(wrongLegRestSummary(z), /\(the zone rest's longest continuous run was 10\.0 s on the profile clock, against a 34 s hold and a sized 27 s\)/);
    assert.match(wrongLegRestHoldsClause(z, { stops: 1, holdMs: HOLD_MS }), /its longest continuous run read 10\.0 s\); the drive's end ended any hold still open$/);
    // T07 — a dip ends the run AND its unread count: the unread tick of an earlier run is not credited to the next.
    const t7 = drive(make("sc-ov-keep-right"), [40, -1, 40, 3, ...Array(40).fill(40)]);
    const held = t7.steps.find((x) => x.say !== null);
    assert.ok(held, "the stint never held");
    assert.match(held.say.line, /no dip, 0 unread tick\(s\) inside it not credited — against the sized 16 s/);
    assert.match(wrongLegProfileOutcomeLine(t7.state), /· 1 dip\(s\) to ≤ movingSpeedKmh · 1 unread tick\(s\), 0 of them inside the best run · /);
    // T10 — the held line's reading age is the measured probe wait PLUS the allowance: a 150 ms wait prints 150 + 300.
    const t10 = drive(make("sc-signal-flashing"), FLAT_SERIES.slice(0, SXF_145_TICKS), (i, now) => ({ probeAt: now - 150 }), FLAT_TICK_MS);
    const f10 = wrongLegProfileFinish(t10.state, { now: t10.now, t0: 10_000, driveEnded: true }).state;
    assert.equal(f10.heldAsSized, true, R(f10.observed));
    assert.equal(f10.finish.prevAgeMs, 150 + dialLagAllowanceMs("pc", D("DASHBOARD_POLL_MS")));
    assert.match(R(f10.observed), /and by the harness's estimate up to 450 ms before its tick$/);
    // T11 — a lead-close tick with NO lead on the chip holds nothing back and is not a held tick.
    const t11 = drive(make("sc-ac-truck-spray"), Array(10).fill(58), () => ({ follow: null })).state;
    assert.deepEqual([t11.heldTicks, t11.lead.noLeadTicks], [0, 10]);
    assert.match(wrongLegProfileOutcomeLine(t11), / on 0 held flat tick\(s\), 0 rest\(s\) booked by the profile · /);
  });

  it("C3+ EVERY TALLY A READINGS LINE PRINTS, RECOUNTED: over random legs each count equals an independent recount of the ticks that drove it — a tally that is only consistent with itself is not pinned", () => {
    let seed = 20260926;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const band = (p) => [p + Math.min(p * D("speedingGraceRatio"), D("speedingGraceMaxKmh")), p + D("dangerousSpeedOverKmh")];
    const zoneBraking = drive(make("sc-pk-busstop-ban"), FLAT_SERIES, () => ({}), FLAT_TICK_MS).state;
    for (let k = 0; k < 400; k++) {
      // ── finish-open: the disc clause, the in-band / above-band / unread counts, first / top / last ──
      {
        const len = 3 + Math.floor(rnd() * 40);
        const series = Array.from({ length: len }, () => (rnd() < 0.08 ? -1 : Math.round(20 + rnd() * 50)));
        const disc = Array.from({ length: len }, () => (rnd() < 0.1 ? null : rnd() < 0.06 ? 40 : 50));
        const st = drive(make("sc-signal-flashing"), series, (i) => ({ postedKmh: disc[i] })).state;
        let posted = null, g = null, d = null, inB = 0, above = 0, unread = 0, top = -1, read = 0, before = 0, after = 0, changes = 0;
        for (let i = 0; i < len; i++) {
          if (disc[i] === null) { if (posted === null) before++; else after++; }
          else { read++; if (disc[i] !== posted) { if (posted !== null) changes++; posted = disc[i]; [g, d] = band(posted); } }
          const v = series[i] >= 0 ? series[i] : null;
          if (v === null) { unread++; continue; }
          if (v > top) top = v;
          if (g !== null) { if (v > g + 0.5 && v <= d - 0.5) inB++; if (v > d) above++; }
        }
        const first = series[0] >= 0 ? series[0] : null;
        const last = series[len - 1] >= 0 ? series[len - 1] : null;
        const F = st.finish;
        assert.deepEqual([F.inBandTicks, F.aboveBandTicks, F.unreadTicks, F.topKmh, F.discReadTicks, F.discUnreadBefore, F.discUnreadAfter, F.limitChanges, F.firstKmh, F.lastKmh], [inB, above, unread, top, read, before, after, changes, first, last], `finish-open leg ${k}`);
        const line = wrongLegProfileOutcomeLine(st);
        assert.ok(line.includes(` · ${inB} in-band / ${above} above-band / ${unread} unread dial reading(s) of ${len} flat tick(s) · first ${first ?? "UNREAD"} · top ${top >= 0 ? top : "NOT RECORDED"} · last ${last ?? "UNREAD"} км/ч · `), `finish-open leg ${k}: ${line}`);
        assert.ok(line.includes(`(${changes} change(s)), read on ${read} of ${len} flat tick(s) (${after} unread after its first reading, ${before} before it)`), `finish-open leg ${k}: ${line}`);
      }
      // ── lead-close: lead / absent / unparsed / edge counts, chip minima, the drill tally, top ──
      {
        const len = 3 + Math.floor(rnd() * 30);
        const chips = Array.from({ length: len }, () => {
          const u = rnd();
          if (u < 0.2) return null;
          if (u < 0.28) return { present: true, parsed: false, meters: null, heldSec: null };
          return chip(20 + Math.floor(rnd() * 60), Math.round((1.0 + rnd() * 3) * 10) / 10);
        });
        const series = Array.from({ length: len }, () => (rnd() < 0.05 ? -1 : Math.round(10 + rnd() * 120)));
        const r = drive(make("sc-ac-truck-spray"), series, (i) => ({ follow: chips[i] }));
        const endAt = r.steps.findIndex((s) => s.state.active !== true);
        const n = endAt < 0 ? len : endAt + 1;
        const h = D("chipSecondsHalfQuantum");
        const baseL = D("followSafeSeconds") * D("followFireRatio");
        const rainL = baseL * D("followRainSecondsFactor");
        let lead = 0, absent = 0, unparsed = 0, edge = 0, minSec = null, minM = null, top = -1, under = 0;
        for (let i = 0; i < n; i++) {
          const c = chips[i];
          const v = series[i] >= 0 ? series[i] : null;
          if (v !== null && v > top) top = v;
          if (c !== null && c.parsed !== true) unparsed++;
          if (!(c !== null && c.parsed === true)) { absent++; continue; }
          lead++;
          if (minM === null || c.meters < minM) minM = c.meters;
          if (minSec === null || c.heldSec < minSec) minSec = c.heldSec;
          const uB = c.heldSec + h < baseL;
          const uR = c.heldSec - h >= baseL && c.heldSec + h < rainL;
          if (!uB && !uR && c.heldSec - h < rainL) edge++;
          if (c.heldSec < D("drillTaughtGapSec")) under += 0.5;
        }
        const L = r.state.lead;
        assert.deepEqual([L.leadTicks, L.noLeadTicks, L.unparsedTicks, L.edgeTicks, L.minSec, L.minM, L.topKmh, Number(L.underLessonRuleSec.toFixed(6))], [lead, absent, unparsed, edge, minSec, minM, top, under], `lead-close leg ${k}`);
        const line = wrongLegProfileOutcomeLine(r.state);
        assert.ok(line.includes(`READINGS: lead on the chip ${lead} tick(s), absent ${absent}, unparsed ${unparsed}, on a band edge ${edge}, opening ${L.openingTicks} · chip minimum ${minSec ?? "-"} с / ${minM ?? "-"} м · `), `lead-close leg ${k}: ${line}`);
        assert.ok(line.includes(` · ${under.toFixed(1)} s under the drill's taught 3 s (a design constant sized at 4112566) · top ${top >= 0 ? top : "NOT RECORDED"} км/ч · `), `lead-close leg ${k}: ${line}`);
      }
      // ── the zone rest's tally: stirs, breaks, unread, the longest continuous run ──
      {
        const book = rnd() < 0.2 ? 3 : 0;
        const ticks = Array.from({ length: 5 + Math.floor(rnd() * 60) }, () => { const u = rnd(); return u < 0.06 ? -1 : u < 0.12 ? 3 : u < 0.16 ? 9 : u < 0.3 ? 1 : 0; });
        let z = wrongLegRestBooked(zoneBraking, { now: 50_000, t0: 10_000, holdMs: HOLD_MS, kmh: book }).state;
        for (const kmh of ticks) z = wrongLegRestTick(z, { kmh, dtMs: 500 });
        let q = book <= D("fullStopMaxSpeedKmh"), held = 0, best = 0, stirs = 0, breaks = 0, unread = 0;
        for (const v of ticks) {
          if (v < 0) unread++;
          else if (v <= D("fullStopMaxSpeedKmh")) { if (q) held += 500; q = true; }
          else { if (v > D("movingSpeedKmh")) breaks++; else stirs++; held = 0; q = false; }
          if (held > best) best = held;
        }
        assert.deepEqual([z.zone.stirs, z.zone.breaks, z.zone.unreadTicks, z.zone.bestHeldMs, z.zone.heldMs], [stirs, breaks, unread, best, held], `zone leg ${k}`);
        assert.ok(wrongLegProfileOutcomeLine(z).includes(` · longest continuous rest ${(best / 1000).toFixed(1)} s of the 34 s hold (sized 27 s) · ${stirs} stir(s), ${breaks} break(s), ${unread} unread tick(s) · `), `zone leg ${k}`);
      }
    }
  });

  it("CONTENT-BASIS (the verifier's note): an authored zone whose basis is not an identifier, or whose span has no finite bounds, is REFUSED — every line renders, nothing throws", () => {
    const world = (basis) => ({ zones: [{ id: "a", kind: "noStopping", edgeId: "e", fromM: 100, toM: 160, ...(basis === undefined ? {} : { basis }) }], roads: { edges: [{ id: "e", geometry: [[0, 0], [0, 400]] }] } });
    const trace = Array.from({ length: 50 }, (_, i) => ({ x: 4, y: 20 + i * 5, headingDeg: 0 }));
    for (const basis of [undefined, null, "law bus stop", "", 7]) {
      const r = zoneRouteSpanFrom({ world: world(basis), zoneIds: ["a"], trace });
      assert.equal(r.ok, false, `basis ${JSON.stringify(basis)} was accepted`);
      assert.equal(R(r.why), "the declared zones carry no basis that is an identifier, and no hold was sized from one");
    }
    assert.equal(zoneRouteSpanFrom({ world: world("law-bus-stop"), zoneIds: ["a"], trace }).ok, true);
    for (const [label, span, re] of [
      ["basis missing", { ...SPAN, basis: null }, /carry no basis that is an identifier/],
      ["basis with spaces", { ...SPAN, basis: "law bus stop" }, /carry no basis that is an identifier/],
      ["no finite bounds", { ...SPAN, fromM: NaN }, /the placed span has no finite bounds/],
      ["an empty span", { ...SPAN, toM: SPAN.fromM }, /the placed span has no finite bounds/],
    ]) {
      const st = createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: span, platform: "pc" });
      assert.deepEqual([st.declared, st.on], [true, false], label);
      const start = wrongLegProfileStartLine(st, { everyM: EVERY_M });
      assert.match(start, re, label);
      assertObservationLine(start, label);
      assertNotHeldLine(wrongLegProfileOutcomeLine(st), label);
      assert.equal(wrongLegRestSummary(st), "");
    }
  });

  it("THE TEMPLATE TABLE AND THE TABLE TEXTS ARE THESE — a sentence that changes, even in observation words only (the verifier's V7-B4), is a visible edit here", () => {
    const h = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
    const got = Object.fromEntries(Object.entries(PROFILE_LINE_TEMPLATES).map(([k, t]) => [k, h(t)]));
    const drift = Object.keys({ ...got, ...TEMPLATE_SNAPSHOT }).filter((k) => got[k] !== TEMPLATE_SNAPSHOT[k]);
    assert.deepEqual(drift, [], `template(s) changed — re-read each for a claim, then update TEMPLATE_SNAPSHOT: ${drift.map((k) => `${k}: ${PROFILE_LINE_TEMPLATES[k] ?? "(gone)"}`).join(" ‖ ")}`);
    const texts = Object.fromEntries([...WRONG_LEG_PROFILES].map(([id, p]) => [id, h(JSON.stringify([p.name, p.told, p.row]))]));
    assert.deepEqual(texts, TABLE_TEXT_SNAPSHOT, "a profile's name, told or row changed — re-read it, then update TABLE_TEXT_SNAPSHOT");
  });
});

// ---------------------------------------------------------------------------
/* ── ROUND 9 — THE ROUND-8 VERIFIER'S FINDINGS, EACH PORTED AS A TEST (journal wf_db205df2-0a4, «verify») ─────
 *
 * THE THREAT MODEL FOR THE EMISSION GATE — the integrator's, binding for round 9 and its verifier, verbatim:
 *   The gate exists to stop an ACCIDENTAL regression: a future honest edit that prints a claim about what the
 *   product did or will do. It is NOT a sandbox against a deliberately malicious author, because no static gate can
 *   be one — a file that may run arbitrary code can always hide a claim.
 *   (i)   IN MODEL, must be caught: any claim reachable by an honest edit — a literal, a keyed line, a line keyed on
 *         a fragment of a lesson id, a line keyed on an EFFECT of the profile (a rest held long, a stretch driven), a
 *         direct print that skips the renderer, an edit to a sink or its wording.
 *   (ii)  STRUCTURALLY BANNED, so the whole class is dead rather than chased: the MECHANISMS the obfuscated bypasses
 *         need. In EVERY file of this lane (the lib, the harness and the renderer, not only the lib) ban: eval,
 *         Function / new Function, computed property access that names a declared profile key, assignment to or
 *         redefinition of any builtin (Array.prototype.*, String.prototype.*, Object.prototype.*, console.*,
 *         globalThis.*, process.*), caller introspection (new Error().stack, Error.captureStackTrace,
 *         arguments.callee), and the reach-a-builtin-without-an-import routes round 8 already banned in the lib.
 *   (iii) OUT OF MODEL, recorded as a CONDITION and not a refutation: a bypass that uses none of the banned
 *         mechanisms AND that no honest edit would plausibly produce.
 *
 * Every finding below is a test that was RED on round 8 (scratchpad/pedal/r9/testfirst-*.log) before anything was
 * fixed. */

/** `src` with the contents of every string, template and regex literal blanked — its CODE, so a check for a pose read
 *  sees an identifier a line of code names, not a word a template prints (round 9: the templates now say, truly,
 *  that the harness reads the pose). */
function blankLiterals(src) {
  let out = "";
  let at = 0;
  for (const t of lexTokens(src)) {
    if ((t.type !== "str" && t.type !== "tpl" && t.type !== "regex") || t.at < at) continue;
    out += `${src.slice(at, t.at)}""`;
    at = t.end;
  }
  return out + src.slice(at);
}

/** THE HARNESS'S OWN READINGS AND ACTS, MEASURED FROM ITS CODE (round 9, FALSE-SELF-STATEMENT-POSE) — every sentence
 *  a template says about what the harness reads, records or turns is checked against these facts, never against an
 *  older sentence. `src` is the harness source (a planted copy in the tests that prove the check can fail). */
function harnessFacts(src = SRC) {
  const code = stripComments(src);
  const sq = code.replace(/\s+/g, " ");
  const cut = (a, b) => {
    const i = sq.indexOf(a);
    const j = i < 0 ? -1 : sq.indexOf(b, i + a.length);
    return i < 0 || j < 0 || sq.indexOf(a, i + 1) >= 0 ? null : sq.slice(i, j);
  };
  const flat = cut('if (phase === "flat") {', '} else if (phase === "flat-rest") {');
  const rest = cut('} else if (phase === "flat-rest") {', "const readDear = (cost.read ?? []).at(-1) > 1000;");
  const road = readFileSync(resolve(HERE, "..", "lib", "road-record.mjs"), "utf8");
  // Every harness call into §5, as text: the callee to its closing parenthesis.
  const T = lexTokens(src);
  const sec5Calls = [];
  for (let k = 0; k < T.length; k++) {
    if (T[k].type === "id" && SEC5_EXPORTS.includes(T[k].text) && T[k + 1]?.text === "(" && T[k - 1]?.text !== ".") sec5Calls.push(src.slice(T[k].at, T[closeOf(T, k + 1)].end));
  }
  const POSE_TOKEN = /\b(?:guidance|guideWitnessRead|guidePose|__camProbe|camProbe|chassisX|chassisZ|wx|wz|__roadProbe|roadProbe|roadWitness|laneId|laneOffsetM)\b/;
  return {
    // THE POSE IS READ: guideWitnessRead evaluates window.__camProbe, guidePose pushes its x/z onto guidance.samples,
    // and each wrong-leg branch calls guidePose as its FIRST act on every tick — nothing between the branch's head
    // and the call, so no tick skips it — and nothing drops a sample.
    poseRead:
      sq.includes("const guideWitnessRead = () => page .evaluate(() => { const p = window.__camProbe; return p ? { x: p.chassisX, z: p.chassisZ, kmh: p.speedKmh } : null; }) .catch(() => null);") &&
      sq.includes("async function guidePose(kmh, tElapsedMs, dtMs, phaseName) { const w = await guideWitnessRead(); guidance.samples.push({ tSec: Math.round(tElapsedMs / 1000), kmh, dtMs, wx: w ? Number(w.x.toFixed(2)) : null, wz: w ? Number(w.z.toFixed(2)) : null,") &&
      flat !== null && flat.startsWith('if (phase === "flat") { await timed("guide", () => guidePose(p.kmh, now - t0, now - lastTickAt, "flat"));') &&
      rest !== null && rest.startsWith('} else if (phase === "flat-rest") { phaseTicks++; await timed("guide", () => guidePose(p.kmh, now - t0, now - lastTickAt, "flat-rest"));') &&
      !/guidance\s*\.\s*samples\s*(?:=(?!=)|\.\s*(?:splice|shift|pop|length\s*=))/.test(code) &&
      sq.includes('saveStatus({ phase: "driving", reverse, steering, guidance,'),
    // NO PROFILE DECISION READS IT: §5 names no pose, and no harness call into §5 hands it one.
    sec5ReadsNoPose: !/__roadProbe|__camProbe|roadProbe|camProbe|\bwx\b|\bwz\b|guidePose|pose\s*[:.(]/.test(blankLiterals(SEC5)) && sec5Calls.length >= 17 && sec5Calls.every((c) => !POSE_TOKEN.test(c)),
    // …nor a lane: §5 names none of the road witness's readings.
    sec5ReadsNoLane: !/\blaneId\b|\blaneOffsetM\b|roadWitness|__roadProbe|roadProbe/.test(blankLiterals(SEC5)),
    // THE LANE IS RECORDED — by the road witness, on every leg that is not an authored path (a wrong leg steers
    // "none"), when its kill switch is not thrown, and its rows carry laneId into _audit-road.json.gz.
    laneRecorded:
      sq.includes('const STEER_BY = LEG_MODE === "path" ? "authored-path" : LEG_MODE === "right" ? "ribbon" : "none";') &&
      sq.includes('const roadWitness = STEER_BY === "authored-path" ? null : createRoadWitness(') &&
      sq.includes('enabled: process.env.KNIJKA_ROAD_WITNESS !== "0",') &&
      /const LEAD_COLUMNS = \[[^\]]*"laneId"[^\]]*\];/.test(road) &&
      /export const ROAD_SIDECAR_FILE = "_audit-road\.json\.gz";/.test(road),
    // THE WHEEL: a wrong leg's flat phase turns none (a wrong leg steers "none"; the flat branch holds no steering act).
    noWheelOnFlat:
      flat !== null && !/\bsteer\(|\bguideTick\(|KeyA|KeyD|STEER_KEYS|pathActuate|steerRelease/.test(flat) &&
      sq.includes('const STEER_BY = LEG_MODE === "path" ? "authored-path" : LEG_MODE === "right" ? "ribbon" : "none";'),
    // EVERY STOP HAS ITS LINE: in the flat-rest branch the stop is counted and its «came to REST» note printed in
    // one block, with nothing conditional between them.
    restLinePerStop:
      rest !== null && /if \(atRest && !restLogged\) \{ restLogged = true; flatRestAt = now; stopsMade\+\+; (?:const \w+ = [^;]+; \w+ = \w+\.state; const \w+ = [^;]+; )?note\( ` the wrong leg came to REST at t=\$\{Math\.round\(\(now - t0\) \/ 1000\)\}s \(stop \$\{stopsMade\}\) and holds it for ` \+/.test(rest),
    // ── ROUND 10: the pedal acts, the holds and the cadence the templates now describe (IMPRECISE-SELF-STATEMENTS) ──
    // THE BOOKING TICK KEEPS THE THROTTLE DOWN: in the flat branch the profile's say line is printed, the throttle is
    // pressed (`throttle(true)`), and nothing in the branch lifts it or presses the brake.
    throttleHeldOnBookingTick:
      flat !== null && flat.includes("(wrongProfileStep.say.loud ? loud : note)(wrongProfileStep.say.line); await timed(\"pedals\", () => throttle(true));") && !/throttle\(false\)|brake\(true/.test(flat),
    // EACH FLAT-REST TICK LETS THE THROTTLE UP AND PUTS THE BRAKE DOWN: `throttle(false)` right after the pose read, and
    // `brake(true, p.kmh)` at the branch's top level (after the lost-key re-assert block, before the rest is judged).
    flatRestPedals:
      rest !== null &&
      rest.startsWith('} else if (phase === "flat-rest") { phaseTicks++; await timed("guide", () => guidePose(p.kmh, now - t0, now - lastTickAt, "flat-rest")); await throttle(false); if (holdS && p.kmh > 1 && prevKmh >= 0 && p.kmh > prevKmh + 2) { loud(') &&
      rest.includes("holdS = false; lostKeys += 1; } await brake(true, p.kmh); const atRest = p.kmh >= 0 && p.kmh <= 1;"),
    // …AND THE BRAKE IS REFUSED ONLY AT 0–1 км/ч ON THE DIAL — the same line as the design constant fullStopMaxSpeedKmh.
    brakeRefusedAtRest:
      sq.includes("const brake = async (on, kmh = null) => { if (on === holdS) return; if (on && kmh !== null && kmh >= 0 && kmh <= 1) { refusedReversePress += 1; return; }") && PROFILE_DESIGN.fullStopMaxSpeedKmh.value === 1,
    // THE REST IS BOOKED ON THE FIRST FLAT-REST TICK AT 0–1 км/ч (so a zone rest still braking at the end saw none), and
    // the give-up path hands §5 `gaveUp: true` after its own loud.
    atRestBooksTheRest:
      rest !== null &&
      rest.includes("const atRest = p.kmh >= 0 && p.kmh <= 1; if (atRest && !restLogged) { restLogged = true; flatRestAt = now; stopsMade++; const wrongProfileRest = wrongLegRestBooked(wrongProfile, { now, t0, holdMs: FLAT_REST_HOLD_MS, kmh: p.kmh });") &&
      /\} else if \(!restLogged && now - phaseAt >= FLAT_REST_GIVEUP_MS\) \{ loud\( `the wrong leg would not come to rest in [^;]*; const wrongProfileRestEnd = wrongLegRestEnded\(wrongProfile, \{ now, t0, gaveUp: true \}\);/.test(rest),
    // THE HARNESS'S OWN HOLDS ARE THE TASK-CAP AND OVER-LIMIT HOLDS: `holdRest` starts false on every flat tick and is set
    // in exactly two places — the over-cap gate and the over-limit gate — and both the opportunity count and the
    // transition read it.
    holdRestIsTaskCapOrOverLimit:
      flat !== null &&
      flat.includes("let holdRest = false;") &&
      (flat.match(/\bholdRest = true;/g) ?? []).length === 2 &&
      (sq.match(/\bholdRest = true;/g) ?? []).length === 2 &&
      flat.includes("const gate = overCapHold({") &&
      flat.includes("if (gate.hold) { holdRest = true;") &&
      flat.includes("const lim = overLimitHold({") &&
      flat.includes("if (lim.hold) { holdRest = true;") &&
      flat.includes("wrongProfile = wrongLegRestOpportunity(wrongProfile, { holdRest,") &&
      flat.includes("if ( flatRestDue({ holdRest,"),
    // THE ORDINARY HOLD IS WALL CLOCK FROM THE REST: `flatRestAt = now` when the car comes to rest, and the hold ends on
    // §5's `flatRestHoldDone` over that clock (its default arm is `now - restAt >= holdMs`, executed in the test).
    plainHoldIsWallClock:
      rest !== null && rest.includes("if (restLogged && flatRestHoldDone({ now, restAt: flatRestAt, holdMs: FLAT_REST_HOLD_MS, state: wrongProfile })) {") && flatRestHoldDone({ now: 8000, restAt: 0, holdMs: 8000 }) === true && flatRestHoldDone({ now: 7999, restAt: 0, holdMs: 8000 }) === false,
    // THE DRIVE'S END ENDS ANY HOLD STILL OPEN: after the loop the brake is lifted, before the profile is finished.
    driveEndReleasesBrake: sq.includes("await throttle(false); await brake(false); wrongProfile = wrongLegProfileFinish(wrongProfile, { now: Date.now(), t0, driveEnded: ended }).state;"),
  };
}

/** THE SENTENCES A TEMPLATE SAYS ABOUT THE HARNESS ITSELF — what it reads, records or turns — each with the measured
 *  facts it needs (round 9). A template sentence that mentions the pose, a position, the wheel, where the car
 *  stopped, which lane it ran in, or the road probe or witness, and is not one of these, is a claim nobody checked. */
const POSE_SENTENCE = "reads the dev pose probe on every flat and flat-rest tick and records what it returns among its guidance samples";
const HARNESS_SELF_CLAIMS = [
  ["say.braking", `No profile decision reads the pose: the harness ${POSE_SENTENCE}, and this estimate does not use it.`, ["poseRead", "sec5ReadsNoPose"]],
  ["rest.zone", `The profile placed this rest by DEAD RECKONING, not by the pose: the harness ${POSE_SENTENCE}, and no profile decision reads it.`, ["poseRead", "sec5ReadsNoPose"]],
  ["rest.plain", `The harness ${POSE_SENTENCE}; no profile decision reads it.`, ["poseRead", "sec5ReadsNoPose"]],
  ["summary", `Each rest above has its own «came to REST» line, the harness ${POSE_SENTENCE}, and every stop is still this instrument's act.`, ["poseRead", "restLinePerStop"]],
  ["obs.stint", "which lane the car ran in is no profile input, and the harness's road witness, when it is on, records the lane the dev road probe publishes in _audit-road.json.gz", ["laneRecorded", "sec5ReadsNoLane"]],
  ["span.turns", "a wrong leg turns no wheel on its flat phase", ["noWheelOnFlat"]],
  ["zone.est", "not a measured position", ["sec5ReadsNoPose"]],
  ["obs.zoneUnverified", "the harness's dead reckoning did not place the car inside it", ["sec5ReadsNoPose"]],
  // ── ROUND 10 (the round-9 verifier's IMPRECISE-SELF-STATEMENTS a, c, d, e): the pedal acts, the holds, the cadence ──
  ["say.braking", "the throttle stays down to the end of this tick; each flat-rest tick after it lets the throttle up, and the first one whose dial does not read 0–{fs:n} км/ч puts the brake down", ["throttleHeldOnBookingTick", "flatRestPedals", "brakeRefusedAtRest"]],
  ["say.braking", "not a measured position", ["sec5ReadsNoPose"]],
  ["obs.zoneNoRest", "braking was booked for the zone rest, and no flat-rest tick after it read the dial at 0–{fs:n} км/ч before {end:frag}", ["atRestBooksTheRest", "brakeRefusedAtRest"]],
  ["zone.endGaveUp", "the harness gave the rest up", ["atRestBooksTheRest"]],
  ["zone.endDrive", "the drive ended", ["driveEndReleasesBrake"]],
  ["rests", "the {every:n|?} m / {maxS:n|?} s cadence came due {opp:n} time(s) while the harness's own task-cap and over-limit holds were not holding and the profile held it", ["holdRestIsTaskCapOrOverLimit"]],
  ["summary.unchanged", "Every rest above fell on a tick where the {every:n|?} m / {maxS:n|?} s cadence was due and the harness's own task-cap and over-limit holds were not holding", ["holdRestIsTaskCapOrOverLimit"]],
  ["rest.holds", "held on the ordinary {hold:n|?}s hold of wall clock", ["plainHoldIsWallClock"]],
  ["rest.holds", "the drive's end ended any hold still open", ["driveEndReleasesBrake"]],
  ["rest.holdsPlain", "each held on the ordinary {hold:n|?}s hold of wall clock", ["plainHoldIsWallClock"]],
  ["rest.holdsPlain", "the drive's end ended any hold still open", ["driveEndReleasesBrake"]],
];
/** What makes a sentence a claim about the harness itself (round 10: its pedal acts, its holds and its cadence too). */
const SELF_CLAIM_WORDS = /\bpose\b|\bposition\b|\bwheel\b|\bsteer\w*|\bwhere (?:it|the car|each) (?:stopped|rested|fell)\b|\bwhich lane\b|\broad (?:probe|witness)\b|\bthrottle (?:stays|is|up|down)\b|\blets the throttle\b|\bbrake (?:was|is|goes)\b|\bputs the brake\b|\bpress(?:es|ed)?\b|\bflat-rest tick\b|\bgave the rest up\b|\bhold of wall clock\b|\bdrive's end ended\b|\bcadence (?:came|was) due\b|\bholds were not holding\b/gi;
/** The denials rounds 6–8 printed, each FALSE against the harness's code (the round-8 verifier's
 *  FALSE-SELF-STATEMENT-POSE, and the siblings round 9 found): none may come back. */
const FALSE_SELF_STATEMENTS = [
  /pose probe is never read/i,
  /never read on a wrong leg/i,
  /not a harness reading/i,
  /WHERE each fell is still recorded above/i,
  /a wrong leg never steers/i,
  /read as low as 0\.729/,
  // round 10 — the round-9 verifier's FALSE-SELF-STATEMENT-REFUSAL-SIZING and IMPRECISE-SELF-STATEMENTS a–e, and a sibling
  /sized on this lesson's archived [^;.]*legs only/i,
  /\(census-sized\)/,
  /braking NOW/,
  /then brake on the tick whose/,
  /rested 8 s every 45 m/,
  /the brake was pressed for the zone rest/,
  /\bthe ordinary [^;.()]*cadence came due\b/i,
  /Every rest above fell when the ordinary cadence came due/i,
];
/** Every way a template table (and the profile table's printed texts) can say something about the harness that its
 *  code does not bear out, as a list — empty when every such sentence is registered and every fact it needs holds. */
function selfClaimViolations(templates = PROFILE_LINE_TEMPLATES, facts = harnessFacts(), tableTexts = [...WRONG_LEG_PROFILES.values()].flatMap((p) => [p.told, p.row])) {
  const v = [];
  for (const [id, t] of Object.entries(templates)) {
    for (const re of FALSE_SELF_STATEMENTS) if (re.test(t)) v.push(`${id}: a false self-statement is back (${re})`);
    const mine = HARNESS_SELF_CLAIMS.filter(([tpl]) => tpl === id);
    for (const m of t.matchAll(SELF_CLAIM_WORDS)) {
      const covered = mine.some(([, says]) => {
        const at = t.indexOf(says);
        return at >= 0 && m.index >= at && m.index < at + says.length;
      });
      if (!covered) v.push(`${id}: «${m[0]}» is said about the harness in a sentence nobody registered: ${t.slice(Math.max(0, m.index - 60), m.index + 60)}`);
    }
  }
  for (const [id, says, needs] of HARNESS_SELF_CLAIMS) {
    if (!(templates[id] ?? "").includes(says)) v.push(`${id}: does not carry its registered sentence «${says}»`);
    for (const f of needs) if (facts[f] !== true) v.push(`${id}: «${says.slice(0, 60)}…» needs ${f}, and the harness's code does not bear it out`);
  }
  for (const t of tableTexts) {
    for (const re of FALSE_SELF_STATEMENTS) if (re.test(t)) v.push(`a table text carries a false self-statement (${re})`);
    for (const m of t.matchAll(SELF_CLAIM_WORDS)) v.push(`a table text says «${m[0]}» about the harness itself, and no table text is registered: ${t.slice(0, 80)}`);
  }
  return v;
}

/** A seeded stream (the round-8 verifier's generator, so its seeds reproduce here). */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** THE COUNTERFACTUAL THE REST-OPPORTUNITY COUNT STATES (the round-8 verifier's V8-P4 shadow, ported): the ordinary
 *  cadence as if the leg had rested at each opportunity — its flat metres summed FROM ZERO after each one, which is
 *  the arithmetic of the harness's own `flatM` after a rest, and its phase clock restarted there — run on the same
 *  ticks, rests, drains and holds as §5, and compared with the count §5 prints. */
function opportunityShadow(state, series, { dtMs = 500, dts = null, holdRest = () => false, follow = () => null, pauses = new Set(), steps = null } = {}) {
  let st = state;
  let now = 100_000;
  const t0 = 100_000;
  let flatM = 0, phaseAt = now, phaseTicks = 0, shFlat = 0, shPhaseAt = now, shTicks = 0, shadow = 0, rests = 0;
  for (let i = 0; i < series.length; i++) {
    const dt = dts === null ? dtMs : dts[i];
    now += dt;
    const kmh = series[i];
    const flatStepM = steps === null ? (Math.max(0, kmh) / 3.6) * (dt / 1000) : steps[i];
    const r = wrongLegFlatStep(st, { now, t0, kmh, flatStepM, dtMs: dt, postedKmh: 50, follow: follow(i), probeAt: now });
    st = r.state;
    phaseTicks++;
    flatM += flatStepM;
    shTicks++;
    shFlat += flatStepM;
    const hr = holdRest(i);
    const args = { holdRest: hr, suppress: r.suppressRest, force: r.forceRest, flatM, sincePhaseMs: now - phaseAt, phaseTicks, everyM: EVERY_M, maxMs: MAX_MS };
    const wasActive = st.on === true && st.active === true;
    st = wrongLegRestOpportunity(st, args);
    const shDue = !hr && (shFlat >= EVERY_M || now - shPhaseAt >= MAX_MS) && shTicks >= 1;
    if (wasActive && shDue && r.suppressRest && !r.forceRest) { shadow++; shFlat = 0; shPhaseAt = now; shTicks = 0; }
    if (flatRestDue(args)) { rests++; flatM = 0; phaseAt = now; phaseTicks = 0; shFlat = 0; shPhaseAt = now; shTicks = 0; }
    if (pauses.has(i)) { phaseAt = now + 1; shPhaseAt = now + 1; }
  }
  return { printed: st.opportunities.count, shadow, rests, state: st };
}
/** The round-8 verifier's leg generator (verify8/p4-seeded.mjs `legFor`), seed for seed. */
function p4LegFor(seed) {
  const Rn = mulberry32(seed);
  const rnd = (a, b) => a + Rn() * (b - a);
  const id = ["sc-signal-flashing", "sc-ac-truck-spray", "sc-ov-keep-right"][seed % 3];
  const len = 20 + Math.floor(rnd(0, 140));
  const series = Array.from({ length: len }, () => (Rn() < 0.05 ? -1 : Math.round(rnd(0, 70))));
  const pauses = new Set(Array.from({ length: Math.floor(rnd(0, 4)) }, () => Math.floor(rnd(0, len))));
  const h0 = Math.floor(rnd(0, len)), h1 = h0 + Math.floor(rnd(0, 30));
  const lead = Array.from({ length: len }, () => Rn() < 0.7);
  const dtMs = Math.round(rnd(300, 900));
  return { id, series, pauses, holdRest: (i) => i >= h0 && i < h1, follow: (i) => (lead[i] ? { present: true, parsed: true, meters: 40, heldSec: 2.6, needSec: 2, short: true, label: "x" } : null), dtMs };
}

/* The anchors the planted copies below are built on — each must occur exactly once. */
const H_OUT_BLOCK = "  if (wrongProfileOutcome !== null) (wrongProfile.heldAsSized ? note : loud)(wrongProfileOutcome);\n}\n";
const H_LOUD = "const loud = (s) => note(`  !! ${s}`);\n";
const H_FLAT_REST_POSE = '      await timed("guide", () => guidePose(p.kmh, now - t0, now - lastTickAt, "flat-rest"));\n';
const H_FLAT_POSE = '      await timed("guide", () => guidePose(p.kmh, now - t0, now - lastTickAt, "flat"));\n';
const H_FLAT_STEP = "      flatM += flatStepM;\n";
const H_REST_BRAKE = "      await brake(true, p.kmh);\n";
const H_PREV_KMH = "  prevKmh = p.kmh;\n";
const H_STOP_WRONG = "        flatRestAt = now;\n        stopsMade++;\n";
const H_SUMMARY_TAIL = "      wrongLegRestSummary(wrongProfile),\n  );\n";
const L_RENDER_END = '  for (const k of Object.keys(f)) if (!used.has(k)) throw bad(k, "is not in the template");\n  return text;\n';
const L_IMPORTS = 'import { fileURLToPath } from "node:url";\n';
/** A copy of `src` with `insert` put after (or in place of) the one occurrence of `anchor`. */
function plantIn(src, label, anchor, insert, where = "after") {
  const n = src.split(anchor).length - 1;
  assert.equal(n, 1, `${label}: the anchor occurs ${n} time(s)`);
  return src.replace(anchor, where === "after" ? anchor + insert : where === "before" ? insert + anchor : insert);
}
/** The words a claim about the product is made of — H8's own set. A planted line «with no claim word» uses none of
 *  them, so H8 cannot catch it and only a mechanism ban or an effect pin can. */
const CLAIM_WORDS = HARNESS_CLAIM_WORDS;

describe("§W10 ROUND 9 — the round-8 verifier's findings, each ported as a test that was red on round 8", () => {
  it("A · FALSE-SELF-STATEMENT-POSE: every sentence a template says about what the harness reads, records or turns is BACKED BY ITS CODE — the harness reads the pose on every flat and flat-rest tick, so no template may say it does not", () => {
    const facts = harnessFacts();
    // The facts themselves, measured from the harness as it is: the pose IS read (the round-8 verifier's evidence),
    // the road witness DOES record the lane, and a wrong leg's flat phase turns no wheel.
    assert.deepEqual(facts, { poseRead: true, sec5ReadsNoPose: true, sec5ReadsNoLane: true, laneRecorded: true, noWheelOnFlat: true, restLinePerStop: true, throttleHeldOnBookingTick: true, flatRestPedals: true, brakeRefusedAtRest: true, atRestBooksTheRest: true, holdRestIsTaskCapOrOverLimit: true, plainHoldIsWallClock: true, driveEndReleasesBrake: true }, "the harness's own readings and acts are not what the templates were checked against");
    assert.deepEqual(selfClaimViolations(), [], "a template says something about the harness itself that its code does not bear out");
  });

  it("A · …AND THE CHECK CAN FAIL: each false sentence rounds 6–8 printed, planted back in a copy of the table, is caught; so is an unregistered claim about the pose; and so is a TRUE sentence once the harness stops doing what it says (the pose read taken out of the flat branch, the road witness switched off for wrong legs)", () => {
    const withTpl = (id, text) => ({ ...PROFILE_LINE_TEMPLATES, [id]: text });
    const T = PROFILE_LINE_TEMPLATES;
    for (const [label, templates] of [
      ["round 6's «The pose probe is never read on a wrong leg.»", withTpl("say.braking", `${T["say.braking"]} The pose probe is never read on a wrong leg.`)],
      ["round 6's rest.zone «…DEAD RECKONING here, not a harness reading.»", withTpl("rest.zone", `${T["rest.zone"]} Where it stopped is DEAD RECKONING here, not a harness reading.`)],
      ["round 6's rest.plain «Where it stopped is not a harness reading.»", withTpl("rest.plain", `${T["rest.plain"]} Where it stopped is not a harness reading.`)],
      ["round 6's summary «WHERE each fell is still recorded above»", withTpl("summary", `${T.summary} WHERE each fell is still recorded above.`)],
      ["round 7's obs.stint «which lane the car ran in is not a harness reading»", withTpl("obs.stint", `${T["obs.stint"]}; which lane the car ran in is not a harness reading`)],
      ["the span refusal's «a wrong leg never steers»", withTpl("span.turns", `${T["span.turns"]}, and a wrong leg never steers`)],
      ["an unregistered sentence about the pose", withTpl("obs.open", `${T["obs.open"]}; the pose was not read`)],
      ["an unregistered sentence about where the car stopped", withTpl("zone.stood", `${T["zone.stood"]}; where the car stopped is unknown`)],
      ["a registered sentence dropped from its template", withTpl("rest.plain", "{hold:n|?}s, the harness's ordinary hold (WRONG-LEG PROFILE {name:txt} is declared on this lane).")],
    ]) {
      assert.ok(selfClaimViolations(templates).length > 0, `${label}: the self-claim check passed it`);
    }
    // A TRUE sentence stops being true when the code stops doing it — the check reads the code, not the words.
    for (const [label, src] of [
      ["the pose read taken out of the flat branch", plantIn(SRC, "flat pose", H_FLAT_POSE, "", "replace")],
      ["the pose read made conditional", plantIn(SRC, "flat pose", H_FLAT_POSE, `      if (MODE === "right") ${H_FLAT_POSE.trimStart()}`, "replace")],
      ["the samples truncated", plantIn(SRC, "loud", H_LOUD, "setInterval(() => { guidance.samples.length = 0; }, 60_000);\n")],
      ["the road witness built on right legs only", plantIn(SRC, "witness", 'const roadWitness =\n  STEER_BY === "authored-path"', 'const roadWitness =\n  STEER_BY !== "ribbon"', "replace")],
      ["a wheel turned on the flat phase", plantIn(SRC, "flat step", H_FLAT_STEP, "      await steer(null, p.kmh);\n")],
      ["a pose value handed to §5", plantIn(SRC, "flat step call", "        probeAt: tickStart,\n", "        probeAt: guidance.samples.length,\n", "replace")],
    ]) {
      assert.ok(selfClaimViolations(PROFILE_LINE_TEMPLATES, harnessFacts(src)).length > 0, `${label}: the templates' sentences stayed «true» against a harness that no longer does it`);
    }
  });

  it("A · CENSUS-0729: the mobile refusal says WHICH POPULATION its number is over — the round-3 census of every archived wrong leg (328, 158 of them mobile, a mobile minimum of 0.524), not one lesson's own minimum", () => {
    assert.ok(!Object.values(PROFILE_LINE_TEMPLATES).some((t) => /0\.729/.test(t)), "a template still prints sc-signal-flashing's own minimum as if it were the census's");
    const C = LIBNS.ODO_CENSUS_ALL_WRONG_LEGS;
    assert.ok(C && Object.isFrozen(C), "the census the refusal quotes is not a declared, frozen record");
    assert.deepEqual([C.legs, C.mobileLegs, C.mobileMinRatio, C.measured], [328, 158, 0.524, "2026-09-25"]);
    assert.match(C.method, /odometer/i);
    assert.match(C.waves, /w41.*w62/);
    // The refusal takes the census's numbers and date and nothing else — its provenance strings are never printed.
    const refused = createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: SPAN, platform: "mobile" }).refused;
    assert.deepEqual(Object.keys(refused.f).sort(), ["at", "legs", "min", "mobile", "odo", "platform", "rmax", "rmin"]);
    assert.deepEqual([refused.f.legs, refused.f.mobile, refused.f.min, refused.f.at], [C.legs, C.mobileLegs, C.mobileMinRatio, C.measured]);
    const line = wrongLegProfileStartLine(createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: SPAN, platform: "mobile" }), { everyM: EVERY_M });
    // (round 10: and the band names the population it is sized on — the round-9 verifier's FALSE-SELF-STATEMENT-REFUSAL-SIZING)
    assert.match(line, /this leg is «mobile», and in the harness's odometer census of 328 archived wrong legs \(158 of them mobile, measured 2026-09-25\) a mobile flat odometer read as low as 0\.524 of the true path, far outside 0\.911–1\.028/);
    assertObservationLine(line, "mobile refusal");
  });

  it("B · V8-H3 AND EVERY EFFECT-KEYED SIBLING an honest edit could write — keyed on a held rest, a driven stretch, a booked brake, a count of rests, the rest phase, a captured time, the first stop's photograph, a state key read back, a lesson family's prefix — planted in a copy of the harness, is CAUGHT, each by the gate named", () => {
    const cases = [
      ["V8-H3, verbatim", H_FLAT_REST_POSE, '      if (restLogged && now - flatRestAt >= 20_000 && phaseTicks % 40 === 0) note("      the product booked this stop inside the zone it teaches");\n', "H7a"],
      ["V8-H3 with no claim word", H_FLAT_REST_POSE, '      if (restLogged && now - flatRestAt >= 20_000 && phaseTicks % 40 === 0) note("      the stop inside the zone the lesson teaches");\n', "H7a"],
      ["a held rest, keyed outside the cadence block", H_OUT_BLOCK, 'if (MODE !== "right" && restLogged && Date.now() - flatRestAt >= 20_000) note("the stop inside the zone the lesson teaches");\n', "H7b"],
      ["a driven stretch, inside the block", H_FLAT_STEP, '      if (flatM > 90) note("      the stretch the lesson teaches");\n', "H7a"],
      ["a count of rests, after the drive", H_OUT_BLOCK, 'if (MODE !== "right" && stopsMade === 1) loud("one stop: the one the lesson teaches");\n', "H7b"],
      ["a booked brake, inside the block", H_REST_BRAKE, '      note("      the brake for the zone the lesson teaches");\n', "H7a"],
      ["a held brake, keyed in the loop's tail", H_PREV_KMH, '  if (MODE !== "right" && holdS && p.kmh === 0) note("      standing where the lesson teaches");\n', "H7b"],
      ["the rest phase, keyed in the loop's tail", H_PREV_KMH, '  if (phase === "flat-rest" && now - phaseAt > 25_000) note("      a long stop where the lesson teaches");\n', "H7b"],
      ["a time captured at the stop, inside the block", H_STOP_WRONG, "        const zoneMark = now;\n", "H7a"],
      ["the first stop's photograph, keyed", H_OUT_BLOCK, 'if (shotStopped && MODE !== "right") note("the stop photographed is the one the lesson teaches");\n', "H7b"],
      ["a line inside the rest summary's block", H_SUMMARY_TAIL, '  note("  the zone stop the lesson teaches was made");\n', "H7c"],
      ["a state key read back off the status object", H_OUT_BLOCK, 'for (const v of Object.values(status)) if (v && v.restsForced > 0) note("the zone stop the lesson teaches");\n', "H10"],
      ["a product claim keyed on the dial's stillness alone", H_PREV_KMH, '  if (p.kmh === 0 && now - t0 > 60_000) note("      the product booked the stop here");\n', "H8"],
      // …and keyed on a declared lesson's FAMILY PREFIX (round 9: H3b's floor is five characters now, not six).
      ["keyed on the parking family's prefix", H_OUT_BLOCK, 'if (SCENARIO.startsWith("sc-pk")) note("the stop the lesson teaches");\n', "H3b"],
      ["keyed on the truck lesson's family prefix", H_OUT_BLOCK, 'if (String(process.argv).includes("sc-ac")) note("the gap the lesson teaches");\n', "H3b"],
    ];
    for (const [label, anchor, insert, gate] of cases) {
      const v = harnessGateViolations(plantIn(SRC, label, anchor, insert));
      assert.ok(v.some((x) => x.startsWith(`${gate} `)), `${label}: not caught by ${gate} — ${v.length ? v.map((x) => x.slice(0, 50)).join(" | ") : "the harness gate passed it"}`);
    }
  });

  it("C · V8-L1 AND V8-L2 — and every sibling of their MECHANISMS, planted in a copy of the lib (the renderer and §1 included) — are caught STRUCTURALLY, each with its claim words removed too, so the mechanism ban alone kills it", () => {
    const ret = (cond, tail) => `  for (const k of Object.keys(f)) if (!used.has(k)) throw bad(k, "is not in the template");\n  return ${cond} ? text + "${tail}" : text;\n`;
    const CLAIM = " — the product booked the fault the lesson teaches";
    const NEUTRAL = " — the stop the lesson teaches";
    const join = (via, tail) => `${via}\n`.replace("TAIL", tail);
    const cases = [
      ["V8-L1, verbatim", L_RENDER_END, ret('String(new Error().stack).includes("lesson-audit.mjs") && spec.tpl.startsWith("outcome.")', CLAIM), "L8", "replace"],
      ["V8-L1 with no claim word", L_RENDER_END, ret('String(new Error().stack).includes("lesson-audit.mjs") && spec.tpl.startsWith("outcome.")', NEUTRAL), "L8", "replace"],
      ["V8-L1 through a computed stack key", L_RENDER_END, ret('String((new Error())["stack"]).includes("lesson-audit")', NEUTRAL), "L8", "replace"],
      ["V8-L1 through captureStackTrace", L_RENDER_END, ret('((o) => (Error.captureStackTrace(o), JSON.stringify(o)))({}).length > 0', NEUTRAL), "L8", "replace"],
      ["V8-L1 through prepareStackTrace", L_IMPORTS, "Error.prepareStackTrace = (e, s) => s;\n", "L8", "after"],
      ["V8-L1 through arguments.callee", L_RENDER_END, ret("typeof arguments.callee.caller === \"function\"", NEUTRAL), "L8", "replace"],
      ["the renderer's own words edited, no mechanism at all", L_RENDER_END, ret('spec.tpl.startsWith("outcome.")', NEUTRAL), "L10", "replace"],
      ["V8-L2, verbatim", L_IMPORTS, join('const joinOrig = Array.prototype.join;\nArray.prototype.join = function (sep) { const s = joinOrig.call(this, sep); return sep === "; " && String(new Error().stack).includes("lesson-audit.mjs") ? s + " — the product booked the speeding" : s; };', ""), "L7", "after"],
      ["V8-L2 with no claim word and no caller check", L_IMPORTS, join('const joinOrig = Array.prototype.join;\nArray.prototype.join = function (sep) { const s = joinOrig.call(this, sep); return sep === "; " ? s + " — the stop the lesson teaches" : s; };', ""), "L7", "after"],
      ["V8-L2 through __proto__", L_IMPORTS, 'const j0 = [].__proto__.join;\n[].__proto__.join = function (sep) { return j0.call(this, sep) + ""; };\n', "L7", "after"],
      ["V8-L2 through getPrototypeOf", L_IMPORTS, 'const AP = Object.getPrototypeOf([]);\nconst j1 = AP.join;\nAP.join = function (sep) { return j1.call(this, sep); };\n', "L7", "after"],
      ["V8-L2 through defineProperty", L_IMPORTS, 'Object.defineProperty(Array.prototype, "join", { value: function () { return ""; } });\n', "L7", "after"],
      ["V8-L2 through a computed prototype key", L_IMPORTS, 'const pk = "proto" + "type";\nconst j2 = Array[pk].join;\nArray[pk].join = function (sep) { return j2.call(this, sep); };\n', "L7", "after"],
      ["a String method patched", L_IMPORTS, 'const c0 = String.prototype.concat;\nString.prototype.concat = function (...a) { return c0.apply(this, a); };\n', "L7", "after"],
      ["JSON.stringify replaced (the sidecar's writer)", L_IMPORTS, "const st0 = JSON.stringify;\nJSON.stringify = (...a) => st0(...a);\n", "L7", "after"],
      ["a builtin aliased, then patched", L_IMPORTS, "const J = JSON;\nJ.parse = (s) => s;\n", "L7", "after"],
      ["Object.assign onto a builtin", L_IMPORTS, "Object.assign(Math, { round: (x) => x });\n", "L7", "after"],
      ["a Proxy", L_IMPORTS, "const px = new Proxy({}, {});\n", "L7", "after"],
      ["Node's global", L_IMPORTS, "global.renderHook = 1;\n", "L6", "after"],
      ["eval through an identifier escape", L_IMPORTS, '\\u0065val("1");\n', "L12", "after"],
    ];
    for (const [label, anchor, insert, gate, where] of cases) {
      const lib = plantIn(LIB, label, anchor, insert, where);
      assert.notEqual(lib, LIB, `${label}: nothing was planted`);
      const v = sec5GateViolations(lib);
      assert.ok(v.some((x) => x.startsWith(`${gate} `)), `${label}: not caught by ${gate} — ${v.length ? v.map((x) => x.slice(0, 60)).join(" | ") : "the §5 gate passed it"}`);
    }
  });

  it("C · V8-H1, V8-H2, V8-H4 AND V8-H5 — and every sibling of their MECHANISMS, planted in a copy of the harness — are caught STRUCTURALLY, each with its claim words removed too, so the mechanism ban alone kills it", () => {
    const CL = '"the product booked that stop as the fault the lesson teaches"';
    const NT = '"the stop the lesson teaches"';
    const cases = [
      ["V8-H1, verbatim", H_OUT_BLOCK, `{\n  const seen = eval("wrong" + "Profile");\n  if (seen.declared && seen.restsForced > 0) loud(${CL});\n}\n`, "M1"],
      ["V8-H1 with no claim word", H_OUT_BLOCK, `{\n  const seen = eval("wrong" + "Profile");\n  if (seen.declared) loud(${NT});\n}\n`, "M1"],
      ["V8-H1 through an indirect eval", H_OUT_BLOCK, `if ((0, eval)("1") === 1) loud(${NT});\n`, "M1"],
      ["V8-H1 through new Function", H_OUT_BLOCK, `if (new Function("return 1")() === 1) loud(${NT});\n`, "M2"],
      ["V8-H2, verbatim", H_OUT_BLOCK, 'if (MODE !== "right" && existsSync(`${OUT}/_audit-status.json`) && JSON.parse(readFileSync(`${OUT}/_audit-status.json`, "utf8"))["wrongLeg" + "Profile"]) loud("the product books every stop on this lane");\n', "M3"],
      ["V8-H2 with no claim word", H_OUT_BLOCK, `if (MODE !== "right" && JSON.parse(readFileSync(STATUS, "utf8"))["wrongLeg" + "Profile"]) loud(${NT});\n`, "M3"],
      ["the sidecar key built into a variable, then indexed", H_OUT_BLOCK, `{\n  const k = "wrongLeg" + "Profile";\n  if (status[k]) loud(${NT});\n}\n`, "H12"],
      ["the status object iterated", H_OUT_BLOCK, `for (const v of Object.values(status)) if (v && v.declared === true) loud(${NT});\n`, "H12"],
      ["the status file read back through STATUS", H_OUT_BLOCK, `if (JSON.parse(readFileSync(STATUS, "utf8")).mode === "wrong") loud(${NT});\n`, "H12"],
      ["the status file read back by its name", H_OUT_BLOCK, `if (existsSync(\`\${OUT}/_audit-status.json\`)) loud(${NT});\n`, "H12"],
      ["V8-H4, verbatim", H_LOUD, '{ const out = console.log; console.log = (...a) => out(...a.map((x) => (typeof x === "string" && /OUTCOME/.test(x) ? x + " — the product booked it" : x))); }\n', "M4"],
      ["V8-H4 with no claim word", H_LOUD, '{ const out = console.log; console.log = (...a) => out(...a.map((x) => (typeof x === "string" && /OUTCOME/.test(x) ? x + " — the stop the lesson teaches" : x))); }\n', "M4"],
      ["console aliased, then patched", H_LOUD, "{ const c = console; const o = c.log; c.log = (...a) => o(...a); }\n", "M4"],
      ["Object.assign onto console", H_LOUD, "{ const o = console.log; Object.assign(console, { log: (...a) => o(...a) }); }\n", "M4"],
      ["console's sink through a computed key", H_LOUD, '{ const o = console.log; console["log"] = (...a) => o(...a); }\n', "M4"],
      ["process.stdout.write replaced", H_LOUD, "{ const w = process.stdout.write.bind(process.stdout); process.stdout.write = (s, ...a) => w(s, ...a); }\n", "M4"],
      ["process.stdout aliased, then patched", H_LOUD, "{ const so = process.stdout; const w = so.write.bind(so); so.write = (s, ...a) => w(s, ...a); }\n", "M4"],
      ["console reached through globalThis", H_LOUD, '{ const o = globalThis["con" + "sole"].log; globalThis["con" + "sole"].log = (...a) => o(...a); }\n', "M6"],
      ["V8-H5, verbatim", H_LOUD, '{ const push = Array.prototype.push; Array.prototype.push = function (...a) { return push.apply(this, a.map((x) => (typeof x === "string" && /OUTCOME/.test(x) ? x + " — the product booked it" : x))); }; }\n', "M4"],
      ["V8-H5 with no claim word", H_LOUD, '{ const push = Array.prototype.push; Array.prototype.push = function (...a) { return push.apply(this, a.map((x) => (typeof x === "string" && /OUTCOME/.test(x) ? x + " — the stop the lesson teaches" : x))); }; }\n', "M4"],
      ["the transcript's push through __proto__", H_LOUD, "{ const pu = [].__proto__.push; [].__proto__.push = function (...a) { return pu.apply(this, a); }; }\n", "M4"],
      ["the transcript's push through getPrototypeOf", H_LOUD, "{ const AP = Object.getPrototypeOf([]); const pu = AP.push; AP.push = function (...a) { return pu.apply(this, a); }; }\n", "M4"],
      ["the transcript's push through .constructor", H_LOUD, "{ const AP = [].constructor.prototype; const pu = AP.push; AP.push = function (...a) { return pu.apply(this, a); }; }\n", "M4"],
      ["Reflect.set on a builtin", H_LOUD, '{ Reflect.set(console, "log", console.log); }\n', "M6"],
      ["defineProperty on a builtin", H_LOUD, '{ Object.defineProperty(console, "log", { value: console.log }); }\n', "M4"],
      ["a Proxy", H_LOUD, "{ const px = new Proxy({}, {}); }\n", "M4"],
      ["caller introspection: new Error().stack", H_OUT_BLOCK, `if (String(new Error().stack).includes("lesson-audit")) loud(${NT});\n`, "M5"],
      ["caller introspection: captureStackTrace", H_OUT_BLOCK, `{ const o = {}; Error.captureStackTrace(o); if (o) loud(${NT}); }\n`, "M5"],
      ["eval through node:vm", H_OUT_BLOCK, 'const vmod = await import("node:vm");\n', "M6"],
      ["eval through a child node -e", H_OUT_BLOCK, 'spawnSync(process.execPath, ["-e", "1"]);\n', "M6"],
      ["eval through an identifier escape", H_OUT_BLOCK, '\\u0065val("1");\n', "M7"],
    ];
    for (const [label, anchor, insert, gate] of cases) {
      const src = plantIn(SRC, label, anchor, insert);
      const v = harnessGateViolations(src);
      assert.ok(v.some((x) => x.startsWith(`${gate} `)), `${label}: not caught by ${gate} — ${v.length ? v.map((x) => x.slice(0, 60)).join(" | ") : "the harness gate passed it"}`);
      // «with no claim word» means just that: nothing on the planted line is a product actor or action.
      if (/no claim word/.test(label)) assert.deepEqual(wordsOf(insert).filter((w) => CLAIM_WORDS.has(w)), [], `${label}: the neutral plant still carries a claim word`);
    }
  });

  it("E · T3 and P4-FLOAT-TIE: the rest-opportunity count IS its counterfactual, on the harness's own arithmetic — an exact 45 m stretch counts (the harness's `flatM >= 45`), the verifier's float tie (seed 2649) agrees, and so do 1200 of the verifier's seeded legs (30,000 in scratchpad/pedal/r9/p4-seeded-r9.txt)", () => {
    // EXACT TIES, in whole metres (every sum exact): 9 m a tick, the cadence due at 45 m (tick 5), then exactly 45 m
    // later (10, 15, 20) — 4 in 20 ticks. «Strictly more than 45 m» (V8-T3) counts 5, 11, 17 — 3.
    const tie = opportunityShadow(make("sc-signal-flashing"), Array(20).fill(50), { steps: Array(20).fill(9) });
    assert.deepEqual([tie.printed, tie.shadow], [4, 4], "an exact 45 m stretch is not counted as the harness's own cadence counts it");
    // THE VERIFIER'S FLOAT TIE: seed 2649, a stretch of 45 m to within one ulp — the harness sums it from zero.
    const g = p4LegFor(2649);
    const r = opportunityShadow(make(g.id), g.series, g);
    assert.equal(r.printed, r.shadow, `seed 2649 (${g.id}): the printed count ${r.printed} is not its counterfactual ${r.shadow}`);
    let agree = 0;
    const bad = [];
    for (let seed = 1; seed <= 1200; seed++) {
      const leg = p4LegFor(seed);
      const x = opportunityShadow(make(leg.id), leg.series, leg);
      if (x.printed === x.shadow) agree++;
      else if (bad.length < 5) bad.push(`seed ${seed} (${leg.id}): printed ${x.printed}, counterfactual ${x.shadow}`);
    }
    assert.equal(agree, 1200, `the printed count is not its counterfactual on ${1200 - agree} of 1200 seeded legs: ${bad.join("; ")}`);
  });

  it("E · …and a new flat phase after a rest taken on a NEAR-ZERO odometer, or after a rest followed by a STALLED first tick, restarts the stretch (round 9, a sibling of P4: `flatM` alone did not fall)", () => {
    // The truck: 41 ticks creeping at 1 км/ч with a lead (held back; the 20 s clock due at tick 39, 5.6 m in — one),
    // a tick with no lead (the ordinary rest runs on a 5.8 m odometer), then 7 ticks at 50 км/ч with the lead back:
    // the first tick's 6.9 m is MORE than the last phase's 5.8 m, so `flatM` never fell. The counterfactual counts
    // the new phase's 45 m at its 7th tick (48.6 m) — two in all; measured from the last phase's count (5.6 m) it
    // would still be 43.1 m short.
    const series = [...Array(41).fill(1), 1, ...Array(7).fill(50)];
    const lead = (i) => (i === 41 ? null : chip(40, 2.6));
    const x = opportunityShadow(make("sc-ac-truck-spray"), series, { follow: lead });
    assert.equal(x.rests, 1, "the fixture no longer takes its one ordinary rest");
    assert.deepEqual([x.printed, x.shadow], [2, 2], "a rest on a near-zero odometer left the last phase's stretch open");
    // …and the case only `phaseTicks` can see: the same creep and rest, then ONE STALLED first tick (25 s — this box has
    // measured control ticks of 18 s) at 1 км/ч with the lead back. Its 6.9 m is more than the last phase's 5.8 m, so
    // `flatM` never fell; its 25 s on the phase clock is more than the last tick's 21 s, so the drain's clock reset never
    // fired either. The counterfactual is due on the 20 s clock at once: two. (Round 8 printed 1, and so does round 9
    // with the `phaseTicks` clause taken out — R9-T08: summing the stretch from zero alone does not cover this.)
    const stalled = opportunityShadow(make("sc-ac-truck-spray"), [...Array(41).fill(1), 1, 1], { follow: lead, dts: [...Array(42).fill(500), 25_000] });
    assert.equal(stalled.rests, 1, "the stalled fixture no longer takes its one ordinary rest");
    assert.deepEqual([stalled.printed, stalled.shadow], [2, 2], "a stalled first tick after a rest left the last phase's stretch open");
  });
});

/* ── ROUND 10 — THE ROUND-9 VERIFIER'S FINDINGS, EACH PORTED AS A TEST (journal wf_9db04348-e1b, «verify») ─────
 *
 * THE THREAT MODEL FOR THE EMISSION GATE — the integrator's, binding for round 10, verbatim. It is round 9's with ONE
 * clause corrected:
 *   The gate exists to stop an ACCIDENTAL regression: a future honest edit that prints a claim about what the
 *   product did or will do. It is NOT a sandbox against a deliberately malicious author, because no static gate can
 *   be one. Round 9's verifier brief said a banned mechanism «the ban failed to catch» was in model. That clause
 *   reopened the loop by SPELLING: it made «[][kC][kP]» with kC built by join("") an in-model refutation, and every
 *   next round would find the next spelling. This round answers the class STRUCTURALLY, and the clause is replaced:
 *   (i)   IN MODEL, must be caught: a claim reachable by an HONEST edit — a literal, a keyed line, a line keyed on a
 *         fragment of a lesson id or on an EFFECT of the profile, a direct print that skips the renderer, an edit to a
 *         sink or its wording, and any banned mechanism written the way an honest author writes it (its canonical
 *         name, plain destructuring, a plain string key). A FALSE SENTENCE the harness prints is always in model.
 *   (ii)  STRUCTURALLY BANNED: eval, Function, computed access naming a profile key, builtin redefinition, caller
 *         introspection, reach-a-builtin routes — in every file. In THE LIB, which is importable, the ban is ALSO
 *         enforced at RUNTIME, which no spelling can evade (item C). In THE HARNESS, which has a top-level await and
 *         cannot be imported, every line that could carry the class is PINNED as a census, so any new such line is a
 *         visible red that needs a re-pin (item C).
 *   (iii) OUT OF MODEL, a CONDITION and never a refutation: a bypass that needs INTENT TO EVADE — a banned name or a
 *         claim assembled from pieces at runtime (join, concatenation, fromCharCode, template pieces, file names in
 *         parts), a builtin reached through a chain no honest author writes — when it is not caught by the lib's
 *         runtime check or a harness census. The verifier must argue in or out for every bypass.
 *
 * Every finding below is a test that was RED on round 9 (scratchpad/pedal/r10/testfirst-r9.log) before anything was
 * fixed. */

/* The anchors round 10's plants are built on — each must occur exactly once. */
const L_ACCRUE_RETURN = '    return { overSec: sec + step, resets: hits, qualAt: now, arm: "accrue" };\n';
const L_HELD_CLOSURE = "  const held = (how, obs) => {\n";
/** The round-9 verifier's plants (verify9/v9-plants.mjs), verbatim, as [id, file, anchor, the text that replaces it]. */
const V9_PLANTS = {
  N01: ["lib", L_IMPORTS, L_IMPORTS + 'const kS = ["sta", "ck"].join(""), kC = ["constr", "uctor"].join(""), kP = ["proto", "type"].join("");\nconst joinA = [][kC][kP];\nconst joinOrig = joinA.join;\njoinA.join = function (sep) { const s = joinOrig.call(this, sep); return sep === "; " && String(Error()[kS]).includes("lesson-audit.mjs:") ? s + " — the sim marked the speeding" : s; };\n'],
  N02: ["lib", L_IMPORTS, L_IMPORTS + 'const kS2 = ["sta", "ck"].join(""), kC2 = ["constr", "uctor"].join(""), kP2 = ["proto", "type"].join("");\nconst strP = ""[kC2][kP2];\nconst rep0 = strP.replace;\nstrP.replace = function (a, b) { const s = rep0.call(this, a, b); return typeof b === "function" && String(this).includes("OUTCOME") && String(Error()[kS2]).includes("lesson-audit.mjs:") ? s + " — the sim marked it" : s; };\n'],
  N03: ["harness", H_LOUD, H_LOUD + '{ const kC = ["constr", "uctor"].join(""), kP = ["proto", "type"].join(""); const AP = [][kC][kP]; const push0 = AP.push; AP.push = function (...a) { return push0.apply(this, a.map((x) => (typeof x === "string" && /OUTCOME/.test(x) ? x + " — the sim marked it" : x))); }; }\n'],
  N05: ["harness", H_OUT_BLOCK, H_OUT_BLOCK + '{ const kC = ["constr", "uctor"].join(""); const P = (() => 0)[kC]("return pro" + "cess")(); P.stdout.write("  the sim marks the antecedent above on its own sheet\\n"); }\n'],
  N06: ["harness", H_OUT_BLOCK, H_OUT_BLOCK + 'if (SCENARIO.includes("flash")) note("  the sim marks «Превишена скорост» on this leg\'s sheet");\n'],
  N07: ["harness", H_OUT_BLOCK, H_OUT_BLOCK + 'if (SCENARIO.includes("bus")) note("  the sim marks «Спиране в забранена зона» on this leg\'s sheet");\n'],
  N08: ["harness", H_OUT_BLOCK, H_OUT_BLOCK + 'note("  (the sim marks each careless stop above on its own sheet)");\n'],
  N09: ["harness", H_PREV_KMH, '  if (STEER_BY === "none" && phaseTicks >= 40 && phaseTicks % 40 === 0) note("      a stretch this long is the one the lesson teaches, and the sim marks the speeding on it");\n' + H_PREV_KMH],
  N14: ["harness", H_OUT_BLOCK, H_OUT_BLOCK + 'if (SCENARIO.includes("pk-b")) note("  the sim marks «Спиране в забранена зона» on this leg\'s sheet");\n'],
  N16: ["harness", H_PREV_KMH, '  if (OUT.endsWith("-wrong") && phaseTicks >= 40 && phaseTicks % 40 === 0) note("      a stretch this long is on the sim\'s sheet");\n' + H_PREV_KMH],
  N17: ["lib", L_ACCRUE_RETURN, '    if (sec + step >= 3 && sec < 3) console.log("      the engine books «Превишена скорост» here — the product bills the speeding at 3 s");\n' + L_ACCRUE_RETURN],
  N18: ["lib", L_HELD_CLOSURE, L_HELD_CLOSURE + '    console.log(["", "", "the", "sim", "marked", "it"].join(String.fromCharCode(32)));\n'],
  N19: ["lib", L_IMPORTS, L_IMPORTS + '({ log: console.log } = { log: ((out) => (...a) => out(...a.map((x) => (typeof x === "string" && x.includes("OUTCOME") ? x + " — the sim marked it" : x))))(console.log) });\n'],
};
/** A copy of the lib or the harness with one plant in it. */
const planted = (id, [file, anchor, to] = V9_PLANTS[id]) => {
  const src = file === "lib" ? LIB : SRC;
  const n = src.split(anchor).length - 1;
  assert.equal(n, 1, `${id}: the anchor occurs ${n} time(s)`);
  return src.replace(anchor, to);
};
/** A plant with its claim words swapped out, so only a structural gate can catch it. */
const neutralised = (text) => text.replace(/the sim marks? [^"]*"/g, 'a stretch the lesson teaches"').replace(/«[^»]*»/g, "");

describe("§W11 ROUND 10 — the round-9 verifier's findings, each ported as a test that was red on round 9", () => {
  it("A · FALSE-SELF-STATEMENT-REFUSAL-SIZING: the mobile refusal says what its ratio band is sized on — this lesson's 12 archived pc wrong legs (0.935–1.028), its low end widened to 0.911, the reading of a sc-signal-flashing mobile wrong leg — and every bound it cites IS the declared constant", () => {
    const line = wrongLegProfileStartLine(createWrongLegProfile("sc-pk-busstop-ban", { zoneSpan: SPAN, platform: "mobile" }), { everyM: EVERY_M });
    assert.ok(!/sized on this lesson's archived pc legs only/.test(line), `the round-9 false sentence is back: ${line}`);
    const Z = LIBNS.ODO_CENSUS_ZONE_PC;
    const LOW = LIBNS.ODO_RATIO_LOW_END;
    assert.ok(Z && Object.isFrozen(Z) && LOW && Object.isFrozen(LOW), "the populations the band is sized on are not declared, frozen records");
    // The census as re-run (scratchpad/pedal/r10/odo-census-r10.txt): this lesson's own twelve pc wrong legs, and the
    // two sc-signal-flashing mobile wrong legs (w61, w62-signal) that read 0.911.
    const BUSSTOP_PC = [0.935, 1.0, 1.007, 0.977, 0.96, 0.958, 1.011, 1.023, 1.008, 0.946, 1.004, 1.028];
    assert.deepEqual([Z.legs, Z.min, Z.max], [BUSSTOP_PC.length, Math.min(...BUSSTOP_PC), Math.max(...BUSSTOP_PC)]);
    assert.deepEqual([LOW.ratio, LOW.leg, LOW.waves], [0.911, "sc-signal-flashing__mobile-wrong", "w61 w62-signal"]);
    assert.equal(ODO_RATIO_MIN, LOW.ratio, "the band's low end is not the reading it says it is");
    assert.equal(ODO_RATIO_MAX, Z.max, "the band's high end is not this lesson's highest pc leg");
    assert.match(
      line,
      /the dead reckoning's census odometer ratio 0\.911–1\.028, sized on a census of 12 of this lesson's archived pc wrong legs \(0\.935–1\.028\) with its low end widened to 0\.911, the reading of a sc-signal-flashing mobile wrong leg; this leg is «mobile», and in the harness's odometer census of 328 archived wrong legs \(158 of them mobile, measured 2026-09-25\) a mobile flat odometer read as low as 0\.524 of the true path, far outside 0\.911–1\.028/,
    );
    assertObservationLine(line, "the mobile refusal");
    assert.deepEqual(sizingClaimViolations(), [], "a «sized on» / «measured» / «census» sentence names no population, or nobody registered it");
    assert.deepEqual(sizingBoundViolations(), [], "a bound a sizing sentence cites is not the declared constant");
  });

  it("A · …AND THE SIZING CHECK CAN FAIL: round 9's false sentence planted back, a sizing sentence with its population dropped, an unregistered census sentence, and a cited bound that is not the declared constant are each caught", () => {
    const T = PROFILE_LINE_TEMPLATES;
    const withTpl = (id, text) => ({ ...T, [id]: text });
    for (const [label, templates] of [
      ["round 9's «sized on this lesson's archived pc legs only»", withTpl("refused.platform", `the dead reckoning's odometer ratio is sized on this lesson's archived {census:toks} legs only; ${T["refused.platform"]}`)],
      ["a registered sizing sentence with its population dropped", withTpl("census.odo", "census odometer ratio {rmin:n}–{rmax:n}")],
      ["an unregistered census sentence", withTpl("obs.open", `${T["obs.open"]}; the census ratio held`)],
      ["an unregistered «measured»", withTpl("unmet.first", `${T["unmet.first"]}, measured`)],
    ]) {
      assert.ok(sizingClaimViolations(templates).length > 0, `${label}: the sizing check passed it`);
    }
    // A cited bound that is not the declared constant — the refusal's band, the braking line's reaction band — is red.
    const specs = sizingSpecsFromLib();
    const tamper = (key, field, value) => ({ ...specs, [key]: { ...specs[key], f: { ...specs[key].f, [field]: value } } });
    for (const [label, s] of [
      ["the refusal's band low end", tamper("odoBand", "rmin", 0.935)],
      ["the pc census's legs", tamper("odoBand", "legs", 11)],
      ["the reaction census's transitions", tamper("reactBand", "n", 300)],
      ["the missed line's high end", tamper("missed", "rmax", 1.0)],
    ]) {
      assert.ok(sizingBoundViolations(s).length > 0, `${label}: a bound off its declared constant passed`);
    }
  });

  it("A(a) · «braking NOW» is gone: the braking line says the throttle stays down to the end of the booking tick and the brake goes down on the first flat-rest tick whose dial does not read 0–1 км/ч — and the harness's code bears each clause out", () => {
    const r = drive(make("sc-pk-busstop-ban"), FLAT_SERIES, () => ({}), FLAT_TICK_MS);
    const say = r.steps.find((s) => s.forceRest).say.line;
    assert.ok(!/braking NOW/.test(say), `«braking NOW» is back: ${say}`);
    assert.match(say, /braking BOOKED at t=\d+s — the throttle stays down to the end of this tick; each flat-rest tick after it lets the throttle up, and the first one whose dial does not read 0–1 км\/ч puts the brake down\./);
    const f = harnessFacts();
    assert.deepEqual([f.throttleHeldOnBookingTick, f.flatRestPedals, f.brakeRefusedAtRest], [true, true, true], "the harness's code does not bear out the braking line's pedal clause");
    assert.ok(FALSE_SELF_STATEMENTS.some((re) => re.test("braking NOW at t=3s")), "«braking NOW» is not a registered false form");
  });

  it("A(b) · the truck row no longer says the w61 wrong leg «rested 8 s every 45 m»: its first flat stretch ran 13 s and 163 m under the harness's task-cap hold", () => {
    const row = WRONG_LEG_PROFILES.get("sc-ac-truck-spray").row;
    assert.ok(!/rested 8 s every 45 m/.test(row), `the false row is back: ${row}`);
    assert.match(row, /the w61 wrong leg's first flat stretch ran 13 s and 163 m under the harness's task-cap hold, after which it came to rest 7 times on the 45 m cadence and held each rest for the ordinary 8 s hold/);
    assert.ok(FALSE_SELF_STATEMENTS.some((re) => re.test("the w61 wrong leg rested 8 s every 45 m")), "the false row is not a registered false form");
  });

  it("A(c) · on every DECLARED lane the rest summary names the holds truly — never the older «each held 8s», which a drive's end can cut short; only a lane with no profile keeps the 4112566 words", () => {
    for (const platform of ["pc", "mobile", null]) {
      for (const id of WRONG_LEG_PROFILES.keys()) {
        const st = createWrongLegProfile(id, { zoneSpan: id === "sc-pk-busstop-ban" ? SPAN : null, platform });
        for (const stops of [1, 3]) {
          const clause = wrongLegRestHoldsClause(st, { stops, holdMs: HOLD_MS });
          assert.equal(typeof clause, "string", `${id}/${platform}: the declared lane falls back to «each held 8s»`);
          assert.match(clause, /the drive's end ended any hold still open$/, `${id}/${platform}: ${clause}`);
          assert.ok(!/^each held 8s$/.test(clause));
        }
      }
    }
    assert.equal(wrongLegRestHoldsClause(createWrongLegProfile("sc-no-such-lesson"), { stops: 3, holdMs: HOLD_MS }), null, "a lane with no profile lost the 4112566 words");
    assert.equal(wrongLegRestHoldsClause(createWrongLegProfile(null), { stops: 3, holdMs: HOLD_MS }), null);
    assert.equal(harnessFacts().driveEndReleasesBrake, true, "the harness's code does not end an open hold at the drive's end");
  });

  it("A(d) · «the brake was pressed for the zone rest» is gone: a zone rest that never came to rest says braking was BOOKED, and whether the harness gave the rest up or the drive ended", () => {
    // The harness gave up: the car never read 0–1 км/ч on a flat-rest tick.
    const booked = drive(make("sc-pk-busstop-ban"), FLAT_SERIES, () => ({}), FLAT_TICK_MS).state;
    const gaveUp = wrongLegRestEnded(booked, { now: 90_000, t0: 10_000, gaveUp: true }).state;
    // The drive ended on the booking tick, before any flat-rest tick ran.
    const ended = wrongLegProfileFinish(booked, { now: 90_000, t0: 10_000, driveEnded: true }).state;
    for (const [label, st, end] of [["gave up", gaveUp, "the harness gave the rest up"], ["drive ended", ended, "the drive ended"]]) {
      const obs = R(st.observed.tpl === "obs.midHold" ? st.observed.f.obs : st.observed);
      assert.ok(!/the brake was pressed for the zone rest/.test(obs), `${label}: the false clause is back: ${obs}`);
      assert.match(obs, new RegExp(`^braking was booked for the zone rest, and no flat-rest tick after it read the dial at 0–1 км/ч before ${end} — the car was not seen at rest on the dial; `));
    }
    assert.equal(harnessFacts().atRestBooksTheRest, true, "the harness's code does not book the rest on the first flat-rest tick at 0–1 км/ч");
  });

  it("A(e) · «the ordinary 45 m / 20 s cadence came due» is gone: the rests clause and the unchanged summary say the harness's own task-cap and over-limit holds were not holding — and the code bears it out", () => {
    const held = zoneHeldThenMissed();
    const rests = R(profileText("rests", { opp: 1, every: EVERY_M, maxS: MAX_MS / 1000, held: 3, forced: 0 }));
    assert.ok(!/ordinary [^;.()]*cadence came due/.test(rests), `the false clause is back: ${rests}`);
    assert.match(rests, /the 45 m \/ 20 s cadence came due 1 time\(s\) while the harness's own task-cap and over-limit holds were not holding and the profile held it/);
    const truck = driveCadence(make("sc-ac-truck-spray"), Array(80).fill(40)).state;
    const un = wrongLegRestSummary(truck);
    assert.ok(!/Every rest above fell when the ordinary cadence came due/.test(un), `the false summary is back: ${un}`);
    assert.match(un, /Every rest above fell on a tick where the 45 m \/ 20 s cadence was due and the harness's own task-cap and over-limit holds were not holding/);
    assert.ok(held.opportunities.count >= 1);
    assert.equal(harnessFacts().holdRestIsTaskCapOrOverLimit, true, "the harness's own holds are not the task-cap and over-limit holds");
  });

  it("A(a–e) · …AND EACH TRUE SENTENCE STOPS BEING TRUE WHEN THE HARNESS STOPS DOING IT — the facts read the code, not the words: every false form planted back in a copy of the table is caught, and so is every true sentence once its fact is taken out of a copy of the harness", () => {
    const T = PROFILE_LINE_TEMPLATES;
    const withTpl = (id, text) => ({ ...T, [id]: text });
    for (const [label, templates] of [
      ["«braking NOW» back", withTpl("say.braking", T["say.braking"].replace("braking BOOKED", "braking NOW"))],
      ["«the brake was pressed for the zone rest» back", withTpl("obs.zoneNoRest", `the brake was pressed for the zone rest; ${T["obs.zoneNoRest"]}`)],
      ["«the ordinary … cadence came due» back", withTpl("rests", T.rests.replace("(the {every:n|?} m", "(the ordinary {every:n|?} m"))],
      ["«Every rest above fell when the ordinary cadence came due» back", withTpl("summary.unchanged", T["summary.unchanged"].replace("Every rest above fell on a tick where", "Every rest above fell when the ordinary cadence came due, on a tick where"))],
      ["an unregistered pedal claim", withTpl("obs.open", `${T["obs.open"]}; the brake was pressed`)],
      ["an unregistered hold claim", withTpl("rest.plain", `${T["rest.plain"]} Each held on the ordinary 8 s hold of wall clock.`)],
    ]) {
      assert.ok(selfClaimViolations(templates).length > 0, `${label}: the self-claim check passed it`);
    }
    const table = [...WRONG_LEG_PROFILES.values()].flatMap((p) => [p.told, p.row]);
    assert.ok(selfClaimViolations(T, harnessFacts(), [...table, "the w61 wrong leg rested 8 s every 45 m"]).length > 0, "the truck row's false form back in a table text passed");
    const FLAT_REST_PEDALS = '      await throttle(false);\n      // THE SAME STANDSTILL DISCIPLINE';
    for (const [label, src, fact] of [
      ["the flat-rest branch no longer lifts the throttle", plantIn(SRC, "throttle up", FLAT_REST_PEDALS, "      // THE SAME STANDSTILL DISCIPLINE", "replace"), "flatRestPedals"],
      ["the brake pressed only under a condition", plantIn(SRC, "brake", "      await brake(true, p.kmh);\n      const atRest", "      if (phaseTicks > 1) await brake(true, p.kmh);\n      const atRest", "replace"), "flatRestPedals"],
      ["the booking tick lifts the throttle", plantIn(SRC, "booking lift", '      await timed("pedals", () => throttle(true));\n', '      await timed("pedals", () => throttle(true));\n      if (wrongProfileStep.forceRest) await throttle(false);\n', "replace"), "throttleHeldOnBookingTick"],
      ["the brake refused over a wider band", plantIn(SRC, "refusal", "if (on && kmh !== null && kmh >= 0 && kmh <= 1) {", "if (on && kmh !== null && kmh >= 0 && kmh <= 3) {", "replace"), "brakeRefusedAtRest"],
      ["the rest booked on a wider band", plantIn(SRC, "at rest", "      await brake(true, p.kmh);\n      const atRest = p.kmh >= 0 && p.kmh <= 1;", "      await brake(true, p.kmh);\n      const atRest = p.kmh >= 0 && p.kmh <= 2;", "replace"), "atRestBooksTheRest"],
      ["a third harness hold", plantIn(SRC, "third hold", "      let holdRest = false;\n", "      let holdRest = false;\n      if (p.kmh > 200) holdRest = true;\n", "replace"), "holdRestIsTaskCapOrOverLimit"],
      ["the drive's end no longer lifts the brake", plantIn(SRC, "end brake", "await throttle(false);\nawait brake(false);\n// THE WRONG-LEG PROFILE CLOSES HERE", "await throttle(false);\n// THE WRONG-LEG PROFILE CLOSES HERE", "replace"), "driveEndReleasesBrake"],
      ["the ordinary hold no longer from the rest's own clock", plantIn(SRC, "hold clock", "if (restLogged && flatRestHoldDone({ now, restAt: flatRestAt, holdMs: FLAT_REST_HOLD_MS, state: wrongProfile })) {", "if (restLogged && flatRestHoldDone({ now, restAt: phaseAt, holdMs: FLAT_REST_HOLD_MS, state: wrongProfile })) {", "replace"), "plainHoldIsWallClock"],
    ]) {
      const f = harnessFacts(src);
      assert.equal(f[fact], false, `${label}: the fact ${fact} still holds`);
      assert.ok(selfClaimViolations(PROFILE_LINE_TEMPLATES, f).length > 0, `${label}: the templates' sentences stayed «true» against a harness that no longer does it`);
    }
  });

  it("B · LIB-DIRECT-PRINT-N17: the round-9 verifier's honest debug print in lib §2 — and a print in §5's closure (N18) — is caught by the lib's print ban and its claim-literal census, and AT RUNTIME by the child's empty stdout", () => {
    for (const id of ["N17", "N18"]) {
      const lib = planted(id);
      const v = sec5GateViolations(lib);
      assert.ok(v.some((x) => x.startsWith("L13 ")), `${id}: not caught by L13 (no print in the lib) — ${v.map((x) => x.slice(0, 60)).join(" | ") || "the §5 gate passed it"}`);
    }
    assert.ok(sec5GateViolations(planted("N17")).some((x) => x.startsWith("L14 ")), "N17: its claim literal is not caught by L14 (the lib's claim-literal census)");
    const rt = libRuntimeViolations(planted("N17"));
    assert.ok(rt.some((x) => /stdout/.test(x)), `N17: the runtime check did not see the print — ${rt.join(" | ") || "it passed"}`);
  });

  it("C · BAN-IS-A-SPELLING-BAN, the lib: N01, N02 and N19 — a builtin redefined with NO banned name spelt, or by plain destructuring — and eight spellings of our own are caught AT RUNTIME: the child diffs every builtin descriptor around the import and the export calls", async () => {
    const own = {
      "R10-S1 a Number prototype through a number literal": [L_IMPORTS, 'const kc = ["constr", "uctor"].join(""), kp = ["proto", "type"].join("");\n(0)[kc][kp].toFixed = function () { return "0"; };\n'],
      "R10-S2 Object.assign into an alias of a prototype": [L_IMPORTS, 'const kc = ["constr", "uctor"].join(""), kp = ["proto", "type"].join("");\nconst sp = ""[kc][kp];\nconst p0 = sp.padEnd;\nObject.assign(sp, { padEnd: function (...a) { return p0.apply(this, a); } });\n'],
      "R10-S3 console reached through a Function string": [L_IMPORTS, 'const kc = ["constr", "uctor"].join("");\nconst cn = (() => 0)[kc]("return con" + "sole")();\nconst l0 = cn.log;\ncn.log = (...a) => l0(...a);\n'],
      "R10-S4 prepareStackTrace set through a Function string": [L_IMPORTS, 'const kc = ["constr", "uctor"].join("");\n(() => 0)[kc]("return Err" + "or")()[["prepare", "StackTrace"].join("")] = (e, s) => s;\n'],
      "R10-S5 a LAZY patch inside an export, on its first call": [L_HELD_CLOSURE, '    { const kc = ["constr", "uctor"].join(""), kp = ["proto", "type"].join(""); const ap = [][kc][kp]; if (!ap.at2) ap.at2 = ap.at; }\n'],
      "R10-S6 a patch deferred to a microtask": [L_IMPORTS, 'Promise.resolve().then(() => { const kc = ["constr", "uctor"].join(""), kp = ["proto", "type"].join(""); [][kc][kp].zz = 1; });\n'],
      "R10-S7 a patch deferred to a timer": [L_IMPORTS, 'setTimeout(() => { const kc = ["constr", "uctor"].join(""), kp = ["proto", "type"].join(""); ""[kc][kp].zz = 1; }, 0);\n'],
      "R10-S8 a direct write through a Function string": [L_ACCRUE_RETURN, '    if (sec + step >= 3 && sec < 3) { const kc = ["constr", "uctor"].join(""); (() => 0)[kc]("return pro" + "cess")().stdout.write("x\\n"); }\n', "before"],
    };
    // each case, and the violation it must produce — the builtin it redefined, or the print
    const want = {
      N01: /^R2 a builtin was redefined: Array\.prototype join/,
      N02: /^R2 a builtin was redefined: String\.prototype replace/,
      N19: /^R2 a builtin was redefined: console log/,
      "R10-S1 a Number prototype through a number literal": /^R2 a builtin was redefined: Number\.prototype toFixed/,
      "R10-S2 Object.assign into an alias of a prototype": /^R2 a builtin was redefined: String\.prototype padEnd/,
      "R10-S3 console reached through a Function string": /^R2 a builtin was redefined: console log/,
      "R10-S4 prepareStackTrace set through a Function string": /^R2 a builtin was (?:added|redefined): Error prepareStackTrace/,
      // (attributed to the first SAMPLED call after the change — the held closure runs after wrongLegFlatStep's 40th call)
      "R10-S5 a LAZY patch inside an export, on its first call": /^R2 a builtin was added: Array\.prototype at2 — first seen after (?!import)/,
      "R10-S6 a patch deferred to a microtask": /^R2 a builtin was added: Array\.prototype zz/,
      "R10-S7 a patch deferred to a timer": /^R2 a builtin was added: String\.prototype zz/,
      "R10-S8 a direct write through a Function string": /^R1 the lib wrote to stdout/,
    };
    const cases = [
      ...["N01", "N02", "N19"].map((id) => [id, planted(id)]),
      ...Object.entries(own).map(([label, [anchor, insert, where]]) => [label, plantIn(LIB, label, anchor, where === "before" ? insert + anchor : anchor + insert, "replace")]),
    ];
    const verdicts = await libRuntimeViolationsAll(cases.map(([, lib]) => lib));
    cases.forEach(([label], i) => {
      assert.ok(verdicts[i].length > 0, `${label}: the runtime integrity check passed it`);
      assert.ok(verdicts[i].some((x) => want[label].test(x)), `${label}: not caught as ${want[label]} — ${verdicts[i].join(" | ")}`);
    });
    // N19 spells console.log plainly: the lib's print ban (L13) is a second, static catch.
    assert.ok(sec5GateViolations(planted("N19")).some((x) => x.startsWith("L13 ")), "N19 spells console.log plainly, and the lib's print ban did not see it");
  });

  it("C · THE RUNTIME CHECK ON THE LIB AS IT IS: importing it and driving every export over the profile fixtures changes no builtin descriptor, writes nothing to stdout or stderr, leaves no work scheduled — and the check is not thin", () => {
    const v = libRuntimeViolations(null);
    assert.deepEqual(v, [], "the lib changed a builtin, printed, or left work behind while it was imported and driven");
    const rep = libRuntimeViolations.last;
    const exportsNow = Object.keys(LIBNS).filter((n) => typeof LIBNS[n] === "function");
    assert.deepEqual([...rep.functions].sort(), exportsNow.sort(), "the child drove a different set of exports than the lib has");
    assert.ok(exportsNow.every((n) => rep.called.includes(n)), "an export was never called");
    assert.ok(rep.props >= 900, `only ${rep.props} descriptors were snapshotted`);
    for (const t of ["Array.prototype", "String.prototype", "Object.prototype", "Function.prototype", "Error.prototype", "console", "process", "globalThis", "Reflect", "JSON", "Math", "Error", "process.stdout", "process.stderr"]) assert.ok(rep.targets.includes(t), `the snapshot leaves out ${t}`);
    assert.ok(rep.calls >= 40_000 && rep.diffsRun >= 1_500, `the battery is thin: ${rep.calls} calls, ${rep.diffsRun} diffs`);
  });

  it("C · EVERY CANONICAL MECHANISM IS STILL RED IN EVERY FILE — the round-9 verifier's 20, planted in lib §1, lib §5 and the harness, each caught by a MECHANISM ban (not by a census or a word list)", () => {
    const MECH = [
      ["eval", 'eval("1");'], ["new Function", 'new Function("return 1");'], ["Function()", 'Function("return 1");'],
      ["computed key naming a profile key", 'void ({})["wrongLeg" + "Profile"];'], ["Array.prototype.* =", "Array.prototype.zz = 1;"],
      ["String.prototype.* =", "String.prototype.zz = 1;"], ["Object.prototype.* =", "Object.prototype.zz = 1;"], ["console.* =", "console.zz = 1;"],
      ["globalThis.* =", "globalThis.zz = 1;"], ["process.* =", 'process.zz = "1";'], ["new Error().stack", "void new Error().stack;"],
      ["Error.captureStackTrace", "Error.captureStackTrace({});"], ["arguments.callee", "void function () { return arguments.callee; };"],
      ["Reflect", 'Reflect.get({}, "a");'], ["createRequire", "void createRequire;"], ["getBuiltinModule", 'void process.getBuiltinModule("node:fs");'],
      [".constructor", "void (() => 0).constructor;"], ["import(node:vm)", 'void import("node:vm");'], ["Object.defineProperty(builtin)", 'Object.defineProperty(Array, "zz", { value: 1 });'],
      ["__proto__", "void ({}).__proto__;"],
      // …and the canonical plain-string-key spellings an honest author writes (round 10: a literal key is a code name)
      ['x["constructor"]', 'void (() => 0)["constructor"];'], ['x["prototype"]', 'void Array["prototype"];'], ['x["stack"]', 'void new Error()["stack"];'],
    ];
    const L5 = "export const PROFILE_STEP_CAP_MS = OVER_LIMIT_STEP_CAP_SEC * 1000;\n";
    for (const [name, code] of MECH) {
      for (const [where, v] of [
        ["lib §1", sec5GateViolations(plantIn(LIB, name, L_IMPORTS, `${code}\n`))],
        ["lib §5", sec5GateViolations(plantIn(LIB, name, L5, `${code}\n`))],
        ["the harness", harnessGateViolations(plantIn(SRC, name, H_OUT_BLOCK, `${code}\n`))],
      ]) {
        const mech = v.filter((x) => (where === "the harness" ? /^M[1-7] / : /^L(?:5|6|7|8|9|12|13) /).test(x));
        assert.ok(mech.length > 0, `${name} in ${where}: no mechanism ban caught it — ${v.map((x) => x.slice(0, 60)).join(" | ") || "the gate passed it"}`);
      }
    }
  });

  it("C · THE CENSUSES HOLD WHAT THEY HOLD, AND EACH CAN FAIL: every construct a spelling-evading mechanism needs is pinned in the harness (M8, M9, M10) and the lib (L15, L16, L17) — each census is its pin, item for item, and not empty — and a sibling of each kind, planted, is a new census entry", () => {
    // (Counted against the PINS, not against numbers written here, so the one re-pin command is all a sibling lane's
    // honest edit needs. At this lane's hand-off: M8 89, M9 2, M10 66, H3d 41, H8 181; L15 21, L16 1, L17 8, L14 83.)
    const pinned = (pin) => pin.split(/\s+/).filter(Boolean).length;
    for (const [label, items, pin] of [
      ["M8", computedKeyCensus(SRC), CENSUS_COMPUTED_PIN], ["M9", builtinDestructuringCensus(SRC), CENSUS_DESTRUCTURE_PIN], ["M10", literalReceiverCensus(SRC), CENSUS_RECEIVER_PIN],
      ["H3d", scenarioReadCensus(SRC), SCENARIO_READS_PIN], ["H8", claimLiteralsOf(SRC), CLAIM_LITERALS_PIN],
      ["L15", computedKeyCensus(LIB), LIB_CENSUS_COMPUTED_PIN], ["L16", builtinDestructuringCensus(LIB), LIB_CENSUS_DESTRUCTURE_PIN], ["L17", literalReceiverCensus(LIB), LIB_CENSUS_RECEIVER_PIN],
      ["L14", claimLiteralsOf(LIB), LIB_CLAIM_LITERALS_PIN],
    ]) {
      assert.ok(items.length > 0, `${label}: the census is empty — the scan can no longer see its construct`);
      assert.equal(items.length, pinned(pin), `${label}: the census holds ${items.length} item(s) and its pin ${pinned(pin)}`);
    }
    for (const [label, code, gate] of [
      ["a builtin reached through a variable on an identifier", "{ const a = []; const k1 = \"x\"; void a[k1]; }", "M8"],
      ["a builtin destructured", "{ const { log } = console; void log; }", "M9"],
      ["a builtin as a destructuring target", "({ log: console.log } = { log: () => 0 });", "M9"],
      ["a string literal's member", 'void "".concat;', "M10"],
      ["a function literal's member", "void (function () {}).call;", "M10"],
      ["a constructed value's member", "void new Map().size;", "M10"],
    ]) {
      const v = harnessGateViolations(plantIn(SRC, label, H_OUT_BLOCK, `${code}\n`));
      assert.ok(v.some((x) => x.startsWith(`${gate} `)), `${label}: not caught by ${gate} — ${v.map((x) => x.slice(0, 60)).join(" | ") || "the gate passed it"}`);
    }
    for (const [label, code, gate] of [
      ["a computed key on a variable", "const zzA = []; const zzK = \"x\"; void zzA[zzK];", "L15"],
      ["a builtin destructured", "const { round: zzR } = Math;", "L16"],
      ["a string literal's member", 'void "".concat;', "L17"],
    ]) {
      const v = sec5GateViolations(plantIn(LIB, label, L_IMPORTS, `${code}\n`));
      assert.ok(v.some((x) => x.startsWith(`${gate} `)), `${label}: not caught by ${gate} — ${v.map((x) => x.slice(0, 60)).join(" | ") || "the gate passed it"}`);
    }
  });

  it("C · BAN-IS-A-SPELLING-BAN, the harness: N03 (a prototype through [][kC][kP]) and N05 (the Function constructor through (() => 0)[kC]) are caught by the censuses of computed access and of literal receivers", () => {
    for (const id of ["N03", "N05"]) {
      const v = harnessGateViolations(planted(id));
      assert.ok(v.some((x) => x.startsWith("M8 ")), `${id}: not caught by M8 (the census of computed access with a key that is not a literal) — ${v.map((x) => x.slice(0, 60)).join(" | ") || "the gate passed it"}`);
      assert.ok(v.some((x) => x.startsWith("M10 ")), `${id}: not caught by M10 (the census of member access on a literal or constructed receiver)`);
    }
  });

  it("C · BANS-HONEST-AND-OVERBREADTH: the name bans read CODE TOKENS — honest prose saying «arguments», «prototype», «constructor», «eval» or «Function» is no mechanism, and one more `.filter(Boolean)` is no count violation", () => {
    const prose = {
      "prose «arguments»": [H_OUT_BLOCK, 'note("  (the arguments of this run are its lesson id, platform and leg)");\n'],
      "prose «prototype»": [H_OUT_BLOCK, 'note("  (this lane is a prototype of the full instrument)");\n'],
      "prose «constructor»": [H_OUT_BLOCK, 'note("  (the constructor of this evidence is the harness)");\n'],
      "prose «eval»": [H_OUT_BLOCK, 'note("  (no eval step ran on this leg)");\n'],
    };
    for (const [label, [anchor, insert]] of Object.entries(prose)) {
      const v = harnessGateViolations(plantIn(SRC, label, anchor, insert));
      assert.deepEqual(v, [], `${label}: an honest note is red — ${v.map((x) => x.slice(0, 80)).join(" | ")}`);
    }
    const libProse = sec5GateViolations(plantIn(LIB, "lib prose «Function»", L_IMPORTS, 'export const ZZ_NOTE = "Function keys are not read here";\n'));
    assert.deepEqual(libProse, [], `a lib string saying «Function» is red — ${libProse.join(" | ")}`);
    const filterV = harnessGateViolations(plantIn(SRC, "one more .filter(Boolean)", H_OUT_BLOCK, 'note(["a", "", "b"].filter(Boolean).join(" "));\n'));
    assert.ok(!filterV.some((x) => /handed on as a callback/.test(x)), `one more .filter(Boolean) is still a count violation — ${filterV.join(" | ")}`);
  });

  it("D · H8-WORD-GAP-AND-ID-FRAGMENTS: «the sim» and a quoted Cyrillic fault title are claim words (N08); a line keyed on the scenario id by ANY fragment is a census red (N06, N07, N14 — and N16's out-dir guard); a guard on STEER_BY, true exactly on wrong legs, is a leg-mode guard (N09) — each caught with its claim words removed too", () => {
    const v08 = harnessGateViolations(planted("N08"));
    assert.ok(v08.some((x) => x.startsWith("H8 ")), `N08: «the sim marks» is not a claim literal — ${v08.join(" | ") || "the gate passed it"}`);
    for (const id of ["N06", "N07", "N14", "N16"]) {
      for (const [how, src] of [["as planted", planted(id)], ["with its claim words removed", neutralised(planted(id))]]) {
        const v = harnessGateViolations(src);
        assert.ok(v.some((x) => x.startsWith("H3d ")), `${id} ${how}: not caught by H3d (the census of every read of the scenario id) — ${v.map((x) => x.slice(0, 60)).join(" | ") || "the gate passed it"}`);
      }
    }
    for (const [how, src] of [["as planted", planted("N09")], ["with its claim words removed", neutralised(planted("N09"))]]) {
      const v = harnessGateViolations(src);
      assert.ok(v.some((x) => x.startsWith("H7b ")) && v.some((x) => x.startsWith("H7c ")), `N09 ${how}: a STEER_BY guard is not a leg-mode guard to H7b/H7c — ${v.map((x) => x.slice(0, 60)).join(" | ") || "the gate passed it"}`);
    }
    // The leg-mode variables are DERIVED from the harness's code, not hand-listed.
    const lm = legModeVariables(SRC);
    assert.equal(lm.root, "LEG_MODE");
    assert.deepEqual(lm.modes, ["right", "wrong", "path"]);
    assert.deepEqual(Object.fromEntries([...lm.vars].filter(([k]) => ["MODE", "STEER_BY"].includes(k))), {
      MODE: { right: ["right"], wrong: ["wrong"], path: ["right"] },
      STEER_BY: { right: ["ribbon"], wrong: ["none"], path: ["authored-path"] },
    });
    // …every variable the derivation reaches, and the one mode-carrying OBJECT it finds (`createHazardBooks(MODE ===
    // "right", MODE)`, whose `.active` is false on exactly the wrong legs).
    assert.deepEqual([...lm.vars.keys()].sort(), ["DRIVE_UNBELTED", "LEG_MODE", "MODE", "STEER_BY"]);
    assert.deepEqual(lm.carriers, ["hazardBooks"]);
    for (const [label, anchor, insert, gates] of [
      ["a guard on DRIVE_UNBELTED (true only on wrong legs)", H_PREV_KMH, '  if (DRIVE_UNBELTED && p.kmh === 0) note("      standing where the lesson teaches");\n', ["H7b", "H7c"]],
      ["a guard on the hazard books (inactive on exactly the wrong legs)", H_PREV_KMH, '  if (!hazardBooks.active && p.kmh === 0) note("      standing where the lesson teaches");\n', ["H7b", "H7c"]],
      ["any value compared with the wrong leg's own literal", H_OUT_BLOCK, 'if (status.phase !== "done" && String(OUT).endsWith("-wrong")) note("  a stretch the lesson teaches");\n', ["H7b", "H7c"]],
    ]) {
      const v = harnessGateViolations(plantIn(SRC, label, anchor, `${insert}${anchor}`, "replace"));
      for (const g of gates) assert.ok(v.some((x) => x.startsWith(`${g} `)), `${label}: not caught by ${g} — ${v.map((x) => x.slice(0, 60)).join(" | ") || "the gate passed it"}`);
    }
  });
});

/** THE TEMPLATE TABLE, pinned per template (sha256, 12 hex) — round 8, from the round-7 verifier's V7-B4: a
 *  sentence changed in observation words only passes the vocabulary, so every change to a template is a
 *  visible edit here. The failure names the template and prints its new text: re-read it for a claim about
 *  the product, then update the hash. */
const TEMPLATE_SNAPSHOT = Object.freeze({
  "verdict.held": "5563e6d02ffe",
  "verdict.notHeld": "575b4e1ae37d",
  "sizing.label": "353e33484f97",
  "sizing.labelZone": "4a061c3fe6f3",
  "start.on": "3b7c6b2e731d",
  "start.refused": "4b78895b2719",
  "start.every": "93a223c6c811",
  "start.zone": "bfb9753b5096",
  "refused.span": "cedf5668e7aa",
  "refused.platform": "2300e79591d3",
  "census.odo": "2890d8dcde3d",
  "census.creep": "616be9f27360",
  "census.react": "019dd32424af",
  "census.lfPc": "ff5b7ad38b1c",
  "census.lfMobile": "c07a8b28701a",
  "census.lfOther": "ce84c58680ce",
  "span.noWorld": "1ca17d84ebd0",
  "span.shortTrace": "2647777ba312",
  "span.noZone": "2132441aab1f",
  "span.noIds": "cb6fdc6e5f93",
  "span.edges": "140fbc63ef45",
  "span.bases": "c8dc433d5d1b",
  "span.basis": "07115d751120",
  "span.bounds": "feadb3aba9b8",
  "span.kind": "eda322ec9590",
  "span.gap": "8640c428b172",
  "span.noGeom": "02ac4ff9d096",
  "span.offEdge": "eb79e52ba9ca",
  "span.still": "5fb2d0e0dc48",
  "span.behind": "cbd0ceb08a1e",
  "span.noHeading": "d7c321b6099d",
  "span.turns": "e0294f4c18ec",
  "span.unreadable": "7fbe6f05ed08",
  "say.held": "0d48f64de1bc",
  "say.notHeld": "7d7c3ae08d9e",
  "say.notHeldEnd": "541ef66185f7",
  "say.braking": "84a75da47c55",
  "ceiling.metres": "754197d02f83",
  "ceiling.clock": "b43da9e4f696",
  "obs.ceiling": "03ebfa503801",
  "obs.stint": "fd8d7d8aec43",
  "obs.gapBase": "befd04f35184",
  "obs.gapRain": "49cd1d59377f",
  "obs.zoneBlind": "a09440465f07",
  "obs.zoneMissed": "b245dc0130ce",
  "zone.inside": "ab5766c5bc80",
  "zone.unverified": "c0aaeb82261a",
  "zone.model": "e4ba78513d16",
  "zone.stood": "4e34bd0eb51d",
  "zone.est": "ade099b12bb6",
  "zone.estNone": "94ebd86e9e2f",
  "obs.zoneNoRest": "de89f502dd32",
  "zone.endGaveUp": "cd2ee5d29fa8",
  "zone.endDrive": "b353e5b0f3b8",
  "obs.zoneHeld": "d5d85fefbc78",
  "obs.zoneUnverified": "f80a873ee342",
  "obs.midHold": "ca915e3d4196",
  "obs.open": "456a704c801b",
  "obs.finishHeld": "a18100b5dc86",
  "obs.finishUnmet": "4affbbbb81b0",
  "unmet.noRecord": "c29291ff486d",
  "unmet.notEnded": "89a07b52502f",
  "unmet.released": "49eba41ce6ca",
  "unmet.noDisc": "5718a82503f2",
  "unmet.discUnread": "08fd82cfe562",
  "unmet.discChanged": "a8808b7735b2",
  "unmet.first": "6cec98e80b91",
  "unmet.last": "598f07166cab",
  "unmet.inBand": "9f48eade9c5c",
  "unmet.window": "7f1b53740861",
  "unmet.endGap": "b484d1108480",
  "outcome.refused": "85d5c044bbad",
  "outcome.noTicks": "4a50ab7fdaef",
  "outcome.held": "5bf2e1797ece",
  "outcome.notHeld": "381d9b2bc96e",
  "outcome.clock": "f7fe973ba77a",
  "rests": "036551469de9",
  "end.reached": "15856a688171",
  "end.notReached": "30baa563b2ce",
  "end.unknown": "5445e5c19461",
  "readings.finish": "f4c8cc090498",
  "readings.stint": "9dd189cd3a42",
  "readings.lead": "f447412f2c99",
  "readings.leadRain": "b93f2303aff4",
  "readings.leadRule": "398ff2db538b",
  "readings.zone": "c3e35bcdf917",
  "zone.brakingBooked": "ee0da3e5f027",
  "zone.brakingNever": "24ef4cbe8e6a",
  "sizing": "2d5320d93c49",
  "sizing.finish": "3532b95f9fe5",
  "sizing.stint": "42c7abcdce5e",
  "sizing.lead": "e05be562c34d",
  "sizing.leadDrill": "e4c6f69fd322",
  "sizing.leadRain": "6f5e0e1aa777",
  "sizing.leadRainSus": "a18353741669",
  "sizing.zone": "1bdcb1ae66b9",
  "sizing.dropBus": "e0dda1c324e8",
  "sizing.dropOther": "47388b53a307",
  "rest.zone": "8062aefbd965",
  "rest.plain": "c621defd4a2d",
  "summary": "e842ee88d148",
  "summary.unchanged": "b9ea5960685f",
  "summary.zoneRest": "9c0fa8c094f6",
  "summary.zoneNone": "ce9e2f40f987",
  "rest.holds": "4aac58d4ed70",
  "rest.holdsPlain": "441ae2d4c092",
});
/** …and the profile table's printed texts (`name`, `told`, `row`), the same way. */
const TABLE_TEXT_SNAPSHOT = Object.freeze({
  "sc-signal-flashing": "3fc9ea04df4b",
  "sc-ov-keep-right": "a00cceeb8894",
  "sc-ac-truck-spray": "dc9a69512f2a",
  "sc-pk-busstop-ban": "ea3f2f1fdfbd",
});

/* ═══ ROUND 9 PINS (begin) — computed by scratchpad/pedal/r9/make-pins.mjs (round 10: re-computed by
 * scratchpad/pedal/r10/make-pins-r10.mjs) from the lib and the harness as they stand (4112566 + this lane), each a list of
 * 12-hex sha256 prefixes or the exact enumerated texts. A failure prints what is new and the re-pin string; re-read the
 * change for a claim about the product before pasting it. ═══ */
const LIB_MECHANISM_ALLOWANCES = Object.freeze({"computed":[],"assign":[],"prototypeLines":[],"stackLines":[],"dynamicImports":[]});
const HARNESS_MECHANISM_ALLOWANCES = Object.freeze({
  "computed": [
    "keyboard[on ? \"down\" : \"up\"]",
    "keyboard[on ? \"down\" : \"up\"]",
    "keyboard[on ? \"down\" : \"up\"]",
    "cs[`border${side}Width`]",
    "cs[`border${side}Style`]",
    "cs[`border${side}Color`]",
    "out[tr.getAttribute(\"data-sev\")]"
  ],
  "assign": [
    "process.exitCode = exit;"
  ],
  "prototypeLines": [
    "Wrapped.prototype = Orig.prototype;"
  ],
  "stackLines": [
    "const why = String(error?.stack ?? error?.message ?? error)"
  ],
  "dynamicImports": [
    "const { spawnSync } = await import(\"node:child_process\");",
    "const { laneFidelity } = await import(\"../audit/route-fidelity.mjs\");",
    "const { webkit, chromium } = await import(\"./lib/pw.mjs\");"
  ],
  "consoleProcess": {
    "process.argv.slice member (": 1,
    "console.error member (": 6,
    "process.exit member (": 12,
    "console.log member (": 3,
    "process.env.KNIJKA_REPEAT member ?": 1,
    "process.env.KNIJKA_REPEAT_CLAIM member )": 1,
    "process.env member }": 1,
    "process.execPath member ,": 1,
    "process.stdout.on member (": 1,
    "process.stderr.on member (": 1,
    "process.on member (": 2,
    "process.env.KNIJKA_PC_DPR member |": 1,
    "process.env.KNIJKA_STEER_PROOF member ===": 1,
    "process.env.KNIJKA_ROAD_WITNESS member !==": 1,
    "process.exitCode assign =": 1
  }
});
/** H7a — the wrong-leg cadence block, line for line (244 code lines). */
const CADENCE_BLOCK_PIN = `
  64ac0b48fc5a 140702af1bc7 eb6f427b5aaa 235f985d9beb a7809a9f9a40 cde927fe59fa 3c180b795e2c b24707756d57 15d25ee834fe f29b273bc453
  de1f505942e1 b75e8806e3ed 0e072fc4bd55 29576b54e255 7e9e1267c40f a0ed0af1fa77 47880f386b31 55d019123b35 c41f37e2eb88 5ccfc725266f
  b751b3915560 f8c21eb227eb 4e445b59a491 b24707756d57 65a844785539 c98496c2569f cde927fe59fa 8aede30e182c 29576b54e255 7d9ce50b3f2b
  581a1c573ec8 09970aef6a2d 37d508c307c4 3554b17c241e 7655f71db20d cb4a91abf8cf 68e1cc8ab276 01a9273b8721 2995ba2acdff 14463a9d5ab0
  254130777413 d3039c128d72 5c896edd09bd cb86a5fd8bff a6640e96baec 29576b54e255 32389aea3312 92af52e247c3 2bff5259df08 4d27571394a6
  985045f1c057 8a5b133c639a 4d27571394a6 2a8440e0c7a9 f1c560d1de2d ac0236ee97e9 48e50935d86e aed9556e36ff 686eaf5d223a 0262e6d8220b
  11a4e96dad19 9afb2f3950c5 9d8b2b5670d1 35a5cd811cdd 92e83d16fe39 71454b752602 8df08256cc36 9d8b2b5670d1 d10b36aa74a5 d10b36aa74a5
  d10b36aa74a5 6c41070fd8f8 41cc730e2162 b24707756d57 b9f40a56fb42 440db01a66d4 cde927fe59fa df00e11ff333 29576b54e255 29fe3d1f5704
  4fb54fc9e221 b6522511e11e 630531dcfe08 024106880a2d b2ac42e26cd1 c981d845f4a9 281c3b54d1fa 4c40449c00d9 0a116e38cf3c af8bc6859cf2
  b24707756d57 cde927fe59fa 926b15174656 b0e47438fc0d 2a36cc9dd244 c3dcc2451fa2 85df2ae9ead0 bc0dc1f00fe1 29576b54e255 a65e7950a0a8
  5abcfda004bd 432740256e5a b751a73ec66e 72ac35b78127 0658c8c7672c 3b887a389be3 065aca268de9 926b15174656 c3dcc2451fa2 ed41d50a3f70
  55c923bc9d29 a892688153dc 26b46659f201 29576b54e255 329cfe5fd42a 92af52e247c3 afd3e9d9a4c4 73a0e8e43d9f 926e69a8b3cf 73a0e8e43d9f
  62bdfc1e1821 1b9d522c3962 13df507392e6 d835169996cb b79a349fc049 486fcbc2df7e 8b0555552a7d 9a9191a49a3e a1fd02caa5e8 92e83d16fe39
  1f27eb7495d1 573e8a3ed1da 8aa66f661659 bf2287c58023 9d8b2b5670d1 d10b36aa74a5 985045f1c057 c0df3a87c8c9 73a0e8e43d9f 14dd959a116e
  469983c7b7ad 81589b920e6d aed9556e36ff 39acae332d80 4827dc0e4176 824c1d5feadf 3a8b3f5cd679 1aeb894848a8 183d7706b426 9d8b2b5670d1
  ca9488f6c59e 92e83d16fe39 5bd86f836ae5 6a95ad5c0453 9d8b2b5670d1 d10b36aa74a5 d10b36aa74a5 d10b36aa74a5 e234864d7e48 a8a802f4943f
  1bb12f4ed754 8e145d63aed7 cd28bba2914b 3a308589673d 4a902d20ca3b 5cd01f628358 eee65012e486 29576b54e255 933ffa4c2bb3 3523a5ed18d5
  a8a802f4943f 1bb12f4ed754 8e145d63aed7 cd28bba2914b 3a308589673d 4a902d20ca3b 5cd01f628358 eee65012e486 2c58b0f2b094 abfa59370983
  790e877c8143 a6a7c1eeba8a 9d74c58d8dd0 4efbe75d22a0 49b326eafbaf eb5206d6875b d10b36aa74a5 be3e34217755 c41f37e2eb88 92cffa71c81f
  fc149f826841 91708c727750 ac2bc63b0800 fb4e004cfcb6 44e30893a23f 4c6ffcd63126 5785108f2f21 d10b36aa74a5 702657670fa8 b43cbe5fb430
  b02972ca89a8 94a38a1cfaab c8849f2d31b3 7b2c052e1f7a 9c95d34e136f 8fde04a415e1 52b34a87367a aed9556e36ff 249025cb5081 126a9cec8e39
  e413ed18c650 302fe3968337 1e43030a1a38 9d8b2b5670d1 fb9c8cb7c115 e7b0b4abb0a7 da04658e5130 d10b36aa74a5 99a1318a4e7c b7a3d37362ea
  9729669ead87 3e929c591152 c423802c3a38 9d0196732bc0 a6a7c1eeba8a 9d74c58d8dd0 4efbe75d22a0 71eab2ade725 92e83d16fe39 f1ad5b299898
  25638a2500c3 d9c2c3642d85 9d8b2b5670d1 911e4a282b3c 9729669ead87 3e929c591152 c423802c3a38 9d0196732bc0 a6a7c1eeba8a 9d74c58d8dd0
  4efbe75d22a0 d10b36aa74a5 d10b36aa74a5 d10b36aa74a5
`;
/** H7b — outside it, the 64 lines naming the cadence's state, a wrong-leg phase literal or a leg-mode test (round 10: the leg-mode tests derived from the code). */
const EFFECT_LINES_PIN = `
  20e9a1df206e d47864293df8 254c8589123a 619e6d9231ec 357d8f8753b9 64ac0b48fc5a 708e6bded5bb af7bb837fad0 c2e331b8bf44 50b207dc4bbf
  0d2ed8b628f7 64ac0b48fc5a 64ac0b48fc5a fcb13a0a4384 08e38737ee15 97ee2d2536c8 165433c2c261 d59a7ff22aca b8d54a751d08 aec5999e4ebe
  7f7e1e9c38c1 8f919965974c 44dc0d0850c0 a357386843e5 621e8f982818 eb5206d6875b eb5206d6875b 688ebe1054b2 330755fef94d 5ffc64a372c1
  13b56a9b2f17 a0f7e579028f 7d5a7cd19b04 eb5206d6875b b02972ca89a8 94a38a1cfaab 7b2c052e1f7a fb9c8cb7c115 eb5206d6875b df228cb15808
  9ac9dc686bd1 2f920a9cab19 72f57923e6b0 331064656919 bf9d76a2fafb 87e28ed8172b e1b0247d6c9e 34092c84093d 10d930de035c 288ff5f014c9
  c00a0ce178d8 b0954baeb11d 621e8f982818 2d352a962961 2f27648a28c1 562c56f5044f 3cfe7f09f61a 4913972cd8ae 4e09e9df9da4 1a5a6f18fe38
  051316388198 0ea61e021539 dd71e454a031 0e64ba293849
`;
/** H7c — outside it, the 17 statements a condition on that state, or on the leg being wrong, controls (round 10: and the else of a guard that always holds on a right leg). */
const EFFECT_CONTROLLED_PIN = `
  7b4170f259d1 8bf30462062e bc14cf6a7346 c3d8dfa205dc 44dc0d0850c0 a357386843e5 73a850d08979 dfdedd1e6c7f fcc8b09fe637 83edb2d72393
  fb9c8cb7c115 d2914f052b9e 1a7a0e16b2ce eaf9bc823323 77076bc57464 91e69777fae0 6628beb0de6c
`;
/** H8 — the 181 harness literals that carry a product actor, action or verdict word, «sim», or a quoted Cyrillic title (a multiset). */
const CLAIM_LITERALS_PIN = `
  004023491c5e 02bd34929917 051d81b89678 060e8e245a76 061cac01aaca 080762b222d1 0893a5d41be5 08bdcacbbde8 097f79851f10 0c743517fd16
  0dd8569d379f 0de9379c541b 0fb0e7c75d00 1191edb62131 145dcbdbd226 163b63a21144 1670d70075e5 1945d5131231 1be2b99b1d57 1c0b72773eec
  1cdc1280c06b 1dd390096f27 1e03f3f7749b 1f63078fa46b 2385d29d7599 253f68bba701 254ef00b5e5f 27ac48640750 28646b2cd605 29381249455d
  2a8011473c55 301e1a739897 30574facdbbc 305e30962810 305e30962810 305e30962810 320b8bfef76f 3368ca7a84ca 36900ea110f7 3a5fbfa80fe3
  3aaf071b429b 3d01ed94e382 3d2c44b8bc10 3db781442f17 3e3d03a2efaf 406d1af81701 40c7ac37fdca 40cac85fa880 40f2cb94b309 417ca2135e33
  429ecf752555 437adf6452df 444ea30d071d 464f9914025c 478c4eca5221 479b3d409125 479b3d409125 4f2b973d7215 4fa5be0c76a5 507088e9f166
  50d2f8399150 50ed267b42e6 51daf8e852b7 5640d687a7b9 5775fa6952b8 5b0d7f164b4c 5cc22d6cbdd2 5e5bdf35280b 5eaeba4b31f8 5fb7242591a1
  643fedc5b5e5 65f6241d1675 66ce5058a99e 66f6256a1340 677678afa0e8 67b680294980 6a6422b38adb 6a8cf17cf1c0 6c9dfd3e05e5 6d70013575f4
  6fbea2d90e5c 72942ddbea19 75ccaa1b6a91 762a4d2b05fd 76b503c9358d 788c2b76f224 788c2b76f224 7ad7764dd49d 7e2ab4ada73f 7eb486bcbe8e
  7f24ef6f9a1b 83524a614731 849e8677d3b6 87a75aa0a2d3 87e34f4c1367 89d5287718f1 8a744248e5a2 8bb97f9af2b5 8d31062a865a 8d80483dd36b
  8dcb8206d157 8e9f0acad94e 92060ec09bee 9217cd97f4e1 930c09213122 938a5331bf6f 96b807cfc22c 97c6ec043898 98a2f19483af 9a36217c4b62
  9c9c0b4ec749 9f8f72c9ca45 a1fa4e750e86 a3faa306c438 a476124e17ff a867027153c6 a9f225a30789 a9f7988b4505 aa969bd061bc ab019c3a0b95
  ab6a93d01aca ac62a00db8cb ac78c1fa794a acec45b187cc b13c755bb06f b1bea117b153 b34962dc2942 b685ea26f5ee b77da9b10832 b8c9ad258da3
  b92ec96af744 ba97c3abc214 bb187292fdf2 bc4719b56b82 bdbaa98b9c5a bddd09091d83 bea8a94b6836 bf5384d3b56e c090bf98c9dd c16447d5bcfd
  c6915f4cec14 c8d65773e674 c928f973684a cefbf563cb01 cf87870910a0 d2eb917bf3f2 d3f0500249f7 d46879e1e50d d7b2889d3042 d7bcc73374f3
  d9845cac570a d9d11c6d1f95 daa5906f3b57 db72cb2c2264 dbc86fef3268 dbe3467d5210 dd49fbb5f04f dd61f1649486 debf259403cb decb9dc530be
  e097477f2152 e5a0eb01db90 e769ff184c23 e94fa6e89335 e9c2966ea64f eca90074afd4 ed57a1c0ce04 f02888834325 f21767885c06 f405227c928b
  f5a10f187b15 f5fb40937c3d f7e8ba9bb2bb fab77a9a6955 fb10ebddd74f fb9cb7a0a6c3 fc246f0338fc fcdd33ffe384 fd084d524235 ff5d1f3cf809
  ff97b335b90c
`;
/** H10 — the distinctive keys of the profile's state that the harness names (on its enumerated profile lines). */
const HARNESS_NAMED_STATE_KEYS = Object.freeze(["dangerousAboveKmh","driveEnded","everyM","flatTicks","forceRest","gradedAboveKmh","heldAsSized","heldMs","holdMs","maxMs","postedKmh","qualAt","startedAt","suppressRest","topKmh"]);
/** H11 — the 21 direct prints. */
const DIRECT_PRINTS_PIN = `
  ed1e3728ee12 acdb7c59c5d8 a06b54887a9e 607a161b21fd 38007986c9fb 1d84e8d82bda 581bb6df8390 5df780d312be fb2db5d30970 69b5ecf7b261
  21ee2c46d4fd 059a971e9003 3aa8bc73751b 6d3fdd626046 d96962796cbd d96962796cbd d96962796cbd 390d96202f62 69b5ecf7b261 69b5ecf7b261
  d96962796cbd
`;
/** H12 — how the status object is reached, and the 8 lines naming the status file or its path. */
const STATUS_FORMS_PIN = Object.freeze({"const status =":1,"( status ,":2,"( status .phase":1,"= status .phase":1,"... status ,":1});
const STATUS_FILE_LINES_PIN = `
  e7732040fc9f 08fd5478aab4 599cf9c53582 caa1a9b068f2 6d3fdd626046 ec4970728d26 d36b16e0921f 0c573c4473ae
`;
/** L10 — the renderer, profileText and the slot grammar, as text (whitespace-squashed, comments stripped). */
const RENDERER_PINNED = Object.freeze([
  "export function renderProfileText(spec) { if (!spec || typeof spec !== \"object\" || typeof spec.tpl !== \"string\" || !Object.hasOwn(PROFILE_LINE_TEMPLATES, spec.tpl)) { throw new TypeError(`renderProfileText: not a profile template spec (${spec && typeof spec === \"object\" ? spec.tpl : typeof spec})`); } const f = spec.f && typeof spec.f === \"object\" ? spec.f : {}; const used = new Set(); const bad = (name, why) => new TypeError(`renderProfileText: ${spec.tpl} slot «${name}» ${why}`); const text = PROFILE_LINE_TEMPLATES[spec.tpl].replace(PROFILE_SLOT_RE, (all, name, kind, fallback) => { used.add(name); const v = f[name]; if (v === null || v === undefined) { if (kind === \"opt\") return \"\"; if (fallback !== undefined) return fallback; throw bad(name, \"is empty\"); } switch (kind) { case \"n\": case \"n1\": case \"n2\": case \"n3\": case \"r\": if (typeof v !== \"number\" || !Number.isFinite(v)) throw bad(name, `is not a finite number (${typeof v})`); return kind === \"n\" ? String(v) : kind === \"r\" ? String(Math.round(v)) : v.toFixed(Number(kind.slice(1))); case \"tok\": if (typeof v !== \"string\" || !PROFILE_TOKEN_RE.test(v)) throw bad(name, \"is not a token\"); return v; case \"toks\": if (!Array.isArray(v) || v.length === 0 || v.some((t) => typeof t !== \"string\" || !PROFILE_TOKEN_RE.test(t))) throw bad(name, \"is not a list of tokens\"); return v.join(\" + \"); case \"txt\": profileTableTexts ??= new Set([...WRONG_LEG_PROFILES.values()].flatMap((p) => [p.name, p.told, p.row])); if (typeof v !== \"string\" || !profileTableTexts.has(v)) throw bad(name, \"is not one of the profile table's own texts\"); return v; case \"frag\": case \"opt\": return renderProfileText(v); case \"frags\": if (!Array.isArray(v) || v.length === 0) throw bad(name, \"is not a list of templates\"); return v.map(renderProfileText).join(\"; \"); default: throw bad(name, `has an unknown kind «${kind}»`); } }); for (const k of Object.keys(f)) if (!used.has(k)) throw bad(k, \"is not in the template\"); return text; }",
  "export function profileText(tpl, f = {}) { const fields = {}; for (const [k, v] of Object.entries(f ?? {})) fields[k] = v === undefined ? null : v; const spec = Object.freeze({ tpl, f: Object.freeze(fields) }); renderProfileText(spec); return spec; }",
  "const PROFILE_SLOT_RE = /\\{([A-Za-z][A-Za-z0-9]*):([a-z0-9]+)(?:\\|([^{}]*))?\\}/g;",
  "const PROFILE_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9_.:\\-]*$/;",
  "let profileTableTexts = null;"
]);
/* ═══ ROUND 9 PINS (end) ═══ */

/* ═══ ROUND 10 PINS (begin) — computed by scratchpad/pedal/r10/make-pins-r10.mjs; each a MULTISET of 12-hex sha256
 * prefixes (sorted). A failure prints what is new and the re-pin string; re-read each new item for a claim or a mechanism
 * before pasting it. ═══ */
/** M8 — every computed member access in the harness whose key is not a string or number literal (89). */
const CENSUS_COMPUTED_PIN = `
  02f96be70a84 08dd6f349e4d 08dd6f349e4d 0bca6c2c57e0 10a2e35f7fa1 12ae6c865109 1448c8ee7bc3 19d1a3d98d2c 1cd031a3bcdf 1cd031a3bcdf
  2a632af7cc2d 320a967f7f12 354a8d6577ef 37b4b86bdee3 37b4b86bdee3 37b4b86bdee3 3870bcaad5a5 3bc8504b1253 3c598b1ef3e8 3e80158c635e
  3e80158c635e 3ebff14f10eb 41f133b0c724 4a938cd2ecbd 5398392bb00f 5398392bb00f 576df3def29a 5a862e342999 5d01392b4bdc 5e3dece36160
  5e3dece36160 63c04dc4d855 687e1c61a979 687e1c61a979 68fb4f1376aa 6c20edb0643d 6e7ac88e4794 72406994ee7a 72f16bc98d4f 7656d089aca0
  7d05bc2827a6 7fdf3841e3a1 91cc83e5ce82 91cc83e5ce82 91cc83e5ce82 91cc83e5ce82 91cc83e5ce82 91cc83e5ce82 91cc83e5ce82 91cc83e5ce82
  91cc83e5ce82 9a1e05e50e69 9a1e05e50e69 9cae29e4bdb6 9d9f0c1feb3b 9f25d93c1042 a1c0750e66fc a1c0750e66fc a1c0750e66fc a37bf7d85960
  a64d5ef9bd52 ab674c355d18 ab674c355d18 bb38d304d7ed bb38d304d7ed bbccb346286d bbccb346286d bc2b3f8debcd bd53c08755c6 c38fe80f846b
  c79b4fdd7609 c79b4fdd7609 cae842cdec0a d517a99d87e1 d7aa7baafbc1 d9d0be543847 e3dc8093e30c e4ccc00dc845 ee7c3fa49ccf ee7c3fa49ccf
  f5409cf0d7b1 f5409cf0d7b1 f5409cf0d7b1 f666530a4e08 fd5825d6b432 fd5825d6b432 fd5825d6b432 fd5825d6b432 fd5825d6b432
`;
/** M9 — every destructuring in the harness whose right-hand side or target is rooted in a builtin (2). */
const CENSUS_DESTRUCTURE_PIN = `
  8a5f788a88ef 8f73c6bc72ee
`;
/** M10 — every member access in the harness on a literal or constructed receiver (66). */
const CENSUS_RECEIVER_PIN = `
  03919f833ce5 055da5ca8505 05aacbd3d6bf 064be8dd0ff3 09b7a8362314 09b7a8362314 1215954722ae 148781071cd3 1530138a709c 214a185fe431
  22851b98a319 22ed4374ad91 24bcaefd0dba 25489f43e5df 291172ffba19 2dc11d682b68 31eff366193b 35ab061c4a7d 3a83798c6fb4 3f5c99009a2c
  4101b32f6923 4399517e5fc7 4ca5bf8e0a55 4d22080061ed 4d22080061ed 4d22080061ed 4d22080061ed 4e3ef4467fde 59e355bb646f 5effeda9627a
  5f9730fe9d1e 6499136bd134 64d16d8fec66 64d16d8fec66 682d9f5b21ea 6f20228bf428 7f0e44df998c 7f0e44df998c 7f0e44df998c 8180de79ac26
  868a986f6689 868a986f6689 87140baa81b2 9b3347b94959 9b756d19cec2 9c1195f3b196 9d1fb3d6a570 9e4a3759c79e 9e69329cfd8f b1292a86017e
  b325ed24b4fd b860cd41ac8b bbcecb1fb54d c0b6356b1396 d55864c20f3c d9f7644b498b dab85c101eb8 dc2d625ebd61 e06cdeca19bb e17729279a63
  e66e1565c795 e66e1565c795 f07946c36fe1 f4563d1791f1 f9cd7ae8a86f fa5359db9cc8
`;
/** H3d — every harness code line that reads the scenario id (or the out dir as a receiver or comparand, or the page's URL) (41). */
const SCENARIO_READS_PIN = `
  007256b529e3 066ce66b740d 08aa8b1a7709 08fd5478aab4 0ccf487ffa63 1606f049408f 16e32f0f6c00 187e660aaa04 1ed830244195 3036906e1f9d
  372dad712335 390d96202f62 3b7f2534bcf6 40bc61b095c8 40bc61b095c8 420735f1d42d 44f65007dbe0 47f3a85e4c6a 539029965b5d 56f9dbd1d022
  597a10e2a5a2 648221597d62 7328bcf51139 94ddc7b1299a 9619f067b5d3 a4643742d111 a6f74ada4f0e bb3f2216b8da bc5ca2aae17b c2f56f8bb8d3
  c6e9d8fc681e c6e9d8fc681e c954fe065af3 c954fe065af3 c9b8a4f4f2ba d4324d9a9780 d59a7ff22aca e140b6ce7d64 e676f54efde3 ec474b3dc0af
  f0c00c957720
`;
/** L14 — every lib literal carrying a product actor, action or verdict word, «sim», or a quoted Cyrillic title (83). */
const LIB_CLAIM_LITERALS_PIN = `
  036551469de9 06f729e0ddff 0c668d290428 14a45384dc21 15ec7d0ea698 17c10a86a281 17de592ceca6 198b97c1a29b 223d7a57311d 23dc351fd331
  23deb105ccec 24ef4cbe8e6a 281aee39f620 2bdac95d78bc 2de4d8014338 2fbf8e3f0d77 30f219446632 31fbab700060 3438d0a03e9e 3533032ba71e
  3533032ba71e 35812f0af13d 398ff2db538b 3a34acd5b16f 40803c63c176 446ae4838a34 4cfb6bf679ec 4f19b5dfded8 52a95b443d18 554033f2b48c
  5d1ef6d3e289 5ee3a0d712e1 5f6046e4a863 6ed7ede70ce5 7119ccb72cc6 7270e89961b0 76a6caae0d2d 775b538ac9ad 7dabcb8468f6 7dc2bc17cd42
  8003b44157d5 8003b44157d5 84a59d4c93ad 84a75da47c55 8605443568ca 87f1cac089ba 88bf0e10f01a 88f0f6837254 8ffe5228a775 91a0c2dff3c4
  9281f4b5c965 9281f4b5c965 94ebd86e9e2f 954d6285cce7 9bc26a0e29af a079724ba555 a09440465f07 a42290ce13d8 a765936bdec5 aa9b14fb2ff6
  ab39874ffd76 ad665c6e413e ade099b12bb6 ae02ab8a7fde b245dc0130ce b9ea5960685f bb95a0625c3c bc565f983152 c78716497bb2 c9a1e0c67eaf
  c9abbbc1793f ce9e2f40f987 cfa81d2254fc db1fb12113bb de152c506d4d de89f502dd32 df24fe364d2f e05be562c34d e12cbfee1fcd e4c6f69fd322
  ee0da3e5f027 ef77c9fcb4bc f447412f2c99
`;
/** L15 — every computed member access in the lib whose key is not a string or number literal (21). */
const LIB_CENSUS_COMPUTED_PIN = `
  0b5e4a298331 0cba230d5035 252b047e0065 3498fb0d3762 3498fb0d3762 5d7e7111a2c2 7b75c3967f93 8806b1ae3794 94a13c63b45b 94a13c63b45b
  aadcc4bf94e0 ad0992749090 bafc33897db1 bcd12c110421 bec5f8c629f3 e549523bb28c e549523bb28c e549523bb28c ef16032d0e25 ef16032d0e25
  f12237a4de6d
`;
/** L16 — every destructuring in the lib whose right-hand side or target is rooted in a builtin (1). */
const LIB_CENSUS_DESTRUCTURE_PIN = `
  fdfef3b2da24
`;
/** L17 — every member access in the lib on a literal or constructed receiver (8). */
const LIB_CENSUS_RECEIVER_PIN = `
  1905ffb7767f 611f1eeb9230 611f1eeb9230 a94e5328e116 b77c0cec60c8 b77c0cec60c8 b77c0cec60c8 f3d71bb1b8b1
`;
/* ═══ ROUND 10 PINS (end) ═══ */
