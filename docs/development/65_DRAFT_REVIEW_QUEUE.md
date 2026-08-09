# 65 · Draft Review Queue — 0 drafts awaiting graduation (THEO-5)

> **GENERATED FILE** — rebuild with `node tools/theory/verify_drafts.mjs --report`
> after any content edit or approval batch. Manual edits will be overwritten.
> Generated: 2026-08-09. Mechanical checks only — no machine ever
> judges content. **draft → approved is HUMAN-ONLY** (the founder).

## 1. Totals

| status | count |
|---|---|
| draft (this queue) | 0 |
| — CLEAN (passed every mechanical check) | 0 |
| — FLAGGED (at least one precise issue) | 0 |
| needs-review (separate pass — see §3) | 293 |
| approved | 796 |

Estimated total review time: **~1 min** (20s per clean, 120s per flagged), splittable per topic below.

## 2. How to review (the workflow)

1. Pick a topic batch below (sorted cleanest-first — fast wins first).
2. Read the full questions of the batch (options + key + explanation):
   `node tools/theory/review_batch.mjs show --topic <slug> --clean --out batch.md`
   then open `batch.md` in the editor (avoids console-encoding pain).
3. Collect the ids you approve into a list (file or arguments).
4. Approve them explicitly:
   `node tools/theory/review_batch.mjs approve q-... q-...` or `--from-file ids.txt`
   The script re-runs every mechanical check live, refuses non-draft ids,
   and refuses FLAGGED ids unless `--force`. It never approves in bulk
   without explicit ids — no `--all` exists, by design.
5. FLAGGED items: fix the issue by editing the question JSON (or decide the
   flag is a false positive), then approve with `--force` if the flag stands
   but you accept it knowingly.
6. After a batch: `cd platform && npm run validate:content`, then regenerate
   this report.

## 3. The ~290 flagged questions from PROGRESS §7 — cross-reference

The list EXISTS AS DATA: it is exactly the 293 questions with
`status: "needs-review"`. 288 of them carry the machine-visible markers
('?'-suffixed lawRef or a `[REVIEW: …]` note); the adversarial audits'
`flaggedLegal` tallies (`content/audits/*.audit.json`) account for 152 —
the rest were born needs-review at generation time per schema rule 2
(honest '?' article guesses). They are NOT part of this draft queue and
review_batch.mjs REFUSES to touch them: they are reviewed in the existing
dev-only admin UI at `/review` (approve / edit / reject, validated atomic
writes). Per-topic needs-review counts:

| topic | needs-review |
|---|---|
| osnovni-ponyatia | 13 |
| prevozno-sredstvo | 13 |
| patni-znatsi | 36 |
| signali-i-markirovka | 10 |
| predimstvo | 3 |
| krastovishta | 38 |
| skorost-i-distantsia | 17 |
| manevri-i-izprevarvane | 29 |
| uyazvimi-uchastnitsi | 18 |
| magistrali-i-izvangradsko | 3 |
| spirane-i-parkirane | 22 |
| nosht-i-uslozhneni-uslovia | 3 |
| alkohol-i-godnost | 21 |
| dokumenti-i-sanktsii | 28 |
| ptp-i-parva-pomosht | 33 |
| eko-i-zashtitno-shofirane | 6 |

## 4. Review batches per topic (cleanest share first)

### Основни понятия и задължения (`osnovni-ponyatia`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/osnovni-ponyatia.json`

### Автомобилът и подготовката за път (`prevozno-sredstvo`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/prevozno-sredstvo.json`

### Пътни знаци (`patni-znatsi`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/patni-znatsi.json`

### Светофари, маркировка и регулировчик (`signali-i-markirovka`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/signali-i-markirovka.json`

### Предимство (`predimstvo`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/predimstvo.json`

### Кръстовища, кръгови движения и жп прелези (`krastovishta`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/krastovishta.json`

### Скорост и дистанция (`skorost-i-distantsia`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/skorost-i-distantsia.json`

### Маневри, ленти и изпреварване (`manevri-i-izprevarvane`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/manevri-i-izprevarvane.json`

### Пешеходци и уязвими участници (`uyazvimi-uchastnitsi`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/uyazvimi-uchastnitsi.json`

