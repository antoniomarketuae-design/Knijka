# Sofia Driving Sim — Consolidated Visual Upgrade Plan

## 1. The verdict

The **bones are genuinely strong and the skin is placeholder.** The hard, expensive-to-get-right systems are done well — real Sofia topology, a proven instancing pipeline (~29 draws), full PBR ground/road materials, a legitimately good camera rig (damped eye, G-force lean, mirror glances), a day/night blend, and a signature holographic Gauge component. What's missing is almost entirely *surface*: buildings are 12 repeated Kenney toy shells, the cockpit the player stares at 90% of the time is ~17 gray boxes, traffic is Lambert primitives that float with frozen wheels, and the cheapest atmosphere levers (bloom, night IBL, wet roads) are switched **off on the exact mid-range Android the product targets**. The gap between "believable Sofia" and where we are today is mostly a texture/asset/wiring gap, not an architecture gap — which is the good kind of problem.

Two things are quietly critical and load-bearing for everything else: **there is zero texture/mesh compression (26 MB, uncompressed RGBA in VRAM)**, and **the sim hard-blocks touch devices**. Fix those or the phone wedge is fiction.

---

## 2. The highest-leverage upgrades (impact-per-effort)

The pattern the audit confirms: **the biggest believability wins right now are pure code, not new geometry.** Rank order:

| # | Upgrade | Why it's top | Effort | Blender? |
|---|---------|-------------|--------|----------|
| 1 | **Bloom at `med` tier** (tight threshold, mipmapBlur ~0.25, lum ~1.0) | Emissive bloom is the single cheapest "looks expensive" lever and it's off on 80% of target devices. Instantly makes sun, headlights, brake lights, signals and the cluster glow. | S | No |
| 2 | **Ground every agent** (castShadow on capable, blob-decal on low) | NPC cars/peds visibly float — the #1 believability killer, and ~1 draw call to fix. | S | No |
| 3 | **Rolling + steering wheels on traffic** | The loop already rewrites every wheel matrix; adding roll from `speed·dt/r` turns "sliding boxes" into "driving cars" for free. | S | No |
| 4 | **Night IBL always-on** (dim dusk PMREM when `isNight`) | Right now every metal/glass surface samples black at night — mirrors (a *graded* feature) reflect nothing. Reuse the unused `sky_urban_1k.hdr`. | S | No |
| 5 | **Wet-road response in rain** | Lerp road roughness ~1.0→0.35 + darken albedo from the rain channel. A rainy street that's bone-dry undercuts the whole weather feature. | M | No |
| 6 | **Put the existing Gauge in the cockpit** | Doc 64's signature 270° speedometer is on the dashboard and exams but *not in the sim*. The one place a real speedometer belongs gets a 60px progress ring. Biggest single cockpit-feel HUD win. | M | No |
| 7 | **KTX2/Basis + Draco pipeline** | 26 MB → ~4–6 MB, huge VRAM drop, no visual loss. Foundational — bake it into the asset pipeline *before* authoring GLBs. | M | No (tooling) |
| 8 | **Cheap cockpit tells:** windshield glass plane, steering ratio 13×→~3.5×, interior fill light | Three small code changes that fix "open-frame telekinesis wheel" and a near-black night cabin. | S–M | No |

**Everything in this table is code.** None of it waits on Blender. Ship this block first and the sim's perceived quality jumps before a single new asset lands.

The two **Blender-gated** upgrades that matter most — a Sofia building kit and a coherent cockpit-first car interior — are Large and are the headline Phase 2 work, but they should land *on top of* good lighting, not instead of it.

---

## 3. Environment overhaul plan

### The core problem
The city reads as **toy-town-in-a-park**: 12 repeated western-commercial shells (glass towers, generic shopfronts) instanced onto real Sofia footprints, floating in continuous green lawn. The instancing pipeline is excellent and stays; the *content* is wrong.

### Blender-authored (own it outright, CC0/self-made)
- **Sofia building kit — the highest-leverage asset (L).** Author 20–30 modules: панелка slabs, plastered co-op mid-rises, ground-floor retail, brick blocks — with **baked window/balcony relief and an AO+albedo+normal+roughness+emissive atlas**. The `facadeVariant` system already knows "panelka country," so bias selection by district character. Bake **lit-window emissive** into the same atlas so night mode finally works (the already-authored `makeFacadeTextures` lit-window logic is currently dead code — reuse its 35%-lit warm-window design).
- **Tileable modules, not stretched ones (M).** Author corner + mid + end-cap pieces that tile at a fixed floor height (vary module *count*, not scale). Kills the current non-uniform stretch (depth up to 2.4×, up to 6 identical repeats) that smears window proportions into wallpaper. Randomize model choice *per module*, not per building.
- **Street-furniture kit (L).** Bus shelters, benches, bins, bollards, kiosks, utility/tram poles, guardrail sweeps. A handful of instanced low-poly GLBs along the existing sidewalk offsets — the single biggest "eye-level density" win after buildings.
- **Sign plates & signal housings (M).** Give signs real plate thickness + bracket + retroreflective roughness (keep the existing Bulgarian SVG faces as textures — correctness stays ours); round the signal housings.
- **Richer vegetation with LOD (M)** and **traffic/parked-car GLB kit** (see §5).

