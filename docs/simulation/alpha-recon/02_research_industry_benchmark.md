# 02 — Industry-Wide Benchmark: Driver-Training Simulation (Agent 2)

> **Lane:** the broader industry + evidence base (driving-school software, academic transfer/fidelity research, instructor sentiment, browser-3D state of the art, regulation). Complements Agent 1's Steam-title deep dives.
> **Date:** 2026-07-10 · **Method:** web research (search + source fetch), ~20 query rounds across EN/FR/DE/BG/FI sources.

---

## 1. Executive summary

The global driver-training-simulation industry has converged on a clear pattern: **the products that demonstrably work are not the ones with the best graphics — they are the ones with the best *pedagogy engine*** (scenario density, immediate structured feedback, hazard-anticipation drills, official-exam-aligned scoring, and a virtual-instructor layer). The academic evidence is lopsided: transfer of *vehicle-handling* skill from sims to road is weak/unproven, while transfer of *cognitive* skill — hazard perception, visual scanning, procedure knowledge — is strong, durable, and in the UK's case measured at national scale (~11% crash reduction). Regulators in France, Finland, the Netherlands and Norway already credit simulator instruction toward licensing; the US FMCSA explicitly does not (for CDL behind-the-wheel). For a browser-first product on mid-range phones, this is close to the best possible news: **everything the evidence says matters is cheap to render; everything expensive to render is educationally marginal.**

---

## 2. Landscape A — Driving-school software & theory+sim products

### 2.1 Dedicated driving-school simulator vendors (EU)

| Vendor | Country | What they ship | Benchmark-relevant facts |
|---|---|---|---|
| **Green Dino** | NL | Fixed-base sim + 34-lesson curriculum + virtual instructor "Victor" | Curriculum = thirty-four 30-min lessons (vehicle handling → intersections → highway → manoeuvring), built to follow the **CBR official Category-B driving procedure**. Adaptive virtual instructor gives automated performance feedback. Marketing claims: 1 sim hour ≈ 2 road hours; **64% reduction in driving incidents in first 12 months post-license** (self-reported feedback study). Used across Dutch driving schools 2008–2015 on 4 hardware types running *identical software* — the software is the product, hardware is a shell. |
| **Carnetsoft / ST Software** | NL | PC software-only research + training sim (~3 monitors) | Sells *software licenses*, not rigs — proof the value concentrates in scenario/scoring code. |
| **ECA Faros** | FR | EF-X etc., standard equipment in French auto-écoles | 200 km road network, 120° visual angle, OEM cockpit parts. The de-facto hardware standard behind France's 10h-simulator regulation. |
| **Develter** | FR | "Car Evolution" sims for auto-écoles | Differentiators they advertise: **AI-managed traffic with coherent behaviors** and **instructor-triggered critical events in real time** (emergency braking, complex intersections) — i.e., a scenario-injection console, not prettier graphics. |
| **Vogel (Fahren Lernen Max)** | DE | Market-leading theory platform + sim integration + DriversCam | The German benchmark stack: official TÜV/DEKRA question bank in 12 languages, **360° real-video hazard clips filmed on local exam routes**, student logs into the driving-school simulator with the same account (QR), instructor dashboard tracks theory+practice weaknesses in one place. **Theory↔sim↔instructor data loop is the product.** |
| **Nervtech** | SI (Balkan!) | Motion-based sim, driver assessment analytics | Closest Balkan player; positioned at assessment/analytics, premium hardware — not a consumer web product. No Bulgarian consumer sim product found at all. |
| **Way AS + Virtur + NTNU** | NO | Norway's only simulator-based driving school, AI virtual instructor | See §3.4 — the strongest real-world validation of an AI instructor layer. |
| **Virage, Tecknotrove, Virtual Driver Interactive, SimuRide, Acron/L3** | CA/IN/US | Fleet/CDL/school rigs, $9,900–$150,000+ | Confirms price floor of hardware sims — a browser product competes on a cost axis these vendors cannot reach. |

