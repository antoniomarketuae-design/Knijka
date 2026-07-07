# Tech Stack Evaluation

> Status: v1.0 — 2026-07-07. Simulator stack evaluated by dedicated research (2025–2026 sources, URLs inline). Decision recorded as **ADR-005** in [07_ARCHITECTURE_DECISION_RECORDS.md](07_ARCHITECTURE_DECISION_RECORDS.md). Platform (Track A) stack section at bottom.

## Decision Summary (simulator)

| Layer | Choice | Why |
|---|---|---|
| Engine | **Three.js (WebGPURenderer + WebGL2 fallback) + react-three-fiber + drei** | MIT; largest community & AI-codegen corpus (our force multiplier); native Next.js/React fit; WebGPU production-ready since r171; 10-year-safe |
| Physics | **Rapier (WASM) `DynamicRayCastVehicleController`** via react-three-rapier | Built-in raycast vehicle (suspension, per-wheel); official three.js example exists; Apache-2.0; very active (2025 focus on WASM perf) |
| City pipeline | **Hybrid OSM:** OSMnx-extracted Sofia road graph (topology, signals) → procedural road meshes + decal lane markings in-engine; Blosm/Roadscape offline bake as fallback; OSM-footprint extruded buildings; hand-polish the ~8 lesson intersections | No tool auto-generates game-quality intersections from OSM; hybrid keeps real Sofia street layout with controllable quality |
| Assets | **Kenney CC0 kits** (City Kit Roads, Car Kit, building kits) + one hero cockpit (Sketchfab CC0 or ~$100 royalty-free) + generated SVG Vienna-convention sign faces | CC0, glTF-ready, coherent style; archive all Sketchfab assets now (Fab migration will end downloads) |
| Delivery | **Browser** (embedded in the platform), not desktop download | Distribution math wins: no SmartScreen/Gatekeeper/school-IT friction; "click a link, drive in 10 seconds" is the wedge. slowroads.io & Madalin Stunt Cars prove the browser ceiling is sufficient |
| Fallback | **Unity 6 Web + NWH Vehicle Physics 2 (~€55)** | Switch trigger: if by ~hour 40 the Rapier car doesn't feel credible or the city pipeline stalls. Costs: 30MB+ loads, proprietary license, clunky React embed, weaker AI-assisted iteration |

## Engine Comparison (evaluated 2026-07)

| Criterion | Three.js + R3F | Babylon.js | PlayCanvas | Unity 6 Web | Godot 4 Web |
|---|---|---|---|---|---|
| City rendering | Excellent (PBR, shadows, postprocessing) | Excellent, batteries included | Very good | Best raw fidelity | Weakest on web |
| WebGPU | **Production (r171+, WebGL2 fallback)** | Shipping, mature | Shipping | Experimental | Not meaningful |
| Bundle | ~0.6–1 MB core gz | ~1.5–4 MB | ~1.3 MB | **Tens of MB** | ~35–50 MB wasm |
| License | MIT | Apache-2.0 | MIT (editor OSS 2025) | Proprietary (Runtime Fee cancelled; Personal free < $200k) | MIT |
| Community/longevity | Dominant (~113k stars) | Microsoft-backed | Snap-backed, smaller | Huge; corporate-risk history | Big engine, weak web |
| React/Next fit | **Native (R3F)** | Manual canvas | iframe | iframe + bridge | iframe |
| LLM codegen | **Best of any 3D lib** | Good | Moderate | Good C#, weak web-export corpus | Moderate |
| Solo sim feasibility | Proven (slowroads.io) | Proven | Plausible | Proven but heavy | Poor (no C# web export; single-threaded default) |

## Physics Comparison

- **Rapier** — recommended. Vehicle controller built-in; [official three.js example](https://threejs.org/examples/physics_rapier_vehicle_controller.html); pmndrs ecctrl ships car controllers; Apache-2.0; active.
- **Jolt (WASM)** — best-in-class vehicle sim (AAA pedigree, WheeledVehicleController, maintained JS port with vehicle demo); MIT. **Upgrade path if Rapier feel disappoints.**
- **Havok (Babylon, MIT wasm)** — fast but no built-in vehicle controller; only relevant with Babylon.
- **cannon-es** — legacy (Bruno Simon era); not the 10-year bet. **ammo.js** — frozen; avoid.
- **Custom physics (slowroads-style)** — beautiful but a multi-year artisan effort with no collisions; not viable for collision-based lesson scoring in 120h.

## Reference Points (browser ceiling, verified)

- [slowroads.io](https://slowroads.io) — Three.js, solo dev, infinite terrain, day/night/weather, 60fps on modest hardware.
- [Madalin Stunt Cars](https://www.crazygames.com/game/madalin-stunt-cars-2) — solo dev, Unity WebGL, 34 cars, multiplayer, runs on Chromebooks.
- **No polished browser driving-school sim with cockpit view + traffic-rule scoring exists — that's our open lane.**

## Honest 120-Hour Output Assessment

One ~1 km² Sofia-inspired district (real street topology, simplified visuals) · tuned arcade-realistic car with functional cockpit (wheel + speedometer; mirror *glance views*, not real-time RTT reflections at first) · scripted spline traffic obeying lights at ~8 intersections · day/night + rain with reduced grip · 60fps on Iris Xe-class laptops. Look: **polished stylized indie**, not photoreal — the correct target for an educational tool. Rough split: 15h scaffold · 25h vehicle feel · 35h city pipeline · 20h traffic/signals · 15h weather/lighting · 10h cockpit/UI.

**Top schedule risks:** cockpit asset gap (budget 10–15h or ~$100) · intersection/lane-marking generation (cap via hand-fixing few intersections) · Rapier feel tuning (plan 8–10h).

## Platform Stack (Track A) — proposed, to finalize as ADR-006

Next.js (React, TypeScript) + Tailwind · PostgreSQL (managed) + Prisma/Drizzle · Auth.js or managed auth · Stripe payments · Claude API for tutor/debrief layer (per ADR-002 hybrid) · PWA for app delivery at launch, Capacitor wrappers post-sprint. Rationale: same language/ecosystem as the sim (one brain, one repo), best AI-codegen support, boring-and-durable infra. Alternatives and full criteria to be recorded when ADR-006 is written at build kickoff.
