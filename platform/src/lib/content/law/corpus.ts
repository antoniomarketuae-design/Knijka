/**
 * Law corpus loader + retrieval (server-only).
 *
 * Reads content/law at first use, validates every file against law/schemas.ts,
 * then VERIFIES that each penalty citation's quote really occurs in the act
 * text it points at. A citation that has drifted from the law fails the load —
 * that is the whole guarantee: if a figure is in the bank, its words are in the
 * stored statute.
 *
 * ADR-002: nothing in this file may produce a legal figure or an article number
 * that is not read out of content/law.
 */
import fs from "node:fs";
import path from "node:path";
import { bgnWithEurBg } from "../money";
import { LawActSchema, LawSourceRegisterSchema, PenaltyBankSchema } from "./schemas";
import type {
  FigureStatus,
  FineInstrument,
  LawAct,
  LawLookup,
  LawSource,
  LawSourceRegister,
  LawUnit,
  PenaltyBank,
  PenaltyCitation,
  PenaltyConduct,
  PenaltyEntry,
} from "./types";
import type { LawRef } from "../types";
// Pure (no fs, no corpus import), so this is a leaf dependency and not a cycle.
import { inlineCitations } from "../proseFigures";

if (typeof window !== "undefined") {
  throw new Error(
    "lib/content/law/corpus is server-only — import it from server code, never from client components",
  );
}

/** Acts we ship full text for. Adding one means adding its JSON + a source row. */
export const ACT_IDS = [
  "zdvp",
  "naredba-iz-2539",
  "naredba-38",
  // The camera-tolerance chain. ЗДвП чл. 165, ал. 3 delegates to the first;
  // the first (чл. 16, ал. 5) delegates the SIZE of the tolerance to the
  // second (чл. 425). Neither number exists in the ЗДвП, which is exactly why
  // „3 km/h" circulates as folk knowledge — it is real, it is normative, and it
  // is two documents away from the statute a student is taught to look in.
  "naredba-8121z-532",
  "naredba-sredstva-za-izmervane",
  // Наредба № Iз-2539 as consolidated through ДВ, бр. 49 от 2026 г. — THE TEXT
  // IN FORCE, and what a bare „Наредба № Iз-2539" resolves to. It was added
  // alongside the 2025 snapshot rather than replacing it because the snapshot
  // held the quotes at the time; it no longer does (measured: all 7 наредба
  // citations in `penalties.json` name this file, and so does every quote in
  // `modules/sim/rules/consequences.ts`). The snapshot stays for the one job
  // in SUPERSEDED_PAIRS below: letting a superseded figure be quoted and NAMED.
  "naredba-iz-2539-consolidated-dv49-2026",
] as const;
export type ActId = (typeof ACT_IDS)[number];

/**
 * A SUPERSEDED TEXT AND THE TEXT THAT REPLACED IT — declared HERE, above the
 * alias table, because the alias table is the first thing that has to obey it.
 *
 * The corpus keeps Наредба № Iз-2539 twice on purpose. The 2025 photograph is
 * not a spare copy: it is the only place a superseded figure can be QUOTED, and
 * a question that teaches „if you meet the number 8, it has been replaced by
 * 10" needs to be able to point at the text that said 8. That is legitimate and
 * it is why the file stays.
 *
 * What is NOT legitimate is reaching it by accident. A snapshot is reachable
 * only from a citation that NAMES the edition; a bare act name always means the
 * text in force. `SNAPSHOT_ACT_IDS` is what a test asserts that against, and it
 * is derived from this one list so a second pair cannot be added without
 * inheriting the rule.
 */
const SUPERSEDED_PAIRS: ReadonlyArray<readonly [ActId, ActId]> = [
  ["naredba-iz-2539", "naredba-iz-2539-consolidated-dv49-2026"],
];

/** Acts kept only so a superseded figure can be named. Never a bare name's target. */
export const SNAPSHOT_ACT_IDS: readonly ActId[] = SUPERSEDED_PAIRS.map(([snapshot]) => snapshot);

/** True for an act whose text has been replaced by another act in the corpus. */
export function isSupersededSnapshot(actId: string): boolean {
  return SUPERSEDED_PAIRS.some(([snapshot]) => snapshot === actId);
}

/**
 * How a `LawRef.act` string (as already written across content/) maps onto an
 * actId. Anything not listed resolves to "act-not-in-corpus" — a MISS, never a
 * guess at which act was meant.
 */
const ACT_ALIASES: ReadonlyArray<readonly [RegExp, ActId]> = [
  [/^здвп$/i, "zdvp"],
  [/^закон\s+за\s+движението\s+по\s+пътищата$/i, "zdvp"],
  // ORDER IS LOAD-BEARING FROM HERE DOWN. We hold Наредба № Iз-2539 TWICE — a
  // 28.01.2025 snapshot and a text consolidated through ДВ, бр. 49 от 2026 г. —
  // and they disagree on figures a student is shown: чл. 6, ал. 1, т. 1, б. „а"
  // is 8 контролни точки in one and 10 in the other, and чл. 2, ал. 6 is the
  // restoration ceiling in one and the three deduction bases in the other.
  //
  // A BARE NAME USED TO MEAN THE SNAPSHOT, AND THAT WAS THE DEFECT. The reason
  // given was that no existing citation should silently move — but the citation
  // that does not say which edition it means is not asking for the old one, it
  // is not asking at all, and answering it with a text that has been amended
  // twice since is the product proving a point against a copy of the law that
  // no longer exists. Worse, that copy WAS DAMAGED: its чл. 6, т. 3 was a
  // sentence cut in half by „Източник: Правно-информационни системи „Сиела" /
  // 24/01/2025 г.", a PDF page footer the extraction swallowed, and the footer
  // sat inside 16 of its units. „0 контролни точки, не е в изчерпателния
  // списък" is a true finding under the consolidation — but a student who
  // followed the chip to check us landed on a truncated article with a vendor
  // watermark in it.
  //
  // The footer is gone (2026-08-09, `content/law/tools/page-furniture.mjs`;
  // `pageFurniture.test.ts` now forbids the class outright) and т. 3 is whole
  // again. THE ORDER BELOW DOES NOT CHANGE. The snapshot is still a photograph
  // of a text amended twice since, which is the reason a bare name must not
  // land on it; „the copy was also broken" was the aggravation, not the rule.
  //
  // So: the CONSOLIDATION pattern first (an explicit 2026 marker wins), then
  // the SNAPSHOT but only when the citation says 2025 out loud, then the bare
  // name — which means the law in force, like every other act in this table.
  //
  // The class [iіи] is not paranoia: these rows already carried Latin „i" and
  // Ukrainian „і" because both are typed for the Roman numeral in „Iз-2539".
  // Cyrillic „и" is the third way, and `\b` is ASCII-only in JS so it cannot be
  // used to anchor any of them — the old `\bіз` row could never fire at all,
  // because neither the space before it nor the Cyrillic letter is an ASCII
  // word character, so there was no boundary between them.
  [/наредба.*[iіи]з[\s-]*2539.*(бр\.?\s*49|2026|консолидиран)/i, "naredba-iz-2539-consolidated-dv49-2026"],
  [/наредба.*[iіи]з[\s-]*2539.*(28\.01\.2025|бр\.?\s*108|снимка|ред(?:акция)?\.?\s*(?:към\s*)?2025)/i, "naredba-iz-2539"],
  [/наредба.*[iіи]з[\s-]*2539/i, "naredba-iz-2539-consolidated-dv49-2026"],
  [/^наредба\s*(№\s*)?38\b/i, "naredba-38"],
  [/^наредба\s*(№\s*)?38\s*\/\s*2004/i, "naredba-38"],
  // The camera-tolerance chain, cited by the questions that explain why a
  // camera deducts anything at all from the speed it measured.
  [/наредба.*8121\s*з?[\s-]*532/i, "naredba-8121z-532"],
  [/наредба\s+за\s+средствата\s+за\s+измерване/i, "naredba-sredstva-za-izmervane"],
  [/^нсипмк$/i, "naredba-sredstva-za-izmervane"],
];

export function actIdForActName(actName: string): ActId | null {
  const trimmed = actName.trim();
  for (const [re, id] of ACT_ALIASES) if (re.test(trimmed)) return id;
  return null;
}

/**
 * „приложение № 5" and every spelling of it a citation actually uses,
 * INCLUDING the abbreviated „прил. № 5" / „прил.5". Exported so a scanner can
 * split a compound clause on the same marker `normaliseUnitRef` parses — two
 * regexes that are supposed to agree drift, and the one that drifted is how
 * the abbreviation went unseen (`modules/sim/__tests__/law-citations.test.ts`
 * carried its own private copy). Declared ABOVE its caller: it is a `const`,
 * so a hoisted function that ran during module evaluation would hit its TDZ.
 */
export const ANNEX_RE =
  /^(?:приложение|Приложение|ПРИЛОЖЕНИЕ|прил|Прил|ПРИЛ)\.?\s*№?\s*(\d+[а-я]?)(?![а-яА-Я])/;

/**
 * Normalise a citation string to the corpus's unit ref.
 *   "Чл. 47"            -> "чл. 47"
 *   "чл.47, ал. 1, т. 5"-> "чл. 47"
 *   "чл. 183 ?"         -> "чл. 183"   (the "?" = unverified marker in SCHEMA.md)
 *   "§ 6, т. 30 ДР"     -> "§ 6"       (the ЗДвП definitions paragraph)
 *   "Приложение № 5"    -> "приложение № 5"
 *   "прил. № 2, знак Б2"-> "приложение № 2"   (see ANNEX below)
 * Returns null when the string is not an article/annex/§ reference at all.
 *
 * ANNEX — THE ABBREVIATION IS A NUMBER, AND IT USED TO READ AS „no number".
 * Returning null here does not merely fail to resolve: every citation gate in
 * the repo asks this function „does the ref name a unit NUMBER?" and treats
 * null as „numberless", which is the one shape the founder's standing ruling
 * lets through on an act we cannot open. „прил. № 2, знак Б2" is not
 * numberless — it points at annex 2 of Наредба № РД-02-21-1, which
 * `content/law/acts` does not hold. Measured on the question bank the day this
 * was widened: 74 citations, 40 distinct, 100% of them on that act, all of
 * them passing a check written to catch exactly this. `прил` without the dot
 * is matched too, and the trailing guard keeps „приложим"/„прилага" out.
 */
