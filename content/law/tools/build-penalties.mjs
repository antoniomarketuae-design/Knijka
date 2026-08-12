/**
 * Emit content/law/penalties.json.
 *
 * Every quote is CUT OUT of the stored corpus by a locator, never typed. If a
 * locator stops matching (the law changed, the corpus was rebuilt) this script
 * throws instead of emitting a stale quote — that is the point.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const acts = Object.fromEntries(
  [
    "zdvp",
    "naredba-iz-2539",
    // Наредба № Iз-2539 as consolidated through ДВ, бр. 49 от 2026 г. — the
    // text in force today, and the one every citation below cuts from. The
    // 28.01.2025 snapshot above is kept loaded only for the ONE quote that is
    // deliberately shown as superseded (see pen-alcohol-05-08).
    "naredba-iz-2539-consolidated-dv49-2026",
    "naredba-38",
    // The two 2026 ЗИД acts. `naredba-iz-2539.json` is a 28.01.2025 snapshot of
    // the SARS PDF (measured: HEAD on the pinned URL still returns the recorded
    // 226435 bytes, last-modified 28.01.2025), so it does not carry either
    // amendment. These are held so a figure the snapshot got wrong can be
    // NAMED rather than silently served.
    "naredba-iz-2539-izm-dv22-2026",
    "naredba-iz-2539-izm-dv49-2026",
  ].map((id) => [id, JSON.parse(readFileSync(path.join(OUT, "acts", `${id}.json`), "utf8"))]),
);

/**
 * A full stop is NOT a sentence boundary in Bulgarian legal prose — „чл.",
 * „ал.", „т.", „бр.", „лв.", „г." and „вкл." all end in one, and each of them
 * occurs mid-sentence in the articles quoted below. So a candidate boundary is
 * accepted only when the token in front of the dot is not one of these, or when
 * what follows is unmistakably a new unit („2. …", „(6) …", a capital letter).
 */
const ABBREV_BEFORE_DOT = new Set([
  "чл", "ал", "т", "б", "бр", "г", "гр", "лв", "км", "м", "мм", "кв", "вкл",
  "напр", "др", "пр", "обн", "изм", "доп", "отм", "предл", "сл", "хил", "проц",
  "ЗДвП", "ППЗДвП", "ЗАНН", "ДВ", "ВАС",
]);

/** Does the „." at `i` end a sentence, or an abbreviation inside one? */
function isSentenceEnd(flat, i) {
  const before = /([A-Za-zА-Яа-я]+)\.$/.exec(flat.slice(0, i + 1));
  const after = flat.slice(i + 1);
  const startsNewUnit = /^\s*(?:\(\d{1,2}\)|\d{1,3}\.\s|[А-ЯA-Z])/.test(after);
  if (after.trim().length === 0) return true;
  if (!startsNewUnit) return false;
  // „…глоба 500 лв. 2. над 0,8…" — an abbreviation CAN end a numbered point, but
  // only when the next thing opens a new one. „…600 лв. и два месеца…" may not.
  if (before !== null && ABBREV_BEFORE_DOT.has(before[1])) {
    return /^\s*(?:\(\d{1,2}\)|\d{1,3}\.\s)/.test(after);
  }
  return true;
}

/**
 * Pull the verbatim passage that begins at `needle` out of act/unit, ENDING ON A
 * REAL BOUNDARY — a „;", a „:", or the end of the sentence — and fail loudly if
 * there is none within `maxLen`.
 *
 * WHAT THIS REPLACED. The old loop widened one character at a time until it hit
 * a „;" or ran out of a 400-character budget, and then simply stopped wherever
 * it was. Six quotes in the emitted bank were the budget rather than the law:
 * three of them cut MID-WORD („…до 0,8 на хиляда в", „…на ползвателя, се из",
 * „…1. над 0,5 на хиляда до 0,8") and three ran past the end of their own
 * provision into the next one („…(6) (Нова - ДВ,", three alineas of чл. 189 in
 * a quote about АУАН). Every one of them was rendered to a student as verbatim
 * text of the statute, and `verifyCitations` passed all six, because a
 * truncated prefix of the act IS a substring of the act.
 *
 * A silent truncation is the worst available outcome: it looks like a quotation
 * and is not one. So the budget now raises an error naming the act, the unit and
 * the needle, and the author must either give a locator that ends on a boundary
 * or admit the passage is too long to quote.
 */
function quote(actId, ref, needle, { maxLen = 700 } = {}) {
  const act = acts[actId];
  if (!act) throw new Error(`act not loaded: ${actId}`);
  const unit = act.units.find((u) => u.ref === ref);
  if (!unit) throw new Error(`no ${actId} ${ref}`);
  const flat = unit.textBg.replace(/\s+/g, " ");
  const i = flat.indexOf(needle);
  if (i < 0) throw new Error(`locator not found in ${actId} ${ref}: ${needle}`);
  // A locator that already ends the clause is the quote; widening past it only
  // drags in the next numbered point.
  if (/[:;.]$/.test(needle.trim())) return flat.slice(i, i + needle.length).trim();

  const limit = Math.min(flat.length, i + maxLen);
  for (let end = i + needle.length; end < limit; end += 1) {
    const ch = flat[end];
    if (ch === ";" || ch === ":" || (ch === "." && isSentenceEnd(flat, end))) {
      return flat.slice(i, end + 1).trim();
    }
  }
  // The unit ran out before the budget did. That is a real ending only if the
  // act itself punctuates it; a unit whose text simply stops mid-clause is a
  // defective ingest, and quoting it would hand the reader the same silent
  // truncation from a different direction.
  const tail = flat.slice(i).trim();
  if (flat.length <= limit && /[;:.]$/.test(tail)) return tail;
  throw new Error(
    `no sentence boundary within ${maxLen} chars of the locator in ${actId} ${ref} — ` +
      `refusing to emit a truncated quote. Locator: „${needle}". ` +
      `Text from the locator: „${flat.slice(i, i + 120)}…"`,
  );
}

