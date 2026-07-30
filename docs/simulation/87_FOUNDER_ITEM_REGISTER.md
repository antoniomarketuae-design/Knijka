# 87 — The founder item register: every finding, atomised, one row each

> **Why this file exists.** The founder played catalog positions 1–50 and wrote up what he saw, by
> hand, in `150 verdict hand written most important.txt` (authoritative) plus two structured
> restatements (`rephrased.txt`, `brief.txt`). Doc 86 deduplicated those symptoms into **58 causes**
> and a fix wave closed 45 of them.
>
> **Deduplication is the right way to FIX and the wrong way to VERIFY.** A cause can be closed while
> the symptom the founder actually saw is still on screen — a marker moved but still wrong for that
> lesson, a sign built but not placed on his map, a fault disarmed but the lesson still hollow. He
> asked for the opposite pass: *"read every word carefully separate each, as individual tasks,
> revise see what is done and what is not, dont blindly believe on the code, go and see with your
> eyes."*
>
> So this register is **one row per thing he said**, in his order, in his words. Nothing merged.
> A row is closed only when someone has **rendered it and looked at it**.

## Verdict vocabulary — use exactly these

| verdict | means |
|---|---|
| `FIXED-SEEN` | Rendered, looked at, the symptom is gone. **A frame path is mandatory.** |
| `BROKEN-SEEN` | Rendered, looked at, the symptom is still there. **A frame path is mandatory.** |
| `PARTIAL-SEEN` | Rendered; improved but the founder would still complain. Frame mandatory. |
| `NOT-A-DEFECT` | Refuted with evidence. Cite the file:line or the pinned test. |
| `UNVERIFIABLE` | Could not be rendered. Say exactly what blocked it — never guess a verdict. |

**`FIXED-CODE-ONLY` is not a verdict.** If you only read the source, the row stays open.

---

## A · Global engine and UX (his opening section, before the lesson list)

