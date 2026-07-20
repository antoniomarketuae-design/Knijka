# 62 · Founder review R3 — the first 50 drills (2026-07-20)

The founder drove drills 1–50 and reviewed each. Verdict: "not happy because I
expected more, not dissatisfied because work has been done." This document is
the durable record he ordered („all this has to be in an MD file… so no matter
compaction the project is correctly expanded"). It is the working spec for the
next program. Sections: (1) the systemic failures his 50 points collapse into,
(2) his design principles — VERBATIM intent, (3) the per-drill log, (4) triage.

## 1. The systemic failures (the 50 symptoms → 6 root causes)

S1. **SIGNAL RENDER DESYNC.** What the traffic light SHOWS and what the engine
GRADES come from different paths. Seen as: green light graded as red (#17
„Загаснал светофар" — a DEAD-light drill showing a live green!), no yellow
blink on „Мигащо жълто" (#18), green never returning (#19), redYellow drill
showing green (#21), "no traffic light on the map" (#9, #10, #12). The signal
MODES (dark/flashingAmber) and the live signalPlan pin exist in the runtime —
the lamp RENDER path does not read them. One render bug, six broken lessons.

S2. **STAGED-CAR TIMING vs LIVE PACING.** Conflict cars the player must yield
to pass "very very early" — before the player even reaches the line (#15, #16,
#17, #18). The encounters were tuned to the GHOST's pace; a slower live player
arrives at an empty junction and "waits for nothing." Encounters must arm off
PLAYER approach, not a clock.

S3. **UNFAILABLE DRILLS ("press W and win").** #30, #31, #32, #45, #46, #47:
straight road, hold W, quiz done. "This is for 3-year-olds, not people about
to become drivers… devastatingly easy." A drill where no mistake is POSSIBLE
teaches nothing (and #31 duplicates #30 outright, #32 is #30 in the dark).
North-star violation: the founder's quick hint (twice): **make simulations
where the user makes an actual mistake so he knows what's wrong, not only
does right things.**

S4. **THE WORLD STILL BREAKS ITS PROMISES** (the audit fixed copy; the founder
wants the WORLD fixed): no STOP sign on the stop-sign lesson (#9), no Б2 where
copy says stop at Б2 (#12, #14), no "30" sign in the 30-zone (#33, #34), no
50 sign before the curve (#36), overtake-ban road still PAINTED as
overtake-allowed dashed (#50), bus/kid/ball/white-cane still absent (#26–28 —
known needs-asset, but the founder's word is "cheap… this refers to all the
questions so far"). Signs that ARE the lesson must be BIG and unmissable.

S5. **COCKPIT/POV CHANNEL GAPS.** Indicator press → dark spots on screen (#4).
Wipers = a button with no wipers (#24). Headlights in rain = no visible
difference + a false HEADLIGHTS_OFF_IN_RAIN after turning them on (#41).
Cockpit rear mirror shows NOTHING (#44). Rear tailgater invisible from chase
POV (#44). Glance buttons meaningless outside cockpit (#3 „Смяна на лента",
#13, #15): "pressing a button with no meaning — remove it or make it real."
Needs on-screen look-left/look-right affordances (pinging edge indicators).

S6. **FLOW/NAVIGATION BUGS.** „Назад към таблото" errors after „Пешеходна
пътека" (#5); at #23 it lands on the LANDING page, not the dashboard/last
position. „Повтори" does not restart (#22). Roundabout graded a mistake after
the circulating car had passed, and reaching the end did not end the lesson
(#6). Shadow path clips THROUGH a stopped car (#9). Extra car parked ON TOP of
the shadow line (#12, #14 — "the wrong map"). Ghost line switches blue→green
mid-route with no explanation (#15). Motorway drill demands ≤140 while the car
physically cannot exceed 87 (#37 — difficulty governor caps under the lesson's
own speed domain). Distance warnings that feel wrong (#39, #48). „Колона" =
one car (#40). #43 „Вклиняване" — cutting car gives no indicator (founder
accepts as real-life, noted). #49 street not actually narrow.

## 2. The founder's design principles (bind future work to these)

P1. **The WHY-WINDOW (ordered for ALL content):** "For ALL the
questions/solutions/tasks there should be a mini window showing WHY, WHAT and
BECAUSE — the reason for all the things in the platform."

P2. **Mistake-first learning:** simulations where the user EXPERIENCES the
mistake (crash reel, consequence scene), not only performs the correct act.
On wrong answers in theory: a popup slideshow / mini-reel showing the exact
error. On right answers: a scene showing WHY it was right (e.g. green light +
intruder car → you stopped → show the crash you avoided).

P3. **Interactive theory practice:** picture questions ("what sign is this",
4–5 options), scenario pictures (turning car — signal/wait/yield?), zebra
scenes — not raw press-correct/wrong which is "raw, not interactive, boring."

P4. **Micro-tutorials in context:** e.g. at the controller junction, a popup
quiz with 4–5 pictures of controller postures and their meanings BEFORE the
player must obey one (#20 — "does the user know the signs of the traffic
regulator?").

P5. **Escalating speed-zone design** (#30): a LONG road: sign 50 → hold under
50 → sign 30 → drop to 30. Signed, staged, failable — not an empty cap.

P6. **Better NPC actors where the actor IS the lesson** (#20 controller too
small/simple; #26 bus; #27 child+ball; #28 white cane).

## 3. Per-drill log (founder's findings, condensed)

1–2. Перпендикулярно/Успоредно паркиране — OK.
3. Паркиране на 45° — OK.
4. Тясно гнездо — indicators produce DARK SPOTS on screen when pressed.
5. Пешеходна пътека — „Назад към таблото" → error.
6. Кръгово — graded a mistake after the circulating car had passed; reaching
   the end did not finish the lesson.
7. Смяна на лента — rear-check = meaningless button press outside cockpit;
   "remove it or make it real."
8. Предимство отдясно — OK.
9. Знак Стоп — NO stop sign on the map; shadow path clips through a stopped
   car; player must go around a car the ghost ignores.
10. Светофар — no visible traffic light; shadow stop mid-road, not at a light.
11. Ляв завой срещу насрещно — no light; error occurred.
12. Оглеждане на кръстовище — extra car ON the shadow line; no Б2 sign though
    copy demands stop at Б2.
13. Б1 не значи спри винаги — glance buttons only meaningful in cockpit; 2nd
    mouth graded "no scan" though player pressed the buttons; needs on-screen
    look-left/right pings + visible glance affordance.
14. Стоп и преценка на интервала — wrong map (extra car), stop marker wrong.
15. Ограничена видимост — right-arriving car passes long before player
    arrives; blue→green ghost switch unexplained.
16. Ляв завой от Б2 — conflict car passes before player reaches the sign.
17. Загаснал светофар — light shows GREEN, graded as red; car passes early.
18. Мигащо жълто — no yellow blink; car passes early; POV sees too little.
19. Спане на зелено — green appeared once, never again; drill unplayable.
20. Регулировчик — works, but NPC too small/simple; add the posture
    micro-quiz (P4).
21. Тръгване на червено-жълто — light shows green; question incomprehensible
    as experienced; revise whole drill.
22. Изчакай пътеката — „Повтори" does not restart.
23. Бавен пешеходец — „Назад към таблото" → LANDING page.
24. Пътека в дъжд през нощта — wiper button does nothing visible; dark spot
    inside the stop-circle marker.
25. Внезапен пешеходец — 95% identical to the basic zebra drill; nothing
    sudden.
26. Иззад спрял автобус — NO BUS AT ALL; plain zebra. "Funnily wrong."
27. Дете с топка — no kid, no ball; plain zebra; "completely wrong."
28. Бял бастун — same adult, no cane, just slower; "useless… cheap."
29. Пешеходец на червено — NO traffic light at all; zebra placement dubious.
30. Пълзящо превишаване — empty road + a cap; see P5 for the redesign.
31. Превишаване над +10 — IDENTICAL to #30; "if a user sees this he will
    start to feel the platform is a scam."
32. Скорост в дъжд през нощта — #30 in the dark.
33. Зона 30 — no 30 sign, no school, no neighborhood; one building.
34. (next zone drill) — same: signs stating the zone are MISSING.
35. Рязко спиране — braking with no visible reason; stage the reason or show
    the consequence reel (P2).
36. Скорост в завой — says ≤92, then pops ≤50; copy claims an А1+50 sign that
    does not exist on the map.
37. Магистрала — demands ≤140; car cannot exceed 87 (governor).
38. Дистанция на следване — lead car very slow; steering feels too sharp
    (note, do not change lightly).
39. Внезапно спиране — distance warning fired while visibly far.
40. Колона — "line of cars" is ONE car.
41. Дистанция в дъжд — lights-on has no visual effect; HEADLIGHTS_OFF_IN_RAIN
    fired again AFTER turning lights on.
42. Зад камион — nothing stops you overtaking; the "stay behind" has no
    enforcement or taught reason (consequence reel per P2).
43. Вклиняване — no indicator from the cutting car (acceptable as real-life;
    noted).
44. Лепка отзад — tailgater invisible from chase POV; cockpit REAR MIRROR
    SHOWS NOTHING.
45. Дръж вдясно — starts already right, straight road; nothing to do.
46. Средата на лентата — hold W to win.
47. Еднопосочна улица — hold W to win.
48. Изпреварване на пътека — "too close" error while visibly far.
49. Тясна улица — street not narrow; a bus makes it "abit" tight.
50. Изпреварване при забрана — road MARKING shows dashed (=allowed) on the
    ban map; no В24 visible reason; "the map is wrong."

## 4. Triage

**BUG WAVES (mechanical, start immediately):**
W-SIG signal render desync (S1) · W-TIME staged-car player-relative arming
(S2) · W-COCKPIT indicator dark spots, wipers, rain lights + false positive,
rear mirror, tailgater visibility (S5) · W-FLOW navigation/repeat/end-of-lesson
bugs (S6) · W-WORLD missing stop/Б2/zone signs, ban-map line paint, shadow-
line collisions, marker placement (S4) · W-SPD governor vs lesson speed domain
(#37) + distance-warning honesty check (#39/#48).

**DESIGN PROGRAM (founder-engaged, after the bug waves):**
D1 why-window on every drill (P1 — template teach/lawRef content exists; UI
needed) · D2 mistake-experience content (P2 — consequence scenes/reels) · D3
unfailable-drill redesign (S3+P5 — the speed/lane family gets signs, zones,
staged pressure, failability) · D4 interactive theory (P3 — picture/scenario
question types) · D5 micro-tutorials (P4 — controller postures first) · D6
actor upgrades (P6 — bus, child+ball, cane; already on CLAIMS).

**Already-known overlaps:** #26/27/28 need-asset items were already on
CLAIMS.md — the founder's review confirms their priority is HIGHER than
listed; they make drills "completely wrong," not merely under-dressed.
