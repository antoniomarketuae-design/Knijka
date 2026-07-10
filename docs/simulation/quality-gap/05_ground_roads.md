# Quality gap 05 — Ground & road material quality (real-time WebGL)

Research date: 2026-07-10 · Lane: tileable PBR ground sets, anti-tiling, road decals,
curbs/gutters, lawn — and exactly how to wire them into our `StaticWorld` /
`usePbrSet` pipeline. Constraint: 60 fps mid-range, eventually phones (ADR-005).

Related code (current state, verified in this session):

- `platform/src/modules/sim/world/components/StaticWorld.tsx` — one `meshStandardMaterial`
  per surface (terrain / terrainPaved / road / junctions / parkingLanes / sidewalks /
  markings), wetness tint via `color`, markings are a FLAT untextured color `0xe9e7df`.
- `platform/src/modules/sim/world/textures/pbrTextures.ts` — 3 PBR groups
  (`road`, `sidewalk`, `ground`) loaded as **PNG** from `public/sim/textures/{dir}`,
  repeat `[2,2]` / `[2,2]` / `[3,3]`, aniso 4–8, ref-counted cache.
- Road UVs = metres/7, terrain = metres/8, sidewalk V = metres/2 (builder).
- Postprocessing (N8AO + bloom + SMAA + ACES) already exists; HDRI env exists.

---

## 1. TL;DR — ranked by (visual payoff ÷ cost)

| # | Action | Cost | Payoff |
|---|--------|------|--------|
| 1 | Fix tiling SCALE to real-world metres (asphalt tile = 3 m, grass = 1.4 m, sidewalk slabs ~1.2 m) | zero | huge — wrong texel scale is the #1 "toy" tell |
| 2 | Macro variation map (one 256² grayscale noise, 2nd sampler, `onBeforeCompile` ~6 lines) on asphalt + grass + concrete | 1 tex fetch | kills tiling at 10–100 m, adds patchiness |
| 3 | Vertex-color tint on road/terrain (bake per-vertex noise + lane-wear darkening in the builder; `vertexColors: true`) | free at runtime | per-block colour drift, darker lane centres |
| 4 | Batched decal quads (cracks, patches, oil, manholes, gully grates) from ONE 2K atlas, single draw call, `polygonOffsetFactor:-4` | 1 draw call | the single biggest "real street" upgrade |
| 5 | Real curb geometry: 15 cm extruded profile with 1–2 cm chamfer + darker gutter band | ~2–4k tris/district | edges catch sun → reads 3D instead of painted |
| 6 | Grass: proper lawn set + 2-tone tint noise + dry-patch blend + soil strip at curb | 1–2 fetches | lawn stops reading as flat green paint |
| 7 | Worn lane markings (alpha-eroded texture instead of flat color) | trivial | markings stop glowing like plastic |
| 8 | (Later) `three-hex-tiling` on the road only, quality-preset gated | 3× fetches/map | fully non-repeating asphalt |

---

## 2. Exact CC0 texture sets to download (verified assets)

All CC0 (public domain), no attribution needed. Ship at **1K WebP** (mobile) and
**2K WebP** (desktop preset); keep 4K masters in the repo's raw-assets store only.

### Asphalt (road + junctions + parking lanes)

| Asset | Source | Character | Real scale | Notes |
|---|---|---|---|---|
| **`asphalt_02`** | polyhaven.com/a/asphalt_02 | weathered grey, coarse aggregate, subtle tar cracks, matte | **3 m wide** | 379k downloads; the safe default for city streets. Maps: diffuse, normal (GL), rough, AO, disp, + combined ARM. 1K/2K/4K/8K, JPG/PNG/EXR |
| `asphalt_04` | polyhaven.com/a/asphalt_04 | rougher, weathered, cracked | ~3 m | good SECOND asphalt for side streets (variety) |
| `clean_asphalt` | polyhaven.com/a/clean_asphalt | new, clean racetrack-grade | ~3 m | for the REF-1 "prosperous new district" boulevards |
| `aerial_asphalt_01` | polyhaven.com/a/aerial_asphalt_01 | flat cracked road shot from above, has lane-centre character | large | good MACRO/overlay source, not a micro tile |
| `Road007` | ambientcg.com/view?id=Road007 | modern pavement, smooth-to-patched, **7.5 × 7.5 m** tile | 7.5 m | large physical tile = repeats half as often; has baked lane markings variant — use the plain part or crop |
| `Asphalt025C` | ambientcg.com/view?id=Asphalt025C | dark, rain-soaked look | — | candidate for a dedicated WET albedo (see §8) |
| `Asphalt023S` | ambientCG | smooth grey, small 1.25 m tile | 1.25 m | too small for roads; fine for parking lots |

