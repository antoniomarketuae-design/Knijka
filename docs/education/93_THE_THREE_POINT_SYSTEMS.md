# 93 — The three point systems, the speeding ladder, and what we could not find

**Status:** verification record, written 2026-08-09 against the working tree on branch `scenario-engine`.
**Why it exists:** the founder drove a lesson, saw `−10 т.` on the result screen, and read it as his
**licence** being docked. He was right to. In Bulgarian, unqualified „точки" means *контролни* точки —
the 39-point licence budget. He then produced his own електронен фиш (78 km/h measured in a 50 zone,
3 km/h deducted, 51.13 EUR) and asked whether the product could reproduce it.

Everything below was **re-cut from `content/law/acts/*.json` on 2026-08-09** by
`scratchpad/cut.mjs` and by the product's own loader. Nothing is recalled. ADR-002: retrieval and
citation only, never free recall.

---

## 1. His ticket, put through the product

| step | value | where it comes from |
|---|---|---|
| measured | 78 km/h | his електронен фиш |
| minus max permissible instrument error | −3 km/h | НСИПМК чл. 425, ал. 1, т. 2 (≤ 100 km/h) |
| considered speed | 75 km/h | |
| limit | 50 km/h | ЗДвП чл. 21, ал. 1 (населено място, кат. B) |
| excess | **25 km/h** | |
| band | „от 21 до 30 km/h" | ЗДвП чл. 182, ал. 1, т. 3 |
| глоба | **100 лв.** | same |
| in euro | **51,13 €** | 100 ÷ 1,95583 = 51,1292 → 51,13 |
| контролни точки | **0** — deliberately absent from the exhaustive чл. 6, ал. 1 list | Наредба № Iз-2539 |
| лишаване от право | none | чл. 182, ал. 1, т. 3 states the penalty exhaustively |
| instrument | **електронен фиш** — lawful *because* no ban is provided | ЗДвП чл. 189, ал. 4 |
| early payment | 70 % within 14 days = 70 лв. = 35,79 € | ЗДвП чл. 189, ал. 5г |

**It reconciles exactly.** Run through the product's own law loader
(`getPenalty("pen-speeding-urban-21-30")` + `describeFine/describeControlPoints/
describeDisqualification/describeExamPoints`), the bank returns:

```
FINE : 100 лв. (електронен фиш)   ЗДвП, чл. 182, ал. 1, т. 3 (ДВ, бр. 55 от 16.06.2026 г.)
CP   : 0 контролни точки
DISQ : не се предвижда лишаване от право
EXAM : 10 наказателни точки (опасна грешка)
```

Two honest qualifications on that "reproduced":

1. **The product does not *derive* his band — it holds a hand-authored entry for it.** There is no
   function anywhere that takes (measured, limit) and returns a rung. `pen-speeding-urban-21-30`
   was written for this case; a student who is caught at 96 in a 50 gets nothing.
2. **The 51,13 € figure is not a field.** `describeFine` renders `100 лв. (електронен фиш)`. The euro
   amount — the number printed on his actual фиш — exists only inside a prose `noteBg`, which no gate
   checks. The simulator's fault card *does* render EUR (see §5); the law bank does not.

> **BOTH QUALIFICATIONS ARE NOW CLOSED, and the SCALES gate re-derived the ticket through the new
> code path rather than through the hand-authored row.** `deriveSpeedingBand({measuredKmh: 78,
> limitKmh: 50, scope: "urban"})` — `penalties.json` not consulted — returns:
>
> ```
> tolerance      3 km/h   branch "flat"      (НСИПМК чл. 425, ал. 1, т. 2)
> charged        75 km/h  excess 25 km/h
> tier           ЗДвП чл. 182, ал. 1, т. 3  „от 21 до 30 km/h"
> глоба          100 лв.  →  51,13 €
> контролни т.   0        status "not-listed", with the reason, not a blank
> instruments    фиш · електронен фиш
> ```
>
> All four of the founder's own values. Two more, to show the function is not a lookup for his case:
> **`(96, 50, urban)`** → 93 → 43 over → **ал. 1, т. 5** → 600 лв. = **306,78 €**, **18 контролни
> точки**, два месеца лишаване, **АУАН only** (фиш and електронен фиш excluded because a ban is
> provided). **`(140, 130, outsideUrban)`** → the tolerance takes the **percent** limb, **4,2 km/h**
> not 3 → charged 135,8 → 5,8 over → floored to 5 → **ал. 2, т. 1**, 20 лв. = 10,23 €.
> `deviceToleranceKmh` at 100 → 3 · at 100,5 → 3,015 · at 140 → 4,2 · at 200 → 6.
>
> And the euro is a computation, not prose: `lib/content/money.ts` holds one rate and
> `withEurBg` puts the euro **in front** of every лв. figure in authored sentences — verified
> empirically, „…с глоба **10,23 € (20 лв.)**" — while leaving a лв. figure **inside „…“** exactly as
> the act wrote it, so a quotation stays a quotation.

---

## 2. The systems, and why they must never be added together

**FIVE, and four of them are law.** Re-stated 2026-08-09 by the ATTACK-THE-CHECK gate after system 4
was finally grounded in an act. Every row now carries the name the *statute* uses, the `PointScaleId`
that renders it, and whether a court could be shown the number.

| # | system | `PointScaleId` | what it is | scale | where it is law | direction | lifetime |
|---|---|---|---|---|---|---|---|
| 1 | **наказателни (изпитни) точки** | `exam` | the examiner's marking sheet on the **practical** exam | 10 / 3 / 1 per fault; fail above 9 | **LAW** — Наредба № 38, приложение № 5, т. 10–11 | deducted | this drive, this sheet |
| 2 | **контролни точки** | `control` | the **licence** budget, spent only by a penalty in force on the road | 39 max, 26 at first issue | **LAW** — Наредба № Iз-2539, чл. 2 (текстът в сила: консолидацията през ДВ, бр. 49 от 2026 г.) | deducted | the licence |
| 3 | **глоба** | *(none — `lib/content/money.ts`)* | money | лв. in the act, € on the paper | **LAW** — ЗДвП чл. 179–189 | paid | one payment |
| 4 | **точки от правилни отговори** | `theory` | the **theoretical** exam's score, and the mid-drive micro-quiz that uses the same counter | 45 въпроса · 97 максимум · праг 87 · 40 мин (кат. В и В1); 1 / 2 / 3 per question | **LAW** — Наредба № 38, **чл. 39, ал. 1** (clock: ал. 10). *The per-question 1/2/3 weight is NOT in the наредба* — чл. 38, ал. 1 hands the question set to the изпълнителен директор of ИААА, and the note quotes no figure for it | **earned** | the theory exam only |
| 5 | **точки за изпълнение** | `manoeuvre` | this product's own quality grade for a manoeuvre | 0–2 per criterion | **NOT LAW** — „оценка на симулатора — не е закон", and it says so on screen | **earned** | this drive |

Two of the five run the *other way* — 4 and 5 are earned, 1 and 2 are deducted — which is why adding
any two of them is not merely wrong by units but wrong by sign. System 5 renders on the **same result
screen** as system 1, and system 4 renders on the same *product* as both (see §7, G-5).

