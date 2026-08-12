# 82 — Simulator: Quality & Innovation

**Status:** decision document · **Date:** 2026-07-25 · **Owner:** founder
**Trigger:** founder verdict — the simulator *"looks like a very basic Minecraft server with a car"*, and the goal is to ship something *"advanced and innovative"*.
**Scope:** the browser simulator (Three.js + R3F + Rapier, ADR-005). Theory-side tutor work appears only where it touches the sim.
**Constraints assumed throughout:** ADR-001 (fictional vehicles), ADR-002 (rule engine judges; LLM never free-recalls law), ADR-004 (minors, minimal PII, no biometrics), solo founder + AI, bg-BG user-facing, mid-range Android target.

> **Reading order matters.** §2 (the performance envelope) constrains §3 and §4. §5 is the section that answers *"innovative"*; §3 only answers *"prettier"*. If you read one thing, read §6.

---

## 0. The verdict in six lines

| Question | Answer |
| --- | --- |
| Is the founder right that it looks basic? | **Yes. Completely.** The evidence below is worse than the complaint. |
| Is the renderer the problem? | **No.** The renderer is the strongest part of the product and is ahead of most shipped Three.js work. |
| Is it the art, then? | **It is the *content*.** Not "the art is bad" — the worlds are literally empty and the sky is literally featureless. |
| Is it expensive to fix? | **No.** ~14 hours changes the screenshots. ~90 hours changes the product's visual identity. No artist team. |
| Does prettier make it *innovative*? | **No.** Realism has a null evidence base for crash reduction. §5 is where "innovative" actually lives. |
| What do I build first? | **§6.1 — the one-afternoon bundle (14 h).** Details there. |

---

## 1. WHY IT LOOKS BASIC

### 1.1 The diagnosis: it is content, not the renderer

The instinct behind "Minecraft server" is usually "the engine is weak". Here that is measurably false.

**What the renderer already does**, per frame, at tier `high`:
N8AO (radius 2.5 m, intensity 2.2) → mipmap Bloom (threshold 0.9) → SMAA → **AgX** tone mapping → HueSaturation +0.15 / Contrast +0.08 / Vignette — all merged into a single fullscreen pass; plus a **texel-snapped camera-following orthographic shadow map** (1024/2048 px, 45–75 m), **PMREM IBL** from a 1k HDRI, **KTX2 + Draco** compressed PBR assets, **instanced** buildings chunk-culled on a 200 m grid with instance-aware bounding spheres, and **three tuned quality tiers** with a separate *download* budget so tier `low` fetches 725,950 B of maps instead of 6,389,355 B.

- `platform/src/modules/sim/environment/SimEnvironment.tsx:376-491` (composer), `:350-367` (shadow-texel snapping)
- `platform/src/modules/sim/environment/quality.ts:95-174` (three tiers)
- `platform/src/modules/sim/world/textures/textureBudget.ts` (per-tier fetch plan, byte table)
- `platform/src/components/sim/LessonScene.tsx:940-946` (PMREM IBL)

**The decisive evidence:** the shipped clip frames were rendered at `"quality": "high"` (`platform/public/clips/manifest.json:24`, `platform/src/app/dev/clip-capture/CaptureScene.tsx:462`). Those frames **are the renderer's best case** — and they still read as a prototype. Nothing left in the pipeline can be blamed.

So the gap is what the renderer is being asked to draw.

### 1.2 The seven specific content failures

