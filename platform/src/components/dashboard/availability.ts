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
  "/exams": "live",
  // Shipped: lesson ladder + exam mode on the real Студентски град street
  // topology. Flipped from "dev" once the sim left the in-progress phase.
  "/simulator": "live",
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