Recommendation: **`asphalt_02` as primary** (road+junction), `clean_asphalt` or
`Road007` as a second material for the financial-district boulevard, so not every
street is the same asphalt.

### Sidewalk / promenade pavers

| Asset | Source | Character | Real scale |
|---|---|---|---|
| **`Concrete047A`** | ambientcg.com/view?id=Concrete047A | clean modern urban pavement floor (tags: floor, pavement, urban) | — |
| `Concrete048` | ambientCG | clean smooth uniform grey floor (photogrammetry) | — |
| `Concrete046` | ambientCG | plain smooth grey | 2.4 m |
| **`PavingStones128`** | ambientcg.com/view?id=PavingStones128 | varied large stone blocks, **3.5 × 3.5 m** tile | 3.5 m |
| `PavingStones125A` / `PavingStones126A` / `PavingStones127` | ambientCG | large modern grey/dark-grey rectangular blocks, 3.5 m tiles | 3.5 m |
| `PavingStones070` | ambientCG | old small cobbles, 1.15 m | for old-Sofia districts later |

Recommendation: sidewalks = `Concrete047A` (or 048); **REF-1 waterfront promenade =
`PavingStones126A` + `PavingStones127` as the two tone bands** (the brief explicitly
calls out "large rectangular pavers, two tone bands" — two materials on two UV strips
gives exactly that).

### Grass / lawn

| Asset | Source | Character | Real scale |
|---|---|---|---|
| **`Grass001`** | ambientcg.com/view?id=Grass001 | dense fresh short garden grass (manicured) | **1.4 m** |
| `Grass004` | ambientCG | dense lush suburban lawn | 1.4 m |
| `Grass005` | ambientCG | clean short mowed | — |
| `leafy_grass` | polyhaven.com/a/leafy_grass | trampled green + scattered brown leaves/twigs — great REALISM breaker | ~2 m |
| `Ground003` | ambientCG | dirt/grass hybrid | — for the dry-patch blend layer |
| `aerial_grass_rock` | polyhaven.com/a/aerial_grass_rock | mossy rock/grass aerial | distant hills only |

Recommendation: `Grass001` (park lawns REF 3) + `Ground003` as a blend-in dirt layer.

### Manhole covers & street ironwork (decal atlas fodder)

- **cgbookcase.com — Manhole Cover 01…16**: 16 photoscanned CC0 manhole covers with
  metal/rough PBR maps + channel-packed variants (cgbookcase.com/textures/manhole-cover-01 … -16).
  Round + square variants; bake 3–4 into the decal atlas.