### Магистрали и извънградски пътища (`magistrali-i-izvangradsko`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/magistrali-i-izvangradsko.json`

### Спиране, престой и паркиране (`spirane-i-parkirane`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/spirane-i-parkirane.json`

### Нощно шофиране и усложнени условия (`nosht-i-uslozhneni-uslovia`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/nosht-i-uslozhneni-uslovia.json`

### Алкохол, умора и годност за шофиране (`alkohol-i-godnost`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/alkohol-i-godnost.json`

### Документи, нарушения и санкции (`dokumenti-i-sanktsii`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/dokumenti-i-sanktsii.json`

### ПТП и първа помощ (`ptp-i-parva-pomosht`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/ptp-i-parva-pomosht.json`

### Икономично и защитно шофиране (`eko-i-zashtitno-shofirane`) — 0 clean · 0 flagged · ~1 min

File: `content/questions/eko-i-zashtitno-shofirane.json`

## 5. Answer-leak sweep (whole file, every status — H-1 / H-2)

Two ways a bank betrays its own answers to a student who never opened
a law book: the correct option keeps landing in the same slot, or it is
visibly the longest one. Both have already been hand-fixed once and
regenerated by the next content wave — hence a mechanical gate that
`platform/scripts/validate-content.mjs` also runs in CI, so a future
generation run reddens the build instead of shipping the leak.

Thresholds: blocking at p < 0.001, warning at p < 0.01,
no gate below 20 questions (chi-square needs ~5 expected per slot).

**Clean.** Every file (and the pooled bank) sits inside chance on both
statistics. Per-file numbers:

| file | singles | correct at (a…) | longest-correct | expected |
|---|---|---|---|---|
| `osnovni-ponyatia` | 40 | 10 / 10 / 10 / 10 | 10 (25.0%) | 22.5% |
| `prevozno-sredstvo` | 39 | 10 / 10 / 10 / 9 | 8 (20.5%) | 24.4% |
| `patni-znatsi` | 64 | 16 / 17 / 16 / 15 | 18 (28.1%) | 18.4% |
| `signali-i-markirovka` | 41 | 11 / 9 / 11 / 10 | 10 (24.4%) | 22.6% |
| `predimstvo` | 48 | 12 / 12 / 12 / 12 | 11 (22.9%) | 22.4% |
| `krastovishta` | 45 | 11 / 11 / 12 / 11 | 12 (26.7%) | 23.9% |
| `skorost-i-distantsia` | 43 | 11 / 12 / 11 / 9 | 7 (16.3%) | 20.3% |
| `manevri-i-izprevarvane` | 47 | 12 / 11 / 12 / 12 | 12 (25.5%) | 24.5% |
| `uyazvimi-uchastnitsi` | 47 | 12 / 13 / 12 / 10 | 12 (25.5%) | 21.8% |
| `magistrali-i-izvangradsko` | 44 | 11 / 12 / 11 / 10 | 11 (25.0%) | 22.2% |
| `spirane-i-parkirane` | 44 | 10 / 11 / 11 / 12 | 10 (22.7%) | 23.9% |
| `nosht-i-uslozhneni-uslovia` | 41 | 11 / 10 / 10 / 10 | 10 (24.4%) | 23.2% |
| `alkohol-i-godnost` | 39 | 10 / 10 / 10 / 9 | 9 (23.1%) | 22.4% |
| `dokumenti-i-sanktsii` | 37 | 8 / 12 / 9 / 8 | 9 (24.3%) | 25.0% |
| `ptp-i-parva-pomosht` | 40 | 10 / 11 / 10 / 9 | 12 (30.0%) | 24.4% |
| `eko-i-zashtitno-shofirane` | 39 | 10 / 10 / 10 / 9 | 7 (17.9%) | 21.2% |
| **whole bank** | 698 | 175 / 181 / 177 / 165 | 168 (24.1%) | 22.5% |

## 6. Duplicates and near-duplicates (whole bank — pairs, no judgment)

The audits show deliberate contrast pairs exist — the founder decides which
pairs are redundant and which are pedagogy. Exact pairs almost certainly
need one member rejected/rewritten by hand.

