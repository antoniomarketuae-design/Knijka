# The medical source layer — retrievable, quotable, and re-checkable by machine

> **ADR-002, restated for medicine:** never write a depth, a rate, a ratio or a
> ratio-of-anything from memory. If it is not in the fetched text, it does not
> ship. This directory exists so that rule can be *enforced* rather than
> believed — the same reason `content/law/` exists, applied to the one subject
> in the product where being confidently wrong is not measured in refunds.

Twenty-nine questions in `content/questions/ptp-i-parva-pomosht.json` teach a
17-year-old what to do at a roadside. They shipped `approved`, cited to **ЗДвП
чл. 123**. Чл. 123 is the *duty to stop and assist*. It contains no compression
depth, no rate, no breathing check, no ratio — the citation pointed at an
article that cannot settle the question being asked. A later wave regrounded
them on ERC 2021 but could produce no URL, no byte count and no sha256, and an
independent re-fetch failed. **That is the gap this directory closes.**

## Why this is not `content/law/acts/*.json`

Наредба № 24 **is** a statute and it went into the law corpus unchanged
(`content/law/acts/naredba-24.json`, built by `tools/build-naredba-24.mjs`).
The *clinical guidelines* got a different shape, for four reasons that are not
stylistic:

| `ActSchema` assumes | A guideline gives |
| --- | --- |
| units addressed by `чл. N` — a legal article number | topic sections and bullet recommendations, with no numbering to cite |
| authority = **in force** | authority = **current edition**; ERC publishes on a ~5-year cycle and 2025 supersedes 2021 |
| one text, internally consistent | several bodies that can and do **disagree** about the same claim |
| stable bytes (`.docx`, `.pdf`) | HTML pages that carry per-request tokens |

That last one is concrete: two identical fetches of `lex.bg` return the same
110 826 bytes with a **different sha256**. A raw hash alone therefore cannot
prove "this is the text we read", so every source here carries **both** a
`rawSha256` (with `rawHashStable` recording whether a second fetch actually
reproduced it — observed, not assumed) and a `textSha256` over the output of
`tools/extract.mjs`. The text hash is the invariant that holds, and it is what
`verify-claims.mjs` gates on.

The third row is the one that mattered most. A statute does not contradict
itself; here, **three sources disagree in ways a student would notice**, and
`claims.json` has a `conflicts[]` array precisely so no one has to pick one
silently.

## Layout

```
content/medical/
  README.md          ← this file
  sources.json       ← 8 sources: URL, HTTP status, raw + text sha256, byte counts, what each covers
  claims.json        ← 21 clinical claims, every quote cut from a fetched source
  tools/
    fetch.sh             ← re-fetch every original (browser UA — see below)
    extract.mjs          ← the one definition of "the text of this page"
    build-sources.mjs    ← emits sources.json; re-fetches to observe hash stability
    build-claims.mjs     ← emits claims.json; THROWS if a locator no longer matches
    build-naredba-24.mjs ← emits content/law/acts/naredba-24.json
    verify-claims.mjs    ← the gate: re-extract, re-hash, re-check all 80 quotes
```

Regenerating, from `content/medical/tools/`:

```bash
bash fetch.sh
node build-sources.mjs ..
node build-claims.mjs  ..
node build-naredba-24.mjs ../../law
node verify-claims.mjs ..        # exit 1 if anything drifted
```

The fetched originals are **not** committed (~18 MB, mostly the ERC book);
`sources.json` pins each one, exactly as `content/law` does.

## The half that was missing: the questions have to cite BACK

A register that describes the guidelines correctly changes nothing on its own,
because the tutor grounds on what the **row** cites, not on what this directory
knows. Measured before it was fixed: **this register named 28 first-aid rows
across 35 (question, claim) pairs, and not one of those rows carried a
`sourceRefs` entry** — 2 of 1,089 questions in the whole bank had one at all.
So `claims.json` said „ERC 2025 says 5–6 cm" while `q-ptp-036` still offered
retrieval nothing but **ЗДвП чл. 123**, the duty to stop and assist. That is
the Tier C defect (docs/education/90 §14.5) still fully intact, behind a
directory that made it look closed.

All 29 now carry `sourceRefs` — `{ sourceId, ref, claimId }`, derived from this
register rather than chosen by hand — and the join is gated in both directions
by `platform/src/modules/theory` (`findGroundingGaps`), which walks the CLAIMS
and looks for the row. A checker that walked the rows instead would report a
perfectly clean bank the moment every row cited nothing, which is exactly the
state the bank was in.

Two claims deliberately have **no** `sourceRefs` pointing at them, and neither
is an oversight:

* `med-legal-duty` — every quote is ЗДвП. That belongs in `lawRefs`, and is
  already there. `sourceRefs` is for what a statute cannot settle.
