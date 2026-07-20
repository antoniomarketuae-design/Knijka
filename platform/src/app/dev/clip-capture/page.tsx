import { notFound } from "next/navigation";
import { clipPilotList } from "@/modules/learning";
import { ClipCaptureClient } from "./clip-capture-client";

/**
 * Clip-capture rig (the why-panel video pilot) — DEV BUILDS ONLY.
 *
 * Batch-records the ~20 pilot mistake clips by replaying each committed
 * mistake trace in the REAL 3D engine (CaptureScene: world + red ghost +
 * follow camera, 1280×720) and saving through /api/dev/clips into
 * public/clips/ + manifest.json. The founder then reviews the clips in the
 * gallery before mass production. In production this route 404s (the
 * ghost-demo convention — no new public surface).
 */
export default function ClipCaptureDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  // Derived pilot list (learning/clipPilot) — computed server-side so the
  // client never bundles the learning barrel.
  return <ClipCaptureClient pilot={clipPilotList()} />;
}
