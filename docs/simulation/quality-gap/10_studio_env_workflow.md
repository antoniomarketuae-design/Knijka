# How studios build stylized-realistic game cities on small budgets — and the pass-by-pass workflow for our district

Research digest, 2026-07-10. Lane: modular kit theory, set-dressing passes, LOD/draw-call budgets,
"why does my scene look flat" diagnostics — distilled into an ordered workflow to run over the
existing Книжка.AI district (Three.js + R3F, 60fps mid-range → phones, ADR-005).
Gap definition: `docs/simulation/70_VISUAL_REFERENCE_BRIEF.md` (REF 1 target vs REF 5/6 current).

---

## 1. The headline finding

Every credible source converges on the same diagnosis pattern for scenes like our REF 5:
**geometry/layout is the cheap part; the perceived quality lives in (a) lighting/values,
(b) material response, (c) mid-frequency detail (props/decals/clutter), in that order of
leverage-per-hour.** Bethesda shipped 400+ unique Skyrim interiors with **2 kit artists + 8
level designers in 2.5 years** ([GDC 2013, Joel Burgess](https://www.gamedeveloper.com/design/skyrim-s-modular-approach-to-level-design)) —
small teams win by polishing the *generic repeated pieces*, not hero pieces, and by running
discrete quality passes over an unchanging blockout.

---

## 2. Modular kit design theory (Burgess GDC 2013/2016, Lee Perry 2002)

Primary sources:
- Joel Burgess & Nate Purkeypile, *Skyrim's Modular Approach to Level Design*, GDC 2013 —
  [full transcript](http://blog.joelburgess.com/2013/04/skyrims-modular-level-design-gdc-2013.html) /
  [Game Developer mirror](https://www.gamedeveloper.com/design/skyrim-s-modular-approach-to-level-design)
- Joel Burgess, *The Modular Level Design of Fallout 4*, GDC 2016 —
  [slides PDF](https://media.gdcvault.com/gdc2016/Presentations/Burgess_Joel_Modular%20Level%20Design.pdf)
- Lee Perry (Epic), *Modular Level and Component Design*, Game Developer Magazine Nov 2002 —
  [PDF](https://docs.unrealengine.com/udk/Three/rsrc/Three/ModularLevelDesign/ModularLevelDesign.pdf)
  (the founding article of kit-of-parts practice)
- Synthesis: [Level Design Book — modular kit design](https://book.leveldesignbook.com/process/blockout/metrics/modular),
  [80.lv — Building Huge Open Worlds: Modularity, Kits & Art Fatigue](https://80.lv/articles/building-huge-open-worlds-modularity-kits-art-fatigue)

### The rules

1. **Footprint is law.** Every kit piece fits a uniform 3D bounding box; different sub-kit
   footprints must be **integer multiples of each other** (512 tiles with 256; 384 eventually
   gaps/overlaps as the kit loops back on itself). For our city: pick a facade module width
   (e.g. 3 m bay) and make podium/tower/retail pieces multiples of it.
2. **Snap as large as possible** — designers build at half the footprint dimension. Big snap =
   fast assembly, no seams.
3. **Pivots at ground plane, consistent** (edge pivots only for hinge-like pieces such as pipes).
4. **Geometry stays *inside* the footprint** to avoid co-planar z-fighting where pieces meet —
   directly relevant to our current facade seams.
5. **Kit scope tracks usage frequency**: Skyrim's cave kit (used 200+ times) got 7 sub-kits of
   ~50 pieces; the Ratway kit (used twice) got 7 pieces total. → Our boulevard-facing tower kit
   deserves 10× the effort of a back-alley filler.
6. **Invert the hero instinct**: put art effort into the pieces used "hundreds if not thousands
   of times", not the one-off hero. A repeated piece IS the production value.
7. **Clutter over architecture**: Bethesda found players "were quicker to react negatively to
   repeated *detail elements* than to broad architectural repetition." Repeat the towers freely;
   vary the benches/planters/signs/parked cars.
8. **Kitbash across kits** ("glue kits"): small transitional pieces (planters, arcade columns,
   canopy strips) designed to bridge any two facade systems break the "same building" read.
9. **Workflow phases (Bethesda)**: Concept (~1 wk) → Proof, untextured (1–3 wk) → Graybox +
   designer stress-tests (1–4 wk) → Build-out/texturing (long) → Polish (ongoing).
   **Functional polish before visual polish** — dimension changes after deployment break
   hundreds of placements ([80.lv Burgess interview](https://80.lv/articles/building-huge-open-worlds-modularity-kits-art-fatigue)).
10. **Stress-test the kit** before art: loop-back test (does it close on itself), stack test,
    gap test ([Level Design Book](https://book.leveldesignbook.com/process/blockout/metrics/modular)).

---

## 3. Texturing economics: trim sheets, texel density, window tricks

### Ultimate Trim (Insomniac, GDC 2015)
Morten Olsen, *The Ultimate Trim: Texturing Techniques of Sunset Overdrive* —
[GDC Vault](https://gdcvault.com/play/1022324/The-Ultimate-Trim-Texturing-Techniques) /
[free video mirror](https://archive.org/details/GDC2015Olsen2) /
[polycount thread](https://polycount.com/discussion/160794/the-ultimate-trim-technique-from-sunset-overdrive).
A small env team textured an entire open-world city with a **standardized trim-sheet layout**:
one texture divided into horizontal strips of increasing height, normal map with 45° bevels
baked along every strip edge → "high-poly look" on simple geometry, materials swappable
between assets **without re-UVing**, huge memory/draw-call savings. This is the single most
web-budget-compatible AAA texturing technique: a handful of shared 1–2K trim/atlas textures
for the whole district instead of per-building maps. Free tooling exists
([CG Channel — Ultimate Trim tools](https://www.cgchannel.com/2019/07/download-justen-lazarros-free-ultimate-trim-texturing-tools/)).

### Texel density budgets
([Beyond Extent deep dive](https://www.beyondextent.com/deep-dives/deepdive-texeldensity),
[Clinton Crumpler cheat sheet](https://static1.squarespace.com/static/5d5eb34eac3f110001ae71de/t/61fbc17457c3c3465fe8edf4/1643889045474/clinton_crumpler-abf6b83b3b65-Texel_Density.pdf))
- Background/large architecture: **~512 px/m**; hero/near assets: **~1024 px/m**.
- Consistency matters more than the absolute number — mismatched density (crisp next to blurry)
  is an instant "game-looking" tell. For our cockpit camera, road surface + near curb + signage
  are the "hero" density tier; tower shafts can run 256–512 px/m tiling.

### Facades: 4+ systems, lit windows, fake interiors
- **Lit-window variation without textures-per-building**: shader picks a random subset of
  windows per instance (hash of instance ID + window UV cell), single warm-to-cool emissive
  color per building drawn from a narrow yellow→blue ramp
  ([3DWorld window generation](http://3dworldgen.blogspot.com/2018/04/building-window-generation.html),
  [UE forum thread on random lit windows](https://forums.unrealengine.com/t/how-would-you-do-it-material-for-randomly-light-dark-city-building-windows/109325),
  [Procedural Window Lighting paper](https://leiy.cc/publications/procwin/procwin.pdf)).
- **Interior mapping** (the Spider-Man PS4 trick) for ground-floor retail and near-camera
  glass: raycast in the fragment shader against implicit room planes, sample a small cubemap
  atlas of rooms — real parallax, zero geometry
  ([Joost van Dongen, technique author](http://joostdevblog.blogspot.com/2018/09/interior-mapping-real-rooms-without.html),
  [Game Developer article](https://www.gamedeveloper.com/programming/interior-mapping-rendering-real-rooms-without-geometry),
  [how Spider-Man used it](https://automaton-media.com/en/news/20231201-23558/)).
  Studios hide close-up flaws with tinted/dirty glass — matches REF 1's bronze glass perfectly.
  For tower shafts at distance, plain emissive-cell variation is enough; reserve interior
  mapping for podium retail bands the driver passes at 3–10 m.

---

## 4. Set-dressing pass structure (how studios sequence an art pass)

Sources: [Level Design Book — Environment Art](https://book.leveldesignbook.com/process/env-art),
[Klafke — Creating Modular Environments](https://www.thiagoklafke.com/tutorials/modular-environments/),
[polycount wiki — Modular environments](http://wiki.polycount.com/wiki/Modular_environments),
CDPR *Art Direction Summit: Building Night City* GDC 2022
([GDC Vault](https://www.gdcvault.com/play/1027571/Art-Direction-Summit-Building-Night)) — early
design → final **quality pass** pipeline over a handcrafted open city.

The consensus stage order:

1. **Blockout / massing** — silhouettes, proportions, color swatches only. "START BIG, save
   smaller details for later art passes."
2. **Primary art pass** — tiling materials + trim sheets on the massing; large-scale material
   read (concrete vs glass vs asphalt). No props yet.
3. **Set dressing / prop pass** — generic props in **clusters** (fractal, asymmetric grouping —
   never even spacing), hero props ONCE each to anchor a place.
4. **Decal pass** — cracks, oil stains, tire marks, manhole covers, curb wear, patched asphalt,
   drips under AC units; studios ship dedicated decal atlases for exactly this
   ([polycount on road imperfections](https://polycount.com/discussion/226501/general-questions-about-road-imperfections),
   [photoscanned urban decal packs as reference inventory](https://www.unrealengine.com/marketplace/en-US/product/street-decals-4k-cracks-grids-gates-manholes)).
   Decals are the cheapest realism-per-byte in the whole pipeline.
5. **Lighting + atmosphere pass** — but re-lit continuously: "doing the lighting and
   postprocessing each time you add elements makes a real difference" (polycount).
6. **Polish pass** — post grading, exposure, final prop nudge, screenshot-driven fixes.

Key discipline: **work iteratively across the whole scene** — "get multiple objects to 50%,
then step back and evaluate"; never finish assets one-by-one to 100%
([Level Design Book](https://book.leveldesignbook.com/process/env-art)).
Set dressing at scale: **procedural placement to ~80% coverage, hand-refine the last 20%**
where the camera lingers ([exp-points fundamentals](https://www.exp-points.com/environment-artist-fundamentals)) —
maps directly onto our Blender-headless generators + manual JSON overrides.

---

## 5. The "why does my scene look flat" checklist

Compiled from [exp-points — Environment Artist Fundamentals](https://www.exp-points.com/environment-artist-fundamentals),
[polycount lighting threads](https://polycount.com/discussion/221591/id-like-some-advice-on-lighting),
[polycount wiki — Lighting](http://wiki.polycount.com/wiki/Lighting). Ordered by how often it's
the actual culprit:

1. **Values are wrong.** View the scene desaturated (B/W). If it reads flat in greyscale, no
   color/texture work will save it. "If your values are wrong, no matter what you do with your
   colours, the piece will fall apart." REF 5's washed-out uniform grey fails this test today.
2. **No directional key light.** All-ambient / HDRI-only = flat. Establish key (warm low sun),
   fill (sky), rim (bounce/env), test each in isolation. One area bright, rest dimmer — even
   value everywhere is flatness by definition.
3. **No shadow contrast / AO.** Contact shadows and occluded corners create depth. Separate
   AO term (N8AO already in our composer — tune radius/intensity per REF 1's deep window
   recesses); never bake AO into albedo under a moving sun.
4. **Uniform roughness.** "Roughness is one of the strongest tools to make a surface
   believable" — most real materials are mid-rough with *variation* (grunge masks, curvature
   wear). A single roughness value per material = plastic toy look — this is REF 5's traffic
   problem ([3DSkillUp roughness](https://3dskillup.art/roughness-maps-in-pbr/)).
5. **No atmospheric depth.** Distance haze (height/exponential fog, slight blue shift, reduced
   contrast with distance) is what separates layers of the city. Subtle: too much kills depth
   again. REF 1's "slight haze" is doing enormous work.
6. **No focal point.** The eye goes to the highest value-contrast point; if that's nowhere
   deliberate, the scene reads as noise. For a driving sim: the road corridor + next landmark
   tower should hold contrast.
7. **Mid-frequency detail missing.** Big shapes exist (towers), micro detail exists (texture
   pixels), but the middle band — balconies, AC units, parapets, signage, awnings, planters,
   parked cars — is empty. This band is what "toy vs place" hinges on. REF 3's lesson:
   believable ≠ fancy — trees + lawns + parked cars + billboards + signs sell it.
8. **Post applied before foundations.** Grading/bloom last; clamp exposure; don't use post to
   rescue bad values.

---

## 6. LOD strategy and draw-call budgets for a web city

### Budgets (three.js-specific, cross-checked)
- **< 100 draw calls** keeps most devices at 60fps; **> 500** hurts even strong GPUs;
  **mobile target: < 50 draw calls**, pixel ratio capped at 2, KTX2 textures, shadow maps
  minimized ([Three.js Roadmap — Draw Calls](https://threejsroadmap.com/blog/draw-calls-the-silent-killer),
  [utsubo 100 tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips),
  [Codrops — Building Efficient Three.js Scenes](https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/)).
- Mobile thermal throttling after 5–10 min sustained load — budget for the *throttled* state,
  not the first minute (relevant: a driving lesson is 10–30 min).
- Tools: `InstancedMesh` (N copies, 1 geometry, 1 call — our current path),
  `BatchedMesh` (different geometries, one shared material, 1 call — the natural fit for a
  trim-sheet/atlas city where every facade shares one material), geometry merging for fully
  static blocks.
- **NOTE for us:** KTX2/toktx is not installed in our pipeline — installing the KTX2 encoder is
  a prerequisite for the mobile texture budget (GPU-resident compressed textures, ~4–8× VRAM
  saving vs PNG-in-GLB).

### City LOD pattern (proven on mobile: Pocket City 2)
[Pocket City 2 dev notes](https://blog.pocketcitygame.com/dev-notes-rendering-large-3d-cities-on-mobile-for-pocket-city-2/):
- **3 hand-made LOD meshes per building** (auto-decimation rejected for quality).
- Buildings combined into **chunks capped at ~65k vertices**, one shared material per chunk
  (single atlas) → draw calls collapse to ~1 per chunk per material.
- Only visible chunks are generated/kept; others deleted (memory ↔ CPU trade).
- Trees/foliage: atlased **billboards**, instanced.
- General LOD ladder for cities ([GameDev.net open-world threads](https://gamedev.net/forums/topic/711289-far-away-objects-and-horizon-in-an-open-world-game/)):
  LOD0 full kit piece → LOD1 simplified shell (windows become texture) → LOD2 box with baked
  facade atlas → LOD3 imposter/billboard or skyline card. Far LODs replace geometry with
  imposters when fill-rate beats vertex cost; distant tower interiors/recesses become a
  *texture*, which conveniently matches REF 1's punched-window look.
- Urban occlusion is a gift: towers hide towers; even coarse frustum + distance culling of
  whole blocks pays.

### Web-scale existence proof
[Slow Roads case study (web.dev)](https://web.dev/case-studies/slow-roads): an acclaimed
browser driving game runs procedural scenery at 60fps by keeping geometry simplistic and
pushing detail into **custom shaders combining multiple tiling textures** — detail lives in
the shader, not the mesh. Initial scene gen 3.2 s; deferred init behind a splash button.
The same "cheap mesh + smart shader" split is our REF 1 path.

---

## 7. THE DELIVERABLE — ordered pass-by-pass workflow for our existing district

Run these as discrete, committable passes. After EVERY pass: re-shoot the same 3 fixed
benchmark cameras (cockpit REF-6 framing, chase REF-5 framing, promenade wide REF-1 framing)
+ a desaturated variant, and check the flatness checklist (§5). Do not start pass N+1 until
pass N screenshots beat the previous set.

**Pass 0 — Audit & look-dev target (0.5 day).**
Fix the benchmark cameras in code. Grab current-state shots (= REF 5/6 baselines). Define the
kit grid: facade bay width, podium height, block module — verify existing pieces are integer
multiples (Burgess footprint rule); fix offenders now, before any art (functional before
visual polish — changing dimensions later breaks every placement).

**Pass 1 — Lighting & atmosphere (1–2 days, biggest single win for REF 5).**
Golden-hour key: warm low directional sun (azimuth matching REF 1's right-side sun, elevation
~10–20°), long shadows enabled for hero radius only (CSM or single tight shadow cascade around
the player, nothing shadowed beyond ~150 m). Sky/fill: keep the HDRI for reflections but
*grade* ambient toward blue-grey so sun-vs-shade has a warm/cool split. Add subtle exponential
height fog with slight blue-warm horizon tint (atmospheric perspective, §5.5). Tune N8AO for
deep window recesses + street canyons. Exposure: lock, don't autoexpose; ACES already present.
Validate in greyscale: sunlit faces vs shaded faces must separate clearly.

**Pass 2 — Facade material systems (2–4 days).**
Build ONE shared trim-sheet/atlas (Ultimate-Trim layout, §3) covering: exposed concrete,
cream precast, bronze glass, blue-grey glass, stone podium, retail band, parapet trims, plus
a grunge/AO strip. Re-map the existing 4+ facade kits (concrete grid / vertical strips / dark
curtain twins / horizontal bands, per REF 1) onto it. Per-instance shader variation: albedo
tint jitter (±5% value, slight hue), random lit-window subset with one warm emissive color per
building (§3), roughness variation via a shared grunge mask. Window recesses: real inset at
LOD0 near the road, normal-map fake beyond. One material → BatchedMesh eligibility for the
whole skyline.

**Pass 3 — Ground plane variety (1–2 days).**
The driver stares at asphalt 90% of the time; it's hero-density (§3 texel budgets). Layers:
base asphalt with large-scale tonal variation (2 overlapping tiling scales à la Slow Roads),
damp-asphalt response near REF 1 feel (lower roughness patches + env reflections), distinct
materials for road / curb / paver promenade (two-tone bands) / parking-lot asphalt / lawn.
Then the **decal pass** (§4.4): lane wear, tire marks at stop lines, oil stains in parking
stalls, manholes, asphalt patches, curb chips, crosswalk wear — one decal atlas, instanced
quads with polygonOffset, ~zero cost, top realism-per-byte.

**Pass 4 — Set dressing & clutter (2–3 days).**
Burgess's law: vary the clutter, not the architecture. Instanced generic sets in *clusters*:
street trees in grates + planters (липа/кестен — doc 70 SOFIA localisation 1, never palms),
benches, street lamps (~20 m rhythm), utility boxes, black metal
railing runs, bollards (yellow-black at lot entrances), billboards/poles, blue direction
signs, bus stop. **Parked cars are set dressing**, not traffic: fill parking stalls + curbs
with 15–25 statically instanced fleet cars, varied dark/light paint (REF 1 midground).
Ground floors: retail glazing band + interior mapping or emissive interior cards + occasional
red signage strip. Hero props (one each): a fountain, a landmark sculpture, the **Vitosha ridge**
on the horizon — anchors, used ONCE (§4.3). (Not a supertall spire: doc 70 SOFIA localisation 3.)

**Pass 5 — Traffic & life material fix (1–2 days).**
REF 5's toy-car problem is material, not geometry: give the shared car shader clearcoat-ish
specular + env-map response at distance, roughness variation, tinted glass, dark wheel wells.
Vary fleet paint via instanced color. A few pedestrians on the promenade (billboard or
low-poly) shift "diorama" → "place".

**Pass 6 — Performance hardening (1–2 days, then continuous).**
Install KTX2/toktx and convert atlases. Chunk the district (Pocket City pattern §6): merge
static per-block geometry, 3-tier LOD ladder, skyline imposters/cards for beyond ~400 m,
distance-cull clutter (small objects vanish first), one shadow cascade, DPR clamp. Budget
gates: **≤100 draw calls desktop / ≤50 mobile**, measure *after 10 min* for thermal throttle.
`renderer.info.render.calls` on the benchmark cameras is part of the screenshot ritual.

**Pass 7 — Polish & grade (ongoing).**
Final post: gentle bloom on emissives/sun glints, slight warm grade, vignette off or minimal.
Re-run §5 checklist. Cockpit framing fix per REF 6 directive (windshield 50–55%) is part of
this pass's benchmark camera, not a separate art task.

Total: ~9–15 working days of passes, each independently shippable and verifiable.

---

## 8. Source index

Kit theory: [Burgess GDC 2013 transcript](http://blog.joelburgess.com/2013/04/skyrims-modular-level-design-gdc-2013.html) ·
[Game Developer summary](https://www.gamedeveloper.com/design/skyrim-s-modular-approach-to-level-design) ·
[Fallout 4 GDC 2016 slides](https://media.gdcvault.com/gdc2016/Presentations/Burgess_Joel_Modular%20Level%20Design.pdf) ·
[Lee Perry 2002 PDF](https://docs.unrealengine.com/udk/Three/rsrc/Three/ModularLevelDesign/ModularLevelDesign.pdf) ·
[Level Design Book modular](https://book.leveldesignbook.com/process/blockout/metrics/modular) ·
[80.lv Burgess interview](https://80.lv/articles/building-huge-open-worlds-modularity-kits-art-fatigue) ·
[polycount wiki modular](http://wiki.polycount.com/wiki/Modular_environments)
Texturing: [Ultimate Trim GDC Vault](https://gdcvault.com/play/1022324/The-Ultimate-Trim-Texturing-Techniques) ·
[archive.org video](https://archive.org/details/GDC2015Olsen2) ·
[polycount thread](https://polycount.com/discussion/160794/the-ultimate-trim-technique-from-sunset-overdrive) ·
[Beyond Extent texel density](https://www.beyondextent.com/deep-dives/deepdive-texeldensity) ·
[Crumpler texel density sheet](https://static1.squarespace.com/static/5d5eb34eac3f110001ae71de/t/61fbc17457c3c3465fe8edf4/1643889045474/clinton_crumpler-abf6b83b3b65-Texel_Density.pdf)
Windows/interiors: [Interior Mapping (Joost)](http://joostdevblog.blogspot.com/2018/09/interior-mapping-real-rooms-without.html) ·
[Game Developer version](https://www.gamedeveloper.com/programming/interior-mapping-rendering-real-rooms-without-geometry) ·
[Spider-Man explainer](https://automaton-media.com/en/news/20231201-23558/) ·
[3DWorld windows](http://3dworldgen.blogspot.com/2018/04/building-window-generation.html) ·
[Procedural window lighting paper](https://leiy.cc/publications/procwin/procwin.pdf)
Passes/dressing: [Level Design Book env-art](https://book.leveldesignbook.com/process/env-art) ·
[Klafke modular tutorial](https://www.thiagoklafke.com/tutorials/modular-environments/) ·
[Building Night City GDC Vault](https://www.gdcvault.com/play/1027571/Art-Direction-Summit-Building-Night) ·
[Procedurally Crafting Manhattan (Spider-Man) GDC 2019](https://media.gdcvault.com/gdc2019/presentations/santiago_david_procedurally_crafting_manhattan.pdf) / [video](https://www.youtube.com/watch?v=4aw9uyj9MAE)
Flatness: [exp-points fundamentals](https://www.exp-points.com/environment-artist-fundamentals) ·
[polycount lighting advice](https://polycount.com/discussion/221591/id-like-some-advice-on-lighting) ·
[polycount wiki lighting](http://wiki.polycount.com/wiki/Lighting) ·
[3DSkillUp roughness](https://3dskillup.art/roughness-maps-in-pbr/)
Perf/LOD: [Pocket City 2 dev notes](https://blog.pocketcitygame.com/dev-notes-rendering-large-3d-cities-on-mobile-for-pocket-city-2/) ·
[Draw Calls: The Silent Killer](https://threejsroadmap.com/blog/draw-calls-the-silent-killer) ·
[utsubo 100 three.js tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips) ·
[Codrops efficient scenes](https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/) ·
[Slow Roads case study](https://web.dev/case-studies/slow-roads) ·
[discoverthreejs tips](https://discoverthreejs.com/tips-and-tricks/)