* `med-impaled-object` — zero quotes, because an exhaustive sweep of all eight
  registered sources for *impaled / embedded / foreign object / penetrating*
  returns nothing. Manufacturing a citation for it would be the чл. 123 mistake
  wearing a new coat, so `q-ptp-019` cites only the half that IS grounded
  (direct pressure) and its explanation tells the student the rest is
  established practice rather than a guideline.

> **`resus.org.uk` answers 403 to a default curl/wget User-Agent.** That is the
> entire reason an earlier attempt recorded it as unreachable. `fetch.sh` sends
> a browser UA and gets 200. The Elsevier-hosted journal (`resuscitationjournal.com`,
> `sciencedirect.com`) genuinely does refuse machine access — Crossref confirms
> the ERC 2025 articles carry a TDM-only licence, not open access — so the
> primary chapters are cited by DOI but grounded through the two hosts that do
> serve them.

## The chain of authority, established

1. **ЗДвП чл. 151, ал. 2** — a licence is issued to someone who has completed
   training *"за водач на моторно превозно средство и за оказване на първа
   долекарска помощ"*.
2. **ЗДвП чл. 152а, т. 2** delegates the syllabus to the Minister of Health
   with the Minister of Education, by наредба.
3. **→ Наредба № 24 от 2.12.2002 г.**, consolidated through **ДВ, бр. 114 от
   24.12.2025 г., в сила от 26.01.2026 г.** This is the highest authority for
   this product, and `чл. 9` lists the nine examinable topics.
4. **Наредба № 24, чл. 8, ал. 1** hands the actual *учебна програма* to БЧК, to
   be approved by the Minister of Health.

**And that is where the chain stops being retrievable.** Наредба № 24 fixes
*which topics are taught*; it contains **not one clinical value** — no depth,
no rate, no ratio. Those live in the учебна програма, which is **not published**
(searched: ДАБДП нормативна база, mh.government.bg, strategy.bg consultation
11635, redcross.bg). So for every figure, the highest *reachable* authority is
**ERC Guidelines 2025**, and Наредба № 24 чл. 9 tells us which topic it belongs
to. Every claim records both, in `naredba24TopicBg`.

Two side findings worth keeping:

* **The ДАБДП copy of Наредба № 24 is stale.** `sars.gov.bg` serves a Сиела
  snapshot dated 17.01.2023 that predates the 2025 amendment — its чл. 3 still
  lists only *магистър по медицина/стоматология, фелдшер, медицинска сестра*.
  It is registered as `src-naredba-24-sars` with `authority: "superseded"` so
  nobody cites it by accident.
* **First aid is not in the ДАИ theory exam under Наредба № 38** — it is a
  separate 12-hour БЧК course with its own written test and practical task
  (Наредба № 24, чл. 10), and the удостоверение is a precondition for the
  licence. What Наредба № 38 *does* put in the theory scope is
  приложение № 1, I, т. 1.5: *"мерките, които водачът при необходимост може да
  предприеме в помощ на пострадали от пътнотранспортно произшествие"* — i.e.
  our questions are in scope at the level of **measures**, not parameters.

## Where the sources disagree

Recorded, not resolved. `claims.json` carries each as a `conflicts[]` entry.

1. **The recovery position at a road accident.** ERC 2025 and RCUK 2025 both
   say: *"In cases of agonal breathing or trauma, do NOT move the person into
   the recovery position."* A ПТП casualty **is** trauma. Our `q-ptp-022` and
   `q-ptp-037` instruct exactly that move. БЧК teaches it with no trauma
   exception. **This is the most consequential finding of the wave and it is a
   founder decision, not a content edit** — follow the 2025 consensus and
   rewrite the questions, or follow what БЧК actually examines.
2. **The order of the breathing check.** RCUK states the 2025 change in its own
   words: *"Call 999 for any unresponsive person. Rescuers no longer need to
   confirm abnormal breathing before calling."* Any question built on
   "check breathing → then call" encodes the 2021 sequence.
3. **Compression rate framing.** ERC/RCUK give a **range**, 100–120 min⁻¹. БЧК
   gives *"с честота 100 притискания в минута (може да се правят по-бързо, но
   не повече от 120 в минута)"* — the 2010-era "at least 100" framing. Same
   numbers, different lesson.
4. **Hand position — a plain error on the БЧК page.** It reads *"Натискайте
   върху горната част на корема или долната част на гръдната кост."* ERC/RCUK:
   the **lower half of the sternum**, and explicitly not the abdomen. It looks
   like a negation lost in translation from the Belgian Red Cross–Flanders
   original. Recorded verbatim as a conflict; never quoted as guidance.

### One premise in the brief did not survive contact with the source

