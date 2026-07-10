# Quality Gap Root-Cause Analysis — REF 5 (current) vs REF 1/3 (targets)

**Lane:** root-cause decomposition of the visual quality gap, ranked by perceived-quality-per-effort
for a 60fps WebGL sim (ADR-005: Three.js + R3F + Rapier, mid-range hardware, eventually phones).
**Inputs:** docs/simulation/70_VISUAL_REFERENCE_BRIEF.md; live code audit of
`platform/src/modules/sim/environment/*` (SimEnvironment, presets, quality) and
`platform/src/modules/sim/world/components/CityBuildings.tsx`; web research (sources inline).
**Date:** 2026-07-10.

---

## 0. The one-paragraph verdict

REF 1 is an offline archviz render, but almost none of its *feel* comes from ray tracing. It comes
from (a) a **golden-hour value structure** — one warm, low, strong key light against a cool dim fill,
long shadows, dark ground plane; (b) **surface information** — facades and pavement carry luminance
detail (window grids, paver bands, stall lines) instead of flat albedo; (c) **aerial haze** giving
depth layering; and (d) a **graded, warm image**. All four are cheap or free in a rasterizer. The
current sim (REF 5) fails all four *simultaneously*, and because they multiply rather than add, the
result reads "toy": flat light × flat materials × flat ground × no atmosphere. The single most
important structural fact from the code audit: **the day preset's key:fill ratio is ~1.6:1
(sun 1.35 vs hemisphere 0.85) with a 55° sun** — that is textbook overcast-flat lighting, and no
amount of texturing will look good under it. Perception research consistently shows **luminance
contrast is the primary saliency/structure channel** — the visual system processes luminance faster
and more reliably than hue or saturation ([composition toolkit / saliency literature](https://cmerritthoughton.substack.com/p/art-the-composition-toolkit-components),
[Game Developer: lighting contrast fundamentals](https://www.gamedeveloper.com/art/lighting-design-fundamentals-using-contrast-in-your-game)) —
so fixing the luminance structure (light + ground values + haze) buys more perceived quality per
hour than any asset work, and it must land *first* so that asset work is evaluated under honest light.

---

## 1. Evidence: what the code actually does today

| Subsystem | Current state (audited) | File |
|---|---|---|
| Key light | Directional, day: `elevation 55°, intensity 1.35, #fff2df` | `environment/presets.ts:108` |
| Fill | Hemisphere `#cfe5ff / #3a4438, intensity 0.85` → key:fill ≈ 1.6:1 | `presets.ts:109` |
| Dusk preset | EXISTS and is already golden-hour shaped (`az 262°, el 8°, #ff9e54, 0.85`, warm fog `#d9a06b`) but sun intensity is *lower* than day and hemi 0.5 keeps ratio ≈ 1.7:1 | `presets.ts:130-133` |
| Exposure | Global `SIM_EXPOSURE = 1.05`, ACES filmic on both composer/non-composer paths | `SimEnvironment.tsx:80` |
| Post chain | med: N8AO(half-res, r=1.5m, i=1.5) → Bloom(thr 1.0) → SMAA → ACES; high adds HueSaturation(+0.06) + Vignette | `SimEnvironment.tsx:270-315` |
| Fog | FogExp2, day density 0.002, cool `#b7cfe6`; dusk 0.0028 `#d9a06b` | `presets.ts:111,133` |
| Shadows | Single directional, camera-following texel-snapped ortho frustum (`shadowRadiusM` per quality), bias −0.0004 / normalBias 0.05. No CSM | `SimEnvironment.tsx:245-259` |
| Buildings | Authored GLB kit v2 ("uniform glass kit"), instanced per (model, material-group, 200m chunk); materials are **untextured flat-color PBR** + `glass_lit` emissive; glass reflects `scene.environment` HDRI | `CityBuildings.tsx` |
| Ground | Uniform pale concrete/asphalt, no albedo/roughness maps, no decals (REF 5 transcription) | brief §REF 5 |
| Textures | Draco pipeline works; **KTX2/toktx NOT installed** → every texture would sit uncompressed in VRAM | task context |
| Legacy rig | A second, older `SceneLighting.tsx` (hemi 0.9 / dir 1.4, linear Fog 150–550) still exists under `components/sim/` — two lighting rigs in the tree | `components/sim/SceneLighting.tsx` |

---

## 2. Ranked causes (perceived-quality-per-effort, best first)

### C1 — Lighting value structure: high sun + strong fill = no shadows, no form (**effort: hours, data-only**)

**Gap:** REF 1 is low warm sun from the right, long shadows, dark shadow sides on every tower.
REF 5 has "flat ambient, weak shadows, no warm sun direction". The day preset's 55° sun with a
0.85-intensity hemisphere produces a lighting ratio near 1.6:1 — visually indistinguishable from
overcast. Contrast is read *as* light intensity: "we instinctively see contrast as a proxy for the
intensity of light in a scene; sharp contrasts suggest intense light, even mid-tones imply soft
light" ([Game Developer — lighting contrast](https://www.gamedeveloper.com/art/lighting-design-fundamentals-using-contrast-in-your-game)).
Luminance is the dominant perceptual channel (all saliency models weight it first), so this error
dominates *everything* on screen at once.

**Why it dominates:** it multiplies with every other cause — untextured boxes under flat light have
literally zero luminance variation per face; the same boxes under a 4:1 low sun get free per-face
value separation (lit face / shadow face / ground shadow), which is most of what "form" means.
Golden-hour physics also naturally warms the key and cools the fill, giving the warm/cool color
contrast of REF 1 for free ([golden hour: 2500–3500K key, sky fill takes over](https://lightplan.app/howto/golden-hour/),
[Wikipedia — golden hour](https://en.wikipedia.org/wiki/Golden_hour_(photography))). Side light
(sun ~90° to travel direction) maximizes visible shadow length and facade modeling
([golden-hour direction guidance](https://photographyicon.com/golden-hour-photography/)).

**Cheapest intervention (numbers to try, human-eyes pass required):**
- Make the REF-1 look a first-class preset (or retune `day`): sun **elevation 12–20°**,
  azimuth roughly perpendicular to the main boulevard, color `#ffd9a0..#ffc27a`,
  **intensity 2.5–3.5**; hemisphere **0.25–0.45**, sky `#a8c4e8`, ground `#4a4238` →
  key:fill **4:1 to 6:1**.
- three.js forum consensus post-r155: realistic outdoor renders want *much* hotter directional
  intensities than legacy habits (e.g. `DirectionalLight('#ffffff', 6)` in the Three.js Journey
  realistic-render lesson) with ACES compressing the top end
  ([Three.js Journey — Realistic render](https://threejs-journey.com/lessons/realistic-render)).
- ACES filmic is known to desaturate/flatten mid-tones ([three.js forum — ACES low contrast](https://discourse.threejs.org/t/acesfilmictonemapping-leading-to-low-contrast-textures/15484),
  [tone mapping overview](https://discourse.threejs.org/t/tone-mapping-overview/75204)); compensate
  with the hotter key + C5 grading rather than raising `SIM_EXPOSURE` (raising exposure alone
  brightens fill too and re-flattens).
- Delete/retire the legacy `components/sim/SceneLighting.tsx` rig so only one lighting authority
  exists (it currently encodes the exact flat look being replaced).

### C2 — Ground plane: pale, uniform, roughness-flat (**effort: days; biggest screen-area win**)

**Gap:** in a driver-eye camera the road + plaza occupy roughly the bottom 40–50% of every frame —
it is the single largest material on screen every second of a lesson. REF 5's ground is "uniform
pale concrete/asphalt with almost no tonal variation". REF 1's ground is **dark** asphalt (real
asphalt albedo ≈ 0.05–0.12) with white stall lines, two-tone paver bands, damp sun-streak
reflections. A pale ground also destroys C1: it bounces the scene into flatness and reads washed out
under any sun.

**Why it dominates:** area × frequency. Uniform tiling is the #1 "game-y" tell on large surfaces;
standard practice is a tiling base with small detail plus **decals for large features** — cracks,
patches, oil, tire marks, seams ([Polycount — road imperfections](https://polycount.com/discussion/226501/general-questions-about-road-imperfections),
road decal packs ship exactly this taxonomy: patches/seams/cracks/oil/dirt
([Daz road decals](https://www.daz3d.com/road-features-stains-cracks-and-seams-decals))).
Uniform roughness is the classic "renders look fake" failure — "many artists leave roughness almost
flat; real surfaces are never perfect" ([Renderistic — why renders look fake](https://www.renderistic.com/post/why-3d-renders-look-fake),
[3DSkillUp — roughness maps](https://3dskillup.art/roughness-maps-in-pbr/)).

**Cheapest intervention:**
1. **Darken asphalt albedo to ~#2e2e30–#3a3a3c** and paver concrete to mid-grey — one material
   constant, minutes, transforms C1's contrast instantly.
2. One **1K tiling asphalt set** (albedo + normal + roughness, PolyHaven CC0 via the existing
   blender-mcp `download_polyhaven_asset`) + a **macro variation mask** (very low-freq noise or a
   second UV at ~0.02× scale multiplying albedo ±10% and roughness ±0.2) to kill tiling at distance.
3. **Roughness variation for the damp look:** paint low-roughness (0.05–0.15) patches into the
   roughness map along wheel tracks/gutters; with `scene.environment` already set, MeshStandard's
   envmap gives the REF-1 damp-sun-streak for free. **Do NOT reach for SSR** — per the reflection
   trade-off literature, cubemap/envmap-based gloss is the racing-game standard; SSR is a per-pixel
   ray march, too hot for phones ([80.lv — how reflections in games are made](https://80.lv/articles/insights-how-reflections-in-games-are-made),
   [lettier — SSR](https://lettier.github.io/3d-game-shaders-for-beginners/screen-space-reflection.html)).
4. A handful of **instanced decal quads** (tire marks, manhole ring stains, patch rectangles,
   crosswalk wear) — one 1K atlas, one InstancedMesh, polygonOffset — standard breakup practice.

### C3 — Facade surface information: untextured boxes (**effort: the big one — 1–2 weeks of kit work; schedule after C1/C2 so it's judged under honest light**)

**Gap:** "buildings render as FLAT UNTEXTURED boxes … zero facade texture/relief/material
variation" vs REF 1's four distinct facade *systems* (concrete grid / vertical strips / dark curtain
twins / horizontal bands) with lit-window variation and stone podiums.

**Why it dominates:** at 10–300m the eye judges buildings almost entirely by **luminance pattern
frequency** (window grids, floor bands, mullions) — geometry relief is optional, texture is not.
The industry-standard cheap answer is **trim sheets + a facade atlas**: tiling strips UV-mapped onto
simple geometry "add the illusion of a higher level of detail", cut texture memory and draw calls
because everything shares one material ([Beyond Extent — trimsheets deep dive](https://www.beyondextent.com/deep-dives/trimsheets),
[80.lv — trim-sheet building texturing](https://80.lv/articles/how-to-texture-a-french-building-scene-with-a-mystic-ambiance),
[Frozenbyte wiki — tile textures & trimsheets](https://wiki.frozenbyte.com/index.php/3D_Asset_Workflow:_Tile_Textures_and_Trimsheets)).
Swapping which trim a wall samples produces facade variation "without touching UVs".

**Cheapest intervention:**
- ONE **2K facade trim/atlas texture** (albedo+normal+roughness+emissive) containing 4 horizontal
  bands = the 4 REF-1 facade systems (concrete punched grid, cream vertical strips, bronze curtain
  wall, white horizontal bands) + a podium/retail strip + a lit-window emissive variant. Author it
  procedurally in the existing headless Blender pipeline (bake grid + recess normals — the deep
  window recess shadow is the concrete-grid look).
- **Per-instance tint** via `InstancedMesh.instanceColor` (albedo × color, free in
  MeshStandardMaterial) to get beige/cream/grey population variety from one material.
- **Lit-window variation**: bake a random on/off mask into the emissive channel per atlas cell, or
  cheap shader hash on instance id — REF 1's towers read "alive" because ~10–30% of windows glow
  warm at golden hour.
- Emissive already blooms (threshold 1.0) — set lit-window emissive HDR intensity >1 so the
  existing Bloom picks it up.

### C4 — Atmosphere: no aerial perspective (**effort: hours, data-only**)

**Gap:** REF 1 has "slight haze"; towers step back in visibly lighter, warmer-grey planes. REF 5:
"no atmosphere/fog depth", flat pale sky. Current day fog density 0.002 cool-blue is ~invisible at
district scale.

**Why it dominates:** aerial perspective is a *hard-wired* depth cue — accumulated scattering is how
the brain estimates large distance, and it is simultaneously a realism cue and a scale cue
("atmospheric effects are important cues of realism, especially outdoors, and create depth"
[ATI/GDC — real-time atmospheric effects in games](https://www.gamedevs.org/uploads/real-time-atmospheric-effects-in-games-revisited.pdf),
[atmospheric scattering & aerial perspective](https://www.gamedeveloper.com/programming/atmospheric-scattering-and-volumetric-fog-algorithm-part-1)).
Without it, an 80-floor tower and a 10-floor box at different distances read as the same cardboard.

**Cheapest intervention:** retune existing `FogExp2` — golden-hour preset fog color **warm**
(`#d9b48a`-ish, must match the SkyDome horizon color for a seamless blend — the plumbing for this
already exists), density **0.004–0.006** so buildings at 300–500m visibly lift toward the horizon
color while 100m driving visibility stays crisp (a driving sim must keep signage legible ≤100m —
check against the rule-engine sight distances). Optional v2: a ~20-line height-falloff fog chunk
(`onBeforeCompile`) so haze pools low like REF 1 rather than tinting the zenith.

### C5 — Color grading: no unified grade (**effort: hours**)

**Gap:** REF 1 is obviously graded — warm highlights, lifted teal-ish shadows, controlled saturation.
Current high tier has only HueSaturation(+0.06) + vignette; med tier has none.

**Why it matters:** a LUT is the exact tool that turns "correct" into "cinematic" and unifies every
asset error under one look — "LUTs are extremely convenient when trying to create a specific look of
a scene or the whole game" ([three.js LUTPass docs](https://threejs.org/docs/pages/LUTPass.html),
[gkjohnson's LUT pass PR](https://github.com/mrdoob/three.js/pull/20558),
[three.js fundamentals — post-processing 3DLUT](https://threejsfundamentals.org/threejs/lessons/threejs-post-processing-3dlut.html)).
pmndrs `postprocessing` ships `LUT3DEffect` — it merges into the existing SMAA/ToneMapping effect
pass, so the marginal GPU cost is ~zero (one 32³ texture fetch).

**Cheapest intervention:** author one `.cube` LUT (grade a REF-5 screenshot toward REF 1 in any
photo tool, export 32³), add `<LUT lut={texture} />` before ToneMapping in the composer chain for
med+high. Keep the grade in the LUT, not in per-material tweaks. (Order note: grade after bloom,
before/with tone mapping — same slot the current HueSaturation occupies.)

### C6 — Set dressing density: the "lived-in" signal (**effort: days, mostly reuse**)

**Gap:** REF 3's own takeaway (already transcribed in the brief): "believable ≠ fancy — it's TREES +
LAWNS + PARKED CARS + BILLBOARDS + SIGNS + varied ordinary traffic that sell it." REF 1's midground
is a *parking lot with 15–25 parked cars and painted stall lines* — enormous believability per
triangle. REF 5 has lamps/benches/palms but reads sparse and unowned.

**Why it matters:** environmental storytelling density is what makes a space read functional and
inhabited ([RetroStyle — designing game cities](https://retrostylegames.com/blog/design-city-for-game/));
props are the cheapest realism channel because they reuse existing instancing infrastructure and
carry semantic realism (this street is *used*) that no shader can fake.

**Cheapest intervention:** instance the **existing traffic fleet as parked cars** (static, zero
physics, matte-varied instanceColor, slight yaw jitter ±2°, random 0–4cm curb offset) along curbs
and in stall-lined lots; stall lines are decal quads from C2's atlas. Add billboards-on-poles and
blue direction signs (the Bulgarian road-sign kit already exists). Target REF-3's density, not
REF-1's tower count.

### C7 — Shadow reach for long golden-hour shadows (**effort: days, perf-sensitive**)

**Gap:** an 8–20° sun throws shadows 3–7× object height — the current single camera-following ortho
frustum (`shadowRadiusM`, e.g. tens of meters) will clip tower shadows that should sweep across the
whole boulevard, and buildings only *cast* on the "full" tier.

**Why it matters:** C1's payoff is partially gated on this — long shadows ARE the golden-hour
signature. But shadow cost is real on mobile ("shadow map generation requires an additional
full-scene render pass; on mobile GPUs this alone can halve your frame rate"
[Soft8Soft — WebGL optimization](https://www.soft8soft.com/docs/manual/en/introduction/Optimizing-WebGL-performance.html)).

**Cheapest intervention, in order:** (1) keep the single map but stretch the ortho box along the
sun axis + raise `shadowRadiusM` on med/high; (2) if edges get mushy, adopt
[three-csm](https://github.com/StrandedKitty/three-csm) (2–3 cascades, "tightening the frustum
beats cranking resolution" [sbcode CSM notes](https://sbcode.net/threejs/csm/)); (3) for the *low*
tier, fake it: bake a blurred elongated blob/AO texture under each building instance — baked shadows
are the canonical mobile answer.

### C8 — Traffic/asset material response (**effort: days**)

**Gap:** REF 5 traffic reads "flat paint, no material response at distance". The hero car proves the
fix works (glossy dark paint + sun highlight reads great) — the fleet just doesn't share it.

**Cheapest intervention:** give fleet paint materials `envMapIntensity 0.8–1.2`, roughness 0.25–0.4,
metalness ~0.9 on paint (or clearcoat if budget allows on high tier only), dark smooth glass
(roughness 0.05), per-instance `instanceColor` body-color variety from a curated palette
(dark/light/silver/white mix like REF 1's lot). Cars are the second-strongest reflection carrier
after damp ground; cubemap/envmap gloss is the racing-game standard ([80.lv reflections](https://80.lv/articles/insights-how-reflections-in-games-are-made)).

### C9 — Enabler, not a look-cause: KTX2 pipeline gap (**effort: hours to unlock**)

C2/C3 add real textures for the first time; without GPU compression a 2K RGBA texture is 16MB+mips
of VRAM *each*, uncompressed, on phones. KTX2/Basis stays compressed into VRAM (4–8× cut) and every
major web engine transcodes natively ([Don McCurdy — web texture formats](https://www.donmccurdy.com/2024/02/11/web-texture-formats/),
[KhronosGroup KTX artist guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md)).
**Install KTX-Software (toktx) for Windows and wire `gltf-transform etc1s/uastc` into the existing
GLB pipeline before C3 ships.** Facade albedo/emissive → ETC1S; normal/roughness → UASTC. WebP is a
download-size fallback only — it decompresses to full-size RGBA in VRAM.

### C10 — Out of this lane but recorded: cockpit framing (REF 6)

The letterboxed windshield is a **camera contract bug** (eye height/pitch/FOV + mirror cam aim and
exposure), not a rendering-quality cause. Fix direction is already specified in the brief
(windshield ≈ 50–55% of frame, road 10–100m visible). Keep it out of the materials/lighting
workstream so it doesn't confound before/after judgments.

---

## 3. Interaction map & sequencing

```
C1 lighting ──┬─ multiplies → C2 ground contrast, C3 facade form, C7 shadows
              └─ REQUIRED FIRST: all asset work judged under target light
C2 ground ──── biggest screen area; makes C1 visible from cockpit cam
C4 fog + C5 LUT ── same afternoon as C1; pure data/one texture
C3 facades ─── the big asset build; gated on C9 (KTX2) for phone VRAM
C6 dressing ── parallel anytime; reuses fleet + sign kit
C7 shadows ─── tune after C1 fixes sun angle (frustum shape depends on it)
C8 fleet paint ─ parallel anytime; copies hero-car material recipe
```

**Recommended order:** C1+C4+C5 in one "golden-hour patch" (days, data + one LUT texture, zero new
draw calls) → C2 ground (biggest area) → C9 unlock → C3 facade kit v3 → C6+C8 in parallel → C7 tune.
Expected outcome of the first patch alone: the scene stops reading "washed out" before a single new
asset lands, because the failure REF 5 describes is first and foremost a **value-structure** failure.

---

## 4. Perf guardrails (why each intervention is web/phone-safe)

- C1/C4/C5: zero new passes (LUT merges into the existing effect pass), zero new draw calls.
- C2/C3: textures via KTX2 (C9); trim-sheet approach means ~2 new materials total, instancing
  preserved; anti-tiling via macro mask is one extra texture fetch.
- C6: pure instancing of already-loaded GLBs.
- C7: capped by tier — CSM only on med/high; baked blobs on low. Mobile budget reference: keep draw
  calls low and prefer baked/static lighting ([Soft8Soft WebGL guide](https://www.soft8soft.com/docs/manual/en/introduction/Optimizing-WebGL-performance.html),
  [gamedevjs — WebGL best practices](https://gamedevjs.com/articles/best-practices-of-optimizing-game-performance-with-webgl/)).
- Explicit non-goals for this gap: SSR, volumetric fog, realtime GI, planar reflections — all
  identified as the expensive path; the envmap+fresnel+decal+LUT stack is how shipped racing games
  on weak hardware get the REF-1 feel.

## 5. Source index

- Lighting/perception: [Game Developer — lighting contrast fundamentals](https://www.gamedeveloper.com/art/lighting-design-fundamentals-using-contrast-in-your-game) · [composition/saliency (luminance-first)](https://cmerritthoughton.substack.com/p/art-the-composition-toolkit-components) · [iXie — lighting & mood](https://www.ixiegaming.com/blog/exploring-lighting-and-mood-in-game-art/)
- Golden hour physics: [lightplan.app](https://lightplan.app/howto/golden-hour/) · [Wikipedia](https://en.wikipedia.org/wiki/Golden_hour_(photography)) · [photographyicon](https://photographyicon.com/golden-hour-photography/)
- Tone mapping/exposure: [Three.js Journey — realistic render](https://threejs-journey.com/lessons/realistic-render) · [ACES low-contrast thread](https://discourse.threejs.org/t/acesfilmictonemapping-leading-to-low-contrast-textures/15484) · [tone mapping overview](https://discourse.threejs.org/t/tone-mapping-overview/75204)
- Materials/imperfection: [Renderistic — why renders look fake](https://www.renderistic.com/post/why-3d-renders-look-fake) · [3DSkillUp — roughness maps](https://3dskillup.art/roughness-maps-in-pbr/) · [School of Motion — surface imperfections](https://www.schoolofmotion.com/blog/adding-surface-imperfections)
- Trim sheets: [Beyond Extent deep dive](https://www.beyondextent.com/deep-dives/trimsheets) · [80.lv French building](https://80.lv/articles/how-to-texture-a-french-building-scene-with-a-mystic-ambiance) · [80.lv Arabian Afternoon](https://80.lv/articles/arabian-afternoon-working-with-trim-sheets-efficiently) · [Frozenbyte wiki](https://wiki.frozenbyte.com/index.php/3D_Asset_Workflow:_Tile_Textures_and_Trimsheets)
- Atmosphere: [GDC/ATI real-time atmospheric effects](https://www.gamedevs.org/uploads/real-time-atmospheric-effects-in-games-revisited.pdf) · [Wronski — scattering & aerial perspective](https://www.gamedeveloper.com/programming/atmospheric-scattering-and-volumetric-fog-algorithm-part-1)
- Ground decals: [Polycount — road imperfections](https://polycount.com/discussion/226501/general-questions-about-road-imperfections) · [road decal taxonomy](https://www.daz3d.com/road-features-stains-cracks-and-seams-decals)
- Grading: [three.js LUTPass](https://threejs.org/docs/pages/LUTPass.html) · [LUT pass PR #20558](https://github.com/mrdoob/three.js/pull/20558) · [threejsfundamentals 3DLUT](https://threejsfundamentals.org/threejs/lessons/threejs-post-processing-3dlut.html)
- Reflections: [80.lv — reflections in games](https://80.lv/articles/insights-how-reflections-in-games-are-made) · [lettier — SSR](https://lettier.github.io/3d-game-shaders-for-beginners/screen-space-reflection.html)
- Shadows: [three-csm](https://github.com/StrandedKitty/three-csm) · [sbcode CSM](https://sbcode.net/threejs/csm/) · [threejs CSM example](https://threejs.org/examples/webgl_shadowmap_csm.html)
- Textures/VRAM: [Don McCurdy — web texture formats](https://www.donmccurdy.com/2024/02/11/web-texture-formats/) · [KTX artist guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md)
- WebGL perf: [Soft8Soft optimization](https://www.soft8soft.com/docs/manual/en/introduction/Optimizing-WebGL-performance.html) · [gamedevjs best practices](https://gamedevjs.com/articles/best-practices-of-optimizing-game-performance-with-webgl/)