| id | his words | verify by |
|---|---|---|
| **A1** | "there is still a warning standing push the R reverse gear and park in the cell, although we are on automatic mode … this warning shouldnt be there" | Open a parking drill in automatic. Read the prompt. Doc 86 §7 R3 says the prompt is *correct* (the sim's automatic is a real P-R-N-D box) and only the wording is manual-flavoured. Confirm the copy changed; if it still reads like a gearstick instruction, BROKEN. |
| **A2** | End-of-lesson popup "is kind of annoyting, we should allow users to skip it with space … also note them below that its skippable with space … and also there must a button at this note to allow user to choose if he wants to turn this off" | Finish any lesson. Three separate things: Space actually skips; a visible note says so; a persistent "don't show again" control exists and survives a reload. All three, or PARTIAL. |
| **A3** | "when I clicked skip this stage, and I intentionally made a mistake … it does not allow me to continue to the next questions … we should give users an option continue to next question although you made mistake and come back to this later" | Deliberately fail an objective. Try to advance. Ledger B9. |
| **A4** | "I tried to go from Advanced to Normal, and the engine turned off, and when I went back to Normal it did not turn on" | Switch tiers mid-scene both directions. Read the cluster. |
| **A5** | "in Normal mode, the speed limit is very low I can only go up to 30 Km per hour, we need to increase that" | Hold throttle on a straight in Нормален. Read the achieved top speed. Ledger L17. |
| **A6** | "those pop ups that appear on the right up of the screen … they need to be able to be removed when clicked with the mouse … we need a complete rework of those notifications" | **DESKTOP, not mobile.** Ledger L14 says mobile got the queue and desktop kept `pointer-events-none` with four 288px cards. Click one on desktop. |
| **A7** | "it said I stepped on the line, I suppose thats some middle marking line on the road, but in fact no such line exists at all there is just road and no marking" | Ledger T1 claims 90→0. Drive an unpainted road hard enough to trigger it and confirm nothing fires. |
| **A8** | "L5 is not working at all, there are no harsh conditions at all, nothing exists like L5 is completly dead just the shadow car is not there" | Open an L5 that exists. §7 R4: 106 of 154 show no L5 tile at all. Distinguish "no tile" from "dead tile". |
| **A9** | "Настъпване на осевата линия - major error, it say we step on some line that doesnt exist at all" | Same class as A7, separate row because he raised it twice — verify on a *second* map. |
| **A10** | Mid-drive quiz: "Кой от показаните знаци ПРЕДУПРЕЖДАВА отдалеч, че приближаваш пешеходна пътека?" showing "Знак 1 / Знак 2 / Знак 3 / Знак 4" — "There are no Actual Sign shown just written Sign 1 2 and so on" | Trigger the in-drive quiz. Ledger L1, Lane 5. `/dev/micro-quiz` exists now. |
| **A11** | "we can Ping somewhere on the screen with low brightness/contrast Press Q for Left View, pinging on the screen remind the user" | GlanceEdgePings.tsx exists but was gated to L1–L2 behind two flags. Does the cue appear where a glance is graded? |
| **A12** | "IN FACT MAJOR ERROR ANOTHER POP UP QUIZ APPEARED FOR SIGNS AND NO SIGNS ARE IN THE MINI POP UP QUIZZES NO PICTURES OF them WE NEED MAJOR FIX **WITH EYES IF ITS FIXED**" | His own instruction. A second, different sign question — not the same one as A10. |
| **A13** | "it said too fast approaching ZEBRA walk, when in fact there was no pedestrian crossing on the road" | `PEDESTRIAN_CROSSING_TOO_FAST` on a road with no crossing. |
| **A14** | "I am stopping on top of the green cyrcle we give to the users and nothing happens" | §7 R6: never a tolerance problem — a hidden speed cap (T8), a sub-lane radius (B3), or an earlier objective still holding the chain (B4). Stop on the marker and see. |
| **A15** | "the MAP it again has the 4 roundabouts which is unnaceptable" | §7 R2 refutes the count (6 rings in 90 districts; he is reading four *arms*). His *other* complaint — the geometry does not read as a roundabout — is NOT refuted. Look at it and judge. |
| **A16** | "NO pedestrian crossing on the road and its looking for it" | Crossing-dependent objective on a map with no crossing. |
| **A17** | "I am at the end of the Test/Exam and nothing happens so I am there stale, cant stop the exam, need to refresh the whole page, also the green line shadow line also dissapeared" | Drive an exam to its end. Ledger B1/B2/B3. |

---

## B · Lesson-by-lesson, in his order

> **Positions shifted.** Lane 15 inserted two parking drills at 5 and 6, so every position after 4
> moved **+2**. Both numbers are given: *his* number → *current* number.

| id | lesson (his № → now) | his words | verify by |
|---|---|---|---|
| **B1** | Урок 7 Паркиране | "a huge green shadow road/arrow pointing straight to the end of the street I start to accelerate and suddenly it dissapears and ask me to go back and park" | Drive it. Watch the guidance transition. |
| **B2** | platform-wide | "L2 L3 L4 L5 They have Nothing More" | §7 R5: L1→L2→L3 *does* differ; the inert pairs are L2/L3 and weather-only L5s. Play L2 then L3 on one scenario and see if they are the same lesson. |
| **B3** | parking | "it states it will give 2 tasks inside the Test/Exam/Quiz and its only 1 task when in fact it states 2" | Read the stated task count, count what you are actually given. |
| **B4** | parking | "we can think of many many many more parking variants 10 at least" | Count distinct parking situations now. Lane 15 added two. |
| **B5** | Урок 2 Кръстовища | "it said to me that I didnt let the traffic cars to pass, when in Fact I let everybody to pass and there where no cars on the road" | Yield to everything, then proceed. Does `FAILED_TO_YIELD` still fire? |
| **B6** | Урок 2 | "first it is stating drive straight and, do a stop before the Sign … But than I drive and In the middle of the road it states take right … you didnt turn your right signal … we have to warn that right is to be taken even before the stop sign" | Watch WHEN the turn is published relative to the stop line. Ledger L5. |
| **B7** | Урок 1 Подготовка (3) | 13 keyboard steps — "the moment I entered and I saw that I have to press 13 times different keyboard buttons I automatically stopped and skipped, we must make it user-friendly … first and upmost it must be with the mouse … a tutorial Pop up appears, and states what to do, with some reel tutorial showing, or even picture tutorial from real life scenarios … clickable with the mouse to the next stage … and also to be marked as done" | Open Урок 1. Can it be completed entirely with the mouse? Is there a tutorial panel per step? Does a step tick itself off? Lane 14. |
| **B8** | Полигон (4) | "Завиване без мигач — out of nowhere after loading of the screen this apppears" | Load it, touch nothing, watch for a fault. |
| **B9** | Полигон | "I start the Simulator, and instantly error appears" | Same class, second occurrence. |
| **B10** | Перпендикулярно паркиране на заден ход (1) | "all errors so far are from the states above" | Regression check only. |
| **B11** | Успоредно паркиране (2) | "all errors so far are from the states above" | Regression check only. |
| **B12** | Паркиране на 45° (3) | "For now its Ok" | Must STAY ok. Confirm no regression. |
| **B13** | Тясно гнездо (4) | "we can Ping … Press G for Eagle View, because its beginning and the user may not know of existing G option" | Does the eagle-view hint appear? Lane 14 / CameraAidHint.tsx. |
| **B14** | Пешеходна пътека (5) | "the Pedestrian at the end when he leaves the Zebra, he goes trough a car which is standing on the sidewalk" | Watch the pedestrian's full exit path. Ledger L9. |
| **B15** | Кръгово движение (6) | "it states I didnt let the vehicle pass and I tried 2 variants first I waited for the traffic car for 3-4 seconds, than I waited it for twice more and it still stated the error" | Wait, then enter. Repeat. |
| **B16** | Кръгово движение (6) | "this is not proper round-about it doesnt have the proper shape" | Look at the ring from above (`G`). Judge the geometry. |
| **B17** | Кръгово движение (6) | "I went to the end of the course and the course didnt finish, because I did mistakes earlier … now i`m stuck here and cant finish or go to the next lesson" | Fail an objective early, then complete the route. |
| **B18** | Кръгово движение (6) | "the green cyrcle … is actually putted after the stop marked line on the road … I know I have to stop before the line not after it, where currently the green cyrcle shadow line is at" | Measure the marker against the painted stop line. Ledger T3/T3b. |
| **B19** | Q6 at L5 | "same question 6 just this time L5 - and it has no difference at all" | Play 6 at L1 and at L5 back to back. |
| **B20** | platform-wide | "if we make the Dashboard clickable its gonna be user-friendly for example to put seat belt with B and with Mouse click over the Dashboard seat-belt icon, and like that for all the buttons on the dashboard" | Click each cluster control with the mouse. Hotspots exist in VitokCockpit.tsx but cockpit-camera only. |
| **B21** | 7 Смяна на лента (7→9) | "he must press almost at the same time few buttons … he has just a second which is almost impossible for normal users" | Time the window between the trigger and the graded deadline. |
| **B22** | 7 at L5 | "i crossed the green cyrcle we put and nothing happens after that" | Same as A14 but on this lesson's L5. |
| **B23** | 8 Предимство отдясно (8→10) | "the traffic car is quite quick and its only 1 so by the time I reach the crossroad it already has passed, should there be at least 1 more" | Drive at the taught speed. Is a car still there? Ledger L7. |
| **B24** | 9 Знак Стоп (9→11) | "the green shadowroad we put is stating we continue straight, when in fact we have to take right … the moment I cross the marking on the road after the stop line the green line changes to right" | Same class as B6; separate lesson, separate row. |
| **B25** | 10 Светофар (10→12) | "the green line continues and stops at the middle of the crossroad and forms the cyrcle there … not before the traffic light" | Ledger T3. Look at where the ring sits. |
| **B26** | 11 Ляв завой срещу насрещно (11→13) | *(no complaint)* | Must STAY clean. |
| **B27** | 12 Оглеждане на кръстовище (12→14) | "it is stating that there is Sign Stop, when in fact there is no stop sign" | Look for the sign. |
| **B28** | 12 | "it is also asking the user to look left and right to see if there are traffic cars, but in fact the road is empty and there are no traffic cars moving at all on the map ever" | Ledger T9 — the scenario staged nothing. Count actors. |
| **B29** | 13 Б1 не значи спри винаги (13→15) | "If i stop at the green cyrcle I cant see the car coming on the right because of the cars that have stopped on the side walk" | Ledger T6. Stop on the marker and look right. |
| **B30** | 13 | "the car is very far away and I looked but I didnt see it at all" | Is the conflict car perceivable from the stop? |
| **B31** | 13 | "If I dont stop on the green cyrcle I cant do anything I must do violation and have to go back to the green cyrcle" | Stop somewhere with a *better* sightline. Does it accept? Ledger B5. |
| **B32** | 14 Стоп и преценка (14→16) | "it is saying that there iS B1 sign and B2 Stop sign but there are no Signs on the map" | Look for both. |
| **B33** | 15 Ограничена видимост (15→17) | "if I drive under 22 as it states, the traffic car passes long before I reach the crossroad" | Obey the instruction. Ledger L7. |
| **B34** | 16 Ляв завой от Б2 (16→18) | "B2 - or Stop Sign nothing is there on the Map … there are no actual street signs anywhere on the map" | Look. |
| **B35** | 17 Загаснал светофар (17→19) | "It says stopped working traffic light, but in fact no traffic light exists on the map" | Ledger L2 — heads were 1× on a 2.5× world, and a DARK head had no unlit read. Look for a dark head. |
| **B36** | 17 | "the traffic car crossing much quicker before I reach the crossroad" | Timing again. |
| **B37** | 18 Мигащо жълто (18→20) | "says the traffic light is pinging yellow, but in fact there is no traffic light at all" | Look for a flashing-amber head. |
| **B38** | 18 | "the time I reach the crossroad the traffic car has already passed no second car, no third car nothing" | Timing. |
| **B39** | 19 Спане на зелено (19→21) | "no traffic light exists on the map nothing" | Look. |
| **B40** | 19 | "who ? who is sleeping on green … its pritty simillar to previous both questions" | Does this drill teach anything the two before it do not? |
| **B41** | 20 Регулировчик (20→22) | "we must rework the Traffic Officer which we will do with blender, but I have to state we spoke aswell that we will make them bigger but I now see you have not done that" | Measure the officer against a car. Ledger L4 — rescaled, verify. |
| **B42** | 20 | "each position the traffic officers shows on top of his head some bubble must appear stating what exactly he is pointing, who is he letting go, whos turn its to pass" | **Ledger says NOT DONE.** Confirm and fix. His third-most-repeated ask. |
| **B43** | 21 Тръгване на червено-жълто (21→23) | "no traffic light exists at all" | Look. |
| **B44** | 21 | "the green line again is stopping at the middle of the crossroad and the cyrcle is at the center" | Ledger T3. |
| **B45** | 22 Изчакай пътеката (22→24) | "we must maybe add 1-2 more pedestrians" | Count pedestrians. |
| **B46** | 22 | "the pedestrian exits the zebra crossing and goes trough some car" | Watch the exit path. |
| **B47** | 23 Бавен пешеходец (23→25) | "when the pedestrian exits the zebra cross roads he passes like a ghost trough some car" | Third occurrence — verify separately. |
| **B48** | 24 Пътека в дъжд през нощта (24→26) | "it is night and it is not stating that the user must turn on his front lights" | Ledger L10 — 38→16, so it may still be in the tail. Read the instructions. |
| **B49** | 24 | "ghost crossing trough stopped car" | Fourth occurrence. |
| **B50** | 25 Внезапен пешеходец (25→27) | "the pedestrian waits for the user car to get closer than he starts moving on the zebra, so basically its same map, same engineering, everything same" | Compare against 22/23. Does it teach anticipation differently? |
| **B51** | 26 Пешеходци иззад камион (26→28) | "the question statements says Pedestrians behind a Truck, and in the map engineering its only 1 Pedestrian Crossing" | Count. Is there a truck to be hidden behind? |
| **B52** | 27 Дете тича след топка (27→29) | "Weak visualisation, we must point that we must re-work with blender kids as well" | Look at the child mesh. Ledger C2 — placeholder. |
| **B53** | 27 | "the engineering of the map is weak same thing same map, already 5-6 different questions" | Compare districts across 22–28. Ledger D1 said 7 identical maps; Lane 10 was to fix it. |
| **B54** | 28 Пешеходец с бял бастун (28→30) | "absolutely same as question 23 - slow pedestrian, just this time … changed the visualisation from pedestrian to old pedestrian" | Compare 25 and 30 directly. |
| **B55** | 29 Пешеходец на червено (29→31) | "No traffic light Exists again on the map and instantly error appeared … there must be traffic light for us to follow, but also a traffic light that the pedestrian follows" | **Ledger L3 says the pedestrian signal head does not exist anywhere in the simulator and no lane owned it.** Confirm, then fix. |
| **B56** | 30 Скорост в дъжд (30→32) | *(no complaint)* | Must STAY clean. |
| **B57** | 31 Пълзящо превишаване (31→33) | "there is written 30 on the road as marking but in fact no actual Sign stating 30 exists on the sidewalk … just written with numbers on the road 30 which is not existing in the world almost anywhere" | Ledger T4 claims 83→0 and Lane 3 built twelve numerals. Look for a real В26-30 post. |
| **B58** | 32 Превишаване над +10 (32→34) | *(no complaint)* | Must STAY clean. |
| **B59** | 33 Зона 30 училище (33→35) | "no Sign on the Sidewalk stating 30 km/h just a marking on the road" | Look. |
| **B60** | 33 | "the question is stating School zone, but in fact no kids are playing on the sidewalks and we should do that it will attract the user to watch closely" | Count children. |
| **B61** | 33 | "I see only Normal Buildings living/office building no actual school when the question states there should be School … either build schools and put and name them school, or find some solutions" | Look for a school building. |
| **B62** | 34 Преход 50→30 (34→36) | "No street signs, No sign stating 50 km/h, no Sign stating 30 km/h" | Look for both. |
| **B63** | 34 | "this questions is absolutely same as 31 no difference at all" | Compare 33 and 36 directly. |
| **B64** | 35 Рязко спиране (35→37) | "the question states stopping out of nowhere, but why ? Why do we stop out of nowhere isnt it better to have some reason" | Is there now a cause? He also warned: check it does not duplicate another lesson. |
| **B65** | 35 | "I see many issue with the Map its very Raw, boring" | Judge the map. |
| **B66** | 36 Скорост в завой (36→38) | "no sign exists, not 90 not 50 and it says there should be sign A1" | Look for А1 and the limits. Ledger T14 — partial, 10→4. |
| **B67** | 37 Магистрала (37→39) | "no matter how fast I want to go … I cant go more than 100 - 105 km/h and the theory question already ends before even I can accelerate and it is stating go below 125 … the car must go much much beyond 160-180 km/h" | Hold throttle. Read the top speed. Ledger L17/B7. |
| **B68** | 38 Дистанция на следване (38→40) | *(no complaint)* | Must STAY clean — but §12.5 says its shadow was demonstrating 1.23 s inside the fire line and now holds 2.60 s. Verify. |
| **B69** | 39 Внезапно спиране (39→41) | *(no complaint)* | Must STAY clean. |
| **B70** | 40 Дистанция в колона (40→42) | "the column is waiting at the end of the road so basically the user just drivers on a road and nothing much happens untill the very end … have to find solution to make it more interactive" | Drive it. Does anything happen before the end? |
| **B71** | 41 Дистанция в дъжд (41→43) | "when its raining as stated but it is also sunny, the road is reflecting the sunlights and the car lights which must be turned on are not visible so we receive an error lights are not on, than we turn them on and nothing changes" | **Ledger C1 — rain was never rendered and looked at by anyone.** Render it. Two things: does it look like rain, and do the headlights visibly change anything? |
| **B72** | 42 Зад камион (42→44) | "just hold below 30km/h … the truck is seeing what the user car km/h is and is accelerate propotionally but this is making the truck follow the truck car not the car to follow the truck and it is very straight forward easy and boring" | Ledger T17 — `matchPlayer` rubber band. Drive it and watch whether the truck reacts to you. |
| **B73** | 43 Вклиняване (43→45) | "the car on the right … does not have Right signal turned on, it is turning on the right signal very very very late" | Ledger L6 — staged NPCs had no indicator channel at all; L8/L11 say the renderer handoff is still open. Watch the indicator. |
| **B74** | 44 Лепка отзад (44→46) | "I drive from the back of the car POV and I dont see Rear Mirror at all … we must put Rear Mirror some small window in the POV" | Ledger L16. Also doc 82's black-mirror bug. Look in the mirror. |
| **B75** | 44 | "the car behind that is sticking to the user car is sticking very late, it must be sticking much earlier" | Time the tailgater's arrival. |
| **B76** | 45 Дръж вдясно (45→47) | "I press E but nothing much is seen because it only slides abit the POV … we must pop some Small window on the screen … which small window will be rear view window showing whats happening behind … not more than 10% of the screen" | Press Q and E. Is there a window, or just a camera nudge? |
| **B77** | 46 Средата на лентата (46→48) | "there is no actual markin on the road showing which lane is which, and in fact it popping up a window saying good job you kept your lane, but in fact there are no lanes on the roads" | Ledger T1. Either paint the lane or stop grading it — and he must not be congratulated for keeping a lane that is not drawn. |
| **B78** | 47 Еднопосочна улица (47→49) | "there must be sign stating to go left or right, so we have missing Sign … There are specific Signs for one way roads, they are Blue with White Arrow Pointing forward and I still havent seen them anywhere yet" | Look for the blue one-way sign. **Gate budget lists WRONG_WAY 19 scenarios / 88 rungs still convicting because the В1 mouth faces were never built.** |
| **B79** | 48 Изпреварване на пътека (48→50) | "I recieved an error I have been tailing him too close and In fact I wasnt that close" | Ledger T18. Drive a lawful gap and confirm no fault. |
| **B80** | 49 Разминаване в тясна улица (49→51) | "there was a traffic car infront of me moving which I didnt let pass no error appeared" | **Under-detection.** Ledger D12 — never swept. |
| **B81** | 49 | "there are no marking on the roads. This marking on the roads is major issue which has to be globally fixed aswell" | Ledger T1/T16. |
| **B82** | 50 Изпреварване при забрана (50→52) | "missing sign on the road, no Signs at all and the description is stating there is sign B24" | Look for В24. |

---

## C · P0–P7 mobile wave, from the R0 review

| id | finding | verify by |
|---|---|---|
| **C1** | The landing state is a 100%-of-viewport modal with three more painted surfaces on it — 0% road, **unchanged by the whole wave**. R0: *"the redesign is real; it is hiding behind the one popup he named."* | Open a lesson on a phone profile. Measure the first frame. |
| **C2** | Four hit targets under 44 px: three tier pills at 24.5 px tall, the Демонстрация pill at 26.5. | Measure. Note the pills are also the largest chrome contributor — a real trade. |
| **C3** | `/theory`'s fold selector has matched **nothing** since phase 6 — the check has been reporting a pass on a test that does not run. | Fix `tools/mobile/lib/routes.mjs`, then confirm the check can fail. |
| **C4** | Practice runner screen share fell 73.4% → 51.6% — the card is sized for the six-option worst case, so an average question wastes 41% of the phone. | Measure both a 4-option and a 6-option question. |
| **C5** | `theory-practice` in **landscape** fails the fold outright: 479 px of scroll, options overflow 334 px. | Rotate the phone. |
| **C6** | The shell hamburger is 38×38 on every dashboard route, both orientations, both phone sizes. | Measure. |
| **C7** | Both speedometers are in frame at once in the default cockpit camera — the 3D cluster and the DOM readout. | Look at one frame. Should be conditioned on camera mode. |
| **C8** | Portrait driving shell settles in 1,198 ms against a 1,200 ms budget. Two milliseconds. | Re-measure; decide whether to fix or widen with a reason. |

---

## D · What he asked for that is not a bug

| id | his words | note |
|---|---|---|
| **D1** | "Multiple Agents must be send trough all the questions: And revise what the question states and the availability of the map if everything syncs and exists" | Done — doc 86. This register is the second pass he asked for. |
| **D2** | "it also has to go in the Theory can`t review manualy 1050+ Theory Questions its impossible" | The machine-checkable half (does a question that promises a picture have one) was scoped in doc 86. Legal correctness still needs a human. |
| **D3** | "we can use real live videos for this Tutorials aswell, or we can generate from Higgsfield API which we have or from atlas,poyo,fal API keys" | Blocked: Atlas 402, FAL −0.21 and locked, Poyo has no text/video entitlement for this. Lane 14 ships stills that swap for clips with no rework. |

---

**Total rows: 17 global + 82 lesson + 8 mobile = 107.**
Every one needs a verdict from the list at the top, and every `FIXED-SEEN` / `BROKEN-SEEN` /
`PARTIAL-SEEN` needs a frame path. A row without a frame is not verified.
