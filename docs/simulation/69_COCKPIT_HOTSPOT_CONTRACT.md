# Cockpit hotspot contract (A2 performed pre-drive ⇄ A3 interior model)

The Alpha "performed pre-drive" (doc 68, A2) raycasts clicks against named meshes in the
cockpit. The interior (procedural VitokCockpit today; the authored GT-E interior when A3
lands) must expose these **exact node names**. The procedure machine + input keys drive the
same `DrivelineState`/`CabinControls` transitions (A1), so hotspots and keyboard are
equivalent inputs — clicking the starter and pressing E do the same thing.

| Node name | Control | State it drives |
|---|---|---|
| `hotspot_engine_start` | starter button (dash, right of wheel) | `engineOn` toggle |
| `hotspot_belt` | seat-belt buckle (left of seat) | `seatbeltOn` |
| `hotspot_gear_selector` | console selector | `selector` P→R→N→D cycle (click = next; right-click/long-press = prev) |
| `hotspot_parking_brake` | console parking-brake switch/lever | `parkingBrakeOn` toggle |
| `hotspot_indicator_stalk` | left stalk | indicator left/off/right cycle |
| `hotspot_wiper_stalk` | right stalk | `wipersOn` toggle |
| `hotspot_headlights` | dash rotary left of wheel | headlights off→low→high cycle |
| `hotspot_hazard` | red triangle button, center dash | `hazardsOn` toggle |
| `hotspot_horn` | steering-wheel center pad | horn (momentary) |
| `hotspot_mirror_left` / `hotspot_mirror_right` / `hotspot_mirror_rear` | mirror surfaces | mirror glance events (already graded) |
| `hotspot_fog` | dash switch cluster | `fogOn` toggle |

Rules:
- Hotspot nodes are **invisible-friendly**: they may be the visible control mesh itself or a
  slightly larger invisible proxy box parented to it (better touch targets on phone — P1).
- Names are load-bearing; the raycaster resolves `object.name` (walk up parents until a
  `hotspot_*` match). Anything else in the cockpit is inert.
- The interior must keep these meshes SEPARATE (not merged into the dash bake).
- Hover affordance: A2 renders a subtle highlight on the hovered hotspot + a Bulgarian
  tooltip (control name), so discoverability never depends on the checklist text.
