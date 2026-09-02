/**
 * SNOW THAT LIES ON SOMETHING OTHER THAN THE ROAD.
 *
 * WHY THIS FILE EXISTS — sweep w11, `sc-ac-snow:cfb2d46d`, critical: „No snow
 * has accumulated on any off-carriageway surface in shot — kerbs, pavements,
 * guard rail and building faces are all bare", re-judged on the w11 re-drive as
 * „the green full-leaf tree carries nothing … the dark railing run beside the
 * pavement carries nothing — beside a verge and pavement that are now white".
 *
 * THE ROOT CAUSE, measured in the tree rather than inferred from the frame.
 * Until this file, the ENTIRE renderer had exactly ONE place where lying snow
 * changed a surface: `environment/weather.ts`'s `roadSurfaceToParams`, read by
 * `StaticWorld.tsx` for the asphalt and the road decals and by nothing else.
 * Measured 2026-08-26, BEFORE this file existed:
 * `grep -rn "useSnowIntensity|getSnowIntensity|roadSurfaceToParams" src`
 * returned SimEnvironment, SkyDome, SnowFlakes and StaticWorld — sky, haze,
 * light, flakes, road. (`DistrictWorld` joins that list as of this change; it
 * is the writer below.) So a snow lesson could brighten its carriageway and not
 * put one flake's worth of white on a tree, a railing, a bollard, a bench, a
 * lamp column or a signal visor. That is not four separate symptoms on four
 * surfaces; it is one missing term, and this is that term.
 *
 * WHY A SHADER HOOK AND NOT A MATERIAL COLOR. `roadSurfaceToParams` works for
 * the road because a carriageway is flat: every fragment of it faces the sky,
 * so a whole-material albedo multiply is physically the right answer. A tree is
 * not flat. Multiplying the canopy material toward white gives a mint-green
 * tree lit from below as brightly as from above — a worse picture than the bare
 * one, because it no longer reads as anything. Snow lies on what FACES UP, so
 * the term has to be evaluated per fragment against the world-space normal.
 * That is what this hook does and it is the whole of it: one `smoothstep` on
 * `worldNormal.y`, one `mix` toward the preset's own snow colour.
 *
 * PROVABLY FREE OUTSIDE A SNOW LESSON, which is why this can ship without a
 * browser look at all 150 scenarios. `uSnowCover` is 0 unless the weather
 * store's snow channel is up, and GLSL `mix(x, y, 0.0)` is `x * 1.0 + y * 0.0`
 * — bit-identical, not merely close. Re-counted 2026-08-26 over
 * `src/modules/sim/lessons`: the corpus authors `weather: "snow"` exactly ONCE
 * (`templates-conditions.ts:1060`, sc-ac-snow) and `environment.snow` is set
 * from nowhere else (`compile.ts:1148` is the only writer), which matches
 * `weather.ts` §3's own census. So the blast radius of this file is that one
 * lesson family, and every other lesson renders the bytes it rendered before.
 * `snowCover.test.ts` pins the identity.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH — the surfaces the rule engine grades on.
 * The hook is attached in `WorldProps.makeSharedMaterials()`, to the five
 * shared PROP materials only. Sign FACES carry their own per-numeral
 * `faceMaterial` (WorldProps :715/:783) and traffic-signal lenses their own
 * `MeshBasicMaterial` (:1214) — neither is hooked, so a В26 numeral and a red
 * lamp stay exactly as legible in the snow lesson as in the dry one. Same
 * discipline `StaticWorld` already applies when it keeps road PAINT on the
 * rain-only mapping: a picture that buries the thing the student is graded on
 * fails them for a skill it just took away.
 *
 * Anchors verified against three 0.185.1 (`node_modules/three/src/renderers/
 * shaders/`): the vertex stage's `#include <defaultnormal_vertex>` leaves
 * `transformedNormal` in VIEW space (it folds in `instanceMatrix` for the
 * instanced prop meshes, which is exactly why the normal is taken from there
 * and not recomputed), and `<common>` supplies
 * `transformNormalByInverseViewMatrix` to carry it back to world space. The
 * fragment stage's `<color_fragment>` is the anchor rather than
 * `<map_fragment>`, and the difference is load-bearing: the prop materials are
 * `vertexColors: true`, three applies vColor AFTER the map, and a `mix` does
 * not commute with the multiply that follows it. `snowCover.test.ts` fails if
 * a three upgrade renames any of the four.
 */

