/**
 * The dusk plate — the hero image, drawn with no JavaScript at all.
 *
 * This is NOT a placeholder. It is the finished hero for the majority of
 * visitors: every phone, every save-data session, every reduced-motion
 * setting and every machine where WebGL will not start (heroCapability.ts).
 * The live 3D layer crossfades OVER it and is allowed never to arrive.
 *
 * WHY IT IS NOT A SCREENSHOT. The obvious poster source was
 * `public/clips/*.webp` — 42 clips of real rendered frames. They are
 * unusable here, and it is worth writing down why so nobody re-litigates it:
 * every one of them is a MISTAKE demonstration, so the car is a translucent
 * RED ghost under a large ❌ chrome, with a driving HUD strip burned into the
 * bottom of the frame (`sc-ac-night-lights__m0.k2.webp` is representative).
 * They are teaching aids, and putting one on a landing page would advertise
 * the product's failure state. Beyond that, doc 82 §1.2 documents that the
 * shipped worlds are empty — a screenshot inherits that; a drawing does not.
 *
 * So the plate is authored, and it buys three things a screenshot cannot:
 *   - it is INLINE, so it costs zero requests and cannot lose the LCP race
 *     to a 3G round-trip (a WebP poster is ~15 KB *and* a connection);
 *   - it is vector, so it is exact on a 1×, a 3× phone and a 5K desktop;
 *   - it is built from `heroScene.ts`, the same lane width, dash cadence,
 *     horizon, vanishing point and Vitosha crest the WebGL scene renders —
 *     which is what makes the crossfade read as one continuous image
 *     instead of a cut.
 *
 * The palette is the dusk preset AS GRADED, not raw: the 3D path renders
 * through AgX at exposure 1.1 (environment/toneMapping.ts,
 * presets.dusk.exposure), which pulls the raw `#35446e` zenith down and the
 * `#f2a45c` horizon back. These hexes are matched to the graded result, so
 * the two layers agree; they are also all dark enough that white body copy
 * over the left half clears WCAG AA without a scrim — the scrim below is
 * belt-and-braces for the bottom edge, where the near asphalt is lightest.
 */

import {
  HERO_LANE_WIDTH_M,
  HERO_MARK_WIDTH_M,
  HERO_ROAD_WIDTH_M,
  PLATE_HORIZON_Y,
  PLATE_RIDGE_POINTS,
  PLATE_VIEWBOX_H,
  PLATE_VIEWBOX_W,
  plateDashes,
  plateProject,
} from "./heroScene";

/** Graded dusk ramp, zenith → horizon. */
const SKY_ZENITH = "#04060b";
const SKY_UPPER = "#0a1120";
const SKY_MID = "#1b2440";
const SKY_LOW = "#413550";
const SKY_BAND = "#a05c3a";

/** The massif goes violet-grey against the orange band (presets.dusk.sky). */
const RIDGE_FAR = "#2e2b41";
const RIDGE_NEAR = "#15151f";

/**
 * Height of the afterglow band, viewBox units. Sized to the crest: the
 * generated ridge tops out ~123 units above the horizon (6.6° through the
 * plate's focal length), so 150 puts the whole massif inside the lit sky
 * except its summit, which is where the eye wants the contrast anyway.
 */
const AFTERGLOW_H = 150;

/** Ground either side of the tarmac — the backdrop disc's dusk-lit verge. */
const VERGE = "#0a0c10";
const ROAD_NEAR = "#15161b";
const ROAD_FAR = "#232530";
const PAINT = "#cfd4dc";

/** Tail lamps. Deep red, not signal red — a lit lens at dusk is dark and hot. */
const TAIL_RED = "#ff2f21";

/**
 * Where the car sits: metres ahead, and metres right of the centre line.
 * Screen-right is world −X when facing south (heroScene.ts), but the plate is
 * drawn in its own screen space, so a POSITIVE lateral here simply means
 * "toward the right of frame".
 */
