# 73 — Cockpit Detail Spec (hero_interior_v3)

**Status:** buildable spec, research-backed (A2 mega-program lane, 2026-07-12).
**Feeds:** the v3 rebuild of `tools/blender/hero_interior_v2.py` output (`platform/public/sim/vehicles/hero_interior.glb`, currently 21.6k tris / 96 KB Draco / 6 materials).
**Governing contracts (all inherited, none may regress):**

- **World-first camera contract** — ≥65% of the cockpit frame = world; cowl line ≤0.33 of frame height; header ≥0.97/out of frame; horizon 0.55–0.62. Pinned by `platform/src/modules/sim/vehicle/cockpit-camera-contract.test.ts`. **This spec moves ZERO contract landmarks** — every element below is placed outside the protected windshield band or below the cowl line, with the check shown per element.
- **Doc-69 hotspot contract** — all 13 `hotspot_*` nodes + `screen_cluster`/`screen_center` + the `steering_wheel` hierarchy survive, names load-bearing, control meshes separate from the dash bake.
- **Budgets** — ≤45k tris, ≤8 materials (6 existing + max 2 new), ≤250 KB Draco.
- **North star** — every element either (a) is a control the Bulgarian pre-drive/exam actually exercises, (b) anchors an existing hotspot visibly, or (c) is a cheap realism cue that makes the cabin read like the real cars learners will drive. Nothing decorative that costs sightline.

---

## 1. Coordinate frames & the v2 datum

**Chassis-local** (all placements in this doc): +X = car-left, +Y = up, +Z = forward, metres. Road plane at y −0.49.
**Blender build frame** (for the v3 script): `bx = −chassisX, by = chassisZ, bz = chassisY + 0.55` (VitokCockpit mounts the GLB yaw-π, y −0.55 — the mount is untouchable).

v2 datum surfaces (from `tools/blender/hero_interior_v2.py`):

| Datum | Chassis definition |
|---|---|
| Driver eye (DEP) | (0.34, 0.66, 0.12) — SAE eye 1.15 m above road |
| Shipped camera | (0.24, 0.71, −0.255), pitch −5°, vFOV 47 @ 16:9, hFOV 75.41° |
| Cowl/scuttle slope | for z ≥ 0.95: y ≤ 0.41 − (z − 0.95)·0.30 |
| Binnacle hood cap plane | y ≤ 0.486 − (z − 0.67)·0.24 (x −0.12…−0.56 blender = chassis 0.12…0.56) |
| Contract cowl landmark | (0.24, 0.48, 0.70) → frame y 0.327 |
| Centre-stack bezel cap | y ≤ 0.45 (chassis x −0.20…0.23) |
| Header strip (glass top) | y 0.850–0.880, z 0.06–0.16 |
| Headliner slab | y 0.857–0.885, z −1.02…0.08 |
| A-pillars | 6.5×7.5 cm beams, (±0.76, 0.395, 1.00) → (±0.72, 0.86, 0.11) |
| Steering wheel | node (0.34, 0.30, 0.52), disc tilted 26° from vertical (column axis (0, 0.44, 0.90)n), rim R 0.2045 — **contract landmark, do not resize** |
| Cluster screen | screen_cluster centre (0.34, 0.399, 0.7106), 0.30×0.15 quad |
| Centre screen | screen_center top edge ≈ y 0.44 (dropped 9.5 cm in v2) |
| Interior mirror | glass (0, 0.803, 0.50); housing (±0.085, 0.79–0.85, 0.475–0.560); stalk from header |
| Door mirror glass (L) | (0.905, 0.455, 0.592); sail panels |x| > 0.86 kept intact by the cowl clamp |
| Hotspot controls | per `platform/src/components/sim/vitok/hotspots.ts` (engine start (0.095, 0.34, 0.757); hazard (0, 0.338, 0.752); headlights (0.655, 0.342, 0.71); fog (0.585, 0.328, 0.723); stalks (0.48 / 0.20, 0.327, 0.587); horn (0.34, 0.281, 0.50); selector (0, 0.178, 0.43); park brake (0.093, 0.144, 0.35); belt (0.135, 0.05, −0.22)) |

Existing materials: `int_dark, int_leather, int_alu, int_accent, int_gloss, int_seat` (solid-colour PBR + baked 1024² AO atlas on uv1 via `hero_interior_ao_bake.py`; no albedo textures — **detail must be geometry + AO, not texture**).

---

## 2. Visibility model — what "driver-visible" means here

There is **no free look**. The camera has exactly four poses: rest, and three held mirror glances (`CameraRig.tsx GLANCE_OFFSETS`): left yaw +38.4° pitch −8.6°, right yaw −53.3° pitch −5.2°, rear yaw −16.0° pitch +3.4° (composed on the −5° base). G-motion adds ≤~2° transient pitch. Everything outside the union of these four frusta is **invisible and must not be built** (it would cost tris for nothing).