import * as THREE from "three";

/**
 * How white a fully snow-covered, perfectly up-facing fragment goes at
 * snowIntensity 1. NOT 1.0 on purpose: a canopy mixed the whole way to the
 * snow colour stops being a tree and becomes a white blob, and street trees are
 * the landmark a student navigates a residential street by. At 0.85 the top of
 * the canopy reads as snow lying on foliage — the dark green still shows
 * through, which is what a laden tree actually looks like.
 */
export const SNOW_COVER_MAX = 0.85;

/**
 * THE CARRIAGEWAY'S OWN CAP — the second cover channel, and the one address
 * `sc-ac-snow:f1673b60` still had open („the carriageway renders as bare grey
 * asphalt … while instruction 1 tells the student «пътят е заснежен»").
 *
 * WHY A SECOND NUMBER RATHER THAN THE ONE ABOVE. `presets.ts`'s `snowWeather`
 * block worked out, against w14/w21 frames, why nothing in the LIGHT rig can
 * close that row: „every lever there — sun, hemisphere, exposure, veil colour,
 * veil density — lights the road and the pavement EQUALLY, so any of them
 * moves both and the ratio survives." The asymmetry is in HOW the two surfaces
 * take their snow. The pavement is a GROUND material and takes `SNOW_COVER_MAX`
 * as a per-fragment MIX, which compresses the concrete's variance toward the
 * snow colour — what lying snow physically does, it covers. The carriageway
 * takes a whole-material MULTIPLY instead (`weather.ts`'s SNOW_ROAD_BRIGHTEN
 * 1.8 × `roadSurface.ts`'s ROAD_ALBEDO_TINT 0.72), which SCALES the asphalt map
 * and therefore AMPLIFIES its variance — the baked wheel-track wear and gutter
 * grime go blotchy well before the surface goes white. That same block names
 * the remedy in one line: „a per-fragment snow mix on the ASPHALT material,
 * capped below the pavement's 0.85 because a carriageway is trodden". This is
 * that cap; `roadSurface.ts` is the splice that spends it.
 *
 * WHY 0.40, AND WHY IT IS A CEILING RATHER THAN A TASTE. Worked in the linear
 * working space, which is the space `diffuseColor` is in at the splice, off
 * numbers those files already hold:
 *   · the snowed road TODAY ≈ ROAD_ALBEDO_TINT 0.72 × SNOW_ROAD_BRIGHTEN 1.8
 *     × a ~0.28 asphalt texel ≈ 0.363 (presets.ts inferred that texel off the
 *     w21 frame, which is why it is the one used here);
 *   · `SNOW_COVER_COLOR` #e8ebef, relative luminance ≈ 0.83;
 *   · the snowed PAVEMENT ≈ 0.75 (presets.ts, same block);
 *   · the MARKINGS, #e9e7df ≈ 0.80 — but `markingWear.ts` then multiplies its
 *     grime octave in at `mix(1 − PAINT_WEAR_STRENGTH, 1, noise)`, so the paint
 *     runs 0.56 (grimiest patch) … 0.68 (mean) … 0.80 (cleanest).
 * At the patch weight `roadSurface.ts` applies (mean 0.70 of this cap, peak
 * 1.00) the carriageway lands at 0.363 + 0.280 × (0.83 − 0.363) ≈ 0.49 mean,
 * running 0.44 in the trodden bands to 0.55 in the drifts. Three orderings
 * hold, and each is a rule some file already argued for:
 *   · BELOW THE PAVEMENT (0.55 peak < 0.75) — a carriageway is trodden and
 *     ploughed; presets.ts's „capped below the pavement's 0.85" is this.
 *   · BELOW THE PAINT, AND THIS IS WHAT SETS THE NUMBER. `weather.ts`'s R0
 *     criterion is „the lane markings must still be the brightest thing in the
 *     carriageway", and StaticWorld keeps PAINT off the snow term entirely to
 *     protect it — the rule engine grades lane keeping and stop lines off those
 *     stripes. The binding case is the brightest DRIFT meeting the grimiest
 *     paint patch, and it solves to a cover of (0.56 − 0.363) / (0.83 − 0.363)
 *     = 0.42. So 0.42 is a hard ceiling and 0.40 is it with a margin. The
 *     margin is thin because the physics is: snow and road paint are within a
 *     few percent of each other in life, which is exactly why a snowed road is
 *     hard to read and why this term is capped instead of being 0.85.
 *   · A DUSTED ROAD, NOT A WHITE SHEET — the round-2 wet retune shipped a white
 *     sheet and the founder caught it twice; `SNOW_COVER_COLOR`'s own block
 *     records that as the one failure a unit test cannot catch. At 0.40 the
 *     asphalt's own value is still 60 % of every fragment.
 *
 * THE R0 LOOK IS OWED AND HAS NOT BEEN TAKEN — this lane may not start a
 * server. The frame that settles it is `sc-ac-snow` `pc-right/03-ready.png`
 * re-driven at this commit (NOT `01-arrival`: presets.ts measured that capture
 * landing before `usePbrSet` resolves the ground materials, ~30 % dark
 * sweep-wide, on dry lessons too — a finding taken there is measuring the
 * loader). Two criteria: the carriageway must read as snow lying unevenly on
 * tarmac rather than as a paler grey, and the dashed lane line must still be
 * plainly the brightest thing in it.
 */
