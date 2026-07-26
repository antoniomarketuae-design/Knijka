# Simulator Asset Licenses

All assets in `public/sim/` are **CC0 1.0 (public domain)**. No attribution is
legally required, but sources and authors are credited below as good practice.
No CC-BY assets were used, so there are no mandatory-attribution obligations.

Last updated: 2026-07-26

## Environment maps (`env/`)

| File | Source | Asset | License | Author |
|------|--------|-------|---------|--------|
| `env/sky_urban_1k.hdr` | [Poly Haven](https://polyhaven.com/a/potsdamer_platz) | Potsdamer Platz (1K HDR) | CC0 1.0 | Greg Zaal |
| `env/shanghai_riverside_1k.hdr` | [Poly Haven](https://polyhaven.com/a/shanghai_riverside) | Shanghai Riverside (1K HDR) | CC0 1.0 | Greg Zaal |

Direct file URLs:
- `sky_urban_1k.hdr` → https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/potsdamer_platz_1k.hdr
- `shanghai_riverside_1k.hdr` → https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/shanghai_riverside_1k.hdr

`sky_urban_1k.hdr` is a partly-cloudy urban plaza (Potsdamer Platz, Berlin) —
chosen to give realistic building reflections and daytime lighting for a
city-driving scene.

**Which of the two the product actually loads** (doc 82 §8 bookkeeping):

| File | Loaded by |
|------|-----------|
| `shanghai_riverside_1k.hdr` | **DAY IBL** — `LessonScene.tsx`, `CaptureScene.tsx`, `SceneStillScene.tsx`. Rotated (`DAY_ENV_ROTATION`) so its baked sun matches the preset sun azimuth; otherwise glass towers show a double sun. |
| `sky_urban_1k.hdr` | **NIGHT IBL** — the same three, plus every Blender authoring rig in `tools/blender/`. |

**Removed 2026-07-26: `sky_clear_1k.hdr`** (Kloofendal 43d Clear, Poly Haven,
CC0 1.0, Greg Zaal —
https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_43d_clear_1k.hdr).
It was 1,522,032 B bucketed `ship: "prod"` (`tools/assets/publicBudget.mjs` →
`sim-env`) and referenced by **nothing** — no runtime code, no authoring
script, re-verified by grep across `src/`, `tools/`, `scripts/` and
`tools/blender/` before the delete. It was ~11% of the sim's runtime payload
shipping on every deploy for zero pixels. The provenance row stays here rather
than being deleted with the file: a licence register that forgets what was once
shipped cannot answer a later question about what was once shipped. Re-adding
it is a one-line curl from the URL above.

`shanghai_riverside_1k.hdr` was shipping **undocumented** until doc 82 §3.2
caught it. It is genuine Poly Haven CC0, so there was never legal exposure —
but an incomplete register is the exact bookkeeping failure that saved this
project from the Marlin Studios pack (see the Buildings notes below).

Neither of the two is fetched at the `low` tier at all:
`TEXTURE_BUDGETS.low.hdrEnvironment` is false (audit H-11) — one 1.5 MB HDR is
more than twice the entire low-tier texture budget.

## Textures (`textures/`)

All PBR texture sets are 1K PNG from [ambientCG](https://ambientcg.com/) (by Lennart Demes), CC0 1.0.
Maps kept: Color, Normal (OpenGL / `NormalGL`), Roughness, and Ambient Occlusion where available.

| File | Source | Asset | Map | License |
|------|--------|-------|-----|---------|
| `textures/road/color.png` | [ambientCG](https://ambientcg.com/view?id=Asphalt031) | Asphalt031 (1K-PNG) | Color | CC0 1.0 |
| `textures/road/normal.png` | [ambientCG](https://ambientcg.com/view?id=Asphalt031) | Asphalt031 (1K-PNG) | Normal (GL) | CC0 1.0 |
| `textures/road/roughness.png` | [ambientCG](https://ambientcg.com/view?id=Asphalt031) | Asphalt031 (1K-PNG) | Roughness | CC0 1.0 |
| `textures/road/ao.png` | [ambientCG](https://ambientcg.com/view?id=Asphalt031) | Asphalt031 (1K-PNG) | Ambient Occlusion | CC0 1.0 |
| `textures/sidewalk/color.png` | [ambientCG](https://ambientcg.com/view?id=Concrete034) | Concrete034 (1K-PNG) | Color | CC0 1.0 |
| `textures/sidewalk/normal.png` | [ambientCG](https://ambientcg.com/view?id=Concrete034) | Concrete034 (1K-PNG) | Normal (GL) | CC0 1.0 |
| `textures/sidewalk/roughness.png` | [ambientCG](https://ambientcg.com/view?id=Concrete034) | Concrete034 (1K-PNG) | Roughness | CC0 1.0 |
| `textures/ground/color.png` | [ambientCG](https://ambientcg.com/view?id=Grass004) | Grass004 (1K-PNG) | Color | CC0 1.0 |
| `textures/ground/normal.png` | [ambientCG](https://ambientcg.com/view?id=Grass004) | Grass004 (1K-PNG) | Normal (GL) | CC0 1.0 |
| `textures/ground/roughness.png` | [ambientCG](https://ambientcg.com/view?id=Grass004) | Grass004 (1K-PNG) | Roughness | CC0 1.0 |
| `textures/ground/ao.png` | [ambientCG](https://ambientcg.com/view?id=Grass004) | Grass004 (1K-PNG) | Ambient Occlusion | CC0 1.0 |

**Notes:**
- The originally-suggested `Asphalt025` does not exist in ambientCG's current
  catalog (404). Substituted **Asphalt031**, an equivalent clean dark-asphalt CC0 set.
- **Concrete034 ships no Ambient Occlusion map** (it is a near-flat surface, so
  ambientCG does not provide one). `textures/sidewalk/` therefore has no `ao.png`.
  Treat AO as fully white (1.0) in the shader for this material.

## Vegetation (`veg/`)

Low-poly tree models from the [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) (by Kenney), CC0 1.0.
GLB (glTF binary) format, each < 32 KB.

| File | Source | Original name | License | Author |
|------|--------|---------------|---------|--------|
| `veg/tree_round.glb` | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) | `tree_default.glb` | CC0 1.0 | Kenney |
| `veg/tree_oak.glb` | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) | `tree_oak.glb` | CC0 1.0 | Kenney |
| `veg/tree_detailed.glb` | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) | `tree_detailed.glb` | CC0 1.0 | Kenney |
| `veg/tree_pine.glb` | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) | `tree_pineRoundA.glb` | CC0 1.0 | Kenney |

**Notes:**
- The task suggested Quaternius trees. Quaternius packs are CC0 but are only
  distributed as a bundled Google-Drive folder (not scriptable via curl), and the
  Quaternius GitHub repos contain only animal models. Substituted the **Kenney
  Nature Kit** low-poly trees — also CC0, individually downloadable, and much
  smaller (each under 32 KB), which is ideal for web delivery.
- Four varied silhouettes were chosen for scene variety: a round deciduous tree,
  an oak, a fuller detailed tree, and a rounded conifer/pine.

## Buildings (`city/`)

Low-poly building models from the [Kenney City Kit — Commercial](https://kenney.nl/assets/city-kit-commercial)
(by Kenney), **CC0 1.0**. GLB (glTF binary) format; all share one `colormap.png`
colour atlas. Placed on the real OSM footprints by the world builder (each model
tiled along the footprint's long axis), replacing the procedural extruded prisms.

| File | Source | License | Author |
|------|--------|---------|--------|
| `city/building-a.glb` … `building-i.glb` (9) | [Kenney City Kit — Commercial](https://kenney.nl/assets/city-kit-commercial) | CC0 1.0 | Kenney |
| `city/building-skyscraper-a.glb`, `-c.glb`, `-e.glb` (3) | [Kenney City Kit — Commercial](https://kenney.nl/assets/city-kit-commercial) | CC0 1.0 | Kenney |
| `city/colormap.png` (shared atlas) | [Kenney City Kit — Commercial](https://kenney.nl/assets/city-kit-commercial) | CC0 1.0 | Kenney |

**Notes:**
- A curated 12-model subset (9 mid-rise + 3 towers) keeps the simulator-route
  payload to ~1.6 MB. The full kit ships ~40 models incl. low-detail LOD variants
  and street props (awnings, parasols) — candidates for a later perf/LOD pass.
- CC0: usable for commercial purposes, no attribution required (credited here as
  good practice). This replaced the vintage Marlin Studios "City Buildings" pack,
  whose licence forbids posting its contents on the internet — unusable for a web
  product (see docs, session 2026-07-08).

## License reference

CC0 1.0 Universal (Public Domain Dedication): https://creativecommons.org/publicdomain/zero/1.0/
