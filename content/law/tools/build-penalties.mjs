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
  ["zdvp", "naredba-iz-2539", "naredba-38"].map((id) => [
    id,
    JSON.parse(readFileSync(path.join(OUT, "acts", `${id}.json`), "utf8")),
  ]),
);

/** Pull the verbatim line containing `needle` out of act/unit; fail loudly. */
function quote(actId, ref, needle, { maxLen = 400 } = {}) {
  const unit = acts[actId].units.find((u) => u.ref === ref);
  if (!unit) throw new Error(`no ${actId} ${ref}`);
  const flat = unit.textBg.replace(/\s+/g, " ");
  const i = flat.indexOf(needle);
  if (i < 0) throw new Error(`locator not found in ${actId} ${ref}: ${needle}`);
  const start = i;
  let end = Math.min(flat.length, i + needle.length);
  // A locator that already ends the clause is the quote; widening past it only
  // drags in the next numbered point.
  if (/[:;.]$/.test(needle.trim())) return flat.slice(start, end).trim();
  while (end < flat.length && flat[end] !== ";" && end - i < maxLen) end += 1;
  return flat.slice(start, Math.min(end + 1, start + maxLen)).trim();
}

/**
 * `needle` locates the text that STATES THE FIGURE; `contextNeedle` (optional)
 * locates the numbered point that names the offence. Bulgarian penalty articles
 * separate the two, and the loader refuses a grounded figure whose quote does
 * not contain the number.
 */