/**
 * `needle` locates the text that STATES THE FIGURE; `contextNeedle` (optional)
 * locates the numbered point that names the offence. Bulgarian penalty articles
 * separate the two, and the loader refuses a grounded figure whose quote does
 * not contain the number.
 *
 * `offencePhrase` is the third thing, added 2026-08-09, and it is the one the
 * bank had no way to state: the act's own words that say WHICH OFFENCE this
 * figure is the price of. It is verified twice at load — it must occur in the
 * cited unit, and it must occur inside the quotes actually shown to the student
 * — so a figure can no longer be grounded on a sentence about a different
 * offence. See the EXAM_DANGEROUS comment below for what that cost us.
 */
const src = (actId, ref, needle, extra = {}) => {
  const { contextNeedle, offencePhrase, ...rest } = extra;
  return {
    actId,
    ref,
    ...rest,
    quoteBg: quote(actId, ref, needle),
    ...(contextNeedle ? { contextQuoteBg: quote(actId, ref, contextNeedle) } : {}),
    ...(offencePhrase ? { offencePhraseBg: offencePhrase } : {}),
  };
};

const FISH = src(
  "zdvp",
  "чл. 186",
  "За административни нарушения, за които не е предвидено наказание лишаване от право да управлява моторно превозно средство, може да бъде наложена с фиш глоба",
  { paragraphRef: "ал. 1" },
);
const AKT = src(
  "zdvp",
  "чл. 189",
  "Актовете, с които се установяват нарушенията по този закон, се съставят от длъжностните лица на службите за контрол",
  { paragraphRef: "ал. 1" },
);
/**
 * The third instrument, and the one the founder actually received. чл. 189,
 * ал. 4 carries the SAME condition as чл. 186, ал. 1 — no електронен фиш where
 * лишаване от право is provided — so the ban decides all three, not two.
 */
const E_FISH = src(
  "zdvp",
  "чл. 189",
  "За нарушение, установено и заснето с автоматизирано техническо средство или система, за което не е предвидено наказание лишаване от право да се управлява моторно превозно средство",
  { paragraphRef: "ал. 4" },
);
/** The 70 % / 14 days that nobody told him about. */
const E_FISH_DISCOUNT = quote(
  "zdvp",
  "чл. 189",
  "В 14-дневен срок от получаването на електронния фиш собственикът",
);
/**
 * THE ФИШ/АКТ TEST, CORRECTED 2026-08-09.
 *
 * Three of the six entries called for an акт on the inference „контролни точки
 * се отнемат само с влязло в сила наказателно постановление, значи по акт".
 * ДВ, бр. 64 от 2025 г. (в сила от 7.09.2025 г.) killed that inference inside
 * чл. 186, ал. 1 itself: the same amendment added the КОНТРОЛНИ ТОЧКИ to the
 * list of data a ФИШ must carry, and чл. 186, ал. 8 closes the loop — an unpaid
 * фиш „се смята за влязло в сила наказателно постановление". The 2026 ЗИД of
 * Наредба № Iз-2539 then said it outright: points are deducted on a наказателно
 * постановление, a фиш OR an електронен фиш.
 *
 * So the test is the one чл. 186, ал. 1 actually states and nothing else: is
 * ЛИШАВАНЕ ОТ ПРАВО provided for THIS offence? Checked against the corpus, not
 * from memory — чл. 179 contains the word „лишаване" zero times, and in чл. 183
 * it appears only in ал. 6 (повторно нарушение по ал. 5, т. 1 или 2), ал. 7 and
 * ал. 8 — never in ал. 5 itself.
 *
 * TRIPWIRES. `penalties.json` has no field for these two quotes — they are the
 * REASONING behind the фиш/акт call, not a figure — so they are cut here purely
 * so the build FAILS if the ground moves. `src()` runs `quote()` eagerly and
 * throws when a locator stops matching, which is the whole contract of this
 * file. Restore `instrument: "акт"` on the three entries below only if one of
 * these throws.
 */
const TRIPWIRES = [
  // The фиш carries контролни точки (added by ДВ, бр. 64 от 2025 г.).
  src("zdvp", "чл. 186", "за броя контролни точки, които се отнемат.", { paragraphRef: "ал. 1" }),
  // …and an unpaid фиш IS an enforceable наказателно постановление.
  src(
    "zdvp",
    "чл. 186",
    "Издаден фиш, глобата по който не е платена доброволно в 7-дневен срок от датата на издаването му, се смята за влязло в сила наказателно постановление",
    { paragraphRef: "ал. 8" },
  ),
  // …and лишаване enters чл. 183 only at повторно нарушение, i.e. never on a
  // first offence under ал. 5, т. 1/2 — the two entries corrected below.
  src(
    "zdvp",
    "чл. 183",
    "Когато нарушението по ал. 5, т. 1 или 2 е повторно, водачът се наказва с глоба в размер 300 лв. и лишаване от право да управлява моторно превозно средство за срок един месец.",
    { paragraphRef: "ал. 6" },
  ),
];
if (TRIPWIRES.length !== 3) throw new Error("tripwire count changed");

/**
 * The ЗИД tripwires: the two 2026 amendments, cut verbatim. They exist so the
 * staleness notes below can never drift away from what the amending acts say.
 */
/**
 * THE ONLY SENTENCE IN ЗДвП чл. 182 THAT SAYS WHICH LADDER YOU ARE ON.
 *
 * ал. 1 is the in-town ladder and ал. 2 the out-of-town one, and their numbered
 * points are word-for-word identical down to т. 3 („за превишаване от 21 до 30
 * km/h - с глоба 100 лв."). Cite the point alone and the alinea coordinate is
 * decoration: flipping „ал. 1" to „ал. 2" on the founder's own row passed every
 * check in the loader and the whole test suite. It is invisible at т. 3, where
 * both alineas say 100 лв.; at т. 4 in town is 400 лв. and out of town 300.
 *
 * The discriminator is the alinea's opening, so the opening is quoted — and the
 * alinea check that already exists then does the work, because ал. 2 does not
 * contain this sentence. Two words carry it: „максимална" (ал. 2 says only
 * „разрешената скорост") and „в населено място" against „извън населено място".
 * Verified unique: it occurs exactly once in чл. 182.
 */
