# 3D asset licenses

Every binary asset under `public/models/` is listed here with its origin and
license. Per ADR-001 all vehicles are FICTIONAL — no real manufacturer marks.
Our learner car is branded „Виток" (a Bulgarian river), an in-house fictional
model name applied to a stylized CC0 base mesh.

| File | What | Source | Author | License | Added |
| --- | --- | --- | --- | --- | --- |
| `vitok/vitok-body.glb` | „Виток" hatchback exterior body (source file `hatchback-sports.glb`, baked wheel nodes hidden at runtime) | [Kenney Car Kit 3.1](https://kenney.nl/assets/car-kit) | Kenney (kenney.nl) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 2026-07 |
| `vitok/vitok-wheel.glb` | Wheel model, instanced ×4 and bound to the physics wheel transforms (source file `wheel-dark.glb`) | [Kenney Car Kit 3.1](https://kenney.nl/assets/car-kit) | Kenney (kenney.nl) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 2026-07 |
| `vitok/Textures/colormap.png` | Shared palette texture referenced by both `.glb` files (relative URI `Textures/colormap.png`) | [Kenney Car Kit 3.1](https://kenney.nl/assets/car-kit) | Kenney (kenney.nl) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 2026-07 |

Total binary payload: ~0.23 MB (budget: ≤ 8 MB).

Notes:

- CC0 requires no attribution; we credit Kenney voluntarily.
- The cockpit interior (dashboard, instruments, steering wheel, seats,
  mirrors) is built procedurally in code (`src/components/sim/vitok/`) — no
  binary assets, no license obligations.
- The `.glb` files reference the palette texture by RELATIVE uri
  (`Textures/colormap.png`) — keep the `Textures/` folder next to them.
