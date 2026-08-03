# 90 — Theory bank vs. the law: the one defect ledger

**Date:** 2026-08-03
**Scope:** all 1,089 questions in `content/questions/*.json` (16 files), checked against ЗДвП
(consolidated to ДВ бр. 55 / 16.06.2026) and the SARS нормативна база.
**Status:** READ-ONLY. No question was edited. Corrections come after the retrieval layer exists.
**Inputs:** nine independent auditors, 135 delivered findings, deduplicated and re-ranked here.

---

## 1. The answer to your question

You asked plainly whether the theory bank is trustworthy, because "if theory is to be wrong we
instantly lose confidence."

**43 questions out of 1,089 — 4.0% — would actively mislead a student.**
That is 24 where our answer key is wrong (they answer our way and fail the real exam) and 19 where
the student ends up believing something false about their obligations or penalties.

**A further 83 questions — 7.6% — have the right answer attached to the wrong article.**
They do not hurt the student on the road or in the exam hall. They hurt us, and they will hurt the
AI: ADR-002 says the tutor grounds by retrieval and citation only, so a wrong `lawRef` is the one
defect that propagates straight into the thing we promised would never free-recall the law.

**145 questions (13.3%) carry at least one proven defect. 944 (86.7%) came through clean.**

So: **yes, trustworthy — but not shippable as-is, and the reason is not the error rate.**

Three things make this a manageable problem rather than a confidence-losing one:

1. **The damage clusters. It is not smeared.** 24 of the 43 actively-wrong questions sit in four
   clusters with four single root causes: bus stops (5 questions, one misread alinea), the nine
   unanswerable sign questions (one missing media field), e-scooters (5 questions, one 2025
   amendment we never ingested), level crossings (2 questions, one missing ППЗДвП article). Fix six
   root causes and most of the exam-failing tier disappears.
2. **The bank usually already knows the right answer.** In nearly every citation defect, a sibling
   question in the same or an adjacent file cites correctly. `predimstvo.json` is right where
   `krastovishta.json` is wrong, 19 times. `q-magistrali-045` explicitly warns students about the
   exact stale figure `q-speed-024` teaches. The fix is largely mechanical and self-validating.
3. **Nothing was invented from memory.** Every finding below quotes a retrieved line. Zero findings
   were dropped for lacking one.

And one thing that should worry you more than the 4%:

> **22 of the 24 exam-failing questions are marked `"status": "approved"` — including all nine that
> are literally unanswerable.** Bank-wide: 1,005 approved, 84 needs-review. `CLAUDE.md` says
> `status: draft` until reviewed. Right now `approved` means "generated", not "checked". The flag is
> asserting a review that never happened, which is what would actually cost us confidence if a
> customer found it before we did.

---

## 2. Counts

| Tier | What it costs the student | Questions | % of 1,089 |
|---|---|---|---|
| **fails-an-exam** | They answer our way and get it wrong on the real test | **24** | 2.2% |
| **teaches-wrong-law** | They believe something false about obligations or penalties | **19** | 1.7% |
| *subtotal: actively misleading* | | **43** | **4.0%** |
| **misleading** | Right answer, wrong article (or penalty of the wrong class) | **83** | 7.6% |
| **cosmetic** | Terminology, missing qualifier, imprecise paraphrase | **19** | 1.7% |
| **Total with ≥1 proven defect** | | **145** | **13.3%** |
| **Clean** | | **944** | **86.7%** |

Structural facts, measured directly from the files:

| Measure | Value |
|---|---|
| Questions with zero `lawRefs` | **0** — the citation surface is 100% populated |
| Distinct `lawRef` strings in the bank | 467 |
| Questions with any `media` | 63 of 1,089 (5.8%); `patni-znatsi.json` 22 of 88 |
| `status: approved` | 1,005 |
| `status: needs-review` | 84 |
| Exam-failing questions marked `approved` | 22 of 24 |

---

## 3. Method, and what "proven" means in this document

**Rule applied: a finding without a verbatim source quote is an auditor's memory, and ADR-002
forbids acting on that.** Every finding below carries a quoted line from a retrieved text.

- **Findings dropped for having no verbatim quote: 0.** All 135 delivered findings carried a
  `sourceLine`. That number is itself a result — the auditors held the line.
- **Findings reclassified from "defect" to "could not verify": 4.** In each, the quote proves
  something adjacent to the claim rather than the claim itself. They moved to §7, the work list,
  not the defect list: `q-alkohol-007`, `q-alkohol-021` (with siblings `-002`, `-044`),
  `q-alkohol-008`, `q-manevri-061`.
- **One finding arrived damaged:** `q-uyazvimi-022`'s quote is truncated mid-sentence and its
  severity label was lost in transit. The surviving clause carries the load, so I kept it and
  assigned the tier myself. Flagged inline.
- **One class of finding is quoted from our own file, not from law:** the nine unanswerable sign
  questions. That is a data defect, and the quote is verbatim from `patni-znatsi.json`.

**Where I overrode an auditor's severity.** You gave the four definitions, so they are the ranking
authority, and in six cases an auditor rated a pure citation defect (right answer, right rule, wrong
article) as `teaches-wrong-law`. Under your definition that is `misleading`. Moved down:
`q-signs-023`, `q-signs-024`, `q-signs-075`, `q-signs-076`, `q-krastovishta-012`, `q-manevri-009`.
Moved down from `fails-an-exam` for the same reason: `q-manevri-021`, `q-manevri-035` (all four
graded answers are correct in both). Nothing was moved up except `q-uyazvimi-022`, above.

**What I re-verified myself, in the actual files, rather than trusting the feed:**

| Claim | Result |
|---|---|
| Nine four-sign questions with `media: null` | **Confirmed, 9/9**, and they are the only four-sign rows in the file |
| `patni-znatsi.json` media coverage | **Confirmed** 22 of 88 |
| `q-speed-024` teaches 50/70/90/100 for B+E | **Confirmed** verbatim |
| `q-spirane-056` teaches "50 метра от двете страни" | **Confirmed** verbatim |
| `q-spirane-027` marks престой at a bus stop as forbidden | **Confirmed** verbatim |
| `q-dokumenti-030` marks "Уикенд" correct, "Един ден" wrong | **Confirmed** verbatim |
| `q-dokumenti-016` vs `q-019` contradict each other on контролни точки | **Confirmed** — three questions apart, in the same file |
| `q-uyazvimi-036` presents an adult riding без каска as lawful | **Confirmed** verbatim |
| `q-uyazvimi-014` marks night riding with lights as correct | **Confirmed** verbatim |
| Total question count | **Confirmed** 1,089 |

I also killed one false positive of my own: a first pass appeared to show 1,089 questions with no
correct answer marked. The option flag is `correct`, not `isCorrect`. **No such defect exists.**
Recording it because a ledger that only reports hits is not a ledger.

---

## 4. Tier 1 — fails-an-exam (24 questions)

