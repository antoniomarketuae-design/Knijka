# Market Research: Existing Educational Driving Simulators

> Agent 1 recon for the Prototype → Alpha reconstruction of the Книжка.AI simulator.
> Researched 2026-07-10 via web sources (Steam pages, review aggregators, developer sites, academic literature).
> Companion docs: `docs/simulation/66_SIMULATOR_UPGRADE_PLAN.md`, `67_HERO_VEHICLE_SPEC.md`, `65_SCENARIO_BASED_LEARNING_ENGINE.md`.

---

## 1. Executive summary

The educational driving-sim market splits into four tiers:

| Tier | Examples | Price point | What they prove |
|---|---|---|---|
| **Consumer PC "learn-to-drive" sims** | City Car Driving 1.x / 2.0, 3D Fahrschule, Virtual Driving School | €20–30 one-time | There is a durable paying audience (35k+ Steam reviews for CCD 1.x) for *strict-rules* driving practice; realism of **procedure** (seatbelt→ignition→handbrake→clutch) is the differentiator, not graphics |
| **Mobile driving-school games** | Ovilex Driving School series, BoomBit Car Driving School Simulator, Games2win Driving Academy | F2P/ads or ~$12 | Huge teen reach, but rule enforcement is unreliable and content is gamified shallowly; nobody owns the "actually pass your national exam" niche on mobile |
| **Professional school software** | Carnetsoft (NL), Green Dino (NL), ST Software (NL), City Car Driving Enterprise (RU) | ~€2–10k software | A validated lesson architecture exists: short skill-drill lessons → hazard-perception modules → measured assessment; Green Dino's AI virtual instructor has peer-reviewed effectiveness data |
| **Professional hardware simulators** | ECA Faros/Exail EF-Car (FR), Virage VS500M (CA), Tecknotrove/Zen (IN) | $30k–100k+ cockpits | Government-approved curricula substitute for real in-car hours; real automotive parts + motion are their moat — irrelevant to us except for curriculum structure |

**The single most important reference product is City Car Driving (ex-«3Д Инструктор» by Forward Development)** — it is exactly what the founder points to, it validated the market (83/100 aggregate on 35,592 Steam reviews), and its strengths/weaknesses map 1:1 onto our Alpha decisions.

**Biggest whitespace found:** nobody combines (a) national-exam-specific curriculum with citations to law, (b) an AI tutor that explains *why*, and (c) browser/mobile delivery. Every product either enforces rules without teaching (CCD), teaches without enforcing (mobile games), or costs €30k (pro sims). Our teach-first-then-grade coach + scenario engine is genuinely differentiated **if the vehicle-operation layer reaches CCD's procedural baseline** (interactive ignition/clutch/handbrake — the founder's exact complaint).

---

## 2. Deep dives — consumer PC sims

### 2.1 City Car Driving 1.x (Forward Development; originally «3D Инструктор», Russia)

The genre benchmark. English rebrand of 3D Instructor 2.x, on Steam since 2016. **€23.49**, "Mostly Positive" — 73% of 6,511 English reviews; 83/100 across 35,592 total reviews on Steambase. Also sold as **City Car Driving Enterprise Edition** to real driving schools with hardware rigs (autotrenajer.ru) — the same core sim is a certified school trainer in RU/CIS, which validates the "one engine, consumer + school" model we're pursuing.

**Driving mechanics realism (its moat):**
- Full pre-drive procedure enforced in-sim: **fasten seatbelt → start engine → release handbrake → select gear**; forgetting any step produces instructor warnings/penalties. This is precisely what our lesson 1 checklist lacks (ours is answered, not performed).
- Manual transmission with **true clutch simulation and stalling** (optional "automatic clutch" assist toggle). Stall-recovery is itself a training moment; forum threads show users wrestling with clutch bite point — i.e., the sim is teaching a real skill.
- Turn signals, headlights, wipers, hazards all functional and *graded* (missing indicator on a U-turn = 3 penalty points).
- Mirror checks expected before lane changes; head-look left/right/back from driver seat; TrackIR/VR (SteamVR, Rift, Vive) supported.
- Fuel consumption, visible collision damage (cosmetic — "your car keeps going", a noted weakness).

