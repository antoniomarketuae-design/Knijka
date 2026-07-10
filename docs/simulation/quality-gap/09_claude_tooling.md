# 09 — Claude Code / MCP tooling ecosystem for the Blender→GLB→R3F pipeline

Research date: 2026-07-10 · Lane: Claude-tooling ecosystem (blender-mcp capabilities, other 3D MCPs, Claude Code skills/plugins)
Context: we already run headless Blender 5.1.2 procedural generators (`tools/blender/*.py`) + the **ahujasid blender-mcp** addon (port 9876) with a Rodin trial key. Question: what else exists, and what is worth adopting for the REF-1 quality push.

---

## A. ahujasid/blender-mcp — FULL current capability surface (what we already have installed)

Repo: https://github.com/ahujasid/blender-mcp · DeepWiki: https://deepwiki.com/ahujasid/blender-mcp
Architecture: Blender addon (TCP socket, `localhost:9876`) + Python MCP server (`uvx blender-mcp`). Our connected server exposes exactly these 22 tools (verified against this session's tool list + README):

### Core (always on, no keys)
| Tool | Notes |
|---|---|
| `get_scene_info` / `get_object_info` | scene + per-object inspection |
| `get_viewport_screenshot` | visual feedback loop — Claude can SEE what it built |
| `execute_blender_code` | arbitrary `bpy` — the superset tool; everything else is convenience |
| `set_texture` | apply a downloaded PolyHaven texture set to an object |

### PolyHaven (toggle checkbox in addon sidebar — NO auth, NO key, all CC0)
- `get_polyhaven_status`, `get_polyhaven_categories`, `search_polyhaven_assets`, `download_polyhaven_asset`
- Downloads **HDRIs, PBR texture sets (diffuse/normal/rough/AO/disp), and models** at selectable resolutions (1k–8k).
- **This is the highest-leverage integration for the REF-1 gap**: golden-hour urban HDRIs, asphalt/paver/concrete PBR sets, all CC0 = shippable commercially with zero attribution. We already use `sky_urban_1k.hdr`; the same pipe can pull a warm low-sun HDRI at 2k plus facade/ground texture sets to bake into our kit GLBs.

### Sketchfab (checkbox + API key)
- `get_sketchfab_status`, `search_sketchfab_models`, `get_sketchfab_model_preview`, `download_sketchfab_model`
- Auth: free Sketchfab account → API key in addon prefs or env `BLENDERMCP_SKETCHFAB_API_KEY`. Searches **downloadable** models only.
- **LICENSING CAVEAT (load-bearing for us):** downloadable Sketchfab models are CC-licensed per model — CC-BY requires public attribution wherever reused; **CC-BY-NC forbids commercial use**; ND forbids modification. Sources: https://sketchfab.com/developers/download-api/guidelines , https://support.fab.com/s/article/Crediting-users-for-3D-model-downloads . blender-mcp does not enforce/record the license for you. Verdict: fine for **reference/blockout study**, NOT for shipping assets in a paid product (also collides with ADR-001 de-badging — many models carry real brands).

### Hyper3D Rodin (checkbox; trial key bundled)
- `get_hyper3d_status`, `generate_hyper3d_model_via_text`, `generate_hyper3d_model_via_images`, `poll_rodin_job_status`, `import_generated_asset`
- Two modes: `MAIN_SITE` (hyper3d.ai key, jobs tracked by `task_uuid`) and `FAL_AI` (fal.ai key, `request_id`). Env: `BLENDERMCP_HYPER3D_API_KEY`.
- Trial key = limited generations **per day**, resets daily. Own key costs: fal.ai ≈ **$0.40/generation** (https://fal.ai/models/fal-ai/hyper3d/rodin); hyper3d.ai plans Free → Creator $24/mo → Business $120/mo (https://hyper3d.ai/pricing, https://costbench.com/software/ai-3d-generation/rodin-hyper3d/free-plan/).
- Deemos maintain their own integration notes: https://github.com/DeemosTech/blender-mcp-rodin-integration
- Verdict: keep for **hero one-offs** (we already made the Aurelis GT-E this way). Generated meshes are NOT instancing-friendly kit pieces — always voxel-rebuild/retopo as we did.

### Hunyuan3D (Tencent; two auth modes)
- `get_hunyuan3d_status`, `generate_hunyuan3d_model`, `poll_hunyuan_job_status`, `import_generated_asset_hunyuan`
- Mode 1 `OFFICIAL_API`: Tencent Cloud `SecretId`/`SecretKey` (TC3 signature). Env: `BLENDERMCP_HUNYUAN3D_SECRET_ID/KEY/API_URL`.
  **BROKEN as of mid-2026**: issue #274 — the addon still calls the old `hunyuan` service; Tencent moved to `ai3d` service, API version 2025-05-13, new job names (`SubmitHunyuanTo3DProJob`/`RapidJob`). PR #182 upgrades it but check merge state before relying on it. https://github.com/ahujasid/blender-mcp/issues/274
- Mode 2 `LOCAL_API`: self-hosted Hunyuan3D-2 (`python api_server.py --port 8081`, ~25 GB weights, NVIDIA GPU). Mac/low-VRAM guide: https://github.com/alawrenceld/Hunyuan3D_Blender
- **Security note:** issue #202 — arbitrary file read via `generate_hunyuan3d_model` path handling; treat the addon as trusted-local-only, never expose port 9876 beyond localhost. https://github.com/ahujasid/blender-mcp/issues/202
- Verdict: **skip** (official API broken, local needs a big GPU download; Rodin already covers gen-3D for us).

### Misc
- Anonymous telemetry added recently — disable via consent checkbox or `DISABLE_TELEMETRY=true`.
- Geometry-nodes module exists as PR #92 (not merged mainline): https://github.com/ahujasid/blender-mcp/pull/92

---

## B. Other Blender / 3D MCP servers

### B1. Official Blender Lab MCP (blender.org) — WATCH
- https://www.blender.org/lab/mcp-server/ · source: https://projects.blender.org/lab/blender_mcp (both 403 direct fetch; details cross-checked via devtalk + bridge repo)
- Blender Foundation "Lab" project (Q1-2026 activity report mentions it). Deliberately **minimal**: addon (installed via Edit→Preferences→Extensions, Blender 5.1+) + separate MCP server process. Null-byte-terminated TCP JSON on **localhost:9876 — same port as ahujasid's addon; do not run both simultaneously**.
- Community bridge with tool list: https://github.com/BI-Blitzer/blender-lab-mcp-bridge — 11 tools: `blender_execute`, `blender_get_scene`, `blender_clear_scene`, `blender_create_object`, `blender_add_light`, `blender_set_camera`, `blender_set_material`, `blender_set_keyframe`, `blender_set_render_settings`, `blender_render_frame`, `blender_render_animation`.
- Adds over our setup: nothing today — it is a strict subset of ahujasid minus PolyHaven/Sketchfab/Rodin. But it is the long-term supported path (official, maintained by Blender Lab). **Verdict: skip now, re-evaluate when it grows asset integrations; our Blender 5.1.2 already meets its 5.1+ floor.**

### B2. PatrykIti/blender-ai-mcp ("Blender AI MCP") — SKIP (for us)
- https://github.com/PatrykIti/blender-ai-mcp · https://mcpservers.org/servers/patrykiti/blender-ai-mcp
- 212 tools / 22 categories, atomic+macro+workflow layers, goal-first router (`router_set_goal()`), JSON-RPC addon on port 8765, FastMCP 3.2, Docker option, Blender 4.0+/Py 3.11+, Apache-2.0.
- Pitch: "stable tool API instead of ad-hoc Python generation" — measurement/assertion tools, cutout/recess/align/symmetry macros, versioned surfaces. Genuinely the most production-shaped third-party option.
- Adds over ours: reliable structured modeling ops instead of fragile generated `bpy`. But our generators are already **scripted, versioned .py files** — we don't suffer the ad-hoc-code problem it solves, and 212 tools is heavy context. **Verdict: skip; revisit only if interactive Claude-driven modeling sessions become a bottleneck.**

### B3. sandraschi/blender-mcp — SKIP
- https://github.com/sandraschi/blender-mcp — FastMCP fork, 41 "portmanteau" tools / 150+ ops, VRM avatars, Gaussian splats, VSE, Grease Pencil. Interesting scope, single-maintainer fork, nothing our lane needs.

### B4. Tripo (VAST-AI) — official MCP + Blender addon — BENCH (backup gen-3D)
- https://github.com/VAST-AI-Research/tripo-mcp (alpha, ~15 tools) + https://github.com/VAST-AI-Research/tripo-3d-for-blender
- Text/image/multiview→model, rig+animate, imports straight into Blender; needs Tripo API key. Community Claude-Code variant produces game-ready .glb: https://lobehub.com/mcp/beldangi-fax-machine-tripo-mcp-claude-godot
- Adds over Rodin: rigging/animation of characters (pedestrians!). **Verdict: bench — if we need animated pedestrians for the promenade, Tripo's rig+animate path is the fastest route; otherwise skip.**

### B5. Meshy — official MCP — BENCH (texturing angle)
- https://github.com/meshy-dev/meshy-mcp-server (`@meshy-ai/meshy-mcp-server` via npx, env `MESHY_API_KEY`, key from https://www.meshy.ai/settings/api, test-mode dummy key `msy_dummy_api_key_for_test_mode_12345678` burns no credits).
- Tools: `meshy_text_to_3d`, `meshy_image_to_3d`, `meshy_multi_image_to_3d`, `meshy_text_to_3d_refine`, `meshy_remesh`, **`meshy_retexture`** (AI-texture an EXISTING mesh), `meshy_rig`, `meshy_animate`.
- Free tier: 200 credits/mo, no card — **but non-commercial license on free tier**; mesh gen ≈5 credits, texturing ≈10 credits. https://www.meshy.ai/pricing
- Adds over ours: `retexture` could AI-skin our procedural facade boxes. Tempting but output is albedo-baked, style-inconsistent across a kit, and paid-tier for commercial. **Verdict: bench; PolyHaven PBR + our own baking is more controllable and free.**

### B6. Others surveyed and rejected
- CommonSenseMachines CSM MCP (https://mcpservers.org/servers/CommonSenseMachines/blender-mcp) — text/image 3D editing via CSM Cube; another paid gen-3D, no unique angle for us.
- Snyk survey of 6 gen-3D MCPs (Revit, AutoCAD LT, SketchUp, Rhino, Thingiverse, BlenderMCP): https://snyk.io/articles/6-mcp-servers-for-using-ai-to-generate-3d-models/ — CAD/print oriented, none relevant.
- Comparison of gen-3D quality (Meshy 5 vs Rodin Gen-2 vs Tripo P1 vs CSM Cube 2, Apr-2026): https://www.strayspark.studio/blog/generative-3d-tools-comparison-meshy-rodin-tripo-csm-2026 — all now near-game-ready; Rodin (which we have) is competitive, no reason to switch.

---

## C. Claude Code skills / plugins for 3D & asset pipelines

### C1. elithril/blender-kiln — ADOPT-PARTS (read, don't install wholesale)
- https://github.com/elithril/blender-kiln — MIT, 5★, ~3,225 lines of pipeline docs, 26 "iron rules".
- A Claude Code **skill** that orchestrates exactly our stack: Blender MCP (port 9876) + AI gen (Hunyuan3D via free HF Spaces `gradio_client`, or local) + PolyHaven/Sketchfab sourcing + **gltf-transform Draco** + **gltfpack LOD** → GLB/FBX/USDZ.
- Pipeline: CONFIG → BRIEF → SOURCE → IMPORT → CLEANUP → TEXTURING → OPTIMIZE → EXPORT, with viewport-screenshot validation checkpoints at each phase and a **material audit that detects procedural nodes that won't survive glTF export and proposes baking** — precisely our failure mode (procedural Blender materials flattening to grey in the web build).
- Install: `npx skills add blender-kiln` or clone to `~/.claude/skills/blender-kiln/`.
- Verdict: **adopt its checklist ideas** (material audit → bake, per-phase screenshot validation, export rules) into our own project skill; wholesale install optional. Its Hunyuan-via-HF-Spaces route is also the only FREE gen-3D backend found (no Tencent keys), if the Rodin trial runs dry.

### C2. rawwerks/gltf-transform skill — ADOPT
- https://smithery.ai/skills/rawwerks/gltf-transform · https://mcpmarket.com/tools/skills/gltf-transform-3d-optimizer
- Wraps the gltf-transform CLI (via bunx): Draco + Meshopt, mesh `simplify`, texture resize (Sharp), WebP, **KTX2/Basis (UASTC + ETC1S)**, merge/instance ops.
- Reality check for our repo: gltf-transform's `etc1s`/`uastc` commands shell out to **`toktx` from KhronosGroup/KTX-Software — which we don't have installed** (noted in context). The skill codifies commands but cannot conjure the binary. Action: install KTX-Software release (Windows installer from https://github.com/KhronosGroup/KTX-Software/releases) → `toktx` on PATH → our existing gltf-transform step gains KTX2, the single biggest texture-VRAM win for phone targets (ADR-005).
- Verdict: **adopt** (skill + install toktx). Meanwhile WebP via Sharp works TODAY with no new binary — decent interim texture compression.

### C3. freshtechbro/claudedesignskills marketplace — ADOPT 2 PLUGINS
- https://github.com/freshtechbro/claudedesignskills — 27 plugins for web-3D. Install: `/plugin marketplace add freshtechbro/claudedesignskills` then:
  - `/plugin install react-three-fiber` — R3F architect agent + scene/component generators (declarative patterns, perf).
  - `/plugin install blender-web-pipeline` — **Blender→web export workflow: glTF export settings, model optimization, LOD generation**, `/blender-web-pipeline-batch_export`, `/blender-web-pipeline-optimize_model`. Directly our lane.
- Verdict: adopt `blender-web-pipeline` + optionally `react-three-fiber`; skip the rest of the bundle.

### C4. emalorenzo/three-agent-skills — ADOPT (cheap, high value)
- https://github.com/emalorenzo/three-agent-skills — 2 SKILL.md files, 70+ rules for Three.js/R3F/Poimandres ecosystem (e.g. never setState in `useFrame`, instancing patterns, draw-call discipline). Install: `cp -r three-agent-skills/skills/* ~/.claude/skills/`.
- Verdict: **adopt** — directly protects the 60fps constraint while we pile on materials/postprocessing.

### C5. Surveyed, lower priority
- Snyk roundup (source for several above): https://snyk.io/articles/top-claude-skills-3d-modeling-game-dev-shader-programming/ — **caveat from same article: 13% of tested community skills had critical security flaws; review SKILL.md + bundled scripts before install.**
- majiayu000/claude-skill-registry (78★): `3d-modeling` (topology/UV/LOD/export "battle scars") and `shader-techniques` (GLSL cost tables) skills — nice reading, generic, not Blender-pipeline-specific. SKIM.
- DavinciDreams/Agent-Team-Plugins — 9 skills + 7 subagents full 3D team; Unity/Unreal-export oriented, 1★. SKIP.
- Jeffallan/claude-skills game-developer (403★) — Unity/Unreal/Godot engines, not web. SKIP.
- Andrew1326/dominations blender-3d-modeling skill, phuetz/code-buddy blender automation skill — bpy/bmesh templates + headless batch-render recipes; we already have working headless scripts. SKIP.
- Blender 3D Game Asset Pipeline / Blender Toolkit / Blender 3D Animation Studio on mcpmarket.com — Godot-targeted or animation-retarget focused. SKIP.
- clawd-maf/cad-agent — 3D printing/build123d. SKIP.

---

## D. Recommended adoption plan (quality-gap mission)

1. **Exploit what's installed first.** blender-mcp PolyHaven tools are the direct fix for "flat untextured buildings / uniform ground / washed-out lighting": pull a golden-hour urban HDRI (2k) + asphalt/paver/concrete/plaster PBR sets (1k–2k), bake into kit textures in the headless generators. CC0 = zero licensing risk.
2. **Install KTX-Software (toktx) + rawwerks gltf-transform skill** → KTX2/Basis in the existing gltf-transform step; WebP-via-Sharp as the interim.
3. **Add `blender-web-pipeline` plugin + `three-agent-skills`** — export discipline + R3F perf rules (one marketplace add, one repo copy).
4. **Steal blender-kiln's material-audit/bake checklist** into a project skill: "no procedural-only materials past export; screenshot-validate each phase."
5. **Rodin stays** the hero-asset generator (own fal.ai key at ~$0.40/gen when the trial caps out). **Sketchfab = reference only** (CC attribution/NC + real-brand ADR-001 risk). **Hunyuan official API is currently broken** in blender-mcp (issue #274); free fallback = blender-kiln's HF-Spaces route.
6. **Don't switch MCP servers.** Official Blender Lab MCP is a minimal subset (watch it; same port 9876 — never run both addons at once); blender-ai-mcp solves a problem (ad-hoc bpy fragility) our versioned scripts already avoid.
7. **Security hygiene:** keep port 9876 localhost-only (file-read vuln #202), set `DISABLE_TELEMETRY=true` if telemetry is unwanted, review any community SKILL.md before install.