export const SNOW_ROAD_COVER_MAX = 0.4;

/**
 * The snow albedo. This is the DAY preset's own `snowWeather.color`
 * (`environment/presets.ts:300`), reused deliberately rather than picked:
 * the haze in the far field, the sky wash and the hemisphere ground bounce are
 * all already lerping toward this exact grey-white, so accumulation painted in
 * the same colour reads as one weather instead of as a second one.
 *
 * WHAT THAT MEANS IN THE NUMBERS, worked through rather than asserted, because
 * the one thing a unit test cannot catch here is a white sheet (the round-2 wet
 * retune shipped exactly that and the founder caught it, twice). #e8ebef is
 * ~0.807 in the linear working space three's ColorManagement converts it to. A
 * canopy fragment starts near 0.06 and mixes 0.85 of the way, landing at
 * ~0.695. The snowed CARRIAGEWAY, by `weather.ts`'s own worked figure, lands at
 * `SNOW_ROAD_BRIGHTEN 1.8 × ROAD_ALBEDO_TINT 0.72 × t` ≈ 0.58 for a mid-grey
 * asphalt map. So untrodden snow on a tree comes out ~19 % brighter than
 * trodden snow on the road, which is the correct direction and a small margin.
 * The empirical ceiling anchor is that this scene already renders near-white
 * sign plates (`bakeSignFace`, higher albedo than this) every lesson without
 * blowing out or tripping the composer's 0.9 bloom threshold.
 *
 * THE R0 LOOK IS OWED AND HAS NOT BEEN DONE. That arithmetic bounds the risk;
 * it does not photograph it. Nothing here was checked on a frame, because this
 * lane could not run a drive. The look that settles it is `sc-ac-snow`
 * `pc-right/04-t102s.png` re-driven at this commit, cropped 3× on the region
 * (620,250 340×220) — the crop the w11 judge used to convict the bare canopy
 * and the bare railing. Two criteria: the canopy must read as snow ON foliage
 * (green still visible on its flanks and underside, not a white blob), and no
 * prop may out-brighten the snowed carriageway by more than it does in life.
 */
