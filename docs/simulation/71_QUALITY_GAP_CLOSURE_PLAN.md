# 71 — Quality Gap Closure Plan (REF 5/6 → REF 1/3/4)

**Synthesis of 14 research lanes** (`docs/simulation/quality-gap/01…14`), 2026-07-10.
Mission: capture the FEEL of REF 1 (offline archviz render) at the best real-time-web fidelity —
60 fps on mid-range hardware, eventually phones (ADR-005). This document is THE plan; the lane
reports are its evidence base. Where lanes disagreed, this doc rules and says why.

Companion: `docs/simulation/70_VISUAL_REFERENCE_BRIEF.md` (targets/current state).

---

## 1. Root causes of the REF5 → REF1/3 gap (ranked, evidence-based)

The gap is **multiplicative, not additive**: flat light × flat materials × flat ground × no
atmosphere = "toy". Luminance contrast is the primary perceptual channel (processed before hue or
saturation), so the value-structure failures dominate everything else per hour spent — and they
must be fixed FIRST so all asset work is judged under target light (lane 01).

| # | Root cause | Evidence | Fix class | Effort |
|---|---|---|---|---|
| **1** | **Lighting value structure**: day preset runs sun elevation 55°, intensity 1.35 vs hemisphere 0.85 → key:fill ≈ 1.6:1 = textbook overcast-flat. REF 1 is a low warm key vs cool dim fill (≥3.5:1) with long shadows. | `environment/presets.ts:108-109` code audit; greyscale test fails today | data-only preset retune | hours |
| **2** | **Ground plane**: pale, uniform, roughness-flat asphalt/concrete occupying 40–50% of every driving frame. Real asphalt albedo is 0.05–0.12 — the pale ground itself causes "washed out" and destroys the lighting fix. Grass tiles ~2× stretched (texel-scale bug). | REF 5 transcription; `pbrTextures.ts` repeats vs real texture scales (lane 05 §3) | texel-scale fix + macro variation + decals + curbs | days |
| **3** | **Facade surface information**: buildings are flat untextured PBR color boxes — zero luminance pattern (window grids, floor bands) which is how the eye reads buildings at 10–300 m. | `CityBuildings.tsx` audit; REF 1 has 4 distinct facade systems + lit windows | trim-sheet/tiling texture kit + baked recess normals/AO | 1–2 weeks (the big build) |
| **4** | **No atmosphere**: day fog density 0.002 cool-blue is near-invisible; no aerial perspective = no depth layering, no scale. | presets audit; REF 1 "slight haze" | FogExp2 retune, warm color matched to horizon | hours |
| **5** | **Tone-map + grade**: ACES filmic desaturates/flattens (the canonical "washed out" complaint); grade only on high tier and too weak (HueSaturation 0.06). | three.js discourse 15484/75204; `SimEnvironment.tsx` | AgX (or ACES+grade) + saturation/contrast/LUT, merged pass ≈ free | hours |
| **6** | **Set-dressing density**: no parked cars, sparse clutter. Bethesda finding: players notice repeated/missing *props* before architecture. REF 3's own verdict: trees + lawns + PARKED CARS + signs sell believability. | lanes 10/14; REF 1 midground is literally a parking lot | instance existing fleet as static parked cars + decal stall lines | days, mostly reuse |
| **7** | **Long-shadow reach**: a 22° (later 12–15°) sun throws shadows 2.5–7× object height; current single 45 m texel-snapped ortho frustum clips them; buildings don't cast on med. | `SimEnvironment.tsx:245-259` | stretch frustum now; CSM (3 cascades) on med/high later | days |
| **8** | **Traffic/vehicle material response**: flat paint, no env reflection at distance; hero car already proves the recipe works. | REF 5; hero-car material audit | copy hero paint recipe + instanceColor palette | days |
| **9** | **ENABLER, not a look-cause — KTX2 pipeline gap**: `toktx` absent; every new 2K RGBA texture = ~22 MB VRAM uncompressed. Phone tab OOM ceiling is ~219–256 MB total. Must be unblocked BEFORE facade atlases ship. | lanes 03/13; Android Chrome OOM reports | install KTX-Software 4.4.x | hours |
| **10** | **Cockpit letterbox (REF 6)**: camera-contract bug (pitch too level, wrong eye offset, FOV), NOT a rendering-quality cause. Fixed by numbers, in its own PR, so before/after art comparisons aren't confounded. | lane 12 geometry decomposition | camera data change (§4.9) | hours |

**Two second-order truths that shape everything below** (lanes 04/10):
- Archviz-web consensus: *fidelity is authored in Blender; the browser is a viewer.* Bake AO/relief/
  dirt into kit textures in our existing headless pipeline — runs at 0 ms.
- Slow Roads lesson: *cheap mesh + smart shader* (tiling textures + variation in the shader) is the
  proven browser path — never chase geometry density.

**Explicit non-goals** (ruled out for the 60 fps/phone budget): SSR/SSGI (0beqz — 4–10 ms,
ghosting at driving speed), volumetric fog, realtime GI, `transmission` on any gameplay material
(forces an extra scene render; measured 60→30 fps for one mesh). The REF-1 feel is achievable with
envmap + fresnel + baked AO + decals + LUT.

---

## 2. Tools / add-ons / skills / MCPs / plugins / workflows — verdict table

### 2.1 Runtime (three.js / R3F) libraries