**Instructor system:** Voice instructor gives route directions and error callouts ("you exceeded the speed limit", "fasten your seatbelt"). Criticized as sparse, robotic, poorly mixed (players report not hearing it); no explanations of *why* a rule exists — pure violation announcer. **This is the #1 area we can beat with the AI coach.**

**Rules engine & penalties:** Road-rules control system with graduated penalties (speeding tiered from warning at 1–5 km/h over to max fine at 71+ km/h over); violations logged to player profile. Supports **country rule-sets** (EU, Germany, Russia, USA, Canada, Australia) and right/left-hand traffic — proof that parameterizing a rule engine by jurisdiction is a real product feature, not over-engineering.

**Lesson structure:** Three pillars — (1) **autodrome exercises** (standard + automated-exam layouts: zig-zag, parallel parking, reverse bay, hill start — mirroring the Russian exam площадка), (2) **guided city routes** with instructor tasks, (3) **free drive** with configurable traffic density/weather/time. Career progression gates on passing exercises; a "city track test" is a notorious difficulty spike that blocks progression (community complains). Counter-accident (skid/emergency) courses included. **Recording/playback for error analysis** — replay of your mistakes, an under-appreciated feature we should steal for the debrief layer.

**Environment:** One fictional city, no loading screens; streets/signs/markings placed *strictly per traffic regulations* — the store page sells this as a core feature ("every traffic light, sign and road marking placed strictly according to traffic regulations"). Smart traffic AI with variable driver personalities, pedestrians, emergency vehicles; weather + time of day.

**What players love (review mining):** the strict rules ("it actually teaches you the road rules"), the pre-drive procedure, manual/clutch realism, using it as a **companion while taking real lessons**, wheel + VR support. Recurring review archetype: *"helped me pass my real driving test / practice before lessons."*

**What players hate:** dated visuals and few in-game sounds; robotic sparse instructor voice; **penalties that feel unfair or opaque** (5 points for a reasonable lane change; whole exam failed for missing a turn); difficulty walls in career; weak damage model; no police interaction; clunky menus/mod install; RU-centric content.

### 2.2 City Car Driving 2.0 (Forward Development, Early Access — full Steam release June 2026)

€29.99, **Mixed (61–62% of ~910 reviews)**. UE-based visual overhaul; 6–8h of content at EA launch. Career = task chains (zig-zag → reverse parking etc.) with 3-star ratings across difficulty tiers; economy/vehicle-unlock meta ("every new vehicle feels earned because the game constantly evaluates your behavior"). **Driving-school mode is still on the roadmap, not shipped** — they launched free-drive + career first and got punished in reviews for it.

Review themes (VaporLens): **Liked** — graphics (29), realistic simulation incl. interactive seatbelt/handbrake/signals (25), improvement over original (46), EA goodwill (21). **Disliked** — performance/stutter even on high-end (57+), broken traffic AI that stalls/teleports/rear-ends you (28), poor steering-wheel support (31), price (25), missing FOV adjustment in cabin (23), **fines/exams too strict and sensitive — small speed overshoot triggers fines; many ask for a leniency slider**.

**Lessons for us:** (1) Shipping the sandbox before the school alienated their core learner audience — our education-first order is right. (2) Strictness needs *graduated, explained* enforcement or it reads as unfair — our опасна/основна/второстепенна taxonomy plus coach explanations is the fix. (3) Traffic-AI jank destroys trust in a rules-teaching product faster than bad graphics. (4) Mid-range performance is a make-or-break review theme even on desktop — vindicates ADR-005's mid-range-phone budget discipline.

### 2.3 3D Fahrschule / 3D Driving School (Besier 3D-Edutainment, Germany, 2003–2010s)

Historic European "driving school at home" product. **Six selectable virtual instructors speaking EN/FR/DE/NL**; 23 structured exercises; real cities (Berlin, London, Madrid-at-night) + multi-country motorway; **per-country road rules**; five car cockpits + motorbikes/quads. Proof that (a) localized-instructor-voice-per-language was viable 20 years ago, (b) country-specific rules content is a selling point in Europe. Effectively dead today — the European seat is vacant.

### 2.4 Virtual Driving School (CGA Simulation, Steam, €19.99)