The answer key is wrong. A student who studies these and meets the same point on the official exam
answers wrongly.

### 4.1 The nine unanswerable sign questions — 9 questions

`q-signs-066`, `-069`, `-073`, `-076`, `-077`, `-081`, `-083`, `-086`, `-088`

Each asks "Кой от **показаните** знаци…" and offers options that read literally "Знак 1 / Знак 2 /
Знак 3 / Знак 4". Every one has `"media": null`. Nothing is shown. All nine are marked `approved`.

> `q-signs-066` verbatim from `patni-znatsi.json`: `"textBg": "Кой от показаните знаци предупреждава
> за единичен опасен завой НАЛЯВО?"` … options `"Знак 1" / "Знак 2" / "Знак 3" / "Знак 4"` …
> `"media": null`

This is not a law defect and it outranks every law defect in the file. It is also **a schema
problem, not just a content problem**: the media shape used elsewhere, `{"kind":"sign","signRef":"А1"}`,
holds exactly one sign and structurally cannot carry a four-sign comparison. These nine cannot be
fixed by filling a field — the schema needs a multi-sign media kind first.

### 4.2 Bus stops: чл. 98 ал. 1 vs ал. 2 — 5 questions

`q-spirane-045` is a separate defect in the same article; the bus-stop cluster proper is
`q-spirane-008`, `-027`, `-028`, `-065`, `-069`.

Bus stops are in **ал. 2**, which bans **паркиране only**. We put them in ал. 1 and ban престой too.
`q-spirane-028`'s entire teaching point is the ал.1/ал.2 split, and it puts bus stops on the wrong
side of it.

> ЗДвП чл. 98: "(2) Освен в посочените в ал. 1 случаи **паркирането** е забранено: … 3. на спирките
> на превозните средства от редовните линии за обществен превоз на пътници;"

The bank contradicts itself: `q-spirane-048` states the same т. 4 correctly as a functional test.
**Human note:** чл. 183 ал. 4 т. 8 does penalise "неправилно престоява или паркира в зоната на …
спирка", which creates real tension with ал. 2. The prohibition itself sits in ал. 2; the tension is
a lawyer's question. See §8.

### 4.3 A fabricated number — 1 question

`q-spirane-056` — marked-correct answer "На самия прелез и на по-малко от **50 метра** от двете му
страни", cited to чл. 98 ал. 1, and the explanation repeats it.

**No 50-metre figure for railway crossings exists anywhere in ЗДвП.** Every occurrence of "50 метра"
in the consolidated text is unrelated (чл. 39, 70, 88, 131). ППЗДвП чл. 101 ал. 1 т. 4 is
word-identical to the ЗДвП provision and also has no distance. The real rule is functional:

> ЗДвП чл. 98 ал. 1: "4. върху трамвайни и железопътни линии или в такава близост до тях, която може
> да затрудни движението на релсовите превозни средства;"

This is the exact failure mode you were worried about: a plausible round number a student will
memorise and do arithmetic on.

### 4.4 One-way street: престой is not паркиране — 1 question

`q-spirane-045` asks where you may **park** on a one-way street and answers "и от лявата страна".
чл. 94 ал. 4 permits **престой** only, and the statute draws the distinction deliberately in the
same article (ал. 3 opens "За престой **и паркиране**…", ал. 4 says only "се допуска престой").

> ЗДвП чл. 94 ал. 4: "На път с еднопосочно движение се допуска **престой** и от лявата страна по
> посока на движението, ако това не пречи на движението на пътните превозни средства."

### 4.5 E-scooters: the 7.09.2025 rewrite of чл. 80а — 2 questions here, 5 in total

`q-uyazvimi-036` — option (d) "Да кара през деня без каска, ако е пълнолетен" is marked **not**
forbidden, and the explanation says outright "каската е задължителна за водачите под 18 години, така
че пълнолетен без каска не нарушава". The duty has no age qualifier:

> ЗДвП чл. 80а (изм. ДВ бр. 64 от 2025 г., в сила от 7.09.2025 г.) ал. 1: "Водачът на индивидуално
> електрическо превозно средство е длъжен: … 3. да ползва защитна каска;"

`q-uyazvimi-014` — two of three marked-correct options are wrong. The helmet claim repeats the
above; worse, "През нощта трябва да се движат с включени светлини" is marked correct when night
riding is **banned outright**:

> ЗДвП чл. 80а ал. 2: "На водача на индивидуалното електрическо превозно средство е забранено да: …
> 6. се движи в тъмната част на денонощието;"

Teaching a 17-year-old that night riding is allowed with lights on is the safety-relevant half.
(`q-uyazvimi-035` and the newly-found `q-osnovni-047` are the other two, in Tier 2.)

### 4.6 Pedestrian rules rewritten in 2025 — 3 questions

`q-uyazvimi-005` — option (c) "Престарелите хора и бременните жени" is marked correct. чл. 116 was
amended by ДВ бр. 64/2025 and no longer lists them. "престарел" occurs **zero** times in the whole
act; "бременн" occurs once, in чл. 137а (a seatbelt exemption).

> ЗДвП чл. 116 (изм. бр. 64 от 2025 г.): "…особено към децата, към хората с трайни увреждания, в
> частност към слепите, които се движат с бял бастун, към слепо-глухите, които се движат с
> червено-бял бастун."

The category the current text *does* add — слепо-глухите с червено-бял бастун — appears in no option
anywhere in the file.

`q-uyazvimi-003` — option (b) marks **заобикаляне** of a car stopped at a pedestrian crossing as
prohibited. No such prohibition exists; чл. 119 ал. 2 does the opposite and regulates the manoeuvre.

> ЗДвП чл. 119 ал. 2: "При заобикаляне на спряло пред пешеходна пътека пътно превозно средство
> водачът … е длъжен да се движи с такава скорост, която да му позволи да спре, за да пропусне
> преминаващите по пешеходната пътека пешеходци."

`q-uyazvimi-022` *(severity label lost in transit; tier assigned here by your definitions)* — option
(a) is marked correct and drops the governing location condition entirely. The right exists only
outside built-up areas, and inside them only on two-lane two-way roads. On a four-lane urban
boulevard our answer is wrong.

> ЗДвП чл. 113 ал. 2 (изм. бр. 64 от 2025 г.): "Извън населените места и по двулентовите двупосочни
> пътища…" *(quote truncated in the source feed; the surviving clause is the load-bearing one)*

### 4.7 The speed table — 1 question

`q-speed-024` — explanation teaches the B+E row as **50 / 70 / 90 / 100**. The чл. 21 ал. 1 table
says **50 / 80 / 100 / 100**. Two of four figures wrong. The 70 is the Категория В1 row — a row slip.

> ЗДвП чл. 21 ал. 1 (изм. бр. 64 от 2025 г., в сила от 7.09.2025 г.), columns *Населено място |
> Извън населено място | Автомагистрала | Скоростен път*: "Категории ВЕ, С1, С1Е, D, D1, D1E, DE |
> 50 | 80 | 100 | 100"; "Категория В1 | 50 | 70 | забранено | забранено"

