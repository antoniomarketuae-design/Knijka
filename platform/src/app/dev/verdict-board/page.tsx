import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadHalfAItems } from "./halfAData";
import { VerdictBoardClient } from "./VerdictBoardClient";

export const metadata: Metadata = {
  title: "Табло за присъда · вътрешно",
  robots: { index: false, follow: false },
};

/**
 * Verdict board — DEV route (404s in production, like /dev/clip-capture).
 *
 * The founder's „преглед и присъда" surface over BOTH halves of the theory
 * why-panel work: Half B (the real-3D mistake reels, played from the local
 * public/clips/*.webm the headless renderer produced) and Half A (the
 * picture-bearing questions). Every card carries a ✓/✗ verdict toggle
 * (localStorage) and Claude's own R0 flag, so the founder can rule on the
 * whole body of work in one place. Half A is read server-side (fs) and passed
 * down; the client never bundles the content loader.
 */
export default function VerdictBoardPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <VerdictBoardClient halfA={loadHalfAItems()} />;
}