| Tool | Verdict | License | Notes / install |
|---|---|---|---|
| **KTX-Software (toktx/ktx)** | **ADOPT NOW — blocker** | Apache-2.0 | Windows x64 installer from github.com/KhronosGroup/KTX-Software/releases (≥4.3, e.g. 4.4.2) → `C:\Program Files\KTX-Software\bin` on PATH. gltf-transform v4 spawns `ktx create`; v3 spawned `toktx`; one installer covers both. Then `KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer)` + copy `basis_transcoder.{js,wasm}` to `public/basis/`. |
| **@three.ez/instanced-mesh (InstancedMesh2)** | **ADOPT** (perf phase) | MIT | Per-instance BVH frustum culling (mandatory at 1758 trees / 248 buildings — core InstancedMesh culls all-or-nothing), per-instance uniforms, built-in LOD + shadow-LOD, R3F support. |
| **three-csm / three addons CSM** | ADOPT (Phase 7, med/high only) | MIT | cascades 3, shadowMapSize 2048, maxFar 400, mode `practical`, **lightMargin 300** (80-floor towers clip otherwise), fade true; `csm.setupMaterial()` on every receiver. |
| **pmndrs LUT3DEffect / HueSaturation / BrightnessContrast** | ADOPT | MIT | Merges into the existing EffectPass → ~zero GPU cost. Grade goes to med tier too. |
| **drei MeshReflectorMaterial** | LATER, desktop tier only | MIT | Wet-road planar pass 256–512 px, layer-culled ≈ 1–3 ms. Mobile answer = roughness/envMap trick, no pass. |
| **drei ContactShadows** | ADOPT (vehicles) | MIT | #1 anti-toy-car grounding; `resolution 256–512, opacity 0.6–0.8, blur 2, frames={1}`. |
| **three-hex-tiling** | LATER, high tier, road only | MIT | Full anti-repetition, but 3 fetches/map, tested only to three r0.173 (we run r0.185 — verify) and its onBeforeCompile conflicts with our macro-noise hook — one per material. |
| **@monogrid/gainmap-js** | LATER | MIT | HDR-as-JPEG backgrounds, 5–10× smaller than .hdr; only needed if we ship a 4k+ background HDRI. |
| **0beqz realism-effects / screen-space-reflections** | **SKIP** | MIT | 4–10 ms on iGPU, temporal ghosting at driving speeds. Ceiling reference only. |
| **rawwerks/gltf-transform Claude skill** | ADOPT | MIT | Codifies Draco/simplify/WebP/KTX2 commands; pairs with the KTX install. |
| **emalorenzo/three-agent-skills** | ADOPT | MIT | 70+ R3F perf rules (no setState in useFrame, instancing discipline); copy to `~/.claude/skills/`. |
| **freshtechbro/claudedesignskills → `blender-web-pipeline`** (+ optional `react-three-fiber`) | ADOPT | repo license | `/plugin marketplace add freshtechbro/claudedesignskills` → `/plugin install blender-web-pipeline`. glTF export settings, optimization, LOD commands. Review SKILL.md before install (Snyk: 13% of community skills had critical flaws). |
| **elithril/blender-kiln** | STEAL IDEAS, don't install | MIT | Its material-audit step ("procedural nodes that won't survive glTF export → force bake") is exactly our flat-grey-building failure mode; fold into a project skill. |

### 2.2 Blender pipeline tools

| Tool | Verdict | License | Notes |
|---|---|---|---|
| **Buildify (Pavel Oliva)** | **ADOPT the pattern**; smoke-test the library (0.5 d) | $0+, GPL node setups (GPL never contaminates exported GLBs) | .blend GN library → headless-safe by construction (`bpy.ops.wm.append` node group). Built for Blender 3.2 — may break in 5.1.2; if so, the core logic (grid-divide faces → instance module collection per cell) is a ~1-day rebuild. Value = module-kit pattern: one placement group × N module collections = N facade systems. Ignore its Megascans advice (Epic license = Unreal-only). |
| **Building Tools (ranjian0)** | ADOPT secondary | **MIT** | v1.0.13 (2025-05), Blender 4.0 badge. Real window-recess/sill/balcony geometry (REF 1 concrete grid, REF 3 panel blocks). Headless via context override is brittle — MIT lets us vendor/fork just the window/balcony code into our generators. |
| **blosm (blender-osm)** | ADOPT base ($0) — LATER for Sofia topology; consider Pro (~$18) for its CC0 facade/lit-window textures | GPL code, **CC0 bundled textures** | Sofia OSM footprints + heights feeding the kit. OSM = ODbL → one "© OpenStreetMap contributors" credit line. |
| **BagaPie** | MINE its GN groups | free, GPL/MIT, on extensions.blender.org (lowest version risk) | Railing/stair/window/pipe generators for dressing — REF 1 promenade black railing, balcony rails. |
| **DreamUV (leukbaars)** | PORT ~50 lines | open Python | Hotspot texturing (HL:Alyx style) for auto-UVing boxy props onto the trim atlas — port into our headless generators, don't install the addon UI. |
| **xatlas (pip into Blender python)** | LATER | MIT | Only if `smart_project` wastes >30% of lightmap space. |
| **PBG 2** | conditional backup only | read license at Gumroad checkout | Only if our own GN can't do curved masses (REF 1 rounded-corner towers). |
| **SceneCity** | **SKIP** | $97/seat | UI monolith, poor headless fit, stylized output below our bar, fights our road system. |
| **KitOps** | **SKIP** | GPL/pack-specific | Interactive viewport kitbashing; zero headless value. |
| **BlenderGIS** | SKIP (blosm covers it) | GPL-3.0 | Modal basemap operator is headless-hostile. |
| **DreamTextures** | SKIP | GPL | Stale (v0.4.1, Aug 2024), GUI-only, no headless mode. |

### 2.3 MCP servers (we keep what we have)