### 2.2 Web/app "theory + something" products

- **Drive iQ (a2om, UK)** — free online platform running novice drivers through **filmed/virtual hazardous-scenario modules**; evidence-based positioning, endorsed by Road Safety GB/PSHE; used by **40,000+ students in ~500 schools**, Cranfield University running a staged evaluation. Proof that *hazard-scenario e-learning* (no physics sim at all) is a viable, school-adopted category.
- **UK hazard-perception prep market** (Theory Test Pro, Jellylearn, theorytest.org.uk, etc.) — an entire product category exists solely because the licensing exam contains a hazard-perception component. When the exam includes video hazards, the prep market follows.
- **France's app-first driving schools** (Ornikar, En Voiture Simone, lePERMISLIBRE) — market simulator sessions as a discount path to the 20h requirement (up to 10h on sim, see §6.1).
- **3D Driving Class (Korea, mobile)** — mass-market mobile 3D game explicitly built around the **Korean license test's official deduction items, updated whenever the state changes the deduction table**. Players practice the actual course test and road test with realistic cockpit controls. Enormous download base. **This is the closest existing analog to Книжка.AI's "official exam taxonomy as rule engine" concept — and it thrives on mid-range phones with modest graphics.**

### 2.3 Bulgaria / Balkans specifically

- Bulgarian market = **theory-only**: avtoizpit.bg (official-format листовки + video lectures on 19 topics), avto-u.bg (school-facing theory system), avtoobuchenie.bg, Листовки БГ app, ZebraBook (interactive textbook + app with video questions), motokurs/xdrivebg/carinfo listovki mirrors.
- **Since July 2023 the official Bulgarian exam листовки include interactive video questions — "realistic animations depicting dangerous road situations."** Bulgaria has already imported the hazard-perception-by-CGI model into its official exam; no local product trains it interactively beyond replaying the clips.
- **No Bulgarian or Balkan consumer driving-sim product exists.** Nervtech (Slovenia) is B2B hardware. The "theory app + real sim + one account" stack (Fahren Lernen model) has no local competitor.

---

## 3. Landscape B — Academic evidence base

### 3.1 Does simulator training transfer to real driving?

- **Systematic review, young novice drivers (Journal of Safety Research, 2024):** simulator training reliably improves *simulated* driving skill (stimulus response, lane keeping, speed regulation), but evidence for transfer to on-road skill/safety is **low quality — selection bias, confounding, type-I risk**; short- and long-term real-world benefit "not known." Verdict: sims may **supplement**, not replace, on-road training; don't over-claim.
- **de Winter et al., TU Delft (Ergonomics 2009, n=804 Dutch learners):** performance during initial simulator-based training **predicts the real CBR road-test result 6 months later** (fewer steering errors → higher first-time pass; multiple-measure regression r≈0.45 for training-duration outcomes). Sim telemetry is a *valid early-warning assessment*, even where transfer-of-handling evidence is thin.
- **Drive-Wise (older drivers, 2014):** simulator training improved *real on-road* driving performance and intersection visual scanning, with effects persisting at 2-year follow-up — transfer works when the trained skill is **scanning behavior**, not vehicle control.
- **SWOV fact sheet (NL institute for road-safety research):** the value proposition of sims = **compressed exposure** ("scenarios designed to harbor a large number of learning occasions in a short period"; on-road learning occasions are sparse), **repeatable staging of difficult tasks**, and **feedback modes impossible in a car** — e.g., replaying the learner's action *from above* or *from the other road user's perspective*. Dutch research: starting on a simulator slightly increases road-test pass chance.

### 3.2 Hazard perception — the one intervention with population-scale proof

