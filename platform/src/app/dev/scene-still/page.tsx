import { notFound } from "next/navigation";
import type { SceneStillMedia } from "@/lib/content/types";
import { SceneStillClient } from "./scene-still-client";
import { decodeSceneStillSpec, loadSceneStill } from "./sceneStillData";

/**
 * Scene-still rig (PILOT) — DEV BUILDS ONLY.
 *
 * Renders a theory question's `media.sceneStill` as an angled-overhead 3/4
 * screenshot of the REAL committed district map (DistrictWorld), with the
 * question's cars placed through the same instanced fleet the sim uses
 * (ScenarioObstacles) and code-mesh attention marks drawn on top:
 *   - target  → a bright GREEN 3D arrow diving from the ego toward the spot,
 *   - danger  → a RED ring on the road,
 *   - ego pose → a cyan "this is you" ground ring.
 *
 * Spec source (query, resolved server-side):
 *   ?id=<questionId>       — read the question's sceneStill from the content bank
 *   ?spec=<base64 json>    — an inline SceneStillMedia (headless / ad-hoc)
 *
 * A headless Playwright driver (tools/clips/headless/render-scene-still.mjs)
 * loads this route, waits for window.__sceneStill.state === "ready", and
 * screenshots the canvas into public/scene-stills/<id>.png. In production this
 * route 404s (the dev-surface convention).
 */
export default async function SceneStillDevPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; spec?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { id, spec: specParam } = await searchParams;

  let spec: SceneStillMedia | null = null;
  let error: string | null = null;
  let label = id ?? "(inline)";

  if (specParam) {
    spec = decodeSceneStillSpec(specParam);
    if (!spec) error = "inline ?spec= did not decode to a sceneStill";
  } else if (id) {
    spec = loadSceneStill(id);
    if (!spec) error = `question ${id} has no sceneStill media`;
  } else {
    error = "pass ?id=<questionId> or ?spec=<base64 sceneStill>";
    label = "(none)";
  }

  return <SceneStillClient id={label} spec={spec} loadError={error} />;
}
