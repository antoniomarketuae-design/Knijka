/**
 * CAPTION TRUTH — a recorded demo's caption may only claim what the recording
 * does (test-only helper; `caption-truth.test.ts` runs it).
 *
 * WHY THIS EXISTS. Round 1 of «KEEP-RIGHT FOLLOWS THE LAW» (2026-10-01) wrote
 * «огледало, десен мигач, поглед през рамо — и плавно вдясно» over a
 * sc-ov-keep-right recording whose events at that moment are a right-mirror
 * glance and the right indicator — no shoulder look, and the product cannot
 * record one on that side at all: `glance-shoulder` is the LEFT shoulder by
 * definition (traces/types.ts, rules/types.ts `GlanceKind`). The verifier read
 * the events by hand. This makes the reading mechanical.
 *
 * WHAT IT IS, AND IS NOT. It binds the claims it can READ — the vocabulary
 * below — to the recording's events and samples, and it FAILS on anything in
 * that vocabulary it cannot resolve. It is not a proof that a caption is true:
 * a claim written in words outside the vocabulary walks past it. The verbatim
 * pin (keep-right-lessons-reviewed-text.test.ts) is what makes every caption
 * edit a red; this check says WHY a caption is wrong when it can.
 *
 * THE GRAMMAR — explicit, so a sentence the matcher cannot read is a RED, never
 * a silent pass (lesson «a matcher must report what it cannot read"):
 *
 *  1. A caption is split into sentences (a split only where a capital follows,
 *     so «чл. 25, ал. 1» stays whole) and each sentence into clauses (« — »,
 *     «: », «; », «, но », «, а », «, тоест »).
 *  2. In a clause, an action word is
 *       mirror     огледа / огледало… / огледан… / огледай  (side: the word right
 *                  before it — «дясното», «лявото»; «вътрешното»/«задното» or
 *                  «огледало за обратно виждане» → rear)
 *       indicator  мигач… / пътепоказател… / обявен… / сигнализ… /
 *                  «десен|ляв сигнал» / «сигнал надясно|наляво|вдясно|вляво» /
 *                  «пода… сигнал» / the verb «мига / примигва (надясно|наляво)»
 *                  — never «в мига», the moment  (side: «десен/десн…/дясн…», «ляв…/левия(т)»
 *                  right before it, or the side word inside the match;
 *                  «изключ…», «угас…», «загас…» in the clause make it an OFF claim)
 *       shoulder   рамо / рамото / рамене / рамената; «обръща… / обърн… /
 *                  завърт… глава»; «мъртва… зона» / «сляпо… петно» WITH a look
 *                  word in the clause («проверка на мъртвата зона», «проверява
 *                  сляпото петно») — without one it is unresolved
 *       look-back  «поглед… / поглежда… / погледн… назад» — the rear mirror or
 *                  the shoulder
 *       brake      спир… / спирачк…; a stop verb спря… / спре… / спри… /
 *                  закова… («заковава на място») also needs a sample at standstill
 *       slow       намаля… / намали… / забав… — a brake sample or a real drop
 *                  in speed (≥ 3 km/h) inside the scope
 *       lane       «в|във|от|по лявата|дясната (лента)» — the car's own lane,
 *                  read off the samples' x against the map's lane centres;
 *                  «е / остава / стои (вече|още|пак) вдясно|вляво» — the same,
 *                  said with the adverb; «се прибра / прибира се / се прибере»
 *                  — the car reaches the RIGHT lane; and «на (самата) линия» —
 *                  between the two.
 *     (Round 4, R3-5: «сляпото петно», «мига надясно», «заковава на място»,
 *     «е вдясно» and «се прибра» were five false captions the round-3 verifier
 *     walked past this vocabulary. They are in it now; the next five are not —
 *     see WHAT IT IS, AND IS NOT above.)
 *     «за спиране» is the NAME of the officer's order («сигнал / разпореждане
 *     за спиране»), never the driver's act, so it is not a brake claim. Any
 *     OTHER «сигнал» — one the grammar does not read as the driver's indicator —
 *     is the officer's signal in these lessons, and any look word («поглед…»,
 *     «поглежда…», «оглежда…») the grammar does not consume is a look it cannot
 *     bind to an event. Neither is checked against the recording, and neither
 *     is skipped silently: every such word is REPORTED (`otherSignals`,
 *     `otherLooks`) and the test pins how many each recording has.
 *  3. Polarity: an action word AFTER «без» or «нито» in its clause is DENIED
 *     (the event must be absent from the scope); before them, AFFIRMED (the
 *     event must be present). «Без да <глагол>, …» is an adverbial: it denies
 *     only up to its comma («Без да бърза, водачът дава десен мигач» AFFIRMS
 *     the indicator). A clause holding a verb negator — «не», «няма», «никой»,
 *     «никога» — and an action word is UNRESOLVED and fails: the matcher cannot
 *     tell «мигачът не светна» from «никой не очаква спиране».
 *  4. Shoulder side: an affirmed shoulder in a sentence that names only the
 *     RIGHT side (вдясно / надясно / десн… / дясн…) can never be true of a
 *     recording and fails; one that names both sides is UNRESOLVED.
 *  5. RULE OR DESCRIPTION — decided per CLAUSE, and only inside a sentence that
 *     carries a law citation «(чл. …)» / «(ал. …)». Round 2 exempted the whole
 *     cited sentence, and the verifier planted «…(чл. 15, ал. 2, т. 2), а
 *     водачът пак поглежда през рамо и дава ляв мигач — …» inside one: a false
 *     description riding a citation. So a clause of a cited sentence states THE
 *     RULE (its action words are counted, not judged) only when
 *       · it carries a MODAL («длъжен/длъжни», «трябва», «иска», «изисква»,
 *         «задължен/задължителен», «забранен») and no indicative action verb
 *         of the recording's driver; or
 *       · it carries a GENERIC marker («преди всяко/маневрата/него/нея»,
 *         «се подава», «се обявява», «се убеждаваш», «чак тогава», «винаги»,
 *         «своевременен») and names no actor and no such verb; or
 *       · it has no marker, no actor and no such verb, and is joined by « — »
 *         or «: » to a neighbouring clause that IS the rule (the appositive
 *         list «— огледало, мигач, плавно»).
 *     A clause that names the recording's ACTOR («водачът», «колата»,
 *     «кракът», «воланът», «погледът»…) or uses an indicative action verb
 *     («поглежда», «дава», «светва», «спря»…) with no modal is a DESCRIPTION
 *     and is judged like any other. A modal together with such a verb, or a
 *     clause that is none of the above, is UNRESOLVED and fails.
 *  6. Scope — the frames the claim is about, read through the product's own
 *     caption clock (`activeAnnotationIndex`: a caption shows from its tSec for
 *     4 s or until the next one):
 *       «Грешка:» / «Грешката:» opener → the WHOLE recording (the demo's preview);
 *       «Готово» opener                → from 0 to the end of its display (a recap
 *                                         of the manoeuvre) — but a brake / stop /
 *                                         slow claim is about NOW even in a recap;
 *       anything else                   → from the PREVIOUS caption, and never more
 *                                         than LOOKBACK_SEC before its own time, to
 *                                         the end of its own display.
 *     A lane claim governed by «да …» («Задачата е да се прибереш в дясната»)
 *     states the GOAL: the recording must reach that lane at some point.
 */
