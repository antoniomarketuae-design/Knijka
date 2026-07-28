import { notFound } from "next/navigation";
import { HudUxClient } from "./hud-ux-client";

/**
 * HUD-UX review harness — DEV BUILDS ONLY.
 *
 * Mounts the REAL LessonPlayShell (dashboard bar, minimap, toasts, teach
 * overlay, cockpit/chase camera) on the полигон free-drive spec, without the
 * authed /simulator route. It exists so the in-drive HUD can be eyeballed on a
 * phone profile — the founder's device — while the four 2026-07-28 UX faults
 * (warning dismissal, chase-view telltales, minimap toggle, cockpit share of
 * frame) are worked on. In production this route 404s.
 */
export default function HudUxDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <HudUxClient />;
}
