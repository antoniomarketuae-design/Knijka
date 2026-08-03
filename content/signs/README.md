# Road Sign Catalog — Waves 1 + 2a

77 signs, the instruction-critical core for category B. Data: `signs.json` (per `content/SCHEMA.md`), artwork: `svg/<code>.svg` (original renditions, viewBox 200×200, no external refs, no scripts, Cyrillic `<title>` for accessibility).

- **Wave 1** — 64 signs, groups А–Е.
- **Wave 2a** — 13 entries closing the twelve codes the question bank *named* but the catalogue could not draw (see "Wave 2a" below). All `status: "draft"` pending founder review.

## Legal basis — ordinance question RESOLVED

**Наредба № РД-02-21-1 от 23.11.2023 г.** (МРРБ) за сигнализация на пътищата с пътни знаци is the current governing act: обн. ДВ бр. 101/05.12.2023, in force since August 2024. **Наредба № 18/2001 was explicitly repealed** (отменена, ДВ бр. 98/2024) precisely to remove the two-acts-one-subject ambiguity flagged in `docs/education/31_BULGARIAN_DRIVING_LAWS.md`. All `lawRefs` in `signs.json` therefore cite РД-02-21-1/2023. The doc-31 open item №1 can be closed.

Verification method: web research against the ordinance text (sars.gov.bg PDF, zbut.eu consolidated text), the strategy.bg repeal consultation, bg.wikipedia.org's post-2023 catalog, and cross-checks with ≥2 independent sign vendors / driving-school sites (traffic-daily.com, adhold.org, avtoobuchenie.bg, karaybe.com, elitps.net) for every code where old/new ordinance numbering could diverge. Key confirmation: **Б1 = „Пропусни движещите се по пътя с предимство!“ (give way), Б2 = „Спри!…“ (STOP octagon)** — matches the exam-engine assumption.

## Coverage

Wave-2a additions in **bold**.

| Group | Count | Codes |
|---|---|---|
| А — предупредителни за опасност | 19 | А1, А2, А3, А4, А5, А12, А15, А18, А19, А20, А23, А25, А26, **А28**, А29, А30, А32, А33, А39 |
| Б — предимство | 6 | Б1–Б6 (complete group) |
| В — забранителни | 16 | В1, В2, В3, В12, В14, В21, В22, В23, В24, **В25**, В26, В27, В28, В31, В33, В34 |
| Г — задължителни предписания | 12 | Г1, Г2, Г3, Г4, Г7, Г9, Г12, **Г15а**, **Г15б**, Г17, Г18, Г19 |
| Д — специални предписания | 14 | **Д1**, Д4, Д5, Д6, Д9, Д11, Д12, **Д13**, **Д14**, Д15, Д16, Д17, Д19, Д24 |
| Е — допълнителна информация | 4 | Е1, Е7, Е21, Е22 |
| Ж — информационно-указателни | 1 | **Ж19** |
| Т — допълнителни табели | 5 | **Т1**, **Т2**, **Т10**, **Т13**, **Т15** |

## Wave 2a — the twelve codes the question bank named and the catalogue could not draw

Eleven questions taught a student the name of a sign the product could never
show him. `platform/src/lib/content/questionMedia.test.ts` (M4) had them pinned
as open debt; that pin is now an assertion that the list stays **empty**.

**Twelve codes, thirteen entries.** Г15 ships as its real а/б pair — a bare
„Г15" is not a sign anybody can post, and the question that names Г15а also
names Г15б as the end of the regime. The M4 scan resolves a cited base code
against the pair.

| Code | Question(s) it unblocks | `lawRefs` and where they were RETRIEVED from |
|---|---|---|
| А28 | q-predimstvo-053 | `знак А28` + `чл. 41` — the question's own explanation: „А26–А28 сигнализират пресичане с път без предимство (чл. 41)", and `чл. 41` is in its `lawRefs` |
| В25 | q-manevri-046 | `прил. № 3, знак В25` + `ЗДвП чл. 43` — copied verbatim from that question's `lawRefs` |
| Г15а, Г15б | q-spirane-i-parkirane-050 | `знак Г15а/Г15б` + `чл. 100, ал. 1` — the question's `lawRefs` say „чл. 100, ал. 1 — знаци Г15а и Г15б" |
| Д1 | q-signali-i-markirovka-038, -064 | `знак Д1` only, **no ordinance article** — the bank cites `ППЗДвП чл. 33, ал. 5` for the LANE-SIGNAL rule, not for the sign, so that is the second ref and the ordinance article is left unclaimed |
| Д13, Д14 | q-speed-049 | `знак Д13/Д14` + `чл. 122, ал. 1` — the question's `lawRefs` say „чл. 122, ал. 1 — знаци Д13 и Д14" |
| Ж19 | q-signs-062, q-speed-048 | `прил. № 7, знак Ж19` + `чл. 173, ал. 1` — both pinned to Ж19 by name in those questions' `lawRefs` |
| Т1 | q-spirane-i-parkirane-057 | `табела Т1` only, **no article** — that question's article ref („чл. 181") is pinned to Т2, not Т1 |
| Т2 | q-spirane-i-parkirane-057 | `табела Т2` + `чл. 181` — „чл. 181 — табела Т2" |
| Т10, Т15 | q-spirane-i-parkirane-042 | `табела Т10/Т15` only, **no article** — see the ambiguity note below |
| Т13 | q-predimstvo-056 | `табела Т13` + `чл. 189, ал. 1` + `ЗДвП чл. 50, ал. 2` — both pinned to Т13 by name in that question |