**System 4 was the last one without an act, and „a fifth id" would have been the wrong repair.**
`POINT_SCALES.theory` already existed for the simulator's micro-quiz — `MicroQuizQuestion.points` is
documented in `quiz-trigger.ts` as „Official exam weight (1|2|3)", i.e. the same counter — and it was
marked `isLaw: false` with no citation. Minting a `theoryExam` id for the exam screens would have put
**two names on one unit**, which is the exact ambiguity this document exists to kill. The scale was
grounded instead. Verified by re-cutting the sentence out of the ingested act on every test run
(`components/exam/__tests__/theory-exam-scale.test.tsx`), and anchored on „категории В и В1" because
чл. 39 opens six other alineas the same way — ал. 3 is the **motorcycle** test at 40 / 90 / 81, and a
slice on the wrong alinea would have grounded the mock exam in it with every assertion still passing.

> **Наредба № 38, чл. 39, ал. 1** — verbatim, and it is where the scale gets its NAME
> „Тестовете … от категории В и В1 съдържат 45 въпроса. Максималният брой точки, **от правилни
> отговори** на всички изпитни въпроси, е 97. Теоретичният изпит е успешно положен, когато
> кандидатът има не по-малко от 87 точки."

**„изпитни точки" is system 1 and nothing else.** Stamping it on system 4 to clear a grep would be
worse than the bare „т." it replaced, because a wrong label is believed and a bare number is only
unclear. **The ATTACK-THE-CHECK gate checked for exactly that error and it was not made:** zero
occurrences of `изпитни точк` / `наказателн* точк` in `app/(dashboard)/exams/**`,
`components/exam/**` or `modules/exam/**` outside the test that forbids them.

> **Наредба № 38, приложение № 5, т. 10** — verbatim
> а) „за основни грешки се считат неправилни действия, породени от липсата на знания и умения,
> заложени в изискванията към водачите на МПС от съответната категория - начисляват се по
> 3 наказателни точки;"
> б) „за второстепенни грешки се считат правилни, но неточни действия, породени от недостатъчния
> практически опит на изпитвания - начислява се по 1 наказателна точка;"
> в) „за опасна грешка се поставят 10 наказателни точки в следните случаи:" — six enumerated cases,
> the last of which is „когато изпитваният превиши максимално допустимата скорост за движение с
> повече от 10 km/h."
> **т. 11** „Изпитът е успешно положен, като на изпитвания са поставени не повече от 9 наказателни
> точки, като не повече от 6 са от основни грешки."

> **Наредба № Iз-2539, чл. 2** — verbatim
> ал. 1 „Максималният размер на контролните точки за отчет на извършваните нарушения на Закона за
> движението по пътищата (ЗДвП) е 39."
> ал. 2 „При първоначално издаване на свидетелство за управление на моторно превозно средство
> притежателят му получава 26 контролни точки за отчет на извършваните от него нарушения на ЗДвП."

**ЗДвП чл. 21 does not contain the 10.** Verbatim: „При избиране скоростта на движение на водача на
пътно превозно средство е забранено да превишава следните стойности на скоростта в km/h:" followed
by a table. It is the rule he broke; it is not the source of the number. Both now appear on the card,
separately labelled.

---

## 3. The ladder as retrieved

Source for all three: `content/law/acts/zdvp.json`, консолидиран **ДВ, бр. 55 от 16.06.2026 г.**

### ЗДвП чл. 182, ал. 1 — в населено място