**Precision matters here:** the *graded* answer (100 km/h on a motorway) is correct. The two wrong
figures are in the explanation. It is still exam-failing, because the explanation is the product —
requirement-zero says the explanation *is* the instructor — and because our own
`q-magistrali-045` grades "70 км/ч" as a **wrong** option and its explanation says *"Дълго време
лимитът беше 70 и много стари помагала още го пишат така."* We are simultaneously the stale
помагало and the question mocking it.

### 4.8 Documents and sanctions — 2 questions

`q-dokumenti-030` — the answer key is **inverted**. "Уикенд" is marked correct and "Един ден" is
marked wrong, and the explanation asserts that a one-day vignette "просто не съществува".

> Закон за пътищата чл. 10а ал. 1: "В зависимост от срока винетните такси биват годишна, тримесечна,
> месечна, седмична, уикенд и **еднодневна**…" ал. 2: "…минималната пътна такса, която се дължи за
> това ползване, е винетна такса с **еднодневна** валидност."

**Caveat, and it is a real one:** the SARS copy of Закон за пътищата is a Ciela snapshot dated
08/10/2025. It carries this provision with an in-force date of 03.02.2026 (i.e. in force today), but
it cannot show a repeal or postponement enacted after October 2025. Even in that worst case the item
needs human review before it ships. See §8.

`q-dokumenti-040` — option (c) "Когато не е представен на задължителния периодичен технически
преглед" is marked correct as a ground for временно спиране от движение. чл. 171 is a closed list
("се прилагат следните принудителни административни мерки") and the lettered item that carried this
is repealed:

> ЗДвП чл. 171 т. 2: "е) (нова - ДВ, бр. 85 от 2004 г., доп., бр. 97 от 2017 г., **отм., бр. 64 от
> 2025 г., в сила от 7.09.2025 г.**);"

The consequence today is a fine under чл. 181 т. 1, not removal from traffic. The other two
marked-correct options are correctly grounded in чл. 171 т. 2 б. "а" and б. "в".

---

## 5. Tier 2 — teaches-wrong-law (19 questions)

The student ends up believing something false about their obligations or penalties. Includes four
items that must go to a human rather than be rewritten by us (marked **HUMAN**, detailed in §8).

| # | Question | What we teach | What the quoted law says |
|---|---|---|---|
| 1 | `q-dokumenti-016` | "получаваш ги наведнъж при издаването на книжката" | чл. 157 ал. 1: two thirds at issuance, the last third after 24 months' стаж. Наредба Iз-2539 чл. 2: 39 max, 26 initial, +13 later. **Our own `q-019`, three questions later, says the opposite and is right.** Aimed squarely at a 17-year-old with a new licence. |
| 2 | `q-dokumenti-049` | "важи сигналът, не облеклото" — a plain-clothes officer may stop you | чл. 170 ал. 4 (нова, бр. 64/2025) permits control from unmarked cars **only** by officers "изпълняващи служебните си задължения в **униформено облекло**". We teach the exact opposite in the one scenario where impersonation is the obvious risk. Citation also wrong: чл. 103 → чл. 170 ал. 6. |
| 3 | `q-dokumenti-050` **HUMAN** | Three marked-correct options about контролни точки by електронен фиш | Наредба Iз-2539 чл. 3 ал. 1: "Контролни точки се отнемат въз основа на влязло в сила наказателно постановление." ЗДвП чл. 189 ал. 5 т. 8 and чл. 186 ал. 1 both presuppose фишове *do* deduct points. **The two official sources contradict each other and none of our three statements matches either.** Nothing here should ship as written. |
| 4 | `q-dokumenti-055` **HUMAN** | Not turning up for the blood test simply leaves the дрегер reading standing | The evidential half is right (Наредба № 1/2017 чл. 13 ал. 6). The sanction half is missing and its absence inverts the incentive: чл. 174 ал. 3 attaches "лишаване … за срок от **две години** и глоба **2000 лв.**" to non-compliance with the предписание. |
| 5 | `q-alkohol-010` | Refusal "се наказва с най-тежката санкция" | чл. 174 ал. 2: a **repeat** offence carries "глоба в размер 2000 лв. и лишаване … за срок **три години**" — longer than refusal's two. Points too: 15 for refusal vs 20 for повторно. And the comparison is category-wrong: над 1,2 falls outside чл. 174 entirely. |
| 6 | `q-alkohol-052` | Drinking after a crash is treated "все едно е отказал проверка … по най-тежкия ред" | чл. 174 ал. 3 applies **only** to a driver "който **не е участвал** в пътнотранспортно произшествие" — the exact opposite of this scenario. The real rule is чл. 123 ал. 1 т. 2 б. "е", penalised by чл. 175 ал. 1 т. 5 = 3 месеца + 200 лв. Wrong by an order of magnitude in both duration and money. |
| 7 | `q-magistrali-015` | Descending driver reverses, unconditionally — and it is the graded answer | чл. 45 ал. 3 assigns reversing **by vehicle type**, and in two of three cases the *ascending* driver reverses. The rule we describe is ал. 4, conditional on both vehicles being the same category, with two exceptions. |
| 8 | `q-signali-058` **HUMAN** | "Забранено е движението ПО BUS лентата, а не самото ѝ пресичане" | ППЗДвП чл. 63 ал. 2 т. 1: a BUS lane is delimited by М1 and "На пътните превозни средства е забранено да я застъпват и пресичат." ДР § 1 т. 3 adds it is also a boundary of the carriageway. Neither cited article carries a right-turn carve-out. **No grounded replacement answer exists — the alternative option is equally ungrounded.** |
| 9 | `q-signs-079` | "В3 спира моторните превозни средства — коли, **мотори**, камиони" | Наредба РД-02-21-1 прил. № 3: "В3 Забранено е влизането на моторни превозни средства, **с изключение на мотоциклети без кош и мотопеди**". Our own `q-signs-032` states the identical exception correctly for В24. |
| 10 | `q-signs-050` | A rectangular sign called "Пешеходна зона", in група Д, прил. № 5 | **No such sign exists.** Zero hits for the string across ЗДвП, ППЗДвП and the наредба. The real instrument is Г15а "Задължителен път само за пешеходци" — група Г, прил. № 4, and by чл. 91 ал. 1 a **round blue** sign. Sign, shape and appendix all wrong. |
| 11 | `q-krastovishta-066` | Unbarriered crossing: "намалявам, оглеждам се … и преминавам" — no option mentions stopping | чл. 51 ал. 3: "Спирането на пътните превозни средства е **задължително** пред железопътен прелез, който няма бариери." ППЗДвП чл. 110 even fixes where. **Our `q-predimstvo-055` says exactly this and is right.** |
| 12 | `q-krastovishta-054` | Same scenario, cross + no signalling; mandatory stop absent from every option | ППЗДвП чл. 109: "Спирането … е задължително при: 1. липса на бариери и на съоръжения за подаване на звукова и светлинна сигнализация;" — this exact combination is the first named case. |
| 13 | `q-krastovishta-047` **HUMAN** | "Движението на заден ход в кръстовище и през него е **изрично** забранено (чл. 40)" | чл. 40 contains no prohibition and never mentions a junction — only a duty to check. The only junction reversing ban is narrower: чл. 38 ал. 4, reversing **while performing a U-turn** there. The graded answer rests entirely on the asserted prohibition. |
| 14 | `q-krastovishta-051` | A left-turner who has taken position is passed on the right, "по чл. 42" | чл. 42 contains no exception of any kind. And a new Раздел IXa entered 7.09.2025 setting the opposite default: чл. 43б ал. 1 "Заобикалянето се извършва от **лявата** страна…, а при невъзможност или при наличие на съответния пътен знак – и от дясната." |
| 15 | `q-manevri-005` | Middle lane "само за изпреварване, заобикаляне **или завиване наляво**" | чл. 16 ал. 1 т. 2: "навлизането и движението в средната лента е разрешено **само** при изпреварване или заобикаляне". We grant a permission the statute withholds, inside an option whose own wording is "само". |
| 16 | `q-manevri-045` | "когато релсите са вляво на еднопосочна улица, го подминаваш ОТЛЯВО" | чл. 43а: "Забранено е изпреварването и заобикалянето на релсово превозно средство от лявата страна." Unconditional. We teach a manoeuvre the statute flatly forbids. |
| 17 | `q-ptp-052` | "лишаване … за срок от **1 до 6 месеца** и глоба" | чл. 175 ал. 1 (изм. бр. 64/2025) now sets a **fixed** penalty: "лишаване … за срок **три месеца** и с глоба **200 лв.**" The range is the repealed pre-September-2025 formulation and the amount is omitted. The penalty *class* is right and worth preserving. |
| 18 | `q-uyazvimi-035` | "16 години по улици — за 14-годишните законът оставя единствено велосипедните алеи" | чл. 80а ал. 3: "Минималната възраст на водача за управление на индивидуално електрическо превозно средство е **шестнадесет** години." No road-type qualifier, no 14-year-old carve-out anywhere in the act. |
| 19 | `q-osnovni-047` ⚠️ **NEW** | Same invented tier: "има и възрастови граници: 16 години по улици, **14 — само по велоалеи** (ЗДвП, чл. 80а)" | Same чл. 80а ал. 3 quote refutes it. **Marked `approved`.** This one was not in any auditor's delivered findings — I found it by tracing the `чл. 80а` citation cluster across all 16 files. See §9. |