### What was deliberately NOT written (ADR-002)

Better twelve signs with eleven refs than twelve with a guess. Three entries
carry only their code, with the article left empty on purpose:

- **Т10 and Т15.** The bank holds `„чл. 186 и чл. 191 — табели Т10 и Т15"` — two
  articles for two plates, and **nothing in this repo says which article is
  which plate**. Splitting the pair 1:1 would have been an inference dressed as
  a citation. Resolve it from the article text and write one article per entry.
- **Т1.** The only article in the question that teaches it is pinned to Т2.
- **Д1.** No source we hold gives the sign an ordinance article.

Appendix numbers were only written where a source states them (`прил. № 3` for
В25, `прил. № 7` for Ж19). The Т group's appendix number is **not** recorded
anywhere in this repo and was not guessed.

### Verify these before approving (ordered by how much a wrong one costs)

1. **А28 — WHICH SIDE.** The bank establishes the family („А26–А28 сигнализират
   пресичане с път без предимство") but **not which of А27/А28 is the left-hand
   variant**. The face and the name assume the side road joins from the **left**.
   If the annex says otherwise, mirror the face and swap the name — this is
   exactly the А5 defect (the picture arguing for the wrong answer) waiting to
   happen, and it is the one entry here that can actively mis-teach.
2. **Т-group layout.** The plates are rendered as text/diagram on the standard
   white board with a black border, because a neutral rendering cannot mislead
   about meaning even if the official layout differs. Т2 carries a double-headed
   arrow (a length); Т1 carries the bare distance. Confirm against the annex.
3. **Names constructed rather than quoted.** Verbatim from the bank: Г15а
   „Задължителен път само за пешеходци", Д13 „Начало на зоната на действие на
   изобразения пътен знак", Ж19 „Препоръчителна скорост", Т1 „Разстояние до",
   Т2 „Дължина на", Т10 „Време на действие на пътния знак", Т13 „Направление на
   пътя с предимство в кръстовището", Т15 „Работни дни". **Constructed** as the
   mirror of a quoted name or from the bank's description of the sign: А28,
   В25, Г15б, Д1, Д14.
4. **Placeholder values**, same convention as В26/Г17: Д13/Д14 depict a „30"
   disc, Ж19 shows „70", Т1 „100 m", Т2 „50 m", Т10 „8–18 ч".

### A contradiction this work surfaced — NOT in this lane's files

`platform/src/modules/sim/lessons/scenario/templates-lanes.ts:825` tells the
student the В24 overtaking ban runs „до края ѝ (**знак В25** или следващото
кръстовище)", i.e. it treats В25 as the END of the ban. Four sources disagree:
`content/questions/manevri-i-izprevarvane.json` (q-manevri-046),
`docs/simulation/scenario-engine/scenario-map.json`,
`docs/simulation/scenario-engine/topics/t-maneuvers.json` — all three say В25 is
the ban on overtaking **by lorries over 3,5 t** — and this catalogue already
holds **В31 „Край на забраната за изпреварване…"** as the end sign. The
catalogue follows the four; the simulator line needs fixing by whoever owns
`templates-lanes.ts`.

## needs-review items (6)

Codes are solid; the flag is on official *wording* sourced from a single reference (Wikipedia's post-2023 list) where the 2023 ordinance renamed/renumbered vs. Наредба 18:

- **А15** — new name „Опасност от хлъзгане" (old: „Хлъзгав път")
- **А20** — new name adds „…и водачи на индивидуално електрическо превозно средство"
- **В12, В14** — В-group renumbering risk vs. old ordinance (pedestrians / depicted vehicles)
- **В31, В33** — exact „Край на забраната…" phrasings

Resolve by checking Приложение № 1/№ 3 of the ordinance PDF (sars.gov.bg copy) directly.

## Remaining gaps (wave 2b)

Wave 2a closed only the codes the question bank actually names. What is still
missing is everything no question has needed yet:

- **А**: А6–А11, А13, А14, А16, А17, А21, А22, А24, А27, А31, А34.1/34.2, А35.1–35.3 (бализи), А36–А38, А40–А43 (new 2023 signs: концентрация на ПТП, задръстване, намалена видимост, настъпило ПТП)
- **В**: В4–В11, В13, В15–В20 (dimension/weight limits, категории ППС), В29, В30, В32
- **Г**: Г5, Г6, Г8, Г10, Г11, Г13, Г14а/б, Г16а/б (нови а/б кодове — verify against ordinance), Г20
- **Д**: Д2, Д3, Д7/Д7а/Д8/Д8а (автомобилен/скоростен път), Д10, Д18, Д20–Д23, Д25/Д25.1/Д25.2 (винетка/ТОЛ), Д26–Д28
- **Е**: Е2–Е6, Е8–Е20, Е23
- **Ж**: everything except Ж19 — the направления/указателни табели proper
- **Т**: everything except Т1, Т2, Т10, Т13, Т15 — including Т7, which
  q-spirane-i-parkirane-050 cites in its `lawRefs` (it is not named in the copy,
  so M4 does not flag it, but the entry would complete that question's story)
- Road markings (маркировка), variable-message signs (ПЗПС)
- SVG polish pass: review Б5/Б6 arrow layout against official annex drawings before "approved"

## The geometry gate — read this before editing any face

`platform/src/lib/content/signFaces.test.ts` renders every catalogue entry and
fails the build if any glyph ink lands within 4 viewBox units of the plate
border. It exists because hand-authored vector art has exactly one failure mode
that human review keeps missing, and the founder caught it off the verdict board
twice: the symbol spilling over the edge (а triangle's black figure poking
through the red border, a roundabout ring overrunning the apex, a pedestrian
whose legs hang below the base, a board whose rows run off the bottom).

Two things the gate needs from the artwork, so state them in the file:

- **`data-plate="true"` on every plate primitive** (the coloured disc / triangle
  / board, and any inner ring drawn as part of it). The gate derives the safe
  area from these — a face without one is reported as an unguarded hole, not a
  pass. It is declared rather than inferred because inference mistook Г19's
  chain circle and Б4's yellow inner diamond for plate layers.
- **`data-span="face"` on the cancellation / prohibition bar** of Б4, В21–В23,
  В27, В28, В31, В33, В34, Г15б, Г18, Д6, Д12, Д14, Д16 — the one element whose
  official design crosses the whole face. Those are measured against the plate
  silhouette instead: the bar may touch the border (it must) but may never leave
  it.

`<text>` is bounded ANALYTICALLY against a pessimistic wide-bold-sans envelope,
not from the raster, because "Arial, Helvetica, sans-serif" resolves to whatever
the student's device has. A `font-size` that passes here is safe everywhere; one
that fails is not safe just because it looks fine on this machine.

## Notes for reviewers

- Artwork is original geometric interpretation in Vienna-Convention style, not traced from the ordinance annexes (copyright posture per docs/education/31, ЗАПСП чл. 4, т. 1).
- **А5 depicts a DESCENT** (tall side of the black wedge on the left, slope falling to the right). It used to rise to the right, i.e. it drew the ascent sign while q-signs-067 keyed „Стръмен наклон при спускане" against a „Стръмно изкачване напред" distractor — the picture argued for the wrong answer.
- Д11/Д12 use a placeholder town name („СОФИЯ") — the sign class is what matters for teaching.
- В26/Г17/Г18/В33 use placeholder values (60/50 km/h); the platform may later parametrize speed-sign values. Wave 2a adds Д13/Д14 („30" disc inside the ЗОНА frame), Ж19 („70"), Т1 („100 m"), Т2 („50 m"), Т10 („8–18 ч") to that list.
- **Д14 greys the depicted sign** (`#8a8a8a`) instead of drawing it in red under a red bar. Both halves of that are the catalogue's own conventions — В31/В33 grey the cancelled content, Д6/Д12/Д16 use a red diagonal — and the first draft, red-on-red, made the ring look broken rather than cancelled. Checked on the rendered face, not on the source.
- **В25 shows a red lorry (left) and a black car (right)** in the В24 layout: red is the vehicle the ban addresses, i.e. the one doing the overtaking. Wheel arches are cut out of the body path, same technique as the В24/В14 car, because without them the lorry rendered as a solid block.
- **Т13's priority path is 16 units thick against 4-unit side arms.** The first draft used 12 vs 6 and read as a plain cross at display size — the whole point of the plate is that one road through the junction is fatter than the others.