import { activeAnnotationIndex } from "../../../traces/sample";
import type { TraceEvent } from "../../../traces/types";

export interface CaptionTrace {
  samples: readonly { tSec: number; brakeOn: boolean; speedKmh: number; x?: number }[];
  events: readonly TraceEvent[];
}
/** Lane centres (x, metres) of the travelled bank of a straight northbound street. */
export interface LaneModel {
  leftX: number;
  rightX: number;
}

/** A caption may describe what happened this long before it — not earlier. */
export const LOOKBACK_SEC = 10;
const LANE_TOL_M = 1.2;
const LINE_TOL_M = 0.8;
const SLOW_DROP_KMH = 3;

export type CaptionAction = "mirror" | "indicator" | "shoulder" | "look-back" | "brake" | "slow" | "lane";
export interface CaptionClaim {
  tSec: number;
  sentence: string;
  clause: string;
  word: string;
  action: CaptionAction;
  polarity: "affirm" | "deny" | "unresolved";
  side?: "left" | "right" | "rear" | "line";
  off?: boolean;
  stop?: boolean;
  goal?: boolean;
  ok: boolean;
  why: string;
}
export interface CaptionReport {
  claims: CaptionClaim[];
  /** Sentences that carry a citation (each may hold rule AND description clauses). */
  ruleSentences: string[];
  /** Action words read as THE RULE (rule 5) — counted, never judged. */
  ruleClaims: { tSec: number; clause: string; word: string; action: CaptionAction; because: string }[];
  /** Every «сигнал…» word in a DESCRIPTION that was not read as the driver's
   *  indicator — the officer's signal, by the grammar's rule 2. */
  otherSignals: { tSec: number; sentence: string; word: string }[];
  /** Every look word the grammar did not bind to an event. */
  otherLooks: { tSec: number; sentence: string; word: string }[];
  failures: string[];
}

