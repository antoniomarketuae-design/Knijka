# The law corpus — a retrievable, citable source layer

> **ADR-002, stated as a working rule:** never write a penalty figure or an
> article number from memory. If it is not in the fetched text, it does not go
> in. Anything ungrounded shows the rule and the article **with no number**
> rather than a guessed one.

This directory is the reason that rule can be enforced instead of merely
believed. It holds the statute text itself, addressed by article, so any later
code can ask *"what does чл. 183 say"* and get the actual words back with a
stable citation.

## Why it exists

A grep for `фиш` / `акт` / `АУАН` / `контролни точки` / `наказателно
постановление` across the platform's source used to return nothing: the product
had **one** notion of "points", and it was the practical-exam marking scheme
implemented in `src/modules/sim/rules/types.ts` (`опасни = 10 т.`, pass at
`≤ 9` total / `≤ 6` основни). That single number was silently standing in for
three unrelated systems:

| System | Unit | Who issues it | Where it is written |
| --- | --- | --- | --- |
| **изпитни точки** | наказателни точки on the exam sheet | председателят на изпитната комисия | Наредба № 38, приложение № 5, т. 10–11 |
| **контролни точки** | licence points | only a наказателно постановление that has entered into force | ЗДвП чл. 157 + Наредба № Iз-2539 чл. 6 |
| **глоба** | BGN | a **фиш** on the spot, or an **акт** → наказателно постановление | ЗДвП, глава седма (чл. 174–189) |

They are different scales. Ten изпитни точки end an exam; ten контролни точки
are a quarter of a new driver's balance; neither is money. `penalties.json`
keeps them in three separate fields precisely so nothing can add them up.

## Layout

```
content/law/
  README.md            ← this file
  sources.json         ← the source register: every document, its URL, sha256, and whether we hold its text
  acts/zdvp.json                ← ЗДвП, article-addressable (277 units)
  acts/naredba-iz-2539.json     ← контролни точки (40 units)
  acts/naredba-38.json          ← изпитни точки / exam format (78 units)
  penalties.json       ← the three-system penalty bank, every figure cited
```

Read it through `platform/src/lib/content/law` — **never** by importing the JSON
directly. The loader validates the files and, crucially, re-verifies every
citation quote against the act text before serving anything.

## What was fetched, and from where

