# 90 · FR-19 pre-drive clip production spec

**Status:** ready to execute · supersedes every verbal instruction about FR-19 clips
**Date:** 2026-08-11
**Scope:** the media for all **thirteen** pre-drive tutorial cards (`PRE_DRIVE_STEP_ORDER`)
**Extends:** doc 66 (produced-media ground rules R0–R6, LAW) · doc 69 (headless clip production) · ADR-001 (fictional vehicles) · ADR-002 (no free recall) · doc 64 THEO-4 (never a bare verdict)

---

## §0 · How to read this document

The founder stopped production because this document did not exist. It is written so that
one person can execute the whole programme without this conversation and without guessing.

**Provenance legend. Every factual claim carries one. This project has shipped inherited
numbers twice this week and both were wrong.**

| tag | meaning |
|---|---|
| **[MEASURED]** | I ran the command in this session. The command is named. |
| **[SEEN]** | I extracted the frame and looked at it with vision, per doc 66 R0. |
| **[CODE]** | Read directly out of the repo. File and line named. |
| **[REPORTED]** | From a probe report produced this session by another lane. **Not re-verified by me.** Treat as strong but not proven. |
| **[CITED]** | External source, named. |
| **[ASSUMPTION]** | My judgement. Flagged so it can be overruled. |

### Three corrections to the brief this spec was commissioned from

1. **THERE ARE THIRTEEN STEPS, NOT TWELVE.** [CODE] `procedures/steps.ts:174-188` —
   `PRE_DRIVE_STEP_ORDER` has thirteen entries. The one repeatedly dropped is **`signal`
   / «Подаване на мигач»**, which sits between `final-mirror-check` and `move-off` and has
   a full tutorial entry at `tutorial.ts:252` («Ляв мигач — подаден преди първия сантиметър
   движение»), its own SVG still, its own control (`hotspot_indicator_stalk`) and its own
   fault code `TURN_WITHOUT_INDICATOR`. **Why it keeps vanishing:** it is the only step id
   without a hyphen, so it is written as a bare identifier (`signal: {`) while the other
   twelve are quoted (`"adjust-seat": {`). Every regex-based count has silently missed it.
   A plan for twelve cards ships one card with no media decision.

2. **The balance is 6,873.5, not 7,008.5**, and the "unattributed −135" in three probe
   reports is not a fourth unknown spender. [REPORTED] One lane self-reported an accidental
   submit (task `UAH1VHQBPKPOKZVR`, 135.0 credits, 5.04 s) taking 7,008.5 → 6,873.5; three
   other lanes independently observed exactly −135 in the same window and could not attribute
   it. Same event, four observers. **The incident is closed** — but see §9 for the probe rule
   that must change so it does not recur.

3. **The free "empty payload" probe is not free on every model.** [REPORTED] Two lanes
   independently found that `POST /api/generate/submit {"model":"kling-3.0-turbo/standard",
   "input":{}}` returns **200 and creates a real task**. It failed server-side and refunded,
   by luck. See §9 for the mandatory probe lock.

---

## §1 · THE DECISION

> ### Eight of thirteen steps get motion. **Zero of them come from a generative video model.**
> ### All eight render from our own simulator — six now, two later — for zero credits.
> ### Five keep the SVG still, permanently, because no medium we can reach can show them correctly.
> ### And one clip that is live in production today teaches the opposite of its own caption and must be pulled this week.

This is the finding the founder can act on immediately, so it leads.

### 1.1 The immediate action, independent of everything else

**Pull `adjust-seat` from `PRE_DRIVE_TUTORIAL_CLIPS`.** [CODE] `tutorial.ts:107-120`.
Deleting the entry is a one-line change; `preDriveTutorialMedia()` already falls back to the
still with no other edit anywhere (`tutorial.ts:305-311` — that seam is the whole point of the
indirection). Evidence in §1.4. This is a live THEO-4 breach, not a cosmetic complaint.

### 1.2 The two questions that decide every step

Every verdict below is the output of two questions asked of the step's **actual authored
Bulgarian caption** — not of a guess about the step.

- **Q1 — Does the caption make a checkable claim about a HUMAN BODY PART?**
  If yes, generative video is disqualified (§1.4) *and* our own engine is disqualified
  (§1.5: this project owns no human figure). The still is the only correct medium.
- **Q2 — Is a STATE CHANGE the lesson?**
  If a lamp must go **out**, an indicator must **blink**, a lever must **travel**, or a car
  must **pass before** you pull out, a static frame literally cannot state the claim.
  If no, the still is already complete and video is bytes and risk for nothing.

### 1.3 The verdict table — all thirteen

| # | step | authored caption (`tutorial.ts`) | body claim? | state change is the lesson? | **VERDICT** | one-line reason |
|---|---|---|---|---|---|---|
| 1 | `adjust-seat` | «Свит крак на педала, китка върху волана при изпъната ръка.» | **YES** — knee angle, wrist | yes | **STILL** (pull existing clip) | The lesson is a joint angle; no model holds one and we own no body to pose. |
| 2 | `adjust-mirrors` | «Трите огледала… минимум собствена кола в кадъра.» | no | partly | **OWN ENGINE — wave 2** | The still's three-up comparison is genuinely strong; motion adds least here. |
| 3 | `check-surroundings` | «Обиколка около колата: ниските препятствия и хората са невидими отвътре.» | no, but needs a **person** | yes | **STILL** (blocked, see §1.6) | The lesson needs a walking adult and a crouching child; we own neither and generative dissolved the child. |
| 4 | `fasten-seatbelt` | «Диагоналът минава през средата на рамото, лентата не е усукана.» | **YES** — shoulder, neck, armpit | yes | **STILL** | Belt path across a torso we do not own, plus a sub-centimetre twist. |
| 5 | `check-dashboard` | «След запалване всички лампи изгасват — освен тази, която ти казва нещо.» | no | **YES** — lamps go out | **OWN ENGINE — wave 1** | A still cannot show extinguishing; and our cluster's icons are correct by construction. |
| 6 | `headlights-on` | «Къси светлини — включени преди потегляне, не на първия завой.» | no | **YES** — light appears | **OWN ENGINE — wave 1** | The `whyBg` is "so others see you"; that is a visible-vs-not comparison, impossible in one frame. |
| 7 | `start-engine` | «Крак на спирачката, лост на P, после стартерът.» | **YES** — foot on brake | yes | **STILL** | The caption's first clause names a foot. |
| 8 | `press-brake` | «Десният крак на работната спирачка — и остава там.» | **YES** — *right* foot, held | no | **STILL** | Three negatives (right not left, brake not throttle, held not tapped); the sim already teaches "held" interactively at zero bytes. |
| 9 | `select-gear` | «Лостът минава P → R → N → D при задържана спирачка.» | no | **YES** — lever travels | **OWN ENGINE — wave 2** | Real gain, but the still's dashed P→R→N→D path already reads well. |
| 10 | `release-handbrake` | «Ръчната се пуска последна — и лампата ѝ изгасва.» | no | **YES** — lamp goes out | **OWN ENGINE — wave 1** | The caption's second clause is an extinguishing lamp. |
| 11 | `final-mirror-check` | «Огледало, огледало, поглед през рамо — в тази последователност.» | coarse (head turn) | **YES** — sequence + hidden car | **OWN ENGINE — wave 1 (POV)** | Shot POV, the head turn becomes a camera turn — no body needed — and it can finally show the car no mirror shows. |
| 12 | `signal` | «Ляв мигач — подаден преди първия сантиметър движение.» | no | **YES** — blink, and "before" | **OWN ENGINE — wave 1** | A still cannot express periodicity or "before". |
| 13 | `move-off` | «Плавно потегляне — след като си пропуснал движещите се по платното.» | no | **YES** — pass, then pull out | **OWN ENGINE — wave 1** | Pure vehicle-in-space timing; exactly what the sim already grades. |

