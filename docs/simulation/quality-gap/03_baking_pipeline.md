# 03 — Blender→glTF Baking Pipeline for Real-Time Quality

Research digest (2026-07-10) for the visual-quality gap program (docs/simulation/70_VISUAL_REFERENCE_BRIEF.md).
Scope: headless bpy baking (AO / lightmaps / normals), lightmap UVs, wiring baked maps into three.js,
and web texture compression **without toktx** (plus when/how to add KTX2 properly on Windows).

---

## 1. Headless baking with bpy (Cycles)

### 1.1 Invocation & GPU

```powershell
& "E:\blender\blender.exe" --background --factory-startup --python tools/blender/bake_ao.py -- --asset building_a
```

Enable GPU inside the script (huge speedup for Cycles bakes; OPTIX on NVIDIA, else CUDA/HIP):

```python
import bpy
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"   # or "CUDA" / "HIP" / "NONE"
prefs.get_devices()
for d in prefs.devices:
    d.use = True
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "GPU"
```

### 1.2 Lightmap/AO UV channel (the second UV set → glTF TEXCOORD_1)

Every baked map needs a **non-overlapping** UV layout. Keep UV0 for tiling facade textures,
add UV1 for the bake:

```python
import bpy, math

obj = bpy.data.objects["building_a"]
mesh = obj.data

# Add second UV layer if missing; glTF exporter emits UV layers in order → this becomes TEXCOORD_1
if "Lightmap" not in mesh.uv_layers:
    mesh.uv_layers.new(name="Lightmap")
mesh.uv_layers.active = mesh.uv_layers["Lightmap"]   # bake writes to the ACTIVE uv layer

bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
# Smart UV Project — good general choice for hard-surface buildings
bpy.ops.uv.smart_project(
    angle_limit=math.radians(66),
    island_margin=0.02,          # ~2% of UV space between islands — prevents bake bleed
    area_weight=0.0,
    correct_aspect=True,
    scale_to_bounds=False,
)
bpy.ops.object.mode_set(mode="OBJECT")
```

Alternatives:
- `bpy.ops.uv.lightmap_pack(PREF_CONTEXT='ALL_FACES', PREF_MARGIN_DIV=0.2)` — packs every face
  as its own island; wastes space, causes seams on every edge; only OK for boxy low-poly props.
- **xatlas** (what Unity/Godot/Bakery use) gives the best packing: `pip install xatlas` into
  Blender's Python and run `xatlas.parametrize(positions, indices)` on numpy arrays from the mesh,
  or use the `blender_xatlas` addon. Worth it if smart_project wastes >30% of the lightmap.

Rule of thumb: island_margin must be ≥ (bake margin px / texture size). For 1024px + 16px margin
→ island_margin ≥ 0.016.

### 1.3 The bake-target image node (required)

Cycles bakes into the **active Image Texture node** of each material on the object:

```python
size = 1024
img = bpy.data.images.new(f"{obj.name}_ao", width=size, height=size, alpha=False)
img.colorspace_settings.name = "Non-Color"     # AO/normal = data, not color

for slot in obj.material_slots:
    mat = slot.material
    mat.use_nodes = True
    nt = mat.node_tree
    node = nt.nodes.new("ShaderNodeTexImage")
    node.name = "BAKE_TARGET"
    node.image = img
    nt.nodes.active = node                     # <- this is what selects the bake target
    node.select = True
```

### 1.4 Bake settings & the bake call

```python
scene.cycles.samples = 256                      # AO: 128–512; diffuse lightmap: 512–1024 (then denoise)
scene.cycles.use_denoising = False              # denoise does NOT apply to bakes (see 1.6)

bake = scene.render.bake
bake.margin = 16                                # px of edge padding; scale with resolution (16 @ 1024, 32 @ 2048)
bake.margin_type = "EXTEND"                     # 'EXTEND' usually cleaner than 'ADJACENT_FACES' for hard-surface
bake.use_clear = True
bake.target = "IMAGE_TEXTURES"
bake.use_selected_to_active = False

# --- AO bake ---
world = scene.world
world.light_settings.distance = 3.0             # AO ray distance in meters — 2–5 m reads well on buildings
bpy.ops.object.bake(type="AO")

# --- Full lightmap (sun+sky+GI, no albedo) bake ---
bake.use_pass_direct = True
bake.use_pass_indirect = True
bake.use_pass_color = False                     # CRITICAL: exclude albedo so the map is pure lighting
bpy.ops.object.bake(type="DIFFUSE")

# --- Normal map (high→low detail transfer), if sculpted/HP source exists ---
# select HP source, then LP active; bake.use_selected_to_active=True; bake.cage_extrusion=0.05
# bpy.ops.object.bake(type="NORMAL")            # normal_space='TANGENT' (default)

img.filepath_raw = f"//bakes/{obj.name}_ao.png"
img.file_format = "PNG"
img.save()
```

