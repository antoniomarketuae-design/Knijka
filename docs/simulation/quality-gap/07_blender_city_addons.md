# 07 — Blender city/building add-ons & texture packs for the headless pipeline

Research date: 2026-07-10 · Lane: Blender add-ons / geometry-node tools usable inside our
headless pipeline (`tools/blender/*.py`, Blender 5.1.2 `--background` → GLB → gltf-transform
Draco → instanced R3F rendering). Goal: close the REF 1 gap (4+ distinct facade systems,
podiums, retail bands, believable density) without abandoning our procedural generators.

Evaluation axes per tool: **license** (must permit commercial web distribution — our GLBs are
publicly downloadable, i.e. assets are *extractable* by end users), **headless/bpy
compatibility**, **output quality vs our own generators**, **adoption recommendation**.

---

## 0. The decisive architectural insight

There are two families of tools, and they behave completely differently headless:

1. **Geometry-node (.blend) libraries** (Buildify, BagaPie generators, PBG 2): the "add-on"
   is really a `.blend` file full of node groups + module collections. Headless use is
   trivial and robust: `bpy.ops.wm.append()` (or `bpy.data.libraries.load()`) the node
   tree in `--background`, add a `NODES` modifier to a footprint mesh, set modifier inputs
   (`mod["Input_N"] = value`), realize instances, export GLB. No UI, no operator context
   problems. **This is the family to bet on.**
2. **Python operator/UI add-ons** (Building Tools, SceneCity, KitOps, BlenderGIS): they
   drive `bpy.ops.*` operators that often assume an active viewport, edit-mode context, or
   modal interaction. Some can be coaxed into `--background` with context overrides; some
   cannot. Higher integration risk, harder to parameterize deterministically.

Our existing generators already ARE family 1/scripted-bmesh hybrids — so the winning move is
to **adopt the Buildify *pattern*** (module-kit collections + node-group placement logic),
not to bolt a UI add-on onto the pipeline.

---

## 1. Buildify (Pavel Oliva) — ★ adopt the pattern, test the library