export function normaliseUnitRef(ref: string): string | null {
  const s = ref.trim().replace(/\?+\s*$/, "").trim();
  // The suffix must be a LOWERCASE letter glued to the number and not followed
  // by another letter. Written case-sensitively on purpose: with /i, "§ 6 ДР"
  // read as "§ 6д" and "чл. 6 от ЗДвП" as "чл. 6о" — both silent misses.
  const art = /^(?:чл|Чл|ЧЛ)\.?\s*(\d+)((?:[а-я]\d*)?)(?![а-яА-Я])/.exec(s);
  if (art) return `чл. ${art[1]}${art[2] ?? ""}`;
  const para = /^§\s*(\d+)([а-я]?)(?![а-яА-Я])/.exec(s);
  if (para) return `§ ${para[1]}${para[2] ?? ""}`;
  const annex = ANNEX_RE.exec(s);
  if (annex) return `приложение № ${annex[1]}`;
  return null;
}

/** Soft hyphens and non-breaking spaces survive the .docx; strip for matching. */
export function normaliseForMatch(text: string): string {
  return text
    .replace(/­/g, "")
    .replace(/[   ]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export interface LawCorpus {
  acts: ReadonlyMap<string, LawAct>;
  sources: LawSourceRegister;
  penalties: readonly PenaltyEntry[];
}

function contentLawDir(): string {
  const candidates = [
    path.join(process.cwd(), "content", "law"),
    path.resolve(process.cwd(), "..", "content", "law"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "sources.json"))) return dir;
  }
  throw new Error(
    `Law corpus not found (cwd: ${process.cwd()}). Looked for sources.json in: ${candidates.join(", ")}`,
  );
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

interface ZodLike {
  safeParse: (v: unknown) => {
    success: boolean;
    data?: unknown;
    error?: { issues?: { path?: PropertyKey[]; message?: string }[] };
  };
}

/** Compact, greppable failure — a 400-issue JSON dump helps nobody. */
function parseOrThrow<T>(schema: ZodLike, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error?.issues ?? [];
    const shown = issues
      .slice(0, 8)
      .map((i) => `  ${(i.path ?? []).join(".") || "(root)"}: ${i.message ?? "invalid"}`)
      .join("\n");
    const more = issues.length > 8 ? `\n  …and ${issues.length - 8} more` : "";
    throw new Error(`${what} failed validation (${issues.length} issue(s)):\n${shown}${more}`);
  }
  return result.data as T;
}

/**
 * A superseded text and the text that replaced it. Both are in the corpus on
 * purpose (see ACT_IDS), and a citation is free to point at either — but a
 * citation that quotes a passage of the OLD text which the NEW text no longer
 * contains is showing a student a sentence that has been repealed, under a
 * heading that names the наредба as if it were current. That is the „18 к.т.
 * chip" defect in general form, so it is checked in general form.
 *
 * The pairs themselves are declared beside the alias table (`SUPERSEDED_PAIRS`)
 * — the resolver has to know which acts are snapshots before it can refuse to
 * hand one to a bare name, and two lists of the same fact do not stay agreed.
 */
const SUPERSEDED_BY: ReadonlyMap<string, string> = new Map(SUPERSEDED_PAIRS);

/**
 * Anchor matching — deliberately looser than every other comparison in this
 * file, and deliberately in one place.
 *
 * The verbatim checks answer „are these the act's exact words?" and must stay
 * case-sensitive and exact. An anchor answers a different question — „is this
 * sentence ABOUT the thing the row says it is about?" — so it folds case and
 * runs over `normaliseForMatch` text, because „Пътен знак" at the start of an
 * indent and „пътен знак" inside one are the same subject.
 */
function anchorText(text: string): string {
  return normaliseForMatch(text).toLocaleLowerCase("bg");
}

/** One AND-group: satisfied by ANY of its alternatives. */
function hasAnchorGroup(text: string, group: readonly string[]): boolean {
  const hay = anchorText(text);
  return group.some((alternative) => hay.includes(anchorText(alternative)));
}

/**
 * A CONDITION THE ACT ATTACHES TO AN OFFENCE — and the reason the row's own
 * `conduct` declaration could never carry it.
 *
 * `\b` IS ASCII-ONLY IN JAVASCRIPT, so „ако\b" never matches after a Cyrillic
 * „о" and a regex written that way passes everything in silence. Measured while
 * building this: the first draft of the check found ZERO conditions in a bank
 * that has one. Every boundary here is an explicit negative lookaround, the
 * same device `content/proseFigures.ts` had to adopt for the same reason.
 */
