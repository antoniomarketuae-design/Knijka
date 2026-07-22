/**
 * sceneStillData — SERVER-ONLY loader for the scene-still pilot route.
 *
 * Reads the committed question bank directly (resolveContentDir) and returns
 * the `media.sceneStill` spec for one question id. This module touches `fs`, so
 * it must only be imported by the server page (the client receives the resolved
 * spec as a prop / decodes an inline ?spec=). Mirrors verdict-board/halfAData.ts.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveContentDir } from "@/lib/content/loader";
import type { SceneStillMedia } from "@/lib/content/types";

interface RawQuestion {
  id?: unknown;
  media?: unknown;
}

function isSceneStill(media: unknown): media is SceneStillMedia {
  return (
    !!media &&
    typeof media === "object" &&
    (media as { kind?: unknown }).kind === "sceneStill" &&
    typeof (media as { districtId?: unknown }).districtId === "string"
  );
}

/** Resolve one question id → its sceneStill spec, or null if absent. */
export function loadSceneStill(questionId: string): SceneStillMedia | null {
  const dir = path.join(resolveContentDir(), "questions");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return null;
  }
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    } catch {
      continue;
    }
    const arr: unknown = Array.isArray(parsed)
      ? parsed
      : ((parsed as { questions?: unknown })?.questions ??
        (parsed as { items?: unknown })?.items ??
        []);
    if (!Array.isArray(arr)) continue;
    for (const q of arr as RawQuestion[]) {
      if (q?.id !== questionId) continue;
      return isSceneStill(q.media) ? q.media : null;
    }
  }
  return null;
}

/** Decode a base64url-encoded inline sceneStill spec (?spec=…). */
export function decodeSceneStillSpec(b64: string): SceneStillMedia | null {
  try {
    const json = Buffer.from(b64, "base64").toString("utf-8");
    const parsed: unknown = JSON.parse(json);
    return isSceneStill(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
