# 04 — The Three.js "photoreal archviz" look in real time (research findings)

Research lane: how the best Three.js / react-three-fiber scenes achieve the REF-1 archviz feel
(warm golden light, material richness, believable reflections, depth) at 60 fps on mid-range
hardware. Compiled 2026-07-10. Sources cited inline; exemplars at the end.

Diagnosis mapping to our gap (REF 5/6): the current sim's "washed-out, flat" verdict is a
**tone-mapping + lighting-architecture problem first**, a texture problem second, and a
post-processing problem third. Every technique below is real-time-web proven.

---

## 1. Tone mapping — the single highest-leverage switch

Reference: the definitive community write-up is the **"Tone Mapping Overview"** thread
(https://discourse.threejs.org/t/tone-mapping-overview/75204), plus the AgX PR discussion
(https://github.com/mrdoob/three.js/issues/27362) and Khronos PBR Neutral page
(https://modelviewer.dev/examples/tone-mapping).

| Mapper | Character | Failure mode | Use when |
|---|---|---|---|
| `NoToneMapping` | raw | clips >1.0 → blown whites | never, with realistic lighting |
| `ACESFilmicToneMapping` | cinematic, contrasty | **hue skew**: "oranges end up yellow, water goes cyan"; desaturates aggressively ("every color becomes a tone of gray") | you want an instant filmic look and accept the color shift |
| `AgXToneMapping` (r160+) | neutral, intentionally lower-contrast, best hue preservation ("better fundamentals than ACES"; Blender 4.0 default) | looks "a bit flat" **until you grade it** | you will color-grade in post — **best foundation** |
| `NeutralToneMapping` (Khronos PBR Neutral, r16x) | color-faithful, made for e-commerce | less cinematic roll-off | product-accurate colors (our hero-car configurator shots) |

**Recommendation for our sim:** switch renderer from ACES to **AgX**, then restore
contrast/warmth via a cheap grading pass (HueSaturation/BrightnessContrast or a LUT — §6).
This is exactly the workflow the community recommends: AgX as the un-opinionated base +
artistic grade on top. Bonus: AgX = Blender 4/5 default view transform, so **what we author
in our headless Blender pipeline finally matches what the browser shows** — this alone
removes a chunk of the "materials look worse in-engine" gap.

- Tone mapping cost is "practically free" (a couple of 3×3 matrix ops) — never a perf concern.
- `renderer.toneMappingExposure`: calibrate ONCE against a mid-grey card in the scene.
  Three.js Journey's realistic-render lesson lands around **1.0–1.8** with ACES
  (https://threejs-journey.com/lessons/realistic-render — uses `toneMappingExposure = 1.8`
  in one variant; Wael Yasmina's ultra-realistic guide also uses **ACES + exposure 1.8**,
  https://waelyasmina.net/articles/how-to-create-ultra-realistic-scenes-in-three.js/).
  With AgX start at **1.0** and push the *lighting* (env intensity + sun), not the exposure.
- In R3F: `<Canvas gl={{ toneMapping: THREE.AgXToneMapping }}>` or set in `onCreated`.
  Note `@react-three/postprocessing`'s `<EffectComposer>` handles tone mapping at the end of
  the chain (ToneMappingEffect) — make sure it's set to AgX there too, not double-applied.

## 2. Lighting architecture: HDRI env + ONE matched sun (the archviz formula)

The consistent pattern across archviz-grade Three.js work (forum thread
https://discourse.threejs.org/t/achieving-realistic-ambience-in-architectural-three-js-scenes/89753,
"Matching Light to HDR" https://discourse.threejs.org/t/matching-light-to-hdr/55711):

1. **A golden-hour HDRI as `scene.environment`** does ALL ambient + reflections. No ambient
   light, no hemisphere light fighting it. HDRI alone = soft/flat.
2. **One `DirectionalLight` rotated to sit exactly on the HDRI's sun** adds the punch: crisp
   long shadows, specular sun highlights on car paint and damp asphalt. This combo (HDRI for
   ambience + sun for contrast) is the whole REF-1 lighting model.
3. Modern three.js physical light units: sun intensity in the **3–8** range works with
   exposure ≈ 1 (Three.js Journey uses `DirectionalLight('#ffffff', 6)`). Tint it warm
   (#ffd9b3-ish) for golden hour, low elevation (10–20°) for long shadows.
4. **Rotate the HDRI** (drei `<Environment>` accepts `environmentRotation` / three r16x
   `scene.environmentRotation`) so the sun direction serves the driving camera — light coming
   low from the right per REF 1.
5. Global env strength: `scene.environmentIntensity` (r163+; drei `<Environment>` prop
   `environmentIntensity`) replaces per-material loops — one global dial for ambience vs sun
   ratio. Forum ref: https://discourse.threejs.org/t/global-environment-map-intensity/49014.

**Our current failure** (REF 5 "flat ambient, weak shadows, no warm sun") = classic
"env-only or ambient-heavy" setup. Action: keep `sky_urban_1k.hdr` ONLY if it's actually
golden-hour; otherwise swap to a PolyHaven golden-hour urban HDRI (1k is fine for lighting;
prefilteredness comes from PMREM anyway), and add the matched warm sun.

### envMapIntensity practice
- Default 1.0; archviz projects push **1.0–2.0 on hero surfaces** (car paint, glass) and
  keep **0.3–0.7 on rough concrete/asphalt** so the env doesn't wash out diffuse surfaces.
  With r163+ prefer the global `scene.environmentIntensity` and only override per material
  where needed (hero car ↑, matte facades ↓).
- `envMapIntensity` only has effect once the env texture is live — set after load.

### Lightformers / live env maps (hero-car sheen)
drcmda's "Live envmaps — realistic studio lighting almost for free"
(https://discourse.threejs.org/t/live-envmaps-and-getting-realistic-studio-lighting-almost-for-free/35627,
demo https://lwo219.csb.app, sandbox "building-live-envmaps"
https://codesandbox.io/s/building-live-envmaps-6nsf9j):
- Put over-bright planes/strips (`<Lightformer>`) into a **separate scene rendered through
  PMREM** (`<Environment frames={Infinity} resolution={256}>…children…</Environment>`); they
  emit light AND appear in reflections. Unlimited count (vs RectAreaLight ≈ 1 on mobile),
  ~free, can animate.
- For us: the *world* HDRI stays, but a small custom env for the **cockpit interior render
  layer** (a warm strip above the windshield + cool bounce below) can make dash/wheel
  materials read premium without any real lights. Also the standard trick for streetlight
  streaks on car paint at dusk.

## 3. Shadows & grounding

- `renderer.shadowMap.type = THREE.PCFSoftShadowMap`, one shadow-casting sun only.
- **`shadow.normalBias` ≈ 0.02–0.05** kills acne on our low-poly instanced buildings
  (better than `bias` which causes peter-panning).
- Tight shadow camera frustum that **follows the player car** (update `light.position` +
  `target` each frame, snap to texel grid to avoid shimmer). 2048² map covering ~80–120 m
  around the car beats a 4096² map covering the whole city.
- **drei `<ContactShadows>`** under the hero + traffic cars: cheap blurred darkening that
  visually "glues" cars to asphalt — the #1 anti-toy-look trick for vehicles
  (typical: `resolution={256–512} opacity={0.6–0.8} scale={10} blur={2} far={1–2}`, `frames={1}`
  if the ground relationship is static). drei docs: https://drei.docs.pmnd.rs.
  `<AccumulativeShadows>` + `RandomizedLight` = raycast-quality soft shadows with **zero cost
  after accumulation** — perfect for menu/garage hero-car shots, not for moving gameplay.
- Archviz consensus for statics (forum 89753): **bake AO/lighting into textures in Blender**
  ("bake everything, display with emissive/unlit… most visual fidelity derives from
  preparation in Blender") — we already own a headless-Blender pipeline, so baking per-facade
  AO + a dirt gradient into the building kit textures is nearly free and runs at 0 ms.

## 4. Post-processing stack (pmndrs), with real settings

Library facts: pmndrs `postprocessing` **merges all non-convolution effects into one
fullscreen pass** (https://github.com/pmndrs/postprocessing/wiki/Effect-Merging), so
Vignette + HueSaturation + BrightnessContrast + LUT + SMAA + ToneMapping ≈ one pass. Only
convolution effects (Bloom's blur, DoF) need their own pass, and max one CONVOLUTION effect
per EffectPass. N8AO is a separate pre-pass.

### Recommended stack & order (ours, adjusted)
`RenderPass → N8AOPostPass → EffectPass[Bloom, Vignette, HueSaturation/LUT, SMAA, ToneMapping(AgX)]`
- LUT before bloom/vignette if grading should not touch glow (moldstud color-grading article:
  "LUT after main render, before bloom/vignette").

### N8AO — exact settings (README: https://github.com/N8python/n8ao)
- `aoRadius` is **world units**: "1–2 magnitudes less than scene scale" → for our
  meter-scale street: **1.5–3.0**. Too small = edge-detector, too big = mush.
- `distanceFalloff` default 1.0; lower reduces halos. Or `screenSpaceRadius: true` with
  radius **16–64 px** and falloff **0.2** (resolution-independent — good for us).
- `intensity`: **2 = subtle** (archviz daylight), 5 = heavy. Golden hour outdoors → 1.5–2.5.
- Quality presets: Performance 8 samples (mobile) / Medium 16+8 denoise (laptops) / High 64
  (dGPU). **`halfRes: true` + `depthAwareUpsampling: true` = 2–4× faster, ~1 ms upsample
  overhead** — our default for mid-range; expose quality tiers alongside DPR scaling.
- `gammaCorrection: false` when N8AO is not the last pass (N8AOPostPass auto-handles).
- Slightly warm-tinted AO `color` (very dark brown vs pure black) fakes GI bounce at dusk —
  README endorses tinted AO for GI approximation, "keep it dark".

### Bloom — realistic, not glowy
(https://react-postprocessing.docs.pmnd.rs/effects/bloom)
- `mipmapBlur` (wide, natural halation, cheaper on weak GPUs).
- **Selective-by-luminance discipline**: `luminanceThreshold: 1` → nothing blooms except
  colors pushed >1.0. Then make **lit tower windows, streetlamp heads, tail-lights, sun-glint
  emissives** with `emissiveIntensity 2–8` + `toneMapped={false}` — REF-1's "interior lights
  visible" comes free, and asphalt sun reflections sparkle without the whole frame glowing.
- `intensity 0.3–0.7` for realism (default 1.0 is already game-y).
- If threshold-1 feels too strict at golden hour, `luminanceThreshold 0.85–0.95` +
  `luminanceSmoothing 0.2–0.4` lets only the sun disk & speculars bloom.

### Color grading
- Cheapest cinematic grade on AgX: `HueSaturation(saturation: +0.15–0.3)` +
  `BrightnessContrast(contrast: +0.05–0.15)` — merged, ~free.
- Or a **LUT**: author a .cube in Blender/Resolve against an AgX screenshot, load with
  `LUT3DEffect` / r3f `<LUT>`. Split-tone recipe for golden hour from the color-grading
  article (https://moldstud.com/articles/p-an-in-depth-look-at-color-grading-techniques-in-threejs-post-processing):
  shadows teal (hue 200–210, sat 10–20%), highlights warm orange (hue 35–45, sat 10–15%).
- `Vignette(offset 0.3, darkness 0.4–0.6)` — subtle; pushes the eye to the road center and
  masks edge aliasing. Standard "premium desktop stack = bloom + AA + vignette".
- Keep SMAA (we have it). `antialias: false` on the canvas since composer AA covers it
  (Codrops SINGULARITY config: `powerPreference "high-performance", antialias:false,
  stencil:false, depth:false`).

### SSR / SSGI — verdict: NOT for our 60 fps budget
- 0beqz `realism-effects` (SSGI/TRAA/HBAO, https://github.com/0beqz/realism-effects) and
  `screen-space-reflections` (https://github.com/0beqz/screen-space-reflections) produce the
  most "offline-looking" frames in the ecosystem, but are multi-ms on mid-range GPUs, noisy
  in motion (temporal reprojection ghosting at driving speeds), and effectively
  desktop-dGPU tech. Screen-space also breaks exactly where a driving cam looks (reflections
  of things behind buildings/off-frame).
- **Wet-asphalt reflections instead**: drei **`MeshReflectorMaterial`** on the road plane —
  one extra planar render at low res, blurred; the canonical drcmda car-showroom look.
  Typical demo values: `resolution={512–1024} mixBlur={1} blur={[300,100]} mixStrength={1–2}
  roughness={0.7–1} depthScale={1} minDepthThreshold={0.4} maxDepthThreshold={1.4}
  metalness={0.5} color="#151515"`, plus a broken-up roughness map so reflections only live
  in the "damp" patches. Restrict to the road surface near the camera; everything else
  reflects via the env map. Cost: one scene re-render at reduced res — budget it (can render
  a stripped layer: sky + buildings + cars only, no props).
- Cheapest tier (mobile): no planar pass — dark asphalt basecolor + low roughness strip along
  sun azimuth + envmap = "damp road" impression from REF 1.

## 5. Fog / aerial perspective — the missing depth cue

- `scene.fog = new THREE.FogExp2(color, density)`; FogExp2 is "closest to real fog"
  (https://threejs.org/manual/en/fog.html). Docs example density `0.002`; for a city read
  as *haze* not fog, start **0.0008–0.002** (meters scale) and tune until towers at 400–800 m
  visibly lighten but 100 m is clean.
- **Fog color must equal the horizon color of the HDRI/sky** — warm pale peach at golden
  hour, NOT grey/blue — this is what makes it read as "atmosphere" (three.js manual explicitly:
  set fog color = background color). Fog on a warm sky is 90% of REF-1's "slight haze".
- Bonus: fog culls distant instancing/LOD pop-in for free (spawn beyond visibility).
- Height-based/scattering upgrades exist (Sneha Belkhale's fog hacks,
  https://snayss.medium.com/three-js-fog-hacks-fc0b42f63386 — height falloff via
  `onBeforeCompile`) — nice-to-have after basic FogExp2 lands.

## 6. What actually sells "archviz" — texture/material notes from the same sources

(Belongs mostly to the materials lane, but every photoreal-three.js source repeats it.)
- Forum 89753 consensus: fidelity is authored in Blender, browser is a "lightweight viewer".
  PBR textures 2048px (1024 mobile), **bake AO/dirt/lighting**, minimize transparent +
  real-time-reflective surfaces.
- Codrops SINGULARITY (Niccolò Fanton, Feb 2025,
  https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/):
  ships an entire moody scene in **2.1 MB / 40k tris**, gltfjsx `-S -T -t` = 90% size cut,
  textures in powers of two, `InstancedMesh` for repeats, physics at 1/30 step, DPR cap 1.0
  desktop / 1.5 mobile with a `PerformanceMonitor` stepping DPR ×0.8 under load — all
  directly transplantable to our pipeline.
- Slow Roads (anslo, https://web.dev/slow-roads/ + https://anslo.medium.com/slow-roads-tl-dr-a664ac6bce40):
  the benchmark browser driving game. Key transferables: **stochastic texturing** (breaks
  tiling on big ground planes — our uniform asphalt/pavement problem), chunked LOD ("high
  detail only in the corridor flanking the route"), pre-generation ahead of the player,
  object pooling. Also sobering: even Slow Roads sees only ~52% of players >55 fps — quality
  tiers are mandatory, not optional.

## 7. Exemplar projects (study list)

1. **Slow Roads** — slowroads.io. Browser driving at 60 fps; corridor LOD, stochastic
   texturing, fog-as-culling. (web.dev interview above.)
2. **drcmda's car demos** (lambo / building-live-envmaps, codesandbox.io/s/building-live-envmaps-6nsf9j,
   lwo219.csb.app) — Lightformer env lighting, ContactShadows, MeshReflectorMaterial floor,
   selective bloom with overbright emissives: the canonical "expensive-looking car, cheap
   frame" recipe.
3. **SINGULARITY** (Niccolò Fanton / Codrops 2025) — full quality-per-byte playbook with
   numbers (2.1 MB, 40k tris, DPR strategy, canvas flags).
4. **Anderson Mancini — Planpoint House** (https://planpoint-house.vercel.app/) +
   **The Neoverse demos** (https://theneoverse.web.app/#threeviewer) — current
   state-of-the-art web archviz; approach = bake everything + HDRI + light post.
5. **Tone Mapping Overview** thread (discourse 75204) — the color-pipeline bible for r150+.
6. **0beqz demos** (realism-effects / SSR) — ceiling reference for what screen-space can do;
   we consciously stay one tier below for frame budget.

## 8. Concrete action plan for our repo (ordered by leverage)

1. `toneMapping: AgXToneMapping`, exposure 1.0 (platform/ Canvas + EffectComposer ToneMapping
   effect) → re-tune saturation with a merged HueSaturation/BrightnessContrast or LUT.
2. Golden-hour urban HDRI (PolyHaven) as environment, rotated so sun is low-right;
   `scene.environmentIntensity` ≈ 0.6–1.0.
3. Warm `DirectionalLight` intensity ~4–6 matched to HDRI sun, PCFSoft 2048² frustum-following
   the car, `normalBias 0.03`.
4. `FogExp2(horizonColor, ~0.0012)`, fog color sampled from the HDRI horizon.
5. N8AO: `halfRes`, screenSpaceRadius 24–48 px, falloff 0.2, intensity ~2, quality tier switch.
6. Bloom `mipmapBlur`, threshold 0.9–1.0, intensity ~0.4; make tower windows / lamps /
   tail-lights emissive `toneMapped={false}`.
7. Lit-window emissive variation in the building kit (bake an emissive map with random lit
   cells) — REF-1's living city at dusk.
8. Wet-road tier: drei `MeshReflectorMaterial` on near-road strip (desktop), roughness-strip
   fake (mobile).
9. ContactShadows under all vehicles; AccumulativeShadows for garage/menu hero shots.
10. Vignette 0.3/0.5. Keep SMAA. Canvas `antialias:false, stencil:false`.
11. Stochastic/detail-texture the ground planes (Slow Roads technique) — kills the "uniform
    pale concrete" verdict.
12. Bake facade AO/dirt in the existing Blender pipeline; keep buildings on
    MeshStandardMaterial with per-system textures (see materials-lane doc).

### Frame-budget sanity (mid-range, 1080p, DPR 1)
- N8AO halfRes ≈ 1–2 ms · Bloom mipmap ≈ 0.5–1 ms · merged EffectPass (vignette+grade+SMAA+
  tonemap) ≈ 0.5–1 ms · MeshReflectorMaterial 512 ≈ 1.5–3 ms (desktop tier only).
  Total post ≈ 3–4 ms desktop / ≈ 2 ms with reflections off — inside a 16.6 ms budget with
  ~10 ms left for scene + physics. SSGI/SSR full-screen would eat 6–10+ ms → rejected.

---
*Cross-checked sources: three.js discourse (75204, 89753, 35627, 55711, 49014), N8AO README,
pmndrs postprocessing wiki (Effect Merging), react-postprocessing docs, Codrops (Fanton 2025),
web.dev Slow Roads interview, anslo's Slow Roads tl;dr, Wael Yasmina realistic-scenes guide,
Three.js Journey realistic-render lesson, modelviewer.dev tone-mapping page, moldstud
color-grading article, 0beqz realism-effects repo.*
