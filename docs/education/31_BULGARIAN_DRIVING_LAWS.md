# Bulgarian Driving Laws & Training Regulations

> Status: v1.0 — 2026-07-07, from dedicated research on official sources (Наредба texts parsed in full; URLs inline). Items marked **[UNVERIFIED]** need confirmation before being hard-coded. This doc feeds the content pipeline (61) and the AI Law Expert grounding corpus.

## Legislative Map (verified current, July 2026)

| Act | Scope | Status |
|---|---|---|
| **ЗДвП** (Закон за движението по пътищата, 1999) | Core traffic law; categories чл. 150а; ages чл. 151 | Latest major amendment ДВ бр. 64/05.08.2025, in force 07.09.2025 (average-speed enforcement, e-scooter/pedestrian/cyclist rules) — [consolidated PDF](https://rta.government.bg/upload/9167/zdvp.pdf) |
| **Наредба № 37** от 02.08.2002 | Training of candidate drivers | Amended through ДВ бр. 77/10.09.2024, in force 12.12.2024 — [official PDF](https://rta.government.bg/upload/642/n37.pdf) |
| **Наредба № 38** от 16.04.2004 | Examinations | Amended through ДВ бр. 77/10.09.2024 — [official PDF](https://rta.government.bg/upload/9175/n38.pdf) |
| **Наредба № РД-02-21-1** от 23.11.2023 (МРРБ) | Road signs/signalization — appears to supersede Наредба № 18/2001 | Repeal relationship **[UNVERIFIED — confirm before building sign catalog]** — [mrrb.bg](https://www.mrrb.bg/bg/naredba-rd-02-21-1-ot-23-11-2023-g-za-signalizaciya-na-putistata-s-putni-znaci/) |

### Pending 2026 drafts — TRACK THESE (content must update when adopted)
- **НИД Наредба № 37** (consultation closed 04.04.2026): fully electronic training records with geolocation, **mandatory night-driving hours**, training expires after 2 years — [strategy.bg/12192](https://www.strategy.bg/bg/public-consultations/12192)
- **НИД Наредба № 38** (consultation closed 21.05.2026): recordings kept 24 months, explicit termination grounds, **new penalty points for not yielding to pedestrians**; B theory format unchanged — [strategy.bg/12308](https://www.strategy.bg/bg/public-consultations/12308)

## Category B Training Requirements

- **Theory: 40 учебни часа** (45 min; max 6/day). **Practice: 31 учебни часа** (50 min; max 2/day). Set in the единна учебна документация under чл. 153, т. 1 ЗДвП.
- **Age:** 18 (ЗДвП чл. 151); training may start 3 months before 18 (1 year before for state secondary-school driving programs). **No accompanied-driving-at-17 scheme exists.** → Product note: our 17-year-old target users are in the "training window" — perfect timing for prep.
- Schools operate under разрешение per Наредба № 37; ИААА licenses schools and runs all state exams. Since 12.12.2024: e-картон, no internal school exams, 4 exam attempts within 6 months of finishing theory training, else theory training repeats.

## Simulator Hours — Legal Status

- **Not creditable in Bulgaria.** Neither наредба mentions simulators (full-text verified). A 2019 working group proposed counting up to 4 of the 31 hours on simulators — **rejected**; voluntary use allowed, hours don't count ([dnes.bg](https://www.dnes.bg/a/58-obshtestvo/416186-obuchenie-na-simulator-za-kandidat-shofyori-po-zhelanie), [sars.gov.bg](https://www.sars.gov.bg/)). The pending 2026 draft does not change this.
- **EU precedents for future advocacy:** France allows **10 of 20** practical hours on simulator since 2019 ([Légifrance](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000038930611)); Netherlands has no mandated minimum (schools substitute freely; TU Delft study of 23,000 candidates: sim-trained students pass ~34% more often); Germany reform reportedly in progress **[UNVERIFIED]**.
- **Product positioning:** the sim is exam-prep and confidence-building, NOT replacement of кормуване hours. The door was cracked once (2019) — with efficacy data and the French precedent, reopening it is a realistic long-term play.

## Road Signs

- Official sign designs are annexes to normative acts; under **ЗАПСП чл. 4, т. 1** normative acts are excluded from copyright — reproducing official sign designs is low-risk (interpretation, not case-tested **[UNVERIFIED]**). Standard practice among BG exam-prep sites is redrawing as SVG — we do the same (fits the tech plan: generated SVG sign faces).

## Open Legal Items (carried in risk register)

1. Confirm Наредба № 18 (2001) vs РД-02-21-1 (2023) supersession before sign catalog build.
2. Written ИААА position on commercial reuse of the official exam-question масив (see doc 32 — the single biggest content dependency).
3. Verify post-ДВ-77/2024 consolidated Наредба № 38 чл. 39 text + the 10.12.2024 Методика before hard-coding exam scoring.
