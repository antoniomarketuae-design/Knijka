# Blender asset pipeline (Книжка.AI simulator)

We author the simulator's 3D environment ourselves — CC0/self-made, web-optimized,
owned outright (no third-party license risk, per the Marlin/Kenney history). Two ways
to drive Blender:

## 1. Headless scripting (the production pipeline — works now)

No GUI, no MCP, no Claude Code restart. Write a Python generator, run it headless,
get a web-ready `.glb`:

```sh
"E:/blender/blender-5.1.2-windows-x64/blender.exe" \
  --background --python tools/blender/<script>.py -- <out_dir>
```

- `smoke_test.py` — pipeline validation (buildings + ground + PBR → GLB). Proven working.
- Real generators (Sofia building kit, cockpit car, street furniture) land here as
  the simulator upgrade Phase 2 proceeds — see `docs/simulation/66_SIMULATOR_UPGRADE_PLAN.md`.
- Every exported GLB should then pass through `gltf-transform optimize --compress draco
  --texture-compress ktx2` before shipping to `platform/public/sim/` (phone budget).

Blender: **5.1.2 portable** at `E:\blender\blender-5.1.2-windows-x64\blender.exe` (moved off C: to save space).

## 2. Blender MCP (interactive — I drive Blender live via chat)

For exploratory modeling (and Rodin/Hyper3D AI mesh generation). Requires a one-time setup:

1. In Blender: Edit → Preferences → Add-ons → ▾ menu → "Install from Disk…" → pick `E:\blender-mcp-addon.py`
   → enable "Interface: Blender MCP".
2. The MCP server is wired in `.mcp.json` (repo root) → a **persistent venv** at
   `E:\blender-mcp-venv\Scripts\blender-mcp.exe`.
3. **Restart Claude Code** so it loads the `blender` MCP server, then **approve "blender"** when prompted.
4. In Blender's 3D-view sidebar (press `N`) → "BlenderMCP" tab → "Connect to Claude".

MCP servers only load at Claude Code startup, so the interactive path is "ready after one
restart." The headless path above needs none of that.

### ⚠️ Do NOT use `uvx blender-mcp` on this machine

The original `.mcp.json` launched the server via `uvx blender-mcp`, which rebuilds an ephemeral
env on **every** launch. That re-extracts `pywin32`, and Windows Defender locks its freshly-written
DLLs mid-install → `uv` fails with *"file used by another process"* every single time, so Blender
never connects. Fix (already applied): one persistent env built with `pip` (which handles pywin32
cleanly), no per-launch rebuild:

```sh
"C:/Users/Ljh/AppData/Local/Programs/Python/Python312/python.exe" -m venv E:/blender-mcp-venv
E:/blender-mcp-venv/Scripts/python.exe -m pip install blender-mcp
# then point .mcp.json → E:\blender-mcp-venv\Scripts\blender-mcp.exe  (args: [])
```

To upgrade later: `E:/blender-mcp-venv/Scripts/python.exe -m pip install -U blender-mcp`.

### Rodin / Hyper3D (AI mesh generation for the hero car)

The addon exposes Hyper3D Rodin. In Blender's **BlenderMCP** sidebar panel, enable Hyper3D and
enter an API key (get one at hyper3d.ai / fal.ai), or use the addon's free trial key. Once set,
the `mcp__blender__*` tools include Rodin generate/poll/import.

## 3. Hero player car — built via Rodin → voxel rebuild (DONE)

Shipped: **`platform/public/sim/vehicles/hero_car.glb`** — fictional unbadged luxury performance
sedan ("Aurelis GT-E"), ~65k tris, Draco-compressed to **136 KB**. Body node `hero_car_body` +
4 rigged wheels `wheel_FL/FR/RL/RR` (spin axis local X). Working files in `work/` (gitignored):
`hero_car_build.blend` (editable), `hero_car_rodin_raw.blend/.glb` (raw Rodin, preserved).

**Key learning — Rodin geometry is scan-soup; its detail is baked into the texture.** Stripping
the texture exposes a multi-shell mesh with holes and flat disc "wheels". The pipeline that worked:

1. Rodin text→3D with a `bbox_condition` ratio (locks proportions) → import.
2. Orient front→+Y, scale to spec, ground it (bake matrices into mesh data — operators silently
   no-op via MCP without a depsgraph update).
3. **Voxel-remesh** the soup into ONE watertight solid (the silhouette is Rodin's real value).
4. Squash to spec height (wheels are replaced, so no roundness constraint), carve wheel arches (boolean).
5. Rebuild detail as real geometry: procedural multi-spoke alloys (named nodes), dark glass canopy
   (face-material on greenhouse), front/rear LED signatures + grille/diffuser (raycast-conformed
   panels — NOT shrinkwrap, which snaps to the wrong surface), clean side mirrors.
6. Export GLB (Y-up, wheels separate) → `node tools/glb/optimize.mjs <in> <out>`.

Regenerating via Rodin gives a different look but the SAME scan-soup limitation — the rebuild is inherent.
See `HERO_CAR_RODIN_BRIEF.md` for the spec cheat-sheet.