Open `platform/public/clips/sc-pe-zone-living__m0.k1.webp` and `platform/public/clips/sc-junction-rhr__m1.k2.webp` while reading this list. Every item is visible in those two frames. (These were `.png` when the document was written; the PNG masters were pruned on 2026-07-26 per §8 — the WebP siblings are the same frames at the poster contract's 854 px, which is still ample to read every failure below.)

**1. The flagship city world has zero buildings — and a test asserts it.**
`d2-v1.json` is 1.93 × 1.63 km, **21.7 km of road, 102 intersections, 283 edges, `"buildings": 0`** (verified directly from `platform/public/world/d2-v1.json` meta.stats; the buildings array is empty). `platform/src/modules/sim/world/__tests__/d2-district.test.ts:280` pins it: `expect(world.stats.buildings).toBe(0)`.
The `sc-ed-d2-city-run` strip is **roads floating on an infinite lawn**. This is the single largest cause of the Minecraft read, and it is a **data** gap.

**2. The other ~93 worlds have 1–5 buildings each.** `ln-v1` has one 12×18 m prism. `rb-2lane-v1` has one 12×12 m "cafe". `ov-solid-v1` one 12×16 m block. These are the worlds the 150 scenario templates and 18,396 variants actually run in. Only `district-v1.json` (248 buildings) is a real place.

**3. The roads are 2.5× oversized and the pavements are not.**
`PERCEPTUAL_ROAD_SCALE = 2.5` (`platform/src/modules/sim/contracts.ts:28`, founder call 2026-07-10) makes every lane **8.125 m wide** (real Bulgarian urban lane: 3.0–3.5 m). A 2+2 street is 32.5 m of asphalt — wider than a six-lane motorway. Meanwhile `SIDEWALK_WIDTH_M = 3.5` was **not** scaled (`world/builders/constants.ts:37` vs `:15`), so the road:footway ratio went from a real ~1:1 to 2.5:1. The car stays real size.
That combination — oversized blocky world, real-size car, no human-scale reference — *is* the sentence "a basic Minecraft server with a car". It also makes every prop budget look sparse: the same objects spread over ~6× the area.

**4. Every object except the player's car is an untextured block.**
Measured by GLB inspection: `corva_s.glb` = **228 triangles, 0 textures**. `taxi.glb` = 372. `street_lamp` 132, `bench` 144, `bus_stop_shelter` 180, `tree_oak` 196, city tower tile 144. Trees are Kenney CC0 low-poly with vertex colours only (`world/components/treeModels.ts:1-20`).
`hero_car.glb` = **64,298 triangles**. The player's car is **282× denser** than every other car on the street. Mixed fidelity reads as *unfinished*, which is worse than consistently stylised.

**5. The sky has no clouds.** The dome fragment shader is `mix(zenith, horizon)` + a sun disc + procedural stars — three terms (`environment/SkyDome.tsx:98-125`). With a permanent 22° sun and cream fog `#e3c49c` (`environment/presets.ts:194-226`), **35–45% of every frame is a featureless sepia gradient carrying zero information.**

**6. The horizon is a razor-straight line and Vitosha does not exist.**
`TERRAIN_MAX_RELIEF_M = 0.25` and even that is masked to zero near roads/buildings (`world/builders/terrain.ts:62-74`). A grep across the whole sim module for `skyline|backdrop|distant|impostor` returns **zero** hits. Sofia is dominated from the south by a 2,292 m massif. Its absence is the "flat-earth test level" tell, and it is also why the sim reads as *generic-nowhere* rather than Bulgaria.

**7. The surface systems that exist are turned almost all the way off.**
- Road wear: one decal per **40 m** of centreline on an 8.125 m lane ≈ one blob per 325 m² (`world/builders/constants.ts:110`). Six atlas cells (crack/patch/oil/manhole/dirt) already batched into one draw call — statistically invisible.
- Decals are inset **6 m** from every ribbon end (`constants.ts:113`), so **no wear ever enters a junction**. A 4-way junction at 2.5× scale is ~1,600 m² of blank grey slab.
- Lane markings render as **flat untextured colour with no `receiveShadow`** — verified: `world/components/StaticWorld.tsx:457-459` is `<mesh geometry={geometries.markings}>` with a bare `meshStandardMaterial`, while lines 273/295/316/342/367/436 all pass `receiveShadow`. Paint therefore **glows through building and car shadows** and reads as fresh plastic tape.
- Ambient traffic default is **`vehicleCount: 0, pedestrianCount: 0`** (`lessons/scenario/compile.ts:82-83`). The district default is 10 vehicles / 8 pedestrians for 3.15 km². The city is uninhabited.
- The asphalt texture (ambientCG Asphalt031) is a near-uniform mid-grey fine grain with no tar seams, cracks or macro variation — and it was itself a fallback because the specified Asphalt025 404'd (`public/sim/LICENSES.md:31-45`). Beyond ~15 m it mips to flat grey.
- There is **no detail normal**: `macroVariation.ts:14-16` modulates *albedo only*, at an 80 m feature scale. Nothing carries relief at the 0.5–3 m scale the cockpit camera stares at.

**8. ~~There is headroom to fix all of it.~~ RETRACTED 2026-08-10 — this paragraph was written against a number that could not answer the question it was asked.** It read: „`drawCallEstimate` for a scenario world is ~56 against a test cap of 150 draws / 300,000 triangles … 'It has to stay fast on a phone' is *not* what is limiting the look today."

`drawCallEstimate` was a STATIC count of world mesh slots. It had no term for the cockpit, the hero car, the level-1 aids, traffic, the sky, weather, the mirror pass or the composer, and its whole range across all 105 shipped districts was 56–67. The first time the running product was counted — raw WebGL draw counter on `/dev/drive-rig`, tier low, level 1 — **37 of 37 districts sampled were over the hard cap of 100 draws per frame**, at 146–252. The static number was 26–41 % of the frame.

The field is now `world.stats.staticDrawSlots`, it is derived from the placement data (`world/builders/drawSlots.ts`), and it is not comparable to a per-frame budget by construction: `environment/frameCost.ts` owns the frame question and `scoreFrameDrawBudget` accepts only a `MeasuredFrame`. Post-fix measurements and the verdict each district earns are recorded in `frameCost.MEASURED_FRAMES`.

**What survives of the claim:** the city kit really is 4,896 triangles across 16 GLBs, art richness really is not what the budget is being spent on — measured, the biggest single item in a tier-low frame is the 56-draw cockpit and the second is the level-1 ghost — and every fix in this document is still worth doing. What does not survive is „there is headroom": there is not, at tier low, on any district in the product.

### 1.3 Where the founder's instinct is right, and where it is wrong

**Right:**
- The frames genuinely look like a prototype. This is not perfectionism.
- It is fixable without a studio.
- Mixed fidelity (photoreal-ish hero car among flat blocks) is a real, nameable defect.
- The product cannot charge money looking like this — credibility is a conversion problem, not vanity.

**Wrong:**
- *"We need a better engine / WebGPU / more advanced rendering."* Nothing in the current image is limited by WebGL2. WebGPU global support is 83.63% vs WebGL2's 94.67% ([caniuse.com/webgpu](https://caniuse.com/webgpu), [caniuse.com/webgl2](https://caniuse.com/webgl2)); Firefox is still ❌, and Chrome-on-Android needs Android 12+ **and** an ARM/Qualcomm/Intel GPU — Samsung Xclipse (Exynos, sold across Europe) is still "work in progress" ([gpuweb implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)). ~16% of Bulgarian Android users are on 11 or older ([statcounter BG](https://gs.statcounter.com/os-version-market-share/android/mobile-tablet/bulgaria)). A migration is a **60–100 h rewrite of your most tuned code for zero day-one visual change**, and it can never replace the WebGL2 path — you would maintain two composers and two shader dialects, forever, alone.
- *"Buy better assets."* Poly Haven and ambientCG are verified CC0 and cover every need. Synty POLYGON City is $9.99, ships FBX with no glTF, and is the same stylised register you already have. Anything under the Fab Standard License is unusable here: in a browser product every `.glb` is a public URL — de facto standalone redistribution — and the binding EULA could not even be read (`fab.com/eula` returns HTTP 403). `public/sim/LICENSES.md:88-91` records this project already discarding the Marlin Studios pack for exactly this reason.
- *"Regenerate the hero car with AI 3D."* Already tried, already documented: `tools/blender/README.md:72-81` — "Rodin geometry is scan-soup… multi-shell mesh with holes and flat disc wheels… regenerating gives a different look but the SAME limitation."
- *"Advanced = better graphics."* This is the important one. See §5. Realism has a **null** crash-reduction evidence base; hazard prediction and calibration have a positive one. Prettier buys credibility. It does not buy a moat.

---

## 2. THE PERFORMANCE ENVELOPE

Every recommendation below must fit inside these numbers. They are derived, not guessed —
**except the draw-call line, which is not, and §2.6 is the measurement that proves it.** §2.1's
GFLOP-per-Mpx derivation supports the resolution, fill and shading lines; nothing in it produces
"≤70/frame". Read §2.6 before quoting the draw-call row of §2.2 at anybody.

### 2.1 The key insight: the phone is a weak CPU, not a weak GPU

Fragment-shading headroom **per output pixel**, at each tier's actual buffer size:

| Device | GPU | FP32 | Buffer @ dpr cap | GFLOP / Mpx |
| --- | --- | --- | --- | --- |
| Iris Xe G7 96EU (laptop, tier `med`) | Xe | 1.656 TFLOPS | 1920×1080 = 2.07 Mpx | **800** |
| Helio G99 / Dimensity 6300 (tier `low`) | Mali-G57 MP2 | 0.2816 TFLOPS | 891×411 landscape = 0.366 Mpx | **769** |
| Snapdragon 695 (tier `low`) | Adreno 619 | 0.4864 TFLOPS | 0.366 Mpx | **1,329** |

Sources: [Iris Xe](https://cputronic.com/index.php/gpu/intel-iris-xe-graphics-g7-96eu), [Mali-G57 MP2](https://cputronic.com/soc/compare/mediatek-helio-g99-vs-mediatek-dimensity-6300), [Adreno 619](https://cputronic.com/soc/qualcomm-snapdragon-695); dpr cap 1.0 from `environment/quality.ts:114`.

At dpr 1.0 in landscape, **a mid-range Android has roughly the same shading headroom per pixel as the laptop the `med` tier was tuned for.** The phone's real deficits are:
- **Draw-call submission** (single-threaded WebGL validation on two big cores)
- **JS parse/compile** — ~0.5–0.8 KB/ms compressed on mid-range Android; ~927 KB gz of three + entry JS ≈ **1.2–1.9 s of pure parse** before a frame ([V8 cost of JS](https://v8.dev/blog/cost-of-javascript-2019), [parse-cost analysis](https://www.kunalganglani.com/blog/javascript-bloat-causes-fixes))
- **Memory** — Chromium on Android cannot grow a WASM heap past 256 MB ([Unity issue tracker](https://issuetracker.unity3d.com/issues/webgl-android-memory-growth-above-256mb-causes-could-not-allocate-errors-in-chromium-based-browsers)); a Galaxy S20+ offered a WebGL app only 219 MB where Firefox offered 1.96 GB.
- **Memory bandwidth** — ~13–17 GB/s shared LPDDR4X vs the laptop's ~68 GB/s. *This is the one thing that could falsify the parity above, and it is what the first physical measurement must test.*

**Bandwidth is not the Bulgarian constraint.** Median mobile download in Bulgaria is 289.41 Mbps — fastest in Europe ([source](https://promotebulgaria.com/bulgaria-ranks-4th-in-the-world/)). 9.8 MB is ~0.3 s of wire. Optimise parse time and VRAM, not megabytes.

### 2.2 The three budgets

| | **PHONE (`low`)** | **LAPTOP (`med`)** | **DESKTOP (`high`)** |
| --- | --- | --- | --- |
| Reference | Galaxy A16 / Redmi Note — Mali-G57 MP2 or Adreno 619, 4 GB | Iris Xe G7 96EU | Discrete GPU |
| Resolution | 891×411 CSS, **dpr cap 1.0** | 1920×1080, dpr 1.0–1.25 | 1920×1080, dpr 1.5 |
| **Target fps** | **30 flat** (floor 24) — do not chase 60 | 60 (floor 45) | 60 |
| **Draw calls** ⚠️ *not derived — see §2.6* | **≤70/frame** (hard cap 100), incl. mirror pass | ≤150 (cap 250) | ≤300 |
| **Triangles** | **≤250k/frame** incl. mirror pass | ≤700k | ≤1.5M |
| **Texture VRAM** | **≤80 MB** transcoded+mips (ASTC 8 bpp) | ≤220 MB | ≤512 MB |
| Shadow maps | **zero** — blob decals only | one 1024², 55 m | one 2048², 75 m |
| Post-processing | **none** (0 ms). AA = free tile-memory canvas MSAA | ≤3.5 ms | ≤6 ms |
| Materials | MeshStandard only, zero MeshPhysical | +clearcoat on hero paint | full |
| Lights | 1 directional + 1 hemisphere | same | same |
| First-playable wire | **≤3.5 MB**, of which ≤500 KB gz JS | ≤9 MB | ≤12 MB |

**Do not raise the phone dpr cap.** dpr 1.5 is 2.25× the fill and destroys the parity the whole budget rests on.
**Do not remove canvas MSAA at `low`** (`LessonScene.tsx:917`, `antialias: !postprocessing`). On tile-based mobile GPUs the resolve happens in tile memory and is nearly free, and at a 2.6× upscale it is the only thing keeping lane markings from crawling.

Android 13+ covers 76.7% of Bulgarian devices, so `KTX2Loader.detectSupport(gl)` picks **ASTC 8 bpp**, not ETC2 4 bpp. Size VRAM on ASTC.

### 2.3 Four cheap structural fixes the envelope demands

> **Status 2026-07-26 — all four landed, measured on desktop.** Details and the
> measured before/after are in §2.5 below. The phone half of P1 is still open:
> every number in §2.2 remains a prediction until an A16 log lands in
> [`perf/`](perf/README.md).

| Fix | Why | h |
| --- | --- | --- |
| **Seed the quality tier from device signals BEFORE the first fetch** | The download tier already exists (`textureBudget.ts`, shipped in 165a58b) but the store cold-starts `recommendation: "med"` and only decides inside the 2.5 s rAF probe (`environment/qualityStore.ts:31`, `:118-157`) — by which time the med plan (5,950,303 B incl. a 1,596,163 B HDR) is already requested. **The 5.4 MB saving currently helps only on the second visit.** Seed synchronously from `hardwareConcurrency` / `deviceMemory` / `(pointer: coarse)`; bias toward `low` on disagreement. Note `quality.test.ts:130` asserts `dpr 2 → "med"` and needs updating. | 4 |
| **Code-split the composer out of tier `low`** | `SimEnvironment.tsx:42-48` statically imports EffectComposer/N8AO/Bloom/SMAA; `LessonScene.tsx:95` statically imports SimEnvironment. A phone at `low` (`postprocessing: false`) parses **330,491 B** of `postprocessing.min.js` it never mounts ≈ 400–660 ms of Android CPU. `next/dynamic` behind the preset flag. Keep the `key={\`fx-${level}\`}` remount semantics. | 3 |
| **Drop `suv_boxy_lux` from the tier-`low` NPC pool** | It is **22,672 triangles / 16 materials** at weight 5 (~1 in 21 moving spawns) — every other fleet model is 180–280 tris. At ~50 agents that is ~54k triangles and 16 draw calls returned for one constant. `traffic/vehicleFleet.ts:1038`. **Best effort-to-win ratio in the entire codebase.** | 1 |
| **Add a `webglcontextlost` listener with telemetry** | There is currently **none anywhere in `src/`**. On a 4 GB phone an OOM presents as a silent black canvas with no diagnostic. | 1 |

### 2.4 The device gate — CLOSED 2026-08-11: the founder is the test device

**Retired on the founder's instruction.** This section used to argue for buying a
€125 Galaxy A16 and spending four hours over `chrome://inspect` before any phone
number could be believed. That purchase is unnecessary: **the founder tests every
build on his own real phone, and his reports are the device evidence.** When he
says the frame rate is bad on mobile, that is a measurement from real silicon,
not a prediction — and it outranks anything this repo can produce on a desktop.

**What this changes, and it is the important part.** The old text was used to
defer the phone question ("every number in §2.2 is a prediction until a log
lands"). It can no longer be used that way. A founder report of poor mobile
performance is now the *primary* signal and must be investigated on its own
terms, not answered with desktop draw-call arithmetic. That mistake was made on
2026-08-11: a 3–5× draw-call breach was measured at 1264 × 620 on a desktop and
reported to him as the cause of his FPS complaint, when nothing phone-shaped had
ever been profiled.

**What still holds, because it is physics rather than process:** DevTools device
emulation and Android emulators reproduce a phone's *viewport, touch model and
user agent* — not its GPU. So an emulated profile is authoritative for layout,
overflow, hit targets, touch behaviour, main-thread cost, draw counts and
triangle counts (all scene-graph or DOM properties), and is **not** authoritative
for frame time. Quote emulated milliseconds to nobody. When frame time is the
question, the answer comes from the founder's handset.

The instrumentation is built and unchanged — `PerfProbe` at
`LessonScene.tsx:1312-1365` disables `gl.info.autoReset`, accumulates whole-frame
draws/triangles across the mirror and composer passes, and logs
fps/draws/tris/programs once per second, budget lines at `:1321-1322`. It runs on
his phone as readily as here: `?simPerf=1`.

> **Update 2026-07-26.** The instrument is built and the procedure is written
> down: [`perf/README.md`](perf/README.md). `PerfProbe` now accumulates
> per-second windows, scores them against `PERF_BUDGETS` (§2.2 transcribed into
> `environment/perfBudget.ts` and unit-tested against it), and prints a
> self-contained markdown artifact; `platform/scripts/perf-report.mjs` files it
> under `docs/simulation/perf/<date>-<tier>.md`.
> Two things changed relative to the description above, both deliberate:
> - **`?simPerf=1` now works in production builds.** A dev build is unminified,
>   unsplit React — its load time and parse cost describe no student's session,
>   so instrumenting only dev would have made the gate impossible to close
>   honestly. `localStorage["sim.perfLog"]` stays dev-only.
> - **The table gained a thermal-decay line** (`fps last third ÷ first third`).
>   §7.3 #13 is explicitly about the difference between a locked 30 and a 45→25
>   decay — and those two runs have the same median *and* the same minimum, so
>   nothing else in the table can tell them apart. It is also why an unattended
>   run is 60 s rather than 10 s.

---

### 2.5 What P1 actually changed, measured

Desktop measurements, Next 16.2.10 / Turbopack production build
(`npx next build`), same machine, same commit apart from the change under test.

**Composer code-split** — eager client chunks for the `/simulator` route, i.e.
the JavaScript that must be downloaded *and executed* before the first frame:

| | Eager chunks | Eager bytes | postprocessing |
| --- | --- | --- | --- |
| Static import (before) | 16 | **2,943,644 B** | inside a 1,321,458 B **eager** chunk |
| `next/dynamic` (after) | 16 | **2,512,646 B** | a 385,879 B **lazy** chunk (169 KB gz) |

**−430,998 B (−14.6%) of must-execute JavaScript**, and at tier `low` the
composer module is now never *evaluated* at all.

One honest correction to the estimate above: §2.3 predicted "≈400–660 ms of
Android CPU" by applying §2.1's *compressed* parse rate (0.5–0.8 KB/ms) to
`postprocessing.min.js`'s *raw* 330,491 B. Against the measured **169 KB
gzipped** chunk the same rate gives **≈210–340 ms**. Still the largest
single parse saving available on the route, but half the headline figure.

**Tier seeding** — `loadQualityPreset()` (`lesson-ui/QualityPresetSelector`) is
the simulator's only tier decision: it feeds `<SceneSlot quality>`, and
HeroCarBody / VehicleRig / MirrorRig each call it directly. It cold-started on
a flat `"medium"`, so a phone requested the med plan — **5,950,303 B including a
1,596,163 B HDR** — instead of low's **725,950 B**. It now defers to
`seedQualityFromSignals` when nothing is stored: **−5.22 MB on a phone's first
visit**, which is when it matters.

**Fleet** — `suv_boxy_lux` (22,672 tris / 16 materials) leaves the tier-`low`
moving pool: **−~54k triangles and −16 draw calls** against budgets of 250k and
70. Picks fall back to the kolos, so the traffic population, ids, lanes and
speeds are unchanged and no bot-completion test moves.

**Phone numbers remain predictions.** Nothing above was measured on an A16;
these are desktop build-graph and byte measurements, which is all that can be
measured without the device.

---

### 2.6 What the frame ACTUALLY costs — counted, before and after, 2026-08-10

For months the project managed `world.stats.drawCallEstimate`: a static count of world mesh slots,
asserted `≤ 150` in ~50 district tests and — in `b65-street-furniture.test.ts`, under the title
„keeps every dressed street inside the tier-low draw budget" — asserted against
`PERF_BUDGETS.low.drawCalls`. Every one of those was green on every district. The running product
was then counted for the first time and every district sampled was over the hard cap.

A renderer row fixed two defects; this section is the **independent verification** of that row.
The instrument is a from-scratch raw WebGL counter (`draw*`, `bindFramebuffer` and `viewport`
wrapped in an `addInitScript`, frames delimited by an rAF chain registered before any page script)
driven from `/dev/drive-rig` at **1264 × 620, dpr 1**, seatbelt buckled, rolling at 20 km/h, 8-second
windows (426–508 whole frames per row). The statistic is the one `buildPerfReport` scores: the
**median over one-second windows of each window's mean**.

**The instrument checks itself twice.** Three.js's own `renderer.info.render` counters were
accumulated per frame in the same run through a `WebGLRenderer.render` wrap: on every one of the 30
runs below the two agree **to the digit** (e.g. pe-cane low L1 = 156.64 GL draws / 156.64 three
draws, 170,203 / 170,203 triangles). And the mirror render-target pass appears in **24.8–25.1 %** of
tier-low frames, **49.9 %** at med, and **49.8 % + 25.0 % + 25.0 %** at high — exactly
`MirrorRig`'s cadence constants, which is only possible if the frame boundaries are whole frames.

#### The table

BEFORE is the same rig in the same session with both fixes reversed on the live scene graph
(`frustumCulled = false` on every `InstancedMesh`; `forceSinglePass = false` on the ghost's
materials), minus the chunk grid's extra submissions, which are a build-time change that cannot be
undone at runtime and are therefore removed arithmetically —
`(chunkMeshes − chunkFamilies) × (1 + mirrorFrameFraction)`, exact for draws and zero for triangles.
That reconstruction lands within 1.5–2.6 % of the two prior instruments' file-restored baselines.

| district · tier · rung | draws before → after | vs 70 / 100 | triangles before → after | vs cap |
| --- | --- | --- | --- | --- |
| pe-cane-v1 low L1 | 185.7 → **156.6** (−15.7 %) | **FAIL** 1.57× hard | 239,852 → **170,203** (−29.0 %) | PASS |
| pe-cane-v1 low L3 | 138.2 → **129.7** (−6.1 %) | **FAIL** 1.30× hard | 108,522 → **104,588** | PASS |
| pe-cane-v1 med L1 | 332.9 → **279.4** (−16.1 %) | **FAIL** 1.12× hard | 415,059 → **275,553** (−33.6 %) | PASS |
| pe-cane-v1 high L1 | 373.0 → **303.8** (−18.5 %) | **WARN** 1.01× soft | 507,977 → **359,802** (−29.2 %) | PASS |
| d2-v1 low L1 | 256.6 → **233.5** (−9.0 %) | **FAIL** 2.34× hard | 1,764,900 → **1,228,234** (−30.4 %) | **FAIL** 4.1× |
| d2-v1 low L3 | 206.2 → **206.5** (+0.1 %) | **FAIL** 2.06× hard | 1,628,628 → **1,161,414** (−28.7 %) | **FAIL** |
| d2-v1 med L1 | 509.0 → **454.7** (−10.7 %) | **FAIL** 1.82× hard | 3,414,685 → **2,244,794** (−34.3 %) | **FAIL** |
| d2-v1 high L1 | — → **514.5** | **FAIL** 1.29× hard | — → **3,162,498** | **FAIL** |
| sp-creep-v1 low L1 | 208.2 → **183.7** (−11.7 %) | **FAIL** 1.84× hard | 308,562 → **241,420** (−21.8 %) | PASS |
| sp-creep-v1 med / high / L3 | — → **346.1 / 422.6 / 156.5** | **FAIL** all three | — → 353,339 / 568,216 / 175,428 | PASS |
| ov-crest-v1 low L1 | 220.0 → **192.6** (−12.4 %) | **FAIL** 1.93× hard | 575,331 → **505,776** (−12.1 %) | **FAIL** |
| hz-roadworks-v1 low L1 | 207.7 → **182.9** (−11.9 %) | **FAIL** 1.83× hard | 242,261 → **200,208** (−17.4 %) | PASS |
| mw-v1 low L1 | 151.2 → **123.1** (−18.6 %) | **FAIL** 1.23× hard | 231,712 → **161,801** (−30.2 %) | PASS |

**Say it plainly: the breach is REDUCED, not CLOSED.** Draw calls fell 6–19 % and triangles 12–34 %,
and **14 of 15 configurations still fail the draw-call budget** — the lightest district at the most
generous tier is the single WARN. The triangle budget is a different story: after the fix, tier-low
triangles PASS on five of the six scenario districts measured; the two that still fail
(`d2-v1` at 4.1× and `ov-crest-v1` at 2.0×) fail on content, not on the renderer.

#### Re-counted after the mirror cull — 16 configurations, a third instrument, 2026-08-11

The table above was taken before `scene/vitok/mirrorInstanceCull.ts` landed. The whole matrix was
then counted again, on a from-scratch instrument, over the **four districts × tier low and med ×
rung 1 and rung 3** the phone tier actually ships — 56 windows, 457–496 whole frames each, 0 page
errors — with BEFORE reconstructed on the live scene graph in a **fresh page load per window driven
by the same script from the same scripted start**, so before and after are the same station (all 16
pairs match to ≤ 0.2 m, recorded per window).

| district · tier · rung | draws before → after | vs budget | triangles before → after | vs budget |
| --- | --- | --- | --- | --- |
| pe-cane-v1 low L1 | 184.5 → **153.6** (−16.7 %) | **FAIL** 1.54× hard | 239,123 → **168,131** (−29.7 %) | PASS |
| d2-v1 low L1 | 249.6 → **214.0** (−14.3 %) | **FAIL** 2.14× hard | 1,763,150 → **1,137,300** (−35.5 %) | **FAIL** 3.79× hard |
| sp-creep-v1 low L1 | 203.5 → **172.0** (−15.5 %) | **FAIL** 1.72× hard | 307,408 → **230,334** (−25.1 %) | PASS |
| ov-crest-v1 low L1 | 215.5 → **182.7** (−15.2 %) | **FAIL** 1.83× hard | 573,528 → **490,142** (−14.5 %) | **FAIL** 1.63× hard |
| pe-cane-v1 low L3 | 135.1 → **126.4** (−6.4 %) | **FAIL** 1.26× hard | 108,314 → **102,587** (−5.3 %) | PASS |
| d2-v1 low L3 | 203.3 → **190.7** (−6.2 %) | **FAIL** 1.91× hard | 1,630,892 → **1,069,959** (−34.4 %) | **FAIL** 3.57× hard |
| sp-creep-v1 low L3 | 158.3 → **148.8** (−6.0 %) | **FAIL** 1.49× hard | 176,055 → **164,395** (−6.6 %) | PASS |
| ov-crest-v1 low L3 | 170.3 → **159.6** (−6.3 %) | **FAIL** 1.60× hard | 441,440 → **422,403** (−4.3 %) | **FAIL** 1.41× hard |
| pe-cane-v1 med L1 | 331.5 → **272.3** (−17.9 %) | **FAIL** 1.09× hard | 414,155 → **270,982** (−34.6 %) | PASS |
| d2-v1 med L1 | 500.0 → **422.0** (−15.6 %) | **FAIL** 1.69× hard | 3,411,185 → **2,038,711** (−40.2 %) | **FAIL** 2.27× hard |
| sp-creep-v1 med L1 | 425.0 → **362.1** (−14.8 %) | **FAIL** 1.45× hard | 582,846 → **428,179** (−26.5 %) | PASS |
| ov-crest-v1 med L1 | 454.0 → **391.4** (−13.8 %) | **FAIL** 1.57× hard | 1,148,989 → **926,050** (−19.4 %) | **FAIL** 1.03× hard |
| pe-cane-v1 med L3 | 232.9 → **217.6** (−6.6 %) | **WARN** 1.45× soft | 151,963 → **139,354** (−8.3 %) | PASS |
| d2-v1 med L3 | 409.5 → **375.5** (−8.3 %) | **FAIL** 1.50× hard | 3,146,684 → **1,905,078** (−39.5 %) | **FAIL** 2.12× hard |
| sp-creep-v1 med L3 | 334.7 → **315.9** (−5.6 %) | **FAIL** 1.26× hard | 320,140 → **297,037** (−7.2 %) | PASS |
| ov-crest-v1 med L3 | 363.5 → **344.9** (−5.1 %) | **FAIL** 1.38× hard | 884,813 → **792,614** (−10.4 %) | WARN 1.13× soft |

**0 of 16 pass the draw budget** (15 FAIL, 1 WARN — `pe-cane-v1` med L3 at 217.6 against a 250 hard
cap). **8 of 16 pass the triangle budget**, 1 WARN, 7 FAIL. Rung 3 is not rescued by the rung-1 aid
stack dropping: the lightest district at rung 3 on a phone still draws **126.4 calls against a
70-call budget**.

**The two counters agree.** The product's own `PerfProbe` (three's `gl.info.render`, `autoReset`
off) ran inside the same windows: worst disagreement **1.36 draw calls and 1.40 % of triangles**
across all 16, and on five of them the two agree to the digit. Eight of these rows overlap
`MEASURED_FRAMES` and all eight reproduce within 1.9 % / 1.6 % — `d2-v1` low L1 triangles measured
1,137,300 against a recorded 1,137,303 — so nothing in `frameCost.ts` was changed.

**Two instrument defects found and fixed before the numbers were believed, both worth stating:**

* **`ShaderMaterial` defaults `forceSinglePass` to TRUE** (`three/src/materials/ShaderMaterial.js:212`),
  so „every transparent DoubleSide material with `forceSinglePass === true`" is *not* „the materials
  `ShadowCar`'s fix set" — it also sweeps up 3 ShaderMaterials that are in the scene at rung 3, where
  there is no ghost at all. Measured by flipping only the excluded set: the first reconstruction
  over-charged the fix by **3.3–9.0 draws**, and every BEFORE above was re-measured rather than
  corrected on paper.
* **A teach card pauses the world while rAF and the raw GL counter keep advancing.** Two of the first
  three windows were vacuous and were refused by a fourth assertion — the car and the main camera
  must both have moved ≥ 30 m — not by inspection.

**The mirror, per entry, with the cull put back in the same session:** `d2-v1` low **83.0 → 20.1
draws and 492,716 → 130,430 triangles**, reproducing the row's own before column to the digit;
`ov-crest-v1` 73.7 → 33.0 / 327,862 → 226,242; `sp-creep-v1` 62.8 → 33.9; `pe-cane-v1` 41.0 → 27.0;
`d2-v1` med 84.0 → 20.1 / 571,468 → 161,133. Cadence unchanged at **25.0–25.2 % of frames at low and
49.9–50.1 % at med**. Whole-frame, the cull alone is −3.3 to −15.8 draws at low and −6.9 to −32.0 at
med, which is exactly the per-entry delta × the cadence.

**Nothing was removed, and the diff image was opened rather than described.** One page, one station,
the car at a standstill with the brake held, the framebuffer read back with `gl.readPixels`, the sim
clock asserted advancing around every capture. On `d2-v1`, two frames of the SAME state 900 ms apart
differ in **1.726 %** of pixels; flipping the mirror cull differs in **1.518 %**; flipping the whole
renderer wave differs in **0.473 %** — *both A/Bs move fewer pixels than the noise floor.* The
overlay paints every differing pixel magenta, and they are **the animated guidance ribbon and its
reflection in the mirror, and nothing else**: no tree-shaped hole, no missing signal head, no
building silhouette. Photographed from the driving seat, the glass shows road, lane, ribbon, a lit
building, five trees and the ridge, at a mean luminance of 122.55 against 122.58 with the cull off;
the positive control that hides every InstancedMesh for the pass has **no trees at all**.

#### Where the reduction came from, split by mechanism

Measured by ablating one mechanism at a time, tier low, level 1:

| | pe-cane-v1 | d2-v1 |
| --- | --- | --- |
| ghost drawn twice (`forceSinglePass`) | **−23.7 draws** · −65,806 tris | **−26.7 draws** · −67,188 tris |
| frustum culling + the 600 m prop grid | −2.9 draws · −3,836 tris | −56.6 draws · **−469,482 tris** |

On a scenario micro-map the whole win is the ghost: nothing is ever out of frustum on a 360 m
street. On the city map culling is where the triangles come from — and against the *unchunked*
pre-fix arrangement the grid costs about **+3 draw calls** for those 469k triangles. That trade is
the one thing in this row a founder should rule on (§ still-open).

#### The chase camera, measured — the census's guess was wrong

The one subsystem nobody had ever counted. Cockpit → chase (`KeyC`), same rig, same district:

| | draws | triangles |
| --- | --- | --- |
| pe-cane-v1 low L1 cockpit → chase | 156.6 → **119.3** | 170,203 → **224,488** |
| d2-v1 med L1 cockpit → chase | 454.7 → **410.8** | 2,244,794 → **2,218,059** |

Chase is **cheaper in draw calls, not more expensive** (the 56-draw cockpit is hidden; the hero
exterior that replaces it is one GLB), and costs +54k triangles on the light map. The estimate
this replaces was "plausibly +40 draws and +130k triangles". Frame-cost ceilings hold.

#### Where the frame goes, per pass (raw GL, framebuffer regions)

d2-v1, tier low: the main pass at 1264 × 619 is 212.4 draws / 1,105,058 triangles; the **rear-mirror
render target at 256 × 96 — 24,576 pixels, 3.1 % of the main framebuffer — was 83.0 draws and
492,716 triangles per entry** (156.0 / 1,286,132 before the culling fix). **It is now 20.0 draws and
128,996 triangles** — see „The mirror was not rendering distant world" below. At med, the shadow map at
1024² costs 84 draws on d2 (32.7 at 2048² on pe-cane), N8AO's transparency-aware mode re-renders
the transparent queue twice more at full resolution (51.0 + 42.0 draws), and bloom's mipmap chain is
~24 one-draw passes from 632 × 310 down to 5 × 3 and back.

#### The mirror was not rendering distant world — it was rendering the district

The obvious explanation for a postage stamp costing a third of the frame is that the pass has no
tight frustum. It has one: 14° vFOV / 36.3° hFOV, far plane 200 m against the main camera's 900.
Shortening it buys nothing — measured per mirror entry on d2-v1 at tier low, 8-second windows:

| mirror far plane | draws | triangles |
| --- | --- | --- |
| 200 (shipped) | 83.0 | 492,716 |
| 150 | 83.0 (0.0 %) | 492,716 (0.0 %) |
| 120 | 81.0 (−2.4 %) | 485,380 (−1.5 %) |
| 60 | 80.9 (−2.6 %) | 483,393 (−1.9 %) |

The cause is **granularity, not distance**. three culls an `InstancedMesh` against ONE bounding
sphere that unions every instance, and this world is built from district-spanning sets: measured
radii on d2-v1 are `traffic-parked-wheels` 1059 m (600 instances), `streetlight-housings` 1089 m
(280), `traffic-light-lens-glass` 810 m (117), each parked-car body ~1000 m. A sphere a kilometre
across intersects every frustum that contains the camera, at any far plane. Extracting the mirror
camera's own frustum planes and testing every instance against them on the live scene: of 417,783
static triangles submitted, **11,423 were inside the frustum — 97.3 % of the pass could not appear
in it**. `traffic-parked-wheels` alone sent 112,800 triangles for zero visible wheels.

`scene/vitok/mirrorInstanceCull.ts` therefore does the cull three cannot: keep an `InstancedMesh`
only if at least one INSTANCE touches the mirror frustum. Same conservative sphere test, one level
deeper, so nothing that could be seen is removed. Per mirror entry, same-session A/B (the shipped
cull, then the same camera rendered into the same target with exactly the meshes it hid put back):

| district, tier low L1 | draws | triangles |
| --- | --- | --- |
| d2-v1 | 83.0 → **20.0** (−75.9 %) | 492,716 → **128,996** (−73.8 %) |
| hz-roadworks-v1 | 97.2 → **42.9** (−55.9 %) | 172,994 → **76,950** (−55.5 %) |
| sp-creep-v1 | 85.9 → **37.1** (−56.8 %) | 176,991 → **88,883** (−49.8 %) |
| ov-crest-v1 | 75.6 → **36.1** (−52.2 %) | 329,412 → **250,081** (−24.1 %) |
| mw-v1 | 25.5 → **12.0** (−52.9 %) | 53,566 → **30,068** (−43.9 %) |
| pe-cane-v1 | 39.0 → **21.0** (−46.2 %) | 49,074 → **38,658** (−21.2 %) |
| d2-v1, **chase** rear-view window 384 × 160 | 85.0 → **23.7** (−72.1 %) | 548,334 → **204,618** (−62.7 %) |

The last row is `CameraRig`'s chase rear-view window — §3.2's founder item 44, the mirror he
actually drives with — which had the identical defect and gets the identical fix, as does the Q/E
door-mirror window.

**The glass is unchanged, and that is checked, not argued.** Reading the 256 × 96 target back twice
in the SAME frame at the SAME car pose — once as the product renders it, once with the 112 meshes
the cull hid put back — gives a byte-identical image: 0.00 % of channels differ by more than 8/255,
max 0. The positive control (hide all 123 instanced meshes) moves 4.27 % of channels, so the
instrument is not blind. Photographed from the driving seat, the glass still shows road, markings,
the guidance ribbon, trees and the ridge; mean luminance 130.0, σ 34.0, 0 % black pixels.

Cadence was **not** touched. The pass still enters 24.9–25.2 % of frames at tier low and 50.0 % at
med, so worst-case mirror staleness is unchanged.

#### What the gate does now, and what it still cannot do

`environment/frameCost.ts` owns the frame question and `scoreFrameDrawBudget` takes a nominal
`MeasuredFrame`. Verified against the shipped sources:

* `scoreFrameDrawBudget(world.stats.staticDrawSlots)` → **TS2345**, and so does a hand-written object
  literal that merely looks like a frame. `measuredFrame()` throws `NotAMeasurementError` on a
  missing instrument/surface/canvas/date, on a canvas that is not `w×h`, on 59 frames, and on a
  zero count.
* On all six measured districts the OLD comparison (`staticDrawSlots ≤ PERF_BUDGETS.low.drawCalls`)
  scores **pass** while the measured frame scores **fail** — the static number is 3.2×–4.0× off.
* The ceiling is a real bound, not decoration: measured frames sit **8.5 %–42.3 %** under it, and a
  frame one draw over is rejected by the same assertion `frameCost.test.ts` makes.
* **It cannot bind an unmeasured district.** The ceiling and the ratchet only cover the 6 districts
  in `MEASURED_FRAMES`; the other 99 are unchecked. And an author willing to write a false
  provenance gets a static number through `measuredFrame()` — the guard stops an accident, not a
  lie.

#### The line that has to be re-derived

`COCKPIT_DRAWS = 56`, measured identically in every district. That is **80 % of the whole tier-low
frame budget** before one metre of road is drawn, in a product whose thesis (ADR-005) is that the
cockpit is the thing you sit in. `docs/simulation/quality-gap/13_webgl_perf_budget.md` §2 — the
allocation table §2.2 cites — gives the hero car **30–50 draws inside a 150-draw LAPTOP frame**, and
makes per-instance frustum culling a *precondition* that was never implemented until this row.
Nothing here edits `PERF_BUDGETS`: re-deriving §2.2's draw line is a founder call.

**Still no frame time, anywhere.** Every number above is headless chromium on ANGLE/D3D11 with
SwiftShader available. Draw and triangle counts are scene-graph properties and transfer between
machines; milliseconds do not. §2.4's Galaxy A16 gate is still open and nothing here closes it.

### 2.7 The hero car's LOD and the parapet — counted again, 2026-08-11

§2.6 counted the frame before the hero car was decimated. `hero_car.glb` has since gone from
**65,434 to 11,220 scene triangles (−82.9 %)**, and a second lane proposed swapping the pavement
parapet for a "3.3× cheaper" railing. This section measures both **through the shipped code path,
with nothing in the working tree edited**: each asset is fulfilled from a buffer by
`page.route()` per browser context, so BEFORE and AFTER are the same server, the same build, the
same station and the same canvas, and the only difference is the bytes.

**BEFORE is `git show HEAD:…/hero_car.glb`, served the same way as AFTER** — both arms go through
route fulfilment, so neither side gets a different loader path. All 32 windows: 1264 × 620 dpr 1,
seatbelt buckled, rolling at 20 km/h, 8-second windows, **413–499 whole frames each, 0 page errors,
0 windows rejected**. Four liveness assertions per window (rAF, raw GL draws, the **sim clock**, and
the car's own displacement); the 16 station pairs match to **≤ 0.1 m**.

#### Draws and triangles, all 16 configurations

Verdicts are `PERF_BUDGETS`: tier low 70 soft / 100 hard draws, 250k / 300k triangles; tier med
150 / 250 and 700k / 900k.

| district · tier · rung | draws before → after | draws verdict | triangles before → after | Δ | triangles verdict |
| --- | --- | --- | --- | --- | --- |
| pe-cane-v1 low L1 | 153.8 → **153.5** | FAIL 1.54× hard | 168,167 → **114,402** | **−53,765 (−32.0 %)** | PASS 0.38× |
| pe-cane-v1 low L3 | 126.4 → **126.3** | FAIL 1.26× | 102,587 → **102,470** | −116 | PASS 0.34× |
| pe-cane-v1 med L1 | 272.3 → **272.3** | FAIL 1.09× | 271,045 → **162,617** | **−108,428 (−40.0 %)** | PASS 0.18× |
| pe-cane-v1 med L3 | 218.0 → **218.0** | WARN 0.87× | 140,075 → **140,075** | 0 | PASS 0.16× |
| d2-v1 low L1 | 214.0 → **214.0** | FAIL 2.14× | 1,137,300 → **1,083,086** | −54,214 (−4.8 %) | FAIL **3.61×** |
| d2-v1 low L3 | 190.8 → **190.8** | FAIL 1.91× | 1,070,484 → **1,070,484** | 0 | FAIL **3.57×** |
| d2-v1 med L1 | 422.0 → **422.0** | FAIL 1.69× | 2,038,711 → **1,930,283** | −108,428 (−5.3 %) | FAIL **2.14×** |
| d2-v1 med L3 | 375.5 → **375.5** | FAIL 1.50× | 1,905,078 → **1,905,078** | 0 | FAIL **2.12×** |
| sp-creep-v1 low L1 | 173.7 → **174.1** | FAIL 1.74× | 230,619 → **176,405** | **−54,214 (−23.5 %)** | PASS 0.59× |
| sp-creep-v1 low L3 | 148.9 → **148.9** | FAIL 1.49× | 164,721 → **164,699** | −22 | PASS 0.55× |
| sp-creep-v1 med L1 | 364.1 → **365.6** | FAIL 1.46× | 428,830 → **320,449** | **−108,381 (−25.3 %)** | PASS 0.36× |
| sp-creep-v1 med L3 | 316.1 → **315.9** | FAIL 1.26× | 297,146 → **297,036** | −110 | PASS 0.33× |
| ov-crest-v1 low L1 | 182.6 → **182.4** | FAIL 1.82× | 487,766 → **433,633** | **−54,134 (−11.1 %)** | FAIL **1.45×** |
| ov-crest-v1 low L3 | 159.2 → **159.3** | FAIL 1.59× | 421,381 → **422,385** | +1,004 | FAIL **1.41×** |
| ov-crest-v1 med L1 | 391.4 → **391.8** | FAIL 1.57× | 925,923 → **819,529** | **−106,394 (−11.5 %)** | **FAIL → WARN** 0.91× |
| ov-crest-v1 med L3 | 344.9 → **344.9** | FAIL 1.38× | 792,560 → **792,511** | −48 | WARN 0.88× |

**REDUCED, NOT CLOSED — and only on half the matrix.** Draw calls did not move anywhere (the whole
16-configuration range is **−0.3 to +1.5**) and never could: decimation removes triangles from a
submission, not submissions. **0 of 16 pass the draw budget, exactly as before (15 FAIL, 1 WARN).**
Triangles went from 8 PASS / 1 WARN / 7 FAIL to **8 PASS / 2 WARN / 6 FAIL** — **exactly one
verdict in the whole matrix moved**, `ov-crest-v1 med L1` from FAIL to WARN.

#### The eight rung-3 rows are a negative control, and they behaved

`HeroCarBody` renders inside `<group visible={!cockpitView}>`, so **from the driving seat the
player's own shell is never submitted**; at rung 1 the 65,434 triangles in frame are the ShadowCar
**ghost**, which loads the same GLB. At rung 3 there is no ghost and no shell — the census reads
**0 hero triangles visible in both arms** — so an 82.9 % cheaper car must buy exactly nothing. It
does: the eight rung-3 deltas are **0, 0, 0, −22, −48, −110, −116 and +1,004 triangles**, all inside
session drift. **A wave that reported a saving there would have been measuring its own noise.**

The saving is therefore ~54,200 triangles per rung-1 frame at tier low and ~108,400 at tier med —
the doubling is the mirror pass, which carries the hero at med.

#### Two counters, and they agree

Counter A is a from-scratch raw WebGL wrapper; counter B is the product's own `PerfProbe`
(`gl.info.render`, `?simPerf=1`) — different author, different arithmetic, same frame. **Worst
disagreement across all 16 configurations: 1.21 draw calls and 1.37 % of triangles.** All four
`d2-v1` configurations agree **to the digit** on both metrics. The instrument also reproduces
numbers it never saw: §2.6's independently-recorded `d2-v1` low L1 (1,137,300) and the committed
`MEASURED_FRAMES` rows for `d2-v1` low L3 (190.8 / 1,070,484) and med L1 (422.0 / 1,930,283) come
back **exact**, and `pe-cane-v1` low L1 before-LOD lands on §2.6's 168,131 at **168,167 (0.02 %)**.

#### It still looks right from the seat — photographed, with both controls

DOM hidden, canvas-clipped, same spawn, `pe-cane-v1` tier low.

| comparison | pixels differing > 8/255 | mean channel Δ |
| --- | --- | --- |
| cockpit, **the change** (stock → shipped) | **1.752 %** | 0.291 |
| cockpit, **noise floor** (same car photographed twice) | **2.154 %** | 0.403 |
| cockpit, **positive control** (hero + interior hidden) | **32.733 %** | 25.771 |
| cockpit **rung 3**, the change | **0.005 %** | 0.003 |
| chase cropped to the car, the change | 3.605 % | 0.868 |
| chase cropped to the car, noise floor | 1.324 % | 0.241 |
| chase cropped to the car, positive control | 68.137 % | 55.014 |

**From the seat the change is smaller than the frame's own noise, and the difference image says
why.** Opened and read rather than summarised: the differing pixels are almost entirely the
**level-1 guidance ribbon** — big blue chevrons down the centre of the road — plus the green lane
guide. Those same chevrons appear, in the same places and at the same strength, in the **noise-floor
control where nothing was changed at all**, because the ribbon animates between shutter releases.
What is left that is genuinely the car is **a few pixels at the vanishing point**, where the
demonstration ghost sits ~50 m ahead. The dashboard, wheel, binnacle, A-pillar, mirror and
windscreen frame are **pure white in the diff — bit-identical**. The positive control turns that
entire cockpit solid blue, so the instrument is demonstrably not blind to the thing it reported
unchanged.

**From the chase camera the car does change, faintly.** At 3× the difference is a **one-pixel dotted
trace around the silhouette** (sub-pixel movement, not a shape change) and **mottled specular
banding across the lower boot lid and rear bumper**. Tail bar, mirrors, wheels, roofline and
silhouette read as identical. This is the only camera in the product that ever sees the shell —
cockpit hides it, the marketing hero orbits at 10.5–13.5 m, top-down is at 110 m — and at 6.0 m it
is the closest any of them gets, which is why one LOD is the whole requirement.

#### The parapet: the two railings are the same fence at different lengths

Both GLBs were Draco-decoded rather than compared by triangle total:

| asset | span | triangles | **per metre** |
| --- | --- | --- | --- |
| `railing_run_6m.glb` (ships) | 6.055 m | 672 | **111.0 /m** |
| `railing_segment.glb` ("cheap") | 2.000 m | 204 | **102.0 /m** |

**The "3.3× cheaper" is 672 ÷ 204 — a 6-metre panel against a 2-metre panel.** Per metre of fence
the cheap railing is **8.1 % cheaper**, same height, same depth. There is no cheap railing in this
repo, so there are two different swaps and only one of them yields the headline number: **TILED**
(3 × segment end to end, 612 tris/panel, balusters keep their 0.143 m pitch) and **STRETCHED**
(1 × segment scaled 3.03×, 204 tris/panel, baluster pitch 0.143 → **0.432 m** and width ×3.03 —
precisely the stretched-baluster tell `world/types.ts:616-618` warns about).

Measured on `ov-crest-v1`, rung 1, 83 parapet panels, each variant expressed as node transforms on
the real segment mesh so `bakeVertexColored()` bakes it exactly as it bakes the shipped panel:

| tier | railing | draws | triangles | Δ vs shipped | verdict |
| --- | --- | --- | --- | --- | --- |
| low | ships today (672) | 182.6 | 433,784 | — | FAIL 1.83× draws / FAIL **1.45×** tris |
| low | tiled (612) | 182.5 | 426,418 | −7,365 | FAIL 1.83× / FAIL **1.42×** |
| low | stretched (204) | 182.7 | 385,722 | **−48,061** | FAIL 1.83× / FAIL **1.29×** |
| med | ships today (672) | 391.1 | 815,696 | — | FAIL 1.56× / WARN 0.91× |
| med | tiled (612) | 391.1 | 808,158 | −7,537 | FAIL 1.56× / WARN 0.90× |
| med | stretched (204) | 391.5 | 759,739 | **−55,957** | FAIL 1.57× / WARN 0.84× |

**The swap changes no verdict anywhere.** Draws cannot move — the parapet is ONE `InstancedMesh`
costing ~1.2 draws — and at tier low even the stretched swap leaves **385,722 triangles against a
300,000 hard cap (1.29×)**. At med, triangles were already WARN *because the hero LOD had landed*,
so the railing has nothing left to flip. The internal control is exact: hiding the parapet gives
**369,504 / 369,704 / 369,504** triangles across the three arms, so the runs differed only in the
railing.

**And the cheap one is visibly worse.** Photographed at two stations, same seat, same canvas
(1264 × 619, poses reproduced to 2 cm): the **tiled** swap is indistinguishable from what ships; the
**stretched** swap reads as a different, cheaper object at both distances — chunky posts at three
times the spacing that you see straight through, a Bulgarian парапет traded for a ranch rail. It
buys ~11 % of a tier-low frame and still leaves the district at 1.29× the cap.

**The lever on this district is not the fence.** An object-attributed census of the same frames puts
the procedural **parked-car row at 35.8 % of tier-low triangles (177,805, 38.6 draws)** and **trees
at 18.9 %** against the parapet's 13.8 % — on an извънградски път with a 90 km/h limit. That is a
content question before it is a rendering one, and it is untouched.

**Still no frame time.** As §2.6: draw and triangle counts are scene-graph properties and transfer
between machines; milliseconds do not.

---

## 3. THE VISUAL PLAN

Ranked by **visual impact per hour**. Everything here is €0 in licences, CC0-only, buildable by one founder with Blender and the existing `tools/glb/optimize.mjs` pipeline.

### 3.1 Reference targets — look at these and judge

| Target | What it proves | Link |
| --- | --- | --- |
| **Slow Roads** (`slowroads.io`) | **This is your "yes, that level".** One solo dev, plain JS + Three.js + WebGL, runs on phones. Its documented techniques — tiled heightmap, bézier road refinement, geometry merging, instancing, object pooling, quality settings — are all things **your codebase already does**. Its entire edge over you is *art direction*. | [dev writeup](https://anslo.medium.com/slow-roads-tl-dr-a664ac6bce40) |
| **PlayCanvas / Arm "Seemore"** | "Console quality graphics on mobile" in a browser, achieved with Basis compression + **baked lightmaps** + prefiltered cubemaps. You already ship KTX2/Basis and IBL. Lightmaps are the one leg missing. | [making-of](https://blog.playcanvas.com/the-making-of-seemore-webgl/) |
| **three.js WebGPU examples** (SSGI / SSR / TRAA) | The honest picture of what a WebGPU migration would buy — and the source is already on disk at `platform/node_modules/three/examples/jsm/tsl/display/`. Prototype before you ever consider migrating. | [WebGPURenderer docs](https://threejs.org/docs/pages/WebGPURenderer.html) |
| **The anti-target: DVSA hazard perception & driving-tests.org** | The driving-education category ships **pre-rendered video**. The official UK hazard test is CGI clips; the leading US "driving simulator" is explicitly *"live-action videos (not animation)"*. **Your realtime, seeded, rule-engine-scored 3D already exceeds the global category standard.** You are competing with video players, not Forza. | [driving-tests.org](https://driving-tests.org/driving-simulator/), [CGI HPT](https://hazardperceptiontest.net/cgi-hazard-perception-test/) |

### 3.2 The ranked list

| # | Item | h | Impact/h | Verdict |
| --- | --- | --- | --- | --- |
| V1 | **Markings fix** — add `receiveShadow`, give the mesh the asphalt normal+roughness at world-scale UVs, erode edges with the existing macro noise (`alphaTest 0.35`) | 3 | ★★★★★ | **do first** |
| V2 | **Two-octave FBM cloud layer** in the existing `SkyDome.tsx` fragment shader — domain-warped cover, horizon compression, sun-side silver lining, 3 new uniforms damped like the current ones. One draw call, no textures. | 6 | ★★★★★ | **do first** |
| V3 | **Vitosha ridge** — a smoothstep ridge term inside the same shader, biased to the south azimuth, layered *under* the fog wash. Gate off on poligon/lot maps. | 5 | ★★★★★ | **do first** |
| V4 | **Turn the world back on** — `ROAD_DECAL_SPACING_M` 40 → 10; `ROAD_DECAL_END_INSET_M` 6 → ~1.5 so wear enters junctions; `SCENARIO_DEFAULT_TRAFFIC` 0/0 → ~6/4 **per template, not globally**; district default 10/8 → ~25/18; lift the baked wheel-track vertex-colour wear. | 7 | ★★★★★ | recommended |
| V5 | **Road surface pass** — swap Asphalt031 for Poly Haven `asphalt_02` (CC0, 3 m real-world scale, coarse aggregate + tar cracks); darken the road tint so it separates from the concrete pavement; add a **UDN-blended detail normal at ~8× UV reusing the same normal map** (zero new downloads); halve `ASPHALT_UV_SCALE` (1/7 → ~1/3.5) and add a **2-tap rotated-UV blend inside the `macroVariation` hook** to kill the resulting repetition. `pbrTextures.ts` computes repeat from `realWorldSizeM`, so the swap is data-only and cannot break scale. Gate the detail normal off at `low` (no normal maps fetched there). | 10 | ★★★★☆ | recommended |
| V6 | **Fleet upgrade** — do **not** remodel. Edit `tools/blender/vehicles_v2.py`: `build_wheel` seg 12 → 20–24, real tyre sidewall (torus section, not a disc), recessed rim face, separate glass with A/B/C pillars, subtle body bevel. Then one shared 1024² colour+normal+ORM atlas: tinted glass, plates, lamp lenses, panel-gap lines, tyre sidewall+tread. Re-run headless through `optimize.mjs`. **Zero extra draw calls** — the atlas folds into the existing instanced merge. | 16 | ★★★★☆ | recommended |
| V7 | **Populate the empty worlds (buildings as DATA)** — a generator that stamps panelka footprint rings along road setbacks into the world JSONs (`d2-v1.json` first), then hand-tune the ~20 maps students see most. **No modelling:** `buildings.ts` already extrudes and textures any footprint ring, and the 16-model KTX2 tower kit exists. Budget ~8 h of the 34 for re-running the sight-line test batteries — `jx-equal-districts.test.ts:113` asserts every building vertex clears both sight triangles. | 34 | ★★★★☆ | recommended |
| V8 | **Building silhouette pass** — parapet lip in the prism builder (~2 h of the 11, and does most of the work), a small instanced roof-clutter pass (lift housing / water tank / dish), balcony recesses baked into the facade normal. Kills the "cardboard box against the sky" read. Only after V7. | 11 | ★★★☆☆ | viable |
| V9 | **Sofia facade sets** in `tools/blender/facade_gen.mjs` — a socialist-era панелка (precast joints, glazed-in loggias, AC units, dishes), a neoclassical mid-rise, and a ground-floor retail trim strip with **generic** Cyrillic signage (ADR-001). The current five sets are all Dubai/Shanghai glass towers, which is why the district kit reads as a generic CBD. | 14 | ★★★☆☆ | viable |
| V10 | **Hero car rebuild** — abandon the voxel remesh; loft from profile curves per `67_HERO_VEHICLE_SPEC`. Three tells to fix: panel gaps (door shutlines, hood, trunk, filler), a real wheel (sidewall + shoulder radius, rim barrel and dish, brake disc + caliper *behind* the spokes rather than a red box at 12 o'clock), and separate single-sided glass shells with pillar geometry + an inner wheelhouse so the arches stop being zero-thickness holes. Preserve the `wheel_FL/FR/RL/RR` rig contract and the 120–150k LOD2 ceiling. | 20 | ★★★☆☆ | post-launch |
| V11 | **Offline baked AO + sun-shadow lightmaps, generated in Node at build time** — your unusual advantage: `buildWorldGeometry.ts` is a **pure deterministic Node function** ("no three.js, no DOM: runs identically in the browser and in vitest/node"), so you can bake all ~90 districts in CI with **no .blend file**. xatlas-web for UV2, three-mesh-bvh for the raycast, KTX2 out, bound as `lightMap` on the merged static meshes. Keep dynamic shadows for car + traffic only. Lets you turn N8AO **off** at `med` — ~1 ms/frame back on exactly the hardware you target. Keep atlases at 256²–512² per district or it eats the download tier. | 45 | ★★★☆☆ | post-launch |
| V12 | **Sofia landmark backdrops** — a handful of hard-decimated photogrammetry meshes as far-field skyline dressing only. Cheap emotional hit ("that's my city"). Watch signage/faces for ADR-001/004. Texture budget is already at 86% of its 5.2 MB ceiling. | 30 | ★★☆☆☆ | optional |
| — | **Bug: the rear-view mirror is a solid black rectangle** in the only shipped cockpit clip (`public/clips/sc-vp-readiness__m0.k2.webp`), despite `MirrorRig.tsx` having a real 256×96 render target. A black mirror in the driver's eyeline is the most "unfinished" thing in the product. **Re-verified 2026-07-26** against the WebP (the PNG master was pruned per §8): still black. | 0.5 | — | **fix immediately** |
| — | **Bookkeeping: `shanghai_riverside_1k.hdr` is shipping undocumented.** `LessonScene.tsx:944` loads it; `public/sim/LICENSES.md:13-18` lists only `sky_clear_1k.hdr` (unused) and `sky_urban_1k.hdr`. It *is* genuine Poly Haven CC0 — no legal exposure — but the licence register being wrong is exactly the bookkeeping that saved you from the Marlin pack. **2026-07-26: done** — register rewritten, and the unused HDRI is gone (§8). | 0.25 | — | **done** |

### 3.3 The one dial to leave alone (for now)

**`PERCEPTUAL_ROAD_SCALE = 2.5` is arguably the deepest cause of the toy-car feel — and you should not touch it yet.**
It was a founder-ratified readability call (2026-07-10) for small screens, and dozens of tests pin **absolute** lane coordinates derived from it (`ln-district.test.ts:25-26` pins x = 4.06 / 12.19; `d2-district.test.ts:69`, `specs.test.ts:10`, `poligon-lesson.test.ts:213`, five `pk-*` district suites, and more). Every grading tolerance, traffic-AI offset, paint position and detector geometry derives from it. Changing it will misfire the rule engine.

**Re-evaluate after V7.** A populated street may make 2.5× read fine — and then you have saved ~16 risky hours. If you do revisit it, scale `SIDEWALK_WIDTH_M` with it; the broken canyon ratio (2.5:1 instead of ~1:1) is doing as much damage as the lane width itself.

---

## 4. THE FEEL PLAN

The physics, camera and audio here are already stronger than most browser driving sims. The gap is not tyre-model fidelity — it is **three missing feedback channels**.

### 4.1 What is already right (and must be protected)

- **The grip ceiling is correct and CI-locked.** μ 1.4 front / 1.5 rear caps lateral accel at ~13–14 m/s²; the harness pins 90 km/h → stop in 30–38 m at 0.80–1.15 g with 1–6° nose dive (`vehicle/tuning.ts:134-136`, `vehicle/harness.test.ts:165,191-196`). For an educational sim, the ceiling is the only tyre property that matters.
- **The camera is at the top of the safe band already**: 75.4° hFOV held constant across aspect ratios, 5° down-pitch, damped eye position (25/s) and orientation (16/s), 0.045 m lean per lateral g, ~3°/g roll, ~2°/g pitch, 5° yaw into the turn (`tuning.ts:485-553`, `CameraRig.tsx:392-489`). Increasing head motion buys immersion and costs nausea in a 17-year-old on a laptop.
- **`COCKPIT_FOV_MAX = 56` is a hard grading contract, not a preference** (`tuning.ts:471-478`). Above it, distance compression corrupts the 10–30 m judgements the rule engine grades (following gaps, stop lines). **The classic racing-game "widen FOV to fake speed" trick is off the table here.**
- **The audio design is research-correct.** The engine bus is lowpassed at 420 Hz while the tyre/road layer sweeps 300 Hz → 2 kHz and carries the speed cue (`scene/simAudio.ts:328`, `:107-110`). The literature agrees: removing frequencies below 600 Hz *improves* speed estimation ([PMC11446104](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446104/)). **Do not "beef up" the engine to sell speed.**
- **Keyboard input is already three-stage**, not binary: per-mode exponential low-pass (τ 0.25/0.15/0.06 s), 3.2 rad/s wheel rate limit, speed-sensitive lock 0.6 → 0.14 rad, ramped throttle/brake (`vehicle/difficulty.ts:74-96,300-310`). Touch is position-as-pressure pedals + an expo drag slider, and tilt steering was correctly rejected (iOS permission prompt, landscape lock, non-determinism for the rule engine). **No input work is needed.**

### 4.2 The three missing channels

| # | Item | h | Why it matters |
| --- | --- | --- | --- |
| F1 | **Grip-loss feedback** — expose `gripUtilisation` on VehicleSim (`|aLatSmooth| / (μ·9.81·gripFactor)`, plus a longitudinal term); add a 13th `simAudio` layer: filtered-noise scrub from ~0.85 utilisation rising to a real screech above 1.0; add a small HUD tyre-grip arc **for the muted-phone case**; optionally a skid decal. Feed the same signal into the debrief as a rule-engine *fact*. | 8 | **The highest north-star value in this section.** The sim currently grades students on grip-limited driving while giving them **zero sensory evidence that grip is running out**. On the ice/aquaplane lessons (grip 0.15, braking ×5.5) the car simply stops answering and the student gets no explanation. `simAudio.ts:10` explicitly documents the brake layer as "NOT a squeal", and a repo-wide grep for `screech\|skid\|squeal\|slipAngle` returns only comments. The quantity needed is **already computed every physics step and thrown away** (`VehicleSim.ts:203`). Keep it reading as tyre protest, not a racing game. |
| F2 | **Road-surface vertical motion** — do **not** displace road geometry (it breaks colliders, markings, decals, builders). Apply a small per-wheel vertical impulse derived from 2-octave value noise sampled at the **wheel's world position** (deterministic from position → replays and CI baselines stay reproducible), scaled by speed and per-surface roughness. Separately add 3–5 real *легнал полицай* humps as geometry near schools. | 10 | `ROAD_Y` is a single constant (`world/builders/constants.ts:18`) — the carriageway is a perfectly flat plane, so the carefully tuned suspension (1.62 Hz, ζ 0.37/0.61, anti-roll bars, `COCKPIT_DAMPING 25`) **never moves in a straight line**. This is why the car reads as a camera on rails rather than 1220 kg. It also feeds free camera micro-shake that reads as speed without touching FOV. Target **sub-centimetre** wheel displacement at city speed; overdoing amplitude causes sim sickness. Gate it additively (roughness 0 = bit-identical) so existing baselines stay green, then re-baseline. |
| F3 | **Engine braking** — a selector- and gear-dependent coast decel in `VehicleSim.update()`: ~0.6–1.0 m/s² in a low manual gear tapering to ~0.3 in top; zero in N/P and zero with clutch down. All state is already in `DrivelinePhysicsInput`. | 4 | Today, lifting off applies only `ROLLING_RESISTANCE_N = 280` (0.23 m/s²) + aero ≈ 0.30–0.45 m/s² total (`tuning.ts:282`, `VehicleSim.ts:392-396`). **Coasting in N and lifting off in D decelerate identically.** Real lift-off-in-gear is 0–1 m/s². "Lift off and the car slows", gear choice on descents, and clutch-down coasting are theory-only right now. Keep it well below the service brake so it never masks a graded braking mistake. |

### 4.3 Two cheap extras

- **F4 — near-field optic flow (folded into V5).** `ASPHALT_UV_SCALE = 1/7` (`world/builders/roads.ts:48`) means the road tiles every 7 m; at 50 km/h that is only ~2 Hz of visible flow. Halving it roughly doubles the flow rate at zero fragment cost — and near-field flow is the one speed cue that does **not** distort the distance judgements the rule engine grades.
- **F5 — haptics, three discrete events only** (3 h). `navigator.vibrate` on curb strike (20 ms), collision (pattern scaled by the `impactKmh` already computed at `VehicleRig.tsx:493`), and threshold-braking onset. ~76.7% of Bulgarian mobile users are Android; `navigator.vibrate` is **unsupported on Safari iOS at every version** ([caniuse](https://caniuse.com/mdn-api_navigator_vibrate), [BG vendor share](https://gs.statcounter.com/os-market-share/mobile/bulgaria)). No amplitude control → no continuous rumble, ever. **It must always be redundant with a visual or audio cue — a quarter of your phone users will never feel it, so it can never carry information alone.**

### 4.4 One free pedagogical win

Removing auditory feedback makes drivers **underestimate speed and over-produce it by ~3.2 km/h**; visual-only simulators over-produce speed by **~10%** ([Frontiers 2024](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1391271/xml/nlm), [Ergonomics/ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0141938207000236)).

**A muted session teaches a systematically faster car than the student will actually drive.** Treat audio as pedagogy: a one-line „звукът е част от урока" prompt at the existing unlock gesture (`LessonScene.tsx:834`). **1 hour.**

### 4.5 Explicitly rejected

- **A real tyre model (Pacejka / brush forces on a raw rigid body) — ~90 h. No.** Rapier's JS `DynamicRayCastVehicleController` exposes only `setWheelFrictionSlip` and `setWheelSideFrictionStiffness` — [no slip curve, no slip angle, no longitudinal slip, no rollInfluence](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html). "Better tyres" is therefore not an upgrade, it is abandoning the vehicle controller. It would invalidate `sim-harness.mjs`, `harness.test.ts`, `wet-grip`, `surface-grip`, `crosswind`, `parking-envelope` and risk regressing 150 scenario templates — in exchange for handling nuance a 17-year-old learning to stop at a stop line will never perceive. Pacejka also diverges at low speed, exactly the 0–10 km/h parking band this product cares most about.
- **Motion blur / velocity buffer — 12 h. No.** The composer is not even mounted at tier `low`, so the students who most need the speed cue are the ones who would never get it — and blur degrades the near-field detail and the markings/signs the student is being graded on reading.

---

## 5. GENUINE INNOVATION

> This is the section that answers *"innovative"*. §3 only answers *"prettier"*.

### 5.1 The uncomfortable evidence

| Intervention | Evidence | Verdict |
| --- | --- | --- |
| Driver education generally | Cochrane (Ker et al. 2005, ~300,000 participants): pooled **RR 0.98, 95% CI 0.96–1.01** — [source](https://www.cochrane.org/CD003734/INJ_strong-evidence-that-advanced-and-remedial-driver-education-does-not-reduce-road-traffic-crashes-or-injuries) | **null** |
| Novice-driver simulator training | 2024 systematic review: low-confidence evidence, **no established crash transfer** — [source](https://www.sciencedirect.com/science/article/pii/S0022437524000975) | **null** |
| Hazard perception | UK introduced the HPT in 2002; Wells et al. 2008 Cohort II: **11.3% fewer non-low-speed collisions** | **positive** |
| Hazard **prediction** (clip stops *before* the incident) | Discriminates crash-involved drivers **better** than reaction-time HP; MCQ format as valid as free-response — [Crundall 2018](https://www.sciencedirect.com/science/article/abs/pii/S0925753518301188), [2019](https://www.sciencedirect.com/science/article/abs/pii/S1369847819308010); Horswill 2021 RCT (PMID 33497854): improved HP response time, prediction scores, **and longer following distances** | **positive** |
| Self-assessment calibration ("insight training") | Gregersen 1996 on overestimation; Mynttinen 2009 — only ~50% (FI) and 25–35% (SE) of candidates self-assess realistically; Horrey 2015 framework | **positive** |
| Commentary driving | Crundall 2010: faster hazard responsiveness in a simulator | **positive** |
| Attention/scan training (RAPT) | Evaluated on 5,251 16–18-year-olds ([NHTSA 812235](https://www.nhtsa.gov/sites/nhtsa.dot.gov/files/812235-awarenessperceptiontrainingnoviceteendrivers.pdf)) | positive, but expensive here |

**Read that table again.** The axis the founder's instinct points at (realism) has a null result. The axes nobody in this market is building have positive results. **Prettier buys credibility and conversion. Mechanics buy the moat and the north star.**

### 5.2 The assets nobody else has

1. **Deterministic recorded student drives.** `SimAttemptTrace` is gzip-coded, retention-managed, ownership-scoped, ~11 KB for a 60 s drill / ~19 KB for a 300 s attempt — **and the store is write-only.** `AttemptTraceStore` declares `save/list/load`, but `getAttemptTraceStore()` has exactly **two call sites in the whole app, both `.save(...)`** (verified: `app/(dashboard)/simulator/actions.ts:47, :223`). There is no `.load(` caller anywhere.
2. **Engine-computed fault timestamps.** `clipPlan.generated.ts` carries `faultTimeSec: 21.23` — *computed by the rule engine* (doc-66 R3), never guessed from annotations. The clip trimmer cuts `[fault−8 s, fault+4 s]` (`modules/clips/capture/trim.ts:26-28`).
3. **A 58-entry law-cited rule catalog** (52 violations + 6 commendations — note `tutor/retrieval.ts:20` still says "46", which is stale). Every entry carries `severityClass`, official points, `titleBg`, `explanationBg`, a **required** `correctiveBg`, a `lawRef` and often a `conceptId`.
4. **Two ghosts already mounting simultaneously on independent clocks** inside the live scene (`LessonScene.tsx:1127-1141`), with `TraceKind = "shadow" | "mistake" | "attempt"` and per-kind tinting already in `ShadowCar.tsx:162`.
5. **310 committed mistake traces, only 42 rendered clips** — 268 unrendered at a measured **~58 s/clip** (`docs/development/69_HEADLESS_CLIP_PRODUCTION.md:52`) = **~4.3 hours of unattended GPU time** for the entire remaining library.
6. **An objective official-format score** to be wrong about: 10/3/1 penalty points, ≤9 to pass (`modules/sim/rules/scoring.ts`).
7. **A tutor module that is already ADR-002-clean and ~70% built** (`modules/tutor/service.ts:86-211`): burst limit → daily cap → global spend kill-switch → retrieval over *our* corpora → grounded prompt → cost booking → citation whitelist. `prompt.ts:74-76` hard-forbids law-from-memory; `extractCitations` (`:102-118`) drops any marker not in the injected `lawRefs`.

### 5.3 The five mechanics, ranked by evidence per hour

| # | Mechanic | h | Why it is uncopyable |
| --- | --- | --- | --- |
| **I1** | **„Позна ли се?" — predict-your-score calibration gate.** Before the debrief unlocks: *how many penalty points do you think you made? did you pass?* Reveal the engine's answer; track calibration error (predicted − actual) as its own trend. Two Int columns, a server action, a gate on the existing SessionEndScreen, a chart. **No 3D, no LLM, no tokens.** | **6** | **Highest evidence-per-hour in the entire product.** Novice overconfidence is a documented crash mechanism and only 25–50% of candidates self-assess realistically. Possible only because you have an *objective official-format score* to be wrong about — a video course has nothing to calibrate against. **Prerequisite: close audit H-5/H-6 (engine punishing correct driving) first, or the calibration error measures the engine's unfairness instead of the student's overconfidence.** |
| **I2** | **„Твоят дубъл" — in-browser replay of the student's own stored drive.** A route that reads the already-persisted trace via `.list()/.load()`, mounts `ShadowCar` with the yellow `attempt` identity on a shared `TraceClock`, drops ground markers at the engine's fault positions from the stored session events, and drives the existing `TraceTimeline` for scrub / 0.25× / loop. | **12** | Unlocks an asset **you already pay to store and have never shown anyone**. The codec, retention, ownership-scoped read, ghost renderer and timeline are all written and tested — this is a missing read path plus a screen. Serves the north star through error-confrontation: the student watches the exact moment from outside the car at quarter speed with the catalog's `correctiveBg` attached. *Honesty note:* the 5-trace retention window (`attemptStore.ts:51`) must either be raised or labelled „последните 5 записа", or students will read it as a bug. |
| **I3** | **Dual-ghost comparison** — mount the template's authored shadow trace alongside the student's attempt on the *same* clock, plus a divergence strip reusing the `FollowHintProbe` lateral-deviation math (`LessonScene.tsx:1144-1151`, ~4 Hz). | **+8** | Turns "you were too fast" into "here is where the correct car was already braking and you were not". Needs no new asset class — the scene already mounts two ghosts. *Risk:* do not imply one correct line exists. Present it as „едно правилно решение" and anchor the strip to rule-engine events, not lateral distance alone; degrade honestly on templates with no shadow trace. |
| **I4** | **„Какво ще стане?" — hazard-prediction mode.** Re-cut mistake traces at **`[fault−8 s, fault−1 s]`** so the clip stops *just before* the incident, then ask what happens next. Correct answer and distractors come **verbatim** from the template's `whatWentWrongBg` and the catalog's `titleBg`/`correctiveBg`/`lawRef`. Timed, scored, folded into mastery via `simFeed`. | **26** + one overnight GPU batch | **The strongest moat in the product.** Nobody with licensed stock footage can re-cut an item at a new millisecond — that requires a deterministic trace format, a rule engine that timestamps its own violations, and a headless renderer, all three of which you own. The occlusion cut is a **one-constant change to a pure, tested function**. And because every word comes from authored corpora, the mode makes **zero LLM calls** — ADR-002-clean *by construction*, not by policy. *Ship a 30-item pilot before the full 310;* distractor authoring is founder editorial time and will be the true critical path. A lower-effort stepping stone exists: `SceneStillMedia` (`lib/content/types.ts:103-114`) already supports a live-rendered 3D scene still, which is exactly the Dutch CBR photo format (25 items, 8 s each, brake / release gas / do nothing, pass 13/25). |
| **I5** | **Adaptive scenario selection from the error profile.** `simFeed.ts` already folds sim violations into severity-weighted mastery rows (опасна ×0.60, основна ×0.75, второстепенна ×0.90, server-rebuilt evidence only) — but `scenario/nextStep.ts` picks the next scenario by **static catalog order + a star gate, reading none of it.** Index violation → template via the `conceptId` bridge; serve „твоите 3 слаби места". | **12** | Makes "adaptive" true at the simulator level. Multiplies the value of everything above. *Risk:* the repetition trap — cap same-template repeats, interleave, and break ties on the 45-event library's `examPointsCovered` or the selector optimises for weakness rather than exam leverage. |

### 5.4 The tutor, which is also the innovation story

The tutor is not a greenfield build — it is a **distribution** problem. Run it at **two speeds**, which is what ADR-002 already mandates:

- **Fast speed, inside the driving loop: deterministic, authored, zero-LLM, zero-network.**
  The entire authored Bulgarian voice track is **20,959 characters** across the sim catalog's `titleBg`/`explanationBg`/`correctiveBg` (168 strings). Pre-render it to audio **once at build time**: **$0.31** on Azure at $15/1M chars. Everything including all 1,089 question explanations (347k chars) is **$5.20** — ~7.1 h of audio ≈ 74 MB at 24 kbps Opus. Runtime cost: **zero**. Latency: **zero**. Cost is a rounding error; the constraint is native-ear review time.
  Build `modules/sim/lessons/speakGate.ts` as a **twin of `quiz-trigger.ts`** (pure, deterministic, node-testable, same gate order). Hard mutes: `lesson.examMode === true`; `phase !== "driving"`; any overlay open; within 8 s of a HUD toast; while a `опасна`/terminating event is live (inherit `TeachMomentOverlay.tsx:16-19` — a spoken line during evasive handling is the worst possible moment). Triggers, highest first: a **repeat** graded mistake with escalation multiplier > 1; a **commendation for a code the student previously failed** (the "you fixed it" moment — the single most motivating line an instructor says, and nothing in the product currently celebrates it); objective complete; a stationary window (< 3 km/h). Cooldown 40 s, max 5 lines/session, queue-and-**drop**. Ride the existing `ADVISOR_STORAGE_KEY` toggle so one switch silences the whole coaching layer. **14 h.**
- **Slow speed, at every pause point: the LLM, grounded exactly as `tutor/retrieval.ts` already grounds it.**
  - **The LLM debrief (10 h)** at the seam a previous session already specified and marked — `sim/lessons/debrief.ts:13-24` ("AI DEBRIEF SEAM") and `:221-226` ("// AI debrief hook"). Pass `buildDebrief()`'s deterministic text as the grounding draft; the model may rephrase and personalise but may **not** introduce a legal claim absent from the events; reuse **`extractCitations` as a hard accept/reject validator**; fall back to the template on any mismatch, failure or budget trip. ~2,500 in / ~400 out on Sonnet 5 ≈ **$0.014/drive** (~$1.70/month in alpha, ~$165/month at 1,000 students × 12 drives). **This is the one surface where an LLM genuinely beats the template.**
  - **Inline why-panel tutor (8 h)** — replace the dead link at `WhyPanel.tsx:106` with „Питай за този въпрос", pre-loading questionId, picked/correct option ids, per-option `whyWrongBg`, `explanationBg` + `lawRefs`, mastery delta. Retrieval is skipped (the materials *are* the question), so grounding is exact and the prompt is small: ~$0.0016 per follow-up on Haiku 4.5. Route through the same `getTutorAccess` trial gate. *(Haiku's minimum cacheable prefix is 4,096 tokens — do not budget a cache discount here.)*
  - **The one-line win (1 h):** `askTutor` calls `getReadiness(userId)` for the 3 weakest concepts but **never calls `getSimWeakSpots(userId)`** (`tutor/service.ts:152-160`), which exists, is exported (`learning/index.ts:62-67`) and is consumed only by the dashboard. Add it, tag each `TutorMessage` with `surface` (the messages column is Json — no migration). **This is what makes it ONE tutor instead of three.**

**TTS vendor:** default to **Azure `bg-BG-KalinaNeural`** (125 WPM, calm instructor register). Verify per vendor — Bulgarian support is thin: Azure has **exactly two** bg-BG neural voices, **no HD variant, no multilingual variant, no styles or roles** ([MS language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)), so tone must live in the *writing*, which you control. ElevenLabs supports Bulgarian across Multilingual v2 / Flash v2.5 / v3 at ~11× the price — still only ~$57 for the whole corpus, so **A/B ten real catalog lines with a native ear (2 h) and pick on quality, not cost.**

**Never ship browser `speechSynthesis` as the primary path.** Chrome on Android returns an *unfiltered language list* rather than the real voice list, and **silently falls back to an English voice** when the bg-BG pack is not downloaded. The Bulgarian voices that exist are platform-locked: Kalina/Borislav = Edge-only, Ivan = Windows-only, Daria = Apple-only, and the Android/ChromeOS Google Bulgarian voice needs a manual download deep in system settings ([web-speech-recommended-voices](https://github.com/HadrienGardeur/web-speech-recommended-voices), [readium/speech bg.json](https://raw.githubusercontent.com/readium/speech/main/json/bg.json)). Your target user would hear a Bulgarian driving lesson in an English accent.

### 5.5 The positioning line

Do **not** lead with "we have 3D clips". ЗЕБРА ТЕСТ already ships *„интерактивни видеоклипове (видеовъпроси)"* ([zebrabook.bg](https://zebrabook.bg/index.php?product_id=55&route=product%2Fproduct)) — a competitor can license footage in a month.

Lead with the **closed loop**: *your* drive → *the engine's* fault timestamp → *your* item → *your* calibration curve. And keep feeding `/outcome` and `/review/calibration`, because **"our hazard-prediction score predicts your ДАИ result"** is the one claim no competitor can manufacture — and it needs a year of accrual before you can make it.

---

## 6. THE SEQUENCED PLAN

### 6.1 FIRST — the one-afternoon bundle (14 h) + a €125 order

> **Build this before anything else, this week:**
> **V1 markings fix (3 h) + V2 cloud layer (6 h) + V3 Vitosha ridge (5 h) — and fix the black mirror (0.5 h) while you are in there.**

Why these three, specifically:

1. **They change ~40% of every pixel in every frame.** The sky is currently an information-free gradient occupying 35–45% of the screen, and the markings are the one ground mesh that ignores shadow.
2. **They all live inside files you already own** — one fragment shader and one mesh declaration. Zero draw calls, zero new textures, zero new dependencies, zero risk to the rule engine or any test.
3. **They are a diagnosis test.** If a cloud layer, a Vitosha silhouette and paint that sits *in* the shadow do not visibly change your reaction to the frames, then the content diagnosis in §1 is wrong and everything downstream should be re-examined before you spend the 34 hours on buildings. **Cheapest possible falsification of the most expensive assumption in this document.**
4. **Vitosha is also the cheapest Bulgaria-recognition cue in existence.** A 17-year-old in Sofia knows that ridge.

**Order the €125 Galaxy A16 the same day** — it takes days to arrive, and the measurement in §6.2 gates every phase after Phase 1.

### 6.2 The phases

| Phase | Contents | Hours | Gate to exit |
| --- | --- | --- | --- |
| **P0 — Afternoon** | V1 markings · V2 clouds · V3 Vitosha · mirror bug · HDR licence line | **14.75** | Look at the new frames. Do they still read as a test level? |
| **P1 — Envelope** | Buy the A16 and run `PerfProbe` over `chrome://inspect`; commit the log + a `.har` to `docs/` · drop `suv_boxy_lux` at `low` · seed the quality tier before first fetch · `next/dynamic` the composer · `webglcontextlost` telemetry | **13** + €125 | `68_ALPHA_RECONSTRUCTION_PLAN.md:191` finally ticked with a real artifact. **Every number in §2.2 is a prediction until this exists.** — *2026-07-26: the four code fixes are done and measured on desktop (§2.5); the harness + procedure are at [`perf/README.md`](perf/README.md). The gate stays OPEN until an A16 log is committed.* |
| **P2 — Turn the world on** | V4 decal density + junction wear + traffic/pedestrian defaults · V5 road surface pass (asphalt swap, darken, detail normal, UV density + 2-tap rotated blend) · F4 optic flow (inside V5) | **17** | Re-measure on the A16. Draws ≤70, tris ≤250k, 30 fps flat. Raise traffic **per-template**, not globally — ~90 bot-completion tests grade against gaps and conflicts. |
| **P3 — Feel** | F1 grip-loss channel · F3 engine braking · F2 road vertical motion · audio-on prompt · F5 haptics | **26** | Re-baseline `sim-harness.mjs` + `harness.test.ts`. Ship every slice additive/gated so defaults stay bit-identical, then re-baseline deliberately. |
| **P4 — Innovation core** | I1 calibration gate (**after** audit H-5/H-6 are closed) · I2 „Твоят дубъл" · I3 dual ghost · tutor `getSimWeakSpots` one-liner | **27** | A student can watch their own drive against the correct line and see how wrong their self-prediction was. **This is the point where the product becomes uncopyable.** |
| **P5 — Populate** | V7 buildings-as-data across `d2-v1` + the top ~20 scenario maps (incl. ~8 h re-running sight-line test batteries) · V6 fleet geometry + shared atlas | **50** | Sight-line tests green. Then **re-evaluate `PERCEPTUAL_ROAD_SCALE`** — a populated street may make 2.5× read fine, saving 16 risky hours. |
| **P6 — Voice & debrief** | Pre-rendered TTS render script + `speakGate.ts` (14 h) · LLM debrief at the existing seam (10 h) · inline why-panel tutor (8 h) · 2 h Azure/ElevenLabs A/B with a native ear | **34** | Listen to all 52 lines end-to-end before shipping (doc-66 R0 look-before-ship discipline applies to audio too). |
| **P7 — Hazard prediction pilot** | I4: occlusion trim mode + item generator + player route + scoring, **30 items only** | **26** + ~1 h GPU | Do students actually answer them? Tune the cut point and the time limit **before** the overnight 310-clip batch (~4.3 h unattended). **Delete the 237 MB of unreferenced PNG keyframes in `public/clips` first** — only the 4 MB WebP set is referenced by the manifest. |
| **P8 — Post-launch** | V8 silhouettes · V9 Sofia facades · V10 hero car · I5 adaptive selection · V11 lightmap bake · 4 h WebGPU/SSR spike in `spike/` (decision only, then shelve) | **~110** | Re-evaluate WebGPU in Q1 2027 when Xclipse ships and Firefox Android lands — and only ever as a second path behind `forceWebGL`. |

**To a defensible alpha: P0 → P4 ≈ 98 hours.** That is a simulator that looks like a place, feels like a car, and does something no competitor can copy.
**Through P7 ≈ 208 hours** for the full differentiated product.

### 6.3 The honest budget split

Roughly **95 h of visual/feel work** (P0, P2, P3, P5) against **~87 h of mechanics** (P4, P6, P7). That ratio is deliberate:

- The visual work has **no crash-reduction evidence** — it buys credibility, conversion, and the founder's own willingness to show the product to a stranger. Those are real and necessary. **But it is time-boxed on purpose.** Do not let it expand.
- The mechanics work is the only part with a positive evidence base and the only part that cannot be copied.
- **Never let the visual budget eat the mechanics budget.** If hours have to be cut, cut P5 (50 h) before you cut P4 (27 h).

---

## 7. WHAT NOT TO DO

### 7.1 Rewrites and migrations — all traps

1. **Do not migrate to WebGPU before launch.** 60–100 h for zero day-one visual change; can never replace the WebGL2 path (Firefox ❌, ~16% of Bulgarian Android on ≤11, Samsung Xclipse "work in progress"); `@react-three/postprocessing` has **no WebGPU support at all**, so the whole N8AO → Bloom → SMAA → ToneMapping chain must be rebuilt in TSL, and you would then QA two composers across three tiers, alone. If you want the answer for real: 4 h SSR spike in `spike/`, look at wet asphalt, shelve it.
2. **Do not port to PlayCanvas or Babylon.js.** ADR-005 chose the stack; ~39,620 lines of sim module, 90 districts, 150 templates and 465 trace files are wired into R3F/Rapier idioms. ~600 h. This is the fantasy option.
3. **Do not build a real tyre model.** Rapier exposes no slip curve; it is a 90 h rewrite that destroys every physics baseline for nuance nobody in your audience can perceive.
4. **Do not adopt `@three.ez/instanced-mesh` (InstancedMesh2), `BatchedMesh`, imposter skylines, or CSM on phone.** They optimise vertex throughput this scene does not spend — the entire city kit is 4,896 triangles across 16 GLBs, already chunk-culled at 200 m with instance-aware bounding spheres. `docs/simulation/quality-gap/13` was written against an assumed scene scale ("1758 trees") that the shipped kit is nothing like. CSM on phone would double scene submission for the one tier with no draw-call headroom.
5. **Do not `npm install three-hex-tiling`.** It hooks `onBeforeCompile` and its own docs warn it interferes with *your* `onBeforeCompile` — which is exactly how `macroVariation` is wired (`StaticWorld.tsx:66`). It is tested only to three r0.173 vs your r0.185.1, and costs up to 12 texture fetches per ground fragment. Write a 2-tap rotated-UV blend inside the hook you already own.

### 7.2 Assets

6. **Do not run another AI text-to-3D cycle on the hero car.** `tools/blender/README.md:72-81` already documents the exact failure mode and that regenerating reproduces it. It also carries an ADR-001 hazard: generators bake brand-like grille and lamp signatures into mesh and texture.
7. **Do not source assets outside CC0** — including Megascans under the Fab Standard License. Every `.glb` in a browser product is a public URL. `LICENSES.md:88-91` records you already discarding a pack for this. Poly Haven and ambientCG are verified CC0 with raw-file inclusion explicitly permitted and cover every need in §3.
8. **Do not buy or commission realistic car models.** The fleet is procedural and `tools/blender/vehicles_v2.py` is a single-file edit. The CC0 alternatives are kart-racer style and would be a downgrade.
9. **Do not rebuild the facade system.** `tools/blender/facade_gen.mjs` is the strongest asset in the repo — true-world-scale seamless tiling (12.0 m U × 11.4 m V bays), Sobel-derived tangent-space normals, correctly packed ORM, randomised 15–35% lit-window emissive, authored at 2× and box-downsampled. It needs new **Bulgarian sets as parameters**, not replacement.
10. **Do not raise texture resolution as a quality lever.** A 4K version of a featureless texture is still featureless, and `sim-textures-ktx2` is already at 86% of its 5.2 MB ceiling.
11. **Do not adopt Gaussian splats / 3DGS.** Fatal on three counts: no geometry for the rule engine to judge, no dynamic occlusion (you cannot move a pedestrian behind a parked van); a captured Sofia street is full of real brands and plates (ADR-001); and it contains real faces (ADR-004, minors).

### 7.3 Renderer and budget discipline

12. **Do not tune environment presets, tone mapping, bloom or AO further.** The shipped frames are `quality: "high"` with the full composer and still read flat. Further preset work is motion without progress.
13. **Do not chase 60 fps on the phone.** The fixed costs (25,771-tri cockpit always on screen, mirror pass, Rapier at 60 Hz, WebGL validation on two big cores) make 33.3 ms the honest budget. A locked 30 also halves heat and battery — and mid-range SoCs hold it: Galaxy A55 posts 99–99.7% 3DMark Wild Life stress stability, Redmi Note 13 Pro 5G shows near-identical scores after 20 runs at 43.4 °C peak. Budget for a **flat 30**, not a decaying 45→25.
14. **Do not do a world-asset "streaming" project.** The sim runtime payload is ~13.8 MB and `low` already fetches 725,950 B of textures with no HDR. The 180.9 MB prod figure is 108 MB of clip video + 63.6 MB of traces — **that** is where a CDN conversation belongs.
15. **Do not let new facade or vegetation textures bypass `textureBudget.ts` and `tools/glb/optimize.mjs`.** The last time render tier and fetch tier drifted apart, phones paid full freight for maps they never sampled (audit H-11).
16. **Do not reduce `PERCEPTUAL_ROAD_SCALE` yet.** §3.3.

### 7.4 Tutor and pedagogy

17. **Do not put an LLM call in the driving frame loop.** Budget 1.0–1.5 s end-to-end for a short Haiku reply from a Bulgarian client (~120 ms RTT + TTFT + server action + TTS). At 50 km/h the car travels **14–21 m** in that window — the line lands after the junction. The rule engine already authors the correct line and delivers it in the same frame.
18. **Do not ship `speechSynthesis` as the primary Bulgarian voice.** §5.4.
19. **Do not add microphone or voice input.** Users are minors (ADR-004): audio capture triggers a separate consent gate and a retention story, and bg-BG ASR accuracy on teenage speech in a noisy room is unverified and expensive to verify. The benefit over typing 40 characters is negligible. Ship the tap version of commentary driving instead, scored against the machine-derived `requiredActors`.
20. **Do not add webcam eye tracking or any face/gaze capture.** ADR-004 forbids biometrics. The `glance-left/right/rear` events already in the trace are the compliant substitute — and defer the RAPT-style attention overlay (~20 h) until `lessons/scenario/observation.ts` is generalised past the parking family, or it will correctly report „не се измерва" on most scenarios and read as broken.
21. **Do not let the tutor speak, hint or appear during any exam** — neither the 45-question mock nor `lesson.examMode === true`. `advisorPromptForSession` already returns `null` on exams (`advisor.ts:168`); the tutor must inherit the same rule or the product stops being an honest rehearsal of ДАИ.
22. **Do not create a second Anthropic client or a second path to the model.** Every surface routes through the budgeted service or the global daily kill-switch (`tutor/budget.ts`) is silently bypassed.
23. **Do not let an LLM write law, corrective actions, or points values anywhere** — including the debrief. It may rephrase `correctiveBg` and must carry every `lawRef` through intact; validate with `extractCitations`, drop back to the deterministic template on any mismatch.
24. **Do not let an LLM generate hazard-prediction items or distractors.** Invalid under ADR-002 and unnecessary — the answers already exist verbatim in `whatWentWrongBg` and the catalog.
25. **Do not procedurally generate new scenarios from the error profile.** 150 authored templates × 5 levels already yields ~18,000 variants, and a generated situation has no reviewer to confirm it is legally correct under Bulgarian law. Recombine and re-target authored templates.
26. **Do not render clips per-student on the server.** The pipeline needs a real GPU (~58 s/clip); the SwiftShader fallback is ~1 fps ≈ 30 minutes/clip on the GPU-less VPS. „Твоят дубъл" is an in-browser `ShadowCar` replay.
27. **Do not render all 268 remaining clips before piloting the format.** 30 items, measure, tune, *then* batch.
28. **Do not ship the calibration gate before closing audit H-5/H-6.** It would actively **mis**calibrate students against an unfair engine.
29. **Do not ship a parent-facing protocol without an expiring, unguessable, owner-bound token and explicit consent wording.** It is an assessment of a minor.
30. **Do not add leaderboards, multiplayer or competitive ranking on driving performance.** It inverts the north star — it rewards speed and risk-taking in a product whose entire claim is that it produces safer drivers.
31. **Do not make the tutor chatty by default.** Ship the SpeakGate conservative (40 s cooldown, max 5 lines) with a visible off switch. An instructor who talks constantly is the fastest way to make students turn the feature off and never turn it back on.

---

## 8. Small corrections to make while you are in there

**Status 2026-07-26: six of the seven are closed.** The one open item is the
black mirror, which is a rendering bug and belongs to the §6.1 P0 visual bundle,
not to this list.

| File | Issue | Status |
| --- | --- | --- |
| `platform/src/modules/tutor/retrieval.ts:20` | Comment says "46 authored violation specs". Real count is **52 violations + 6 commendations**. | **done.** Both the header (`:12-13`) and the corpus note (`:193`) now say 52, and `:181` records *why* the six commendations are excluded rather than added: they carry no `lawRef`, so under ADR-002 they are not grounding material. Re-counted from `sim/rules/catalog.ts` on 2026-07-26 — 52 and 6 exactly. |
| `platform/public/sim/LICENSES.md` | `shanghai_riverside_1k.hdr` is loaded (`LessonScene.tsx:944`) but undocumented; `sky_clear_1k.hdr` is documented but appears unused. | **done.** The register now carries a *loaded-by* table (day IBL / night IBL) rather than a bare inventory, because "we own a licence for it" and "we ship it" turned out to be different questions and only the second one has a byte cost. |
| `platform/public/clips/*.png` | **237 MB of PNG keyframes that no runtime code references** — the manifest references only the 4 MB WebP set. Delete before expanding the clip library. | **done 2026-07-26 — 210 files, 247,317,007 B reclaimed.** Verified before the delete, not assumed: `manifest.json` resolves to 42 `.webm` + 210 `.webp` and **zero** `.png`; every `.webp` it names exists on disk and every `.webp` on disk is named by it; the only `.png`-shaped code left in the clip path is the dev capture route (`api/dev/clips/route.ts`), which *writes* new keyframes, and `clipKeyframeSrc()` (`clips/capture/manifest.ts:76`), which has **no call site** outside that route. Every consumer that reads keyframes — `clipManifest.ts`, `contact-sheet.mjs`, `keyframes-to-webp.mjs` — resolves them through the manifest, so all three followed the WebP. Deleted with the verified tool (`npm run clips:prune-png -- --apply` — the `--` matters, without it npm swallows the flag and the script only dry-runs), which independently refuses any PNG lacking a manifest-referenced WebP sibling; it reported 210 safe / 0 must-keep. `clips-keyframes` in `publicBudget.mjs` stays as a bucket — the capture route still produces PNGs, so the tripwire is still needed. **These were gitignored, so the delete is not revertible**; re-deriving them is the ~4.3 h GPU batch in §6.2 P7. |
| `platform/src/modules/sim/environment/__tests__/quality.test.ts:130` | Asserts `dpr 2 → "med"`; will need updating when the tier is seeded from device signals. | **done — it did not need updating.** `recommendQuality`'s cold-start branch now delegates to `seedQualityFromSignals`, which reduces to exactly the shipped dpr-only rule when no other signal is known — so a bare `dpr: 2` still answers `"med"`, and a `dpr: 2` panel that is *also* touch-only now answers `"low"`. Both are asserted. |
| `platform/src/modules/sim/environment/qualityStore.ts` | **`useAutoQualityProbe` is exported and never mounted** — no call site anywhere outside its own module. The simulator's real tier comes from `loadQualityPreset()` (`lesson-ui/QualityPresetSelector`), which had no probe and no seed at all. Found while implementing §2.3 fix 2. Consequence: **a wrong tier does not self-correct**, which is why the device seed is deliberately narrow (it only ever demotes a device with no fine pointer). | **CLOSED 2026-08-12 (doc 91 §N2·A), in two steps, and the second one is the interesting half.** (1) `e979dda` mounted it: `useQuality()` arms the probe, so it runs exactly when the canvas does. (2) That was not enough, and nobody had checked. The ONLY reader of the ledger the probe writes is `seedQualityLevel()`, which is **memoized for the page load** — and `/simulator` is a client-routed React app that never reloads the document between lessons. A phone could measure itself drowning, write the verdict down, and be handed the same tier for every lesson of the session: *"applied at the next cold start"* was true of the store and false of the product. `LessonSelectScreen` now calls `refreshSeededQuality()` on mount — the canvas is unmounted, no drive is in progress, and the next lesson has not chosen its texture download plan yet. **The mid-drive change stays refused, and now with evidence rather than caution:** `HeroCarBody`, `VehicleRig` and `MirrorRig` each call `loadQualityPreset()` once at mount and never subscribe, so a live tier change renders a clearcoat hero car inside a `low` environment; the only thing that re-reads them is a `sceneEpoch` remount, which discards the drive. |
| `platform/public/sim/env/sky_clear_1k.hdr` | 1,522,032 B, `ship: "prod"`, referenced by **no runtime code and no authoring script** — ~11% of the sim's ~13.8 MB runtime payload shipping for nothing. | **deleted 2026-07-26 — 1,522,032 B off every deploy.** Re-verified by grep across `src/`, `scripts/`, `tools/` (including the Blender rigs, which load `sky_urban_1k.hdr`) before removing: the only mentions anywhere were this document and the licence register. Unlike the clip PNGs this file **is** tracked, so the removal is one `git checkout` away from being undone; its Poly Haven provenance stays in `public/sim/LICENSES.md` under a "Removed" heading, because a register that forgets what was once shipped cannot answer a later question about what was once shipped. The `sim-env` bucket ceiling in `publicBudget.mjs` was left at 6 MB rather than re-tightened around the two survivors — that is a tripwire calibration, and calibrating it against a payload that is still mid-change would just have to be redone. |
| `platform/src/components/sim/vitok/MirrorRig.tsx` | Mirror renders as a solid black rectangle in `public/clips/sc-vp-readiness__m0.k2.webp` despite a real 256×96 render target. | **open.** Re-confirmed against the frame on 2026-07-26 — still a pure black rectangle in the driver's eyeline. Owned by the §6.1 P0 visual bundle (`| — | Bug: …` in §3.2), not by an asset pass. |

---

## 9. Related documents

`63_SIM_REALISM_UPGRADE_PLAN.md` · `66_SIMULATOR_UPGRADE_PLAN.md` (R0–R6 ground rules, incl. the look-before-ship discipline this document inherits) · `67_HERO_VEHICLE_SPEC.md` · `68_ALPHA_RECONSTRUCTION_PLAN.md` (the unchecked phone gate at :191) · `70_VISUAL_REFERENCE_BRIEF.md` · `71_QUALITY_GAP_CLOSURE_PLAN.md` · `73_COCKPIT_DETAIL_SPEC.md` · `quality-gap/13_WEBGL_PERF_BUDGET` (superseded by §2 where they disagree — it was written against an assumed scene scale the shipped kit does not match) · `development/69_HEADLESS_CLIP_PRODUCTION.md` · `80_FULL_AUDIT_2026-07-24.md` (H-5/H-6 gate P4; H-10/H-11 partially closed by `textureBudget.ts` in 165a58b)

---

*This document supersedes no ADR. Nothing recommended here touches ADR-001, ADR-002, ADR-004 or ADR-005; §7 exists largely to keep it that way.*