Notes:
- Margin type `EXTEND` extends island borders outward (cleaner than the default
  `ADJACENT_FACES` in most hard-surface cases) — both exist since Blender 3.1.
- AO bake ignores all scene lights; it is controlled purely by `world.light_settings.distance`
  and sample count.
- For HDR lightmaps save `OPEN_EXR` (`img.file_format = "OPEN_EXR"`, use a float image:
  `bpy.data.images.new(..., float_buffer=True)`), keep values linear.
- `bpy.ops.object.bake()` accepts overrides directly (`type=`, `margin=`, `use_clear=`) if you
  prefer not to mutate scene state.

### 1.5 Multi-object batching

Bake each asset separately (per-asset object-space AO is what our instanced renderer can use —
see §3.4). Loop: select one object → make active → assign bake node → bake → save → remove node.
Reference implementations:
- techinz/blender-batch-lightmap-baker (github.com/techinz/blender-batch-lightmap-baker) — batch loop,
  smart-UV auto-create, node cleanup/restore.
- juliusikkala gist (gist.github.com/juliusikkala/8f784fdf13b089385f78b57544a745bf) — two-pass
  lightmap (env direct+indirect, lights indirect-only) combined by adding pixel buffers; shows the
  `use_pass_direct/indirect/color` recipe and `TEXCOORD_1` uv_layers idiom.

### 1.6 Denoising baked maps (bakes are NOT denoised by Cycles)

Verified: Cycles denoising runs only for **COMBINED**-type bakes; AO/DIFFUSE bake results come
out raw (developer.blender.org/T93681, still true through 4.x release notes). Two headless options:

**A. Compositor Denoise node (OIDN, ships inside Blender)** — no extra install:

```python
# after baking, denoise the image through the compositor and write it out
scene.use_nodes = True
nt = scene.node_tree
nt.nodes.clear()
img_node  = nt.nodes.new("CompositorNodeImage");   img_node.image = img
denoise   = nt.nodes.new("CompositorNodeDenoise")  # OIDN; .prefilter, .use_hdr available
out       = nt.nodes.new("CompositorNodeComposite")
nt.links.new(img_node.outputs["Image"], denoise.inputs["Image"])
nt.links.new(denoise.outputs["Image"], out.inputs["Image"])
scene.render.resolution_x = img.size[0]
scene.render.resolution_y = img.size[1]
scene.render.resolution_percentage = 100
scene.render.filepath = f"//bakes/{obj.name}_ao_dn.png"
bpy.ops.render.render(write_still=True)            # composite-only render works headless
```

(Feeding bake albedo/normal aux images into the Denoise node's Albedo/Normal inputs preserves
more edge detail — optional.)

**B. `oidnDenoise` standalone binary** (github.com/RenderKit/oidn releases, Windows zip):
`oidnDenoise --filter RTLightmap --hdr lightmap.pfm --output lightmap_dn.pfm` — the `RTLightmap`
filter is purpose-built for lightmaps; prebuilt binaries only read PFM (PNG/EXR require an
OpenImageIO build), so the compositor route (A) is less friction for us.

Practical: with 512–1024 samples + OIDN denoise, 1024² lightmaps bake in seconds-to-minutes per
asset on GPU.

---

## 2. Getting baked maps into the GLB

### 2.1 AO via the Blender glTF exporter (native occlusion slot)

