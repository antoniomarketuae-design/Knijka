/**
 * The deck, drawn — the view through the windscreen, with no JavaScript at all.
 *
 * A Server Component, deliberately: this ships as HTML and costs the browser
 * zero requests, zero bytes of JS and zero round-trips. It is not a
 * placeholder for something better — it is the finished backdrop for every
 * student on every page, and the only rung above it adds one CSS animation.
 *
 * WHY IT IS DRAWN AND NOT A PNG. The same three reasons HeroPlate lists, and
 * they are stronger here: it is inline, so it cannot lose a race to a 3G
 * round-trip on a page opened many times a day; it is vector, so it is exact
 * from a 1× phone to a 5K panel with one asset; and it is generated from
 * `@/lib/visual/roadPlate`, so the horizon, the lane cadence and the Vitosha
 * crest are provably the landing page's, not a second artist's impression of
 * them.
 *
 * WHY IT IS SO DARK. See deckScene.ts's ceiling argument. Everything here sits
 * at or under the luminance the `.haze` layer it replaces already painted, so
 * no contrast ratio anywhere in the authenticated app can move. Depth is bought
 * with shape and with negative space instead — the graticule's graduations are
 * cut DARK into the lit horizon rather than drawn bright over it, which is also
 * how an etched instrument face actually works.
 *
 * Decorative by contract: it carries no information the page does not already
 * carry, so it is `aria-hidden` and announces nothing.
 */

import {
  DECK_BORESIGHT_GAP,
  DECK_BORESIGHT_LEN,
  DECK_CABIN_COOL,
  DECK_CABIN_COOL_ALPHA,
  DECK_CAMERA,
  DECK_EDGE_LATERAL_M,
  DECK_LIT,
  DECK_PAINT,
  DECK_PAINT_ALPHA,
  DECK_RIDGE_FAR,
  DECK_RIDGE_NEAR,
  DECK_RIDGE_PATH,
  DECK_ROAD_FAR,
  DECK_ROAD_HALF_M,
  DECK_ROAD_NEAR,
  DECK_SKY_HORIZON,
  DECK_SKY_MID,
  DECK_SKY_TOP,
  DECK_SUN_WARM,
  DECK_TICK_CENTRE_LEN,
  DECK_TICK_MAJOR_DROP,
  DECK_VERGE,
  DECK_VIEWBOX_H,
  DECK_VIEWBOX_W,
  deckDashes,
  deckEdgeLine,
  deckGroundBand,
  deckTicks,
} from "./deckScene";

const HORIZON = DECK_CAMERA.horizonY;

/** One decimal place. The whole plate is inlined into the HTML and serialised
 *  a second time into the RSC flight payload, so every character is paid for
 *  twice; the second decimal of a coordinate in a 1600-unit viewBox is already
 *  a thousandth of a pixel. */
function n(value: number): string {
  return value.toFixed(1);
}

export interface DeckPlateProps {
  className?: string;
}

