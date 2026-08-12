import { notFound } from "next/navigation";
import { PredriveRigClient } from "./predrive-rig-client";

/**
 * PRE-DRIVE TUTORIAL RIG — FR-19 review harness. DEV BUILDS ONLY (404 in prod).
 *
 * WHY THIS EXISTS. FR-19 is thirteen 10–15 s clips that live inside the
 * pre-drive tutorial card — the popup the founder asked for on 2026-07-30 after
 * hitting a wall of thirteen keyboard shortcuts. That card only appears partway
 * into a lesson, behind a login and a started drive, which is a poor way to
 * answer the one question that matters here: does a generated clip look better
 * in that card than the SVG still it replaces?
 *
 * WHAT IS REAL: the card is the SHIPPING `PreDriveTutorial`, imported through
 * the hud module's public index. Its media comes from the real
 * `preDriveTutorialMedia()`, so a step with an entry in
 * `PRE_DRIVE_TUTORIAL_CLIPS` renders <video> and every other step renders the
 * same inline-SVG still a student sees today. Nothing is mocked.
 *
 * WHAT IS NOT REAL: there is no 3D scene behind the card and no engine — the
 * step buttons below seed `stepId`, they do not grade anything. That is a
 * statement about the BACKGROUND, not about the card.
 */
export default function PredriveRigDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PredriveRigClient />;
}