---

## 6. Tier 3 — misleading: right answer, wrong article (83 questions)

These do not make the student wrong. They make our citations wrong, which under ADR-002 is what the
AI grounds on. Grouped by root cause, because the roots are what get fixed.

> **Reading the counts:** a cluster heading counts every question the cluster touches. The tier
> totals in §2 assign each question to its **highest** tier only. So a question that appears in a
> cluster here but is already counted in Tier 1 or Tier 2 is not double-counted — it is flagged
> inline where that happens. Cluster sizes therefore do not sum to 83.

### 6.1 чл. 50а as an all-purpose roundabout article — 11 questions touched, 9 counted here
`q-krastovishta-012`, `-013`, `-014`, `-015`, `-050`, `-059`, `-064`, `-065`; `q-signs-046`
(9 counted in this tier). Also `q-signs-083` (already Tier 1, §4.1 — media defect outranks it) and
`q-krastovishta-069` (cosmetic, §7).

> ЗДвП чл. 50а: "(**Нов - ДВ, бр. 51 от 2007 г.**) Забранено е навлизането в кръстовище дори и при
> разрешаващ сигнал на светофара, ако обстановката в кръстовището ще принуди водача да спре в
> кръстовището или да възпрепятства напречното движение."

It is the blocked-junction rule and contains no roundabout provision. **Two independent auditors
grepped both ЗДвП and ППЗДвП: there is no statutory roundabout-priority rule at all** — the only
ЗДвП hit for "кръгов" outside sign names is чл. 54 ал. 2, about waving your arm to stop a train.
`q-krastovishta-012` compounds it by dating the article to 2017 and quoting it as saying something
it does not.

The correct chain is Б1/Б2 at the entry + чл. 50 ал. 1, plus Наредба РД-02-21-1 чл. 98 for Г12 and
чл. 61 ал. 5 ("Пътен знак Б3 не може да се поставя на входовете на кръгово кръстовище").
`q-predimstvo-021/022/057` already build it correctly.

**Measured directly:** 14 questions bank-wide cite чл. 50а. 11 are wrong. `q-krastovishta-019` and
`q-signali-043` use it **correctly** (both genuine blocked-junction scenarios) — verified in the
files. So the bank knows the article's real meaning; it just also uses it as a label.

### 6.2 Б1 / Б2 stopping rules cited to ЗДвП instead of ППЗДвП — 7 questions
`q-signs-007`, `-009`, `-022`, `-054`; `q-krastovishta-006`, `-024`, `-063`.

> ППЗДвП чл. 46: "(1) Пътен знак Б1 указва … че са длъжни да пропуснат движещите се по пътя с
> предимство, което може да стане и **без спиране**. (2) Пътен знак Б2 указва … че са длъжни да
> **спрат** на 'стоп-линията'…"

ЗДвП чл. 50 contains no stopping rule of any kind. Cited correctly by `q-signs-064`,
`q-signs-008`, `q-signs-028`, `q-signali-008/024/033`, `q-predimstvo-008/010/067/068/069`.

### 6.3 The two swapped priority pairs — 4 questions
`q-signs-023` ↔ `q-signs-024` (Б3 / Б4) and `q-signs-075` ↔ `q-signs-076` (А25 / А26).

чл. 48 is the equal-roads / give-way-to-the-right rule; чл. 50 is the signed-priority-road rule.
Each pair has them exactly backwards, and the explanations sign off with the wrong number, planting
an inverted mapping.

> чл. 48: "На кръстовище на равнозначни пътища водачът … е длъжен да пропусне пътните превозни
> средства, които се намират или приближават от **дясната** му страна…"
> чл. 50 ал. 1: "На кръстовище, на което единият от пътищата е **сигнализиран като път с
> предимство**, водачите … от другите пътища са длъжни да пропуснат…"

`q-signali-063` and `q-signs-037` prove the intended mapping — both cite correctly for identical
situations. Same failure mode doc 86 already caught twice.

### 6.4 The overtaking checklist: чл. 41 vs чл. 42 — 4 questions
`q-manevri-009`, `-028`, `-041`, `-062`. `q-manevri-009` goes furthest, asserting "Чл. 41 ЗДвП
**изброява точно това**" — a positive false claim about the article's contents.