**Totals: 6 clips in wave 1 · 2 more in wave 2 (conditional) · 5 stills permanently · 0 generative renders · 0 credits.**

### 1.4 Why zero generative clips — the evidence, including one I gathered by looking

**The shipped clip.** [MEASURED] `ffprobe` on `platform/public/sim/tutorial/adjust-seat.mp4`:
752×416, h264, 24 fps, 241 frames, 10.041667 s, 2,022,418 B. [SEEN] I extracted frames at
0 / 2.5 / 5 / 7.5 / 9.8 s and inspected them, and zoomed the two regions that decide
acceptance:

- **The knee, at t=7.5 s, zoomed 3×:** the leg is extended to roughly 150°, and **the foot is
  planted flat against the lower dash fascia — there is no pedal under it, and no pedal
  anywhere in the footwell.** The card's caption reads «Свит крак **на педала**» and its
  transcript reads «**Натисни спирачния педал докрай** — кракът остава леко свит, **не
  изпънат**». The clip demonstrates neither clause. It is not merely imprecise; it is the
  photographic negative of the lesson.
- **The posture:** the driver's shoulders are off the backrest with a straight arm. The
  wrist-on-rim test is *invalid* unless the back stays against the seat (`howBg`: «изправи
  облегалката, докато раменете ти не се отлепят»). So the second beat is also shown wrong.
- **The cabin:** an unmistakably real production-car interior — twin round analogue dials with
  chrome bezels, a real indicator stalk, a real vent and console layout. [ASSUMPTION] VW-family.
  No legible emblem in the frames I sampled, but **ADR-001's subject is fictional vehicles,
  and a photoreal real manufacturer's cabin is not one.** It is also shot from the **passenger
  side** of a car the student never sees, while our sim puts him in the driver's seat of the
  Aurelis GT-E.
- **The cruelty of the poster.** [SEEN] Frame 0 — which is also `adjust-seat.webp`, the image
  every student sees *before* deciding to spend 2,0 MB — shows an acceptably bent knee. **The
  still that sells the tap is correct and the video the student pays for is wrong.** That is
  the worst possible arrangement.

**The wider record.** [REPORTED] Six generative test renders this week scored 0/3, 1/3, 1/3,
0/3 and 2/3 teaching beats; none scored 3/3. Four of six stamped a manufacturer emblem. Four of
six ignored an explicit, capitalised camera instruction.

**Why this is structural, not bad luck.** [CITED] VBench-2.0 (arXiv 2503.21755) measures camera
controllability at 61.73 % for the best model in the field and ~27–34 % for the rest, and
attributes the wider control gap to "inadequate captioning granularity in video generation
datasets" — the training captions never described these things, so no wording can summon them.
[CITED] HumanScore (arXiv 2604.20157) fits a skeleton to generated video and scores the
**kinematic** axis (joint range-of-motion plausibility) at 83.0–86.4 against a 94.3 real-video
ceiling — the worst axis by 8–12 points, and by far the worst of the three it measures — and
concludes verbatim that "prompt refinement alone does not substantially improve motion realism".
**A specified knee angle is not a promptable quantity in any shipping model.** Every research
system that does control pose requires a driving skeleton track, not a text description.

**And why generative loses even the steps with no body in them.** For `check-dashboard` a
generative model would invent the warning telltales. Our instrument cluster is real geometry we
authored ([CODE] `components/sim/cockpit/InstrumentCluster`, mounted by `CaptureScene`), so its
pictograms are correct by construction. **A clip that teaches a plausible but false warning lamp
is not a cosmetic miss — it is the exact failure THEO-4 exists to prevent.** The same argument
retires generative for `select-gear` (invented gate legend, and a logo on the knob) and
`release-handbrake` (our hero car has an electronic switch, not a lever — [CODE]
`hotspot_parking_brake`).

### 1.5 Why our own engine wins the other eight — and its one hard limit

[MEASURED] `platform/public/clips/` holds **46 `.webm` clips totalling 114.08 MB** — mean
2,480,023 B, p50 2,384,483 B, p90 3,355,172 B, max 4,943,221 B — all 1280×720 VP9 at 30 fps.
[CODE] doc 69 documents the renderer that produced them: `clip-rig.mjs` → `/dev/clip-headless`
→ `CaptureScene` → Playwright frame-stepping on a real GPU → ffmpeg, fully unattended and
deterministic ("a pure function of the clock").

It beats generative on every axis that matters here: **cost 0**, ADR-001 satisfied by
construction ([REPORTED] `hero_car.glb` carries ten materials — `tire, brake_disc, alloy,
caliper, car_paint, car_glass, drl, grille, tail, diffuser` — and no badge material or emblem
node, so the asset *cannot* render a brand), deterministic and re-renderable, and it shows **the
actual car the student is about to drive**, which no generative model can do at any price.