The closest recent attempt at "lesson-first" on PC — and a cautionary tale: **Mostly Negative, 34% of 26 reviews**. Good ideas: 30+ **micro-lessons (1–3 min)** on gears/clutch/roundabouts/parking, hill starts, knowledge **quizzes embedded during routes**, LHD/RHD, VR + wheel support, explicitly positioned as "supplement to real-world instruction". It failed on execution quality (physics/content), not concept. Micro-lesson granularity + in-route quizzes are directly stealable for our scenario engine.

---

## 3. Deep dives — mobile / casual tier

### 3.1 Ovilex "Driving School" series (2016, 2017, Classics, Sim, EVO; RO studio, mobile + Steam + Switch)

Tens of millions of installs. 50–150 licensed real cars, 80–100+ levels across cities/highways/mountains, **manual transmission with clutch + stick UI on touch**, exams that require stopping at reds, signaling, yielding to pedestrians. Mini-map + arrow guidance; cockpit or chase cam. Monetization: F2P + ads/IAP (mobile), paid on Steam. Reviews: praised for accessibility and gearbox novelty; criticized for **unrealistic physics, broken collisions, rule detection errors** and grind. It's a game wearing a school uniform — no explanation layer, no real curriculum, no national-exam mapping.

### 3.2 Car Driving School Simulator (BoomBit; mobile since 2016, Steam/Switch Sept 2025, $11.99)

~100 lesson-missions (park, drive in bad weather, A→B safely) + free-drive with points for safe driving; medal/credit economy; 28 cars, 8 world locales. Metacritic/press: **2.5/5-ish — "more frustrating than helpful"**: unreliable turn-signal detection penalizes correct behavior, wonky hit detection, "laughably bad" NPC pathfinding causing pile-ups that soft-lock missions, stiff/loose steering calibration. Confirms: **a rules-grading sim lives or dies on detector precision — false positives are lethal to trust.** Our detector QA bar (PROGRESS.md) must include false-positive tests, not just miss tests.

### 3.3 Driving Academy (Games2win, mobile)

200 levels, 90 vehicles, 50 road-sign teaching moments, license-test levels, career + challenges; heavy customization/coins loop. Pure gamification of the license fantasy; zero legal grounding. Its scale shows the **teen appetite for "get your license" as a game premise** — our exact demographic hook.

### 3.4 CarX and other racing titles

No meaningful driving-school modes found (CarX products are drift/street racing). Racing sims (Assetto, BeamNG) are physics benchmarks, not educational competitors. Not pursued further.

---

## 4. Deep dives — professional driver-training systems

### 4.1 Green Dino (NL) — the effectiveness gold standard

Simulators in Dutch driving schools since 2003; **300,000+ students started training on them**. Contains a **Virtual Driving Instructor (VDI)** — AI-driven instruction and assessment. Published outcomes (validated with TU Delft):
- Simulator training with AI instruction **replaces 12.4% of on-road lessons** and **increases pass rate by +25.5%**.
- **64% decrease in crashes in the first 12 months post-license** (32% below Dutch average) for sim+road students.
- Hazard-perception module credited with **+34% first-time pass rate**.

These are the numbers to cite in our pitch and the pedagogy to emulate: *scripted scenario injection + automated per-skill assessment + instructor dashboard*. Dutch scenario research (INTETAIN 2005, "Bringing Hollywood to the driving school") pioneered **dynamic scenario generation around the learner** — the academic ancestor of our scenario engine.

### 4.2 Carnetsoft (NL, software-only, ~low-thousands €)

Closest structural analogue to our curriculum. **16 vehicle-control lessons**: start/stop engine, drive off & stop, two steering techniques, gear changing, lane change, overtaking, reversing, parallel + bay parking. Plus **5 safety-awareness lessons**: brake-reaction-time measurement, braking distance, eco-driving, alcohol-impairment simulation, texting-distraction awareness. 3-monitor 210° rendering; sells to schools *and* universities (research variant). Lesson taxonomy = a ready-made checklist for our Alpha lesson tree.

### 4.3 ECA Faros / Exail EF-Car (FR)

50+ simulated vehicles, real automotive cockpit parts, manual+automatic, **integrated pedagogic content approved by the French transport department**; named modules: initial & advanced curriculum chapters, **night driving**, **emergency braking with reaction-time analysis**, **risk observation** (hazard anticipation). Used by driving schools, army, government. Takeaway: regulator-approved module framing (night / emergency / risk-observation as named products) is a credibility pattern we can mirror with the Bulgarian exam taxonomy.