const CAR_Z_M = 7.5;
const CAR_LATERAL_M = 1.62;
/** Fictional-vehicle proportions (ADR-001) roughly matching the hero GLB. */
const CAR_WIDTH_M = 1.85;
const CAR_ROOF_M = 1.34;
const CAR_SHOULDER_M = 0.92;
const CAR_SILL_M = 0.5;

/**
 * Far end of the drawn road, m. Past this the fog has taken it (dusk density
 * 0.0032 → ~93 % opaque at 320 m), so drawing more only adds path data.
 */
const ROAD_FAR_M = 320;
/** Near end, m — off the bottom of the frame, so the road has no visible start. */
const ROAD_NEAR_M = 2.2;

/**
 * One decimal place, everywhere.
 *
 * The whole plate is inlined into the HTML — and Next serialises it a second
 * time into the RSC flight payload, so every character is paid for twice.
 * `carX - half * 0.93` prints seventeen digits of a coordinate in a 1600-unit
 * viewBox, where the second decimal is already a thousandth of a pixel.
 * Rounding is worth ~4 KB of HTML on the landing route's critical path.
 */
function n(value: number): string {
  return value.toFixed(1);
}

function pt(lateralM: number, heightM: number, distanceM: number): string {
  const [x, y] = plateProject(lateralM, heightM, distanceM);
  return `${n(x)},${n(y)}`;
}

/** A ground-plane quad between two lateral offsets, near→far. */
function groundBand(leftM: number, rightM: number): string {
  return [
    pt(leftM, 0, ROAD_NEAR_M),
    pt(rightM, 0, ROAD_NEAR_M),
    pt(rightM, 0, ROAD_FAR_M),
    pt(leftM, 0, ROAD_FAR_M),
  ].join(" ");
}

/** A continuous edge line, drawn as a tapering quad rather than a stroke so
 *  it narrows with distance exactly like the dashes do. */
function edgeLine(lateralM: number): string {
  const h = HERO_MARK_WIDTH_M / 2;
  return [
    pt(lateralM - h, 0, ROAD_NEAR_M),
    pt(lateralM + h, 0, ROAD_NEAR_M),
    pt(lateralM + h, 0, ROAD_FAR_M),
    pt(lateralM - h, 0, ROAD_FAR_M),
  ].join(" ");
}

/** The generated Vitosha crest, closed just under the horizon so the massif's
 *  feet sit in the haze band rather than floating on a line. */
const RIDGE_PATH = [
  `M ${PLATE_RIDGE_POINTS[0][0]} ${PLATE_HORIZON_Y + 10}`,
  ...PLATE_RIDGE_POINTS.map(([x, y]) => `L ${x} ${y}`),
  `L ${PLATE_RIDGE_POINTS[PLATE_RIDGE_POINTS.length - 1][0]} ${PLATE_HORIZON_Y + 10}`,
  "Z",
].join(" ");

/**
 * The box the drawn image is cropped into, exported because a SECOND layer now
 * has to occupy exactly the same rectangle.
 *
 * HeroLoopVideo plays a raster of this very composition over the plate, and if
 * the two boxes disagree by so much as the `top-[34%]` band the crossfade
 * becomes a jump-cut on precisely the phones the loop exists for. One string,
 * two consumers — the alternative is two hand-kept copies of a magic number
 * that only ever get compared by eye on a device neither of us is holding.
 */
export const HERO_BAND_CLASS = "absolute inset-x-0 bottom-0 top-[34%] sm:top-0";

export interface HeroPlateProps {
  /** Extra classes on the wrapper (positioning is the caller's business). */
  className?: string;
}

/**
 * Decorative by contract: the plate carries no information the copy does not
 * already carry, so it is `aria-hidden` and the surrounding section owns the
 * accessible name. Anything else would make a screen reader announce a
 * drawing of a road.
 */
