import { notFound } from "next/navigation";
import { GwShellClient } from "./gw-shell-client";

/**
 * Give-way / roundabout verification harness — DEV BUILDS ONLY.
 *
 * Identical in spirit to /dev/hud-ux (the REAL LessonPlayShell without the
 * authed /simulator route) with the one thing that harness cannot express:
 * `?level=1..5`. hud-ux hard-codes `compileScenario(spec, 3)`, so the rungs
 * the founder complains about by NAME — „same question 6 just this time L5",
 * „7 at L5" (doc 87 B19, B22) — had no login-free shell to be looked at in.
 * A rung is a different lesson; verifying it on rung 3 is verifying a
 * different lesson.
 *
 * `?lesson=<id>` reaches the hand-authored curriculum (Урок 2 „Кръстовища и
 * предимство" — doc 87 B5) the same way. In production this route 404s.
 */
export default function GwShellDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GwShellClient />;
}
