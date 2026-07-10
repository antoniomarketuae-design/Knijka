# 02 — Trim sheets & facade atlases for the building kit (research findings)

Research lane: game-industry trim-sheet / texture-atlas workflow for building facades and
modular environment kits, and how to drive it from **headless Blender Python** for our
`tools/blender/district_kit_v3.py` generators (16-building kit, 238 facade prisms, flat-color
materials, zero UVs today). Written 2026-07-10.

---

## 1. Why trim sheets/atlases are THE industry standard for game cities

- A **trim sheet** is a texture that is split into full-width horizontal **strips**, each strip a
  different material/detail (window band, concrete band, cornice, retail frame, grunge). Strips
  **tile along U** (horizontally); the V coordinate selects which strip a face samples. One sheet
  textures dozens–hundreds of meshes. ([Beyond Extent deep dive](https://www.beyondextent.com/deep-dives/trimsheets))
- A **texture atlas** generalizes this: rectangles of unique (non-tiling) details packed into one
  texture; a **hotspot atlas** is an atlas whose rectangles are formally defined so tools can
  auto-assign faces to them ([Valve wiki](https://developer.valvesoftware.com/wiki/Hotspot_texturing)).
- Economics reported in production write-ups: one trim sheet typically covers **12+ distinct
  assets**; environment artists report **~80% of a scene's assets** running off one trim sheet +
  a few tileables; every mesh sharing the sheet shares **one material → one draw-call group**,
  which is exactly what our per-material instanced rendering wants.
  ([Beyond Extent](https://www.beyondextent.com/articles/balancing-modularity-and-uniqueness-in-environment-art),
  [polycount modular environments](http://wiki.polycount.com/wiki/Modular_environments))

### Case studies (how studios get hundreds of buildings from 1–2 sheets)

| Production | Technique | Load-bearing detail |
|---|---|---|
| **Sunset Overdrive** (Insomniac, GDC 2015 ["The Ultimate Trim"](https://gdcvault.com/play/1022324/The-Ultimate-Trim-Texturing-Techniques)) | One standardized trim **layout** reused across many texture sets | 1024² sheet, **6 horizontal strips, each ~2× the height of the previous** (≈32/64/128/256/512 + bottom flex row); every strip edge carries a **45°-bevel normal** so any 90° box edge UV'd to a strip edge reads as a machined bevel. Because the *layout* is standardized, whole-city material swaps need **no re-UV**. |
| **Half-Life: Alyx** (Valve, [hotspot texturing](https://developer.valvesoftware.com/wiki/Half-Life:_Alyx_Workshop_Tools/Level_Design/Hotspot_Texturing)) | Hotspot atlases | Tool picks "the best rectangle of the material for a face based on size and aspect ratio" — level geometry is textured nearly automatically; one material = one draw call for everything mapped to the atlas. |
| **Cyberpunk 2077** ([80.lv](https://80.lv/articles/megaplex-42-working-on-cyberpunk-environments), [Adobe interview](https://www.adobe.com/products/substance3d/magazine/cyberpunk-2077-a-world-full-of-substance.html)) | Tileables **on the architecture itself**, trim sheets for panels/cables/scaffolds, **decals** for uniqueness | Big facades = tiling materials (both axes); trims for modular mid-size detail; personality comes from decal layers, not unique facade textures. |
| **Skyrim** (Bethesda, [GDC 2013](http://blog.joelburgess.com/2013/04/skyrims-modular-level-design-gdc-2013.html)) | Modular kit discipline | Kits succeed when **dimensions are standardized first** (footprint/floor-height grid), textures second — directly applicable to our 4-m module grid. |
| **Frozenbyte / Trine** ([studio wiki](https://wiki.frozenbyte.com/index.php/3D_Asset_Workflow:_Tile_Textures_and_Trimsheets)) | Written studio rules | **Tiling textures for large uninterrupted surfaces; trim sheets for modular blocksets.** Texel density standard **200 px/m** (1K texture = 5 m). Trim grid segments "divisible by 10" for easy UV snapping. Wall textures fine at 1K "because architectural meshes interrupt tiling"; only unbroken terrain needs 2K. |

**The facade-specific pattern used across the industry** (skyscrapers in particular): the tower
shaft is NOT trim-mapped — it's a **seamless "window-bay module" tiling texture** (tiles in both
U and V), one per facade system, with the repeat = one structural bay (or 2 floors × 2–4 bays to
hide repetition). Trim sheets carry everything that *doesn't* tile vertically: ground-floor
retail, podium stone, parapets, cornices, roof gravel/louvers, entrance frames, decals.
([polycount low-poly building thread](https://polycount.com/discussion/190030/how-to-texture-this-lowpoly-building),
[Cyberpunk 80.lv](https://80.lv/articles/megaplex-42-working-on-cyberpunk-environments))

---

## 2. Canonical trim-sheet layout rules (numbers)

- Author on a square canvas; split into strips with **power-of-two pixel heights that snap**:
  for 1024 → 512 / 256 / 128 / 64 / 32 / 16. Consistent heights make strips interchangeable
  between sheets. ([Beyond Extent](https://www.beyondextent.com/deep-dives/trimsheets))
- Strips must **tile in U across the full sheet width** — that's what lets UVs run past 0–1
  horizontally with `RepeatWrapping`. Never place two side-by-side rects in a strip you intend
  to tile.
- Reserve a **bottom flex row** for unique non-tiling elements (door handles, AC grilles, signage
  plates, decals) — the hybrid "trims + unique cells" sheet is standard practice.
  ([Beyond Extent](https://www.beyondextent.com/deep-dives/trimsheets), Sunset Overdrive layout)
- Plan strips from the **largest real-world element** down: measure the biggest thing the sheet
  must cover (for us: one 3.5–4 m floor band), assign it the tallest strip, halve downward.
- **Texel density**: 512 px/m is the "contemporary 3rd-person console" guideline, 1024 px/m for
  first-person hero areas, **100–256 px/m for driving/vehicle games and background architecture**
  (Frozenbyte ships an entire game at 200 px/m). Match all strips to ONE density so materials
  can be swapped without re-UV.
  ([Beyond Extent texel density](https://www.beyondextent.com/deep-dives/deepdive-texeldensity),
  [polycount texel density vs trim sheet](https://polycount.com/discussion/194677/texel-density-vs-trim-sheet))
- **Padding / mip bleeding** (vertical direction, between strips):
  - Minimum gutter formula: **2^(mip levels you care about) / 2** pixels; practical floors:
    4 px @512, 8 px @1K, **16 px @2K**. Gutters must be **edge-padded** (dilated strip colors),
    not black. ([polycount edge padding](http://wiki.polycount.com/wiki/Edge_padding),
    [Kyle Halladay mip atlas math](https://kylehalladay.com/blog/tutorial/2016/11/04/Texture-Atlassing-With-Mips.html))
  - Strips inevitably merge at deep mips (a 512 px strip is 1 px at mip 9). Mitigation, in order:
    order strips so **tonal neighbors sit adjacent** (beige next to cream, dark glass next to
    dark louver); accept it (deep mips only show when the building is tiny on screen); set
    `texture.anisotropy = 8–16` in three.js (facades are seen at grazing angles from the road —
    anisotropy is the single biggest perceived-sharpness win for a driving camera).
- The **Ultimate Trim 45° bevel trick**: paint/bake a 45° bevel normal into the top+bottom
   few pixels of every strip; UV any 90° box edge so it lands on the strip edge → free "machined
  edge" highlight on parapets, podium tops, planters, utility boxes. Requires **hard edges**
  (split normals) on those box edges, and exact 45° normals (RGB ≈ (128,218,218) top,
  (130,36,218) bottom, (214,124,189)/(37,128,217) sides).
  ([polycount Ultimate Trim thread](https://polycount.com/discussion/160794/the-ultimate-trim-technique-from-sunset-overdrive))

---

## 3. Recommended texture plan for OUR kit (REF 1 targets, web/mobile budget)

Reference brief demands 4 distinct facade systems (concrete grid / cream vertical strips /
bronze curtain-wall twin / white horizontal bands) + podium retail + lit-window variation
(`docs/simulation/70_VISUAL_REFERENCE_BRIEF.md`).

### Texture set (2 logical atlases, ~5 images total)

**ATLAS A — "facade bays" 2048×2048** (tiles in U per strip; this is a trim sheet of
*floor-band strips*, the skyscraper-standard hybrid):

| V-range (px, from top) | Strip | Content | World repeat |
|---|---|---|---|
| 0–512 | System 1 | **Concrete punched-window grid**: deep recess shading painted into albedo+normal, dark reflective glass, rounded corner notch; 2 floors tall (7.2 m) so lit/unlit rows alternate | 16 m ≈ 4 bays |
| 512–1024 | System 2 | **Bronze curtain wall**: tight mullion grid, strong roughness variation per pane, ~35% lit panes in emissive | 16 m ≈ 8 mullions |
| 1024–1408 (384) | System 3 | **Cream vertical window strips**: precast piers + continuous glazing strips, 1 floor (3.8 m ≈ 384 px @ ~101 px/m — snap density to 96–128 px/m) | 12 m |
| 1408–1792 (384) | System 4 | **Horizontal band facade**: white concrete band + dark glass ribbon | 12 m |
| 1792–2048 (256) | Podium/retail | Ground-floor glazing band with storefront mullions, red signage strip variants, stone podium coursing, arcade recess | 16 m |

At 2048 width and ~128 px/m the horizontal repeat is 16 m — 4–5 window bays with baked
variation (blinds down, curtain, lit, dark) before it repeats; the eye forgives vertical repeats
on towers far more than horizontal ones at street level.

**ATLAS B — "trim & details" 1024×1024** (classic snapped trim sheet, 512/256/128/64/32 rows):
parapet caps + 45°-bevel edges, roof gravel, dark metal louvers, concrete base plinth,
curb/paver strips, entrance door frames, AC units, utility-box faces, signage plates, grunge
streak decals (alpha), yellow-black barrier stripes. This one sheet also serves streetscape
props (benches, planters, lamp bases) — the "one sheet, 100 assets" multiplier.

**Maps per atlas** (KTX2/toktx is NOT installed, so ship PNG/WebP inside GLB — full RGBA in
GPU memory; budget accordingly):

- Albedo 2048² (RGBA8 + mips ≈ **22.4 MB GPU**) — the one map that must stay 2K.
- Normal 1024² (≈5.6 MB) — facade relief reads fine at half res; normals compress badly as JPEG,
  use PNG/WebP-lossless.
- Roughness+Metalness+AO packed ORM 1024² (≈5.6 MB) — glTF's native
  `metallicRoughnessTexture`/`occlusionTexture` share one image (G=rough, B=metal, R=AO).
- Emissive 1024² (≈5.6 MB) — **lit windows live here**; golden-hour scene = warm 2700–3500 K
  pane fills at low intensity, interior lights read against dusk sides of buildings.
- Total facade texturing ≈ **40 MB GPU** for the entire district — well inside mobile budget,
  vs. ~16.8 MB per building if each had a unique 2K. (Install `toktx`/KTX2 later → ÷4–6.)

### Variation without more textures (the "hundreds of buildings" tricks)

1. **Per-building U offset**: shift each building's UVs by a random whole-bay amount
   (`u += bay_width_uv * randint`) — lit-window patterns stop repeating across towers. Free at
   generation time in Python (no shader work), or per-instance via `KHR_texture_transform`.
2. **Vertex-color tint** (`COLOR_0`, multiplied in standard materials): beige/grey/cream
   albedo shifts per building from one strip. Costs 4 bytes/vertex, zero textures.
3. **Emissive intensity per building**: bake a per-building random `emissiveFactor` (0.3–1.0)
   into the GLB material or set per-instance — towers read individually lit.
4. **Decal quads** from Atlas B (grunge streaks under sills, stains at ground level, signage) —
   the Cyberpunk recipe for making tiled facades feel authored.
5. Later upgrade (not now): **interior mapping** shader for near-camera glass — fake parallax
   rooms, proven in three.js
   ([three-interior-mapping](https://github.com/mohsenheydari/three-interior-mapping),
   [Three Fenestra](https://three-fenestra.codedgar.com/),
   [threejs forum](https://discourse.threejs.org/t/interior-mapping-shader/38415)).

---

## 4. Authoring the atlases in headless Blender (all scriptable)

Two viable pipelines; **both stay inside our existing `tools/blender` + MCP toolchain**.

### Option 1 — "strip board" bake (recommended, fully procedural)

Build each strip as real 3D geometry on a flat board, then bake ortho → textures. Everything
is bmesh + Cycles bake, i.e., plain Python:

1. Script builds a **board scene**: for each strip, model the bay in 3D at real scale —
   window recess boxes (concrete grid), mullion bars (curtain wall), precast piers — using the
   same `box/prism` helpers `district_kit_v3.py` already has. Depth = real (0.3 m recesses).
2. Assign simple procedural materials (PolyHaven concrete/plaster via the already-integrated
   `download_polyhaven_asset` for albedo/roughness grain; glass = flat dark + roughness map).
3. Add a **bake plane** at z=0 covering the board, UV = exact 0–1.
4. Bake with Cycles (headless-safe):
   ```python
   scene.render.engine = 'CYCLES'
   scene.cycles.samples = 16            # normals/AO need few samples
   scene.render.bake.use_selected_to_active = True
   scene.render.bake.cage_extrusion = 0.5   # > deepest recess
   scene.render.bake.margin = 16            # px gutter (2K rule)
   bpy.ops.object.bake(type='NORMAL')       # tangent space default
   bpy.ops.object.bake(type='AO')
   bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
   bpy.ops.object.bake(type='ROUGHNESS')
   bpy.ops.object.bake(type='EMIT')         # lit panes = emission shaders
   ```
   (Standard Blender bake workflow; see [artisticrender bake guide](https://artisticrender.com/how-to-bake-textures-in-blender/).)
5. Composite/pack strips into the final PNGs with **Pillow/numpy** in the same script
   (channel-pack ORM, edge-pad gutters by dilation).

This gives real parallax-correct normals + AO in recesses — the #1 thing REF 5's flat prisms
lack. Bake once, commit the PNGs; regenerating buildings never re-bakes.

### Option 2 — pure 2D generation (fallback, no bake)

Generate albedo/emissive/roughness directly with Pillow/numpy (rect fills + noise + gradients),
derive the normal map from a height layout via Sobel. Faster to iterate, weaker recess shading.
Good enough for Atlas B trims; use Option 1 for Atlas A window strips.

### Not recommended for us

- Substance Designer/Painter (industry default per the
  [FastTrackTutorials course](https://fasttracktutorials.com/tutorial_single/1872) and Cyberpunk's
  pipeline) — external DCC, breaks our headless reproducibility.
- Geometry Nodes for UVs: possible headlessly (**Store Named Attribute → 2D Vector on Face
  Corner domain, name `UVMap`**,
  [docs](https://docs.blender.org/manual/en/latest/render/shader_nodes/input/uv_map.html),
  [devtalk](https://devtalk.blender.org/t/attribute-transfer-to-uv-layer/23016)) — but our
  generators are bmesh-based, and direct bmesh UV writing (below) is simpler and deterministic.

---

## 5. UV-mapping the procedural buildings from Python (exact techniques)

`district_kit_v3.py` currently sets only `face.material_index` — no UV layer exists. The fix is
**analytic UV assignment at build time** (we know every face's world meaning when we create
it — never re-derive with unwrap operators).

### 5.1 Core pattern: bmesh UV loop layer

```python
uv_layer = bm.loops.layers.uv.new("UVMap")   # once per Builder
for loop in face.loops:
    loop[uv_layer].uv = (u, v)
```

### 5.2 Facade prisms (the 238): arc-length × height mapping

The kit already has the perimeter arc-length sampler (line ~261) — reuse it. For each side quad
of `prism(pts, z0, z1, ...)` the natural facade coordinates are:

```python
DENSITY = 1.0 / 16.0          # 1 repeat per 16 m (Atlas A strip repeat)
STRIP = {"concrete_grid": (1.0, 0.75), "curtain": (0.75, 0.5),
         "vert_strip": (0.5, 0.3125), "horiz_band": (0.3125, 0.125),
         "retail": (0.125, 0.0)}   # (v_top, v_bottom) in atlas space

def facade_uv(arc_len_m, z_m, strip, floors_per_repeat, floor_h):
    v_top, v_bot = STRIP[strip]
    u = arc_len_m * DENSITY                      # tiles: u may run 0..20+
    frac = (z_m % (floor_h * floors_per_repeat)) / (floor_h * floors_per_repeat)
    v = v_bot + frac * (v_top - v_bot)
    return u, v
```

Key rules verified against industry practice:

- **u accumulates real meters along the perimeter** (the arc-length sampler gives this) so bays
  never stretch on angled/curved plan segments; corners land mid-tile — acceptable, or snap
  segment starts to whole bays (`u = round(u / bay) * bay`) for architectural correctness.
- **v must wrap INSIDE the strip**, not across the atlas — the `%` above does that per floor
  band. This means side quads must be **cut at floor lines** if a single quad spans multiple
  repeats *and* the strip doesn't span full V… BUT: our Atlas A strips do NOT tile in V, so
  tall tower shafts need the prism side faces **subdivided per floor-repeat** (one quad per
  2-floor band for system 1, etc.). The kit already builds per-floor band geometry for the
  horizontal-band tower — extend that pattern. Cost: ~a few hundred extra quads per tower,
  trivial.
- Alternative that avoids per-floor cuts: make each facade system its **own small texture**
  (512×512 seamless bay module, tiles both axes, one material per system — 4 materials). Then
  `u = arc_len/bay_w`, `v = z/floor_h` on one giant quad. **This is the classic skyscraper
  method and the safest v1**: mip-safe (no strip bleeding at all), no face cutting, and our
  instanced renderer already groups by material so 5–6 materials ≈ same cost as 2. The trim
  ATLAS B still consolidates all the small stuff. Recommendation: **v1 = per-system tiling
  textures + Atlas B trims; v2 = merge systems into Atlas A** once it proves out.

### 5.3 Boxes/props: cube-projection or hotspot

- One-liner world-scale mapping for boxy props (Blender ≥2.9):
  ```python
  bpy.ops.uv.cube_project(cube_size=16.0, correct_aspect=True)  # 16 m = 1 UV repeat
  ```
  ([bpy.ops.uv docs](https://docs.blender.org/api/2.80/bpy.ops.uv.html)) — operator needs edit
  mode + a window context; in headless scripts prefer the bmesh equivalent (project each face
  by dominant normal axis: `u,v = the two non-dominant world coords * DENSITY`) — 10 lines,
  no operator context problems.
- **Hotspot auto-assignment** (Valve/Alyx style) for Atlas B: for each box face, compute its
  world width×height, pick the atlas rect with nearest size+aspect, map corners to the rect.
  [DreamUV](https://github.com/leukbaars/DreamUV) implements exactly this as open Python
  (`DUV_Utils.py` + hotspot module — atlas defined as a template mesh of rectangles); port the
  ~50 core lines into our generator rather than depending on the addon UI. Zen UV's
  [hotspot docs](https://zenmastersteam.github.io/Zen-UV/latest/trimsheet_hotspot/) describe the
  matching rules (compare island vs trim size/aspect).

### 5.4 Ultimate-Trim bevels on our boxes

Podium slabs, parapets, planters, utility boxes: UV their faces so edges land exactly on
Atlas B strip edges that carry the 45° bevel normal → every concrete box in the kit picks up
crisp edge highlights under the golden-hour sun for zero extra geometry. Requires
`face.smooth = False` (hard edges) on those boxes — already the bmesh default.

---

## 6. Export-pipeline gotchas (Draco + three.js specifics)

- **Draco UV quantization vs tiling UVs** (load-bearing): trim/tiling UVs run far outside 0–1
  (u up to ~30 on a long facade). Draco's default `quantizeTexcoordBits: 12` spreads 4096 steps
  over the WHOLE UV range → on a 30-repeat facade that's ~0.007 UV ≈ 15 px error at 2K: visible
  texture swimming/misalignment. Fix in gltf-transform:
  `draco({ quantizeTexcoordBits: 14 })` **and** keep UV magnitudes small by subtracting the
  per-island floor (`u -= floor(min_u)`) at generation time — wrapping makes them equivalent.
- **Wrap mode**: exporter must leave `wrapS = wrapT = REPEAT` (glTF default) — verify after
  gltf-transform; anything mapped to Atlas A strips only ever wraps in S/U.
- **Anisotropy**: set `texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())`
  on facade albedo/normal — biggest sharpness win for grazing street-level views.
- **Mip bleed** between Atlas A strips: 16 px dilated gutters + tonally-ordered strips
  (§2 padding rules); per-system tiling textures (v1 path) dodge the issue entirely.
- **No KTX2**: PNG inside GLB decodes to full RGBA8 on GPU. The ~40 MB plan in §3 fits phones;
  do NOT add more 2K maps without installing `toktx` (KTX2/UASTC ÷4–6 GPU memory) — flag as a
  known upgrade.
- **sRGB/linear**: albedo+emissive = sRGB; normal/ORM = linear (`colorSpace = NoColorSpace`).
  glTF handles this automatically if maps are wired to the correct slots — don't hand-wire.
- **One material per atlas** in the GLB → our per-material instanced groups collapse from
  ~6 flat-color materials/building to **2 (opaque atlas + emissive-blend)** or ~6 shared
  district-wide (v1 tiling path) — either way every building batches with every other building.

---

## 7. Concrete action list for district_kit_v3 → v4

1. Add `uv_layer` to the `Builder`; thread `(u, v)` through `box/prism/quad` (arc-length × z
   mapping per §5.2; dominant-axis projection per §5.3). ~80 lines.
2. New script `tools/blender/facade_atlas.py`: builds strip boards for the 4 systems + podium,
   bakes albedo/normal/ORM/emissive per §4 Option 1, Pillow-packs gutters. Start with
   **per-system 512² tiling textures** (v1) + **1024² Atlas B trim sheet**.
3. Replace flat-color `mat()` palette with 5–6 textured materials (Principled BSDF with the
   baked maps); keep the `<=6 materials/model` budget — now they're *shared kit-wide*.
4. Per-building variation: random whole-bay U offset + vertex-color tint + random
   `emissiveFactor` (§3).
5. Cut tower shaft prism sides at floor-band boundaries where the mapping needs V wrap
   (only needed when moving to the merged Atlas A in v2).
6. Export: `gltf-transform draco --quantize-texcoord-bits 14`; verify REPEAT wrap; set
   anisotropy in the R3F loader.
7. Podium/props: hotspot-map onto Atlas B; put 45° bevel normals on strip edges for free
   edge highlights.

---

## Sources

- Beyond Extent — Trimsheets deep dive: https://www.beyondextent.com/deep-dives/trimsheets
- Beyond Extent — Texel density: https://www.beyondextent.com/deep-dives/deepdive-texeldensity
- GDC 2015, Morten Olsen (Insomniac) — The Ultimate Trim: https://gdcvault.com/play/1022324/The-Ultimate-Trim-Texturing-Techniques (video mirror: https://archive.org/details/GDC2015Olsen2)
- polycount — Ultimate Trim thread (bevel normals, padding, gotchas): https://polycount.com/discussion/160794/the-ultimate-trim-technique-from-sunset-overdrive
- Valve Developer Community — Hotspot texturing: https://developer.valvesoftware.com/wiki/Hotspot_texturing and HL:Alyx hotspot workflow: https://developer.valvesoftware.com/wiki/Half-Life:_Alyx_Workshop_Tools/Level_Design/Hotspot_Texturing
- DreamUV (open Python hotspot/trim tools for Blender): https://github.com/leukbaars/DreamUV
- Zen UV — hotspot mapping rules: https://zenmastersteam.github.io/Zen-UV/latest/trimsheet_hotspot/
- Frozenbyte wiki — Tile Textures & Trimsheets (200 px/m standard, grid rules): https://wiki.frozenbyte.com/index.php/3D_Asset_Workflow:_Tile_Textures_and_Trimsheets
- 80.lv — Cyberpunk 2077 environment workflows: https://80.lv/articles/megaplex-42-working-on-cyberpunk-environments · Adobe Substance interview: https://www.adobe.com/products/substance3d/magazine/cyberpunk-2077-a-world-full-of-substance.html
- Joel Burgess — Skyrim modular level design (GDC 2013): http://blog.joelburgess.com/2013/04/skyrims-modular-level-design-gdc-2013.html
- polycount wiki — Modular environments: http://wiki.polycount.com/wiki/Modular_environments · Texture atlas: http://wiki.polycount.com/wiki/Texture_atlas · Edge padding: http://wiki.polycount.com/wiki/Edge_padding
- Kyle Halladay — Minimizing mip artifacts in atlases: https://kylehalladay.com/blog/tutorial/2016/11/04/Texture-Atlassing-With-Mips.html
- Blender bpy UV operators: https://docs.blender.org/api/2.80/bpy.ops.uv.html · bake guide: https://artisticrender.com/how-to-bake-textures-in-blender/
- Geometry Nodes UV storage: https://devtalk.blender.org/t/attribute-transfer-to-uv-layer/23016
- three.js interior mapping (future upgrade): https://github.com/mohsenheydari/three-interior-mapping · https://three-fenestra.codedgar.com/ · https://discourse.threejs.org/t/interior-mapping-shader/38415
- HotBox — hotspot trim baking in Blender: https://www.rileyb3d.com/blog/hotbox-bake-hotspot-trim-sheets-in-blender
- polycount — texturing low-poly buildings: https://polycount.com/discussion/190030/how-to-texture-this-lowpoly-building