| question A | question B | similarity | note |
|---|---|---|---|
| `q-signs-022` (needs-review) | `q-predimstvo-009` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-signs-067` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-signs-068` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-signs-070` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-signs-071` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-signs-072` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-signs-074` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-signs-075` (needs-review) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-signs-078` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-signs-079` (needs-review) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-signs-080` (needs-review) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-signs-082` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-signs-084` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-signs-085` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-065` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-signs-068` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-signs-070` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-signs-071` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-signs-072` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-signs-074` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-signs-075` (needs-review) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-signs-078` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-signs-079` (needs-review) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-signs-080` (needs-review) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-signs-082` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-signs-084` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-signs-085` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-067` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-signs-070` (approved) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-signs-071` (approved) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-signs-072` (approved) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-signs-074` (approved) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-signs-075` (needs-review) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-signs-078` (approved) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-signs-079` (needs-review) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-signs-080` (needs-review) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-signs-082` (approved) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-signs-084` (approved) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-signs-085` (approved) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-068` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-signs-071` (approved) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-signs-072` (approved) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-signs-074` (approved) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-signs-075` (needs-review) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-signs-078` (approved) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-signs-079` (needs-review) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-signs-080` (needs-review) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-signs-082` (approved) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-signs-084` (approved) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-signs-085` (approved) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-070` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-signs-072` (approved) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-signs-074` (approved) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-signs-075` (needs-review) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-signs-078` (approved) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-signs-079` (needs-review) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-signs-080` (needs-review) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-signs-082` (approved) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-signs-084` (approved) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-signs-085` (approved) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-071` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-signs-074` (approved) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-signs-075` (needs-review) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-signs-078` (approved) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-signs-079` (needs-review) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-signs-080` (needs-review) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-signs-082` (approved) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-signs-084` (approved) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-signs-085` (approved) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-072` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-signs-075` (needs-review) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-signs-078` (approved) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-signs-079` (needs-review) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-signs-080` (needs-review) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-signs-082` (approved) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-signs-084` (approved) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-signs-085` (approved) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-074` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-075` (needs-review) | `q-signs-078` (approved) | EXACT | identical normalized text |
| `q-signs-075` (needs-review) | `q-signs-079` (needs-review) | EXACT | identical normalized text |
| `q-signs-075` (needs-review) | `q-signs-080` (needs-review) | EXACT | identical normalized text |
| `q-signs-075` (needs-review) | `q-signs-082` (approved) | EXACT | identical normalized text |
| `q-signs-075` (needs-review) | `q-signs-084` (approved) | EXACT | identical normalized text |
| `q-signs-075` (needs-review) | `q-signs-085` (approved) | EXACT | identical normalized text |
| `q-signs-075` (needs-review) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-075` (needs-review) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-075` (needs-review) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-075` (needs-review) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-075` (needs-review) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-075` (needs-review) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-075` (needs-review) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-078` (approved) | `q-signs-079` (needs-review) | EXACT | identical normalized text |
| `q-signs-078` (approved) | `q-signs-080` (needs-review) | EXACT | identical normalized text |
| `q-signs-078` (approved) | `q-signs-082` (approved) | EXACT | identical normalized text |
| `q-signs-078` (approved) | `q-signs-084` (approved) | EXACT | identical normalized text |
| `q-signs-078` (approved) | `q-signs-085` (approved) | EXACT | identical normalized text |
| `q-signs-078` (approved) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-078` (approved) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-078` (approved) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-078` (approved) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-078` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-078` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-078` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-079` (needs-review) | `q-signs-080` (needs-review) | EXACT | identical normalized text |
| `q-signs-079` (needs-review) | `q-signs-082` (approved) | EXACT | identical normalized text |
| `q-signs-079` (needs-review) | `q-signs-084` (approved) | EXACT | identical normalized text |
| `q-signs-079` (needs-review) | `q-signs-085` (approved) | EXACT | identical normalized text |
| `q-signs-079` (needs-review) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-079` (needs-review) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-079` (needs-review) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-079` (needs-review) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-079` (needs-review) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-079` (needs-review) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-079` (needs-review) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-080` (needs-review) | `q-signs-082` (approved) | EXACT | identical normalized text |
| `q-signs-080` (needs-review) | `q-signs-084` (approved) | EXACT | identical normalized text |
| `q-signs-080` (needs-review) | `q-signs-085` (approved) | EXACT | identical normalized text |
| `q-signs-080` (needs-review) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-080` (needs-review) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-080` (needs-review) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-080` (needs-review) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-080` (needs-review) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-080` (needs-review) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-080` (needs-review) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-082` (approved) | `q-signs-084` (approved) | EXACT | identical normalized text |
| `q-signs-082` (approved) | `q-signs-085` (approved) | EXACT | identical normalized text |
| `q-signs-082` (approved) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-082` (approved) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-082` (approved) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-082` (approved) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-082` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-082` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-082` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-084` (approved) | `q-signs-085` (approved) | EXACT | identical normalized text |
| `q-signs-084` (approved) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-084` (approved) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-084` (approved) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-084` (approved) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-084` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-084` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-084` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-085` (approved) | `q-predimstvo-070` (approved) | EXACT | identical normalized text |
| `q-signs-085` (approved) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-signs-085` (approved) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-signs-085` (approved) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-signs-085` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-signs-085` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-signs-085` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-predimstvo-070` (approved) | `q-krastovishta-067` (approved) | EXACT | identical normalized text |
| `q-predimstvo-070` (approved) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-predimstvo-070` (approved) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-predimstvo-070` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-predimstvo-070` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-predimstvo-070` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-krastovishta-067` (approved) | `q-krastovishta-069` (needs-review) | EXACT | identical normalized text |
| `q-krastovishta-067` (approved) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-krastovishta-067` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-krastovishta-067` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-krastovishta-067` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-krastovishta-069` (needs-review) | `q-uyazvimi-071` (approved) | EXACT | identical normalized text |
| `q-krastovishta-069` (needs-review) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-krastovishta-069` (needs-review) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-krastovishta-069` (needs-review) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-speed-037` (approved) | `q-eco-063` (approved) | EXACT | identical normalized text |
| `q-uyazvimi-071` (approved) | `q-magistrali-i-izvangradsko-068` (approved) | EXACT | identical normalized text |
| `q-uyazvimi-071` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-uyazvimi-071` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-magistrali-i-izvangradsko-068` (approved) | `q-spirane-i-parkirane-068` (approved) | EXACT | identical normalized text |
| `q-magistrali-i-izvangradsko-068` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-spirane-i-parkirane-068` (approved) | `q-spirane-i-parkirane-069` (needs-review) | EXACT | identical normalized text |
| `q-speed-037` (approved) | `q-magistrali-i-izvangradsko-016` (approved) | 89% | near-duplicate wording |
| `q-magistrali-i-izvangradsko-016` (approved) | `q-eco-063` (approved) | 89% | near-duplicate wording |
| `q-uyazvimi-033` (approved) | `q-uyazvimi-057` (approved) | 85% | near-duplicate wording |
| `q-signali-i-markirovka-037` (approved) | `q-signali-i-markirovka-059` (needs-review) | 83% | near-duplicate wording |
| `q-signs-034` (approved) | `q-speed-040` (approved) | 80% | near-duplicate wording |
| `q-krastovishta-006` (needs-review) | `q-krastovishta-024` (needs-review) | 79% | near-duplicate wording |
| `q-speed-041` (approved) | `q-speed-064` (approved) | 78% | near-duplicate wording |
| `q-uyazvimi-012` (approved) | `q-uyazvimi-064` (approved) | 78% | near-duplicate wording |
| `q-spirane-i-parkirane-034` (approved) | `q-spirane-i-parkirane-052` (approved) | 77% | near-duplicate wording |
| `q-spirane-i-parkirane-018` (approved) | `q-spirane-i-parkirane-052` (approved) | 75% | near-duplicate wording |
| `q-signali-i-markirovka-005` (needs-review) | `q-signali-i-markirovka-045` (approved) | 72% | near-duplicate wording |

## 7. Appendix — mild length-tell (info only, never blocks)

Correct option noticeably longer than distractors, below the flag threshold.
Worth a glance while reviewing, not worth blocking on:

None.