export function DeckPlate({ className = "" }: DeckPlateProps) {
  const dashes = deckDashes();
  const ticks = deckTicks();

  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={`0 0 ${DECK_VIEWBOX_W} ${DECK_VIEWBOX_H}`}
      // `slice` covers the plane; the viewBox aspect (1.6) means a phone crops
      // to the centre, which is where the composition is. See deckScene.
      preserveAspectRatio="xMidYMid slice"
      className={`h-full w-full ${className}`}
    >
      <defs>
        {/* Sky: a long ramp from the cabin roof down to the afterglow. The
            first two thirds are darker than --background on purpose — the top
            of the viewport is where the topbar and page headings live. */}
        <linearGradient id="deck-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={DECK_SKY_TOP} />
          <stop offset="0.45" stopColor={DECK_SKY_TOP} />
          <stop offset="0.78" stopColor={DECK_SKY_MID} />
          <stop offset="1" stopColor={DECK_SKY_HORIZON} />
        </linearGradient>

        {/* The dusk sun, off the right shoulder — the hero's own placement.
            Wide and soft: it is the backlight the massif is silhouetted
            against, not a lens flare. */}
        <radialGradient id="deck-sun" cx="0.78" cy="1" r="0.6">
          <stop offset="0" stopColor={DECK_SUN_WARM} stopOpacity="0.85" />
          <stop offset="0.45" stopColor={DECK_SUN_WARM} stopOpacity="0.4" />
          <stop offset="1" stopColor={DECK_SUN_WARM} stopOpacity="0" />
        </radialGradient>

        {/* Cabin overhead light — cool, off-centre so the frame is not
            symmetrical. This is `.haze`'s second gradient, kept. */}
        <radialGradient id="deck-cabin" cx="0.72" cy="0" r="0.55">
          <stop offset="0" stopColor={DECK_CABIN_COOL} stopOpacity={DECK_CABIN_COOL_ALPHA} />
          <stop offset="1" stopColor={DECK_CABIN_COOL} stopOpacity="0" />
        </radialGradient>

        {/* Tarmac.
            IT STOPS AT `DECK_ROAD_FAR` AND DOES NOT REACH THE SKY. The obvious
            version ends this ramp on `DECK_SKY_HORIZON`, so the far tarmac
            dissolves into the band the sky sits in — which is what aerial
            perspective is, and it is what shipped first. It also broke the
            ceiling: the LANE PAINT is drawn on top of this fill, and a
            translucent light grey over a horizon-bright base composites above
            the ceiling even though every ingredient looks innocent on its own.
            Measured on a 390 × 844 capture: 663 pixels at #0f1721, L 0.008242
            against a ceiling of 0.008183 — small, real, and exactly the class
            of thing a per-token contrast test cannot see.

            The dissolve is not lost, it just happens in the right ORDER: the
            ground-haze rect below is painted AFTER this whole group, so it
            lifts the road and the paint together instead of underneath the
            paint. Same picture, and every ingredient is under the ceiling
            again — which is what makes the blend argument a proof. */}
        <linearGradient id="deck-road" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={DECK_ROAD_NEAR} />
          <stop offset="0.7" stopColor={DECK_ROAD_FAR} />
          <stop offset="1" stopColor={DECK_ROAD_FAR} />
        </linearGradient>

        {/* Lane paint, faded by SCREEN HEIGHT rather than per shape.
            `userSpaceOnUse` is load-bearing: with the default
            `objectBoundingBox` the ramp is relative to each polygon's own box,
            so every dash — near or 100 m away — got an identical
            strong-to-weak ramp and the far run came out as bright as the near
            one. That is the opposite of perspective, and it is what put paint
            up in the haze band in the first place. In user space the fade is a
            function of where the paint IS: full at the bottom edge, gone before
            the horizon, which is also how a real road looks at dusk. */}
        <linearGradient
          id="deck-paint"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={DECK_VIEWBOX_H}
          x2="0"
          y2={HORIZON}
        >
          <stop offset="0" stopColor={DECK_PAINT} stopOpacity={DECK_PAINT_ALPHA} />
          <stop offset="0.5" stopColor={DECK_PAINT} stopOpacity={DECK_PAINT_ALPHA * 0.45} />
          <stop offset="1" stopColor={DECK_PAINT} stopOpacity="0" />
        </linearGradient>

        {/* Ground haze: the horizon has no drawn edge anywhere along its
            length, on the road or on the verge. */}
        <linearGradient id="deck-ground-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={DECK_SKY_HORIZON} stopOpacity="0.85" />
          <stop offset="1" stopColor={DECK_SKY_HORIZON} stopOpacity="0" />
        </linearGradient>

        {/* The graticule dissolves at both ends. A scale that stops at a hard
            boundary announces the rectangle it lives in — the same reason
            globals.css has `.hud-grid-fade` beside `.hud-grid`.

            WHITE stops, not black. An SVG mask is a LUMINANCE mask: black at
            opacity 1 is luminance 0, i.e. fully masked OUT. Written with `#000`
            stops this mask hid the entire tape, which is exactly what the first
            capture showed — a horizon with no graduations on it at all. */}
        <linearGradient id="deck-tape-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.24" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.76" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="deck-tape-mask">
          <rect
            x="0"
            y={HORIZON - 40}
            width={DECK_VIEWBOX_W}
            height="60"
            fill="url(#deck-tape-fade)"
          />
        </mask>

        {/* THE ROAD DISSOLVES TOWARD THE VIEWER, and that is a composition
            decision as much as a physical one.

            Physically: at dusk with no headlights the tarmac nearest the car is
            the LEAST lit thing in the frame — all the light is in the sky, and
            what you actually see of the road is the far stretch catching it.

            Compositionally: the near road is the bottom third of the viewport,
            which is where a student's content keeps scrolling. Drawn to the
            frame edge, the tarmac's two lateral boundaries cut hard diagonals
            into the bottom corners and the whole thing reads as a runway. Faded
            out, those edges never reach the corners and the lower third of the
            plane stays quiet, which is what a backdrop owes the page. */}
        <linearGradient id="deck-road-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.42" stopColor="#fff" stopOpacity="0.72" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.16" />
        </linearGradient>
        <mask id="deck-road-mask">
          <rect
            x="0"
            y={HORIZON}
            width={DECK_VIEWBOX_W}
            height={DECK_VIEWBOX_H - HORIZON}
            fill="url(#deck-road-fade)"
          />
        </mask>
      </defs>

      {/* --- sky --------------------------------------------------------- */}
      <rect x="0" y="0" width={DECK_VIEWBOX_W} height={HORIZON + 2} fill="url(#deck-sky)" />
      <rect x="0" y="0" width={DECK_VIEWBOX_W} height={HORIZON + 2} fill="url(#deck-sun)" />
      <rect x="0" y="0" width={DECK_VIEWBOX_W} height={HORIZON + 2} fill="url(#deck-cabin)" />

      {/* --- Vitosha. Two passes: a haze-lifted far crest, then the nearer
              massif offset down and right. Both DARKER than the sky behind
              them — a mountain is only ever visible because the sky is not. */}
      <path d={DECK_RIDGE_PATH} fill={DECK_RIDGE_FAR} opacity="0.85" />
      <path d={DECK_RIDGE_PATH} fill={DECK_RIDGE_NEAR} opacity="0.9" transform="translate(46 26)" />

      {/* --- ground + road ----------------------------------------------- */}
      <rect
        x="0"
        y={HORIZON}
        width={DECK_VIEWBOX_W}
        height={DECK_VIEWBOX_H - HORIZON}
        fill={DECK_VERGE}
      />
      <g mask="url(#deck-road-mask)">
        <polygon
          points={deckGroundBand(-DECK_ROAD_HALF_M, DECK_ROAD_HALF_M)}
          fill="url(#deck-road)"
        />

        {/* Edge lines, then the broken centre line. Both taper by projection,
            never by a stroke width, so the vanishing point stays honest. */}
        <polygon points={deckEdgeLine(-DECK_EDGE_LATERAL_M)} fill="url(#deck-paint)" />
        <polygon points={deckEdgeLine(DECK_EDGE_LATERAL_M)} fill="url(#deck-paint)" />
        {dashes.map((d) => (
          <polygon
            key={d.yNear}
            points={[
              `${n(d.x - d.halfNear)},${n(d.yNear)}`,
              `${n(d.x + d.halfNear)},${n(d.yNear)}`,
              `${n(d.x + d.halfFar)},${n(d.yFar)}`,
              `${n(d.x - d.halfFar)},${n(d.yFar)}`,
            ].join(" ")}
            fill="url(#deck-paint)"
          />
        ))}
      </g>

      {/* Aerial perspective on the ground, over road AND verge — and, crucially,
          AFTER the paint rather than under it. See `#deck-road` for the 663
          pixels that taught us the difference. */}
      <rect
        x="0"
        y={HORIZON}
        width={DECK_VIEWBOX_W}
        height="130"
        fill="url(#deck-ground-haze)"
      />

      {/* --- the graticule ------------------------------------------------
          A heading tape across the horizon, graduated by ANGLE so the marks
          bunch toward the edges the way a scale painted on real glass would.

          The graduations are CUT DARK into the lit band rather than drawn
          bright over it. That is not only the contrast argument (deckScene's
          ceiling) — it is how an etched graticule works: the metal is removed,
          and what you see is the absence of the backlight. */}
      <g mask="url(#deck-tape-mask)">
        {ticks.map((t) => (
          <rect
            key={t.x}
            x={n(t.x - (t.major ? 1.3 : 0.8))}
            // A major crosses the datum; a minor stops on it. See
            // DECK_TICK_MAJOR_DROP for why.
            y={n(HORIZON - t.length)}
            width={n(t.major ? 2.6 : 1.6)}
            height={n(t.length + (t.major ? DECK_TICK_MAJOR_DROP : 0))}
            fill={DECK_SKY_TOP}
            opacity={t.major ? 0.9 : 0.62}
          />
        ))}
        {/* The horizon rule itself: dark, and thin enough to read as etched. */}
        <rect
          x="0"
          y={n(HORIZON - 0.6)}
          width={DECK_VIEWBOX_W}
          height="1.2"
          fill={DECK_SKY_TOP}
          opacity="0.5"
        />
      </g>

      {/* THE BORESIGHT, at the vanishing point: dead ahead.
          These are the only LIT marks in the backdrop, and their colour is
          exactly the brightest pixel the old `.haze` painted across a third of
          this plane — so the loudest thing a student now sees is about 60 px of
          hairline instead of a 400 px glow. */}
      <g fill={DECK_LIT}>
        <rect
          x={n(DECK_CAMERA.vanishingX - 2)}
          y={n(HORIZON - DECK_TICK_CENTRE_LEN)}
          width="4"
          height={n(DECK_TICK_CENTRE_LEN)}
        />
        <rect
          x={n(DECK_CAMERA.vanishingX - DECK_BORESIGHT_GAP - DECK_BORESIGHT_LEN)}
          y={n(HORIZON - 1.5)}
          width={n(DECK_BORESIGHT_LEN)}
          height="3"
        />
        <rect
          x={n(DECK_CAMERA.vanishingX + DECK_BORESIGHT_GAP)}
          y={n(HORIZON - 1.5)}
          width={n(DECK_BORESIGHT_LEN)}
          height="3"
        />
      </g>
    </svg>
  );
}
