# CLAIMS — the work-item claim board (doc 61 fallback + seed backlog)

Primary claiming happens on GitHub Issues (self-assign BEFORE the first edit).
This file is (a) the offline fallback — append `- <item> — <name> — <date>` on
a pushed branch before starting — and (b) the seed backlog below, ready to be
converted into Issues.

## Claimed / in progress

- (add yours here)

## Backlog — from the 2026-07-19 world-truth audit + session follow-ups

### Needs an asset (model/texture/sign face)
- [ ] Bus rig (renders as box truck in „Автобусът потегля от спирката"; absent in „Пешеходци иззад спрял автобус")
- [ ] Motorcycle rig („Мотор в мъртвата зона" renders a car)
- [ ] Child pedestrian variant + ball prop (child-dart drills render one adult, no ball)
- [ ] White-cane prop for „Пешеходец с бял бастун"
- [ ] Sign faces: В25, В26-30/40, В28, А19, Д15/Д16, end-of-limit, „при мокра настилка" plate, advisory plates 40/50/60, В2, motorway exit boards
- [ ] Rail/tram TRACK paint (every прелез/tram street is bare asphalt — signs exist, релси don't)
- [ ] Bus-stop dressing (навес/зигзаг/джоб)
- [ ] Bike-lane paint for „Десен завой през велоалея"
- [ ] Door-open prop for „Зоната на вратата"
- [ ] Motorway guardrail/мантинела

### Needs render wiring (cheap; the m8 pattern — visuals driven by graded data)
- [ ] BUS lettering decal for bus lanes
- [ ] Held-scenery one-liners: sc-ac-night-overdrive stalled trailer, sc-hz-brake-dont-swerve debris, sc-ln-obstacle-meeting, sc-vu-door-zone timed door, aqua/ice parapet rects
- [ ] Hazard-light blink on stalled scenery vans

### Needs a decision (founder)
- [ ] В27 auto-posts on lessons teaching „забраната важи БЕЗ знак" — signless flag for law-implied zones?
- [ ] School patrol: multi-child group + lowering paddle vs re-scope
- [ ] „Column" pressure copy on empty streets: stage 1–2 scenery cars or keep singular copy
- [ ] sc-crossing-bus-shadow: staged held truck at the BUS_OBSTACLE rect until a bus rig exists (spec change → trace gates deliberately)
- [ ] М2 marking-code contradiction (dashed vs wide-solid-edge — two generators, both cite Наредба № 2)
- [ ] Bus-pullout lawRef divergence (чл. 67 / 68? / 69? across three sources)
- [ ] Green-but-1★ CTA behavior (next-scenario vs force-unlock next level)

### Engine / content follow-ups
- [ ] sc-mfp-stream / sc-mfp-stream-2: hold.offsetM 0 collapses the 3-car stream to a clump (harmless but dishonest — retune to a deep positive head)
- [ ] accelerationLane zone kind → keep-right exemption (merge-wave engine ticket)
- [ ] Multi-flip SignalControllerSchedule (controller drill wants halt→proceed→halt)
- [ ] Exam shells over d2-v1 (Лозенец) — the next bank multiplier (doc 72 §16 contracts)
- [ ] D2 buildings/visual pass (doc 71 program)
- [ ] rx-map founder eyeball of sign placements
- [ ] 726 draft theory questions → review to `approved`