**The hard limit, and it decides five steps: this project owns no human figure.** [MEASURED]
A filesystem search for any driver/human/person asset returns nothing. [CODE] The only body is
`TrafficLayer.tsx:1284-1292` — a torso `CapsuleGeometry(0.155, 0.44)`, a head
`SphereGeometry(0.135, 10, 8)` (a ten-by-eight sphere: **no face**), arm capsules with **no
hands**, leg capsules with **no feet**, and a cane cylinder. [CODE] doc 87 lists **FR-35**
(traffic officer) and **FR-43** (children) as "not built… Blocked on his machine."

So for a foot on a pedal, a wrist on a rim, or a belt across a shoulder, **neither route can
produce a correct frame.** The still is not a retreat there; it is the only medium that cannot
be anatomically wrong.

### 1.6 The one honest casualty: `check-surroundings`

This is the step with the strongest pedagogical case for video anywhere in the set — its
`rememberBg` is the most vivid sentence in the whole module («Дете, клекнало зад задната броня,
е невидимо от седалката във всяко огледало») and it is the only step our sim cannot perform at
all ([CODE] `PRE_DRIVE_INFO_STEPS` marks it "walkaround — purely observational").

And it is the one we cannot shoot. Generative already failed it specifically: [REPORTED] a
walk-around test render produced a flawless tracking shot in which the child dissolved into
"an incoherent shoe and limb". [CITED] That failure is architectural, not promptable — video
diffusion VAEs downsample 8× before diffusion begins, so a 40 cm child at ~100 px in a 720p
frame is ~12 latent pixels tall and detail below that threshold "completely disappears before
diffusion even begins". Our own engine would render the child as a faceless capsule, which for a
hero teaching card is worse than a diagram.

**Verdict: keep the still. Unblock FR-43, then revisit.** [ASSUMPTION] There is a no-human
variant worth a founder ruling: shoot the *sight line* instead of the child — camera at the
driver's eye showing all three mirrors, a low obstacle behind the bumper genuinely invisible in
every one, then the camera rises and orbits to reveal it. That teaches the identical claim with
no human in frame. It weakens «дете» to «препятствие», which is a content decision, not mine.

---

## §2 · The generative model surface

**Nothing in §1 requires this section.** It is here because the founder asked for it, because
`check-surroundings` may yet need it if FR-43 stays blocked, and because it is the difference
between an overrule that is executable and an overrule that restarts the trial-and-error.

Everything below is **[REPORTED]** — from this session's probe lanes, not re-verified by me.
I ran no API calls and spent no credits writing this spec.

### 2.1 Use one model

**`kling-3.0/standard`** — the only tier with (a) a first-and-last-frame input, (b) a
per-second price confirmed against a real invoice, and (c) our own render history.

**Do not use `kling-3.0/4K` or `/pro`.** §6 shows we deliver at roughly 720p-grade bitrates
into a 320-px-wide card; the extra pixels are discarded by the encode.

### 2.2 The parameter table

| field | required | type / accepted values | what it does | notes |
|---|---|---|---|---|
| `prompt` | **yes** (when `multi_shots:false`) | string, **max 2500 chars** | the shot description | Put ONE camera instruction early — second or third. [CITED] fal.ai's Kling 3.0 guide: "the most common cause of poor results is putting the camera direction at the end". |
| `duration` | **yes** | integer, **3–15** inclusive | clip length in seconds | 2 and 16 rejected. Our own gate is narrower: 10–15 ([CODE] `tutorial.test.ts:136`). |
| `sound` | **yes** | boolean | generates an audio track | **Poyo makes this required even though its own docs call it optional.** Always send `false` — §6.4. |
| `multi_shots` | **yes** | boolean | cut between shots inside one render | `true` forces `multi_prompt` **and forces `sound:true`**, i.e. 3× cost plus invented audio. Send `false`. |
| `multi_prompt` | only if `multi_shots` | array of `{prompt, duration}` | per-shot beats | per-shot 1–12 s, **total 3–15 s**. The marketing "6 shots max" is not enforced by the validator; 15 passed. |
| `image_urls` | no | array of URL or base64 | **`[0]` = FIRST frame, `[1]` = LAST frame** | §3. Supplying `[0]` makes `aspect_ratio` ignored. |
| `aspect_ratio` | no | **`1:1` \| `16:9` \| `9:16` only** | output shape | Default `1:1` with no reference image. **Ignored when a first frame is supplied.** |
| `kling_elements` | no | 2–4 images or 1 video, `@name` in prompt | cross-render subject consistency | Unverified on our account. |

### 2.3 The fields that do not exist — stop looking for them

- **No `seed` on any Kling tier.** [REPORTED] Only `runway-gen-4.5` has one. **A visually
  reproducible set of thirteen is therefore impossible on Kling.** Consistency must come from
  supplied first frames (§3, §5), not from a seed.
- **No negative prompt** on any model in the Poyo schema. There is no way to say "no badge" —
  which is precisely why ADR-001 cannot be a prompt (§3.2).
- **No structured camera control** exposed through Poyo. [CITED] Kling's own API has a
  `camera_control` object with six scalars in [−10, 10]; whether Poyo forwards it is unproven.
- **No motion-strength parameter** anywhere.
- **Capitalisation is not a control channel.** No source treats emphasis or repetition as a
  lever; our capitalised camera instruction failing 4 of 6 times is the expected result.

### 2.4 Model ids — and the trap that produced a false "unavailable" list

[REPORTED] Confirmed present: `kling-3.0/standard · /pro · /4K` · `kling-3.0-turbo/standard ·
/pro` · `kling-3.0-motion-control` · `kling-2.6` · `kling-2.6-motion-control` ·
`kling-2.5-turbo-pro` · `kling-o3/standard · /pro · /4K` · `seedance-2 · 2.5 · 2-mini ·
1.5-pro` · `sora-2-official · sora-2-pro-official` · `runway-gen-4.5` · `hailuo-02 · 03 · 2.3` ·
`grok-imagine` (what shipped) · `grok-imagine-video-1.5` · `happy-horse-1.1` · `omni-flash` ·
`seedream-4` and `nano-banana` (image).

**The trap:** one lane concluded Veo, Wan and FLUX were unavailable after eight spelling
guesses each returned 404. Another lane then found the **catalogue endpoint** and the real
spellings — `veo3.1-lite-official`, `wan2.2-image-to-video-fast`, `wan2.5-image-to-video`,
`flux-3/image-to-video`, `flux-3/first-last-frame-to-video`, `kling-2.1/standard`. **A 404 on a
guessed id means the guess was wrong, never that the model is absent.**

