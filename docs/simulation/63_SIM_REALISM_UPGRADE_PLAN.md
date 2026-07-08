# Simulator Realism Upgrade Plan

> Status: v0.9 DRAFT — 2026-07-08. Commissioned after the founder's hands-on visual review. Target: transform the simulator from prototype (~5% realism) to "believable modern" (~80% on the car, ~65–75% on the environment — see the honesty section on why those two numbers differ). Asset-specific sections are being finalized from live market research; the analysis, architecture decision, and plan are complete.

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

> **Being finalized from four live market-research streams** (browser-realism ceiling, car models, environment/city assets, camera/feel best-practices). This section will contain concrete products, real prices, license terms, and specific technique parameters. Placeholder until they land.

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

- **Phase 0 — Immediate, no assets (S, days):** speed reduction + Beginner/Normal/Advanced modes + steering smoothing (#4); cockpit camera eye-point/FOV/head-motion fix (#5, partial). Ships a *better-feeling* sim this week while assets are sourced.
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
