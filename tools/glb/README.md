# GLB web-optimization

Every authored GLB (Blender output from `tools/blender/`) must be compressed before it
lands in `platform/public/sim/` — the audit (docs/simulation/66 §1, §5) flagged uncompressed
textures/geometry as load-bearing-critical for the phone budget. Run `optimize.mjs` (Node ESM,
uses [`@gltf-transform`](https://gltf-transform.dev) + `draco3dgltf` + `sharp`, all devDependencies
of `platform/`) to apply **dedup → weld → prune → resample → texture pass → Draco geometry
compression** in one pass:

```sh
# from platform/ (script lives at ../tools/glb/optimize.mjs):
npm run glb:optimize -- public/sim/city-v3/t_grid_grey_38.glb public/sim/city-v3/t_grid_grey_38.opt.glb
# or directly:
node tools/glb/optimize.mjs <input.glb> <output.glb> [--max-texture 1024] [--no-ktx2]
```

**Textures:** the script emits KTX2/BasisU **only if** a native KTX-Software `toktx` binary is on
`PATH` (gltf-transform shells out to it — there is no bundled wasm KTX2 encoder). If `toktx` is
absent (as on this machine), it prints a clear note and falls back to a **webp + resize** pass so
Draco geometry compression and a real texture pass still run. Install
[KTX-Software](https://github.com/KhronosGroup/KTX-Software) and re-run to get KTX2. **Draco
decoding in the sim** is wired via `createGltfLoader()` in
`platform/src/modules/sim/world/components/gltfLoader.ts`, which attaches a `DRACOLoader` pointed at
the locally-served decoder in `platform/public/draco/` (copied from `three/examples/jsm/libs/draco`,
CSP-safe / no CDN). Any loader that reads compressed GLBs should be built through that factory.