**There IS a catalogue. Use it instead of guessing.** [REPORTED] `POST https://api.poyo.ai/mcp`
(JSON-RPC; a GET returns 406 — it wants `text/event-stream`) exposes `poyo_search_models`,
`poyo_get_model_schema` and `poyo_get_pricing`. It returns exact JSON Schema and the exact
billing formula, free, and it supersedes the entire 400-error "free oracle" technique.

### 2.5 Operational facts that will otherwise cost an afternoon

- **Rate limit: 20 requests / 10 seconds** per uid. Sleep ~700 ms between calls.
- **HTTP 200 does not mean success.** Submit and upload return `200` with the real status in
  the *body* (`{"code":400,…}`). Status-code-based error handling reads every failure as a pass.
- **There is no cancel endpoint.** A submitted job cannot be stopped.
- **Poyo validates almost nothing** and forwards the rest to the vendor unchecked — a bad
  `seed` surfaced as a Runway error inside task status, not as a 400. Do not read "no 400" as
  "field accepted".

---

## §3 · First and last frames — the founder asked directly

### 3.1 Are they supported? **Yes. Both.**

[REPORTED, doc-sourced and corroborated by two independent lanes] On `kling-3.0/standard`,
`image_urls` is a two-slot array: **`[0]` is the start frame and `[1]` is the end frame** for
single-shot mode. Poyo's own parameter description: *"For single shot mode (multi_shots: false),
provide start and end frame URLs."*

- `seedance-2.5` — same, "max 2 images (first/last frame)".
- `flux-3/first-last-frame-to-video` — unambiguous: `minItems 2, maxItems 2`.
- `runway-gen-4.5` — **first frame only** ("single image URL only, max 1 item").
- `kling-3.0-motion-control` — **not a keyframe model.** The plural is a red herring: 1 image +
  1 **video** + `character_orientation`. It is motion *transfer*, and it needs a reference video
  of a human performing the motion — exactly what we do not have.
- **There is no separate tail-frame parameter.** `tail_image_url`, `end_image_url`,
  `last_frame_url` and `image_tail` are all unknown fields. Array position is the only channel.

### 3.2 What they buy

**A prompt can only ask. A supplied frame makes it a fact.** This is the single most important
mechanical consequence in the document, and it is what four emblem failures out of six renders
cost us. The first frame deterministically fixes subject appearance, composition, lighting,
palette and the camera's **initial** position. It also dictates output geometry: with a first
frame supplied, `aspect_ratio` is ignored and the output takes the frame's shape — so **a
1280×680 first frame yields a 1280×680 clip**, which is exactly the card's aspect (§6.1).

**What they do not buy:** the motion *between* the frames is inferred, not specified, and the
first frame's influence decays. [CITED] SteadyDancer (arXiv 2511.19320) names this the field's
open problem — "preserving first-frame identity while ensuring precise motion control is a
fundamental challenge", with identity drift and appearance distortion as the documented failure
modes. Our own shipped clip demonstrates the decay: [SEEN] frame 0 is a correct bent knee and
t=7.5 s is an extended leg with the foot off the pedals entirely. **A first frame buys the shot.
It does not hold the lesson.**

### 3.3 Can we author them ourselves? **Yes for exteriors and dashboards. No for footwells or people.**

[REPORTED, one lane rendered these] Our shipped `hero_car.glb` and `hero_interior.glb` load in a
standalone three.js rig using the shipped camera constants verbatim (`COCKPIT_EYE`,
`INTERIOR_YAW`, `cockpitVFovForAspect`), producing clean cockpit and exterior frames with no
branding anywhere and a blank wheel boss.

**Three authoring traps, all found the hard way:**

1. **The footwell is a hole.** `hero_interior.glb` has **no floor pan** under the driver's feet.
   Re-rendered with a magenta ground plane, the entire footwell renders magenta — it is the road
   showing through. The three pedals (782 vertices, merged into `interior_shell` by
   `tools/blender/hero_interior_v3.py:919`, invisible in the node list) are small untextured
   boxes hanging over open space. **A first frame framed on the footwell hands the model three
   grey plates floating above tarmac — a worse reference than the SVG still.**
2. **The instruments render black outside the app.** The cluster and centre screen are real
   three.js geometry mounted by React, not baked into the GLB. Any frame authored outside
   `CaptureScene` gives the model a car with dead screens — fatal for `check-dashboard`.
   **Author frames only through the production route.**
3. **The chassis origin sits 0.49 m above the road.** A ground plane at y=0 slices through the
   cabin and hides the footwell entirely.

**Delivery is solved and free.** [REPORTED] `POST /api/common/upload/base64` (field name is
`base64_data` — not `base64`, `image`, `file` or `data`) returns a hosted URL, verified
end-to-end for **0 credits**, so a locally rendered PNG never needs to be internet-reachable.
Two rules: **omit `file_name`** (it is honoured verbatim, producing a guessable world-readable
path that collides across runs), and **upload and submit in the same run** — URLs expire at
exactly +72 h.

---

## §4 · The shot list

Each entry gives beats, duration, camera, the exact recipe or prompt, and — the part that
decides acceptance — **what must be VISIBLE in the frame**. Acceptance criteria are written so a
reviewer can answer yes/no from a still frame, never "looks about right".

**The duration rule.** [CODE] `tutorial.test.ts:136-140` gates every authored clip to
**10 ≤ durationSec ≤ 15**. A 7-second clip fails a shipped test. [ASSUMPTION, from one data
point] our single 10 s render attempted three beats and landed two, so budget **~4 s per beat
plus 2 s establish plus 1 s hold** — which makes three beats the practical maximum inside 15 s.

### Wave 1 — six own-engine clips

---

#### 4.1 `check-dashboard` — «След запалване всички лампи изгасват»

- **Beats (3):** ① key on: the full telltale bank illuminates together · ② two seconds pass and
  they extinguish left to right · ③ one amber lamp remains lit, alone, and holds.
- **Duration:** 12 s · **Camera:** locked off on the instrument binnacle, cluster filling ~70 %
  of frame width. No movement whatsoever.
- **Recipe:** `CaptureScene` with the cockpit camera pitched to frame the cluster; drive
  `DrivelineState` through ignition; hold the final state 3 s.
- **MUST BE VISIBLE:** every telltale legible at 320 px card width (the delivery size, not the
  master); the extinguishing must be readable as *sequential*, not a single cut; the surviving
  lamp must be one of our authored pictograms and must be **amber**, matching `howBg`
  («Жълто = потегли внимателно»); no red lamp left lit, which would contradict «Червена лампа…
  означава да не тръгваш».