The wave was warned that the БЧК page "still teaches the pre-2010 4–5 cm
depth". **It does not.** As fetched on 2026-08-04 it says *"Натискайте
най-малко 5 см (макс. 6 cм)"* — 5–6 cm, agreeing with ERC 2025. The БЧК page is
stale in other ways (it states outright that it is built on *"научните насоки на
МФЧК/ЧП от 2011 г."*), but not that one. `verify-claims.mjs` was tested against
exactly this scenario: substituting 4–5 cm into the depth claim makes it exit 1.

## What we still cannot ground

`claims.json` marks these `ungrounded-*` rather than papering over them. Five
of the twenty-one now carry that prefix — the count went UP when the register
was extended to the rows it had been silent about, which is the right
direction: each one is a place the product was already teaching something and
this file was not admitting it could not cite it.

* **`med-impaled-object` (`q-ptp-019`).** Zero quotes, by construction. See the
  section above.
* **`med-triage-unresponsive-first` (`q-ptp-033`).** RCUK orders a rescuer's
  attention (safety → responsiveness → life-threatening bleeding) and treats
  unresponsiveness as a trigger on its own, but publishes no lay rule for
  choosing between TWO casualties. Our answer follows from the ordering; it is
  assembled, not read, so `authoritative` is null.
* **`med-nothing-by-mouth` (`q-ptp-034`).** Neither ERC 2025 nor RCUK 2025
  addresses oral intake after trauma at all. The one place they DO direct
  something by mouth — suspected hypoglycaemia — is quoted alongside precisely
  so the boundary is visible rather than assumed.

* **`med-extrication-technique` (`q-ptp-063`, the burning car).** Наредба № 24
  чл. 9, т. 8 makes *"извличане и транспортиране на пострадали при ПТП"*
  examinable, neither ERC 2025 nor RCUK 2025 discusses vehicle extrication at
  all, and the учебна програма is unpublished. We have a source for the
  **decision** (move only if the scene is unsafe) and **no guideline** for the
  **technique** (the Rautek grip our answer describes).

  It is no longer *nothing*, though, and the register said it was for one
  revision too long. The claim sat at `ungrounded-no-reachable-source` with zero
  quotes while `q-ptp-063` was already teaching the grip and quoting БЧК for it
  verbatim. **БЧК, „Основните стъпки в първата помощ", section „Спешно
  извеждане на пострадал", describes the grip and its limit** — kneel behind the
  head, both hands under the armpits, grasp the forearm, stand and walk
  backwards dragging, *"завъртайте главата, шията или тялото на пострадалия
  колкото е възможно по-малко"* (`bchk_page5.txt:39, 44, 46, 47`). So the status
  is now **`ungrounded-teaching-material-only`**, which is a different and
  weaker claim than "grounded": БЧК is registered
  `authority: "not-a-grounding-source"`, the section is **generic** rather than
  vehicle-specific (the seat belt appears nowhere in it), and a teaching
  translation does not become a guideline for want of a better one.
  `build-claims.mjs` now refuses to emit `ungrounded-no-reachable-source` on a
  claim that carries any quote at all, so that particular staleness cannot
  return silently.
* **`med-helmet-removal` (`q-ptp-020`).** Neither guideline mentions motorcycle
  helmets. Our answer is *compatible* with "minimise movement of the neck", but
  that is an inference, not a citation.

Both are answerable by obtaining the учебна програма from БЧК — the single
highest-value acquisition left in this domain.

## THEO-4

Retrieval is what lets the tutor behave like an instructor instead of a
rulebook. "5–6 cm" is a number to memorise and forget. *"ERC 2025 says each
compression must push the chest down 5 to 6 cm — deep enough that blood
actually moves, shallow enough not to wreck the chest; and yes, БЧК's own page
says the same thing"* is a lesson, and `claims.json` holds the sentence it is
quoting. Where the sources disagree, the honest tutor move is to say so —
which is why `conflicts[]` is part of the data and not a comment.

## Follow-up the fix lane must land (not done here, deliberately)

`content/law/acts/naredba-24.json` is emitted and validates against
`LawActSchema`, but it is **not yet wired into the loader**, because doing so
turns two currently-green assertions red and the lead gates that:

* `platform/src/lib/content/law/corpus.ts` — add `"naredba-24"` to `ACT_IDS`.
* `content/law/sources.json` — add the `src-naredba-24-lex` row
  (`coverage: "full-text"`, sha256 in `content/medical/sources.json`).
* `platform/src/lib/content/law/corpus.test.ts:40` — the act list becomes
  `["naredba-24", "naredba-38", "naredba-iz-2539", "zdvp"]`; `:60` — `full.length`
  becomes `4`.
* `actIdForActName()` — map `"Наредба № 24"`.