- UK added hazard perception to the theory test in **2002**; TRL evaluation: **~11.3% reduction in relevant (non-low-speed) crash rates** in the following year; DfT estimates **~£90M/year** saved. This is the single strongest causal datapoint in all of driver education.
- **Systematic review + meta-analysis (Accident Analysis & Prevention, 2024):** hazard-perception training improves hazard-perception skill across **all road-user groups, moderate-to-large effect sizes**; online course effects endure ("Further down the road," 2023).
- **RAPT (Fisher/Pradhan, UMass):** PC-based plan-view + scanning training for latent hazards. **+28.8 pp hazard anticipation vs untrained; >30% scanning improvement; effects persist ≥6 months; validated on-road and in sim; improved real teen behavior at left-turn intersections.** RAPT is cheap 2D software — cognitive fidelity only.
- **DVSA moved from filmed to CGI clips (Jan 2015)** explicitly because CGI lets them stage vulnerable-road-user hazards without risk and keep imagery current. Regulator-endorsed precedent that **rendered 3D hazard content is a legitimate substitute for film** — directly licensing Книжка.AI's approach (and matching Bulgaria's own 2023 animated exam clips).

### 3.3 Fidelity: what actually matters

- Fidelity is multi-dimensional (task, perceptual, behavioral, psychological, functional, motion…); a sim can be high on one and low on another. Adoption of expensive physical fidelity has **outstripped the evidence** for it.
- **Allen et al. (novice training, DSC-NA):** teens trained in an instrumented-cab sim later had **~1/3 the accident rate** of the general teen population; **desktop wide-field-of-view** trainees ~**77%**; **single-monitor desktop** trainees ~**100%** (no benefit). Read carefully, the deltas track **field of view and controls**, not cab bodywork → the two physical-fidelity dollars worth spending are (1) FOV, (2) control feel. Everything else is cognitive/task fidelity — scenario realism, correct road geometry, believable traffic.
- **Speed/space perception is a rendering-parameter problem, not an asset problem:** drivers in sims underestimate visual speed (~10% overproduction typical); geometric-FOV manipulation fixes it — optimum **GFOV:display-FOV ratio ≈ 1.22:1**; narrow GFOV (60°) massively distorts speed and lateral-position perception vs 135°. **A wrongly-set virtual camera makes streets read as too narrow and speeds as too slow — the founder's "roads far too narrow" complaint is partly a camera-FOV calibration bug, and it is fixable in code for free.**
- High-fidelity **driver controls** matter specifically for lateral control (steering) — repeated finding. On a phone/keyboard product, lateral-control training claims should be softened accordingly; grade *decisions*, not steering micro-skill.
- **Simulator sickness:** 10–20% prevalence in fixed-base sims; predictor of study dropout (females HR≈2.0, motion-sickness history HR≈2.2). Notably one ~500-novice study found the **single-monitor config produced the most symptoms** — sickness is about optic-flow/FOV mismatch, not screen count. Design mitigations (stable horizon, correct GFOV, short sessions, no gratuitous camera motion) belong in the benchmark.

### 3.4 AI / virtual instructors

- **NTNU + Virtur + Way AS (Norway, AI Magazine 2024):** multi-agent virtual driving instructor over a knowledge graph, built on **477 driving scenarios** (overtaking, signalized city junctions, roundabouts/give-way). Deployed in **5 simulators at 3 locations since June 2021** at Norway's only simulator-based driving school. Finding: **"AI driving instructors are on par with human driving instructors when it comes to systematically evaluating learner drivers"** — plus *more neutral* feedback (no interpersonal bias). Architecture lesson: situation-assessment agents + pedagogy agent + real-time voice feedback, grounded in a structured scenario/curriculum model — i.e., exactly a rule-engine + coach-layer split, not an end-to-end LLM.
- Green Dino's "Victor" (multi-agent virtual instructor, published 2008–2017) is the earlier proof of the same pattern.

### 3.5 Procedure & checklist training (the aviation model)