- **REJECT IF:** any telltale is an invented glyph; the bank blinks out in one frame; the clip
  ends with a red lamp lit.

---

#### 4.2 `release-handbrake` — «Ръчната се пуска последна — и лампата ѝ изгасва»

- **Beats (2):** ① the parking-brake telltale is lit and the switch is released · ② the telltale
  goes out and the frame holds on the dark lamp.
- **Duration:** 10 s · **Camera:** locked off, two-shot framing the `hotspot_parking_brake`
  switch and the telltale **in the same frame** — the causal link is the lesson.
- **MUST BE VISIBLE:** switch and lamp simultaneously; the lamp lit before and dark after, both
  held long enough to read (≥2 s each); the service-brake state unchanged throughout (`howBg`:
  «Със задържана работна спирачка»).
- **REJECT IF:** the switch and lamp are never in frame together — then the clip asserts a
  causal link it never shows.

---

#### 4.3 `signal` — «Ляв мигач — подаден преди първия сантиметър движение»

- **Beats (2):** ① the stalk moves and the left indicator begins to blink, car stationary ·
  ② at least three full blink cycles complete **before** the car moves at all.
- **Duration:** 10 s · **Camera:** locked-off three-quarter exterior, front-left, with the
  indicator and the front wheel both in frame.
- **MUST BE VISIBLE:** the amber lamp with a clean, periodic on/off; **the wheel demonstrably
  stationary through ≥3 blinks** — that is the entire claim («преди първия сантиметър
  движение»); the repeater visible without a zoom.
- **REJECT IF:** the wheel turns during the first three blinks (this inverts the lesson exactly
  as `adjust-seat` does today); the blink period is irregular.

---

#### 4.4 `headlights-on` — «Светлините… са за да те видят другите»

- **Beats (2):** ① our car approaches at dusk with lights off, low-contrast against the road ·
  ② dipped beams and position lamps come on at the same distance and it separates instantly.
- **Duration:** 11 s · **Camera:** **locked off, tripod, fixed focal length, no movement of any
  kind** — the A/B comparison at identical distance IS the pedagogy.
- **MUST BE VISIBLE:** the same car at the same distance in both states; the unlit state must
  genuinely read as hard to separate (if it is obviously visible, the clip disproves its own
  caption); DRL/position lamps and dipped beams distinguishable; no street lighting change
  between the halves.
- **REJECT IF:** the camera moves at all between the two states; exposure auto-adjusts and
  flattens the difference (doc 66 R5).

---

#### 4.5 `final-mirror-check` — «Огледало, огледало, поглед през рамо»

- **Beats (3):** ① left mirror — empty · ② interior mirror — empty · ③ the POV turns left over
  the shoulder and **a car is there that neither mirror showed**.
- **Duration:** 13 s · **Camera:** **POV from the driver's eye.** This is the design decision
  that makes the step filmable: the over-the-shoulder head turn becomes a camera turn, so no
  human body is required.
- **MUST BE VISIBLE:** all three views in the authored order; the conflict car **absent from
  both mirror views and present in the shoulder view** — if it is visible in a mirror the clip
  teaches the opposite of «мъртвата зона не се вижда в никое огледало»; the mirror glass
  readable at card size.
- **NOTE:** the current still shows a head with three gaze arrows and does **not** show the
  blind-zone wedge or the hidden car, so this clip adds teaching the still does not carry —
  the strongest gain in the set.
- **REJECT IF:** the conflict car is visible in either mirror; the order is not left → interior
  → shoulder.

---

#### 4.6 `move-off` — «Плавно потегляне — след като си пропуснал движещите се по платното»

- **Beats (2):** ① a car approaches from behind and passes our stationary car · ② only then does
  ours indicate, pull away smoothly and join behind it — and the passing car never slows.
- **Duration:** 12 s · **Camera:** locked-off high three-quarter from the opposite pavement,
  framing our car, the kerb and the running lane.
- **MUST BE VISIBLE:** both cars simultaneously; the pass completing **before** our wheels turn;
  the passing car at constant speed — its `rememberBg` is «Ако при потегляне някой намали заради
  теб, не си се включил безопасно», so any deceleration makes the clip demonstrate the fault;
  smooth acceleration, no lurch.
- **REJECT IF:** our car moves before the pass completes; the passing car's speed changes.

### Wave 2 — two clips, only after wave 1 passes review

- **`select-gear`** — 10 s, locked off on the selector, lever traversing P→R→N→D with the gate
  legend legible and the brake-pedal state indicated. Lower priority: the still's dashed path
  already teaches the sequence in one glance.
- **`adjust-mirrors`** — 12 s, one mirror sweeping from "mostly own car" to "own car as a narrow
  edge". Lowest priority: the still's simultaneous three-up comparison is genuinely stronger than
  a sequential clip, and the lesson is a comparison, not a change.

### The generative fallback — `check-surroundings` only, only if the founder overrules §1.6

Ready to send. Model `kling-3.0/standard`, `duration: 15`, `sound: false`,
`multi_shots: false`, `image_urls: [firstFrame, lastFrame]`. **~405 credits.**
Shape: shot → numbered beats → lighting → unbranded constraint → camera stability.

```
Wide, waist-height tracking shot orbiting a small four-door hatchback parked at
the kerb of a quiet residential street, following a person who walks one
complete loop around it. The person is framed from the shoulders down; the face
is never in shot.
1. The walker starts at the front bumper and moves along the right-hand side of
   the car, head angled down toward the sills and the tyres.
2. The walker rounds the rear bumper and stops; the camera lowers to bumper
   height and holds on the strip of ground directly behind the car.
3. The walker completes the loop along the left-hand side, stops at the
   driver's door and rests a hand on the handle without opening it.
Lighting: flat, overcast late-morning daylight, dry tarmac, no direct sun, no
lens flare, even exposure on road and bodywork.
The car is a generic unbranded vehicle: no manufacturer emblem on the grille,
the boot lid or the wheel centres, no model name, no dealer plate frame, blank
number plates.
CAMERA: constant distance from the car, one continuous smooth orbit, a single
deliberate height change at beat 2 and no other, no zoom, no cuts, no handheld
shake, no speed ramp.
```

**Deliberate omission: there is no child in this prompt.** The child stays in the still and in
the words, where it cannot be rendered wrong (§1.6). The clip teaches the *sight line*; the
`rememberBg` teaches the child. **MUST BE VISIBLE:** one continuous unbroken loop; the
bumper-height beat holding on ground no mirror covers; the hand reaching the handle **without
opening the door** (beat ③ verbatim: «Чак после отваряй вратата»); no emblem at 2.5× zoom on
grille, boot and wheel centres. **REJECT IF** the walker's face enters frame (§5), the orbit
cuts, or any badge appears.