const CONDITION_RE =
  /(?:^|[\s(„“"'\-,])(ако|когато|освен ако|при условие|в случай)(?![А-Яа-я])/u;

/* -------------------------------------------------------------------------- *
 * THE INSTRUMENT AND THE ARTICLE THAT AUTHORISES IT — check (11).
 *
 * THE DEFECT, reproduced before this was written. `FinePenaltySchema` requires
 * `instrument` and `instrumentSource` to be null together, and
 * `PenaltyEntrySchema` derives the instrument from the ban — but NOTHING
 * compared the instrument with the provision cited beside it. Measured on the
 * shipped bank: setting pen-b2-no-stop's instrument to „електронен фиш" while
 * its instrumentSource still quoted ЗДвП чл. 186, ал. 1 gave
 * `FinePenaltySchema` ✓, `PenaltyEntrySchema` ✓, `PenaltyBankSchema` ✓,
 * `verifyCitations` → [] and `describeFine` → „51,13 € (100 лв.) (електронен
 * фиш)" on a row whose own noteBg ends „…затова може да се наложи с фиш". Two
 * more variants passed the same way: the reverse flip on the speeding row, and
 * pointing the акт row's instrumentSource at чл. 186, ал. 1 — the rule that
 * BARS a фиш where лишаване is provided, cited as if it authorised the акт.
 *
 * The three are genuinely different in law — who may issue (an officer who is
 * standing there / a camera with no officer and no driver / a длъжностно лице
 * drawing up an АУАН), whether a лишаване can ride along, and the discount
 * (чл. 186, ал. 7 against чл. 189, ал. 5г) — so a wrong pairing is a screen
 * stating a real-world consequence the law behind it does not support.
 *
 * WHAT IS NOT DONE HERE, and why. The obvious fix is a table „фиш → чл. 186,
 * ал. 1". That table is an article number written from memory, which is what
 * ADR-002 forbids and what the corpus exists to replace. So no article number
 * appears below. The row supplies the coordinates; the loader reads the text
 * they point at and asks three questions OF THE TEXT:
 *
 *  a. does this provision name EXACTLY ONE instrument, and is it the row's?
 *  b. does it CREATE that instrument, or only mention it?
 *  c. does its own condition agree with the row's ban?
 *
 * Together those pin „фиш" to the one alinea that names a bare фиш and makes
 * the absence of a лишаване its condition, and „електронен фиш" to the one that
 * does the same for the camera — without either number being written here.
 * -------------------------------------------------------------------------- */

/**
 * The condition that decides whether a фиш is lawful at all, quoted from the
 * ingested ЗДвП: чл. 186, ал. 1 („За административни нарушения, за които не е
 * предвидено наказание лишаване от право да управлява…") and чл. 189, ал. 4
 * („За нарушение … за което не е предвидено наказание лишаване от право да се
 * управлява…") differ only in управлява/се управлява, so the shared span is the
 * needle. If a future amendment rewords it, every фиш row fails to load with
 * this sentence in the message — which is the correct failure for a bank whose
 * whole promise is that its claims are re-read out of the statute each time.
 */
const BAN_FREE_CONDITION_RE = /не е предвидено наказание лишаване от право/u;

/**
 * The OTHER condition an електронен фиш rests on, and the one that separates it
 * from an ordinary фиш at the same tier: ЗДвП чл. 189, ал. 4 opens „За
 * нарушение, установено и заснето с автоматизирано техническо средство или
 * система…". A row may not claim the camera instrument on a quote trimmed so
 * that the camera has disappeared from it — the whole difference between the
 * two фишове is who was there, and a student reading „електронен фиш" over a
 * sentence that never mentions a camera has been told the consequence without
 * the fact that produces it.
 *
 * WHAT THIS STILL DOES NOT REACH, stated here rather than left to be
 * discovered: nothing in a `PenaltyEntry` declares whether ITS offence is one a
 * camera can establish. A row for an offence an officer must see can therefore
 * still claim „електронен фиш" and cite чл. 189, ал. 4 honestly — the pairing
 * is right, the unproven claim is about detection. Closing that needs a
 * declared fact on the row (the way `conduct` closed the same shape for the
 * offence), not another read of the same alinea.
 */
const CAMERA_CONDITION_RE = /установено и заснето с автоматизирано техническо средство/u;

/**
 * A provision that CREATES an instrument rather than describing one. The verbs
 * are the acts' own, taken from the three provisions the bank cites: „може да
 * бъде наложена с фиш" (чл. 186, ал. 1), „се издава електронен фиш" (чл. 189,
 * ал. 4), „Актовете … се съставят" (чл. 189, ал. 1). Without this, чл. 189,
 * ал. 2 („Редовно съставените актове … имат доказателствена сила") and ал. 3
 * („Свидетел по акта може да бъде и служебно лице") would each read as an
 * authority for an акт.
 *
 * Same lexical device, and same boundary discipline, as CONDITION_RE above:
 * `\b` is ASCII-only in JavaScript and matches nothing useful after Cyrillic.
 */
const ISSUANCE_RE =
  /(?<![А-Яа-я])(?:се издава|се издават|бъде наложена|бъде наложено|се налага|се съставя|се съставят)(?![А-Яа-я])/u;

/** Which of the three instruments a passage names — „електронен фиш" is not „фиш". */
interface InstrumentMentions {
  фиш: boolean;
  "електронен фиш": boolean;
  акт: boolean;
}

/**
 * SUBSTRING MATCHING IS BROKEN IN EXACTLY THE DIRECTION OF THE ATTACK: „фиш" is
 * a substring of „електронен фиш", so a plain-фиш claim citing the camera rule
 * passes any naive `includes("фиш")`. Every фиш occurrence is therefore
 * classified by what stands before it, and the endings are the definite forms
 * the statute actually uses („фишът", „фиша", „електронният фиш").
 */
function instrumentMentions(text: string): InstrumentMentions {
  const hay = anchorText(text);
  const found: InstrumentMentions = { "фиш": false, "електронен фиш": false, "акт": false };
  const fish = /(?<![А-Яа-я])фиш(?:ът|а|ове|овете)?(?![А-Яа-я])/gu;
  for (let m = fish.exec(hay); m !== null; m = fish.exec(hay)) {
    const before = hay.slice(Math.max(0, m.index - 20), m.index);
    if (/електронн?[а-я]*\s+$/u.test(before)) found["електронен фиш"] = true;
    else found["фиш"] = true;
  }
  // „акт" only as a word: the trailing guard keeps „актуален" out and the
  // leading one keeps „фактически" out, neither of which `\b` would.
  found["акт"] = /(?<![А-Яа-я])акт(?:ът|а|ове|овете)?(?![А-Яа-я])/u.test(hay);
  return found;
}

const INSTRUMENTS: readonly FineInstrument[] = ["фиш", "електронен фиш", "акт"];

/**
 * Does a sentence name the conduct the row declared? Exported so that the test
 * that measures how well the anchors discriminate uses THIS function rather
 * than its own copy — two matchers that are supposed to agree drift, and the
 * one that drifted is always the one nobody ran.
 */
export function offencePhraseMatchesConduct(phrase: string, conduct: PenaltyConduct): boolean {
  return conduct.anchorsBg.every((group) => hasAnchorGroup(phrase, group));
}

/**
 * THE ALINEA AS A SPAN — because `paragraphRef` was a decorative string.
 *
 * A `LawUnit` is a whole ARTICLE. „ал. 4" and „т. 14" were carried alongside
 * the quote, printed in the citation a student is told to go and check, and
 * verified by nothing: every check in this file searched the article. ЗДвП
 * чл. 182 makes the cost of that concrete — it holds six speeding tiers for
 * town in ал. 1 and six more for out of town in ал. 2, and 31–40 km/h is 400
 * лв. in one and 300 in the other. `build-penalties.mjs` cuts a quote at the
 * FIRST occurrence of its locator in the article, so an author who writes
 * „ал. 2" and means it gets ал. 1's sentence and no warning.
 *
 * So the alineas are parsed into spans and the quote must lie inside the one
 * the citation names. Measured before writing it: 292 of the 292 units that
 * carry an „(N)" marker parse into a clean run, all 28 alinea-scoped citations
 * in the bank land inside their declared alinea, and чл. 189's lettered
 * alineas (4а … 5г … 13а) resolve individually — that last one matters,
 * because ал. 5г is where the 70 %/14-day discount lives.
 */
function alineaSpans(flat: string): Map<string, [number, number]> {
  // Fresh each call: a /g regex is stateful, and a shared one silently skips.
  const marker = /(^|[\s.;:!?])\((\d{1,2})([а-я]?)\)\s/g;
  const found: Array<{ n: number; s: string; at: number }> = [];
  for (let m = marker.exec(flat); m !== null; m = marker.exec(flat)) {
    found.push({ n: Number(m[2]), s: m[3] ?? "", at: m.index + m[1].length });
  }
  // Only a run that opens at „(1)" and advances counts. „(2)" inside a
  // cross-reference is not an alinea, and a repeat means we misread the text —
  // in either case the safe reading is that the run ended.
  const kept: Array<{ n: number; s: string; at: number }> = [];
  for (const mark of found) {
    const prev = kept[kept.length - 1];
    if (prev === undefined) {
      if (mark.n === 1 && mark.s === "") kept.push(mark);
      continue;
    }
    const advances =
      (mark.n === prev.n && mark.s > prev.s) || (mark.n === prev.n + 1 && mark.s === "");
    if (advances) kept.push(mark);
  }
  const spans = new Map<string, [number, number]>();
  kept.forEach((mark, i) => {
    const end = i + 1 < kept.length ? kept[i + 1].at : flat.length;
    spans.set(`${mark.n}${mark.s}`, [mark.at, end]);
  });
  return spans;
}

/** „ал. 5г" -> "5г". Null when the ref names no number at all. */
function alineaKey(paragraphRef: string): string | null {
  const m = /(\d{1,2})([а-я]?)/.exec(paragraphRef);
  return m === null ? null : `${m[1]}${m[2] ?? ""}`;
}

/**
 * The numbered points inside an alinea — „1. …; 2. …" — one level below
 * `alineaSpans` and parsed the same way, from a run that opens at 1.
 *
 * Deliberately applied only to a pointRef of the bare shape „т. N". „т. 1,
 * б. „а"" adds a lettered sub-point and Наредба № 38's приложение № 5 numbers
 * its own way; a parser that guessed at those would produce FALSE failures,
 * which is worse than the hole it closes. Measured: 13 of the bank's 14
 * point-scoped citations are bare „т. N", all 13 land inside their point, and
 * the fourteenth is skipped by name rather than by accident.
 */
function pointSpans(text: string): Map<string, [number, number]> {
  const marker = /(^|[\s;:])(\d{1,2})\.\s/g;
  const found: Array<{ n: number; at: number }> = [];
  for (let m = marker.exec(text); m !== null; m = marker.exec(text)) {
    found.push({ n: Number(m[2]), at: m.index + m[1].length });
  }
  const kept: Array<{ n: number; at: number }> = [];
  for (const mark of found) {
    const prev = kept[kept.length - 1];
    if (prev === undefined) {
      if (mark.n === 1) kept.push(mark);
    } else if (mark.n === prev.n + 1) kept.push(mark);
  }
  const spans = new Map<string, [number, number]>();
  kept.forEach((mark, i) => {
    spans.set(String(mark.n), [mark.at, i + 1 < kept.length ? kept[i + 1].at : text.length]);
  });
  return spans;
}

/**
 * THE ROW'S OWN LABEL, BROKEN INTO WORDS — the machine half of the tie that
 * closes `titleBg`.
 *
 * Words of one or two characters are dropped: they are „на", „в", „с", „не",
 * „по" — grammar, not claims — and a one-letter token would match anything.
 * Everything else survives, INCLUDING the numerals, because „21" and „30" are
 * exactly the part of a title that can be quietly wrong.
 */
export function labelWords(text: string): string[] {
  return normaliseForMatch(text)
    .toLocaleLowerCase("bg")
    // The comma is inside the character class so that „0,5 на хиляда" stays ONE
    // token instead of becoming „0" and „5", which would match half the corpus;
    // it is then trimmed off the ends, where it is punctuation.
    .split(/[^0-9a-zа-я,]+/u)
    .map((w) => w.replace(/^,+|,+$/g, ""))
    // A NUMBER OF ANY LENGTH SURVIVES. „21" and „30" are two characters long and
    // they are the entire difference between the founder's row and the one below
    // it — dropping them as too short (which the first draft of this did, and a
    // wrong-tier title walked straight through) throws away the part of a label
    // most worth checking.
    .filter((w) => w.length >= 3 || /^\d/.test(w));
}

/**
 * TITLE VOCABULARY THE ROW'S EVIDENCE DOES NOT CARRY.
 *
 * The tie the previous wave measured and refused: „titleBg must satisfy the
 * row's anchors" fails on honest data, because a title is written for a
 * seventeen-year-old and an anchor is written by the Народно събрание.
 * „Превишена скорост … с 21 – 30 km/h" carries neither „превишаване" (a
 * participle against a verbal noun) nor „от 21 до 30" (an en dash against a
 * statutory range). A guard that fails on correct data gets switched off, so
 * that tie was correctly not shipped.
 *
 * THE TIE THAT DOES HOLD asks a weaker question with the same teeth: does every
 * word of the label appear, IN SOME FORM, in text the loader has already proved
 * is in the act? Both failures above dissolve — the en dash splits „21 – 30"
 * into „21" and „30", which the act's „от 21 до 30 km/h" contains as words, and
 * „превишена" shares its first five characters with „превишаване". A title that
 * has been moved to another offence does not dissolve: „Преминава на червено"
 * over a speeding row leaves „преминава" and „червено", and no quote, context
 * quote or offence phrase on that row starts either of them.
 *
 * FIVE CHARACTERS is the measured setting, not a guess. Bulgarian inflection
 * lives in the last two or three letters („осигурява"/„осигури",
 * „спира"/„спирането", „управление"/„управлява"), so a shorter prefix accepts
 * strangers and a longer one splits real pairs — at six, „създава" no longer
 * reaches „създадена" and the honest danger row goes red.
 */
export function ungroundedLabelWords(label: string, evidence: readonly string[]): string[] {
  const known = [...new Set(evidence.flatMap(labelWords))];
  const stem = (w: string): string => w.slice(0, 5);
  return [
    ...new Set(
      labelWords(label).filter(
        (w) =>
          !known.some((k) => (w.length < 5 || k.length < 5 ? k === w : stem(k) === stem(w))),
      ),
    ),
  ];
}

/** The unit a `LawRef` names, resolved against a corpus that may still be loading. */
function unitForLawRef(acts: ReadonlyMap<string, LawAct>, lawRef: LawRef): LawUnit | undefined {
  const actId = actIdForActName(lawRef.act);
  if (actId === null) return undefined;
  const ref = normaliseUnitRef(lawRef.ref) ?? lawRef.ref.trim();
  return acts.get(actId)?.units.find((u) => u.ref === ref);
}

/** Every figure of a row, under the name its problems are reported by. */
function figuresOf(
  p: PenaltyEntry,
): ReadonlyArray<readonly [string, { status: FigureStatus; source: PenaltyCitation }]> {
  const out: Array<readonly [string, { status: FigureStatus; source: PenaltyCitation }]> = [
    ["fine", p.fine],
    ["controlPoints", p.controlPoints],
    ["disqualification", p.disqualification],
  ];
  if (p.examPoints) out.push(["examPoints", p.examPoints]);
  return out;
}

/**
 * An offence phrase is checked against the row's conduct only where the row is
 * actually PRICING something with it. "unknown" is exempt, and the exemption is
 * safe for a reason that is written down elsewhere in this layer: the schema
 * couples status to value, so "unknown" cannot carry a number. A phrase there
 * is shown beside a blank, as the nearest clause the act offers — which is
 * exactly pen-crosswalk-no-yield, whose приложение № 5 citation deliberately
 * names „създаде предпоставка за допускане на ПТП", a test the председател
 * applies rather than a description of the crossing.
 */
function conductApplies(status: FigureStatus): boolean {
  return status !== "unknown";
}

/**
 * (5) THE DECLARATION CHECKS — everything that stops the row's own statement of
 * its conduct from simply being moved to fit a wrong citation.
 *
 * (5b), below in `check`, is the fix. These four are what make (5b) mean
 * something a year from now:
 *
 *   a. every anchor group is findable in the act the row's `lawRefs` name, so
 *      the declaration is the law's vocabulary and not ours;
 *   b. the row's primary offence provision — the one the fine is cut from — is
 *      among those `lawRefs`, so (a) is grounded in the article that actually
 *      prices the conduct rather than in some article the row also mentions;
 *   c. `statementBg` satisfies the row's own anchors, so the sentence a human
 *      reviews and the test a machine runs cannot drift apart; and every digit
 *      in that sentence occurs inside an anchor, so the declaration can never
 *      become the one place an unverified figure lives (ADR-002: this is the
 *      field „50 метра" would have been written into);
 *   d. no alternative is dead. An anchor no phrase on the row needs is a hole
 *      opened for a phrase that is not there yet — which is how a check like
 *      this rots: not by being deleted, but by being widened.
 */
function conductProblems(p: PenaltyEntry, acts: ReadonlyMap<string, LawAct>): string[] {
  const problems: string[] = [];
  const { conduct } = p;

  // (a) the anchors must be the act's words.
  const refTexts = p.lawRefs
    .map((r) => unitForLawRef(acts, r))
    .filter((u): u is LawUnit => u !== undefined)
    .map((u) => u.textBg);
  if (refTexts.length === 0) {
    problems.push(
      `${p.id}.conduct: none of the row's lawRefs resolves to a stored act, so the conduct declaration cannot be checked against any law — a penalty row must cite at least one act the corpus holds`,
    );
  } else {
    const lawText = refTexts.join("\n");
    conduct.anchorsBg.forEach((group, i) => {
      if (!hasAnchorGroup(lawText, group)) {
        problems.push(
          `${p.id}.conduct: anchor group ${i} [${group.join(" | ")}] occurs nowhere in ${p.lawRefs
            .map((r) => `${r.act} ${r.ref}`)
            .join(", ")} — the conduct must be declared in the words of the act that prices it`,
        );
      }
    });
  }

  // (b) …and that act must be the one the fine is cut from.
  const fineActName = p.lawRefs.find(
    (r) =>
      actIdForActName(r.act) === p.fine.source.actId &&
      (normaliseUnitRef(r.ref) ?? r.ref.trim()) === p.fine.source.ref,
  );
  if (fineActName === undefined) {
    problems.push(
      `${p.id}.conduct: the fine is cut from ${p.fine.source.actId} ${p.fine.source.ref}, which is not in lawRefs — the conduct is verified against lawRefs, so a row whose lawRefs point elsewhere verifies its declaration against the wrong article`,
    );
  }

  // (c) the human half and the machine half must say the same thing.
  conduct.anchorsBg.forEach((group, i) => {
    if (!hasAnchorGroup(conduct.statementBg, group)) {
      problems.push(
        `${p.id}.conduct: statementBg does not satisfy anchor group ${i} [${group.join(" | ")}] — the sentence a reviewer reads must be the same claim the check enforces`,
      );
    }
  });
  const anchorBlob = anchorText(conduct.anchorsBg.flat().join(" "));
  for (const digits of conduct.statementBg.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    if (!anchorBlob.includes(digits)) {
      problems.push(
        `${p.id}.conduct: statementBg states „${digits}", which is in none of the anchors — every figure in the declaration must be one the act's own words carry (ADR-002)`,
      );
    }
  }

  // (d) every alternative must be earning its place.
  const phrases = figuresOf(p)
    .filter(([, f]) => conductApplies(f.status))
    .map(([, f]) => f.source.offencePhraseBg)
    .filter((q): q is string => q !== undefined);
  if (phrases.length > 0) {
    conduct.anchorsBg.forEach((group, i) => {
      for (const alternative of group) {
        const used = phrases.some((phrase) => anchorText(phrase).includes(anchorText(alternative)));
        if (!used) {
          problems.push(
            `${p.id}.conduct: anchor group ${i} offers "${alternative}", which no offence phrase on this row uses — an unused alternative only widens what the row will accept`,
          );
        }
      }
    });
  }

  return problems;
}

/**
 * (9) THE ROW'S OWN LABEL — the last field that was tied to nothing.
 *
 * Everything else in this file ties one piece of the act to another. `titleBg`
 * and `summaryBg` are OURS: the words a student reads in a list, before he
 * opens anything and long before he reads a quote. Rewrite the speeding row's
 * title to „Преминава на червено" and, until this function existed, every
 * citation stayed verified and the whole suite stayed green.
 *
 * TWO ROPES, and they are deliberately different, because the two fields are
 * different objects and one rule for both would have to be the weaker one.
 *
 *  a. `titleBg` names the offence, so its VOCABULARY must be the offence's.
 *     Every word of it has to appear — in some inflected form — in text the
 *     loader has already proved is in the act. Measured over the whole bank:
 *     zero ungrounded words on all seven honest titles, and the two that used
 *     to fail („населено", „място") stopped failing not by loosening anything
 *     but because check (7) forced the speeding rows to quote the ladder's
 *     opening, which is where the statute says „в населено място".
 *
 *  b. `summaryBg` (and every `noteBg`) is EXPLANATION — „стъпалото, което
 *     камерите ловят най-често", „нула дни без книжка". Measured before
 *     writing: the same vocabulary rule leaves 7 of 7 summaries red, so it is
 *     not shipped for them and this is not an oversight. What IS checked there
 *     is the part that is a claim about the law rather than about the student:
 *     an ARTICLE NUMBER. „чл. 250" in a note reads exactly like „чл. 183" and
 *     is invisible to the numeral gate, which classifies it as a citation
 *     locator and exempts it by design. So every article our prose names must
 *     resolve — in an act the row cites, or in an act the sentence names
 *     itself, which is how „НСИПМК чл. 425, ал. 1, т. 2" stays legal.
 *
 * The residual hole, stated rather than papered over: `id` is Latin kebab-case
 * and no rope can reach it from Cyrillic statute text. It is not shown to a
 * student, and `PenaltyBankSchema` only guarantees it is unique.
 */
function labelProblems(p: PenaltyEntry, acts: ReadonlyMap<string, LawAct>): string[] {
  const problems: string[] = [];

  const evidence = figuresOf(p).flatMap(([, f]) =>
    [f.source.quoteBg, f.source.contextQuoteBg, f.source.offencePhraseBg].filter(
      (q): q is string => q !== undefined,
    ),
  );
  const stray = ungroundedLabelWords(p.titleBg, evidence);
  if (stray.length > 0) {
    problems.push(
      `${p.id}.titleBg: „${stray.join(", ")}" occurs in none of this row's verified quotes — the label a student reads in the list must be the offence the citations price, and nothing else in this loader looks at it`,
    );
  }

  /**
   * …and a FIGURE claimed in a label must be the row's own figure.
   *
   * Found by attacking the vocabulary rule: „Превишена скорост в населено място
   * с 21 – 30 km/h и 10 контролни точки" passes it word for word — „10" is in
   * the exam quote, „контролни точки" is in the наредба quote — while telling a
   * student that a 100 лв. speeding ticket costs him ten licence points, which
   * is the founder's whole complaint in one line. The numeral gate does not see
   * it either: the number and the unit both occur in evidence the row really
   * holds. Only the ROW knows that its контролни точки figure is 0.
   *
   * Measured before shipping: no title and no summary in the bank states a
   * лв./точки figure at all, so this costs nothing today and refuses the first
   * one that is wrong.
   */
  const LABEL_FIGURE = /(\d+(?:[.,]\d+)?)\s*(контролни точки|наказателни точки|лв\.)/g;
  const owned: ReadonlyArray<readonly [string, number | null]> = [
    ["контролни точки", p.controlPoints.points],
    ["наказателни точки", p.examPoints?.points ?? null],
    ["лв.", p.fine.amountBgn],
  ];
  for (const [where, text] of [
    ["titleBg", p.titleBg],
    ["summaryBg", p.summaryBg],
  ] as const) {
    for (const m of text.matchAll(LABEL_FIGURE)) {
      const mine = owned.find(([unit]) => unit === m[2])?.[1] ?? null;
      if (mine === null || String(mine) !== m[1].replace(",", ".")) {
        problems.push(
          `${p.id}.${where}: claims „${m[1]} ${m[2]}", and this row's figure is ${mine === null ? "not established" : mine} — a label may not state a consequence the row does not carry, which is exactly the confusion this bank exists to end`,
        );
      }
    }
  }

  // …and the article numbers in our own prose.
  const citedActIds = new Set<string>();
  for (const [, f] of figuresOf(p)) citedActIds.add(f.source.actId);
  if (p.fine.instrumentSource) citedActIds.add(p.fine.instrumentSource.actId);

  const fields: Array<readonly [string, string | null]> = [
    ["titleBg", p.titleBg],
    ["summaryBg", p.summaryBg],
    ["fine.noteBg", p.fine.noteBg],
    ["controlPoints.noteBg", p.controlPoints.noteBg],
    ["disqualification.noteBg", p.disqualification.noteBg],
    ["examPoints.noteBg", p.examPoints?.noteBg ?? null],
  ];
  for (const [where, text] of fields) {
    if (text === null || text === "") continue;
    /**
     * An act the SENTENCE names is fair game even when the row does not cite
     * it: the camera-tolerance note reaches „чл. 425 от Наредбата за средствата
     * за измерване", two documents away from the ЗДвП and legitimately so.
     * `inlineCitations` is the reader the prose gate already uses for that —
     * borrowed rather than re-written, because it knows both word orders and
     * strips the Bulgarian definite article („Наредбата" → „Наредба"), and two
     * matchers meant to agree drift.
     */
    const reachable = new Set(citedActIds);
    for (const cite of inlineCitations(text)) {
      const named = actIdForActName(cite.actBg);
      if (named !== null) reachable.add(named);
    }
    for (const m of text.matchAll(/(?<![А-Яа-яЁёA-Za-z0-9])чл\.\s*(\d+[а-я]?)/gi)) {
      const ref = `чл. ${m[1]}`;
      const found = [...reachable].some((actId) =>
        acts.get(actId)?.units.some((u) => u.ref === ref),
      );
      if (!found) {
        problems.push(
          `${p.id}.${where}: names „${ref}", which exists in none of the acts this row can reach (${[
            ...reachable,
          ].join(", ")}) — an article number in our own prose is a claim about the law and the numeral gate cannot see it, because it reads a locator as a coordinate rather than a figure (ADR-002)`,
        );
      }
    }
  }

  return problems;
}

/**
 * (10) TWO ROWS THAT PRICE DIFFERENT MONEY MUST BE TELLABLE APART.
 *
 * Every check above is about ONE row. The founder's example is about two: „не
 * спира на Б2" is 100 лв. and no контролни точки, and the same manoeuvre „ако
 * от това е създадена непосредствена опасност" is 200 лв. and 10. A student who
 * is shown the second row's sentence under the first row's price has been
 * taught the wrong law, and nothing that looks at one row in isolation can see
 * it.
 *
 * Restricted to the FINE phrase, and to pairs whose fines differ, on purpose.
 * The exam sheet legitimately marks one error for both — приложение № 5 grades
 * „не спре при наличието на пътен знак Б2" whether or not danger followed —
 * so requiring every phrase to be unique across the bank would fail on correct
 * data. The phrase that prices the MONEY is the one that may not be shared.
 */
function separationProblems(penalties: readonly PenaltyEntry[]): string[] {
  const problems: string[] = [];
  for (const a of penalties) {
    for (const b of penalties) {
      if (a.id >= b.id) continue;
      if (a.fine.amountBgn === null || b.fine.amountBgn === null) continue;
      if (a.fine.amountBgn === b.fine.amountBgn) continue;
      const pa = a.fine.source.offencePhraseBg;
      const pb = b.fine.source.offencePhraseBg;
      if (pa === undefined || pb === undefined) continue;
      if (
        offencePhraseMatchesConduct(pa, b.conduct) &&
        offencePhraseMatchesConduct(pb, a.conduct)
      ) {
        problems.push(
          `${a.id} and ${b.id} price different fines (${a.fine.amountBgn} лв. / ${b.fine.amountBgn} лв.) but each row's conduct accepts the other row's fine phrase — the two declarations do not tell the two offences apart, so whichever citation is wrong, nothing here can say which`,
        );
      }
    }
  }
  return problems;
}

/**
 * The checks that make a figure grounded rather than asserted:
 *
 *  1. every citation quote occurs verbatim (modulo whitespace / soft hyphens)
 *     in the unit it points at;
 *  2. a GROUNDED numeric figure's number appears in its own quote. A fine of
 *     100 лв. cited with a quote that never says "100 лв." is exactly the
 *     failure this corpus exists to prevent;
 *  3. a GROUNDED figure NAMES THE OFFENCE, in the act's words, inside the
 *     quotes the student is shown — see (3) below for the six-row defect that
 *     rode through 1 and 2 untouched;
 *  4. a quote cut from a SUPERSEDED text still occurs in the text that replaced
 *     it, or the citation is refused;
 *  5. and the offence it names is THE ROW'S OFFENCE — checked against the row's
 *     `conduct` declaration, because 1–4 all compare a citation with itself.
 *
 * 6–10 were added after a gate attacked 1–5 and got six attacks through. Each
 * of them is DERIVED FROM THE ACT rather than declared by the row, which is the
 * property that matters: 1–5 can all be satisfied by an author who writes both
 * sides of the comparison, and a declaration can be widened or deleted.
 *
 *  6. the alinea and point printed beside the quote are where the text is;
 *  7. …and the citation's own words are enough to prove WHICH alinea, so a
 *     coordinate that fits two identical ladders is refused rather than
 *     believed (ЗДвП чл. 182: in town / out of town, 400 лв. against 300);
 *  8. an offence phrase may not stop before the act's „ако"/„когато" — the
 *     dropped condition is the entire difference between two rows;
 *  9. the row's own LABEL speaks the offence's vocabulary, and no article
 *     number in our prose is one the corpus cannot open;
 * 10. two rows that price different fines can be told apart by their
 *     declarations.
 * 11. and the INSTRUMENT the money arrives on is the one the provision beside
 *     it actually authorises — added after 1–10 let „електронен фиш" sit on a
 *     citation of the ordinary-фиш rule with every schema and every test green.
 *
 * Returns human-readable problems, empty when clean.
 */
export function verifyCitations(
  acts: ReadonlyMap<string, LawAct>,
  penalties: readonly PenaltyEntry[],
): string[] {
  const problems: string[] = [];

  const check = (
    penaltyId: string,
    field: string,
    c: PenaltyCitation,
    opts: {
      /** The exact string the quote must contain, when the figure is grounded. */
      mustContain?: string;
      /**
       * The figure's status. Absent = this citation prices nothing and names no
       * offence (`instrumentSource`), so the offence checks do not apply.
       */
      status?: FigureStatus;
      /** The row's declaration of what it is pricing — see (5). */
      conduct?: PenaltyConduct;
      /**
       * Set only on `fine.instrumentSource`: the instrument this citation is
       * supposed to authorise, and the row's ban status, which is the condition
       * the authorising provisions state. Turns on check (11).
       */
      instrument?: FineInstrument;
      banStatus?: FigureStatus;
    } = {},
  ): void => {
    const { mustContain, status, conduct, instrument, banStatus } = opts;
    const requireOffencePhrase = status === "grounded";
    /**
     * The narrowest text the citation's own coordinates name — the point when
     * `pointRef` is a bare „т. N", else the alinea, else the whole unit. Set as
     * the coordinates are resolved below and read by check (8), which asks what
     * the act says immediately AFTER the offence phrase and would get the wrong
     * answer from the whole article.
     */
    let citedScope: string | null = null;
    const act = acts.get(c.actId);
    if (!act) {
      problems.push(`${penaltyId}.${field}: unknown actId "${c.actId}"`);
      return;
    }
    const unit = act.units.find((u) => u.ref === c.ref);
    if (!unit) {
      problems.push(`${penaltyId}.${field}: ${act.abbrBg} has no unit "${c.ref}"`);
      return;
    }
    const haystack = normaliseForMatch(unit.textBg);
    /** False once any quote has failed check 1 — see (7), which then stays quiet. */
    let quotesResolve = true;
    for (const [name, quote] of [
      ["quote", c.quoteBg],
      ["contextQuote", c.contextQuoteBg],
    ] as const) {
      if (quote === undefined) continue;
      if (!haystack.includes(normaliseForMatch(quote))) {
        quotesResolve = false;
        problems.push(
          `${penaltyId}.${field}: ${name} is NOT in ${act.abbrBg} ${c.ref} — "${quote.slice(0, 70)}…"`,
        );
      }
    }
    if (mustContain !== undefined && !normaliseForMatch(c.quoteBg).includes(normaliseForMatch(mustContain))) {
      problems.push(
        `${penaltyId}.${field}: quote does not state the figure — expected "${mustContain}" in "${c.quoteBg.slice(0, 70)}…"`,
      );
    }

    /**
     * (6) …AND THE COORDINATES PRINTED BESIDE IT ARE WHERE THE TEXT IS.
     *
     * The citation a student is told to go and open says „чл. 182, ал. 1,
     * т. 3". Until now the „ал. 1" was believed: checks 1–3 all search the
     * whole article, so a quote cut from ал. 2 satisfied every one of them
     * while the row said ал. 1. In чл. 182 that is not pedantry — ал. 1 is the
     * in-town ladder and ал. 2 the out-of-town one, and at 31–40 km/h they
     * differ by 100 лв.
     *
     * Skipped where the article is not divided into alineas at all (an annex,
     * a one-paragraph article): there is nothing to be inside of. A quote that
     * is not in the article at all is already reported above, so it is not
     * reported twice here.
     */
    /**
     * …AND THE COORDINATE MAY NOT SIMPLY BE OMITTED. Found by attacking (7):
     * deleting `paragraphRef` along with the ladder's opening put the citation
     * back in the state (7) refuses, because a check that only runs when a
     * coordinate is present is switched off by removing the coordinate. An
     * article divided into alineas has to be entered through one — measured
     * over the bank: every citation already names one, and the exam annex,
     * which names none, has no alinea run to name (приложение № 5 parses to 0).
     */
    if (c.paragraphRef === undefined && alineaSpans(haystack).size > 1) {
      problems.push(
        `${penaltyId}.${field}: ${act.abbrBg} ${c.ref} is divided into alineas and the citation names none — a student sent to the whole article has to find the sentence himself, and the checks that verify a coordinate cannot run on a citation that has one`,
      );
    }
    if (c.paragraphRef !== undefined) {
      const wanted = alineaKey(c.paragraphRef);
      const spans = alineaSpans(haystack);
      if (wanted !== null && spans.size > 0) {
        const span = spans.get(wanted);
        if (span === undefined) {
          problems.push(
            `${penaltyId}.${field}: ${act.abbrBg} ${c.ref} has no ${c.paragraphRef} — its alineas are ${[
              ...spans.keys(),
            ]
              .map((k) => `ал. ${k}`)
              .join(", ")}`,
          );
        } else {
          const inside = haystack.slice(span[0], span[1]);
          citedScope = inside;
          let misfiled = false;
          for (const [name, quote] of [
            ["quote", c.quoteBg],
            ["contextQuote", c.contextQuoteBg],
          ] as const) {
            if (quote === undefined) continue;
            const needle = normaliseForMatch(quote);
            if (haystack.includes(needle) && !inside.includes(needle)) {
              misfiled = true;
              problems.push(
                `${penaltyId}.${field}: ${name} is in ${act.abbrBg} ${c.ref} but NOT in ${c.paragraphRef} — the citation sends the student to an alinea that does not contain the sentence: "${quote.slice(0, 60)}…"`,
              );
            }
          }

          /**
           * (7) …AND THE CITATION'S OWN WORDS MUST BE ABLE TO PROVE WHICH
           * ALINEA IT IS. THE LIMIT ABOVE, CLOSED.
           *
           * Check (6) compares the quote with the alinea it names. It cannot
           * tell two alineas apart when they contain THE SAME SENTENCE, and
           * ЗДвП чл. 182 does exactly that: ал. 1 is the in-town speeding
           * ladder, ал. 2 the out-of-town one, and their т. 3 is word for word
           * identical („за превишаване от 21 до 30 km/h - с глоба 100 лв."). So
           * the founder's own row could be flipped to „ал. 2" and every check
           * in this file — and all 11,518 tests — stayed green. Harmless at
           * that tier, where both alineas say 100 лв. NOT harmless at т. 4: in
           * town 31–40 km/h is 400 лв., out of town 300.
           *
           * The discriminator is the alinea's OWN OPENING („който превиши
           * разрешената максимална скорост в населено място" / „…извън населено
           * място"), and no citation field carried it — so the rule is not that
           * a row must declare which ladder it is on, it is that A CITATION
           * WHOSE EVIDENCE FITS TWO ALINEAS IS NOT A CITATION. Something the
           * student is shown must be unique to the alinea named. Quote the
           * opening and check (6) does the rest: flipping to ал. 2 then makes
           * the opening a sentence that alinea does not contain.
           *
           * Measured over the bank before it was written: 26 of 30
           * alinea-scoped citations were already unique, and the 4 that were
           * not are the four on чл. 182 — which is the article the defect was
           * found in. Nothing else moved.
           */
          const evidence = [c.quoteBg, c.contextQuoteBg, c.offencePhraseBg].filter(
            (q): q is string => q !== undefined,
          );
          const siblings = [...spans.entries()].filter(([key]) => key !== wanted);
          // Silent when the quote is not in the article at all, or is in the
          // wrong alinea: both are already reported, and a citation cannot be
          // asked to prove WHICH alinea before it has proved it is in one.
          if (quotesResolve && !misfiled && spans.size > 1 && siblings.length > 0) {
            const unique = evidence.some((q) => {
              const needle = normaliseForMatch(q);
              return (
                inside.includes(needle) &&
                !siblings.some(([, s]) => haystack.slice(s[0], s[1]).includes(needle))
              );
            });
            if (!unique) {
              problems.push(
                `${penaltyId}.${field}: nothing this citation shows is unique to ${act.abbrBg} ${c.ref}, ${c.paragraphRef} — every quote it carries also occurs in another alinea of the same article, so the coordinate is unverifiable and could be flipped without any check noticing. Quote the alinea's own opening sentence, which is what tells the ladders apart.`,
              );
            }
          }

          /**
           * …and one level further down, where the pointRef is a bare „т. N".
           *
           * NOT „every quote is inside the point": the bank's whole design is
           * that the alinea's opening sentence carries the figure („Наказва се
           * с глоба 150 лв. водач, който:") and the numbered point carries the
           * offence. So the test is that SOMETHING of the citation is inside
           * the point it names — otherwise „т. 14" and „т. 3" are the same
           * claim, and a student who opens the article finds a stranger's
           * offence under his own fine.
           */
          const point = /^т\.\s*(\d{1,2})$/.exec((c.pointRef ?? "").trim());
          if (point !== null) {
            const points = pointSpans(inside);
            const pSpan = points.get(point[1]);
            /**
             * …AND AN ALINEA WITH NO POINTS CANNOT BE ENTERED THROUGH ONE.
             *
             * Found by attacking check (11): adding `pointRef: "т. 1"` to the
             * фиш row's чл. 186, ал. 1 citation produced zero problems and
             * rendered „ЗДвП, чл. 186, ал. 1, т. 1" under the instrument — a
             * coordinate that alinea does not have. The guard below was written
             * `points.size > 0 && …`, so a citation naming a point in an alinea
             * that has NONE switched the whole branch off, which is the same
             * shape as the deleted `paragraphRef` two checks up: a check that
             * only runs when the text cooperates is disabled by a coordinate
             * that does not. Measured over the bank before writing it: 13 bare
             * „т. N" citations, all 13 inside an alinea that really has points.
             */
            if (points.size === 0) {
              problems.push(
                `${penaltyId}.${field}: ${act.abbrBg} ${c.ref}, ${c.paragraphRef} is not divided into numbered points, and the citation names ${c.pointRef} — the student is sent to a coordinate the act does not have`,
              );
            } else if (pSpan === undefined) {
              problems.push(
                `${penaltyId}.${field}: ${act.abbrBg} ${c.ref}, ${c.paragraphRef} has no ${c.pointRef} — its points run 1–${points.size}`,
              );
            } else {
              const pointText = inside.slice(pSpan[0], pSpan[1]);
              citedScope = pointText;
              const lands = [c.quoteBg, c.contextQuoteBg, c.offencePhraseBg]
                .filter((q): q is string => q !== undefined)
                .some((q) => pointText.includes(normaliseForMatch(q)));
              if (!lands) {
                problems.push(
                  `${penaltyId}.${field}: nothing in this citation is inside ${c.ref}, ${c.paragraphRef}, ${c.pointRef} — the coordinate points at an offence the citation does not quote: „${pointText.slice(0, 60)}…"`,
                );
              }
            }
          }
        }
      }
    }

    /**
     * (3) THE CHECK THAT WAS MISSING, and the one that matters most.
     *
     * Checks 1 and 2 ask „is this sentence in the act?" and „does it contain the
     * number?". Neither asks „is this sentence ABOUT THIS OFFENCE?" — and that
     * is the question a citation actually answers for a student. Six penalties
     * carried the same quote from Наредба № 38, приложение № 5, т. 10, б. „в":
     * the header stating „10 наказателни точки" plus the FIRST of its six
     * enumerated cases. Both checks passed on all six. Five of them were the
     * wrong offence — a speeding fault priced by the sentence about a traffic
     * light — and nothing in this file could see it.
     *
     * So a grounded figure must carry `offencePhraseBg`, and it is verified from
     * both ends: the phrase must be the ACT'S wording (present in the unit), and
     * it must appear in the quotes the student is actually shown. Sharing a
     * header across rows is still fine; sharing the offence sentence is not,
     * because each row's phrase has to be found in its own quotes.
     *
     * WHERE THAT WAS STILL NOT ENOUGH — the reason (5b) exists.
     *
     * Both halves compare the phrase with THE CITATION'S OWN QUOTES. A citation
     * that is internally perfect and about somebody else's offence therefore
     * passes: set pen-speeding-urban-21-30's contextQuote to the светофар case
     * and its offencePhrase to the same words, and every check above is happy —
     * measured, and it returned zero problems. Nothing here compared the phrase
     * to the row's id, its title, or the violation it prices, because until the
     * row declared its conduct there was nothing outside the citation to compare
     * it to. `PenaltyEntry.conduct` is that thing, and (5b) is the comparison.
     */
    const phrase = c.offencePhraseBg;
    if (requireOffencePhrase && phrase === undefined) {
      problems.push(
        `${penaltyId}.${field}: a grounded figure must name the offence it prices — add offencePhraseBg (the act's own words for the conduct), otherwise the quote proves only that some sentence exists`,
      );
    }
    // Verified WHENEVER present, not only when grounded: a „not-listed" figure
    // shows a 0 and its quotes beside it, and a phrase there is read exactly as
    // hard as one beside a number.
    if (phrase !== undefined) {
      const needle = normaliseForMatch(phrase);
      if (!haystack.includes(needle)) {
        problems.push(
          `${penaltyId}.${field}: offencePhrase is NOT in ${act.abbrBg} ${c.ref} — "${phrase.slice(0, 70)}…"`,
        );
      }
      const shown = normaliseForMatch(`${c.quoteBg} ${c.contextQuoteBg ?? ""}`);
      if (!shown.includes(needle)) {
        problems.push(
          `${penaltyId}.${field}: the quotes shown never name the offence — expected "${phrase.slice(0, 60)}…" in the quote or contextQuote. This is the shape of the defect where six rows shared one enumerated case and five were the wrong offence.`,
        );
      }
      /**
       * (5b) …AND THE OFFENCE IT NAMES IS THIS ROW'S OFFENCE.
       *
       * The first comparison in this function that is not the citation against
       * itself. `conduct` is declared once per row, verified against the act the
       * row's lawRefs name (see `conductProblems`), and every phrase the row
       * shows has to satisfy it. A perfectly-formed citation about a different
       * offence now has nowhere to hide: the светофар sentence carries neither
       * „превишаване" nor „от 21 до 30", so it cannot be the price of a speeding
       * row no matter how consistent it is with itself.
       */
      if (conduct !== undefined && status !== undefined && conductApplies(status)) {
        if (!offencePhraseMatchesConduct(phrase, conduct)) {
          const missing = conduct.anchorsBg
            .filter((group) => !hasAnchorGroup(phrase, group))
            .map((group) => `[${group.join(" | ")}]`)
            .join(", ");
          problems.push(
            `${penaltyId}.${field}: the offence named is not the offence this row prices — „${phrase.slice(0, 60)}…" satisfies none of ${missing}, which the row declares as its conduct („${conduct.statementBg.slice(0, 70)}…"). A citation can be verbatim, state the figure and name an offence, and still be about someone else's.`,
          );
        }
      }

      /**
       * (8) …AND IT MAY NOT STOP BEFORE THE ACT HAS FINISHED SAYING WHEN.
       *
       * THE DEFECT, and it was live on a shipped row. ЗДвП чл. 179, ал. 1, т. 5
       * prices „не спазва предписанието на пътните знаци … ако от това е
       * създадена непосредствена опасност за движението" at 200 лв. and 10
       * контролни точки. Cut the phrase at „пътните знаци" and the danger clause
       * is gone — and the danger clause IS the difference between that row and
       * pen-b2-no-stop, which is 100 лв. and no точки for the same manoeuvre.
       * The truncation is verbatim, it is inside the quotes, and it satisfies
       * the row's own conduct. Nothing went red.
       *
       * WHY (5b) COULD NOT BE MADE TO CATCH IT, which is why this check exists
       * beside it rather than inside it. (5b) requires EVERY phrase on the row
       * to satisfy EVERY anchor group, so the declaration can only ever be the
       * weakest common denominator of the row's own figures. Adding an
       * „опасност" group to the danger row would refuse its контролни-точки
       * citation and its наказателни-точки citation, whose acts do not use the
       * word — приложение № 5 marks the Б2 non-stop whether or not danger
       * followed, and says so in its own noteBg. The two rows that differ ONLY
       * by the danger clause are precisely the two a row-wide AND can never
       * separate.
       *
       * So the condition is not enforced from the row. It is enforced from THE
       * ACT'S OWN PUNCTUATION: inside the narrowest span the citation names,
       * read from the end of the phrase to the next „;" — the boundary of the
       * enumerated item — and if what the phrase left behind opens a condition,
       * the phrase is quoting an offence the act does not price on its own.
       * There is no field to declare, widen or delete: the check is derived
       * from the text every load already re-reads.
       *
       * Measured over the whole bank before it was written: 21 offence phrases,
       * 20 clean, 1 red — pen-b2-no-stop-danger's контролни-точки phrase, which
       * had dropped the same clause from Наредба № Iз-2539 чл. 6, ал. 1, т. 15.
       * That row was fixed rather than exempted.
       */
      const scope = citedScope ?? haystack;
      for (let at = scope.indexOf(needle); at !== -1; at = scope.indexOf(needle, at + 1)) {
        const after = scope.slice(at + needle.length);
        const semicolon = after.indexOf(";");
        const tail = semicolon === -1 ? after : after.slice(0, semicolon + 1);
        const dropped = CONDITION_RE.exec(tail);
        if (dropped !== null) {
          problems.push(
            `${penaltyId}.${field}: the offence phrase stops before the act does — ${act.abbrBg} ${c.ref} goes on „…${tail.slice(0, 90)}", and „${dropped[1]}" opens the condition that decides the figure. A phrase cut before its own „ако"/„когато" is verbatim, is inside the quotes and satisfies the row's conduct, and still prices the wrong conduct: it is the whole difference between 100 лв. and 200 лв. for the same manoeuvre.`,
          );
        }
      }
    }

    /**
     * (11) THE INSTRUMENT IS BOUND TO THE ARTICLE THAT AUTHORISES IT.
     *
     * Runs only on `fine.instrumentSource`. The long note beside
     * `instrumentMentions` above has the measured defect and the reason no
     * article number is written here; this is the three questions themselves,
     * asked of the narrowest text the citation's own coordinates name.
     */
    if (instrument !== undefined) {
      const scope = citedScope ?? haystack;
      const shownBg = `${c.quoteBg} ${c.contextQuoteBg ?? ""}`;
      const inScope = instrumentMentions(scope);
      const inShown = instrumentMentions(shownBg);

      // (11a) …AND THE PROVISION NAMES THAT INSTRUMENT AND NO OTHER.
      // „Exactly one" is what does the work. Requiring merely that the row's
      // instrument be present lets чл. 186, ал. 2 („На лице, което оспорва …
      // се съставя акт", which also says „фиша") stand as the authority for
      // either — and a provision that names two instruments is not the rule
      // that decides between them.
      const named = INSTRUMENTS.filter((i) => inScope[i]);
      if (!inScope[instrument]) {
        problems.push(
          `${penaltyId}.${field}: the row says the fine arrives as „${instrument}" and the provision it cites never names one — ${act.abbrBg} ${c.ref}${c.paragraphRef ? `, ${c.paragraphRef}` : ""} names ${named.length === 0 ? "no instrument at all" : `„${named.join("“, „")}"`}. The instrument is a claim about who may issue the ticket, whether a лишаване can ride along and what the discount is; an instrument whose own citation is about a different piece of paper is a consequence the law behind it does not support.`,
        );
      } else if (named.length > 1) {
        problems.push(
          `${penaltyId}.${field}: ${act.abbrBg} ${c.ref}${c.paragraphRef ? `, ${c.paragraphRef}` : ""} names more than one instrument („${named.join("“, „")}") — a provision that mentions two cannot be the rule that authorises this one. Cite the alinea that provides for „${instrument}" itself.`,
        );
      }
      // …and the student must be shown it, not merely have it be true upstream.
      if (!inShown[instrument]) {
        problems.push(
          `${penaltyId}.${field}: the quotes shown never say „${instrument}" — the student reads the instrument on the screen and the sentence underneath it is about something else.`,
        );
      }

      // (11b) …AND THE PROVISION CREATES IT, rather than mentioning it.
      if (!ISSUANCE_RE.test(anchorText(scope))) {
        problems.push(
          `${penaltyId}.${field}: ${act.abbrBg} ${c.ref}${c.paragraphRef ? `, ${c.paragraphRef}` : ""} mentions „${instrument}" but does not provide for one — nothing in it is issued, imposed or drawn up. чл. 189, ал. 2 gives актове their доказателствена сила and ал. 3 says who may witness one; neither is the authority to draw one up.`,
        );
      }

      // (11c) …AND ITS OWN CONDITION AGREES WITH THE ROW'S BAN.
      // This is the half that catches a citation which is about the right
      // instrument and still wrong: the акт row pointed at the фиш rule. Both
      // фиш provisions make the ABSENCE of a лишаване their condition, so a
      // row whose ban is grounded cannot be standing on one, and a row that
      // claims a фиш must be standing on one.
      const conditioned = BAN_FREE_CONDITION_RE.test(anchorText(scope));
      const conditionShown = BAN_FREE_CONDITION_RE.test(anchorText(shownBg));
      const fisher = instrument === "фиш" || instrument === "електронен фиш";
      if (fisher && !conditioned) {
        problems.push(
          `${penaltyId}.${field}: „${instrument}" is permitted only for offences „не е предвидено наказание лишаване от право", and ${act.abbrBg} ${c.ref}${c.paragraphRef ? `, ${c.paragraphRef}` : ""} does not state that condition — so this is not the provision that authorises the ticket. The alineas about the discount, about an unpaid фиш and about being notified all name a фиш and authorise none.`,
        );
      }
      if (fisher && !conditionShown) {
        problems.push(
          `${penaltyId}.${field}: the quote shown drops the condition the instrument rests on („не е предвидено наказание лишаване от право") — without it the sentence reads as though a фиш were always available, which is the one thing the alinea says it is not.`,
        );
      }
      if (!fisher && conditioned) {
        problems.push(
          `${penaltyId}.${field}: this row's лишаване is ${banStatus ?? "?"} and it cites a provision whose condition is that NO лишаване is provided — ${act.abbrBg} ${c.ref}${c.paragraphRef ? `, ${c.paragraphRef}` : ""} is the rule that BARS a фиш here, not the rule that authorises the акт.`,
        );
      }
      if (fisher && banStatus !== undefined && banStatus !== "not-listed") {
        problems.push(
          `${penaltyId}.${field}: the citation's condition is that no лишаване is provided, and the row's disqualification is "${banStatus}" — the row and the rule it stands on disagree about the fact that decides the instrument.`,
        );
      }

      // (11d) …and the camera instrument may not lose its camera. See
      // CAMERA_CONDITION_RE for what this reaches and what it does not.
      if (instrument === "електронен фиш") {
        if (!CAMERA_CONDITION_RE.test(anchorText(scope))) {
          problems.push(
            `${penaltyId}.${field}: „електронен фиш" is the paper a CAMERA issues with no officer and no driver present, and ${act.abbrBg} ${c.ref}${c.paragraphRef ? `, ${c.paragraphRef}` : ""} never says the offence is „установено и заснето с автоматизирано техническо средство" — so it is not the provision that authorises one.`,
          );
        }
        if (!CAMERA_CONDITION_RE.test(anchorText(shownBg))) {
          problems.push(
            `${penaltyId}.${field}: the quote shown drops „установено и заснето с автоматизирано техническо средство" — the student is told the ticket arrives by post without being shown the one fact that makes that true.`,
          );
        }
      }
    }

    /**
     * (4) A QUOTE OUT OF A SUPERSEDED TEXT. The corpus deliberately holds
     * Наредба № Iз-2539 twice. Pointing at the 2025 snapshot is allowed — but
     * only for wording the 2026 consolidation still carries. Quote a sentence
     * the amendment rewrote and the citation is telling a student that the
     * repealed text is the наредба.
     */
    const successorId = SUPERSEDED_BY.get(c.actId);
    const successor = successorId === undefined ? undefined : acts.get(successorId);
    if (successor !== undefined) {
      const newUnit = successor.units.find((u) => u.ref === c.ref);
      const newText = newUnit === undefined ? "" : normaliseForMatch(newUnit.textBg);
      for (const [name, quote] of [
        ["quote", c.quoteBg],
        ["contextQuote", c.contextQuoteBg],
      ] as const) {
        if (quote === undefined) continue;
        if (!newText.includes(normaliseForMatch(quote))) {
          problems.push(
            `${penaltyId}.${field}: ${name} is cut from the superseded ${act.abbrBg} and the current text (${successor.abbrBg}, ${successor.consolidatedThroughBg ?? "?"}) no longer contains it — cite the consolidation, or say in noteBg that the passage was repealed: "${quote.slice(0, 60)}…"`,
          );
        }
      }
    }
  };

  for (const p of penalties) {
    const conduct = p.conduct;
    check(p.id, "fine.source", p.fine.source, {
      mustContain:
        p.fine.status === "grounded" && p.fine.amountBgn !== null
          ? `${p.fine.amountBgn} лв.`
          : undefined,
      status: p.fine.status,
      conduct,
    });
    // NOT the offence check: `instrumentSource` cites чл. 186 / чл. 189, which
    // are about the PAPER the fine arrives on and name no offence at all — so
    // it is passed no status and no conduct, and (3) and (5b) skip it. It gets
    // check (11) instead, which asks the same question of the paper that (5b)
    // asks of the offence: is this provision about the thing the row claims?
    if (p.fine.instrumentSource) {
      check(p.id, "fine.instrumentSource", p.fine.instrumentSource, {
        // `instrument` is non-null whenever `instrumentSource` is — the schema
        // refuses any other pairing — but verifyCitations is exported and gets
        // hand-built rows in tests, so the invariant is asserted, not assumed.
        instrument: p.fine.instrument ?? undefined,
        banStatus: p.disqualification.status,
      });
      if (p.fine.instrument === null) {
        problems.push(
          `${p.id}.fine.instrumentSource: a rule is cited for an instrument the row does not name — instrument and instrumentSource stand or fall together`,
        );
      }
    } else if (p.fine.instrument !== null) {
      problems.push(
        `${p.id}.fine: the row says the fine arrives as „${p.fine.instrument}" and cites no rule that permits it — an instrument asserted without its article is exactly the free recall ADR-002 forbids`,
      );
    }
    check(p.id, "controlPoints.source", p.controlPoints.source, {
      mustContain:
        p.controlPoints.status === "grounded" && p.controlPoints.points !== null
          ? `${p.controlPoints.points} контролни точки`
          : undefined,
      status: p.controlPoints.status,
      conduct,
    });
    // The ban is quoted in the act's own words rather than rendered from
    // `months`, because ЗДвП writes periods both ways („6 месеца" in чл. 174,
    // „два месеца" in чл. 182) and a rendered number would be our wording.
    check(p.id, "disqualification.source", p.disqualification.source, {
      mustContain: p.disqualification.durationBg ?? undefined,
      status: p.disqualification.status,
      conduct,
    });
    // …and the quotes must between them actually say „лишаване". ЗДвП чл. 174,
    // ал. 1 names the sanction in the alinea's opening sentence and puts the
    // period in a numbered point below it, so the word and the duration land in
    // quoteBg and contextQuoteBg respectively — either may carry it, but a pair
    // that never says „лишаване" is grounding a ban on a sentence about money.
    if (p.disqualification.status === "grounded") {
      const said = [p.disqualification.source.quoteBg, p.disqualification.source.contextQuoteBg]
        .filter((q): q is string => q !== undefined)
        .some((q) => normaliseForMatch(q).includes("лишаван"));
      if (!said) {
        problems.push(
          `${p.id}.disqualification.source: quotes state a period but never the word „лишаване" — "${p.disqualification.source.quoteBg.slice(0, 70)}…"`,
        );
      }
    }
    if (p.examPoints) {
      check(p.id, "examPoints.source", p.examPoints.source, {
        mustContain:
          p.examPoints.status === "grounded" && p.examPoints.points !== null
            ? `${p.examPoints.points} наказателни точки`
            : undefined,
        status: p.examPoints.status,
        conduct,
      });
    }
    problems.push(...conductProblems(p, acts));
    problems.push(...labelProblems(p, acts));
  }
  problems.push(...separationProblems(penalties));
  return problems;
}

function build(): LawCorpus {
  const dir = contentLawDir();

  const sources = parseOrThrow<LawSourceRegister>(
    LawSourceRegisterSchema,
    readJson(path.join(dir, "sources.json")),
    "content/law/sources.json",
  );

  const acts = new Map<string, LawAct>();
  for (const actId of ACT_IDS) {
    const act = parseOrThrow<LawAct>(
      LawActSchema,
      readJson(path.join(dir, "acts", `${actId}.json`)),
      `content/law/acts/${actId}.json`,
    );
    if (act.actId !== actId) {
      throw new Error(`content/law/acts/${actId}.json declares actId "${act.actId}"`);
    }
    if (!sources.sources.some((s) => s.id === act.sourceId && s.coverage === "full-text")) {
      throw new Error(
        `act "${actId}" cites sourceId "${act.sourceId}", which is not a full-text source in sources.json`,
      );
    }
    acts.set(actId, act);
  }

  const bank = parseOrThrow<PenaltyBank>(
    PenaltyBankSchema,
    readJson(path.join(dir, "penalties.json")),
    "content/law/penalties.json",
  );

  const problems = verifyCitations(acts, bank.penalties);
  if (problems.length > 0) {
    throw new Error(
      `content/law/penalties.json cites text that is not in the corpus (ADR-002 violation):\n  ${problems.join("\n  ")}`,
    );
  }

  return { acts, sources, penalties: Object.freeze(bank.penalties) };
}

let cached: LawCorpus | null = null;

export function getLawCorpus(): LawCorpus {
  if (!cached) cached = build();
  return cached;
}

/** Test seam: forget the cache so a fixture directory can be loaded. */
export function resetLawCorpus(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export function getAct(actId: string): LawAct | undefined {
  return getLawCorpus().acts.get(actId);
}

export function getSource(sourceId: string): LawSource | undefined {
  return getLawCorpus().sources.sources.find((s) => s.id === sourceId);
}

/** "ЗДвП, чл. 183, ал. 4, т. 14 (консолидиран текст, изм. ДВ, бр. 55 от 16.06.2026 г.)" */
export function formatCitation(
  act: LawAct,
  ref: string,
  parts: { paragraphRef?: string; pointRef?: string } = {},
): string {
  const head = [act.abbrBg, ref, parts.paragraphRef, parts.pointRef].filter(Boolean).join(", ");
  return act.consolidatedThroughBg ? `${head} (${act.consolidatedThroughBg})` : head;
}

/**
 * THE retrieval call. Ask for an article, get its real text back plus a stable
 * citation — or an explicit miss with the reason. Never throws for a miss and
 * never substitutes a nearby article.
 */
export function getArticle(
  actId: string,
  ref: string,
  parts: { paragraphRef?: string; pointRef?: string } = {},
): LawLookup {
  const act = getAct(actId);
  const normalised = normaliseUnitRef(ref) ?? ref.trim();
  if (!act) {
    return { found: false, reason: "act-not-in-corpus", queriedActId: actId, queriedRef: normalised };
  }
  const unit = act.units.find((u) => u.ref === normalised);
  if (!unit) {
    return { found: false, reason: "unit-not-found", queriedActId: actId, queriedRef: normalised };
  }
  return {
    found: true,
    act,
    unit,
    citationBg: formatCitation(act, unit.ref, parts),
    source: getSource(act.sourceId),
  };
}

/**
 * Resolve a `LawRef` exactly as it is already written across content/ —
 * `{ act: "ЗДвП", ref: "чл. 47" }`. This is what lets a later pass check all
 * 1,089 questions' citations against the statute instead of trusting them.
 */
export function resolveLawRef(lawRef: LawRef): LawLookup {
  const actId = actIdForActName(lawRef.act);
  const normalised = normaliseUnitRef(lawRef.ref) ?? lawRef.ref.trim();
  if (!actId) {
    return { found: false, reason: "act-not-in-corpus", queriedActId: null, queriedRef: normalised };
  }
  return getArticle(actId, normalised);
}

/** Resolve the unit a penalty citation points at (with its verbatim quote). */
export function resolveCitation(c: PenaltyCitation): LawLookup {
  return getArticle(c.actId, c.ref, { paragraphRef: c.paragraphRef, pointRef: c.pointRef });
}

// ---------------------------------------------------------------------------
// Penalties
// ---------------------------------------------------------------------------

export function listPenalties(): readonly PenaltyEntry[] {
  return getLawCorpus().penalties;
}

export function getPenalty(id: string): PenaltyEntry | undefined {
  return getLawCorpus().penalties.find((p) => p.id === id);
}

/** Every penalty whose lawRefs touch this article — the bridge from a question. */
export function penaltiesForArticle(actId: string, ref: string): PenaltyEntry[] {
  const normalised = normaliseUnitRef(ref) ?? ref.trim();
  return getLawCorpus().penalties.filter((p) =>
    [
      p.fine.source,
      p.controlPoints.source,
      p.disqualification.source,
      ...(p.examPoints ? [p.examPoints.source] : []),
    ].some((c) => c.actId === actId && c.ref === normalised),
  );
}

/**
 * What a component may show for one figure. The founder's ruling, executable:
 * when the figure is not grounded there is NO number — the caller gets the rule
 * and the article instead, and cannot accidentally render a placeholder digit.
 */
export interface FigureDisplay {
  /** null = show no number at all. */
  valueBg: string | null;
  citationBg: string;
  /** Verbatim words the figure (or its absence) rests on. */
  quoteBg: string;
  /** Verbatim words naming the offence, when the act separates the two. */
  contextQuoteBg: string | null;
  /**
   * The act's own words for the offence this figure prices — the fragment the
   * loader verified is really inside the quotes above. A renderer can highlight
   * it so the student's eye lands on the sentence that is about HIM rather than
   * on the header that happens to carry the number.
   */
  offencePhraseBg: string | null;
  noteBg: string | null;
  /**
   * THE INSTRUMENT, AND THE ARTICLE THAT AUTHORISES IT — populated by
   * `describeFine`, null on every other figure.
   *
   * `valueBg` carries the instrument inside the money string („51,13 € (100
   * лв.) (електронен фиш)") because the two are one fact for a student. That
   * string is a real-world consequence — who may issue the ticket, whether a
   * лишаване can ride along, whether it lands on the car's owner weeks later —
   * and until check (11) nothing tied it to a provision. The load now refuses a
   * wrong pairing; these three fields let the screen SHOW the pairing instead
   * of asserting it, which is what THEO-4 asks of every decision we state.
   */
  instrumentBg: string | null;
  instrumentCitationBg: string | null;
  instrumentQuoteBg: string | null;
}

function describe(
  valueBg: string | null,
  citation: PenaltyCitation,
  noteBg: string | null,
  instrument: { instrument: FineInstrument; source: PenaltyCitation } | null = null,
): FigureDisplay {
  const lookup = resolveCitation(citation);
  const rule = instrument === null ? null : resolveCitation(instrument.source);
  return {
    valueBg,
    citationBg: lookup.found ? lookup.citationBg : `${citation.ref} (извън наличния корпус)`,
    quoteBg: citation.quoteBg,
    contextQuoteBg: citation.contextQuoteBg ?? null,
    offencePhraseBg: citation.offencePhraseBg ?? null,
    noteBg,
    instrumentBg: instrument === null ? null : instrument.instrument,
    instrumentCitationBg:
      instrument === null || rule === null
        ? null
        : rule.found
          ? rule.citationBg
          : `${instrument.source.ref} (извън наличния корпус)`,
    instrumentQuoteBg: instrument === null ? null : instrument.source.quoteBg,
  };
}

export function describeFine(p: PenaltyEntry): FigureDisplay {
  // The instrument rides in the value string because „51,13 €" and „51,13 € с
  // електронен фиш" are different facts for a student: the second one says the
  // ticket can arrive by post, weeks later, addressed to whoever owns the car.
  // Null instrument = not established, so the amount is shown bare.
  //
  // CURRENCY. `amountBgn` is the statute's figure and stays the statute's
  // figure — the quote beside it says „100 лв." and the two must agree. What a
  // student cannot do is PAY in лева: Bulgaria has been in the eurozone since
  // 2026-01-01 and the фиш is denominated in euro. So both are rendered, euro
  // first, by the one converter in `lib/content/money`.
  const instrument = p.fine.instrument === null ? "" : ` (${p.fine.instrument})`;
  return describe(
    p.fine.amountBgn === null ? null : `${bgnWithEurBg(p.fine.amountBgn)}${instrument}`,
    p.fine.source,
    p.fine.noteBg,
    // Both or neither — the schema keeps them paired, and check (11) keeps the
    // pairing honest, so a renderer can print the instrument and its article
    // side by side without deciding anything itself.
    p.fine.instrument !== null && p.fine.instrumentSource !== null
      ? { instrument: p.fine.instrument, source: p.fine.instrumentSource }
      : null,
  );
}

/**
 * Months without the licence. Renders `durationBg` — the act's own words — and
 * never a number we composed. "not-listed" is a real answer here and worth
 * showing: „не се предвижда лишаване от право" is the sentence that explains
 * why the same offence can arrive as a фиш rather than an акт.
 */
export function describeDisqualification(p: PenaltyEntry): FigureDisplay {
  const d = p.disqualification;
  const valueBg =
    d.status === "not-listed" ? "не се предвижда лишаване от право" : d.durationBg;
  return describe(valueBg, d.source, d.noteBg);
}

export function describeControlPoints(p: PenaltyEntry): FigureDisplay {
  return describe(
    p.controlPoints.points === null ? null : `${p.controlPoints.points} контролни точки`,
    p.controlPoints.source,
    p.controlPoints.noteBg,
  );
}

export function describeExamPoints(p: PenaltyEntry): FigureDisplay | null {
  if (!p.examPoints) return null;
  const cls = p.examPoints.errorClassBg ? ` (${p.examPoints.errorClassBg} грешка)` : "";
  return describe(
    p.examPoints.points === null ? null : `${p.examPoints.points} наказателни точки${cls}`,
    p.examPoints.source,
    p.examPoints.noteBg,
  );
}