**Rest view** (bottom ray 28.5° below horizontal, top ray 18.5° above, half-hFOV 37.7°):

- Lowest visible y at forward z: `y_vis(z) = 0.71 − 0.5430·(z + 0.255)` → z 0.43 → 0.34 · z 0.50 → 0.30 · z 0.60 → 0.25 · z 0.70 → 0.19 · z 0.80 → 0.14 · z 0.90 → 0.08.
- Horizontal: visible iff `|x − 0.24| ≤ 0.7733·(z + 0.255)` → at the dash face (z 0.70) x ∈ [−0.50, 0.98]: the **passenger third of the dash is off-frame at rest**.
- So the rest-visible interior is: dash face full driver-to-centre width, cluster + hood, upper ~40% of the wheel, both stalks, headlight/fog/start/hazard controls, centre screen + stack top, left A-pillar + door-mirror sail, left door forward sliver (z ≳ 0.45), interior-mirror housing (upper-right).

**Left glance** adds: left door card down to y ≈ −0.10 for z 0.2–0.5 (window-switch pod, armrest, release handle, woofer grille top, pocket lip, sill trim), left grab-handle zone (marginal).
**Right glance** adds: full centre stack + passenger dash + glovebox seam + right outboard vent, right A-pillar + right door forward section, passenger seat, console **only above y ≈ 0.30 at z 0.43** (projection-checked).
**Rear glance** adds: header strip underside, mirror housing/stalk, top ends of both A-pillars, visor leading edges (marginal).

> **Finding (flagged, not fixed here):** the console hotspots — gear selector (top y 0.248), parking brake (0.184), belt buckle (0.115) — sit **below the frame bottom in all four camera poses**. Students click invisible proxies. §5 P2-1 raises the console deck so selector + EPB become right-glance visible; the belt buckle stays invisible (omission §8) until a pre-drive look-down pose exists.

**Sightline-safety rule for every new element** (the "never re-block the view" law):

- Protected band: at rest, nothing new may project above the **cowl ray** `y_cowl(z) = 0.71 − 0.2408·(z + 0.255)` anywhere inside the horizontal frustum, with 10 mm margin. Lookup (max allowed y): z 0.40 → 0.54 · 0.50 → 0.52 · 0.60 → 0.49 · 0.70 → **0.47** · 0.80 → 0.45 · 0.90 → 0.42 · 1.00 → 0.40.
- OR the element attaches to header/headliner **above the top-frame ray** `y_top(z) = 0.71 + 0.3346·(z + 0.255)` (out of frame at rest, e.g. grab handles, overhead console).
- The grandfathered mirror housing zone (fx ≥ 0.6, fy > horizon) may be **dressed but never enlarged**.
- The A-pillar cross-section (6.5×7.5 cm) is **frozen** — real pillars are ~90–100 mm with trim, but widening them eats world %. Detail goes *inside* the section (chamfer, base pod), never outside.

---

## 3. Real-car research digest (three types, per doc 70 REF 4's brief)

Full research: three parallel deep-dives (luxury sedan = Mercedes E W214/S W223/BMW G60; mainstream compact = Golf Mk8/Octavia Mk4/Corolla E210 — what Bulgarian learners actually train in; boxy luxury SUV = G-Class W463A/W465 + SAE packaging standards). Key transferable facts:

