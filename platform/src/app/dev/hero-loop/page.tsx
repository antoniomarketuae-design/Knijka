import { notFound } from "next/navigation";
import { HeroLoopClient } from "./hero-loop-client";

/**
 * Hero-loop capture rig — DEV BUILDS ONLY (404s in production, the dev-surface
 * convention this folder follows).
 *
 * Renders the marketing hero scene alone, full-bleed, with a seekable clock,
 * so tools/clips/headless/render-hero-loop.mjs can step it frame by frame and
 * stitch the result into the loop every phone gets instead of a still plate
 * (HeroLoopVideo).
 *
 * Unlike /dev/hero-preview — which exists to LOOK at the hero as a visitor
 * would, capability gate and copy and all — this route deliberately bypasses
 * the gate: it is a camera, not a preview.
 */
export default function HeroLoopDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <HeroLoopClient />;
}
