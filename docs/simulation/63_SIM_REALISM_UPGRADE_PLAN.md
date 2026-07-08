# Simulator Realism Upgrade Plan

> Status: v1.0 — 2026-07-08. Commissioned after the founder's hands-on visual review; grounded in four market-research passes. Target: transform the simulator from prototype (~5% realism) to "believable modern" (~85% on the car, ~50–60% on the environment — see §7.1 on why those two numbers differ, and why photoreal-in-browser is a myth). Phase 0 (camera + difficulty) is implemented; Phases 1–4 (assets) await purchase approval.

## 0. The one decision everything hangs on (read first)

The founder's review references **Unreal Engine Marketplace, Quixel Megascans, and Fab**. Those are tools for **native desktop engines (Unreal/Unity)**. Our simulator runs in a **web browser (Three.js)** — a choice recorded in [ADR-005](../architecture/07_ARCHITECTURE_DECISION_RECORDS.md) and made deliberately: it is the entire B2C distribution wedge (a 17-year-old clicks a link and is driving in 10 seconds; no download, no install warning, no gaming PC, works on a school laptop). Every competitor sim requires a download; we don't. That is worth more to this business than pixels.

So the real question this review forces is **not** "which Unreal assets do we buy" — it is:

> **How far can browser realism actually go, and can we hit ~80% there — or must we change engines?**

The three paths, with the honest tradeoff:

| Path | Realism ceiling | Distribution | Dev cost / time | Ongoing cost | Verdict |
|---|---|---|---|---|---|
| **A. Maximize browser Three.js** (buy web-grade assets, PBR, HDRI, baked light, postprocessing) | Car ~80%, city ~65–75% | ✅ keep the zero-install wedge | Moderate (weeks) | Near-zero | **Recommended** |
| **B. Native Unreal/Unity desktop download** | ~90%+ (Megascans, Nanite, Lumen) | ❌ kills the wedge — SmartScreen/Gatekeeper/school-IT friction, install funnel destroys teen conversion | High (re-platform sim; keep web for theory) | Code-signing, bigger builds | Only if realism proves to gate sales AND we accept a download product |
| **C. Cloud-stream Unreal to browser** (pixel streaming) | ~90%+ | ✅ link-in-browser | Very high infra + Unreal build | **Per-user-minute GPU server cost — murders our €12.99 unit economics** | No (economics) |

**My recommendation: Path A.** Browser Three.js, with real money spent on *web-grade* assets and a proper lighting/material pipeline, reaches "believable modern" — which is the actual goal. "80% realism in a browser" is very achievable for the **car** (browser car configurators from BMW/Audi/Volvo are already near-photoreal Three.js/Babylon) and reaches "credible modern city" for the **environment** (baked-lit modular PBR kits + real vegetation + HDRI). Path B is the fallback *only if* we later prove that fidelity — not price, content, or convenience — is what blocks sales. Full research grounding this is in §7.

