# Quality gap 06 — REF-4-level vehicle detail in real-time web budgets

Research date: 2026-07-10. Lane: hero-vehicle (de-badged boxy luxury SUV, REF 4) + traffic fleet
quality step-up, within ADR-005 (Three.js + R3F, 60 fps mid-range, eventually phones).

Sources are cited inline. Where a number is an anchor from console racing games, it is labeled
as such — our budget is derived from the *gameplay* LODs of those games, not showroom LODs.

---

## 1. What tri-count does a "showroom-adjacent" web car need?

Cross-checked anchors:

| Context | Tris | Source |
|---|---|---|
| Hero car, standard game | **40,000–80,000** | [SunStrike Studios car-modeling guide](https://sunstrikestudios.com/en/blog/car_modeling_for_games/) |
| Hero car, racing sim | 80,000–200,000 | same |
| Traffic / background car | **5,000–25,000** | same |
| Fully explorable car incl. interior | ~100,000 | [Polycount hero-car thread](https://polycount.com/discussion/160634/polycount-maps-size-and-workflow-for-hero-car-model-with-interiors) |
| Open-world (GTA-style) per-vehicle | 30–50k | same thread |
| Forza Motorsport 3 **LOD0 (showroom)** | 172,753 | [GTPlanet FM3 polycounts](https://www.gtplanet.net/forum/threads/forza-3-real-polygon-counts-revealed.132603/) |
| Forza Motorsport 3 **LOD1 (gameplay)** | **45,074** | same — this is the key anchor: a AAA racing game *drove* cars at ~45k |
| GT7 / FM4 source models | 500k–1M | [GTPlanet GT7](https://www.gtplanet.net/gran-turismo-7s-car-models-use-500000-polygons-each/) — offline-adjacent, NOT our target |
| Khronos real-time delivery guidance | ≤100k per asset | via [Neural4D polygon guide](https://blog.neural4d.com/user-guide/polygon-count-for-3d-game-assets-printing-and-webar/); WebAR hard ceiling 50k |
| Mobile game assets | 1,500–5,000 | same |

**Recommended budgets for us (browser, one hero + ~8–15 traffic instances):**

- **Hero SUV exterior (chase cam + parked-close): 35–60k tris** LOD0. This is FM3-gameplay
  class and inside the Khronos envelope with headroom for the city.
- **Hero cockpit interior (REF 2 contract — it fills 40–50% of frame every second of play):
  15–30k tris** for dash + wheel + binnacle + mirrors + visible seat/door tops. The interior
  deserves proportionally MORE texture/geo budget than the exterior because it is always
  6 inches from the camera. (Polycount consensus: car-with-interior ≈ 100k total; we can ship
  ~60–90k total for hero.)
- **Hero LOD1 (chase/traffic distance): 8–15k**, LOD2 impostor/box ~1–2k.
- **Traffic fleet v2: 1.5–4k tris each** (founder already accepted 1–3k) — consistent with
  "traffic 5–25k" guidance scaled down for 10+ simultaneous instanced vehicles on phones.
- Phones later: drop hero to LOD1 as player car in chase view, keep cockpit interior but halve
  texture sizes.

Draw calls matter as much as tris: keep the hero to **≤8–10 materials/groups** (paint, glass,
chrome/trim, black plastic/cladding, rubber, lights-emissive, interior-A, interior-B, wheel).
Wheels = 1 mesh instanced 4×.

---

## 2. Blender workflow: what makes low-poly read high-poly

### 2a. Skip the full high→low bake for the body — use MID-POLY + weighted normals

The classic pipeline (subd high-poly → retopo → bake normal/AO, per
[NastyRodent baking guide](https://nastyrodent.com/high-poly-to-low-poly-baking/),
[SunStrike](https://sunstrikestudios.com/en/blog/car_modeling_for_games/)) costs a senior
artist **4–8 weeks per hero car** (SunStrike). For a solo founder the industry's answer is the
**mid-poly workflow**: model once at final resolution, put real bevels on every visible edge,
and let **weighted normals** do the smoothing — no bake at all.

- Reference: [Blacksteinn "MIDPOLY: the ultimate guide"](https://blacksteinn.artstation.com/blog/7o3WB/midpoly-the-ultimate-guide-with-all-working-nuances),
  [Polycount weighted-normals workflow](https://polycount.com/discussion/238054/weighted-normals-mid-poly-workflow-clarification),
  [80.lv mid-poly in UE5](https://80.lv/articles/creating-assets-within-the-mid-poly-workflow-in-ue5).
- Key rules extracted:
  - Every edge the camera can catch a highlight on gets a **real bevel, 1 segment** (2–3
    segments only on big hero radii like wheel-arch flares). A lit bevel is what separates
    "toy" from "product shot" — sharp 90° CG edges never catch light; real cars have 2–5 mm
    radii everywhere.
  - After beveling, add the **Weighted Normal modifier** (or face-weighted normals): big flat
    faces dominate the vertex normals, bevels take the transition — surfaces go
    highlight-perfect without support loops or subd.
  - Mark **hard edges (Autosmooth/sharp)** only where a genuine material/panel break exists;
    everywhere else stay smooth + weighted.
  - This is ideal for REF 4 specifically: a G-Class-type SUV is slab-sided hard-surface —
    the exact geometry class mid-poly was invented for. A curvy sports car would argue for
    subd+bake; the boxy SUV does not.
- **Custom-normal transfer trick** (free smoothness): Data Transfer modifier → Face Corner
  Data → Custom Normals, source = a smooth proxy (e.g. subd or simplified shrink-wrapped
  hull). Fixes low-poly shading without adding geometry.
  [Blender manual](https://docs.blender.org/manual/en/latest/modeling/modifiers/modify/data_transfer.html),
  [Yarsa Labs tutorial](https://blog.yarsalabs.com/normal-transfer-in-blender/). Use
  face-interpolated mapping. NOTE: custom normals survive glTF export (exporter writes them
  as NORMAL attribute) — this works in three.js with zero runtime cost.

### 2b. Where baking still pays

- **Panel gaps / shut lines**: don't model door gaps as geometry on LOD0-web. Bake or paint a
  **normal + AO strip texture** for shut lines, or use a thin dark inset bevel (1 extra loop,
  darker material) — Polycount thread confirms normal maps are best for fine detail, not base
  shape.
- **Tire tread**: "tread can be baked into normal maps for runtime versions" (SunStrike).
  A 512×512 tiling tread normal on a smooth torus-ish tire reads perfectly at our distances.
- **AO bake is the single biggest "grounding" win**: bake per-vehicle AO (wheel wells, under
  cladding, grille recess, mirror roots) either to a 1K AO texture (share UV2) or — cheaper
  for our untextured procedural fleet — **to vertex colors** and multiply in the material
  (three.js `vertexColors: true` or `aoMap`). Costs ~0 bytes vs textures.
- Baking mechanics if used: low-poly active + high-poly selected, use cages, explode parts,
  match UV seams to hard edges ([NastyRodent](https://nastyrodent.com/high-poly-to-low-poly-baking/),
  [Blender Artists 4.5 baking](https://blenderartists.org/t/normal-baking-in-blender-4-5-high-poly-to-low-poly-workflow/1604801)).

### 2c. Topology hygiene (SunStrike)

- Quad-dominant flows following curvature; poles parked in flat/hidden areas, never mid-panel.
- Avoid razor-thin bevels that alias/collapse in mips — use pragmatic widths (they survive
  distance).
- Mirror the body (L/R), keep bumpers/hood/roof as separate unique meshes so trims differ.

---

## 3. Car paint in three.js — exact values from real projects

### 3a. Base recipe (official three.js car example)

[`webgl_materials_car`](https://threejs.org/examples/webgl_materials_car.html) (the Ferrari
demo — the canonical web car shader), exact source values:

```js
bodyMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xff0000, metalness: 1.0, roughness: 0.5,
  clearcoat: 1.0, clearcoatRoughness: 0.03
});
detailsMaterial = new THREE.MeshStandardMaterial({   // chrome/details
  color: 0xffffff, metalness: 1.0, roughness: 0.5
});
glassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, metalness: 0.25, roughness: 0, transmission: 1.0
});
// renderer: ACESFilmicToneMapping, exposure 0.85, HDR equirect env (venice_sunset_1k)
```

The counter-intuitive part that makes it work: **metalness 1.0 + roughness ~0.5 UNDER a
clearcoat 1.0 / clearcoatRoughness 0.03** — the rough metallic base is the paint pigment +
flake layer, the near-mirror clearcoat supplies the crisp environment reflection. This is the
"deep gloss" look REF 4 needs. Configurator-community variants
([three.js forum](https://discourse.threejs.org/t/making-realistic/88207)) run
`roughness: 0.1–0.4, metalness: 0–1, clearcoat: 1.0, clearcoatRoughness: 0.03–0.1`.

**For REF-4 gloss black:** `color #050505–#0a0a0a, metalness 0.9, roughness 0.45,
clearcoat 1.0, clearcoatRoughness 0.02–0.05, envMapIntensity 1.0–1.5`. Black paint is 95%
reflection — it lives or dies on the env map, not the base color (see env note below).

### 3b. Metallic flake approximation (cheap, shipped in three.js)

Official example [`webgl_materials_physical_clearcoat`](https://threejs.org/examples/webgl_materials_physical_clearcoat.html)
"car paint" ball — exact values:

```js
import { FlakesTexture } from 'three/addons/textures/FlakesTexture.js'; // procedural canvas, 0 bytes download
const flakes = new THREE.CanvasTexture(new FlakesTexture());
flakes.wrapS = flakes.wrapT = THREE.RepeatWrapping;
flakes.repeat.set(10, 6);        // scale up for a car body: ~40–80 repeats
flakes.anisotropy = 16;
material = new THREE.MeshPhysicalMaterial({
  color: 0x0000ff, metalness: 0.9, roughness: 0.5,
  clearcoat: 1.0, clearcoatRoughness: 0.1,
  normalMap: flakes, normalScale: new THREE.Vector2(0.15, 0.15)
});
```

Mechanism: high-frequency random normal perturbation on the BASE layer only; the clearcoat
keeps its own smooth normal, so sparkles dance under a stable gloss — exactly how offline
flake shaders layer it ([Maxon flakes](https://help.maxon.net/r3d/katana/en-us/Content/html/Shader+Flakes.html),
[2pha three.js car-paint shader](https://2pha.com/blog/threejs-car-paint-shader-recreating-radeon-9700-demo/)).
For gloss BLACK (REF 4) flakes are nearly invisible — skip them on the hero, keep for
metallic traffic paints (silver/blue/red metallics gain the most).

Custom multi-lobe carpaint shaders exist ([three.js forum job thread](https://discourse.threejs.org/t/need-a-developer-for-creating-custom-carpaint-shader/7058))
but MeshPhysicalMaterial clearcoat + FlakesTexture is the accepted real-time web
approximation; not worth custom GLSL for our use.

### 3c. Cost discipline

MeshPhysicalMaterial is the most expensive built-in material; every enabled feature adds cost
([three.js docs](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)). Rules:
- clearcoat ON only for paint. Trim/chrome/rubber stay MeshStandardMaterial.
- **NO `transmission` on car glass in gameplay** — transmission triggers an extra scene
  render to a transmission render target; forum-measured 55–60 → ~30 fps on mobile for one
  transmissive mesh ([discourse](https://discourse.threejs.org/t/adding-meshphysicalmatreial-to-create-a-glass-like-semi-transparent-material-drops-the-the-performance/29073)).
- Sheen: not for cars (fabric lobe). Skip.

---

## 4. Glass / chrome / rubber / cladding — settings table

REF 4 has dark tinted glass — the cheapest possible case, because you can't see through it
anyway:

| Material | three.js settings | Notes |
|---|---|---|
| **Tinted SUV glass (exterior)** | `MeshPhysicalMaterial{ color:#0a0d10, metalness:0.9, roughness:0.05, envMapIntensity:1.2, transparent:true, opacity:0.92 }` — or fully **opaque** near-black glossy | NO transmission. Dark tint = env reflection dominates; opaque dark glass is visually identical at gameplay distance and costs one cheap opaque draw. Alpha only if interior silhouette must show. |
| **Windshield from cockpit (interior)** | no mesh at all, or `opacity 0.03–0.06` flat tint quad | never transmission |
| **Chrome (grille slats, trim)** | `MeshStandardMaterial{ color:#ffffff, metalness:1.0, roughness:0.08–0.15 }` | official example uses roughness 0.5 for brushed look; REF-4 bright slats want 0.1. Chrome is 100% env map — flat grey without a good HDRI. ([SunStrike](https://sunstrikestudios.com/en/blog/car_modeling_for_games/): "high metallic, low roughness, accurate fresnel") |
| **Tire rubber** | `MeshStandardMaterial{ color:#151515, metalness:0.0, roughness:0.85–0.95 }` + tiling tread normal (512², repeat) | "mid-roughness, muted specular" (SunStrike). NEVER pure black (#000 kills all shading) |
| **Matte cladding / arches (REF 4)** | `MeshStandardMaterial{ color:#101010, metalness:0.0, roughness:0.7–0.8 }` | the paint-vs-cladding gloss CONTRAST is what sells the G-Class look — two blacks, different roughness |
| **Red calipers / pinstripe** | `MeshStandardMaterial{ color:#b80f14, metalness:0.2, roughness:0.35, clearcoat via Physical if budget allows }` | small area, safe to make Physical |
| **Lights: LED DRL rings** | `MeshBasicMaterial` or Standard with `emissive:#ffffff, emissiveIntensity 2–4` → picked up by bloom | emissive cards, not geometry, at LOD1 (SunStrike LOD advice) |

**Env map is half the vehicle's look.** All of the above assume a proper scene environment.
Current `sky_urban_1k.hdr` via drei `<Environment>` is correct plumbing; for the warm REF-1
golden hour, swap to a **golden-hour HDRI** and/or add a low-res dynamic CubeCamera probe
(64–128px, update every N frames or on teleport) so buildings actually smear across the black
paint. A static HDRI alone makes the car look pasted-in when driving between towers.

---

## 5. Wheels & brakes — where detail is cheapest per pixel

Wheels are ~25% of a car's perceived quality (constantly rim-lit, high-contrast). Strategy per
[SunStrike](https://sunstrikestudios.com/en/blog/car_modeling_for_games/):

- **Modular**: rim / tire / brake disc / caliper / center cap as separate meshes with clean
  pivots; author ONE wheel, instance 4× (and mirror). Build a small rim library for the
  traffic fleet.
- **Hero cross-spoke rim (REF 4)**: cross-spoke is geometry-hungry. Budget **4–8k tris per
  wheel** (16–32k for 4 — up to half the exterior budget; this is normal for hero cars).
  Cheats: model ONE spoke pair + array-radial 7–9×; keep inner barrel simple; red pinstripe
  as a thin torus with its own material (or texture ring), not paint on geometry.
- **Caliper**: a 150–300-tri box with bevels + red material, placed behind the spokes —
  reads instantly at any distance because of the color. Brake disc: flat cylinder +
  radial-brushed roughness/normal texture (or just anisotropic-looking grey), 100–200 tris.
- **Tire**: smooth profile revolve (24–32 segments), sidewall bulge modeled, tread = tiling
  normal map. Realistic sidewall PROFILE matters more than tread geometry.
- **LODs**: collapse spoke count, flatten tread, drop disc/caliper at LOD1+ (SunStrike:
  far LODs collapse spokes, tail lights → emissive cards).
- Low-profile-tire + big-rim proportion (REF 4: 21–22") is itself a strong "expensive" cue —
  proportions are free.

---

## 6. Textures without KTX2 (toktx absent) + Draco caveats

- **Use WebP via gltf-transform** — needs NO toktx: `gltf-transform webp in.glb out.glb` or
  `optimize --texture-compress webp`. three.js GLTFLoader supports `EXT_texture_webp`
  natively ([GLTFLoader docs](https://threejs.org/docs/#examples/en/loaders/GLTFLoader),
  [Don McCurdy web texture formats](https://www.donmccurdy.com/2024/02/11/web-texture-formats/)).
  Caveat: WebP decompresses fully on GPU (RGBA) — keep vehicle textures small: hero
  1K AO + 512 tread normal + 512 detail/badge-free trim atlas ≈ fine. (Install KTX-Software
  later for GPU-resident compression when the city textures grow.)
- **Draco on smooth car bodies**: default normal quantization can band the paint highlight —
  documented artifact class ([gltf-pipeline #451](https://github.com/AnalyticalGraphicsInc/gltf-pipeline/issues/451)).
  Fix: raise `--draco.quantizeNormalBits` to **10–12** (default 8/10 depending on tool) and
  positions to 14 for the hero; the byte cost is trivial at our sizes
  ([glTF-Transform discussion](https://github.com/donmccurdy/glTF-Transform/discussions/1687)).
  If the paint highlight "steps" across the hood after compression, this is why.
- **Clearcoat survives the Blender→GLB pipeline**: Blender's glTF exporter writes
  `KHR_materials_clearcoat` automatically when Principled BSDF Coat/Coat Roughness are
  non-zero ([Blender manual](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html),
  [Khronos blog](https://www.khronos.org/blog/blender-gltf-i-o-support-for-gltf-pbr-material-extensions));
  three.js GLTFLoader imports it into MeshPhysicalMaterial. So paint values can be authored
  ONCE in `boxy_suv.py` (`coat=1.0, coat_rough=0.03`) instead of patched in JS. Clearcoat
  textures must be Non-Color/Data color space.

---

## 7. Step-up path from the current 37 KB procedural SUV

Current state: `tools/blender/boxy_suv.py` (536 lines) already encodes the REF-4 feature list
(cladding, red accents, cross-spoke wheel with pinstripe, trim materials with `coat=`), plus
`vitok-body.glb` (193 KB) + `vitok-wheel.glb` (28 KB) hero sedan. Three candidate paths:

### Option A — Better procedural (upgrade boxy_suv.py) — RECOMMENDED FIRST
- Add: bevel-everything pass (bmesh bevel 2–6 mm on every visible edge) + Weighted Normal
  modifier before export; vertex-color AO bake step; raise silhouette segment counts; model
  the REF-4 signature parts that carry 80% of recognition (fender-top indicator pods, exposed
  hinges, running boards, side-exit exhausts, spare-wheel back, round DRL rings as emissive
  torus). Target 25–45k tris.
- Pros: stays in the existing headless pipeline, versioned, de-badged by construction
  (ADR-001-clean), iterate in minutes, zero licensing risk. Cons: ceiling on organic curvature
  (irrelevant for a boxy SUV — its curvature IS boxes).
- Effort: days, not the industry's 4–8 weeks, because mid-poly + procedural + boxy geometry.

### Option B — Rodin/AI mesh + retopo (already integrated via blender-mcp)
- Rodin Gen-2 is the strongest AI generator for hard-surface/mechanical fidelity, but output
  is "a source mesh, not a final asset": triangle soup that must be retopologized, baked to
  low-poly, and LOD'd ([StraySpark generative-3D comparison 2026](https://www.strayspark.studio/blog/generative-3d-tools-comparison-meshy-rodin-tripo-csm-2026),
  [Neural4D](https://blog.neural4d.com/comparisons/rodin-hyper3d-alternatives/): "10M-polygon
  hero asset is still triangle soup"). Swirling topology bakes badly and resists clean LODs.
- Sensible use: generate as a **proportion/detail REFERENCE or bake SOURCE** (high-poly to
  bake normals/AO from), never as the runtime mesh. Also: prompting "G-Class" produces
  trademark-shaped output — ADR-001 risk lives in the silhouette details you'd keep.
- Verdict: good for ONE-OFF organic props; for the hero SUV it costs the retopo anyway, so
  it saves little over Option A on a boxy body.

### Option C — CC0 base mesh + rework
- Genuinely CC0 car meshes exist ([Sketchfab CC0 tag](https://sketchfab.com/tags/cc0),
  unityfan777's public-domain concept cars, [madjin/awesome-cc0](https://github.com/madjin/awesome-cc0),
  Blend Swap CC0) — but almost none are boxy-luxury-SUV shaped, quality is uneven, and any
  non-CC0 "free" G-Class on Sketchfab is typically CC-BY *and* a trademark-derivative — double
  problem under ADR-001. Verdict: usable for the traffic fleet as reference; wrong tool for
  the hero.

### Recommended sequence
1. **Option A now**: bevels + weighted normals + AO vertex bake + signature REF-4 parts into
   `boxy_suv.py`; export with clearcoat authored in Blender; 25–45k tris, Draco with
   normal-bits 10–12. Expected GLB: 300–800 KB — still trivial to stream.
2. **Cockpit interior as its own module** (dash/wheel/binnacle 15–30k, 1K interior AO) —
   REF 2/6 makes this the highest-ROI vehicle work in the whole sim.
3. **Materials pass in R3F** exactly per §3–4 tables + golden-hour env swap + optional
   CubeCamera probe.
4. Later, if the body still reads "procedural": Rodin high-poly of ONE fascia/detail region →
   bake a normal/AO detail texture onto the procedural low-poly (best of both).

---

## 8. Acceptance checklist for "REF-4-adjacent" (what reviewers actually see)

- [ ] Every visible edge catches a bevel highlight (no razor CG edges)
- [ ] Two distinct blacks: deep clearcoat paint vs matte cladding, obviously different gloss
- [ ] Chrome slats mirror the environment (not flat grey) — env map verified in-scene
- [ ] Sparkling/crisp env reflection sweeps across body while driving (clearcoatRoughness ≤0.05)
- [ ] Wheels: cross-spoke depth, red caliper visible through spokes, dark barrel shadow (AO)
- [ ] Tires have sidewall bulge + tread normal, roughness ~0.9, not #000
- [ ] DRL rings emissive and blooming subtly at dusk
- [ ] AO grounding: dark wheel wells, grille recess, under-body shadow (vertex AO or aoMap)
- [ ] No transmission anywhere on vehicles; ≤10 materials on hero; 4 wheels = 1 instanced mesh
- [ ] 60 fps retained with hero + 12 traffic on mid-range hardware