- **3dtexel.com/decals/** — 280+ CC0 PBR decals: cracks, leaks, road markings, patches,
  graffiti (site sometimes 403s scripted fetches; download manually in a browser).
- ambientCG also ships `Decal***` assets (search "Decal" category) — leaks/stains with alpha.

---

## 3. Fix the tiling scale FIRST (zero cost)

Current wiring tiles asphalt every **3.5 m** (UV = m/7, repeat 2) using textures whose
photographed patch is ~3 m — that's roughly correct, but grass tiles every **2.7 m**
with a 1.4 m-scale texture (2× too large → mushy) and the sidewalk at ~1.2 m is fine
only if the chosen concrete has ~1 m features.

Rule: `repeat = uvMetresPerTile / textureRealWorldMetres`.

- Asphalt `asphalt_02` (3 m): road UV = m/7 → repeat **7/3 ≈ 2.33** (keep [2.33, 2.33]).
- Grass `Grass001` (1.4 m): terrain UV = m/8 → repeat **8/1.4 ≈ 5.7** (now [3,3] = 2.7 m — visibly stretched).
- Sidewalk concrete (~2.4 m for Concrete046): V = m/2 → repeat **2/2.4 ≈ 0.83** per 2 m,
  i.e. [1, 0.83] — with slab-type pavers make sure the slab joints land at believable 0.4–0.9 m spacing.

Add a `realWorldSize` field to `GroupConfig` in `pbrTextures.ts` and compute repeat
instead of hand-tuning — then swapping textures never breaks scale again.

---

## 4. Anti-tiling techniques, ranked by GPU cost

### 4a. Macro variation map (DO THIS — 1 extra fetch, works on phones)

One shared 256×256 single-channel noise texture (Perlin/fBm, seamless), sampled in
world space at very low frequency (one tile per 60–120 m), multiplied into albedo and
optionally roughness. This is the classic technique from racing sims (rFactor2/AC road
shaders use exactly this "overlay/multiply high-frequency + low-frequency variation" split).

```ts
// makeMacroNoiseTexture(): 256px canvas fBm, THREE.RepeatWrapping, LinearMipmapLinear
const macroUniform = { value: macroTex };
material.onBeforeCompile = (shader) => {
  shader.uniforms.uMacro = macroUniform;
  shader.uniforms.uMacroScale = { value: 1 / 90 };   // one noise tile per 90 m
  shader.uniforms.uMacroStrength = { value: 0.22 };  // ±22% albedo swing
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec2 vWorldXZ;")
    .replace("#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvWorldXZ = (modelMatrix * vec4(position,1.0)).xz;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>",
      "#include <common>\nuniform sampler2D uMacro;\nuniform float uMacroScale;\nuniform float uMacroStrength;\nvarying vec2 vWorldXZ;")
    .replace("#include <map_fragment>", `#include <map_fragment>
      float macro = texture2D(uMacro, vWorldXZ * uMacroScale).r;
      diffuseColor.rgb *= mix(1.0 - uMacroStrength, 1.0 + uMacroStrength, macro);
    `);
  // optional: also perturb roughness after <roughnessmap_fragment>:
  //   roughnessFactor = clamp(roughnessFactor * mix(0.9, 1.1, macro), 0.04, 1.0);
};
material.customProgramCacheKey = () => "macro-v1"; // avoid recompiles per instance
```

World-space sampling (not UV) means road, junction, parking lanes AND terrain all pick
up the SAME patchiness field → surfaces knit together and the road/plaza boundary
stops being a material seam. Share one `macroUniform` across all ground materials.

CAVEAT (r0.185): keep the replace anchors (`<map_fragment>`, `<worldpos_vertex>`)
verified against `node_modules/three/src/renderers/shaders/ShaderChunk/` after any
three upgrade — chunk names are stable but not guaranteed.

### 4b. Vertex-colour tinting (FREE at runtime)

Our world geometry is procedurally built (`meshDataToGeometry`) — add a `color`
attribute in the builder and set `vertexColors: true` (facades already use this).
Bake at build time:

- low-frequency value noise per vertex (±8% luminance) — breaks up block-scale sameness;
- **lane-wear darkening**: vertices along each lane centre ×0.85–0.9, vertices on the
  two wheel tracks ×0.8 (offset ±0.9 m from lane centre) — this is the racing-game
  "groove/wear map" trick done for free in vertex data. Roads need a couple of extra
  length-wise vertex rows for this (builder change in roads.ts);
- junction polish: slightly darker centre where cars idle (oil zone).

`vertexColors` multiplies `map` — combined with the wetness `color` tint it composes fine.

### 4c. Two-scale self-blend (2 fetches, no new assets)

Sample the same albedo at 1× and 0.22× scale and average — halves perceived repetition
for one extra fetch. Cheap fallback if 4a's noise texture budget is contested; usually
4a + 4b is better.

### 4d. `three-hex-tiling` (the heavy hitter — desktop preset only)

github.com/Ameobea/three-hex-tiling (demo: three-hex-tiling.ameo.design). `npm i
three-hex-tiling`, `import 'three-hex-tiling'` once, then
`new MeshStandardMaterial({ ..., hexTiling: { patchScale: 2 } })`.

- Hides repetition completely by hex-tile blending offset copies (Heitz/Deliot 2018/19
  histogram-preserving blending → Unity "Procedural Stochastic Texturing").
- Supports `map`, `normalMap`, `roughnessMap` on MeshStandard/MeshPhysical.
- Cost: **up to 3 texture fetches per map per fragment** — 4 maps × 3 = 12 fetches on
  the road material. Fine on desktop GPUs, risky on phones. Gate behind
  `preset.quality === 'high'`.
- Tested three r0.151–r0.173; we're on r0.185 → **verify the shader patch applies** —
  it installs its own `onBeforeCompile`, so it will CONFLICT with 4a's — if both are
  wanted, apply macro variation inside its patched shader or choose one per material.
- Cannot be toggled after material creation (recreate material on preset change; we
  already recreate materials on preset change, so OK).

### 4e. Detail normal (sharpens close-ups under the cockpit camera)

The 3 m asphalt tile goes blurry at <2 m viewing distance (cockpit view looks at
asphalt 3–10 m ahead constantly). Add a second, high-frequency normal sampled at ~8×
UV, blended with the base normal (UDN blend — cheap and fine for ground):

```glsl
// after <normal_fragment_maps>
vec3 dtl = texture2D(uDetailNormal, vUv * 8.0).xyz * 2.0 - 1.0;
normal = normalize(vec3(normal.xy + dtl.xy * 0.5, normal.z));
```

Use the 1K normal of the SAME asphalt set as its own detail (offset scale) — zero new
downloads. (Higher-quality alternative: Stephen Hill's reoriented normal mapping, see
nathanpointer.com/blog/landscapes which demonstrates splat + variation + RNM blending
in three.js.)

---

## 5. Road decals — cracks, patches, oil, manholes, wear (the big one)

### Architecture: ONE static batched quad mesh + ONE atlas. NOT DecalGeometry.

`THREE.DecalGeometry` is for projecting onto curved/unknown surfaces. Our roads are
flat planes → decals are just textured quads co-planar with the road. Batch every
decal in the district into a single `BufferGeometry` (positions + atlas UVs), one
`MeshStandardMaterial`, **one draw call**.

Material settings (three.js official decal recipe, from `webgl_decals` example):

```ts
new THREE.MeshStandardMaterial({
  map: decalAtlas,            // RGBA, alpha = decal mask
  normalMap: decalNormalAtlas,// optional but sells cracks
  transparent: true,
  depthWrite: false,          // decals never write depth
  polygonOffset: true,
  polygonOffsetFactor: -4,    // pulls fragments toward camera in depth → no z-fight
  roughness: 0.95,
});
mesh.renderOrder = 1;         // after the road (road = default 0)
mesh.receiveShadow = true;
```

`polygonOffset` beats Y-lifting quads (lifted quads shear visibly at grazing cockpit
angles and break under shadow bias); keep quads EXACTLY co-planar with the road.

### Atlas content (2048×2048, 4×4 grid of 512² cells)

| Cells | Content | Source |
|---|---|---|
| 3 | tar-sealed crack networks (the wandering black snakes) | 3DTexel CC0 decals / ambientCG Decal* |
| 2 | rectangular asphalt repair patches (darker, newer asphalt) | 3DTexel; or crop from `asphalt_04` |
| 2 | oil/drip stains (junction centres, parking stalls) | 3DTexel leaks |
| 3 | manhole covers (2 round, 1 square) | cgbookcase Manhole Cover 01–16 |
| 1 | rectangular gully/storm-drain grate (place in gutter at corners) | cgbookcase / 3DTexel |
| 2 | faded pedestrian-crossing / worn stop-line variants | authored (see §7) |
| 2 | dirt pooling / water-stain blotches for gutters + parking | 3DTexel |
| 1 | tire-mark arc (junction turns) | 3DTexel or authored |

Compose the atlas headlessly in our existing Blender pipeline (`tools/blender/*.py`)
or plain canvas/sharp script; keep a JSON manifest `{ name, uvRect, sizeMetres }`.

### Placement rules (procedural, deterministic seed per district)

- Manholes: 1–2 per road segment, offset 0.5–1.5 m from lane centre (never ON the
  lane line); square ones on sidewalks. Rotate randomly.
- Gully grates: at junction corners, snapped against the curb line.
- Cracks: seeded along segment edges + around manholes (real cracks start at ironwork).
- Patches: 2–4 per block, axis-aligned-ish with the road direction, slight rotation.
- Oil: junction centre boxes + parking stalls (REF 1 parking lot!).
- Density knob per quality preset: mobile 40%, desktop 100% of placements.

Wetness hook: decals share the road's wetness response — reuse `wetnessToRoadParams`
to drop the decal material roughness in rain so oil patches go glossy first (they're
already the lowest-roughness cells if the atlas roughness channel is authored).

### Wear lines (lane grime)

Do NOT decal these — they're continuous. Use §4b vertex-colour wheel-track darkening,
plus (optional, later) a 1D gradient "wear" texture in U across each lane sampled in
the road shader — this is exactly the rFactor2/Assetto "groove map" approach.

---

## 6. Curbs & gutters

Current state: sidewalks are flat strips co-planar-ish with the road → the street
edge reads painted-on. Fix with real (cheap) geometry:

- **Curb profile** extruded along every road edge in the builder: 15 cm rise,
  **1.5–2 cm chamfer on the top street-facing edge** (the chamfer is the whole point —
  a sharp 90° edge catches no light and reads CG; the chamfer catches the golden-hour
  sun in REF 1). 6–8 vertices per cross-section ring, rings only at curve subdivisions
  → a few thousand tris per district. Merged into StaticWorld, concrete PBR set,
  U = cross-section (so the chamfer gets its own texel band), V = metres along.
- **Gutter band**: 30 cm asphalt strip against the curb, vertex-tinted ×0.75 (grime
  collects there) + dirt-pool decals from the atlas near corners. Zero extra geometry —
  it's a vertex-colour band on the road mesh.
- **Dropped curbs** at pedestrian crossings and driveways (lerp curb height to 2 cm
  over 1 m) — a driving-school-critical detail (students must see where crossings are).
- Optionally paint curb segments near junctions: Bulgarian no-parking curbs are
  yellow/black — that's a `lawRefs`-relevant visual and trivially a vertex-colour or
  second material group on the curb mesh.

Games do this with trim sheets (one strip texture with curb top/face/gutter bands);
our concrete set + the U-cross-section UV mapping achieves the same with assets we
already ship.

---

## 7. Markings — stop them glowing

`geometries.markings` currently renders flat `0xe9e7df`, roughness 0.85, and receives
no asphalt texture → reads like fresh plastic tape (REF 5 complaint).

- Give the markings material the SAME asphalt normal+roughness maps (world-scale UVs)
  so paint sits ON the asphalt texture; keep albedo near-white `#e8e6dc`, roughness 0.7.
- Erode edges: multiply alpha by the macro noise (§4a) so line edges break up —
  `transparent: true, alphaTest: 0.35` on a noise-modulated alpha keeps it one draw call
  (alphaTest avoids sorting).
- Age tint by vertex colour: dashed centre lines slightly darker than fresh stop lines.
- Crossings ("zebra") as decal-atlas entries with pre-authored wear (worn where wheels
  cross — see any CC0 crosswalk decal or author in Blender).

---

## 8. Lawn / grass that doesn't read flat

REF 3's believability driver is lawns + trees, and REF 5 says our lawn is "saturated
flat green". Fixes, in order:

1. **Texture**: `Grass001`/`Grass004` at TRUE 1.4 m scale (§3 — currently ~2× stretched).
2. **Kill the saturation**: desaturate the tint toward `#6a7f4a`-ish olive; real turf
   under golden-hour sun is yellow-green, never RGB-green. Set `roughness: 1.0`,
   NO normal-map specular sparkle (grass is matte at distance).
3. **Two-tone macro tint** (same §4a hook): lerp albedo between a warm dry tone and a
   cool lush tone by the shared macro noise — this is the single biggest "not a green
   sticker" fix and costs the fetch we already pay.
4. **Dry-patch blend**: second albedo (`Ground003` dirt/grass) blended in where a
   second noise octave exceeds a threshold — smoothstep blend, +1 fetch. Desktop preset.
5. **Soil edge strip**: 10–15 cm darker band where lawn meets curb/sidewalk (vertex
   colour in the terrain builder) — grounds the lawn against the pavement.
6. **Optional (hero areas only)**: a sparse ring of camera-facing grass-card instances
   along lawn EDGES within ~15 m of the road (edges are where flatness is visible;
   filling whole lawns is wasted). ~500–2000 instances, one InstancedMesh, one 128²
   alpha card texture — standard cheap-grass approach; full GPU-grass systems
   (compute-shader blades) are overkill for a driving sim viewed from a car.

---

## 9. Concrete wiring plan (maps to our files)

1. `pbrTextures.ts`
   - add `realWorldSize` per group + compute repeat (§3);
   - add groups: `"pavers"` (promenade), `"decals"` (atlas), optional `"asphalt2"`;
   - switch files from `.png` to `.webp` (browser-decoded, ~4–8× smaller downloads;
     `TextureLoader` handles WebP natively). NOTE: WebP does NOT save VRAM (decodes to
     RGBA8). True VRAM savings need KTX2/BasisU — `toktx` is absent locally, but the
     `basisu` CLI (binomial LLC GitHub releases, Windows exe) encodes `.ktx2` directly
     (`basisu -ktx2 -uastc` for normals, ETC1S for albedo) and three.js `KTX2Loader`
     +`meshoptDecoder` is already available via drei. Phase 2; WebP now.
   - load a shared `macroNoise` texture once, export its uniform.
2. `StaticWorld.tsx`
   - attach the §4a `onBeforeCompile` (one helper `withMacroVariation(material)`) to
     terrain, terrainPaved, road, junctions, parkingLanes, sidewalks — same shared
     uniform → surfaces knit;
   - set `customProgramCacheKey` so the six materials share one program;
   - markings material: add asphalt normal/rough maps + alphaTest erosion (§7);
   - new `<mesh>` for the batched decal quads (renderOrder 1, §5 material).
3. Builder (`roads.ts` / `terrain.ts` / new `decals.ts`)
   - emit `color` vertex attribute (block noise + wheel-track darkening + gutter band
     + soil edge strip);
   - emit curb extrusion geometry (§6);
   - emit decal quad batch from seeded placement rules + atlas manifest (§5).
4. Quality presets (`quality.ts`)
   - mobile: macro variation ON (cheap), decals 40%, no detail normal, no hex tiling;
   - desktop-high: decals 100%, detail normal ON, optionally `three-hex-tiling` on the
     road material only (watch the onBeforeCompile conflict, §4d).

## 10. Budget sanity

- New draw calls: +1 (decals) +1 (curbs, merged) +0 (markings/vertex colours) — trivial.
- Texture memory @2K WebP-decoded: asphalt set ~67 MB VRAM at 4×2K RGBA + mips…
  → ship ground sets at **1K on mobile / 2K desktop**; 2K×2K RGBA ≈ 22 MB with mips
  per 4-map set — 3 sets + atlas ≈ 90–100 MB at 2K, ~25 MB at 1K. This is exactly why
  the KTX2/BasisU phase 2 matters (÷4–6 in VRAM).
- Fragment cost added on ground pixels: +1 fetch (macro) +1 (detail normal, desktop)
  — negligible vs the existing N8AO pass.

## 11. Sources

- Poly Haven: polyhaven.com/a/asphalt_02 (3 m scale, maps/res verified), /a/asphalt_04,
  /a/clean_asphalt, /a/aerial_asphalt_01, /a/leafy_grass, /a/aerial_grass_rock
- ambientCG (CC0, API-verified IDs & physical sizes): Road007 (7.5 m), Asphalt025C,
  Asphalt023S (1.25 m), Concrete046 (2.4 m)/047A/048, PavingStones125A/126A/127/128
  (3.5 m), PavingStones070 (1.15 m), Grass001/004 (1.4 m), Grass005, Ground003
- cgbookcase.com: Manhole Cover 01–16, photoscanned CC0 decal sets
- 3dtexel.com/decals — 280+ CC0 PBR street decals (cracks/leaks/markings/patches)
- three-hex-tiling: github.com/Ameobea/three-hex-tiling + discourse.threejs.org thread
  58251 (params, 3-fetch cost, r0.151–0.173 compat, onBeforeCompile conflict)
- Stochastic texturing background: Heitz/Deliot, Jason Booth medium.com/@jasonbooth_86226/stochastic-texturing-3c2e58d76a14
- three.js decal recipe: mrdoob/three.js examples/webgl_decals.html
  (depthWrite:false, polygonOffset:true, factor:-4), Material.polygonOffset docs
- Terrain splat/variation/normal-blend in three.js: nathanpointer.com/blog/landscapes
- Racing-sim road shaders (wear/groove/overlay split): docs.studio-397.com
  developers-guide PBR road/curb shader; assettocorsamods.net road-surface threads
- Extending MeshStandardMaterial: medium.com/@pailhead011/extending-three-js-materials-with-glsl,
  threejs-journey.com/lessons/modified-materials
