# 91 — The mobile audit: six lanes, one phone, and the two bugs that make the car stop answering

**Date:** 2026-08-11 · **Branch:** `scenario-engine` · **Status:** findings only — **no code was changed by this wave**
**Commissioned by:** the founder's mobile report (interface moves left/right · buttons misplaced · gas and reverse dead most of the time · dead again after a popup · belts ultra hard · no camera button · FPS)
**Supersedes nothing.** Extends doc 82 (sim quality), doc 86/87 (the 150-item review), doc 89 (what I missed, incl. his drawn layout).

---

## §0 · How to read this

Every claim below carries a provenance tag. This project has twice shipped an inherited number that
turned out to be wrong, so nothing here is asserted without saying where it came from.

| tag | meaning |
|---|---|
| **[CODE✓]** | I opened the file and read the line **in this session**. File and line named. |
| **[CODE·lane]** | A probe lane read it from source. I did **not** re-open it. Strong, not proven. |
| **[EMU]** | **Measured on this machine at phone dimensions.** Emulator: real viewport, real touch events, real DOM, real WebGL — a desktop GPU. Valid for layout, overflow, hit targets, occlusion, touch behaviour, event traces, draw counts, triangle counts, main-thread work. **Not valid for frame time on his handset.** |
| **[NOT REPRODUCED]** | Someone looked for it, with a working instrument, and could not find it. Named as such rather than omitted. |
| **[ASSUMPTION]** | My judgement. Flagged so he can overrule it. |
| **[OPEN]** | Not answered. Listed in §K or the per-section unknowns. |

**The one line that governs the whole document:** an emulator can prove *what the interface does*. It
cannot prove *how fast his phone draws it*. Sections B–F and H–I are emulator-provable. Section G is
explicitly labelled and must never be quoted as his handset.

---

## A. What was tested previously — blunt version

He asked to be told plainly if things were not tested. They were not.

### What HAD been done, and it was real work

**Static overlap geometry, across four device profiles, with negative controls.** [prior waves]
Element inventories at 393×852, 852×393, 780×360, 360×780, with the project's own safe-area insets
substituted into every `env(safe-area-inset-*)`; pairwise hit-box overlap; `elementFromPoint` at the
centre of each control; a painted-ink coverage metric; a 44 px hit-floor sweep. It found genuine
defects and closed six of them. The tooling it produced (`tools/mobile/lib/*`) is what made this
wave possible in a day.

### What had NEVER been done — every one of these is a first, this wave

| never done before | why it matters |
|---|---|
| **Nobody ever drove the car with a finger.** | Every prior mobile finding was a *photograph of a stationary interface*. His entire complaint is about a car that stops answering. A screenshot cannot see that. |
| **Nobody ever tested popup → close → drive.** | This is his single most specific sentence and it was never once exercised. It is the worst bug in the wave. |
| **Nobody ever put two fingers on the screen at once.** | Driving is a two-thumb activity by construction. Every prior test was single-tap. §C2 is what that missed. |
| **Nobody ever checked horizontal overflow.** | His first complaint — "moves left and right outside of the platform" — had never had a `scrollWidth` read taken against it. |
| **Nobody ever measured a frame at phone dimensions.** | Every performance number on record (draw calls, triangles, the budgets in doc 82 §2.2) was taken at a 1264×620 desktop canvas. |
| **Nobody ever completed the 13-step pre-drive by thumb.** | His "ultra hard to put BElts" had never been walked. |
| **Nobody ever enumerated desktop-vs-mobile control parity.** | Four desktop controls turn out to have no mobile equivalent at all (§E). *(Re-derived 2026-08-12: **three**, and all three are preferences that cost no graded action — see §E.)* |
| **Nobody ever changed orientation, or the browser chrome height, mid-drive.** | §C7 and §L2 are what that missed. |
| **The in-app browser pane, used for some past "mobile" checks, does not set `pointer: coarse`.** [EMU] | It therefore renders the **desktop** layout with ~20 controls and no `data-sim-compact`. Any past mobile finding taken through it described a layout no phone gets. |

**The honest summary: we had measured the furniture and never sat in the chair.**

---

## B. What was tested now

Six independent probe lanes, all read-only, running in parallel on this box.

### Viewports driven

| profile | size | insets applied | note |
|---|---|---|---|
| iPhone 16 landscape | 852×393 dpr 3 | t0 r59 b21 l59 | **his phone**, the primary target |
| iPhone 16 portrait | 393×852 dpr 3 | t59 r0 b34 l0 | |
| Large Android | 430×932 | 59/34 (project ladder value) | |
| Small Android | 360×780 / 780×360 | **zero** | deliberate negative control for the inset work |
| Desktop control | 1264×620 dpr 1 | — | so mobile numbers have something to be compared against |

All contexts `isMobile: true`, `hasTouch: true`, `bg-BG`, dark. `matchMedia("(pointer: coarse)")`
verified true in every run, so the shell took its phone path (`data-sim-compact="on"`) — this was
checked, not assumed.

### Surfaces

The **real** `LessonPlayShell` + `LessonScene` + `TouchControls`, via `/simulator` (one lane, signed
in with a lane-private account), `/dev/drive-rig` and `/dev/gw-shell`. Not mocks, not storybook.

### Workflows actually driven

`l0p-poligon-free` (free drive) · `l1-preparation` (the full 13-step pre-drive, twice, end to end,
thumb only, both runs ending with the car rolling) · `sc-junction-stop` at L1 / L4 (exam) / L5 ·
`sc-zebra-approach` L1 · `sc-crossing-white-cane` L1 (the performance district).

### Interactions exercised — none of these had ever been done

- Press / hold / drag / release on both pads; release **outside** the pad; ±3 px thumb wobble;
  `touchcancel` mid-throttle; a motionless resting thumb (the dead-zone case).
- **Two fingers at once** — throttle + steer simultaneously (the car turned 76° of heading while
  accelerating 11.8 → 26.9 km/h), and a second finger landing mid-throttle.
- **Popup arrives mid-drive** → try to dismiss it with the driving thumb still on the glass → then
  with it lifted → then try to drive again. Run as a 3-run **A/B with one variable** (thumb held vs
  thumb lifted a beat earlier).
- A **13×7 grid of finger taps** over the canvas, to find out whether a thumb can operate the 3D
  cockpit hotspots at all.
- Orientation change mid-session, then drive. Browser-chrome height changes of −44 / −90 / +44 px
  (iOS URL-bar behaviour), with per-control travel measured.
- Full-DOM overflow walks; per-pixel `touch-action` maps (20 px grid, effective value resolved up
  the ancestor chain); horizontal and vertical single-finger drags across the road.
- Per-pass GPU timing (`EXT_disjoint_timer_query_webgl2`), raw WebGL draw counting, React commit
  counting via a devtools-hook stub, CDP CPU throttling at 4×.

### Instrument discipline — three results were thrown away before they could mislead

1. A gesture pass reported "no zoom, no movement" on all four profiles. The **positive control** — a
   page that certainly allows pinch-zoom — reported the same. The instrument was blind. **All of it
   was discarded.** (§T1 is therefore a contract measurement, not a fired gesture.)
2. A performance pass timed its windows from Node. On a saturated main thread every CDP round trip
   queues behind the long tasks, so an "8 s" window was really ~56 s of page time. **Discarded**;
   re-run with `performance.now()` inside the page.
3. A "dead after rotation" reading turned out to be §C1 leaking across from the previous case.
   **Retracted** before it reached this document.

### Box conditions, disclosed

16 GB with up to four workflows competing; free RAM 1.0–4.1 GB. Chromium failed to launch outright
once. One `ls` took over 120 s. Two runs died on a shared harness DB. **Geometry, event traces,
occlusion and draw counts are unaffected by this. Single absolute fps figures are not** — see §G.

---

## C. Confirmed problems

**Functional bugs first, as instructed: a car that does not answer a finger outranks a misplaced button.**

### C1 · FUNCTIONAL — the drive pad dies permanently after a popup ⚠ THE HEADLINE

**His words: "when the pop up pops up after that the buttons for gas, forward backward are not working."**
**Reproduced end to end by three independent lanes.**

[EMU] A/B, one variable, three runs per arm, iPhone 16 landscape:

| arm | condition | result |
|---|---|---|
| **ARM** | thumb **held** on the drive pad at the instant the popup fires | **3/3 dead** |
| **CTRL** | thumb **lifted a beat earlier**, everything else identical | **0/3 dead** |

In the dead state, across three further *correct* drag attempts: the knob's inline `transform` stays
`(none)` — **the component's own handler never runs** — while the pad is mounted, on top, and the sim
clock is running (+0.824, +0.897, +0.808 s). Speed only decays (−2.8, −2.5, −2.1 km/h of coasting).
In one lane's run on the real `/simulator` route the car decayed 51 → 47 → 2 km/h and ended up inside
a building.

**The discriminating observation, and the reason this is a per-pad state bug and not a remount or a
listener problem:** in the same render, the **steering** pad still worked (`translateX(23.1px)`,
`translateX(27px)`). Only the pad whose finger was down when the popup fired is dead. Hold the
*steering* pad instead and the steering pad dies the same way.

**Mechanism proven, not inferred.** [EMU] With the pad dead, a lane swept synthetic `pointerup` ids
1..24, re-testing with a real drag after each. Ids 1, 2, 3 → still dead. **Id 4 → alive**
(`translateY(-30px)`, car moves). Id 4 is exactly the `pointerId` the browser had given the finger
that was holding the throttle when the sim paused. **Nothing but clearing that one ref revives the
control.**

**Frequency: this is not an edge case, it is the first thing that happens.** [EMU] The car spawns
unbuckled; «УЧЕБЕН МОМЕНТ · Движение без предпазен колан» pauses the sim ~1.2 s after the car starts
moving, in every fresh run (3/3), at 18–51 km/h — i.e. with a thumb necessarily on the throttle.

**Every suspect named in the brief was ruled out by measurement, not by argument:**