- Aviation's laddered stack — **Virtual Procedure Trainer (VPT, cloud/desktop) → Cockpit Procedures Trainer (CPT) → full-flight sim** — exists because **procedural flows (checklists, control drills) train and retain well in low-physical-fidelity devices**. CPT products ship three modes: *Instruction → Practice → Assess*.
- Simulation-based procedural-skill research (medicine): skills taught via simulation are routinely measured by **checklists** and show retention windows of 3–34 months; procedural skill decays without spaced re-practice → schedule refreshers.
- Implication: a **13-step pre-drive checklist answered as a quiz is pedagogically hollow; the same checklist *performed* on interactive cockpit controls (seat, mirrors, belt, ignition, handbrake, gear, clutch) is a validated training pattern** with aviation-grade precedent. The interactive-cockpit gap the founder identified is precisely the VPT layer missing from the product.

---

## 4. Landscape C — Practitioner & user sentiment

Signal from instructor/learner communities and trade press (Reddit-level detail is thin; triangulated from forums, trade magazines, driving-school marketing of sims they actually bought):

**What instructors say sims are good for**
1. **First hours / pre-driving basics** — controls familiarization, mirror-signal-manoeuvre routine, gear/clutch *sequence* (not feel), without burning paid road hours or instructor nerves. Dutch/German/French schools that own sims all position them for lessons 1–5.
2. **Automatisms and procedures** — Fahren Lernen Max schools: "learn the first steps and develop automatisms" so real lessons start further along.
3. **Dangerous/rare situations that can't be staged in a car** — overtaking, highway merging, emergency braking, darkness, bad weather; instructor-triggered events (Develter's headline feature).
4. **Neutral, data-backed feedback** — replay, top-down view, other-road-user perspective (SWOV); bias-free AI evaluation (NTNU).
5. **Calming anxious students** — low-stakes environment repeatedly cited by schools and learners.

**What instructors say sims are bad at / common complaints about sim products**
1. **No vestibular/haptic truth** — clutch bite point, braking g-force, "feel of the car" don't transfer; instructors near-universally warn against claiming handling transfer.
2. **Skills don't transfer 1:1 to road**; unpredictability of real traffic is missing unless deliberately scripted.
3. **Bad habits from game-like sims** — e.g., sim drivers learn to ignore non-visual cues (engine sound, ambient audio).
4. **Cost vs utilization** for hardware rigs; and **simulator sickness** for a minority of students.
5. **"Answered, not performed" content** — e-learning that quizzes instead of drills is the standing criticism of cheap driver-ed software.

