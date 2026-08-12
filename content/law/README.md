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
| **контролни точки** | licence points, off 39 (26 new) | any of three instruments once it has entered into force — наказателно постановление, **фиш** or **електронен фиш** | ЗДвП чл. 157 + Наредба № Iз-2539 чл. 6, ал. 1 (the list) and чл. 2, ал. 6 (the bases) |
| **глоба** | BGN | a **фиш** on the spot, an **електронен фиш** from a camera, or an **акт** → наказателно постановление | ЗДвП, глава седма (чл. 174–189) |

They are different scales. Ten изпитни точки end an exam; ten контролни точки
are a quarter of a new driver's balance; neither is money. `penalties.json`
keeps them in separate fields precisely so nothing can add them up.

A **fourth** consequence rides alongside and is not a number of anything —
**лишаване от право да управлява**, months without the licence. It has its own
field because it is the pivot: ЗДвП чл. 186, ал. 1 permits a фиш only *"за
административни нарушения, за които не е предвидено наказание лишаване от
право…"*, and чл. 189, ал. 4 says the same of an електронен фиш. The ban decides
the instrument. Nothing else does — see rule 3 below.

## Layout

```
content/law/
  README.md            ← this file
  sources.json         ← the source register: every document, its URL, sha256, and whether we hold its text
  acts/zdvp.json                ← ЗДвП, article-addressable (277 units)
  acts/naredba-iz-2539.json     ← контролни точки (40 units) — ⚠ 28.01.2025 snapshot, see below
  acts/naredba-iz-2539-consolidated-dv49-2026.json ← the SAME наредба, current (40 units)
  acts/naredba-iz-2539-izm-dv22-2026.json  ← ЗИД, ДВ бр. 22/2026 (4 §)
  acts/naredba-iz-2539-izm-dv49-2026.json  ← ЗИД, ДВ бр. 49/2026 (3 §)
  acts/naredba-38.json          ← изпитни точки / exam format (78 units)
  acts/naredba-8121z-532.json   ← АТСС: the order to subtract the device error (18 units)
  acts/naredba-sredstva-za-izmervane.json ← НСИПМК: the SIZE of that error (17 units)
  penalties.json       ← the penalty bank, four systems, every figure cited
```

Six of the eight are in `ACT_IDS` and load; the two `-izm-` ЗИД files are held as
evidence of what changed and are read by `build-penalties.mjs`, not served.

Read it through `platform/src/lib/content/law` — **never** by importing the JSON
directly. The loader validates the files and, crucially, re-verifies every
citation quote against the act text before serving anything.

## What was fetched, and from where