export const SNOW_COVER_COLOR = 0xe8ebef;

/**
 * The facing window, in world normal.y. Below `LO` a surface is vertical
 * enough to shed everything (building walls, sign plates, tree trunks, the
 * sides of a railing panel — all correctly bare); above `HI` it is flat enough
 * to hold a full cap. A 45° face (`y ≈ 0.707`) lands at ~86 % of the cap,
 * which is the behaviour a pitched roof and the shoulder of a canopy want.
 */
export const SNOW_COVER_FACING_LO = 0.25;
export const SNOW_COVER_FACING_HI = 0.85;

/** Snow is the mattest surface a street ever has — no gloss survives it. */
export const SNOW_COVER_ROUGHNESS = 0.95;

/* ═══════════════════════════════════════════════════════════════════════════
 * WINTER DORMANCY — THE SECOND SEASONAL TERM, AND WHY IT LIVES IN THIS FILE.
 *
 * `sc-ac-ice:5372f176` / `sc-ac-bridge-ice:7eb16029` (critical): the two black-
 * ice lessons open on «Ясна студена сутрин … около нулата» and render full-leaf
 * green canopies over a green verge. `environment/presets.ts`'s `winterGrade`
 * is the LIGHT half of the repair; a cold key over summer foliage still
 * photographs as July, so this is the FOLIAGE half.
 *
 * IT IS THE SAME HOOK, NOT A THIRD ONE, for a reason that is checked rather
 * than preferred: this hook is already attached to exactly the surfaces a
 * season has to reach — the five shared prop materials (`tree` among them) and
 * every GROUND material (`StaticWorld`'s `GROUND_SNOW`: terrain verge, paved
 * courtyards, roundabout planting, sidewalks). A separate hook would have to be
 * CHAINED at those three composition sites, and `snowCover.test.ts`'s routing
 * guard pins the literal `onBeforeCompile = snowCoverOnBeforeCompile` /
 * `customProgramCacheKey = snowCoverProgramCacheKey` assignments there — the
 * chain would turn the guard that stops this being a dead predicate red.
 *
 * KEYED ON THE FRAGMENT'S OWN GREENNESS, not on a per-material flag, and that
 * is what keeps it honest: a bare branch, a dead verge and a dry roundabout bed
 * are the SAME surface change, while galvanised steel, concrete, asphalt and
 * every kerb are neutral (g / (r+g+b) ≈ 1/3) and come out untouched. The
 * surfaces the rule engine grades on are doubly safe: sign FACES carry their
 * own `faceMaterial` and signal LENSES their own `MeshBasicMaterial`, and
 * neither is hooked at all — a green lamp stays exactly as green in the ice
 * lesson as in the dry one.
 *
 * ORDER: dormancy runs BEFORE the snow mix. A tree loses its leaves and THEN
 * snow lies on it, never the other way round.
 *
 * FREE OUTSIDE A WINTER LESSON on the same identity `uSnowCover` has:
 * `uWinterCover` is 0 unless a lesson authored `environment.winter`, and GLSL
 * `mix(x, y, 0.0)` is `x * 1.0 + y * 0.0` — bit-identical, not close.
 *
 * WHAT IS NOT DONE, so the next reader does not re-derive it: the canopy keeps
 * its SILHOUETTE. Removing leaves is geometry — a bare-branch GLB in
 * `public/sim/veg` and a `TreeKind` to select it — and that is asset work this
 * lane cannot author. A dormant brown canopy of the summer shape is what a
 * street tree in Sofia actually looks like from a car at 30 km/h in a
 * fortnight of freezing fog; it is not a leafless winter tree in April light.
 * The R0 look is OWED and has not been taken.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The albedo dormant vegetation is graded toward — dry straw-brown, the colour
 * of a Sofia verge and a bare linden crown in January. Used as a HUE only: the
 * shader normalises it to unit luminance and multiplies the fragment's own
 * brightness through it, so the canopy keeps its light-and-shade instead of
 * flattening into a decal (the mistake `SNOW_COVER_COLOR` records for a
 * whole-material tint on a tree).
 */