---

## §5 · Continuity rules — so thirteen cards read as one lesson

1. **ONE VEHICLE, supplied as pixels, never as prose.** The Aurelis GT-E in every clip, and if a
   generative render is ever authorised, the hero render goes in as `image_urls[0]`. Same colour,
   same wheels, same trim, every card.
2. **ONE LIGHT STATE, with exactly one deliberate exception.** Flat overcast late-morning, dry
   road, everywhere. `headlights-on` is the **only** dusk shot and its whole content is that the
   light is different. Drifting light across cards makes thirteen cards read as thirteen stock
   clips.
3. **ONE STREET.** Same kerbside address, same neighbouring parked cars, same kerb, for every
   exterior.
4. **NO DRIVER'S FACE ANYWHERE.** Not one of the thirteen needs one, and a face that changes
   between cards is the loudest possible discontinuity. This rule is free for us — we own no
   face (§1.5) — and it must survive any future human asset.
5. **INTERIOR SHOTS SHARE ONE CAMERA.** All cockpit clips use the shipped `COCKPIT_EYE` and the
   step's authored head pose. A step is never shot from the passenger seat — which is precisely
   what today's `adjust-seat` clip does.
6. **EACH CLIP ENDS ON THE STATE THE NEXT CARD OPENS IN.** The handbrake clip ends on a dark
   telltale; the signal clip ends with the indicator running; `move-off` ends in the lane. The
   last frame of card *N* is the world card *N+1* inherits.
7. **NO AUDIO. EVER.** §6.4.
8. **The still is the floor under every card.** [CODE] `PreDriveTutorial.tsx` falls back to the
   inline SVG when a poster 404s or a clip fails. No clip may be authored for a step whose still
   has been allowed to rot.

---

## §6 · The technical deliverable

### 6.1 The aspect ratio the card actually wants

[CODE] `PreDriveStill.tsx:27-28` — `W = 320`, `H = 170`. [CODE] `PreDriveTutorial.tsx:422` —
the clip box is `aspectRatio: "320 / 170"`. **That is 1.882:1**, so:

- **Author and deliver at 1280 × 680** (exactly 320:170 × 4). The card fills with no
  letterboxing anywhere.
- 16:9 (1.778) and the shipped clip's 752×416 (1.808) both pillarbox slightly under
  `object-contain`. Neither is broken; neither is right.
- If a generative render is ever authorised, **supplying a 1280×680 first frame is how you get a
  1280×680 output** — `aspect_ratio` offers only `1:1 / 16:9 / 9:16` and is ignored once a first
  frame is present (§3.2).

### 6.2 Format

| property | value | why |
|---|---|---|
| resolution | **1280 × 680** | §6.1. 4× the card's CSS width — enough for a 2× DPR phone, no more. |
| frame rate | **30 fps** | What the headless rig emits ([MEASURED] all 46 clips are 30 fps). 24 is acceptable; 16 saves only ~8 % and costs smoothness on lessons that are about motion. |
| codec | **H.264 High, yuv420p, MP4** | Universal on Bulgarian mid-range Android. The rig's native VP9 is fine for `/clips/`, but the tutorial is student-facing and the player is a plain `<video src>` with no fallback chain. |
| flags | **`-movflags +faststart`, `-an`, no attached cover** | Playback starts before the file finishes; §6.4. |
| quality | **CRF 28, preset slow** | Verified by looking — §6.3. |
| audio | **none** | §6.4. |

### 6.3 Target weight — and the 5.6× we are currently overpaying

[MEASURED] I re-encoded the shipped clip myself (`ffmpeg`, this session):

| encode | bytes | vs shipped |
|---|---|---|
| **shipped `adjust-seat.mp4`** | 2,022,418 | 1.00× |
| strip audio + cover, `-c copy` (lossless) | 1,833,481 | −9.3 %, zero quality change |
| **libx264 CRF 28, preset slow, `-an`** | **363,213** | **5.57× smaller** |
| libx264 CRF 30, preset slow, `-an` | 276,965 | 7.30× smaller |
| libvpx-vp9 CRF 34, `-an` | 536,778 | 3.77× smaller |

[SEEN] I then rendered frame t=5 s from the source and from the CRF 28 encode **at 320 px — the
actual delivery width — and stacked them.** They are indistinguishable. The number alone would
not have justified this recommendation; looking did (doc 66 R0).

- **Target: ≤ 800,000 B per clip.** [ASSUMPTION] Derived from the 363 KB measured on real
  content at 752×416 and scaled for 1280×680; a locked-off cockpit clip should land well under
  it, and only `move-off` (two moving cars) should approach it.
- **Hard ceiling: 12,000,000 B per file** and **125,000,000 B for the set** — [CODE] enforced in
  CI by `tools/assets/publicBudget.mjs` (`sim-tutorial-clip`).
- **Six clips at target ≈ 4.8 MB of deploy, and 0 bytes of session download until a student
  taps.** The budget was sized for thirteen Kling-grade clips at ~117 MB. **We should spend ~4 %
  of a ceiling the founder already approved.**

### 6.4 Two free wins, and one live hazard

[MEASURED] The shipped clip carries **a real AAC stereo track at 113,252 bps — 141,565 B, 7.0 %
of the file — at mean −12.3 dB / max −2.4 dB.** It is **not silent.** [CODE]
`PreDriveTutorial.tsx:464` renders the element `muted` with no unmute path. So the student pays
for 142 KB he can never hear — and nobody on this project has listened to it. If it contains
speech in any language it is a live THEO-4 hazard sitting under a Bulgarian caption.

It also carries **a third stream: an mjpeg attached cover image**, pure dead weight in a web mp4
(the poster already exists as a 27,496 B WebP).

**Rule: every clip ships `-an`, with no attached cover.** If a generative render is ever
authorised, `sound: false` on every submit — [REPORTED] it genuinely strips the stream, and it
also avoids Kling's audio tier (+44 %: 39 credits/s vs 27).

### 6.5 The poster frame

[CODE] `publicBudget.mjs` — `sim-tutorial-poster`: **≤ 40,000 B per file, ≤ 500,000 B for the
set**, and the session model caps idle download at 500,000 B.
[CODE] `predrive-clip-weight.test.ts` additionally requires the poster to be **real WebP**
(RIFF/WEBP magic bytes), **> 2,000 B**, and **< 5 % of the clip**.