| suspect | verdict |
|---|---|
| an invisible overlay intercepting | **NO** — `elementFromPoint` at the thumb returns the pad itself (`role=slider`, `pointer-events: auto`, `z-index: auto`, `opacity: 1`) |
| a modal backdrop / focus trap | **NO** — the popup is fully gone; the steering pad in the same render works |
| listeners not re-attached | **NO** — same component, same commit, steer alive / drive dead |
| pointer capture never released | **NO** — `lostpointercapture` observed firing normally |
| **the sim is still paused** (the brief's top suspect) | **NO** — the clock advances ~0.8 s in every dead run |

**One divergence, declared.** One of the three lanes reported that lifting the finger and pressing
again recovered the pad, attributing the symptom to unmount/remount alone. The other two measured it
as permanent for the rest of the session and one proved the mechanism with the id sweep. The
difference is almost certainly *when* the finger left the glass relative to the hide, which is exactly
the ARM/CTRL variable. **The fix in §I1 makes the question moot; it is listed in §K as the one thing
worth re-checking on his handset.**

---

### C2 · FUNCTIONAL — every `onClick` control in the simulator is dead while a second finger is on the glass

**i.e. dead the entire time he is driving.** [EMU, one lane, negative controls run first]

Negative control, taken first, every time: with **no** finger down, a tap on «Мигач надясно» fires
`pointerdown → pointerup → click` and `aria-pressed` goes false → true.

With **one** finger planted — on the steering pad, on the drive pad, **or on the bare canvas** (so it
is not pointer capture) — the identical tap fires `pointerdown → pointerup` and **no `click`**, and
nothing changes state.

**Dead this way:** «Мигач наляво» · «Мигач надясно» · **«Поглед в лявото / дясното / задното
огледало» — the mirror glances the exam grades** · «Пауза» · **«Контроли на автомобила» (⚙ — so the
sheet holding camera, seatbelt, lights, gear, fullscreen and restart cannot even be opened while
driving)** · every ⚙ sheet cell including «Предпазен колан» · the teach card's «РАЗБРАХ».

**The single exception is the horn**, which binds `onPointerDown`/`onPointerUp` instead of `onClick`
and works perfectly under two fingers.

[CODE✓] Verified in source by me: `TouchControls.tsx:1254` `GlyphButton` → `onClick` at `:1272`;
`:1336` `SheetCell` → `onClick` at `:1371`; `:1282` `HoldGlyphButton` → `onPointerDown` at `:1312`,
`onPointerUp` at `:1313`, `onLostPointerCapture` at `:1315`. The pads themselves use
`onPointerDown/Move/Up` (`:862–864`, `:906–908`) — **which is precisely why the pads survive
multi-touch and every button does not.**

**This is not a Chromium quirk.** A `click` from a touch is a *compatibility mouse event*, and the
Touch Events spec dispatches those only for the **primary** touch point. [ASSUMPTION → verify]
It should behave the same on iOS Safari, but that has not been fired on a real device.

**Why this matters more than its single-lane provenance suggests:** together with C1 it explains the
full failure story. The popup arrives → the pedal dies (C1) → he tries to dismiss the card with his
driving thumb still down → **the dismiss button does not fire either (C2)** → the session is
unrecoverable, and nothing on screen says "take your other thumb off the glass first".

---

### C3 · FUNCTIONAL — the seatbelt is under the panel that tells you to click it

**His words: "it is ultra hard to put BElts and all the requried buttons to do so."** [EMU]

On step 4 the app does the right thing: it turns the head down and labels the buckle — chip
«🖱 Щракни Предпазен колан» at (314,287). **`elementFromPoint` at that chip's centre returns
`section «Подготовка преди потегляне»`** — the checklist itself. Identical for the lights: chip
«🖱 Щракни Светлини» at (127,299) returns `strong «Включване на светлините»`, the checklist's own step
title painted on the switch it names.

It is a closed loop: [CODE·lane] the head turn is performed by an effect **inside**
`PreDriveChecklist`, which on compact exists **only while the bottom sheet is open**, and the sheet is
what stands on the buckle.

---

### C4 · FUNCTIONAL/TOUCH — with the pre-drive sheet open, **all ten** touch driving controls are dead

[EMU] `elementFromPoint` at each control's own centre: with the auto-opened tutorial up, all ten
return the tutorial card; with the tutorial dismissed and only the sheet up, all ten still return the
checklist section. Sheet measured **672×244 at (90,101) — 62 % of the screen height and 79 % of its
width**. Dead list: steering pad, drive pad, both indicators, all three mirror glances, «Пауза»,
«Клаксон», and the ⚙ that opens the sheet.

Confirmed by A/B inside the drive log: three taps at the arc coordinates with the sheet open did
nothing (progress stayed 1/13); the identical three taps after closing the sheet completed the step.

---

### C5 · FUNCTIONAL — one 4-pixel miss bricks the lesson, silently and permanently

[EMU] «СПИСЪК» measures `[664,51 61×44]`; the X «Скрий известието» `[729,51 44×44]` — **a 4 px gap.**
One tap on that X removes the pre-drive line **permanently**: [CODE·lane] `dismissedOverlayIds`
(`LessonPlayShell.tsx:1271–1281`) is a `Set` that is added to and **never cleared**.

Measured: overlay gone; still gone after 15 s; the lesson menu offers Съветник / Въпроси / Карта /
Изход от цял екран / Прекрати урока / ← Всички уроци — **no way back to the checklist.** On the three
INFO steps whose *only* completion path is «Потвърди» inside that checklist, the lesson is then
unwinnable. Step 1 is an info step, **so tap #1 of the lesson can do this.** Recovery: abort or
reload. No message of any kind.

---

### C6 · FUNCTIONAL — `--sim-vh` freezes at the pre-fullscreen height and never updates

[CODE✓ — I verified this chain myself]

- `LessonPlayShell.tsx:1211` — `const viewportH = useVisualViewportHeight(immersive && !isFullscreen);`
- `:734` — the hook returns early when `active` is false.
- `:2517–2519` — the inline `height` is correctly suppressed in fullscreen.
- **`:2520` — `--sim-vh` is published from the same stale `viewportH` unconditionally.**
- `TeachMomentOverlay.tsx:214` — `maxHeight: "calc(var(--sim-vh, 100dvh) * 0.62)"`.

[EMU] `document.fullscreenElement` **is** the `[data-sim-shell]` div, so `isFullscreen` is true and
the hook stands down. Across a full rotation the viewport went 393×852 → 852×393 → 852×453 → 852×393
→ 393×852 and `visualViewport.height` tracked every step; `resize` fired 4×, `orientationchange` 2×,
`visualViewport.resize` 4× — and **`--sim-vh` read `852px` at every sample.** In landscape it
overstates the viewport by 459 px (2.17×), so a teaching sheet is allowed 528 px inside a 393 px
viewport, in an `overflow: hidden` shell, with no way to scroll to the rest.

**Nuance, stated because it changes who is affected:** if fullscreen is entered *before* the first
measurement, `viewportH` is null and `--sim-vh` correctly falls back to `100dvh`. The defect needs the
hook to have measured once and then stood down. [ASSUMPTION] On iOS Safari there is no Fullscreen API
for a non-video element, so `isFullscreen` should be false there and the hook should stay live — i.e.
**this is probably an Android-class defect and may not be his.**

---

### C7 · FUNCTIONAL — the first touch after any keyboard drive key is swallowed *(hybrid devices only — not his phone)*

[CODE✓ `TouchControls.tsx:677` `const visible = !hidden && !keyboardActive;`] A drive key hides the
**whole** overlay; the touch that restores it lands on the canvas because the pads are not in the DOM
yet. Irrelevant to a phone; flagged because **it wrecks any keyboard-assisted test run** — it cost one
lane two runs.

---

### Layout / responsive

| # | finding | evidence |
|---|---|---|
| **L1** | **Eight of the twelve driving controls sit in the vertical middle of the screen.** ⚙[747,156] ⇨[703,158] Д[659,166] ‖[61,172] З[105,174] 📢[615,176] Л[149,182] ⇦[193,192] — all 44×44, all spanning **y 156..236 of a 393 px screen = 39.7 %..60.1 % of the height.** His reference puts *nothing* in that band. His drawn arc shipped as a **20 px rise over a 132 px run — 8.6° off horizontal, i.e. a row, not an arc.** | [EMU] |
| **L2** | **Every driving control moves under his thumb when the browser chrome changes.** A −44 px viewport-height change (Safari's URL bar appearing — a routine event) moved all ten controls 43–44 px; −90 px moved them 71–75 px; +44 px moved them by **different amounts per station** (pad +44, «Пауза» +22), so the arc bunches and spreads as well as slides. **This is "the buttons are so missplaced" and "it moves", and it happens mid-drive.** | [EMU] |
| **L3** | **The minimap lands on the entire right thumb zone in landscape.** `[672,177,168×168]`, overlapping the drive pad by **17,056 px²**, plus «Клаксон», «Поглед в дясното огледало», «Мигач надясно» and ⚙ — **24,343 px² of driving controls under an opaque map.** Hit-testing still resolves to the controls (z-index 10 wins), so it is visual, not dead — but the thumb sits *on* the map. Never found before because the map is off by default. | [EMU] |
| **L4** | **The lesson menu — the only route to Карта / Цял екран / Съветник / Въпроси / Прекрати on a phone — covers six driving controls**, 11 hit-box overlaps, biggest 7,624 px². Its own rows measure **226×39.5 px — 4.5 px under the 44 px floor this project enforces everywhere else.** | [EMU] |
| **L5** | **The ⚙ sheet is a 13-cell row drawn straight across the horizon** — cells at y 92..136, x 61..657, i.e. **596 px of an 852 px screen at 23–35 % of the height**, over the road, the traffic sign and the oncoming lane. While it is open, tap-intercepted area rises 31.9 % → 39.8 %. | [EMU] |
| **L6** | **With the sheet open, «🎬 Демонстрация ▸» is fully covered** and `elementFromPoint` at its centre returns a sheet button. Reproduced on three profiles. | [EMU] |
| **L7** | **In portrait the ⚙ sheet cannot be closed.** «Рестарт на колата» and «Затвори контролите» are both occluded by the touch hint's «Разбрах»; «Светлини» and «Аварийни светлини» likewise. | [EMU] |
| **L8** | **The pre-drive tutorial card is twice the screen, on all thirteen steps.** iPhone 16 landscape: card 743–821 px tall in a 393 px viewport; **«Разбрах» is 300–423 px below the fold on 13 of 13.** Small Android portrait: 12 of 13. iPhone 16 portrait: 2 of 13 — and they are *adjust-mirrors* and **fasten-seatbelt**. No scrollbar, no fade, no chevron. | [EMU] |
| **L9** | **Sub-44 px hit rects that the previous sweep missed:** «Потвърди» 75×**24**, «Покажи ми как» 99×**24**, «ВСИЧКИ СТЪПКИ (0/13)» 133×**15**, «⌨ КЛАВИШИ ЗА НАПРЕДНАЛИ» 170×**15**, the demo pill 134×**27**, menu rows 226×**39.5**. The first two are the only completion path for the confirm-only steps. | [EMU] |
| **L10** | **Two of three mirrors project off the picture while the app believes they are reachable.** «🖱 Задръж Ляво огледало» lands at **x −76**; «🖱 Задръж Вътрешно огледало» at **y −83** — and those chips only render when `hotspotIsReachable()` returns true, so no head-turn is offered for them. | [EMU] |
| **L11** | **`env(safe-area-inset-bottom)` makes the document taller than the screen by exactly the inset.** 393×852 → 886 (34 over); 430×932 → 966; 852×393 → 414 (21 over); 360×780 (real zero insets) → 0 over. Clean A/B on the same route: insets real = 34 px, insets none = 0 px. **Practical impact on the driving screen is nil** (the fixed shell covers everything, and nothing pans — §NR1); it is the ordinary pages that carry it. | [EMU] · [CODE✓ `globals.css:535–537`] |
| **L12** | **The fullscreen branch keeps the 8 px gutter the compact branch exists to remove.** [CODE✓ `LessonPlayShell.tsx:2505–2512`] `isFullscreen` is tested **first** and hard-codes `p-2` + `gap-2`; the comment *"Eight pixels of page gutter on each side of a driving simulator is eight pixels of road"* sits on the `immersive` arm below, which a phone that grants fullscreen never reaches. Measured: canvas 836×377 in an 852×393 viewport — **16 px of width and 16 px of height spent on gutter.** | [EMU] · [CODE✓] |
| **L13** | **Two overlay owners write to the same pixels.** In the 852×393 and 393×852 captures the Pause card's own text is overdrawn: «Пауза» sits under «Ляв палец — волан…», the teal «Спряла кола: пусни палеца…» runs across «Продължи», «Разбрах» lands across «Изход». This is his "everything overlaps", legible in a frame. | [EMU, screenshot] |

### Touch / input

| # | finding | evidence |
|---|---|---|
| **T1** | **74.8–85.9 % of the driving surface permits browser pinch-zoom.** Per-pixel map, effective `touch-action` resolved up the ancestor chain: 360×780 → 83.5 %; 393×852 → 84.5 %; 430×932 → **85.9 %**; 852×393 → 74.8 %. The entire road is `touch-action: auto` (the R3F canvas). Only the two pads and the horn are `none`; nine HUD buttons are `manipulation`, which kills double-tap zoom but **still permits pinch**. [CODE✓ `app/layout.tsx:165–168`] the served meta is `width=device-width, initial-scale=1, viewport-fit=cover` — **no `maximum-scale`, no `user-scalable`** — and it is the only `viewport` export in the app. The app never cancels the gesture either: `touchmove` over the canvas measured `defaultPrevented: false` at all four sizes. | [EMU] · [CODE✓] |
| **T2** | **No right-click equivalent in the cockpit.** [CODE·lane `VitokCockpit.tsx` `onContextMenu`] The gear selector steps toward D on click and toward **P on right-click**. A finger has no second button, so from inside the cockpit a phone student can only ever go toward D. | [CODE·lane] |
| **T3** | **No hover, so the cockpit controls are anonymous.** The tooltip that names each control and prints its key is `onPointerOver` only. The taps themselves work — a 13×7 grid of finger taps changed three cabin states — **which also means a stray tap on the road switches the engine off.** | [EMU] · [CODE·lane] |
| **T4** | **A tap does nothing and a press-and-hold does nothing on the drive pad.** [CODE✓ `TouchControls.tsx:804` `driveStartY.current = e.clientY`] The gesture origin is *where the thumb landed*, then a 6 px dead zone is subtracted, so a tap and a motionless press both return exactly 0. Measured: tap ×3 → `translateY(0px)`, neutral border, 0.00 km/h; hold still 1500 ms ×3 → identical, **with the sim clock running 1.45–1.54 s** so nothing was paused. The same thumb that *drags* → `translateY(-30px)`, success border, 0 → 16.8 km/h, every time. **He calls them "the buttons for gas"; they are not buttons, and a tap gives no feedback at all that it was understood.** This is working as designed, and the design is a defect. | [EMU] · [CODE✓] |

### UX

| # | finding | evidence |
|---|---|---|
| **U1** | **The pre-drive tells a phone user to use a mouse.** [CODE✓ `PreDriveChecklist.tsx:67`] «Всяка стъпка се прави с **МИШКАТА** — върху контролите в кабината или върху **педалите долу вдясно**.» There is no mouse, and `MousePedals` mounts on non-touch devices only, so the second half names a control that cannot exist there. [CODE✓ `performedSteps.ts:168,189,204,215`] all ten performed steps carry only mouse imperatives. `grep` for пръст\|палец\|докосни\|тъчскрийн\|телефон across the procedure modules returns **zero hits**. The accessor is even named `preDriveMouseActionBg()`. | [CODE✓] |
| **U2** | **The one path a thumb can actually use is never named.** The whole procedure IS completable by thumb via ⚙ → КОЛАН / СВЕТЛ / ДВИГ / РЪЧНА / D► plus the arc Л / З / Д / ⇦ — a lane completed all 13 steps that way, twice. Nothing in the pre-drive UI mentions the ⚙ strip or any arc button, and the arc buttons are **unlabelled single Cyrillic glyphs** with the name only in `aria-label`. | [EMU] |
| **U3** | **The literal instruction of step 9 cannot be performed on a phone.** «Включи първа предавка (или D) ПРИ НАТИСНАТА СПИРАЧКА» — the brake is a held thumb and the gear is an `onClick` cell in the ⚙ sheet. Measured: with the brake thumb down, the tap on ⚙ did nothing (C2). The engine accepts the sequential version, so it is completable — **but not the way the card teaches it.** | [EMU] |
| **U4** | **The THEO-4 explanation is delivered non-deterministically on a phone.** Only **4 of the 13** tutorial cards ever appeared in a complete run, because the card auto-opens only while the checklist is mounted and the checklist is mounted only while the sheet is open. **Nine of thirteen steps were completed with the student never shown the WHY / HOW / ЗАПОМНИ / law citation.** This is a requirement-zero violation (doc 64 THEO-4), not a polish item. | [EMU] |
| **U5** | **The first tap of the lesson is a wall.** On a phone the peek shows only the step title plus [СПИСЪК][X]. Tapping «СПИСЪК» — the only route into the procedure — mounts the checklist, whose auto-open effect immediately throws the full-screen modal over everything, and the only control visible on it is a 28×22 px **X that closes the explanation without confirming the step.** | [EMU] |
| **U6** | **The product penalises the order while the list that states the order is hidden.** A lane collected «Нарушен ред» +1 for mirrors, seatbelt, engine and handbrake while the checklist was still behind a chip. | [EMU] |
| **U7** | **The open sheet keeps naming the step you already finished** — `SimOverlay` holds `openItem` as a frozen copy, so after confirming step 1 the header still read «Настройка на седалката» while the checklist inside had moved on. | [EMU] |
| **U8** | **The portrait experience is a rotate-nag over the road** — «Завърти телефона хоризонтално» + «Разбрах» mid-road at 393×852, and «Разбрах» is the one control measured with `touch-action: auto`, i.e. the single control that permits every browser gesture including double-tap zoom. | [EMU] |
| **U9** | **Tap count: 38–40 touches on the phone against 27 clicks on the desktop (1.4–1.5×), and 11–13 of the phone's touches are pure panel-shuffling** — 4 sheet opens, 4 sheet closes, 4 modal swipes, 3 ⚙ opens, 3 ⚙ closes — of which **5–7 were dead taps aimed at a visible, correctly-positioned control that was under an open panel.** | [EMU, two independent runs] |

### Missing functionality — see §E for the exhaustive table

> **⚠ FOUR OF THESE SEVEN ROWS WERE CLOSED BETWEEN J-WAVE-2 AND J-WAVE-4 AND ARE LEFT HERE AS THE
> ORIGINAL FINDING, NOT AS CURRENT STATE.** §E was re-derived from the running product on
> 2026-08-12 and is the authority; this table is the July snapshot. **M1** — the camera is now the
> top-rail «Изглед», one tap, measured live under a planted thumb (§E row 21). **M2** — «СЪЕД» is a
> 44×44 sheet cell on «Напреднал» (§E row 8); what is still broken there is the *upshift cell under
> a second finger*, which is §C2 and not a missing control. **M3** — G and N are «Зум» and
> «Север»/«Посока» inside the «Изглед» popover, measured cycling and toggling on every profile (§E
> rows 22–23); **only K is still absent, and §E argues it should stay that way.** **M5** — still
> true as written, but the reasoning is not: `HudToasts` is `compact ? null`, so the phone has no
> toast column at all and already shows one line at a time.

| # | finding |
|---|---|
| **M1** | **There is no camera control on the driving screen at all.** [EMU] Enumerated every button: 12 controls, zero of them a camera. [CODE✓ `TouchControls.tsx:1147–1148`] the only path is one cell «ИЗГЛ» inside the ⚙ sheet — two taps deep, **and the first of those two taps is an `onClick` that does not fire while a thumb is down (C2), so during a drive the camera is unreachable, full stop.** Desktop has it on one key. **He is right.** [CODE✓ `:312`] the file states why: *"Ten buttons did not fit into eight stations, so 🎥 (camera) and ⛶ (fullscreen) moved into the ⚙ sheet."* |
| **M2** | **Clutch has no touch control anywhere**, and on «Напреднал» the clutch is required for N→R and every gear change — **so that entire difficulty tier is unplayable on a phone.** |
| **M3** | **Top-down zoom (G), north-up/heading-up (N) and the reversing-POV toggle (K) have no touch equivalent at all.** Neither platform has any free-look, drag-orbit or zoom gesture. |
| **M4** | **Mute (M) has no touch equivalent** — and it is not in the desktop legend either. |
| **M5** | **«Известия тихо/нормално» is not in the compact lesson menu.** Doc 86 L14 exists because the toast column was "much much annoying"; **the phone, which has the least room for toasts, is the one device that cannot turn them down.** |
| **M6** | **There is no touch instruction copy anywhere in the product.** [CODE✓ `performedSteps.ts`] `PreDriveStepControl` has exactly two instruction fields, `clickBg` and `pedalBg`, both mouse imperatives, plus `keys`. There is no third field, so no touch sentence can be authored. |
| **M7** | **The graphics quality preset cannot be changed without leaving the drive** — on either platform. An FPS complaint costs him the whole session to act on. |

### NOT REPRODUCED, and one retraction

| # | finding |
|---|---|
| **NR1** | **THERE IS NO HORIZONTAL OVERFLOW, AND THE PAGE DOES NOT PAN UNDER A FINGER.** Four lanes, four viewports, three states each. `documentElement.scrollWidth − clientWidth = 0` everywhere. A walk of every rendered element found **zero** nodes crossing 100vw or with a negative left edge (the only two hits in the whole sweep were a `.sr-only` 1 px span and a 1 px rounding on a 44 px close button). Horizontal and vertical drags across the road left `scrollX/scrollY = 0` and `visualViewport.offsetLeft/offsetTop = 0`. **This is a believable negative only because the same drag on a control page moved `visualViewport.offsetLeft` 0 → 225 and `offsetTop` 0 → 385.** `overflow-x: hidden` would hide nothing. **His "moves left and right outside of the platform" is not an overflowing element and not the document scrolling** — the remaining candidate is T1, browser pinch-zoom, and it is not confirmed. |
| **NR2** | **It is not the canvas being wider than its box.** Canvas measured 344×764 / 377×836 / 414×916 / 836×377 against parents of exactly the same width: `widerThanParentPx = 0` everywhere. Backing store equals CSS pixels at dpr 3, tier low. |
| **NR3** | **RETRACTION — the reported `aria-label` defect is already fixed. Do not spend a fix on it.** The brief said the drive-pad label "still promises a reverse gesture the exam disables". Driven at three rungs: L1 «…спряла кола: пусни и натисни пак надолу за назад»; **L4 (exam) «…На изпит заден ход се избира само с лоста в ⚙ (D → N → R)»**; L5 back to the gesture wording. `driveAxisLabelBg` derives it from `shouldRemapReversePedals` and is correct in all three. |
| **NR4** | **The pads themselves are not broken.** Verified working: press/hold/release on both; **release outside the pad** (knob springs home, axis released); ±3 px thumb wobble does not cancel (car kept accelerating 4.97 → 14.38 km/h); **two thumbs simultaneously** (drive −28.1 px AND steer +23.1 px, 3.49 → 14.0 km/h); a second finger landing mid-throttle does not disturb it; `touchcancel` releases cleanly; orientation change leaves them mounted and correctly reflowed. **Nothing about the input plumbing is broken except the one stale ref (C1) and the `onClick` idiom (C2).** |
| **NR5** | **dpr is NOT the problem.** Backing store = 1.000 device pixels per CSS pixel at dpr 3, tier low. [CODE✓ `LessonScene.tsx:1118` `dpr={[1, QUALITY_PRESETS[level].maxDpr]}`, `quality.ts:131` `maxDpr: 1.0`.] "A phone at dpr 3 renders nine times the pixels" is **false for this product at tier low**. |
| **NR6** | **Phone dimensions are not, by themselves, slower than the desktop control on this box.** Tier low: 393×852 → 52.9 fps; 852×393 → 47.6; 360×800 → 51.6; 800×360 → 52.8; desktop control 1264×620 → 51.8. **Viewport is not the variable. Tier and CPU are.** |

---

## D. Root causes

"CSS needs improvement" is not a root cause and is not offered anywhere below. Each row names the
file, the line, and the mechanism.

### D1 · The dead pedal — `platform/src/components/sim/TouchControls.tsx`, three lines acting together

[CODE✓ — all four lines read by me in this session]

```
:677   const visible = !hidden && !keyboardActive;
:681   // "Any hide (pause/quiz/teach/keyboard/unmount) releases held axes"
:682   useEffect(() => { if (!visible) touch.releaseAll(); }, [visible, touch]);
:704   const steerPointer = useRef<number | null>(null);
:765   const drivePointer = useRef<number | null>(null);
:802   if (drivePointer.current !== null) return;      // ← the guard that refuses every future touch
:823   drivePointer.current = null;                    // ← the ONLY place it is ever cleared
:838   if (!visible) return null;                      // ← removes the DOM, keeps the instance
```

**The chain.** `hidden` goes true → React removes the pad node, but the component *instance* survives
(it returns `null`; it does not unmount, because `LessonScene` renders `{touchCapable ? <TouchControls/> : null}`
and `touchCapable` never changes) → **every `useRef` in it persists** → the finger is still down, but
the node is detached and React delegates at the root container, so the eventual
`pointerup`/`pointercancel` never reaches `onDriveEnd`, which is the only place `:823` runs → the ref
keeps the dead id **forever** → `:802` short-circuits every subsequent `onDriveDown`. `driveApply` is
never called, which is exactly why the knob's inline transform is never written.

**The file already promises the fix and delivers half of it.** The comment at `:679–680` says *"Any
hide … releases held axes"*, and `:682` does release the **engine axes** — which is why the car
correctly stops rather than running away. **It does not release the two pointer-ownership refs. That
omission is the bug.**

**Corroborating asymmetry inside the same file:** `HoldGlyphButton` (the horn) defends itself with
`onLostPointerCapture={end}` at `:1315` plus an unmount-release effect. **The two most-used controls
on the screen are the least defended.**

**What raises the popup** [CODE·lane]: `LessonPlayShell.tsx:2671–2673`
`paused={ended || activeQuiz !== null || teachQueue.length > 0 || consequence !== null}` →
`LessonScene.tsx:659` `physicsPaused={paused || menuPaused}` → `:1557` `hidden={physicsPaused}`.
**So a teach moment, a micro-quiz, a mistake-consequence card, the end screen and the pause menu all
do this.**

### D2 · Every button dead under two fingers — the `onClick` idiom, four call sites

[CODE✓] `TouchControls.tsx:1272` (`GlyphButton`) and `:1371` (`SheetCell`);
[CODE·lane] `SimOverlay.tsx` for «РАЗБРАХ» / «ЗАЩО» / ✕ (`:406`, `:423`, `:497`, `:576`) and
`LessonPlayShell`'s `PlayMenu` rows. A `click` from a touch is a compatibility mouse event, dispatched
only for the **primary** touch point. **A driving game is a two-finger interface by construction, so
every one of these buttons is unreachable exactly when it is needed.** The correct idiom exists 60
lines away in the same file (`HoldGlyphButton`, `:1312–1315`).

### D3 · The head turn and the panel are the same component

[CODE·lane] `PreDriveChecklist.tsx:203–215` owns `setCabinLook()`. On compact the checklist is mounted
only inside the `SimOverlay` detail sheet (`LessonPlayShell.tsx:2728–2739`), so **the pose that brings
the belt buckle into frame is created by, and then hidden behind, the same element.**

### D4 · The compact sheet has no clearance contract against the touch band

[CODE·lane] `SimOverlay.tsx:527–543` — `bottom: var(--sim-dash-h)` (40 px) +
`maxHeight: calc(var(--sim-vh) * 0.62)` puts the sheet at y 101–345 of a 393 px screen, straight
through the arc stations (y 148–206) and the tops of both pads. **`TouchControls` already publishes
the number that would have prevented it** — [CODE✓ `TouchControls.tsx:443` `touchControlsFloorPx()`,
`:497` `TOUCH_CONTROLS_FLOOR`] — **and `SimOverlay` does not read it.** The clearance work that solved
this on desktop is applied only to the roomy mount; `LessonPlayShell.tsx:3101–3104` says the quiet
part out loud ("nothing is behind a sheet"), **and that assumption is what is false.**

### D5 · The minimap clears the wrong floor

[CODE·lane] `LessonPlayShell.tsx:~3019` — the minimap column sits at `bottom: var(--sim-hud-floor)`,
which on compact is ≈48 px. [CODE✓ `TouchControls.tsx:453–456`] the file's own comment states the trap
verbatim: *"`--sim-hud-floor` is not this number and cannot be … a widget that clears the dash can
still land squarely on the steering pad."* The demonstration deck was moved onto
`TOUCH_CONTROLS_FLOOR`; **the minimap column was not.**

### D6 · The arc is measured against a height the browser moves

[CODE✓ `TouchControls.tsx:343–349`]
`ARC_RISE = clamp(1.25rem, (100% − 22rem) × 0.5, 8.25rem)`, used in a `bottom:` calc at `:364`, so
`100%` resolves against the containing block's **height** — and [CODE✓ `LessonPlayShell.tsx:1211`]
that height comes from `useVisualViewportHeight`. **On iOS Safari that number changes every time the
URL bar shows or hides**, and because it is a `clamp`, the arc *compresses* as well as translates:
measured 43–44 px of travel for a 44 px chrome change, and unequal per station.

Separately, [CODE✓ `:343` `ARC_RISE_MIN_PX = 20`, `:333` `ARC_RUN_STEP_PX = TOUCH_MIN_PX` (44),
`:325` `ARC_STATIONS = 4`]: on a 393 px landscape stage the rise **clamps to its 20 px floor**, so the
four stations land at y 192/182/174/171 — **20 px of rise over 132 px of run is a row.** The file's own
comment derives that floor from the notification column's width contract. **The arc was flattened to
dodge a collision at the top of the screen, and the cost was paid in the middle.**

### D7 · The tutorial card is sized for a desktop and scrolls the wrong box

[CODE✓ `PreDriveTutorial.tsx:375`] the **backdrop** is the scroll container
(`fixed inset-0 flex overflow-y-auto`) and [CODE✓ `:380`] the card inside it is
`card m-auto flex w-full max-w-lg flex-col gap-3 p-5` — **no height cap.** The file's own comment at
`:359–363` explains that `m-auto` replaced `items-center` so the card could be scrolled — which fixes
*reachability* but not *visibility*: the button row is the last child of an 821 px column, so on a
393 px screen it is 423 px past the bottom **with nothing on screen saying so.**

### D8 · The auto-open has no notion of compact

[CODE·lane] `PreDriveChecklist.tsx:189–195`. It was written for the roomy layout where the checklist is
always mounted; on compact it turns into "a full-screen modal fires every time the student opens the
list".

### D9 · The dead end is an unbounded dismiss set

[CODE·lane] `LessonPlayShell.tsx:1271–1281` (`dismissedOverlayIds`, added to, never cleared) +
[CODE✓ `SimOverlay.tsx:296` `const closable = !blocking;`] and the pre-drive item is deliberately
non-blocking. **Any line the student can send away needs a way back, and this one has none.**

### D10 · The copy is mouse-only by data shape, not by oversight

[CODE✓ `performedSteps.ts`] `PreDriveStepControl` has exactly `clickBg`, `pedalBg` and `keys`. **There
is no field a touch sentence could live in**, so `preDriveMouseActionBg()` cannot return one and
`PreDriveChecklist.tsx:67` hard-codes «с МИШКАТА». The file's honesty rule — *a hint may only promise a
control that works* — is satisfied for mouse and keyboard **and has no touch clause.**

### D11 · The reach table is centre-blind

[CODE·lane] `cabinLook.ts:288–310` — `hotspotVisibleRect()` clips the projected box to the frame and
accepts it whenever the **clipped** span exceeds `MIN_TARGET_SPAN` (0.02); **it never asks whether the
centre is inside.** At 2.17:1 the left door mirror and the interior mirror keep a sliver inside the
frame, so the label renders at x −76 / y −83 and no head turn is offered.

### D12 · Performance — five causes, none of them "the phone is slow"

| # | file:line | mechanism |
|---|---|---|
| **D12a** | [CODE✓ `quality.ts:351`] `if (touchOnly && deviceMemoryGb !== null && deviceMemoryGb >= 8) return "med";` | **8 GB+ Android Chrome seeds to `med`.** iPhone/Safari (`deviceMemory` undefined) and 4 GB Android seed to `low`. `med` is not a cosmetic step up: composer + N8AO + bloom + SMAA + a 1024² shadow map + [CODE✓ `:159`] **`maxDpr: 1.25`, i.e. a backing store 1.56× the CSS pixels.** Measured, same session, same 852×393 viewport: **GPU 14.62 vs 2.55 ms/frame (5.7×), draws 261 vs 113, p95 frame 250 vs 50 ms, worst frame 3.35 s vs 83 ms.** |
| **D12b** | [CODE✓] `useAutoQualityProbe` appears in **exactly two files** — its own definition in `qualityStore.ts` and the re-export in `environment/index.ts`. **It is mounted nowhere.** | The ledger, the bands and the hysteresis are all written and unit-tested, and **no sample is ever fed to them. The seed is final for life.** A phone put into `med` can never be demoted no matter how badly it runs; a phone in `low` never climbs. The design's own safety valve is disconnected. |
| **D12c** | [CODE✓] `LessonScene.tsx:1112` — the `<Canvas>` carries **no `frameloop` prop**; `grep -rn frameloop` over `components/` + `modules/` returns exactly one hit, and it is in the marketing hero scene. | R3F's default `frameloop="always"` runs. `physicsPaused` reaches `<Physics paused>` and the HUD's `hidden` props only. **Measured under the pause modal: 139 draws / 118,195 triangles / 3.02 ms GPU at 51 fps with the sim clock frozen — 96 % of the draws and 94 % of the GPU time to render a picture in which nothing moves.** A phone burns full battery and thermal budget doing it, **and thermal throttling is the mechanism by which "it gets worse the longer I drive" becomes true.** |
| **D12d** | [CODE✓] `LessonPlayShell.tsx:3251`, `TeachMomentOverlay.tsx:308` — `absolute inset-0 … backdrop-blur-sm` (same pattern in `MicroQuizOverlay`, `MistakeConsequenceOverlay`). | A full-viewport `backdrop-filter: blur()` composited over a canvas that is **still rendering** (D12c). Among the most expensive compositor operations on a phone GPU. **It runs outside both instruments used in this wave, which is exactly why it has never appeared in any budget this project has published.** |
| **D12e** | [CODE✓ `LessonPlayShell.tsx:174` `HUD_POLL_MS = 150`, `:1878` the interval] + [CODE✓ `TouchControls.tsx:165` `CABIN_POLL_MS = 250`] | `snapshotOf` returns a fresh object every tick, so `setSnap` always changes identity and re-renders the whole shell — **and the shell renders `SceneSlot` → `LessonScene` → the entire R3F tree, which is not memoized against it.** Measured, and this number is **not** a dev-build artifact: **297 React commits in 10.04 s = 29.6/s** (17.9/s on the DOM root, 11.7/s on R3F's own reconciler) with thirty component types doing work in **every** commit, including `StaticWorld`, `TrafficLayer`, `HeroCarBody`, `VehicleRig`, `CabinRoof` and `RouteGuidance`. **6.7 Hz + 4 Hz does not sum to 17.9 Hz — there are further update sources not yet enumerated.** This also explains `commitPassiveUnmountOnFiber` at 2.4 % self time and a live listener count oscillating 990 → 2190 → 1017: **effects are unmounting and re-subscribing ~18 times a second.** |
| **D12f** | [CODE✓ `MirrorRig.tsx:361`] `const LOW_REAR_CADENCE = { interval: 4, phase: 0 }` | The rear-mirror RTT is a fixed 256×96 target, so its cost **does not shrink with the viewport** while the main pass does. Measured at phone size, tier low: **0.61–1.13 ms of a 2.4–3.2 ms GPU frame — 25–34 % of the whole GPU budget for 7 % of the canvas pixels.** |
| **D12g** | [CODE✓ `drive-rig-client.tsx:61`, `gw-shell-client.tsx:26`] both default to `"medium"` when `?quality` is absent. | **Every dev harness in this repo looks at a tier a cheap phone never gets.** Only the real `/simulator` route seeds from the device. Internal look-and-cost work has been done at `medium` by default. |

---

## E. Desktop vs mobile feature gap

**RE-DERIVED 2026-08-12, J-WAVE-4 — AND THE TABLE THAT STOOD HERE OVERSTATED THE GAP.**

Everything below the previous version of this heading was written by reading code in a state the
code is no longer in. Rows 21–23 said the camera was *"2 taps deep, unreachable while driving"* and
that G and N had **no** mobile equivalent at all; «Изглед» has been a one-tap, word-labelled
top-rail button since the J-WAVE-2 rework, and its popover carries «Зум» (`cycleZoom`, desktop G)
and «Посока»/«Север» (`toggleOrientation`, desktop N). **They were not the only three. Of the 51 rows
below, 27 moved in the direction of "this is better than the table said", 2 were re-characterised
(33, 47), 2 moved the other way (42 and 43 — the July `[OPEN]`s, now answered, and the answer is
bad), 1 is new (51), and only 19 stand as written.** **A gap table that is out of date costs more than no gap table: it prices work that is
already done and it hides the work that is not.**

So this version is not a reading. Every "exists / works / usable" cell marked **[M]** was driven on
a **production build** (`next build && next start`, `.next-j4par`) on the real authenticated
`/simulator`, across the six-profile ladder, by `tools/mobile/parity-e.mjs` and
`tools/mobile/parity-cards.mjs`. Cells marked **[C]** are code-derived and say so.

**COVERAGE, STATED PLAINLY.** Five of six profiles completed in one batch — `iphone16-landscape`,
`small-portrait`, `small-landscape`, `galaxy-gesturebar-portrait`, `galaxy-gesturebar-landscape`.
`iphone16-portrait` lost its batch slot to a 180 s canvas timeout while 24 node processes were
holding 8.7 GB on this 16 GB box; it was driven in its own run instead and returned the same full
green LIVE column and the same row-51 defect. **So every claim below stands on 6/6 profiles**, and
where a row's evidence is thinner than that the row says so. A third portrait run, taken while the
box was still thrashing, lost the ⚙ sheet mid-sequence and printed `ABSENT` for three cells and no
pause dialog — that run is discarded rather than averaged in, because a control that was not on
screen is not a control that failed. The card rows (39/40) were driven on three profiles.

### The instrument, and the three traps it had to be built around

* **"PRACTICALLY USABLE" IS ANSWERED WITH TWO CDP TOUCH POINTS, NOT WITH A TAP.** Playwright's
  `mouse`, `.click()` and `touchscreen.tap` are all single-point: a `.click()` silently releases the
  first finger, which looks exactly like the C2 defect and is not one. Wave 1 published *"every
  button fires with a second thumb planted"* off that instrument and wave 3 found a cell that does
  not. Here finger 1 is held on the drivetrain pad, dragged to throttle, for the whole run, and
  every verdict is a second `Input.dispatchTouchEvent` point. **The rig proves itself first**: a
  passive page-side recorder counts `e.touches.length`, and unless it observes a moment with **two**
  simultaneous points the whole LIVE column is refused rather than printed green. It observed 2 on
  every profile.
* **THE READOUT IS SLOWER THAN THE CONTROL, AND THE FIRST RUN OF THIS PROBE PUBLISHED THREE FALSE
  DEFECTS BECAUSE OF IT.** `TouchControls` reflects cabin state through a 250 ms poll
  (`CABIN_POLL_MS`), and this box renders the scene through SwiftShader at 2–3 fps. With a fixed
  420 ms settle, «ЧИСТ», «АВАР» and «СВЕТЛ» all read **DEAD**. Waiting for the transition instead of
  sleeping for it, they fire in 68–1998 ms — every one of them live. Same shape as §G0: *a probe
  that is slower than its subject reports the subject as broken.*
* **COORDINATES CACHED ACROSS A STATE CHANGE ARE NOT A MEASUREMENT.** The card probe read the chip
  rects once, tapped «ЗАЩО» — which *expands* the card and moves «Разбрах» — and then tapped where
  «Разбрах» used to be. It printed **DEAD**. The one-finger positive control caught it (the same
  pixel was dead with one finger too, i.e. the tap missed) and the row was refused instead of
  published. Re-reading the rect immediately before each press, «Разбрах» is **LIVE**. Between them
  these two traps would have published **four** defects that do not exist — which is the whole reason
  the positive control is not optional.
* Harness honesty, printed beside every run: Chromium here has no hardware GL
  (`ANGLE … SwiftShader`) and the page runs at **2–3 fps**. That is valid for geometry, hit rects,
  occlusion and activation. **No timing in this section is a phone number and none is quoted as one.**

### The three numbers that cover the whole table

Across every profile driven, with a thumb on the throttle throughout:

* **zero DEAD** in the LIVE column — eleven controls tapped with a second CDP touch point, eleven
  fired (5–1998 ms of readout lag, which is the poll, not the button);
* **zero occlusion** — `elementFromPoint` at a control's own centre returned the control itself for
  every control in every state, in every profile, including the ⚙ sheet open over the road;
* **zero under-44** anywhere except the six lesson-menu rows, which are **226×40 on every profile**.

The one exception to all of that is the paused-overlay class — row 51.

### The re-derived table

One row per action. `Δ` marks what changed against the July table: **▲** closed, **=** unchanged,
**NEW** added this wave. Sources: `modules/sim/engine/input.ts`, `modules/sim/scene/cabin.ts`
(`CABIN_KEYS` + `DRIVELINE_KEYS`), `components/sim/CameraRig.tsx` (G / N / K),
`components/sim/lesson-ui/LessonPlayShell.tsx` (X / P and the compact menu),
`components/sim/TouchControls.tsx`, and `ControlsHelp` in `LessonScene.tsx` — which **is** the
desktop contract.

**Depth** is taps from a moving car: **0** = on the glass now, **1** = one tap to a labelled
surface, **2** = a cell inside that surface.

| # | Δ | desktop action | desktop input | mobile equivalent | depth | exists | works | practically usable | needs redesign |
|---|---|---|---|---|---|---|---|---|---|
| 1 | = | Throttle | W / ↑ | drive pad, drag up (176×152, absolute, 66 px each way) | 0 | yes | yes | **YES** | no |
| 2 | = | Brake | S / ↓ | same pad, drag down | 0 | yes | yes | **YES** | no |
| 3 | ▲ | Reverse | S press-release-press, or `[` `]` | pad down-release-down; on exam/manual the ⚙ lever | 0 / 2 | yes | yes | partly — the gesture is depth 0; the lever is depth 2 **and the sheet now opens with a thumb planted [M]** (177–692 ms, 5/5) | minor — depth, not deadness |
| 4 | = | Steer L/R | A D / ← → | steering pad, drag (208×136, 84 px full lock) | 0 | yes | yes | **YES** | no |
| 5 | ▲ | Handbrake | Space | ⚙ «РЪЧНА» 44×44 | 2 | yes | yes | **YES [M]** — fired under a second finger on every profile | no |
| 6 | ▲ | Gear toward D / up | `]` / cockpit left-click | ⚙ «D►» (or «M►») 44×44 + cockpit tap | 2 | yes | yes | see §C2 — the **upshift cell under a second finger** is a live functional bug and is owned there, not here | §C2 |
| 7 | ▲ | Gear toward P | `[` / cockpit **right-click** | ⚙ «◄P» 44×44; **no cockpit gesture** | 2 | yes | yes | yes as a control; the *gesture* has no touch twin — **decided below, and the answer is "won't fix"** | no |
| 8 | ▲ | **Clutch (hold)** | Z | **⚙ «СЪЕД» 44×44, present on «Напреднал» [M]** — the July row said NONE | 2 | **yes** | see §C2 | **NOT COUNTED HERE.** The control exists; the upshift cell it is held for is §C2 | §C2 |
| 9 | ▲ | Indicator left | `,` | left flank ⇦ «Ляв» 44×44 — **on the steering thumb since the founder ruling** | 0 | yes | yes | **YES [M]** — fired under a second finger, 5/5 profiles | no |
| 10 | ▲ | Indicator right | `.` | left flank ⇨ «Дясн» 44×44 | 0 | yes | yes | **YES [M]** | no |
| 11 | ▲ | Headlights | L / cockpit | ⚙ «СВЕТЛ»→«КЪСИ»→«ДЪЛГИ» + cockpit tap | 2 | yes | yes | **YES [M]** — fired under a second finger; and the July claim that its cell is *occluded in portrait* is **false**: `elementFromPoint` at its own centre returns itself on every profile | no |
| 12 | ▲ | Fog lights | V / cockpit | ⚙ «МЪГЛА» | 2 | yes | yes | yes [C] — identical `SheetCell`; 4 of 14 cells tapped, 4 of 4 live | no |
| 13 | ▲ | Hazards | J / cockpit | ⚙ «АВАР» | 2 | yes | yes | **YES [M]** — and not occluded, same measurement as row 11 | no |
| 14 | ▲ | Wipers | T / cockpit | ⚙ «ЧИСТ» | 2 | yes | yes | **YES [M]** | no |
| 15 | ▲ | **Horn** | H (hold) | **top-rail «Клаксон»** (hold), word-labelled | 0 | yes | yes | **YES [M]** — held and released cleanly under a second finger | no |
| 16 | ▲ | Seatbelt | B / cockpit | **top-rail «Колан», rendered only while unbuckled, in danger tone**, + ⚙ «КОЛАН» + cockpit tap | 0 / 2 | yes | yes | **YES [M]** — the rail cell was present on every profile and one tap fastened the belt (single-finger tap; the cell is the same `RailButton` as «Изглед», «Пауза» and «Кола», all three of which fired two-fingered). This is the direct answer to *"ultra hard to put BElts"* | no |
| 17 | ▲ | Engine start/stop | I / cockpit | ⚙ «ДВИГ» + cockpit tap | 2 | yes | yes | yes [C] | no |
| 18 | ▲ | **Glance left mirror (GRADED)** | Q (hold) | right flank «Ляво» 44×44, worded | 0 | yes | yes | **YES**, on two pieces of evidence and neither is a tap on this button: it is the **same `GlyphButton` component** as the two indicators, which fired under a second finger on 5/5 [M]; and J-WAVE-3 measured the glances moving **30–97 % of the road band** on all six profiles. *Not individually two-finger-tapped this wave — the DOM exposes no state for a momentary glance to assert against.* | no |
| 19 | ▲ | **Glance right mirror (GRADED)** | E (hold) | right flank «Дясн» | 0 | yes | yes | **YES** — same evidence as row 18 | no |
| 20 | ▲ | **Glance rear mirror (GRADED)** | F (hold) | right flank «Задн» | 0 | yes | yes | **YES** — same evidence as row 18 | no |
| 21 | ▲ | **Camera cycle** | C | **top-rail «Изглед» 60×44, ONE TAP**, opening a labelled list «Кабина / Отвън / Отгоре» | 0 → 1 | yes | yes | **YES [M]** — opened under a planted thumb in 270–1103 ms on every profile | **no — CLOSED** |
| 22 | ▲ | **Top-down zoom 20/40/80 m** | G | **«Зум» 46×44 inside the «Изглед» popover**, shown only while «Отгоре» is live | 1 | **yes** | **yes** | **YES [M]** — cycled 40 → 80 → 20 → 40 m on every profile | **no — CLOSED** |
| 23 | ▲ | **Top-down north-up / heading-up** | N | **«Север» ⇄ «Посока» 53×44, same popover, same disclosure rule** | 1 | **yes** | **yes** | **YES [M]** — toggled both ways on every profile | **no — CLOSED** |
| 24 | = | Reversing-POV auto toggle | K | **NONE [M]** — searched by every name on the driving screen and in both menus | — | **no** | — | — | **decided below: no** |
| 25 | = | Night preview | N — **still collides with #23** | none | — | no | — | — | no (dev aid) — **but the desktop collision is real and still open**: `cabin.ts:209` binds `KeyN` to night preview while `CameraRig.tsx:433` binds the same code to the top-down orientation *and enters top-down from any view*. One press does both. |
| 26 | = | Mute audio | M — **undocumented, still not in `ControlsHelp`** | **NONE [M]** | — | **no** | — | — | **decided below: no — document it on desktop instead** |
| 27 | ▲ | Restart the car | R | ⚙ «РЕСТ» | 2 | yes | yes | yes [C] — a standstill control at a standstill depth | no |
| 28 | ▲ | Pause | Esc | **top-rail «Пауза» 53×44** | 0 | yes | yes | the BUTTON is **YES [M]**; **the dialog it opens is not — see row 51** | see row 51 |
| 29 | = | Fullscreen | X / top bar | ⚙ «ЦЯЛ» + menu row | 2 | yes | yes | poor — 2 taps, and the menu row is 40 px | minor |
| 30 | = | Minimap on/off | P / 40 px corner chip | menu «Карта» — **the corner chip is `compact ? null` [C]** | 2 | yes | yes | poor — 2 taps and a **226×40 row [M]**, under the product's own 44 px floor | yes (row height) |
| 31 | = | Advisor on/off | top-bar button | menu «Съветник» | 2 | yes | yes | poor — 226×40 | minor (row height) |
| 32 | = | Micro-quiz frequency | top-bar segmented | menu «Въпроси» | 2 | yes | yes | poor — 226×40 | minor (row height) |
| 33 | ~ | **Notifications quiet** | top-bar «Известия» | **NONE on compact [M]** | — | **no** | — | — | **downgraded — see below.** `HudToasts` is `compact ? null`; the phone already shows **one line at a time** by construction. Quiet buys it only "drop the praise beats" |
| 34 | ▲ | Difficulty tier | scene picker | **⚙ «НОРМ»/«НАПР» 44×44 cell [M]** — the scene pill is `display:none` on compact | 2 | yes | yes | **YES [M]** — switched to «Напреднал» and back on every profile; «СЪЕД» appears and «D►» becomes «M►» | **no — CLOSED** |
| 35 | = | Graphics quality preset | select-screen control | same control, same screen | — | yes | yes | poor on **both** — you must leave the drive | yes |
| 36 | = | Recall the task line | always-on banner | menu «Задача» (only while a task line exists) | 2 | yes | yes | poor — 226×40 | minor |
| 37 | = | Abort / finish | top-bar button | menu row | 2 | yes | yes | poor — 226×40 | yes (row height) |
| 38 | = | Back to all lessons | top-bar button | menu row | 2 | yes | yes | poor — 226×40 | yes (row height) |
| 39 | ▲ | **Acknowledge a teach card** | Space / Enter / button | **`SimOverlay` «РАЗБРАХ» 76×44** (351×44 once «ЗАЩО» has expanded the card), `useTapActivation` — the compact path is **not** `TeachMomentOverlay`, which is `!compact` and therefore desktop-only | 0 | yes | yes | **YES [M, 3/3 profiles]** — the seatbelt card was raised *on top of a thumb that was already accelerating* and cleared with a second finger (iPhone portrait + landscape, Galaxy gesture-bar landscape) | **no — CLOSED** |
| 40 | ▲ | Read a mistake's WHY | «Защо» button | `SimOverlay` «ЗАЩО» **47×44** | 0 | yes | yes | **YES [M, 3/3]** — same run, same planted thumb | no |
| 41 | ▲ | Dismiss a notification | click card / ✕ | `SimOverlay` ✕ 44×44, `data-hud-close` (2.75 rem `::before`) | 0 | yes | yes | probably — **`useTapActivation`, same three-chip row as 39/40 [C]. NOT DRIVEN**: a *blocking* card carries an acknowledgement instead of a ✕ (`closable` is false), and the seatbelt fault used to raise the card here is blocking, so no ✕ was ever on screen. Needs a non-blocking notification to close honestly | verify, do not assume |
| 42 | ▼ | Skip the debrief | Space / Enter | `SessionEndScreen` button | 0 | yes | yes | **NO — `onClick`-only, 6 of them [C]; the class proved dead at row 51** | **yes — row 51** |
| 43 | ▼ | Answer a micro-quiz | 1–9 + Enter, or click | `MicroQuizOverlay` — options are native `<input>`+`<label>` with `onChange`; «Провери» / «Продължи» / skip are `onClick`-only [C] `:388,395,400` | 0 | yes | yes | **NO — the July `[OPEN]` is now answered: this is the row-51 class, and the native inputs depend on the same compatibility click** | **yes — row 51** |
| 44 | ▲ | Demo deck open/close | pill | same pill — **44×44 when open on compact; 26.5 px of paint with a 44 px `::before` hit rect when closed** [C] | 0 | yes | yes | acceptable — hit rect is at the floor; **not re-driven this wave** (`l0-free-drive` carries no demonstration) | no |
| 45 | = | Deck transport | pill row | same row, 7 controls at 44×44 | 0 | yes | yes | **YES** | no |
| 46 | = | Operate a cabin control by pointing | mouse click on 13 hotspots | finger tap, verified working | 0 | yes | yes | partial — no label under the finger; see row 47 | yes (labels) |
| 47 | ~ | **Learn what a cockpit control is** | hover tooltip: verb + name + key | **partly**: during a procedure step the pending step's reachable hotspots get named chips (`labelledSpecs`, `VitokCockpit.tsx:1861`); **outside a step, nothing** | 0 | partly | yes | no — a touch device cannot hover, and the tap that would reveal the name also operates the control | yes |
| 48 | = | Mouse pedals | hold-buttons | n/a — the drive pad is the twin | — | n/a | — | — | no |
| 49 | = | Hold-to-glance edge buttons | edge cluster | n/a — the flank stations are the twin | — | n/a | — | — | no |
| 50 | = | Discover the controls | ⌨ legend, 22 rows | hidden on compact + a one-time hint | — | partly | yes | poor — the hint is dismissed once and never returns | minor |
| 51 | **NEW** | **Dismiss ANY paused overlay while a thumb is on the glass** | click / Space / Esc | the card's own button | 0 | yes | **NO [M]** | **NO — MEASURED DEAD, WITH A POSITIVE CONTROL** | **yes — and it is the last live C2 residue** |

### Row 51, because it is the only new defect in this section and it was measured

`LessonScene.tsx:1816` — the pause dialog's «Продължи», 206×44:

```
    finger 1 planted on the throttle, finger 2 taps «Продължи»   →  dialog STILL UP
    finger 1 lifted,  the SAME PIXEL tapped with one finger      →  dialog dismissed
```

Reproduced on **6 of 6 profiles**. The positive control is the whole of the evidence: a
control that does not fire may be dead or may have been missed, and only the second press tells you
which. The mechanism is §C2 exactly — a compatibility mouse `click` is only synthesised for the
**primary** touch point — and the reason it survived wave 1 is that wave 1 fixed the four call sites
on the *driving* overlay and these cards are not on it.

Pausing does not lift the student's thumb. Every surface below pauses the world, is reachable on a
phone, and is `onClick`-only:

| surface | file | `onClick`-only controls |
|---|---|---|
| pause dialog | `components/sim/LessonScene.tsx:1816` | «Продължи» |
| first-run touch hint | `components/sim/LessonScene.tsx:1795` | «Разбрах» |
| micro-quiz (row 43) | `components/sim/lesson-ui/MicroQuizOverlay.tsx:388,395,400` | check, continue, skip |
| mistake consequence | `components/sim/lesson-ui/MistakeConsequenceOverlay.tsx:226,231` | «Сега опитай правилно», dismiss |
| pre-drive tutorial | `modules/sim/hud/PreDriveTutorial.tsx:277,400,605` | play clip, close, continue |
| session end / debrief (row 42) | `modules/sim/hud/SessionEndScreen.tsx:480,520,924,954,959,975` | skip, auto-open, start, retry, next, exit |

`modules/sim/hud/SimOverlay.tsx` — the compact drive queue — is the one that is already correct:
**13 `useTapActivation`, zero `onClick`.** That is why rows 39–40 measured green and these will not. The
fix is the same one line at each call site, and it is a smaller change than the row count suggests.

### Summary — the gap is three missing controls, not six

**CLOSED SINCE THE JULY TABLE:** the clutch has a cell (row 8), G has a button (22), N has a button
(23), the camera is one tap (21), the difficulty tier is one cell (34), the acknowledgement chip is
live (39), and the eleven controls that carried "no\*" — dead under a finger — were each tapped with
a second CDP touch point and each fired: rows 5, 9, 10, 11, 13, 14, 15, 21, 34 and the sheet opener — **eleven presses, eleven activations, zero dead, on every profile.**

**GENUINELY MISSING, AND ALL THREE ARE PREFERENCES RATHER THAN DRIVING CONTROLS:** the reversing-POV
toggle (K, row 24), mute (M, row 26) and notifications-quiet (row 33). **Not one of them costs a
phone student a graded action.**

**PLUS** one desktop gesture with no touch twin (right-click toward P, row 7), one desktop affordance
with no touch analogue by nature (hover naming, row 47), one desktop key collision (N, row 25) — and
**row 51, which is the only thing in this section that is broken rather than absent.**

### The four candidate gaps, decided — by how often a learner needs it mid-drive, and whether missing it costs a GRADED action

**K — the reversing POV (row 24). NEITHER A BUTTON NOR A GESTURE.** `reverseViewStore.ts` defaults it
**ON**, and the file states why: *"a driver who reverses without looking back is precisely what this
teaches away from — so the student opts OUT, never in."* A phone student who cannot reach K keeps the
pedagogically correct state; the state they cannot reach is the *worse* one. It is a persisted
preference changed about once ever, and the graded act — the mirror glance — is a depth-0 flank
button they already have. **Missing it costs zero graded actions.** The one scenario that argues the
other way is a student who finds the automatic swing disorienting on a small screen held close; that
is worth a **menu row beside «Съветник» and «Въпроси»**, which is one entry in the existing
`menuItems` array, and nothing more. It is explicitly *not* a rail button: `TouchControls.tsx`
already argues this in the `ViewRailControl` block — a sticky preference in a list of three momentary
view choices teaches that they are the same kind of thing.

**M — mute (row 26). DO NOT ADD IT.** Two facts decide it and they point the same way. (1) The
product's own pedagogy forbids encouraging it: `audioPrompt.ts` / doc 82 §4.4 — a muted session
teaches a systematically **faster** car (~3.2 km/h of over-production; ~10 % in visual-only sims) and
the app already renders a card *nagging a muted student to unmute*. A one-tap mute button on the
driving screen would be a control the product spends a card arguing against. (2) A phone **has** a
mute control — the hardware volume rocker, and on iOS the ring/silent switch — sitting under the
same hand, which is exactly what a desktop browser tab lacks and why `M` exists there at all.
**Missing it costs zero graded actions.** The real defect on this row is on the *desktop*: M is bound
(`cabin.ts:210`) and is not in `ControlsHelp`, so the only platform that needs it is the one that
cannot discover it. **One legend row, ~10 minutes.**

**Notifications quiet (row 33). A MENU ROW, NOT A BUTTON — AND THE JULY FRAMING WAS WRONG.** The old
row read *"the phone, which has the least room for toasts, is the one device that cannot turn them
down."* `HudToasts` is `compact ? null` — **the phone has no toast column at all.** Compact feeds the
same events through `SimOverlay`, which shows **one line at a time by construction**, which is most
of what quiet mode buys on a desktop. The residue is real but small: quiet also drops the «Браво»
praise beats, and those are compact overlay candidates. So this is a *noise preference*, it costs
zero graded actions, and it belongs exactly where its two siblings already are — **one more entry in
`menuItems` beside «Съветник» and «Въпроси»**, sharing their row treatment. It is not an emergency
and it should not be a rail button: the rail is for controls a learner must *find*, and nobody hunts
for a notification setting mid-corner.

**Right-click toward P (row 7). WON'T FIX — AND THE GAP IS NOT THE GESTURE.** The *function* is
«◄P», a 44×44 cell in the same ⚙ strip whose cells fired 4-for-4 under a second finger. What has no twin is the *gesture*, and
the obvious twin is a long-press on the gear-lever hotspot, which is wrong three times over: a
long-press is the browser's own selection / context-menu gesture and behaves differently across iOS
Safari and Android WebView; it is undiscoverable, which is the founder's own *"I do not know what is
a button"*; and the hotspot is an unlabelled 3D mesh on touch (row 47), so only a student who already
knew could find it. **The cost worth naming on this row is not the missing gesture — it is that the
lever is depth 2 during the one manoeuvre that needs it, reverse parking (row 3).** That is a §H
layout question — surface ◄P / D► on the flank while the car is stopped on a reversing rung — not a
parity gap, and it should be costed there or not at all.

### What "practically usable" was judged against

Not a checklist. A control is **YES** only if all of these held when it was driven: it is reachable
without stopping the car (**live under a second finger**, measured, not assumed); it is at least
44 px in both axes; `elementFromPoint` at its own centre returns the control itself; its depth is
proportionate to how often a learner needs it mid-drive; and it carries a **word**, because a graded
procedure step behind a 15 px mystery glyph is a step the product is refusing while pretending to
offer it. By that rule the two 226×40 menu rows and the depth-2 gear lever are **not** usable even
though they exist, work, and would pass any box-ticking version of this table.

---

## F. Reference comparison

His screenshot is a racing game's driving HUD. It is a good reference and it is not a template.

### What it does better, and that transfers

1. **Two huge, invisible zones at the flanks for the two continuous axes.** We already do this and it
   is our best decision — pads at 267×157 and 235×173, ~31 % and ~28 % of the width, painting ~900 px²
   each. **Keep, and grow the drive flank upward so the thumb never hunts.**
2. **The centre is completely clear.** On *ink* we are already there (0.58 % of the centre 50×50 box in
   landscape). **Do not spend another hour on ink.** [EMU]
3. **Information at the top and bottom edges only, never the middle.** Our bottom-centre telemetry is
   exactly right. Keep.
4. **One opaque, word-labelled «VIEW» button top-left, where no thumb rests.** **We do not have this.
   Take it verbatim** — that corner currently holds one 48×44 button and nothing else on every profile
   measured.
5. **One or two opaque controls; everything else ghosted.** Consistent with doc 89 §1: he wants *naked
   text and thin outlines on the image*, not cards.

### What ours does poorly

- **Eight controls at 39.7–60.1 % of the screen height — the reference's forbidden band.** [EMU]
- **Every graded procedure control is an invisible box with a 15 px glyph** — on his phone that is
  ~2.5 mm of ink inside a 7.3 mm invisible target, and a 17-year-old has no way to know «З» is the
  rear-view mirror.
- **The one camera control is two taps inside a settings sheet and is named «ИЗГЛ».**
- **The settings sheet is a 596 px row across the horizon.**
- **22–32 % of the driving view intercepts taps** — the second coverage currency, and the damning one.
  (Ink coverage: 3.24 / 5.21 / 3.85 / 4.55 % across the four profiles. Tap-interception: 31.9 / 24.1 /
  28.2 / 22.7 %, and 30.3 % of the middle horizontal band in landscape.) [EMU]

### Where the reference's minimalism would cost us pedagogy — the distinction he asked for

1. **A racing game can hide its controls because the player only needs throttle and steering, and
   because failure costs a lap time. We grade procedure.** If a learner cannot *see* that an indicator
   exists, they do not signal, the rule engine marks them down, and the north-star claim is broken by
   our own UI. **Hiding is legitimate for throttle and steer** — the student cannot fail to find them,
   they are the whole flank. **It is illegitimate for indicators, mirrors, seatbelt, handbrake and
   gear, every one of which is a scored A2 procedure step.**
2. **20 %-opacity labels are fine for "THROTTLE", which the player already knows. They are fatal for
   «Мигач наляво», which is the thing being taught.** Our current ghost register is the same mistake in
   the other direction: invisible enough to satisfy the screen budget, illegible enough to fail the
   lesson. **Measured proof: the belt is unreachable in practice and the product raises a fault about
   it within ten seconds.**
3. **A blended control surface** — a racing game merges brake and downshift. **We cannot:** the exam is
   P/R/N/D + clutch and the driveline must stay discrete.
4. **"Nothing overlaps the driving view", taken literally.** Some of our teaching *must* be in the view
   — the ghost ribbon, the objective marker, the chevrons. **Those live in the world (3D), not the DOM,
   and that is the right place.** The rule to adopt is: **teaching goes in the world, controls go on the
   edges, prose goes in the right column.**

**The honest conclusion: three of his five reference principles are already ~80 % done. The effort
belongs in the two that are not — the empty middle band, and naming the controls.**

---

## G. Performance findings

> **THIS MACHINE AT PHONE DIMENSIONS. NOT HIS HANDSET.**
> Windows 10, 8 cores, **GTX 1060 6 GB via ANGLE/D3D11** (renderer string read at runtime — a real GPU,
> not SwiftShader), rendering phone-shaped viewports. Emulation reproduces viewport, touch model, UA,
> layout, draw counts, triangle counts and main-thread work. **It does not emulate a GPU.**
> Additionally: every run was on a **`next dev` (Turbopack) build**, not production.

### G0 · The instrument spread is itself a finding — do not quote a single fps number from this wave

Same 852×393 viewport, same machine, different lanes and tiers: **3.1 fps · 12.1 fps · 47.6 fps ·
57.8 fps.** One lane re-measured the *same profile* at the end of its own session and it moved
**32.9 → 52.9 fps.** Free RAM ranged 1.0–4.1 GB with up to four workflows competing.
**The within-session ratios, taken back-to-back in one page load, are trustworthy. The absolute
figures are noise.**

### G1 · The trustworthy numbers — GPU time, per-pass, one page load, back-to-back

| tier | viewport | GPU ms/frame | draws | triangles | p95 frame | worst frame |
|---|---|---|---|---|---|---|
| **low** | 852×393 | **2.55** | 113 | 110 k | 50 ms | 83 ms |
| **medium** | 852×393 | **14.62** | 261 | 166 k | 250 ms | **3.35 s** |
| low | 393×852 | 2.40 | — | — | — | — |
| low | 360×800 | 2.47 | — | — | — | — |
| low | desktop control 1264×620 | 2.98 | 148 | 118 k | — | — |

**The tier is worth 5.7× on GPU time and 2.3× on draw calls. The viewport is worth almost nothing.**

### G2 · At tier low the frame is main-thread-bound, not GPU-bound and not fill-bound

GPU 2.4–3.2 ms/frame at every viewport, while main-thread task time is **65–95 % of wall**, of which
**94–96 % is script** (`LayoutDuration` 1 ms, `RecalcStyleDuration` 0 ms, `LayoutCount` 2 over an 8 s
window). It is not layout, not style, not paint.

**CPU self time, tier medium, phone landscape — with the dev-build caveat made loud:**
**32–36 % is React's dev-only JSX factory** (`jsxDEV` 22.7–26.7 %, `createElement` 4.3 %, `jsxDEVImpl`
2.5–3.1 %, `createTask` 1.7 %). **All of that disappears in a production build.** What survives:
three.js 18–25 %, react-dom/scheduler 6–11 %, @react-three/fiber 5.5–7.1 %, GC 1.4–6.6 %, our own app
code 2–5 %, **Rapier 0.2–0.5 % — the physics engine is not the cost.**

### G3 · Modelling a slower main thread reproduces his complaint at the cheapest tier

| condition | fps | p50 frame |
|---|---|---|
| tier low, 1× | 47.6 | 16.7 ms (vsync cap) |
| **tier low, 4× CPU throttle** | **7.4** | **116.6 ms** |
| tier medium, 1× | 12.1 | — |
| **tier medium, 4× CPU throttle** | **2.2** | **450 ms** |

**[ASSUMPTION] A phone's single-thread performance relative to this desktop is somewhere in this
range. That is a model, not a measurement of his device.**

### G4 · The numbers that ARE device-independent and therefore DO transfer to his phone

Draw calls, triangles, shader programs and bytes are properties of what the scene asks for, not of the
GPU it asks on.

| metric | measured at phone dimensions | doc 82 budget | verdict |
|---|---|---|---|
| draw calls | **113–139** (low, `pe-cane-v1`) · **261** (medium, same district) · **351** (medium, `gw-shell` default district) | ≤150 (cap 250) | **FAIL at medium on both districts** |
| triangles | 110–118 k (low) · 166 k (medium) · **772 k** (the other district) | ≤700 k | **WARN / FAIL, district-dependent** |
| shader programs | 72–77 | — | stable across viewports |
| first-playable wire | **12.06 MB** | ≤9 MB | **RETRACTED — dev-build figure, see G4a** |
| script bytes | **4,247 KB** | ≤1,200 KB | **RETRACTED — dev-build figure, see G4a** |

### G4a · RETRACTION (2026-08-12, J-Wave-3): the two byte rows above were a dev-build artefact

**Both byte rows in the table above were measured on `next dev`, and the second of them was the
headline of this audit. On a production build they are roughly a third of what is printed there.**
Every other row in G4 stands — draws, triangles and programs are unaffected by the build mode.

Wave 0b said to build production once before sizing anything. This is that measurement, taken with
one instrument (`tools/mobile/wire-probe.mjs`, checked in) against both builds: same route
(`/simulator?scenario=sc-zebra-approach&level=1`), same device (iPhone 16 landscape, WebKit), same
cold HTTP cache, **tier `low` confirmed from the app's own line** (`[sim-perf] tier=low …
postprocessing=false`).

| metric | `next dev` | **production** | change |
|---|---|---|---|
| script bytes, *as PerfProbe reads them* | 3,860 KB | **1,216 KB** | **−68 %** |
| script bytes, every `.js` the document pulled | 3,903 KB | **1,256 KB** | **−68 %** |
| JS **decoded** — what the engine actually parses | 19,495 KB | **4,730 KB** | **−76 %** |
| first-playable wire | 6.65 MB | **3.68 MB** | **−45 %** |

**So the „3.5× over budget" headline is, in production, 1,256 KB against the 1,200 KB row this
document quoted — 4.7 % over, not 254 % over.** Scored against tier `low`'s own row (500 KB, which is
the honest comparison now that a phone seeds to `low`) it is 2.5× over, and the wire figure is 3.68 MB
against `low`'s 3.5 MB — 5 % over, a WARN. **The bundling problem is real but it is ordinary, not
catastrophic, and it is not the reason the founder's phone is slow.**

Two honesty notes. (1) The instrument reproduces: the same probe reports 3,860 KB on `next dev`
against the 4,247 KB in the table, i.e. within 9 %, so this is a like-for-like comparison and not a
different measurement. (2) The dev **wire** figures differ (6.65 MB here vs 12.06 MB above) because
they are **different districts** — as with the draw-call rows, a wire number must not be quoted
without its district. **Trust the dev→prod ratio, which is one district measured twice; do not
subtract 3.68 from 12.06.**

Full evidence, per chunk and per profile: `tools/mobile/wire-baseline.json`.

**Two things this corrects.** (1) The 3–5× draw-call breach is real and it transfers — but **phone
canvases measured *lower* than the desktop control, not higher** (119–139 vs 148 probe draws on the
same district and tier). It is not what changes between his desktop session and his phone session.
(2) The two draw-call figures on record differ because they are **different districts at different
tiers**; both are over budget and neither should be quoted without its district and tier.

### G5 · The first six seconds of every session are a stall

Per-second windows at phone dimensions: **1.2 fps, 0.4 fps, 10.9 fps, 52.5 fps**, then steady, with
individual frames of **3,218 ms and 4,234 ms**. Cause is shader compile + texture upload, **which is
worse on a phone, not better.** It also contaminates the app's own thermal-decay metric, whose
12–17 s window cannot separate the compile stall from steady state.

### G6 · What was NOT measured, and cannot be from here

- **Frame time on his handset.** Nothing in this wave is that number.
- **The cost of the full-viewport `backdrop-filter`** (D12d) — it runs in the browser compositor,
  outside both the page's WebGL timer and CDP's main-thread metrics. **Provable that it is there;
  not priceable from here.** Needs a Chrome trace with `disabled-by-default-devtools.timeline.frame`
  or an on-device GPU trace.
- **Production-build main-thread cost.** A third of what was measured is `jsxDEV`. **Every absolute
  main-thread figure here is an upper bound.** (The 29.6 commits/s is *not* affected and does transfer.)
- **Thermal decay over a full lesson.** Every window here is 6–17 seconds. D12c is a thermal argument
  and a ten-second window cannot see thermal decay.

---

## H. Proposed mobile control layout — described, not built

Landscape. Portrait keeps asking the student to rotate, which it already does.

```
+----------------------------------------------------------------------+
| [МЕНЮ] [ИЗГЛЕД v] [!КОЛАН]              Задача 1/2                    |  TOP RAIL  y 8..52
|  44px    44px      44px, only while unbuckled    240px notify column  |  OPAQUE · WORDS · no thumb rests here
|                                                                      |
| +--+                                                          +--+   |
| |⇦ | ЛЯВ                                                      |Л |   |  PROCEDURE RAILS  y ~0.36H..0.62H
| +--+                                                          +--+   |  hard against the outer edge
| +--+               (   R O A D   —   E M P T Y   )            +--+   |  44px · LABELLED · always visible
| |⇨ | ДЯСЕН                                                    |З |   |  ghost fill + word, not a bare glyph
| +--+                                                          +--+   |
|                                                               +--+   |
|                                                               |Д |   |
|                                                               +--+   |
|################                                    ################  |
|#   STEER      #      0 км/ч   D   <=50             #   ^ ГАЗ      #  |  DRIVING FLANKS  y 0.35H..1.0H
|#  whole left  #      bottom-centre, small,         #  v СПИРАЧКА  #  |  INVISIBLE · ~30% width each
|#     flank    #      non-interactive               #  whole right #  |  ink = the two 22px marks only
|################                                    ################  |
+----------------------------------------------------------------------+
```

**Placement justified by thumb and by frequency.** [EMU] Measured travel from each pad's resting
centre: today's stations are 19–24 mm away in landscape and 22–42 mm in portrait, so **distance is not
the problem — *which thumb* is.**

| control | frequency | where | why |
|---|---|---|---|
| Steering, gas/brake | continuous, every second | the two flanks, under the resting thumbs | zero travel. Unchanged in principle; grow the drive flank up to 0.35H so the thumb never hunts. |
| **Indicators** | 2–6 per lesson, **always before a manoeuvre while still going straight** | **both on the LEFT (steering) flank**, stacked | Mirrors the real stalk (left of the column in a LHD car) and frees the throttle thumb entirely. **Today «Мигач надясно» is on the RIGHT arc, so signalling right costs the accelerator — the exact opposite of what the exam wants.** Lifting the steering thumb while travelling straight is what a real driver does with a stalk. |
| **Mirrors Л / З / Д** | 10–30 per lesson, always **before** an action | **all three on the RIGHT (throttle) flank** | Lifting off to check a mirror is *correct driving*, so the interaction cost teaches the right habit instead of fighting it. |
| **Camera «ИЗГЛЕД»** | occasional | **first-class, opaque, word-labelled, TOP-LEFT** — exactly where his reference puts «VIEW» | Tapping opens a 3-cell popover КАБИНА / ОТВЪН / ОТГОРЕ; while ОТГОРЕ is live it grows ЗУМ (20/40/80 m) and СЕВЕР/ПОСОКА. **This is the first touch home G and N have ever had**, and top-down is the view the codebase itself says reverse-park is unreadable without. |
| **Seatbelt «!КОЛАН»** | once per drive | **a danger-toned top-rail cell that exists only while unbuckled and vanishes the moment it is fastened** | A control required before every drive and never after it should be visible exactly then. **This is the smallest change that kills the teach-moment trap.** |
| Pause, horn, ⚙ | rare | top rail | none of them belongs under a driving thumb |
| **⚙ sheet** | rare | **stop being a full-width row.** Dock it as a 2-wide × up-to-5-tall grid above the RIGHT flank (88×220 px), bottom-aligned | It can then never cross the centre, never touch the demo pill, and it sits under the thumb that opened it. Ten cells fit. |
| Telemetry | continuous, read-only | bottom-centre, small, non-interactive | already correct |
| **Minimap** | optional | onto `TOUCH_CONTROLS_FLOOR`, or into the empty LEFT corridor (y 52..171) | today it is 24,343 px² on top of the right thumb zone |

**Every target stays 44 px. Nothing shrinks** — he rejected that explicitly and he was right. **What
changes is *where*, and *whether it has a word on it*.**

[EMU] **The ink cost of the words:** ~370 px² per 5-letter caption × 8 controls ≈ **3.0 k px² = 0.9 %
of a landscape iPhone**, taking ink coverage from 3.24 % to ~4.1 % — **and buying back the middle of
the screen and the ability to name what you are pressing.** Consistent with doc 89 §1: the register is
*naked labelled text over the road*, not another card. **That is the trade this audit recommends, and
it is his to accept or refuse (§K8).**

---

## I. Proposed technical fixes — smallest correct fix per problem

**Nothing below was implemented.** Each row is the *smallest* change that closes the defect, and where
a tidier-looking answer does not actually work, that is said.

| # | problem | smallest correct fix | files |
|---|---|---|---|
| **I1** | **C1 · dead pedal** | Two assignments in the effect **that already exists for exactly this purpose** (`:681–683`), which already releases the axes and forgot the ownership refs: add `steerPointer.current = null;` and `drivePointer.current = null;` inside `if (!visible)`. Fixes both pads, needs no change to the pause plumbing, cannot regress the non-paused paths (nothing runs while `visible` is true). | `components/sim/TouchControls.tsx` (2 lines) |
| | | **Deliberately NOT the fix:** adding `onLostPointerCapture` to the two pads to mirror `HoldGlyphButton:1315`. It looks like the tidy symmetric answer and **it does not work on its own — once the node is detached, no event of any kind reaches React's root container.** Worth adding *afterwards* as belt-and-braces for genuine capture-loss cases; it must not be mistaken for the fix. | |
| | | **Regression test that pins it, no browser needed:** mount `TouchControls`, `pointerdown` on the drive pad, flip `hidden` true, flip it back, `pointerdown` again, assert `touch.setThrottle` is called. | new `__tests__` |
| **I2** | **C2 · every button dead under two fingers** | One shared `useTapHandlers(fn)` returning `{onPointerDown, onPointerUp, onPointerCancel}` — the `HoldGlyphButton` idiom already in the file — applied at four call sites. Guard `onPointerUp` by a matching `onPointerDown` with the same `pointerId` so a drag that merely ends there does not fire. **Keep `onClick` as well** so mouse, keyboard and assistive activation are unchanged, de-duplicated with a ref flag. | `TouchControls.tsx` (`GlyphButton`, `SheetCell`), `modules/sim/hud/SimOverlay.tsx`, `LessonPlayShell.tsx` (`PlayMenu`) |
| | | **Caveat, stated:** this is a behaviour change on the one surface where a stray touch must not act. Verify against the existing `touchLabels`/`touchArc` tests before shipping. | |
| **I3** | **C1/C4 companion · the controls vanish mid-drive** | Replace `if (!visible) return null` (`:838`) with a rendered-but-inert state: `pointer-events: none` + `aria-hidden` on the root, **keeping `touch.releaseAll()` exactly as it is.** The element survives the interruption, so the finger already on the pad delivers its next `pointermove` to the same node and the pedal returns the instant the card is dismissed — **no lift-and-press ritual.** | `TouchControls.tsx` |
| **I4** | **C3/L8/U5 · the belt trap** | (a) `PreDriveTutorial.tsx:380` — card gets `max-h-full overflow-y-auto` so the **card** scrolls instead of the backdrop, and the button row gets `sticky bottom-0` with the card's own background and negative padding. «Разбрах» is then on screen at every size. Two class strings; nothing changes on desktop. (b) `PreDriveChecklist.tsx:189–195` — gate the auto-open on `!compact`, passing `compact` down from the shell, which already computes it (`LessonPlayShell.tsx:1203`). On a phone the student then lands on the pending-step card with «Покажи ми как» and opens the explanation when he wants it. | `modules/sim/hud/PreDriveTutorial.tsx`, `modules/sim/hud/PreDriveChecklist.tsx`, `LessonPlayShell.tsx` (prop) |
| **I5** | **C5 · the 4 px dead end** | **Both, they are independent one-liners.** (a) `SimOverlay.tsx:296` → `const closable = !blocking && shown.noDismiss !== true;` and set `noDismiss: true` on the predrive item. *(The A6 ruling "those pop ups need to be able to be removed when clicked" is about transient notifications; this item is the task itself, which is why it has no TTL either.)* (b) Add a compact menu entry «Подготовка n/13» that clears the `predrive:` ids — **exactly the recall pattern «Задача» already uses.** **The general rule: any line the student can send away needs a way back.** | `modules/sim/hud/SimOverlay.tsx`, `LessonPlayShell.tsx` |
| **I6** | **T1 · pinch-zoom on the driving surface** | **One declaration:** `touch-action: none` on the shell root or the scene's canvas wrapper. Smallest change that suppresses browser pan *and* pinch in every engine **including iOS Safari — which is the point: Safari has ignored `user-scalable`/`maximum-scale` since iOS 10, so the meta tag cannot do this job.** **Explicitly do NOT add `maximum-scale=1, user-scalable=no` to `app/layout.tsx`:** that export is global, it would disable pinch on the theory and exam screens where minors read dense Bulgarian legal text (an accessibility regression), and **it would not even work on his phone if he is on iOS.** Scope it to the simulator. | `LessonPlayShell.tsx` or `LessonScene.tsx` (1 line) |
| **I7** | **C6 · stale `--sim-vh`** | The bug is the hook's *activation argument*, not its body: `:1211` → `useVisualViewportHeight(immersive \|\| isFullscreen)`. **What must stand down in fullscreen is the inline HEIGHT, not the MEASUREMENT**, and `:2517` already guards the height separately. Widening the hook therefore changes no element's height and only makes the published variable true. **One argument.** | `LessonPlayShell.tsx` |
| **I8** | **L12 · 16 px of road** | Make the `isFullscreen` arm respect the same rule the `immersive` arm already has: `compact ? "" : "gap-2 p-2"` instead of hard-coded `p-2`. One ternary; returns 16 px of width and height on every phone frame. | `LessonPlayShell.tsx:2506` |
| **I9** | **L11 · document taller than the screen** | Scope the payback rather than widen it: stop applying `body { padding-bottom: env(safe-area-inset-bottom) }` while the immersive shell is mounted. **`globals.css` already uses a `:has()` selector for exactly this shape of cross-tree problem** (it stands the dashboard topbar down inside the simulator), so the same mechanism does it with one rule and no new concept. **Lowest urgency — it is unreachable on the screen he was complaining about.** | `app/globals.css:535–537` |
| **I10** | **L3 · minimap on the thumb** | `bottom: var(--sim-hud-floor)` → `TOUCH_CONTROLS_FLOOR` on compact, exactly as `PlayAreaStyles` already does for the demo deck. If that leaves no room in landscape, change corridor the same way the deck does under `@media (max-height: 560px)` — **the LEFT corridor is empty from y 52 to y 171.** | `LessonPlayShell.tsx` |
| **I11** | **D4/C4 · the sheet stands on the controls** | `SimOverlay.tsx:532` — `bottom: var(--sim-dash-h)` → `calc(var(--sim-dash-h) + var(--sim-touch-floor, 0px))`, with the shell publishing `--sim-touch-floor` from `touchControlsFloorPx()` the same way it already publishes `--sim-dash-h`. **BE HONEST ABOUT THE TRADE:** on an 852×393 phone the touch floor is ~216 px and the dash 40 px, leaving **~137 px for the sheet, not 244.** So the sheet must become a two-line card (pending step + «Потвърди») and «ВСИЧКИ СТЪПКИ» becomes what expands to full height — and, while expanded, may legitimately cover the controls, **because the student asked for it.** **That is a redesign of one component's compact branch, not a one-liner, and pretending otherwise is how this class of defect keeps coming back.** | `modules/sim/hud/SimOverlay.tsx`, `LessonPlayShell.tsx` |
| **I12** | **U1/M6 · mouse-only copy** | Add `tapBg?: string` to `PreDriveStepControl` and author one per performed step (fasten-seatbelt: «Натисни ⚙ долу вдясно, после „КОЛАН"»; adjust-mirrors: «Натисни Л, З и Д отстрани на екрана»; …). Overload `preDriveMouseActionBg()` to take the pointer kind. Give `PreDriveChecklist.tsx:67` a touch twin of the МИШКАТА subtitle. **Extend `predrive-mouse-first.test.ts` to assert a `tapBg` for all thirteen — same honesty rule, now with three input devices instead of two.** | `modules/sim/procedures/performedSteps.ts`, `PreDriveChecklist.tsx`, tests |
| **I13** | **U2/L1 · unnamed controls** | A 9 px caption under each glyph, or a first-run labelled state. Costs almost no ink and turns «Л З Д ⇦» into controls a 17-year-old can find without being told. **This is the control a pre-drive step points at four times.** | `TouchControls.tsx:961–1021` |
| **I14** | **L9 · sub-44 px hit rects** | Menu rows `py-2.5` → `py-3` (39.5 → 44). Checklist buttons and disclosure rows + demo pill: the `before:absolute before:-inset-y-*` invisible pad **that `QualityPresetSelector` already uses** — zero painted pixels, and the project's own probe honours it. | `LessonPlayShell.tsx`, `PreDriveChecklist.tsx`, `PlayAreaStyles.tsx` |
| **I15** | **L10/D11 · centre-blind reach table** | `hotspotVisibleRect()` additionally requires the clipped rect's **centre** to lie inside [0,1] on both axes before returning non-null. `looksNeededFor()` then offers the head turns instead of silently claiming the mirrors are in frame. **This is a test-covered surface (`cabinLook.test.ts` sweeps every aspect) — make the change *with* that sweep, not against it.** | `modules/sim/scene/vitok/cabinLook.ts:288–301` |
| **I16** | **L13 · overlapping overlays** | The shell **already owns** a one-overlay-at-a-time switch (`data-sim-overlay-active`, `LessonPlayShell.tsx:2494`) and the touch-hint lines are not participating in it. **The fix is to enrol them, not to move them.** | `LessonPlayShell.tsx`, `LessonScene.tsx:1653–1697` |
| **I17** | **D12a · tier seed** | **One-line deletion that cannot make anything slower:** remove `if (touchOnly && deviceMemoryGb >= 8) return "med";` (`quality.ts:351`). Every touch-only device then falls through to `low`. Measured effect at a phone viewport: **12.1 → 47.6 fps, GPU 14.62 → 2.55 ms, draws 261 → 113, backing store 1065×491 → 852×393.** Blast radius: the flagship-Android case in `__tests__/quality.test.ts`. **If he prefers to keep the carve-out, the strictly smaller alternative is `QUALITY_PRESETS.med.maxDpr` 1.25 → 1.0, which alone removes 36 % of the fragment work.** | `modules/sim/environment/quality.ts` |
| **I18** | **D12b · the disconnected safety valve** | Call `useAutoQualityProbe()` in `simulator-client.tsx` beside `useQualityPreset()`. The ledger, the bands, the hysteresis and the "apply at next cold start, never mid-drive" discipline are already written and tested. **This is what makes I17 unnecessary in the long run — but ship I17 anyway, because I18 only helps on the *second* session.** | `app/simulator/simulator-client.tsx` (1 call) |
| **I19** | **D12c · rendering behind modals** | `LessonScene.tsx:1112` → `frameloop={physicsPaused ? "demand" : "always"}`. **One companion check:** anything that must animate under a card must call `invalidate()` — a demand loop renders nothing on its own. | `components/sim/LessonScene.tsx` (1 prop) |
| **I20** | **D12d · blur over a live canvas** | Replace `backdrop-blur-sm` with an opaque scrim in the four full-screen overlays whenever the canvas is live. **I19 and I20 compound:** with the loop stopped the blur has a static source and the compositor can cache it. **Do them together.** | `LessonPlayShell.tsx:3251`, `TeachMomentOverlay.tsx:308`, `MicroQuizOverlay.tsx:161`, `MistakeConsequenceOverlay.tsx:140` |
| **I21** | **D12f · mirror RTT** | `LOW_REAR_CADENCE.interval` 4 → 8. Halves a pass measured at 25–34 % of the tier-low GPU frame; the mirror updates at ~7 Hz instead of ~15 Hz on the tier where the glass is smallest and dimmest. **Re-measure after I17 — at `low` it becomes the largest single remaining GPU item.** | `components/sim/vitok/MirrorRig.tsx:361` |
| **I22** | **D12e · 29.6 React commits/s** | **The real one, and it deserves its own design.** Two candidate shapes: (a) turn `snap` into a `useSyncExternalStore` subscription so only the HUD leaves that read it re-render — **the pattern `QualityPresetSelector.tsx:91` already uses in this codebase for exactly this reason**; or (b) leave the poll and memo `SceneSlot`/`LessonScene` on stable props so a HUD tick cannot reach the canvas. **Target metric, already instrumented: DOM-root commits/s 17.9 → ~0 during steady driving, R3F-root 11.7 → ~0.** **Do not attempt this without the commit counter running before and after, and not before the further update sources are enumerated.** | `LessonPlayShell.tsx` |
| **I23** | **M1 · camera** | Promote «ИЗГЛ» out of the ⚙ sheet into an opaque, word-labelled top-left button (§H). **The arc arithmetic says eight stations is the ceiling, so this must NOT become a ninth station — it belongs in the top rail.** | `TouchControls.tsx` |
| **I24** | **M2 · clutch** | Either a hold-to-clutch control using the horn's exact idiom (**multi-touch-safe by construction**), or gate «Напреднал» off on touch devices with an honest sentence. **Needs his decision (§K5).** | `TouchControls.tsx` |
| **I25** | **T4 · tap does nothing** | **A design decision, his call, not smuggled in under a bug fix.** Smallest candidate, one line at `TouchControls.tsx:804`: seed the gesture origin at the pad's vertical **centre** instead of at the touch point, so a press in the upper half is instantly throttle and the lower half instantly brake, while drag, the 6 px dead zone, the expo curve and ReverseAssist all keep working. **That is literally his own specification ("up is forward, middle is stop, down is backwards")** and it matches the reference's whole-flank throttle zone. **Cost:** it removes the "gesture starts wherever the thumb landed" property that the code comment at `:731–733` defends. There is already a tested, exported, currently-unused helper for the absolute idiom (`pedalFromPointerY` in `modules/sim/engine/touch.ts`). **See §K3.** | `TouchControls.tsx` |
| **I26** | **G4 · budgets** | (a) ~~**4,247 KB of script against 1,200 KB is a bundling problem, not a rendering one** — biggest transferable number in the wave.~~ **RETRACTED, see G4a: in production it is 1,256 KB, i.e. 4.7 % over the row quoted here, not 254 %.** What survives is (a′) below. (b) 351 draws against 150: the existing per-pass GPU timer (`__simPerf.gpu(8)`) exists to find where they go; instancing/merging the world props is the usual answer. (c) **Put the quality preset in the lesson menu** — today an FPS complaint costs him the whole session to act on, on both platforms. | bundling config, world builders, `LessonPlayShell.tsx` |
| **I26a′** | **G4a · the one bundling win that is left** | **The largest single identifiable thing in the JS a phone parses before it can drive is the scenario catalogue: 336 KB gz / 1,502 KB raw, of which ~917 KB is Bulgarian text — all ~150 `ScenarioSpec` templates, for a session that plays exactly one.** Same shape as the composer split (which is worth 170 KB gz and is verified holding in production, G4a), and 3.5× bigger by parse cost. It is reachable because `simulator-client.tsx:145` calls `scenarioById()` **synchronously inside a `useMemo`**, and that is a lookup over `SCENARIO_TEMPLATES`. **It is NOT a one-liner and must not be shipped as one:** deferring it means an async resolve (`await import()` keyed by template family) plus a loading state, and the catalogue *screen* already gets its titles from the server (`page.tsx` builds `ScenarioCatalogEntry[]` as props), so **no visible content is lost — this is deferral, not deletion.** Size it against the fact that production is already inside the `med` budget; this buys the `low` budget, not a rescue. | `modules/sim/lessons/scenario/templates.ts`, `simulator-client.tsx` |

---

## J. Implementation order — adjusted to what was found

His example ordering assumed the problems were layout. **They are not; two of them stop the car from
answering a finger.** Reordered accordingly.

### Wave 0 — two measurements, no code, before anything below is believed

| # | action | why |
|---|---|---|
| **0a** | **Ask him for one line from his own phone:** open the sim with `?simPerf=1` and read the `[sim-perf] tier=…` console line (or `localStorage['sim.quality']`), plus tell us **iOS or Android**. | Ten seconds of his time. **`low` and `med` are 5.7× apart in GPU cost on identical silicon**, and iOS vs Android decides whether I6 is the fix, whether C6 fires at all, and whether I17 is the fix or a footnote. |
| **0b** | ~~Build production once (`next build && next start`) and repeat the perf sweep.~~ **DONE 2026-08-12 for the BYTE half — see G4a; the main-thread half is still owed before I22.** | **A third of the measured main-thread cost is `jsxDEV` and must be subtracted before anyone sizes I22.** **And read G4a before you try this: `next start` on plain `http://localhost` serves a page with ZERO JavaScript on it, because the enforced CSP adds `upgrade-insecure-requests` in production and every chunk is rewritten to `https://`. Put a TLS front in front of the server or you will measure an empty page and think the app is broken.** |

### Wave 1 — the car answers the finger *(ship as one small PR; every item is provable from this audit)*

| # | fix | size |
|---|---|---|
| 1 | **I1** — two ref resets. **This is the difference between a control that dies permanently a second into every drive and one that does not.** | 2 lines |
| 2 | **I2** — pointer-based activation for every touch button. **Closes ~60 % of his complaint list.** | 1 helper, 4 call sites |
| 3 | **I3** — do not unmount the controls when a card arrives. | 1 return path |
| 4 | **I6** — `touch-action: none` on the driving stage. **Only remaining candidate for "moves left and right".** | 1 line |

### Wave 2 — the lesson cannot be lost

| 5 | **I5** — the pre-drive line stops being dismissible + a way back in the menu. | 2 one-liners |
| 6 | **I4** — the tutorial card fits the screen, and no auto-open modal on a phone. | 2 class strings + 1 gate |
| 7 | **«!КОЛАН» top-rail cell** (§H) — one conditional cell that **removes the fault the product raises within ten seconds of every drive.** | 1 cell |

### Wave 3 — performance, cheapest-first, all measured

| 8 | **I17** (tier seed) + **I18** (mount the probe) | 1 deletion + 1 call | **DONE 2026-08-12 (§N2).** I17 deleted. I18 had already been mounted by `e979dda` — and was found not to REACH the product (§N2·A). Plus the second half of K4: a touch-only dpr clamp. |
| 9 | **I19** + **I20** together (stop rendering behind modals, drop the blur) | 1 prop + 4 class names | **I19 DONE (§N2·D) — 88 % of the draw calls behind a card are gone. I20 NOT DONE:** the blur runs in the compositor, outside both the page WebGL timer and CDP's main-thread metrics, so this wave could not price it either (§G6) and did not touch it. |
| 10 | **I21** (mirror cadence), then re-measure | 1 constant | **NOT DONE** — outside this wave's brief (A–E). It is the right next item: with I19 in, the mirror RTT is the largest remaining per-frame GPU line at `low`. |
| 11 | **I26a** (script bytes) — the biggest transferable number, and independent of everything above | bundling | **NOT DONE — another lane owns it** (`.next-j3bundle` is on disk). Untouched here. |

### Wave 4 — the layout rework, as ONE change, not six more overlap patches

| 12 | **I23** camera to the top rail with its popover — **the only new capability on the list, and it closes G/N/K** |
| 13 | **§H** — arcs → two labelled edge rails; ⚙ sheet → a docked right grid; **I11** the sheet clearance contract; **I10** the minimap; **I8** the gutter; **I16** the overlay arbitration |
| 14 | **I13** + **I14** — labels and 44 px rects, shipped with 13 |

### Wave 5 — copy, correctness and the deferred decisions

| 15 | **I12** touch copy (`tapBg`) — **and it is what makes I13 true** |
| 16 | **I15** the centre-blind reach table |
| 17 | **I7** stale `--sim-vh`, **I9** safe-area padding — both low urgency (**I7 may not even fire on his device; I9 is unreachable on the driving screen**) |
| 18 | **I22** the React commit rate — **largest production-real main-thread win available, and the one that must not be attempted without the commit counter and Wave 0b** |
| 19 | **I24** clutch, **I25** tap-to-go — **both blocked on his answers (§K3, §K5)** |

---

## K. Questions and decisions needed from him

| # | question | why it changes the work |
|---|---|---|
| **K1** | **Is your phone iPhone or Android, and what does `?simPerf=1` print for `tier=`?** | Ten seconds of your time, and it decides three things: iOS ignores `user-scalable`/`maximum-scale`, so on an iPhone only `touch-action` can stop the zoom (I6); iOS has no Fullscreen API for a non-video element, so C6 may not fire for you at all; and `low` vs `med` is **5.7× of GPU cost** (I17). Doc 82 §2.4 was retired on the grounds that your reports *are* the device evidence — **but the reports do not say which device.** |
| **K2** | **When the popup dies and you press the gas again — does it come back, or is it dead for the rest of the session?** | Three lanes agree the pedal dies. Two measured it as **permanent**; one thought lifting and re-pressing recovered it. The fix is the same either way, but your answer tells us whether the mechanism differs on WebKit — which matters for how hard we test the fix. |
| **K3** | **Should a motionless press on the gas pad mean "go"?** | Today the pad is a **relative drag axis**: a tap does nothing, a still thumb does nothing, only a 6 px+ drag moves the car. Your own words were "up is forward, middle is stop, down is backwards" — **that is an absolute pad and it is a one-line change (I25)**, but it removes the "gesture starts wherever your thumb landed" property the code deliberately has. **This is a feel decision and I am not making it under cover of a bug fix.** |
| **K4** | ~~**Keep the 8 GB-Android → `med` carve-out?**~~ **ANSWERED BY MEASUREMENT 2026-08-12 — §N2·B. Both options taken: the rule is deleted AND the phone dpr is capped at 1.0 on every tier.** | It was written for "a flagship Android, not a €125 handset". Measured on the production build, `med` on a phone costs **2.4× the draw calls**, a **1.56× backing store** and **2.0–3.0× the CPU frame** — and 8 GB is mid-range silicon in 2026, so the rule was inferring a GPU from a RAM figure. The probe is mounted, so a genuine flagship pays `low` for one session and is then promoted on evidence. **This row no longer needs his decision; it needs his eyes on the result.** |
| **K5** | **«Напреднал» on a phone: build a clutch control, or gate the tier off on touch?** | The clutch has **no** touch control, and on that tier N→R and every gear change require it. **Right now the tier is silently unplayable on a phone.** |
| **K6** | **May the indicators move to the LEFT flank?** | It mirrors a real LHD stalk and frees the throttle thumb. **Today «Мигач надясно» is on the right arc, so signalling right costs the accelerator — the opposite of what the exam wants.** It is a real ergonomics change and it is your call. |
| **K7** | **On touch, is the pre-drive allowed to *teach the ⚙ strip*, or must the cockpit hotspots become genuinely reachable?** | Cheap and honest: teach the strip (I12). Expensive and truer to the cockpit: get the sheet out of the lower 62 % (I11) **and** move the head-turn out of the checklist into the shell so it survives the panel closing. **The seatbelt step currently names a 3D control that the same panel hides.** |
| **K8** | **May we spend ~0.9 % of the screen on words?** | Eight 5-letter captions take ink coverage 3.24 % → ~4.1 % and buy back the middle band plus the ability to name what you are pressing. **Doc 89 says you want naked text over the road, not cards — so this should be ghost text, not chrome — but it IS more ink than today, and today's screen is nearly ink-free because the controls are anonymous.** |
| **K9** | **Portrait: keep the rotate-nag, or make portrait a first-class layout?** | Today portrait is a "Завърти телефона хоризонтално" card over the road, and its «Разбрах» is the one control that permits every browser gesture. Nagging is cheap; a real portrait layout is a wave of work. |
| **K10** | **Ship the Wave-1 one-liners onto this shared dirty branch now, or wait for a clean tree?** | The branch has **276 uncommitted entries from other lanes** (§L). Wave 1 is ~30 lines across four files and is provable from this document. **My recommendation: ship Wave 1 now, on its own branch off the last gated commit, because C1 + C2 make the simulator unusable on a phone and everything else is cosmetic by comparison.** |

---

## L. Tree state

**The full `git status --porcelain` output is pasted in the delivery message that accompanies this
document.** Summary, with one correction to what the lanes reported.

- **277 entries: 224 modified tracked files, 53 untracked.**
- **Exactly one of them is this wave's: `?? docs/simulation/91_MOBILE_AUDIT.md`.** Nothing else was
  created, edited or deleted in the repository by any of the six lanes.

### The correction: the tree moved during the session, and it was not us

Every lane reported its own `git status` as "276 entries, byte-identical to the session-start
snapshot". **That was true inside each lane's window and it is no longer true of the tree as a whole**,
so it should not be repeated as-is.

**A new commit landed mid-session from another lane:**

```
042518a  fix(sim,law): the mirror moves so the sign can be read,
         and "−10 т." stops meaning your licence
```

It was not in the session-start snapshot (which ended at `d7ec746`). It committed ~40 of the files that
were dirty when this session opened — `content/world/{d2,pe-bus,pe-cane,pe-child,pe-clear,pe-dart,pe-rain,pe-slow,rb-mini,tj-emerge}-v1.json`
and their `platform/public/world/` twins, the `templates-*` scenario files, `runtime/district.ts`,
`scenarios/event-library.json`, four `traces/sc*.ts` files and
`lessons/__tests__/engine.test.ts` — **which is why those entries have disappeared from the working
tree and different ones have appeared.** The remaining 276 are still other lanes' in-flight work on
this shared branch (`content/law/*`, `platform/src/modules/sim/*`, `platform/src/components/sim/*`,
`tools/maps/*`, `docs/*`).

**None of that is this wave's, and none of it was caused by this wave** — this wave issued no `git`
write of any kind: no add, no commit, no stage, no stash, no branch.

### Verification run, not asserted

| check | result |
|---|---|
| probe scripts / scratch artifacts / screenshots in the tree | **none** — the only `.mjs` entries are pre-existing project tools (`content/law/tools/*`, `tools/assets/*`, `tools/maps/*`, `tools/glb/decimate_hero.mjs`, `tools/mobile/deck-captions.mjs`), all other lanes' |
| `platform/tsconfig.json` | **clean** — the `AGENTS.md` trap (`next dev` rewrites the *tracked* tsconfig on startup) did not fire |
| `.next-*` scratch dist dirs in the tree | **none** — `.gitignore:9` (`.next-*/`) covers them |
| this wave's own dist dirs (`.next-touchaudit`, `.next-parity`, `.next-w87`) | **all deleted**, and their dev servers stopped |
| dist dirs still on disk (other lanes') | `.next` · `.next-c5rsw` (Aug 4) · `.next-rig` (the project's clip rig) · `.next-ttlane` (Aug 4) — **not ours; two are a week idle and are worth ~1 GB each** |

### One entry I will not claim credit or innocence for

**`?? tools/perf/.server/`** — `state.json` + `server.log`, last written **Aug 10 22:07**, i.e. *before*
this wave's final measurement window. It is runtime state written by the **pre-existing**
`tools/perf/perf-server.mjs` (dated Aug 3), not a file any lane authored. **I cannot attribute it with
certainty**, so I am naming it rather than quietly folding it into "other lanes' work".

**It is visible at all because of a gap in `.gitignore`:** the file has explicit rules for the other two
harness state dirs — `tools/clips/headless/.rig/` (`:30`) and `tools/mobile/.out/` (`:54`) — **and none
for `tools/perf/.server/`.** One line closes it.

### Runtime-only side effects, declared

Safe-area substitution agents, `touchmove` listeners, a screenshot ruler, synthetic `PointerEvent`
dispatch and a devtools-hook stub were injected into **live pages only** — in memory, gone with the
browser, never written to a file. One lane created a lane-private harness account
`layout-audit-lane@test.local` in the **local dev database** after other lanes rotated the shared
harness password mid-sweep; it is droppable with `dropHarnessUser` from `tools/mobile/lib/user.mjs`,
and no repo file was touched to create it. One lane killed eight orphaned Playwright/WebKit processes
left by its own interrupted runs, which had saturated the box; two dev servers recovered from >400 s
timeouts to 1.7 s immediately afterwards.

### Owed, and deliberately not done

**`docs/README.md` was NOT updated to index this document**, because the brief allowed exactly one new
file and no edits. **That index entry is owed.**

---

## M. What this audit could not answer

Listed so nobody mistakes silence for a clean bill.

1. **Frame time on his handset.** Everything is a GTX 1060 rendering phone-shaped viewports.
2. **Whether a real pinch actually zooms this page** (T1). The instrument was proven blind against a
   positive control. **Needs his phone, or a headed browser, for ten seconds: pinch the road, then drag
   one finger.**
3. **Whether C2 behaves identically on iOS WebKit.** The spec says it should; it was fired only in
   Chromium.
4. **The price of the full-viewport `backdrop-filter`** — provably present, not priceable from here.
5. **Why React commits 17.9 times a second when the two known polls sum to 10.7 Hz.** Further update
   sources in `LessonPlayShell` (42 `useState` sites) were not enumerated. **I22 must not be attempted
   until they are.**
6. **Which effect is churning listeners** (990 → 2190 → 1017 live listeners). Churn is proven; the
   effect is not named. **This is the one performance thread that reaches into the input complaints.**
7. **Whether the 13-step pre-drive can be completed end-to-end by finger on every lesson.** It was
   completed twice on `l1-preparation`; a deliberate adversarial run collected four «Нарушен ред»
   penalties and never advanced — **but that run was also fighting C2, so "the sequence is unreachable
   on touch" cannot be separated from "my taps were being swallowed". Re-run this after I2 lands; it is
   the single most important regression test for his "belts" complaint.**
8. **Whether the difficulty picker is reachable on a phone at all** (E#34) — it never appeared in any
   control inventory, probably because `data-sim-overlay-active` stands the corner widgets down while
   the queue is speaking, which was most of every session.
9. **The micro-quiz overlay on touch** (E#43) — never fired during a run. **Assume its buttons are
   `onClick` and therefore dead under C2 until checked.**
10. **Thermal behaviour over a full lesson.** Every window was 6–17 seconds; D12c is a thermal argument
    and a ten-second window cannot see thermal decay.
11. **Production `/simulator` vertical-overflow numbers** (L11) — measured through the rig, whose
    wrapper differs. **The mechanism is app-wide; the number is rig-measured.**
12. **Pull-to-refresh mid-drive.** `html` carries `overscroll-behavior-x: none` but leaves the Y axis
    `auto`, and the simulator screen has nothing to scroll, so a downward overscroll is pure hazard.
    **Chromium headless does not implement pull-to-refresh, so it could not be fired.**

---

## N. J-WAVE-3 · PERFORMANCE — measured on a PRODUCTION build, 2026-08-12

> **THIS MACHINE AT PHONE DIMENSIONS. NOT HIS HANDSET.** Windows 10, 16 GB, GTX 1060 6 GB through
> ANGLE/D3D11 — the renderer string is read at runtime on every row and printed with it
> (`ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB … Direct3D11 vs_5_0 ps_5_0, D3D11)`); a row that fell
> back to SwiftShader would have been refused, and none did. Emulation reproduces viewport, dpr,
> touch model, UA and insets. **It does not emulate a GPU.** Draw counts and backing-store dimensions
> are properties of what the scene asks for and DO transfer; milliseconds do not.

### N0 · Wave 0b is done: everything below is production, and the surface is the real one

`next build && next start`. **The `/dev/*` harnesses 404 in production** (each `page.tsx` calls
`notFound()` when `NODE_ENV === "production"`), so every number here was taken on the authenticated
`/simulator` route driving `l0-free-drive` — the surface the founder actually uses, not a rig.

New instrument: **`tools/mobile/frame-cost.mjs`**. It prints the renderer string, the frames it saw
and the wall time it saw them over on every row, per §G0 and per the Wave-1 lesson that a 0.4 fps rig
can publish a defect. Six profiles × two tiers × two vsync regimes.

**Two regimes, because they answer different questions.** *Capped* is what a 60 Hz panel shows and it
saturates at 16.7 ms. *Uncapped* (`--disable-gpu-vsync --disable-frame-rate-limit`) is the CPU
submission rate with the wait removed — the real per-frame main-thread cost, and **not fps**.

### N1 · Frame time per profile per tier — BEFORE the wave, production build

Harness health is the `fps` column; the box was healthy on every row but one, which is named.

**READ THE LABEL ON THIS TABLE.** These windows were taken with the seatbelt teach card up for part or
all of each one — the trap §N7 documents, discovered only after this sweep ran. With
`frameloop="always"` that changes **nothing about what was rendered**: the scene was drawn at the
panel's full rate either way, which is the whole point of §N2·D. So every draw count, every
backing-store dimension and every tier RATIO below stands. What these numbers do not include is the
physics step. **For the driving-state frame cost on the shipping build, read §N6.**

| profile | tier | capped fps | p50 | p95 | worst | uncapped fps | **p50 (CPU ms/frame)** | p95 | worst | draws/frame | backing store | dpr |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| iphone16-portrait | low | 59.9 | 16.7 | 16.8 | 16.8 | 294.8 | **3.0** | 6.4 | 10.8 | 205.6 | 377×836 | 1.00 |
| iphone16-portrait | med | 59.7 | 16.7 | 16.7 | 33.3 | 147.8 | **6.5** | 9.5 | 14.4 | 492.5 | 471×1045 | 1.25 |
| iphone16-landscape | low | 59.9 | 16.7 | 16.8 | 16.8 | 256.0 | **3.6** | 6.7 | 11.1 | 233.8 | 836×377 | 1.00 |
| iphone16-landscape | med | 59.9 | 16.7 | 16.8 | 16.8 | 88.6 | **10.9** | 15.1 | 34.6 | 521.2 | 1045×471 | 1.25 |
| small-portrait | low | 59.8 | 16.7 | 16.7 | 16.8 | 312.0 | **2.8** | 5.3 | 8.7 | 206.2 | 344×764 | 1.00 |
| small-portrait | med | 59.9 | 16.7 | 16.7 | 16.8 | 102.5 | **9.7** | 14.0 | 33.8 | 492.8 | 430×955 | 1.25 |
| small-landscape | low | 59.7 | 16.7 | 16.7 | 16.8 | 248.7 | **3.7** | 7.0 | 11.6 | 234.4 | 764×344 | 1.00 |
| small-landscape | med | 59.8 | 16.7 | 16.7 | 16.8 | 129.2 | **7.5** | 10.9 | 24.1 | 521.2 | 955×430 | 1.25 |
| galaxy-gesturebar-portrait | low | 59.4 | 16.7 | 16.7 | 66.6 | 292.0 | **3.1** | 6.0 | 13.2 | 205.3 | 344×764 | 1.00 |
| galaxy-gesturebar-portrait | med | **2.5 ⚠** | 66.6 | 1233.3 | 1883.2 | 111.9 | **8.8** | 11.6 | 27.1 | 494.1 | 430×955 | 1.25 |
| galaxy-gesturebar-landscape | low | 59.7 | 16.7 | 16.8 | 33.4 | 189.8 | **4.6** | 8.8 | 13.2 | 234.2 | 764×344 | 1.00 |
| galaxy-gesturebar-landscape | med | 59.7 | 16.7 | 16.7 | 33.3 | 126.5 | **7.6** | 11.2 | 17.4 | 527.7 | 955×430 | 1.25 |

**The 2.5 fps cell is the box, not the build — and it was RE-MEASURED rather than merely excused.**
Free RAM was 2.57 GB with a 3 GB node process from another lane on the same machine; React commits in
that window collapsed from 14.8/s to **1.8/s**, which is a starved main thread, not a renderer. Its
own uncapped twin read a perfectly ordinary 8.8 ms. Re-run on the same BEFORE build against a quiet
box, same profile, same tier: **59.9 fps · p50 16.7 · p95 16.8 · worst 16.8 ms · 494.0 draws/frame ·
backing store 430×955 at dpr 1.25.** §G0's rule stands, and this is what acting on it looks like.

**That re-measurement is also the cleanest single proof of §N2·D on record**, because it is the only
BEFORE row whose driving window was verified overlay-free by the watchdog: **494.0 draws/frame
driving, 492.4 draws/frame with the teach card up and the world frozen — 29,350 draw calls a second
for a picture that cannot change.**

**Read the uncapped p50 column, not the capped one.** At phone dimensions this desktop holds vsync at
both tiers, so the capped column says only "a GTX 1060 is not the bottleneck". The CPU cost is where
the tiers separate: **`med` costs 2.0–3.0× the frame of `low`** (2.8→9.7 · 3.0→6.5 · 3.6→10.9 ·
3.7→7.5 · 3.1→8.8 · 4.6→7.6 ms).

### N2 · The four questions, answered

**C · DEVICE PIXEL RATIO AND THE BACKING STORE — the render scale IS clamped, and the 9× fear was
never real.** Every profile reports `window.devicePixelRatio` **3**. Not one of them renders at it:
the Canvas is wired `dpr={[1, cap]}`, so the buffer is the preset's cap and nothing else. Measured
`gl.drawingBufferWidth × Height` against the canvas's own CSS box:

| tier | applied dpr | backing store (iPhone-16 landscape) | pixels | vs `low` |
|---|---|---|---|---|
| low | **1.000** | 836×377 (= CSS, exactly 1:1) | 315,172 | — |
| med | **1.250** | 1045×471 | 492,195 | **1.56×** |

The same ratio on all six profiles (410,650 against 262,816 on the 360-wide Android). So a dpr-3 phone
does not render nine times the pixels; **the only dpr a phone ever pays is the tier cap**, and the
whole exposure was `med`'s 1.25.

**B · THE 8 GB-ANDROID CARVE-OUT — DELETED, and its dpr capped as well.** `med` on a phone is **2.4×
the draw calls** (205.6 → 492.5 per frame on iPhone-16 portrait; 233.8 → 521.2 landscape), **1.56× the
backing store**, and 2.0–3.0× the CPU frame — on a tier where `low` is already 205–234 draws against a
**≤150** budget. The rule inferred a GPU from a RAM figure, and in 2026 8 GB is mid-range silicon. Its
own defence was that *"nothing synchronous and reliable"* separates an iPhone from an A16 — **that
defence expired when the probe was mounted.** Every touch-only device now seeds `low` and climbs on
evidence; a real flagship pays one session. **And the other half of K4 is taken too:** `maxDprFor()`
clamps a touch-only device to dpr 1.0 on *every* tier, so neither a promoted phone nor a hand-picked
«Високо» can buy 1.56× — or `high`'s 2.25× — of fill on a handset.

**D · RENDERING BEHIND A PAUSED OVERLAY — it was 100 % of full cost, on all 24 rows.** The Canvas
carried no `frameloop` prop at all, i.e. R3F's default `"always"`.

| | driving | teach card up, world paused | saving |
|---|---|---|---|
| BEFORE, draws/frame — low | 233.8 | **233.7** | **0.0 %** |
| BEFORE, draws/second — low | 13,704 | **13,805** | none |
| BEFORE, draws/frame — med, watchdog-verified driving | 494.0 | **492.4** | **0.3 %** |
| BEFORE, draws/second — med | 29,464 | **29,350** | none |
| AFTER, draws/frame — low | 231.0 | **26.0** | — |
| AFTER, draws/second — low | 13,007 | **1,550** | **88.1 %** |

Every one of the 24 before-rows has its paused column within ±0.5 draws of its driving column.
**And the repo already knew the pattern:** `HeroScene3D.tsx:606` — the marketing hero — has
shipped `frameloop={paused ? "never" : "always"}` all along. The simulator was the one R3F canvas in
the product with no `frameloop` prop at all.
`frameloop={physicsPaused ? "demand" : "always"}` (I19) is now on the Canvas. **"demand" is not
frozen:** R3F still renders on every commit of its own tree, about 7/s, so the scene repaints roughly
eight times a second under a card — verified by eye (`tools/mobile/.out/frame-cost/shots/`: 67.3 %
non-black ink, full cockpit, a correct still frame) and by a resume window that returns to 59.8 fps
and 231 draws/frame.

**A · THE AUTO-QUALITY PROBE — it was mounted, and the mount did not reach the product.** Doc 82 §8's
"dead export" was closed by `e979dda`: `useQuality()` arms `useAutoQualityProbe()`, so the probe runs
whenever the canvas does. **What nobody checked was whether its verdict could ever be applied.** The
only reader of the ledger is `seedQualityLevel()`, which is memoized for the page load — and
`/simulator` is a client-routed React app that never reloads the document between lessons. A phone
could therefore measure itself drowning, write the verdict down, and be handed the same tier for
every lesson of the session. *"Applied at the next cold start"* was true of the store and false of
the product.

Fixed at the seam, not mid-drive: `LessonSelectScreen` calls `refreshSeededQuality()` on mount. The
canvas is unmounted there, no drive is in progress, and the next lesson has not chosen its texture
download plan yet — the one moment a tier change costs nothing.

**Why NOT a live mid-drive demotion, with the numbers.** Three components — `HeroCarBody`,
`VehicleRig`, `MirrorRig` — call `loadQualityPreset()` once at mount and never subscribe. A live tier
change would leave the hero car on clearcoat inside a `low` environment, and the only mechanism that
re-reads them is a `sceneEpoch` remount, which discards the drive. The cheap live lever does not exist
either: at `low` the dpr cap is already 1.0, so there is no fill left to shed. **What a drowning phone
gains instead is that the demotion lands one lesson later rather than one page reload later — and the
probe's own reading has been made honest.**

### N3 · The probe's samples had to be made honest before the frameloop change could ship

`useAutoQualityProbe` times page rAF deltas and calls the result a frame cost. That was only true
because the loop was always `"always"`. With `"demand"`, a probe window overlapping a teach card would
see a free 60 Hz rAF over a scene nobody is drawing **and promote a phone for standing still**. One
increment in a `useFrame` that already exists (`SimEnvironment`) is the guard: the probe compares
rendered frames against sampled frames and discards any window below 90 %.

### N4 · E — React commits, rAF loops and listeners, sized on production

Twelve production rows, each with the driving window verified overlay-free.

| suspect | dev measurement (§G4) | **production, driving** | verdict |
|---|---|---|---|
| React commits | 29.6/s (17.9 DOM + 11.7 R3F) | **29.4/s median — 18.05 DOM (16.9–25.3) + 11.3 R3F (10.8–11.5)** | **UNCHANGED by the production build.** I22 is exactly as large as §G4 said, and it is no longer a dev-build artifact. |
| duplicate rAF loops | suspected | **none — exactly 1.00 page rAF per rendered frame on all 12 rows** | not a defect. **Retired.** |
| listener overhead | 990→2190→1017 live | **404–417 cumulative registrations**, stable across every profile; top types `error:28 load:16 keydown:13 change:9 pointerdown:8 resize:8` | not a cost driver at this scale |

**The commit rate is the one thing production does not fix, and the first attempt at this table got it
wrong.** An earlier pass read 22.0/s and reported production as a 26 % improvement. It was measuring a
window in which the seatbelt teach card was up — a paused window wearing a driving label, the exact
trap §N7 records. With the window verified overlay-free, production and dev agree to within 1 %.
**Everything the audit sized against `jsxDEV` shrank in production; the commit rate did not, because a
commit costs the same however the elements were created.**

**And the commits do not stop when the world does: 13.4 DOM + 6.7 R3F per second with a teach card up
and physics frozen** — twenty reconciles a second for a picture that cannot change. That is I22's
strongest single argument, and it is now measured rather than inferred.

### N5 · Still over budget, still device-independent, and it transfers

Draw calls on `l0-free-drive` (Студентски град) are **205–234 at tier low** and **489–528 at med**
against a **≤150** budget (hard cap 250). §G4 measured 113–139 at `low` on `pe-cane-v1`; this district
is heavier, and the two must never be quoted without their district. **`low` is 1.4–1.6× over the
budget before anything else happens, and `med` is 3.3×.** That is I26b, it is not a rendering setting,
and no tier decision fixes it.

### N6 · Frame time per profile per tier — AFTER, production, VERIFIED DRIVING

Same instrument, same box, same production surface, with two differences that matter: the shipping
code now carries the three fixes, and **every driving window here was verified overlay-free** — the
watchdog polled `data-sim-overlay-active` and `[role=dialog]` four times a second through each window
and the row was retried until it came back clean.

**Capped (all six profiles × both tiers, 12 rows).** This desktop holds vsync on every one: **59.6–59.9 fps,
p50 16.7 ms, p95 16.7–16.8 ms, worst 16.8–33.3 ms.** Twelve of twelve. The column's only real
content is that nothing regressed and the box was healthy for all twelve — which is exactly what
§G0 says to print beside a timing.

**Uncapped — the CPU cost of a frame, driving:**

| profile | tier | harness fps | **p50 (CPU ms/frame)** | p95 | worst | draws/frame | backing store | px | card-up saving |
|---|---|---|---|---|---|---|---|---|---|
| iphone16-portrait | low | 272.7 | **3.3** | 6.0 | 10.0 | 202.8 | 377×836 | 315,172 | 88.4 % |
| iphone16-portrait | med | 138.0 | **7.1** | 9.8 | 12.5 | 492.0 | 377×836 | 315,172 | 88.2 % |
| iphone16-landscape | low | 260.4 | **3.6** | 6.3 | 24.9 | 214.3 | 836×377 | 315,172 | 87.4 % |
| iphone16-landscape | med | 130.8 | **7.5** | 10.4 | 13.7 | 505.9 | 836×377 | 315,172 | 88.2 % |
| small-portrait | low | 299.3 | **3.0** | 5.2 | 14.3 | 201.9 | 344×764 | 262,816 | 88.0 % |
| small-portrait | med | 146.5 | **6.7** | 9.0 | 14.9 | 487.5 | 344×764 | 262,816 | 88.7 % |
| small-landscape | low † | 294.9 | **2.9** | 5.5 | 10.5 | 215.3 | 764×344 | 262,816 | 86.2 % |
| small-landscape | med | 83.0 | **11.8** | 16.0 | 35.0 | 504.3 | 764×344 | 262,816 | 87.2 % |
| galaxy-gesturebar-portrait | low | 298.5 | **3.0** | 5.3 | 8.2 | 202.8 | 344×764 | 262,816 | 86.3 % |
| galaxy-gesturebar-portrait | med | 149.4 | **6.5** | 8.8 | 15.2 | 487.0 | 344×764 | 262,816 | 87.3 % |
| galaxy-gesturebar-landscape | low | 187.9 | **4.6** | 9.1 | 14.8 | 213.9 | 764×344 | 262,816 | 87.2 % |
| galaxy-gesturebar-landscape | med | 84.4 | **11.7** | 15.2 | 29.8 | 504.2 | 764×344 | 262,816 | 87.7 % |

**† That row was REFUSED on its first attempt, and the refusal is the instrument working.** After
three tries an overlay was still up for 78 % of the window and the draw count read 78.3/frame — a
paused figure wearing a driving label, the §N7 trap exactly. The harness stamped it `driveRefused`
rather than publishing it; the row above is a clean re-measurement taken afterwards. **Wave 1
published a defect from a window like that one.**

**What the numbers say.**

* **The tier is still the lever: `med` costs 2.1–2.5× the CPU frame of `low`** on five of the six
  profiles (3.3→7.1 · 3.6→7.5 · 3.0→6.7 · 3.0→6.5 · 4.6→11.7 ms), on top of 2.4× the draw calls.
  That is the whole case for §N2·B.
* **And the sixth profile is a reminder to read §G0 before quoting one cell.** `small-landscape` and
  `galaxy-gesturebar-landscape` are the SAME 780×360 viewport with the same 262,816-pixel buffer and
  the same 504 draws, and their `med` rows agree closely (11.8 and 11.7 ms) — but the iPhone's
  LARGER 852×393 landscape at the same tier reads 7.5 ms. A bigger viewport measuring 36 % faster is
  not a viewport effect; it is this box's noise floor, and it is consistent with §G1's finding that
  **the viewport is worth almost nothing.** Ratios taken back-to-back in one page load are the
  trustworthy statistic here; cross-profile absolute comparisons are not.
* **The dpr clamp bought the backing store, not the milliseconds, and that is the honest reading.**
  `med` now renders 315,172 px instead of 492,195 — **−36 % of fragments on every phone profile** —
  yet the frame time moved inconsistently against the BEFORE column (landscape med 10.9→7.5 ms;
  portrait med 6.5→7.1 ms). **Both are within this box's own instrument spread (§G0), and the reason
  is §G2: at these viewports the frame is main-thread bound, not fill bound, so removing fragments
  from a GTX 1060 changes almost nothing.** The clamp is banked for the device where fill and memory
  bandwidth are the constraint — a phone — and that device is precisely the one this box cannot
  measure. **It is claimed as a 36 % smaller backing store, which was measured, and NOT as a frame
  time, which was not.**
* **The card-up saving is uniform: 86.2–88.9 % across all 24 rows, both tiers, every profile.** That
  one is not a model. It is the same scene, the same box, back to back, in one page load.

### N7 · Two instrument traps this wave paid for, recorded for the next one

1. **A "driving" window on `l0-free-drive` is a TEACH-CARD window unless you fasten the seatbelt.**
   Hold the throttle with the belt undone and «УЧЕБЕН МОМЕНТ — Движение без предпазен колан» fires
   within two seconds and sets `paused`. With `frameloop="always"` that was invisible — the counters
   read the same either way, which is exactly the defect — so a paused row could wear a driving label
   and nobody would know. `frame-cost.mjs` now fastens the belt, polls `data-sim-overlay-active` every
   250 ms through every window, and refuses a driving row that saw an overlay.
2. **Opening «МЕНЮ» does NOT pause the world.** It was the obvious handle for a paused measurement and
   it measures nothing: 214.5 draws/frame with the menu open against 216.1 driving. The pause the
   product actually uses is a teach card, a quiz, a consequence, the debrief, or the «ПАУЗА» rail
   control.
