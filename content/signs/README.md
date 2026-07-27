# Road Sign Catalog — Wave 1

64 signs, the instruction-critical core for category B. Data: `signs.json` (per `content/SCHEMA.md`), artwork: `svg/<code>.svg` (original renditions, viewBox 200×200, no external refs, no scripts, Cyrillic `<title>` for accessibility).

## Legal basis — ordinance question RESOLVED

**Наредба № РД-02-21-1 от 23.11.2023 г.** (МРРБ) за сигнализация на пътищата с пътни знаци is the current governing act: обн. ДВ бр. 101/05.12.2023, in force since August 2024. **Наредба № 18/2001 was explicitly repealed** (отменена, ДВ бр. 98/2024) precisely to remove the two-acts-one-subject ambiguity flagged in `docs/education/31_BULGARIAN_DRIVING_LAWS.md`. All `lawRefs` in `signs.json` therefore cite РД-02-21-1/2023. The doc-31 open item №1 can be closed.

Verification method: web research against the ordinance text (sars.gov.bg PDF, zbut.eu consolidated text), the strategy.bg repeal consultation, bg.wikipedia.org's post-2023 catalog, and cross-checks with ≥2 independent sign vendors / driving-school sites (traffic-daily.com, adhold.org, avtoobuchenie.bg, karaybe.com, elitps.net) for every code where old/new ordinance numbering could diverge. Key confirmation: **Б1 = „Пропусни движещите се по пътя с предимство!“ (give way), Б2 = „Спри!…“ (STOP octagon)** — matches the exam-engine assumption.

## Coverage (wave 1)

| Group | Count | Codes |
|---|---|---|
| А — предупредителни за опасност | 18 | А1, А2, А3, А4, А5, А12, А15, А18, А19, А20, А23, А25, А26, А29, А30, А32, А33, А39 |
| Б — предимство | 6 | Б1–Б6 (complete group) |
| В — забранителни | 15 | В1, В2, В3, В12, В14, В21, В22, В23, В24, В26, В27, В28, В31, В33, В34 |
| Г — задължителни предписания | 10 | Г1, Г2, Г3, Г4, Г7, Г9, Г12, Г17, Г18, Г19 |
| Д — специални предписания | 11 | Д4, Д5, Д6, Д9, Д11, Д12, Д15, Д16, Д17, Д19, Д24 |
| Е — допълнителна информация | 4 | Е1, Е7, Е21, Е22 |

## needs-review items (6)

Codes are solid; the flag is on official *wording* sourced from a single reference (Wikipedia's post-2023 list) where the 2023 ordinance renamed/renumbered vs. Наредба 18:

- **А15** — new name „Опасност от хлъзгане" (old: „Хлъзгав път")
- **А20** — new name adds „…и водачи на индивидуално електрическо превозно средство"
- **В12, В14** — В-group renumbering risk vs. old ordinance (pedestrians / depicted vehicles)
- **В31, В33** — exact „Край на забраната…" phrasings

Resolve by checking Приложение № 1/№ 3 of the ordinance PDF (sars.gov.bg copy) directly.

## Wave 2 gaps

- **А**: А6–А11, А13, А14, А16, А17, А21, А22, А24, А27, А28, А31, А34.1/34.2, А35.1–35.3 (бализи), А36–А38, А40–А43 (new 2023 signs: концентрация на ПТП, задръстване, намалена видимост, настъпило ПТП)
- **В**: В4–В11, В13, В15–В20 (dimension/weight limits, категории ППС), В25, В29, В30, В32
- **Г**: Г5, Г6, Г8, Г10, Г11, Г13, Г14а/б, Г15а/б, Г16а/б (нови а/б кодове — verify against ordinance), Г20
- **Д**: Д1–Д3, Д7/Д7а/Д8/Д8а (автомобилен/скоростен път), Д10, Д13, Д14, Д18, Д20–Д23, Д25/Д25.1/Д25.2 (винетка/ТОЛ), Д26–Д28
- **Е**: Е2–Е6, Е8–Е20, Е23
- **Entire groups**: Ж (направления/указателни табели), Т (допълнителни табели — needed soon: Т1/Т2 distance/length modify А- and В-signs in exam questions), road markings (маркировка), variable-message signs (ПЗПС)
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
  В27, В28, В31, В33, В34, Г18, Д6, Д12, Д16 — the one element whose official
  design crosses the whole face. Those are measured against the plate silhouette
  instead: the bar may touch the border (it must) but may never leave it.

`<text>` is bounded ANALYTICALLY against a pessimistic wide-bold-sans envelope,
not from the raster, because "Arial, Helvetica, sans-serif" resolves to whatever
the student's device has. A `font-size` that passes here is safe everywhere; one
that fails is not safe just because it looks fine on this machine.

## Notes for reviewers

- Artwork is original geometric interpretation in Vienna-Convention style, not traced from the ordinance annexes (copyright posture per docs/education/31, ЗАПСП чл. 4, т. 1).
- **А5 depicts a DESCENT** (tall side of the black wedge on the left, slope falling to the right). It used to rise to the right, i.e. it drew the ascent sign while q-signs-067 keyed „Стръмен наклон при спускане" against a „Стръмно изкачване напред" distractor — the picture argued for the wrong answer.
- Д11/Д12 use a placeholder town name („СОФИЯ") — the sign class is what matters for teaching.
- В26/Г17/Г18/В33 use placeholder values (60/50 km/h); the platform may later parametrize speed-sign values.