> чл. 42 ал. 1: "Водач, който ще предприеме изпреварване, е длъжен: 1. преди да подаде сигнал, да се
> убеди, че не го изпреварва друго пътно превозно средство… 2. след като е подал сигнал, да се убеди,
> че има видимост, свободен път на разстояние, достатъчно за изпреварване…"

чл. 41 has two alineas and lists nothing. **Measured:** 11 questions in `manevri` cite чл. 41; 6 are
defective. Worth re-checking `q-eco-009`, `q-eco-055`, `q-osnovni-011`, `q-predimstvo-053`, which
sit on the same article and were audited by the two auditors whose findings did not arrive (§9).

### 6.5 Emerging from a roadside property: чл. 25 vs чл. 37 ал. 3 — 3 questions
`q-manevri-003` (бензиностанция), `-022` (паркинг), `-064` (гараж, plus the pedestrian duty).

> чл. 37 ал. 3: "Водачът на пътно превозно средство, излизащо на път от крайпътна територия, като
> двор, предприятие, **гараж, паркинг, бензиностанция** и други подобни, е длъжен да пропусне
> **пешеходците** и пътните превозни средства, които се движат по този път."

The article names all three scenarios verbatim. чл. 25 never mentions pedestrians at all, which
leaves `q-manevri-064`'s marked-correct pedestrian option with no basis in the cited article.

### 6.6 The тротинетка / чл. 80а sub-point references — 2 questions
`q-uyazvimi-036`, `-014` (second defect on each; both already in Tier 1).

All the cited sub-points are wrong. ал. 2 т. 5 is the Г13 bus-lane ban; ал. 2 т. 10 is riding
parallel; ал. 1 т. 5 is how to cross the carriageway; ал. 2 т. 1 is the registration requirement
**which only enters into force 1.07.2026**. The pavement ban is ал. 2 т. 12 and the passenger ban is
ал. 2 т. 8.

### 6.7 The alcohol file's two catch-all citations — 12 questions
`q-alkohol-001`, `-003`, `-009`, `-011`, `-022`, `-030`, `-031`, `-034`, `-042`, `-047`, `-053`, `-054`.

**Measured directly:** `чл. 5` is the `lawRef` on **41 of 63** questions in `alkohol-i-godnost.json`,
most of them fatigue/medicine/distraction items with no legal content. `чл. 174` is on 18. That
catch-all use is what makes unsourced numbers look sourced.

The sharpest case is `q-alkohol-022` (with `-011`, `-034`, `-047`): "Черният дроб разгражда около
0,1–0,15 промила на час", presented with "(ЗДвП чл. 5)".

> чл. 5 ал. 1: "Всеки участник в движението по пътищата: 1. с поведението си не трябва да създава
> опасности и пречки за движението…"

чл. 5 contains no figure of any kind except the 0,5 limit in ал. 3 т. 1 — nothing about metabolism,
sleep deprivation, microsleep duration or absorption curves. **These are physiological claims wearing
a legal citation**, which is exactly the failure mode you are guarding against: a student reads
"(ЗДвП чл. 5)", assumes 0,1–0,15 промила/час is law, and does arithmetic on it to decide whether to
drive. The numbers themselves are unverified — see §7.

The others: `q-alkohol-054` (ПАМ cited to чл. 174, which contains no ПАМ at all — it is чл. 171 т. 1
б. "б" and чл. 165 ал. 2 т. 3); `q-alkohol-030` (the *duty* to comply is чл. 6 т. 2, not the penalty
article); `q-alkohol-042` (the stop-and-check power is чл. 165 ал. 2 т. 1); `q-alkohol-009` (чл. 174
ал. 4 delegates to a наредба and grants no right); `q-alkohol-001` (attributes the 1,2 criminal
boundary to ЗДвП, while `q-002`, `-021`, `-044` correctly cite НК чл. 343б); `q-alkohol-003`
(enumerates drink-driving consequences and omits контролни точки entirely — a penalty-class gap:
8/12/20/15 points per Наредба Iз-2539 чл. 6, and чл. 157 ал. 4 makes zero points cost правоспособност).

### 6.8 Trams, level crossings and turns in `krastovishta.json` — 10 questions
`q-krastovishta-009` (чл. 36 is the **left** turn; the right turn is чл. 35 — and `q-011`/`q-032`
cite чл. 36 correctly for actual left turns), `-023` (the duty on *other* drivers is чл. 104 ал. 1/2,
not чл. 92 which governs only the special-regime driver), `-031` (right turn across a cycle lane —
чл. 37 is left turns; the set is чл. 25 ал. 2 + чл. 35 ал. 2 + чл. 119 ал. 4), `-045`/`-046` (tram
priority — чл. 8 ал. 2 + ППЗДвП чл. 105, not чл. 48), `-053` (clearing the junction — ППЗДвП чл. 31
ал. 7 т. 4), `-062` (shark's teeth — see §7, substance unverified), and `q-predimstvo-042` (чл. 50
ал. 2 applies only when the priority road **changes direction**; this scenario states it runs
straight, so ал. 2 does not engage — and `q-predimstvo-056` gets the genuine Т13 case right).

### 6.9 Remaining single-root citation and framing defects — 28 questions

`q-dokumenti-018` (coverage gap: чл. 157 ал. 2а–2в, "Водач на МПС без наказания", new 7.09.2025 —
six clean years means **no** points deducted; no question in the file mentions it; also touches
`-036`, `-041`), `-029` (a typo in a vignette plate **is** correctable — чл. 10а ал. 3б, and ал. 3а
carries the express carve-out "с изключение на случаите на корекция по ал. 3б"), `-032` (refusal is
not "най-тежкото" — see Tier 2 #5), `-033` (what is attached to the windscreen is a separate
**уведомление**; the фиш itself is posted — чл. 186 ал. 3; the outcome we teach is right, the
mechanism is not), `-056` (a trailer over 750 kg does **not** automatically require another category —
чл. 150а ал. 2 т. 6 permits a combination up to 4250 kg), `-057` (незначителни defects require **no**
repeat inspection — Наредба Н-32 чл. 38 ал. 1; the 30-day return applies to значителни and опасни),
`-059` (спиране от движение and прекратяване на регистрацията are two different acts — чл. 140 ал. 2;
the plates are surrendered under чл. 143 ал. 6а), `-060` (an unregistered car is **relocated** under
чл. 171 т. 5 б. "в", not спряно от движение — the closed list has no such item).

`q-speed-020`, `-039` (a bare gazette reference "изм. ДВ бр. 64/2025" with **no article number** — a
student cannot open it; it is чл. 21 ал. 3 + чл. 182 ал. 3а, and our own `q-magistrali-033` cites
чл. 21 ал. 3 correctly), `q-speed-049`, `-066` ("Зона 30" now has its own article, чл. 62а, new
7.09.2025; we still send students to the generic чл. 21 ал. 2).

