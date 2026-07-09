# Blender asset pipeline (Книжка.AI simulator)

We author the simulator's 3D environment ourselves — CC0/self-made, web-optimized,
owned outright (no third-party license risk, per the Marlin/Kenney history). Two ways
to drive Blender:

## 1. Headless scripting (the production pipeline — works now)

No GUI, no MCP, no Claude Code restart. Write a Python generator, run it headless,
get a web-ready `.glb`:

```sh
"C:/Users/Ljh/blender/blender-5.1.2-windows-x64/blender.exe" \
  --background --python tools/blender/<script>.py -- <out_dir>
```

- `smoke_test.py` — pipeline validation (buildings + ground + PBR → GLB). Proven working.
- Real generators (Sofia building kit, cockpit car, street furniture) land here as
  the simulator upgrade Phase 2 proceeds — see `docs/simulation/66_SIMULATOR_UPGRADE_PLAN.md`.
- Every exported GLB should then pass through `gltf-transform optimize --compress draco
  --texture-compress ktx2` before shipping to `platform/public/sim/` (phone budget).

Blender: **5.1.2 portable** at `C:\Users\Ljh\blender\blender-5.1.2-windows-x64\blender.exe`.

## 2. Blender MCP (interactive — I drive Blender live via chat)

For exploratory modeling. Requires a one-time setup:

1. In Blender: Edit → Preferences → Add-ons → Install → pick `C:\Users\Ljh\blender-mcp-addon.py`
   → enable "Interface: Blender MCP".
2. The MCP server is wired in `.mcp.json` (repo root, git-ignored — machine-specific `uvx` path).
3. **Restart Claude Code** so it loads the `blender` MCP server.
4. In Blender's 3D-view sidebar (press `N`) → "BlenderMCP" tab → "Connect to Claude".

MCP servers only load at Claude Code startup, so the interactive path is "ready after one
restart." The headless path above needs none of that.
