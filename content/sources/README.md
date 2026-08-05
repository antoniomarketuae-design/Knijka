# `content/sources` — the citations that are not law

> **The rule this directory exists to make possible:** when nothing in the
> statute book settles a question, say so and cite what *does* — rather than
> pointing a seventeen-year-old at an article that cannot answer them.

## Why it exists

`LawRefSchema` used to be the only citation shape a question could carry, and
`lawRefs` was `.min(1)`. Every row was therefore **compelled to name an act**,
including the rows where no act governs the answer. Twenty-nine first-aid
questions duly cited **ЗДвП чл. 123** — the duty to stop and assist — under
claims about compression depth, tourniquets and the recovery position. The
citation was not carelessness. It was the only thing the schema would accept.

`sourceRefs` is the missing shape (docs/education/90 §12 item 8, §14 item N):

```json
{
  "lawRefs":    [{ "act": "ЗДвП", "ref": "§ 6, т. 30 ДР" }],
  "sourceRefs": [{ "sourceId": "src-nsi-ptp-2023",
                   "ref": "Методологични бележки — „загинал при ПТП“",
                   "claimId": "stat-road-death-30-days" }]
}
```

A row may carry either, or both. The floor it must clear is now
`lawRefs.length + sourceRefs.length >= 1` — **cite something, but only cite a
statute when a statute is what settles it.**

## The registers

| Register | Lives in | Holds |
| --- | --- | --- |
| law | `content/law/` | statutes, in force, addressed by `чл. N` |
| medical | `content/medical/` | clinical guidelines (ERC 2025, RCUK 2025, БЧК) |
| **general** | **`content/sources/` (here)** | everything else a question rests on — official statistical methodology, and telecoms regulation |

Source ids are globally unique (`src-…`) across all of them, so a `sourceRef`
names only the id and the resolver finds the register. Adding a register never
changes the shape of a question row.

## What is in here today

**`src-nsi-ptp-2023` — НСИ, „Пътнотранспортни произшествия в Република България
2023“, Методологични бележки.** It settles who is counted as a road death, and
`q-ptp-044` asks exactly that. Corroborated by a second, independently
published НСИ document (`src-nsi-ptp-2023-press`).

Three findings came out of grounding that one row, and all three are the reason
the citation could not have been a `lawRef`:

1. **ЗДвП does not define „загинал“.** `§ 6 ДР` defines *ПТП* (т. 30) and
   *първа долекарска помощ* (т. 40); the whole consolidated text was searched
   for a 30-day threshold and there is none. `чл. 164е` merely requires ДАБДП
   to report „статистика за броя на загиналите и ранените“ without saying who
   that is.
2. **Наредба № Iз-41 от 2009 г. does not define it either** — the МВР наредба
   on accident paperwork was fetched and searched; it prescribes the forms, not
   the counting rules.
3. **The instrument НСИ itself points at is not published.** Its methodological
   note names „Закона за движението по пътищата и Инструкцията на
   Министерството на вътрешните работи за регистриране, отчитане и анализ на
   пътнотранспортните произшествия“. The МВР instruction is not obnarodvana and
   could not be obtained. The НСИ methodology is therefore the **highest
   reachable** authority for the 30-day threshold — the same shape of finding
   as Наредба № 24 delegating every clinical value to an unpublished учебна
   програма (`content/medical/README.md`).

One conflict is recorded rather than smoothed over: НСИ's published sentence
says „починал … **30 дни след** произшествието“, without „до“. Read literally
that counts only a death on day 30, which is nonsense; the threshold reading
(„до 30 дни“) is the standard one and is what `q-ptp-044`'s answer uses. It is
in `claims.json → conflicts` so nobody later mistakes our wording for a careless
paraphrase.

### `src-krs-pravila-112` — КРС, Правила за … спешни повиквания (ДВ, бр. 12 от 2022, изм. бр. 34 от 2024)

`q-ptp-058` grades this as correct: *„Обаждането е безплатно и работи дори без
кредит или SIM карта.“* The free half was never in doubt. **The no-SIM half was
graded correct with nothing behind it** — the row's own explanation disclaimed
only the source *category* („this is telecoms regulation, not ERC/RCUK“) and
never asked whether it was *true*. It is the one claim in the first-aid set whose
falsity would be paid for in minutes at a roadside, and SIM-less 112 is
genuinely a national choice, so the answer could not be assumed.

