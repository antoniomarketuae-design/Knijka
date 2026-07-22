"use client";

/**
 * Scene-still client (DEV ONLY) — the browser half of the still renderer.
 *
 * Mounts the R3F <SceneStillScene/> (ssr:false — it touches three/GLB loaders)
 * and publishes a tiny control surface on `window.__sceneStill` so the headless
 * Playwright driver knows when the frame is settled:
 *
 *   state   "loading" | "ready" | "error"     (poll until ready, then shoot)
 *   error   message when state === "error"
 *
 * Everything the scene draws is static (no clock, no animation) — once the
 * world + fleet GLBs resolve and a few warmup frames render, the canvas holds a
 * single deterministic frame the driver screenshots.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { SceneStillMedia } from "@/lib/content/types";

const SceneStillScene = dynamic(
  () => import("./SceneStillScene").then((m) => ({ default: m.SceneStillScene })),
  { ssr: false },
);

interface SceneStillApi {
  state: "loading" | "ready" | "error";
  error?: string;
  id: string;
}

declare global {
  interface Window {
    __sceneStill?: SceneStillApi;
  }
}

/** Fixed output size — a consistent still across machines (matches the clip rig). */
export const STILL_W = 1280;
export const STILL_H = 720;

export function SceneStillClient({
  id,
  spec,
  loadError,
}: {
  id: string;
  spec: SceneStillMedia | null;
  loadError: string | null;
}) {
  const [ready, setReady] = useState(false);

  const publish = useCallback((patch: Partial<SceneStillApi>) => {
    const existing = window.__sceneStill;
    if (existing) {
      Object.assign(existing, patch);
      return;
    }
    window.__sceneStill = { state: "loading", id, ...patch };
  }, [id]);

  const onReady = useCallback(() => {
    setReady(true);
    publish({ state: "ready" });
  }, [publish]);

  const onError = useCallback(
    (message: string) => {
      publish({ state: "error", error: message });
    },
    [publish],
  );

  // Publish the initial surface; surface a load error immediately.
  useEffect(() => {
    publish({});
    if (loadError || !spec) {
      publish({ state: "error", error: loadError ?? "no sceneStill spec" });
    } else {
      publish({ state: "loading" });
    }
    // Boot once — props are stable server values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadError || !spec) {
    return (
      <main data-scene-still="error" style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 18 }}>scene-still — no spec</h1>
        <p style={{ color: "#b4453f" }}>{loadError ?? "no sceneStill spec"}</p>
        <p style={{ color: "#666", fontSize: 13 }}>
          Try <code>?id=q-osnovni-065</code> or an inline <code>?spec=&lt;base64&gt;</code>.
        </p>
      </main>
    );
  }

  return (
    <main
      data-scene-still="scene"
      data-ready={ready ? "1" : "0"}
      style={{ width: STILL_W, height: STILL_H }}
    >
      <SceneStillScene spec={spec} onReady={onReady} onError={onError} />
    </main>
  );
}
