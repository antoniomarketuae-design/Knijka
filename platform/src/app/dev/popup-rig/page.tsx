import { notFound } from "next/navigation";
import { PopupRigClient } from "./popup-rig-client";

/**
 * POPUP RIG — rows A2 / A6 review harness. DEV BUILDS ONLY (404 in production).
 *
 * WHY A RIG AND NOT `/dev/hud-ux`. Both rows are about surfaces that only
 * appear when the drive reaches a particular moment: a graded fault, an advisor
 * prompt, the briefing, and the end-of-lesson debrief. Reaching all four by
 * driving is neither deterministic nor repeatable, and doc 66 R0 says the frame
 * has to be LOOKED at — which means it has to be reachable on demand.
 *
 * WHAT IS REAL HERE, so nothing about the evidence is overstated:
 *  · the components are the SHIPPING ones, imported through the module's public
 *    index — `ObjectiveBanner`, `AdvisorCard`, `BriefingCard`, `HudToasts`,
 *    `SessionEndScreen`. Not copies;
 *  · the CSS is the SHIPPING `PlayAreaStyles` (the UNPANEL sweep, the row C1
 *    priority rules and the row C2 hit-area rules all apply, because they are
 *    scoped to `[data-sim-stage]` / `[data-sim-compact]`, and both attributes
 *    are set below exactly as `LessonPlayShell` sets them);
 *  · the column geometry comes from `notifyColumn.ts`'s own constants, the same
 *    four values the shell passes.
 *
 * WHAT IS NOT REAL: there is no 3D scene behind the glass (a flat road-toned
 * backdrop stands in), and no engine — the toasts are seeded, not graded. That
 * is a statement about the BACKGROUND, not about the panels, and every measured
 * claim in the review is about a panel.
 */
export default function PopupRigDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PopupRigClient />;
}
