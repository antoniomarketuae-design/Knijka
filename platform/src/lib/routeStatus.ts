/**
 * Single source of truth for which routes are live vs. still "coming soon".
 *
 * Both the sidebar nav (DashboardShell) and the hub cards (ModuleGrid) read
 * this map, so a module can never look shipped in one place and locked in
 * another. "soon" routes are rendered non-navigating everywhere — this is also
 * what keeps pageless links (/leaderboard, /settings) from dropping a user onto
 * a raw Next 404. When a real page lands, flip its status to "live".
 */

export type RouteStatus = "live" | "dev" | "soon";

export const ROUTE_STATUS: Record<string, RouteStatus> = {
  "/dashboard": "live",
  "/theory": "live",
  // THE CLASSROOM. It existed and rendered correctly from 28 July and was in
  // neither this map nor the nav, so for two weeks the only way to reach it was
  // to type the URL — and nobody who had not read the source knew it was there.
  // A route that is not in this file is not shipped, whatever the code says.
  "/classroom": "live",
  "/exams": "live",
  // Shipped: lesson ladder + exam mode on the real Студентски град street
  // topology. Flipped from "dev" once the sim left the in-progress phase.
  "/simulator": "live",
  // Hazard-perception training, the standalone (paid) door. "live" the moment
  // the route exists, because the page itself is honest about the state behind
  // it: no item engine wired ⇒ it renders „подготвя се" rather than a broken
  // run. Marking it "soon" instead would make the nav non-navigating and hide
  // the entitlement gate — the one thing that must be observable on staging.
  "/hazard": "live",
  "/tutor": "live",
  // No page yet — must stay non-navigating so nav never 404s.
  "/leaderboard": "soon",
  "/pricing": "live",
  "/settings": "live",
};

/** True when a route has no real destination yet → render non-navigating. */
export function isSoon(href: string): boolean {
  return ROUTE_STATUS[href] === "soon";
}

/** Badge text for a route, or null when it is fully live (no badge). */
export function statusBadge(href: string): string | null {
  const status = ROUTE_STATUS[href];
  if (status === "soon") return "Скоро";
  if (status === "dev") return "в разработка";
  return null;
}