It is true in Bulgaria, and a Bulgarian regulator says so in terms:

- **чл. 3, т. 1** — mobile operators „са задължени да поддържат техническа
  възможност за спешни повиквания към ЕЕН 112 … от мобилни устройства без SIM
  карта“.
- **чл. 2, ал. 1** — access to 112 is free.
- **чл. 2, ал. 2** — that obligation holds „и по отношение на крайни ползватели
  със забрана да извършват изходящи повиквания“, which is what an exhausted
  prepaid card is. That is the „без кредит“ half, in the regulator's own words.
- **чл. 7, ал. 2** — a SIM-less call carries no number; the network passes the
  handset's **IMEI**. So nobody can ring the caller back, which is exactly why
  „не затваряй“ (option `c` on the same row) matters more, not less.

Two things are recorded rather than smoothed over, both in `claims.json →
conflicts`:

1. **It has not always been true, and that is the trap.** `src-ecc-report-324`
   (CEPT/ECC, approved 24.11.2021) lists Bulgaria among the countries that
   *prohibited* SIM-less emergency calls: „Switzerland, France, Bulgaria and
   Germany introduced a policy to prohibit such calls due to a high number of
   false calls or hoax calls.“ The 2022 Правила reverse that. Anyone
   double-checking us against the report alone will conclude we are wrong, so
   the disagreement is written down **with its dates** instead of hidden.
2. **The rule binds the networks; it is not a field measurement.** No public
   КРС/МВР/operator report was found confirming that every network actually
   maintains the capability. The obnarodvana obligation is the **highest
   reachable** authority here — the same shape of finding as the НСИ threshold
   above, and the row tells the student so.

### `src-ecc-report-324` — CEPT/ECC, SIM-less emergency calls in Europe

Registered for one job: to stop *„112 works without a SIM anywhere in Europe“*
from being taught as fact. Its country lists are from 2019–2020 and Bulgaria's
own entry is now out of date — which is precisely the lesson. It grounds the
scope limit (`reg-112-simless-not-eu-wide`), never the Bulgarian answer.

## Regenerating

```bash
cd content/sources/tools
bash fetch.sh          # originals are gitignored; sources.json pins them
node build.mjs ..      # emits sources.json + claims.json
node verify.mjs ..     # exit 1 if anything drifted
```

Two gates, both copied from `content/medical/tools` because they work:

1. **No quote is typed by hand.** `build.mjs` declares a short *locator* and
   cuts the enclosing sentence out of the fetched text; a locator that stops
   matching **throws** instead of emitting an unverifiable quote. (The first
   version of the cutter silently truncated the corroborating quote at
   „…е убит“, dropping the very figure the claim carries — the whole-document
   search replaced it, and `verify.mjs` would have caught it anyway.)
2. **A figure must be in its own quote.** A claim with `figureBg: "30 дни"`
   fails the build unless the authoritative quote actually contains `30`. That
   is the „ЗДвП чл. 123“ failure mode — a real citation attached to a claim it
   does not contain — caught by machine.

Both NSI PDFs hash stably at the raw-byte level (re-fetched and compared, not
assumed), so `rawSha256` is meaningful here; `textSha256` is over the
CRLF-normalised `pdftotext` output, which is what `verify.mjs` gates on.

## THEO-4

„Загинал е и този, който почине до 30 дни“ is a number to memorise. *„НСИ брои
за загинал човек, убит на място или починал от травмите до 30 дни след
произшествието — прагът съществува, защото тежките травми често убиват дни
по-късно, и без него статистиката би изглеждала по-добра, отколкото е“* is a
lesson, and `claims.json` holds the sentence it is quoting. Where the source is
loosely worded, saying so is part of teaching, not a footnote.

The 112 row is the same move on a different axis. „Обаждането е безплатно и
работи дори без SIM карта“ is a fact to memorise. *„В България мрежите са
ЗАДЪЛЖЕНИ да го поддържат — ето чл. 3, т. 1; апаратът без карта обаче не носи
номер, а IMEI, значи никой не може да ти се обади обратно, значи не затваряй; и
до 2022 г. същото беше забранено тук, така че не разчитай на него в чужбина“* is
a lesson — and every clause of it is a quote a machine re-checks. Where the
strongest available authority is an obligation on operators rather than a
measurement, the row says that too.