| Document | Source | Retrieved | sha256 (prefix) |
| --- | --- | --- | --- |
| ЗАКОН за движението по пътищата — consolidated, `изм. ДВ, бр. 55 от 16.06.2026 г.` | [mtc.government.bg …/2026-06/ZAKON_za_dvijenieto_po_pytisata16062026.docx](https://www.mtc.government.bg/sites/default/files/documents/2026-06/ZAKON_za_dvijenieto_po_pytisata16062026.docx) (257.9 KB) | 2026-08-03 | `185cc3a5…` |
| Наредба № Iз-2539/2012 (контролни точки) | sars.gov.bg нормативна база (221 KB) | 2026-08-03 | `6886ef72…` |
| Наредба № 38/2004 (изпити) | sars.gov.bg нормативна база (286 KB) | 2026-08-03 | `73be8377…` |

`sources.json` additionally catalogues the rest of the SARS
[нормативна база](https://www.sars.gov.bg/normativna-uredba/bg-zakonodatelstvo/)
as `coverage: "index-only"` — title and live URL recorded, text **not** ingested.
Every URL in the register was re-checked with an HTTP HEAD when it was written;
the observed status is stored in `httpStatus`, so a link that has rotted says so
(one has: the винетни-такси наредба returns 404).

Ingesting a new act = fetch it, add a `full-text` row with the real sha256, emit
`acts/<id>.json`, and add the id to `ACT_IDS` in `corpus.ts`.

### Regenerating (tools/)

The fetched originals are **not** committed — `sources.json` pins each by URL,
byte count and sha256, so a re-fetch is verifiable and the repo stays free of
~800 KB of binaries. From `content/law/tools/`:

```bash
curl -sSL -o zdvp_16062026.docx "https://www.mtc.government.bg/sites/default/files/documents/2026-06/ZAKON_za_dvijenieto_po_pytisata16062026.docx"
sha256sum zdvp_16062026.docx           # must equal the sources.json row
cp zdvp_16062026.docx zdvp.zip && unzip -qo zdvp.zip -d unz
node extract.mjs unz/word/document.xml zdvp.txt

curl -sSL -o iz2539.pdf     "<url from sources.json>"   && pdftotext -enc UTF-8 -nopgbrk iz2539.pdf iz2539.txt
curl -sSL -o naredba38.pdf  "<url from sources.json>"   && pdftotext -enc UTF-8 -nopgbrk naredba38.pdf naredba38.txt

node build-corpus.mjs    ..     # acts/*.json
node build-sources.mjs   ..     # sources.json (re-HEADs every URL)
node build-penalties.mjs ..     # penalties.json — THROWS if a quote locator no longer matches
```

`build-penalties.mjs` never types a quote: each one is cut out of the rebuilt
corpus by a locator string. If the law changed under a citation, the build fails
instead of emitting a stale quote.

## How the text is stored

`textBg` on every unit is **verbatim**, including the `(Изм. – ДВ, бр. …)`
amendment notes, because those notes are how a reader dates a provision. The
only processing is:

* **ЗДвП** — OOXML `<w:t>` extraction from the `.docx`; each `<w:p>` becomes one
  line. Article boundaries are the `Чл. N.` line starts (uppercase `Чл.` only
  ever starts an article; cross-references in running text are lowercase `чл.`).
* **the наредби** — `pdftotext -enc UTF-8 -nopgbrk`, split on the same marker.
  *Known artifact:* the SARS PDFs carry a per-page vendor watermark
  (`Източник: Правно-информационни системи "Сиела" …`) which pdftotext leaves
  mid-sentence. It is preserved rather than scrubbed — editing the extracted
  text is exactly the habit this directory exists to prevent.

Refs are canonicalised to lowercase (`чл. 183`, `чл. 167а1`, `§ 6`,
`приложение № 5`) so the `{ act: "ЗДвП", ref: "чл. 47" }` shape already used
across `content/` resolves directly.

`contextBg` carries the chapter/section a unit sits in, and is `null` for the
four articles whose chapter heading is not present in the source file. Null, not
a guess — the same rule as everywhere else here.

**ЗДвП also ships `§ 1 – § 6г` of the ДОПЪЛНИТЕЛНИ РАЗПОРЕДБИ**, because `§ 6`
is the definitions paragraph (87 definitions) and is the single most-cited unit
in the content bank after the articles themselves. The `§` numbers of the
ПРЕХОДНИ И ЗАКЛЮЧИТЕЛНИ РАЗПОРЕДБИ are deliberately **not** ingested: every
amending act restarts at `§ 1`, so `§ 7` would address several different texts
and a citation must address exactly one unit.

### What it can already verify

Read-only audit of the citations already written across `content/`
(concepts + all question files + signs), 2026-08-03:

```
lawRefs across content/            1968
resolved against the corpus        1497  (76.1%)
  of the 1490 ЗДвП citations       1487 resolve, 3 miss
misses by reason
  act-not-in-corpus                 468   ← acts whose text is not ingested
  unit-not-found                      3   ← garbage in the ref field, e.g. "изм. ДВ бр. 64/2025"
```

The 468 are dominated by **Наредба № РД-02-21-1/2023** (270 citations, the sign
ordinance) and **ППЗДвП** (91) — both catalogued in `sources.json` with live
URLs, neither ingested. Ingesting those two would take the verifiable share past
95%. Nothing in this directory guesses at them in the meantime.

## penalties.json

```jsonc
{
  "id": "pen-b2-no-stop-danger",
  "titleBg": "…",
  "summaryBg": "…",
  "fine": {
    "system": "fine",
    "status": "grounded",          // grounded | not-listed | unknown
    "amountBgn": 200,
    "instrument": "акт",           // фиш | акт
    "instrumentSource": { "actId": "zdvp", "ref": "чл. 189", "paragraphRef": "ал. 1", "quoteBg": "Актовете, с които…" },
    "source": {
      "actId": "zdvp", "ref": "чл. 179", "paragraphRef": "ал. 1", "pointRef": "т. 5",
      "quoteBg":        "Наказва се с глоба в размер 200 лв.:",             // STATES the figure
      "contextQuoteBg": "който не спазва предписанието на пътните знаци…"   // names the offence
    },
    "noteBg": "…"
  },
  "controlPoints": { "system": "controlPoints", "status": "grounded", "points": 10, "source": { "actId": "naredba-iz-2539", … }, "noteBg": null },
  "examPoints":    { "system": "examPoints",    "status": "grounded", "points": 10, "errorClassBg": "опасна", "source": { "actId": "naredba-38", … }, "noteBg": null },
  "lawRefs": [{ "act": "ЗДвП", "ref": "чл. 179" }],
  "status": "needs-review"
}
```

Rules, enforced by `law/schemas.ts` and re-checked at load:

1. **Every figure carries a citation, and the citation states the figure.**
   `source` is not optional; its `quoteBg` must occur verbatim (modulo
   whitespace and soft hyphens) in the stored act text, **and** for a
   `grounded` numeric figure the quote must contain the number itself
   (`"200 лв."`, `"10 контролни точки"`, `"10 наказателни точки"`). A fine of
   100 лв. cited with a quote that never says "100 лв." is precisely the failure
   this directory exists to prevent, so the loader refuses it.
   Bulgarian penalty articles put the amount in the alinea's opening sentence
   and the behaviour in a numbered point below it, so the offence text rides
   along as `contextQuoteBg` — a second excerpt from the same unit, verified the
   same way.
2. **`status` and the value are coupled, and that is the founder's ruling in
   code:**
   * `grounded` — the number is written in the cited text. Value required.
   * `not-listed` — the offence is deliberately absent from an exhaustive list
     (чл. 6 от Наредба № Iз-2539 is one), so the value **must be `0`** and the
     citation is the list itself.
   * `unknown` — we do not have it. The value **must be `null`**, and
     `describeExamPoints()` / `describeControlPoints()` / `describeFine()`
     return `valueBg: null`, so a component gets the rule and the article and
     **no digit to render**.
3. **`instrument` names фиш or акт and cites the rule that decides.** ЗДвП
   чл. 186, ал. 1 allows a фиш only where no disqualification is provided;
   чл. 189 governs акт → наказателно постановление. Контролни точки are taken
   `въз основа на влязло в сила наказателно постановление` (Наредба № Iз-2539
   чл. 3, ал. 1) — so a фиш-only offence and an акт offence differ in **two**
   systems at once, not one.
4. `status` stays `needs-review` until a human has read the cited article and
   agreed with the mapping.

The bank currently holds six entries. They are a **worked demonstration of the
shape**, not a sweep: `pen-b2-no-stop` vs `pen-b2-no-stop-danger` is the same
manoeuvre priced at 100 лв./0 к.т. and 200 лв./10 к.т. depending only on whether
непосредствена опасност was created, and `pen-crosswalk-no-yield` deliberately
carries `examPoints.status: "unknown"` because приложение № 5 does not name the
pedestrian crossing — it renders with no number.

## THEO-4 / north star

Retrieval is what lets the tutor behave like an instructor instead of a
rulebook: it can show *the sentence the rule is written in*, and say which of
the three systems a consequence belongs to. "Ten points" means nothing to a
17-year-old; "ten контролни точки off your 26, and only after the наказателно
постановление enters into force — the фиш you'd get for the same thing without
danger takes none" is a lesson.
