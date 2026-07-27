/**
 * components/marketing — the public surfaces (landing, schools, pricing).
 *
 * These components are the only ones in the app allowed to be dark-only:
 * everything behind the login shares the token layer and both themes, while
 * the marketing shell commits to the instrument-cluster night look. Nothing
 * here may import from the authenticated app, and nothing there may import
 * from here.
 *
 * The hero deliberately exports its capability logic too: the decision about
 * whether a visitor gets live 3D is product policy, not an implementation
 * detail, and the next surface that wants a WebGL flourish must reuse the
 * same door rather than inventing a second one.
 */

/**
 * `./landing/*` is deliberately NOT re-exported here, the same call made in
 * `components/ui` (no barrel). `landing/featuredMistakes.ts` reads `node:fs`
 * at build time to check which clip stills exist on disk; putting it behind
 * this barrel would mean any client component that imported `@/components/
 * marketing` for the hero would drag a Node builtin into a browser bundle.
 * The landing page imports those two files by path instead.
 */

export { LiveHero, type LiveHeroProps } from "./hero/LiveHero";
export {
  HERO_SCRIM_NARROW,
  HERO_SCRIM_WIDE,
  contrastRatio,
  relativeLuminance,
  scrimAlphaAt,
  scrimmedLuminance,
  type ScrimStop,
} from "./hero/heroContrast";
export { HeroPlate, HERO_BAND_CLASS, type HeroPlateProps } from "./hero/HeroPlate";
export { HeroStage, type HeroStageProps } from "./hero/HeroStage";
export {
  HeroLoopVideo,
  HERO_LOOP_MP4,
  HERO_LOOP_WEBM,
  type HeroLoopVideoProps,
} from "./hero/HeroLoopVideo";

export {
  decideHeroLoop,
  decideHeroStage,
  readHeroSignals,
  probeWebgl,
  HERO_MIN_VIEWPORT_PX,
  HERO_MIN_DEVICE_MEMORY_GB,
  HERO_MIN_CORES,
  HERO_SLOW_CONNECTIONS,
  HERO_UNKNOWN_SIGNALS,
  type HeroLoopDecision,
  type HeroLoopMode,
  type HeroSignals,
  type HeroStageDecision,
  type HeroStageMode,
  type HeroDeclineReason,
} from "./hero/heroCapability";
