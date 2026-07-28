/**
 * /dev/gallery-index — the render-job feed for the review gallery's build
 * script. DEV BUILDS ONLY (404 in production, the /dev surface convention).
 *
 * The job list is derived from the TypeScript scenario catalogue plus the
 * committed shadow traces, neither of which plain node can read: the templates
 * are TS modules and the trace→pose rule lives in `galleryStillSpec.ts`. Rather
 * than stand up a second vitest-based generator (the gen_clip_plan mold) for a
 * derivation with no engine in it, the running dev server — which has already
 * compiled all of it — hands the list out as JSON and
 * `tools/gallery/build-gallery-stills.mjs` fetches it.
 *
 * That also guarantees the script and the gallery page can never disagree:
 * both call `loadGalleryStillJobs()` / `loadGalleryIndex()` in this same module.
 *
 *   GET /dev/gallery-index          → { jobs, gaps }  (render list)
 *   GET /dev/gallery-index?full=1   → the whole gallery index too
 */

import { NextResponse } from "next/server";
import { loadGalleryIndex, loadGalleryStillJobs } from "../../(dashboard)/review/gallery/galleryData";

// Reads the content bank + trace files from disk — never cache.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const full = new URL(request.url).searchParams.get("full") === "1";
  const list = loadGalleryStillJobs();
  return NextResponse.json(full ? { ...list, index: loadGalleryIndex() } : list);
}
