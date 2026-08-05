import { notFound } from "next/navigation";
import { DriveRigClient } from "./drive-rig-client";

/**
 * THE DRIVE RIG — DEV BUILDS ONLY. In production this route 404s.
 *
 * The real LessonPlayShell (fault cards, teach moments, objective banner — the
 * whole thing the founder actually looks at) WITH per-tick telemetry on
 * `window.__driveRig`, and a closed-loop scripted driver.
 *
 * It exists because neither existing harness could answer a review row on its
 * own: /dev/gw-shell renders the cards but publishes no speed and no position,
 * /dev/ghost-demo publishes telemetry but mounts a bare LessonScene with no
 * cards. Row B15 („a fault card at a give-way point — wrongful conviction, or a
 * genuine barge at 37 km/h?") and row B29 (a frame under a HELD right glance)
 * both died on that split.
 *
 *   /dev/drive-rig?scenario=sc-roundabout-entry&level=5
 *   /dev/drive-rig?lesson=l2-intersections
 *   /dev/drive-rig?scenario=sc-give-way-right&script=<url-encoded JSON steps>
 *
 * From a capture script:
 *   await page.evaluate(() => window.__driveRig.run([
 *     { label: "approach", speedKmh: 20, stopAt: { x: 12, y: 40 } },
 *     { label: "wait",     speedKmh: 0,  forSec: 40 },
 *     { label: "go",       speedKmh: 25, forSec: 12 },
 *   ]));
 *   const drive = await page.evaluate(() => window.__driveRig.dump(10));
 */
export default function DriveRigDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DriveRigClient />;
}