**That last one bites as clips get lighter:** a 600 KB clip needs a poster under 30 KB; a 400 KB
clip needs one under 20 KB. The house WebP contract (854 px, q78) measures 13.9–17.6 KB, so this
is achievable — but it must be checked, not assumed. Current `adjust-seat.webp` is 27,496 B,
which is 1.4 % of a 2 MB clip and would be **6.9 % of a 400 KB one — a test failure.**

**The poster must be the clip's own frame 0** (`ffmpeg -frames:v 1 -c:v libwebp`). And after
today, one more rule: **the poster must pass the same review as the clip** (§7). Today's poster
is correct while the clip it advertises is wrong — the most misleading arrangement possible.

---

## §7 · The production flow, and the reject gate

Six clips were rendered this week; **four would have shipped a lesson that contradicts its own
caption**, and one of those four is live right now. The gate below is the response. It is
written as a procedure because "verify with your eyes" is the founder's standing instruction and
an instruction is not a control until someone can be held to a step.

### 7.1 The flow

```
1  AUTHOR THE CARD      — beats, duration, camera, acceptance criteria, from the
                          step's OWN captionBg/howBg/rememberBg. Never invented.
2  RENDER               — own engine: clip-rig → /dev/clip-headless → ffmpeg.
                          (generative, only if authorised: upload frames, submit)
3  R0 REVIEW  ◀━━━━━━━━━ THE GATE. §7.2. Claude looks, item by item, and certifies.
                          ├─ REJECT → back to 1 with the named failed criterion
                          └─ PASS   → continue
4  FOUNDER REVIEW       — taste and truth only. Never defect-hunting (doc 66 R0).
5  POST-PROCESS         — -an, drop cover, CRF 28 preset slow, +faststart, 1280x680
6  POSTER               — frame 0 → WebP; verify <5% of clip AND <40,000 B
7  PLACE                — add to PRE_DRIVE_TUTORIAL_CLIPS with MEASURED bytes
8  GREEN                — tutorial.test.ts (10-15 s) · predrive-clip-weight.test.ts
                          (bytes match statSync EXACTLY) · publicBudget
```

### 7.2 The reject gate — who looks at what, at what zoom

**Who:** Claude, before the founder sees the clip. Doc 66 R0 is already LAW: *"Claude watches
everything before the founder does… 'Tests green' and 'file exists' are NOT evidence for visual
work; only looking is."* The gate below is that rule made specific to tutorial clips.

**What is looked at:** not the clip — **five extracted still frames**, at
`t = 0`, `t = 0.25·D`, `t = 0.5·D`, `t = 0.75·D`, `t = D − 0.2 s`. Frames, because a defect that
lasts two seconds is invisible when you watch and unmissable when you look. The shipped
`adjust-seat` failure sits at t = 7.5 s of 10 — **the fourth frame, which nobody extracted.**

**At what zoom:** each frame twice —
1. **at 320 px wide**, the real delivery width, to confirm the lesson is legible at card size;
2. **at ≥2.5× on the two decision regions**: the body part or control the caption names, and
   the wheel boss / grille / boot / wheel centres for ADR-001.

**The checklist — every clip, every item, in writing.** Doc 66's R1–R6 apply unchanged. These
three are added for tutorial clips, and each is answerable yes/no from a frame:

> **R7 — THE CLIP DEMONSTRATES WHAT ITS CAPTION CLAIMS.**
> Read the step's `captionBg` aloud. Point at the frame where each clause is true.
> A clause you cannot point at is a **REJECT**, not a note.
> *This is the rule that today's `adjust-seat` clip fails: «Свит крак на педала» — there is no
> pedal under the foot and the knee is open ~150°.*
>
> **R8 — NO CLAUSE IS SHOWN INVERTED.** Stronger than R7 and non-negotiable: a clip that
> demonstrates the *fault* the step teaches against is worse than no clip, because the still it
> replaced was correct. Any frame showing the inverted state is an immediate reject, even if
> four other frames are perfect.
>
> **R9 — ADR-001, VERIFIED AT ZOOM, NOT ASSUMED.** No manufacturer emblem, model name, dealer
> frame or readable plate on grille, boot, wheel centres or wheel boss; and the cabin is
> *our* cabin, not a photoreal production car. "I did not notice a badge" is not a pass — the
> zoom must have been taken.

**And the rule that makes the gate real:** the certification is written down per clip, item by
item, naming the frame timestamp for each. A clip reaches the founder with its checklist
attached, or it does not reach the founder.

### 7.3 The retro-gate, this week

The gate applies to what already shipped. `adjust-seat` has now been reviewed under it: **R7
REJECT** (no pedal under the foot, knee ~150° against «свит крак»), **R8 REJECT** (the inverted
state is demonstrated, at t = 5 s and t = 7.5 s), **R9 REJECT** (photoreal real production-car
cabin, not the Aurelis GT-E). Three of three. **Pull it.**

---

## §8 · The cost model

**Balance: 6,873.5 credits ≈ $34.37** at 1 credit = $0.005. [REPORTED] Bracketed by four
independent lanes; the brief's 7,008.5 is the pre-incident figure (§0).

**The anchor price is measured against a real invoice, not a pricing page.** [REPORTED] An
accidental 5.04 s render on `kling-3.0/standard` at defaults billed exactly **135.0 credits →
27 credits/second** with `sound:false`. That reconciles the previously handed-down "270" as a
10-second render and makes the per-second rate trustworthy.

| model | credits/s | 10 s clip | **6 clips** | **13 clips** |
|---|---|---|---|---|
| **our own simulator (recommended)** | **0** | **0** | **0** | **0** |
| kling-3.0/standard, 720p, no audio | 27 | 270 | 1,620 ($8.10) | 3,510 ($17.55) |
| kling-3.0/standard **with audio** | 39 | 390 | 2,340 | 5,070 |
| kling-3.0/pro 1080p, no audio | 39 | 390 | 2,340 | 5,070 |
| kling-3.0/4K | 50 | 500 | 3,000 | 6,500 |
| grok-imagine (what shipped) | — | 40 flat | 240 | 520 |

**The recommended programme in §1 costs 0 credits and leaves the balance at 6,873.5.**