| band (act's own words) | глоба | € | лишаване | к.т. |
|---|---|---|---|---|
| „за превишаване с 10 km/h - с глоба 20 лв.;" | 20 лв. | 10,23 € | — | 0 |
| „за превишаване от 11 до 20 km/h - с глоба 50 лв.;" | 50 лв. | 25,56 € | — | 0 |
| „за превишаване от 21 до 30 km/h - с глоба 100 лв.;" | 100 лв. | **51,13 €** | — | 0 |
| „за превишаване от 31 до 40 km/h - с глоба 400 лв.;" | 400 лв. | 204,52 € | — | 0 |
| „за превишаване над 40 km/h - с глоба 600 лв. и два месеца лишаване от право да управлява моторно превозно средство;" | 600 лв. | 306,78 € | 2 месеца | 18 |
| „за превишаване над 50 km/h - с глоба 700 лв. и три месеца лишаване… като за всеки следващи 5 km/h превишаване над 50 km/h глобата се увеличава с 50 лв." | 700 лв.+ | 357,90 € | 3 месеца | 18 |

**ал. 1 has no 41–50 rung.** т. 5 reads „над 40" and т. 6 „над 50". 41–50 in town therefore sits in
т. 5. Do not invent the missing row — ал. 2 and ал. 3 *do* have one, which is what makes the
omission look like a retrieval gap when it is the statute's own shape.

### ЗДвП чл. 182, ал. 2 — извън населено място
20 лв. / 50 лв. / 100 лв. / „от 31 до 40 km/h - с глоба 300 лв." / „от 41 до 50 km/h - с глоба 400 лв." /
„над 50 km/h - с глоба 600 лв. и два месеца лишаване…, като за всеки следващи 5 km/h … глобата се
увеличава с 50 лв."

### ЗДвП чл. 182, ал. 3 — обществен превоз на пътници и опасни товари
20 лв. / 50 лв. / „от 21 до 30 km/h - с глоба 150 лв." / „от 31 до 40 km/h - с глоба 500 лв." /
„от 41 до 50 km/h - с глоба 800 лв." / „над 50 km/h - с глоба 1000 лв. и три месеца лишаване…"

### ЗДвП чл. 182, ал. 3а — средна скорост (section control)
„(Нова – ДВ, бр. 64 от 2025 г., в сила от 7.09.2025 г.) Водач … който превиши средната скорост за
съответния контролиран участък от пътя с посочените в ал. 1, 2 и 3 стойности, се наказва с
предвиденото по ал. 1, 2 или 3 наказание за съответното превишаване на скоростта."

**The euro column is a conversion, not a retrieval.** 1 EUR = 1,95583 BGN, the irrevocably fixed rate
(the repo's own currency decision, `platform/src/modules/payments/packs.ts`, 2026-07-07). Every value
above recomputes: `Math.round(лв × 100 / 1.95583)`. The лв. figure stays visible next to it because
the student meets „100 лв." in the statute and „51,13 €" on the paper and must recognise them as one
penalty.

---

## 4. The instrument rules — one test, derived from quoted text

Both openings are conditional on the **same** fact: whether лишаване от право is provided.

> **ЗДвП чл. 186, ал. 1** „За административни нарушения, за които не е предвидено наказание лишаване
> от право да управлява моторно превозно средство, може да бъде наложена с фиш глоба в размера,
> посочен в административнонаказателната разпоредба за съответното нарушение."
>
> **ЗДвП чл. 189, ал. 4** „За нарушение, установено и заснето с автоматизирано техническо средство
> или система, за което не е предвидено наказание лишаване от право да се управлява моторно
> превозно средство, с изключение на нарушенията по чл. 179, ал. 3 – 3в, на собственика…"
>
> **ЗДвП чл. 186, ал. 7** „В 7-дневен срок от налагането на глобата с фиш нарушителят може да
> заплати 80 на сто от размера й."
>
> **ЗДвП чл. 189, ал. 5г** „В 14-дневен срок от получаването на електронния фиш собственикът, а
> когато има вписан в свидетелството за регистрация ползвател на моторното превозно средство –
> ползвателят, може да заплати 70 на сто от размера на глобата, съответно имуществената санкция."

So: **ban ⇒ АУАН → наказателно постановление only. No ban ⇒ фиш, and електронен фиш if a camera
caught it.** The product writes this once (`instrumentsForBan` in
`platform/src/modules/sim/rules/consequences.ts`) and derives every row from it, rather than typing
an instrument per row and citing an article decoratively.

**The thing worth teaching as a reason rather than a rule:** ДВ, бр. 64 от 2025 г. really did let a
фиш carry контролни точки. It has no bite on speeding, because in this ladder every rung that takes
точки also takes the licence — so 18/21/26 точки still only ever arrive by наказателно постановление.
Same outcome as the old rule, entirely different reason. `consequences.test.ts` pins it as an
assertion: in the ladder, the point-carrying rungs must be *exactly* the ban-carrying rungs.

---

## 5. The tolerance — real, normative, and **not a flat 3**

This is the piece most likely to be folk knowledge, so it gets its own section. It is a chain of
three provisions and no single article says „3 km/h се приспадат".

> **ЗДвП чл. 165, ал. 3** „Условията и редът за използване на автоматизирани технически средства и
> системи за контрол на правилата за движение се определят с наредба на министъра на вътрешните
> работи."
>
> **Наредба № 8121з-532, чл. 16, ал. 5** (Нова ДВ, бр. 6 от 2018 г., изм. ДВ, бр. 34 от 2026 г.)
> „При съставяне на акт за установяване на административно нарушение за превишена скорост, издаване
> на наказателно постановление или издаване на електронен фиш за установено нарушение за превишена
> скорост от измерената от АТСС скорост се приспада максимално допустимата грешка за съответния тип
> АТСС, посочена в чл. 425 от Наредбата за средствата за измерване, които подлежат на метрологичен
> контрол (ДВ, бр. 103 от 2024 г.)."
>
> **НСИПМК, чл. 425, ал. 1, т. 2** „при измерване на скорост при условия на функциониране:
> ± 3 km/h за скорости до 100 km/h или ± 3 % от измерената стойност за скорости над 100 km/h."

Three consequences the product must respect:

- **It is not a permission.** The fine scale starts at „превишаване с 10 km/h". There are no free
  kilometres. The deduction is an admission that the *instrument* can be wrong.
- **It is not 3 above 100 km/h.** At 140 km/h the allowance is 4,2 km/h. Anything that renders „−3"
  on a motorway lesson is wrong.
- **It applies only when an АУАН, НП or електронен фиш is issued** — those are the three cases
  чл. 16, ал. 5 names.

**Verdict on the product's handling: it does not assert the folk version.** Both acts are wired into
`ACT_IDS` and openable (`getArticle("naredba-8121z-532", "чл. 16")` and
`getArticle("naredba-sredstva-za-izmervane", "чл. 425")` both resolve). A sweep of every occurrence of
„3 km/h" / „3 км/ч" outside `content/law/acts/` found **no bare assertion** — every one of them
carries the „± 3 % над 100 km/h" branch alongside it. The two theory questions that touch it
(`q-speed-023`, `q-speed-025`) quote both articles verbatim; `q-speed-023` states outright „не е
постоянно число — на магистрала при 140 км/ч допускът е 4,2 км/ч". Both are `needs-review`, not
approved.

One line to tighten: `q-speed-025` closes „…и е 3, а не 10." The sentence before it quotes the full
rule including the > 100 km/h branch, so it is not wrong in context — but „е 3" is the exact phrasing
that becomes folk knowledge once it is quoted without its neighbour.

---

## 6. Every figure, with its source

| act | file | source id | URL | sha256 (16) | bytes | version as recorded |
|---|---|---|---|---|---|---|
| ЗДвП | `zdvp.json` | `src-zdvp-mtc-16062026` | mtc.government.bg/…/ZAKON_za_dvijenieto_po_pytisata16062026.docx | `185cc3a5fc18b3cf` | 264 139 | консолидиран, изм. ДВ, бр. 55 от 16.06.2026 г. |
| Наредба № Iз-2539 (snapshot) | `naredba-iz-2539.json` | `src-naredba-iz-2539-sars` | sars.gov.bg/…/NAREDBA-Iz-2539-OT-17-DEKEMVRI-2012.pdf | `6886ef7268dadddb` | 226 435 | снимка 28.01.2025 — **superseded**, row says so |
| Наредба № Iз-2539 (consolidated) | `naredba-iz-2539-consolidated-dv49-2026.json` | `src-naredba-iz-2539-consolidated-lex` | lex.bg/laws/ldoc/2135830692 | `b66ac515fdaa032b` | 327 253 | „изтеглен 2026-08-09"; през ДВ, бр. 22/2026 (попр. бр. 24) и бр. 49/2026 |
| Наредба № 38 | `naredba-38.json` | `src-naredba-38-sars` | sars.gov.bg/…/NAREDBA-38-OT-16-APRIL-2004.pdf | `73be8377877ff12f` | 293 119 | **`versionBg: null` — unknown** (gap G-1) |
| Наредба № 8121з-532 | `naredba-8121z-532.json` | `src-naredba-8121z-532-lex` | lex.bg/laws/ldoc/2136505166 | `f79f2f6645330785` | 176 695 | „изтеглен 2026-08-09"; консолидиран, изм. ДВ, бр. 34 от 7.04.2026 г. |
| НСИПМК | `naredba-sredstva-za-izmervane.json` | `src-naredba-sredstva-za-izmervane-damtn` | damtn.government.bg/…/naredba_za_sredstvata_za_izmervane…pdf | `00758b88bfa16c8d` | 858 284 | „изтеглен 2026-08-09"; обн. ДВ, бр. 103 от 6.12.2024 г. |

**On retrieval dates:** `sources.json` has no per-row retrieval field. The register carries one
`retrievedAt: "2026-08-03"` for the whole file; the three acts added on 2026-08-09 state „изтеглен
2026-08-09" inside their `versionBg` prose, which is where the date has to be read from. Every row
records `httpStatus: 200`. A per-row `retrievedAt` would be worth adding — a file-level date is
already wrong for half the register.

The квоти behind each figure are in §2–§5 above. `consequences.test.ts` (30 tests) re-cuts every one
of them out of these files on every run and fails on a single changed word;
`catalog-consequences.test.ts` (16 tests) does the same for the 40 authored road sentences.

---

## 7. THE GAPS — where no article could be found, and where the product knows less than it shows

**This is the honest half. Nothing below may be quietly filled in by the next wave.**

### G-1 — Наредба № 38's consolidation date is unknown, and the whole exam column rests on it
`naredba-38.json` carries `consolidatedThroughBg: null`; its `sources.json` row carries
`versionBg: null`. The 10 / 3 / 1 values, the six enumerated опасни cases and the ≤ 9 pass rule are
verbatim from what we hold, but **nobody has confirmed приложение № 5 has not been amended since**.
The fault card now prints those figures *with a citation*, which makes the unverified vintage more
visible, not less. One lex.bg fetch settles it. Do this before these numbers go in front of a
seventeen-year-old.

### G-2 — the 18-к.т. chip on the card cites a text that contradicts it
The card's speeding ladder shows `18 к.т.` on the „над 40 km/h" rung and offers the chip
**„Наредба № Iз-2539, чл. 6, ал. 1, т. 12"**. That bare name resolves through `ACT_ALIASES` to the
**2025 snapshot**, whose т. 12 reads:

> „за превишаване на разрешената максимална скорост **с над 50 км/час** по чл. 182, ал. 1, **т. 6** и
> ал. 3, т. 6 от ЗДвП - 18 контролни точки;"

The figure is cut from the *consolidated* text (`actFile` records this, so the test re-cuts it from
the right file), whose т. 12 was widened by ДВ, бр. 49 от 2026 г. to reach ал. 1, **т. 5**. So a
student who follows the citation finds a sentence that does not cover the row it is attached to. The
fix is one string: name the amendment (`Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.), чл. 6, ал. 1,
т. 12`), which the alias table already routes correctly. `platform/src/lib/content/law/corpus.ts`
warns about exactly this trap; the new UI walked into it.

> **CLOSED 2026-08-09.** The chip now reads „Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.),
> чл. 6, ал. 1, т. 12". `modules/sim/rules/__tests__/citation-version.test.ts` makes it mechanical
> rather than remembered: every `LawQuote` cut from the consolidation must have a `citationBg` that
> `actIdForActName` resolves to the consolidation, and every quote cut from the 2025 snapshot must
> be wording the consolidation still carries. The same rule is enforced on the penalty bank inside
> `verifyCitations` (`SUPERSEDED_BY`). **Still open, and not mine to edit:** 11 bare
> „Наредба № Iз-2539" citations in the question bank and `concepts.json` point at чл. 2 and чл. 6,
> both of which the 2026 texts changed — listed in the lane report.

> **REOPENED IN PART, 2026-08-09 (SCALES gate) — the chip is fixed; five citations behind it are
> not, and the guard cannot see them.** `penalties.json` is clean (zero snapshot citations, verified
> by scan). **`consequences.ts` still carries five bare „Наредба № Iз-2539"** — the licence budget's
> чл. 2, ал. 1 (line 323) and ал. 2 (330), the т. 20 and т. 21 quotes (1034, 1057), and — the one
> that matters — **`CP_LIST_HEADER` (line 339), which is the citation printed behind every
> „0 контролни точки" verdict the fault card renders.**
>
> **NAME · `CP_LIST_HEADER` cites a superseded copy of the list that is physically incomplete.**
> **OWNER · `modules/sim/rules/consequences.ts`, and `citation-version.test.ts` for the guard.**
> **REASON it is not closed here · it is a two-part change (repoint the quote *and* teach the guard
> a new rule) in a file three lanes had open during this wave, and this gate does not build.**
>
> Three measured facts, none of them previously recorded:
>
> 1. The 2025 snapshot's чл. 6 has **21 enumerated items, not 22 — т. 3 is truncated mid-sentence**
>    („…откаже да му") where the scrape inserted „Източник: Правно-информационни системи „Сиела“ /
>    24/01/2025 г.". That watermark appears **inside 16 units** of `naredba-iz-2539.json`, presented
>    to the reader as statute. The consolidation has all 22 and carries no watermark.
> 2. That truncated list is what the product cites to prove a **negative** — „това стъпало не е сред
>    нарушенията, изброени в чл. 6, ал. 1 — а списъкът е изчерпателен". The claim is still *true*
>    under the consolidation (new т. 12 reaches only чл. 182, ал. 1, т. 5 и 6, ал. 2, т. 6 и ал. 3,
>    т. 6), but the evidence a student opens is a list with a hole in it.
> 3. The snapshot's **чл. 2, ал. 6 is the repealed restoration rule**; the consolidation's ал. 6 is a
>    different provision entirely (which documents deduct points). The 39 and the 26 are unchanged,
>    so no figure is wrong — the article the student lands on is.
>
> **And the guard is blind to all of it by construction.** `citation-version.test.ts` requires only
> that a snapshot-cut quote's **words** survive into the consolidation. `CP_LIST_HEADER` quotes the
> list's *header line*, which is byte-identical in both editions — so the guard passes while the list
> underneath it was amended. **A claim of the form „X is not in this exhaustive list" cannot be
> secured by checking that the list's title is unchanged.** One clause closes it: when a figure is
> `not-listed`, require the whole cited unit to match across editions, or forbid `not-listed` from
> citing a superseded act at all.

### G-3 — the tolerance figure is withheld for a reason that has expired
The card says the deduction exists and not how big it is:
„…затова конкретната стойност на тази грешка не се показва тук." The stated reason (in
`consequences.ts`) is that the two acts are not in the corpus and the citation gate would refuse a
number on an act nobody can open. **Both acts are now in `ACT_IDS` and both articles resolve.** The
blank is now unnecessary. It must be filled as „± 3 km/h до 100 km/h, ± 3 % над 100 km/h" — never as
a flat 3.

### G-4 — the exam-points quote in `content/law/penalties.json` is the wrong enumerated case
All six entries with an `examPoints` figure carry the same quote:

> „за опасна грешка се поставят 10 наказателни точки в следните случаи: - когато изпитваният **не
> изпълни забраняващ сигнал на светофар или указания на регулировчик**;"

For `pen-red-light` that is right. For `pen-speeding-urban-21-30`, `pen-speeding-urban-11-20`,
`pen-b2-no-stop`, `pen-b2-no-stop-danger` and `pen-crosswalk-no-yield` it is **a different offence's
sentence**. The cause is one shared constant in `content/law/tools/build-penalties.mjs`
(`EXAM_DANGEROUS`) whose locator stops at the first `;`, i.e. the first of six indents.
`verifyCitations` cannot see it: it checks that the quote is *in* the act and *contains the figure*,
never that it names the *offence*. Nothing renders the penalties bank today (no non-test consumer of
`describeExamPoints`), so this is latent, not shipped — but it is the exact shape of defect the
verbatim discipline exists to prevent, and the gate is blind to it.

> **CLOSED 2026-08-09 — and the blindness was the bigger half.** `EXAM_DANGEROUS` is now
> `examDangerous(caseKey)`: `quoteBg` is the header that states the 10, `contextQuoteBg` is the ONE
> indent naming this offence. More importantly, `PenaltyCitation` gained `offencePhraseBg` and
> `verifyCitations` checks it from both ends — the phrase must occur in the cited unit (so it is the
> act's wording, not ours) **and** inside the quotes the student is shown (so the quotes cannot be
> about another offence). Required on every `grounded` figure. Re-entering the defect by hand is a
> test: `corpus.test.ts` → „refuses a grounded figure whose quotes are about another offence".

> **VERIFIED AND PARTLY REOPENED, 2026-08-09 (SCALES gate).** The six rows are genuinely fixed:
> **4 distinct `contextQuoteBg` across 6 entries** (the two pairs that share are the same statutory
> case — both Б2, both speeding), each with its own `offencePhraseBg`; the shared `quoteBg` is the
> header, and sharing it is correct because the act states the „10 наказателни точки" once. Three
> attacks were caught: wrong enumerated case with the right phrase, a deleted `offencePhraseBg`, and
> our paraphrase „превишена скорост" substituted for the act's wording.
>
> **But a fourth attack got through, and it is the one the fix was written for.**
>
> **NAME · `verifyCitations` proves a citation is internally consistent, not that it is about the row
> it prices.** **OWNER · `lib/content/law/corpus.ts`, check (3).** **REASON it is not closed here ·
> it needs a per-row declaration of the conduct, which is a schema change to `PenaltyCitation` and
> a rebuild of `penalties.json` — the file another lane was writing during this wave.**
>
> Reproduced verbatim: take `pen-speeding-urban-21-30`, whose `titleBg` is „Превишена скорост в
> населено място с 21 – 30 km/h", set `contextQuoteBg` to the **traffic-light** case *and* move
> `offencePhraseBg` to match it. **`verifyCitations` returns `[]`.** The check compares the phrase to
> the citation's own quotes; **nothing compares it to the row's `id`, its `titleBg`, or the violation
> code it prices.** So „a speeding fault priced by the sentence about a traffic light" — the exact
> sentence this section uses to describe the defect — still ships, provided the author moves both
> fields together, which is what a copy-paste does. The fix: key `offencePhraseBg` off a per-row
> enum, or assert the phrase against a `conductBg` the row declares once.

### G-5 — „т." is still unqualified on every in-drive surface, and once on the result screen
The result screen is fixed. The **in-drive** surfaces are not — and they are what a student meets
first. Photographed live on 2026-08-09 (`sc-speed-zone`, level 1, 47,6 km/h in a 30 zone): the teach
moment reads

> „Първа среща — **не се брои в резултата**. При повторение: **–10 т.** (опасна грешка)…"

with a chip reading „ЗДвП чл. 21, ал. 1" and nothing naming which point system. Full inventory:

| file | line | string |
|---|---|---|
| `components/sim/lesson-ui/TeachMomentOverlay.tsx` | 232, 325 | `−{moment.points} т.` |
| `components/sim/lesson-ui/LessonPlayShell.tsx` | 1836 | the same sentence in the notification path |
| `components/sim/lesson-ui/LessonPlayShell.tsx` | 1853 | in-drive violation chip `−{points} т.` |
| `components/sim/lesson-ui/LessonPlayShell.tsx` | 1812 | result chip `{score} т.` |
| `components/sim/lesson-ui/LessonPlayShell.tsx` | 2689 | live score bar `/ 9 т.` |
| `modules/sim/hud/HudToasts.tsx` | 209 | `−{event.points} т.` |
| `components/sim/lesson-ui/MistakeConsequenceOverlay.tsx` | 131 | ` · −{points} т.` |
| `components/sim/lesson-ui/MicroQuizOverlay.tsx` | 181 | `{quiz.points} т.` (a *quiz* scale) |
| `components/sim/lesson-ui/CalibrationGate.tsx` | 179, 190 | predicted / actual `{points} т.` |
| `components/sim/lesson-ui/ExamBriefingCard.tsx` | 131–132 | `10 т.` / `3 т.` / `1 т.` |
| `components/sim/lesson-ui/ExamModeCard.tsx` | 72, 83 | `9 т. общо · 6 т. основни`, `{bestScore} т. наказание` |
| `modules/sim/hud/SessionEndScreen.tsx` | 595 | `{line.points} / 2 т.` — the **manoeuvre rubric**, a fourth scale, on the same screen as system 1 |

`pointsLabelBg` / `examPointsWordBg` are exported from `modules/sim/rules` for exactly this.

> **CLOSED 2026-08-09, and verified by opening the screens — 0 of 14 remain.** The repair is a
> vocabulary, not fourteen hand-edits: `modules/sim/rules/scales.ts` defines the four scales and the
> formatters, and `__tests__/point-scales.test.ts` fails the build if a bare „т." reappears in
> `modules/sim/hud`, `components/sim/lesson-ui` or `app/(dashboard)/simulator`.
>
> The SCALES gate re-checked this with an **independent** scanner (not the shipped one) over those
> three directories: **0 bare hits across 56 source files.** Nine surfaces were then photographed at
> desktop **and** phone through the real components on the real app CSS and their rendered text read
> back: **37 „т." tokens across the nine dumps, none of them bare.** Frames in `scratchpad/V-frames/`.
>
> The founder's own screen — the teach card at t=22 — now reads
> „При повторение: **−10 изпитни т.** (опасна грешка)…" with **two** chips,
> „правило: ЗДвП чл. 21, ал. 1" and „оценка: Наредба № 38 приложение № 5, т. 10, б. „в“",
> and the sentence „НЕ са контролни точки по книжката" (`01-scales-desktop.png`).
>
> **The opposite error was not made.** `SessionEndScreen`'s rubric renders „1 / 2 **т. за
> изпълнение**" under a chip „оценка на симулатора — не е закон", and the micro-quiz „2 **т. по
> теорията**" — neither was relabelled „изпитни точки" to clear the scanner (`06-result-end.png`,
> `08-microquiz.png`). Grammar agrees at one: „(по 1 изпитн**а** т.)".
>
> Two sites the original inventory did not list were found and fixed with it:
> `app/(dashboard)/simulator/session-history.tsx` (caught by the scanner itself) and
> `modules/learning/calibration.ts` `formatCalibrationError`, which rendered „−14 т." directly
> beneath two repaired tiles from a module the sim-side scanner cannot see.
>
> **STILL OPEN, with names.** *(1)* `LessonPlayShell.tsx:2687` (live exam protocol bar) and `:1812`
> (compact end-of-drive chip) are verified by source and by the scanner but **never photographed** —
> and the reason is structural, not a dead dev server: the bar needs `examMode && phase === "driving"`,
> and the only exam lesson `lex-exam-1` opens on a **13-step mouse-driven pre-drive** no keyboard rig
> can complete (driven 111 s: `phase=preDrive obj=0/13`, `v=0.0`). *(2)*
> `MistakeConsequenceOverlay.tsx` needs a recorded mistake trace to mount and has never been
> photographed either. *(3)* The **theory** exam's 97-point scale is still bare „т." at ten sites —
> `app/(dashboard)/exams/page.tsx` (3), `exams/[attemptId]/page.tsx` (5),
> **`components/exam/ExamResultView.tsx:134`** and **`components/exam/ExamRunner.tsx:671`**. Leaving
> it un-relabelled was right — „изпитни т." now means the *practical* sheet — but it needs a fifth
> scale of its own, and the last two files were missing from the lane's own disclosure.

> ### G-5 (3) — CLOSED 2026-08-09 by the ATTACK-THE-CHECK gate. **The ten were more than ten, and
> the fix was the FOURTH scale, not a fifth.**
>
> **Measured against `HEAD`, with a scanner written for this gate rather than the shipped one** — two
> different regexes, so a blind spot would have to be shared to survive both. On the four files as
> they stood at `HEAD`: **8 bare „т." + 14 unqualified „точки" = 22 defects**, not ten. The lane that
> repaired them reported 9 + 12 = 21; the one-site difference is boundary judgement
> (`{q.points} {q.points === 1 ? "точка" : "точки"}` is one site or two depending on whether you
> count literals), and the magnitude is the same. **On the working tree now: 0 and 0.**
>
> The undercount was of the DEFECT, not of the abbreviation. Twelve of the twenty-two were „точки"
> **spelled out** — „точки максимум", „точки за успех", „Загубени точки", „/ 97 точки", and „Праг за
> успех 87 точки" read aloud by the screen reader. Unqualified „точки" in Bulgarian **is** контролни
> точки; it is the founder's own misreading with the abbreviation expanded, not a milder form of it.
>
> **Two bare units remain in the repo and both are outside the student's exam**, named here rather
> than left to be re-found: `app/(dashboard)/review/ReviewClient.tsx:635` (`{q.points} т.`, the
> content-reviewer's queue) and `app/(dashboard)/admin/page.tsx:415` (`${row.score}/${row.maxScore} т.`,
> the admin attempt list). Neither directory is in the shipped guard's `GUARDED_DIRS`. See STILL OPEN
> below for owner and reason.
>
> **DRIVEN, not inferred.** The runner was opened in a real browser on the dev server already
> listening on `:3200` (`/dev/fold-rig?mode=exam&rank=3`, `data-hydrated="1"`, a full 45-question
> paper, clock at 39:52, „1/45"). At **1280 px** the visible chip reads **„3 точки от правилни
> отговори"**; at **375 px** it reads **„3 т. по теорията"** and the desktop twin is
> `display:none` — one counter, two widths, neither bare. Both carry the same `title`:
> „Толкова тежи този въпрос на ТЕОРЕТИЧНИЯ изпит. Печели се с верен отговор и няма нищо общо с
> наказателните точки от карането, нито с контролните точки по книжката."
>
> The result view was rendered through `react-dom/server` and read back end to end:
>
> > „Резултат от пробния изпит **74 / 97 точки от правилни отговори на теоретичния изпит** ·
> > Неиздържан · **Праг — точки по теорията ≥ 87** · **Загубени точки по теорията** 23 · Използвано
> > време 33:00 · Точки от правилни отговори на теоретичния изпит (Наредба № 38, чл. 39, ал. 1):
> > 97 максимум, изпитът е издържан при не по-малко от 87. Печелят се с верен отговор. **НЕ са
> > контролни точки по книжката и НЕ са наказателните (изпитни) точки от практическия изпит.**"
>
> …and the review chip reads „**0 / 3 т. по теорията**" (and „1 / 1 т. по теорията" at one, where the
> qualifier sits after the abbreviation so nothing has to inflect). Pass, fail and late papers all
> render the same footing sentence.
>
> **Still not photographed, and it is the more-travelled screen.** `ScoreReadout` in
> `exams/[attemptId]/page.tsx` — what a student meets when they REVISIT a finished attempt — is
> module-private inside an async server component behind `requireUser`; `/exams` returns **307 →
> /login**. It is verified by two independent scanners, by `tsc` and by unit tests on the strings it
> composes, but nobody has looked at it. Same for `HistoryRow` on the index.

### G-6 — two currencies on one screen
The card shows EUR for the 5 structured codes and лв. for the 40 authored ones. Both were captured in
the same session: the speeding card renders „51,13 €"; the collision card renders „глоба в размер
300 лв." Bulgaria is in the eurozone and the founder's own ticket was in EUR. A student with two
faults sees both conventions.

> **CLOSED 2026-08-09.** The rate and the formatters moved to `lib/content/money.ts` — one rate, one
> policy, imported by both the law layer and `modules/sim/rules`. `withEurBg()` puts the euro beside
> every лв. figure in the forty authored sentences (`FaultCard` authored branch, `debrief.roadLines`)
> and `describeFine()` now renders „51,13 € (100 лв.) (електронен фиш)". **The one thing it refuses
> to touch is a лв. figure inside „…“** — that is the act's own wording, re-cut from the statute by
> `catalog-consequences.test.ts`, and rewriting a currency inside quotation marks turns a quotation
> into a paraphrase that still looks like one. The ladder table now carries „(N лв. по закона)" under
> each euro so the row and its citation cannot read as disagreeing.

### G-7 — the engine knows the excess and throws it away
`reduceTick` has `speed` and `tick.maxSpeedKmh` at the instant it convicts, and calls
`makeViolation("SPEEDING_DANGEROUS", t)` with no detail. So the card can only show the whole ladder.
`makeViolation` already accepts a machine-readable `detail` (RAIL_CROSSING_VIOLATION and COLLISION use
it). This is the single highest-value follow-up: it turns „here is the table" into „you were 25 over,
that is 51,13 €" — which is the founder's ticket, computed rather than hand-authored.

### G-8 — no `noteBg` prose is checked by anything
`verifyCitations` validates `source.quoteBg` only. Every figure inside a `noteBg` — including
„±3 km/h", „±3 %", „78 км/ч … се разглежда като 75", „51,13 EUR", „35,79 EUR", „70 лв." — is
ungated prose. I checked them by hand and they are all correct today. Nothing keeps them correct.

### G-9 — `content/law/penalties.json` quotes are truncated mid-word
`build-penalties.mjs`'s `quote()` walks forward to the next `;` or 400 characters, whichever comes
first. Where no `;` falls inside 400 characters it cuts mid-word, and the result is presented inside
„…" as if verbatim. Measured — every quote in the bank that does not end on a sentence boundary:

| entry | ends with |
|---|---|
| `pen-b2-no-stop` (чл. 6, ал. 1 list header) | „…а) над 0,5 на хиляда до 0,8 на хиляда **в**" |
| `pen-speeding-urban-11-20` (чл. 189, ал. 4) | „…е вписан ползвател – на ползвателя, **се из**" |
| `pen-alcohol-05-08` | „…издишвания въздух: 1. над 0,5 на хиляда до **0,8**" |