export const WINTER_DORMANT_COLOR = 0x6e6455;
/** How much darker dormant vegetation sits than the summer foliage it replaces
 *  under the same light — bare wood reflects less than a leaf. */
export const WINTER_DORMANT_VALUE = 0.82;
/**
 * The greenness window, in `g / (r + g + b)` of the LINEAR albedo. Neutral grey
 * is 0.333, so `LO` sits just above it and nothing achromatic can be caught.
 * Measured on this project's own assets rather than guessed: the canvas verge
 * (`canvasTextures.makeGrassTexture` base #77875c) lands at 0.454 and the baked
 * tree-canopy vertex colour around 0.67 — so a verge browns most of the way and
 * a canopy fully, which is the right ordering (grass dies back, a crown goes
 * bare).
 */
export const WINTER_GREEN_LO = 0.36;
export const WINTER_GREEN_HI = 0.5;
/** Ceiling on the dormancy mix. NOT 1.0: Sofia streets carry conifers and the
 *  odd evergreen hedge, and a street where literally nothing is green reads as
 *  a colour-graded photograph rather than as winter. */
export const WINTER_COVER_MAX = 0.9;

/** sRGB→linear + unit-luminance normalisation of `WINTER_DORMANT_COLOR`,
 *  scaled by `WINTER_DORMANT_VALUE`. Exported so the test can assert the
 *  tint really is luminance-neutral rather than trusting the arithmetic. */
export function winterDormantTint(): THREE.Vector3 {
  // THREE.Color's constructor runs the sRGB→working-space conversion, which is
  // the space `diffuseColor` is in by the time the fragment splice sees it.
  const c = new THREE.Color(WINTER_DORMANT_COLOR);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const k = (WINTER_DORMANT_VALUE / lum) as number;
  return new THREE.Vector3(c.r * k, c.g * k, c.b * k);
}

let uniforms: {
  uSnowCover: { value: number };
  uSnowRoad: { value: number };
  uSnowColor: { value: THREE.Color };
  uSnowFacing: { value: THREE.Vector2 };
  uSnowRoughness: { value: number };
  uWinterCover: { value: number };
  uWinterTint: { value: THREE.Vector3 };
  uWinterGreen: { value: THREE.Vector2 };
} | null = null;

/**
 * Lazy singleton — ONE uniform set shared by every hooked material, so the
 * per-frame driver is a single float write no matter how many prop families
 * mounted. Mirrors `macroVariation.ts`'s shared-uniform discipline for the
 * same reason: `onBeforeCompile` hands three the uniform OBJECT by reference,
 * so writing `.value` here reaches every compiled program.
 */
function getSnowCoverUniforms() {
  if (!uniforms) {
    uniforms = {
      uSnowCover: { value: 0 },
      uSnowRoad: { value: 0 },
      uSnowColor: { value: new THREE.Color(SNOW_COVER_COLOR) },
      uSnowFacing: { value: new THREE.Vector2(SNOW_COVER_FACING_LO, SNOW_COVER_FACING_HI) },
      uSnowRoughness: { value: SNOW_COVER_ROUGHNESS },
      uWinterCover: { value: 0 },
      uWinterTint: { value: winterDormantTint() },
      uWinterGreen: { value: new THREE.Vector2(WINTER_GREEN_LO, WINTER_GREEN_HI) },
    };
  }
  return uniforms;
}

/**
 * THE WRITER. `DistrictWorld` calls this once per frame with the weather
 * store's snow channel (`getSnowIntensity()`); nothing else writes it.
 *
 * Takes the RAW 0..1 channel and applies `SNOW_COVER_MAX` here rather than at
 * the call site, so the one place that knows how white snow gets is this file
 * and a caller cannot accidentally drive the cap past it.
 */
