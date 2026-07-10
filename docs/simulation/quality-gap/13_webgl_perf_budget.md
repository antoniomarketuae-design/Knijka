# 13 — WebGL Performance Budget for the Quality Upgrade

Research date: 2026-07-10. Lane: hard performance budgets the REF-1/3/4 quality push must
respect on **mid-range laptops (Intel Iris Xe / UHD-class iGPU)** and **mid-range Android
phones (Adreno 610–644, Mali-G52/G57, 3–6 GB shared RAM)** at 60 fps (16.67 ms/frame).
Where numbers are estimates (marked ~), they must be confirmed with the profiling workflow
in §10 before being treated as fact.

Scene scale assumed throughout: **248 buildings, ~50 traffic cars + 1 hero car, 1758 trees**,
roads/ground, street furniture, cockpit interior.

---

## 1. Executive budget table (the hard lines)

| Budget line | Phone tier | Laptop iGPU tier | Desktop dGPU tier |
|---|---|---|---|
| Frame budget | 16.67 ms (60fps) or 33 ms fallback | 16.67 ms | 16.67 ms |
| Draw calls / frame (after culling) | **≤ 75 target, 120 hard cap** | **≤ 150 target, 250 cap** | ≤ 300 |
| Visible triangles / frame | **≤ 300 k** | **≤ 750 k** | ≤ 1.5 M |
| Texture VRAM (all textures, transcoded, w/ mips) | **≤ 96 MB** | **≤ 256 MB** | ≤ 512 MB |
| Render-target VRAM (composer + shadows + reflections) | ≤ 48 MB | ≤ 96 MB | ≤ 160 MB |
| Postprocessing GPU time @ output res | **≤ 2 ms** (AO off or half-res) | **≤ 4 ms** | ≤ 6 ms |
| Real-time lights (shaded) | 1 (sun) | ≤ 2 | ≤ 3 |
| Shadow-casting lights | 1 directional only | 1 directional (CSM 2) | 1 directional (CSM 3–4) |
| devicePixelRatio cap | **1.5** | **1.0–1.25** (1080p+ panels) | 1.5 |
| MeshPhysicalMaterial instances | hero car body ONLY | hero car body (+glass) | same |
| SSR (screen-space reflections) | **NEVER** | OFF by default | optional, ≤ 3 ms measured |