const URBAN_LADDER = "който превиши разрешената максимална скорост в населено място";

const DV22_ALCOHOL = src(
  "naredba-iz-2539-izm-dv22-2026",
  "§ 3",
  'а) в т. 1, буква "а" думите "8 контролни точки" се заменят с "10 контролни точки";',
);
const DV49_DEDUCTION_BASIS = src("naredba-iz-2539-izm-dv49-2026", "§ 1", "§ 1. В чл. 2 ал. 6 и 7 се изменят така:");

/**
 * WHICH НАРЕДБА № Iз-2539 THIS BANK QUOTES — and why that is one word and not a
 * detail.
 *
 * We hold the наредба TWICE: `naredba-iz-2539.json` is a photograph of the SARS
 * PDF taken 28.01.2025, and `naredba-iz-2539-consolidated-dv49-2026.json` is the
 * text consolidated through ДВ, бр. 49 от 29.05.2026 г. They DISAGREE on figures
 * a student is shown — чл. 6, ал. 1, т. 1, б. „а" reads 8 контролни точки in the
 * snapshot and 10 in the current text; чл. 2, ал. 6 is the restoration ceiling in
 * one and the three deduction bases in the other; т. 12 reaches „с над 50 км/час"
 * in one and „т. 5 и 6" (i.e. over 40 in town) in the other.
 *
 * Until 2026-08-09 every citation here pointed at the SNAPSHOT, because the
 * consolidation had not been ingested. It has been. So the bank now cuts from the
 * text in force, and the citation a student follows lands on the sentence that is
 * actually the law. The snapshot survives in exactly one place — the note on
 * pen-alcohol-05-08 — where it is shown as the superseded figure it is, which is
 * the only honest use for a photograph of an old law.
 */
const IZ2539 = "naredba-iz-2539-consolidated-dv49-2026";

/**
 * Attached to every controlPoints figure we call `grounded` on a point the 2026
 * amendments did not touch. т. 15, т. 20 and т. 21 (the three below) survive the
 * ЗИД-ове of ДВ, бр. 22 and бр. 49 word for word. Two things around them did
 * change, and a student reading „10 контролни точки" deserves both.
 */
const CP_STILL_CURRENT = `Цитатът е от консолидираната редакция на наредбата (ДВ, бр. 49 от 29.05.2026 г.). Самата точка не е засягана от измененията от 2026 г. — те пипат чл. 6, ал. 1, т. 1, 3, 12 – 14 и 16, както и ал. 2. Две неща около нея обаче се промениха: точките вече се отнемат и с фиш, и с електронен фиш, а не само с наказателно постановление (${DV49_DEDUCTION_BASIS.quoteBg} — чл. 2, ал. 6), и по новата ал. 2 на водач със статут „Водач на МПС без наказания“ не се отнемат контролни точки, освен при нарушения с лишаване от право.`;

const CP_LIST = src(
  IZ2539,
  "чл. 6",
  "За нарушения на Закона за движението по пътищата на водачите на МПС се отнемат контролни точки, както следва",
  { paragraphRef: "ал. 1" },
);

/**
 * THE SIX ENUMERATED ОПАСНИ ГРЕШКИ, and the defect that made them one.
 *
 * Наредба № 38, приложение № 5, т. 10, б. „в" states the figure ONCE, in a
 * header — „за опасна грешка се поставят 10 наказателни точки в следните
 * случаи:" — and then lists six indents, each a different offence. The bank had
 * a single shared `EXAM_DANGEROUS` constant whose locator stopped at the first
 * „;", i.e. at the FIRST of the six. All six entries with an examPoints figure
 * carried it, so five of them told a student that his speeding, his failure to
 * stop at Б2 and his failure to yield at a crossing were each priced by the
 * sentence about a traffic light.
 *
 * `verifyCitations` could not see it. It checked that the quote is IN the act
 * and that it CONTAINS the figure — both true of the header for all six — and
 * never that it NAMES THE OFFENCE. It does now, and `offencePhrase` is what it
 * checks against.
 *
 * So the figure and the offence are cut separately, as they are written:
 * `quoteBg` is the header that states the 10, `contextQuoteBg` is the one indent
 * that names this offence, and neither can drift onto another row.
 */
const N38_OPASNA_CASE = {
  svetofar: "когато изпитваният не изпълни забраняващ сигнал на светофар или указания на регулировчик",
  ednoposochno: "когато изпитваният навлезе срещу движението на пътен възел или път с еднопосочно движение",
  znakB2: "когато изпитваният не спре при наличието на пътен знак Б2",
  namesaNaKomisiyata: "при намеса на комисията в управлението на моторното превозно средство",
  predpostavkaZaPTP: "когато изпитваният създаде предпоставка за допускане на ПТП",
  skorost: "когато изпитваният превиши максимално допустимата скорост за движение с повече от 10 km/h",
};

const examDangerous = (caseKey) => {
  const phrase = N38_OPASNA_CASE[caseKey];
  if (!phrase) throw new Error(`unknown опасна грешка case: ${caseKey}`);
  return src("naredba-38", "приложение № 5", "за опасна грешка се поставят 10 наказателни точки", {
    pointRef: 'т. 10, б. "в"',
    contextNeedle: phrase,
    offencePhrase: phrase,
  });
};