**Reframing "realism" against our North Star:** we do not chase photorealism for its own sake. But the founder is right that the current look is *below the credibility threshold* — a product that looks like 1999 cannot be trusted or sold, no matter how good the AI is. So we invest in realism up to **"credible, immersive, and readable"** (correct road layouts, legible signs, clear hazards, a car you believe you're sitting in) — and stop before the diminishing-returns photoreal tail. That threshold is worth crossing; the tail is not.

---

## 1–6. Issue-by-issue analysis (root cause → solution → build-vs-buy → complexity → priority)

Complexity: S (hours) · M (days) · L (1–2 weeks) · XL (weeks). Priority: Critical / High / Medium / Low.

### 1. Environment (Sofia map) — "~5%, missing buildings, incomplete side roads, 1999 terrain"
- **Root cause (three separate things, don't conflate):**
  1. **Placeholder visual layer.** Roads/buildings/trees are procedural boxes, extruded footprints, and icosahedron blobs. The *topology* is correct and real (from OSM); the *look* is programmer-art. This is the bulk of the "5%" feeling.
  2. **Genuine data sparsity.** OSM has only **248 buildings** mapped for this ~1 km² district, and untagged buildings default to 2 floors — so the city reads as low and empty *even rendered perfectly*. This is a real content gap, not a render bug. (Roads are NOT missing: 323 edges incl. 68 service + 72 residential streets are all present — "incomplete side roads" is the ugly junction/surface geometry, not absent data.)
  3. **Flat unlit materials.** No PBR, no normal maps, no baked lighting, no HDRI — so surfaces look plastic/flat.
- **Solution:** Keep the OSM topology (physics/traffic/rules depend on it). Replace the *visual* layer: PBR asphalt+curb+sidewalk materials with normal maps; swap box buildings for a cohesive modular building kit placed on the footprints; procedurally **densify** buildings to fill OSM gaps (generate plausible filler blocks on empty frontages); real instanced vegetation; baked or HDRI-driven lighting; street furniture. (Asset picks: §7.)
- **Build vs buy:** **Both.** Buy a modular city/building kit + vegetation + street-furniture packs (§7); custom-develop the placement pipeline (OSM footprint → kit piece selection/scaling) and the densification.
- **Complexity:** XL. **Priority:** Critical (it's the worst-looking part and the founder's #1).

### 2. Vehicle quality — "placeholder exterior, empty interior, shape-only wheel"
- **Root cause:** The „Виток" car is *procedurally built primitives* (boxes + a basic GLB) with a near-empty cabin, because the sub-agent had no budget to buy a real model and built a stand-in. Physics are correct and tuned; only the visual mesh is placeholder.
- **Solution:** Replace the visual mesh with a **purchased game-ready glTF car that has a modeled interior** (dashboard, seats, gauge cluster, mirrors, detailed wheel), bind its wheels/steering to the existing physics state, keep the tuned physics untouched. The **car is the highest realism-per-dollar win in the whole project** — browser car configurators prove near-photoreal is achievable in-browser with HDRI reflections + PBR paint/glass.
- **Build vs buy:** **Buy** the model (budget approved); custom-develop only the physics-binding and cockpit camera fit.
- **Complexity:** M–L. **Priority:** Critical (highest impact-to-effort ratio).

### 3. Roads & infrastructure — "no signs, markings, lights, guardrails, curbs, furniture"
- **Root cause:** Partially unfair to current state (we *do* render lane markings, zebra crossings, stop lines, ~54 signs, 38 traffic lights, curbs, sidewalks, streetlights). But they're low-detail procedural geometry, so they don't *read* as real. Missing: guardrails, utility poles at density, richer sign variety, bus stops, road wear/decals.
- **Solution:** Higher-fidelity infrastructure assets (sign meshes with our SVG faces as textures, proper traffic-light housings, guardrails, poles); PBR road surface with painted-line normal detail; decals for wear/manholes/patches.
- **Build vs buy:** Buy an infrastructure/street-furniture pack; reuse our existing sign SVGs as textures on bought poles.
- **Complexity:** L. **Priority:** High.

### 4. Driving speed — "accelerates too fast for a learner"
- **Root cause:** Physics tuned for a believable ~1.2t car (0–100 in 11.6s), but with no learner-friendly throttle shaping or speed governor, keyboard throttle feels abrupt.
- **Solution:** (a) **Reduce default acceleration ~50%** via a throttle-response curve + a soft speed governor; (b) add **Beginner / Normal / Advanced** modes changing max speed, accel curve, steering sensitivity, and stability assists; (c) smooth keyboard steering input. This is a small, self-contained change to the input/tuning layer — **the one item I can implement immediately, low risk, no assets.**
- **Build vs buy:** Build. **Complexity:** S. **Priority:** High (cheap, directly requested, improves the core learning feel).

### 5. Camera system — "floating, wrong perspective, unrealistic wheel, no immersion"
- **Root cause:** Cockpit camera eye-point/FOV/height are approximate (never tuned against a real driver eye position), no G-force head motion, and the placeholder wheel sits wrong relative to the camera.
- **Solution:** Set a correct driver eye position (~1.15 m above road, offset to the LHD seat), a natural cockpit FOV (~55–60°), subtle damped head-lean under accel/brake/cornering (immersion without nausea), look-into-turns, and align the (new, bought) steering wheel to the camera. Best-practice numbers from sim-racing research (§7).
- **Build vs buy:** Build (comes largely free with the bought car's interior geometry giving correct reference points). **Complexity:** M. **Priority:** High (cheap, big immersion gain, pairs with the new car).

### 6. Graphics & realism (whole-scene pass) — "everything looks placeholder, ~5%"
- **Root cause:** No modern rendering pipeline: flat materials, basic lighting, minimal postprocessing, no image-based lighting, no ambient occlusion, low-res procedural textures.
- **Solution:** A full render-pipeline pass — HDRI image-based lighting, PBR materials everywhere, baked lightmaps for static geometry, postprocessing stack (ACES tone mapping we have + GTAO/SSAO, bloom, SMAA/TAA, subtle color grade, optional SSR for wet roads), KTX2 compressed textures, Draco/meshopt geometry. Quality presets so it still runs on integrated GPUs.
- **Build vs buy:** Build (pipeline) + buy (HDRIs are free CC0, textures mostly free CC0). **Complexity:** L. **Priority:** High (multiplies the value of every bought asset).

---

## 7. Research-grounded asset & technique recommendations

Grounded in four market-research passes (2026-07-08). All prices/licenses verified against live listings; `[UNVERIFIED]` where a page hid pricing from scrapers.

### 7.1 The browser realism ceiling (the honest numbers)

- **Single car (interior + exterior): 85–95% of photoreal is achievable in-browser.** This is browser 3D's home turf — commercial car configurators (PlayCanvas/Polaris, BMW/Lamborghini R3F builds) already ship it, via HDRI image-based lighting + PBR clearcoat paint/glass + tone mapping + bloom + contact shadows. The founder's "80%" is *beatable* here.
- **Drivable city on a mid-range laptop: 40–60% realistically — "clean stylized-realism," not photoreal.** Reality check: slowroads.io (a lean, well-optimized Three.js driver) still has **~48% of players below 55fps**. The gap vs Unreal is three specific things the web lacks at scale: **Nanite** (virtualized geometry — 3–5 orders of magnitude more triangles), **Lumen** (real-time global illumination — we substitute baked lightmaps, static only), and **streamed Megascans-density cities**.
- **WebGPU** is production-ready in Three.js (r171, Sept 2025), ~82–85% browser support — but Firefox lags and we must keep the WebGL2 fallback, so the WebGL2 ceiling is our design target. WebGPU buys more draw calls + cheaper compute effects, not "free Lumen."
- **Confirms the Path-A recommendation** (§0): stay browser, spend on web-grade assets. Cloud-streaming Unreal would cost **~$0.18–0.53 per user-hour of GPU** — it inverts web economics and would bankrupt a €12.99 teen product.

### 7.2 Techniques, ranked by realism-per-cost (do in this order)

1. **HDRI image-based lighting** (drei `<Environment>`, free CC0 HDRIs from Poly Haven) — the single biggest lever, especially for the car's reflections. Near-zero runtime cost.
2. **Baked lightmaps** for static geometry (bake in Blender → ship as texture) — our Lumen substitute; makes the city look "rendered." Free at runtime.
3. **PBR materials + normal/AO/roughness maps** everywhere — the modern-look baseline.
4. **KTX2/Basis texture compression + Draco/meshopt geometry** — the enabler that lets a weak GPU hold more/better assets (KTX2 stays compressed in VRAM, ~4–6× less memory).
5. **ACES/AgX tone mapping** (one line) → cinematic. **N8AO half-res** ambient occlusion + **SMAA**. Then **CSM 2-cascade** sun shadows and **instanced vegetation**.
6. **Avoid on integrated GPUs:** screen-space reflections (unstable/expensive — use a reflective ground plane for wet roads instead), heavy DoF, 8K textures (downsample to 1–2K).

### 7.3 The car (Phase 1 — highest ROI)

**Recommended hero: Digital Dive "Drivable Cars: Sedan — Rigged & Game Ready"** ([Fab/Sketchfab](https://sketchfab.com/3d-models/drivable-cars-sedan-rigged-game-ready-8ef66e479a2d4a00aa615be0efebf818)) — the only found option already **rigged (separate wheels/steering/doors) WITH a modeled interior**, web-appropriate at **38.2k tris**, multi-material IDs for re-skinning to our fictional brand. Price `[UNVERIFIED ~$20–40]`, Fab Standard royalty-free. Buy the matching hatchback for variety. **Minimal Blender work.**

- **Value alternative:** 3DDisco "Generic … With Interior" — **$20**, explicitly *generic* (trademark-clean), glTF-native, ~9–12k tris, 2K PBR; not pre-rigged (separate wheels/steering yourself ~1–2h). Pack of 45 models `[UNVERIFIED ~$40–60]`.
- **Premium interior:** dragosburian "Generic … with interior" — **$79**, richest cockpit, but 194k tris (decimate to ~120k) and not rigged.
- **Free fallback / traffic cars:** Quaternius CC0 Cars Bundle ([poly.pizza](https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk)) — exterior-only, perfect for AI traffic.
- **Licensing rule (critical):** buy **only "Generic"/fictional models on Standard/Royalty-Free** licenses — **never real-brand or "Editorial"** (trademark AND copyright cover a real car's shape, not just its badge; removing logos is *not* enough). TurboSquid's license explicitly permits "simulation and training… web applications." Keep every receipt; ship the GLB baked into the app (Draco-compressed), never as a standalone download.
- **Pipeline (build once, reuse):** Blender (separate wheels/steering into objects, set each origin to its rotation axis) → `gltf-transform optimize --compress draco --texture-compress webp/ktx2 --texture-size 2048` → `gltfjsx` for a typed R3F component. ~½–1 day per hero car.

### 7.4 The environment (Phase 3 — the big lift)

**Hard verdict from research: there is NO viable photoreal "real Sofia" in-browser.** Three dead ends, documented so we never revisit them:
- **Google Photorealistic 3D Tiles** — killed twice over: (1) **blocked for EU/EEA billing since 8 July 2025** (HTTP 403 — a Bulgarian company literally cannot serve them), and (2) ToS **prohibits offline caching** (must stream+bill every session) and it's **"melted" at street level** (parked cars/awnings fused into the mesh) — not drivable quality anyway.
- **Cesium OSM Buildings** — just grey extruded OSM boxes (which we already generate ourselves for free) + $149/mo commercial.
- **Purchasable "Sofia" scenes** (CGTrader/TurboSquid $35–399) — GIS/aerial overview grade, not drivable streets.

**The winning path — keep our OSM topology, replace the visual layer, aim "believable modern European city":**
1. **Roads & terrain (do first, FREE, biggest impact):** tile CC0 PBR asphalt/concrete/grass ([Poly Haven](https://polyhaven.com/textures), [ambientCG](https://ambientcg.com/)) onto the existing OSM road ribbon + terrain; lane markings as controllable **decals** ([cgbookcase](https://www.cgbookcase.com/textures) road-markings); **curbs & guardrails procedural** (swept profile along OSM edges — free, perfectly aligned).
2. **Lighting/sky (FREE, huge lift):** one CC0 daytime HDRI (Poly Haven, 1–2K) for IBL + sky dome.
3. **Buildings + street furniture:** **Synty POLYGON City Pack (~$10–20 one-time)** — cohesive, single texture-atlas so whole buildings draw in one call (web-proven); includes lamps/benches/poles/bins. FBX→glTF is trivial. *Or* a mid-poly PBR modular pack from [Fab](https://www.fab.com/) (~$20–60) if we want more realism than stylized — validate poly/material counts first. **Avoid KitBash3D** ($195/kit, 4M-poly — built for film, wrong tool for web).
4. **Vegetation:** **Quaternius CC0** trees/bushes (glTF) via **`InstancedMesh`** (100k trees ≈ one draw call) with variant + jitter + distance-billboard LOD. Free. (Kills the icosahedron-blob problem.)
5. **Building densification:** procedurally generate plausible filler blocks on OSM-empty frontages (fixes the "only 248 buildings" sparsity).
6. **Signs:** buy/grab a few European sign-post meshes; map **our own Bulgarian sign-face SVGs** as swappable textures (rule engine controls them, correctness stays ours).
- **⚠ Synty license caveat:** its EULA prohibits use "in datasets utilised by Generative AI Programs, or in the development of Generative AI Programs." We use the models as *static rendered environment art*, not as AI training/generation input, so this is almost certainly fine — but because we market as "AI," keep the assets purely as render art and consider a one-line written confirmation from Synty.
- **Web-perf guardrails (enforce regardless of kit):** Draco/meshopt geometry, KTX2 1–2K textures, `InstancedMesh`/merged geometry for all repeats, a small shared material set (**draw-call budget is the constraint, not polys**), distance LOD/billboards, one HDRI for IBL.

**Total environment cost:** **$0 fully-free is already a massive upgrade** (CC0 textures + HDRI + Quaternius + procedural curbs); **~$20–60 recommended** (add Synty City); **~$50–150** for a mid-poly Fab realism variant. No subscriptions.

### 7.5 Camera & feel (Phase 0 — DONE this session)

Implemented per the sim-racing/driving-school research: cockpit **FOV 68→55°** (kills the fishbowl that caused "floating"), **eye ~1.15 m above road** at the LHD seat, **G-force head lean** (lateral sway out of corners, roll into them, nose-dive on braking, look-into-turns — subtle, damped, nausea-safe), **realistic ~430° steering-wheel rotation** (was ~190°), and **Beginner/Normal/Advanced modes** (Beginner: throttle ×0.5 + squared curve + 40 km/h governor + smoothed steering). See §9 Phase 0.

---

## 8. Additional high-impact improvements (not in the founder's list)

- **HDRI image-based lighting** — the single biggest realism-per-effort win, especially for the car (paint/glass reflections). Free CC0 HDRIs.
- **Baked lightmaps** for the static city — photoreal static shadows/GI cheaply, computed offline in Blender, shipped as textures. The technique that makes browser scenes look "rendered."
- **Wet-road / weather-reactive materials** tied to the existing rain system (we already have a wetness channel) — huge atmosphere for near-zero cost.
- **Audio pass** — the current engine sound is a procedural oscillator; real engine/tire/ambient city sound massively raises perceived realism (cheap, high impact).
- **Dashboard camera "seat adjust"** as an actual pre-drive lesson step (ties realism to pedagogy — the North Star).
- **Level-of-detail (LOD) + instancing discipline** so the higher-fidelity assets still hit 60fps on a school laptop.
- **A curated "hero corridor"** — hand-polish the ~8 lesson intersections and the streets between them to high fidelity, and let the periphery be lower-detail. Players mostly see the lesson route; concentrate the art budget there.

---

## 9. Phased implementation plan (sequenced by impact-per-effort)

- **Phase 0 — ✅ DONE (2026-07-08):** speed reduction + Beginner/Normal/Advanced modes + steering smoothing (#4); cockpit FOV 68→55, correct eye height, G-force head lean, realistic wheel rotation (#5). Committed; physics harness untouched (input-layer change). The sim already *feels* materially better; assets are the next lever.
- **Phase 1 — The car (M–L):** buy + integrate the hero car with real interior; bind to physics; finalize cockpit camera against its real geometry; HDRI reflections. **This alone moves perceived quality more than anything else.**
- **Phase 2 — Render pipeline (L):** HDRI/IBL, PBR materials, postprocessing stack, KTX2/Draco, quality presets. Makes everything already in the scene look modern.
- **Phase 3 — Environment (XL):** modular building kit + placement pipeline + OSM densification; PBR roads; real vegetation; street furniture/infrastructure; baked lightmaps for the hero corridor.
- **Phase 4 — Polish:** audio, wet-road weather, decals, LOD tuning, per-lesson-route hero polishing.

Each phase is independently shippable and independently improves the product; we do not need the whole thing before the sim looks dramatically better.

---

## 10. Honest expectation setting

- The **car** will get to genuinely impressive (~80%+) — this is a solved problem in the browser.
- The **environment** will get to "believable modern city" (~65–75%) — clearly good, clearly modern, not photoreal Unreal. Closing that last gap in a browser has steeply diminishing returns and is not worth the North Star cost.
- If, after Phases 1–3, the founder still judges the environment insufficient *and we have evidence that fidelity gates sales*, that is the trigger to seriously evaluate Path B (native download product for the sim, web kept for theory) — a strategic pivot documented as a future ADR, not a default.