**The number that should decide scope if the founder overrules.** [CITED] A documented
production run reports 164 generative generations yielding 41 usable clips — **a ~25 % keep
rate.** At that rate, thirteen clips on `kling-3.0/standard` is not 3,510 credits, it is
**~14,000 — roughly twice the entire remaining balance.** Even six clips is ~6,500, which is
95 % of everything we have, with no second attempt. **There is no budget for a generative
thirteen at any quality bar we would accept.** That is not a preference; it is arithmetic.

Reserve, if the founder authorises the `check-surroundings` fallback: **405 credits (5.9 % of
balance)** for one 15 s render, leaving 6,468.5.

**One pricing conflict, flagged rather than resolved.** [REPORTED] One lane reports
`kling-o3/standard` at **10 credits/s** from the public pricing page — 2.7× cheaper than
`kling-3.0/standard` with an apparently identical parameter surface. Another lane's catalogue
query returned exact formulas for `kling-3.0/*` and did not cover `kling-o3`. **Do not budget on
the o3 figure**; it is page-sourced and unverified, and a cheaper tier with an identical feature
list usually trades something the parameter list does not reveal. §9 has the 50-credit test that
settles it.

---

## §9 · What we still do not know

Each item names the exact test, its model and its credit cost, so the founder can authorise them
one at a time. **I ran none of these and spent nothing writing this spec.**

### 9.1 Costs nothing — do these regardless

| # | question | how it is settled | cost |
|---|---|---|---|
| 1 | **Does the shipped clip's audio contain speech?** 142 KB nobody has heard, under a Bulgarian caption. A live THEO-4 hazard if it talks. | Listen to it. Then delete it either way (§6.4). | 0 |
| 2 | **Did the six test renders set `sound`?** If they defaulted to audio-on, part of the reported 1.0–9.0 MB weight spread is inaudible audio and the per-render prices were 44 % higher than recorded. | `GET /api/generate/status/{task_id}` returns exact `credits_amount` per task. Find the six task ids in the render lane's scratchpad. | 0 |
| 3 | **Can `/dev/clip-headless` compile on this box?** [REPORTED] It failed to warm after 315 s with a Turbopack CSS-worker timeout on `globals.css` — the known doc-69 I/O disease on the 7200 rpm E:, worsened by concurrent workflows. **This blocks wave 1 entirely.** | Re-run `clip-rig.mjs --warm` with no other workflow competing for the disk. | 0 |
| 4 | **Is the `check-surroundings` no-human variant acceptable?** (§1.6 — teach the sight line, weaken «дете» to «препятствие».) | Founder ruling. Content decision, not technical. | 0 |

### 9.2 Costs credits — authorise individually

| # | question | exact test | model | cost |
|---|---|---|---|---|
| 5 | **Is `kling-o3/standard` really 2.7× cheaper at equal quality?** If true, every generative figure in §8 falls by 63 %. | One 5 s render, then read `credits_amount` off task status to confirm the rate. | `kling-o3/standard`, 5 s, `sound:false` | **~50 cr ($0.25)** |
| 6 | **Does a supplied first frame actually hold OUR car, or does the model "photorealise" it into a real one?** This decides whether image-to-video can ever satisfy ADR-001, and it is the cheapest question with the largest consequence. | Render a cockpit frame through `CaptureScene` (§3.3 — not the standalone rig), upload via `/api/common/upload/base64`, submit, then zoom the boss and dash. | `kling-2.1/standard` (i2v, cheapest) | **~30 cr ($0.15)** |
| 7 | Same question on the model we would actually ship. | As #6. | `kling-3.0/standard`, 5 s, `sound:false` | **~135 cr ($0.68)** |
| 8 | **Does a first+last frame pair actually drive the end state**, or does it interpolate with a visible pop (doc 66 R5)? The only mechanism that could make camera and end-state a construction rather than a request. | Two frames from the sim at two known camera poses → `image_urls:[first,last]`. | `kling-3.0/standard`, 10 s | **~270 cr ($1.35)** |
| 9 | **Does the ~4 s-per-beat pacing rule hold at 15 s?** Extrapolated from ONE render that landed 2 of 3 beats. If three beats land, multi-beat steps stay viable; if not, generative is one clip or none. | The `check-surroundings` prompt in §4, three beats, reviewed under §7.2. Produces a usable clip either way — do not run a throwaway. | `kling-3.0/standard`, 15 s | **~405 cr ($2.03)** |

**Decisive suite (#5–#8): ~485 credits ≈ $2.43, or 7 % of balance.**

### 9.3 The probe rule that must change

[REPORTED] Two independent lanes found `{"input":{}}` creates a real billable task on
`kling-3.0-turbo/*`, and one lane found `runway-gen-4.5` **silently ignores unknown fields**, so
a payload stuffed with poison on fields that model does not validate still submits. One lane also
found that omitting a "required" parameter does **not** lock submission — `duration` is
documented as required and is not, which is exactly how 135 credits were spent.

> **Rule: never probe with an empty or nearly-empty payload, and never rely on omitting a
> required field as a submission lock. Every probe must carry a value that is
> type-invalid on a field the target model validates FIRST** — for Kling that is
> `"duration": 99` (range-checked before everything else, and proven to 400 on every
> tier). Bracket every probe batch with a balance read.
>
> And prefer the catalogue (§2.4) to probing at all: it returns exact schemas and pricing
> for free, which is what the 400-error oracle was a poor substitute for.

### 9.4 Assumptions in this document, listed so they can be attacked

- **[ASSUMPTION]** The 800 KB per-clip target is scaled from a 752×416 measurement to 1280×680;
  it is not measured at the delivery resolution because no own-engine tutorial clip exists yet.
  Re-measure on the first render and move the number with a reason.
- **[ASSUMPTION]** ~4 s per beat, from a single data point. Test #9 settles it.
- **[ASSUMPTION]** The limb/device split of the thirteen steps is judgement at the edges.
  `start-engine`, `select-gear` and `release-handbrake` are device-led but their Bulgarian text
  still names a foot or a held brake. I placed `start-engine` with the stills because its caption
  *opens* on the foot, and the other two with the clips because the control is the visual
  subject. A different reading moves one or two; it does not move the recommendation.
- **[ASSUMPTION]** That wave-1 clips can be rendered by the existing rig without new engineering.
  They cannot, quite: `/dev/clip-headless` renders **scenario mistake traces from committed
  traces**, not pre-drive tutorial shots. The camera, the driveline sequence and the shot window
  for a tutorial clip need a new capture surface alongside `CaptureScene`. **This is real
  engineering work, not a render button** — it is the honest cost of the zero-credit route, and
  it is why wave 1 is six clips and not thirteen.
