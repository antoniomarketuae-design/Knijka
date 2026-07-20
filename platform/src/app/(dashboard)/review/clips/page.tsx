import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { CLIP_PLAN } from "@/modules/learning";
import { ClipsGalleryClient } from "./ClipsGalleryClient";

export const metadata: Metadata = {
  title: "Преглед на клипове · Книжка.AI",
  description: "Вътрешна галерия за преглед на видеоклиповете от симулатора.",
  robots: { index: false, follow: false },
};

/**
 * ADMIN-ONLY founder tool (the clip pilot): the review gallery over
 * public/clips/manifest.json — every pre-produced real-engine mistake clip,
 * playable inline, so the founder rules on the look BEFORE mass production.
 *
 * Gated by the server-resolved session role (auth/session.ts — role read
 * fresh from the DB, never client input) and 404-invisible to students.
 * Deliberately NOT a dev-only route: the founder reviews on STAGING, where
 * the .webm binaries are scp'd next to the deployed manifest. Never linked
 * from the app navigation. The client fetches the manifest fresh itself,
 * so there is nothing to prerender or cache here.
 */
export default async function ClipsReviewPage() {
  const user = await requireUser();
  if (!user.isAdmin) notFound();

  // Requirements cards (doc 66) — the generated plan, resolved server-side
  // so the client never bundles the learning barrel (the clip-capture law).
  return <ClipsGalleryClient plan={CLIP_PLAN} />;
}