A fourth lives inside prose rather than a `quoteBg` field, so the check above cannot see it: the
чл. 189, ал. 5г quote embedded in `pen-speeding-urban-21-30.fine.noteBg` runs past its own sentence
into the next alinea's opening and closes on „**(6) (Нова - ДВ,**".

### G-10 — the classroom lesson still denies the tolerance without qualifying it
`content/lessons/l-speed-limits.json` (status `draft`) reads „И най-скъпото убеждение в страната:
толерансът от десет километра. Няма такъв." That is narrowly true — there is no 10 km/h tolerance —
and materially incomplete on exactly the point the founder tested. Its provenance echo for
`q-speed-023` still reads „толерансът от 10 км/ч е градска легенда", a sentence that question no
longer contains.

### G-11 — the road penalty for disobeying a регулировчик could not be retrieved
`CONTROLLER_SIGNAL_VIOLATED` is a 10-point code with no street price. чл. 174–190 were searched: the
only article naming a регулировчик is чл. 184, the **pedestrian** article, and чл. 179, ал. 1, т. 5
reaches „другите средства за сигнализиране", which a person is not. Left blank. Do not let anyone
fill it with чл. 185's residual 50 лв. without a retrieval — using it asserts that nothing else
applies, which is a judgement, not a retrieval.