export function HeroPlate({ className = "" }: HeroPlateProps) {
  const dashes = plateDashes();

  // Every car dimension is projected from its real size at its real distance,
  // so the silhouette cannot disagree with the road it stands on.
  const [carX, carY] = plateProject(CAR_LATERAL_M, 0, CAR_Z_M);
  const roofY = plateProject(CAR_LATERAL_M, CAR_ROOF_M, CAR_Z_M)[1];
  const shoulderY = plateProject(CAR_LATERAL_M, CAR_SHOULDER_M, CAR_Z_M)[1];
  const sillY = plateProject(CAR_LATERAL_M, CAR_SILL_M, CAR_Z_M)[1];
  const half = plateProject(CAR_LATERAL_M + CAR_WIDTH_M / 2, 0, CAR_Z_M)[0] - carX;
  const lampY = (shoulderY + sillY) / 2;

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      // The band does not fill a tall hero, so the colour above it has to BE
      // the plate's own zenith or there is a visible seam. It is within two
      // points of `--background`, so the join disappears either way.
      style={{ backgroundColor: SKY_ZENITH }}
    >
      {/*
       * A 2.5 : 1 image in a portrait hero cannot be solved by cropping — at
       * 411 × 544 a `slice` fit shows about 15 % of the drawn width, which is
       * a random slab of tarmac. So on narrow screens the plate becomes a
       * horizon BAND across the lower two-thirds, with the copy over the dark
       * sky above it; from `sm` up it fills the section as designed.
       *
       * The crop is right-anchored (`xMaxYMax`) rather than centred, because
       * the right-hand third is where the composition lives: the car, the
       * warm sun band and the vanishing point. Centring it would cut the car
       * in half on exactly the devices that only ever see this layer.
       */}
      <div className={HERO_BAND_CLASS}>
        <svg
          aria-hidden
          focusable="false"
          viewBox={`0 0 ${PLATE_VIEWBOX_W} ${PLATE_VIEWBOX_H}`}
          preserveAspectRatio="xMaxYMax slice"
          className="h-full w-full"
        >
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKY_ZENITH} />
          <stop offset="0.4" stopColor={SKY_UPPER} />
          <stop offset="0.82" stopColor={SKY_MID} />
          <stop offset="1" stopColor={SKY_LOW} />
        </linearGradient>

        {/* The afterglow band. It has to be BRIGHTER than the massif in front
            of it or there is no silhouette — a mountain is only ever visible
            because the sky behind it is not. Its height is set to the crest:
            the peak pokes into the dark sky above the glow, which is exactly
            what a 2,290 m summit does at civil twilight. */}
        <linearGradient id="hero-afterglow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKY_BAND} stopOpacity="0.06" />
          <stop offset="0.6" stopColor={SKY_BAND} stopOpacity="0.62" />
          <stop offset="1" stopColor="#e0a06a" stopOpacity="0.92" />
        </linearGradient>

        {/* The 8° sun sits WEST of south, which — driving south — is off the
            right shoulder. Its glow is the only warm thing in the frame, and
            it has to be WIDE: it is the backlight the whole massif is
            silhouetted against, not a lens flare. */}
        <radialGradient id="hero-sun" cx="0.76" cy="1" r="0.62">
          <stop offset="0" stopColor="#ffc78e" stopOpacity="0.78" />
          <stop offset="0.4" stopColor="#d07a44" stopOpacity="0.36" />
          <stop offset="1" stopColor={SKY_BAND} stopOpacity="0" />
        </radialGradient>

        <linearGradient id="hero-road" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={ROAD_NEAR} />
          <stop offset="0.6" stopColor={ROAD_FAR} />
          {/* The far end does not END — it dissolves into the same haze the
              sky band sits in, which is what aerial perspective IS. */}
          <stop offset="1" stopColor={SKY_BAND} stopOpacity="0.5" />
        </linearGradient>

        <linearGradient id="hero-paint" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={PAINT} stopOpacity="0.82" />
          <stop offset="0.55" stopColor={PAINT} stopOpacity="0.36" />
          <stop offset="1" stopColor={PAINT} stopOpacity="0" />
        </linearGradient>

        <radialGradient id="hero-beam" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe2b8" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ffe2b8" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="hero-tail" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={TAIL_RED} stopOpacity="0.32" />
          <stop offset="1" stopColor={TAIL_RED} stopOpacity="0" />
        </radialGradient>

        {/* Aerial perspective on the GROUND: the same haze the sky band sits
            in, laid over the far road and the far verge so both dissolve into
            the horizon instead of meeting it at a drawn line. This is the 2D
            twin of GroundBackdrop's horizon fade. */}
        <linearGradient id="hero-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKY_BAND} stopOpacity="0.55" />
          <stop offset="1" stopColor={SKY_BAND} stopOpacity="0" />
        </linearGradient>

        <radialGradient id="hero-shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000000" stopOpacity="0.75" />
          <stop offset="0.6" stopColor="#000000" stopOpacity="0.35" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* --- sky ------------------------------------------------------- */}
      <rect x="0" y="0" width={PLATE_VIEWBOX_W} height={PLATE_HORIZON_Y + 4} fill="url(#hero-sky)" />
      <rect
        x="0"
        y={PLATE_HORIZON_Y - AFTERGLOW_H}
        width={PLATE_VIEWBOX_W}
        height={AFTERGLOW_H + 4}
        fill="url(#hero-afterglow)"
      />
      <rect x="0" y="0" width={PLATE_VIEWBOX_W} height={PLATE_HORIZON_Y + 4} fill="url(#hero-sun)" />

      {/* --- Vitosha: the far haze-lifted crest, then the nearer massif.
              Both are DARKER than the afterglow behind them — a silhouette,
              not a painted mountain. */}
      <path d={RIDGE_PATH} fill={RIDGE_FAR} opacity="0.72" />
      <path d={RIDGE_PATH} fill={RIDGE_NEAR} opacity="0.92" transform="translate(34 15)" />

      {/* --- ground + road --------------------------------------------- */}
      <rect
        x="0"
        y={PLATE_HORIZON_Y}
        width={PLATE_VIEWBOX_W}
        height={PLATE_VIEWBOX_H - PLATE_HORIZON_Y}
        fill={VERGE}
      />
      <polygon
        points={groundBand(-HERO_ROAD_WIDTH_M / 2, HERO_ROAD_WIDTH_M / 2)}
        fill="url(#hero-road)"
      />

      {/* Edge lines, then the broken centre line — both taper by projection,
          never by a stroke width, so the vanishing point is honest. */}
      <polygon points={edgeLine(-HERO_LANE_WIDTH_M)} fill="url(#hero-paint)" />
      <polygon points={edgeLine(HERO_LANE_WIDTH_M)} fill="url(#hero-paint)" />
      {dashes.map((d) => (
        <polygon
          key={d.yNear}
          points={[
            `${n(d.x - d.halfNear)},${n(d.yNear)}`,
            `${n(d.x + d.halfNear)},${n(d.yNear)}`,
            `${n(d.x + d.halfFar)},${n(d.yFar)}`,
            `${n(d.x - d.halfFar)},${n(d.yFar)}`,
          ].join(" ")}
          fill="url(#hero-paint)"
        />
      ))}

      {/* Ground haze — over the road AND the verge, so the horizon has no
          drawn edge anywhere along its length. */}
      <rect
        x="0"
        y={PLATE_HORIZON_Y}
        width={PLATE_VIEWBOX_W}
        height={110}
        fill="url(#hero-haze)"
      />

      {/* --- the car's own low beam, thrown up the road ahead of it ----- */}
      <ellipse
        cx={n(carX - half * 0.35)}
        cy={PLATE_HORIZON_Y + 78}
        rx={n(half * 2.6)}
        ry={44}
        fill="url(#hero-beam)"
      />

      {/* --- the car, seen from astern --------------------------------- */}
      <g>
        {/* Contact shadow — the one thing that stops a silhouette floating.
            A soft radial, not a hard ellipse: a hard edge under a car at dusk
            reads as a sticker. */}
        <ellipse cx={n(carX)} cy={n(carY)} rx={n(half * 1.45)} ry={n(half * 0.3)} fill="url(#hero-shadow)" />

        {/* Everything below the sill — wheels, arches, the shadowed lower
            body — as one dark mass inset from the flanks. At this size two
            drawn tyres are noise; the inset is what reads as wheels. It
            starts AT the sill, not at the tyre tops: 0.5 m projects HIGHER up
            the frame than 0.32 m, so anchoring it to the tyres leaves the
            car floating over a detached black slab. */}
        <rect
          x={n(carX - half * 0.93)}
          y={n(sillY - 1)}
          width={n(half * 1.86)}
          height={n(carY - sillY + 1)}
          fill="#07080c"
        />

        {/* Body: one closed silhouette, sill to roof. No panel lines and no
            badge — ADR-001 forbids a real marque, and detail at this size
            only reads as noise. */}
        <path
          d={[
            `M ${n(carX - half)} ${n(sillY)}`,
            `L ${n(carX - half)} ${n(shoulderY + (sillY - shoulderY) * 0.35)}`,
            `Q ${n(carX - half)} ${n(shoulderY)} ${n(carX - half * 0.9)} ${n(shoulderY - 1)}`,
            `L ${n(carX - half * 0.66)} ${n(roofY + (shoulderY - roofY) * 0.22)}`,
            `Q ${n(carX - half * 0.58)} ${n(roofY)} ${n(carX - half * 0.42)} ${n(roofY)}`,
            `L ${n(carX + half * 0.42)} ${n(roofY)}`,
            `Q ${n(carX + half * 0.58)} ${n(roofY)} ${n(carX + half * 0.66)} ${n(roofY + (shoulderY - roofY) * 0.22)}`,
            `L ${n(carX + half * 0.9)} ${n(shoulderY - 1)}`,
            `Q ${n(carX + half)} ${n(shoulderY)} ${n(carX + half)} ${n(shoulderY + (sillY - shoulderY) * 0.35)}`,
            `L ${n(carX + half)} ${n(sillY)}`,
            "Z",
          ].join(" ")}
          fill="#0b0d13"
        />

        {/* Rear glass — a shade lighter, catching the sky band. */}
        <path
          d={[
            `M ${n(carX - half * 0.6)} ${n(roofY + (shoulderY - roofY) * 0.28)}`,
            `L ${n(carX + half * 0.6)} ${n(roofY + (shoulderY - roofY) * 0.28)}`,
            `L ${n(carX + half * 0.76)} ${n(shoulderY - 2)}`,
            `L ${n(carX - half * 0.76)} ${n(shoulderY - 2)}`,
            "Z",
          ].join(" ")}
          fill="#141a29"
        />

        {/* Tail lamps + their spill. The glow is what makes a black shape read
            as a lit car at dusk rather than a rock. */}
        <ellipse cx={n(carX)} cy={n(lampY)} rx={n(half * 1.25)} ry={n(half * 0.26)} fill="url(#hero-tail)" />
        <rect
          x={n(carX - half * 0.8)}
          y={n(lampY - half * 0.042)}
          width={n(half * 0.3)}
          height={n(half * 0.084)}
          rx={n(half * 0.042)}
          fill={TAIL_RED}
        />
        <rect
          x={n(carX + half * 0.5)}
          y={n(lampY - half * 0.042)}
          width={n(half * 0.3)}
          height={n(half * 0.084)}
          rx={n(half * 0.042)}
          fill={TAIL_RED}
        />
      </g>

          {/* No reading scrim here: it lives in LiveHero, ABOVE both this
              plate and the WebGL canvas, so the copy's contrast is guaranteed
              by one layer whichever image is underneath. */}
        </svg>
      </div>
      {/* No seam gradient is needed at the band's top edge: at any aspect
          narrower than the viewBox the fit is height-driven, so the band's
          first row IS viewBox y = 0, which is SKY_ZENITH — the same colour as
          the box behind it. */}
    </div>
  );
}