/* ------------------------------------------------------------------------ *
 * WHAT EACH ROW IS PRICING — the declaration `offencePhrase` could not be.
 *
 * `offencePhrase` (added earlier the same day) is verified against THE
 * CITATION'S OWN QUOTES. That closes „the quote is about nothing in
 * particular" and leaves „the quote is about somebody else's offence" wide
 * open, because the same hand writes the quote, the context and the phrase.
 * Measured on this bank: give pen-speeding-urban-21-30 the светофар indent in
 * `contextQuoteBg` and repeat it in `offencePhraseBg`, and the loader reports
 * nothing at all. The citation is internally perfect and prices the wrong
 * conduct — which is precisely the defect the phrase was added to stop.
 *
 * So each row now says, once and outside every citation, what it is the price
 * of. `verifyCitations` checks every offence phrase on the row against it.
 *
 * HOW TO WRITE ONE. `anchorsBg` is AND-of-OR: every group must be satisfied,
 * and a group is satisfied by any of its alternatives. Alternatives exist
 * because three acts write one conduct three ways — ЗДвП „за превишаване от
 * 21 до 30 km/h", Наредба № 38 „когато изпитваният превиши максимално
 * допустимата скорост…". Three rules the loader enforces, so the declaration
 * cannot quietly become a rubber stamp:
 *
 *   - every group must be findable in the act this row's `lawRefs` name (so
 *     the anchors are the law's vocabulary, not ours);
 *   - `statementBg` must satisfy the row's own anchors, and every digit in it
 *     must occur inside one (so the human sentence and the machine test cannot
 *     drift, and the declaration never becomes a place a figure hides);
 *   - no alternative may go unused by the row's own phrases. WIDENING IS THE
 *     FAILURE MODE — an anchor list long enough to accept everything is how a
 *     check like this dies, so an unused alternative is refused outright.
 *
 * Keep each group as tight as the row's own phrases allow. The tier groups on
 * the two speeding rows („от 11 до 20" / „от 21 до 30") are not decoration:
 * without them, either row accepts the other's sentence, and „50 лв." would
 * sit under the text of the 100 лв. tier.
 * ------------------------------------------------------------------------ */

/* ------------------------------------------------------------------------ *
 * ЛИШАВАНЕ ОТ ПРАВО — the fourth consequence, and the one that fixes the
 * instrument.
 *
 * `status: "not-listed"` here is a POSITIVE finding, not a gap: the sanction
 * alinea states its penalty exhaustively ("Наказва се с глоба N лв. водач,
 * който: …") and лишаване is not in it, which is precisely what ЗДвП чл. 186,
 * ал. 1 and чл. 189, ал. 4 require before a фиш may issue. Measured against the
 * ingested ЗДвП (консолидиран ДВ, бр. 55 от 16.06.2026 г.), not remembered:
 *   чл. 179 — the word „лишаван" occurs 0 times in the whole article;
 *   чл. 183 — 3 times, all of them in ал. 6 (повторно по ал. 5), ал. 7 and
 *             ал. 8; never in ал. 4 or ал. 5;
 *   чл. 182 — 8 times, the earliest at ал. 1, т. 5 („два месеца"), so every
 *             tier below it is фиш-eligible;
 *   чл. 174 — 3 times, the first in the opening sentence of ал. 1 itself.
 * `scripts/…` is not needed to re-check that: grep the act.
 * ------------------------------------------------------------------------ */

/** No ban is provided by this alinea, so a фиш is lawful. */
const noBan = (source, noteBg) => ({
  system: "disqualification",
  status: "not-listed",
  months: 0,
  durationBg: null,
  source,
  noteBg,
});

const NO_BAN_183_4 = () =>
  noBan(
    src("zdvp", "чл. 183", "Наказва се с глоба 100 лв. водач, който:", { paragraphRef: "ал. 4" }),
    "Алинея 4 изчерпва наказанието с глобата — лишаване от право не се предвижда. Затова по чл. 186, ал. 1 глобата може да дойде с фиш. (В целия чл. 183 „лишаване“ се среща само в ал. 6, ал. 7 и ал. 8 — тоест при повторност и при други състави, не тук.)",
  );
const NO_BAN_183_5 = () =>
  noBan(
    src("zdvp", "чл. 183", "Наказва се с глоба 150 лв. водач, който:", { paragraphRef: "ал. 5" }),
    "Алинея 5 предвижда само глоба. Лишаване се появява едва при ПОВТОРНО нарушение по ал. 5, т. 1 или 2 — чл. 183, ал. 6: „глоба в размер 300 лв. и лишаване от право да управлява моторно превозно средство за срок един месец“. Първото нарушение е без лишаване, затова фиш е допустим.",
  );