| Document | Source | Retrieved | sha256 (prefix) |
| --- | --- | --- | --- |
| ЗАКОН за движението по пътищата — consolidated, `изм. ДВ, бр. 55 от 16.06.2026 г.` | [mtc.government.bg …/2026-06/ZAKON_za_dvijenieto_po_pytisata16062026.docx](https://www.mtc.government.bg/sites/default/files/documents/2026-06/ZAKON_za_dvijenieto_po_pytisata16062026.docx) (257.9 KB) | 2026-08-03 | `185cc3a5…` |
| Наредба № Iз-2539/2012 (контролни точки) — ⚠ **superseded**, see below | sars.gov.bg нормативна база (221 KB) | 2026-08-03 | `6886ef72…` |
| ЗИД на Наредба № Iз-2539 — обн. ДВ, бр. 22 от 24.02.2026 г., попр. бр. 24 | ciela.net свободна зона „Държавен вестник“ (40 KB HTML) | 2026-08-09 | `2075a07f…` |
| ЗИД на Наредба № Iз-2539 — обн. ДВ, бр. 49 от 29.05.2026 г. | ciela.net свободна зона „Държавен вестник“ (41 KB HTML) | 2026-08-09 | `c8864362…` |
| Наредба № 38/2004 (изпити) | sars.gov.bg нормативна база (286 KB) | 2026-08-03 | `73be8377…` |
| Наредба № 8121з-532/2015 (АТСС) — `изм. и доп. ДВ, бр. 34 от 7.04.2026 г.` | [lex.bg/laws/ldoc/2136505166](https://lex.bg/laws/ldoc/2136505166) (173 KB HTML) | 2026-08-09 | `f79f2f66…` |
| Наредба за средствата за измерване, които подлежат на метрологичен контрол — `обн. ДВ, бр. 103 от 6.12.2024 г.` | [damtn.government.bg …/naredba_za_sredstvata_za_izmervane…pdf](https://www.damtn.government.bg/wp-content/uploads/naredbi/naredba_za_sredstvata_za_izmervane_koito_podlejat_na_metrologicen_kontrol.pdf) (838 KB) | 2026-08-09 | `00758b88…` |
| Наредба № Iз-2539/2012 — **консолидирана през ДВ, бр. 49 от 2026 г.** | [lex.bg/laws/ldoc/2135830692](https://lex.bg/laws/ldoc/2135830692) (320 KB HTML) | 2026-08-09 | `b66ac515…` |

### The camera tolerance is in a normative act, and it is a chain of three

„3 km/h" is the most-repeated folk number in Bulgarian driving. It is real, but
no article says „3 km/h се приспадат" — it is assembled from three provisions,
and it is **not** a flat 3:

1. **ЗДвП чл. 165, ал. 3** — the enabling clause: „Условията и редът за
   използване на автоматизирани технически средства и системи за контрол на
   правилата за движение се определят с наредба на министъра на вътрешните
   работи."
2. **Наредба № 8121з-532, чл. 16, ал. 5** — the order to subtract: „…от
   измерената от АТСС скорост се приспада максимално допустимата грешка за
   съответния тип АТСС, посочена в чл. 425 от Наредбата за средствата за
   измерване…"
3. **НСИПМК чл. 425, ал. 1, т. 2** — the size of it: „± 3 km/h за скорости до
   100 km/h или ± 3 % от измерената стойност за скорости над 100 km/h."

So above 100 km/h the allowance is a **percentage**, not 3 — at 140 km/h it is
4.2. Anything that renders a flat „−3" on a motorway is wrong.

`naredba-sredstva-za-izmervane.json` holds **Раздел XXVI „Скоростомери" only**
(чл. 416 – чл. 432). The other 25 sections govern audiometers and aerosol
dispensers; the `sha256` pins the whole PDF, so the omission is checkable
rather than hidden.

### Наредба № Iз-2539 now has a 2026-consolidated text — held AND wired

`naredba-iz-2539-consolidated-dv49-2026.json` is the text the 2025 SARS
snapshot could not be: consolidated through ДВ, бр. 22, попр. бр. 24 and
бр. 49 от 2026 г. It is deliberately a **separate actId**, not a replacement,
so that moving a citation onto it is one deliberate change rather than a side
effect of a re-fetch.

**That change has now been made (2026-08-09).** Every Наредба № Iз-2539
citation in `penalties.json` cuts from the CONSOLIDATION; the snapshot survives
in one place only, as the superseded figure quoted inside
`pen-alcohol-05-08`'s note. Two things moved with it:

* `pen-alcohol-05-08.controlPoints` is `grounded, 10` — „над 0,5 на хиляда до
  0,8 на хиляда включително (чл. 174, ал. 1, т. 1 от ЗДвП) - **10 контролни
  точки**" (чл. 6, ал. 1, т. 1, б. „а"). It was `unknown / null` while the only
  text we held said 8;
* the speeding rows — чл. 6, ал. 1, т. 12 now reaches **чл. 182, ал. 1, т. 5**
  and **ал. 2, т. 6** and the средна скорост of ал. 3а, which the 2025 text
  does not. The fault card's „18 к.т." chip cites it **by amendment name**
  (`Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.), чл. 6, ал. 1, т. 12`); a
  bare name there pointed the student at a sentence covering only „с над
  50 км/час", i.e. not the „над 40" rung the figure sat on.

`verifyCitations` now enforces the rule instead of trusting it: a quote cut from
the snapshot must still occur, word for word, in the consolidation — otherwise
the citation is refused. So a passage the amendment rewrote can no longer be
served under a heading that names the наредба as if it were current.

**All three are now in `ACT_IDS`** (wired 2026-08-09 by the change that
consumes them — the questions that teach the camera tolerance and the 2026
deduction basis needed to cite articles a reader can open; until then
`clearanceQuestionCitations.test.ts` correctly refused those citations as
„article numbers we cannot check").

Wiring the consolidation alongside the snapshot means **two acts answer to the
same наредба**, so `ACT_ALIASES` disambiguates by version and the order of the
patterns is load-bearing:

| citation written as | resolves to |
| --- | --- |
| `Наредба № Iз-2539` | the 2025 snapshot — every pre-existing citation, unmoved |
| `Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.)` | the 2026 consolidation |

A bare name never silently upgrades. Anything that depends on a figure the 2026
text changed — чл. 6, ал. 1, т. 1/3/12–14/16 and чл. 2, ал. 6–7 — **must** name
the amendment, or it will resolve, quietly, against the superseded snapshot.
`corpus.test.ts` pins both directions and asserts the two texts really do
disagree (`- 8 контролни точки` against `- 10 контролни точки`).

### ⚠ Наредба № Iз-2539 is held at a 2025 snapshot

The SARS PDF pinned above is dated inside its own text („Сиела 24/01/2025") and
**the URL has not been refreshed**: an HTTP HEAD on 2026-08-09 still returns
`content-length: 226435` (the recorded `bytes`) and
`last-modified: Tue, 28 Jan 2025 08:18:21 GMT`. Re-fetching it therefore cannot
produce the current text — the staleness is in the source, not in our ingestion.

Two 2026 amendments post-date it, and both are now held verbatim as their own
acts so a superseded figure can be **named** instead of silently served:

* **ДВ, бр. 22 от 24.02.2026 г.** — чл. 6, ал. 1, т. 1, б. „а" goes
  **8 → 10 контролни точки**; чл. 3 rewritten (points deducted on НП, фиш and —
  from 7.05.2026 — електронен фиш); т. 3 and т. 16 amended; ал. 2 gains the
  „Водач на МПС без наказания" exemption.
* **ДВ, бр. 49 от 29.05.2026 г.** — the deduction basis moves to **чл. 2, ал. 6–7**
  and чл. 3 is rewritten again to carry the *restoration* rules; чл. 6, ал. 1,
  т. 12–14 (speeding) become 18/21/26 точки.

Consequence in `penalties.json`, **resolved 2026-08-09**:
`pen-alcohol-05-08`'s controlPoints figure was `status: "unknown"` with
`points: null` for exactly as long as the only Наредба № Iз-2539 we cited said
8. It now cites the consolidation and reads `grounded, 10`, cut by locator like
everything else. The ЗИД of ДВ, бр. 22 stays quoted in the note as the second,
independent witness to the change — two texts have to move before the figure
can drift.

**DO NOT RE-OPEN THIS AS „go and fetch a newer SARS PDF".** That door is shut
and the measurement is recorded so nobody spends a morning re-taking it: the
`sars.gov.bg` path pinned above is not maintained. An HTTP HEAD on 2026-08-09
returned `content-length: 226435` — byte-for-byte the `bytes` already in
`sources.json` — and `last-modified: Tue, 28 Jan 2025 08:18:21 GMT`. A re-fetch
of that URL cannot produce a 2026 text, today or next month; the staleness is
in the publisher, not in our ingestion, and no amount of re-running
`build-corpus.mjs` changes it.

The 2026 text was therefore obtained **from a different publisher**, and it is
already on disk and already in `ACT_IDS`:
`acts/naredba-iz-2539-consolidated-dv49-2026.json` (lex.bg,
`src-naredba-iz-2539-consolidated-lex`), consolidated through ДВ, бр. 49 от
2026 г. Its чл. 6 really does read „…- **10 контролни точки**" — verified by
reading the stored unit, not by trusting this sentence.

So **there is nothing left here to fetch**, and nothing left to decide either:
the re-pointing described in the previous edition of this section was done on
2026-08-09. `pen-alcohol-05-08.controlPoints` now cites
`naredba-iz-2539-consolidated-dv49-2026` and shows 10, and
`corpus.test.ts` re-enters the old citation by hand to prove the loader refuses
it.

`sources.json` additionally catalogues the rest of the SARS
[нормативна база](https://www.sars.gov.bg/normativna-uredba/bg-zakonodatelstvo/)
as `coverage: "index-only"` — title and live URL recorded, text **not** ingested.
Every URL in the register was re-checked with an HTTP HEAD when it was written;
the observed status is stored in `httpStatus`, so a link that has rotted says so
(one has: the винетни-такси наредба returns 404).

Ingesting a new act = fetch it, add a `full-text` row with the real sha256, emit
`acts/<id>.json`, and add the id to `ACT_IDS` in `corpus.ts`.

**And read what you emitted, not just its shape.** `naredba-24.json` was ingested
by flattening a lex.bg PAGE to lines: 980 characters of the site's sidebar —
news headlines, forum threads, a „Хумор“ section, the footer — walked straight
into `приложение № 2 към чл. 12`, because that annex is repealed and had no body
of its own to stop the walk. It was 9.9% of the act, and `LawActSchema` had no
objection: a forum post is a valid string. Adding the id to `ACT_IDS` would have
made `getArticle("naredba-24", "приложение № 2")` hand a seventeen-year-old that
forum post. Fixed 2026-08-09 in `content/medical/tools/build-naredba-24.mjs`
(two stops plus a refusal), and
`platform/src/lib/content/law/pageFurniture.test.ts` now enforces the property
over EVERY file in `acts/` — read from the directory, not from the corpus,
because the corpus only loads the acts already trusted.

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
* **the наредби** — `pdftotext -enc UTF-8 -nopgbrk`, split on the same marker,
  **after `tools/page-furniture.mjs` has taken the vendor watermark out.** The
  SARS and ДАМТН PDFs are printed out of a commercial legal database and carry
  its advertisement in every page margin (`Източник: Правно-информационни
  системи "Сиела"` over `24/01/2025 г.`); `-nopgbrk` suppresses the form feed,
  not what is printed on the page, so pdftotext emits the advertisement in
  reading order, inside whichever article was open when the page turned. 185
  pieces of it shipped as statute text until 2026-08-09 — 124 in Наредба № 38
  across 34 units, 58 in the Iз-2539 snapshot across 16, 3 in НСИПМК — and in
  чл. 6 of the snapshot it split т. 3 mid-sentence, which is a hole in the
  exhaustive list the product proves a negative against.

  The removal is **not** an edit of the extracted text and it is not allowed to
  become one. It deletes the advertisement and closes the page seam the
  advertisement opened: mid-sentence seams are rejoined with one space,
  paragraph-boundary seams keep their paragraph. Both builds then **refuse to
  emit** an act in which either signature survives, and
  `platform/src/lib/content/law/pageFurniture.test.ts` asserts the same property
  over every file in `acts/`, ingested by any tool or none. The rejoin is
  checkable rather than trusted: чл. 6, т. 3 now reads word for word like the
  same provision in the lex.bg consolidation, which was ingested from HTML and
  never had a page.

  *Deliberately kept:* the only slash-dates left in the corpus are Наредба № 38's
  two EU Official Journal references (`ОВ L 321, 20/11/2012`). They are statute
  text. The datestamp signature insists on the `г.` that only a Bulgarian date
  carries, which is what tells the two apart.

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
  // WHAT THIS ROW PRICES — declared once, outside every citation, because a
  // citation cannot be checked against itself. See rule 1d.
  "conduct": {
    "statementBg": "Водачът не спазва предписанието на пътните знаци или правилата за предимство и от това е създадена непосредствена опасност за движението.",
    "anchorsBg": [
      ["пътен знак", "пътните знаци"],                       // AND
      ["не спазва предписанието", "неспиране", "не спре"]    //   (each group ORs its alternatives)
    ]
  },
  "fine": {
    "system": "fine",
    "status": "grounded",          // grounded | not-listed | unknown
    "amountBgn": 200,
    "instrument": "фиш",           // фиш | електронен фиш | акт | null — DERIVED, see rule 3
    "instrumentSource": { "actId": "zdvp", "ref": "чл. 186", "paragraphRef": "ал. 1", "quoteBg": "За административни нарушения, за които не е предвидено наказание лишаване…" },
    "source": {
      "actId": "zdvp", "ref": "чл. 179", "paragraphRef": "ал. 1", "pointRef": "т. 5",
      "quoteBg":         "Наказва се с глоба в размер 200 лв.:",            // STATES the figure
      "contextQuoteBg":  "който не спазва предписанието на пътните знаци…", // names the offence
      "offencePhraseBg": "не спазва предписанието на пътните знаци"         // WHICH offence — see rule 1b
    },
    "noteBg": "…"
  },
  "controlPoints":    { "system": "controlPoints",    "status": "grounded",   "points": 10, "source": { "actId": "naredba-iz-2539-consolidated-dv49-2026", … }, "noteBg": null },
  // The ban — and therefore the instrument. "not-listed" = чл. 179 states its
  // penalty in full and лишаване is not in it, so a фиш is lawful.
  "disqualification": { "system": "disqualification", "status": "not-listed", "months": 0, "durationBg": null, "source": { "actId": "zdvp", "ref": "чл. 179", … }, "noteBg": "…" },
  "examPoints":       { "system": "examPoints",       "status": "grounded",   "points": 10, "errorClassBg": "опасна", "source": { "actId": "naredba-38", … }, "noteBg": null },
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

   **1b. …and the citation must name WHICH OFFENCE it prices.** Rule 1 proves a
   sentence exists and contains the number. It does not prove the sentence is
   about the reader's offence, and that is where the bank actually went wrong:
   Наредба № 38, приложение № 5, т. 10, б. „в" states „10 наказателни точки"
   ONCE, in a header, and then lists six different offences under it. All six
   penalties with an examPoints figure carried the header plus the FIRST indent,
   so five of them priced speeding, a missed Б2 and a missed pedestrian crossing
   with the sentence about a red traffic light. Rule 1 passed on all six.
   So every `grounded` figure now carries `offencePhraseBg` — the act's own
   words for the conduct — and the loader checks it from both ends: it must
   occur in the cited unit (so it is the statute's wording, not ours) **and**
   inside `quoteBg`/`contextQuoteBg` (so the quotes shown cannot be about
   something else). Sharing a header across rows stays legal; sharing the
   offence sentence does not.

   **1d. …and the offence it names must be THE ROW'S offence.** Rule 1b is
   still a comparison of the citation with ITSELF: the phrase is checked against
   the quotes, and the same hand writes both. Measured on the shipped bank —
   give `pen-speeding-urban-21-30` the traffic-light indent in `contextQuoteBg`
   and repeat it in `offencePhraseBg`, and `verifyCitations` returns `[]`. The
   citation is internally perfect and prices someone else's conduct, which is
   exactly the defect 1b was added to stop.
   So every row now declares `conduct` — a `statementBg` for the reviewer and
   `anchorsBg` for the loader (AND of OR: every group must be satisfied, any
   alternative satisfies a group, because three acts write one conduct three
   ways). Every offence phrase on the row must satisfy it. Four rules keep the
   declaration from becoming a rubber stamp: each group must be findable in the
   act the row's `lawRefs` name; the row's `lawRefs` must include the article
   its fine is cut from; `statementBg` must satisfy its own anchors and may
   contain no digit that is not inside one; and **no alternative may go unused
   by the row's own phrases**, because widening — not deletion — is how a check
   like this dies.

   **1e. The coordinates are where the sentence actually is.** A unit is a whole
   ARTICLE, so „ал. 1, т. 3" used to be believed rather than checked. ЗДвП
   чл. 182 makes the cost concrete: ал. 1 is the in-town speeding ladder and
   ал. 2 the out-of-town one, and at 31–40 km/h they differ by 100 лв. The
   loader now parses the alinea run („(1) … (2) … (5г) …") and the numbered
   points inside it, and requires the quote to lie inside the alinea it names
   and *something* of the citation to lie inside the point it names — the
   alinea header carries the figure and the point carries the offence, so „all
   of it" would be wrong. **The known limit:** where one sentence appears in two
   alineas verbatim (чл. 182, ал. 1, т. 3 and ал. 2, т. 3 are identical), the
   check cannot tell them apart. `corpus.test.ts` pins that.

   **1c. Quotes are cut on a boundary, or not at all.** `build-penalties.mjs`
   used to widen a quote until it met a „;" or spent a 400-character budget, and
   then stop wherever it stood — six shipped quotes were the budget rather than
   the law, three of them cut mid-word and three running past the end of their
   own provision into the next alinea. All six passed rule 1, because a prefix
   of the act IS a substring of the act. `quote()` now ends on „;", „:" or a
   real sentence boundary (abbreviation-aware: „чл.", „ал.", „лв." do not end a
   sentence) and **throws** rather than truncate. `corpus.test.ts` asserts no
   quote in the bank ends anywhere else.
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
3. **`instrument` is DERIVED from `disqualification`, not chosen — and the
   schema enforces the derivation.** One test decides it, and it is written in
   the statute:

   | `disqualification.status` | `fine.instrument` must be |
   | --- | --- |
   | `grounded` (a ban is provided) | `"акт"` — чл. 186, ал. 1 and чл. 189, ал. 4 both exclude such offences |
   | `not-listed` (the alinea states its penalty and there is no ban) | `"фиш"` or `"електронен фиш"` |
   | `unknown` (we have not read the provision) | `null` — no instrument is claimed, exactly as no number is guessed |

   `PenaltyEntrySchema` rejects every other combination, so the entry cannot be
   written wrong. `disqualification.status: "not-listed"` is a **positive
   finding**, not a gap: it means the sanction alinea states its penalty
   exhaustively and лишаване is not in it, which is the precondition чл. 186,
   ал. 1 requires.

   > **The dead rule this replaced, and why it is written down.** Until
   > **ДВ, бр. 64 от 2025 г.** a фиш could not be issued for a point-carrying
   > offence, so „does it cost контролни точки?" and „фиш or акт?" always had
   > the same answer and it was natural — and, then, harmless — to reason from
   > one to the other. That amendment added *„за броя контролни точки, които се
   > отнемат"* to the data a фиш must carry (чл. 186, ал. 1, в сила от
   > 7.09.2025 г.), struck the same restriction out of чл. 189, ал. 4 (в сила от
   > 7.05.2026 г.), and **Наредба № Iз-2539 чл. 2, ал. 6** (изм. ДВ, бр. 49 от
   > 2026 г.) now names наказателно постановление, фиш *and* електронен фиш as
   > bases for deduction. `чл. 3, ал. 1` — the article that used to carry
   > *„Контролни точки се отнемат въз основа на влязло в сила наказателно
   > постановление"*, and the sentence this rule used to cite — **no longer says
   > that at all**; after бр. 49 it governs *restoration*. Anything still citing
   > it for the deduction basis is citing a rewritten article.
   >
   > Three of the first six entries in this bank said `"акт"` on the dead
   > inference, and this README taught it. Corrected 2026-08-09;
   > `corpus.test.ts` re-enters the mistake by hand and asserts the schema
   > refuses it.
   >
   > Every Bulgarian driving-school textbook still teaches the old rule. Ours
   > contradicts them, correctly, and names the ДВ issue that changed it.
4. `status` stays `needs-review` until a human has read the cited article and
   agreed with the mapping.

The bank currently holds seven entries. They are a **worked demonstration of the
shape**, not a sweep:

* `pen-b2-no-stop` vs `pen-b2-no-stop-danger` — the same manoeuvre priced at
  100 лв./0 к.т. and 200 лв./10 к.т. depending only on whether непосредствена
  опасност was created. Both arrive on a **фиш**: чл. 179 does not contain the
  word „лишаван" once, so the points do not force an акт.
* `pen-crosswalk-no-yield` — deliberately carries `examPoints.status: "unknown"`
  because приложение № 5 does not name the pedestrian crossing. It renders with
  no number.
* `pen-alcohol-05-08` — the only entry with a grounded ban, and therefore the
  only `"акт"`. Its `controlPoints` is `"unknown"`: see the ⚠ note above.
* `pen-speeding-urban-21-30` — **the founder's own ticket**, worked end to end.
  78 km/h measured on a 50 road, less the максимално допустима грешка of 3 km/h
  = 75, i.e. 25 over → чл. 182, ал. 1, т. 3, глоба 100 лв. = 51,13 EUR at the
  fixed 1,95583 rate. It exists because it is the case the bank could not
  describe: money from a **camera**, zero контролни точки, no ban — and it is
  precisely the absence of a ban that makes the електронен фиш lawful
  (чл. 189, ал. 4). The same behaviour is 10 **наказателни** точки on the exam
  sheet, which is a different scale in a different document.

## THEO-4 / north star

Retrieval is what lets the tutor behave like an instructor instead of a
rulebook: it can show *the sentence the rule is written in*, and say which of
the systems a consequence belongs to. "Ten points" means nothing to a
17-year-old — worse, in Bulgaria „точки" unqualified reads as **контролни**
точки, so a bare „−10 т." on a lesson result is heard as a quarter of a licence.
Say which:

> „10 **наказателни** точки в изпитния протокол (Наредба № 38, приложение № 5) —
> изпитът се къса над 9. Това НЕ са контролните точки на книжката: за същото
> нарушение по пътя се отнемат **0 контролни точки** от 39-те, а санкцията е
> **100 лв. с електронен фиш**, защото за това стъпало не се предвижда лишаване
> от право."

Four different answers, four different documents, and not one of them can be
added to another. That is why `PenaltyEntry` has four fields.