const L = "\\p{L}";
const NL = `(?<!${L})`;
const sentencesOf = (text: string): string[] => text.split(/(?<=[.!?…»"])\s+(?=[А-ЯЁA-Z„«])/u);
const CLAUSE_SPLIT = /(\s+—\s+|:\s+|;\s+|,\s+(?=(?:но|а|тоест)\s))/u;
/** Clauses with the separator that precedes each («» for the first). */
function clausesOf(sentence: string): { text: string; sep: string }[] {
  const parts = sentence.split(CLAUSE_SPLIT);
  const out: { text: string; sep: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const text = parts[i];
    const sep = i === 0 ? "" : parts[i - 1];
    if (text.trim().length > 0) out.push({ text, sep });
  }
  return out;
}
const CITATION = /\((?:ЗДвП |ППЗДвП )?(?:чл|ал)\. ?\d/u;
const RIGHT_WORDS = new RegExp(`${NL}(?:вдясно|надясно|десен|десн${L}*|дясн${L}*)(?!${L})`, "iu");
const LEFT_WORDS = new RegExp(`${NL}(?:вляво|наляво|ляв${L}*|лев(?:ия|ият|ите)?)(?!${L})`, "iu");
const VERB_NEGATOR = new RegExp(`${NL}(?:не|няма|никой|никога)(?!${L})`, "iu");
const PREP_NEGATOR = new RegExp(`${NL}(?:без|нито)(?!${L})`, "giu");
const LOOK_WORD = new RegExp(`${NL}(?:поглед${L}*|поглежд${L}*|погледн${L}*|оглежд${L}*)`, "giu");
/** A look word, or a word of checking — what makes «мъртвата зона» a claim of looking. */
const CHECK_WORD = new RegExp(`${NL}(?:поглед${L}*|поглежд${L}*|погледн${L}*|оглежд${L}*|проверк${L}*|провер${L}*)`, "iu");

// rule 5 — the markers
const MODAL = new RegExp(`${NL}(?:длъжен|длъжн${L}*|трябва|задължен${L}*|задължител${L}*|иска|изисква|забранен${L}*|забранява)(?!${L})`, "iu");
const GENERIC = new RegExp(
  `${NL}преди\\s+(?:всяк${L}*|маневр${L}*|него|нея)(?!${L})|${NL}се\\s+(?:подава|обявява|убеждаваш|убеждава)(?!${L})|${NL}чак\\s+тогава(?!${L})|${NL}винаги(?!${L})|${NL}своевремен${L}*`,
  "iu",
);
const ACTOR = new RegExp(`${NL}(?:водач${L}*|шофьор${L}*|колата|кракът|воланът|погледът|ръката)(?!${L})`, "iu");
/** Indicative action verbs of the recording's driver. A verb right after «да»
 *  or «се» is a subjunctive / an impersonal passive and is not one. */
const DESCRIPTIVE_VERB = new RegExp(
  `${NL}(?:светва|светна|свети|светят|поглежда|погледна|дава|даде|подава|подаде|включва|включи|изключва|изключи|тръгва|тръгна|натиска|натисна|намалява|намали|обръща|обърна|прибира|прибра|излиза|излезе|остава|остана|спира|спря|спряхме|забива|заби|завърта|завъртя|проверява|провери|мига|примигва|заковава|закова)(?!${L})`,
  "giu",
);
function hasDescriptiveVerb(clause: string): boolean {
  for (const m of clause.matchAll(DESCRIPTIVE_VERB)) {
    const before = clause.slice(0, m.index ?? 0);
    if (/(?<!\p{L})(?:да|се)\s+$/iu.test(before)) continue;
    return true;
  }
  return false;
}
type ClauseKind = { kind: "rule"; because: string } | { kind: "description" } | { kind: "unresolved"; because: string };
/** Rule 5, for the clauses of ONE cited sentence. */
function classifyClauses(clauses: { text: string; sep: string }[]): ClauseKind[] {
  const first: (ClauseKind | null)[] = clauses.map(({ text }) => {
    const modal = MODAL.test(text);
    const descr = hasDescriptiveVerb(text);
    const actor = ACTOR.test(text);
    const generic = GENERIC.test(text);
    if (modal && descr) return { kind: "unresolved", because: "a modal AND an indicative action verb share the clause — rule or description is unreadable" };
    if (modal) return { kind: "rule", because: "modal" };
    if (descr || actor) return generic ? { kind: "unresolved", because: "a generic rule marker AND the recording's actor/verb share the clause" } : { kind: "description" };
    if (generic) return { kind: "rule", because: "generic marker" };
    return null; // no marker at all — may be an appositive of a neighbouring rule clause
  });
  return first.map((k, i) => {
    if (k !== null) return k;
    const appositive = (sep: string) => /—|:/u.test(sep);
    const prev = i > 0 ? first[i - 1] : null;
    const next = i + 1 < first.length ? first[i + 1] : null;
    if (prev?.kind === "rule" && appositive(clauses[i].sep)) return { kind: "rule", because: "appositive of the rule clause before it" };
    if (next?.kind === "rule" && appositive(clauses[i + 1].sep)) return { kind: "rule", because: "appositive of the rule clause after it" };
    return { kind: "unresolved", because: "a cited sentence's clause with no rule marker, no actor and no rule neighbour" };
  });
}

interface Lexeme {
  action: CaptionAction;
  re: RegExp;
}
/** Any «сигнал…» word that is not «сигнализ…» (which the indicator lexeme reads). */
const SIGNAL_WORD = new RegExp(`${NL}сигнал(?!из)${L}*`, "giu");
/** The side a claim's own words name («десен сигнал», «сигнал надясно»). */
function sideInside(word: string): "left" | "right" | undefined {
  if (new RegExp(`${NL}(?:десен|десн${L}*|дясн${L}*|надясно|вдясно)(?!${L})`, "iu").test(word)) return "right";
  if (new RegExp(`${NL}(?:ляв${L}*|лев(?:ия|ият|ите)?|наляво|вляво)(?!${L})`, "iu").test(word)) return "left";
  return undefined;
}

const INDICATOR_RE = new RegExp(
  `${NL}(?:мигач${L}*|пътепоказател${L}*|обявен${L}*|сигнализ${L}*|(?:десен|ляв)\\s+сигнал${L}*|сигнал${L}*\\s+(?:надясно|наляво|вдясно|вляво)(?!${L})|пода${L}*\\s+сигнал${L}*(?!${L})(?!\\s+за\\s)(?:\\s+(?:надясно|наляво|вдясно|вляво)(?!${L}))?|(?<!${NL}в\\s)(?:при|пре)?миг(?:а|ат|аше|ва|ват|на|наха)(?!${L})(?:\\s+(?:надясно|наляво|вдясно|вляво)(?!${L}))?)`,
  "giu",
);
const LEXEMES: Lexeme[] = [
  { action: "mirror", re: new RegExp(`${NL}огледа(?:л${L}*|н${L}*|й(?:те)?)?(?!${L})`, "giu") },
  { action: "indicator", re: INDICATOR_RE },
  {
    action: "shoulder",
    re: new RegExp(
      `${NL}рам(?:о|ото|ене|ената)(?!${L})|${NL}(?:обръща${L}*|обърн${L}*|завърт${L}*)\\s+глава${L}*|${NL}мъртв${L}*\\s+зон${L}*|${NL}сляп${L}*\\s+петн${L}*`,
      "giu",
    ),
  },
  { action: "look-back", re: new RegExp(`${NL}(?:поглед${L}*|поглежда${L}*|погледн${L}*)\\s+назад(?!${L})`, "giu") },
  { action: "brake", re: new RegExp(`${NL}(?:спир${L}*|спр[яеи]${L}*|закова${L}*)`, "giu") },
  { action: "slow", re: new RegExp(`${NL}(?:намаля${L}*|намали${L}*|забав${L}*)`, "giu") },
  {
    action: "lane",
    re: new RegExp(
      `${NL}(?:в|във|от|по)\\s+(?:лявата|дясната)(?!${L})(?:\\s+лента)?|${NL}на\\s+(?:самата\\s+)?(?:разделителната\\s+)?линия(?:та)?(?!${L})` +
        // «е / остава / стои (вече) вдясно», and the adverb first: «вече е вдясно»
        `|${NL}(?:е|са|беше|остава|остана|стои)\\s+(?:(?:вече|още|пак)\\s+)?(?:вдясно|вляво)(?!${L})` +
        // «се прибра» / «прибира се» / «(да) се прибереш» — into the right lane
        `|${NL}се\\s+приб(?:ра|раха|рахме|ира|ират|ираме|ере|ерем|ереш|ерат)(?!${L})|${NL}приб(?:ра|раха|рахме|ира|ират|ираме|ере|ерем|ереш|ерат)\\s+се(?!${L})`,
      "giu",
    ),
  },
];

interface Scope {
  label: string;
  inScope: (t: number) => boolean;
}
/** The three windows a caption's claims may be read in (rule 6). */
function scopesOf(annotations: readonly TraceEvent[], i: number): { main: Scope; now: Scope; whole: Scope } {
  const a = annotations[i];
  const text = (a.textBg ?? "").trimStart();
  const displayed = (t: number) => activeAnnotationIndex(annotations, t) === i;
  const whole: Scope = { label: "whole recording", inScope: () => true };
  const lookFrom = Math.max(i > 0 ? annotations[i - 1].tSec : 0, a.tSec - LOOKBACK_SEC);
  const capped: Scope = {
    label: `${lookFrom.toFixed(2)} → end of display`,
    inScope: (t) => (t >= lookFrom - 1e-9 && t <= a.tSec + 0.05) || displayed(t),
  };
  if (/^Грешка(?:та)?:/u.test(text)) return { main: { ...whole, label: "whole recording (preview)" }, now: whole, whole };
  if (/^Готово/u.test(text)) {
    const nowFrom = Math.max(0, a.tSec - LOOKBACK_SEC);
    return {
      main: { label: "0 → end of display (recap)", inScope: (t) => t <= a.tSec + 0.05 || displayed(t) },
      now: {
        label: `${nowFrom.toFixed(2)} → end of display (a recap's brake/stop is about now)`,
        inScope: (t) => (t >= nowFrom - 1e-9 && t <= a.tSec + 0.05) || displayed(t),
      },
      whole,
    };
  }
  return { main: capped, now: capped, whole };
}

function sideBefore(clause: string, at: number, action: CaptionAction): "left" | "right" | "rear" | undefined {
  const before = clause.slice(0, at).trimEnd();
  const lastWord = before.split(/\s+/u).pop() ?? "";
  if (new RegExp(`^(?:десен|десн${L}*|дясн${L}*)$`, "iu").test(lastWord)) return "right";
  if (new RegExp(`^(?:ляв${L}*|лев(?:ия|ият|ите)?)$`, "iu").test(lastWord)) return "left";
  if (action === "mirror") {
    if (new RegExp(`^(?:вътрешн|задн)${L}*$`, "iu").test(lastWord)) return "rear";
    if (/^\S*\s+за обратно виждане/u.test(clause.slice(at))) return "rear";
  }
  return undefined;
}

/** Where «без/нито» deny: [from, to) spans of the clause. «Без да <глагол>,»
 *  denies only up to its comma; a plain «без …» / «нито …» to the clause's end. */
function denialSpans(clause: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const m of clause.matchAll(PREP_NEGATOR)) {
    const at = m.index ?? 0;
    const rest = clause.slice(at + m[0].length);
    if (/^\s+да\s/iu.test(rest)) {
      const comma = rest.indexOf(",");
      spans.push([at, comma < 0 ? clause.length : at + m[0].length + comma]);
    } else {
      spans.push([at, clause.length]);
    }
  }
  return spans;
}

interface Windows {
  events: (s: Scope) => readonly TraceEvent[];
  samples: (s: Scope) => CaptionTrace["samples"];
}

function readCaption(
  text: string,
  tSec: number,
  scopes: { main: Scope; now: Scope; whole: Scope },
  win: Windows,
  lanes: LaneModel | undefined,
  out: Pick<CaptionReport, "claims" | "ruleSentences" | "ruleClaims" | "otherSignals" | "otherLooks">,
): void {
  for (const sentence of sentencesOf(text)) {
    const cited = CITATION.test(sentence);
    if (cited) out.ruleSentences.push(sentence);
    const sentenceRight = RIGHT_WORDS.test(sentence);
    const sentenceLeft = LEFT_WORDS.test(sentence);
    const clauses = clausesOf(sentence);
    const kinds = cited ? classifyClauses(clauses) : clauses.map((): ClauseKind => ({ kind: "description" }));
    clauses.forEach(({ text: clause }, ci) => {
      const kind = kinds[ci];
      const denied = denialSpans(clause);
      const verbNegated = VERB_NEGATOR.test(clause);
      const consumed: [number, number][] = [];
      const found: { lx: Lexeme; at: number; word: string }[] = [];
      for (const lx of LEXEMES) {
        for (const m of clause.matchAll(lx.re)) {
          const at = m.index ?? 0;
          const word = m[0];
          if (lx.action === "brake" && /^спиране$/iu.test(word) && /(?<!\p{L})за\s+$/iu.test(clause.slice(0, at))) {
            continue; // «сигнал / разпореждане за спиране» — the officer's order, not the driver's act
          }
          found.push({ lx, at, word });
          consumed.push([at, at + word.length]);
        }
      }
      // «се прибира от лявата в дясната» is ONE lane claim, said by the lane
      // phrase: the verb is a claim of its own only when no lane is named.
      const namesLane = found.some((f) => f.lx.action === "lane" && /лявата|дясната/iu.test(f.word));
      if (namesLane) {
        for (let k = found.length - 1; k >= 0; k--) {
          if (found[k].lx.action === "lane" && /приб/iu.test(found[k].word)) found.splice(k, 1);
        }
      }
      const isConsumed = (at: number) => consumed.some(([from, to]) => at >= from && at < to);
      // A «сигнал» / a look word the grammar did not bind is reported, not judged.
      if (kind.kind !== "rule") {
        for (const s of clause.matchAll(SIGNAL_WORD)) {
          if (!isConsumed(s.index ?? 0)) out.otherSignals.push({ tSec, sentence, word: s[0] });
        }
        // A look word in a clause that holds a mirror / shoulder / look-back claim
        // belongs to that claim; elsewhere it is a look the grammar cannot bind.
        const lookBound = found.some((f) => f.lx.action === "mirror" || f.lx.action === "shoulder" || f.lx.action === "look-back");
        if (!lookBound) {
          for (const s of clause.matchAll(LOOK_WORD)) {
            if (!isConsumed(s.index ?? 0)) out.otherLooks.push({ tSec, sentence, word: s[0] });
          }
        }
      }
      for (const { lx, at, word } of found) {
        if (kind.kind === "rule") {
          out.ruleClaims.push({ tSec, clause, word, action: lx.action, because: kind.because });
          continue;
        }
        const polarity: CaptionClaim["polarity"] =
          kind.kind === "unresolved" || verbNegated ? "unresolved" : denied.some(([from, to]) => at > from && at < to) ? "deny" : "affirm";
        const claim: CaptionClaim = { tSec, sentence, clause, word, action: lx.action, polarity, ok: false, why: "" };
        if (kind.kind === "unresolved") {
          claim.why = kind.because;
          out.claims.push(claim);
          continue;
        }
        if (lx.action === "mirror" || lx.action === "indicator") {
          const side = sideBefore(clause, at, lx.action) ?? (lx.action === "indicator" ? sideInside(word) : undefined);
          if (side) claim.side = side;
        }
        if (lx.action === "indicator" && new RegExp(`${NL}(?:изключ|угас|загас)${L}*`, "iu").test(clause)) claim.off = true;
        if (lx.action === "brake" && new RegExp(`^(?:спр[яеи]|закова)`, "iu").test(word)) claim.stop = true;
        if (lx.action === "lane") {
          claim.side = /линия/iu.test(word) ? "line" : /ляв/iu.test(word) ? "left" : "right";
          // «да се прибереш в дясната» — the goal, not the present position.
          if (/(?<!\p{L})да\s/iu.test(clause.slice(0, at))) claim.goal = true;
        }
        const scope =
          claim.goal === true ? scopes.whole : lx.action === "brake" || lx.action === "slow" ? scopes.now : scopes.main;
        judge(claim, win.events(scope), win.samples(scope), scope.label, sentenceRight, sentenceLeft, clause, lanes);
        out.claims.push(claim);
      }
    });
  }
}

function report(parts: Pick<CaptionReport, "claims" | "ruleSentences" | "ruleClaims" | "otherSignals" | "otherLooks">): CaptionReport {
  const failures = parts.claims
    .filter((c) => !c.ok)
    .map((c) => `@${c.tSec.toFixed(2)} «${c.word}» (${c.action}, ${c.polarity}) in «${c.sentence}»: ${c.why}`);
  return { ...parts, failures };
}

/** Read every caption of `trace` and judge each action claim against its events. */
export function checkCaptionTruth(trace: CaptionTrace, lanes?: LaneModel): CaptionReport {
  const annotations = trace.events.filter((e) => e.kind === "annotation" && e.textBg);
  const parts = { claims: [], ruleSentences: [], ruleClaims: [], otherSignals: [], otherLooks: [] } as Pick<
    CaptionReport,
    "claims" | "ruleSentences" | "ruleClaims" | "otherSignals" | "otherLooks"
  >;
  const win: Windows = {
    events: (s) => trace.events.filter((e) => e.kind !== "annotation" && s.inScope(e.tSec)),
    samples: (s) => trace.samples.filter((x) => s.inScope(x.tSec)),
  };
  annotations.forEach((a, i) => readCaption(a.textBg ?? "", a.tSec, scopesOf(annotations, i), win, lanes, parts));
  return report(parts);
}

/**
 * Judge ONE text against a window of a recording — a theory beat's
 * `visual.captionBg` over the `fromSec … toSec` cut it plays.
 */
export function checkCaptionWindow(
  trace: CaptionTrace,
  text: string,
  window: { fromSec: number; toSec: number },
  lanes?: LaneModel,
): CaptionReport {
  const scope: Scope = {
    label: `${window.fromSec.toFixed(2)} → ${window.toSec.toFixed(2)} (the cut the beat plays)`,
    inScope: (t) => t >= window.fromSec - 1e-9 && t <= window.toSec + 1e-9,
  };
  const parts = { claims: [], ruleSentences: [], ruleClaims: [], otherSignals: [], otherLooks: [] } as Pick<
    CaptionReport,
    "claims" | "ruleSentences" | "ruleClaims" | "otherSignals" | "otherLooks"
  >;
  const win: Windows = {
    events: (s) => trace.events.filter((e) => e.kind !== "annotation" && s.inScope(e.tSec)),
    samples: (s) => trace.samples.filter((x) => s.inScope(x.tSec)),
  };
  readCaption(text, window.fromSec, { main: scope, now: scope, whole: scope }, win, lanes, parts);
  return report(parts);
}

function judge(
  c: CaptionClaim,
  events: readonly TraceEvent[],
  samples: CaptionTrace["samples"],
  scope: string,
  sentenceRight: boolean,
  sentenceLeft: boolean,
  clause: string,
  lanes: LaneModel | undefined,
): void {
  if (c.polarity === "unresolved") {
    c.why = "a verb negator («не/няма/никой/никога») shares the clause — polarity unreadable; rephrase with «без …» or split the clause";
    return;
  }
  let present: boolean;
  let what: string;
  switch (c.action) {
    case "mirror": {
      const kinds = c.side ? [`glance-${c.side}`] : ["glance-left", "glance-right", "glance-rear"];
      present = events.some((e) => kinds.includes(e.kind));
      what = kinds.join("|");
      break;
    }
    case "indicator": {
      if (c.off) {
        present = events.some((e) => e.kind === "signal-off");
        what = "signal-off";
        if (c.polarity === "deny") {
          c.why = "a denied OFF claim is not in the grammar";
          return;
        }
      } else {
        present = events.some((e) => e.kind === "signal-on" && (!c.side || e.detail === c.side));
        what = `signal-on${c.side ? ` ${c.side}` : ""}`;
      }
      break;
    }
    case "shoulder": {
      if (/мъртв|сляп/iu.test(c.word) && !CHECK_WORD.test(clause)) {
        c.polarity = "unresolved";
        c.why = "«мъртва зона» / «сляпо петно» with no look word in the clause — a check of it, or just the place? unreadable";
        return;
      }
      if (c.polarity === "affirm" && sentenceRight && sentenceLeft) {
        c.why = "the sentence names both sides — which shoulder is unreadable";
        return;
      }
      if (c.polarity === "affirm" && sentenceRight) {
        c.why = "a RIGHT-shoulder look: the product's only shoulder look is the LEFT one (glance-shoulder), so no recording can make this true";
        return;
      }
      present = events.some((e) => e.kind === "glance-shoulder");
      what = "glance-shoulder";
      break;
    }
    case "look-back": {
      present = events.some((e) => e.kind === "glance-rear" || e.kind === "glance-shoulder");
      what = "glance-rear|glance-shoulder";
      break;
    }
    case "brake": {
      present = samples.some((s) => s.brakeOn) && (!c.stop || samples.some((s) => Math.abs(s.speedKmh) < 0.5));
      what = c.stop ? "brakeOn + standstill" : "brakeOn";
      break;
    }
    case "slow": {
      let peak = -Infinity;
      let dropped = false;
      for (const s of samples) {
        if (s.speedKmh > peak) peak = s.speedKmh;
        if (peak - s.speedKmh >= SLOW_DROP_KMH) dropped = true;
      }
      present = dropped || samples.some((s) => s.brakeOn);
      what = `brakeOn or a ${SLOW_DROP_KMH} km/h drop in speed`;
      break;
    }
    case "lane": {
      if (!lanes) {
        c.polarity = "unresolved";
        c.why = "a lane-position claim, and no lane model was given for this recording's map";
        return;
      }
      if (samples.some((s) => s.x === undefined)) {
        c.polarity = "unresolved";
        c.why = "a lane-position claim over samples that carry no x";
        return;
      }
      const centre = c.side === "left" ? lanes.leftX : c.side === "right" ? lanes.rightX : (lanes.leftX + lanes.rightX) / 2;
      const tol = c.side === "line" ? LINE_TOL_M : LANE_TOL_M;
      present = samples.some((s) => Math.abs((s.x as number) - centre) <= tol);
      what = c.side === "line" ? `the car on the line between the lanes (x ≈ ${centre.toFixed(2)})` : `the car in the ${c.side} lane (x ≈ ${centre.toFixed(2)})`;
      break;
    }
  }
  if (c.polarity === "affirm") {
    c.ok = present;
    c.why = present ? `${what} found in scope ${scope}` : `no ${what} in scope ${scope}`;
  } else {
    c.ok = !present;
    c.why = present ? `denied, but ${what} IS in scope ${scope}` : `${what} absent from scope ${scope}`;
  }
}
