# Simulator Asset Licenses

All assets in `public/sim/` are **CC0 1.0 (public domain)**. No attribution is
legally required, but sources and authors are credited below as good practice.
No CC-BY assets were used, so there are no mandatory-attribution obligations.

Last updated: 2026-07-08

## Environment maps (`env/`)

| File | Source | Asset | License | Author |
|------|--------|-------|---------|--------|
| `env/sky_clear_1k.hdr` | [Poly Haven](https://polyhaven.com/a/kloofendal_43d_clear) | Kloofendal 43d Clear (1K HDR) | CC0 1.0 | Greg Zaal |
| `env/sky_urban_1k.hdr` | [Poly Haven](https://polyhaven.com/a/potsdamer_platz) | Potsdamer Platz (1K HDR) | CC0 1.0 | Greg Zaal |

Direct file URLs:
- `sky_clear_1k.hdr` → https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_43d_clear_1k.hdr
- `sky_urban_1k.hdr` → https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/potsdamer_platz_1k.hdr

`sky_clear_1k.hdr` is a clear blue-sky HDRI. `sky_urban_1k.hdr` is a partly-cloudy
urban plaza (Potsdamer Platz, Berlin) — chosen to give realistic building
reflections and daytime lighting for a city-driving scene.

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

## License reference

CC0 1.0 Universal (Public Domain Dedication): https://creativecommons.org/publicdomain/zero/1.0/
