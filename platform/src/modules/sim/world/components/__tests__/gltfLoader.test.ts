import { describe, expect, it } from "vitest";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { createGltfLoader, DRACO_DECODER_PATH } from "../gltfLoader";

describe("createGltfLoader", () => {
  it("constructs without throwing", () => {
    expect(() => createGltfLoader()).not.toThrow();
  });

  it("returns a GLTFLoader with a DRACOLoader attached", () => {
    const loader = createGltfLoader();
    expect(loader).toBeInstanceOf(GLTFLoader);
    expect(loader.dracoLoader).toBeInstanceOf(DRACOLoader);
  });

  it("serves the Draco decoder from the local, CSP-safe public path", () => {
    // No CDN: the decoder wasm/js must be served from platform/public/draco.
    expect(DRACO_DECODER_PATH).toBe("/draco/");
    expect(DRACO_DECODER_PATH.startsWith("/")).toBe(true);
    expect(DRACO_DECODER_PATH).not.toMatch(/^https?:\/\//);
  });

  it("hands back a fresh loader instance each call", () => {
    expect(createGltfLoader()).not.toBe(createGltfLoader());
  });
});
