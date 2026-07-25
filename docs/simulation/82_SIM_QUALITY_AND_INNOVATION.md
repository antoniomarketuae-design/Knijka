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

Open `platform/public/clips/sc-pe-zone-living__m0.k1.png` and `platform/public/clips/sc-junction-rhr__m1.k2.png` while reading this list. Every item is visible in those two frames.

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

**8. There is headroom to fix all of it.** `drawCallEstimate` for a scenario world is ~56 against a test cap of **150 draws / 300,000 triangles** (`world/builders/buildWorldGeometry.ts:145-160`, `world/__tests__/ln-district.test.ts:124-125`). The entire city kit is **4,896 triangles across 16 GLBs** — smaller than the hero car. "It has to stay fast on a phone" is *not* what is limiting the look today.

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

Every recommendation below must fit inside these numbers. They are derived, not guessed.

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
| **Draw calls** | **≤70/frame** (hard cap 100), incl. mirror pass | ≤150 (cap 250) | ≤300 |
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

| Fix | Why | h |
| --- | --- | --- |
| **Seed the quality tier from device signals BEFORE the first fetch** | The download tier already exists (`textureBudget.ts`, shipped in 165a58b) but the store cold-starts `recommendation: "med"` and only decides inside the 2.5 s rAF probe (`environment/qualityStore.ts:31`, `:118-157`) — by which time the med plan (5,950,303 B incl. a 1,596,163 B HDR) is already requested. **The 5.4 MB saving currently helps only on the second visit.** Seed synchronously from `hardwareConcurrency` / `deviceMemory` / `(pointer: coarse)`; bias toward `low` on disagreement. Note `quality.test.ts:130` asserts `dpr 2 → "med"` and needs updating. | 4 |
| **Code-split the composer out of tier `low`** | `SimEnvironment.tsx:42-48` statically imports EffectComposer/N8AO/Bloom/SMAA; `LessonScene.tsx:95` statically imports SimEnvironment. A phone at `low` (`postprocessing: false`) parses **330,491 B** of `postprocessing.min.js` it never mounts ≈ 400–660 ms of Android CPU. `next/dynamic` behind the preset flag. Keep the `key={\`fx-${level}\`}` remount semantics. | 3 |
| **Drop `suv_boxy_lux` from the tier-`low` NPC pool** | It is **22,672 triangles / 16 materials** at weight 5 (~1 in 21 moving spawns) — every other fleet model is 180–280 tris. At ~50 agents that is ~54k triangles and 16 draw calls returned for one constant. `traffic/vehicleFleet.ts:1038`. **Best effort-to-win ratio in the entire codebase.** | 1 |
| **Add a `webglcontextlost` listener with telemetry** | There is currently **none anywhere in `src/`**. On a 4 GB phone an OOM presents as a silent black canvas with no diagnostic. | 1 |

### 2.4 The gate that has never been run

`docs/simulation/68_ALPHA_RECONSTRUCTION_PLAN.md:191` — *"[ ] Runs on a mid-range Android phone: 30+ fps median at tier-low, <10 s load"* — is **unchecked**, and there is no `.har`, Lighthouse run or trace artifact in the repo.

A **Samsung Galaxy A16** (Helio G99, Mali-G57 MP2, 4 GB, 1080×2340) is **244.48 лв ≈ €125** at [Technopolis](https://www.technopolis.bg/en/Smartfoni-i-mobilni-telefoni/Smartfon-GSM--SAMSUNG-GALAXY-A16-A165-BLACK/p/505529). Samsung leads Bulgaria at 34.57% mobile vendor share.

The instrumentation already exists — `PerfProbe` at `LessonScene.tsx:1312-1365` disables `gl.info.autoReset`, accumulates whole-frame draws/triangles across the mirror and composer passes, and logs fps/draws/tris/programs once per second, with the budget lines already in a comment at `:1321-1322`.

**€125 + 4 hours over `chrome://inspect` closes this permanently. Every number in §2.2 is a prediction until that log is committed. DevTools device emulation and Android emulators do not emulate the GPU and will give a false green.**

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
| — | **Bug: the rear-view mirror is a solid black rectangle** in the only shipped cockpit clip (`public/clips/sc-vp-readiness__m0.k2.png`), despite `MirrorRig.tsx` having a real 256×96 render target. A black mirror in the driver's eyeline is the most "unfinished" thing in the product. | 0.5 | — | **fix immediately** |
| — | **Bookkeeping: `shanghai_riverside_1k.hdr` is shipping undocumented.** `LessonScene.tsx:944` loads it; `public/sim/LICENSES.md:13-18` lists only `sky_clear_1k.hdr` (unused) and `sky_urban_1k.hdr`. It *is* genuine Poly Haven CC0 — no legal exposure — but the licence register being wrong is exactly the bookkeeping that saved you from the Marlin pack. | 0.25 | — | do it |

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
| **P1 — Envelope** | Buy the A16 and run `PerfProbe` over `chrome://inspect`; commit the log + a `.har` to `docs/` · drop `suv_boxy_lux` at `low` · seed the quality tier before first fetch · `next/dynamic` the composer · `webglcontextlost` telemetry | **13** + €125 | `68_ALPHA_RECONSTRUCTION_PLAN.md:191` finally ticked with a real artifact. **Every number in §2.2 is a prediction until this exists.** |
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

| File | Issue |
| --- | --- |
| `platform/src/modules/tutor/retrieval.ts:20` | Comment says "46 authored violation specs". Real count is **52 violations + 6 commendations**. |
| `platform/public/sim/LICENSES.md` | `shanghai_riverside_1k.hdr` is loaded (`LessonScene.tsx:944`) but undocumented; `sky_clear_1k.hdr` is documented but appears unused. |
| `platform/public/clips/*.png` | **237 MB of PNG keyframes that no runtime code references** — the manifest references only the 4 MB WebP set. Delete before expanding the clip library. |
| `platform/src/modules/sim/environment/__tests__/quality.test.ts:130` | Asserts `dpr 2 → "med"`; will need updating when the tier is seeded from device signals. |
| `platform/src/components/sim/vitok/MirrorRig.tsx` | Mirror renders as a solid black rectangle in `public/clips/sc-vp-readiness__m0.k2.png` despite a real 256×96 render target. |

---

## 9. Related documents

`63_SIM_REALISM_UPGRADE_PLAN.md` · `66_SIMULATOR_UPGRADE_PLAN.md` (R0–R6 ground rules, incl. the look-before-ship discipline this document inherits) · `67_HERO_VEHICLE_SPEC.md` · `68_ALPHA_RECONSTRUCTION_PLAN.md` (the unchecked phone gate at :191) · `70_VISUAL_REFERENCE_BRIEF.md` · `71_QUALITY_GAP_CLOSURE_PLAN.md` · `73_COCKPIT_DETAIL_SPEC.md` · `quality-gap/13_WEBGL_PERF_BUDGET` (superseded by §2 where they disagree — it was written against an assumed scene scale the shipped kit does not match) · `development/69_HEADLESS_CLIP_PRODUCTION.md` · `80_FULL_AUDIT_2026-07-24.md` (H-5/H-6 gate P4; H-10/H-11 partially closed by `textureBudget.ts` in 165a58b)

---

*This document supersedes no ADR. Nothing recommended here touches ADR-001, ADR-002, ADR-004 or ADR-005; §7 exists largely to keep it that way.*