The exporter recognizes a node group named **"glTF Material Output"** (older Blender: "glTF
Settings") with an input named **Occlusion**. Wire: `UV Map(Lightmap) → Image Texture(ao.png,
Non-Color) → glTF Material Output.Occlusion`. It exports as `occlusionTexture` with
`texCoord: 1` (because the Image Texture samples the second UV layer). No visible effect in
Blender — export-only. (docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html,
KhronosGroup/glTF-Blender-IO#123)

```python
# programmatic: create the special group and wire it
group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
for slot in obj.material_slots:
    nt = slot.material.node_tree
    g = nt.nodes.new("ShaderNodeGroup"); g.node_tree = group
    uv  = nt.nodes.new("ShaderNodeUVMap"); uv.uv_map = "Lightmap"
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = ao_img
    tex.image.colorspace_settings.name = "Non-Color"
    nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], g.inputs["Occlusion"])
```

### 2.2 AO injection post-export with gltf-transform (often simpler)

Skips touching Blender materials entirely — bake, export plain GLB, then:

```js
import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
const doc = await io.read('building_a.glb');
const tex = doc.createTexture('ao').setImage(fs.readFileSync('building_a_ao.png')).setMimeType('image/png');
for (const mat of doc.getRoot().listMaterials()) {
  mat.setOcclusionTexture(tex);
  mat.getOcclusionTextureInfo().setTexCoord(1);   // TEXCOORD_1 = our Lightmap UV
}
await io.write('building_a.ao.glb', doc);
```

Requires the GLB to actually contain TEXCOORD_1 — Blender exports all UV layers by default.

### 2.3 Lightmaps: glTF has NO lightmap slot

Options, best-first for us:
1. **Load lightmap separately at runtime** and assign to `material.lightMap` (see §3.2). Keep a
   naming convention (`<asset>_lm.webp` / `.exr`) next to the GLB. Zero exporter friction.
2. `MOZ_lightmap` vendor extension (Mozilla Hubs) — needs a custom GLTFLoader plugin +
   gltf-transform custom extension; not worth it for a 2-person pipeline.
3. Abuse the occlusion slot for a grayscale "shadow map" — works with zero runtime code, but AO
   semantics (indirect-only, single channel) lose colored bounce light. Acceptable interim hack.

### 2.4 ORM packing (optional byte-saver)

glTF convention: occlusion may share one texture with metallicRoughness (R=AO, G=roughness,
B=metallic). Pack with sharp: `sharp(ao).joinChannel([rough, metal])` → assign the same texture to
both `occlusionTexture` and `metallicRoughnessTexture`. Halves texture count on the building kit.

---

## 3. three.js side: combining baked AO/lightmaps with runtime lighting

### 3.1 aoMap semantics (MeshStandardMaterial)

- Red channel only; `texture.colorSpace = THREE.NoColorSpace` (GLTFLoader sets this for occlusion).
- **AO affects INDIRECT light only**: ambient/hemisphere lights, environment IBL (our drei
  `Environment` HDRI), and lightMap. It does NOT darken direct DirectionalLight — so with a
  sun-dominant rig, baked AO is invisible unless the env/ambient term is meaningful. Our warm-HDRI
  environment contribution is exactly where the AO will read (recessed windows, arcades, under-eaves).
- `aoMapIntensity` 1.0 default; 1.2–1.5 pushes the archviz "grounded" look; GLTFLoader maps glTF
  `occlusionTexture.strength` → `aoMapIntensity`.

### 3.2 lightMap at runtime

```js
const lm = await new THREE.TextureLoader().loadAsync('building_a_lm.webp'); // or EXRLoader for HDR
lm.flipY = false;                          // glTF UV convention — REQUIRED for externally loaded maps
lm.colorSpace = THREE.SRGBColorSpace;      // PNG/WebP bake; use LinearSRGBColorSpace for EXR/HDR
lm.channel = 1;                            // r152+: sample TEXCOORD_1 (attribute 'uv1')
mesh.material.lightMap = lm;
mesh.material.lightMapIntensity = 1.0;
mesh.material.needsUpdate = true;
```

- Since **r152** any texture can pick its UV set via `texture.channel`; geometry attributes were
  renamed `uv, uv2 → uv, uv1`. GLTFLoader sets `channel` automatically from `texCoord` for maps
  inside the GLB; for externally loaded lightmaps you set it yourself (the old
  `geometry.attributes.uv2.copy(uv)` hack is dead).
- lightMap is added to the indirect irradiance and IS multiplied by aoMap — baked AO + baked light
  combine correctly.

### 3.3 Division of labor with the existing composer

- **Baked AO (per-asset)** = mid/large-scale occlusion: window recesses, podium arcades, under
  balconies — stable at any distance, free at runtime.
- **N8AO (runtime SSAO)** = small contact detail + dynamic objects (cars, player). Keep both;
  reduce N8AO radius/intensity once baked AO lands to avoid double-darkening.
- Time-of-day flexibility: AO-only baking keeps the sun dynamic. Full lightmaps freeze the
  golden-hour look (fine for MVP — REF 1 is one fixed time of day) but each *placement* needs a
  unique map, which collides with instancing (next point).

### 3.4 Instancing constraint (load-bearing architecture fact)

`InstancedMesh` shares one geometry + material: a per-ASSET baked AO map (object-space, in the
asset's own UV1) works for every instance for free. A per-PLACEMENT scene lightmap (with
neighbor-building shadows) canNOT be instanced — it needs unique UVs/textures per placement.
→ Pipeline decision: **bake object-space AO per kit asset** (works with the instanced building
kit), plus optional lightmaps only for unique hero areas (promenade, parking lot ground plane —
which are single meshes anyway).

---

## 4. Texture compression for web WITHOUT toktx

### 4.1 WebP via gltf-transform (works today, zero new installs)

The CLI bundles `sharp` — WebP/AVIF need nothing external:

```powershell
# lossy WebP for color-ish maps; keep normals lossless (lossy WebP wrecks normal vectors)
npx @gltf-transform/cli webp in.glb out.glb --slots "{baseColorTexture,emissiveTexture,occlusionTexture}"
# or the all-in-one:
npx @gltf-transform/cli optimize in.glb out.glb --compress draco --texture-compress webp
```

Programmatic (fits our existing Node pipeline):

```js
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
await document.transform(
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    slots: /^(?!normalTexture).*$/,   // exclude normal maps from lossy webp
    quality: 82, effort: 6,           // AO/lightmaps tolerate q75–85 well
    // resize: [1024, 1024],
  }),
  // second pass for normals: targetFormat 'webp', lossless: true, slots: /normalTexture/
);
```

- AVIF compresses ~20–30% better than WebP but decodes slower on low-end phones; WebP is the
  safe default.
- `resize` here is the cheapest win: cap building textures at 1024, props at 512.

### 4.2 The WebP catch: VRAM

WebP/PNG/JPEG decompress to **full RGBA8 on the GPU**: a 2048² texture = 16.8 MB + 33% mips
≈ **22 MB VRAM each**, plus main-thread decode jank at load. Fine for ~10–20 textures; a city kit
with 30+ baked 1–2K maps will hurt phones (ADR-005 target).

### 4.3 KTX2/Basis: when it matters and what it buys

- Stays **compressed in VRAM** (transcoded at load to BC7/ASTC/ETC2 per device): UASTC = 8 bpp
  (2048² ≈ 5.6 MB with mips, 4× less), ETC1S ≈ 4 bpp (~2.8 MB, 8× less) — and no full-size
  CPU decode, so no upload jank.
- Adopt when: total texture VRAM estimate > ~150–250 MB, or load-time stutter appears, or the
  phone build starts. For the desktop-browser MVP, WebP is acceptable interim.
- Codec choice: **ETC1S** for baseColor/emissive (small, slight banding); **UASTC** for normal
  maps and for AO/lightmaps *if* ETC1S shows banding in smooth gradients (common on AO);
  `--rdo` + `--zstd 18` keeps UASTC file sizes sane.

### 4.4 Installing KTX-Software on Windows (when ready)

1. Download the installer from github.com/KhronosGroup/KTX-Software/releases —
   `KTX-Software-4.4.2-Windows-x64.exe` (or newer). Installs to
   `C:\Program Files\KTX-Software\bin`; check "add to PATH" or add it manually.
2. Verify: `ktx --version` (must be **≥ 4.3.0**).
3. Version coupling (verified in glTF-Transform source `packages/cli/src/transforms/toktx.ts`):
   **gltf-transform CLI v4+ spawns `ktx create`** (not toktx) — flags it passes: ETC1S →
   `--encode basis-lz --qlevel <1–255, default 128> --clevel 1`; UASTC → `--encode uastc
   --uastc-quality <0–4, default 2> [--uastc-rdo ...] --zstd 18`; plus `--generate-mipmap
   --mipmap-filter lanczos4` and OETF/primaries per slot. gltf-transform **v3.x** spawned the
   old `toktx` binary — both binaries ship in the same installer, so installing 4.4.x satisfies
   either CLI version. It also auto-resizes to power-of-two/multiple-of-4 via sharp when needed.
4. Commands:

```powershell
npx @gltf-transform/cli uastc in.glb tmp.glb --slots "{normalTexture,occlusionTexture}" --level 2 --rdo --zstd 18 --verbose
npx @gltf-transform/cli etc1s tmp.glb out.glb --quality 160 --verbose
```

5. three.js side: `const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
   gltfLoader.setKTX2Loader(ktx2);` — copy `basis_transcoder.{js,wasm}` from
   `three/examples/jsm/libs/basis/` into `public/basis/`.

---

## 5. Recommended pipeline for this repo (concrete)

1. In each `tools/blender/*.py` generator: after geometry, add `Lightmap` UV layer
   (smart_project, island_margin 0.02), bake **AO** per kit asset (1024², 256 samples, margin 16
   EXTEND, world AO distance 3 m), compositor-OIDN denoise, save PNG.
2. Wire AO via the `glTF Material Output` node group (or skip and inject with gltf-transform
   §2.2) → export GLB with TEXCOORD_1.
3. Post-process: `gltf-transform resize` (cap 1024) → `webp` (q82, exclude/lossless normals) →
   existing `draco` step. Single `optimize` call can replace the chain.
4. Runtime: confirm r152+ (`texture.channel`), keep drei Environment as the indirect source so
   aoMap reads; `aoMapIntensity` 1.2–1.4; retune N8AO down (smaller radius, detail-only).
5. Unique single-mesh surfaces (promenade, parking-lot ground): optional DIFFUSE
   direct+indirect no-color lightmap (golden-hour sun baked), loaded externally →
   `material.lightMap`, `channel=1`, `flipY=false`.
6. Defer KTX2 until phone build / VRAM pressure; then install KTX-Software 4.4.x and switch the
   webp step to uastc(normals, AO)+etc1s(color).

---

## Sources

- Blender bake manual: https://docs.blender.org/manual/en/latest/render/cycles/baking.html
- BakeSettings API: https://docs.blender.org/api/current/bpy.types.BakeSettings.html
- Bake denoise only for COMBINED: https://developer.blender.org/T93681
- Compositor Denoise node: https://docs.blender.org/manual/en/latest/compositing/types/filter/denoise.html · https://docs.blender.org/api/current/bpy.types.CompositorNodeDenoise.html
- OIDN standalone: https://github.com/RenderKit/oidn · https://www.openimagedenoise.org/documentation.html
- Batch lightmap baker (bpy patterns): https://github.com/techinz/blender-batch-lightmap-baker
- Two-pass lightmap gist: https://gist.github.com/juliusikkala/8f784fdf13b089385f78b57544a745bf
- AO bake gist: https://gist.github.com/AndrewRayCode/760c4634a77551827de41ed67585064b
- Blender glTF exporter (occlusion node group): https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html · https://github.com/KhronosGroup/glTF-Blender-IO/issues/123
- glTF-Transform CLI: https://gltf-transform.dev/cli · textureCompress: https://gltf-transform.dev/modules/functions/functions/textureCompress
- gltf-transform ktx integration (source): https://github.com/donmccurdy/glTF-Transform/blob/main/packages/cli/src/transforms/toktx.ts
- KTX-Software releases: https://github.com/KhronosGroup/KTX-Software/releases · KTX Artist Guide: https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md
- three.js r152 migration (uv1 rename / texture.channel): https://github.com/mrdoob/three.js/wiki/Migration-Guide
- lightMap flipY/colorSpace: https://discourse.threejs.org/t/loading-lightmap-issue/18882 · https://threejs.org/manual/en/color-management.html
- aoMap indirect-only semantics: https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.aoMap
