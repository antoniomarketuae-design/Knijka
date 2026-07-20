import { notFound } from "next/navigation";
import { CLIP_PLAN, clipPilotList } from "@/modules/learning";
import { ClipCaptureClient } from "./clip-capture-client";

/**
 * Clip-capture rig v2 (doc 66) — DEV BUILDS ONLY.
 *
 * Batch-records the pilot mistake clips by replaying each committed mistake
 * trace in the REAL 3D engine (CaptureScene v2: the drill's exact world,
 * the staged actors re-enacted through the production director, view per the
 * plan card, R0 keyframes) and saving through /api/dev/clips into
 * public/clips/ + manifest.json. Claude then inspects the keyframes (R0)
 * before the founder ever reviews the gallery. In production this route 404s
 * (the ghost-demo convention — no new public surface).
 */
export default function ClipCaptureDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  // Derived pilot list + the generated requirements plan (learning barrel) —
  // both computed server-side so the client never bundles the barrel.
  return <ClipCaptureClient pilot={clipPilotList()} plan={CLIP_PLAN} />;
}
