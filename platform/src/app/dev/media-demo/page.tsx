import { notFound } from "next/navigation";
import { MediaDemoClient } from "./media-demo-client";

/**
 * THEO-1 dev harness — DEV BUILDS ONLY. Mounts the visual-question renderers
 * (sign face, sign-option grid, scene still over a real district) without
 * the authed /theory shell, so the founder can eyeball the media pipeline
 * before agent AUTHOR ships real media questions. 404s in production.
 */
export default function MediaDemoDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MediaDemoClient />;
}