export function setSnowCover(snowIntensity01: number): void {
  const s = snowIntensity01 < 0 ? 0 : snowIntensity01 > 1 ? 1 : snowIntensity01;
  const u = getSnowCoverUniforms();
  u.uSnowCover.value = s * SNOW_COVER_MAX;
  // ONE WRITER FOR BOTH CHANNELS, deliberately. The carriageway's cover is the
  // same weather, taken at a lower cap because a road is trodden — splitting it
  // into a second per-frame setter would be two channels that must agree with
  // nothing making them, and the first frame either forgot would show a snowed
  // pavement beside a bare road, which is the exact picture this closes.
  u.uSnowRoad.value = s * SNOW_ROAD_COVER_MAX;
}

/** Current cap-scaled cover, for tests and for the driver's own assertions. */
export function getSnowCover(): number {
  return getSnowCoverUniforms().uSnowCover.value;
}

/** Current cap-scaled CARRIAGEWAY cover — same driver, road cap. */
export function getSnowRoadCover(): number {
  return getSnowCoverUniforms().uSnowRoad.value;
}

/**
 * Bind the carriageway's snow channel onto an asphalt program.
 *
 * `roadSurface.ts` calls this from its own `onBeforeCompile` rather than
 * chaining `snowCoverOnBeforeCompile`: that hook is a NORMAL-FACING mix at the
 * off-road cap and the road already carries `roadSurfaceToParams`' multiply, so
 * chaining it would double-apply and paint the carriageway at the pavement's
 * 0.85 (`StaticWorld`'s GROUND_SNOW block says so in writing, and
 * `snowCover.test.ts`'s routing guard asserts the asphalt block never takes the
 * ground spread). What the road needs from this file is the two things this
 * file owns — the cap-scaled channel and the shared snow albedo — so those are
 * what travel, by REFERENCE: three hands `onBeforeCompile` the uniform objects,
 * so `setSnowCover` above reaches every compiled asphalt program without a
 * second per-frame write.
 */
export function bindSnowRoadUniforms(shader: THREE.WebGLProgramParametersWithUniforms): void {
  const u = getSnowCoverUniforms();
  shader.uniforms.uSnowRoad = u.uSnowRoad;
  shader.uniforms.uSnowColor = u.uSnowColor;
}

/**
 * THE WINTER WRITER. `DistrictWorld` calls this once per frame beside
 * `setSnowCover`, with 1 when the lesson authored `environment.winter` and 0
 * otherwise; nothing else writes it. Per FRAME rather than on mount for the
 * reason the snow channel is: the uniform set is module-level and outlives any
 * one scene, so a scene that only wrote it on mount would hand the NEXT lesson
 * the previous one's season.
 *
 * `WINTER_COVER_MAX` is applied here, not at the call site — the one place
 * that knows how bare a winter street gets is this file.
 */
export function setWinterCover(winter01: number): void {
  const w = winter01 < 0 ? 0 : winter01 > 1 ? 1 : winter01;
  getSnowCoverUniforms().uWinterCover.value = w * WINTER_COVER_MAX;
}

/** Current cap-scaled dormancy, for tests and for the driver's assertions. */
export function getWinterCover(): number {
  return getSnowCoverUniforms().uWinterCover.value;
}

/** The line the fragment stage emits — exported so the test pins the exact
 *  operation (a `mix`, at cover, toward the snow colour) rather than merely
 *  „something was injected". */
export const SNOW_COVER_FRAGMENT_ANCHOR =
  "diffuseColor.rgb = mix( diffuseColor.rgb, uSnowColor, snowCoverAmount );";

/** The dormancy line, exported for the same reason as the snow one: the test
 *  pins the exact operation (a `mix`, at the dormancy amount, toward the
 *  luminance-preserving dormant hue) rather than „something was injected". */
