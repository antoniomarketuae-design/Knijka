# Lighting + Atmosphere Research — REF-1 golden-hour look in real-time three.js/R3F

Research date: 2026-07-10 · Lane: lighting/atmosphere for the quality-gap program (REF 5/6 → REF 1).
Target: warm low sun, long shadows, slight haze, lit-window towers, damp-asphalt sun reflections — at 60 fps on mid-range hardware (ADR-005). Values marked **[derived]** are computed/synthesized here; everything else traces to the linked sources.

---

## 1. The core diagnosis (why REF 5 looks washed out)

REF 5's failure modes map 1:1 to known three.js anti-patterns:

- **Flat ambient, no sun direction** → HDRI/ambient-only lighting has no punch; every credible source says: HDRI for ambient + reflections, **plus a DirectionalLight sun for shadows and highlight** ([discourse: lighting advice](https://discourse.threejs.org/t/lighting-advice/36629), [PixelCapture HDR lighting](https://pixel-capture.com/tutorials/hdr-lighting-threejs-article)).
- **No atmosphere** → fog is a *depth cue*, not a hider: it "immediately helps us understand the distances and therefore scale of objects" ([Inigo Quilez, Better Fog](https://iquilezles.org/articles/fog/)).
- **Washed-out tone response** → ACES at default exposure over an already-low-contrast scene flattens further; exposure + grading must be tuned together (§4).

The golden-hour recipe = **4 coupled systems**: (a) sky/env source, (b) sun + shadows, (c) exposure/grade, (d) fog. Tune in that order; changing one re-tunes the next.

---

## 2. Sky strategy: HDRI vs drei `<Sky>` vs hybrid

### Options

| Approach | Pros | Cons |
|---|---|---|
| **HDRI only** (drei `<Environment files background>`) | Photographic clouds/horizon, physically consistent env light + reflections, zero shader cost after PMREM | Fixed time-of-day, static sun position; background at 1–2k looks soft up close |
| **drei `<Sky>` only** | Procedural, animatable sun elevation (day→dusk in code), cheaper than HDR decode ([Medium: drei quality tips](https://medium.com/@ertugrulyaman99/react-three-fiber-enhancing-scene-quality-with-drei-performance-tips-976ba3fba67a)) | No clouds, does NOT light the scene by itself (background only), sterile horizon |
| **Hybrid (recommended)** | drei supports rendering **children into the environment map** via a cube camera — put `<Sky>` (or Lightformers) *inside* `<Environment>` so the procedural sky both draws the background AND drives IBL ([drei Environment docs](https://drei.docs.pmnd.rs/staging/environment): `children`, `resolution` default 256, `frames`) | One extra cube render (1 frame if static) |

### Recommendation for the sim

**Phase 1 (fastest to REF-1):** HDRI for everything — one golden-hour urban HDRI as `background` + `environment`, plus a manually-aligned DirectionalLight sun. Rotate the HDRI with `environmentRotation`/`backgroundRotation` (three r162/163+, exposed as drei props) so the sun sits over the water axis of the district.

**Phase 2 (day/night cycle for the scenario engine):** `<Environment frames={1} resolution={256}><Sky …/></Environment>` hybrid — re-render the cube only when time-of-day changes (set `frames={Infinity}` briefly or bump a key), animate sun elevation, cross-fade to night HDRI.

### drei/three.js Sky parameters for golden hour

Defaults from the official three.js sky-shader example ([webgl_shaders_sky](https://threejs.org/examples/webgl_shaders_sky.html), [source](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_shaders_sky.html)): turbidity **10**, rayleigh **3**, mieCoefficient **0.005**, mieDirectionalG **0.7**, sky mesh scale **450 000**; sun set via `setFromSphericalCoords(1, deg2rad(90 − elevation), deg2rad(azimuth))`.

Golden-hour tuning **[derived from the shader's physics + example ranges]**:

```jsx
<Sky
  distance={450000}
  turbidity={8}            // 6–10; higher = hazier, warmer horizon band
  rayleigh={3}             // 2–4; higher = stronger orange-to-blue gradient at low sun
  mieCoefficient={0.005}   // 0.005–0.01; higher = bigger glow halo around sun
  mieDirectionalG={0.8}    // 0.7–0.95; higher = tighter forward-scatter glare
  sunPosition={sunVec}     // elevation 4–8° for golden hour, 1–2° for sunset drama
/>
```

At elevation < ~10° the shader naturally produces the warm gradient; below 2° it goes full sunset red. REF-1's look ≈ **elevation 6°** (long shadows but sky still bright).

---

## 3. Golden-hour HDRIs — exact Poly Haven picks (verified via api.polyhaven.com, 2026-07-10)

All free (CC0), unclipped, downloadable as .hdr/.exr at 1k→16k+. `evs_cap` = captured dynamic range in EVs (higher = sun intensity truly captured = correct crisp reflections/highlights); `wb` = white balance as shot.

### Day / golden hour (REF-1 mood)

| Asset (slug) | Why it matches REF-1 | EVs | WB | Notes |
|---|---|---|---|---|
| **`shanghai_riverside`** | **Best single match**: clear low sun, warm low-angle light, long soft shadows across a *concrete riverside* — literally the REF-1 waterfront-promenade situation | 25 | 5074K | urban+clear+sunset; 1k=1.5 MB, 2k=6.1 MB, 4k=24 MB (.hdr) |
| **`venice_sunset`** | Warm golden horizon over water, calm reflections, stone quay; the classic three.js demo HDRI | 19 | 5400K | urban+nature, medium contrast |
| `tears_of_steel_bridge` | Warm low sun over Amsterdam canal, high contrast, long shadows — canal-city energy | 22 | — | urban, high contrast |
| `signal_hill_sunrise` | Golden-hour city-overlook, high contrast, low sun | 22 | 5400K | urban+nature |
| `the_sky_is_on_fire` | Twilight seaside **promenade**, fiery sunset — for a "dusk" scenario variant | 9 | — | low EVs → weak direct sun in env; pair with stronger DirLight |
| `rooitou_park` | Clear sky, very bright sun, high contrast, long shadows — strongest "crisp sun" env | 23 | 5400K | nature (fine: towers hide horizon) |
| `kloppenheim_06_puresky` / `evening_road_01_puresky` | **Pure-sky** variants (no ground clutter) — ideal when your own buildings fill the horizon | 12 | 5319/5400K | 24k/16k masters, low/medium contrast |

Browse: [polyhaven.com/hdris/sunrise-sunset](https://polyhaven.com/hdris/sunrise-sunset) · [Venice Sunset](https://polyhaven.com/a/venice_sunset).

### Dusk / night (for the night scenario, §8)

| Asset | Character |
|---|---|
| **`neuer_zollhof`** | Twilight riverside square: cool blue sky + warm orange street lamps — the premium "blue hour" look |
| **`shanghai_bund`** | Night neon waterfront skyline, warm promenade lights — night version of REF-1's district |
| `rooftop_night` | Dusk rooftop parking, purple-pink sky + floodlights |
| `hansaplatz` / `cobblestone_street_night` | Warm high-contrast street-lamp urban night |
| `kloppenheim_02_puresky` | Clear moonlit night pure sky (stars + moon glow) |

### Delivery budget (no toktx/KTX2 available)

- **Environment (IBL only): 1k .hdr ≈ 1.5 MB** — PMREM output is ~256px effective anyway; 1k is standard for lighting-only ([discourse: HDR IBL sizes](https://discourse.threejs.org/t/best-approach-hdr-image-based-lighting-in-three-js/9429) — 256² suffices for diffuse, ≥1024² for glossy reflections).
- **Background:** either the same HDRI at 2k (6 MB — acceptable once, cache-forever) or convert to a **gain-map JPEG** with [@monogrid/gainmap-js](https://github.com/MONOGRID/gainmap-js): full-HDR data stored as JPEG (SDR image + gain map), typically **5–10× smaller than .hdr**, loads via its `HDRJPGLoader`, works as `scene.background`/`environment`. Converter runs in-browser ([three.js issue #27171](https://github.com/mrdoob/three.js/issues/27171), [discourse HDR-JPG tests](https://discourse.threejs.org/t/hdr-jpg-some-live-online-testing/64571)). This is the KTX2 substitute for HDRIs.
- Since towers occlude most of the horizon, background sharpness matters less → `backgroundBlurriness={0.05–0.1}` hides 1–2k softness cheaply (drei prop, default 0).

### Blockade Labs Skybox AI (custom "Gulf waterfront golden hour" sky)

[Skybox AI](https://skybox.blockadelabs.com/) generates 360° equirect skyboxes from text; exports **equirectangular PNG/JPG and HDR/EXR (32-bit) up to 8k (16k on higher tiers)**; Model 3 (Apr 2024) improved realism; freemium — free tier gives limited generations at lower res, HDR export is a paid-tier feature ([blockadelabs.com](https://www.blockadelabs.com/), [CG Channel on Model 3](https://www.cgchannel.com/2024/04/blockade-labs-launches-skybox-ai-2/)). Use case here: a bespoke "hazy Gulf skyline sunset" background that Poly Haven doesn't have; keep Poly Haven for the *lighting* env (unclipped EVs are more trustworthy than generated HDR).

---

## 4. Exposure, tone mapping, white balance

### Tone mapping

- `ACESFilmicToneMapping` — current pipeline; filmic, desaturates/flattens texture contrast noticeably ([discourse: ACES low-contrast](https://discourse.threejs.org/t/acesfilmictonemapping-leading-to-low-contrast-textures/15484)). Part of REF-5's washed-out read.
- **`AgXToneMapping` (three r160+) — recommended switch.** Better hue preservation under bright warm light (no orange→yellow skew), Blender 4.0's default, "a better default and a better starting point" ([discourse: tone-mapping overview](https://discourse.threejs.org/t/tone-mapping-overview/75204), [three.js #27362](https://github.com/mrdoob/three.js/issues/27362)). Caveat: AgX also lifts/flattens deep saturation — compensate with a saturation push in the grade (below).
- `NeutralToneMapping` (Khronos PBR neutral) is the "true colors" option — good for the UI/menus car-viewer, not for the moody world render.

### Exposure

`renderer.toneMappingExposure`: published outdoor examples range **0.77–1.8** with ACES ([Wael Yasmina realistic-scenes: ACES + exposure 1.8](https://waelyasmina.net/articles/how-to-create-ultra-realistic-scenes-in-three.js/); the sky-shader example itself ships exposure ≈0.5 because the procedural sky is over-bright). **[derived] Start: AgX + exposure 1.0–1.3 with a 1k unclipped golden-hour HDRI at environmentIntensity ~0.9**, then lock exposure and never touch it again — tune lights instead (exposure is a global knob; using it as a fix-all is how scenes go grey).

### White balance / warm grade (the "golden" in golden hour)

Three layered tools, cheapest first:

1. **Choose a warm-WB HDRI** — `shanghai_riverside` (5074K) is warmer-as-shot than a 6500K daylight asset. Free warmth, physically consistent.
2. **Sun + hemisphere colors** carry most of the warmth (§5) — warm key `#ffdcb2..#ffb873`, cool blue fill.
3. **Post grade** in the existing pmndrs composer:
   - `HueSaturation` effect: `saturation: +0.15..0.25` to counter AgX flattening **[derived]**;
   - `BrightnessContrast`: `contrast: +0.05..0.1`;
   - or a proper **LUT**: pmndrs `LUT3DEffect` / three `LUTPass` load `.cube` files — "extremely convenient for creating a specific look of the scene or the whole game" ([three.js #19457](https://github.com/mrdoob/three.js/issues/19457), [LUTPass docs](https://threejs.org/docs/pages/LUTPass.html), [threejsfundamentals 3DLUT lesson](https://threejsfundamentals.org/threejs/lessons/threejs-post-processing-3dlut.html)). A single free "warm teal-orange" .cube (e.g. from a photography LUT pack) is the fastest route to a cinematic grade; gotcha: pmndrs postprocessing buffers expect sRGB — follow [gamma-correction notes](https://cprimozic.net/notes/posts/threejs-pmndrs-postprocessing-gamma-correction/).

### r155+ physical lighting (context for all intensity numbers)

Since r155 `useLegacyLights=false` is default: no internal ×PI scaling; point/spot decay is physical (intensity in **candela**); to restore a pre-155 look multiply ambient/hemisphere/directional/lightmap intensities by **π** ([discourse: r155 lighting updates](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733)). Physically-correct results additionally require **1 unit = 1 meter** scene scale. All numbers below assume r155+ defaults.

---

## 5. The light rig — balancing HDRI env vs direct sun (real numbers)

**[derived] Recommended REF-1 rig** (validated ranges from sources cited inline):

```jsx
// scene-level (drei <Environment>)
environmentIntensity: 0.8          // three r163+ scene.environmentIntensity
                                   // (https://sbcode.net/threejs/environment-maps/)
backgroundIntensity: 1.0
environmentRotation / backgroundRotation: [0, azimuthRad, 0]  // align HDRI sun with DirLight

// sun — THE shadow caster, aligned by eye to the HDRI sun spot
<directionalLight
  color="#ffd9a0"                  // ~4800K golden
  intensity={3.5}                  // range 2.5–5 with AgX exposure 1.0–1.3 [derived];
                                   // a published HDRI+sun example uses 0xffdc73 @ 16 with
                                   // exposure left at default — intensity and exposure trade off
                                   // (https://sbcode.net/threejs/environment-maps/)
  position={sunDir.multiplyScalar(300)}   // elevation ~6°, i.e. y ≈ 30 at xz ≈ 300
  castShadow
/>

// sky/bounce fill — kills the black-shadow look without flattening
<hemisphereLight
  args={['#7fa8d4', '#8a6a4a', 0.35]}   // cool sky ↓, warm asphalt bounce ↑
  // pattern: sky-blue top + earth-brown ground, DirectionalLight for sun — the standard
  // outdoor combo (https://threejs.org/docs/pages/HemisphereLight.html,
  //   https://www.ramijames.com/learn-threejs/lighting/types-of-lighting)
/>
// NO AmbientLight — hemisphere replaces it strictly better outdoors.
```

**Balancing rules** (this is the part REF 5 got wrong):

- **Env : sun ratio.** Golden hour is *directional*: the sun must dominate. Aim shadowed-side ≈ 25–35 % luminance of lit-side on a white test cube **[derived]**. If shadows look grey/washed → env too strong: drop `environmentIntensity` to 0.5–0.7 before touching the sun. If shadows are pitch black → raise hemisphere, not env (env also raises reflections and flattens).
- **Align sun to HDRI.** No built-in API; standard practice is manual/visual alignment or offline sun-detection on the equirect ([discourse: matching light to HDR](https://discourse.threejs.org/t/matching-light-to-hdr/55711)). One-time task per HDRI — store `{elevation, azimuth}` next to the asset filename in a config.
- **Unclipped EVs matter**: `shanghai_riverside` (25 EVs) carries the true sun in the env map → specular sun glints on car paint and damp asphalt come **free from the env map**, no extra light needed. This is exactly the REF-1 "sun reflections on wet asphalt" ingredient — pair with the materials lane's roughness work.
- **Lightmaps/IBL sanity**: HDRI drives PBR only via `scene.environment`; it never casts shadows — the DirectionalLight is not optional ([discourse: HDR shadows](https://discourse.threejs.org/t/generate-shadow-effect-by-using-hdr-file/37548)).

---

## 6. Fog / aerial perspective for a 1.6 km district

### Which fog

`FogExp2` (density-based, physically closer to reality) over linear `Fog` ([three.js fog manual](https://threejs.org/manual/en/fog.html)). three.js shader: `fogFactor = 1 − exp(−(density·depth)²)` — squared exponent, so it stays near-clear up close and ramps in the distance: exactly aerial perspective, not pea-soup.

### Density numbers for a 1.6 km playable district **[derived — table computed from the shader formula; community examples cluster 0.002–0.0065 for smaller scenes ([FogExp2 docs](https://threejs.org/docs/pages/FogExp2.html), [Dustin Pfister fog notes](https://dustinpfister.github.io/2018/04/16/threejs-fog/))]**

Remaining scene color (1 − fogFactor) at distance:

| density | 100 m | 300 m | 600 m | 1000 m | 1600 m | Verdict |
|---|---|---|---|---|---|---|
| 0.0005 | 100 % | 98 % | 91 % | 78 % | 53 % | barely-there haze |
| **0.0008** | 99 % | 94 % | 79 % | 53 % | 19 % | **REF-1 "slight haze" — start here** |
| **0.0012** | 99 % | 88 % | 60 % | 24 % | 3 % | moody/dramatic dusk |
| 0.002 | 96 % | 70 % | 24 % | 2 % | 0 % | hides far towers — too much for day |
| 0.004 (night) | 85 % | 24 % | 0.3 % | 0 % | 0 % | night envelope, hides LOD pop |

Rule: near field (0–150 m, where driving decisions happen) must stay ≥ 95 % clear; the fog earns its keep at 400 m+ by separating tower silhouettes into depth planes.

### Fog color — the make-or-break detail

1. **Never grey.** Day golden hour: a desaturated warm horizon tone sampled from the HDRI's horizon band (≈ `#d8c5a8`–`#e8cfae` for shanghai_riverside **[derived]**). Fog tinted toward the light = atmosphere; grey fog = washing.
2. **three.js fog does NOT affect `scene.background`** — the skybox stays crisp while geometry fogs toward a flat color, causing a visible seam at the horizon ([discourse: fog color from skybox](https://discourse.threejs.org/t/fog-color-from-the-skybox-environment/40670), [three.js #17420](https://github.com/mrdoob/three.js/issues/17420)). Fixes, cheapest first: (a) pick fog color = HDRI horizon average (works because towers hide most horizon); (b) render-target blend of background into far fragments ([Medium: fog with multicolored backgrounds](https://medium.com/@anumberfromtheghost/fog-with-dynamic-multicolored-backgrounds-in-three-js-b76907629cb1)); (c) custom fog chunk.
3. **Sun-oriented fog tint (the premium touch, ~10 shader lines):** blend fog color toward the sun color by view-sun alignment — `sunAmount = max(dot(viewDir, sunDir), 0); fogColor = mix(hazeBlue, sunGold, pow(sunAmount, 8.0))` — the classic Quilez scattering trick; makes driving *toward* the low sun glow gold and *away* fade blue-grey ([iquilezles.org/articles/fog](https://iquilezles.org/articles/fog/)). Injectable via `onBeforeCompile` patching the `fog_fragment` chunk (the [fog-hacks pattern](https://snayss.medium.com/three-js-fog-hacks-fc0b42f63386)). This one effect sells "golden hour atmosphere" harder than anything else in this doc.
4. **Height fog** (denser low, thinner high — towers' tops piercing the haze): closed-form `fogAmount = (a/b)·exp(−camY·b)·(1−exp(−dist·rayY·b))/rayY` — negligible cost, dramatic realism gain ([same Quilez article](https://iquilezles.org/articles/fog/)). Phase-2 nicety.

---

## 7. Long low-sun shadows (the REF-1 signature)

Low sun (5–10° elevation) = shadows 6–11× object height → enormous shadow-frustum footprint. Plan:

### Phase 1 — single tuned DirectionalLight (ship first)

```js
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);       // 2048 minimum; 4096 ≈ 64 MB VRAM, fine on mid GPUs [derived]
sun.shadow.camera.near = 1;
sun.shadow.camera.far  = 500;              // must cover elongated low-sun frustum
// Tight ortho box around a 220 m disc ahead of the player, stretched along shadow throw:
sun.shadow.camera.left = -160; right = 160; top = 160; bottom = -160;  // [derived]
sun.shadow.bias = -0.0002;                 // typical −0.0001..−0.0005 range
sun.shadow.normalBias = 0.03;              // meters-scale scenes: 0.02–0.05 kills acne on facades [derived]
renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // soft edges, standard for sun
```

- **Follow the player, snap to texels.** Re-center the shadow camera on the car each frame, but round the light-space position to whole shadow-map texels — otherwise edges shimmer while driving ("shadow crawling"; snapping light-view projections to texel-sized increments stabilizes it — [Alex Tardif, shadow mapping](https://alextardif.com/shadowmapping.html), [discourse: moving shadow frustum with camera](https://discourse.threejs.org/t/moving-directionallight-shadow-frustum-with-camera/2700)).
- With one 4096 map over a 320 m box → ~7.8 cm/texel: crisp car/lamp shadows near, acceptable at 150 m **[derived]**.

### Phase 2 — CSM when one map isn't enough

[three-csm](https://github.com/StrandedKitty/three-csm) (`three/addons/csm/CSM.js` is the same code upstreamed — [docs](https://threejs.org/docs/pages/CSM.html)):

```js
new CSM({
  cascades: 3,                 // 3 is the fps-friendly sweet spot; examples use 4
  shadowMapSize: 2048,         // per cascade (example default 1024; 2048 for hero quality)
  maxFar: 400,                 // shadows vanish beyond this — don't pay for 1.6 km
  mode: 'practical',           // "for most cases practical may be the best choice"
  lightMargin: 300,            // ↑ for tall casters: 80-floor towers NEED a large margin,
                               // else tower shadows clip (default 200)
  fade: true,                  // smooth cascade transitions
  lightDirection, camera, parent: scene,
});
csm.setupMaterial(material);   // required on every shadow-receiving material —
                               // wire into the instanced-material factory once
```

([three-csm README](https://github.com/StrandedKitty/three-csm), [sbcode CSM tutorial](https://sbcode.net/threejs/csm/)). Note CSM's bias params are multiplied by frustum size — retune per cascade, don't copy single-light values.

- **Cost control:** 3 cascades = 3 shadow renders of the (instanced) scene. Keep small clutter (bollards, benches) `castShadow=false` beyond cascade 0; buildings + cars + lamps + trees cast.
- **Contact grounding for cars:** shadow maps at low sun under-darken tire contact; the existing **N8AO** pass supplies the contact occlusion — keep AO radius small (~0.5–1 m) so it grounds without dirtying facades **[derived]**.

---

## 8. Night scene that reads premium

### Strategy: "blue hour", not black night

Pitch black hides the world (bad for a *learning* sim) and exposes LOD sins. The premium browser-game look is **deep-dusk blue ambient + pools of warm light** (`neuer_zollhof` / `shanghai_bund` HDRIs are exactly this). Racing/driving games ship night as fog + lamps, not darkness.

### Rig **[derived, components cited]**

```js
scene.environment = neuerZollhofTexture;   // dusk HDRI at 1k
scene.environmentIntensity = 0.25;         // dim blue base so unlit areas stay readable
scene.fog = new THREE.FogExp2('#0e1420', 0.003);  // denser night envelope (see §6 table)
moon = new THREE.DirectionalLight('#5a70a0', 0.4); // cool key so cars keep a spec edge + faint shadows
```

### Emissive windows (the tower-glow layer)

- Bake **random lit-window emissive masks** into the facade textures (per-instance UV offset for variation — Blender pipeline job). `emissiveIntensity: 3–6` with warm `#ffb457`/cool `#cfe0ff` mix.
- **Selective bloom by emissive HDR values, not layers**: set pmndrs `Bloom` `luminanceThreshold: 1.0` — "nothing will glow by default, only the materials you pick" by pushing emissive above 1 ([react-postprocessing Bloom docs](https://react-postprocessing.docs.pmnd.rs/effects/bloom), [discourse: pmndrs selective bloom](https://discourse.threejs.org/t/pmndrs-post-processing-how-to-get-selective-bloom/58452)). Settings: `mipmapBlur: true, intensity: 0.6–1.0, luminanceThreshold: 1.0, luminanceSmoothing: 0.03` **[derived from docs defaults: threshold 0.9, smoothing 0.025]**. Works with the existing composer; ONE bloom pass covers windows + streetlights + tail-lights + signage.
- Single material for lit+unlit parts (emissive map controls it) — avoids mesh splits, keeps instancing intact ([discourse: Nocturnal selective bloom](https://discourse.threejs.org/t/nocturnal-selective-bloom/11761)).

### Streetlights (the REF-1 lamp rows at night)

Real dynamic lights don't scale: 30+ point lights tank or break the forward renderer ([discourse: many lights in a city game](https://discourse.threejs.org/t/performance-when-handling-large-number-of-lights-in-a-city-game/11802)). Three-tier fake, standard industry practice (lightmaps/projected pools — [GameDev.net: cheap rendering tricks](https://gamedev.net/forums/topic/670401-cheap-rendering-tricks-used-in-game-industry/5243265/)):

1. **Light pools** (all lamps): instanced ground-decal quads under each lamp — radial-gradient warm texture, `AdditiveBlending`, `depthWrite:false`, slight y-offset. Cost ≈ free; sells "pools of light" at any count.
2. **Lamp glow**: emissive lamp-head sphere (emissive 4–8 → bloom) + optional small additive billboard sprite. 
3. **Volumetric cones** (only lamps within ~60 m of camera): open `ConeGeometry` with additive gradient shader — the threex.volumetricspotlight "Good Enough Volumetrics" approach; no extra render passes ([threex.volumetricspotlight](https://github.com/jeromeetienne/threex.volumetricspotlight), [three.js #16147](https://github.com/mrdoob/three.js/issues/16147)).
4. **Real lights: budget 2–4 max**, only around the player car (headlight SpotLights ×2, nearest lamp ×1–2, swapped by proximity). r155+ units: spot/point intensity is candela — a street lamp ≈ 500–800 cd, car low beams ≈ 1000–1500 cd **[derived from physical-units change](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733)**; set `distance` ~25–40 m so the forward loop culls them.
5. **Headlight ground projection**: two additive decal quads ahead of the car (same trick as lamp pools) instead of relying on the SpotLights to light distant asphalt.

---

## 9. Implementation order (effort → payoff)

1. **Swap tone mapping to AgX, exposure 1.1, add HueSaturation +0.2** — 30 min, fixes "washed out" globally.
2. **Load `shanghai_riverside_1k.hdr` as environment (+2k/gainmap as background), environmentIntensity 0.8, rotate sun over the water** — 1 h.
3. **Sun DirectionalLight `#ffd9a0` @ 3.5, elevation 6°, 4096 PCFSoft shadows w/ follow+texel-snap; hemisphere fill 0.35** — the REF-1 long shadows — 0.5 day.
4. **FogExp2 `#e0c9a8` @ 0.0008** + fog-color-matches-horizon check — 1 h.
5. **Sun-oriented fog tint via onBeforeCompile** — 0.5 day, biggest atmosphere/$ in the doc.
6. **Night mode**: dusk HDRI + emissive window masks + threshold-1 bloom + instanced lamp pools — 1–2 days, mostly the texture-mask work.
7. **CSM (3×2048, practical, maxFar 400, lightMargin 300)** when tower shadows demand it — 1 day incl. material-factory wiring.

## 10. Key sources

- Poly Haven API (asset metadata verified live): `api.polyhaven.com/assets?type=hdris&categories=sunrise-sunset` / `…=night`; [sunrise-sunset gallery](https://polyhaven.com/hdris/sunrise-sunset)
- [r155 lighting changes (physical units, ×π migration)](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733)
- [three.js sky shader example (turbidity/rayleigh/mie defaults)](https://threejs.org/examples/webgl_shaders_sky.html)
- [drei Environment docs (children→env-map hybrid, intensities, rotation)](https://drei.docs.pmnd.rs/staging/environment)
- [Inigo Quilez — Better Fog (sun-tinted + height fog math)](https://iquilezles.org/articles/fog/)
- [FogExp2 docs](https://threejs.org/docs/pages/FogExp2.html) · [fog vs background problem](https://discourse.threejs.org/t/fog-color-from-the-skybox-environment/40670) · [multicolor fog solution](https://medium.com/@anumberfromtheghost/fog-with-dynamic-multicolored-backgrounds-in-three-js-b76907629cb1) · [fog shader hacks](https://snayss.medium.com/three-js-fog-hacks-fc0b42f63386)
- [three-csm](https://github.com/StrandedKitty/three-csm) · [CSM docs](https://threejs.org/docs/pages/CSM.html) · [Tardif — CSM + texel snapping](https://alextardif.com/shadowmapping.html) · [shadow frustum follow camera](https://discourse.threejs.org/t/moving-directionallight-shadow-frustum-with-camera/2700)
- [Tone mapping overview (AgX rationale)](https://discourse.threejs.org/t/tone-mapping-overview/75204) · [ACES washed-out thread](https://discourse.threejs.org/t/acesfilmictonemapping-leading-to-low-contrast-textures/15484) · [AgX PR discussion](https://github.com/mrdoob/three.js/issues/27362)
- [react-postprocessing Bloom](https://react-postprocessing.docs.pmnd.rs/effects/bloom) · [selective bloom via emissive threshold](https://discourse.threejs.org/t/pmndrs-post-processing-how-to-get-selective-bloom/58452) · [many-lights performance](https://discourse.threejs.org/t/performance-when-handling-large-number-of-lights-in-a-city-game/11802) · [threex.volumetricspotlight](https://github.com/jeromeetienne/threex.volumetricspotlight)
- [gainmap-js (HDR-as-JPEG)](https://github.com/MONOGRID/gainmap-js) · [Blockade Labs Skybox AI](https://www.blockadelabs.com/) · [LUTPass](https://threejs.org/docs/pages/LUTPass.html) · [pmndrs postprocessing gamma notes](https://cprimozic.net/notes/posts/threejs-pmndrs-postprocessing-gamma-correction/)
- [Wael Yasmina — ultra-realistic three.js (ACES + exposure 1.8)](https://waelyasmina.net/articles/how-to-create-ultra-realistic-scenes-in-three.js/) · [HemisphereLight outdoor pattern](https://threejs.org/docs/pages/HemisphereLight.html)