### G-12 — 13 of 53 violation codes have no road consequence at all
Deliberate, pinned by name in `catalog-consequences.test.ts`. Most are faults that break no road
rule. The two worth another attempt are G-11 above and `PEDESTRIAN_CROSSING_TOO_FAST` (the detector
fires on the *approach*, before the yield has been failed, so чл. 183, ал. 5, т. 2's 150 лв. would
charge for an offence not yet established).

---

## 8. What the screen actually says now

Driven and photographed on 2026-08-09 (`/dev/drive-rig`, `sc-speed-zone` level 1, real
`LessonPlayShell`, 47,6 km/h peak in a 30 zone, two SPEEDING_DANGEROUS convictions):

- **Headline:** „**20** наказателни точки · от изпитния лист по Наредба № 38 · важат за този урок ·
  **не са контролни точки по книжката**"
- **Fault card:** „Превишаване с повече от 10 км/ч — **−10 изпитни т.**" over
  „ОПАСНА ГРЕШКА · НАКАЗАТЕЛНИ ТОЧКИ ПО ИЗПИТНИЯ ЛИСТ · НАРЕДБА № 38 ПРИЛОЖЕНИЕ № 5, Т. 10, Б. „В""
- **Road block:** „НА ПЪТЯ — ОТДЕЛНО ОТ ОЦЕНКАТА НА УРОКА", the act's six rungs in EUR with к.т.,
  the instrument sentence, and the ladder footnote.
