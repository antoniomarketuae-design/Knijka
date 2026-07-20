# 63 · QA Report R3 — The First 50 Drills (Product QA)

**Source:** founder QA session 2026-07-20, drills 1–50. Verbatim intent + per-drill
raw log preserved in [62_FOUNDER_REVIEW_R3_FIRST50.md](62_FOUNDER_REVIEW_R3_FIRST50.md)
(doc 62). This document is the professional QA register built to the founder's
template. Rule of this file: **every note is important; nothing is summarized away.**
Fix tracking: the six bug waves (doc 62 §4) — **W-SIG · W-TIME · W-COCKPIT ·
W-FLOW · W-WORLD · W-SPD** — and the design programs **D1–D6**. Where a wave
already targets an issue, the entry names it.

**Severity scale (founder's definitions, applied honestly):**

| Severity | Meaning |
|---|---|
| Critical | Lesson unplayable or teaches WRONG behavior (dead-light showing green, ban-road painted as allowed, unfailable drills, missing bus/kid making the lesson false) |
| High | Broken mechanic or major confusion |
| Medium | Degraded experience |
| Low | Polish |

**Category vocabulary:** Bug · Gameplay · UX-UI · Visual · Audio · Logic · AI ·
Synchronization · Missing Asset · Wrong Scenario · Wrong Map · Performance ·
Feature Request · Educational Improvement.

**Passed clean:** drill 1 „Перпендикулярно паркиране", drill 2 „Успоредно
паркиране", drill 3 „Паркиране на 45°", drill 8 „Предимство отдясно". Drill 20
„Регулировчик" works mechanically (improvement entry QA-20). Drill 43
„Вклиняване" observation accepted as realistic (entry QA-43).

---

## Part A — Systemic issues (the 6 root causes as QA entries)

### QA-S1 · Signal render desync

- **Lesson:** cross-cutting — „Загаснал светофар" (17), „Мигащо жълто" (18), „Спане на зелено" (19), „Тръгване на червено-жълто" (21), plus the missing-light drills „Светофар" (10), „Ляв завой срещу насрещно" (11), „Пешеходец на червено" (29)
- **Severity:** Critical
- **Category:** Bug · Synchronization · Visual · Logic
- **Problem:** What the traffic light SHOWS and what the engine GRADES come from different code paths. The signal MODES (`dark`, `flashingAmber`) and the live signalPlan pin exist in the runtime, but the lamp RENDER path does not read them. One render bug breaks six lessons: green shown on a dead-light drill, no amber blink, green never returning, redYellow rendered as green, lights absent entirely.
- **Expected Behaviour:** The lamp geometry renders exactly the state the grading engine holds, every tick, in every mode (normal cycle, red+yellow, flashing amber, dark), on every drill that declares a signal.
- **Suggested Solution:** **W-SIG** (already scoped, doc 62 §4): make the lamp renderer a pure view of the graded signalPlan/mode — single source of truth, no parallel timer. Add a per-drill automated assertion: rendered lamp state == graded lamp state on every tick (extend the world-truth audit).
- **Educational Value:** A student who sees green and is punished as if it were red learns that traffic lights are arbitrary — the exact opposite of the north star. Truthful signals are the precondition for every signal lesson.
- **Future Expansion:** the same "render is a view of graded truth" contract should gate ALL world state (signs, markings, actors) — see QA-S4 and the world-truth audit.

### QA-S2 · Staged-car timing vs live pacing

- **Lesson:** cross-cutting — „Ограничена видимост" (15), „Ляв завой от Б2" (16), „Загаснал светофар" (17), „Мигащо жълто" (18)
- **Severity:** Critical
- **Category:** Bug · Synchronization · Gameplay · Logic
- **Problem:** Conflict cars the player must yield to pass "very very early" — before the player even reaches the line. Encounters were tuned to the GHOST's pace; a slower live player arrives at an empty junction and "waits for nothing." The yield decision the drill exists to teach never happens.
- **Expected Behaviour:** Encounters arm off PLAYER approach (distance/ETA to the conflict point), not a wall clock, so the conflict is present for every driving pace.
- **Suggested Solution:** **W-TIME** (already scoped, doc 62 §4): player-relative arming for all staged encounters; hold staged actors until the player crosses an approach trigger; verify per-template with a slow-drive automated run alongside the trace run.
- **Educational Value:** Yielding can only be learned if there is something to yield to. Player-relative staging converts empty junctions back into decisions.
- **Future Expansion:** the same trigger machinery is the base for adaptive pressure (spawning conflict earlier/later by learner skill — doc 30 adaptive difficulty).

### QA-S3 · Unfailable drills ("press W and win")

- **Lesson:** cross-cutting — „Пълзящо превишаване" (30), „Превишаване над +10" (31), „Скорост в дъжд през нощта" (32), „Дръж вдясно" (45), „Средата на лентата" (46), „Еднопосочна улица" (47)
- **Severity:** Critical
- **Category:** Gameplay · Wrong Scenario · Educational Improvement
- **Problem:** Straight road, hold W, quiz done. Founder: "This is for 3-year-olds, not people about to become drivers… devastatingly easy." A drill where no mistake is POSSIBLE teaches nothing. #31 duplicates #30 outright; #32 is #30 in the dark.
- **Expected Behaviour:** Every drill contains at least one failable decision: signed constraints that change, staged pressure, a reason to act. Founder's standing hint (given twice): **make simulations where the user makes an actual mistake so he knows what's wrong, not only does right things.**
- **Suggested Solution:** **D3** redesign program (doc 62 §4) on the whole speed/lane family, using **P5** (escalating signed zones) as the pattern; merge duplicates; add mistake-experience variants per **P2/D2**.
- **Educational Value:** Direct north-star violation today: unfailable drills certify nothing about real competence. Failability is what makes a drill a lesson.
- **Future Expansion:** failability should become a template-validation rule — a template that cannot emit any violation on a naive run fails CI.

### QA-S4 · The world breaks its promises (copy fixed, world not)

- **Lesson:** cross-cutting — „Знак Стоп" (9), „Оглеждане на кръстовище" (12), „Стоп и преценка на интервала" (14), „Зона 30" (33), zone drill (34), „Скорост в завой" (36), „Изпреварване при забрана" (50), plus the missing-actor drills (26–28)
- **Severity:** Critical
- **Category:** Wrong Map · Missing Asset · Visual · Educational Improvement
- **Problem:** The audit fixed the COPY; the founder wants the WORLD fixed: no STOP sign on the stop-sign lesson, no Б2 where copy says stop at Б2, no "30" sign in the 30-zone, no 50 sign before the curve, an overtake-ban road still PAINTED with dashed (=allowed) line, bus/kid/ball/white-cane still absent ("cheap… this refers to all the questions so far").
- **Expected Behaviour:** Signs that ARE the lesson exist, are correct, and are **BIG and unmissable**. Road paint matches the rule being graded. Actors named by the lesson exist.
- **Suggested Solution:** **W-WORLD** for signs/paint/markers/shadow-line collisions; **D6** + the CLAIMS.md asset backlog for actors (priority raised by this review — see §7 below).
- **Educational Value:** Students must learn to read the ROAD, not the HUD. Grading rules the world never communicated teaches guessing; showing the opposite marking teaches the wrong law.
- **Future Expansion:** extend the world-truth audit to assert sign/marking presence for every lawRef a template grades.

### QA-S5 · Cockpit/POV channel gaps

- **Lesson:** cross-cutting — „Тясно гнездо" (4), „Смяна на лента" (7), „Б1 не значи спри винаги" (13), „Ограничена видимост" (15), „Пътека в дъжд през нощта" (24), „Дистанция в дъжд" (41), „Лепка отзад" (44)
- **Severity:** Critical (grading-affecting parts) / High (visual-only parts)
- **Category:** Bug · UX-UI · Visual · Logic
- **Problem:** Indicator press produces dark spots on screen (4). Wipers are a button with no wipers (24). Headlights in rain show no visible difference AND a false `HEADLIGHTS_OFF_IN_RAIN` fires after turning them on (41). The cockpit rear mirror shows NOTHING (44); the tailgater is invisible from chase POV (44). Glance buttons are meaningless outside cockpit (7, 13, 15): "pressing a button with no meaning — remove it or make it real."
- **Expected Behaviour:** Every cockpit control has a visible, truthful effect; every graded observation (mirror check, glance) has a real perceptual channel in every camera mode; no violation fires for an action the player correctly performed.
- **Suggested Solution:** **W-COCKPIT** (already scoped, doc 62 §4): indicator dark spots, wiper animation/rain clearing, rain-light visual + false-positive fix, rear-mirror render, tailgater visibility. Design addition beyond the wave: on-screen look-left/look-right affordances (pinging edge indicators) so glancing is meaningful in all POVs.
- **Educational Value:** Mirror and shoulder checks are among the highest-value real-world habits this product can build; today the channel that would build them is dead.
- **Future Expansion:** cockpit hotspot contract (doc 69) as the single spec for control→effect truthfulness; head-turn glance rendering per doc 73 cockpit detail.

### QA-S6 · Flow / navigation bugs

- **Lesson:** cross-cutting — „Пешеходна пътека" (5), „Кръгово" (6), „Знак Стоп" (9), „Оглеждане на кръстовище" (12), „Стоп и преценка на интервала" (14), „Ограничена видимост" (15), „Изчакай пътеката" (22), „Бавен пешеходец" (23), „Магистрала" (37), „Внезапно спиране" (39), „Колона" (40), „Изпреварване на пътека" (48), „Тясна улица" (49)
- **Severity:** High
- **Category:** Bug · UX-UI · Logic
- **Problem:** „Назад към таблото" errors (5) or lands on the LANDING page instead of the dashboard/last position (23). „Повтори" does not restart (22). Roundabout grades a mistake after the conflict has passed, and reaching the end does not end the lesson (6). Shadow path clips THROUGH a stopped car (9); an extra car is parked ON the shadow line (12, 14 — "the wrong map"). Ghost line switches blue→green mid-route with no explanation (15). Governor caps the car below the lesson's own speed domain (37). Distance warnings feel wrong (39, 48). „Колона" is one car (40). Street not narrow (49).
- **Expected Behaviour:** Navigation always returns where it says; „Повтори" restarts cleanly; lessons end when their goal is reached; grading windows close when the conflict is resolved; ghost lines never collide with world objects and their color semantics are explained; speed demands are physically reachable; proximity warnings match what the player sees.
- **Suggested Solution:** **W-FLOW** (navigation/repeat/end-of-lesson), **W-WORLD** (shadow-line collisions, marker placement), **W-SPD** (governor vs speed domain + distance-warning honesty check).
- **Educational Value:** Broken flow destroys trust and session momentum; false warnings train students to ignore warnings — the most dangerous habit a safety product can teach.

---

## Part B — Per-drill QA entries

### QA-04 · „Тясно гнездо"

- **Lesson:** „Тясно гнездо" (narrow parking bay) — drill 4
- **Severity:** High
- **Category:** Bug · Visual · UX-UI
- **Problem:** Pressing the indicators produces DARK SPOTS on the screen.
- **Expected Behaviour:** Indicator press → stalk/telltale animation and audible tick; zero render artifacts.
- **Suggested Solution:** **W-COCKPIT** owns this (indicator dark spots). Likely a render-target/overlay artifact from the indicator UI layer; reproduce with indicators held in each camera mode.
- **Educational Value:** Indicating before maneuvering must feel natural and rewarding, not visually punished.

### QA-05 · „Пешеходна пътека"

- **Lesson:** „Пешеходна пътека" (pedestrian crossing) — drill 5
- **Severity:** High
- **Category:** Bug · UX-UI
- **Problem:** „Назад към таблото" after the drill → error.
- **Expected Behaviour:** Returns to the dashboard at the user's last position, every time.
- **Suggested Solution:** **W-FLOW**. Audit the post-lesson navigation route (same family as QA-23's landing-page misroute).
- **Educational Value:** Session flow: a student who hits an error at the moment of completion loses the win.

### QA-06 · „Кръгово"

- **Lesson:** „Кръгово" (roundabout) — drill 6
- **Severity:** High
- **Category:** Bug · Logic · Synchronization
- **Problem:** (a) Graded a mistake after the circulating car had already passed; (b) reaching the end did not finish the lesson.
- **Expected Behaviour:** The yield-grading window closes once the circulating conflict is resolved; the lesson ends at its end condition.
- **Suggested Solution:** **W-TIME** for the grading window (the roundabout adjudicator's `rbConflictSeen`/exit logic exists — tune the violation window against live pacing); **W-FLOW** for end-of-lesson detection.
- **Educational Value:** Roundabout entry-yield is one of the four core priority situations the engine adjudicates; a late false fail teaches hesitation instead of judgment.

### QA-07 · „Смяна на лента"

- **Lesson:** „Смяна на лента" (lane change) — drill 7
- **Severity:** High
- **Category:** UX-UI · Gameplay
- **Problem:** The rear-check is a meaningless button press outside cockpit view. Founder: "remove it or make it real."
- **Expected Behaviour:** The glance/mirror check is a real perceptual act in every camera mode — the player sees something when they check, and what they see matters.
- **Suggested Solution:** **W-COCKPIT** rear-mirror/visibility work is the prerequisite; design layer: on-screen look-left/look-right pinging edge indicators (S5), or a brief camera glance-snap, in non-cockpit POVs. If neither ships, remove the button rather than keep the fake.
- **Educational Value:** Mirror-before-maneuver is a core life-saving habit; a fake button trains cargo-cult behavior.
- **Future Expansion:** eye-line/head-turn glance system per doc 73; grade WHAT was seen (gap present/absent), not that a key was pressed.

### QA-09 · „Знак Стоп"

- **Lesson:** „Знак Стоп" (STOP sign) — drill 9
- **Severity:** Critical
- **Category:** Wrong Map · Missing Asset · Bug · Visual
- **Problem:** (a) NO stop sign anywhere on the map of the stop-sign lesson; (b) the shadow path clips THROUGH a stopped car; (c) the player must drive around a car the ghost ignores.
- **Expected Behaviour:** A Б2 (STOP) sign — big and unmissable — at the graded line; the ghost trace routes around all world objects; ghost and player face the same world.
- **Suggested Solution:** **W-WORLD** (sign placement + shadow-line collision pass). Re-record or offset the trace where parked cars intrude; add a trace-vs-collider CI check.
- **Educational Value:** A stop-sign lesson without a stop sign teaches stopping at nothing — the inverse of reading the road.

### QA-10 · „Светофар"

- **Lesson:** „Светофар" (traffic light) — drill 10
- **Severity:** Critical
- **Category:** Missing Asset · Wrong Map · Visual
- **Problem:** No visible traffic light; the shadow path stops mid-road, not at a light.
- **Expected Behaviour:** A visible, correctly-cycling light at the graded stop line; the ghost stops at the line.
- **Suggested Solution:** **W-SIG** (lamp render from graded plan) + **W-WORLD** (light placement, stop-marker at the line).
- **Educational Value:** The first traffic-light lesson sets the mental model for every signal after it.

### QA-11 · „Ляв завой срещу насрещно"

- **Lesson:** „Ляв завой срещу насрещно" (left turn against oncoming) — drill 11
- **Severity:** High
- **Category:** Missing Asset · Bug
- **Problem:** No light present; an error occurred during the drill.
- **Expected Behaviour:** The junction renders its declared signal; the drill runs error-free. (Escalate to Critical if the error blocks completion.)
- **Suggested Solution:** **W-SIG** for the light; **W-FLOW** to reproduce and fix the error.
- **Educational Value:** Left-turn-yield is a live adjudicator slice (oncoming query) — the world must furnish the situation the engine already grades.

### QA-12 · „Оглеждане на кръстовище"

- **Lesson:** „Оглеждане на кръстовище" (scanning the junction) — drill 12
- **Severity:** Critical
- **Category:** Wrong Map · Missing Asset · Bug
- **Problem:** (a) An extra car is parked ON the shadow line; (b) copy demands a stop at Б2 but there is no Б2 sign on the map.
- **Expected Behaviour:** Clean ghost line; the sign the copy cites exists at the cited place.
- **Suggested Solution:** **W-WORLD** (sign + shadow-line collision + parked-car placement).
- **Educational Value:** The player is instructed to comply with a sign that does not exist — this actively teaches ignoring instructions.

### QA-13 · „Б1 не значи спри винаги"

- **Lesson:** „Б1 не значи спри винаги" (B1 does not always mean stop) — drill 13
- **Severity:** High
- **Category:** Bug · UX-UI · Logic
- **Problem:** (a) Glance buttons are only meaningful in cockpit view; (b) at the second mouth the drill graded "no scan" although the player pressed the glance buttons; (c) no visible feedback that a glance registered.
- **Expected Behaviour:** Glance registers reliably in all POVs, with an on-screen look-left/look-right ping and a visible affordance confirming the scan.
- **Suggested Solution:** **W-COCKPIT** for the registration bug; S5 design work for edge-ping affordances.
- **Educational Value:** Б1 nuance (yield ≠ always stop) is exactly the judgment the theory bank tests; the mechanic must credit real checking.

### QA-14 · „Стоп и преценка на интервала"

- **Lesson:** „Стоп и преценка на интервала" (stop and gap judgment) — drill 14
- **Severity:** High
- **Category:** Wrong Map · Bug
- **Problem:** Wrong map: an extra car intrudes (same as 12); the stop marker is in the wrong place. No Б2 sign though the drill stops at one (per S4).
- **Expected Behaviour:** Correct map variant; stop marker at the legal stop position; Б2 present.
- **Suggested Solution:** **W-WORLD** (marker placement + map/parked-car audit for this template pair).
- **Educational Value:** Gap judgment is trained relative to a correct stop position; a wrong marker trains a wrong observation point.

### QA-15 · „Ограничена видимост"

- **Lesson:** „Ограничена видимост" (limited visibility) — drill 15
- **Severity:** Critical
- **Category:** Synchronization · Gameplay · UX-UI
- **Problem:** (a) The right-arriving car passes long before the player arrives — the visibility hazard never exists for a live player; (b) the ghost line switches blue→green mid-route with no explanation; (c) glance buttons meaningless outside cockpit (see QA-07/QA-13).
- **Expected Behaviour:** The conflict car arrives relative to player approach; ghost-line color semantics are either explained on screen or unified.
- **Suggested Solution:** **W-TIME** (player-relative arming); **W-FLOW/UI** for the blue→green legend (tooltip or consistent single color).
- **Educational Value:** Creeping forward at a blind junction is a signature real-world skill — but only if something can actually appear from the right.

### QA-16 · „Ляв завой от Б2"

- **Lesson:** „Ляв завой от Б2" (left turn from a B2 stop) — drill 16
- **Severity:** Critical
- **Category:** Synchronization · Gameplay
- **Problem:** The conflict car passes before the player even reaches the sign; the yield the drill teaches never occurs.
- **Expected Behaviour:** Conflict staged off player approach to the Б2 line.
- **Suggested Solution:** **W-TIME**.
- **Educational Value:** Stop, look, judge, yield — the full chain needs a live conflict to be graded honestly.

### QA-17 · „Загаснал светофар"

- **Lesson:** „Загаснал светофар" (dead traffic light) — drill 17
- **Severity:** Critical
- **Category:** Bug · Synchronization · Visual · Logic
- **Problem:** The DEAD-light drill shows a LIVE GREEN light, and the engine grades as if it were red/dead; the conflict car also passes early.
- **Expected Behaviour:** The lamp renders `dark`; the drill teaches the fallback rule (dead light → priority signs / right-hand rule); conflict staged on player approach.
- **Suggested Solution:** **W-SIG** (render the `dark` mode that already exists in the runtime) + **W-TIME**.
- **Educational Value:** This is the founder's canonical example of teaching WRONG behavior: green shown, punished as red. The dead-light fallback is a real exam and real-life scenario; it must be visually true.

### QA-18 · „Мигащо жълто"

- **Lesson:** „Мигащо жълто" (flashing amber) — drill 18
- **Severity:** Critical
- **Category:** Bug · Synchronization · Visual · UX-UI
- **Problem:** (a) No yellow blink rendered; (b) the conflict car passes early; (c) the POV sees too little of the junction.
- **Expected Behaviour:** Blinking amber rendered from the `flashingAmber` mode; conflict player-relative; camera/POV framing lets the player see what the drill asks them to judge.
- **Suggested Solution:** **W-SIG** + **W-TIME**; POV framing goes to the camera-system roadmap item (Part D).
- **Educational Value:** Flashing amber = proceed with caution/yield rules — invisible blinking makes the mode indistinguishable from a dead or green light.

### QA-19 · „Спане на зелено"

- **Lesson:** „Спане на зелено" (sleeping at green) — drill 19
- **Severity:** Critical
- **Category:** Bug · Synchronization
- **Problem:** Green appeared once and never again — the drill is unplayable.
- **Expected Behaviour:** The signal cycles continuously; the "react promptly to green" prompt can always occur.
- **Suggested Solution:** **W-SIG** (cycle restart / plan looping in the render+grading path).
- **Educational Value:** None until playable; after the fix, prompt-reaction training (don't block the junction, don't sleep at green).

### QA-20 · „Регулировчик"

- **Lesson:** „Регулировчик" (traffic controller) — drill 20
- **Severity:** Medium
- **Category:** Educational Improvement · AI · Visual · Feature Request
- **Problem:** The drill works, but the controller NPC is too small/simple, and nothing verifies the student KNOWS the controller postures before being graded on obeying one ("does the user know the signs of the traffic regulator?").
- **Expected Behaviour:** A visible, correctly-postured controller figure; a posture micro-quiz (4–5 pictures of postures and meanings) BEFORE the graded encounter.
- **Suggested Solution:** **D5** micro-tutorials (P4 — controller postures first; the MicroQuizOverlay pause-and-card pattern already exists per alpha-recon doc 04 §4) + **D6** actor upgrade for the NPC model. Multi-flip `SignalControllerSchedule` (halt→proceed→halt) is already on CLAIMS engine follow-ups.
- **Educational Value:** Teach-then-grade instead of grade-blind; controller postures are pure knowledge that the sim can install exactly at the moment of need.
- **Future Expansion:** the in-context micro-quiz pattern generalizes to every "does the student know X" gate (signs, markings, postures) — see doc 64.

### QA-21 · „Тръгване на червено-жълто"

- **Lesson:** „Тръгване на червено-жълто" (moving off on red+amber) — drill 21
- **Severity:** Critical
- **Category:** Bug · Synchronization · Educational Improvement · Wrong Scenario
- **Problem:** The light shows green during the red+amber drill; the question/task is incomprehensible as experienced. Founder: revise the whole drill.
- **Expected Behaviour:** Render the actual red+amber phase; the drill's ask ("prepare, move off when green") must be legible from what is on screen.
- **Suggested Solution:** **W-SIG** for the phase render; then a **D3**-style drill revision pass (sequence, copy, grading) with founder review.
- **Educational Value:** Red+amber anticipation is a specific exam knowledge point; today the drill actively contradicts it.

### QA-22 · „Изчакай пътеката"

- **Lesson:** „Изчакай пътеката" (wait at the crossing) — drill 22
- **Severity:** High
- **Category:** Bug · UX-UI
- **Problem:** „Повтори" does not restart the drill.
- **Expected Behaviour:** Restart resets world, actors, signals, score — always.
- **Suggested Solution:** **W-FLOW** (repeat/reset path).
- **Educational Value:** Retry-until-mastery is the core loop; a broken repeat kills deliberate practice.

### QA-23 · „Бавен пешеходец"

- **Lesson:** „Бавен пешеходец" (slow pedestrian) — drill 23
- **Severity:** High
- **Category:** Bug · UX-UI
- **Problem:** „Назад към таблото" lands on the LANDING page, not the dashboard/last position.
- **Expected Behaviour:** Return to dashboard, scrolled to the drill catalog position the user came from.
- **Suggested Solution:** **W-FLOW** (same navigation audit as QA-05).
- **Educational Value:** Flow retention; a learner dumped to marketing pages mid-session churns.

### QA-24 · „Пътека в дъжд през нощта"

- **Lesson:** „Пътека в дъжд през нощта" (crossing in rain at night) — drill 24
- **Severity:** High
- **Category:** Bug · Visual · UX-UI
- **Problem:** (a) The wiper button does nothing visible — no wipers exist; (b) a dark spot renders inside the stop-circle marker.
- **Expected Behaviour:** Wiper toggle → visible wiper sweep + rain-clearing effect on the windshield; markers render clean.
- **Suggested Solution:** **W-COCKPIT** (wipers) + the marker artifact likely shares a root cause with QA-04's dark spots — check together.
- **Educational Value:** Weather controls only teach if they change what the driver sees; that is the entire point of wipers.

### QA-25 · „Внезапен пешеходец"

- **Lesson:** „Внезапен пешеходец" (sudden pedestrian) — drill 25
- **Severity:** Critical
- **Category:** Wrong Scenario · Educational Improvement
- **Problem:** 95% identical to the basic zebra drill; nothing sudden happens.
- **Expected Behaviour:** A genuinely sudden appearance (late spawn from occlusion, short reaction window) distinct from the standard crossing.
- **Suggested Solution:** **W-TIME** machinery (player-relative late trigger from an occluder) + **D3** redesign to differentiate from drill 5. Pair with the door-zone/occlusion props in the CLAIMS render-wiring list.
- **Educational Value:** Hazard-anticipation training requires the hazard to actually surprise; a duplicate drill trains nothing new and erodes trust (see QA-31).

### QA-26 · „Иззад спрял автобус"

- **Lesson:** „Пешеходци иззад спрял автобус" (pedestrians from behind a stopped bus) — drill 26
- **Severity:** Critical
- **Category:** Missing Asset · Wrong Scenario
- **Problem:** NO BUS AT ALL — a plain zebra crossing. Founder: "funnily wrong."
- **Expected Behaviour:** A stopped bus occluding the crossing; a pedestrian emerging from behind it.
- **Suggested Solution:** Bus rig is on CLAIMS (needs-asset) — this review RAISES its priority: the missing actor makes the lesson false, not under-dressed. Interim decision open on CLAIMS: stage a held truck at the BUS_OBSTACLE rect until a bus rig exists (spec change → trace gates deliberately). **D6**.
- **Educational Value:** Occluded-pedestrian anticipation is a top killer-scenario for new drivers; it cannot be taught without the occluder.
- **Future Expansion:** the bus rig also unblocks „Автобусът потегля от спирката" (renders as box truck) and bus-stop dressing (навес/зигзаг/джоб) from CLAIMS.

### QA-27 · „Дете с топка"

- **Lesson:** „Дете с топка" (child with ball) — drill 27
- **Severity:** Critical
- **Category:** Missing Asset · Wrong Scenario
- **Problem:** No kid, no ball — a plain zebra. Founder: "completely wrong."
- **Expected Behaviour:** Ball rolls into the road, child follows — the classic anticipation chain.
- **Suggested Solution:** Child pedestrian variant + ball prop (on CLAIMS, priority raised). **D6**. Ball-then-child sequencing via the staged-trigger machinery (W-TIME pattern).
- **Educational Value:** "Ball = child follows" is the canonical defensive-driving inference; the drill currently teaches it does not exist.

### QA-28 · „Бял бастун"

- **Lesson:** „Пешеходец с бял бастун" (white-cane pedestrian) — drill 28
- **Severity:** Critical
- **Category:** Missing Asset · Wrong Scenario
- **Problem:** The same adult pedestrian, no cane, just walking slower. Founder: "useless… cheap" — and he flags that this cheapness impression "refers to all the questions so far."
- **Expected Behaviour:** A visibly distinct white-cane pedestrian; the lesson's special-care rule made visible.
- **Suggested Solution:** White-cane prop (on CLAIMS, priority raised). **D6**.
- **Educational Value:** Recognizing vulnerable road users who cannot see you is a legal and moral special case; a re-skinned slow adult erases the category.

### QA-29 · „Пешеходец на червено"

- **Lesson:** „Пешеходец на червено" (pedestrian crossing on red) — drill 29
- **Severity:** Critical
- **Category:** Missing Asset · Wrong Map · Wrong Scenario
- **Problem:** NO traffic light at all; the zebra placement itself is dubious.
- **Expected Behaviour:** A signalized crossing where the pedestrian violates their red — teaching that priority does not cancel the duty to avoid.
- **Suggested Solution:** **W-SIG** + **W-WORLD** (light + crossing placement review).
- **Educational Value:** "Being in the right does not prevent the collision" — one of the most transferable defensive lessons; impossible without the light.

### QA-30 · „Пълзящо превишаване"

- **Lesson:** „Пълзящо превишаване" (creeping speeding) — drill 30
- **Severity:** Critical
- **Category:** Gameplay · Wrong Scenario · Educational Improvement
- **Problem:** Empty road plus an invisible cap — hold W and win; nothing marks the limit; no way to meaningfully fail or learn.
- **Expected Behaviour:** Founder's P5 redesign: a LONG road — sign 50 → hold under 50 → sign 30 → drop to 30. Signed, staged, failable.
- **Suggested Solution:** **D3** with **P5** as the concrete spec; **W-WORLD** supplies the speed-limit sign assets.
- **Educational Value:** Speed discipline is reading-and-responding to zones, not obeying a HUD number.
- **Future Expansion:** escalating-zone roads become a reusable template family (30/50/90 chains, end-of-limit signs, „при мокра настилка" plates — sign faces already on CLAIMS).

### QA-31 · „Превишаване над +10"

- **Lesson:** „Превишаване над +10" (speeding over +10) — drill 31
- **Severity:** Critical
- **Category:** Wrong Scenario · Gameplay
- **Problem:** IDENTICAL to drill 30. Founder: "if a user sees this he will start to feel the platform is a scam."
- **Expected Behaviour:** Either a genuinely distinct drill (different zone logic, tolerance teaching) or merged into the redesigned 30.
- **Suggested Solution:** **D3**: merge or differentiate during the speed-family redesign.
- **Educational Value:** Duplicate content destroys perceived value and trust — a direct retention risk for a paid product.

### QA-32 · „Скорост в дъжд през нощта"

- **Lesson:** „Скорост в дъжд през нощта" (speed in rain at night) — drill 32
- **Severity:** Critical
- **Category:** Wrong Scenario · Gameplay
- **Problem:** Drill 30 again, in the dark — same unfailable emptiness.
- **Expected Behaviour:** Conditions-based speed judgment: the `SPEED_TOO_FAST_FOR_CONDITIONS` detector (rain ×0.85 / night ×0.9) given a real situation — visibility limit, curve, staged hazard — where legal-limit speed is nonetheless too fast.
- **Suggested Solution:** **D3** (conditions variant of the P5 pattern); the detector already exists in `rules/engine.ts` — the WORLD must create the case where it honestly fires.
- **Educational Value:** "The limit is a maximum, not a target" is a life-saving distinction; it needs weather that actually demands slowing.

### QA-33 · „Зона 30"

- **Lesson:** „Зона 30" (30 zone) — drill 33
- **Severity:** Critical
- **Category:** Wrong Map · Missing Asset · Educational Improvement
- **Problem:** No 30 sign, no school, no neighborhood context — one building on an empty map.
- **Expected Behaviour:** Zone entry sign (big, unmissable), school/residential dressing that justifies the zone, zone exit.
- **Suggested Solution:** **W-WORLD** (signs); zone dressing joins the D2-buildings/visual program (doc 71) and **D3** for staged pressure (children near a school, parked cars).
- **Educational Value:** Zones exist BECAUSE of context; teaching a 30 zone without the reasons for it removes the why (see the why-window, P1).

### QA-34 · Zone drill (follow-up to 33)

- **Lesson:** the next zone drill after „Зона 30" — drill 34
- **Severity:** Critical
- **Category:** Wrong Map · Missing Asset
- **Problem:** Same failure: the signs stating the zone are MISSING.
- **Expected Behaviour / Suggested Solution / Educational Value:** as QA-33; fix both in the same **W-WORLD** pass.

### QA-35 · „Рязко спиране"

- **Lesson:** „Рязко спиране" (hard braking) — drill 35
- **Severity:** High
- **Category:** Wrong Scenario · Educational Improvement
- **Problem:** The player brakes with no visible reason — an unmotivated action.
- **Expected Behaviour:** Stage the braking reason (hazard appears) or show the consequence reel of NOT braking (P2).
- **Suggested Solution:** **D2** (consequence scenes) or a **W-TIME**-staged hazard; either makes the drill causal.
- **Educational Value:** Emergency braking is a response; training the response without the stimulus builds nothing transferable.

### QA-36 · „Скорост в завой"

- **Lesson:** „Скорост в завой" (speed in a curve) — drill 36
- **Severity:** High
- **Category:** Wrong Map · Missing Asset · Logic · UX-UI
- **Problem:** The drill says ≤92, then abruptly pops ≤50; the copy claims an А1+50 sign that does not exist on the map.
- **Expected Behaviour:** The А1 (curve) warning + 50 advisory sign physically before the curve; one coherent speed narrative.
- **Suggested Solution:** **W-WORLD** (place the signs the copy cites — А19 and advisory plate faces are on the CLAIMS sign-face list); reconcile the two caps in the template.
- **Educational Value:** Curve-speed judgment starts at the warning sign; grading an uncommunicated limit teaches guessing.

### QA-37 · „Магистрала"

- **Lesson:** „Магистрала" (motorway) — drill 37
- **Severity:** Critical
- **Category:** Bug · Logic · Gameplay
- **Problem:** The drill demands ≤140 while the difficulty governor caps the car at 87 km/h — the motorway speed domain is physically unreachable; the constraint can never bind.
- **Expected Behaviour:** Per-lesson speed domain overrides the governor; motorway drills allow motorway speeds.
- **Suggested Solution:** **W-SPD** (already scoped: governor vs lesson speed domain).
- **Educational Value:** Motorway craft (speed band, keeping right, following distance at speed) cannot be taught at 87.

### QA-38 · „Дистанция на следване"

- **Lesson:** „Дистанция на следване" (following distance) — drill 38
- **Severity:** Medium
- **Category:** Gameplay · AI
- **Problem:** (a) The lead car is very slow, making the exercise feel artificial; (b) steering feels too sharp — founder explicitly notes: observation only, **do not change lightly**.
- **Expected Behaviour:** Lead car at plausible urban speed so the 1.8 s gap (`followSafeSeconds`) is a real skill; steering feel unchanged pending a dedicated tuning session.
- **Suggested Solution:** Retune the lead-car speed profile (traffic layer); log the steering note in doc 64 as a needs-decision, NOT a wave item.
- **Educational Value:** The two-second rule only transfers when practiced at realistic speeds.

### QA-39 · „Внезапно спиране"

- **Lesson:** „Внезапно спиране" (sudden stop) — drill 39
- **Severity:** High
- **Category:** Bug · Logic
- **Problem:** The distance warning fired while the player was visibly far from the lead car.
- **Expected Behaviour:** Warnings match what the player sees; thresholds honest against perceived distance.
- **Suggested Solution:** **W-SPD** distance-warning honesty check (shared with QA-48): verify `leadGapM` measurement (bumper-to-bumper vs center-to-center) and the `followMinGapM`/`followSafeSeconds` thresholds against on-screen reality.
- **Educational Value:** False warnings teach warning-blindness — the most corrosive habit a safety system can install.

### QA-40 · „Колона"

- **Lesson:** „Колона" (driving in a column) — drill 40
- **Severity:** High
- **Category:** Wrong Scenario · Missing Asset
- **Problem:** The "line of cars" is ONE car.
- **Expected Behaviour:** An actual column (3+ vehicles) or honest copy.
- **Suggested Solution:** Founder decision already open on CLAIMS („column" pressure copy on empty streets: stage 1–2 scenery cars or keep singular copy) — this review argues for staging the cars; **D6**/traffic-layer work.
- **Educational Value:** Column driving (no overtaking within, keeping the chain gap) needs a chain to exist.

### QA-41 · „Дистанция в дъжд"

- **Lesson:** „Дистанция в дъжд" (following distance in rain) — drill 41
- **Severity:** Critical
- **Category:** Bug · Logic · Visual
- **Problem:** (a) Turning headlights on has NO visual effect; (b) `HEADLIGHTS_OFF_IN_RAIN` fired again AFTER the player turned the lights on — a false violation punishing the correct action.
- **Expected Behaviour:** Lights-on visibly changes the scene (beam, reflections, dashboard telltale); the detector reads the actual light state and never fires post-activation.
- **Suggested Solution:** **W-COCKPIT** (rain-light visual + the false-positive state read; detector is `HEADLIGHTS_OFF_IN_RAIN`, sustain 3, day-rain in `rules/engine.ts`).
- **Educational Value:** Punishing a correctly-performed safety action teaches WRONG behavior — the exact Critical definition.

### QA-42 · „Зад камион"

- **Lesson:** „Зад камион" (behind a truck) — drill 42
- **Severity:** High
- **Category:** Gameplay · Logic · Educational Improvement
- **Problem:** Nothing stops the player overtaking; the "stay behind" instruction has no enforcement and no taught reason.
- **Expected Behaviour:** Overtaking here is either graded (visibility-based overtake rule) or its danger demonstrated (consequence reel of the overtake into unseen oncoming — P2).
- **Suggested Solution:** **D2** consequence scene; grading-side, an oncoming-occlusion overtake detector is a natural Phase-2/3 engine follow-up.
- **Educational Value:** "You cannot see past the truck" is a visibility argument — showing the unseen oncoming car makes it visceral.

### QA-43 · „Вклиняване"

- **Lesson:** „Вклиняване" (being cut in on) — drill 43
- **Severity:** Low
- **Category:** AI · Gameplay
- **Problem:** The cutting-in car gives no indicator. Founder explicitly ACCEPTS this as realistic ("noted").
- **Expected Behaviour:** No change required; the observation is preserved here so it is never re-litigated blind.
- **Suggested Solution:** Keep as-is. Optional future variant: randomize indicator on/off so students learn to react to behavior, not signals.
- **Educational Value:** Real drivers often do not signal; defending against the unsignaled cut-in is the more valuable lesson.

### QA-44 · „Лепка отзад"

- **Lesson:** „Лепка отзад" (tailgater) — drill 44
- **Severity:** Critical
- **Category:** Bug · Visual · UX-UI
- **Problem:** (a) The tailgater is invisible from the chase POV; (b) the cockpit REAR MIRROR SHOWS NOTHING. The lesson's hazard cannot be perceived in ANY view.
- **Expected Behaviour:** A working rear-mirror render in cockpit; tailgater visible (or indicated) in chase POV.
- **Suggested Solution:** **W-COCKPIT** (rear mirror render + tailgater visibility — both explicitly scoped in the wave).
- **Educational Value:** Managing a tailgater starts with noticing one; the drill currently grades a response to an invisible stimulus.

### QA-45 · „Дръж вдясно"

- **Lesson:** „Дръж вдясно" (keep right) — drill 45
- **Severity:** Critical
- **Category:** Gameplay · Wrong Scenario
- **Problem:** The car starts already positioned right on a straight road — nothing to do; unfailable.
- **Expected Behaviour:** Start mispositioned or introduce a reason to leave and re-take the right lane (overtake + return); the live `NOT_KEEPING_RIGHT` detector (sustain 8, multi-lane) gets a real chance to fire.
- **Suggested Solution:** **D3** redesign (the detector exists; the scenario must create the decision).
- **Educational Value:** Keep-right is a habit under temptation (empty left lane), not a starting position.

### QA-46 · „Средата на лентата"

- **Lesson:** „Средата на лентата" (lane centering) — drill 46
- **Severity:** Critical
- **Category:** Gameplay · Wrong Scenario
- **Problem:** Hold W to win.
- **Expected Behaviour:** Curves, narrowing, oncoming pressure — anything that makes centering (`POOR_LANE_KEEPING`, 1.3 m / 3 s) an actual skill.
- **Suggested Solution:** **D3** (route with curvature; possibly reuse the narrow-street/obstacle assets).
- **Educational Value:** Lane discipline is graded live by the engine; the world must make it hard enough to matter.

### QA-47 · „Еднопосочна улица"

- **Lesson:** „Еднопосочна улица" (one-way street) — drill 47
- **Severity:** Critical
- **Category:** Gameplay · Wrong Scenario
- **Problem:** Hold W to win — the one-way rule is never at risk.
- **Expected Behaviour:** A junction choice where entering the wrong way is possible (and the `WRONG_WAY` detector — опасна, 120°, sustain 1.5 s — fires); В1/Д-series signage visible.
- **Suggested Solution:** **D3**: route through a decision point; **W-WORLD** for signage.
- **Educational Value:** One-way discipline is a navigation decision; a drill without the decision teaches nothing the detector can catch.

### QA-48 · „Изпреварване на пътека"

- **Lesson:** „Изпреварване на пътека" (overtaking at a crossing) — drill 48
- **Severity:** High
- **Category:** Bug · Logic
- **Problem:** A "too close" error fired while the player was visibly far.
- **Expected Behaviour:** Proximity grading matches on-screen distance.
- **Suggested Solution:** **W-SPD** distance-warning honesty check (same audit as QA-39).
- **Educational Value:** As QA-39 — dishonest warnings train students to dismiss all warnings.

### QA-49 · „Тясна улица"

- **Lesson:** „Тясна улица" (narrow street) — drill 49
- **Severity:** High
- **Category:** Wrong Map · Wrong Scenario
- **Problem:** The street is not actually narrow; only a bus makes it "abit" tight.
- **Expected Behaviour:** A genuinely narrow street (parked cars both sides, reduced width) forcing the meeting/priority negotiation the lesson is about.
- **Suggested Solution:** **W-WORLD**/map variant; the sc-ln-obstacle-meeting held-scenery one-liner on CLAIMS is related machinery.
- **Educational Value:** Narrow-street give-and-take (who yields, where to pull in) requires actual narrowness.

### QA-50 · „Изпреварване при забрана"

- **Lesson:** „Изпреварване при забрана" (overtaking under a ban) — drill 50
- **Severity:** Critical
- **Category:** Wrong Map · Visual · Missing Asset
- **Problem:** The road MARKING on the ban map is dashed — which MEANS overtaking is allowed; no В24 sign and no visible reason for the ban. Founder: "the map is wrong."
- **Expected Behaviour:** Solid line (М1-family) + В24 sign, big and unmissable; the world states the rule the engine grades.
- **Suggested Solution:** **W-WORLD** (ban-map line paint is explicitly scoped in the wave; В24 face may need the CLAIMS sign-face batch). Related open decision on CLAIMS: the М2 marking-code contradiction (dashed vs wide-solid-edge — two generators, both cite Наредба № 2) — resolve it in the same pass.
- **Educational Value:** This is the founder's second canonical Critical: the world actively displays the OPPOSITE of the law being graded — it teaches that dashed lines forbid overtaking.

---

## Part C — Global Analysis

### 1. Most Critical Problems (every Critical, one line each)

Systemic: **QA-S1** signal render desync · **QA-S2** staged-car timing kills the yield lessons · **QA-S3** the unfailable-drill family · **QA-S4** world contradicts the graded law (grading-affecting subset of QA-S5: false `HEADLIGHTS_OFF_IN_RAIN`, dead rear-mirror channel).

Per drill: **9** stop-sign lesson without a stop sign · **10** traffic-light lesson without a light · **12** ordered to stop at a nonexistent Б2 + car on the ghost line · **15** limited-visibility conflict evaporates before arrival · **16** Б2 left-turn conflict evaporates · **17** dead-light drill shows live green (graded as red) · **18** flashing-amber never blinks · **19** green never returns — unplayable · **21** red+amber drill shows green, incomprehensible · **25** "sudden" pedestrian is not sudden (duplicate of 5) · **26** no bus in the bus-occlusion lesson · **27** no child, no ball · **28** no white cane · **29** no light in the pedestrian-on-red lesson · **30** unfailable creeping-speed drill · **31** duplicate of 30 ("scam" perception) · **32** duplicate of 30 in the dark · **33** 30-zone without zone signs or context · **34** second zone drill, same missing signs · **37** motorway drill capped at 87 by the governor · **41** false violation after correctly turning lights on · **44** tailgater invisible in every view · **45** keep-right with nothing to do · **46** lane-centering by holding W · **47** one-way street with no wrong way possible · **50** ban road painted as overtake-allowed.

### 2. UX Problems

- Post-lesson navigation: „Назад към таблото" errors (5) or lands on the landing page (23); must return to dashboard/last position (W-FLOW).
- „Повтори" does not restart (22) (W-FLOW).
- Glance/rear-check buttons meaningless outside cockpit (7, 13, 15): "remove it or make it real"; needed: on-screen look-left/right pinging edge indicators + visible confirmation that a scan registered (13).
- Ghost line switches blue→green with no explanation (15) — color semantics never taught.
- Screen artifacts: indicator dark spots (4), dark spot inside the stop-circle marker (24).
- POV framing shows too little of the junction (18); tailgater invisible from chase POV, rear mirror empty (44).
- Contradictory in-drill instructions: ≤92 then a sudden ≤50 pop (36).
- No why-window anywhere: the founder ordered a WHY/WHAT/BECAUSE mini-window for ALL content (P1/D1).

### 3. Gameplay Problems (the "press W and win" family + realism)

- Unfailable: 30, 31, 32, 45, 46, 47 — "devastatingly easy… for 3-year-olds."
- Duplicates: 31 = 30; 32 = 30 in the dark; 25 ≈ 5 — perceived-value damage ("the platform is a scam").
- Unenforced rules: overtaking freely past the truck (42); nothing sudden in the "sudden" drill (25).
- Under-realized scenarios: one-car „Колона" (40); not-narrow „Тясна улица" (49); very slow lead car (38); unmotivated hard braking (35).
- Physically impossible demands: motorway ≤140 with an 87 governor cap (37).
- Conflicts that pass before the player arrives (15, 16, 17, 18) — waiting for nothing.
- Steering feels too sharp (38) — noted, explicitly not to be changed lightly.

### 4. Educational Problems

- No mistake-experience anywhere: the founder's core demand (twice) — let the user MAKE the mistake and see the consequence, not only perform correct acts (P2/D2).
- No why-window: no drill explains WHY/WHAT/BECAUSE (P1/D1) although templates already carry teach text + lawRefs.
- Grading rules the world never communicated: caps without signs (30–34, 36), bans without paint/signs (50) — teaches HUD-obedience, not road-reading.
- Knowledge assumed, never taught in context: controller postures (20 — P4/D5).
- Duplicate and empty drills teach that lessons are filler (25, 31, 32, 45–47).
- Missing actors erase whole lesson categories: occluded pedestrian (26), child-chases-ball inference (27), white-cane special care (28).
- False positives teach students to distrust the grader (39, 41, 48) — warning-blindness transfers to real cars.
- Actions without stimuli (35) and rules without reasons (42) produce non-transferable button-pressing.

### 5. Technical Problems (sync, triggers, wrong maps, missing signs, NPC timing)

- Render/engine desync: lamp renderer ignores `dark`/`flashingAmber`/redYellow modes and the live signalPlan (17, 18, 19, 21); lights absent where declared (10, 11, 29) — W-SIG.
- Trigger timing: clock-armed encounters vs player pace (15–18); roundabout grading window open after conflict resolved + end-of-lesson not firing (6) — W-TIME/W-FLOW.
- Input registration: glance pressed but "no scan" graded (13); wiper input with no effect (24); light-state read failure → false `HEADLIGHTS_OFF_IN_RAIN` (41) — W-COCKPIT.
- Distance measurement: warnings while visibly far (39, 48) — W-SPD honesty audit.
- Governor conflict: difficulty cap 87 under a 140-domain lesson (37) — W-SPD.
- Wrong maps/placement: extra car on the ghost line (12, 14), stop marker misplaced (14), shadow path through a stopped car (9), zebra placement dubious (29), street not narrow (49), dashed paint on ban road (50) — W-WORLD.
- Navigation/reset: back-to-dashboard error (5), landing-page misroute (23), broken repeat (22) — W-FLOW.
- Render artifacts: indicator dark spots (4), marker dark spot (24).
- Rear-view channel: cockpit mirror renders nothing; chase POV hides the rear (44).

### 6. Visual Problems

- Traffic-light lamps: wrong or missing states in six lessons (S1 list).
- No wiper animation or rain-clearing (24); no visible headlight effect in rain (41).
- Indicator press → dark screen spots (4); dark spot in the stop-circle marker (24).
- Rear mirror renders nothing (44); tailgater invisible from chase (44).
- Ghost line color switch blue→green unexplained (15).
- Signs that ARE the lesson absent or too small — founder mandate: BIG and unmissable (9, 12, 14, 33, 34, 36, 50).
- Controller NPC too small/simple (20); zone context is one building (33); street visually not narrow (49).
- Road paint contradicts the rule (50).

### 7. Missing Content (complete register — cross-referenced with CLAIMS.md)

**Actors/rigs (CLAIMS needs-asset; priority RAISED by this review — they make drills "completely wrong," not under-dressed):**
- Bus rig (26 „Иззад спрял автобус"; also „Автобусът потегля от спирката" renders a box truck)
- Child pedestrian variant + ball prop (27)
- White-cane prop (28)
- Motorcycle rig („Мотор в мъртвата зона" renders a car)
- Column vehicles — 2+ staged cars for „Колона" (40; CLAIMS open decision)
- Larger, better-posed traffic-controller NPC (20)

**Signs & signals missing in-world (this review):**
- Б2 STOP sign (9, 12, 14) · traffic lights (10, 11, 29) · "30"-zone entry/exit signs (33, 34) · 50 sign before the curve + А1 curve warning (36) · В24 no-overtaking + solid М1 line (50) · speed-zone chain signs for the P5 redesign (30–32).

**Sign faces already on CLAIMS (needed by the above + future templates):**
- В25, В26-30/40, В28, А19, Д15/Д16, end-of-limit, „при мокра настилка" plate, advisory plates 40/50/60, В2, motorway exit boards.

**World dressing (CLAIMS + this review):**
- Rail/tram TRACK paint (every прелез/tram street is bare asphalt — signs exist, релси don't) · bus-stop dressing (навес/зигзаг/джоб) · bike-lane paint („Десен завой през велоалея") · door-open prop („Зоната на вратата") · motorway guardrail/мантинела · school/neighborhood context for Зона 30 (33) · genuinely narrow street geometry (49) · BUS lettering decal for bus lanes · held-scenery one-liners (sc-ac-night-overdrive stalled trailer, sc-hz-brake-dont-swerve debris, sc-ln-obstacle-meeting, sc-vu-door-zone timed door, aqua/ice parapet rects) · hazard-light blink on stalled scenery vans.

**Animations & effects:**
- Wiper sweep + rain clearing (24) · headlight beam/reflection effect in rain (41) · yellow-blink lamp animation (18) · red+yellow phase render (21) · dark-lamp render (17) · rear-mirror live render (44) · look-left/right edge-ping affordance (7, 13, 15) · consequence/crash reels for mistake-experience content (P2: 35, 42 and the theory redesign).

**Sound (nothing reported working; treat as open):**
- Indicator tick, wiper sound, rain audio differentiation, warning-tone honesty tied to the fixed distance thresholds.

**Tutorials & explanations:**
- Why-window (WHY/WHAT/BECAUSE) on ALL content (P1/D1) · controller-posture micro-quiz (20, P4/D5) · ghost-line color legend (15) · glance-mechanic onboarding (7, 13).

**Scenarios:**
- A real "sudden pedestrian" distinct from the base zebra (25) · red-runner defensive-check scene (founder's theory-redesign example) · mistake-experience variants of: zebra without stopping, no-mirror turn, ignored stop sign, speeding into a corner, tailgating, forbidden overtake (P2 list) · escalating speed-zone road (P5).

### 8. Repeated Problems (grouped once, not re-listed)

| Group | Occurrences | Root cause / wave |
|---|---|---|
| Wrong maps | 12, 14 ("the wrong map"), 29, 49, 50 | Template↔map variant mismatch; W-WORLD |
| Missing signs | 9, 12, 14, 33, 34, 36, 50 | World never received the sign the copy/grader references; W-WORLD |
| Unsynced lights | 10, 11, 17, 18, 19, 21, 29 | Lamp render not reading graded modes/plan; W-SIG |
| Early-spawning cars | 15, 16, 17, 18 (+6's late window) | Clock-armed encounters tuned to ghost pace; W-TIME |
| Look-left/right mechanic | 7, 13, 15 | Glance = fake button outside cockpit; registration bug at 13; W-COCKPIT + S5 affordance design |
| Cockpit-only interactions | 4, 24, 41, 44 | Cockpit channel (indicators, wipers, lights, mirror) not rendered/read truthfully; W-COCKPIT |
| Blue-path (ghost/shadow) issues | 9 (clips through car), 12/14 (car on line), 15 (blue→green switch) | Trace recorded against a different world state; no trace-vs-collider validation; W-WORLD |
| Dashboard navigation | 5 (error), 22 (repeat), 23 (landing page) | Post-lesson routing/reset path; W-FLOW |

---

## Part D — Platform Improvement Roadmap

Requirements, not wishes — each grounded in machinery that already exists
(teach-first engine `platform/src/modules/sim/scenarios/{policy,coach}.ts` +
`lessons/engine.ts`; per-template `lawRefs` + teach copy; trace/ghost system doc
76 §5 with red-ghost mistake branding; learner model
`platform/src/modules/learning/{readiness,simFeed,store}.ts`; 18,396-variant
exam bank doc 72 §16; 150 scenario templates; MicroQuizOverlay pause-card
pattern). Master backlog with horizons/effort: doc 64.

1. **Better tutorials.** Every drill SHALL open with a 1-screen "what you will do and why" card generated from the template's existing teach text + lawRefs (D1 data is already in the templates — this is UI).
2. **Micro-learning moments.** In-context pause-quizzes at the point of need (controller postures first — P4), reusing the existing MicroQuizOverlay pause pattern; wrong quiz answers feed the learner model like practice answers.
3. **Replay system.** Every attempt is already a kinematic trace by design (doc 76); requirement: record the STUDENT's trace and replay it with violation markers on the timeline (attempt-compare view is doc 76's planned tuning tool — productize it).
4. **Mistake demonstrations.** Red-ghost demos (doc 76 §5: incorrect demos visually branded, narrated, never scored on performing the wrong way) attached per template — the D2 program.
5. **Before/after examples.** Two-trace playback: the student's failed attempt vs the blue ghost's correct line, side-by-side or overlaid (both traces exist once item 3 ships).
6. **Animated explanations.** The why-window (P1) SHALL support a short animation slot per template; sourced from the same trace machinery (ghost snippets) before any bespoke video work.
7. **Mini quizzes.** 1-question checks after teach moments (alpha-recon doc 04 §4 pattern), answers written to concept mastery in `modules/learning`.
8. **Instructor voice.** Scripted, retrieval-grounded voice lines per event (ADR-002: LLM for dialogue, NEVER free-recall of law — citations from the content bank); start with pre-recorded/TTS lines keyed to the existing HudEvent kinds (doc 25).
9. **Better NPC behaviour.** P6/D6: bus, child+ball, white cane, controller; then the doc 65 Phase-2 actor library (cyclist, tram, bus-pullout, emergency vehicle) on the existing traffic brain.
10. **Realistic traffic timing.** W-TIME's player-relative arming as a platform-wide invariant: no encounter may be armed by wall clock alone; CI slow-drive run per template.
11. **Better camera system.** Fix the POV gaps this review exposed (18, 44): junction-framing assist, working mirrors, chase-POV rear awareness; longer term the doc 73 cockpit glance/head-turn model.
12. **Adaptive difficulty.** Feed violation/commendation streams (already flowing per-session) into `modules/learning` readiness to select drill variants and pressure levels (doc 30); the difficulty governor MUST become per-lesson-domain aware (QA-37) before it can be adaptive.
13. **Scoring improvements.** Honesty first (W-SPD audit: 39, 41, 48); then richer positive feedback on top of the 6 existing commendations (CLEAN_DRIVING, YIELDED_TO_PRIORITY, …) — students should finish knowing what they did WELL.
14. **Visual indicators.** Look-left/right edge pings (S5), ghost-line legend, big-and-unmissable lesson signs (S4 mandate), violation flash tied to the exact world object involved.
15. **Accessibility.** Colorblind-safe lamp/ghost palettes (never color-only: add position/shape cues to signal states), remappable controls, subtitle track for any instructor voice, reduced-motion mode — users are 17–18 and on varied hardware.
16. **Learning analytics.** Per-concept mastery already exists (152 concepts, `modules/learning` store); requirement: surface per-violation-code trends, time-to-first-mistake, and drill-family weak spots on the dashboard; feed the mock-exam readiness score (45/97/≥87/40min format is fixed).
17. **(Extension) Failability CI gate.** Every template must prove a naive run CAN fail (kills the QA-S3 class permanently).
18. **(Extension) World-truth CI gate.** Rendered signal state == graded state; every graded lawRef has its sign/marking present; traces never intersect colliders (kills QA-S1/S4/blue-path classes).
19. **(Extension) Session debrief.** End-of-session LLM debrief (ADR-002 dialogue role) over the attempt trace + violations, citing lawRefs from the content bank only.
20. **(Extension) Spaced repetition of failed drills.** Failed drill variants re-enter the queue via the learner model (simFeed already links sim results to theory concepts) — mistakes become scheduled review, not one-off events.
21. **(Extension) Exam-readiness dashboard.** Combine theory mastery + sim violation trends into one "ready for the real exam" view backed by the 18,396-variant bank for unlimited fresh mocks.
22. **(Extension) Sound design pass.** Honest audio channel: indicator tick, wiper rhythm, rain intensity, warning tones that fire only when warnings are true (post W-SPD).
23. **(Extension) Performance budget guard.** All of the above inside the doc 71 WebGL budget (16 GB dev box is the canary); no roadmap item ships that drops the sim below its FPS floor.