| MCP | Verdict | Notes |
|---|---|---|
| **ahujasid blender-mcp (installed)** | KEEP — it already exposes all 22 tools | **PolyHaven integration is the single highest-leverage existing tool** for this gap: CC0 HDRIs + PBR sets, no key. Security: port 9876 localhost-only (file-read vuln issue #202); `DISABLE_TELEMETRY=true`. |
| Official Blender Lab MCP | WATCH, don't switch | Strict 11-tool subset; same port 9876 — never run both addons. |
| PatrykIti/blender-ai-mcp (212 tools) | SKIP | Solves ad-hoc-bpy fragility our versioned scripts don't have. |
| Tripo MCP / Meshy MCP | BENCH | Tripo only if we want rigged/animated pedestrians; Meshy retexture free tier is non-commercial. |
| Sketchfab tools (in blender-mcp) | REFERENCE ONLY, never ship | Per-model CC licenses (BY/NC/ND) + real-brand ADR-001 risk. |

### 2.4 Asset/texture sources — the license hard rule

Our GLBs are publicly downloadable → assets are extractable → **only CC0 (or owned/AI-paid-seat)
textures may ship.**

| Source | License | Verdict |
|---|---|---|
| **Poly Haven** (already wired via blender-mcp) | CC0 | ✅ primary (HDRIs + photoscanned PBR) |
| **ambientCG** | CC0 | ✅ primary (2000+ PBR incl. dedicated Facade category — Facade005/Facade011) |
| ShareTextures, cgbookcase, 3dtexel (decals; download manually, site 403s scripts) | CC0 | ✅ supplementary |
| Poliigon | proprietary | ❌ forbids extractable distribution |
| Textures.com | proprietary | ❌ encrypted-package-only distribution |
| Quixel Megascans | Epic | ❌ Unreal-only |

Keep a `LICENSES`/credits manifest: OSM attribution + CC0 asset list + per-asset `ai_provenance`
(tool, plan, date).

---

## 3. Prioritized implementation plan (phases, effort, expected visual delta)

Discipline (lane 10): fix **3 benchmark cameras in code** (cockpit REF-6 framing, chase REF-5
framing, promenade wide REF-1 framing); after EVERY phase re-shoot all three + a **greyscale
variant**; a phase isn't done until its screenshots beat the previous set. Budget gates from §6
checked per PR.

| Phase | Content | Effort | Expected visual delta |
|---|---|---|---|
| **0. Audit + cameras + cockpit fix** | Benchmark cameras; kit-grid audit (footprint rule: integer-multiple module sizes, fix offenders BEFORE art); cockpit camera contract per §4.9 (separate PR) | 0.5–1 d | REF 6 letterbox gone; honest baselines |
| **1. Golden-hour patch** (QW-A/B/C/F/M/H/I/E/J/N/L/K/D from lane 14) | Preset retune (sun 22°/1.9/#ffd9a0, hemi 0.55), per-preset exposure, golden HDRI swap + rotation, fog 0.0028 warm, N8AO 2.5/2.2, bloom 0.9/0.75, DAY_GLOW 2.0, grade on med, tone-map A/B, shadow radius 55/75, instanceColor facade tints, seam check. Retire legacy `components/sim/SceneLighting.tsx` rig. | 2–3 d, data + ~1 MB assets, **zero new passes/draw calls** | **THE "washed out" complaint dies here** — before a single new asset lands. Biggest single jump of the program. |
| **2. Pipeline enablers** | Install KTX-Software (toktx); wire `etc1s`/`uastc` into gltf-transform step; install the 3 skills/plugins (§2.1); ground textures PNG→WebP interim | 0.5–1 d | none visible; unblocks everything textured |
| **3. Ground & roads** | Texel-scale fix (`realWorldSize` in `pbrTextures.ts`), asphalt darkening, shared world-space macro-noise hook, vertex-color wear/gutter bands, batched decal atlas (1 draw call), curb extrusion w/ chamfer, markings de-glow, lawn stack | 2–3 d | The 40–50% of frame the driver stares at stops being a flat wash; streets read *used* |
| **4. Facade kit v4** | UVs in generators (arc-length × z), v1 = four 512² per-system tiling bay textures + 1024² trim Atlas B; strip-board Cycles bakes (recess normals + AO + emissive lit windows); per-building U offset + vertex tint + emissiveFactor variety; Draco `quantize-texcoord-bits 14`; anisotropy 8 | 4–6 d | The big one: towers gain window grids, recess shadows, lit-window life — REF 1's facade systems |
| **5. Dressing + fleet** | ParkedCars layer (instanced fleet, 60–120 cars, 2–4 draw calls), stall-line decals, billboards + existing BG sign kit, promenade railing (BagaPie), fleet paint recipe + instanceColor palette, ContactShadows | 2–3 d | "Lived-in" jump; REF 3 believability checklist satisfied |
| **6. Vehicles (REF 4)** | `boxy_suv.py` upgrade: bevel-everything + Weighted Normals + vertex-AO bake + signature parts; 35–60k tris exterior; cockpit interior module 15–30k + 1K AO; materials per §4.8; clearcoat authored in Blender; Draco normal bits 10–12 | 3–5 d | Hero reads "product shot"; two-blacks G-Class contrast; cockpit (45% of every frame) earns its budget |
| **7. Shadows + premium atmosphere** | CSM 3×2048 med/high (baked blob shadows low tier); sun-oriented fog tint (Quilez mix, ~10 shader lines) — the biggest single atmosphere win; optional height fog | 1–2 d | Long tower shadows sweep the boulevard; driving toward the sun glows gold |
| **8. Perf hardening** | InstancedMesh2 rollout, LOD ladder + skyline imposters, KTX2 conversion of all atlases, quality-tier matrix (§6), PerformanceMonitor demotion chain, profiling loop | 2 d + continuous | none visible — protects 60 fps and the phone build |
| **9. Polish + night** | LUT grade (.cube 32³) once art stabilizes; night mode: dusk HDRI @ 0.25, emissive windows 3–6, threshold-1.0 bloom, instanced lamp-pool decals, 2–4 real lights max near player | 1–2 d | Cinematic unity; premium "blue hour" night |

Total ≈ 16–24 working days; every phase independently shippable.

---

## 4. Exact settings, techniques and assets (the copy-paste layer)

### 4.1 Lighting rig (Phase 1 — lands in `environment/presets.ts`)

```ts
day: {
  sky: {
    zenith: "#4a7ec2", horizon: "#f4c78e", horizonCurve: 2.1,
    sunTint: "#ffdba8", sunDiscDeg: 1.0, sunDiscIntensity: 4.0,
    sunGlowIntensity: 0.35, sunGlowPower: 14, starsIntensity: 0,
  },
  light: {
    sun:  { azimuthDeg: 245, elevationDeg: 22, color: "#ffd9a0", intensity: 1.9 },
    hemisphere: { skyColor: "#b8cde8", groundColor: "#4a4034", intensity: 0.55 },
  },
  fog:     { color: "#e3c49c", density: 0.0028 },
  rainFog: { color: "#9aabbd", density: 0.0034 },
  exposure: 1.15,   // NEW field; dusk 1.1, night 0.95 — stop sharing one knob
}
```

**Rulings on lane disagreements:**
- **Sun elevation 22°** now (lanes 01/11 wanted 6–20°; at ≤15° shadows outrun the 45–60 m frustum
  — drop toward 12–15° only after CSM lands in Phase 7).
- **Sun intensity 1.9** now (lane 04's 4–6 assumes env-only rigs without our SkyDome/hemisphere;
  QW-A's 1.9 is calibrated to the existing stack). Raise toward 2.5–3.5 only if the greyscale
  contrast test still fails. Target key:fill ≥ 3.5:1; shadowed side of a white cube ≈ 25–35% of lit side.
  Grey shadows → lower env first; black shadows → raise hemisphere, never env.
- **Fog 0.0028 day** (lane 11's 0.0008 is the conservative floor if towers vanish; lane 01's
  0.004–0.006 is REJECTED as pea-soup for a 1.6 km district). Hard constraint: 100 m signage
  legibility for the rule engine — at 0.0028, 100 m is ~96% clear. Fog color must be warm
  (matched near the sky horizon, slightly greyer), NEVER grey/blue.
- No AmbientLight anywhere. Delete the legacy `platform/src/components/sim/SceneLighting.tsx` rig.

### 4.2 Environment / HDRI

- **Primary: Poly Haven `shanghai_riverside`** (CC0, 25 EVs unclipped — true sun in the env map =
  free speculars on paint/wet asphalt; WB 5074K; 1k .hdr = 1.5 MB). A/B against
  `kiara_7_late-afternoon` (best match for a 22° sun) and `industrial_sunset_02_puresky`
  (closest REF-1 haze mood). Backups: `venice_sunset`, `belfast_sunset_puresky`,
  `evening_road_01_puresky`. Night/dusk: `neuer_zollhof` (blue-hour), `shanghai_bund` (neon).
- `environmentIntensity` 0.5 day (was 0.4) / 0.12 night. **Rotate the HDRI** (`environmentRotation`)
  so its baked sun sits at azimuth 245° — otherwise glass towers show a double sun. Eyeball once,
  store `{elevation, azimuth}` next to the asset filename.
- 1k .hdr is enough for IBL (PMREM). Loads via RGBELoader — no KTX2 dependency.

### 4.3 Tone mapping, grade, post chain

- **A/B in one hour, expected winner: AgX** (`THREE.AgXToneMapping` + `ToneMappingMode.AGX`,
  r160+). Rationale over ACES: hue preservation (no orange→yellow skew) AND it matches Blender 4/5's
  default view transform — our Blender-authored materials finally look the same in-browser.
  Fallback: keep ACES + stronger grade. Khronos `NEUTRAL` for menu/garage car shots.
  Sync BOTH paths (renderer fallback + composer ToneMapping effect).
- Grade (enable on **med** too — pmndrs merges consecutive effects into ONE pass, ~free):
  `HueSaturation saturation 0.12–0.2` + `BrightnessContrast contrast 0.07–0.1` (counters AgX/ACES
  flattening). Escalate to `LUT3DEffect` with a 32³ `.cube` (teal shadows hue 200–210 / warm
  highlights hue 35–45) once art direction stabilizes — author by grading a benchmark screenshot
  toward REF 1.
- Composer order: `RenderPass → N8AOPostPass → EffectPass[Bloom, Vignette(0.28/0.45),
  HueSaturation/BrightnessContrast or LUT, SMAA, ToneMapping]`. Canvas: `antialias:false,
  stencil:false, powerPreference:'high-performance'`.
- **N8AO**: `aoRadius 2.5` (world m), `intensity 2.2`, falloff 1.0, `halfRes: true` +
  depthAwareUpsampling (2–4× faster, ~1 ms). Library guidance: intensity 2 = subtle, 5 = heavy —
  the current 1.5/1.5 is below the visibility floor. Retune DOWN after baked AO lands (Phase 4)
  to avoid double-darkening. Quality presets 8/16/64 spp map to phone/laptop/dGPU.
- **Bloom**: `mipmapBlur`, day `luminanceThreshold 0.9, intensity 0.75, radius 0.6`; night
  threshold 1.0 (strict selective: only >1 HDR emissives glow — no layers needed).
  `DAY_GLOW 1.35 → 2.0` in CityBuildings so golden-hour interiors cross the threshold.
- Measure post with N8AO `enableDebugMode().lastTime` — replace estimates with real ms.

### 4.4 Ground & roads (Phase 3)

**Texel scale first (free): `repeat = uvMetresPerTile / textureRealWorldMetres`.** Add
`realWorldSize` to `GroupConfig` in `pbrTextures.ts`:
- asphalt `asphalt_02` (3 m photographed tile, Poly Haven): road UV = m/7 → repeat **2.33**
- grass `Grass001` (1.4 m, ambientCG): terrain UV = m/8 → repeat **5.7** (currently [3,3] = 2× stretched)
- sidewalk `Concrete047A`/`Concrete046` (2.4 m): V = m/2 → repeat **0.83**

**Named CC0 sets:** asphalt primary `asphalt_02`, variety `clean_asphalt` (REF-1 new-district
boulevards) + ambientCG `Road007` (7.5 m physical tile = half the repeats); wet-albedo candidate
`Asphalt025C`. Promenade two-tone: `PavingStones126A` + `PavingStones127` (3.5 m) as two UV strips.
Lawn: `Grass001`/`Grass004` + `Ground003` dirt blend; desaturate tint toward olive `#6a7f4a`,
roughness 1.0. Decal fodder: cgbookcase Manhole Cover 01–16, 3dtexel.com/decals (280+ CC0),
ambientCG `Decal*`.

**Macro variation (do everywhere, phone-safe — 1 texture fetch):** one shared 256² seamless noise
PNG sampled in WORLD space, one `onBeforeCompile` hook shared across road/terrain/sidewalk (same
uniform → surfaces knit together):

```ts
material.onBeforeCompile = (shader) => {
  shader.uniforms.uMacro = macroUniform;               // shared across all ground materials
  shader.uniforms.uMacroScale = { value: 1 / 90 };     // one noise tile per ~90 m
  shader.uniforms.uMacroStrength = { value: 0.22 };    // ±22% albedo swing
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec2 vWorldXZ;")
    .replace("#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvWorldXZ = (modelMatrix * vec4(position,1.0)).xz;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>",
      "#include <common>\nuniform sampler2D uMacro;\nuniform float uMacroScale;\nuniform float uMacroStrength;\nvarying vec2 vWorldXZ;")
    .replace("#include <map_fragment>", `#include <map_fragment>
      float macro = texture2D(uMacro, vWorldXZ * uMacroScale).r;
      diffuseColor.rgb *= mix(1.0 - uMacroStrength, 1.0 + uMacroStrength, macro);`);
};
material.customProgramCacheKey = () => "macro-v1";
```

**Vertex-color wear (free at runtime, baked in the builder):** block-scale luminance noise ±8%,
wheel-track darkening ×0.8 at ±0.9 m off lane centre, gutter grime band ×0.75, soil strip where
lawn meets curb. `vertexColors: true` (facades already do this).

**Decals — ONE batched quad mesh + ONE 2K atlas (4×4 of 512² cells), ONE draw call. NOT
DecalGeometry, NOT Y-lifting:**

```ts
new THREE.MeshStandardMaterial({
  map: decalAtlas, normalMap: decalNormalAtlas,
  transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.95,
});
mesh.renderOrder = 1;
```

Atlas cells: 3 tar-crack networks, 2 repair patches, 2 oil stains, 3 manholes, 1 gully grate,
2 worn crossings, 2 dirt pools, 1 tire arc. Deterministic seeded placement (manholes off lane
lines, grates at curb corners, cracks seeded around ironwork); density 40% on mobile. Decals share
`wetnessToRoadParams` so oil goes glossy first in rain.

**Curbs:** real extruded profile, 15 cm rise, **1.5–2 cm top chamfer** (the chamfer catching the
low sun is what makes street edges read 3D); dropped curbs at crossings (driving-school-relevant);
optional yellow/black no-parking paint via vertex colour (`lawRefs`-relevant).

**Markings:** give the markings material the asphalt normal+rough maps, albedo `#e8e6dc`,
roughness 0.7, and erode edges with the macro noise via `alphaTest: 0.35` — kills the plastic-tape glow.

**Damp-asphalt REF-1 look:** paint 0.05–0.15-roughness patches into the roughness map along wheel
tracks/gutters; road material `envMapIntensity 1.5`; the env map does the rest. NO SSR.

**envMap rebalance after HDRI swap** (`cityModels.ts`): glass 1.8 → **2.2**, matte 1.2 → **1.0**
(warm HDRI over-lights concrete).

### 4.5 Facade kit v4 (Phase 4)

**v1 architecture (ruling — lane 02 over lanes 01/10):** four **512² seamless per-system bay
textures** (tile both axes; one material per REF-1 facade system: concrete punched grid / bronze
curtain wall / cream vertical strips / white horizontal bands) + one **1024² snapped trim sheet
Atlas B** (parapets w/ Ultimate-Trim 45°-bevel normal edges, retail band, roof gravel, louvers,
plinth, entrance frames, grunge decals — also shared with streetscape props). This dodges strip
mip-bleed and per-floor face cuts entirely. **v2** merges systems into one 2048² floor-band strip
atlas once v1 proves out (then cut tower shaft quads at floor bands; gutters ≥16 px dilated,
tonally-ordered neighbors).

- **Texel density: one number for all strips — 96–128 px/m** (Frozenbyte ships whole games at 200;
  driving camera needs less). Materials swap without re-UV.
- **UVs written analytically in Python at build time** (`bm.loops.layers.uv.new("UVMap")`): facade
  prisms u = perimeter arc-length in metres × density (sampler exists ~line 261 of
  `district_kit_v3.py`), v = z/floor_height. Boxy props: dominant-axis planar projection in bmesh
  (~10 lines; `bpy.ops.uv.cube_project` needs edit-mode window context headlessly). Hotspot-match
  props to Atlas B rects (port DreamUV's ~50 core lines).
- **Authoring = strip-board bake (headless Cycles):** build each bay as real 3D geometry (real
  0.3 m recesses) with the kit's box/prism helpers, PolyHaven concrete/plaster as base, then
  selected-to-active bake `NORMAL / AO / DIFFUSE(color-only) / ROUGHNESS / EMIT`, `margin=16,
  margin_type='EXTEND', cage_extrusion > deepest recess`; Pillow packs PNGs + ORM channel-pack
  (R=AO, G=rough, B=metal). Real recess AO/normals are the #1 thing REF 5's flat prisms lack.
- **Lit windows:** bake ~30–35% warm (2700–3500 K) panes into the emissive map; variety per
  building = random whole-bay U offset + random `emissiveFactor` 0.3–1.0 + vertex-color tint.
  Emissive HDR intensity >1 so the existing Bloom picks it up free.
- **Maps budget:** albedo 2048² (only map that stays 2K) + normal/ORM/emissive 1024² ≈ 40 MB GPU
  as PNG — ÷4–8 after KTX2.
- **Export gotchas (load-bearing):** Draco `--quantize-texcoord-bits 14` AND subtract per-island
  `floor(min u)` at generation (default 12 bits = ~15 px misalignment at 2K on tiling UVs). Verify
  `wrapS/T = REPEAT` survives gltf-transform. Set `texture.anisotropy = 8` on facade maps.
- Result: material count collapses from ~6 flat colors per building to 5–6 shared district-wide
  (v1) — every building batches with every other.

### 4.6 Baking pipeline (per-asset AO — instancing-safe)

**Architecture fact that decides everything:** per-ASSET object-space AO (in the asset's own UV1)
instances for free; per-PLACEMENT scene lightmaps cannot be instanced — reserve lightmaps for
unique single meshes (promenade, parking ground).

Headless recipe (per kit asset, in the generators):
```python
mesh.uv_layers.new(name="Lightmap"); mesh.uv_layers.active = ...   # bake writes to ACTIVE UV
bpy.ops.uv.smart_project(angle_limit=radians(66), island_margin=0.02)
scene.cycles.samples = 256
scene.render.bake.margin = 16; bake.margin_type = 'EXTEND'; bake.use_clear = True
world.light_settings.distance = 3.0            # AO ray distance; 2–5 m reads well on buildings
bpy.ops.object.bake(type='AO')                 # bakes into the ACTIVE Image Texture node
```
- Cycles does NOT denoise AO/DIFFUSE bakes (T93681) → denoise via a compositor
  `CompositorNodeDenoise` (OIDN, ships in Blender, works `--background`).
- Export AO natively: node group named **"glTF Material Output"** with an `Occlusion` input →
  becomes `occlusionTexture` texCoord=1. Or inject post-export:
  `material.setOcclusionTexture(tex); material.getOcclusionTextureInfo().setTexCoord(1)`.
- Runtime: `aoMapIntensity 1.2–1.4`. **aoMap only darkens INDIRECT light** (hemisphere/env-IBL) —
  the drei Environment HDRI is exactly what makes it read. Lightmaps (if used): `flipY=false,
  channel=1, colorSpace=SRGBColorSpace` (r152+ `texture.channel`; the old uv2 hack is dead).

### 4.7 gltf-transform commands

```powershell
# interim (works today, no new binary): WebP for color-ish maps, lossless for normals
npx @gltf-transform/cli webp in.glb out.glb --slots "{baseColorTexture,emissiveTexture,occlusionTexture}"

# after KTX-Software install (Phase 2):
npx @gltf-transform/cli uastc in.glb tmp.glb --slots "{normalTexture,occlusionTexture}" --level 2 --rdo --zstd 18
npx @gltf-transform/cli etc1s tmp.glb out.glb --quality 160

# Draco flags: buildings --quantize-texcoord-bits 14; vehicles --draco.quantizeNormalBits 10–12
# (default normal quantization bands the paint highlight on smooth bodies)
```
Format policy: **ETC1S** for albedo/ORM/emissive atlases (4 bpp VRAM); **UASTC** for normal maps +
hero-car set (+AO if ETC1S bands). 2K ETC1S = 2.8 MB VRAM vs 22.4 MB RGBA.

### 4.8 Vehicles (REF 4) — materials + workflow

Budgets: hero SUV exterior **35–60k tris** (FM3 *drove* cars at 45k), cockpit interior
**15–30k + 1K AO** (it fills 40–50% of frame — highest-ROI vehicle work in the sim), hero LOD1
8–15k, traffic 1.5–4k, ≤10 materials on hero, one wheel instanced 4×.

Workflow: **mid-poly, no bake** — real 1-segment bevels (2–5 mm) on every visible edge + Blender
**Weighted Normal modifier**; ideal for the boxy REF-4 SUV. Bake AO to **vertex colors** (wheel
wells, grille recess, under-body) — near-zero bytes, biggest grounding win. Panel shut lines =
normal/AO strip or thin dark inset bevel, not geometry. Clearcoat authored ONCE in `boxy_suv.py`
(Principled Coat sockets → `KHR_materials_clearcoat` → MeshPhysicalMaterial automatically).

| Material | Settings |
|---|---|
| Hero gloss-black paint | `MeshPhysicalMaterial{ color:#050505–#0a0a0a, metalness 0.9–1.0, roughness 0.45–0.5, clearcoat 1.0, clearcoatRoughness 0.02–0.05, envMapIntensity 1.0–1.5 }` — rough metallic base UNDER near-mirror clearcoat (official `webgl_materials_car` recipe) |
| Metallic traffic paints | same + `FlakesTexture` (procedural, 0 bytes) as normalMap, `normalScale (0.15,0.15)`, repeat scaled to body; per-instance `instanceColor` curated palette |
| Tinted glass | `metalness 0.9, roughness 0.05, envMapIntensity 1.2`, near-opaque `#0a0d10`. **`transmission` is BANNED on all gameplay materials** |
| Chrome slats/trim | `MeshStandardMaterial{ #ffffff, metalness 1.0, roughness 0.08–0.15 }` — 100% env-map dependent |
| Matte cladding/arches | `metalness 0, roughness 0.7–0.8, #101010` — the paint-vs-cladding two-blacks contrast IS the G-Class cue |
| Tires | `metalness 0, roughness 0.85–0.95, #151515` (never #000), 512² tiling tread normal |
| Red calipers | ~200-tri box, `#b80f14, roughness 0.35` — reads at any distance |
| DRLs/tail lights | emissive `2–8`, `toneMapped:false` → selective bloom free |

MeshPhysicalMaterial (clearcoat) = hero car paint ONLY; MeshStandardMaterial everywhere else.
Optional later: 64–128 px CubeCamera probe updated every N frames so towers smear across the black
paint while driving. Rodin = proportion/bake reference only, never the runtime mesh (all AI
generators distort wheels/thin parts; ADR-001 trademark risk in prompted silhouettes).

### 4.9 Cockpit camera contract (lane 12 — hard numbers, Phase 0)

| Parameter | Value | Slider range |
|---|---|---|
| Vertical FOV | **47°** (≈75.4° hFOV @16:9) | 42–56 |
| Pitch | **8° down** | 7–9° |
| Position vs driver design eye point | **aft −0.375 m, inboard +0.10 m, up +0.02 m** | aft −0.30…−0.45, ±0.05 |
| Seat adjust | fore-aft ±0.12 m, height ±0.04 m, persist per profile | — |

The REF-2 look is a moderate FOV pulled **behind** the eye, not a wide lens at the eyeball (a
sedan windshield is only ~23° of vertical angle — vFOV 47 + 8° down is the solve). Resulting
frame: interior 0–44%, road 10–100 m clearly visible at rows 53–65%, horizon ~66%, visor sliver
top 8%; rear-view mirror lands top-right ~x 0.85 / y 0.94 for free. On resize hold **hFOV**
constant: `fov = 2·atan(tan(37.7°)/aspect)`. Never exceed vFOV ~56 (distance compression breaks
the 10–30 m judgments we grade). Speed-perception research (Hussain 2020: narrow GFOV →
+24–29 km/h overdriving): grade speed via speedometer discipline; dense roadside edge-rate cues
every ~20 m; optional dynamic FOV `47 + 5·smoothstep(60,120,kmh)` — OFF in exams. Mirror bug =
aim + exposure: side-mirror cams rearward parallel to body axis, 4–5° down, FOV 15–20°, exposure
locked to main scene.

### 4.10 Shadows

Phase 1: single sun, PCFSoft, texel-snapped follow frustum; med `shadowRadiusM 45→55`, high
`60→75` @2048²; keep bias −0.0004 / normalBias 0.05 (raise normalBias to 0.08 if low-angle facade
acne). Phase 7: CSM cascades 3 × 2048, maxFar 400, `practical`, lightMargin 300, fade true;
`csm.setupMaterial()` wired into the material factory. Low tier: baked elongated blob shadows
(mobile shadow pass can halve frame rate). Small clutter `castShadow=false` beyond cascade 0.
ContactShadows under all vehicles.

---

## 5. AI accelerators — adopt now vs skip

| Tool | Verdict | Cost | License note |
|---|---|---|---|
| **Hyper3D Rodin** (already wired in blender-mcp) | **ADOPT — keep** for hero one-offs & bake sources | ~$0.40/gen via fal.ai (HighPack 3×) | full commercial rights on paid; never ship raw meshes — proportion/bake reference only (Aurelis GT-E recipe) |
| **Poly (withpoly.com)** | **ADOPT NOW, free** | $0 (Infinity $20/mo for formal royalty-free grant + 32-bit height) | text→seamless tileable PBR up to 8K w/ full map set — facade/ground material factory where CC0 lacks (bronze curtain wall). Screenshot the license page at adoption |
| **Meshy Retexture API** | **LATER / fallback** (opinionated downgrade from lane 08's "adopt now") | Pro $20/mo, 1000 credits | Our facade plan is strip-board bakes from CC0 bases — controllable, style-consistent, license-clean. Meshy retextures OUR GLBs if that route underdelivers (fleet v1, one-off podiums). Paid seat only (free tier = CC BY) |
| **Tripo3D** | SELECTIVE — one A/B month for traffic fleet v2 base meshes (best AI quad retopo, ~7.5 cr/op) | ~$20/mo | free tier non-commercial |
| **Microsoft TRELLIS.2** | BENCH | $0 + cloud GPU (≥24 GB VRAM) | MIT — zero-risk bulk prop generator if SaaS costs bite; dense tri output needs decimation |
| **Hunyuan3D-2.x** | **SKIP — legal dead end** | — | LICENSE Territory **excludes the EU**; Bulgaria = EU → no license at all. Never use the blender-mcp `generate_hunyuan3d_model` tool for production (official API also broken, issue #274) |
| **Stable-Fast-3D** | SKIP | — | quality below bar |
| **Luma Genie** | SKIP | — | fills no gap |
| **Blockade Labs Skybox AI** | DEFER | HDR export needs $48/mo tier | PolyHaven CC0 golden-hour HDRIs beat it (unclipped suns). Revisit for a one-month custom Sofia-skyline/Vitosha pano |
| **DreamTextures / local SDXL tiling** | SKIP / optional-later | — | stale GUI addon; SDXL+Materialize/DeepBump only if Poly disappoints |
| AI retopo (general) | NO new tools | — | static instanced assets need polycount, not quad flow: Blender Decimate + gltf-transform simplify win; take quads at the source (Rodin quad / Tripo) when consuming AI meshes |

Hard rules: production assets only on paid seats; per-asset `ai_provenance` (tool, plan, date);
total new sprint spend **$20–70 one-off**, no new local infra.

---

## 6. Step-by-step roadmap to REF-3-feel environment + REF-4-feel vehicles (inside OUR pipeline)

Pipeline invariant: **headless Blender generators (`tools/blender/*.py`) → GLB → gltf-transform
(Draco + KTX2) → instanced R3F**. Nothing below breaks it.

### Hard constraints (every step gated on these — lane 13)

| Budget line | Phone T0 | Laptop iGPU T1 | Desktop T2 |
|---|---|---|---|
| Draw calls (post-culling) | **≤75 target / 120 cap** | **≤150 / 250** | ≤300 |
| Visible triangles | ≤300k | ≤750k | ≤1.5M |
| Texture VRAM (transcoded, w/ mips) | **≤96 MB** | ≤256 MB | ≤512 MB |
| Render-target VRAM | ≤48 MB | ≤96 MB | ≤160 MB |
| Post GPU time @1080p | ≤2 ms | ≤4 ms | ≤6 ms |
| Shadow lights | 1 dir | 1 dir (CSM 2–3 ×1024–2048) | 1 dir (CSM 3–4 ×2048) |
| DPR cap | 1.5 | 1.0–1.25 | 1.5 |
| MeshPhysicalMaterial | hero paint only | +hero glass | same |
| SSR | never | off | optional ≤3 ms measured |

Draw-call allocation that fits T1: buildings ≤32 (≤2 material groups per kit piece via shared
textures), trees 4–6 (InstancedMesh2 per-instance culling mandatory), traffic 20–30, hero 30–50,
ground 4–8, furniture 10–15 → **~100–145 total**. Foliage = alphaTest cutout, never alpha-blend.
LOD ladder: LOD0 0–120 m, LOD1 120–350 m (~35% tris), imposter >350 m / <80–120 px; REF-1 skyline
supertalls authored directly as imposter cards. Measure after 10 min (thermal throttle — a lesson
is 10–30 min); PerformanceMonitor demotes DPR → AO → bloom → reflections. Profiling loop:
renderer.info HUD asserts → Spector.js frame anatomy (its durations are CPU, not GPU) →
chrome://inspect on a real Adreno-6xx phone → CI texture-VRAM audit over the GLB/KTX2 manifest.
Cockpit camera contract (§4.9) is likewise a hard acceptance test: automated raycast rows — cowl
0.42–0.46, horizon 0.63–0.68, header ≥0.90, 10 m road point 0.50–0.56, mirror x∈[0.78,0.95]
y∈[0.88,0.97].

### The steps

1. **Day 0–1 — Phase 0.** Benchmark cameras in code; kit-grid audit (integer-multiple footprints,
   pivots at ground, geometry inside footprint); cockpit camera PR (§4.9 numbers).
2. **Day 1–4 — Phase 1 golden-hour patch.** §4.1–4.3 values; retire legacy SceneLighting rig.
   Greyscale gate: sunlit vs shaded facades must separate clearly.
3. **Day 4–5 — Phase 2 enablers.** KTX-Software install + gltf-transform etc1s/uastc smoke test;
   3 skills/plugins; PNG→WebP interim on `public/sim/textures`.
4. **Day 5–8 — Phase 3 ground.** §4.4 in `pbrTextures.ts` / `StaticWorld.tsx` / builders
   (roads.ts/terrain.ts/new decals.ts). New draw calls: +1 decals, +1 curbs. Quality knob: decal
   density 40% mobile, detail normal + hex-tiling desktop only.
5. **Day 8–14 — Phase 4 facade kit v4.** §4.5 + §4.6: UV writer in the Builder (~80 lines), new
   `tools/blender/facade_atlas.py` (strip boards → Cycles bake → Pillow pack), 5–6 shared textured
   materials replace flat palette, per-building variation, Draco texcoord bits 14. Buildify
   smoke-test in parallel (0.5 d) for the module-kit placement pattern; Building Tools/BagaPie for
   module authoring. Gate: buildings ≤32 draw calls, texture VRAM within tier budget.
6. **Day 14–17 — Phase 5 dressing.** ParkedCars layer (traffic module public API — module-boundary
   rule), stall decals, billboards + BG sign kit reuse, promenade railing, fleet paint recipe +
   ContactShadows. REF-3 believability checklist: trees + lawns + parked cars + signs + varied traffic.
7. **Day 17–22 — Phase 6 vehicles.** `boxy_suv.py` bevel/weighted-normal/vertex-AO pass + REF-4
   signature parts (fender pods, hinges, running boards, side exhausts, spare-wheel tailgate,
   DRL rings); cockpit interior module 15–30k + 1K AO (it IS 45% of every frame); §4.8 materials;
   acceptance checklist from lane 06 §8 (bevel highlights, two blacks, chrome mirrors env, etc.).
8. **Day 22–24 — Phase 7 shadows + premium atmosphere.** CSM med/high; sun-oriented fog tint
   (`mix(hazeBlue, sunGold, pow(max(dot(viewDir,sunDir),0.),8.))` via `fog_fragment` patch);
   consider dropping sun to 12–15° now that CSM handles the throw.
9. **Day 24–26 — Phase 8 perf hardening.** InstancedMesh2 rollout, LOD ladder + skyline imposters,
   KTX2 conversion of all atlases, tier matrix shipped as a settings object, budget asserts in CI.
10. **Day 26–28 — Phase 9 polish + night.** LUT grade; blue-hour night (dusk HDRI 0.25, emissive
    windows 3–6, threshold-1.0 bloom, instanced lamp-pool decals, ≤4 real lights near player,
    headlight ground-projection quads).

### Definition of done

- Promenade benchmark camera reads REF-3-believable (dressing checklist) and REF-1-lit (greyscale
  contrast + haze layering) at 60 fps on Iris Xe with ≤150 draw calls.
- Hero SUV passes the lane-06 acceptance checklist at 60 fps with 12 traffic cars.
- Cockpit camera passes the automated raycast contract.
- All shipped textures CC0/owned/paid-AI with a credits manifest; no Hunyuan3D, no Sketchfab, no
  Poliigon/Textures.com/Megascans anywhere in GLBs.