export const WINTER_DORMANCY_FRAGMENT_ANCHOR =
  "diffuseColor.rgb = mix( diffuseColor.rgb, winterDormantColor, winterDormancyAmount );";

/**
 * onBeforeCompile hook — attach together with `snowCoverProgramCacheKey` so
 * three cannot hand a hooked material a program compiled without the hook (the
 * five prop materials differ only in uniform values, so their built-in program
 * parameters collide with every other unmapped vertex-coloured standard
 * material in the app).
 */
export function snowCoverOnBeforeCompile(
  shader: THREE.WebGLProgramParametersWithUniforms,
): void {
  const u = getSnowCoverUniforms();
  shader.uniforms.uSnowCover = u.uSnowCover;
  shader.uniforms.uSnowColor = u.uSnowColor;
  shader.uniforms.uSnowFacing = u.uSnowFacing;
  shader.uniforms.uSnowRoughness = u.uSnowRoughness;
  shader.uniforms.uWinterCover = u.uWinterCover;
  shader.uniforms.uWinterTint = u.uWinterTint;
  shader.uniforms.uWinterGreen = u.uWinterGreen;

  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying float vSnowUp;")
    .replace(
      "#include <defaultnormal_vertex>",
      // transformedNormal is VIEW space here and already carries instanceMatrix
      // for the instanced prop meshes; carry it back to world space so „up" is
      // the world's up and not the camera's.
      "#include <defaultnormal_vertex>\nvSnowUp = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix ).y;",
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform float uSnowCover;\nuniform vec3 uSnowColor;\nuniform vec2 uSnowFacing;\nuniform float uSnowRoughness;\nuniform float uWinterCover;\nuniform vec3 uWinterTint;\nuniform vec2 uWinterGreen;\nvarying float vSnowUp;",
    )
    .replace(
      // AFTER color_fragment: the prop materials are vertexColors:true and a
      // mix does not commute with the vColor multiply.
      //
      // WINTER FIRST, SNOW SECOND: leaves fall, then snow lies on what is left.
      // The dormancy weight is the fragment's own greenness, so foliage and
      // verge brown off while steel, concrete and asphalt (g/sum ≈ 1/3, below
      // uWinterGreen.x) are untouched; the mix preserves luminance so a canopy
      // keeps its shading instead of flattening into a decal.
      "#include <color_fragment>",
      `#include <color_fragment>
      float winterGreenFraction = diffuseColor.g / max( diffuseColor.r + diffuseColor.g + diffuseColor.b, 1e-4 );
      float winterDormancyAmount = uWinterCover * smoothstep( uWinterGreen.x, uWinterGreen.y, winterGreenFraction );
      vec3 winterDormantColor = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) * uWinterTint;
      ${WINTER_DORMANCY_FRAGMENT_ANCHOR}
      float snowCoverAmount = uSnowCover * smoothstep( uSnowFacing.x, uSnowFacing.y, vSnowUp );
      ${SNOW_COVER_FRAGMENT_ANCHOR}`,
    )
    .replace(
      "#include <roughnessmap_fragment>",
      "#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, uSnowRoughness, snowCoverAmount );",
    )
    .replace(
      // Snow is a dielectric. Without this the galvanised steel of a railing or
      // a lamp column (metalness 0.45) would tint its SPECULAR white and read
      // as painted chrome instead of as snow lying on metal.
      "#include <metalnessmap_fragment>",
      "#include <metalnessmap_fragment>\nmetalnessFactor = mix( metalnessFactor, 0.0, snowCoverAmount );",
    );
}

/** Stable cache key: every snow-hooked material shares one program per
 *  built-in-parameter combination (three still keys on defines). Bumped to v2
 *  when the winter dormancy term was added — a cached v1 program carries
 *  neither the uniforms nor the splice, so the key has to move with the
 *  source or a warm page could hand a hooked material the old program. */
export const snowCoverProgramCacheKey = (): string => "prop-seasonal-cover-v2";
