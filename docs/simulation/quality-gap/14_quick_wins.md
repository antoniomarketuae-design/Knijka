# Quality gap — QUICK WINS (highest visual-impact-per-hour)

Lane report, 2026-07-10. Target: close the REF 5/6 → REF 1/3 gap (washed-out light, flat
untextured buildings, uniform ground, no atmosphere) with the smallest changes to the
EXISTING stack. Every item names the exact file it lands in and gives tested starting
values. Effort: **S** = under ~1 h, **M** = 2–4 h. Ordered by expected impact ÷ effort.

Grounding (read before editing):

- `platform/src/modules/sim/environment/presets.ts` — day/dusk/night light+sky+fog targets
- `platform/src/modules/sim/environment/SimEnvironment.tsx` — SIM_EXPOSURE=1.05, N8AO (r=1.5, i=1.5), Bloom (thr=1.0, i=0.6), HueSaturation(0.06)+Vignette high-only, ACES last
- `platform/src/modules/sim/environment/quality.ts` — low/med/high flags (colorGrade high-only)
- `platform/src/components/sim/LessonScene.tsx` — drei `<Environment files=… environmentIntensity={0.4 day / 0.12 night}>`
- `platform/src/modules/sim/world/components/CityBuildings.tsx` — per-(model,material,chunk) InstancedMesh, `DAY_GLOW=1.35 / NIGHT_GLOW=3.2` on `glass_lit`
- `platform/src/modules/sim/world/components/cityModels.ts` — `envMapIntensity = roughness≤0.12 ? 1.8 : 1.2`
- `platform/src/modules/sim/world/components/StaticWorld.tsx` + `textures/pbrTextures.ts` — asphalt/concrete/grass PBR sets, repeats [2,2]/[2,2]/[3,3]
- `platform/src/components/sim/SceneLighting.tsx` — LEGACY standalone rig (older scene); keep numbers mirrored if that scene still ships

---

## 1. QW-A — Retune the `day` preset to warm late-afternoon (THE washed-out fix) — **S**