`q-signs-001` ("кръг с бял фон и червен кант **ВИНАГИ** е забранителен" — Б5 has exactly that
silhouette and is a priority sign), `-041` (**HUMAN**, §8), `-046` (Г12 is Наредба чл. 98, not
чл. 50а), `-047` (dead end is Ж13, група Ж, прил. № 7 — not група Е), `-053` (the sign is Б6
"Премини, ако пътят е свободен!" and is a **square**; the name we use was retired), `-080` (В34
cancels only В24/В25/В26 bans and only two or more at once — our "ВСИЧКИ … и т.н." breaks it, and
`q-signs-033` gets it right), `q-signali-012` (чл. 7 ал. 1 resolves conflicts only "относно
предимството"; the unconditional-obedience rule is чл. 6 т. 2, cited nowhere), `q-signali-041`
("редът е железен" — чл. 7 ал. 4 puts a portable-stand or variable-message sign **above** traffic
lights, and ал. 5 puts temporary marking above at roadworks, which is what our own `q-signali-032`,
`-059`, `-060` teach).

`q-manevri-013` (чл. 43 т. 3 limits the ban to crossings **without barriers** and to being **on** the
crossing; we drop the limitation and add an approach zone), `-021` (the prohibition list is **чл. 39**,
not чл. 38 — all four graded answers match чл. 39 almost verbatim), `-024` (passing a stopped car is
**заобикаляне** under ППЗДвП чл. 91 ал. 2, as our own `q-manevri-023` correctly teaches), `-035`
(**чл. 49** uses the scenario's exact words "земен път" / "път с настилка"; чл. 50 is expressly about
a *signposted* priority road, which the stem rules out), `-039` (чл. 43 т. 2 has no "нерегулирано"
qualifier — we narrow a prohibition and teach the narrowing as the memorable point), `-052`
(one-way U-turn ban: not in чл. 38, not in чл. 39, not in ППЗДвП — see §7), `-060` (three
right-side exceptions, three different legal bases, none of them the cited чл. 42), `-065` (the
continuous-line ban is Наредба № 2/2001 чл. 11–12, which `q-manevri-014/048/067` cite correctly).

`q-spirane-023` (§ 6 has 87 definitions and "принудително спиране" is not one), `-029` (велосипедна
**пътека** vs **алея** are two distinct defined terms since ДВ бр. 64/2025 — § 6 т. 86 and т. 87),
`-035`/`-060` (the жилетка duty is чл. 101 ал. 1; чл. 97 never mentions it), `-059` (same), `-061`
(the scenario sits directly on a statutory figure — чл. 98 ал. 1 т. 7, **3 metres** — and we teach a
vaguer functional substitute), `-064` (no general "възпрепятстване на достъпа" rule exists in чл. 98).

`q-uyazvimi-002` (чл. 119 contains no overtaking ban — that is чл. 43 т. 5 and т. 6), `-004`, `-028`,
`-054` (all three attribute the duty toward **престарели** pedestrians to чл. 116, which no longer
lists them; the behavioural answers are right and should stand — the attribution should show no
article until re-grounded, with чл. 5 ал. 2 т. 1 and чл. 20 ал. 2 as the candidates).

---

## 7. Tier 4 — cosmetic (19 questions)

Terminology, a dropped qualifier, an imprecise paraphrase. No student is harmed; fix opportunistically.

`q-dokumenti-004` (чл. 150 → чл. 150а ал. 1), `-006` (чл. 147 states the duty, чл. 181 т. 1 the
consequence), `-012` (staying in the car is чл. 170 ал. 6, second sentence), `-044` (чл. 151 ал. 8 is
the cleanest available ground for "the code is a binding condition" and is in the one source we can
fully verify).

`q-speed-005`, `-067` (**HUMAN**, §8), `q-magistrali-003`, `-056` (the "най-удобната лента" exception
is conditional on ≤80 km/h and two-plus lanes, and т. 3 is a second exception not limited to towns —
"само за населените места" is false as written).

`q-signs-003` (група В is circular-with-red-rim as the **general** form; чл. 66 ал. 2 lists six
deviations, including В1 and В34 which we teach in the same file), `-042` (чл. 58 т. 3 now also
allows stopping on the hard shoulder for a **health problem**, not only a breakdown — ДВ бр. 64/2025),
`-051` (В18 is written on **actual laden** mass, "маса с товар", not "обща маса"), `q-signali-005`
(the arrow accompanies red **and/or yellow**, not only red), `-048` (ППЗДвП чл. 35 defines only a
**pedestrian** signal; no cyclist signal appears in ЗДвП чл. 12's enumeration — the cyclist half of
the claim cannot be grounded).

`q-krastovishta-001` (bare "§ 6 ДР" with no point number — it is т. 8, and § 6 has 60-odd
definitions; also our paraphrase drops "разделят се"), `-017` (чл. 52 is a prohibition on **crossing**,
not a duty to stop; ППЗДвП чл. 109 is the answer — and this generalisation is what let `q-054` and
`q-066` drop the mandatory stop altogether), `-057` (pedestrian duty when turning is чл. 119 ал. 4),
`-069` (А29 needs only Наредба чл. 42 ал. 1; чл. 50а is irrelevant here).

`q-spirane-006` (the 2 metres is measured "откъм страната на сградите", and чл. 94 ал. 3 adds a
fourth condition — "успоредно на оста на пътя" — our option set omits it), `-020` ("хора с
**трайни** увреждания" is a defined category; dropping "трайни" widens it).

---

## 8. Could NOT be verified — the work list

You have ruled that an ungrounded figure shows **no number at all**. So this is a work list for the
retrieval layer, not a failure list. Nothing here is a proven defect.

### 8.1 Acts that could not be retrieved

| Act | Blocks | Note |
|---|---|---|
| **Кодекс за застраховането** | `q-dokumenti-007`, `-008`, `-009`, `-027`, `-028`, `-045`, `-059`, `-063` (8 questions, entirely ungrounded) | Not on the SARS база. One auditor did fetch a **Sept-2024** consolidation from nhif.bg and verified чл. 430 ал. 1 т. 2 for `q-ptp-050` — but flagged that it is not current. |
| **Наказателен кодекс** (чл. 343б, 343в, 343г, 345) | 11 of 63 alcohol questions; `q-dokumenti-023`, `-039`, `-060`; `q-osnovni-031` | Two auditors failed (justice.government.bg TLS error, lex.bg 403). **One succeeded**: `justice.government.bg/home/normdoc/1589654529` fetched cleanly and verified чл. 140 and чл. 343 ал. 3. **That URL is the fix.** Search results suggested чл. 343б now runs to ал. 7 and may have been amended in 2023/2025 — do not assume its wording. |
| **ЗБЛД** (чл. 8 ал. 2, 51, 53 ал. 1 т. 11) | `q-dokumenti-003` (the "10 години"), `-004`, `-024`, `-044`, `-053` | **Also retrievable** — a different auditor fetched it from `aref.government.bg`. The blocking auditor simply did not have that URL. |
| **ЗАНН** (чл. 43, 44, 59, 79б) | `q-dokumenti-015` (the "тридневен срок"), `-047` (the "80 на сто"), `-048` | Not attempted successfully by anyone. |
| **Наредба № I-157, Наредба № I-45** | `q-dokumenti-024`, `-043`, `-044`, `-062` | Code 01 = "корекция и/или защита на зрението" is **unverified**. |
| **Наредба № 1 от 2017** (редът по чл. 174 ал. 4) | `q-alkohol-009` (procedural half), `-031`, `-053` | **Auditors disagree**: one said it is not on SARS; another fetched it from `sars.gov.bg/wp-content/uploads/2024/02/` and quoted чл. 13 ал. 6. It **is** there. |
| **Наредба за пътната маркировка** | `q-krastovishta-062` (shark's teeth) | **Auditors disagree again**: one looked for РД-02-20-2 and did not fetch it; another confirmed **Наредба № 2 от 17.01.2001** is still listed as current on SARS and used it. Use № 2/2001. |

**The pattern worth acting on:** four of these seven "unretrievable" acts were successfully retrieved
by *some* auditor. The retrieval layer's source list, not the sources themselves, is the gap.

### 8.2 Claims with no source in scope

| Claim class | Questions | Status |
|---|---|---|
| **First-aid / medical protocol** — compression depth 5–6 cm, 100–120/min, 30:2, 10-second breathing check, recovery position, tourniquet handling, helmet removal | **33 questions** in `ptp-i-parva-pomosht.json` | No legal source exists for these. They may well match ERC guidelines, but that is a medical standard nobody fetched. **Unaudited — the single largest unverified block in the bank.** |
| **Stopping-distance / physics** — 25 m/s at 90 km/h, реакционен път ×4, the 2-second rule, 25–30 m from 50 km/h, aquaplaning, brake fade | **~45 questions** across `skorost-i-distantsia` + `magistrali` | Not legal claims; cited to чл. 20 (съобразена скорост), which is the right hook. Arithmetic unaudited. |
| **Alcohol physiology** — 0,1–0,15 промила/час, 17–18h awake ≈ 0,5 промила, microsleep 2–3 s / 50–75 m at 90 km/h, absorption rising 30–60 min | `q-alkohol-011`, `-022`, `-034`, `-047` | The **mis-citation is proven** (§6.7); the numbers themselves are unverified. |
| **Sign artwork** | All image-dependent items | `pdftotext` drops the pictures from прил. № 1–8. Every sign was verified by official **name** and by the shape/colour articles (чл. 21, 56, 66, 91, 105, 146), never by looking at a drawing. Any claim resting purely on artwork is unverified. |
| **НСИ 30-day road-death definition** | `q-ptp-044` | Not fetched. |
| **Приложение № 3 to Наредба Iз-41** (двустранен констативен протокол fields) | `q-ptp-043` | The наредба's normative text extracted; the form appendix did not. |
| **A dedicated "Зона 30" sign** | `q-speed-049`, `-066` | The SARS copy of Наредба РД-02-21-1 (stamped 01/07/2024) has **zero** occurrences of "Зона 30"; чл. 62а entered 7.09.2025. Whether a sign now exists is unestablished from either official source. |
| **Закон за пътищата currency** | `q-dokumenti-030` (§4.8) | SARS carries a Ciela snapshot dated 08/10/2025. It shows the provision in force from 03.02.2026 but cannot show a post-October-2025 repeal. |

### 8.3 Genuine ambiguities — these need a human ruling, not a rewrite by us

Per your standing rule, we do not resolve a conflict between a statute and a наредба.

1. **`q-dokumenti-050`** — Наредба Iз-2539 чл. 3 ал. 1 says points come only from a наказателно
   постановление; ЗДвП чл. 189 ал. 5 т. 8 and чл. 186 ал. 1 both require фишове to state the points
   they deduct. The two sources contradict each other and none of our three options matches either.
2. **`q-dokumenti-055`** — the наредба says the дрегер reading stands on non-appearance; the statute
   attaches two years + 2000 лв to the same non-compliance. They pull in different directions.
3. **`q-manevri-061`** — Наредба Iз-2539 чл. 6 ал. 1 т. 16 cross-references ЗДвП чл. 183 **ал. 3**
   т. 6, repealed 7.09.2025 and moved to ал. 2 т. 6. The наредба (last amended ДВ бр. 108/2024) still
   points at the repealed provision, so whether points are still deducted is genuinely uncertain.
   **All three of this question's ЗДвП citations are correct** — the auditor called it the
   best-cited penalty question in either file. Not a defect; an unresolved cross-reference.
4. **`q-spirane-027`** — the prohibition sits in ал. 2 (parking only), but чл. 183 ал. 4 т. 8
   penalises "неправилно **престоява** или паркира в зоната на … спирка". Real tension; a lawyer's
   question. *(The answer-key defect in §4.2 stands regardless of how this resolves.)*
5. **`q-signali-058`** — no grounded answer exists for **either** candidate option. Needs a human;
   no replacement proposed.
6. **`q-signs-041`** — Т6 ("the sign **does** apply") and Т7 ("the sign does **not** apply") both
   exist and mean opposite things. The stem gives no way to tell which is depicted and `media` is
   null, so the item is not decidable from the sources.
7. **`q-speed-005`, `q-speed-067`** — the third "restriction ends" mechanism (a replacement sign with
   a different value) is the conventional teaching and nothing contradicts it, but Наредба чл. 68
   lists only two mechanisms and no line can be quoted for the third. It is a **graded option in a
   multi-select**.
8. **Proving an absence from a closed list** — `q-dokumenti-040`, `q-dokumenti-060`,
   `q-krastovishta-047`. Each rests on чл. 171's or чл. 39/40's enumeration being exhaustive. The
   enumerations do read as closed ("се прилагат следните…"), but a human should confirm before we
   reword.

---

## 9. Gaps in the audit itself

Two auditors' findings did not fully arrive, and I will not pretend otherwise.

| Auditor | Reported in summary | Delivered | Missing |
|---|---|---|---|
| `uyazvimi-uchastnitsi` + `ptp-i-parva-pomosht` (136 q) | 18 findings | 11 | **7** |
| `nosht-i-uslozhneni` + `prevozno-sredstvo` + `osnovni-ponyatia` + `eko-i-zashtitno` (**256 q**) | 9 defects proven | **0** | **9** |

So the true count is **145 proven + up to 16 unseen ≈ 161 questions (~15%)**, not 145. I recovered
one of the 16 myself — `q-osnovni-047`, Tier 2 #19 — by tracing the `чл. 80а` citation cluster across
all 16 files. **The other ~15 should be re-requested from those two auditors before this ledger is
treated as complete.**

Two useful things that group's auditor *did* report, which survive as summary rather than as
findings:

- **A machine sweep of all 103 distinct `lawRefs` in those four files found no invented article
  numbers** — every ЗДвП article, ППЗДвП article and § 6 definition point cited resolves to a real,
  currently-in-force provision. The defects are all "real article, wrong content", never "article
  that does not exist". Given the bank has 467 distinct `lawRef` strings and zero questions with no
  refs, that is a meaningful structural reassurance.
- **The penalty minefield barely touches that group**: no money figures, no "фиш", two generic uses
  of "глоба". The one контролни точки claim (`q-osnovni-057`: max 39, new driver 26) is **correct**
  and exactly grounded in Наредба Iз-2539 чл. 2 ал. 1–2.

**Un-audited siblings worth checking first**, identified by tracing defective citations across all 16
files: `q-eco-009`, `q-eco-055`, `q-osnovni-011`, `q-predimstvo-053` (all cite чл. 41, the
systematically-swapped overtaking article); `q-osnovni-051`, `q-uyazvimi-013` (cite чл. 80а, rewritten
7.09.2025); `q-predimstvo-039` (cites чл. 50а). I read all of these; none showed the defect on its
face, but none was audited against the law text either.

---

## 10. Root causes — fix these, not the 145 rows

| # | Root cause | Questions | Fix |
|---|---|---|---|
| 1 | **ДВ бр. 64 от 2025 (in force 7.09.2025) was never ingested** | ~25 across every tier | It rewrote чл. 80а (e-scooters), чл. 116 (vulnerable pedestrians), чл. 113 ал. 2 (crossing), the чл. 21 ал. 1 speed table + new ал. 3, new чл. 62а (Зона 30), new Раздел IXa / чл. 43б (заобикаляне), чл. 170 ал. 4, чл. 157 ал. 2а–2в, чл. 175 ал. 1, чл. 58 т. 3, § 6 т. 86/87 — and repealed чл. 171 т. 2 б. "е". **Nearly every `outdated` finding traces to this one gazette issue.** |
| 2 | **чл. 50а used as a label for "roundabout"** | 11 | There is no statutory roundabout rule. Ground on Б1/Б2 + чл. 50 ал. 1 + Наредба чл. 98 / чл. 61 ал. 5. |
| 3 | **ЗДвП cited where the rule lives in ППЗДвП or a наредба** | ~20 | Б1/Б2 stopping → ППЗДвП чл. 46. Mandatory stop at a crossing → ППЗДвП чл. 109/110. Markings → Наредба № 2/2001. Signs → Наредба РД-02-21-1. |
| 4 | **чл. 98 ал. 1 vs ал. 2 misread** | 5 + 1 | One misread alinea produced five answer-key defects. |
| 5 | **чл. 41 vs чл. 42 (overtaking checklist)** | 6 | One systematic swap. |
| 6 | **Catch-all citations** (`чл. 5` on 41/63 alcohol questions, `чл. 174` on 18) | ~15 | A catch-all is what makes an unsourced number look sourced. |
| 7 | **`media: null` + a single-sign media schema** | 9 | Schema change first, then content. |
| 8 | **чл. 25 vs чл. 37 ал. 3** | 3 | The article names гараж/паркинг/бензиностанция verbatim. |

---

## 11. What is good, and should be protected

- **`predimstvo.json` is the model.** 72 questions, one defect. It cites to ал./т. precision and
  builds correct multi-article chains. Where it and `krastovishta.json` disagree, `predimstvo` is
  right 19 times out of 19. **Use it as the citation style guide.**
- **The four-file group (`nosht`, `prevozno-sredstvo`, `osnovni-ponyatia`, `eko`) — 256 questions —
  is structurally sound.** All 103 of its distinct `lawRefs` resolve to real, in-force provisions.
- **Zero invented article numbers anywhere in the bank.** 467 distinct `lawRef` strings, every one a
  real provision.
- **The bank barely uses figures at all, and the ones it uses are mostly right.** In
  `dokumenti-i-sanktsii.json` only 3 of 63 questions contain a money or percentage number; two were
  verified correct (the 70% / 14-day електронен фиш discount, чл. 189 ал. 5г "може да заплати 70 на
  сто от размера на глобата"; and the 0,5–0,8 promille band). In `alkohol-i-godnost.json` the only
  money/duration figures are in `q-045` and both are exactly current (6 месеца + 500 лв; 12 месеца +
  1000 лв). `krastovishta` + `predimstvo` contain **no** monetary amount, points figure or фиш/акт
  classification at all — so no wrong penalty figures there. **The penalty minefield you feared is
  mostly a coverage gap, not a defect surface.**
- **Every penalty currently stated in ЛЕВА is correct as stated.** "евро" appears once in the whole
  act, in a 2008 transitional provision about the 112 number. No euro-conversion assumptions were
  made anywhere.

---

## 12. Recommended sequence

Nothing below is an edit. This is the order I would fix in once the retrieval layer exists.

**Before anything ships:**
1. **Stop the `approved` flag from lying.** 22 of 24 exam-failing questions are marked `approved`.
   Either demote the 145 in this ledger to `needs-review`, or add a distinct `law-verified` field —
   `CLAUDE.md` requires draft-until-reviewed and the bank is not honouring it.
2. **Pull the 9 unanswerable sign questions from any exam draw** until the media schema supports a
   multi-sign comparison. They are scored against the student today.
3. **Fix the 24 answer-key defects** (§4). Six root causes cover 22 of them.

**Before the tutor cites anything to a student:**
4. Ingest **ДВ бр. 64 от 2025** properly — it is one gazette issue behind ~25 defects.
5. Fix the 8 citation clusters in §10. Each has a correct sibling in the bank to copy from, so the
   fix validates itself.
6. Route the **8 ambiguities in §8.3** to a human. Do not resolve them here.

**Before the retrieval layer is called complete:**
7. Add the four recoverable sources: **НК** via `justice.government.bg/home/normdoc/1589654529`,
   **ЗБЛД** via `aref.government.bg`, **Наредба № 1/2017** and **Наредба № 2/2001** via SARS.
8. Decide what to do about the **33 first-aid questions** and the **~45 physics questions**. Neither
   has a legal source and neither is covered by ADR-002's content bank. They need either a cited
   medical/physics standard or an explicit "not law" marker in the schema.
9. Re-request the **~15 missing findings** from the two auditors in §9.

---

## 13. Bottom line

The theory bank is **not wrong in a way that loses confidence**. It is wrong in a way that is
countable, clustered, quoted, and mostly self-correcting — the correct citation usually already
exists a few rows away.

96% of it teaches the road correctly. The 4% that does not is concentrated in bus stops, e-scooters,
level crossings, the speed table and the vignette ladder — and I would not want a 17-year-old
learning any of those five from us today.

The thing to fix first is not a question. It is the `approved` flag that currently hides all of them.