**Luxury sedan signatures** (what makes a cabin read premium at a glance):
1. **The continuous ambient light line** — one unbroken lit contour sweeping dash → into both doors (W214 Active Ambient: ~190 LEDs in a single arc; BMW: crystalline Interaction Bar). Highest-value single cue in a cockpit render.
2. **Free-standing flush glass screens** — zero-bezel black-glass slabs (W214 cluster is unhooded, canted ~5–8° to driver), gloss black-panel surround so off-screens disappear.
3. Column layout: W214 single combo stalk left (indicators + wipers via end collar) + column gear stalk right; cruise moved onto wheel touch pods (~45×35 mm gloss panels per spoke). Wheel Ø 370–380 mm, rim section ~29×42 mm oval, chrome ~55 mm centre emblem.
4. W214 vents = slim full-width band under the cowl edge; the *iconic* round **turbine vents** (~95–100 mm chrome ring + radial fins + centre hub bullet) belong to W213/W206/**G-Class**. Rear-view mirror: frameless ~250×70 mm slab. Visors ~400×140 mm with lit vanity. Burmester-style laser-drilled metal speaker grilles. Seat-pictogram adjust buttons high on the door card. Suspended pedals + brushed caps with rubber studs (AMG line). Belt: B-pillar D-ring on 60–80 mm slide adjuster.

**Mainstream compact facts** (the learner's muscle memory — controls follow these):
1. **Stalks:** exposed 100–110 mm, root Ø 16–18 → 10–12 mm taper, flattened paddle end ~32×18×10 mm; raked ~10–15° down and toward the driver; two-stage travel (lane-change detent ~5–7°, latch ~15–20°); VW wiper stalk carries an end button (trip) + INT slider; Toyota puts the light ring ON the left stalk, VW/Škoda use a **dash rotary/panel left of the wheel ~100×70 mm, knob Ø ~35 mm** — exactly our `hotspot_headlights` position, keep VW-style.
2. Wheel Ø 368–375, rim ~30–34 mm; centre pad ~180×130 = whole-pad horn. Column clamshell ~220 mm long, ~90 mm tall, 8–12 mm daylight gap to hub, adjust lever underneath.
3. Corolla-style **binnacle hood brow** (~120–150 mm overhang, matte grain) vs Golf's minimal brow — we keep a shallow brow (our hood cap plane is already shaved; see P1-5).
4. Hazard button: physical, high on the centre stack (matches our (0, 0.338, 0.752)). HVAC: Corolla 3 rotary knobs (temp knob ~40 mm with centre button) — physical HVAC is the ergonomic *and* teaching-friendly choice (doc 67 §9.6.5 agrees).
5. Console: DSG-era stubby shift-by-wire selector (~50 mm tall) + EPB switch (~20×40 mm, P glyph) — matches our `gearStep`/`parkingBrakeToggle` semantics. (Manual lever + handbrake would contradict the shipped P-R-N-D driveline.)
6. Door: window-switch pod ON the armrest (4 rockers + lockout), mirror 4-way knob forward of it, 155–165 mm woofer low in the door, 1 L bottle pocket. Belt webbing 46–48 mm; buckle on ~200 mm semi-rigid stalk, red button up.
7. Pedals: brake pad ~100×54 mm (auto), accel-brake gap ~70 mm, dead pedal left. Interior mirror ~240×60–70 mm with day/night flip tab. Visors ~300×130×12 mm. Grab handles ~250 mm, damped.
8. **Bulgarian exam pre-drive** (rta.government.bg methodology): seat → mirrors (interior + both exterior) → belt → headrest; in-drive: indicators, handbrake hill start, wipers, lights, horn. Every one of these maps to an existing hotspot — the detail pass must make each of them *visibly findable*.

### 3.1 Boxy luxury SUV (G-Class W463A/W465) — what transfers

1. **Four round turbine vents** (~100 mm chrome bezels, shape echoing the round headlamps; W465 adds lit surrounds) — adopted directly as P1-6 (outboard pair; the centre pair becomes our W214-style blade band to protect the cowl line).
2. **Passenger dash grab handle** — the one heritage part Mercedes never deleted: a ~300–350 mm horizontal bar, grip Ø ~30 mm, standing ~50 mm off the dash FACE at vent height (the airbag deploys above it). Because the real bar mounts mid-height on the fascia — not on the dash top — our below-cowl placement (P3-7) is actually the authentic one.
3. **Diff-lock switch trio** (three ~40×40 mm chrome-framed squares top-centre with status LEDs) — the position (above the centre vents) is exactly the strip our contract forbids; the *flavour* (a chrome-framed switch group with lit status) is folded into the P1-8 HVAC row instead.
4. **Exposed aluminium door lock pins** on the door-card sills (rifle-bolt locking) — noted as a future door-card accent (the beltline sill trim P1-15 reserves the spot); not built now (lock state isn't simulated).
5. **Header-mounted rear-view mirror on a long arm** — the G mounts the mirror off the header because its windshield is too upright for a glass mount. Our 2026-07-11 black-mass fix landed on the same architecture independently; the G validates it as real-car practice.
6. Upright cabin, flat shallow dash top, view down the flat hood — the GT-E's v2 aperture already delivers this geometry.

### 3.2 Packaging-standards cross-check (SAE J1100/J941, FMVSS, ECE — our datum vs the norms)

| Quantity | Standard/typical | Ours | Verdict |
|---|---|---|---|
| Eye above H-point (J941) | ~635 mm at 25° back angle | DEP y 0.66 ≈ SAE eye 1.15 m above road | ✓ by construction (lane 12 §5) |
| Wheel centre vs eye | hub ~250–400 mm below eye, 400–500 mm fwd of SgRP | 360 mm below DEP, 400 mm fwd | ✓ mid-band |
| Wheel Ø (J1100 W9 &lt;450 mm; real 350–400) | 370–380 mm luxury | 409 mm | high side but in class; frozen (contract landmark) |
| Wheel plane angle from vertical (H18) | sedans 20–30° | 26° | ✓ |
| Dash top below eye | 200–250 mm | 180 mm | slightly high; contract-fixed, compensated by the raised camera |
| Mirror glass size / position | ~250×55–70 mm; bottom edge 50–100 mm above eye; eye distance 500–700 mm | 0.30×0.13 proxy at +143 mm above eye, ~0.79 m | ✓ (marginally far — a −5 cm stalk shortening is allowed within the fx 0.6–0.95 band if A3 wants) |
| A-pillar obstruction (ECE R125 ≤6° binocular) | real cars 4–6° | 65 mm section at ~0.95 m ≈ 3.9° monocular | ✓ better than real — another reason the section stays frozen |
| Visor panel | 280–330 × 110–140 × 15–25 mm | 330×160 slabs (v2) | ✓ close; P3-4 chamfer brings the read down |
| Belt D-ring (FMVSS 210/ECE R14) | at/above shoulder +50–150 mm, 60–80 mm adjuster | not modelled | invisible (§8) — researched for the future look-back pose |
| Brake pad (auto) / accel gap | ~130×70 mm / 60–80 mm gap | P3-1: 100×54 school-spec pad, 70 mm gap | ✓ compact-faithful |
| Door armrest above H-point | 180–230 mm | armrest y 0.16–0.19 ≈ +190 mm over implied SgRP | ✓ |
| Console gear-knob top above H-point | 150–220 mm | P2-1 selector top +345 mm over floor-ish datum — deliberately tall (glance-visibility finding §2) | conscious deviation, documented |

**Design ruling for the GT-E cabin:** *compact-car controls on luxury-sedan surfaces.* Controls (stalks, headlight panel, hazard, HVAC knobs, selector, EPB) follow the VW/Škoda pattern Bulgarian learners train on — same positions our hotspots already occupy. Surfaces (ambient line, turbine vents, gloss stack, frameless mirror) follow the luxury refs, matching doc 67's AV-1 "floating horizon" language. G-Class flavour appears only where it cannot cost sightline.

---

## 4. Element spec — P1 (must), P2 (should), P3 (nice)

Format per element: **what** · real-car ref · placement (chassis m) · est tris · material · interaction · sightline-safety.

### P1 — must (the credibility floor: everything rest-visible + exam-relevant)

**P1-1 · Indicator stalk (left), full anatomy.** Ref: VW group stalk — 115 mm exposed, root Ø 18 → 12 mm taper, flattened paddle tip 32×18×10 mm, raked 10° down/toward driver.
Placement: root (0.42, 0.325, 0.600) on the shroud's left face → tip (0.535, 0.305, 0.575). Build INTO node `hotspot_indicator_stalk` (visible control mesh, doc 69).
~420 tris · int_dark + int_alu tip collar · static now, future rotate-about-root animation on indicate · Safety: max y 0.33 at z 0.60 — 0.16 below the 0.49 cowl-ray cap; inside the interior band by design.

**P1-2 · Wiper stalk (right) + end button + INT slider ridge.** Ref: VW wiper stalk (end trip button Ø 10×4 mm, slider ridge on top face).
Placement: root (0.26, 0.325, 0.600) → tip (0.145, 0.305, 0.575), mirror of P1-1. Node `hotspot_wiper_stalk`.
~430 tris · int_dark + int_alu · static (wipersToggle) · Safety: same as P1-1.

**P1-3 · Column shroud clamshell.** Ref: compact two-piece clamshell 220 mm long, ~140→110 mm wide, 95→80 mm tall, visible parting groove, 8–12 mm daylight gap to the wheel hub.
Placement: sleeve along the column axis from (0.34, 0.33, 0.565) to (0.34, 0.415, 0.740), swallowing both stalk roots.
~480 tris · int_dark · static · Safety: entirely under the binnacle hood cap plane (max y 0.415 at z 0.74; cap allows 0.469 there).

**P1-4 · Steering-wheel detail pass** (keep node transform + rim R 0.2045 — contract landmark). Ref: doc 67 §10.1 + compacts: rim section ovalizes 34 mm at 3/9 thumb rests (molded detents) → 30 mm top; two spoke switch pods 60×45×12 mm; horn pad 150×130 mm with a 42 mm emblem-free ring; slim lower spoke; 12-o'clock band (existing int_accent).
Placement: pods on the lateral spokes ±60 mm from hub centre (0.34, 0.30, 0.52) in the disc plane; pad centred on hub.
~2,400 tris net · int_leather rim, int_dark pods, int_gloss pod faces, int_alu ring · horn pad = existing `hotspot_horn` child of `steering_wheel` (momentary) · Safety: whole wheel already lives below the cowl line (rim top frame-y 0.23); nothing extends the rim.

**P1-5 · Cluster hood brow + flock inset.** Ref: Corolla anti-glare brow, shallow (our founder-shaved variant).
Placement: 30 mm lip whose TOP face lies ON the existing hood-cap plane `y = 0.486 − (z−0.67)·0.24`, thickness downward; 4 mm recessed inner face.
~260 tris · int_dark (inner face reads flock via AO) · static · Safety: coplanar with the cap plane that DEFINES the cowl landmark — no vertex above it, contract fy 0.327 unchanged.

**P1-6 · Outboard turbine vents ×2.** Ref: W213/G-Class round jet vents — Ø 95 mm chrome ring, 8 radial fins, centre hub bullet Ø 22 mm, 30 mm recess.
Placement: L centre (0.80, 0.415, 0.685); R centre (−0.80, 0.415, 0.685) at 55% fin detail (right-glance only).
~680 + 380 tris · int_chrome ring/hub (NEW), int_dark fins + cavity · static (future gimbal) · Safety: bezel top y 0.462 vs cowl-ray cap 0.474 at z 0.685 → 12 mm clear; left vent is the rest-view frame-left anchor.

**P1-7 · Centre blade vent band.** Ref: W214 slim full-width "wing" vent; doc 67 §9.6.2.
Placement: slot x −0.28…0.28, y 0.435–0.457, face z 0.735; 14 vertical vanes at 40 mm pitch + knurled centre tab.
~760 tris · int_alu bezel, int_dark vanes/cavity · static · Safety: top y 0.457 vs cap 0.472 at z 0.735 → 15 mm clear; reads as part of the dash silhouette, never above it.

**P1-8 · HVAC physical bar.** Ref: Corolla 3-knob honesty on a luxury gloss panel (doc 67 hybrid ruling §9.6.5): 2 temp rotaries Ø 38 mm + 5 button caps 18×12 mm (auto/AC/recirc/defrost×2) — the defrost pair is the future windshield-fog teaching hook.
Placement: strip x −0.20…0.20, y 0.300–0.345, face z 0.72, under the centre screen.
~900 tris · int_gloss panel, int_alu knobs, int_emissive glyph dots (NEW) · static now; defrost = future hotspot candidate · Safety: y ≤ 0.345, 13 cm below the cowl ray — deep inside the interior band.

**P1-9 · Centre-screen bezel + stack prow.** Ref: W214 black-panel — 6 mm bezel lip around screen_center, gloss surround flowing into the HVAC bar.
Placement: frame around the existing screen_center quad (top edge y 0.44), x −0.20…0.23, z face 0.71–0.735.
~350 tris · int_gloss · static · Safety: capped by the v2 bezel clamp y ≤ 0.45; the screen stays tucked below the cowl (the v2 black-slab fix is preserved).

**P1-10 · Ambient light line.** Ref: W214 Active Ambient — the single unbroken arc, dash → both doors.
Placement: 4×2 mm emissive strip at y 0.415 along the dash face (x −0.92…0.95, z hugging the dash ~0.71) wrapping onto both door uppers back to z 0.35.
~180 tris · int_emissive (NEW; constant warm-white, ≤40-nit look, no bloom) · static (future mode-tint via material lookup) · Safety: 55+ mm below the cowl ray along its whole run; a LINE, not a surface — cannot occlude.

**P1-11 · Headlight switch panel.** Ref: Golf/Octavia dash panel left of wheel — 100×70 mm plate, rotary Ø 35×12 mm (O–AUTO–low), range thumbwheel.
Placement: centred on existing hotspot (0.655, 0.342, 0.71). Node `hotspot_headlights`.
~320 tris · int_dark plate, int_alu knob · headlightsCycle · Safety: y ≤ 0.377 top of plate vs cap 0.470 → clear.

**P1-12 · Fog switch + P1-13 · Engine-start button + P1-14 · Hazard button.** Refs: VW fog button w/ icon; round start button Ø 30 mm with halo ring (Z8, doc 67); red-triangle hazard cap 25×20 mm.
Placement: existing hotspot positions (0.585, 0.328, 0.723) / (0.095, 0.34, 0.757) / (0, 0.338, 0.752); nodes `hotspot_fog` / `hotspot_engine_start` / `hotspot_hazard`.
~60 + 120 + 90 tris · int_dark caps, int_emissive icon dots + start halo · existing toggles · Safety: all ≥ 0.10 below the cowl ray.

**P1-15 · Left door card, forward section** (z 0.30–0.62, face x ≈ 0.80). Ref: compact door anatomy — beltline sill trim (int_alu strip y 0.40–0.42), soft upper roll, chrome release flipper 90×25 mm at (0.79, 0.28, 0.50), window-switch pod on the armrest top at (0.78, 0.185, 0.28) with 4 rockers + lockout, mirror 4-way knob forward of it, armrest pad y 0.16–0.19 z 0.05–0.45, pull-cup recess, tweeter pod Ø 40 mm on the mirror sail (0.87, 0.47, 0.68).
~2,300 tris · int_leather upper/armrest, int_dark lower, int_chrome flipper, int_alu sill/pod bezel · static (window switches are future hotspots; mirror-adjust is future) · Safety: everything at x ≥ 0.78 with y ≤ 0.47; the tweeter pod verified clear of the camera→door-mirror-glass ray (ray passes (0.86, 0.472, 0.535); pod at z 0.68 — 0.145 m aft-clear); `doorMirrorLeft` band test unaffected.

**P1-16 · Interior-mirror dress pass.** Ref: frameless slab + day/night flip tab (compacts) — 3 mm bezel lip around the existing glass quad + 25×8 mm tab under the bottom edge.
Placement: within the existing housing envelope (±0.085, 0.79–0.85, 0.475–0.560); tab to y 0.767.
~140 tris · int_dark · static (tab = future dimming toggle) · Safety: zero enlargement of the grandfathered zone; tab's frame-y ≈ 0.70 stays above the horizon band (0.60) and inside the mirror-band asserts (fx 0.6–0.95, fy ≤ 0.97).

**P1-17 · Demister slot pair.** Ref: 300×14 mm slots near the windscreen base (doc 67 §9.6.6).
Placement: recessed 6 mm INTO the cowl slope at (±0.35, on-surface, z 0.86).
~160 tris · int_dark cavity · static · Safety: recessed = strictly below the existing surface; cannot add silhouette.

**P1 subtotal ≈ 10,430 tris.**

### P2 — should (glance-visible + interaction honesty)

**P2-1 · Floating console bridge + selector + EPB.** Ref: Golf 8 DSG stubby shift-by-wire rocker (~50 mm) + EPB switch 20×40 mm + AutoHold; "floating bridge" deck per doc 67 §10.6.
Placement: deck x −0.15…0.15, z 0.18–0.55, **top y 0.31** (raised from the current implied ~0.14 so controls enter the right-glance frame — see §2 finding); selector knob top (0, 0.345, 0.43); EPB (0.093, 0.325, 0.35); wireless-pad slant + 2 USB-C dots in the front recess z 0.52–0.55; open shelf beneath.
~2,100 tris · int_dark deck, int_gloss top plate, int_alu selector collar, int_emissive P-glyph · nodes `hotspot_gear_selector` + `hotspot_parking_brake` get the visible meshes · **Requires same-commit A2 change:** `hotspots.ts` proxy positions → gear (0, 0.32, 0.43), park brake (0.093, 0.315, 0.35). · Safety: top y 0.31 at z 0.43 is 0.235 below the cowl ray AND below the rest frame bottom (needs 0.338 to appear) — invisible at rest, revealed only by the right glance. Cannot touch world.

**P2-2 · Right door card, forward section.** Mirror of P1-15 at 60% detail (no switch pod internals — right-glance only, 91° frame edge).
Placement: x ≈ −0.80, z 0.30–0.62. ~1,200 tris · same materials · static · Safety: outside the rest frustum entirely (x < −0.50 at dash depth); below cowl during glances.

**P2-3 · Glovebox seam + latch + passenger fascia inlay.** Ref: push-latch thin shutline high on the passenger fascia; trim inlay strip (doc 67 §9.1.3).
Placement: 2 mm seam groove at y 0.28, face z 0.62, x −0.35…−0.75; inlay strip y 0.36–0.40 same span.
~380 tris · int_dark groove, int_accent inlay · static · Safety: y ≤ 0.40 vs cap 0.49 at z 0.62.

**P2-4 · Speaker grilles.** Ref: dash-corner rings Ø 60 mm + door woofer rings Ø 160 mm (grille mesh itself = flat disc; perforation is an AO/roughness read, honestly noted — no textures in this pipeline).
Placement: dash corners (±0.88, on-cowl-slope recessed, 0.78); door woofers (±0.80, 0.02, 0.42).
~420 tris · int_alu rings, int_dark discs · static · Safety: dash rings recessed into the slope; door rings far below the band.

**P2-5 · Passenger-seat visible pass.** Headrest volume + bolster ridges + stitch ridgeline (geometry crease, AO-caught).
Placement: existing `interior_seats`, passenger side x ≈ −0.42. ~700 tris · int_seat · static · Safety: below/behind the band; right-glance only.

**P2-6 · Grab handles ×2 above doors.** Ref: 250 mm damped fold-flat handles.
Placement: (±0.72, 0.845, −0.05), folded flush against the headliner.
~260 tris · int_dark · static · Safety: y 0.845 > top-frame ray 0.779 at z −0.05 → out of frame at rest; headliner-attached, outside the windshield band by construction.

**P2-7 · Overhead console.** Ref: compact dome unit — 180×100 mm plate, 2 lens squares + rocker.
Placement: (0, 0.852 flush, −0.02) between the visors. ~240 tris · int_dark + int_emissive lens dots · static (future cabin light) · Safety: same header logic as P2-6.

**P2-8 · Left door pocket lip + sill scuff hint.** Placement: (0.80, −0.02…0.04, z 0.2–0.5). ~220 tris · int_dark · static · Safety: bottom of the left-glance wedge.

**P2-9 · A-pillar dress.** Chamfer + base tweeter pod INSIDE the frozen 6.5×7.5 cm section. ~160 tris · int_dark · static · Safety: zero cross-section growth (rule §2).

**P2 subtotal ≈ 5,680 tris.**

### P3 — nice (future-camera insurance + flavour)

| # | Element | Ref/placement | Tris | Material | Note |
|---|---|---|---|---|---|
| P3-1 | Pedal set: organ accel 45×200, brake pad 100×54, dead pedal 100×150 | (x 0.20–0.48, y −0.30…−0.12, z 0.85–0.95), ~70 mm pedal gap | 650 | int_dark + int_alu caps | invisible in ALL current poses (§2 math) — built only as insurance for a future pre-drive look-down pose |
| P3-2 | Belt buckle + 200 mm stalk (anchors `hotspot_belt`) | (0.135, 0.02–0.10, −0.20), red button up | 180 | int_dark + int_accent button | same future-pose insurance; node `hotspot_belt` |
| P3-3 | Column height-adjust lever | (0.36, 0.27, 0.60), 60×20 mm under shroud | 80 | int_dark | rest-visible sliver under the shroud |
| P3-4 | Visor refinement: edge chamfer + pivot elbows + vanity flap seam | existing visor slabs (±0.20…0.53, 0.843–0.856, −0.10…0.06) | 180 | int_dark | only leading edges ever visible (rear glance, header dip) |
| P3-5 | Right door pocket + bottle cradle | (−0.80, −0.02…0.04, 0.2–0.5) | 120 | int_dark | right-glance bottom edge |
| P3-6 | Passenger fascia etched-line motif | emissive hairline y 0.38, x −0.30…−0.70 | 90 | int_emissive | doc 67 §9.1.3 Sofia-map nod, one strip only |
| P3-7 | Passenger dash **grab bar** (G-Class heritage part) | horizontal bar on the dash FACE: (−0.32…−0.64, 0.40–0.445, standing 45 mm off z 0.70), grip Ø 30 mm — the real G bar also mounts mid-fascia at vent height (§3.1), so this placement is authentic, not a compromise | 260 | int_dark grip + int_alu ends | top y 0.445 ≤ 0.45 cap at z 0.70; off-frame at rest anyway (x < −0.50), right-glance visible |
| P3-8 | B-pillar upper caps | (±0.70, 0.60–0.86, −0.50), right-glance 91° frame edge | 140 | int_dark | silhouette only |

**P3 subtotal ≈ 1,700 tris.**

---

## 5. Tri-budget rollup

| Block | Tris |
|---|---|
| v2 baseline (shipped) | 21,600 |
| P1 (17 elements) | 10,430 |
| P2 (9 elements) | 5,680 |
| P3 (8 elements) | 1,700 |
| **v3 total** | **39,410** |
| Ceiling | 45,000 |
| **Reserve** | **5,590 (12.4%)** |

Draco size estimate: 98 KB × (39.4/21.6) ≈ **~180–200 KB** ≤ 250 KB ✓ (no new textures; two new solid-colour materials only).
Blender pre-optimize assertion: keep `< 60,000` (v2 script value) — v3 lands ~40k, fine.

## 6. Materials plan (8 = ceiling)

| Material | Role | Status |
|---|---|---|
| int_dark | shrouds, stalks, vanes, cavities, pockets, handles, pedal arms | existing |
| int_leather | dash pad returns, armrests, door uppers, wheel rim | existing |
| int_alu | vent bezels, sill trims, knobs, selector collar, pedal caps | existing |
| int_accent | 12-o'clock band, inlay strip, belt button | existing |
| int_gloss | piano-black stack, screen bezels, pod faces, console plate | existing |
| int_seat | seats | existing |
| **int_emissive** | ambient line, icon dots, start halo, P-glyph, map-light lenses — unlit/emissive, warm-white constant | **NEW** |
| **int_chrome** | turbine rings/hubs, door release flippers (metallic 1.0, roughness ~0.15 — visibly brighter than int_alu) | **NEW** |

Notes: new-material meshes are excluded from the AO atlas the same way screens/hotspots are (they're small trims; the white-border texel guard in `hero_interior_ao_bake.py` already handles material sharing). Runtime may later tint `int_emissive` by material-name lookup — no schema change.

## 7. Build & verification rules (the v3 script contract)

1. **Merge policy:** all static P1–P3 geometry merges into `interior_shell` (one mesh, 8 material slots = 8 draw groups). Separate nodes ONLY for: the 13 `hotspot_*` control meshes (stalks P1-1/2 → `hotspot_indicator_stalk`/`hotspot_wiper_stalk`; selector/EPB P2-1 → `hotspot_gear_selector`/`hotspot_parking_brake`; buckle P3-2 → `hotspot_belt`; etc.), `screen_cluster`/`screen_center` (untouched), `steering_wheel` hierarchy (P1-4 detail goes inside `steering_wheel_mesh`).
2. **Do not touch:** the mount (yaw-π, y −0.55), DEP, wheel node transform + rim radius, any v2 clamp plane, screen node positions, mirror glass position/scale, the A-pillar beams' cross-section.
3. **Integrity assertions** (update from v2 script): 13 hotspots + screens + wheel hierarchy present; `≤8` interior materials (was ≤6); tris < 60k; **window probe ≥0.65 span from both poses must stay PASS**.
4. **AO rebake:** after geometry lands, re-run `hero_interior_ao_bake.py` (new shell geometry joins the atlas automatically; hotspot/control meshes stay excluded), then `tools/glb/optimize.mjs` → verify ≤250 KB.
5. **Contract test:** `cockpit-camera-contract.test.ts` must stay green with **zero band/landmark edits** (baseline verified green, 15/15, 2026-07-12). Per-element checks are pre-verified in §4; the one code change this spec requires is the P2-1 `hotspots.ts` position sync (same commit as the GLB swap).
6. **Visual check:** re-render `hero_interior_v2_preview.py` poses (dep + cam) before/after; the window split must be pixel-identical above the cowl line.

## 8. What we deliberately omit — and why

| Omitted | Why |
|---|---|
| Rear cabin: bench, rear doors, C-pillars, parcel shelf, rear belts, rear vents | Max reachable gaze = right-glance frame edge at 91° ≈ the B-pillar plane; mirror RTT cameras are layer-masked to world-only, so the cabin NEVER renders behind the driver. Pure waste. |
| Driver seat back/bolsters, driver's own belt run | Behind the camera in every pose; no driver body is rendered. |
| B-pillar belt D-rings + height adjusters (both sides) | Outside all four frusta (driver side needs >115° yaw). Researched (46–48 mm webbing, 60 mm adjuster travel) and shelved until a look-back/door-open pose exists. |
| Stitching as geometry, knurl/perforation as texture | The pipeline is solid-colour PBR + baked AO — no albedo/normal textures. Thread-scale geometry would burn thousands of tris invisibly. Revisit only if a normal-map atlas ADR lands. |
| Glovebox interior, armrest bin interior, motorized anything (visor swing, glovebox drop) | Interiors render only when opened; nothing opens in the sim. Seam lines (P2-3) sell the existence for ~2% of the cost. |
| HUD projector aperture | The HUD is a screen-space feature (doc 67 §9.3.6 real-time note), not cockpit geometry. |
| Passenger companion display, rotary controller, drive-mode roller | Doc 67 luxe options that add interaction surface we will never wire; the W214 itself deleted the rotary. |
| Widened A-pillars (realistic 90–100 mm) | Would eat world % — the founder contract outranks realism here (§2 rule). |
| Passenger grab handle ABOVE the dash pad (true G-Class style) | Would breach the cowl silhouette when the right glance sweeps the windshield — re-placed below the cowl as P3-7. |
| Sunroof/pano, headliner speaker rings, coat hooks | Above the top-frame ray but visible in zero poses (rear glance clips at the header edge). |
| Driver-side vanity mirror detail, lit vanity | Visor faces never turn toward the camera. |

## 9. Flagged follow-ups (out of scope here)

- **Console-blindness finding (§2):** until P2-1 lands, gear/park-brake/belt hotspots are clicked blind. If P2-1 is deferred, consider a temporary UI affordance (the Bulgarian tooltip already helps).
- A future **pre-drive look-down pose** (seat/belt/pedals teaching camera) would activate P3-1/P3-2 instantly; they are placed and budgeted for exactly that.
- Window-switch rockers + defrost buttons are modeled static but positioned to become hotspots without geometry changes (future doc-69 extensions).