const penalties = [
  {
    id: "pen-b2-no-stop",
    titleBg: 'Не спира на знак Б2 „Спри! Пропусни движещите се по пътя с предимство!“',
    summaryBg:
      "Спирането е задължително на самата стоп-линия. Без създадена непосредствена опасност нарушението е по чл. 183; ако е създадена опасност — по чл. 179 и вече носи контролни точки.",
    conduct: {
      statementBg:
        "Водачът не спира на пътен знак Б2 „Спри! Пропусни движещите се по пътя с предимство!“.",
      // „не спира" (ЗДвП) and „не спре" (Наредба № 38) are the same conduct in
      // two acts; „неспиране" is deliberately NOT here — it is how Наредба
      // № Iз-2539 т. 15 writes the DANGER variant, which is the row below, and
      // accepting it here would let the two rows' phrases swap.
      anchorsBg: [["пътен знак"], ["Спри! Пропусни", "Б2"], ["не спира", "не спре"]],
    },
    fine: {
      system: "fine",
      status: "grounded",
      amountBgn: 100,
      instrument: "фиш",
      instrumentSource: FISH,
      source: src("zdvp", "чл. 183", "Наказва се с глоба 100 лв. водач, който:", {
        paragraphRef: "ал. 4",
        pointRef: "т. 14",
        contextNeedle: 'не спира на пътен знак "Спри! Пропусни движещите се по пътя с предимство!"',
        offencePhrase: 'не спира на пътен знак "Спри! Пропусни движещите се по пътя с предимство!"',
      }),
      noteBg:
        "Глобата 100 лв. е размерът по чл. 183, ал. 4 (уводното изречение на алинеята). Наказание лишаване от право не е предвидено, затова може да се наложи с фиш.",
    },
    controlPoints: {
      system: "controlPoints",
      status: "not-listed",
      points: 0,
      source: CP_LIST,
      noteBg:
        "Чл. 183, ал. 4, т. 14 не фигурира в списъка по чл. 6, ал. 1 от Наредба № Iз-2539. Контролни точки се отнемат САМО за изброените там нарушения.",
    },
    disqualification: NO_BAN_183_4(),
    examPoints: {
      system: "examPoints",
      status: "grounded",
      points: 10,
      errorClassBg: "опасна",
      source: examDangerous("znakB2"),
      noteBg:
        "Приложение № 5 изброява изрично „когато изпитваният не спре при наличието на пътен знак Б2“ като опасна грешка.",
    },
    lawRefs: [{ act: "ЗДвП", ref: "чл. 183" }],
    status: "needs-review",
  },
  {
    id: "pen-b2-no-stop-danger",
    titleBg: "Не спазва предписанието на пътен знак / правилата за предимство и създава непосредствена опасност",
    summaryBg:
      "Същото поведение, но когато от него е произлязла непосредствена опасност, минава по чл. 179, ал. 1, т. 5 — по-висока глоба И контролни точки.",
    conduct: {
      statementBg:
        "Водачът не спазва предписанието на пътните знаци или правилата за предимство и от това е създадена непосредствена опасност за движението.",
      // The three acts describe this at three widths — чл. 179 „предписанието
      // на пътните знаци" (any sign), Наредба № Iз-2539 т. 15 „неспиране на
      // пътен знак Спри!", Наредба № 38 „не спре при наличието на пътен знак
      // Б2" — so the intersection is the sign plus the failure, and it cannot
      // include „непосредствена опасност": приложение № 5 has no danger
      // variant, it marks the failure to stop either way. That the exam sheet
      // does not distinguish the two rows is a fact about the exam sheet, and
      // it is the one legitimate overlap the discrimination test records.
      anchorsBg: [
        ["пътен знак", "пътните знаци"],
        ["не спазва предписанието", "неспиране", "не спре"],
      ],
    },
    fine: {
      system: "fine",
      status: "grounded",
      amountBgn: 200,
      instrument: "фиш",
      instrumentSource: FISH,
      source: src("zdvp", "чл. 179", "Наказва се с глоба в размер 200 лв.:", {
        paragraphRef: "ал. 1",
        pointRef: "т. 5",
        contextNeedle: "който не спазва предписанието на пътните знаци, пътната маркировка",
        // The WHOLE of т. 5, minus the „който" that grammatically belongs to
        // the alinea's opening. The short form („не спазва предписанието на
        // пътните знаци") named a general offence that чл. 179 does not price
        // on its own: what costs 200 лв. and 10 контролни точки is that clause
        // WITH „ако от това е създадена непосредствена опасност" — the element
        // that is the entire difference between this row and the one above.
        offencePhrase:
          "не спазва предписанието на пътните знаци, пътната маркировка и другите средства за сигнализиране, правилата за предимство, за разминаване, за изпреварване или за заобикаляне, ако от това е създадена непосредствена опасност за движението",
      }),
      noteBg:
        "Глобата 200 лв. е размерът по чл. 179, ал. 1 (уводното изречение). Чл. 179 не предвижда лишаване от право да управлява, затова по чл. 186, ал. 1 глобата МОЖЕ да се наложи с фиш. Контролните точки не налагат акт: същият чл. 186, ал. 1 (изм. ДВ, бр. 64 от 2025 г.) изисква фишът да съдържа „за броя контролни точки, които се отнемат“, а неплатеният фиш се смята за влязло в сила наказателно постановление (чл. 186, ал. 8). Акт се съставя, когато нарушителят оспори нарушението или откаже да подпише фиша (чл. 186, ал. 2).",
    },
    controlPoints: {
      system: "controlPoints",
      status: "grounded",
      points: 10,
      source: src(
        IZ2539,
        "чл. 6",
        'за неспиране на пътен знак "Спри! Пропусни движещите се по пътя с предимство!", ако от това е създадена непосредствена опасност за движението',
        {
          paragraphRef: "ал. 1",
          pointRef: "т. 15",
          // THE CONDITION IS PART OF THE OFFENCE, and cutting it here was the
          // same defect as cutting it out of the чл. 179 phrase: т. 15 does not
          // take 10 контролни точки for missing a Б2, it takes them for missing
          // one „ако от това е създадена непосредствена опасност за движението".
          // A phrase that stops at the sign prices pen-b2-no-stop's conduct —
          // which costs 0 точки — with pen-b2-no-stop-danger's figure. The
          // loader now refuses a phrase whose act goes on with „ако"/„когато".
          offencePhrase:
            'за неспиране на пътен знак "Спри! Пропусни движещите се по пътя с предимство!", ако от това е създадена непосредствена опасност за движението',
        },
      ),
      noteBg: CP_STILL_CURRENT,
    },
    disqualification: noBan(
      src("zdvp", "чл. 179", "Наказва се с глоба в размер 200 лв.:", { paragraphRef: "ал. 1" }),
      "Чл. 179 не предвижда лишаване от право никъде — думата „лишаван“ не се среща в целия член. Затова е допустим фиш по чл. 186, ал. 1, въпреки че нарушението струва и 10 контролни точки: от 2025 – 2026 г. фишът носи точките сам (чл. 186, ал. 1; Наредба № Iз-2539, чл. 2, ал. 6).",
    ),
    examPoints: {
      system: "examPoints",
      status: "grounded",
      points: 10,
      errorClassBg: "опасна",
      // The same Б2 indent as the entry above: приложение № 5 marks the failure
      // to stop, and does not have a separate, harsher case for having created
      // danger by it. The road articles are what distinguish the two, not the
      // exam sheet.
      source: examDangerous("znakB2"),
      noteBg:
        "Изпитният лист не прави разликата, която пътят прави: приложение № 5 наказва самото неспиране на знак Б2 с 10 наказателни точки, независимо дали от него е произлязла опасност. Разликата (100 срещу 200 лв. и 0 срещу 10 контролни точки) е в ЗДвП и в наредбата за контролните точки, не в изпита.",
    },
    lawRefs: [{ act: "ЗДвП", ref: "чл. 179" }],
    status: "needs-review",
  },
  {
    id: "pen-red-light",
    titleBg: "Преминава при забраняващ сигнал на светофара",
    summaryBg: "Червеното е забрана за преминаване, не покана да се провери дали идва някой.",
    conduct: {
      statementBg: "Водачът преминава при сигнал на светофара, който не разрешава преминаването.",
      // The tightest declaration in the bank, because all three acts happen to
      // use the same two words. This is the row the other six were priced by.
      anchorsBg: [["светофар"], ["сигнал"]],
    },
    fine: {
      system: "fine",
      status: "grounded",
      amountBgn: 150,
      instrument: "фиш",
      instrumentSource: FISH,
      source: src("zdvp", "чл. 183", "Наказва се с глоба 150 лв. водач, който:", {
        paragraphRef: "ал. 5",
        pointRef: "т. 1",
        contextNeedle: "преминава при сигнал на светофара, който не разрешава преминаването",
        offencePhrase: "преминава при сигнал на светофара, който не разрешава преминаването",
      }),
      noteBg:
        "Глобата 150 лв. е размерът по чл. 183, ал. 5 (уводното изречение). За нарушението по ал. 5, т. 1 не е предвидено лишаване от право да управлява, затова по чл. 186, ал. 1 глобата може да се наложи с фиш — и фишът носи контролните точки (чл. 186, ал. 1, изм. ДВ, бр. 64 от 2025 г.). Лишаване се появява едва при ПОВТОРНО нарушение (чл. 183, ал. 6: глоба 300 лв. и един месец), а тогава фиш вече е изключен.",
    },
    controlPoints: {
      system: "controlPoints",
      status: "grounded",
      points: 10,
      source: src(IZ2539, "чл. 6", "за преминаване при сигнал на светофара, който не разрешава преминаването", {
        paragraphRef: "ал. 1",
        pointRef: "т. 20",
        offencePhrase: "за преминаване при сигнал на светофара, който не разрешава преминаването",
      }),
      noteBg: CP_STILL_CURRENT,
    },
    disqualification: NO_BAN_183_5(),
    examPoints: {
      system: "examPoints",
      status: "grounded",
      points: 10,
      errorClassBg: "опасна",
      source: examDangerous("svetofar"),
      noteBg: "Приложение № 5: „когато изпитваният не изпълни забраняващ сигнал на светофар“.",
    },
    lawRefs: [{ act: "ЗДвП", ref: "чл. 183" }],
    status: "needs-review",
  },
  {
    id: "pen-crosswalk-no-yield",
    titleBg: "Не осигурява предимство на пешеходна пътека",
    summaryBg: "Пешеходецът на пътеката има предимство — спирането не е учтивост, а задължение.",
    conduct: {
      statementBg:
        "Водачът не осигурява предимство на пешеходец, когато преминава през пешеходна пътека.",
      anchorsBg: [["пешеходна пътека"], ["предимство"]],
    },
    fine: {
      system: "fine",
      status: "grounded",
      amountBgn: 150,
      instrument: "фиш",
      instrumentSource: FISH,
      source: src("zdvp", "чл. 183", "Наказва се с глоба 150 лв. водач, който:", {
        paragraphRef: "ал. 5",
        pointRef: "т. 2",
        contextNeedle: "не осигури предимство, когато преминава през пешеходна пътека.",
        offencePhrase: "не осигури предимство, когато преминава през пешеходна пътека",
      }),
      noteBg:
        "Глобата 150 лв. е размерът по чл. 183, ал. 5 (уводното изречение). Както при т. 1: ал. 5 не предвижда лишаване от право, затова фиш е допустим по чл. 186, ал. 1, а фишът вече носи и контролните точки (изм. ДВ, бр. 64 от 2025 г.).",
    },
    controlPoints: {
      system: "controlPoints",
      status: "grounded",
      points: 10,
      source: src(IZ2539, "чл. 6", "за неосигуряване на предимство при преминаване през пешеходна пътека", {
        paragraphRef: "ал. 1",
        pointRef: "т. 21",
        offencePhrase: "за неосигуряване на предимство при преминаване през пешеходна пътека",
      }),
      noteBg: CP_STILL_CURRENT,
    },
    disqualification: NO_BAN_183_5(),
    examPoints: {
      system: "examPoints",
      status: "unknown",
      points: null,
      errorClassBg: null,
      // The ONLY indent of б. „в" this case could fall under — and it falls
      // under it by a judgement the председател makes, not by name. Cited so the
      // student can read the actual test instead of a number we do not have.
      source: examDangerous("predpostavkaZaPTP"),
      noteBg:
        "Приложение № 5 не изброява пешеходната пътека поименно. Попада ли случаят под „създаде предпоставка за допускане на ПТП“ преценява председателят на комисията — затова тук НЕ се показва число.",
    },
    lawRefs: [{ act: "ЗДвП", ref: "чл. 183" }],
    status: "needs-review",
  },
  {
    id: "pen-speeding-urban-11-20",
    titleBg: "Превишена скорост в населено място с 11–20 km/h",
    // (see URBAN_LADDER above — every чл. 182 citation on the two speeding rows
    // must show the opening that says WHICH ladder it is on.)
    summaryBg: "Първото стъпало, което вече не е символично — и на изпит е опасна грешка още над 10 km/h.",
    conduct: {
      statementBg:
        "Водачът превишава разрешената максимална скорост в населено място — превишаване от 11 до 20 km/h.",
      // THE TIER GROUP IS THE WHOLE POINT of this pair. Without it, „за
      // превишаване от 21 до 30 km/h" satisfies this row too, and 50 лв. can be
      // shown under the sentence that prices 100 лв. — a swap this bank's other
      // checks pass, because both sentences live in чл. 182 and the quote that
      // states the figure is a different string from the one that names the
      // offence. „с повече от 10 km/h" is Наредба № 38's threshold and belongs
      // to both speeding rows honestly: the exam sheet does not grade in tiers.
      anchorsBg: [
        ["превишаване", "превиши"],
        ["от 11 до 20", "с повече от 10 km/h"],
      ],
    },
    fine: {
      system: "fine",
      status: "grounded",
      amountBgn: 50,
      instrument: "електронен фиш",
      instrumentSource: E_FISH,
      source: src("zdvp", "чл. 182", "за превишаване от 11 до 20 km/h - с глоба 50 лв.", {
        paragraphRef: "ал. 1",
        contextNeedle: URBAN_LADDER,
        pointRef: "т. 2",
        offencePhrase: "за превишаване от 11 до 20 km/h",
      }),
      noteBg: `Скоростта е нарушението, което най-често пристига по пощата: щом за него не е предвидено лишаване от право, камера може да издаде електронен фиш в отсъствието и на контролен орган, и на нарушител (чл. 189, ал. 4). Същото стъпало може да се наложи и с обикновен фиш, ако те спрат на място (чл. 186, ал. 1) — разликата е в отстъпката: 70 на сто в 14 дни по електронния фиш („${E_FISH_DISCOUNT}“ — чл. 189, ал. 5г) срещу 80 на сто в 7 дни по обикновения (чл. 186, ал. 7).`,
    },
    controlPoints: {
      system: "controlPoints",
      status: "not-listed",
      points: 0,
      source: CP_LIST,
      noteBg:
        "Цитираният списък е консолидираната редакция на чл. 6, ал. 1 (ДВ, бр. 49 от 29.05.2026 г.) — тоест текстът, който е в сила днес, а не снимката от 2025 г. И в него това стъпало го няма: скоростните точки са т. 12 – 14 (18/21/26 контролни точки) и сочат чл. 182, ал. 1, т. 5 и 6 — превишаване над 40 и над 50 km/h. Превишаването с 11 – 20 km/h остава извън списъка, тоест струва пари и нула контролни точки.",
    },
    disqualification: noBan(
      src("zdvp", "чл. 182", "за превишаване от 11 до 20 km/h - с глоба 50 лв.", {
        paragraphRef: "ал. 1",
        contextNeedle: URBAN_LADDER,
        pointRef: "т. 2",
        offencePhrase: "за превишаване от 11 до 20 km/h",
      }),
      "Точката изчерпва наказанието с глобата. В стълбицата на чл. 182, ал. 1 лишаване се появява едва в т. 5 — „за превишаване над 40 km/h - с глоба 600 лв. и два месеца лишаване от право да управлява моторно превозно средство“ — и точно оттам нагоре и фиш, и електронен фиш стават недопустими, а нарушението почва да струва и 18 контролни точки. Долните стъпала не струват нито точка, нито ден без книжка.",
    ),
    examPoints: {
      system: "examPoints",
      status: "grounded",
      points: 10,
      errorClassBg: "опасна",
      source: examDangerous("skorost"),
      noteBg:
        "Приложение № 5: „когато изпитваният превиши максимално допустимата скорост за движение с повече от 10 km/h“.",
    },
    lawRefs: [{ act: "ЗДвП", ref: "чл. 182" }],
    status: "needs-review",
  },
  {
    id: "pen-alcohol-05-08",
    titleBg: "Управление с алкохол над 0,5 до 0,8 на хиляда",
    summaryBg: "Три различни санкции наведнъж: пари, месеци без книжка и контролни точки.",
    conduct: {
      statementBg:
        "Водачът управлява с концентрация на алкохол в кръвта над 0,5 на хиляда до 0,8 на хиляда включително.",
      // Both bounds are anchors, so the next rung of чл. 174 („над 0,8 на
      // хиляда до 1,2") cannot be moved onto this row — the two sentences are
      // otherwise near-identical and sit in the same article.
      anchorsBg: [["на хиляда"], ["над 0,5"], ["до 0,8"]],
    },
    fine: {
      system: "fine",
      status: "grounded",
      amountBgn: 500,
      instrument: "акт",
      instrumentSource: AKT,
      source: src("zdvp", "чл. 174", "над 0,5 на хиляда до 0,8 на хиляда включително – за срок от 6 месеца и глоба 500 лв.", {
        paragraphRef: "ал. 1",
        pointRef: "т. 1",
        offencePhrase: "над 0,5 на хиляда до 0,8 на хиляда включително",
      }),
      noteBg:
        "Заедно с глобата се налага и лишаване от право да управлява за 6 месеца. Точно защото има лишаване, фиш е изключен по чл. 186, ал. 1.",
    },
    controlPoints: {
      /**
       * THE NUMBER THAT WAS WITHHELD, AND IS NOT ANY MORE.
       *
       * This figure has been 8, then nothing, and is now 10. The 8 came out of
       * the 28.01.2025 SARS snapshot and was wrong from 24.02.2026 onwards: ДВ,
       * бр. 22 от 2026 г., § 3 replaced „8 контролни точки" with „10 контролни
       * точки" in exactly this буква. The wave that found that could not print
       * 10 either — typing a figure the corpus cannot cut is the thing ADR-002
       * forbids — so it withheld the number and NAMED the amendment, which was
       * the right call on the evidence it had.
       *
       * The evidence changed. The наредба consolidated through ДВ, бр. 49 от
       * 29.05.2026 г. is ingested, and its чл. 6, ал. 1, т. 1, б. „а" states the
       * 10 in its own words — quoted below, cut not typed. The ЗИД tripwire
       * (`DV22_ALCOHOL`) stays in the note as the second, independent witness:
       * if either text moves, the build throws.
       */
      system: "controlPoints",
      status: "grounded",
      points: 10,
      source: src(IZ2539, "чл. 6", "над 0,5 на хиляда до 0,8 на хиляда включително (чл. 174, ал. 1, т. 1 от ЗДвП) - 10 контролни точки", {
        paragraphRef: "ал. 1",
        pointRef: 'т. 1, б. "а"',
        offencePhrase: "над 0,5 на хиляда до 0,8 на хиляда включително",
      }),
      noteBg: `Числото се промени наскоро и старите учебници още го дават като 8. Цитатът по-горе е от консолидираната редакция на наредбата (ДВ, бр. 49 от 29.05.2026 г.); промяната дойде по-рано, с ДВ, бр. 22 от 24.02.2026 г.: ${DV22_ALCOHOL.quoteBg} Тези 10 контролни точки са ОТ КНИЖКАТА и вървят заедно с 6-те месеца лишаване и глобата от 500 лв. — три отделни наказания за едно и също нарушение.`,
    },
    disqualification: {
      system: "disqualification",
      status: "grounded",
      months: 6,
      durationBg: "за срок от 6 месеца",
      // The period is in the numbered point; the word „лишаване" is in the
      // alinea's opening sentence. Both are cut from чл. 174 and both verified.
      source: src("zdvp", "чл. 174", "над 0,5 на хиляда до 0,8 на хиляда включително – за срок от 6 месеца и глоба 500 лв.", {
        paragraphRef: "ал. 1",
        pointRef: "т. 1",
        contextNeedle: "Наказва се с лишаване от право да управлява моторно превозно средство, трамвай или самоходна машина, който управлява",
        offencePhrase: "над 0,5 на хиляда до 0,8 на хиляда включително",
      }),
      noteBg:
        "Тук лишаването не е добавка към глобата — то е ГЛАВНОТО наказание: чл. 174, ал. 1 започва с „Наказва се с лишаване от право…“, а глобата идва след срока. И точно затова този случай не може да дойде нито с фиш (чл. 186, ал. 1), нито с електронен фиш (чл. 189, ал. 4): и двата текста изключват нарушенията, за които е предвидено лишаване. Съставя се акт и наказанието се налага с наказателно постановление.",
    },
    examPoints: null,
    lawRefs: [{ act: "ЗДвП", ref: "чл. 174" }],
    status: "needs-review",
  },
  /**
   * THE FOUNDER'S OWN TICKET, entered as a worked case: 78 km/h measured on a
   * 50 km/h road, less the 3 km/h максимално допустима грешка = 75, i.e. 25
   * over. It exists because it is the tier the product had no way to describe —
   * a camera fine, in a system that could only say „фиш" or „акт".
   */
  {
    id: "pen-speeding-urban-21-30",
    titleBg: "Превишена скорост в населено място с 21 – 30 km/h",
    summaryBg:
      "Стъпалото, което камерите ловят най-често: пари и нищо друго — нула контролни точки, нула дни без книжка.",
    conduct: {
      statementBg:
        "Водачът превишава разрешената максимална скорост в населено място — превишаване от 21 до 30 km/h.",
      // The founder's own tier. See the 11–20 row for why the tier group is
      // load-bearing rather than tidy.
      anchorsBg: [
        ["превишаване", "превиши"],
        ["от 21 до 30", "с повече от 10 km/h"],
      ],
    },
    fine: {
      system: "fine",
      status: "grounded",
      amountBgn: 100,
      instrument: "електронен фиш",
      instrumentSource: E_FISH,
      source: src("zdvp", "чл. 182", "за превишаване от 21 до 30 km/h - с глоба 100 лв.", {
        paragraphRef: "ал. 1",
        contextNeedle: URBAN_LADDER,
        pointRef: "т. 3",
        offencePhrase: "за превишаване от 21 до 30 km/h",
      }),
      noteBg: `100 лв. по фиксирания курс 1,95583 лв. за евро са 51,13 EUR — сумата, която пише на електронния фиш. Отстъпката, за която мнозина научават късно: „${E_FISH_DISCOUNT}“ (чл. 189, ал. 5г), тоест 70 лв. = 35,79 EUR, ако платиш в 14 дни. Преди да се приложи стъпалото, от измерената скорост се приспада максимално допустимата грешка на камерата (Наредба № 8121з-532, чл. 16, ал. 5, която препраща към чл. 425 от Наредбата за средствата за измерване: ±3 km/h до 100 km/h, ±3 % над 100 km/h) — затова 78 км/ч на път с 50 се разглежда като 75, тоест превишаване с 25.`,
    },
    controlPoints: {
      system: "controlPoints",
      status: "not-listed",
      points: 0,
      source: CP_LIST,
      noteBg:
        "Чл. 6, ал. 1 от Наредба № Iз-2539 е изчерпателен списък и това стъпало не е в него: т. 12 – 14 (в редакцията по ДВ, бр. 49 от 29.05.2026 г., която е цитирана горе) стигат само до чл. 182, ал. 1, т. 5 и 6 — превишаване над 40 и над 50 km/h. Превишаването с 21 – 30 km/h в населено място струва 0 контролни точки — то е пари, не книжка.",
    },
    disqualification: noBan(
      src("zdvp", "чл. 182", "за превишаване от 21 до 30 km/h - с глоба 100 лв.", {
        paragraphRef: "ал. 1",
        contextNeedle: URBAN_LADDER,
        pointRef: "т. 3",
        offencePhrase: "за превишаване от 21 до 30 km/h",
      }),
      "Точката изчерпва наказанието с глобата — няма лишаване. Именно това прави електронния фиш законен: чл. 189, ал. 4 допуска заснемане с камера само за нарушения, „за което не е предвидено наказание лишаване от право да се управлява моторно превозно средство“. Ако същият водач беше карал с над 40 km/h превишаване, камерата НЕ би могла да издаде фиш — по т. 5 идват два месеца лишаване и случаят минава по акт.",
    ),
    examPoints: {
      system: "examPoints",
      status: "grounded",
      points: 10,
      errorClassBg: "опасна",
      source: examDangerous("skorost"),
      noteBg:
        "На практическия изпит същото поведение се брои по съвсем друга скала: Наредба № 38, приложение № 5 дава 10 НАКАЗАТЕЛНИ точки за превишаване с повече от 10 km/h, а изпитът се къса над 9. Тези 10 нямат нищо общо с контролните точки на книжката — те са само в изпитния протокол.",
    },
    lawRefs: [{ act: "ЗДвП", ref: "чл. 182" }],
    status: "needs-review",
  },
];

const doc = { version: 1, penalties };
writeFileSync(path.join(OUT, "penalties.json"), JSON.stringify(doc, null, 1) + "\n", "utf8");
console.log(`penalties.json: ${penalties.length} entries, all quotes cut from the corpus.`);
for (const p of penalties) {
  const bits = [
    `глоба ${p.fine.amountBgn} лв. (${p.fine.instrument ?? "инструмент неустановен"})`,
    `к.т. ${p.controlPoints.points ?? "—"} [${p.controlPoints.status}]`,
    `лиш. ${p.disqualification.durationBg ?? "няма"} [${p.disqualification.status}]`,
    p.examPoints ? `изп.т. ${p.examPoints.points ?? "—"} [${p.examPoints.status}]` : "изп.т. n/a",
  ];
  console.log(`  ${p.id.padEnd(28)} ${bits.join("  |  ")}`);
}