- **What it is:** free Geometry Nodes *library* (a `.blend`, not a Python add-on) for
  modular building generation. Buildings are generated from base-mesh faces: extrude/scale
  a blocky footprint mesh and the node groups populate it with wall/window/roof/ground-floor
  modules from collections. Two modes: **ADE** (art-directable, manual params) and **BLOSM**
  mode (reads params written by the blender-osm add-on for city-scale generation from OSM).
  Sources: [80.lv](https://80.lv/articles/grab-a-free-geometry-nodes-library-for-procedural-buildings-in-blender),
  [CG Channel](https://www.cgchannel.com/2022/07/download-free-blender-3d-building-generator-buildify/),
  [Gumroad](https://paveloliva.gumroad.com/l/buildify),
  [blender-addons.org](https://blender-addons.org/buildify/).
- **License:** free ($0+ voluntary payment on Gumroad); per 80.lv's coverage,
  **commercial use without restrictions**, source (node setups) available under **GPL**.
  GPL on the *tool* does not contaminate *generated mesh output* — exported GLBs are our
  own content. Verify the license text shipped in the download at adoption time (the
  Gumroad page itself is JS-walled).
- **Headless:** excellent *by construction* — it is exactly the append-node-group workflow
  described in §0. No registration, no operators required. The BLOSM mode additionally
  needs the blosm add-on installed (blosm registers fine headless as a normal add-on).
- **Version risk (the one real caveat):** Buildify 1.0 targets **Blender 3.2**; it has not
  had a major public update since. Geometry Nodes deprecated/replaced nodes in 4.2+
  (e.g. `Align Euler to Vector` → `Align Rotation to Vector`,
  [4.2 release notes](https://developer.blender.org/docs/release_notes/4.2/geometry_nodes/)),
  and community reports exist of geometry breaking in 4.2 alphas. **Must be smoke-tested in
  our Blender 5.1.2 before adoption.** Blender versions do auto-migrate many deprecated
  nodes on load, but this is unverified for Buildify + 5.1.2.
- **Quality vs our generators:** the bundled kit is a **low-poly proxy kit** — explicitly
  intended to be *replaced with your own modules* (docs suggest Megascans, which we must NOT
  use — Epic's license ties those to Unreal). So Buildify's out-of-box visual quality is
  *below* REF 1; its value is the **placement/instancing logic and kit workflow**: one node
  group + N swappable module collections = N facade systems. That maps 1:1 onto REF 1's
  requirement ("concrete grid / vertical strips / dark curtain twin / horizontal bands").
- **Recommendation: ADOPT the workflow.** Path A (cheap test, ~half a day): open
  `buildify_1.0.blend` in 5.1.2 headless, append the main node group, feed it one of our
  footprint meshes, export GLB, inspect. If it survives version migration → author 4 module
  collections (one per REF 1 facade system, each module a quad-face wall tile ~50–300 tris
  with baked-texture material) and drive it from `tools/blender/`. Path B (if it breaks):
  rebuild the same logic ourselves — the core is small (grid-divide faces → instance module
  collection per cell → pick variant by floor index/random seed) and we already script GN
  ([scripting GN with Python reference](https://blog.cg-wire.com/blender-scripting-geometry-nodes-2/)).
  Either path, the *module-kit* idea is the takeaway.

---

## 2. Building Tools (ranjian0) — MIT, good facade geometry, medium headless risk

- **What it is:** open-source Python add-on generating building *exteriors* via operators:
  floorplans, floors, doors, windows, roofs, stairs, balconies, railings — parametric,
  applied to selected faces in edit mode.
  [GitHub](https://github.com/ranjian0/building_tools) ·
  [docs](https://ranjian0.github.io/building_tools/).
- **License: MIT** — cleanest possible for commercial web use, no copyleft questions at all.
- **Maintenance:** alive — latest release **v1.0.13, 2025-05-16**, "Blender 4.0 compatible"
  badge, 1,607 commits. 5.x compatibility unverified (same caveat as everything here).
- **Headless:** *possible but not designed for it*. Its operators (`bpy.ops.btools.*`) run
  on edit-mode face selections; in `--background` you must script mode switches +
  `bmesh` face selection + `context.temp_override()`. Doable (it has no modal/viewport
  dependency for the core ops) but brittle across versions; each generated building is
  destructive mesh output (fine for us — we bake to GLB anyway).
- **Quality vs ours:** produces clean, correctly-beveled punched-window/balcony geometry —
  visibly better *silhouette relief* (window recesses, sills, balcony slabs) than flat
  quads, which is exactly REF 1's "concrete-grid deep recesses" and REF 3's panel-block
  balconies. No materials/textures — geometry only (we texture ourselves; that's fine).
- **Recommendation: SECONDARY adopt.** Use it *interactively or semi-scripted* to author
  the module kits and mid-rise panel-block buildings (REF 3 style) that Buildify/our GN
  system then instances. Because it's MIT, we can also vendor/fork just the window/balcony
  generation code into our own generators if operator-context scripting proves annoying.

---

## 3. blosm (blender-osm, prochitecture) + BlenderGIS — real Sofia topology feeds

- **blosm** ([GitHub](https://github.com/vvoovv/blosm),
  [Gumroad](https://prochitecture.gumroad.com/l/blender-osm)): imports OSM buildings
  (footprint + height + floor count), terrain, and (Pro) Google 3D Tiles. **Code is GPL;
  bundled default textures/materials are CC0.** Base version: pay-what-you-want ($0 OK),
  imports untextured buildings from OSM. Premium (~$17.80 historical price) adds tileable
  facade textures with UVs, lit-window night materials, texture baking. Compatible with
  Blender 4.2+ per current docs. Headless: registers as a normal add-on; OSM import
  operators are scriptable (it is the documented data source for Buildify's BLOSM mode).
- **BlenderGIS** ([GitHub](https://github.com/domlysz/BlenderGIS)): **GPL-3.0**, free;
  imports georeferenced OSM/shapefiles/DEM. More GIS-plumbing oriented, UI-heavy
  (interactive basemap operator is modal → headless-hostile), but the raw
  OSM-XML import path is scriptable. OSM data itself is **ODbL — requires
  "© OpenStreetMap contributors" attribution** in our credits page; that's the only
  obligation and it's compatible with commercial use.
- **Relevance to us:** our north star says *real Sofia street topology*. blosm base
  (footprints + heights for Sofia districts) + Buildify-style module kits = real city massing
  with our own facades. **Recommendation: ADOPT blosm base** ($0, GPL code / CC0 textures)
  as the Sofia-footprint importer feeding the building generator; skip BlenderGIS unless we
  later need terrain DEM/georeferencing beyond what blosm provides.

---

## 4. SceneCity — SKIP

- Commercial city generator by Arnaud Couturier ([cgchan.com](http://www.cgchan.com/),
  [Gumroad](https://couturier-arnaud.gumroad.com/l/scenecity)); ~**$97**, per-user license
  (one seat per human, any number of machines), personal + commercial use allowed.
  Current line: v2.2.0 for Blender 3.4+; v1.9 bundled SceneTerrain.
- Drives generation through its own node-editor UI inside Blender → **poor headless fit**;
  effectively an artist tool, not a scriptable library.
- Output style: whole-city massing with its own building/road assets — stylized,
  game-boardish, *below* our current custom kit's art direction, and it would fight our
  existing road/topology system (we already generate streets from our own data).
- **Verdict: skip.** Wrong shape (monolithic UI tool), wrong output (replaces rather than
  augments our pipeline), $97 buys nothing our generators + Buildify pattern don't do better.

---

## 5. KitOps (FREE/PRO) — SKIP for pipeline; concept only

- Kitbashing add-on by chipp walters ([Gumroad FREE](https://chippwalters.gumroad.com/l/kitops3free),
  [Superhive](https://superhivemarket.com/products/kit-ops-free)); KIT OPS 3 FREE supports
  Blender 3.6.5+/4.2+; add-on code GPL (Blender add-on norm), INSERT asset packs carry their
  own per-pack licenses.
- It is an *interactive viewport* tool (modal placement of INSERT `.blend` assets with
  auto-booleans). Headless value ≈ zero; its INSERTS concept (a folder of snap-in `.blend`
  assets) is just the module-kit idea we're already adopting via Buildify.
- **Verdict: skip.** Nothing here for a headless pipeline. If we ever hand-dress hero
  landmarks interactively, revisit; even then plain collection-append does the job.

---

## 6. BagaPie (Antoine Bagattini) — free GPL/MIT toolbox, useful GN generators

- [Blender Extensions listing](https://extensions.blender.org/add-ons/bagapie/) ·
  [CG Channel on v11](https://www.cgchannel.com/2025/05/get-free-blender-modeling-and-scattering-add-on-bagapie-11/).
- **Free; code GPL/MIT.** Hosted on extensions.blender.org → *actively maintained against
  current Blender* (4.2+ extension platform requirement) — much lower version risk than
  Buildify.
- Contains **Geometry-Nodes generators** for walls, floors, windows, doors, railings,
  stairs, pipes, plus scattering/instancing tools and **GeoPack** (packs GN setups into
  standalone add-ons). The generators are GN modifiers under the hood → same headless
  append-and-drive pattern as Buildify (the Python layer is mostly UI convenience).
- Quality: archviz-utility level — its railing/stair/pipe/window generators are good
  *dressing* (REF 1 promenade railing! street furniture, podium detail), less a full
  facade-system engine.
- **Recommendation: MINE it.** Append its railing/window/stair node groups where they save
  us authoring time (promenade black railing, balcony rails, fire stairs); its maintained-
  for-current-Blender GN style is also a reference implementation when we rebuild
  Buildify-pattern groups for 5.1.2.

---

## 7. Procedural Building Generator 2 (Isak Waltin / "Coan") — conditional backup

- [PBG 2 Gumroad](https://coan.gumroad.com/l/pbg-2) ·
  [PBG 1.3](https://coan.gumroad.com/l/buildinggen) ·
  [CGPress coverage](https://cgpress.org/archives/procedural-building-generator-2-for-blender.html).
- Paid GN-based generator; distinguishing feature: adapts a facade system to an **arbitrary
  3D base mesh** (not just extruded footprints) — curved towers, set-backs, the REF 1
  rounded-corner horizontal-band building. Asset-Browser preset drag-and-drop workflow, i.e.
  node groups in a `.blend` → headless-friendly like Buildify.
- License terms not published outside Gumroad checkout — **must read the included license
  before purchase/adoption** (standard Gumroad tools usually allow commercial *output*;
  confirm).
- **Verdict: conditional.** Only if, after building our own kit, we still can't handle
  curved/rounded masses (REF 1 buildings #2 and #5). Likely we can (GN curve-to-mesh +
  module instancing), so default is skip-for-now.

---

## 8. City texture packs — clean licenses only

**Hard constraint recap:** our textures ship inside publicly-served GLBs → trivially
extractable by any user. Licenses that forbid redistribution "in extractable form" are
therefore **unusable**, not merely inconvenient:

| Source | License | Verdict |
|---|---|---|
| [ambientCG](https://ambientcg.com/) | **CC0** | ✅ primary. Has a dedicated **Facade** category (e.g. [Facade005](https://ambientcg.com/view?id=Facade005), [Facade011](https://ambientcg.com/view?id=Facade011) — tiling multi-story building facades), plus asphalt, paving, concrete, metal panels. 2000+ PBR materials, up to 8K, no registration. |
| [Poly Haven](https://polyhaven.com/textures) | **CC0** | ✅ primary (we already use their HDRI). Photoscanned tiling PBR ≥8K: concrete, plaster, brick, paving, asphalt; fewer full-facade sheets than ambientCG. Our blender-mcp add-on already downloads from it. |
| [ShareTextures](https://www.sharetextures.com/) | **CC0** | ✅ supplementary; decent facade/paving sets. |
| cgbookcase.com | **CC0** | ✅ supplementary; brick/plaster/panel textures. |
| blosm Premium bundled textures | **CC0** (explicitly stated by author) | ✅ if we buy blosm Pro (~$18) we can reuse its tileable facades + lit-window night materials directly — these are *purpose-built for OSM buildings incl. panel-block styles* (REF 3). Cheapest ready-made "lit windows at dusk" source with a clean license. |
| [Poliigon](https://www.poliigon.com/terms) | proprietary | ❌ **avoid**: forbids embedding assets in an easily-extractable state and forbids uses where end users get direct/indirect access to assets ([license](https://help.poliigon.com/en/articles/8749749-asset-use-licensing)). Web GLBs fail both. |
| [Textures.com](https://www.textures.com/faq-license.html) | proprietary | ❌ **avoid**: tiled-texture distribution only allowed inside *encrypted/archived* game packages; open-source/openly-downloadable distribution forbidden; attribution clause required. GLBs are not encrypted packages. |
| Quixel Megascans | Epic license | ❌ free tier is **Unreal-only**; explicitly not usable in our Three.js product (relevant because Buildify's docs recommend Megascans — we substitute CC0). |

**Practical recipe for REF 1's four facade systems from CC0 sources:** concrete-grid tower →
ambientCG concrete + our GN window recesses; vertical-strip tower → cream plaster/precast
strip + emissive window texture; dark curtain twins → procedural glass-mullion material
(authorable in-Blender, baked to atlas); horizontal-band HQ → alternating white-concrete /
dark-glass band atlas. Lit-window variation = emissive mask channel with per-instance random
threshold (works with our instanced renderer; no extra textures needed).

---

## 9. Adoption summary (ranked)

1. **Buildify pattern** (library if it survives 5.1.2, else rebuild ~1-day GN group):
   module-kit collections × node-group placement = the 4+ facade systems. FREE/GPL-tool,
   output unencumbered.
2. **blosm base** ($0, GPL code + CC0 textures): Sofia OSM footprints/heights feeding the
   generator; ODbL attribution line in credits. Consider Pro (~$18) purely for its CC0
   facade/lit-window texture set.
3. **Building Tools** (MIT): author kit modules & REF 3 panel blocks; vendor its
   window/balcony code if headless operator-driving misbehaves.
4. **BagaPie** (free, GPL/MIT, maintained on extensions.blender.org): raid its GN railing/
   stair/window groups for street dressing (promenade railing, balconies).
5. **Textures:** ambientCG + Poly Haven (CC0) as the only texture lane; never Poliigon /
   Textures.com / Megascans in shipped GLBs.
6. **Skip:** SceneCity ($97, UI-monolith, style mismatch), KitOps (viewport kitbashing,
   no headless value), PBG 2 (revisit only for curved-mass facades, read license first).

**Cross-cutting risks:** (a) every tool above is untested on Blender 5.1.2 — run a 30-min
smoke test per adopted tool before committing; (b) GPL applies to tool code we *distribute*,
never to meshes/textures we *generate* — no obligation flows into the GLBs; (c) OSM data →
one attribution string, tracked in a LICENSES/credits file alongside the CC0 asset manifest.

### Source index
- Buildify: [80.lv](https://80.lv/articles/grab-a-free-geometry-nodes-library-for-procedural-buildings-in-blender) · [CG Channel](https://www.cgchannel.com/2022/07/download-free-blender-3d-building-generator-buildify/) · [Gumroad](https://paveloliva.gumroad.com/l/buildify) · [blender-addons.org](https://blender-addons.org/buildify/) · [BlenderNation](https://www.blendernation.com/2022/07/19/buildify-free-city-creation-add-on-with-geometry-nodes-and-osm/)
- Building Tools: [GitHub](https://github.com/ranjian0/building_tools) · [site](https://ranjian0.github.io/building_tools/) · [releases](https://github.com/ranjian0/building_tools/releases)
- blosm: [GitHub](https://github.com/vvoovv/blosm) · [Premium wiki](https://github.com/vvoovv/blosm/wiki/Premium-Version) · [Gumroad](https://prochitecture.gumroad.com/l/blender-osm)
- BlenderGIS: [GitHub](https://github.com/domlysz/BlenderGIS) · [OSM import wiki](https://github.com/domlysz/BlenderGIS/wiki/OSM-import)
- SceneCity: [cgchan.com](http://www.cgchan.com/) · [BlenderArtists thread](https://blenderartists.org/t/scenecity/432348) · [Gumroad](https://couturier-arnaud.gumroad.com/l/scenecity)
- KitOps: [KIT OPS 3 FREE](https://chippwalters.gumroad.com/l/kitops3free) · [Superhive](https://superhivemarket.com/products/kit-ops-free)
- BagaPie: [Blender Extensions](https://extensions.blender.org/add-ons/bagapie/) · [CG Channel v11](https://www.cgchannel.com/2025/05/get-free-blender-modeling-and-scattering-add-on-bagapie-11/)
- PBG 2: [Gumroad](https://coan.gumroad.com/l/pbg-2) · [CGPress](https://cgpress.org/archives/procedural-building-generator-2-for-blender.html)
- Textures/licensing: [ambientCG](https://ambientcg.com/) · [Poly Haven](https://polyhaven.com/textures) · [ShareTextures](https://www.sharetextures.com/) · [Poliigon licensing](https://help.poliigon.com/en/articles/8749749-asset-use-licensing) · [Poliigon terms](https://www.poliigon.com/terms) · [Textures.com license FAQ](https://www.textures.com/faq-license.html)
- GN scripting: [CGWire — scripting Geometry Nodes with Python](https://blog.cg-wire.com/blender-scripting-geometry-nodes-2/) · [Blender 4.2 GN release notes](https://developer.blender.org/docs/release_notes/4.2/geometry_nodes/)
