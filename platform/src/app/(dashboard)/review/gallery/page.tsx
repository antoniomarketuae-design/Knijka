import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { loadGalleryIndex } from "./galleryData";
import { GalleryClient } from "./GalleryClient";

export const metadata: Metadata = {
  title: "Галерия за присъда · Книжка.AI",
  description: "Вътрешна визуална галерия за преглед на сценариите и картинките.",
  robots: { index: false, follow: false },
};

// Reads the content bank and the public/ render output from disk on every hit —
// the founder re-renders stills while reviewing and must see them appear.
export const dynamic = "force-dynamic";

/**
 * ADMIN-ONLY founder tool — the review GALLERY.
 *
 * The verdict board (dev route) tells the founder WHAT exists; this shows him
 * the artefacts so he can actually rule on them. He asked for exactly this:
 * „to answer the rest I need visualisations… I have to review all our 150
 * questions visually to have a good verdict."
 *
 * Deliberately NOT a /dev route, for the same reason /review/clips is not: the
 * founder reviews on his PHONE, off the staging deployment, where the rendered
 * stills and the .webm binaries have been scp'd next to the build. So it is
 * gated the same way — the server-resolved session role (never client input),
 * 404-invisible to students, never linked from the app navigation.
 *
 * The index is assembled server-side (galleryData touches fs and the scenario
 * catalogue); the client receives plain serializable data.
 */
export default async function ReviewGalleryPage() {
  const user = await requireUser();
  if (!user.isAdmin) notFound();

  return <GalleryClient index={loadGalleryIndex()} />;
}