### 4.4 Virage Simulation VS500M (CA)

Real GM cockpit, three 55" displays (180°), blind-zone side screens, 3-axis motion, 5.1 audio with Doppler; manual/auto conversion kit. **Curriculum approved by government authorities as replacement for part of in-car driving-school hours** (Québec). Lessons run with or without an instructor; objective evaluation reports. Price: quote-only (industry ballpark $50k+).

### 4.5 India tier (Tecknotrove, Zen, Hindustan; "Edserv" not found as a sim vendor)

MORTH-compliant training sims: real controls, configurable environments, weather, **instructor fault-injection** (tire blowout, child runs into road), automatic real-time evaluation with per-driver violation reports. Notable pattern: **instructor console that injects hazards live** — our scenario engine is the automated version of this.

---

## 5. Bulgarian market context (directly relevant)

Bulgarian driving schools already market simulator access as a differentiator:
- **Автошкола Паунов** (Stara Zagora/Plovdiv): full-size Category-B simulator with real controls, free for enrolled students; markets it as confidence-building before first real drive (basic exercises: потегляне, спиране, обекти).
- **Автошкола Силви Инс** (Varna): bonus simulator hours; **night/rain/snow/ice scenarios** as the advertised value (conditions you can't schedule in real lessons).
- **Автошкола КАЛИ**: simulator trainer + online course registration.
- EduLab.bg sells the **XV-CH01** school simulator built from original VW parts (steering, gears, wipers, pedals, handbrake, belt, real dashboard).

Implication: the concept "тренажор преди първото каране" is already culturally legitimate in Bulgaria — we are not educating the market from zero. Our browser sim competes on access (every student, at home, free of hardware) versus one physical rig per school. Also a future B2B2C channel: schools embedding Книжка.AI as their "sim hours".

---

## 6. Cross-product synthesis: what students LOVE and HATE

**LOVE (recurring across CCD, Ovilex, pro sims):**
1. Performing the real pre-drive ritual (belt, ignition, handbrake, gear) — feels like *driving*, not gaming.
2. Manual gearbox + clutch with stalling — the scariest real-world skill, safely practicable.
3. Strict-but-fair rules grading — "it actually teaches the rules" is the top positive review theme for CCD.
4. Companion-to-real-lessons framing — students use sims *between* real lessons; reviews brag about passing the real exam.
5. Practicing conditions you can't book: night, rain, snow, ice, emergency braking.
6. Replay/error analysis after the drive.
7. Wheel/pedal support as an upgrade path (not a requirement).

**HATE (ranked by frequency/severity):**
1. **False-positive penalties** — punished while behaving correctly (BoomBit signals, CCD lane changes). Kills trust instantly.
2. **Opaque, unexplained penalties** — points deducted with no *why* (CCD 3 points for U-turn indicator; CCD 2.0 fine for 2 km/h overshoot). Players ask for leniency sliders; what they actually need is explanation.
3. **Dumb traffic AI** — NPCs breaking the very rules the sim grades you on (CCD 2.0, BoomBit) reads as hypocrisy.
4. Performance jank (stutter) — top complaint on CCD 2.0 despite better graphics.
5. Difficulty cliffs blocking progression (CCD city track test) with no remedial path.
6. Robotic, sparse instructor voice with no personality or teaching.
7. Placeholder-looking environments (BoomBit "PS1-esque") — visuals below a floor threshold undermine perceived legitimacy even in an educational product.

---

## 7. Evidence on training effectiveness (for pitch + pedagogy)

- Systematic review (MDPI Appl. Sci. 2023): simulators improved driving performance in **93.3% of studies**, strongest for novice drivers; evidence quality varies.
- 2024 systematic review (J. Safety Research): real-world transfer for young drivers is promising but under-evidenced; consensus recommendation — **simulator as supplement, not replacement**, embedded in a driver-ed program (exactly our positioning; also legally required in BG anyway).
- Hazard-perception training is the most consistently transferable skill (Green Dino +34% first-time pass; simulator-trained students show better hazard perception at semester end).
- Repeated-collision/near-miss exposure counteracts novice overconfidence, especially in young males — supports scenario-engine events that *demonstrate consequences* rather than only penalize.

---

## 8. Feature matrix (Alpha-relevant dimensions)

| Feature | CCD 1.x | CCD 2.0 | 3D Fahrschule | Ovilex DS | BoomBit CDSS | Virtual DS | Carnetsoft | Green Dino | Книжка.AI today |
|---|---|---|---|---|---|---|---|---|---|
| Interactive ignition sequence (belt/engine/handbrake) | ✅ graded | ✅ | ✅ | partial | ❌ | ✅ | ✅ | ✅ | ❌ **(gap)** |
| Manual clutch + stalling | ✅ | ✅ | ✅ | ✅ (touch) | ❌ | ✅ | ✅ | ✅ | ❌ **(gap)** |
| Mirror/blind-spot mechanics | ✅ expected+graded | ✅ | partial | ❌ | ❌ | partial | ✅ | ✅ | partial |
| Voice instructor / callouts | ✅ (weak) | ✅ | ✅ 6 voices, 4 langs | ❌ | ❌ | ❌ | ✅ | ✅ AI VDI | coach layer (text) |
| Explains WHY (law citation) | ❌ | ❌ | ❌ | ❌ | ❌ | quiz only | partial | partial | ✅ **(our moat)** |
| Graduated penalty taxonomy | ✅ points | ✅ fines | ✅ | shallow | broken | shallow | ✅ | ✅ | ✅ (exam taxonomy) |
| National-exam-specific format | RU only | RU only | DE-era | ❌ | ❌ | ❌ | NL | NL | ✅ BG **(our moat)** |
| Micro-lessons (1–3 min) | ❌ | ❌ | ✅ 23 ex. | levels | missions | ✅ 30+ | ✅ 16+5 | ✅ | scenario engine (45 events) |
| Replay/debrief of errors | ✅ | ? | ❌ | ❌ | ❌ | ❌ | ✅ reports | ✅ reports | planned (LLM debrief) |
| Hazard-perception module | skid course | ❌ | ❌ | ❌ | ❌ | live hazards | ✅ 5 lessons | ✅ (+34% pass) | via scenarios |
| Runs on mid-range phone | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ target **(our moat)** |
| Price | €23.49 | €29.99 EA | dead | F2P | $11.99 | €19.99 | €k's B2B | €k's B2B | TBD one-time |

---

## 9. Recommendations for the Alpha reconstruction

1. **Match CCD's procedural floor before anything else.** Interactive seatbelt → mirror adjust → ignition → handbrake → gear → clutch (with stalling) is the genre's table-stakes definition of "educational sim". The lesson-1 checklist must be *performed*, not answered. This is also the founder's own top complaint — full alignment.
2. **Beat CCD on the instructor, not on graphics.** Every graded event should carry: what happened → which rule (with `lawRefs` citation) → what to do instead → severity class (опасна/основна/второстепенна). No competitor explains *why*. Voice (BG TTS) is a strong later add — 3D Fahrschule shipped multilingual instructor voices in 2003.
3. **Detector precision is existential.** BoomBit died by false positives; CCD 2.0 is bleeding reviews over hair-trigger fines. Adopt: tolerance bands (e.g., speed grace margin), a "warn once, grade on repeat" policy for второстепенни errors during teach-phase, and a false-positive regression suite per detector.
4. **Traffic AI must obey the rules we grade.** An NPC running the red we just penalized destroys legitimacy. Prefer *fewer, scripted, rule-abiding* ambient agents (scenario-driven) over dense broken traffic — cheaper on mobile GPU too.
5. **Structure content as micro-lessons + scenario injection + replayable debrief:** Carnetsoft's 16+5 lesson list is a proven skeleton; Green Dino proves hazard-perception drills move the pass rate (+34%); CCD's replay is the model for our LLM debrief input.
6. **No difficulty cliffs:** failed exercise → remedial micro-drill, never a hard progression wall (CCD's most-complained career flaw).
7. **Sell the conditions you can't book:** night/rain/ice/emergency-brake scenarios are what Bulgarian schools themselves advertise their rigs with — cheap wins on differentiation and on the "safer drivers" north star.
8. **Positioning language:** "companion to your real lessons / тренажор преди първото каране" — matches both the literature (supplement, not replacement) and existing BG school culture; avoids overclaiming (no certificates, ADR-003).
9. **Visual floor, not visual ceiling:** reviews tolerate modest graphics if geometry/roads read as real (CCD 1.x) but punish placeholder-look (BoomBit). Fixing road widths (founder complaint) matters more than asset beauty.
10. **B2B2C option later:** CCD Enterprise and the BG schools with rigs show a path — license Книжка.AI to автошколи as their "simulator hours" once B2C proves the pedagogy.

---

## Sources

- Steam: [City Car Driving](https://store.steampowered.com/app/493490/City_Car_Driving/) · [City Car Driving 2.0](https://store.steampowered.com/app/2327720/City_Car_Driving_20/) · [Car Driving School Simulator](https://store.steampowered.com/app/3563700/Car_Driving_School_Simulator/) · [Virtual Driving School](https://store.steampowered.com/app/1515220/Virtual_Driving_School/) · [Driving School Simulator (Ovilex)](https://store.steampowered.com/app/273730/Driving_School_Simulator/)
- Reviews/aggregators: [Steambase CCD](https://steambase.io/games/city-car-driving/reviews) · [VaporLens CCD 2.0](https://vaporlens.app/app/2327720/city_car_driving_2_0) · [Dad's Gaming Addiction CCD review](http://www.dadsgamingaddiction.com/city-car-driving/) · [BossRush CDSS review](https://bossrush.net/2026/03/15/game-review-car-driving-school-simulator/) · [autoevolution CDSS](https://www.autoevolution.com/news/car-driving-school-simulator-review-pc-we-have-gta-vi-at-home-257996.html) · [treeshateyou CCD 2.0](https://treeshateyou.com/games/city-car-driving-2-0) · [ixbt.games CCD 2.0 mixed reviews](https://ixbt.games/en/news/2026/06/21/rossiiskii-avtosim-city-car-driving-20-polucil-smesannye-otzyvy-v-steam-razrabotciki-otreagirovali-na-kritiku.html)
- Steam community threads: [CCD instructor voice](https://steamcommunity.com/app/493490/discussions/0/1368380934287158196/) · [CCD city track test difficulty](https://steamcommunity.com/app/493490/discussions/0/1738848358536033526/)
- Professional: [Carnetsoft](https://cs-driving-simulator.com/) · [Green Dino](https://en.greendino.nl/) · [Green Dino effectiveness](https://en.greendino.nl/newsreader/what-does-a-driving-simulator-add-to-your-driving-school) · [Intelligent Instructor on Green Dino](https://www.intelligentinstructor.co.uk/feature/green-dino/) · [ST Software](https://www.stsoftware.nl/) · [Exail/ECA EF-Car](https://www.ecagroup.com/en/solutions/ef-car-driving-simulator) · [Virage VS500M](https://viragesimulation.com/vs500m-car-simulator-training-and-research/) · [Tecknotrove](https://tecknotrove.com/industries/automobile/car-driving-simulator/) · [Forward Development autoschool software](https://autotrenajer.ru/programms-autoschool/)
- Mobile: [Ovilex](https://www.ovilex.com/projects/driving-school-simulator/) · [BoomBit CDSS](https://boombit.com/games/car-driving-school-simulator-en/) · [Games2win Driving Academy 2](https://play.google.com/store/apps/details?id=com.games2win.drivingacademy2&hl=en_US)
- 3D Fahrschule: [Informer archive](https://3d-fahrschule-2.informer.com/) · [PCGamingWiki 3D Instructor](https://www.pcgamingwiki.com/wiki/3D_Instructor)
- Bulgaria: [Автошкола Паунов симулатор](http://www.paunov.com/безплатно-обучение-с-автосимулатор/) · [Силви Инс симулатор](https://silviins.bg/obuchenie-sas-simulator/) · [EduLab XV-CH01](https://edulab.bg/avto-simulator/)
- Research: [MDPI 2023 systematic review](https://www.mdpi.com/2076-3417/13/9/5266) · [J. Safety Research 2024 review](https://www.sciencedirect.com/science/article/pii/S0022437524000975) · [Efficacy review (young/learner drivers)](https://www.sciencedirect.com/science/article/abs/pii/S1369847818304406) · [Dynamic scenario generation, INTETAIN 2005](https://scispace.com/pdf/bringing-hollywood-to-the-driving-school-dynamic-scenario-2307p4nl3m.pdf)