- **Chips:** ЗДвП чл. 182, ал. 1 · Наредба № Iз-2539, чл. 6, ал. 1, т. 12 · ЗДвП чл. 21, ал. 1

**Can a student tell, knowing nothing, that the 10 points are his exam and not his licence?** On the
result screen, **yes** — the headline says it, the section note says it, the card's sub-line says it.
On the in-drive teach card he sees first, **no** (G-5).

> **UPDATED 2026-08-09 (SCALES gate) — the answer is now yes on the in-drive card too, and it was
> checked by opening it rather than by reading the source.** The teach card at t=22 reads
> „При повторение: **−10 изпитни т.** (опасна грешка)" with the clause that sets the ten named beside
> it, and „НЕ са контролни точки по книжката" underneath. The chip he photographed — „ЗДвП чл. 21,
> ал. 1" standing alone as if it were the source of the mark — is now split in two:
> „**правило:** ЗДвП чл. 21, ал. 1" (which sets the speed limit) and
> „**оценка:** Наредба № 38 приложение № 5, т. 10, б. „в“" (which sets the ten).
>
> **The screen now shows four scales at once and names all four.** On one result screen:
> „4 наказателни точки" (exam) · „(по 10 изпитни т.)" in the legend · „1 / 2 **т. за изпълнение**"
> with „оценка на симулатора — не е закон" (manoeuvre, and it runs the *other* way) · the к.т. block
> quoting what the street would cost (control). The micro-quiz adds „2 **т. по теорията**" mid-drive.
>
> **One chip on the list above is now known to be wrong and is carried as open in G-2:**
> „Наредба № Iз-2539, чл. 6, ал. 1, т. 12" is the *bare* name, which resolves to the 2025 snapshot.
> The 18-к.т. rung was repaired to name the amendment; the **„0 контролни точки"** verdicts on the
> same card still cite the snapshot through `CP_LIST_HEADER`.