Community consensus baselines behind these: “desktop up to ~100 draw calls easily, mobile
under 50” as the conservative floor, “above 500 even powerful GPUs struggle”
([threejsroadmap](https://threejsroadmap.com/blog/draw-calls-the-silent-killer),
[utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)); total scene
≤ 500 k tris for broad device compatibility; a single uncompressed 4 K RGBA texture = 64–90 MB
VRAM. Our targets sit above the conservative floor because everything heavy is instanced and
we cap DPR.

Android Chrome reality check: a browser tab has been observed failing to grow beyond
**~219–256 MB** of allocatable memory on mid-range Android
([Unity forum, confirmed](https://discussions.unity.com/t/android-chromium-unable-to-grow-allocated-memory-above-256mb-confirmed/818820),
[PlayCanvas forum](https://forum.playcanvas.com/t/what-is-a-safe-maximum-memory-size-for-webgl-playcanvas-builds/2987)).
The 96 MB texture + 48 MB RT phone lines exist so the *whole* GPU footprint stays ~≤ 200 MB.
MDN's portable rule: budget VRAM per output pixel, and handle `OUT_OF_MEMORY` / context-loss
gracefully rather than assuming a fixed limit
([MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)).

---

## 2. Draw calls & instancing at our exact scale

The rule: **draw calls = Σ over every (geometry × material-group) actually submitted.** An
`InstancedMesh` whose geometry has N material groups issues N draw calls regardless of
instance count. Our current “instanced rendering with per-material groups” pipeline therefore
lives or dies by materials-per-kit-piece.

Concrete allocation that fits the laptop 150-call target:

| Content | Strategy | Draw calls |
|---|---|---|
| 248 buildings (kit v3, 4+ facade systems) | 1 InstancedMesh per kit piece; trim-sheet atlas so each piece has **≤ 2 material groups** (opaque facade atlas + emissive/glass atlas). ~12–16 kit pieces | **≤ 32** |
| 1758 trees/palms | 2–3 species × 2 materials (trunk, canopy cutout) via InstancedMesh; per-instance frustum culling mandatory | **4–6** |
| ~50 traffic cars, 10 models | 1 InstancedMesh per model; shared 3-material scheme (body-atlas / glass / wheels-trim) → 30 calls, or vertex-color body variation on one atlas → ~20 | **20–30** |
| Hero car (exterior + cockpit) | it's the star; unique materials fine | **30–50** |
| Roads/ground/markings | merged static meshes, ≤ 4 materials (asphalt, pavers, markings decal, lawn) | **4–8** |
| Street furniture (lamps, signs, railing, benches, billboards) | instanced per type | **10–15** |
| Sky/env/misc | | 2–4 |
| **Total** | | **~100–145** ✅ |

Key practices:

- **Per-instance frustum culling is not optional at 1758 trees / 248 buildings.** Core
  `InstancedMesh` culls all-or-nothing (whole mesh bounding sphere). Use
  **`@three.ez/instanced-mesh` (InstancedMesh2)** — adds per-instance frustum culling with a
  static BVH, per-instance visibility/uniforms, built-in **LOD + shadow-LOD**, fast BVH
  raycasting, works with R3F ([github.com/agargaro/instanced-mesh](https://github.com/agargaro/instanced-mesh),
  demos at 1 M static trees). Instances are static in our city → BVH is built once, cheap.
- `BatchedMesh` (available in our three 0.185) is the alternative for *distinct* geometries
  sharing one material via `WEBGL_multi_draw`, but multi_draw is not available in Firefox
  (falls back slower) ([three.js #27170](https://github.com/mrdoob/three.js/issues/27170)).
  Prefer InstancedMesh2 for repeated kit pieces; consider BatchedMesh only if the building
  kit ends up as many unique one-off meshes on one atlas material.
- Raycasting for scoring/AI against the city must go through the InstancedMesh2 BVH or
  three-mesh-bvh — never naive raycast over thousands of instances.
- Instance count itself is almost free; **vertex throughput of visible instances is the real
  cost** — which is why LOD (§3) matters more than instance math.

---

## 3. Triangle budgets, LOD, and imposters

Per-asset budgets (author-time, in Blender generators):

- Building kit piece: **500–5,000 tris** (env-prop class). Facade *relief* comes from normal
  maps on trim sheets, not geometry.
- Traffic car: **1–3 k tris** (already the brief's number). Wheels are the tri hogs — 8–12
  sided at LOD0.
- Hero car + cockpit: **50–100 k tris** total (hero-object class; it's always on screen, keep
  the cockpit half well-optimized since it covers ~45 % of pixels).
- Tree/palm: ≤ 1.5 k tris LOD0 using cutout cards for fronds; **never alpha-blend foliage —
  use `alphaTest`/alpha-hash cutout** so depth-write stays on and mobile overdraw
  (tile-based GPUs are fill-rate bound) stays sane.

LOD ladder (distances for our street-level camera, tune by measurement):

| Level | Range | Content |
|---|---|---|
| LOD0 | 0–120 m | full kit piece / full car / full tree |
| LOD1 | 120–350 m | ~30–40 % tris; cars → 300-tri shells; trees → crossed cards |
| LOD2 / imposter | > 350 m or **< 80–120 px on screen** | buildings → simple prism with baked facade texture; trees → single billboard; distant towers (REF-1 skyline) → *always* imposters |

- Dynamic LOD cuts average polygon load **60–80 %** in scenes where most objects sit at
  mid/far distance ([Optellix LOD article](https://www.linkedin.com/pulse/dynamic-lod-techniques-real-time-performance-threejs-optellix-8egae));
  billboard imposters are 2 triangles vs thousands
  ([80.lv imposters](https://80.lv/articles/inside-game-development-using-impostors)).
- InstancedMesh2's built-in per-instance LOD handles this without splitting instance buffers
  by hand. Its **shadow-LOD** lets distant instances cast from LOD2 geometry — big shadow-pass
  win.
- The REF-1 background skyline (supertall spire, distant towers) should be authored *directly
  as imposters/skybox cards* — never real geometry.
- Hysteresis: switch distances need ±10 % dead-band to avoid popping/thrash while driving.

---

## 4. Texture-memory math (the table that gates the PBR/trim-sheet plan)

GPU cost of a texture ≠ file size. PNG/JPEG/WebP decompress to raw RGBA8 in VRAM; KTX2/Basis
stays GPU-compressed (~4–10× less VRAM, 4–8× faster upload)
([Don McCurdy, web texture formats](https://www.donmccurdy.com/2024/02/11/web-texture-formats/),
[Khronos KTX2](https://www.khronos.org/news/press/khronos-ktx-2-0-textures-enable-compact-visually-rich-gltf-3d-assets)).
Formula: `width × height × bytes-per-pixel × 1.333 (mips)`.

| Resolution (w/ mips) | RGBA8 (png/jpg/webp) | ETC1S → BC1/ETC1, 4 bpp | ETC1S+alpha / UASTC → BC7/ASTC, 8 bpp |
|---|---|---|---|
| 1024² | 5.6 MB | **0.7 MB** | 1.4 MB |
| 2048² | 22.4 MB | **2.8 MB** | 5.6 MB |
| 4096² | 89.5 MB | 11.2 MB | 22.4 MB |

What fits the **phone 96 MB texture budget**:

- Uncompressed 2 K atlases: **4** (!) — this alone kills a JPEG/PNG-based trim-sheet plan.
- ETC1S 2 K atlases: ~34 theoretical; **plan 10–14 city 2 K atlases (~30–40 MB)** leaving room
  for: hero-car set (2–3 × 2 K UASTC ≈ 11–17 MB), cockpit atlas (2 K UASTC, 5.6 MB), road/
  ground set (3–4 × 2 K mixed ≈ 12 MB), HDRI + PMREM (~6–8 MB), signage/props (~8 MB).
- Laptop tier can double atlas count or bump the hero/cockpit/ground sets to 4 K where it
  visibly matters.

Format policy ([Khronos KTX artist guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md), McCurdy):

- **ETC1S** for albedo/facade/AO/emissive atlases (default; JPEG-like files, 4 bpp VRAM).
- **UASTC** for **normal maps** and the hero car (ETC1S visibly degrades normals); UASTC+zstd
  files are ~1–2× JPEG size, 8 bpp VRAM.
- Channel-pack ORM (AO/roughness/metalness) into one ETC1S texture.
- Resolutions power-of-two only; mipmaps always on for world textures.

**Pipeline blocker to fix: `toktx` is not installed.** `gltf-transform etc1s|uastc` shells out
to KTX-Software's `toktx`. Install the official **KTX-Software v4.x Windows x64 installer**
from GitHub releases (adds `toktx`/`ktx` to PATH) — then the existing gltf-transform step gains
KTX2 with two flags. three.js `KTX2Loader` + drei's `useKTX2`/gltf loader already handle
transcoding (Basis transcoder wasm ships with three). Until this is installed, every “PBR
upgrade” texture multiplies VRAM ~8× vs the budget above — **install KTX-Software before
authoring the atlas set.**

Render targets also count (§1 line): at 1080 p, one RGBA16F full-res buffer = 16.6 MB; the
pmndrs composer + N8AO + bloom mip chain + 2×CSM shadow maps (2×2048² depth ≈ 32 MB desktop /
2×1024² ≈ 8 MB mobile) is how the 48–96 MB RT budget gets consumed. **Every 0.25 of extra DPR
multiplies all of it** — hence the DPR caps (desktop max 1, mobile max 1.5 per the Codrops
efficient-scenes methodology,
[Codrops 2025](https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/)).

---

## 5. Material shader cost policy

three.js per-pixel cost ordering: Basic → Lambert → Phong → Standard → **Physical** (most
expensive) ([three.js materials manual](https://threejs.org/manual/en/materials.html)).
`MeshPhysicalMaterial` features are pay-per-enable: clearcoat adds a second specular GGX lobe
(~+30–50 % fragment cost on that material's pixels); transmission forces an extra scene
render to a transmission buffer — **transmission is banned** in the driving scene
([three.js forum](https://discourse.threejs.org/t/meshphysicalmaterial-can-i-measure-how-much-more-expensive-it-is/60398)).

Policy:

- **MeshPhysicalMaterial (clearcoat only): hero car paint** — exactly the “deep clearcoat
  gloss black” REF-4 asks for. Nothing else.
- **MeshStandardMaterial everywhere else** (buildings, roads, traffic, props). PBR look at
  REF-1 quality comes from the *env map + textures + lighting*, not from Physical.
- Traffic-car glass: MeshStandardMaterial, opaque, low roughness, envMapIntensity high —
  not transparent, not Physical.
- Trees/distant instances: Standard with `flatShading` off, or Lambert at LOD1+ if measured
  fragment-bound on phones.
- Fewer shader *programs* > fewer materials: share one Standard shader config across atlases
  (same defines) so three.js reuses the compiled program; avoid `onBeforeCompile` variants
  per building.
- Keep custom varyings ≤ 3 on any mobile-facing shader tweak (utsubo tip).
- “Wet asphalt” look = roughness map with puddle mask + boosted envMapIntensity + darkened
  albedo — a texture trick, not an SSR dependency (§6).

---

## 6. Postprocessing millisecond budget @ 1080 p

pmndrs postprocessing merges compatible effects into one fullscreen pass (EffectPass), so the
stack below is ~3–4 real passes, not 6 ([react-postprocessing docs](https://react-postprocessing.docs.pmnd.rs/)).

| Effect | Mid laptop iGPU (est.) | Phone (est.) | Verdict |
|---|---|---|---|
| N8AO full-res Medium (16 spp) | ~3–6 ms | prohibitive | desktop dGPU only |
| **N8AO half-res** (2–4× faster, +~1 ms depth-aware upsample) Performance/Low preset | **~1.5–2.5 ms** | ~2–4 ms | laptop: halfRes+Low; phone: halfRes+Performance or OFF |
| Bloom (mipmap blur, half-res input) | ~0.5–1.5 ms | ~1–2 ms | keep; luminance threshold high |
| SMAA | ~0.5–1 ms | ~1 ms | keep on laptop; phone: FXAA or composer `multisampling={4}` (WebGL2 MSAA) instead |
| ACES tone map + color grade | ~0 (merged) | ~0 | free, keep |
| SSR ([0beqz screen-space-reflections](https://github.com/0beqz/screen-space-reflections) / realism-effects) | ~4–10 ms | no | **do not ship**; behind a “cinematic” desktop toggle at most |
| drei MeshReflectorMaterial (road planar reflection) | ≈ extra scene render at buffer res; 256–512 px buffer with a layer-culled scene ≈ 1–3 ms | no | optional laptop+ nicety for wet look; render only road-relevant layers into it |

N8AO facts (author's docs, [github.com/N8python/n8ao](https://github.com/N8python/n8ao)):
presets Performance 8spp/4denoise → Ultra 64/16; `halfRes` = 2–4× boost with ~1 ms fixed
upsample cost; “half-res Ultra is slightly slower than full-res Performance but looks much
better”; `enableDebugMode()` exposes per-frame GPU `lastTime` ms — **use it to replace the
estimates above with measured numbers on the actual laptop/phone.** Use
`screenSpaceRadius: true` (16–64 px) so AO reads consistently from cockpit to chase cam.

Rule for the “REF-1 warm golden look”: it is ~80 % **sun direction + ACES + fog + env map +
texture warmth** (all near-free) and only ~20 % composer effects. Never let the stack exceed
the §1 ms lines; wire `<PerformanceMonitor>` (already the Codrops pattern) to degrade in
order: DPR −20 % → AO half-res/off → bloom half-res → reflections off.

---

## 7. Shadows & lights

- **One shadow source: the sun.** Directional + CSM: desktop 3–4 cascades @ 2048; laptop 2–3
  @ 1024–2048; phone 2 @ 512–1024, `maxFar` ~200 m
  ([three-csm](https://github.com/StrandedKitty/three-csm), CSM is in three's addons;
  [sbcode CSM](https://sbcode.net/threejs/csm/)). Shadow map memory grows quadratically —
  it's inside the RT budget of §1.
- Each cascade re-renders shadow casters → cut the shadow pass with InstancedMesh2
  **shadow-LOD** + `castShadow=false` on LOD2/imposters and on everything beyond cascade far.
- Street lamps, lit windows, signage = **emissive textures + bloom**, never point lights.
  A PointLight with shadows = 6 shadow renders; 2 such lights on 10 objects = 120 extra draw
  calls (utsubo). Hard cap ≤ 3 shaded lights total (sun + ≤ 2 fill).
- Lit-window variation (REF-1 towers at dusk): emissive atlas + per-instance emissive
  intensity uniform (InstancedMesh2 per-instance uniforms) — zero lights.
- Static AO (building bases, curb contact) → bake into the trim-sheet AO channel; “baked
  lighting is free at render time.”

---

## 8. Renderer & frame-level settings

- `antialias: false` on the WebGLRenderer when the composer runs (SMAA/MSAA happens there);
  `powerPreference: "high-performance"`; no `logarithmicDepthBuffer` (per-fragment cost).
- Anisotropy 8 on road/paver textures (grazing-angle sharpness sells REF-1's promenade),
  cap 4 on phone.
- Physics (Rapier) at fixed 60 Hz decoupled from render; traffic AI can tick at 15–30 Hz.
- Frustum culling: keep `frustumCulled=true` on merged road chunks by chunking roads into
  ~100 m segments rather than one giant mesh.
- Fog (`FogExp2`, warm-tinted) is free and does triple duty: REF-1 haze, LOD-pop hiding,
  imposter blending.

---

## 9. Quality-tier matrix (ship this as a settings object)

| Setting | T0 Phone | T1 Laptop iGPU | T2 Desktop dGPU |
|---|---|---|---|
| DPR cap | 1.5 | 1.0–1.25 | 1.5 |
| N8AO | off / halfRes Performance | halfRes Low–Medium | full-res Medium–High |
| Bloom | half-res, high threshold | half-res | full |
| AA | FXAA or MSAA 4× | SMAA | SMAA |
| SSR / planar reflection | off | off / 256 px planar | optional planar 512 or SSR |
| CSM | 2 × 512–1024, far 200 m | 2–3 × 1024–2048 | 3–4 × 2048 |
| LOD distances | ×0.6 | ×1.0 | ×1.3 |
| Anisotropy | 4 | 8 | 8–16 |
| Tree instances rendered | culled + LOD, cap visible ~400 | ~800 | all visible |
| Texture set | 1 K variants of atlases (¼ VRAM) | 2 K | 2 K–4 K hero |

Detect tier by `navigator.userAgentData.mobile` + `WEBGL_debug_renderer_info` GPU string +
first-second frame-time sampling; let `<PerformanceMonitor>` demote at runtime.

---

## 10. Profiling workflow (measure before/after every upgrade PR)

1. **`renderer.info`** every session: `render.calls`, `render.triangles`,
   `memory.textures/geometries`, `programs.length` — assert against §1 budgets in a dev HUD
   (r3f: **r3f-perf** or **stats-gl**, which reads GPU time via `EXT_disjoint_timer_query_webgl2`).
2. **Spector.js** (Chrome/Firefox extension) for frame anatomy: capture one frame, walk the
   command list draw-call-by-draw-call, verify instancing actually collapsed calls, spot
   redundant state changes and surprise passes (e.g., transmission buffer). Caveat: its
   per-command “duration” is CPU time, not GPU time
   ([three.js forum profiling thread](https://discourse.threejs.org/t/performance-profiling-tools-cpu-gpu/17469),
   [timmykokke Spector guide](https://timmykokke.com/blog/2023/2023-06-06-spectorjs/)).
3. **GPU ms attribution**: N8AO `enableDebugMode()` → `lastTime`; stats-gl GPU track; Chrome
   DevTools Performance panel GPU lane for aggregate; `about:gpu` for stack sanity.
4. **Real-device Android loop**: `chrome://inspect` USB remote debugging on an actual
   mid-range phone (target device class: Adreno 6xx). Emulators and desktop DevTools mobile
   emulation do NOT emulate the GPU. Watch for context-loss events (`webglcontextlost`
   listener + telemetry) as the OOM signal on Android.
5. **Texture VRAM audit**: sum via `renderer.info.memory.textures` count + a build-time script
   over the GLB/KTX2 manifest using the §4 formula; fail CI if a tier budget is exceeded.
6. Budget gate per PR: draw calls, visible tris (worst camera: cockpit at the REF-1 boulevard
   vista), GPU ms on the laptop, and texture MB — all four green before merge.

---

## Sources

- https://threejsroadmap.com/blog/draw-calls-the-silent-killer
- https://www.utsubo.com/blog/threejs-best-practices-100-tips
- https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/
- https://github.com/N8python/n8ao
- https://www.donmccurdy.com/2024/02/11/web-texture-formats/
- https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md
- https://www.khronos.org/news/press/khronos-ktx-2-0-textures-enable-compact-visually-rich-gltf-3d-assets
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- https://discussions.unity.com/t/android-chromium-unable-to-grow-allocated-memory-above-256mb-confirmed/818820
- https://forum.playcanvas.com/t/what-is-a-safe-maximum-memory-size-for-webgl-playcanvas-builds/2987
- https://github.com/agargaro/instanced-mesh
- https://github.com/mrdoob/three.js/issues/27170
- https://threejs.org/manual/en/materials.html
- https://discourse.threejs.org/t/meshphysicalmaterial-can-i-measure-how-much-more-expensive-it-is/60398
- https://react-postprocessing.docs.pmnd.rs/
- https://github.com/0beqz/screen-space-reflections
- https://drei.docs.pmnd.rs/shaders/mesh-reflector-material
- https://github.com/StrandedKitty/three-csm
- https://sbcode.net/threejs/csm/
- https://www.linkedin.com/pulse/dynamic-lod-techniques-real-time-performance-threejs-optellix-8egae
- https://80.lv/articles/inside-game-development-using-impostors
- https://discourse.threejs.org/t/performance-profiling-tools-cpu-gpu/17469
- https://timmykokke.com/blog/2023/2023-06-06-spectorjs/