### Pure R3F / code (no new geometry)
- **Ground-use zones (M).** Classify terrain cells by building proximity / road density and pave courtyards + parking with the *existing* concrete/asphalt PBR sets; reserve grass for actual parks. This one code change flips "park with roads" → "city." No assets needed.
- **Parked cars along curbs (M).** Deterministic instanced pass on residential/arterial curb offsets — reuse props placement math. Cheapest "streets aren't deserted" win; can ship with the interim box car and upgrade to the GLB later.
- **Building culling via chunking (M).** Chunk instances into a 128 m grid, each its own InstancedMesh with a correct bounding sphere, so frustum culling works again (it's currently disabled because of one origin-centered sphere — the fix is chunking, not disabling). Restores GPU headroom for the richer facades.
- **Road markings → decals (M):** paint wear, faint normal relief, scattered manhole/patch decals on the existing ribbon.
- **Mipmaps + anisotropic filtering on the colormap (S):** kills facade shimmer even before the new atlas.

### Web-budget guardrails
Draw calls are healthy (~29) — **weight is the constraint, not polys.** Every authored GLB goes through `gltf-transform optimize --compress draco --texture-compress ktx2`; normals downsampled to 1–2K UASTC, color/rough/AO to ETC1S. Keep periphery low-detail and concentrate the atlas budget on a hand-polished **hero corridor** covering the ~8 lesson intersections.

---

## 4. Cockpit-first plan

This is the vision, and it is the **single largest fidelity gap**: the most-viewed geometry is the least-finished. Two compounding failures — (a) the interior is ~17 merged boxes in two flat matte materials, and (b) exterior and interior are **two unrelated vehicles** (a 150k-tri Chanel Roadster shell + a gray box interior, neither matching the 4.04 m collider). Switching chase↔cockpit reveals the fake.

### The anchor asset (Blender, L)
Commit to **ONE coherent fictional car (ADR-001)** shipping a matching exterior *and* interior at the correct 4.04 m × 1.7 m envelope from one source/kitbash, so materials and proportions agree. The interior needs a modeled dashboard (vents, button clusters, center screen), door cards, seats, a proper 3-spoke wheel with grip + horn pad, **4 separate wheel nodes** (fronts on steer pivots), and **simple gloved hands/forearms** parented to the wheel. Ship as one or two draw-call-friendly Draco GLBs with a **baked AO+albedo+normal atlas** — a single 1k baked-lighting atlas transforms perceived quality more than any post-processing change. Wire the cluster canvas onto its modeled screen plane; re-measure `COCKPIT_EYE` and re-derive `GLANCE_OFFSETS` from the new seat/mirror geometry.

### Cockpit wins that ship *before* the model (code)
- **Gauge in the cluster (M)** — build a live analog variant of the signature Gauge driven by `telemetry.speedKmh`, redline band lighting at limit / limit+10. Anchor of the bottom-left cluster.
- **Windshield glass plane (S)** — faint tint, low roughness, light dashboard reflection; anchor the rain droplets to it. Fixes "driver looks through an invisible open frame."
- **Steering ratio 13× → ~3.5× (S)** — one-line fix; the wheel currently whips to implausible lock.
- **Interior fill light + emissive dash strips (M)** — a soft light that rises at dusk so the cabin isn't near-black at night.
- **Cluster upgrade (S)** — 1024², add tach + odometer + moving fuel/coolant, glass reflection overlay, emissive backlight.
- **`font-mono` on all numerals + `.hud-panel` re-skin + ISO telltale icons (S–M)** — makes the HUD read as an instrument cluster, not generic content cards. Replace the emoji/ASCII telltales (◀▶, "Дълги/Къси") with SVG dashboard symbols.
- **rAF-driven needle at 60fps (M)** — the telemetry ref updates every frame but the gauge re-renders at 5–7 Hz via setState; drive the needle imperatively.
- **Retire the legacy SimHud/CabinHud (M)** — fold audio/mirror-glance/night-toggle into the one canonical lesson HUD so all polish lands in one place.

---

## 5. Sequenced roadmap

### Phase 1 — Pure-code wins (no Blender; ship while the pipeline warms up)
*Goal: make the existing world look dramatically better before a single new asset exists.*

**Atmosphere & lighting**
- Enable tight bloom at `med` — **S**
- Night IBL always-on (dim PMREM / `sky_urban_1k.hdr`) — **S**
- Wet-road roughness/albedo from rain channel — **M**
- Lower `shadow-normalBias` 0.6→~0.05, retune bias — **S**
- `antialias:false` when composer owns AA — **S**
- Expose dusk preset on a showcase lesson — **S**

**Traffic (the cheap life injection)**
- Ground agents: castShadow on capable, blob decal on low — **S**
- Rolling + steering wheels — **S**
- Emissive head/tail lights gated on night factor + blinkers from `turnSpeedCap` — **M**
- Yaw slerp smoothing (kills turn snap) — **S**
- Segment pedestrians into limb instances with counter-phase swing — **M**
- Interim glazed cabin box + expand paint palette to 8–10 — **S**
- Parked-car pass along curbs (interim box) — **M**

**Cockpit/HUD**
- Gauge in cockpit cluster — **M**
- Windshield glass plane + steering ratio fix + interior fill light — **S/M**
- `font-mono` numerals, `.hud-panel` tokens, ISO telltale icons, white speed-limit disc — **S–M**
- Own the corner layout (kill the two-layer overlap) + z-index tiers — **M**
- rAF needle at 60fps — **M**
- Retire legacy SimHud/CabinHud — **M**

**Environment (code)**
- Ground-use zones (pave courtyards/parking) — **M**
- Building culling via 128 m chunking — **M**
- Mipmaps + anisotropy on colormap — **S**

**Foundational**
- **KTX2/Basis + Draco tooling** (must exist before Phase 2 authors GLBs) — **M**
- Touch input layer or explicit desktop-only MVP decision (lift/keep the phone gate) — **M**
- Hygiene: delete `SceneLighting.tsx`, unused `roadster.glb` (770 KB), dead facade path — **S**

### Phase 2 — Blender asset pipeline (own the assets)
*Goal: replace the toy shells and box cockpit with authored, web-optimized, coherent geometry — all exported through the Phase-1 KTX2/Draco pipeline.*

- **Coherent fictional car — exterior + interior + hands + split wheels, baked AO atlas** — **L** *(Blender)* — the headline item; re-anchor `COCKPIT_EYE`/glances.
- **Sofia building kit (20–30 modules, panelka-biased, baked window/balcony + lit-window emissive atlas)** — **L** *(Blender)*
- **Tileable corner/mid/end-cap modules** (retire the stretch-tiling) — **M** *(Blender)*
- **Traffic car kit** (hatchback/sedan/van, shared atlas, glass sub-mesh, MeshStandard, emissive lamps) — **M** *(Blender)* — supersedes the interim boxes and parked-car boxes
- **Street-furniture kit** (shelters, bins, benches, bollards, poles, guardrails) — **L** *(Blender)*
- **Sign plates + signal housings** (keep SVG faces) — **M** *(Blender)*
- **Richer vegetation with 2–3 LOD tiers + far billboard** — **M** *(Blender)*

### Phase 3 — Polish & depth
*Goal: the "rendered, not real-time" layer once assets and lighting are solid.*

- **Baked lightmaps for the hero corridor** (buildings + ground, ship as KTX2 lightMap) — **L** *(Blender)* — the browser's substitute for Lumen; makes the city look rendered for free at runtime
- **Glass material slot + envMapIntensity** so windows/car paint catch the HDRI; clearcoat car-paint — **M**
- **Layered audio** (rpm-crossfaded engine, tire/road noise, city bed, indicator tick) — **M**
- **Minimap as an instrument** (heading ring, FOV cone, route glow, heading-up mode) — **M**
- **Violation feedback** (count-up numeral, redline pulse, guarded `navigator.vibrate`) — **M**
- **Animated pedals / shifter / handbrake / wipers-in-rain** on the new interior — **M**
- **Idle engine vibration + subtle head-bob**, per-agent size/build jitter, cull-fade into fog — **S**
- **Responsive HUD scale** (container queries, bottom-sheet checklist, 375×211 reference) — **L**

---

**Bottom line:** spend Phase 1 entirely in code — it's where the leverage is and it needs nothing from Blender. Bloom, grounded traffic, night IBL, wet roads, and the Gauge-in-cockpit alone will make the sim feel like a different product. Then use the Blender pipeline for the two things code genuinely cannot fix — a believable Sofia and a coherent cockpit-first car — with compression baked in from the first export so the phone budget survives contact with real assets.