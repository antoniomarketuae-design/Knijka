# Hero car — Rodin build brief (execution cheat-sheet)

Distilled from [docs/simulation/67_HERO_VEHICLE_SPEC.md](../../docs/simulation/67_HERO_VEHICLE_SPEC.md) (570 KB — don't re-read it whole).
Path chosen 2026-07-09: **generate via Rodin (Hyper3D) through the Blender MCP**, then clean → rig → optimize → wire into the sim.
Prereq: Claude Code restarted, `blender` MCP approved, `mcp__blender__*` tools live, Hyper3D key set in the addon panel.

## What we're making
Fictional, **unbadged** (ADR-001) latest-gen **luxury performance sedan** — the "Aurelis GT-E". Four-door notchback with a
fastback-influenced roofline, short faired rear deck, wide track, large wheels filling the arches (small gap), subtle forward lean.
Reads instantly as *expensive, fast, modern*. **Athletic, not aggressive; calm expensive surfaces, not aero-riced.**

## Hard geometry (mm) — calibrate proportion, don't model a real car
| L | W (excl. mirrors) | H | Wheelbase | Track F / R | Front / rear overhang | Ground clearance |
|---|---|---|---|---|---|---|
| 5180 | 1975 | 1455 | 3050 | 1680 / 1700 | 920 / 1210 | 120 |

Low + coupe-like. Pivot at contact-patch centre (mid-wheelbase, ground plane), **+Y = front**, Z up (Blender). Export **Y-up** for Three.js.

## De-badge rules (ADR-001 — non-negotiable)
No real logos, no maker emblem, **no kidney/twin-kidney grille**, no trademarked headlight/taillight signature.
Use generic forms: clean intake mesh, a **single full-width LED light bar** front and rear, plain machined wheels.
If Rodin bakes anything brand-like into the mesh or texture, delete/repaint it.

## Rodin generation
- Prefer **text→3D** with the descriptors above (safer for ADR-001 than image→3D of a real car).
- If the founder supplies a reference, it must already be **fictional/unbadged** — image→3D of a real car reproduces protected design.
- Rodin output is organic & dense: expect to **de-badge, retopo/decimate, re-pivot, and re-material**. Honest: AI-3D is hit-or-miss on cars.

## Real-time web target (spec §13.4 — authoritative; overrides older ~55-80k note in memory)
- **Player hero car ships LOD2 as its top LOD ≈ 120–150k tris** incl. wheels + simplified interior. Auto-drop to **LOD3 ~30k** in chase-cam far.
- **LOD0/LOD1 never ship to web** — marketing/turntable only.
- **Interior:** single merged shell **~40–60k tris**, drawn only in cockpit/interior camera, **culled in exterior/chase views**.
- **Per wheel (mid-range):** rim ~4–8k, tire ~3–5k, rotor+caliper ~2–4k → **~12–18k tris/corner**; 3–4 material IDs.
- Silhouette-preserving decimation: screws/badges drop first; roofline, glass shape, wheel silhouette, lamp signature drop last. Normal-map the panel gaps.

## Rig (must match the sim's TrafficLayer / player controller)
- **4 wheels = separate named empties + meshes: `wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`**. Spin axis **local X**. Fronts steer.
- Body is one welded shell. Glass a single-sided shell. Keep haunch swell + shark-fin as real geometry (silhouette-critical).

## Materials (PBR, keep it lean)
deep-gloss metallic paint (clearcoat), tinted glass (single-sided), chrome/satin trim, black plastic, tire, machined alloy,
brake rotor (+ subtle glow), red caliper, emissive DRL/tail bars. ~one 2K albedo/ORM atlas class per group.

## Finish pipeline (every authored GLB — this is the ship gate)
1. Export GLB from Blender (`use_selection`, `export_yup=True`, wheels stay separate named nodes).
2. **Optimize:** `node tools/glb/optimize.mjs <in>.glb platform/public/sim/vehicles/hero_car.glb`
   (dedup→weld→prune→resample→KTX2/webp→Draco). Draco decode already wired in `platform/src/modules/sim/world/components/gltfLoader.ts`.
3. Drop into the sim as the cockpit-first **player** car; verify wheels steer/roll and it loads inside the phone budget.

## Fallback
If Rodin can't produce a usable body: rebuild procedurally (see `hero_car.py`, attempt 1 was a box+subsurf blob — needs a
profile-driven silhouette, correct spec dims above, fixed wheel placement) or source a cheap game-ready CC0/marketplace sedan.