---

## 9. Gate

Measured on 2026-08-09 on this tree, with the temporary harness removed:

- `cd platform && npx tsc --noEmit --incremental false` → **TSC_EXIT=0**
- `npm run validate:content` → **OK — all structural and referential checks passed**
  (1089 questions: 796 approved / 293 needs-review; 0 human-signed)
- `npx vitest run --maxWorkers=4` → **745 files, 11 159 passed, 170 skipped, 2 failed** in 189 s.
  The two failures are the two expected quarantine reds and nothing else:
  `exam/__tests__/content-bank.test.ts` (REVIEW_DEBT — `ptp-i-parva-pomosht` 31/64 approved) and
  `lesson/__tests__/compose.test.ts` (`l-accidents-first-aid` has no quiz beat).

### Re-measured 2026-08-09 by the SCALES gate, after the seven build lanes landed

- `cd platform && npx tsc --noEmit --incremental false` → **exit 0, 0 bytes of output.** Run twice
  (before the gate's own probes were created, and again after they were deleted).
  `git diff platform/tsconfig.json` = **0 lines**; `.next-scales` is gone from disk.
- `npm run validate:content` → **exit 0.** 1 089 questions (796 approved / 293 needs-review),
  16/16 topics, answer-leak sweep 17 scopes gated, 0 blocking.
- `npx vitest run --maxWorkers=4` → **754 files: 3 failed, 750 passed, 1 skipped.
  11 468 tests: 3 failed, 11 295 passed, 170 skipped.** 187 s.
  - `exam/__tests__/content-bank.test.ts` — the expected quarantine red.
  - `lesson/__tests__/compose.test.ts` — the expected quarantine red (`l-accidents-first-aid`).
  - `modules/sim/__tests__/law-citations.test.ts` — **this wave's own, not another lane's.** It trips
    on `lawRef: "к"` in `modules/sim/world/components/__tests__/world-label.test.ts:286`, which is
    untracked **alongside `worldLabel.ts` and `signalHeadLabels.ts` — the two source files the same
    B35 build created**. Three separate lane reports called it „another lane's in-flight file"; it is
    a one-token fix in their own fixture.
- The gate's own probes (`zzverify-probe.test.ts`, `zzverify-adv.test.ts`) were **deleted**; the
  targeted re-run after deletion — `src/modules/sim/rules src/modules/sim/hud
  src/components/sim/lesson-ui src/lib/content` — is **65 files / 1 082 tests, all passed**.
- Prose gate, unchanged by this wave: `penalties.json` **0 refused** (41 fields; 55 quoted, 5 derived,
  2 stipulated, 1 constant, 7 digits-only, 173 citation coordinates masked); `content/questions`
  **exactly 296** ungrounded figures, the ratchet neither raised nor lowered.
- No dev server was started by this gate and no dist dir created: the drives reused the rig already
  listening on `:3200`, read-only.

### Re-measured 2026-08-09 by the ATTACK-THE-CHECK gate — the third pass, and it read nothing on trust

Three lanes reported closing defects that a previous gate had found **by attacking rather than
reading**. This gate re-ran the known attack against the shipped code, invented twelve more, drove
the exam in a browser, and fed both watermark specimens to every check in the repo. Nothing below is
quoted from a lane's hand-over.

- `cd platform && npx tsc --noEmit --incremental false` → **exit 0, no output.**
- `npm run validate:content` → **exit 0. OK — all structural and referential checks passed.**
  1 089 questions (796 approved / 293 needs-review; **0 human-signed**), 16/16 topics, 152 concepts,
  54 sections, 77 signs. Answer-leak sweep: **17 scopes gated, 0 blocking, 0 warning.**
- `npx vitest run --maxWorkers=4` → **755 files: 2 failed | 752 passed | 1 skipped.
  11 518 tests: 2 failed | 11 346 passed | 170 skipped.** 180.01 s.
  - **Exactly the two protected reds, and no third.**
    `src/modules/exam/__tests__/content-bank.test.ts > has no dark, threadbare or under-represented
    topic` (`REVIEW_DEBT` — `ptp-i-parva-pomosht` 31/64 approved), and
    `src/modules/lesson/__tests__/compose.test.ts > gives every lesson at least one quiz beat`
    (`l-accidents-first-aid`).
  - The `law-citations.test.ts` red the SCALES gate reported is **gone** — the `lawRef: "к"` typo in
    the B35 lane's own fixture was fixed. No lane-attribution dispute this round.
- **Attack battery: 13 attacks on `verifyCitations` against the real bank. 7 refused, 6 through.**
  Each survivor was then re-run as a COMMITTED mutation of `content/law/penalties.json` against the
  repo's own suites, because the loader and the CI gate are different guarantees. **3 of the 6 are
  caught by a test even though the loader accepts them; 3 are caught by nothing.** The full table is
  in `docs/simulation/87`; the three real survivors are O-1, O-2 and O-3 below.
- **The discrimination matrix reproduces independently at 4.** Re-derived here with a private
  implementation of the anchor matcher rather than the exported one: exactly four ordered
  (row, foreign-phrase) pairs survive, all four the one Наредба № 38 exam indent that
  `pen-b2-no-stop`/`-danger` and the two speeding tiers genuinely share. Nothing from ЗДвП or the
  контролни-точки наредба crosses a row.
- **A bare „Наредба № Iз-2539" resolves to the text in force everywhere.** All **11** bare `lawRef`s
  in `content/` (concepts.json x2, questions x9 — `alkohol-i-godnost`, `dokumenti-i-sanktsii`,
  `osnovni-ponyatia`) land on `naredba-iz-2539-consolidated-dv49-2026`; **0 land on the 2025
  snapshot.** Eight more name the edition explicitly and land there too. **And the snapshot is still
  reachable when named** — all four documented markers (`ред. 28.01.2025 г.`,
  `изм. ДВ, бр. 108 от 2024 г.`, `снимка`, `редакция към 2025 г.`) resolve to `naredba-iz-2539`,
  which is the entire point of keeping it. Both Cyrillic „и" and Ukrainian „і" spellings resolve too.
- **Page furniture: „Хумор" is caught twice, „Сиела" only once — and not by an ingest.** Both
  specimens were fed to every check in the repo. The lex.bg sidebar fires **5 of 7** ingest
  signatures *and* 4 stop-lines in `build-naredba-24.mjs`. The Сиела footer fires **0** of them, and
  **`content/law/tools/build-corpus.mjs` — the tool that actually produced all 185 watermark
  occurrences — contains no furniture check of any kind.** Only the repo test catches it: injecting
  the stamp into `naredba-24.json` `чл. 9` turned `pageFurniture.test.ts` red on the ledger
  (`+ "naredba-24": { "чл. 9": 2 }`), and the file was then restored byte-identical.
- **Theory exam: 0 bare „т." and 0 unqualified „точки" on all four exam files** (`HEAD` had 8 + 14),
  measured with a scanner written for this gate. The runner was **driven in a browser** at 1280 px
  and 375 px. See §7, G-5 (3).
- **No file was left changed.** Both temporary probes deleted
  (`src/lib/content/law/__gate-probe.test.ts`,
  `src/components/exam/__tests__/__gate-render-probe.test.tsx` — a repo-wide search for
  `*probe*` / `*__gate*` returns only the pre-existing `b15-roundabout-wait.probe.test.ts`).
  `content/law/penalties.json` and `content/law/acts/naredba-24.json` were mutated for the
  committed-attack runs and restored **byte-identical**, verified by buffer equality against a
  pre-mutation copy (penalties.json sha256 `a682f0e1fd353833…`, 44 036 B). No dev server was started
  and no dist dir created — the drive reused the rig already listening on `:3200`, read-only. The
  four orphan `platform/.next-*` dirs (`c5rsw`, `harness`, `rig`, `ttlane`) are still on disk and are
  **not this gate's**.

#### STILL OPEN — every item with a NAME, an OWNER and a REASON

| # | name | owner | what is actually wrong | reason it is still open |
|---|---|---|---|---|
| **O-1** | `chl-182-alinea-twins` | law-content lane — `content/law/penalties.json` + `lib/content/law/corpus.ts` | ЗДвП чл. 182 ал. 1 т. 3 and ал. 2 т. 3 are **word for word identical**, so flipping `paragraphRef` to „ал. 2" on the in-town speeding row is invisible to every check, including the new alinea-span parser. Harmless at that tier (both 100 лв.); **not harmless at т. 4, where in town is 400 лв. and out of town 300.** Measured: the mutation passes `verifyCitations` AND the whole repo suite. | The discriminator is the alinea's own opening („в населено място" / „извън населено място") and **no citation field carries it.** Closing it means the citation must declare which ladder it is on — a schema addition, not a matcher tweak. The 31–40 row does not exist yet, which is exactly when to fix it. |
| **O-2** | `row-label-untied` | founder decision first, then law-content lane | `titleBg`, `summaryBg` and `id` are **our** words and nothing ties them to the conduct. Rewriting `pen-speeding-urban-21-30`'s title to „Преминава на червено" leaves every citation verified and the whole suite green. Confirmed by committed mutation. | The obvious tie — the title must satisfy the row's anchors — was measured **failing on the honest rows**: „Превишена скорост … с 21 – 30 km/h" contains neither „превишаване" nor „от 21 до 30" (en dash, participle, not the verbal noun). Closing it means rewriting student-facing titles into statutory vocabulary. That is the founder's call, not a loader's. *(The `id` variant IS caught, but only incidentally — 12 tests name the id.)* |
| **O-3** | `phrase-truncation-drops-the-limit` | law-content lane — `content/law/penalties.json` | **Not hypothetical, and it is live on a shipped row.** `pen-b2-no-stop-danger`'s fine phrase can be shortened from the whole of чл. 179, ал. 1, т. 5 to „не спазва предписанието на пътните знаци" — dropping „ако от това е създадена непосредствена опасност за движението", **the entire difference between that row's 200 лв. / 10 к.т. and `pen-b2-no-stop`'s 50 лв.** The truncated phrase is verbatim, is inside the quotes, and satisfies the row's own conduct. Committed mutation: suite green. | Structural, and worth writing down: **a row's `conduct` is forced to be the WEAKEST COMMON DENOMINATOR of its figures**, because check (5b) requires *every* phrase to satisfy *every* anchor group. Adding an „опасност" group to that row would break its own контролни-точки and наказателни-точки citations, which come from acts that do not carry the word. So the two rows that differ **only** by the danger clause are the two rows that cannot declare it. |
| **O-4** | `build-corpus-has-no-furniture-guard` | content lane — `content/law/tools/build-corpus.mjs` | The ingest that produced **124 watermark occurrences in naredba-38 (34 units, including приложение № 5 — the marking scheme quoted on every fault card), 58 in naredba-iz-2539 and 3 in naredba-sredstva-za-izmervane** has **zero** furniture signatures. The guard that exists is on `build-naredba-24.mjs`, which produced none of them and does not know the Сиела stamp either. | The fix belongs in the extraction, and the extraction's inputs (`iz2539.txt`, `naredba38.txt`) are **gitignored scratch that is not in the tree** — the tool cannot be re-run, so a change to it cannot be verified. Needs the source PDFs re-fetched, a line filter before `splitByRegex`/`splitAnnexes`, then every `quoteBg` in `penalties.json` / `n38.ts` / `consequences.ts` re-cut. |
| **O-5** | `conduct-can-be-loosened-in-the-loader` | law layer — `lib/content/law/corpus.ts` | Guard (d) refuses an **unused** anchor alternative but nothing refuses a **deleted group**. Replacing the 21–30 row's two groups with the single stem `[["превиш"]]` — spelling the numbers out of `statementBg` so the digit rule has nothing to bite on — passes all four declaration guards, and the row then accepts every speeding tier in чл. 182. **`verifyCitations` returns `[]`.** | **The repo gate DOES catch it**: the committed mutation turns three tests red, the loudest being the discrimination matrix (6 pairs where 4 are pinned). So this is a *loader* hole, not a shipping hole — it matters only if content is edited without CI. Named so nobody mistakes the loader's silence for coverage. |
| **O-6** | `two-bare-units-outside-the-guard` | reviewer/admin-surface lane | `app/(dashboard)/review/ReviewClient.tsx:635` (`{q.points} т.`) and `app/(dashboard)/admin/page.tsx:415` (`${row.score}/${row.maxScore} т.`) still render a bare unit. | Both sit behind an admin/reviewer gate, so no student meets them — but both directories are outside `GUARDED_DIRS` in `point-scales.test.ts`, which means the guard will not notice if a student-facing surface is ever added to those trees. Low blast radius, real blind spot. |
| **O-7** | `score-readout-never-photographed` | theory lane | `ScoreReadout` (the revisited-attempt result) and `HistoryRow` (the index) in the two `exams` `page.tsx` files have **never been rendered by anyone**. `ScoreReadout` is the more-travelled of the two result screens. | They are module-private inside async server components behind `requireUser`; `/exams` returns 307 → `/login`. Needs a seeded user with a finished attempt on the staging DB, or a `/dev` rig that mounts them the way `fold-rig` mounts the runner. |
| **O-8** | `bare-name-in-a-display-string` | law-content lane | `lib/content/pointScales.ts:122` `CONTROL_SCALE_SOURCE_BG = "Наредба № Iз-2539"` is a bare edition name **shown to the student**, unlike the `consequences.ts` chips which now read „(изм. ДВ, бр. 49 от 2026 г.)". | Not a defect today — it names no article and no figure, so there is nothing an edition could change. Flagged because it is the last bare rendering of that act's name, and the next person to put an article number beside it inherits the original problem. |
| **O-9** | `readme-table-contradicts-the-resolver` | law-content lane — `content/law/README.md:142` | The alias table still reads „`Наредба № Iз-2539` → the 2025 snapshot — every pre-existing citation, unmoved". **That is the old rule.** The resolver now sends a bare name to the consolidation, and lines 101–121 of the same file say so. | Two statements of one fact in one file, and the stale one is the table a reader will scan first. A one-line edit, left to the owning lane so the correction carries their measurement rather than this gate's.