Net: practitioner consensus matches the academic evidence almost exactly — **sims for cognition, procedures, and rare-event exposure; cars for vehicle feel.** A credible product should *say this out loud* in its positioning (builds instructor trust, pre-empts the #1 objection).

---

## 5. Landscape D — What a browser can do in 2026 (the tech bar)

- **slowroads.io** — the canonical proof: Three.js/WebGL, procedurally generated endless terrain + vehicle at 60 fps **on phones**, instant load, one developer. Set the public's expectation that browser driving can feel great.
- **Bruno Simon's portfolio** — drivable physics world in the browser; now WebGPU/TSL-capable; open-sourced. Recruiter-grade polish from R3F-adjacent stack (same family as ADR-005).
- **mrdoob's Starter Kit Racing (2025)** — Three.js + pure-JS physics at 60 Hz, no build step, no WASM; shows even the physics layer is commodity now.
- **Dash** (WebGL self-driving-car sim) and multiple R3F+Rapier open demos — the exact ADR-005 stack (Three.js + R3F + Rapier) has public, performant precedents.
- **3D Driving Class** (mobile, §2.2) — proves the *education* variant of this graphics tier has mass-market pull with teenage license candidates.
- Bar to clear, distilled: **instant load (<10s), 60/30 fps on mid-range Android, stable horizon + correct GFOV, readable signage at distance, believable (not photoreal) urban space.** Nobody credible in the browser tier competes on photorealism; they compete on feel, clarity, and zero friction.

---

## 6. Landscape E — Regulatory: where simulator time legally counts

| Jurisdiction | Status |
|---|---|
| **France** | **Strongest precedent.** Arrêté du 16 juillet 2019: of the mandatory 20h practical (permis B manual), **up to 10h may be on an approved simulator**; automatic (13h): road minimum drops to 7h when a simulator with a full driving station is used — under the pedagogical responsibility and *in the presence of* a certified instructor. |
| **Netherlands** | No fixed statutory quota, but simulator lessons are a normalized, CBR-curriculum-aligned part of commercial packages; schools bill 1 sim hour ≈ 1–1.6 road hours; TU Delft research underpins acceptance. |
| **Finland** | After the 1 July 2018 Driving Licence Act reform, mandatory **risk-management training's dark-driving component (pimeäajo) is routinely and legally completed on simulators** — a whole compulsory module ceded to sims nationally. |
| **Norway** | Way AS operates as a **simulator-based driving school** with an AI instructor (§3.4) — regulator tolerates sim-first schooling. |
| **Germany** | Sims widespread in Fahrschulen for early lessons; **no legal hour credit** — pure efficiency play. Japan: sims embedded in the standardized school curriculum (cockpit trainer + hazard scenarios). |
| **USA (CDL/ELDT)** | Counter-example: FMCSA **prohibits** simulator time for behind-the-wheel proficiency (theory use allowed). Several states allow limited sim hours in teen driver-ed; no federal acceptance. |
| **Bulgaria** | Наредба № 37 (2.08.2002, amended) governs candidate training; **no simulator provision today**. An amendment draft was in public consultation to 04.04.2026 (electronic documentation/compliance focus — watch for training-tech openings). Meanwhile the *theory exam itself*已 includes animated hazard-video questions since July 2023 — the exam is already part-simulation. Product positioning until any rule change: **exam-prep + skills-prep supplement**, with the French/Finnish precedents as the lobbying story. |

---

## 7. Synthesis — the 2026 "credible educational driving sim" benchmark

Feature set a credible educational driving sim must have, **ranked by educational impact per unit of evidence** (E = evidence strength: ★★★ population/RCT-grade, ★★ replicated studies/deployed practice, ★ industry consensus only):

### Tier 1 — the product IS these (highest impact, all cheap in a browser)
1. **Hazard-anticipation training loop** — staged latent hazards, learner must *show* anticipation (slow-down, gaze/tap, commentary), with RAPT-style "what you missed" replays. E:★★★ (UK HPT −11.3% crashes; RAPT +28.8 pp, 6-month retention; 2024 meta-analysis moderate-to-large effects).
2. **Scenario density & repetition** — many short, resettable learning occasions per session, not free-roam; difficult tasks staged and repeated on demand. E:★★★ (SWOV core rationale; entire vendor market built on it).
3. **Immediate, structured, neutral feedback with replay from other perspectives** (top-down, the pedestrian's view) + voice coaching. E:★★★ (SWOV; NTNU AI-instructor parity result; Green Dino Victor).
4. **Official-exam-taxonomy scoring as the rule engine** — every graded event mapped to the state's deduction/fault classes (BG: опасна/основна/второстепенна), updated when the state updates. E:★★ (3D Driving Class's whole moat; de Winter: sim telemetry predicts real road-test outcome; NTNU 477-scenario knowledge graph).
5. **Interactive cockpit-procedure training (VPT layer)** — pre-drive checklist, engine start, handbrake, gears, clutch sequence *performed on controls* in Instruction → Practice → Assess modes, with spaced refreshers. E:★★ (aviation VPT/CPT model; procedural-skill retention literature; instructor consensus that sims excel at automatisms). *This is the founder's identified gap, and the evidence says closing it is high-value.*
6. **Adverse/rare-condition modules** — night driving with headlight discipline, rain/fog, emergency events. E:★★ (Finland runs mandatory dark-driving on sims nationally; Develter's instructor-triggered events; SWOV).

### Tier 2 — the product must GET RIGHT (enablers; wrong = credibility loss)
7. **Perceptual calibration**: GFOV:FOV ≈ 1.22:1, ~real road widths and sightlines, stable horizon, readable signs — fixes "narrow roads," speed misjudgment, and most sickness. E:★★ (GFOV/speed-perception literature; Allen FOV-tier outcomes; sickness 10–20% is optic-flow-driven).
8. **Cognitive-fidelity environment over photorealism**: correct BG signage/markings/priority geometry, believable rule-following+rule-breaking traffic. E:★★ (fidelity literature: task/cognitive fidelity drives training value; DVSA's CGI switch legitimizes rendered content).
9. **Theory↔sim↔dashboard integration** — one account, sim mistakes feed theory remediation and vice versa; progress visible to learner (and instructor/parent). E:★★ (Fahren Lernen Max is market leader on exactly this loop; Vogel's DriversCam shows local-route familiarity sells).
10. **Teach-first-then-grade adaptivity** — instruction mode before assessment mode, difficulty ramps per learner. E:★★ (CPT three-mode pattern; Green Dino adaptive curriculum; NTNU pedagogy agent).
11. **Honest scope claims** — market cognition/procedures/hazards, explicitly not "car feel." E:★ (instructor sentiment; the 2024 systematic review's transfer caveats).

### Tier 3 — evidence-weak, cost-heavy (deliberately skip in browser tier)
12. Motion platforms, force feedback beyond basic, cab bodywork — E:★, cost 10⁴–10⁵ €; Allen data shows FOV+controls, not cabs, carry the effect. 13. Photorealistic assets. 14. VR headsets (sickness, reach, minors). 15. Free-roam open worlds without scenario scripting (learning-occasion density collapses).

### Where Книжка.AI would be genuinely first
- No Bulgarian/Balkan competitor has *any* sim layer; the official BG theory exam already contains animated hazard clips (July 2023) that nobody trains interactively.
- Nobody globally ships the full Tier-1 stack **in a browser on a phone**; the pieces exist separately (Green Dino curriculum, NTNU AI instructor, 3D Driving Class exam scoring, Drive iQ hazard modules, slowroads-grade web rendering) but no one has fused them.

---

## 8. Source register (key)

**Products/industry:** greendino.nl · cs-driving-simulator.com (Carnetsoft) · develter.com · ECA Faros (via autoecolemagazine.fr, b-permis.fr) · vogel-system.de (Fahren Lernen/simulator) · nervtech.com · driveiq.com + roadsafetyknowledgecentre.org.uk · viragesimulation.com · tecknotrove.com · driverinteractive.com · simuride.com · 3D Driving Class (Google Play) · avtoizpit.bg · avto-u.bg · avtoobuchenie.bg · zebrabook.bg · carinfo.bg.
**Evidence:** J. Safety Research 2024 systematic review (S0022437524000975) · de Winter et al., Ergonomics 2009 (PMID 18972239) · Drive-Wise, PMC4026721 · SWOV fact sheet "What can driving simulators contribute to driver training?" · TRL558 + humanfocus.co.uk/fleetnews (HPT crash-reduction figures) · AAP 2024 HP meta-analysis (S000145752400099X) · Pradhan/Fisher RAPT (TRR 2006; PubMed 26709331; PMC2563434) · Allen et al., DSC-NA 2007 (nads-sc.uiowa.edu) · GFOV/speed-perception: uhasselt published version + S1877050920304270 + Clemson thesis · sickness: S0022437515000730 (survival analysis), Frontiers 2025 desktop sickness · Rehm et al., AI Magazine 2024 (10.1002/aaai.12201) + norwegianscitechnews.com · aviation VPT/CPT: cpat.com, ael.aero, Airbus 2026 story · procedural retention: PMC8166305.
**Regulation:** Légifrance JORFTEXT000038930611 (arrêté 16/07/2019) · alblas.net, greendino (NL practice) · cap.fi, epicautokoulu.fi (FI dark driving) · FMCSA ELDT FAQ (tpr.fmcsa.dot.gov) · rta.government.bg Наредба №37 + strategy.bg consultation 12192 · gov.uk DVSA CGI announcement.