The single biggest gap vs REF 1 is the light *ratio*, not any asset. Current day rig:
sun elev **55°**, intensity **1.35**, hemi **0.85** → key:fill ≈ 1.6:1 = flat, shadowless-feeling
noon. REF 1 is a low warm sun with long shadows and a cool fill. Golden hour is 6–15°
elevation by definition, but at ≤15° a 30 m building casts a >110 m shadow (tan 15° ≈ 0.27)
which overwhelms the 45–60 m camera-following shadow frustum — so use **18–25°** ("late
golden") as the day default.

**Lands in:** `environment/presets.ts` → `ENVIRONMENT_PRESETS.day`.

Starting values (replace the `day` block):

```ts
day: {
  sky: {
    zenith: "#4a7ec2",          // keep blue up top — contrast against warm horizon
    horizon: "#f4c78e",         // warm haze band (was #b9d2e8)
    horizonCurve: 2.1,          // warmth hugs the horizon (was 1.7)
    sunTint: "#ffdba8",
    sunDiscDeg: 1.0,            // slightly fatter low sun (was 0.7)
    sunDiscIntensity: 4.0,
    sunGlowIntensity: 0.35,     // was 0.16 — visible warm glow
    sunGlowPower: 14,           // wider falloff (was 32)
    starsIntensity: 0,
  },
  light: {
    sun:  { azimuthDeg: 245, elevationDeg: 22, color: "#ffd9a0", intensity: 1.9 }, // was 165/55/#fff2df/1.35
    hemisphere: { skyColor: "#b8cde8", groundColor: "#4a4034", intensity: 0.55 }, // was 0.85
  },
  fog:     { color: "#e3c49c", density: 0.0028 },  // was #b7cfe6 / 0.002 — see QW-F
  rainFog: { color: "#9aabbd", density: 0.0034 },
}
```

Why these numbers: key:fill becomes ~3.5:1 (directional shape returns), warm-key/cool-fill
is the classic golden-hour complementary split, and the darker warm `groundColor` bounces
warm light up onto facades. Sun azimuth 245° puts long shadows diagonally across
north-south streets. This is pure data — zero perf cost, zero code.

Presets are validated by `environment/__tests__/presets.test.ts` — run it; it asserts
structure, not values (verify before assuming).

## 2. QW-B — Per-preset exposure (stop sharing one knob with night) — **S**

`SIM_EXPOSURE = 1.05` is deliberately conservative because it is shared with night. Add
`exposure` to `EnvironmentPreset` (presets.ts) and damp `gl.toneMappingExposure` toward it
in the existing `useFrame` (SimEnvironment already writes it every frame — one-line change
from constant to damped target). Starting values: **day 1.15, dusk 1.1, night 0.95**.
Combined with QW-A's ratio fix this is most of the "washed out" complaint gone.

**Lands in:** `presets.ts` (+field), `SimEnvironment.tsx` (replace the constant write).

## 3. QW-C — Swap the day HDRI to a golden-hour puresky — **S**

All PBR reflections (tower glass, car paint, wet road) currently sample a neutral clear
sky, so nothing in the scene *reflects* warmth. Poly Haven CC0 1k candidates (slug →
polyhaven.com/a/<slug>, download the 1k .hdr, ~1–2 MB, no KTX2 needed — `.hdr` goes through
RGBELoader, not toktx):

- `kiara_7_late-afternoon` — warm but not extreme; best match for a 20° sun default
- `belfast_sunset_puresky` — stronger golden, clean horizon
- `industrial_sunset_02_puresky` — hazy urban sunset (closest to REF 1's mood)
- `evening_road_01_puresky` — deep golden, for a future true "goldenHour" preset

Drop as `platform/public/sim/env/sky_golden_1k.hdr`, then in `LessonScene.tsx`:

```tsx
<Environment
  files={isNight ? "/sim/env/sky_urban_1k.hdr" : "/sim/env/sky_golden_1k.hdr"}
  background={false}
  environmentIntensity={isNight ? 0.12 : 0.5}   // was 0.4 day
  environmentRotation={[0, ENV_SUN_ALIGN_RAD, 0]} // r185 supports scene.environmentRotation
/>
```

**Critical:** rotate the HDRI so its baked sun sits at the SAME azimuth as the preset sun
(245°), otherwise glass towers show a second sun. Eyeball `ENV_SUN_ALIGN_RAD` once in a
free-drive session (rotate until the brightest reflection streak lines up with the real
sun disc); expect a value near `(245° − hdriSunAzimuth)` in radians.

## 4. QW-D — Per-instance facade tint via `instanceColor` — **S**

REF 5's "flat untextured boxes" reads twice as bad because every instance of a model is
*pixel-identical*. `InstancedMesh.setColorAt` multiplies the diffuse color per instance at
zero extra draw calls and (in r185) does NOT touch emissive — so `glass_lit` windows keep
their glow. Add to `makeInstanced` in `CityBuildings.tsx` (skip glass material groups so
reflections stay physical — gate on the glTF material `name` starting with `"glass"`):

```ts
const _tint = new THREE.Color();
// inside the placement loop, keyed on a deterministic hash so retries look identical:
const h = ((i + 1) * 2654435761) >>> 0;
const lum  = 0.90 + 0.18 * ((h & 0xff) / 255);        // ±9 % brightness
const warm = 0.985 + 0.03 * (((h >> 8) & 0xff) / 255); // subtle warm/cool split
_tint.setRGB(lum * warm, lum, lum * (2.0 - warm));
mesh.setColorAt(i, _tint);
// after the loop:
if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
```

Same trick is worth repeating on the traffic fleet body-paint instances later (toy-like
"flat paint" in REF 5), if TrafficLayer doesn't already vary paint.

**Lands in:** `world/components/CityBuildings.tsx` (`makeInstanced` gains a `tint: boolean`
arg decided per material-group name).

## 5. QW-F — Fog as aerial perspective (depth cue), color-matched to horizon — **S**

REF 1's depth reads through warm haze; REF 5 has none. FogExp2 factor =
`1 − exp(−(d·density)²)`, so at the current day density 0.002: 200 m → 15 %, 400 m → 47 %.
At **0.0028**: 200 m → 27 %, 400 m → 71 % — towers layer into the haze, streets stay clear.
Fog color must ≈ sky horizon color (`#e3c49c` vs horizon `#f4c78e` — keep fog slightly
greyer so it reads as air, not paint). Already folded into the QW-A block above; listed
separately because it's independently testable: fog-only already adds visible depth.

**Lands in:** `presets.ts` `day.fog` (mechanism in SimEnvironment already animates it).

## 6. QW-H — N8AO retune: raise intensity + radius one notch — **S**

Current: `aoRadius 1.5 m, intensity 1.5, distanceFalloff 1.0`. N8AO's own guidance: radius
1–10 for a ~100-unit scene; intensity 2 = "soft, barely noticeable", 5 = heavy. The current
1.5/1.5 is below the visibility floor on a bright scene — part of why everything floats.
Starting values: **`AO_RADIUS_M = 2.5`, `AO_INTENSITY = 2.2`, falloff 1.0** (keep
`screenSpaceRadius: false`). Half-res cost is unchanged (~1 ms) — samples don't scale with
radius. If curb bases read "dirty", drop intensity to 1.9 before touching radius.

**Lands in:** `SimEnvironment.tsx` constants.

## 7. QW-I — Bloom retune for the low sun + lit windows — **S**

Current `luminanceThreshold 1.0` means only >1.0 HDR pixels bloom; with exposure ~1.1 and
a 22° sun, speculars on car paint and the sun disc qualify but day lit-windows (glow 1.35
× material emissive) sit right at the edge. Starting values: **threshold 0.9, intensity
0.75, radius 0.6** (keep `mipmapBlur`). Pair with QW-E below so windows actually cross the
threshold. If med-tier reads blobby on Iris Xe, restore threshold 1.0 on med only and keep
0.9 on high (the chain is already built per-quality in `composerChildren`).

**Lands in:** `SimEnvironment.tsx` Bloom props.

## 8. QW-E — Lit-window glow boost at day (golden-hour interiors) — **S**

REF 1 explicitly shows "interior lights visible" at golden hour. Current `DAY_GLOW = 1.35`
is authored for noon. Starting values in `CityBuildings.tsx`: **`DAY_GLOW = 2.0`,
`NIGHT_GLOW = 3.2` (unchanged)**. With QW-I's threshold 0.9 these windows pick up a gentle
halo. Zero perf cost (same emissive material, new uniform value).

## 9. QW-J — Extend the color grade to med + retune (saturation/contrast) — **S**

ACES filmic is the known desaturator (three.js forum: "washed out, low contrast" is THE
canonical ACES complaint) — the existing `HueSaturation saturation 0.06` on high-only is
too weak and med-tier students (most of them) get none. pmndrs postprocessing MERGES
consecutive Effects (HueSaturation + BrightnessContrast + Vignette + SMAA + ToneMapping
become ONE fullscreen pass), so enabling grade on med is ~free.

- `quality.ts`: `med.colorGrade: true`.
- `SimEnvironment.tsx` grade block: `HueSaturation saturation={0.12}` (was 0.06), add
  `<BrightnessContrast brightness={0} contrast={0.07} />`, keep Vignette
  `offset 0.28 / darkness 0.45` (consider darkness 0.35 on med).
- Import `BrightnessContrast` from `@react-three/postprocessing`.

**Escalation path (M, optional):** a real LUT — `LUT3DEffect` + a warm .cube (Photoshop
export or a free "golden hour" cinematic LUT); also merges into the same pass. Do the
saturation/contrast version first; a LUT is only worth it once art direction stabilizes.

## 10. QW-N — A/B the tone mapper itself: AGX and Neutral vs ACES — **S**

One-line experiments in `SimEnvironment.tsx` (`ToneMappingMode.AGX`,
`ToneMappingMode.NEUTRAL` — plus the non-composer low path via
`THREE.AgXToneMapping` / `THREE.NeutralToneMapping`):

- **ACES** (current): filmic contrast, desaturates strongly — needs QW-J to compensate.
- **AGX**: better hue preservation, but flatter mid contrast — pair with contrast +0.1.
- **Khronos PBR Neutral** (r162+): preserves albedo colors almost exactly — often the best
  match for stylized/low-poly content like the traffic fleet; try exposure 1.05 with it.

Verdict expected: ACES+grade or AGX+contrast for the golden look. Keep BOTH paths in sync
(renderer fallback and composer effect) — the file header already documents that contract.

## 11. QW-G — Ground macro-variation (kill the uniform ground) — **M**

The PBR sets tile every ~2.7–3.5 m — believable up close, but a flat wash at 50 m+ (REF 5's
"uniform pale ground"). Two proven fixes; do (a) first:

**(a) World-space macro multiply, onBeforeCompile (~20 lines, one 256² noise PNG):**
on the terrain/asphalt/paved materials in `StaticWorld.tsx`:

```ts
material.onBeforeCompile = (shader) => {
  shader.uniforms.macroMap = { value: macroNoiseTex }; // 256², RepeatWrapping, greyscale perlin
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec2 vMacroUv;")
    .replace("#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvMacroUv = worldPosition.xz * 0.006;"); // 1 tile / ~165 m
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform sampler2D macroMap;\nvarying vec2 vMacroUv;")
    .replace("#include <map_fragment>",
      "#include <map_fragment>\ndiffuseColor.rgb *= mix(0.86, 1.10, texture2D(macroMap, vMacroUv).r);");
};
```

±12 % brightness at 100 m+ wavelengths reads as damp patches / repaved asphalt / dry grass.
Cost: 1 texture fetch per ground fragment. Caveat: `worldPosition` requires a chunk that
defines it — `worldpos_vertex` is compiled in when the material receives shadows (it does
here); confirm on the low preset (no shadows) or compute world pos manually.
NOTE: r152+ gives every map slot its own UV transform, so alternatively a spare `lightMap`
slot at repeat [0.02, 0.02] can fake this with zero shader code — but lightMap *adds*
light; the onBeforeCompile multiply is the correct-looking one.

**(b) Repetition breaker (optional M, later):** `three-hex-tiling` npm — patches
MeshStandardMaterial via `hexTiling: { patchScale: 2, useContrastCorrectedBlending: true }`;
up to 3 fetches per map per fragment, tested through three r173 (we're on r185 — verify
before adopting; it also monkey-patches onBeforeCompile, conflicting with (a) — pick one
per material).

**Lands in:** `world/components/StaticWorld.tsx` (+ tiny helper in `world/textures/`).

## 12. QW-L — Shadow retune for long-shadow readability — **S**

With the sun at 22° shadows get ~2.5× longer; the med frustum (45 m half-extent, 1024²)
still holds (texel = 8.8 cm) but shadows now MATTER visually, so: med `shadowRadiusM:
45 → 55` (texel 10.7 cm, still fine with the existing texel-snapping), high `60 → 75` @
2048². Keep `bias −0.0004 / normalBias 0.05` (retuned pair per the code comment). If acne
appears on low-angle facades, raise normalBias to 0.08 before touching bias. Buildings
still don't cast on med (documented FPS regression) — the LONG shadows students see come
from trees/lamps/cars, which is enough for the feel; revisit building casters only on high.

**Lands in:** `environment/quality.ts` presets.

## 13. QW-M — envMapIntensity pass with the new golden HDRI — **S**

Once QW-C lands, re-balance `cityModels.ts` `prepMaterial`: glass (roughness ≤ 0.12)
**1.8 → 2.2**, everything else **1.2 → 1.0** (warm HDRI over-lights matte concrete
otherwise — concrete should be lit by the sun/hemi rig, not mirror-lit). WorldProps sign
faces keep 1.2. Wet road: `StaticWorld` road material gains `envMapIntensity: 1.5` so the
wet-gloss state (roughness 0.35) smears the golden sky like REF 1's damp asphalt — today
the road relies on default 1.0.

**Lands in:** `world/components/cityModels.ts`, `StaticWorld.tsx`.

## 14. QW-K — SkyDome ↔ fog seam check after retune — **S**

`presets.ts` documents "horizon should sit close to fog color". After QW-A/QW-F verify at
street level that the horizon band (`#f4c78e`) and fog (`#e3c49c`) blend without a visible
seam where distant towers meet sky; nudge `horizonCurve` (2.0–2.4) rather than colors if a
band shows. 10-minute eyeball task, but skipping it is how retunes end up looking broken.

## 15. QW-P — Parked cars on the existing parking bands — **M**

REF 3's verdict: "believable ≠ fancy — TREES + LAWNS + PARKED CARS + SIGNS sell it". The
world already draws tinted parking bands (doc 68 QW3) and the traffic fleet GLBs are
already loaded + instanced. A static `ParkedCars` layer = sample parking-band polylines →
one InstancedMesh per fleet model (~2–4 draw calls for 60–120 cars, no physics, no AI,
`matrixAutoUpdate = false`), with QW-D-style per-instance paint tint and small yaw jitter
(±2°). Biggest "lived-in" jump available for a single afternoon; also fills REF 1's
surface-parking-lot look.

**Lands in:** new `world/components/ParkedCars.tsx` (reads fleet models via the traffic
module's public API — mind the module-boundary rule).

---

## Suggested landing order (dependency-aware)

1. QW-A + QW-B + QW-F (one PR: presets + exposure — transforms every screenshot)
2. QW-C + QW-M (HDRI swap + envMap rebalance — do together, they interact)
3. QW-H + QW-I + QW-E (composer: AO/bloom/glow — one tuning session)
4. QW-J + QW-N (grade + tone-map A/B — needs 1–3 in first, or you tune against the old light)
5. QW-D (instance tints) · QW-L (shadows) · QW-K (seam check) — independent S items
6. QW-G (ground macro) → QW-P (parked cars) — the two M items, biggest remaining texture/density gaps

Everything above is tuning + small code on the med tier's existing passes — no new render
passes, no new texture formats, no KTX2 dependency; the only new assets are one 1k .hdr
(~1–2 MB) and one 256² noise PNG (~20 KB). Nothing threatens the 60 fps Iris Xe budget:
the only added per-fragment cost is QW-G's single extra texture fetch on ground pixels.

## Sources

- N8AO parameter guidance: https://github.com/N8python/n8ao (README: radius scale rule, intensity 2 = subtle / 5 = heavy)
- three.js InstancedMesh.setColorAt: https://threejs.org/docs/#api/en/objects/InstancedMesh.setColorAt (+ pmndrs/react-three-fiber#2854 on needsUpdate)
- ACES washed-out discussion: https://discourse.threejs.org/t/acesfilmictonemapping-leading-to-low-contrast-textures/15484
- Tone mapping overview (ACES vs AgX vs Neutral): https://discourse.threejs.org/t/tone-mapping-overview/75204 · https://modelviewer.dev/examples/tone-mapping (Khronos PBR Neutral rationale)
- AgX in three.js: https://github.com/mrdoob/three.js/issues/27362
- LUT3DEffect (postprocessing): https://pmndrs.github.io/postprocessing/public/docs/class/src/effects/LUT3DEffect.js~LUT3DEffect.html · https://github.com/pmndrs/react-postprocessing/blob/master/src/effects/LUT.tsx
- Macro/micro tiling variation technique: https://www.worldofleveldesign.com/categories/ue4/landscape-macro-tiling-variation.php
- Hex-tiling anti-repetition for three.js: https://github.com/Ameobea/three-hex-tiling (3 fetches/map/fragment; tested to r173; patches onBeforeCompile)
- Poly Haven sunrise-sunset HDRIs (CC0): https://polyhaven.com/hdris/sunrise-sunset — slugs via https://api.polyhaven.com/assets?t=hdris&c=sunrise-sunset (`kiara_7_late-afternoon`, `belfast_sunset_puresky`, `industrial_sunset_02_puresky`, `evening_road_01_puresky`)
- onBeforeCompile material extension pattern: https://medium.com/@pailhead011/extending-three-js-materials-with-glsl-78ea7bbb9270
