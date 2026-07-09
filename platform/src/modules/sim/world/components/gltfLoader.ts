/**
 * Shared GLTFLoader factory with Draco decoding wired in — CLIENT ONLY
 * (GLTFLoader needs the DOM; DRACOLoader spins up Web Workers on first decode).
 *
 * Authored simulator GLBs are compressed with KHR_draco_mesh_compression by the
 * asset pipeline (tools/glb/optimize.mjs). Loading them therefore requires a
 * DRACOLoader; a plain `new GLTFLoader()` throws "no DRACOLoader instance
 * provided". Any loader that must read building/prop/vehicle GLBs should be built
 * through `createGltfLoader()` so Draco geometry decodes uniformly.
 *
 * The Draco decoder (wasm + js glue) is served locally from `public/draco/`
 * (copied from three/examples/jsm/libs/draco). That keeps decoding CSP-safe with
 * NO CDN fetch — a hard requirement, since the sim runs under a strict CSP.
 */

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/**
 * Public path to the locally-served Draco decoder. Files live at
 * platform/public/draco/{draco_wasm_wrapper.js, draco_decoder.wasm,
 * draco_decoder.js}; DRACOLoader.setDecoderPath resolves those names against it.
 */
export const DRACO_DECODER_PATH = "/draco/";

/**
 * Build a GLTFLoader that transparently decodes Draco-compressed geometry.
 * Each call returns a fresh loader with its own DRACOLoader (workers are created
 * lazily on the first decode and can be torn down via `loader.dracoLoader.dispose()`).
 */
export function createGltfLoader(): GLTFLoader {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  return loader;
}
