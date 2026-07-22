import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { loadHalfAItems } from "@/app/dev/verdict-board/halfAData";
import { loadCoverage } from "@/app/dev/verdict-board/coverageData";
import { VerdictBoardClient } from "@/app/dev/verdict-board/VerdictBoardClient";

export const metadata: Metadata = {
  title: "Табло за присъда · вътрешно",
  description: "Преглед и присъда на Half A + Half B (клипове + картинки).",
  robots: { index: false, follow: false },
};

/**
 * Verdict board — STAGING route (admin-gated, mirrors /review/clips), the
 * production-safe twin of /dev/verdict-board (which 404s in a prod build).
 *
 * The founder's „преглед и присъда" surface over both halves of the theory
 * why-panel work: Half B (the real-3D mistake reels played from the .webm
 * binaries scp'd next to the deployed manifest) and Half A (the picture
 * questions). Every card carries a ✓/✗ verdict toggle (localStorage) and
 * Claude's R0 flag. Gated on the server-resolved admin role (never client
 * input), 404-invisible to students, and never linked from the app nav.
 */
export default async function VerdictBoardStagingPage() {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  return <VerdictBoardClient halfA={loadHalfAItems()} coverage={loadCoverage()} />;
}