const src = (actId, ref, needle, extra = {}) => {
  const { contextNeedle, ...rest } = extra;
  return {
    actId,
    ref,
    ...rest,
    quoteBg: quote(actId, ref, needle),
    ...(contextNeedle ? { contextQuoteBg: quote(actId, ref, contextNeedle) } : {}),
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
 * CORRECTED 2026-08-05. Three of the six entries called for an акт on the
 * inference „контролни точки се отнемат само с наказателно постановление, значи
 * по акт". ДВ, бр. 64 от 2025 г. (в сила от 7.09.2025 г.) killed it inside
 * чл. 186, ал. 1 itself: the same amendment that rewrote the алинея added the
 * КОНТРОЛНИ ТОЧКИ to the list of data a ФИШ must carry. A фиш therefore takes
 * points, and чл. 186, ал. 8 closes the loop — an unpaid фиш „се смята за
 * влязло в сила наказателно постановление", which is exactly what Наредба
 * № Iз-2539 чл. 3, ал. 1 requires.
 *
 * So the фиш/акт test is the one чл. 186, ал. 1 actually states and nothing
 * else: is лишаване от право provided for THIS offence? Checked against the
 * corpus, not from memory — чл. 179 contains the word „лишаване" zero times,
 * and in чл. 183 it appears only in ал. 6 (повторно нарушение по ал. 5, т. 1
 * или 2), ал. 7 and ал. 8, never in ал. 5 itself.
 */
/**
 * TRIPWIRES. `penalties.json` has no field for these two quotes — they are the
 * REASONING behind the фиш/акт call, not a figure — so they are cut here purely
 * so the build fails if the ground moves. `src()` runs `quote()` eagerly and
 * throws when a locator stops matching, which is the whole contract of this
 * file. Restore `instrument: "акт"` on the three entries below only if one of
 * these two throws.
 */
const TRIPWIRES = [
  // The фиш carries контролни точки (added by ДВ, бр. 64 от 2025 г.).
  src("zdvp", "чл. 186", "за броя контролни точки, които се отнемат.", { paragraphRef: "ал. 1" }),
  // ...and лишаване enters чл. 183 only at повторно нарушение, i.e. never on a
  // first offence under ал. 5, т. 1/2 — the two entries corrected below.
  src(
    "zdvp",
    "чл. 183",
    "Когато нарушението по ал. 5, т. 1 или 2 е повторно, водачът се наказва с глоба в размер 300 лв. и лишаване от право да управлява моторно превозно средство за срок един месец.",
    { paragraphRef: "ал. 6" },
  ),
];
if (TRIPWIRES.length !== 2) throw new Error("tripwire count changed");
const CP_LIST = src(
  "naredba-iz-2539",
  "чл. 6",
  "За нарушения на Закона за движението по пътищата на водачите на МПС се отнемат контролни точки, както следва",
  { paragraphRef: "ал. 1" },
);
const EXAM_DANGEROUS = src("naredba-38", "приложение № 5", "за опасна грешка се поставят 10 наказателни точки", {
  pointRef: 'т. 10, б. "в"',
});

const penalties = [
  {
    id: "pen-b2-no-stop",
    titleBg: 'Не спира на знак Б2 „Спри! Пропусни движещите се по пътя с предимство!“',
    summaryBg:
      "Спирането е задължително на самата стоп-линия. Без създадена непосредствена опасност нарушението е по чл. 183; ако е създадена опасност — по чл. 179 и вече носи контролни точки.",
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
    examPoints: {
      system: "examPoints",
      status: "grounded",
      points: 10,
      errorClassBg: "опасна",
      source: EXAM_DANGEROUS,
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
      }),
      noteBg:
        "Глобата 200 лв. е размерът по чл. 179, ал. 1 (уводното изречение). Чл. 179 не предвижда лишаване от право да управлява, затова по чл. 186, ал. 1 глобата МОЖЕ да се наложи с фиш. Контролните точки не налагат акт: същият чл. 186, ал. 1 (изм. ДВ, бр. 64 от 2025 г.) изисква фишът да съдържа „за броя контролни точки, които се отнемат“, а неплатеният фиш се смята за влязло в сила наказателно постановление (чл. 186, ал. 8). Акт се съставя, когато нарушителят оспори нарушението или откаже да подпише фиша (чл. 186, ал. 2).",
    },
    controlPoints: {
      system: "controlPoints",
      status: "grounded",
      points: 10,
      source: src(
        "naredba-iz-2539",
        "чл. 6",
        'за неспиране на пътен знак "Спри! Пропусни движещите се по пътя с предимство!", ако от това е създадена непосредствена опасност за движението',
        { paragraphRef: "ал. 1", pointRef: "т. 15" },
      ),
      noteBg: null,
    },
    examPoints: {
      system: "examPoints",
      status: "grounded",
      points: 10,
      errorClassBg: "опасна",
      source: EXAM_DANGEROUS,
      noteBg: null,
    },
    lawRefs: [{ act: "ЗДвП", ref: "чл. 179" }],
    status: "needs-review",
  },
  {
    id: "pen-red-light",
    titleBg: "Преминава при забраняващ сигнал на светофара",
    summaryBg: "Червеното е забрана за преминаване, не покана да се провери дали идва някой.",
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
      }),
      noteBg:
        "Глобата 150 лв. е размерът по чл. 183, ал. 5 (уводното изречение). За нарушението по ал. 5, т. 1 не е предвидено лишаване от право да управлява, затова по чл. 186, ал. 1 глобата може да се наложи с фиш — и фишът носи контролните точки (чл. 186, ал. 1, изм. ДВ, бр. 64 от 2025 г.). Лишаване се появява едва при ПОВТОРНО нарушение (чл. 183, ал. 6: глоба 300 лв. и един месец), а тогава фиш вече е изключен.",
    },
    controlPoints: {
      system: "controlPoints",
      status: "grounded",
      points: 10,
      source: src("naredba-iz-2539", "чл. 6", "за преминаване при сигнал на светофара, който не разрешава преминаването", {
        paragraphRef: "ал. 1",
        pointRef: "т. 20",
      }),
      noteBg: null,
    },
    examPoints: {
      system: "examPoints",
      status: "grounded",
      points: 10,
      errorClassBg: "опасна",
      source: EXAM_DANGEROUS,
      noteBg: "Приложение № 5: „когато изпитваният не изпълни забраняващ сигнал на светофар“.",
    },
    lawRefs: [{ act: "ЗДвП", ref: "чл. 183" }],
    status: "needs-review",
  },
  {
    id: "pen-crosswalk-no-yield",
    titleBg: "Не осигурява предимство на пешеходна пътека",
    summaryBg: "Пешеходецът на пътеката има предимство — спирането не е учтивост, а задължение.",
    fine: {
      system: "fine",
      status: "grounded",
      amountBgn: 150,
      instrument: "акт",
      instrumentSource: AKT,
      source: src("zdvp", "чл. 183", "Наказва се с глоба 150 лв. водач, който:", {
        paragraphRef: "ал. 5",
        pointRef: "т. 2",
        contextNeedle: "не осигури предимство, когато преминава през пешеходна пътека.",
      }),
      noteBg: "Глобата 150 лв. е размерът по чл. 183, ал. 5 (уводното изречение).",
    },
    controlPoints: {
      system: "controlPoints",
      status: "grounded",
      points: 10,
      source: src("naredba-iz-2539", "чл. 6", "за неосигуряване на предимство при преминаване през пешеходна пътека", {
        paragraphRef: "ал. 1",
        pointRef: "т. 21",
      }),
      noteBg: null,
    },
    examPoints: {
      system: "examPoints",
      status: "unknown",
      points: null,
      errorClassBg: null,
      source: EXAM_DANGEROUS,
      noteBg:
        "Приложение № 5 не изброява пешеходната пътека поименно. Попада ли случаят под „създаде предпоставка за допускане на ПТП“ преценява председателят на комисията — затова тук НЕ се показва число.",
    },
    lawRefs: [{ act: "ЗДвП", ref: "чл. 183" }],
    status: "needs-review",
  },
  {
    id: "pen-speeding-urban-11-20",
    titleBg: "Превишена скорост в населено място с 11–20 km/h",
    summaryBg: "Първото стъпало, което вече не е символично — и на изпит е опасна грешка още над 10 km/h.",
    fine: {
      system: "fine",
      status: "grounded",
      amountBgn: 50,
      instrument: "фиш",
      instrumentSource: FISH,
      source: src("zdvp", "чл. 182", "за превишаване от 11 до 20 km/h - с глоба 50 лв.", {
        paragraphRef: "ал. 1",
        pointRef: "т. 2",
      }),
      noteBg: null,
    },
    controlPoints: {
      system: "controlPoints",
      status: "not-listed",
      points: 0,
      source: CP_LIST,
      noteBg:
        "Списъкът по чл. 6, ал. 1 от Наредба № Iз-2539 стига до превишаване над 50 km/h (т. 12–14). Това стъпало не е в него.",
    },
    examPoints: {
      system: "examPoints",
      status: "grounded",
      points: 10,
      errorClassBg: "опасна",
      source: EXAM_DANGEROUS,
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
    fine: {
      system: "fine",
      status: "grounded",
      amountBgn: 500,
      instrument: "акт",
      instrumentSource: AKT,
      source: src("zdvp", "чл. 174", "над 0,5 на хиляда до 0,8 на хиляда включително – за срок от 6 месеца и глоба 500 лв.", {
        paragraphRef: "ал. 1",
        pointRef: "т. 1",
      }),
      noteBg:
        "Заедно с глобата се налага и лишаване от право да управлява за 6 месеца. Точно защото има лишаване, фиш е изключен по чл. 186, ал. 1.",
    },
    controlPoints: {
      system: "controlPoints",
      status: "grounded",
      points: 8,
      source: src("naredba-iz-2539", "чл. 6", "над 0,5 на хиляда до 0,8 на хиляда включително (чл. 174, ал. 1, т. 1 от ЗДвП) - 8 контролни точки", {
        paragraphRef: "ал. 1",
        pointRef: 'т. 1, б. "а"',
      }),
      noteBg: null,
    },
    examPoints: null,
    lawRefs: [{ act: "ЗДвП", ref: "чл. 174" }],
    status: "needs-review",
  },
];

const doc = { version: 1, penalties };
writeFileSync(path.join(OUT, "penalties.json"), JSON.stringify(doc, null, 1) + "\n", "utf8");
console.log(`penalties.json: ${penalties.length} entries, all quotes cut from the corpus.`);
for (const p of penalties) {
  const bits = [
    `глоба ${p.fine.amountBgn} лв. (${p.fine.instrument})`,
    `к.т. ${p.controlPoints.points ?? "—"} [${p.controlPoints.status}]`,
    p.examPoints ? `изп.т. ${p.examPoints.points ?? "—"} [${p.examPoints.status}]` : "изп.т. n/a",
  ];
  console.log(`  ${p.id.padEnd(28)} ${bits.join("  |  ")}`);
}
