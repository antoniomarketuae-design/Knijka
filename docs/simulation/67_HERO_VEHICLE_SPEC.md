# Hero Vehicle — Ultra-Detailed Engineering & Asset Specification

**Fictional latest-generation luxury performance sedan** (electrified performance flagship — twin-turbo hybrid + full-EV variants).
Prepared as a AAA-grade design bible: modelling (Blender), engine implementation, vehicle/physics programming, sound, materials, animation.

**Version 1.0 · 2026-07-09 · Книжка.AI simulation** · authored by 13 parallel subsystem specialists.

---

> ### ⚠️ Fictional & unbadged — by design
> This vehicle carries **no real brand, logo, model name, or trademarked design element** (ADR-001). It is an original "luxury performance sedan" archetype. Any brand-flavoured feature names in the source brief (a rotary controller, an all-wheel-drive system, a maker emblem) are documented generically. Nothing here should reproduce a specific real vehicle's protected design.

> ### 🎯 Two targets in one document — read this first
> This spec documents the vehicle at **two fidelities at once**, and you must not confuse them:
>
> 1. **The AAA / cinematic ideal (LOD0)** — every visible and hidden component, PBR-perfect, ray-traced, Nanite-class. This is the *reference ceiling*. It is what a Forza/GT-class **offline or high-end-PC** build would ship.
> 2. **The Книжка.AI real-time web target** — what actually runs at 60 fps in a **WebGL browser on a phone** (ADR-005). This is a *tiny fraction* of the above: roughly the **LOD3 "gameplay" tier**, with hard triangle/texture budgets. See **§13 → "Real-time web target"** for the concrete numbers and the map from the full spec down to it.
>
> Throughout, `> Real-time:` notes flag what is baked, faked, or omitted for the browser build. **Do not attempt to ship LOD0 in the browser — it physically cannot render.** Use the LOD0 detail to drive an offline asset (AI-3D-generation or a 3D artist), then decimate to the LOD3 gameplay mesh + baked maps for the sim.

> ### 🚗 Where this fits the product
> Книжка.AI needs two vehicle classes: a **hero player car** (seen up close, cockpit-first — this spec is written for it) and lean **instanced traffic cars** (background, 26 on screen). Only the player car warrants this depth; §13 gives the traffic-car budget separately.

---

## Table of contents

1. **Vehicle Overview, Category & Reading Guide** — dimensions, mass, powertrain, philosophy, assembly tree
2. **Exterior — Body Shell & Structure** — shell, crash structures, subframes, pillars, doors, closures, undercarriage
3. **Exterior — Front Fascia & Lighting** — bumper, grilles, active shutters, sensors, DRL/adaptive/laser headlights
4. **Exterior — Rear Architecture & Lighting** — bumper, diffuser, light bar, active spoiler, backup systems
5. **Exterior — Sides, Glazing & Roof** — mirrors/cameras, glass, trim, panoramic roof, antennas, sunroof
6. **Wheels, Tires & Braking** — wheel/tire construction, calipers/discs/pads, TPMS, full brake system
7. **Underbody, Drivetrain & Suspension** — chassis, exhaust, diffs, driveshafts, powertrain, adaptive/air suspension
8. **Engine Bay** — engine, turbos, cooling, electrical, steering rack, ECUs, reservoirs
9. **Interior — Cockpit & Dashboard** — dash, cluster, HUD, screens, controls, vents, ambient light, trims
10. **Interior — Steering, Seats, Doors & Console** — wheel + column, all seats, door cards, centre console
11. **Systems — Infotainment, Cluster, HVAC, Electronics & Lighting** — UI, sensors, buses, HVAC, lighting animations
12. **Simulation Layer — Physics, Damage, Animation & Audio** — physics values, damage states, rigs, every sound source
13. **Materials, Rendering & Level-of-Detail** — material library (PBR), rendering, LOD0–LOD4, **real-time web target**

---
## 1. Vehicle Overview, Category & Reading Guide

> **Document class:** Master reference — Section 1 of the Vehicle Engineering & Asset Specification.
> **Audience:** 3D/Blender artists · UE5 & real-time engine devs · vehicle & physics programmers · sound designers · material/lookdev artists · animation teams.
> **Rule of the house:** This is a **fictional, unbadged vehicle**. No real brands, model names, logos, or proprietary system names appear anywhere. Where a real-world equivalent term is unavoidable, it is neutralized generically (see §1.7 Terminology & Brand-Neutralization Glossary).

---

### 1.1 Executive Definition — What This Vehicle Is

The subject of this specification is a **fictional, latest-generation luxury performance sedan** — an **electrified performance flagship** positioned at the intersection of executive luxury and supersaloon performance. Internally and throughout this document it is referred to as:

> **The "AURELIS GT-E"** — hereafter **"the Vehicle."**
> (Fictional maker designation: **Aurelis**, an invented marque. Model line: **GT-E**. Neither exists as a real brand; the name is a placeholder for asset-naming consistency across the game project.)

The Vehicle is a **five-seat, four-door, long-wheelbase sports sedan** (segment-equivalent: full-size executive / "E-segment plus"). It is engineered as a **dual-powertrain platform** sharing one body-in-white, one interior, and one exterior surface language across two mechanically distinct variants:

| Variant code | Marketing name | Powertrain | Role |
|---|---|---|---|
| **GT-E H** | "GT-E Hybrid" | Twin-turbo V8 + rear e-motor **plug-in hybrid (PHEV)** | Visceral, mechanical, thermally alive — engine audio, exhaust, gearshifts |
| **GT-E X** | "GT-E Electric" | Dual-motor **full battery-electric (BEV)** | Silent, instant-torque, futuristic — no grille intake, closed underbody |

Both variants are **all-wheel drive** and are intended to be **switchable in-engine** by swapping a powertrain data profile and a small set of variant-specific meshes (grille, exhaust, badging delete, underbody). See §1.9 Variant Delta.

**North-star framing for the game team:** the Vehicle must read instantly as *expensive, fast, and modern* from any camera distance — a hero asset that survives extreme close-ups (stitching, clearcoat flake, brake-disc scoring) **and** 60 m fly-bys (silhouette, lighting signature, stance).

---

### 1.2 Category, Positioning & Design Intent

#### 1.2.1 Category

- **Body style:** Four-door notchback sedan (three-box), fastback-influenced roofline with a short, faired rear deck.
- **Class:** Luxury performance flagship — the "halo" trim of its fictional maker.
- **Market analogue (for artists' mental model only, NOT to be replicated):** the space occupied by long, low, four-door performance saloons with ~3.0 m wheelbases and 500–700+ kW outputs. **Do not model any specific real car.** Use the analogue only to calibrate proportion and stance expectations.
- **Era:** "Latest generation" — contemporary-to-near-future (design language: 2025–2030 aesthetic). Flush surfaces, minimal shutlines, integrated light signatures, aero-active elements, digital-first cabin.

#### 1.2.2 Positioning descriptors (for lookdev & marketing shots)

- **Warm-tech luxury**, not cold minimalism: machined metals, deep gloss paint, real (simulated) leather grain, ambient light that behaves like liquid.
- **Athletic, not aggressive**: muscular haunches and a wide track, but surfaces are calm and expensive rather than spiky/aero-riced.
- **Confident stance**: wide track relative to height, large wheels filling the arches (small visual gap), a subtle forward "lean."

---

### 1.3 Master Specifications Table

> All figures are **fictional but physically plausible** and internally consistent (mass ↔ power ↔ performance sanity-checked). Use these as the **canonical numbers** for physics tuning, UI stat screens, and marketing copy. Metric primary; imperial in parentheses where useful.

#### 1.3.1 Dimensions & Mass

| Attribute | GT-E Hybrid | GT-E Electric | Notes for artists/physics |
|---|---:|---:|---|
| Overall length | **5,180 mm** (203.9 in) | 5,180 mm | Bumper tip to bumper tip. |
| Overall width (excl. mirrors) | **1,975 mm** (77.8 in) | 1,975 mm | Body only. |
| Overall width (incl. mirrors) | **2,145 mm** | 2,145 mm | Use for camera collision & garage clearance. |
| Overall height (unladen) | **1,455 mm** (57.3 in) | 1,460 mm | EV +5 mm (battery floor). Low, coupe-like. |
| Wheelbase | **3,050 mm** (120.1 in) | 3,050 mm | Front axle CL → rear axle CL. |
| Track, front | **1,680 mm** | 1,685 mm | Wheel CL to wheel CL. |
| Track, rear | **1,700 mm** | 1,705 mm | Rear slightly wider — stance. |
| Front overhang | **920 mm** | 920 mm | |
| Rear overhang | **1,210 mm** | 1,210 mm | |
| Ground clearance (normal) | **120 mm** | 120 mm | Air suspension; see below. |
| Ground clearance (lowered / high-speed) | **95 mm** | 95 mm | −25 mm at speed. |
| Ground clearance (raised / entry) | **145 mm** | 145 mm | +25 mm parking/kerb. |
| Approach / departure angle | **12° / 14°** | 12° / 14° | For collision & ramp behavior. |
| Kerb mass (DIN, full fluids) | **2,180 kg** (4,806 lb) | **2,410 kg** (5,313 lb) | EV heavier (battery). |
| Gross vehicle mass (GVM) | **2,720 kg** | 2,950 kg | Fully laden. |
| Weight distribution (F/R, kerb) | **51 / 49** | **48 / 52** | EV rear-biased (rear battery mass + motor). |
| Centre-of-gravity height (est.) | **480 mm** | **440 mm** | EV lower CoG — floor battery. Critical for handling model. |
| Payload | 540 kg | 540 kg | 5 occupants + luggage. |
| Towing (braked) | 0 kg (not rated) | 0 kg | Performance flagship — no tow rating. |

#### 1.3.2 Powertrain & Performance

| Attribute | GT-E Hybrid | GT-E Electric |
|---|---|---|
| Layout | Front-mid **twin-turbo V8** + rear axle **e-motor**, AWD | **Dual e-motor** (one per axle), AWD |
| Displacement (ICE) | 4.0 L (3,996 cc) 90° V8 | — |
| Combustion output | 430 kW (585 PS) / 800 N·m | — |
| Electric motor(s) output | Rear e-motor 120 kW / 300 N·m | Front 190 kW + Rear 260 kW |
| **System power (combined)** | **550 kW (748 PS)** | **450 kW (612 PS)**; **Boost/Launch: 500 kW (680 PS)** |
| **System torque (peak)** | **1,020 N·m** | **900 N·m** (axle-summed, launch) |
| Power range (drive modes) | 300 kW eco-cap → 550 kW max | 250 kW eco-cap → 500 kW boost |
| Transmission | 8-speed dual-clutch (wet) | Single-speed reduction per axle (9.0:1 front, 8.2:1 rear) |
| **0–100 km/h** | **3.1 s** | **2.9 s** (with launch/boost) |
| 0–200 km/h | 10.4 s | 9.8 s |
| **Top speed** | **310 km/h** (limited) | **260 km/h** (limited, range-protecting) |
| Braking 100–0 km/h | 33.0 m | 33.5 m |
| Drivetrain | AWD, torque-vectoring rear axle, e-diff | AWD, dual-motor torque split, e-diff |
| Regen braking | Up to 0.25 g (hybrid) | Up to 0.35 g, one-pedal capable |

#### 1.3.3 Energy, Range & Capacities

| Attribute | GT-E Hybrid | GT-E Electric |
|---|---|---|
| Traction battery (usable) | **21.5 kWh** | **105 kWh** (112 kWh gross) |
| Battery chemistry (fictional) | NMC pouch, 400 V | NMC-Si pouch, **800 V** architecture |
| Electric-only range | ~70 km (WLTP-equivalent, fictional) | **560 km** (WLTP-equivalent, fictional) |
| Fuel tank | **68 L** (petrol, 98 RON) | — |
| Combined range | ~850 km | 560 km |
| Max DC charge rate | 60 kW (battery buffer) | **270 kW** (10–80 % in 18 min) |
| Max AC charge rate | 11 kW | 22 kW |
| Charge ports | Left rear ¾ (AC/DC combo) | Left rear ¾ + right front (dual, optional) |
| Fuel filler | Right rear ¾ (capless) | — |

#### 1.3.4 Chassis, Wheels & Aero

| Attribute | Value | Notes |
|---|---|---|
| Suspension, front | Double wishbone, air springs, adaptive dampers | |
| Suspension, rear | Multi-link (5-link), air springs, adaptive dampers, rear-wheel steering | |
| Rear-wheel steering | ±3.5° (counter-phase < 60 km/h, in-phase > 60 km/h) | Visible wheel yaw — animate it. |
| Steering | Electric power, variable ratio, 2.2 turns lock-to-lock | Rack ratio ~13.5:1 avg. |
| Turning circle (kerb) | 12.4 m | With rear steer; 13.6 m without. |
| Brakes, front | 6-piston fixed caliper, **410 mm** carbon-ceramic disc (opt.) / 390 mm steel | |
| Brakes, rear | 4-piston fixed caliper, **390 mm** disc | |
| Wheels (standard) | **21-inch** front & rear | |
| Wheels (optional) | 22-inch front / 22-inch rear staggered | |
| Tyres, front | 265/35 R21 | Staggered setup. |
| Tyres, rear | 295/30 R21 | Wider rear. |
| **Drag coefficient (Cd)** | **0.24** (EV, closed front) / **0.26** (Hybrid, active grille open) | Class-leading; matters for high-speed feel. |
| Frontal area | ~2.28 m² | For aero force calc. |
| CdA | ~0.55 (EV) / 0.59 (Hybrid) | |
| Active aero | Front air-dam flaps, active rear spoiler, underbody flap | Animated — see spoiler sub-spec. |
| Boot / trunk volume | **480 L** (Hybrid) / **500 L** + 75 L frunk (EV) | EV gains front trunk. |
| Fuel/energy door | Powered flush pop-out | Animated. |
| Seating | **5** (2+3), sport buckets front | |
| Doors | 4, frameless glass, flush powered handles | Handles deploy — animate. |

---

### 1.4 Design Philosophy & Silhouette

#### 1.4.1 Governing philosophy — "Tension under a calm skin"

The Vehicle's form language is built on a single principle: **maximum visual tension expressed through minimal surface drama.** Power is implied by proportion (long dash-to-axle, wide haunches, big wheels) rather than by add-on aggression. Every surface is a **single continuous gesture** wherever possible; shutlines and intakes are minimized, and functional details (cooling, sensors, charge ports) are hidden behind flush closures.

Four pillars:

1. **Monolithic body:** the greenhouse and body feel machined from one billet. Flush glazing, hidden A-pillar transitions, minimal brightwork.
2. **Liquid-metal surfacing:** large, slow-curvature panels that hold a single crisp "light-catcher" crease running the full flank. This one line does the visual work; everything else is calm.
3. **Grounded stance:** wide track, low roof, wheels pushed to the corners, tight arch gaps. The car looks planted even parked.
4. **Light as signature:** the day/night identity is carried by continuous LED signatures front and rear — a full-width front light-blade and a full-width rear light-bar — that read as a brand fingerprint at any distance.

#### 1.4.2 Silhouette description (side profile, front-left ¾ hero read)

- **Nose:** low, wide, forward-leaning. A shallow "shark-nose" prow. The EV variant has a **fully closed, body-color front fascia** with a subtle textured panel where the Hybrid has an **active shutter grille**.
- **Front axle to cowl (dash-to-axle):** long — signals the mechanical (or virtual) "engine forward" premium-RWD-derived proportion.
- **Greenhouse:** low, tapering, fast-raked windshield (~24° from horizontal at header), frameless side glass, a strong **coupe-like C-pillar** flowing into a short deck (fastback influence but still a true three-box notchback).
- **Roofline:** peak over front occupants' heads, gentle continuous arc downward to the rear — no abrupt kink.
- **Flank:** one primary character line ("the light-catcher") runs from the top of the front wheel arch, dips subtly through the doors, and rises into the rear haunch. Below it, a calm lower surface with a soft undercut (rocker) that visually lowers the car.
- **Haunches:** pronounced rear shoulders over the rear wheels — the widest visual point above the belt.
- **Tail:** short, high-decked, faired-in. Full-width light bar, integrated ducktail lip (which becomes the active spoiler), aggressive diffuser (functional on EV, framing quad exhausts on Hybrid).
- **Stance keywords for modelers:** low · wide · long-hood · big-wheeled · planted · monolithic.

#### 1.4.3 Color & material identity (hero configuration)

- **Signature exterior paint:** "Nebula Grey" — a cool mid-grey metallic with fine, bright flake and a deep clearcoat (see material spec in exterior section). Alternate hero: "Aurelis Teal" (deep desaturated blue-green, high-flake).
- **Brightwork:** dark satin (anthracite PVD) rather than chrome — modern, restrained.
- **Wheels:** two-tone — machined face + dark pocket.
- **Interior hero:** warm tan ("Amber") leather-analogue + anthracite Alcantara-analogue + open-pore dark wood or brushed metal trim + copper-tone accents.

---

### 1.5 Document Schema — How Every Component Is Specified

Every section of this specification (from §2 onward) describes assets using a **strict, repeatable schema** so that each discipline can find its data at a predictable depth. The hierarchy is:

```
ASSEMBLY  →  SUBASSEMBLY  →  COMPONENT  →  [Material · Dimensions · Animation · Physics · Interaction · Rendering]
```

#### 1.5.1 Hierarchy levels

| Level | Meaning | Example | Naming convention |
|---|---|---|---|
| **Assembly** | A top-level system of the car | Exterior Body Shell; Powertrain; Interior | `ASM_<System>` |
| **Subassembly** | A coherent group within an assembly | Front Fascia; Front Door; Rear Suspension | `SUB_<System>_<Group>` |
| **Component** | A single modeled/logical part | Door handle; Brake caliper; HVAC vent | `<Group>_<Part>` mesh, `PART_<...>` node |
| **Sub-part** | A distinct piece of a component | Handle escutcheon, handle grip, pivot pin | child mesh / bone |

#### 1.5.2 The seven detail facets (documented per component)

Each component is described against these facets. If a facet does not apply, it is marked "n/a."

1. **Purpose / Role** — what it is and why it exists (functional + narrative).
2. **Geometry & Dimensions** — approximate real-world sizes (mm), poly-budget guidance, LOD notes.
3. **Material(s) & PBR** — named material + parameters: **Base Colour/Albedo (hex or sRGB)**, **Metallic (0–1)**, **Roughness (0–1)**, plus as relevant **Normal**, **Clearcoat / Clearcoat Roughness**, **Emissive (color + nits)**, **Transmission/IOR**, **Anisotropy**, **Sheen**, **Subsurface**.
4. **Sub-parts** — enumerated child pieces.
5. **Moving parts & Animation** — **axis**, **range** (deg/mm), **pivot location**, **driver** (state/input/physics), **rig type** (bone / blendshape / procedural), timing/easing.
6. **Physics / Mechanical function** — collision role, mass contribution, constraint type, real mechanical behavior being represented.
7. **Gameplay Interaction** — how the player triggers/experiences it; input mapping; states.
8. **Rendering notes** — draw-order, transparency, decals, LOD switch distances, real-time vs cinematic differences.

#### 1.5.3 Canonical facet template (copy-paste block used downstream)

```
#### <Component name>  [mesh: <Group>_<Part>]
- Purpose/Role: …
- Geometry & Dimensions: L×W×H mm · tri budget LOD0/1/2/3 · pivot @ (x,y,z)
- Material: MAT_<name> — Albedo #RRGGBB · Metallic <0–1> · Roughness <0–1> · [Clearcoat …] · [Emissive … nits]
- Sub-parts: …
- Animation: axis <X/Y/Z> · range <a→b> · driver <state> · rig <bone/blendshape/procedural> · easing …
- Physics: <collision/constraint/mass> …
- Interaction: input <key/button> · states <…>
- Rendering: <draw order / transparency / LOD switch / decals>
> Real-time: <what is baked/faked/omitted at gameplay LOD>
```

#### 1.5.4 Coordinate system, units & conventions (PROJECT-WIDE — obey exactly)

| Convention | Value | Notes |
|---|---|---|
| Units | **1 unit = 1 metre** in DCC; export scale 1.0 | UE5 default is cm — apply 100× at import or author in cm; **pick one and document per-asset**. This spec authors real-world in **mm**. |
| Up axis | **+Z up** (author in Blender +Z; UE5 +Z up) | Confirm exporter axis conversion. |
| Forward axis | **+X = vehicle forward** | Nose points +X. |
| Left/right | **+Y = vehicle LEFT** (driver side in LHD) | Right side = −Y. |
| Origin | **World origin at center of front-axle-line projected to ground plane**, then vehicle root pivot at **contact-patch-center on ground, mid-wheelbase** | Physics chassis pivot = CoG (see §1.3). Document both: **art origin** (ground, mid-wheelbase) vs **physics CoM**. |
| Wheel pivots | At hub center, spin about **Y**, steer about **Z**, suspension travel along **Z** | |
| Handedness | Right-handed | |
| Scale sanity | Wheelbase 3.050 m; 21" wheel Ø ≈ 0.760 m (tyre OD) | Use to check import scale instantly. |

#### 1.5.5 LOD tiers (referenced by every component)

| LOD | Use case | Switch distance (approx) | Character |
|---|---|---|---|
| **LOD0** | Cinematic / photo mode / close cockpit | 0–8 m | Full detail, all sub-parts, real materials. |
| **LOD1** | Normal gameplay hero | 8–25 m | Merged small parts, simplified interior. |
| **LOD2** | Traffic / mid distance | 25–70 m | Baked details, no interior interactivity. |
| **LOD3** | Far traffic / mirrors | 70 m+ | Silhouette + baked lighting, single material atlas. |

> **Real-time (global):** the target real-time build is **WebGL / mobile-capable** (per project ADR-005: Three.js + R3F). Assume LOD1 is the *default playable* fidelity on desktop and **LOD2 on phones**. Cinematic-only features (raytraced clearcoat, true SSS leather, per-flake paint) are LOD0 and must degrade gracefully. Each downstream section carries a `> Real-time:` note stating exactly what is baked, faked, or omitted.

---

### 1.6 Top-Level Assembly Tree — Bill of Assemblies

This is the **canonical decomposition** of the Vehicle. Every downstream section (§2+) maps to exactly one Assembly below. Numbers in brackets are the intended spec-section IDs.

```
THE VEHICLE (root)  [ASM_ROOT]
│
├── ASM_EXT — EXTERIOR BODY SHELL & CLOSURES  [§2]
│   ├── SUB_EXT_BIW ............ Body-in-white / visible painted shell (fenders, roof, quarters, sills)
│   ├── SUB_EXT_FRONT ......... Front fascia (bumper, grille/shutter, splitter, intakes, sensors)
│   ├── SUB_EXT_REAR .......... Rear fascia (bumper, diffuser, exhausts[H]/blank[X])
│   ├── SUB_EXT_DOORS ......... 4× doors (skins, frameless glass, flush handles, mirrors)
│   ├── SUB_EXT_HOOD .......... Front lid (hood[H] / frunk lid[X])
│   ├── SUB_EXT_DECKLID ....... Boot lid + integrated active spoiler
│   ├── SUB_EXT_GLASS ......... Windshield, backlight, side glass, panoramic roof
│   ├── SUB_EXT_AERO .......... Active aero (front flaps, rear wing, underbody flap)
│   ├── SUB_EXT_TRIM .......... Brightwork, badging-delete plates, charge/fuel doors
│   └── SUB_EXT_UNDER ......... Underbody tray, diffuser structure, aero fins
│
├── ASM_LIGHT — LIGHTING & SIGNATURES  [§3]
│   ├── SUB_LIGHT_FRONT ....... Headlamp modules, DRL blade, indicators, matrix array
│   ├── SUB_LIGHT_REAR ........ Taillight bar, brake, reverse, indicator, fog
│   ├── SUB_LIGHT_AUX ......... Side markers, puddle lamps, welcome sequence, logo projection
│   └── SUB_LIGHT_INT ......... Ambient/interior lighting (covered in Interior too)
│
├── ASM_WHEEL — WHEELS, TYRES & BRAKES  [§4]
│   ├── SUB_WHEEL_RIM ......... 4× wheels (face, barrel, lug covers, valve, center cap)
│   ├── SUB_WHEEL_TYRE ........ 4× tyres (tread, sidewall, deformation, marking)
│   ├── SUB_WHEEL_BRAKE ....... Discs, calipers, pads, dust shields
│   └── SUB_WHEEL_HUB ......... Hubs, TPMS, wheel-speed detail
│
├── ASM_CHASSIS — SUSPENSION, STEERING & CHASSIS  [§5]
│   ├── SUB_CH_FSUS ........... Front double wishbone, air spring, damper, upright, ARB
│   ├── SUB_CH_RSUS ........... Rear multilink, air spring, damper, rear-steer actuator, ARB
│   ├── SUB_CH_STEER .......... Rack, column, tie rods, knuckle geometry
│   ├── SUB_CH_SUBFRAME ....... Front/rear subframes, mounts, bushings
│   └── SUB_CH_AIR ............ Air-suspension compressor, tanks, ride-height logic
│
├── ASM_PWR — POWERTRAIN & ENERGY  [§6]
│   ├── SUB_PWR_ICE ........... [Hybrid] V8 block, turbos, intake, cooling, ancillaries
│   ├── SUB_PWR_EMOT .......... e-motor(s), inverters, reduction gears
│   ├── SUB_PWR_TRANS ......... [Hybrid] 8-spd DCT, driveshafts, e-diff
│   ├── SUB_PWR_BATT .......... HV battery pack (floor[X] / rear[H]), modules, cooling
│   ├── SUB_PWR_EXH ........... [Hybrid] exhaust manifold→tips, valves, heat shields
│   ├── SUB_PWR_COOL .......... Radiators, intercoolers, chiller, pumps, ducts
│   └── SUB_PWR_CHARGE ........ Charge ports, onboard charger, fuel system[H]
│
├── ASM_INT — INTERIOR  [§7]
│   ├── SUB_INT_DASH .......... Dashboard, screens, vents, ambient, HUD
│   ├── SUB_INT_TUNNEL ....... Center console, controller, shifter, cupholders, storage
│   ├── SUB_INT_SEATS ........ 4–5 seats (buckets front, bench rear), belts, adjust
│   ├── SUB_INT_DOOR ......... Door cards, armrests, speakers, switches, handles
│   ├── SUB_INT_WHEEL ....... Steering wheel, paddles, stalks, controls
│   ├── SUB_INT_HEAD ........ Headliner, pillars, sun visors, grab handles, roof glass shade
│   ├── SUB_INT_FLOOR ...... Carpet, mats, pedals, footrest
│   └── SUB_INT_TRUNK ...... Boot trim, frunk trim, load floor
│
├── ASM_HUD — INSTRUMENTS, HMI & DISPLAYS  [§8]
│   ├── SUB_HUD_CLUSTER ...... Driver display (digital gauges)
│   ├── SUB_HUD_CENTER ...... Central touchscreen UI
│   ├── SUB_HUD_WINDSHIELD .. Augmented-reality head-up display
│   └── SUB_HUD_TELLTALE .... Warning lights, indicators, gear/mode readouts
│
├── ASM_FX — VFX, PARTICLES & DYNAMIC SURFACES  [§9]
│   ├── SUB_FX_EXHAUST ...... [H] exhaust haze/heat, cold-start smoke
│   ├── SUB_FX_TYRE ......... Smoke, dust, water spray, marks/decals
│   ├── SUB_FX_WEATHER ...... Rain beading, wiper clear, snow/dust accumulation
│   ├── SUB_FX_DAMAGE ....... Scratches, dents, glass cracks, paint transfer
│   └── SUB_FX_CHARGE ....... Charging glow, energy flow, boost/regen cues
│
├── ASM_AUDIO — SOUND DESIGN  [§10]
│   ├── SUB_AUD_ENGINE ...... [H] V8 granular engine model, turbo, exhaust valves
│   ├── SUB_AUD_EV .......... [X] motor whine, synthetic "drive sound", pedestrian alert
│   ├── SUB_AUD_CHASSIS ..... Tyres, suspension, wind, brakes, transmission
│   └── SUB_AUD_CABIN ....... UI clicks, HVAC, indicators, chimes, doors, ambience
│
└── ASM_SYS — VEHICLE LOGIC & STATE  [§11]
    ├── SUB_SYS_STATE ....... Master state machine (off/acc/on/drive/charge)
    ├── SUB_SYS_DRIVEMODE ... Drive modes (Comfort/Sport/Sport+/Individual/EV)
    ├── SUB_SYS_LIGHTLOGIC .. Lighting/indicator/welcome logic
    ├── SUB_SYS_ANIMGRAPH ... Animation state graph (doors, aero, suspension)
    └── SUB_SYS_DATA ........ Vehicle data profile (variant swap, tuning params)
```

#### 1.6.1 Assembly ownership matrix (who authors what)

| Assembly | 3D/Blender | Material/Lookdev | Physics prog | Anim | Audio | Engine/UE5 |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| EXT Body | ● | ● | ○ | ○ | | ○ |
| Lighting | ● | ● | | ○ | | ● |
| Wheels/Brakes | ● | ● | ● | ● | ○ | ○ |
| Chassis/Susp | ● | ○ | ● | ● | ○ | ● |
| Powertrain | ● | ● | ● | ○ | ● | ● |
| Interior | ● | ● | | ○ | | ○ |
| HUD/HMI | ○ | ● | | | ○ | ● |
| VFX | ○ | ● | ○ | ● | ○ | ● |
| Audio | | | ○ | | ● | ● |
| Sys/Logic | | | ● | ○ | ○ | ● |

● primary owner · ○ contributor

---

### 1.7 Terminology & Brand-Neutralization Glossary

To keep the asset legally clean and brand-free, use these **neutral terms** everywhere (assets, code, UI, docs):

| Real-world / branded term | **Neutral term to use** |
|---|---|
| Any manufacturer logo/badge | **maker emblem** / **marque mark** (the fictional Aurelis "A" glyph) |
| iDrive / MMI / COMAND / rotary infotainment | **central rotary controller** / **HMI dial** |
| xDrive / quattro / 4MATIC | **AWD system** / **all-wheel-drive** |
| PDK / DSG / S-tronic | **dual-clutch transmission (DCT)** |
| Matrix LED / Digital Light | **matrix adaptive headlamp** |
| Burmester / Bowers & Wilkins / B&O | **premium audio system** / "**Aurelis Signature Sound**" |
| Alcantara | **microsuede** / **suede-analogue** |
| Nappa leather | **premium leather-analogue** |
| CarPlay / Android Auto | **phone projection** |
| Brembo | **performance brake package** |
| Pirelli / Michelin markings | **generic sidewall markings** (fictional "AXO Sport" — invented tyre brand) |
| Recaro/Sabelt | **performance sport seats** |
| Real model names (M5, E63, etc.) | **GT-E Hybrid / GT-E Electric** |

> Any texture, decal, or normal-map lettering must use the **fictional Aurelis marque** or generic iconography. No real wordmarks, no real license-plate authorities (use fictional plate "CB •• AGT" style, EU-generic blue strip without a real country code — or an invented one).

---

### 1.8 Reading Guide — How Each Discipline Should Use This Document

| Discipline | Start at | Primarily consumes | Key facets |
|---|---|---|---|
| **3D / Blender artists** | §1.5 schema + §2 Exterior | Geometry & Dimensions, Sub-parts | Poly budgets, LOD switch, pivots |
| **Material / Lookdev** | §1.4.3 + each component's Material facet | Material & PBR | Albedo/metallic/roughness/clearcoat/emissive tables |
| **Vehicle / Physics programmers** | §1.3 + §5 Chassis + §6 Powertrain | Physics facet, master specs | Mass, CoG, power curves, susp geometry |
| **Engine / UE5 devs** | §1.5.4 conventions + §11 Sys | Rendering, Interaction, Data profile | Coordinate system, variant swap, LOD, materials |
| **Animation** | §11 anim graph + per-component Animation facet | Animation facet | Axis/range/driver/rig, easing |
| **Sound designers** | §10 Audio + §6 Powertrain | Physics + Audio facets | RPM/torque data, valve states, EV synth |
| **VFX artists** | §9 FX | Rendering + Interaction | Particle triggers, decals, dynamic surfaces |
| **Technical artists** | §1.5.5 LOD + all Real-time notes | Rendering + Real-time notes | Bake targets, WebGL/mobile constraints |

#### 1.8.1 Priority read order (if time-boxed)

1. §1.3 Master Specs (numbers everyone shares).
2. §1.5.4 Coordinate system & units (get scale/orientation right first — everything else depends on it).
3. §1.6 Assembly tree (find your section).
4. Your Assembly's section.
5. All `> Real-time:` notes in your area (know the gameplay budget).

---

### 1.9 Variant Delta — Hybrid vs Electric (Asset & Data)

The two variants **share one base asset**. The difference is a **swap set** plus a **data profile**. Engine devs implement variant selection as a single enum (`VehicleVariant.HYBRID | .ELECTRIC`) that drives mesh visibility, material overrides, audio bank, and physics params.

#### 1.9.1 Mesh / geometry deltas

| Region | Hybrid (GT-E H) | Electric (GT-E X) |
|---|---|---|
| Front fascia | **Active shutter grille** (functional intakes, animated vanes) | **Closed body-color fascia** with textured "signature" panel + hidden sensor cutouts |
| Hood/front | Solid hood over engine bay | **Frunk lid** (opens to storage), sealed motor bay below |
| Underbody | Partial tray, exhaust routing, heat shields | **Full flat floor** tray (aero + battery cover) |
| Rear diffuser | Frames **quad exhaust tips** | **Blank diffuser** (no tips), extra active flap |
| Engine bay (visible on hood open) | Full V8 dress cover, intakes, fluid caps | e-motor cover, HV cabling (orange), inverter |
| Charge port | Single left-rear AC/DC + **right-rear fuel door** | Dual charge doors (left-rear + right-front), no fuel door |
| Badging-delete plates | "GT-E H" glyph (optional) | "GT-E X" glyph |

#### 1.9.2 Data / physics deltas

| Param | Hybrid | Electric |
|---|---|---|
| Mass | 2,180 kg | 2,410 kg |
| CoG height | 480 mm | 440 mm |
| Weight dist | 51/49 | 48/52 |
| Torque delivery | Rev-dependent + turbo lag curve + gearshifts | Instant, single-speed, flat torque then taper |
| Drivetrain audio | V8 granular + turbo + exhaust valves | Motor whine + synthetic profile |
| Cd | 0.26 (grille open) | 0.24 |
| Regen | Light (fuel-primary) | Strong, one-pedal option |

> **Real-time (variant swap):** ship **one mesh** with toggled sub-meshes and a material parameter set (`Variant` scalar) rather than two full assets — halves memory and lets a single showroom scene demo both. Baked lighting/AO is shared; only the front-fascia and diffuser regions need variant-specific bakes (author both, atlas together).

---

### 1.10 Global Asset & Naming Standards (applies to all sections)

- **Naming:** `ASM_/SUB_/PART_` prefixes as in §1.6; materials `MAT_<domain>_<name>`; textures `T_<asset>_<map>` (e.g., `T_BodyPaint_BC`, `_N`, `_ORM`, `_E`).
- **Texture packing:** **ORM** convention (R=AO, G=Roughness, B=Metallic) for real-time; separate maps allowed at LOD0.
- **Texel density target:** 512 px/m body panels (LOD0 hero), 256 px/m interior touchpoints, 1024 px/m for badge/instrument micro-detail decals.
- **UV:** exterior body on 0–1 UDIM tiles per major region; overlapping mirrored UVs allowed for symmetric hidden areas only (not painted flake body — flake needs unique UVs to avoid mirrored-flake artifacts).
- **Pivot discipline:** every animated part has its pivot documented in its Animation facet; wheels/steering/doors/aero pivots are **load-bearing for the rig** — do not relocate without updating §11.
- **Real-time material budget (gameplay):** ≤ 6 unique materials on the exterior hero at LOD1 (paint, glass, brightwork-dark, brightwork-light, tyre, wheel), interior ≤ 10. Atlas aggressively at LOD2+.
- **Scale check on import:** confirm wheelbase = 3.050 m and tyre OD ≈ 0.760 m before doing anything else.

---

*End of §1. Proceed to §2 Exterior Body Shell & Closures.*
## 2. Exterior — Body Shell & Structure

> **Model designation (fictional):** *"the Vehicle"* — internal program code **AV-S1** ("Aurora Sedan, gen 1"). A latest-generation luxury performance flagship, offered in two powertrain variants sharing one body shell:
> - **AV-S1 TT-H** — twin-turbo V6 hybrid (front-mounted engine, rear transaxle, small traction battery under rear seat).
> - **AV-S1 EV** — full battery-electric (skateboard pack in the floor, dual motors).
>
> The two variants are **97% body-identical**. Divergences are limited to: (a) the front fascia intake area (functional grille vs. sealed active-shutter panel), (b) the fuel filler flap (present on TT-H, deleted on EV), (c) the charging port flap (present on EV, present-but-smaller AC-only flap on TT-H), (d) underbody (exhaust + heat shields on TT-H vs. flat battery tray on EV), (e) badging. Artists should build ONE master body and branch these five zones as swappable meshes.
>
> **ABSOLUTELY NO REAL BRANDS.** All emblems are the fictional "maker emblem" (a stylized double-chevron ring). No real model names, no real logotypes on any surface, tyre, or glass etch.

---

### 2.0 Reference Dimensions & Global Conventions

These anchor every mesh in this section. All measurements are nominal exterior, doors closed, curb stance (design ride height), unless noted.

| Global dimension | Value | Notes |
|---|---|---|
| Overall length | 5,050 mm | Bumper tip to bumper tip |
| Overall width (excl. mirrors) | 1,960 mm | Widest at rear haunches |
| Overall width (incl. mirrors) | 2,145 mm | Mirrors deployed |
| Overall height | 1,465 mm | Design ride height, antenna excl. |
| Wheelbase | 3,050 mm | Front axle CL → rear axle CL |
| Front track | 1,660 mm | |
| Rear track | 1,680 mm | Wider rear for performance stance |
| Front overhang | 920 mm | |
| Rear overhang | 1,080 mm | |
| Ground clearance (design) | 135 mm | Lowers to 110 mm at speed (air susp.) |
| Approach angle | 12.5° | |
| Departure angle | 15.0° | |
| Drag coefficient (Cd) | 0.22 (EV) / 0.24 (TT-H) | EV benefits from sealed front |
| Curb weight | 2,180 kg (TT-H) / 2,410 kg (EV) | Battery mass on EV |

**Coordinate & origin convention (for the whole vehicle spec):**
- **Origin (0,0,0):** center of front axle, on the ground plane, on vehicle centerline.
- **+X:** vehicle right (passenger side in LHD). **+Y:** up. **+Z:** rearward (toward tail). *(Engine team should confirm handedness against the physics module; this doc uses Y-up, Z-back to match the Three.js/R3F convention used in `platform/src/modules/sim`.)*
- **Units:** meters in-engine; millimeters in this doc for panel precision. 1 unit = 1 m.
- **Symmetry:** body is bilaterally symmetric about the X=0 plane EXCEPT: fuel/charge flaps, exhaust, maker-emblem wordmark placement, and the driver-side mirror camera housing. Mirror-modifier the shell, then break symmetry on those items.

**Global paint & panel-gap philosophy** is defined once here and referenced throughout:
- **Class-A surfaces:** all visible outer skin. Zebra/reflection-continuous, no G0 breaks across a shut-line except the gap itself.
- **Nominal panel gap:** **3.5 mm** ±0.5 mm on all body-to-body shut-lines (premium-tight). Hood-to-fender and door-to-door are the reference gaps.
- **Flush glazing:** all glass sits within **0–0.5 mm** of surrounding sheet metal (flush-glazed premium look).

> **Real-time:** the entire Section 2 is authored at **LOD0 (cinematic)**. For the WebGL/phone gameplay build assume **LOD2** as the default in-world car: single welded exterior shell mesh (~45k tris), doors/hood/trunk/flaps as separate meshes only if they animate, all panel gaps baked into normal + AO maps rather than modeled as real geometry. Everything flagged `Real-time:` below tells you what collapses. Target budgets: LOD0 unbounded (film), LOD1 ~180k tris (hero/replay/photo mode), LOD2 ~45k tris (driving), LOD3 ~9k tris (traffic/other cars), LOD4 ~1.5k tris (distant/minimap).

---

### 2.1 Body Shell (Body-in-White) — Master Structure

#### 2.1.1 Overall architecture

- **Purpose/role:** the primary load-bearing monocoque (unibody). It is the structural spine everything else bolts to — suspension via subframes, closures (doors/hood/trunk) via hinges, glass via bonded flanges, and the crash structures at both ends. In-game it is the collision proxy's parent and the rigid body's visual root.
- **Construction (fiction, but physically grounded):** multi-material body-in-white:
  - **Aluminium** extrusions & castings for the front and rear crash rails, shock towers, and the two mega-castings (front and rear).
  - **Hot-formed boron steel** (ultra-high-strength) for the passenger safety cell: A-pillars, B-pillars, roof rails, rocker/sill beams, floor cross-members.
  - **Carbon-fibre reinforced polymer (CFRP)** roof panel option and the central tunnel brace (performance trim).
  - **Cast-magnesium** cross-car beam behind the dash (not visible externally, noted for mass/physics).
- **Geometry envelope:** the BIW occupies the full 5,050 × 1,960 × 1,465 mm envelope minus the closures and bumpers. Skin thickness modeled at **0.9–1.2 mm** for steel panels, **1.5–2.5 mm** for aluminium — relevant for edge highlights and shut-line wall depth at LOD0.
- **Sub-parts (BIW zones):** front-end module (crash rails + shock towers + radiator support), passenger cell (floor, sills, pillars, roof rails, cowl, firewall/bulkhead), rear module (rear rails, wheelhouses, boot floor, rear bulkhead), and the two mega-castings joining them.

**Material — outer skin (default hero paint):**

| Param | Value | Notes |
|---|---|---|
| Preset name | `PAINT_METALLIC_MIDNIGHT_INDIGO` | Hero color |
| Base colour / albedo | #10131C (very dark blue-black) | Under clearcoat |
| Metallic | 0.9 | Metallic flake basecoat |
| Roughness | 0.35 (base) modulated by flake map | Flake normal breaks it up |
| Clearcoat | 1.0 | Full clearcoat layer |
| Clearcoat roughness | 0.03 | Wet, glassy |
| Flake normal | tiled procedural, 0.02 strength | Sparkle under direct light |
| Metallic-flake color shift | subtle cyan→violet | Two-tone flip |

- **Alternate paint presets to author (swap albedo/flake, keep clearcoat):** `SILVER_FROST` (#C7CBD1, metallic 0.95, rough 0.28), `PEARL_WHITE` (#EDEDEA, metallic 0.2 + pearl coat, rough 0.30), `RACING_RED` (#8E0E17, metallic 0.6, rough 0.32), `MATTE_GRAPHITE` (#2A2C2E, metallic 0.4, **clearcoat 0.15, clearcoat roughness 0.6** — matte), `SOLAR_BRONZE` (#6E5636, metallic 0.9, rough 0.30). Provide each as a material instance driving the same master shader.

> **Real-time:** the multi-material BIW is a **modeling/physics-mass concern only** — none of the internal steel/aluminium/CFRP distinction is visible or shipped as separate meshes at any LOD. Ship one welded outer shell. Paint variants become **material-instance parameter sets** (a small MaterialInstanceDynamic with albedo + flake tint + clearcoat toggle), not separate textures. Matte presets flip a single `clearcoatMatte` scalar.

#### 2.1.2 Cowl & plenum (base of windscreen)

- **Purpose:** the transverse structural + water-management zone where windscreen base meets hood trailing edge; houses the HVAC air intake and wiper spindles.
- **Geometry:** ~1,500 mm wide grille-textured plastic cowl panel, ~120 mm deep front-to-back, sitting in the trough between hood trailing edge and windscreen base. Louvered top surface (angled slats ~8 mm pitch).
- **Sub-parts:** cowl grille (perforated plastic), pollen-filter intake box (behind, unseen), wiper spindle grommets (2), washer jet nozzles (see 2.x wipers, cross-ref Section on glazing).
- **Material:** `PLASTIC_TEXTURED_BLACK` — albedo #14161A, metallic 0, roughness 0.7, subtle grain normal. Never body-colored.
- **Rendering notes:** collects visible rain sheeting at LOD0; a good spot for wet-shader pooling.

> **Real-time:** cowl louvers are a **normal-map + AO** detail on a flat strip; no modeled slats below LOD1.

---

### 2.2 Crash Structures & Load Paths

> These are largely **hidden geometry** but they define deformation for any damage/physics model, the mass distribution, and what artists must NOT let intersect. Document fully; ship visibly only if a damage system is enabled.

#### 2.2.1 Front crash structure

- **Purpose:** absorb frontal impact energy, protect the passenger cell, and define front-end deformation. Three parallel load paths.
- **Components & load paths:**
  - **Upper load path:** shotgun rails from shock towers forward to the upper bumper beam mounts.
  - **Main (mid) load path:** two aluminium **crush cans** (frangible octagonal-section extrusions, ~150 mm long, ~90 mm section) between the front bumper beam and the main longitudinal rails. These are the primary programmed crumple.
  - **Lower load path:** subframe front horns feeding into a lower cross-member (catches small-overlap/underride).
  - **Front bumper beam:** aluminium extrusion, ~1,300 mm wide, ~110 mm tall, bow-shaped, behind the fascia.
- **Crumple behaviour (for physics/damage):** progressive collapse front-to-rear — crush cans first (0–50 mm intrusion), then main rails fold at engineered bead lines, firewall is the hard limit. Deformation should propagate as: fascia crush → hood buckle (hinge-line fold) → fender crease → wheel pushed back.
- **Geometry note for artists:** leave **≥60 mm clear** between the back of the fascia and the bumper beam so a crush animation has travel.

> **Real-time:** no separate crash geometry ships. If a damage system exists, implement it as **1–3 blendshapes/morph targets on the front clip** ("light", "medium", "severe" frontal crush) plus a shader-driven crease normal overlay, not soft-body. Traffic cars (LOD3) get zero damage. The crush-can/load-path detail is documentation for the physics programmer's deformation curve only.

#### 2.2.2 Rear crash structure

- **Purpose:** rear-impact energy management + fuel-system (TT-H) / HV-battery (EV) protection.
- **Components:** rear bumper beam (aluminium, ~1,300 mm), two rear crush cans, rear longitudinal rails tying into the boot floor and rear wheelhouses, a rear "kickup" over the axle. On EV, a reinforced cross-member shields the pack's rear.
- **Load path:** bumper beam → crush cans → rear rails → distributed into rocker/sill and boot floor.

> **Real-time:** same as front — morph-target crush at most, else omitted.

#### 2.2.3 Side impact & rollover structure

- **Purpose:** intrusion resistance in side impact; roof-crush resistance in rollover.
- **Components:** door **anti-intrusion beams** (one tubular boron-steel beam per door, diagonal, ~40 mm dia), the **B-pillar** (hot-formed, the strongest single member), reinforced **rocker/sill** (boxed section, on EV doubles as battery side-rail), and roof **bows** (3 transverse). 
- **Load path:** side impact → door beam → B-pillar + rockers → floor cross-members → opposite side.

> **Real-time:** all internal to closed doors/sills — never rendered. Physics uses these only to place the side-collision hardness in the rigid-body proxy.

---

### 2.3 Subframes

> Bolt-on structural carriers for suspension and powertrain. Visible only from **underneath** (photo mode, jack/lift scenes, LOD0 undercarriage). Fully modeled at LOD0/1, simplified below.

#### 2.3.1 Front subframe (cradle)

- **Purpose:** carries front suspension (control arms), steering rack, front anti-roll bar, engine/motor mounts, and forms the lower front load path.
- **Geometry:** cast + extruded aluminium perimeter cradle, roughly 900 mm (L, front-back) × 1,400 mm (W), hollow-section arms ~60–80 mm. Four body mounts (bushing-isolated) to the BIW.
- **Sub-parts:** control-arm pickup points (front/rear bushings), steering-rack mounts, ARB clamps (2), motor/engine mount brackets (2–3), tow-hook boss.
- **Material:** `METAL_CAST_ALU_RAW` — albedo #8A8D90, metallic 1.0, roughness 0.55, cast-surface normal (slightly pebbled); plus `METAL_MACHINED` on bolted faces (roughness 0.3).
- **Physics:** rigidly (bushing-isolated) transfers suspension loads to BIW; in the sim's simplified model, treat as part of sprung mass but note the isolation for NVH/sound.

#### 2.3.2 Rear subframe

- **Purpose:** carries rear multilink suspension, rear ARB, rear motor (EV) / transaxle (TT-H), and the differential (TT-H).
- **Geometry:** cast-aluminium, ~1,000 × 1,450 mm, four isolated body mounts.
- **Sub-parts:** multilink pickups (upper/lower/toe links), motor-mount cradle (EV) or diff mount (TT-H), rear ARB clamps, rear tow-hook boss.
- **Material:** as front subframe.

> **Real-time:** both subframes collapse into the single **underbody mesh** at LOD2 (a mostly-flat plate with a few embossed forms + a good normal/AO bake). Only LOD0/LOD1 (photo mode, garage/lift scenes) get the real cradle geometry. Traffic cars: flat underbody plane, no subframe at all.

---

### 2.4 Roof

#### 2.4.1 Roof panel

- **Purpose:** upper skin, aero surface, structural tie between roof rails; hosts antenna/sensor pod and (option) panoramic glass.
- **Geometry:** single crowned panel ~1,400 mm (W) × ~1,700 mm (L for sedan roof), gentle 15–20 mm crown for rigidity + water shed, tapering into a subtle "double-bubble" at the rear for the coupe-like roofline. Trailing edge blends into the C-pillar/backlight surround.
- **Variants:**
  - **Body-color steel roof** (standard).
  - **CFRP roof** (performance) — exposed 2×2 twill weave option.
  - **Panoramic fixed glass roof** — single bonded pane ~1,300 × 1,100 mm with a sealed perimeter and an electrochromic dimming option.
- **Materials:**
  - Body-color: master paint (2.1.1).
  - CFRP: `CARBON_TWILL_2x2` — albedo dark #1A1B1D with woven anisotropic normal, metallic 0.1, roughness 0.2, clearcoat 1.0, **anisotropy aligned to weave**.
  - Pano glass: `GLASS_ROOF_TINT` — transmission 0.6 (electrochromic can drop to 0.05), tint #202428, roughness 0.02, thin-film IOR 1.5; add `emissive` state for the ambient-lit dimmed mode at night (subtle).
- **Moving parts:** none for fixed pano. **Electrochromic** is a shader state (transmission lerp 0.6↔0.05 over ~2 s), driver = interior "roof dim" control. (No sunroof slide in this flagship — fixed panoramic only, keeps roofline clean.)
- **Rendering notes:** roof is the single biggest reflection surface — must be zebra-clean at LOD0. CFRP weave should scale-hold at close camera.

> **Real-time:** electrochromic tint = one shader scalar. CFRP weave = tiled normal + anisotropy map, not modeled fibers. Pano glass keeps a cheap cubemap/planar reflection at LOD1, static reflection probe at LOD2.

#### 2.4.2 Roof rails / drip rails & antenna pod

- **Drip channels:** shallow longitudinal channels flanking the roof feeding water to A- and C-pillar down-paths. ~6 mm wide, hidden under flush trim on this premium car (laser-brazed roof joint, no exposed channel). Model as a subtle crease at LOD0.
- **Antenna/sensor pod ("shark fin"):** rear-roof fin, ~140 mm long × 70 mm tall, houses GPS/cellular/V2X antennas and (ADAS trim) a rear-facing corner radar-transparent window. Body-color shell over a black base.
  - Material: body paint shell + `PLASTIC_GLOSS_BLACK` base gasket.
- **Roof-mounted forward sensor cluster (ADAS/autonomy trim):** a slim housing at the windscreen top edge / front roof for the forward camera + optional lidar window (radar/lidar-transparent smoked cover). Cross-ref the sensors section; noted here because it breaks the roof/windscreen shut-line.

> **Real-time:** shark fin stays (silhouette-defining) down to LOD3, then merges into roof at LOD4. Drip rails are normal-map only.

---

### 2.5 Pillars (A / B / C)

> Structural + styling. Visible outer skin is the "greenhouse" trim; inner is safety-cell steel (2.2.3). Document outer geometry, trim, and glass interfaces.

#### 2.5.1 A-pillars

- **Purpose:** windscreen surround, roof front support, primary rollover + frontal-oblique structure; routes wiring/airbag (curtain) internally.
- **Geometry:** raked ~62° from vertical (fast, sporty rake), ~90 mm visible width, running from cowl/fender junction up to the roof front corner. Blackout trim inboard where it meets the windscreen.
- **Sub-parts:** windscreen bonding flange (inboard), A-pillar exterior trim (body-color), A-pillar-to-mirror "sail" panel (small triangular panel carrying the mirror base + a quarter-window on some trims).
- **Material:** body paint; blackout inner edge `PLASTIC_MATTE_BLACK` (albedo #0C0D0F, rough 0.85).

#### 2.5.2 B-pillars

- **Purpose:** central roof support, front-door latch strike, rear-door hinge mount, seatbelt upper anchor, side-impact keystone.
- **Geometry:** near-vertical, ~110 mm wide, from rocker to roof rail. Exterior almost always finished in **gloss black** "piano" trim to visually thin the greenhouse (classic premium cue), even on body-color cars.
- **Sub-parts:** gloss-black applique (bonded/clipped), front-door striker plate, rear-door upper hinge, curtain-airbag path (internal), belt-height adjuster slot (internal).
- **Material:** `TRIM_PIANO_BLACK` — albedo #050506, metallic 0.1, roughness 0.05, clearcoat 1.0 (mirror gloss, fingerprint-prone look). Optional gloss-black is a swap to body-color or satin per trim.
- **Rendering notes:** piano black is a strong specular element — needs a clean HDRI reflection; smudge/fingerprint detail map is a nice LOD0 touch.

#### 2.5.3 C-pillars

- **Purpose:** rear roof support, backlight (rear window) surround, ties roof to rear quarter and boot shelf; rollover structure.
- **Geometry:** broad, raked ~55°, blending roof trailing edge into the rear quarter/haunch. This is a signature styling surface (the "sail panel") — wide at the base, tapering up. ~250 mm visible width at base.
- **Sub-parts:** backlight bonding flange, optional "hidden" quarter-glass or body-color blade, maker-emblem or model-script badge location (rear quarter).
- **Material:** body paint; may carry a satin-chrome or gloss-black accent blade `TRIM_SATIN_CHROME` (albedo #C9CDD2, metallic 1.0, roughness 0.25).

> **Real-time:** pillar trims (piano black, chrome blade) are **material zones on the shell**, not separate meshes, at LOD2+. Blackout edges bake into the texture. Curtain-airbag/belt internals never render.

---

### 2.6 Quarter Panels & Rear Haunches

- **Purpose:** rear side skin over the wheelhouse; carries the fuel/charge flap, defines the muscular rear "haunch" stance, forms the rear wheel arch, and blends into the rear bumper and boot shut-line.
- **Geometry:** large one-piece stamped/formed panels (left/right), from the rear door shut-line back to the tail. Pronounced haunch: the surface swells **~35–45 mm** outboard over the rear wheel centerline (the widest point of the car, 1,960 mm) then tucks back to the tail. A sharp character line runs from the door into the taillight.
- **Sub-parts:** wheel-arch lip (rolled/flared ~15 mm), fuel or charge flap aperture (see 2.9), quarter-glass lower frame, boot shut-line flange, rear side-marker/reflector recess, C-pillar blend.
- **Panel-gap detail (artists):** quarter-to-door gap **3.5 mm**; quarter-to-boot-lid gap **3.5 mm** following the taillight top edge; quarter-to-bumper gap **3.5 mm** with a sight-line that hides the join under the character line.
- **Material:** master body paint. Wheel-arch inner lip transitions to body-color (painted arch, premium) — no black plastic arch trim on this flagship.

> **Real-time:** quarters are part of the single welded shell at all LODs; the haunch swell is real geometry (silhouette-critical) even at LOD3, only flattening at LOD4.

---

### 2.7 Doors

> Four doors (front L/R, rear L/R). Frameless-window "hardtop" style on this coupe-sedan — the glass seals directly to the roof rail with no upper door frame, a signature premium/performance cue. This drives special sealing + glass-drop behaviour.

#### 2.7.1 Door outer skin & structure

- **Purpose:** occupant enclosure, side-impact protection host, mounting for glass/regulator/handle/mirror/latch/speakers; primary "interactable" for entry animation and gameplay.
- **Geometry (front door):** ~1,050 mm long × ~950 mm tall (skin), curved to match body side. **Frameless** upper edge — only the sheet-metal belt-line and below is structural door; glass rises above it unframed. Rear door ~950 mm long.
- **Construction layers (outer→inner):** outer skin (paint) → anti-intrusion beam + inner stamping (structure) → wiring/regulator/speaker cavity → water/vapor barrier membrane → inner trim (interior spec). 
- **Sub-parts:** outer skin, inner shell, window aperture, belt-line garnish (outer weatherstrip "felt"), lower shut-line, hinge mounts (2), latch/striker, check-arm, handle cavity, mirror mount (front doors), side-marker (some markets).
- **Material:** master body paint on outer skin. Belt-line garnish `TRIM_SATIN_CHROME` or gloss black per trim. Lower door edge inner face `PLASTIC_MATTE_BLACK`.

#### 2.7.2 Door hinges & check

- **Purpose:** swing axis + hold-open detents.
- **Geometry:** two forged hinges per door (upper/lower), pin axis near-vertical, raked ~4° so doors self-close-assist on a slope. Hinge pin at the front (A-pillar for front doors, B-pillar for rear).
- **Moving parts / animation:**
  - **Axis:** vertical (local door Y), located at hinge-pin line ~along the front door edge.
  - **Range:** 0° (closed) → **67°** (full open), with a soft detent at ~28° (first stop) and ~50° (second stop). Rear doors open to ~80° (easier entry).
  - **Driver:** door-open interaction (player click / entry cinematic / AI valet). Check-arm gives the two detents — animate as eased holds, not free swing.
- **Material:** `METAL_FORGED_BLACK` hinges (rough 0.4), hidden when closed.
- **Gameplay:** door is a primary interactable — hover highlight, open/close toggle, entry camera. Collision: when open, the door swings its own collider (important for tight-garage / door-ding gameplay and for not clipping walls).

> **Real-time:** doors ship as **separate meshes only if they animate** (hero/player car: yes; traffic cars: welded shut, no hinge). Two hinges → single revolute joint in physics. Detents = animation curve, not physics. Check-arm never modeled visibly.

#### 2.7.3 Door seals, weatherstripping & drainage

- **Purpose:** water/wind/noise sealing; critical for the frameless glass.
- **Sub-parts:**
  - **Primary door seal:** EPDM bulb seal on the door aperture flange (full perimeter), ~12 mm bulb.
  - **Secondary/tertiary seals:** frameless cars use **two to three** concentric seals at the roof-rail glass contact for wind noise.
  - **Belt-line seals ("felts"):** inner + outer wiper strips where glass exits the door top — flocked, matte.
  - **Glass upper seal:** a channel in the roof rail / A-pillar the frameless glass tucks into when closed.
  - **Drain holes:** in the bottom of the door cavity (3–4 per door, ~8 mm) letting water that runs down inside the glass escape below.
- **Material:** `RUBBER_SEAL_MATTE` — albedo #0A0A0B, metallic 0, roughness 0.9, soft normal; flocked felts get a micro-fiber sheen (rough 0.95, faint anisotropy).
- **Rendering:** seals read as the dark recess framing every closed panel — essential for shut-line believability at LOD0.

> **Real-time:** seals = a dark, soft-normal strip baked into the shell texture at the door aperture; modeled bulb geometry only at LOD0/LOD1. Drain holes never modeled — texture dots at most.

#### 2.7.4 Frameless drop-glass behaviour

- **Purpose:** frameless windows must **auto-drop ~8–10 mm** when the door handle is pulled (to clear the roof-rail seal) and **rise to re-seal** when the door shuts. Signature detail.
- **Moving parts / animation:**
  - **Axis:** glass slides along the door's regulator rails (near-vertical, slightly curved to match glass arc).
  - **Range:** full-up (sealed) → short auto-drop (~9 mm) on handle-pull → returns to full-up on latch; separately, full manual travel down to fully retracted (~380 mm drop) for open-window.
  - **Driver:** handle interaction triggers the short drop; window switch drives full travel; door-close triggers re-seal rise.
- **Rendering:** glass = `GLASS_SIDE_TINT` (transmission 0.55, tint #1C2024, rough 0.02, IOR 1.5; privacy-tinted rears at transmission 0.3).

> **Real-time:** keep the **auto-drop-on-open** as a tiny animation offset on the player car (it's a "wow" detail cheaply done). Full window roll-down: animatable on player car, static-closed on traffic. Below LOD2, windows are non-openable and glass is a fixed pane.

#### 2.7.5 Exterior door handles — flush / deploying

- **Purpose:** entry; a signature electrified-flagship "flush deploying handle."
- **Geometry:** handle sits **flush** with the door skin when parked/driving (aero + clean surface). Paddle-style, ~140 mm long × 30 mm tall, body-color cap.
- **Moving parts / animation:**
  - **Axis:** the handle **presents** (deploys) by translating/rotating outboard ~22 mm to meet the hand.
  - **Sequence (driver = key approach / door touch / unlock):** (1) proximity/unlock → handle motors out (deploy, ~0.6 s eased); (2) player pulls → handle pivots ~15° about its rear edge, actuating the latch cable/switch; (3) after drive-away or lock → handle retracts flush (~0.8 s).
  - **Presentation states to author:** `flush` (0 mm), `deployed` (22 mm out), `pulled` (deployed + 15° pivot).
- **Sub-parts:** handle cap (body-color), pivot mechanism (hidden), capacitive **lock/unlock touch sensors** (see 2.7.6), a small courtesy LED under the handle that washes the door at approach (`emissive`, warm white, animated fade-in on approach).
- **Material:** body paint cap; mechanism `PLASTIC_MATTE_BLACK`; courtesy LED emissive #FFE3B0.
- **Gameplay:** approach-to-unlock choreography; handle deploy is a strong "car is alive" beat. Interactable hotspot for entry.

> **Real-time:** the deploy animation is worth keeping on the **player car** (2-state or 3-state morph/anim, cheap). Traffic cars: handles modeled flush and static (or baked into skin). The courtesy LED = a small emissive quad + light, dropped below LOD2. Capacitive sensor = interaction trigger only, no geometry.

#### 2.7.6 Hidden door sensors

- **Purpose:** capacitive lock/unlock pads and anti-pinch/obstacle sensing.
- **Components (all non-visible):**
  - **Lock pad:** capacitive zone on the outer handle top face — touch to lock.
  - **Unlock pad:** capacitive zone on the handle's inner grip — touch to unlock/deploy.
  - **Approach/proximity:** part of the key-fob/UWB system, senses the fob within ~1.5 m to pre-deploy handles + wake courtesy lights.
  - **Anti-pinch:** current-sensing in the window regulator + (optional) a soft-close cinching latch sensor on the door.
- **Rendering/geometry:** none — these are **interaction volumes / triggers** for gameplay (approach → deploy → unlock choreography). Documented so the gameplay programmer wires the state machine; artists model nothing.

> **Real-time:** pure gameplay triggers; zero geometry at every LOD.

---

### 2.8 Fuel Filler Flap (TT-H variant)

- **Purpose:** covers the fuel filler neck (petrol, TT-H hybrid). Deleted on EV.
- **Geometry:** body-color flap, ~150 × 130 mm, on the **rear left** quarter panel (opposite the charge port on TT-H). Flush-fit, spring-hinged at its forward edge, panel gap 3.5 mm all around.
- **Sub-parts:** outer flap (body-color), hinge (spring, forward edge), push-push latch (press to pop), inner seal ring, capless filler funnel (no separate fuel cap on this flagship — spring-loaded flapper neck), a small "petrol only / octane" label inside.
- **Moving parts / animation:**
  - **Axis:** horizontal hinge along the flap's forward edge.
  - **Range:** closed (flush) → open ~90° (or a soft ~75° rest).
  - **Driver:** press-to-open (push-push) or interior release; refuel interaction (gameplay: visit station).
- **Material:** body paint outer; inner face + funnel `PLASTIC_MATTE_BLACK`; a `TRIM_SATIN_CHROME` filler-neck ring.
- **Gameplay:** fuel-stop mechanic for TT-H (range management if modeled). Interactable at stations.

> **Real-time:** flap animates on the player TT-H car only; a simple hinge anim. Capless funnel internals modeled at LOD0/1, a dark cavity below that. Traffic: static closed / baked.

---

### 2.9 Charging Port Flap (EV variant; AC-only flap on TT-H)

- **Purpose:** covers the charge inlet. On EV: a combined **CCS-style** inlet (AC + DC fast). On TT-H: a smaller AC-only inlet (plug-in hybrid charging).
- **Geometry:** body-color flap on the **rear right** quarter (EV) — ~170 × 150 mm; forward or top hinge. Behind it, the inlet housing with an illuminated ring.
- **Sub-parts:**
  - Outer flap (body-color, flush, 3.5 mm gap).
  - Inner **dust cover(s)** — hinged caps over the AC and DC pins.
  - **Charge inlet** — fictional but plausible combined connector: upper AC 7-pin + lower DC 2-pin cluster, in a black `PLASTIC_MATTE_BLACK` housing with metal contacts `METAL_MACHINED` (rough 0.3).
  - **Charge-status LED ring** — emissive ring around the inlet: pulsing (charging), solid green (full), red (fault), breathing amber (negotiating). `emissive` animated.
  - Latch/actuator (motorized soft-open) + connector-lock solenoid (holds plug during charge).
- **Moving parts / animation:**
  - **Flap axis:** hinge along one edge; closed → open ~95°, motor-driven soft open (~0.7 s eased) on approach/interior release/app.
  - **Dust caps:** small flip-open pivots.
  - **Driver:** charge interaction (plug in at a charger — gameplay economy/energy).
- **Material:** body paint flap; housing matte black; contacts machined metal; LED ring emissive (state-driven color).
- **Gameplay:** EV charging mechanic (energy management if modeled); the LED ring is a readable at-a-glance state. Strong "plug-in" beat.

> **Real-time:** flap + LED ring kept on player EV; ring = emissive material with a state color/animation param. Inlet pins modeled at LOD0/1, a textured black recess below. TT-H's small AC flap same treatment. Traffic EVs: static closed flap, ring off.

---

### 2.10 Trunk / Boot & Lid

- **Purpose:** rear cargo enclosure; the boot lid is a rear closure with an integrated lip spoiler; hosts license plate, tail-light inner sections, and rear badging.
- **Geometry:** boot lid ~1,300 mm wide, ~700 mm deep, spanning between the rear quarters and above the rear bumper. Integrated **ducktail lip spoiler** at the trailing edge (~15 mm rise). Boot opening reveals a ~450 L trunk well.
- **Sub-parts:**
  - Boot lid outer skin (body-color) + inner stamping.
  - Two gooseneck or four-bar hinges (see below).
  - Gas struts / electric strut actuators (power lid).
  - Latch + striker + soft-close cinch motor.
  - License-plate recess + plate lamps (emissive) + maker emblem + model script + variant badge ("TT-H" / "EV", fictional).
  - Rear wiper — **none** (sedan, clean backlight).
  - Boot-well liner, cargo tie-downs, subwoofer (TT-H) / frunk cross-ref (EV has a front trunk, see hood).
  - Emergency interior boot-release (glow tab, regulatory).
- **Moving parts / animation:**
  - **Axis:** transverse horizontal hinge at the boot's forward (leading) edge, near the parcel shelf line.
  - **Range:** closed → open ~80° (power lid stops at a set angle; hands-free kick-sensor option).
  - **Driver:** power tailgate button / key / kick sensor; soft-close cinch pulls the last ~6 mm shut.
- **Material:** body paint; plate lamps emissive warm white; badges `TRIM_SATIN_CHROME` / gloss black; seal `RUBBER_SEAL_MATTE`.
- **Panel gaps:** lid-to-quarter 3.5 mm, lid-to-bumper 3.5 mm; shut-line follows the taillight upper edge for a clean sight-line.

> **Real-time:** boot animates on player car (single revolute joint + soft-close as anim tail); struts non-modeled (implied). Badges = normal/AO + a small metal material zone, not separate meshes below LOD1. Traffic: welded shut.

---

### 2.11 Bonnet / Hood & Engine-Bay Covers

#### 2.11.1 Hood (bonnet)

- **Purpose:** covers the engine bay (TT-H) or **frunk** (EV front trunk); pedestrian-safety deformation zone; large Class-A surface with signature power-dome + character lines.
- **Geometry:** clamshell hood ~1,500 mm wide × ~1,100 mm long, wrapping down the sides slightly (over the fender tops) for flush shut-lines. Central power-dome, two subtle "power crease" lines converging toward the grille. Optional functional hood vents (TT-H, for underhood heat extraction).
- **Sub-parts:** outer skin + inner reinforcement (with pedestrian-crush ribs), two hinges (rear-hinged, opens front-up), gas struts or (flagship) powered pop-up + prop, **hood latch** (primary) + **safety catch** (secondary, the finger-lift), sound-deadening/heat blanket underside, washer-fluid fill under-hood (TT-H) / low-voltage service point.
- **Moving parts / animation:**
  - **Axis:** transverse hinge at the hood's rear edge (cowl line).
  - **Range:** closed → open ~55° (prop/strut held). Two-stage release: cabin lever pops to safety-catch (~15 mm), then manual finger-lift of the secondary latch → full open.
  - **Pedestrian pop-up (safety):** the hood rear edge can pyro-lift ~80 mm on pedestrian impact (deployable hood). Author as an optional damage/impact state.
  - **Driver:** service/inspection interaction; frunk-open (EV).
- **Material:** body paint; underside heat blanket `INSULATION_MATTE` (albedo #17181A, rough 0.95, quilted normal); latch mechanism `METAL_MACHINED`.
- **Panel gaps:** hood-to-fender 3.5 mm (the reference gap), hood-to-cowl 4.0 mm (slightly wider, hidden in cowl shadow), hood front-to-fascia 3.5 mm.

> **Real-time:** hood animates on player car (revolute joint); pedestrian pop-up only if a damage system exists (else omit). Underhood blanket only visible when open (LOD0/1). Traffic: welded shut.

#### 2.11.2 Engine-bay covers (TT-H) / Frunk tub (EV)

- **TT-H engine cover:** a molded plastic acoustic + aesthetic cover over the V6, ~700 × 500 mm, with the maker-emblem embossed, hiding the intake plenum. Material `PLASTIC_SOFT_TOUCH_BLACK` (albedo #131416, rough 0.7, soft-touch micro-normal) with a `TRIM_SATIN_CHROME` emblem. Surrounding bay: strut-tower brace (`METAL_MACHINED`/anodized), fluid reservoirs (translucent `PLASTIC_TRANSLUCENT` with min/max marks + colored coolant/washer fluid), wiring looms, hoses.
- **EV frunk:** a molded cargo tub ~90 L, `PLASTIC_TEXTURED_GRAY` liner (albedo #3A3C3F, rough 0.85), drain plug, a light, and a sealed lid over the front e-motor/inverter (visible cover only, `PLASTIC_SOFT_TOUCH_BLACK` with emblem).
- **Rendering:** only seen when hood open (garage/inspection/photo). Rich greeble opportunity at LOD0.

> **Real-time:** the whole bay is a **single detailed greeble mesh** revealed on hood-open at LOD0/LOD1; at LOD2 a simplified filled block; never seen at LOD3+. Fluid translucency = cheap fake (no real refraction below LOD1).

---

### 2.12 Undercarriage, Skid Plates, Heat Shields & Aero

> The full bottom of the car — seen in jumps, ramps, lifts, crashes, photo mode's low angles, and reflective wet roads. Model as a coherent underbody, not an afterthought.

#### 2.12.1 Underbody / flat floor

- **Purpose:** structural floor, aero (flat underfloor for low Cd), routing for exhaust (TT-H) / battery (EV).
- **Geometry:** near-flat aero floor panels spanning front subframe to rear diffuser. On EV, the **battery pack** IS the visible floor — a large sealed aluminium tray (~1,900 × 1,500 mm) with a cooling-plate rib pattern and module seams. On TT-H, a mix of flat plastic aero panels + exposed exhaust + prop-shaft tunnel.
- **Sub-parts:** front aero tray, center floor panels, rear diffuser (see 2.12.5), transmission/battery tunnel, NACA-style cooling ducts, drain grommets.
- **Material:**
  - Aero panels `PLASTIC_UNDERBODY_MATTE` — albedo #1B1C1E, rough 0.85, road-grime dirt layer (dirt mask, brownish #3A2E22 in recesses).
  - EV battery tray `METAL_CAST_ALU_RAW` with a sealed-panel normal + torx-bolt pattern.

#### 2.12.2 Skid plates

- **Purpose:** protect vulnerable low components (front subframe/motor, battery leading edge, rear diff) from ground strikes / debris.
- **Components:** front skid plate (aluminium/composite, ~600 × 400 mm, leading underedge), battery front skid (EV, reinforced ramp so kerbs slide under), rear skid over the diff/motor.
- **Material:** `METAL_BRUSHED_ANODIZED` (albedo #6E7174, metallic 1.0, rough 0.4, brushed anisotropic normal) or dark composite `PLASTIC_UNDERBODY_MATTE`; add scuff/scrape wear mask on leading edges.
- **Gameplay/physics:** these are the contact points in a bottom-out; spark VFX + scrape SFX anchor here on scrapes.

#### 2.12.3 Heat shields (TT-H) & battery thermal shields (EV)

- **Purpose:** TT-H — shield floor/fuel-tank/cabin from exhaust + turbo heat. EV — thermal barrier under the pack.
- **Components:** stamped **aluminized/embossed metal** shields following the exhaust run (turbo down-pipe shield, cat shield, muffler shield, over-tank shield). Dimpled/embossed for stiffness + a signature bright crinkled look.
- **Material:** `METAL_HEATSHIELD` — albedo #B8BBBE, metallic 1.0, roughness 0.5, **crinkled/dimpled normal**, subtle iridescent heat-tint near the turbo (blue/gold thin-film gradient). Strong hero-detail under LOD0 low cameras.

#### 2.12.4 Exhaust system (TT-H only)

- **Purpose:** route + treat + quiet exhaust gases; visible tailpipes are a styling feature.
- **Components:** twin-scroll turbo down-pipes → catalysts → center resonator → rear mufflers → **quad exhaust tips** (visible, oval ~90 mm, `METAL_POLISHED_CHROME` albedo #C9CCCF metallic 1.0 rough 0.12, blued/sooted inner `METAL_BURNT` rough 0.6). Active exhaust valves (butterfly) inside — a sound/animation trigger, not visible.
- **Moving parts:** exhaust valve butterflies (sound-mode driven; no external anim). Tips can have subtle heat-shimmer emissive at high load (LOD0).
- **EV note:** **no exhaust** — rear bumper has sealed diffuser blades where tips would be; do NOT show tips on EV.

#### 2.12.5 Aerodynamic channels & rear diffuser

- **Purpose:** manage underbody airflow for downforce + cooling + low Cd.
- **Components:** front air-curtain inlets (fascia corners → out through wheel-arch slots, smoothing front-wheel wake), **brake-cooling ducts** (fascia → to front rotors), underfloor strakes/fences (longitudinal fins directing air), **rear diffuser** (multi-strake expansion ramp under rear bumper, 5–7 vertical fins), **active rear spoiler** (see below).
- **Rear diffuser material:** `PLASTIC_GLOSS_BLACK` fins or exposed-CFRP (`CARBON_TWILL_2x2`) on performance trim.
- **Active aero:**
  - **Rear spoiler:** deployable from the boot ducktail — retracted flush (parked/low speed) → deploys up + tilts at speed/braking. Axis: transverse hinge + linear rise; range ~0→60 mm up, 0→25° tilt (air-brake mode steeper). Driver: speed threshold / braking / manual.
  - **Active grille shutters** (front): open for cooling, close for aero (see fascia section / Section 3). 
- **Air-curtain / wheel-arch venting:** slots behind front arches (in the fender) exhausting arch pressure — a functional + styling slot.

> **Real-time:** the whole underbody is **one baked plate** with a strong normal+AO+dirt bake at LOD2; skid plates/heat shields/exhaust are modeled only at LOD0/LOD1 (photo, ramp cams). Quad tips: keep as small meshes down to LOD2 (visible from behind), merge at LOD3. Rear diffuser fins: real geo at LOD0/1, normal-mapped strip at LOD2. **Active spoiler & grille shutters kept as animated meshes on the player car** (visible, gameplay-linked to speed) but static-retracted on traffic. EV underbody = the flat battery tray, cheapest of all.

---

### 2.13 Wheel Arches & Fender Liners

#### 2.13.1 Wheel arches (openings)

- **Purpose:** clear the wheel/tyre through full suspension + steering travel; define stance; house the liner.
- **Geometry:** four arches; fronts steer so they're larger-radius. Arch lip is **body-color rolled flange** (~15 mm), flush-flared to cover the tyre to the legal width. Design gap tyre-to-arch (design height) ~ generous show stance but must clear full jounce (~90 mm bump travel) — model the arch inner clearance accordingly.
- **Material:** body paint outer lip; inner arch face transitions to the liner.

#### 2.13.2 Fender liners (arch liners / splash shields)

- **Purpose:** shield the body cavity from water, mud, road debris, tyre spray; NVH (dampen tyre roar); house some sensors/washer lines.
- **Geometry:** molded plastic (often textured "hairy"/felt-lined on premium for acoustics) liners lining each arch, ~2–3 mm shells conforming to the arch.
- **Sub-parts:** front liners (with brake-duct pass-through + sometimes a fold-back access to the headlight bulb/module + washer-pump access), rear liners, **aeroacoustic felt** patches, retaining clips/screws (visible from inside arch).
- **Material:** `PLASTIC_ARCH_TEXTURED` — albedo #202124, metallic 0, roughness 0.9, coarse pebble/dimple normal; felt zones `FELT_ACOUSTIC` (rough 0.97, fuzzy micro-normal). Heavy dirt/wet-grime mask in recesses.
- **Rendering:** the dark liner behind the wheel is what makes the wheel read as "inset," not stuck-on — important at all mid LODs.

> **Real-time:** liners simplify to a **single dark concave shell per arch** (kills the see-through-to-sky error) by LOD2, with dirt baked in; felt/clips only at LOD0/1. At LOD3 the arch is a flat dark cap. Never let the arch show sky/ground-through at any LOD — it reads instantly as fake.

---

### 2.14 Plastic Trim, Cladding & Brightwork (Exterior)

- **Purpose:** functional + decorative non-body-color exterior elements; unifies the design language.
- **Components & materials (catalog for artists):**

| Trim item | Location | Material preset | Key PBR |
|---|---|---|---|
| Front lower splitter/lip | Fascia bottom | `PLASTIC_GLOSS_BLACK` or CFRP | albedo #060607, metal 0.1, rough 0.05, cc 1.0 |
| Side sill extensions | Below doors | `PLASTIC_GLOSS_BLACK` / body-color | as above |
| Window belt-line trim | Along glass base | `TRIM_SATIN_CHROME` | albedo #C9CDD2, metal 1.0, rough 0.25 |
| Window surround (frameless) | Around DLO | Gloss black or satin | per trim |
| B-pillar applique | B-pillar | `TRIM_PIANO_BLACK` | albedo #050506, metal 0.1, rough 0.05, cc 1.0 |
| Maker emblems (F/R) | Grille, boot, wheels | `TRIM_SATIN_CHROME` + `EMISSIVE` (front, illuminated option) | metal 1.0 rough 0.2; front emblem can backlight (emissive ring) |
| Model/variant script | Boot, fenders | Satin chrome / gloss black | small, crisp |
| Lower door cladding edge | Door bottoms | `PLASTIC_MATTE_BLACK` | albedo #0C0D0F, rough 0.85 |
| Mirror caps | Mirrors | Body-color / gloss black / CFRP | per trim |
| Roof-rail garnish | Roof edge | Satin/gloss | per trim |
| Wiper arms & cowl | Base of screen | `PLASTIC_SATIN_BLACK` | albedo #16171A, rough 0.5 |
| Badge backing gaskets | Under emblems | `PLASTIC_GLOSS_BLACK` | seal look |

- **Illuminated front emblem (option):** the maker emblem's outer ring can be backlit (welcome/charging cue) — `EMISSIVE` #FFFFFF or brand-cyan #4FD8E0, animated on approach. Regulatory: off while driving in many markets — model as a state.
- **Rendering notes:** brightwork (satin chrome) is a key material-read differentiator vs. gloss black trims; keep both distinctly tuned so the car doesn't go "all black plastic." Fingerprint/dust detail on piano-black at LOD0.

> **Real-time:** all trim is **material zones on the shell** at LOD2+, distinguished by the material ID / mask, not separate meshes — EXCEPT the splitter/spoiler/mirror caps which stay meshes (silhouette). Illuminated emblem = emissive param + small light, dropped at LOD2. Satin chrome vs piano black must survive as distinct masked materials even in the atlas — don't merge them.

---

### 2.15 Jack Points, Tow Points & Service Access (Exterior/Underbody)

- **Jack points:** four reinforced pinch-weld/boss points on the rockers (behind small notches in the sill), ~200 mm inboard of each wheel. Marked by a small triangle/notch in the sill trim. Used by the lift/garage scene and any tyre-change interaction.
  - Material: reinforced sill area body-color; the jack pad boss `METAL_MACHINED`.
- **Tow points:** threaded **tow-hook eyes** front & rear — hidden behind small **removable fascia covers** (body-color pop-out caps, ~50 mm, spring or clip). The screw-in tow hook lives in the boot toolkit. Model the caps (closed by default) + the threaded boss behind.
  - Cap material: body paint; boss `METAL_MACHINED`.
- **Lifting/garage use (gameplay):** in a lift/inspection scene the car rises on jack points; wheels-off states expose the arch/brake internals (cross-ref brakes/suspension section).

> **Real-time:** jack-point notches + tow-cap = **texture/normal detail** at LOD2; the tow cap is a real openable mesh only if a tow/recovery mechanic exists (LOD0/1 otherwise). Boss geometry only when a wheel/lift scene needs it.

---

### 2.16 Panel-Gap & Shut-Line Master Reference (for Artists)

A consolidated table so every artist uses the same gaps. All values are **visible outer gap**, doors/panels closed, at design temperature.

| Shut-line | Nominal gap | Flush/offset | Notes |
|---|---|---|---|
| Hood ↔ fender | 3.5 mm | flush ±0.3 | THE reference gap; keep perfectly parallel |
| Hood ↔ cowl | 4.0 mm | hood 0.5 proud | hidden in cowl shadow |
| Hood ↔ front fascia | 3.5 mm | flush | continuous with headlight top |
| Front door ↔ fender | 3.5 mm | flush | character line must continue across |
| Front door ↔ rear door | 3.5 mm | flush | the "hero" vertical gap; dead straight |
| Rear door ↔ quarter | 3.5 mm | flush | |
| Door ↔ rocker/sill (bottom) | 4.0 mm | door 0.5 proud | |
| Boot lid ↔ quarter | 3.5 mm | flush | follows taillight top edge |
| Boot lid ↔ rear fascia | 3.5 mm | flush | |
| Fuel/charge flap ↔ quarter | 3.0 mm | flush | tighter, premium |
| Glass ↔ sheet metal (flush glazing) | 0–0.5 mm | glass flush | bonded, minimal reveal |
| Fascia ↔ fender (front) | 3.5 mm | flush | |
| Fascia ↔ quarter (rear) | 3.5 mm | flush | |
| Mirror base ↔ sail panel | 2.5 mm | flush | |

- **Gap construction (LOD0):** every gap is real geometry with a **visible wall depth of 8–12 mm** into a dark recess (the seal); edges get a **0.5–0.8 mm chamfer/bevel** so the clearcoat catches a highlight (no razor edges — they read as CG).
- **Character-line continuity:** the main body character line (door-to-fender-to-quarter) must be **geometrically continuous across shut-lines** — mismatch here is the #1 tell of a fake car. Lock a shared spline before splitting panels.
- **Consistency rule:** gaps parallel and constant along their length; no tapering. Tape-out a reference on the model.

> **Real-time:** at LOD2 the gaps are **not modeled** — they are baked into the normal map (a shallow groove) + AO (the dark line) + a subtle roughness bump (grime in the crease). This single bake is what makes a low-poly welded shell still read as panelled. Keep the character-line continuity in the **silhouette/geometry** even at LOD3; keep the gap bake in the texture down to LOD2, drop it at LOD3.

---

### 2.17 Summary Bill-of-Materials (Exterior Body Materials)

Quick reference of every distinct exterior material ID authored above (for the material artist's master library):

- `PAINT_METALLIC_MIDNIGHT_INDIGO` (+ variants: SILVER_FROST, PEARL_WHITE, RACING_RED, MATTE_GRAPHITE, SOLAR_BRONZE) — master body paint shader
- `CARBON_TWILL_2x2` — exposed carbon (roof, splitter, diffuser, mirror caps)
- `TRIM_PIANO_BLACK` — B-pillar, badges backing, gloss accents
- `TRIM_SATIN_CHROME` — brightwork, emblems, window belt
- `PLASTIC_GLOSS_BLACK` — splitter, sills, diffuser fins
- `PLASTIC_MATTE_BLACK` / `PLASTIC_SATIN_BLACK` — lower cladding, wiper arms, mechanisms
- `PLASTIC_SOFT_TOUCH_BLACK` — engine/motor covers
- `PLASTIC_TEXTURED_BLACK` — cowl grille
- `PLASTIC_ARCH_TEXTURED` + `FELT_ACOUSTIC` — fender liners
- `PLASTIC_UNDERBODY_MATTE` — aero floor panels
- `PLASTIC_TRANSLUCENT` — fluid reservoirs
- `RUBBER_SEAL_MATTE` — all weatherstrips/seals
- `METAL_CAST_ALU_RAW` / `METAL_MACHINED` / `METAL_FORGED_BLACK` — subframes, hinges, bosses
- `METAL_BRUSHED_ANODIZED` — skid plates
- `METAL_HEATSHIELD` — exhaust heat shields (crinkled, heat-tinted)
- `METAL_POLISHED_CHROME` / `METAL_BURNT` — exhaust tips (TT-H)
- `INSULATION_MATTE` — hood underside blanket
- `GLASS_ROOF_TINT` / `GLASS_SIDE_TINT` — glazing (electrochromic roof, tinted sides)
- `EMISSIVE` states — courtesy LEDs, illuminated emblem, charge-status ring, plate lamps

> **Real-time:** for LOD2 gameplay, this collapses to roughly **5–7 master materials** in one or two texture atlases: (1) body paint (parametric), (2) a "trim atlas" packing chrome/piano-black/matte-plastic/glass-frame via masks, (3) underbody+arch+dirt, (4) glass, (5) emissive. Everything above maps into these via material-ID masks baked from the LOD0 assignments.
## 3. Exterior — Front Fascia & Lighting

> **Model designation:** *the Vehicle* — internal codename **"Auriga GT"** (fictional electrified performance flagship). Two drivetrain trims share one body-in-white and one fascia shell:
> - **Auriga GT-H** — 3.0 L twin-turbo inline-six mild-hybrid; requires maximum cooling airflow (grille shutters, brake ducts, air curtains all functional).
> - **Auriga GT-E** — full battery-electric; front "grille" volume is largely blanked/aero-sealed, radar aperture retained, active shutters mostly closed, extra sensor hardware.
>
> All emblems are the fictional **"maker emblem"** — a stylised interlocked double-chevron inside a rounded lozenge. No real-world trademarks, typefaces, or logos anywhere on the fascia.

**Global fascia envelope (bounding reference for all subassemblies below)**

| Metric | Value | Notes |
|---|---|---|
| Overall fascia width | 1,960 mm | body-colour outer, widest at wheel-arch shoulders |
| Fascia height (ground → hood shut line) | 720 mm | from air-dam lip to leading edge of clamshell hood |
| Front overhang (axle → bumper tip) | 875 mm | |
| Approach angle | 13.5° | air-dam lip is the lowest, first-contact point |
| Lowest point (air-dam splitter lip) | 118 mm ground clearance | deformable in physics |
| Fascia shell wall thickness | 3.2 mm nominal | injection-moulded TPO, modelled as shell for LOD0 |
| Panel gap (fascia ↔ hood / fender) | 3.5 mm ±0.5 | consistent shut-line for material/AO baking |

**Coordinate & orientation convention (used throughout this doc):**
- **+X** = vehicle right (passenger side in LHD Bulgaria-market car), **+Y** = up, **+Z** = forward (direction of travel). Origin at centre of front axle, ground plane Y=0.
- "Inboard/outboard" = toward/away from centreline. "Leading/trailing" = forward/rearward along Z.

---

### 3.1 Front Bumper Assembly (upper fascia shell + lower bumper)

#### 3.1.1 Upper fascia shell (main bumper cover)
- **Purpose/role:** primary body-colour cover spanning fender-to-fender; carries the maker emblem, houses upper grille aperture, wraps into the headlight cut-outs, blends into the hood leading edge and front fenders. It is the single largest visible plastic panel on the car's front.
- **Geometry & dimensions:** ~1,960 mm wide × ~430 mm tall (upper zone) × wrap depth ~340 mm around to wheel arches. Compound double-curvature surface; a soft power-dome runs centrally up toward the hood. Sculpted "cheekbone" creases run diagonally outboard-down from the emblem toward each headlight inner corner.
- **Sub-parts:**
  - Emblem recess (centred, 118 mm × 78 mm oval boss, 6 mm proud).
  - Upper grille aperture frame (see 3.2).
  - Headlight interface flanges (left/right) — mating rebate 8 mm deep receiving the lamp housing.
  - Hood shut-line channel along the top edge.
  - Two hidden radar/camera pass-through apertures behind emblem and behind lower grille bar (see 3.6).
- **Material — Body Colour Paint (multi-layer):**

| Layer | Param | Value |
|---|---|---|
| Base albedo | sRGB | swatch-driven; default "Meridian Grey-Blue" `#3A4550` |
| Metallic | | 0.9 (metallic flake basecoat) |
| Roughness | | 0.28 base, 0.12 under clearcoat |
| Clearcoat | | 1.0 |
| Clearcoat roughness | | 0.05 |
| Flake normal | | fine sparkle normal map, tiling ~512× across panel, intensity 0.15 |
| Base normal | | subtle orange-peel normal, very low amplitude (0.02) for authenticity |
- **Moving parts/animation:** none itself; deforms in collision. The whole cover is a soft-body candidate at LOD0 (crush deformation) but rigid at gameplay LOD.
- **Physics/mechanical:** front crush zone; primary contact geometry for frontal impacts. Assign a low-friction, deformable collision proxy (simplified box+chamfer hull, ~40 tris).
- **Gameplay interaction:** scuffs/scratches accumulate as a wear decal mask (dirt + paint-chip + scrape layers). In a driving-lesson context, kerb/bollard contact triggers a cosmetic scrape decal and a scoring penalty event.
- **Rendering notes:** hero reflective surface — needs clean screen-space reflections / good cubemap; clearcoat Fresnel edge highlight critical to reading it as automotive paint.
  > **Real-time:** bake flake sparkle into a low-cost detail normal; drop the second clearcoat lobe and approximate with a single GGX + boosted Fresnel. Collision = single convex hull.

#### 3.1.2 Lower bumper / front air dam & splitter
- **Purpose/role:** aggressive lower valance defining the "performance" read; manages under-nose airflow; houses the main cooling intake, air curtains, brake ducts, fog/cornering lamps, number-plate area, and lower parking sensors.
- **Geometry & dimensions:** ~1,900 mm wide × ~290 mm tall visible; a satin-black or gloss-black lower section with a body-colour or carbon splitter lip protruding ~55 mm forward at the base. Three-dimensional "gill" architecture with sharp chamfered edges.
- **Sub-parts:** central lower intake mouth; two outboard vertical air-curtain intakes; two brake-cooling ducts; splitter lip; underbody transition tray leading edge; fog-lamp pods; lower parking-sensor row; front tow-hook cover.
- **Materials:**

| Element | Albedo | Metallic | Roughness | Notes |
|---|---|---|---|---|
| Lower valance | `#111214` | 0 | 0.35 | textured "grained" satin plastic |
| Splitter lip (carbon trim) | 2×2 twill weave albedo | 0 | 0.22 | clearcoated carbon, anisotropic highlight |
| Gloss-black accents | `#0A0A0C` | 0 | 0.08 | piano-black, high spec |
- **Moving parts/animation:** none (except active shutters behind, see 3.3). Deformable/scrapeable.
- **Physics/mechanical:** the splitter lip is the frontal approach-angle limiter — first geometry to scrape on driveways/speed bumps. Give it its own thin collision strip so scraping events register distinctly from bumper crush.
- **Gameplay:** scrape sparks VFX + audio when the lip contacts ground at speed; wear decals; carbon lip can chip to expose matte-black substrate.
- **Rendering notes:** grained satin plastic reads best with a tiling micro-normal + slightly elevated roughness; keep it visually distinct from the glossy body colour above (contrast sells the "two-tone performance nose").
  > **Real-time:** merge valance + splitter into one mesh; carbon weave as a baked albedo+normal, no true anisotropy — fake with a stretched highlight in the roughness map.

---

### 3.2 Upper Grille + Twin Main Grille (fictional signature)

#### 3.2.1 Upper slim grille (nostril bar)
- **Purpose/role:** thin cooling/character slot directly beneath the hood leading edge; on GT-E it is a closed decorative blade; on GT-H it feeds the upper condenser stack.
- **Geometry:** full-width horizontal slot ~1,540 mm × 40 mm, split at centre by the emblem boss. Recessed ~35 mm.
- **Sub-parts:** perimeter chrome/satin surround (2 mm); internal horizontal blade (1 optional); emblem-backing plate (radar-transparent, see 3.6).

#### 3.2.2 Twin main grille (the fictional double-kidney-free signature)
- **Purpose/role:** the car's face — **two large vertically-oriented trapezoidal grille panels** flanking the centre emblem, joined by a slim body-colour bridge (deliberately NOT a real-brand twin-kidney; these are wider-set, canted outward, with a hexagonal mesh). This is the primary brand-recognition element and must be original.
- **Geometry & dimensions:** each panel ~360 mm tall × 300 mm wide at top tapering to ~240 mm at base; canted ~8° outward; recessed 45–70 mm (deepest at centre). Set ~120 mm apart across the emblem bridge.
- **Sub-parts:**
  - **Perimeter frame** — satin-aluminium or gloss-black surround, 12 mm section, chamfered.
  - **Hex mesh insert** — 3D honeycomb, cell pitch 14 mm, strut width 2.5 mm, extruded 10 mm deep with a secondary back-mesh offset 18 mm behind (creates parallax depth). ~180 cells per panel.
  - **Active shutter vanes** sit directly behind (see 3.3).
  - **Illuminated frame accent** (optional trim) — a thin edge-lit acrylic strip inside the surround, colour-tunable (see 3.7 light signature).
- **Materials:**

| Element | Albedo | Metallic | Roughness | Normal/Extra |
|---|---|---|---|---|
| Frame (satin alu) | `#B8BCC0` | 1.0 | 0.30 | brushed anisotropic |
| Frame (gloss black opt.) | `#0A0A0C` | 0 | 0.06 | — |
| Hex mesh | `#141518` | 0.2 | 0.42 | true modelled geometry LOD0; normal-mapped plane LOD2+ |
| Back mesh | `#080809` | 0.1 | 0.55 | darkened for depth |
| Illuminated accent | emissive | — | — | HDR emissive, tunable RGB, ~6 nits daytime / 20 nits night |
- **Moving parts/animation:** the illuminated accent supports a **welcome pulse** (see 3.7). Mesh itself static.
- **Physics/mechanical:** airflow path (H trim). Collision = flat plane at panel mouth (no need to model per-cell collision).
- **Gameplay:** headlight/emblem is the aiming reference for AI "look at car front" and for parking guidance overlays.
- **Rendering notes:** the double-back-mesh parallax is the money shot at close range — keep both layers at LOD0/LOD1. Hex mesh benefits from a subtle AO gradient darkening toward the recess centre.
  > **Real-time:** collapse hex mesh to a single normal-mapped + parallax-occlusion-mapped plane with a baked AO/depth gradient; a flat black plane with an emissive frame is enough on mobile. Cell geometry only at LOD0 cinematic.

---

### 3.3 Active Grille Shutters (AGS)

- **Purpose/role:** motorised vane array behind the main grilles that opens for cooling and closes for aerodynamic drag reduction and rapid engine/cabin warm-up. Functional on GT-H; on GT-E mostly closed (battery/inverter cooling only cracks them).
- **Geometry:** two banks (one behind each main grille panel), each with 6 horizontal aerofoil vanes, vane ~240 mm long × 45 mm chord × 6 mm thick, mounted on a shared linkage rack.
- **Sub-parts:** vanes ×12; pivot pins; connecting link rail; a single geared actuator motor per bank; end-stop bushings.
- **Materials:** matte black glass-filled nylon, albedo `#0B0B0D`, metallic 0, roughness 0.6. Not a hero surface — mostly in shadow behind the mesh.
- **Moving parts / animation:**
  - **Axis:** each vane rotates about its own local X (horizontal, cross-car) pivot.
  - **Range:** 0° (fully closed, vanes vertical/flush) → 85° (fully open, vanes horizontal/edge-on).
  - **Driver:** coolant temp + speed logic. Expose a **0–1 "AGS_open" float** to the engine/animation system.
  - **Timing:** full sweep ~1.2 s, eased; vanes move in unison via the link rail (single animated bone drives all 6 through a linkage constraint or copy-rotation).
- **Physics/mechanical:** in sim, closed shutters marginally raise top-speed / lower drag coefficient — can feed the aero model (small Cd delta ~0.02) if desired, otherwise cosmetic.
- **Gameplay:** visible through the grille when the camera is close and the AGS animates on cold-start → warm-up. Nice "living car" detail.
- **Rendering notes:** low priority; only visible through mesh gaps. Ensure back-face material is set (vanes seen from behind through mesh).
  > **Real-time:** omit entirely below LOD1, or bake a single "closed" vs "open" static state. If animated, drive all vanes with ONE bone; no per-vane rig on mobile.

---

### 3.4 Air Curtains & Cooling Ducts

#### 3.4.1 Air curtains (outboard vertical intakes)
- **Purpose/role:** channel high-pressure air from the outboard lower-bumper intakes, through an internal duct, and exit as a high-speed "curtain" sheet over the front-wheel face to reduce wheel-arch turbulence and drag.
- **Geometry:** intake mouth ~90 mm wide × 160 mm tall vertical slot at each lower outboard corner; internal duct ~380 mm run; exit slot ~25 mm × 150 mm at the fender/bumper joint ahead of the wheel.
- **Sub-parts:** intake bezel (gloss-black L-shaped surround); internal duct (usually unlit black cavity); exit slot lip.
- **Materials:** gloss-black bezel `#0A0A0C` metallic 0 roughness 0.07; internal duct near-black `#050506` roughness 0.8 (light-trap).
- **Moving parts:** none.
- **Physics:** aero curtain effect — negligible for arcade sim, optional Cd contributor for a high-fidelity aero model.
- **Rendering notes:** the intake must read as a genuine hole — deep AO, dark interior, a faint modelled duct wall a few cm in so it isn't a flat black decal.
  > **Real-time:** interior = a short modelled "cup" (3–4 faces) + black material + baked AO; do NOT try to fully model the internal duct. Exit slot can be a normal-mapped detail.

#### 3.4.2 Brake-cooling ducts
- **Purpose/role:** dedicated ducts (inboard of the air curtains) feeding cooling air to the front brake rotors/calipers.
- **Geometry:** ~110 mm × 90 mm rounded-rectangular intake each side; internal flexible trunk (modelled as a short cavity + optional visible corrugated hose stub) aiming rearward-inboard toward the brake backing plate.
- **Sub-parts:** intake grille (fine mesh or slats, cell pitch 8 mm); mounting bezel; hose stub (LOD0 only).
- **Materials:** matte black slats `#0C0C0E` roughness 0.55; bezel satin black.
- **Moving parts:** none.
- **Physics/mechanical:** in a thermal brake-fade model these lower brake temperature; hook to the brake-temp sim if present. Cosmetic otherwise.
- **Gameplay:** glow interplay — under hard braking the brake discs heat/glow (rendered in the wheel spec); these ducts visually justify it.
  > **Real-time:** slats = normal-mapped plane over a dark cavity; no internal trunk.

---

### 3.5 Tow-Hook Cover, Parking Sensors & Number-Plate Area

#### 3.5.1 Tow-hook cover
- **Purpose/role:** removable body-colour blanking cap concealing the threaded recovery-eye socket; outboard side of the lower bumper (market-dependent left or right; model on driver's-outboard corner).
- **Geometry:** ~70 mm × 55 mm rounded-rectangular cap, flush ±0.5 mm, with a pry notch on the lower edge and a subtle perimeter shut-line (1.0 mm).
- **Sub-parts:** cap; perimeter seam; internal tab hinge OR fully removable clip (model as removable — separate mesh with the threaded socket behind it).
- **Materials:** body colour (same as 3.1.1); the shut-line is a modelled 1 mm groove for AO catch.
- **Moving parts/animation:** pops out — a **push-release + pivot-off** micro-animation (rotate ~15° on a hidden bottom edge then detach), or simply toggle visibility to reveal the red/black threaded eye socket behind.
- **Gameplay:** relevant only if a recovery/tow mechanic exists; otherwise a static detail. The exposed socket has its own tiny mesh (M22 threaded bore, matte black, roughness 0.7).
- **Rendering notes:** must sit perfectly flush; the seam is the only tell. Distinct material ID for a possible "cover missing" damage state.
  > **Real-time:** static closed cap only; the whole feature can be a normal-map seam on the bumper on mobile.

#### 3.5.2 Parking sensors (ultrasonic)
- **Purpose/role:** short-range ultrasonic proximity sensors for parking assist; 6 across the front (4 lower bumper + 2 outboard) is typical.
- **Geometry:** flush circular discs Ø18 mm, sitting in body-colour or gloss-black bezels; a faint central membrane ring.
- **Sub-parts:** membrane disc; retaining bezel ring (0.8 mm proud).
- **Materials:** painted body-colour discs (so they nearly disappear) OR gloss-black; a subtle concentric normal detail for the membrane; roughness 0.25.
- **Moving parts:** none.
- **Physics/mechanical:** these are the *visual anchors* for the parking-assist gameplay system — the actual proximity detection is a raycast/overlap volume, but tie the on-screen parking-distance HUD and beep audio to these positions.
- **Gameplay:** critical for the driving-lesson product: front sensor coverage arc feeds the "you're too close" warning. Model their exact positions so the HUD proximity graphic aligns with the fascia.
- **Rendering notes:** so flush they barely catch light — a slight roughness break + micro-normal is enough.
  > **Real-time:** normal-map + roughness detail on the bumper texture; no separate discs needed below LOD1. Keep their *positions* as empty transforms for the gameplay system regardless of LOD.

#### 3.5.3 Number-plate holder
- **Purpose/role:** recessed mounting surface + frame for the front registration plate (Bulgarian EU-format plate: blue EU strip + "BG", white field, black chars).
- **Geometry:** flat recess ~520 mm × 110 mm (EU long plate) centred on the lower bumper, sunk ~8 mm, with 2–4 screw bosses and an optional slim frame surround. Slight forward cant (~3°).
- **Sub-parts:** recess pan; plate mesh (separate, swappable); frame surround; 2 fastener heads; an optional plate-light is N/A at front (fronts are unlit) but reflectivity matters.
- **Materials:** recess = satin black; **plate** = its own material — retroreflective white field (albedo `#EDEDE8`, roughness 0.45, a faint retroreflective sheen via elevated Fresnel), embossed characters (albedo `#0B0B0B`, raised 0.6 mm with a real normal for legibility), EU blue band `#0A3EA8` with 12 gold stars + "BG".
- **Moving parts:** none (plate string is data-driven/swappable).
- **Gameplay:** the plate is a **dynamic texture target** — a decal/text layer so each spawned car can carry a unique registration (useful for lesson scenarios, "follow the blue car BG-####").
- **Rendering notes:** retroreflectivity — front plates light up strongly under headlights of oncoming/night traffic; drive a small emissive/retroreflective response from nearby light sources at night.
  > **Real-time:** plate = a single quad with a runtime-composited texture (field + region strip + generated chars). Embossing faked in normal map. One material, atlas-friendly.

---

### 3.6 Forward Sensor Suite (radar / camera / ADAS)

> **Placement philosophy:** all sensors are concealed for a clean fascia. Model each as a real functional part *behind* a radar/IR-transparent cover, because the game's ADAS/driving-assist features (adaptive cruise, forward-collision warning, lane systems) reference these transforms.

#### 3.6.1 Long-range adaptive-cruise / forward radar (77 GHz)
- **Purpose/role:** the main forward radar for adaptive cruise control and collision warning; measures range/closing-speed to lead vehicles.
- **Location & geometry:** a ~90 mm × 70 mm × 25 mm module mounted **behind the maker emblem** (emblem doubles as a radar-transparent cover — no metal flake in that patch) or behind the lower centre grille bar. Flat faceplate with a subtle waffle/patch-antenna pattern.
- **Sub-parts:** module body; antenna faceplate; radar-transparent cover (the emblem or a dedicated smoked panel); mount bracket with 3-axis alignment cams.
- **Materials:** module body matte black roughness 0.7; faceplate dark grey `#1A1A1E` with a fine geometric patch-array normal; **radar cover** = the emblem is painted with a special radar-transparent finish — visually identical to chrome/gloss but flagged as a distinct material ID.
- **Moving parts:** none physically; internally scanning (no visible motion).
- **Physics/mechanical / gameplay:** this transform is the **origin of the ACC/forward-collision raycast cone** (typ. ±9° azimuth, ~170 m range). Expose as a named socket `SOCK_RADAR_FWD`. The AI-driver and lesson-scoring systems read distance-to-lead from here.
- **Rendering notes:** only visible if the emblem/cover is removed (damage state); otherwise hidden. Model at LOD0 for close inspection / repair scenarios.
  > **Real-time:** omit the module mesh; keep only the socket transform for gameplay. The emblem stays as normal geometry.

#### 3.6.2 Forward (windshield/grille) camera — mono/stereo ADAS
- **Purpose/role:** forward-facing camera(s) for lane detection, traffic-sign recognition, and object classification feeding driver-assist and the lesson feedback engine.
- **Location & geometry:** primary unit behind the upper windshield near the mirror (covered in interior spec); a **secondary fascia-mounted forward camera** sits in the upper grille surround — a Ø9 mm lens in a small black housing ~30 mm × 25 mm.
- **Sub-parts:** lens (glass, high spec); housing; a tiny gloss cover window flush with the grille frame.
- **Materials:** lens = clear glass, roughness 0.02, high IOR, a faint teal/violet AR-coating tint via thin-film or a fixed tint `#0E1A18` at grazing angles; housing matte black.
- **Physics/mechanical / gameplay:** origin of the **vision cone** used by traffic-sign-recognition gameplay (the lesson product highlights detected signs). Named socket `SOCK_CAM_FWD`. Field of view ~52° H.
- **Rendering notes:** the lens should show a small specular "eye" glint. Keep as a hero micro-detail at LOD0.
  > **Real-time:** a 3-tri lens quad with a bright spec + emissive glint dot; drop below LOD2.

#### 3.6.3 Corner / short-range radars (optional, GT-E & assist packages)
- **Purpose/role:** two short-range corner radars in the outboard lower bumper for cross-traffic and blind-spot at the front corners.
- **Geometry:** ~50 mm × 40 mm modules behind the lower outboard bumper skin near the air curtains.
- **Materials/notes:** identical treatment to 3.6.1 at smaller scale; sockets `SOCK_RADAR_FL`, `SOCK_RADAR_FR`.
  > **Real-time:** sockets only; no mesh.

#### 3.6.4 Headlight / camera washers (see also 3.9)
- Cross-referenced here because the washer jets sit within the sensor/lighting zone; full detail in 3.9.

---

### 3.7 LED Light Signature & Illuminated Accents (design language)

> The **light signature** is the car's night-time identity and must be as recognisable as the grille. It is original: a **"double-crescent" DRL** — two stacked C-shaped light blades per side that sweep from the inner-upper corner outward and down, with a fine "brow" line above.

#### 3.7.1 Signature geometry & optics
- **Purpose/role:** the always-on visual identity; also serves as DRL + turn indicator + welcome/goodbye choreography host.
- **Geometry:** per headlight, two crescent light-guide blades:
  - **Upper "brow" blade** — ~180 mm long, 6 mm tall light-guide rod, follows the top edge of the lamp.
  - **Lower "cheek" blade** — ~150 mm, sweeping down toward the outer corner.
  - Both are edge-lit acrylic light guides with laser-etched extraction dots (fine, ~0.5 mm pitch) that make them glow evenly.
- **Materials / emissive:**

| State | Emissive colour | Intensity (nits, relative) | Notes |
|---|---|---|---|
| DRL day | cool white `#EAF2FF` | high (readable in daylight) | crisp, even |
| DRL night | cool white | reduced ~40% | avoid bloom overload |
| Welcome | white ramp-up sweep | 0→full | see animation |
| Indicator | amber `#FF8A00` | high, the lower blade only | sequential |
| Charging (GT-E) | tunable (e.g. teal→green fill) | pulsing | state of charge |
- The light guides read as clear textured acrylic when OFF (albedo near-clear, roughness 0.15, a visible dot-extraction normal), and as HDR emissive strips when ON.
- **Moving parts/animation — choreography (all drive an emissive mask, not geometry):**
  - **Welcome ("greeting") sequence:** on unlock/approach — brows illuminate inner→outer over ~600 ms, then the crescents fill, a soft over-brighten "breath," settle to DRL. Grille illuminated accent (3.2.2) pulses once in sync. Total ~1.4 s.
  - **Goodbye:** reverse fade outer→inner over ~1.0 s on lock.
  - **Sequential turn signal:** amber segments animate outward along the lower blade, 4–6 segments, ~150 ms sweep, ~450 ms cycle. DRL white dims locally where amber is active (colour dominance).
  - **DRL "always-on":** steady; a very subtle ~4 s breathing at idle is optional.
- **Rendering notes:** drive brightness via a **0–1 emissive mask texture per blade** animated in a material scalar/flow, so all choreography is texture-space (cheap, no rig). Add a bloom-friendly HDR value (e.g. emissive 8–15 for white, higher for amber at night). Include a faint volumetric "glow card" billboard in front of each blade for the fog/night halo.
  > **Real-time:** one emissive texture per lamp with a scrolling UV mask for the sequential/welcome effects; a single additive glow sprite for halo. No per-segment meshes.

#### 3.7.2 Illuminated maker emblem & grille frame accent
- The emblem (3.1) and the grille-frame acrylic (3.2.2) can back-light in the welcome/charging choreography. Emissive, tunable RGB, driven by the same choreography timeline. Keep subtle (badge-lighting is a "premium" cue, not a spotlight).

---

### 3.8 Headlights (adaptive LED matrix + laser high-beam) & Cornering / Fog Lamps

> The headlight cluster is the single most complex fascia component. Model it as a **sealed unit** = outer lens + inner bezel/housing + multiple optical modules, each with its own emissive behaviour. Left/right are mirror instances.

#### 3.8.1 Outer lens & housing (the "eye")
- **Geometry:** a wrapped, tapering lens ~430 mm long (inner-tall to outer-thin), following the fascia sculpt from the grille frame outward to the fender. Compound curvature; thickness 4–6 mm modelled solid for LOD0 refraction.
- **Sub-parts:** clear outer lens; black inner surround/mask (the "eye-liner"); a satin or gloss inner bezel ring around each module; mounting flange to the fascia rebate (3.1.1).
- **Materials:**
  - **Lens:** clear glass/polycarbonate — albedo near-white-clear, transmission ~0.95, roughness 0.03, IOR 1.55, thin-film/AR tint faint violet at grazing. Model **refraction/thin translucency** at LOD0 so internal optics have depth.
  - **Inner mask:** deep matte black `#050506`, roughness 0.8 (light-trap so unlit modules read black).
  - **Bezels:** satin chrome `#C6CACE` metallic 1.0 roughness 0.22, OR gloss black variant.
- **Rendering notes:** the lens is a hero refractive/reflective surface. Needs correct back-face rendering and a clean specular. At LOD0 use a two-sided glass shader; the internal modules sit ~40–70 mm behind the lens for real parallax.

#### 3.8.2 Adaptive LED matrix high/low beam module
- **Purpose/role:** the main forward illumination; a matrix of individually-addressable LED segments (e.g. an 8×4 to 16×6 array behind a lens/reflector) enabling **glare-free high beam** — it "blanks" (switches off) the pixels that would dazzle oncoming/leading vehicles while keeping the rest lit.
- **Geometry:** a rectangular module ~110 mm × 55 mm face; behind it a segmented reflector/projector optic. Model the visible LED array face + a projector lens (Ø ~55 mm) or reflector bowl.
- **Sub-parts:** LED emitter array (grid of tiny emissive rectangles); reflector/projector optic (polished, metallic 1.0 roughness 0.05, a real parabola/freeform bowl at LOD0); front collimating lens.
- **Materials/emissive:** emitters emissive cool-white `#F2F6FF`; reflector chrome; when OFF the array reads as a faint yellow-tinted phosphor grid (albedo `#C9C4A0`, roughness 0.35).
- **Moving parts / animation — MATRIX BLANKING (key feature):**
  - **Driver:** the ADAS/forward-camera + oncoming-traffic detection. Expose a **per-pixel emissive mask** (a small grayscale texture, e.g. 16×6) that the beam system writes to — 1 = lit, 0 = blanked. This directly drives both the emitter emissive AND the projected light cookie.
  - **Behaviour:** in high-beam, when a vehicle is detected ahead, a "shadow tunnel" of blanked pixels tracks it horizontally as it moves across the field — visible as dark columns in the emitter grid and, crucially, as a dark corridor in the projected light on the road.
  - **Low↔high transition:** additional upper rows energise; ~250 ms fade.
- **Physics/gameplay:** the projected beam is a **spotlight + light-function (cookie) texture** matching the emissive mask, so the road ahead genuinely shows the glare-free blanking. Tie to a "you forgot to dip your high-beams / the car auto-dipped" lesson feedback moment. Named socket `SOCK_BEAM_L/R`.
- **Rendering notes:** two coupled things must stay in sync — (1) the *emitter face* emissive grid the player sees, and (2) the *projected light cookie* on the world. Use the same 16×6 mask for both. HDR emissive for bloom; a volumetric light shaft in fog.
  > **Real-time:** replace the per-pixel matrix with a small set of pre-baked beam states (full-high, dipped, single-blank-left, single-blank-right) blended, OR keep the 16×6 mask but skip the real projector geometry — a single spotlight + animated cookie texture. Emitter face = one emissive plane with the mask texture. Reflector = normal-mapped, no true optic.

#### 3.8.3 Laser high-beam booster module
- **Purpose/role:** ultra-long-range high-beam (laser-excited phosphor) that activates above ~60 km/h on unlit roads, extending throw to ~600 m. A premium/flagship signifier.
- **Geometry:** a small dedicated module (Ø ~35 mm) inboard within the cluster, marked by a distinctive **blue accent ring** and a tiny "laser" indicator glyph on the bezel (fictional, no trademark).
- **Sub-parts:** phosphor emitter (intense small-area source); collimator lens; blue accent trim ring (emissive when active).
- **Materials/emissive:** emitter emissive very bright, slightly cooler-blue-white `#EAF0FF`; blue accent ring emissive `#2E6BFF` when armed. OFF: a small dark lens with a blue-tinted ring.
- **Moving parts/animation:** activation = the blue ring lights + a bright core bloom ramps over ~300 ms; only when matrix high-beam is already on and speed/darkness conditions met.
- **Physics/gameplay:** extends the forward spotlight range dramatically (longer, narrower cone). Optional lesson cue ("laser high-beam engaged"). 
- **Rendering notes:** small but extremely bright — the strongest bloom source on the fascia at night; add a tight lens-flare/streak. Distinct narrow spotlight with long range + slight blue tint.
  > **Real-time:** cosmetic emissive ring + a slightly longer/brighter spotlight when flagged on; skip the separate collimator geometry.

#### 3.8.4 Cornering / bending lights
- **Purpose/role:** static cornering lamps (and/or dynamic swivel of the projector) that throw light into the direction of a turn at low speed, illuminating the inside of the corner.
- **Geometry:** either (a) a dedicated wide-angle LED cluster in the inner corner of the housing, or (b) the projector module is on a **swivel mount** (±15° yaw). Model BOTH capabilities; pick per trim.
- **Moving parts / animation:**
  - **Swivel (dynamic):** the whole projector module rotates about a vertical (local Y) axis, **driven by steering angle × speed** — e.g. up to ±15° at low speed, damped out above ~50 km/h. Smooth, ~200 ms lag follow.
  - **Static cornering:** the inner LED simply switches ON when |steer| exceeds a threshold at low speed + turn signal active; ~150 ms fade.
- **Materials/emissive:** warm-neutral white `#FFF4E6` (slightly warmer than main beam to distinguish); its own emissive + a wide, short-range spotlight aimed off-axis.
- **Physics/gameplay:** genuinely useful in the driving-lesson night scenarios (roundabouts, junctions). The swivel visibly tracks the steering wheel — a satisfying "living car" detail and a teachable feature.
- **Rendering notes:** the swivel projector needs its own light source parented to the moving module bone so the road pool of light rotates with it.
  > **Real-time:** prefer the STATIC cornering LED (a toggled emissive + fixed off-axis spotlight) over a swivelling rig on mobile — no moving bone. Keep swivel for LOD0/console.

#### 3.8.5 Fog lights
- **Purpose/role:** low, wide, short-range lamps for fog/poor visibility, mounted in the lower bumper (3.1.2) outboard, below the main headlights. May be integrated into the lower DRL blade on some trims (LED bar) rather than discrete pods.
- **Geometry:** discrete version — Ø ~55 mm round or a 90 mm × 30 mm rectangular LED in a gloss-black bezel, canted slightly outward/down. Integrated version — a segment of the lower light blade.
- **Materials/emissive:** warm-white or selective-yellow `#FFE39A` (offer both; yellow reads as classic fog). OFF: a dark lens with faint fluted optic normal. Roughness 0.05 lens.
- **Moving parts:** none; simple on/off with ~120 ms fade.
- **Physics/gameplay:** wide, low, short cone; in a fog weather state these cut glare-back and light the road edges. Toggle via the lighting control; a lesson can test "use fog lights only in fog."
- **Rendering notes:** wide soft-edged spotlight, low mounting → strong ground pool near the car; pairs with volumetric fog for the signature "fog light in fog" look.
  > **Real-time:** emissive lens + one wide short spotlight each; often the first light to cull at distance.

#### 3.8.6 Reflectors (retro-reflectors)
- **Purpose/role:** passive red/amber retroreflectors (legally required corner markers) — front ones are typically amber/clear, integrated low in the bumper corners; catch and bounce other cars' headlights when the Vehicle is parked/unlit.
- **Geometry:** small ~40 mm × 20 mm faceted prism panels (corner-cube optic pattern) recessed in the outboard lower corners.
- **Materials:** clear/amber prismatic — a **corner-cube normal map** over an emissive-when-lit response; base albedo amber `#FFB24D` for the front markers, roughness 0.1, a strong retroreflective Fresnel that flares when hit by external light at night.
- **Moving parts:** none.
- **Rendering notes:** the corner-cube sparkle under passing headlights is the whole point — approximate with a view-dependent emissive that peaks when the light vector aligns with the view vector.
  > **Real-time:** a normal-mapped quad + a cheap retroreflective term (dot(viewDir, lightDir)-driven emissive); no true prism geometry.

---

### 3.9 Headlight & Sensor Washers

- **Purpose/role:** high-pressure telescoping washer jets that clean the headlight lenses (and, on ADAS trims, the forward camera/radar cover) — important because dirty lenses degrade both the beam and the assist sensors.
- **Geometry:** small cylindrical washer nozzles (Ø ~14 mm caps) hidden in the lower edge of the bumper directly beneath each headlight; **telescoping** — retracted flush cap, extends ~35 mm forward on activation to spray. A separate tiny fan-jet nozzle near the forward camera cover.
- **Sub-parts:** flush cap (body-colour); telescoping piston barrel; twin fan-spray nozzle tips; return spring (hidden).
- **Materials:** cap body-colour (matches 3.1.1); barrel matte black `#0C0C0E` roughness 0.5; nozzle tips gloss black.
- **Moving parts / animation:**
  - **Axis:** telescopes along local +Z (forward).
  - **Range:** 0 mm (flush) → 35 mm extended; ~180 ms pop-out, sprays, ~250 ms retract.
  - **Driver:** headlight-washer activation (tied to windscreen-washer stalk when lights on) or sensor-clean cycle.
- **Physics/gameplay:** triggers a **fluid-spray particle VFX** (fan of droplets) + washes the lens dirt mask (resets the headlight/camera grime layer to clean). Ties to a "clean sensors/lights" maintenance beat and to weather (mud/snow) systems.
- **Rendering notes:** the spray VFX + the wet, cleaned lens (temporary lowered roughness, water beading normal) sell it. The cap seam is a small AO detail when retracted.
  > **Real-time:** skip the telescoping mesh; on activation just play a spray particle burst and swap the lens grime mask to clean. No moving part on mobile.

---

### 3.10 Assembly, LOD, Rigging & Naming Summary (fascia hand-off)

**Named sockets / empties (must exist at every LOD for gameplay & VFX):**
`SOCK_EMBLEM_FRONT` · `SOCK_RADAR_FWD` · `SOCK_RADAR_FL` · `SOCK_RADAR_FR` · `SOCK_CAM_FWD` · `SOCK_BEAM_L` · `SOCK_BEAM_R` · `SOCK_CORNER_L` · `SOCK_CORNER_R` · `SOCK_FOG_L` · `SOCK_FOG_R` · `SOCK_LASER_L` · `SOCK_LASER_R` · `SOCK_PARK_F1..F6` (parking sensors) · `SOCK_WASH_L` · `SOCK_WASH_R` · `SOCK_TOWEYE_F` · `SOCK_PLATE_FRONT`.

**Animated bones / drivers (minimal rig):**
| Bone/driver | Type | Range | Driver input |
|---|---|---|---|
| `AGS_master_L/R` | rotation | 0–85° | coolant temp / speed (0–1 float) |
| `beam_matrix_mask` | texture scalar (16×6) | 0–1 per pixel | ADAS beam controller |
| `drl_choreo_mask_L/R` | texture scalar | 0–1 | welcome/goodbye/indicator timeline |
| `proj_swivel_L/R` | rotation (Y) | ±15° | steering angle × speed |
| `washer_ext_L/R` | translation (Z) | 0–35 mm | washer trigger |
| `towcover_open` | rotation/visibility | 0–15° / toggle | interaction |

**Material ID list (fascia):** body-colour paint · gloss-black accent · satin-black grained plastic · carbon-twill splitter · satin-alu grille frame · hex-mesh (2 layers) · clear glass lens · headlight inner light-trap black · emitter phosphor (off) · emissive white DRL · emissive amber indicator · emissive blue laser accent · retroreflector (front amber) · radar-transparent emblem finish · number-plate composite · chrome bezel.

**LOD ladder (fascia):**
| LOD | Range | Key reductions |
|---|---|---|
| LOD0 | hero / <5 m / cinematic | full internal optics, glass refraction, hex double-mesh, AGS vanes, washers, all sensors modelled |
| LOD1 | ~5–15 m | internal optics simplified to emissive faces + normal-mapped reflectors; AGS one bone; washers static |
| LOD2 | ~15–40 m | grille = parallax plane; lights = emissive planes + baked cookies; sensors = sockets only |
| LOD3 | >40 m | fascia = low-poly shell, lights = single emissive strips per side, no separate parts |
| LOD-mobile | phone WebGL | baked flake, single-lobe paint, no refraction, cookie-only beams, choreography via UV-scroll masks only |

**Damage/wear state layers (fascia mask channels):** dirt/grime · water/wet · paint-chip · scrape (kerb) · cracked-lens (headlight) · missing tow-cover · missing/dirty plate. All drive shared decal/mask inputs so a single damage system covers the fascia.
## 4. Exterior — Rear Architecture & Lighting

> **Scope of this section.** Everything aft of the rear-door shutline and the C-pillar trailing edge: the rear bumper assembly, diffuser and underbody exit, tow-hook provisions, reflectors, the full rear lighting suite (tail lights, sequential indicators, reverse lights, rear fog, high-mount stop lamp), the powered decklid / boot with active spoiler, the roof spoiler, rear glazing (backlight, defroster, wiper), and the rear sensor cluster (backup camera, ultrasonic parking sensors, rear radar). This is the **fictional model "Vehicle" (internal designation _AV-Flagship / body code "Aurora-S"_)** — an unbadged, brand-neutral electrified performance sedan. Both powertrain variants share **100% of the rear sheet-metal and lighting**; the only rear delta is the **PHEV twin-turbo hybrid** has a **left-rear exhaust exit pair through the diffuser**, while the **BEV** has **blanked exhaust bezels** (sealed, cosmetic) and an extra **charge-status pulse** baked into the tail-light signature. Both are documented below and flagged where they diverge.

**Global reference frame for this section:** +X = forward, +Y = up, +Z = vehicle right (starboard). Origin at ground-projected center of rear axle unless a component states otherwise. Rear overhang (rear axle → rearmost point) ≈ **1,040 mm**. Overall body width at rear haunches ≈ **1,920 mm** (excluding mirrors). Rear track ≈ **1,660 mm**.

**Master material IDs referenced repeatedly** (full PBR definitions given at first use, then referenced by ID):

| ID | Name | Base / Albedo | Metallic | Roughness | Notes |
|----|------|---------------|----------|-----------|-------|
| `MAT_BodyPaint` | Body colour (hero: "Nebula Graphite" metallic) | `#2B2E33` | 0.0 (flake layer 0.9) | 0.28 clear / 0.42 flake | Dual-layer: metallic flake basecoat + clearcoat. Clearcoat 1.0, clearcoat roughness 0.05 |
| `MAT_GlossBlack` | Piano-black trim | `#0A0B0D` | 0.0 | 0.08 | High-gloss ABS, clearcoat 1.0 |
| `MAT_SatinChrome` | Satin brightwork | `#C9CDD2` | 1.0 | 0.30 | Brushed anodized alloy look |
| `MAT_DarkChrome` | Smoked brightwork | `#4A4E55` | 1.0 | 0.22 | PVD dark-chrome, for diffuser blades / badge surround |
| `MAT_LensClear` | Clear outer lens | `#FFFFFF` α0.06 | 0.0 | 0.03 | Transmissive PC, IOR 1.55, clearcoat 1.0 |
| `MAT_LensRed` | Red inner lens (tint) | `#8A0A12` | 0.0 | 0.10 | Transmissive, emissive-gated |
| `MAT_TexturedBlackPP` | Lower-bumper unpainted PP | `#141519` | 0.0 | 0.72 | Fine grain normal, mold-texture |
| `MAT_CarbonWeave` | Forged/2×2 twill carbon | `#17181B` | 0.0 | 0.30 | Anisotropic clearcoat 1.0, weave normal + aniso map |

---

### 4.1 Rear Bumper Assembly

The rear bumper is a **three-shell painted+unpainted composite** wrapping the tail from wheelarch to wheelarch, integrating the lower valance, sensor carriers, reflector pods, diffuser mounting, and (hybrid) exhaust bezels. It is the largest single moulding at the rear.

#### 4.1.1 Upper painted bumper cover (main fascia)
- **Purpose/role:** Primary aerodynamic and cosmetic skin over the rear crash structure; carries the number-plate recess, houses the upper sensor array, forms the tail-light lower cutlines, and blends the body-side haunches into the lower valance.
- **Geometry & dimensions:** Full width ≈ **1,900 mm**, height of painted portion ≈ **340 mm**, wrap depth (fore-aft) ≈ **520 mm** around the corners. Wall thickness modelled at **3.0 mm** for LOD0 (double-sided edges visible in tail-light cavities and plate recess). The corner "hips" bulge outboard ≈ 40 mm past the body-side to visually widen the stance.
- **Material:** `MAT_BodyPaint`. Underside lip transitions to `MAT_TexturedBlackPP` along a crisp horizontal character line ~140 mm above the lower edge.
- **Sub-parts:**
  - **Number-plate recess** (Bulgarian plate proportions: 520 × 110 mm EU long format). Recessed 18 mm, floor in `MAT_TexturedBlackPP`, two M6 boss bumps + a central light-well shelf. Two plate lamp apertures (see 4.6).
  - **Upper sensor band** — 4 ultrasonic sensor bores (see 4.9) flush-mounted, colour-matched caps.
  - **Tail-light interface flanges** — inboard cutline mates to decklid, outboard cutline to quarter-panel; a 4 mm even shadow-gap runs the full perimeter.
  - **Corner air-exit slits** (functional-look) at extreme outboard edges venting wheel-arch pressure; blade-vane inserts in `MAT_GlossBlack`.
- **Moving parts / animation:** None (static shell). Deforms only in crash/impact deformation blends if the build supports soft-body — otherwise rigid.
- **Physics/mechanical:** Collision proxy is a simplified convex hull inset 15 mm from visible skin; mounts to two energy-absorbing crush cans + alloy rebar beam behind (see 4.1.5).
- **Gameplay interaction:** Primary rear impact contact surface. Scuff/scratch decals project here; parking-tap crumple state can swap to a dented variant mesh.
- **Rendering notes:** Reads strongly in reflections — ensure clean normals across the haunch highlight. Bake curvature-driven edge wear into a subtle cavity mask for the "used car" material state.
  > **Real-time:** Merge upper fascia + valance + reflector pods into a single draw call sharing one 2K atlas. Corner vent blades become a normal-map detail, not geometry, below LOD1.

#### 4.1.2 Lower valance / rear apron
- **Purpose/role:** Unpainted lower skirt visually grounding the car; frames the diffuser; protects the crash structure lower edge; houses the reflectors, rear fog, and (hybrid) exhaust bezels.
- **Geometry & dimensions:** Width ≈ 1,880 mm, height ≈ 200 mm, sweeps under to meet the diffuser ceiling. Approach/departure sculpting gives a 16° departure angle.
- **Material:** `MAT_TexturedBlackPP`, with two inset **`MAT_DarkChrome` accent strakes** flanking the diffuser.
- **Sub-parts:** reflector housings (4.4), fog-lamp bezel (4.7, single centre or offset per market), diffuser mount rails, exhaust bezel surrounds (hybrid) or blanking plates (BEV).
- **Rendering notes:** Matte, low-spec — good contrast anchor against glossy paint. Keep roughness ≥0.7 so it never competes with brightwork in reflections.

#### 4.1.3 Rear crash beam & crush cans (structural, mostly hidden)
- **Purpose/role:** Absorbs low/medium-speed rear impact; the mounting backbone for the bumper cover.
- **Geometry:** Extruded aluminium closed-section beam, ~1,220 mm wide, 90 × 60 mm section, bolted to two octagonal crush cans (Ø90 mm, 150 mm long) on the longitudinal rails.
- **Material:** raw aluminium `#8C9096`, metallic 1.0, roughness 0.5.
- **Gameplay/physics:** The real collision energy sink. In damage model, crush cans are the deform driver; visible only in extreme damage/teardown views or repair minigame.
  > **Real-time:** Omit entirely unless a teardown/garage view exists. Collision handled by the fascia hull proxy.

#### 4.1.4 Rear tow-eye cover & recovery point
- **Purpose/role:** Conceals the threaded recovery eye socket; removable cap.
- **Geometry:** Circular/rounded-square cap Ø ≈ 70 mm on the right side of the upper fascia, colour-matched, with a fine perimeter gap and a small finger-pry notch at its lower edge.
- **Material:** `MAT_BodyPaint` on face; back-side `MAT_TexturedBlackPP` with a living-hinge or clip detail.
- **Moving parts / animation:** Pop-off cap — animation: hinge/pop about its lower notch, or full detach. The **screw-in tow eye** (stowed in boot) threads into the exposed socket: modelled as a forged eye Ø85 mm loop on a 100 mm shank, `MAT_SatinChrome`/painted safety-orange variant.
- **Gameplay interaction:** Recovery/tow tether attach point — the physics tow-rope constraint anchors to the socket world-transform when the eye is fitted. Cap-open + eye-fitted is a discrete state for tow/recovery gameplay.
  > **Real-time:** Cap is a texture detail; the socket + fitted eye spawn only when a tow interaction begins.

---

### 4.2 Rear Diffuser

#### 4.2.1 Diffuser main body
- **Purpose/role:** Manages underbody airflow exit, reduces rear lift/drag, and is the visual performance signature of the lower rear.
- **Geometry & dimensions:** Width ≈ **1,180 mm**, depth (fore-aft) ≈ **300 mm**, rising rake ~14°. Five vertical **strakes/fins** partition it into channels; centre channel widest. Ceiling and strakes form deep, self-shadowing channels ideal for AO.
- **Material:** Body in `MAT_CarbonWeave` (hero) or `MAT_TexturedBlackPP` (base trim); strake leading edges tipped in `MAT_DarkChrome`. Carbon weave direction runs fore-aft along channels.
- **Sub-parts:** 5 strakes; 2 outer end-fences; centre "shark-tooth" tab at trailing edge; upper mating lip to valance.
- **Moving parts:** None (this is the passive lower diffuser). The *active* aero element is the boot spoiler (4.8) — not the diffuser.
- **Physics/mechanical:** Cosmetic in most sim scopes; if aero is modelled, contributes a small rear downforce coefficient scaled with speed.
- **Rendering notes:** Deep channels — bake high-quality AO and a curvature edge-highlight on strake tips. Carbon weave should show anisotropic clearcoat streak under moving light.
  > **Real-time:** Strakes can be a parallax/normal-baked flat plane at LOD2. Keep 2–3 outer strakes as geometry (silhouette reads on the horizon line) and fake the rest.

#### 4.2.2 Exhaust exit bezels
- **Hybrid (twin-turbo PHEV):** Two **oval/trapezoid tailpipe finishers**, ~110 × 70 mm, `MAT_SatinChrome` inner + `MAT_DarkChrome` outer surround, recessed into the left and centre-left diffuser fences with visible **carbon-sooted inner pipe** (`#0C0C0C`, roughness 0.6, heat-tint gradient toward blue/gold near the lip on hard-driven state).
  - **Animation/VFX driver:** exhaust heat-haze refraction quad + optional cold-start condensation puff + overrun crackle emissive flash on the pipe rim (emissive `#FF5A1E`, pulsed). Slight visible shake tied to engine RPM idle.
- **BEV:** Same bezel geometry but **sealed blanking discs** flush behind the finisher rim (`MAT_GlossBlack`), no heat-haze, no soot. Reinforces "no tailpipe" identity while sharing tooling.
  > **Real-time:** Heat-haze and crackle flashes are LOD0/near-camera only. Tailpipe interior is a baked dark gradient below LOD1.

---

### 4.3 Rear Tow Hook (front/rear note)
Covered functionally in **4.1.4** (rear recovery point). This sub-header exists so the tow-hook line item is explicitly closed: the rear provides **one** central-right screw-in recovery eye behind a colour-matched cap; **no permanent protruding hook** (fictional flagship aesthetic hides it). Animation, material, and gameplay tether behaviour are as specified in 4.1.4.

---

### 4.4 Reflectors (Rear Retroreflectors)

- **Purpose/role:** Passive red retroreflectors (legally required) that return light toward its source without power — visible when another vehicle's headlights strike them at night.
- **Geometry & dimensions:** Two units, one per side in the lower valance, ~90 × 35 mm rounded-rectangle, set at the outboard lower corners flanking the diffuser. Slight outward cant (~8°) so they catch trailing traffic.
- **Material:** `MAT_LensRed` outer smooth lens over a **prismatic corner-cube array** backing.
  - **PBR:** base `#7A0812`, roughness 0.06, clearcoat 1.0. The corner-cube retro-return is faked via an **emissive-on-headlight** shader: a masked emissive (`#FF2A2A`, intensity ramped by dot(viewDir, incidentLightDir)) so they "glow" only when lit from near-camera, matching real retroreflection.
- **Sub-parts:** outer lens, prism sheet (normal-mapped tri-prism pattern), black backing cup.
- **Moving parts:** none.
- **Gameplay interaction:** Night-time visibility cue; reads on the minimap-of-light for AI/other-car headlight interactions.
- **Rendering notes:** The prism normal map is essential for the "sparkle." Do not make them constantly emissive — gate by incident light or they look like extra tail lights.
  > **Real-time:** Replace corner-cube geometry with a flat quad + prism normal map + a cheap fresnel-gated emissive. Below LOD2, a static dim-red emissive dot.

---

### 4.5 Rear Lighting Suite — Full-Width Signature

The rear lighting is the car's identity. A **single continuous full-width light bar** spans ~1,760 mm across the tail, bridging the two corner clusters and crossing the decklid shutline via a **decklid-mounted centre segment** that aligns optically (but is physically split for the boot to open). The signature is a **thin, uniform light-guide "blade"** with a distinct 3D internal structure.

#### 4.5.1 Full-width light-bar architecture (overview)
- **Segmentation (5 zones, left→right):**
  1. Left corner cluster (quarter-panel mounted): tail/brake, reverse, sequential indicator, reflector-adjacent.
  2. Left decklid segment (moves with boot).
  3. Centre "wordmark/breathing" segment on decklid (animated welcome + charge status).
  4. Right decklid segment (moves with boot).
  5. Right corner cluster (mirror of left).
- **Physical split logic:** Zones 2–4 are on the decklid and translate/rotate when the boot opens; zones 1 & 5 are body-fixed. At closed state all five align to one continuous blade with 4 mm optical-blend gaps engineered to read as invisible when lit.
- **Light-guide construction:** A clear PMMA light-pipe with laser-etched extraction dots along its length, edge-fed by LED emitters at each segment end. Modelled as a **capped-tube blade** ~18 mm tall, ~14 mm deep, with an internal fibre-optic-look strand plus a stepped "crystalline" facet field behind the outer lens.
- **Emissive channels (shared across the suite):**

| Function | Colour | Emissive intensity (nits, relative) | Notes |
|----------|--------|--------------------------------------|-------|
| Tail (position) | `#C0000A` | 1.0 | Always-on when lights active |
| Brake (stop) | `#FF0A16` | 3.0 | Overlays tail zone, brighter |
| Indicator | `#FF7A00` amber | 2.6 (pulsed sweep) | Sequential |
| Reverse | `#F4F7FF` cool white | 2.8 | Zones near corners |
| Fog | `#FF0A16` | 3.2 | Single, intense, offset |
| Welcome/charge | `#3AA0FF`→`#00E0A0` | 0.6 breathing | BEV charge state / greeting |

- **Rendering notes:** Use an **emissive mask texture (RGBA)** where channels are packed: R=tail/brake, G=indicator, B=reverse, A=welcome/charge; a material param scales each. Add a bloom-friendly HDR emissive and a separate **light-pipe extraction-dot normal/roughness** so the blade shows internal structure when unlit (dark red crystalline) and even glow when lit.
  > **Real-time:** Bake the crystalline facet field into a normal+emissive map on a single blade mesh. Channel animation driven by a small material-parameter set (4 floats) rather than per-LED geometry. The optical-blend gaps are painted into the emissive map so the closed bar looks continuous with zero extra verts.

#### 4.5.2 Tail lights (position + stop)
- **Purpose/role:** Rear position marker (dim, always-on with lights) and brake/stop (bright, on pedal). Occupy the full blade for tail; brake intensifies the corner clusters + centre.
- **Geometry:** The blade cross-section (above) plus **corner "L-signature" wraps** turning down the quarter-panel ~120 mm for wrap-around visibility. Depth of the cluster into the body ≈ 90 mm with visible internal reflector bowls behind clear lens.
- **Material:** `MAT_LensClear` outer, `MAT_LensRed` inner light-guide, chromed reflector cups `MAT_SatinChrome` behind. Unlit appearance: dark cherry-red crystalline (emissive off, red inner lens + faceted normals catch light).
- **Moving parts:** none intrinsic (the decklid segments move with the boot — see 4.8/4.10).
- **Physics/gameplay:** Brake channel bound to brake input (and regen-braking on BEV — a distinct **regen tail signature** at lower intensity when lifting off, a documented BEV-only behaviour). Following-AI reads brake emissive for spacing.
- **Rendering notes:** Two-stage emissive (tail vs brake) must not double-add to blowout; clamp combined at brake level. Add wet-road red pooling reflection under the car.

#### 4.5.3 Sequential indicators (turn signals)
- **Purpose/role:** Amber directional signal with a **sequential outward sweep** (inboard→outboard) — a signature animation.
- **Geometry:** Shares the blade; the amber function uses a **segmented sub-array of 8–12 discrete extraction cells per side** so the sweep reads as stepped illumination. Corner wrap-down also flashes.
- **Emissive/animation:** Amber `#FF7A00`. Sweep timing: full sweep ~200 ms, hold ~250 ms, off ~150 ms → ~1.5 Hz cycle. Driver: `turnSignalPhase` 0→1 maps to how many cells are lit; separate L/R params. Hazards = both simultaneously.
- **Rendering notes:** Amber must override/mix with red tail in shared cells (indicator priority, tail suppressed locally while amber active — mimics real bulb-share). Bake the cell boundaries into the emissive mask; animate via a scrolling threshold on a gradient (cheap, no per-cell logic).
  > **Real-time:** Sequential sweep = animated UV threshold on a 1D gradient in the emissive-G channel. No extra geometry. Below LOD2, collapse to a simple on/off amber blink of the whole zone.

#### 4.5.4 Reverse (backup) lights
- **Purpose/role:** White rearward illumination when reverse gear engaged; also the visual "reverse is active" cue and light source for the reverse-scene at night.
- **Geometry:** Two dedicated cool-white cells, one near each inboard corner of the blade (or a centre pair), ~60 × 16 mm each, with clearer lens sections (`MAT_LensClear`, no red tint locally).
- **Emissive/animation:** `#F4F7FF`, snaps on with reverse gear (`isReverse` bool), slight 60 ms fade-in. On BEV, paired with an **exterior reverse chime** cue and a low-speed pedestrian warning tone (audio dept hook).
- **Physics/gameplay:** Casts an actual white spot/area light at night (real-time light) illuminating ~4 m behind for the reverse camera scene and parking gameplay. Reverse state also triggers backup camera feed (4.8) and parking-sensor HUD.
- **Rendering notes:** The only white in the red bar — ensure it doesn't tint pink from adjacent red bleed; mask cleanly.
  > **Real-time:** Reverse spill light = one shadow-casting spotlight enabled only in reverse near-camera; else emissive-only.

#### 4.5.5 Rear fog light
- **Purpose/role:** Single high-intensity red lamp for dense fog, brighter and more concentrated than tail/brake, legally offset (Bulgaria/EU: at least one, on the centreline or offset to the driver's/left side).
- **Geometry:** Discrete round-ish emitter ~55 mm, set in the **lower valance** (not the blade) toward the left, behind a heavier prismatic lens.
- **Material:** `MAT_LensRed`, prism normal, reflector cup. Unlit: deep dark red, clearly a separate deeper lens than the blade.
- **Emissive/animation:** `#FF0A16` at intensity 3.2 (highest red), no animation — steady when on. Driver: `rearFogOn` bool (manual toggle). Must be visually distinct from brake (position + steadiness distinguish it).
- **Gameplay:** Toggleable in the light controls; a teachable item (when to use rear fog) tying into the theory academy content. AI/other cars' visibility of you improves in fog weather when on.
  > **Real-time:** Simple emissive quad + optional god-ray/volumetric cone in fog weather only.

#### 4.5.6 High-mounted (third) brake light — CHMSL
- **Purpose/role:** Centre High-Mounted Stop Lamp — the legally-required third brake light, mounted high and central for following-driver visibility over the car ahead's obstruction.
- **Geometry & placement:** A **thin LED strip ~360 mm wide, 12 mm tall**, integrated into the **trailing edge of the roof spoiler** (see 4.9) at the top of the rear glass — OR, on the active-spoiler deploy variant, a secondary strip at the boot spoiler base so it's visible whether the spoiler is up or down. Modelled as a shallow channel with ~14 discrete LED cells behind a smoked-clear lens.
- **Material:** `MAT_LensClear` (lightly smoked, `#101012` α over) outer; red LED cells inner.
- **Emissive/animation:** `#FF0A16`, intensity 3.0, **binary with brake input** (on/off, no dimming for tail — CHMSL is stop-only). Optional legal "emergency stop signal" fast-flash (~4 Hz) under hard braking/ABS for high-fidelity builds.
- **Physics/gameplay:** Extra brake-read for tailgating AI; visible when the boot/glass line is the only thing another car sees.
- **Rendering notes:** Because it's on the roofline it catches a lot of following-headlight glint even when off — give the smoked lens a subtle spec.
  > **Real-time:** Single emissive strip, brake-bool driven. Emergency-stop fast-flash only near camera / high settings.

#### 4.5.7 Welcome / charge-status "breathing" signature (BEV-forward, both variants greet)
- **Purpose/role:** Non-legal brand signature: an animated "breathing" sweep on lock/unlock/approach (welcome & goodbye), and — **BEV only** — a **charge-level progress fill** across the centre segment while plugged in.
- **Emissive/animation:** Welcome = a cyan→teal wipe `#3AA0FF`→`#00E0A0` sweeping outboard over ~1.2 s then settling to tail. Charge = the centre segment fills L→R proportional to `stateOfCharge`, slow breathing pulse (0.2 Hz) while charging, solid when full.
- **Gameplay:** Approach/lock feedback; charging minigame/idle state cue for BEV. Ties to key-fob and charge-port (documented in front/side + interior sections).
  > **Real-time:** Welcome sweep and charge fill are the same UV-threshold technique on the A-channel emissive; skip on low-end / when not near the car.

---

### 4.6 Number-Plate Lamps
- **Purpose/role:** Two small white LEDs illuminating the rear plate (legal), mounted on the plate-recess upper shelf (4.1.1).
- **Geometry:** 2 × ~20 mm modules with clear lenses aimed down at the plate; `MAT_LensClear` + `MAT_SatinChrome` bezel.
- **Emissive:** `#FFF4E6` warm-white, intensity 1.2, on with position lights. Casts a soft downward light onto the plate mesh (real-time optional).
  > **Real-time:** Emissive-only + a baked light-decal on the plate; no dynamic light below LOD1.

---

### 4.7 Backup (Reverse) Camera

- **Purpose/role:** Rear-view camera feeding the central display for reversing and the surround-view stitch; a functional gameplay sensor.
- **Geometry & placement:** Tiny camera module ~14 mm, hidden in the **maker-emblem plinth on the decklid** (emblem tilts to reveal it — see below) OR fixed in the plate-recess upper shelf. Fisheye lens element visible as a small dark glass dome.
- **Material:** lens `MAT_GlossBlack` glass dome (roughness 0.03, clearcoat), body `MAT_TexturedBlackPP`.
- **Moving parts / animation:** **Deploying emblem-cam** (hero variant): the rear maker emblem is hinged; on reverse it **flips up ~30° about a horizontal axis** (0.4 s ease) to expose the lens, and a small **washer jet** squirts to clean it (VFX droplet + wet lens). Retracts on gear-out-of-reverse.
- **Physics/gameplay:** Provides the reverse-camera render — a **secondary camera** rendering to a render-target displayed on the interior centre screen, with distortion (fisheye), dynamic guidelines (steering-linked bending lines), and low-light gain. Trigger: `isReverse`.
- **Rendering notes:** Guidelines are a screen-space overlay on the RT, not world geometry. Fisheye via lens-distortion post on the RT camera. Wet-lens droplet shader on the washer event.
  > **Real-time:** RT can be quarter-res, updated at reduced framerate; guidelines are a UI quad. On phones, the reverse view may be a simplified rear-cam RT or a stylized top-down proxy. Emblem-flip is LOD0 flourish; on low LOD the lens is a fixed dome.

---

### 4.8 Rear Parking Sensors & Rear Radar (Sensor Cluster)

#### 4.8.1 Ultrasonic parking sensors
- **Purpose/role:** Short-range proximity detection for parking; feed the audible beep + on-screen proximity arcs.
- **Geometry & layout:** **Four** flush circular sensors Ø ≈ 18 mm across the upper painted bumper (4.1.1), evenly spaced, colour-matched caps with a fine perimeter ring gap. Aim slightly downward and fanned outboard at the corners.
- **Material:** `MAT_BodyPaint` cap; thin `MAT_GlossBlack` ring.
- **Physics/gameplay:** Each casts a short raycast/sphere-cast cone (~1.5 m). Nearest-hit distance drives: (a) beep frequency ramp (audio), (b) coloured proximity arcs on the reverse-cam/HUD (green→amber→red), (c) auto-brake assist hook in high-assist mode. Active in reverse and low-speed forward.
- **Rendering notes:** Purely functional; visually just flush dots. Ensure caps don't catch odd speculars that read as damage.
  > **Real-time:** Sensor logic = 4 short raycasts; visuals are texture dots. Proximity arcs are UI.

#### 4.8.2 Rear radar (blind-spot / cross-traffic / RCTA)
- **Purpose/role:** Longer-range radar for blind-spot monitoring, rear cross-traffic alert, and (assist builds) rear collision warning.
- **Geometry & placement:** Two radar modules **behind the bumper corners** (non-visible, behind the painted `MAT_TexturedBlackPP` "radar-transparent" corner zones), ~70 × 50 × 25 mm boxes angled ~30° outboard/rearward. A subtle **matte "radar window" panel** (slightly different roughness, `#12131A`, roughness 0.6, non-metallic — metal blocks radar) marks each corner; artists should model this as a distinct material zone even though the module is hidden.
- **Physics/gameplay:** Wide rear-quarter detection cones (~40°, ~25 m). Drives blind-spot warning icon in the door mirror/HUD, cross-traffic alert when reversing out of a bay (detects crossing cars), and feeds the AI-assist/theory teaching. No moving parts.
- **Rendering notes:** The radar windows are the only artist-visible cue — keep them subtly matte and non-metallic. Module boxes only needed in teardown views.
  > **Real-time:** Entirely logical (cone overlap tests vs traffic actors). No visible geometry needed beyond the optional matte corner panels.

---

### 4.9 Decklid / Boot, Spoilers & Active Aero

#### 4.9.1 Powered decklid (boot lid)
- **Purpose/role:** The rear trunk closure — a large painted panel carrying the centre light-bar segments, emblem/cam, and boot spoiler; power-operated.
- **Geometry & dimensions:** ~1,180 mm wide × ~520 mm deep (fore-aft) × gentle crown. Two-piece look: outer skin `MAT_BodyPaint` + inner reinforcement (`MAT_TexturedBlackPP`, visible when open). Shutlines: 4 mm even gap to quarters and bumper; a prominent character crease runs across into the tail-blade centre.
- **Sub-parts:** outer skin, inner frame, weatherstrip (`#0B0B0B` rubber, roughness 0.9), two gas struts or **powered spindle actuators**, latch + striker, emblem/cam plinth, light-bar centre segments (zones 2–4, 4.5.1), boot spoiler (4.9.2), pull-handle recess.
- **Moving parts / animation:**
  - **Open/close:** rotates about a **transverse hinge axis at its leading (forward) edge**, arc ~78°, over ~2.0 s power cycle (ease-in/out). Two 4-bar or spindle actuators drive it; model the **gooseneck hinge arms** sweeping into the boot aperture (they intrude — show them).
  - **Latch:** rotary latch snaps to striker; small cinching pull at the last 15 mm (soft-close). Handle/kick-sensor trigger.
  - **Light continuity:** as it lifts, centre light-bar zones separate from the fixed corner zones — the "continuous bar breaks" is an intentional visual.
- **Physics/gameplay:** Open/close interaction (key-fob, boot button, kick-sensor); boot volume becomes an interactable storage/cargo space; obstruction auto-stop on the powered cycle. Weight shifts CG slightly when open (usually ignored in arcade).
- **Rendering notes:** Interior of boot needs its own (simpler) material set + AO. Weatherstrip and latch reward close-up detail during the open animation. Rain runs off the crown crease.
  > **Real-time:** Single hinge-rotation animation; hinge arms can be simplified/hidden if boot interior isn't gameplay-relevant. Boot interior LOD-swapped in only when opening.

#### 4.9.2 Boot spoiler — ACTIVE / DEPLOYING
- **Purpose/role:** Speed- and mode-actuated rear wing element for downforce/drag and an air-brake function; the headline active-aero feature at the rear.
- **Geometry & dimensions:** Integrated flush "lip" spoiler along the decklid trailing edge, ~1,120 mm wide × ~110 mm chord × ~22 mm thick, that **rises and tilts** into an active wing. Two support pylons on a **4-bar or scissor linkage** hidden under the trailing edge.
- **Material:** Top `MAT_BodyPaint`, underside + linkage `MAT_GlossBlack` / `MAT_CarbonWeave` blade option; end-plates `MAT_DarkChrome`.
- **Moving parts / animation (deploy kinematics — detailed):**
  - **Stowed (0):** flush with decklid, forms the clean trailing edge, contributes to the light-bar/CHMSL line.
  - **Auto-deploy (1):** at **≥ ~90 km/h** the spoiler **raises ~55 mm and tilts to ~+8° AoA** over 0.8 s (ease-out) — low-drag downforce stance. Retracts below ~70 km/h (hysteresis to avoid flutter).
  - **High-downforce / Track (2):** in Sport/Track mode raises to **+15° AoA**, full ~75 mm height.
  - **Air-brake (3):** under hard braking from high speed, snaps to a steep **~+30–35° AoA** within ~0.3 s to add drag + rear downforce, then returns.
  - **Manual/wash (4):** fully raised flat for cleaning/service, driver-toggled.
  - **Kinematic drivers:** blend-controlled by `speed`, `driveMode`, `brakePressure` → a single `spoilerDeploy` 0–1 param plus an `aoaOverride`. Linkage is a parametric 4-bar: pylon angle and platform height co-animate so the wing translates up *and* rotates (not a simple hinge). End-plates rise with it.
- **Physics/mechanical:** If aero modelled, adds rear downforce ∝ deployAngle × speed² and a drag delta (notable in air-brake). Affects high-speed stability/oversteer balance — a real handling input, not just cosmetic, in sim scope. Small motor whir SFX on actuation.
- **Gameplay interaction:** Reacts live to player speed/mode/braking — strong "the car is alive" feedback. Track-mode manual lock; photo-mode poseable. Damage state can jam it.
- **Rendering notes:** The gap it leaves in the decklid when raised needs a modelled recess + inner walls + AO. Underside catches sky/ground reflection at speed. Ensure the CHMSL strip remains visible in all deploy states (dual-mount, 4.5.6).
  > **Real-time:** Keep the wing + 2 pylons as animated geometry (silhouette matters); the full 4-bar linkage collapses to a driven hinge+translate approximation. `spoilerDeploy` is one animation blend. On phones, retain stowed/deployed two-pose lerp; skip air-brake micro-states.

#### 4.9.3 Roof spoiler (fixed)
- **Purpose/role:** Fixed aero lip at the trailing edge of the roof over the backlight; smooths flow onto the boot/wing and houses the primary CHMSL (4.5.6).
- **Geometry:** ~1,240 mm wide, ~90 mm chord, ~35 mm drop, gentle wrap over the C-pillars. Underside ducktail curve.
- **Material:** `MAT_BodyPaint` top, `MAT_GlossBlack` underside; optional `MAT_CarbonWeave` insert.
- **Moving parts:** none (fixed). Integrates CHMSL strip and the top edge of the rear-glass seal.
- **Rendering notes:** Casts a defining shadow on the backlight; key silhouette line. Model the CHMSL channel cleanly.
  > **Real-time:** Merge into roof/body mesh; CHMSL emissive strip retained.

---

### 4.10 Rear Glazing

#### 4.10.1 Rear windshield (backlight)
- **Purpose/role:** Fixed rear window; visibility, house for defroster + antenna traces + CHMSL sightline.
- **Geometry & dimensions:** Steeply raked (~26° from vertical, fastback-ish), ~1,180 mm wide, ~560 mm tall on the curve, laminated glass ~5 mm, gentle spherical curvature. Bonded to the body flange with a black frit border (~25 mm ceramic dot-fade band).
- **Material:** `MAT_Glass` — base `#0A0C0E`, transmission 0.9, roughness 0.02, IOR 1.52, thin green edge tint (`#1E2A22` at grazing), clearcoat 1.0. Frit band `#0A0A0A` matte with a dot-gradient normal.
- **Sub-parts:** glass body, frit border, embedded defroster grid (4.10.2), embedded radio/GPS antenna traces (fine copper lines `#B06A2A`, barely visible), bonded ceramic mounts.
- **Physics/gameplay:** Rear visibility for mirror/reverse; can fog (interior condensation shader in cold/humid weather → cleared by defroster), rain beads on exterior, shatter/crack decal on damage.
- **Rendering notes:** Interior-cabin reflection + refraction; keep a cube-map or SSR fallback. Frit fade prevents a hard glass-to-body edge. Rain: exterior droplet flow map, wiper-cleared arc (4.10.3).
  > **Real-time:** Simplified glass shader (fresnel + cubemap + fake refraction). Fog/rain are toggled overlays; antenna traces baked into the frit texture.

#### 4.10.2 Defroster grid (heated rear window)
- **Purpose/role:** Thin horizontal conductive lines that heat to clear fog/frost from the backlight; visible detail on the glass.
- **Geometry:** ~12–14 fine horizontal lines (~0.6 mm) spanning the glass with two vertical bus-bars at the edges, plus a small radio-antenna sub-pattern integrated top. Slight coppery tint.
- **Material:** emissive-capable overlay on glass: base `#8A5A2A` faint metallic lines (metallic 0.7, roughness 0.5), with an **emissive heat state** (`#FF4A1E`, low intensity, animated warm-up ramp) used to visualize the "rear defrost on" — and functionally to drive the fog-clear.
- **Moving parts/animation:** none physically; the **fog-clear animation** wipes the interior-fog mask outward from the lines when defrost engages (`defrostOn`, ~8 s clear ramp).
- **Gameplay:** Toggleable defrost; teaching moment (winter driving). Clears the condensation shader; small dashboard indicator.
  > **Real-time:** Grid = a single transparent decal texture on the glass. Fog-clear = animating the fog-mask alpha; heat emissive optional/near-camera.

#### 4.10.3 Rear wiper
- **Note on applicability:** As a low-drag fastback flagship, the hero design **omits a rear wiper** (aero + clean-tail aesthetic; rear-cam + hydrophobic glass coating substitute). **However**, a **market/trim variant with a concealed rear wiper is documented here** so the item is fully covered and swappable.
- **Purpose/role:** Clears rain/spray from the backlight for direct rear visibility.
- **Geometry & placement:** Single **concealed/retracting wiper**, ~350 mm blade, parked hidden beneath the roof-spoiler underside lip (or lower frit band). Arm + blade + rubber squeegee.
- **Material:** arm `MAT_GlossBlack` (roughness 0.25), blade rubber `#0A0A0A` roughness 0.9, metal spline `MAT_SatinChrome`.
- **Moving parts / animation:**
  - **Deploy:** on `rearWiperOn` in rain, arm swings out from the concealed park (0.4 s), then sweeps.
  - **Sweep:** arc ~110°, ~0.7 s/sweep, driven by `wiperPhase` sinusoid; intermittent/continuous speeds. Clears a wedge in the rain droplet mask along its arc.
  - **Park/retract:** returns and hides.
- **Physics/gameplay:** Clears exterior rain-mask on the backlight (improves rear-cam/mirror clarity); toggle + speed control; teaching item.
- **Rendering notes:** The cleared arc + smear residue on the droplet flow map sells it. Blade should show a thin water film front + streak trailing edge.
  > **Real-time:** Single-bone sweep animation; clears a radial mask on the rain shader. Omit entirely on the hero (wiperless) config to save the bone + shader branch.

---

### 4.11 Rendering, LOD & Physics Summary (Rear Section)

- **Draw-call budget (target, real-time build):** Rear third ≈ 6–9 draw calls at LOD1: (1) painted body/bumper/decklid atlas, (2) unpainted lower + diffuser, (3) light-bar blade (emissive), (4) glass, (5) brightwork/trim, (6) sensor/detail dots, (+ active spoiler, + reverse cam RT, + wiper if present).
- **Animation bones/params at rear:** `bootOpen`, `spoilerDeploy`(+`aoaOverride`), `emblemCamFlip`, `rearWiperPhase`, `turnSignalPhaseL/R`, plus emissive floats: `tailLevel`, `brakeLevel`, `reverseOn`, `fogOn`, `welcomePhase`, `chargeFill`, `defrostHeat`.
- **Emissive packing:** one RGBA emissive mask (R brake/tail, G indicator, B reverse, A welcome/charge) + a separate small fog+CHMSL+plate mask. Sequential + welcome + charge are all UV-threshold sweeps — no per-LED geometry needed below LOD0.
- **Physics proxies:** fascia convex hull (rear collision), boot-lid + spoiler as animated but non-colliding at gameplay (or thin colliders when open for the boot), radar/ultrasonic as logical cones/rays only.
- **Variant switches:** `powertrain` enum → hybrid (live exhaust bezels + heat-haze + regen-off tail behaviour) vs BEV (blanked bezels + charge-fill signature). `trim` enum → wiper present/absent, carbon vs plastic diffuser, roof/boot spoiler material.

> **Real-time master note:** The rear reads almost entirely on **one continuous emissive light-bar** and the **active spoiler silhouette** — prioritize those two for fidelity at all LODs; everything else (radar boxes, crash beam, hinge linkages, corner-cube prisms, defroster copper) degrades to textures/logic without hurting recognizability.
## 5. Exterior — Sides, Glazing & Roof

**Model designation (fictional):** *Aureon GT-E* — electrified performance flagship. Reference build for this section is the mid-spec "GT Line" trim on the twin-turbo hybrid platform; EV-variant deltas are called out inline. All dimensions are approximate real-world targets in **millimetres (mm)** unless stated. Colours/albedo are given as sRGB hex plus linear notes where useful. This section owns everything on the vehicle's **lateral faces** (from the A-pillar back along both flanks to the C-pillar), the **complete glasshouse (DLO — daylight opening)**, and the **entire roof plane** including sensors and antennas. It excludes the front/rear fascias, doors' inner trim, and wheels/arches structure below the sill (owned by adjacent sections), except where side skirts and arch extensions bolt on.

> Real-time: The whole side+roof set targets ~28k–34k tris at LOD0 for a hero/showroom pass, dropping to ~9k (LOD1, gameplay chase-cam), ~3k (LOD2, mid traffic), ~700 (LOD3, distant traffic). Glass is a single-sided shell in LOD0/1 and collapses into the body shell material from LOD2. All mirror cameras, roof sensors and antenna internals are baked/omitted below LOD1.

---

### 5.1 Coordinate & naming conventions (read first)

- **World axes (engine-agnostic spec):** +X = vehicle right, +Y = up, +Z = forward. Left/right are from the **driver's seat** perspective. UE5 teams: remap to +X forward, +Z up at import; Blender teams: -Y forward, +Z up. A master empty `VEH_root` sits at the contact patch centre, ground plane Y=0.
- **Side/glazing part prefix:** `SIDE_L_*` / `SIDE_R_*`; roof parts `ROOF_*`; glass parts `GLZ_*`.
- **Handedness:** all lateral parts are authored on the **left** and mirrored to the right with a `-X` scale on a duplicate + normal recalculation. Non-symmetric items (shark-fin antenna offset, fuel/charge door) are flagged.
- **Vehicle footprint context (for scale):** length ~5015, width (excl. mirrors) ~1905, width (incl. deployed mirrors) ~2145, height ~1465, wheelbase ~3010. The greenhouse (glasshouse) starts at A-pillar base ~1180 above ground and the roof crown peaks at ~1465.

---

### 5.2 Exterior Mirror Assembly (`SIDE_L_MIRROR` / `SIDE_R_MIRROR`)

Frameless power-folding, auto-dimming, camera-augmented door mirror mounted on the front door sail (not the A-pillar triangle — a "door-mounted" mirror for cleaner aero and reduced A-pillar blind spot). One per side, symmetric except internal camera wiring channel.

#### 5.2.1 Mirror housing (shell / cap)

- **Purpose/role:** aerodynamic fairing enclosing the mirror glass, actuators, heater, indicator, cameras and puddle lamp; a styling signature element.
- **Geometry & dimensions:** teardrop/aerofoil pod. Envelope ~200 (length, fore-aft) × ~135 (width) × ~95 (height). Wall thickness modelled ~2.5. Sail-mount stalk (triangular base to door) ~85 × ~60 footprint, ~40 standoff from door skin. Housing splits into an upper **cap** (paint-matched or gloss-black option) and a lower **base carrier** (satin black). Trailing edge tapers to a ~4 sharp aero lip.
- **Sub-parts:**
  - Upper cap (removable styling shell — supports paint, gloss black, or carbon-weave variants).
  - Lower base carrier / motor housing.
  - Sail stalk with rubber boot at door interface (`SIDE_L_MIRROR_boot`).
  - Trailing-edge indicator lens (see 5.2.4).
  - Underside puddle-lamp bezel + lens.
  - Small NACA-style vent duct on inner face feeding camera-lens airflow (LOD0 only).
- **Materials / PBR:**

| Part | Base colour (albedo) | Metallic | Roughness | Notes |
|---|---|---|---|---|
| Cap (body-paint) | matches body (e.g. "Nebula Grey" #4A4E55) | 0.0 (paint base) | 0.30 clearcoat top | 2-layer car-paint: metallic flake layer + clearcoat (clearcoat 1.0, cc-roughness 0.05) |
| Cap (gloss black option) | #0B0B0D | 0.0 | 0.08 | clearcoat 1.0 |
| Cap (carbon option) | woven normal map, #1A1A1C | 0.0 | 0.22 | anisotropic weave, aniso 0.6 aligned to fore-aft |
| Base carrier | #17181A | 0.0 | 0.55 | textured satin plastic, micro-normal |
| Boot | #101012 | 0.0 | 0.9 | soft EPDM rubber, subtle bump |

- **Moving parts & animation:**
  - **Power-fold:** whole housing rotates about a near-vertical hinge axis at the stalk. Axis is canted ~7° from vertical (top leans inward). Range: **deployed 0° → folded ~78°** inward (glass faces the door). Driver: `param_MirrorFold` 0→1. Duration ~1.1 s, ease-in-out (slight overshoot 3° then settle). Triggers: lock/unlock, low-speed manoeuvre toggle, contact-avoidance. Play folded state on park/lock.
  - **Auto-tilt-down on reverse:** on selecting R, the *glass only* (see 5.2.2) tilts down ~12° to show the kerb; housing static.
- **Physics/mechanical:** collision proxy is a soft capsule; mirror is a **breakaway** part — on lateral impact > threshold it folds fully and, above a hard threshold, detaches to a physics prop (`SIDE_L_MIRROR_debris`). Folded state reduces vehicle width collision AABB by ~120/side (relevant for tight-gap gameplay).
- **Gameplay interaction:** foldable via horn-adjacent context action in tight alleys; clipping a mirror on a parked car triggers a scrape event + score penalty in the driving-test scoring rig; shattered mirror disables that side's blind-spot camera feed (see 5.2.6).
- **Rendering notes:** cap uses the shared car-paint master material instance so a single body-colour parameter drives it. Puddle lamp is an emissive decal projecting a gobo (maker emblem silhouette) onto the ground — LOD0/1 only.

> Real-time: fold is a 2-bone animation (stalk pivot + glass tilt), baked to a 24-frame clip. Puddle-lamp gobo becomes a static unlit decal that fades with a scalar; NACA vent and boot deformation omitted below LOD1.

#### 5.2.2 Mirror glass (reflective element)

- **Purpose/role:** primary rearward reflective surface; frameless, edge-to-edge, electrochromic auto-dimming, aspheric outer zone.
- **Geometry & dimensions:** convex spherical-aspheric lens ~165 (W) × ~105 (H), sagitta ~6 (base radius ~1400 mm on the main zone). Outer ~30 band is aspheric (tighter radius ~700 mm) with an etched vertical demarcation line. Sits recessed ~5 into the housing aperture with a ~2 gap gasket.
- **Sub-parts:** glass laminate, conductive electrochromic film, ITO heater grid (below), demarcation etch line, blind-spot LED window (5.2.4), backing plate bonded to actuator gimbal.
- **Materials / PBR (this is a mirror — author as such):**
  - Base colour #E9EDF0 (near-white, irrelevant under full metalness).
  - **Metallic 1.0**, **Roughness 0.02–0.05** (very sharp reflection; slight roughening at panel edges 0.08).
  - Real reflection via a per-mirror **planar reflection capture** or a low-res **SceneCapture2D** cube/plane (LOD0). Convex distortion faked with a normal-map "bulge" (radial gradient) so a flat reflection plane reads as convex.
  - Electrochromic dimming: multiply reflection by `param_MirrorDim` 1.0→0.25 (a darkening tint, slight blue #cfe0ff at max dim). Driven by rear-glare sensor value.
  - Aspheric band: separate UV region with a stronger radial normal + faint blue anti-glare tint; etch line is a thin emissive-off dark decal.
- **Moving parts & animation:** glass tilts on a 2-axis gimbal behind it — **pan ±15° (X-axis/vertical hinge)**, **tilt ±15° (horizontal hinge)** for adjustment; plus the **reverse auto-tilt -12°**. Driver params `param_MirrorAdjustX/Y`. Adjustment is user-set state, not animated in gameplay except reverse-tilt (0.4 s).
- **Physics/mechanical:** no collision beyond housing; on shatter, swap to `GLZ_mirror_shattered` variant (cracked normal + reduced/broken reflection) and spawn glass-shard particles.
- **Gameplay interaction:** the reflection actually shows approaching traffic (feeds the mirror-check driving-test metric — "did the learner glance and was a hazard visible"). Auto-dim reacts to headlight glare at night.
- **Rendering notes:** planar reflection is expensive — gate to hero cam & player vehicle only. Convex bulge normal keeps mid-LOD believable without a live capture.

> Real-time: replace live capture with (a) a low-res cubemap updated every N frames, or (b) on phone, a static baked reflection probe + a scrolling faux-traffic parallax. Below LOD1 the glass is a flat metallic quad with a cubemap only.

#### 5.2.3 Mirror heating element (defrost grid)

- **Purpose/role:** clears fog/frost/ice from the glass; also warms the camera-lens area.
- **Geometry:** serpentine ITO / etched resistive grid laminated behind the reflective layer; not separately visible except as a faint horizontal line pattern when fogged. Model as a **texture/decal layer**, not geometry.
- **Materials:** an emissive-driven "defog reveal" mask — when `param_MirrorHeat` active, a fog overlay (roughness raised to 0.6, cloudy alpha) retreats from the grid lines outward over ~6 s. Grid line albedo #B9C0C6 at ~1px width, only visible under condensation.
- **Animation/driver:** `param_MirrorHeat` 0/1 tied to rear-defrost button + auto-on below 3 °C. Fog-clear is a shader-time animated mask.
- **Gameplay:** in cold/weather scenarios the mirror starts fogged and must be defogged; obscured mirror degrades the mirror-check hazard visibility until cleared.

> Real-time: fog + defog is a single overlay material param; grid geometry never exists as mesh.

#### 5.2.4 Blind-spot indicator + integrated turn-signal repeater

- **Purpose/role:** two illuminated functions in the mirror — (a) an amber **blind-spot warning** icon on the *glass* inner-upper corner, (b) a **sequential turn-signal repeater** LED strip along the housing's trailing/outer edge.
- **Geometry:**
  - BSM icon: a small triangular "car+arrow" window ~18 × 14 etched into the glass coating, back-lit.
  - Repeater: a clear/smoked lens strip ~90 × 12 following the housing trailing aero edge, containing ~12 LED segments (sequential).
- **Materials / PBR:**
  - Repeater lens: clear acrylic, base #141416, roughness 0.1, with an emissive channel. **Off:** emissive 0, faint amber tint under the smoked lens. **On:** emissive amber #FF8A00, intensity ramped; sequential sweep outward.
  - BSM icon: emissive amber #FFB100, two states — **steady** (vehicle in blind spot) and **blink 2 Hz** (blind spot + turn signal toward that side).
- **Animation/driver:**
  - Repeater sweep: `param_IndicatorL/R` triggers a 12-segment sequential fill over ~0.25 s, hold, then off, at 1.5 Hz overall blink.
  - BSM: driven by `param_BSM_L/R` from the sim's proximity/traffic query.
- **Physics/mechanical:** none; pure lighting.
- **Gameplay interaction:** BSM icon is a real driver-assist cue — lights when the traffic system detects a vehicle in the lateral hazard zone; used in the lane-change scoring (did the learner respect a lit BSM?). Repeater aids readability of the player's signalling to AI traffic.
- **Rendering notes:** emissive + a small point/rect light per side for night bloom; sequential handled via a scrolling emissive mask or per-segment material params.

> Real-time: repeater becomes a single amber emissive quad that blinks (no per-segment sweep) below LOD1; BSM icon stays as an emissive decal because it's gameplay-critical, but its light source is dropped.

#### 5.2.5 Mirror-mounted cameras (surround-view + side)

- **Purpose/role:** downward-facing **surround-view (bird's-eye) side cameras** in the mirror underside, feeding the 360° composite; plus forward-angled **side cameras** on the sail for lane/parking assist. (This is the camera-augmentation of a conventional mirror, not a full mirrorless-replacement system — glass mirrors remain.)
- **Geometry:** two lens modules per mirror. Surround cam: ~12 dia lens on the housing underside, angled ~40° down/out to see the flank + ground. Sail cam: ~9 dia lens on the inboard face of the stalk, angled forward. Each is a small hemispherical fisheye lens + black bezel.
- **Materials / PBR:** lens = dark glass, base #0A0A0C, metallic 0.0, roughness 0.05, thin clearcoat; a subtle iridescent lens-coating tint (interference normal) for hero shots. Bezel satin black 0.6 rough. Tiny emissive status dot (green) when active on some trims.
- **Moving parts:** none (fixed), but they inherit the housing fold transform — folded mirrors give a different surround-view stitch, which the sim can reflect.
- **Physics/mechanical:** none; they are sensor origins. Each camera has an engine **SceneCapture / render-target** in LOD0 for the actual 360 view UI.
- **Gameplay interaction:** feed the in-cockpit 360°/reverse display; used in the parking scenarios and the "check surroundings" test metric. If a mirror is folded or damaged, the corresponding quadrant of the surround view drops out.
- **Rendering notes:** render targets are costly — only the *player* car runs live captures, and only when the surround-view UI is open.

> Real-time: captures disabled unless the surround-view HUD is active; on phone, the 360 view uses pre-rendered/faked warps. Lens modules are baked-in geometry to LOD1, gone by LOD2.

#### 5.2.6 Mirror wiring / actuator internals (LOD0 detail)

- **Purpose:** completeness for hero cinematics / cutaways.
- **Geometry:** twin geared DC actuator pods (fold motor + glass gimbal motor), a small PCB, a ribbon harness through the boot into the door. ~5–8 small parts, envelope inside housing.
- **Materials:** PCB green #1E5B3A rough 0.6 with copper traces (metallic 1.0 patches); motors matte grey #4A4C50 rough 0.7; wiring loom black rough 0.9.
- **Rendering notes:** only present in LOD0 cutaway/showroom; culled otherwise.

> Real-time: entirely omitted below LOD0.

---

### 5.3 Door Glass — Front & Rear (`GLZ_L_doorFront`, `GLZ_L_doorRear`, + R)

Frameless (hardtop-style) laminated side windows — a key styling and physics element for this performance sedan.

#### 5.3.1 Front door glass

- **Purpose/role:** operable side window; frameless top edge seals directly to the roof rail gasket; laminated acoustic + IR-reflective glass.
- **Geometry & dimensions:** compound-curved tempered/laminated pane. DLO opening ~880 (length) × ~430 (max height at B-pillar) tapering to ~330 at the mirror end. Thickness ~4.8 (laminate: 2.1 + PVB 0.8 + 1.9). Gentle cylindrical curvature radius ~2600 mm plus slight vertical crown. Top edge is the frameless "cut line."
- **Sub-parts:** glass laminate, black ceramic frit border (perimeter, ~12–20 wide), acoustic PVB interlayer (invisible, spec note only), a faint bottom guide bracket (hidden in door).
- **Materials / PBR:**

| Property | Value |
|---|---|
| Base colour (albedo, glass tint) | #0E1418 with alpha — very dark, slight green-neutral |
| Metallic | 0.0 |
| Roughness | 0.03 (outer), 0.05 near frit |
| Transmission | ~0.62 (privacy/IR); front doors legally lighter than rears |
| IOR | 1.52 |
| Specular/clearcoat | high spec; thin-film IR coating gives a faint gold/violet grazing-angle sheen (interference tint in fresnel) |
| Frit border | #050506, roughness 0.35, opaque, dotted gradient fade inward |

- **Moving parts & animation:** window **retracts down** into the door. Axis = vertical (slightly canted to follow door skin ~2°). Range: fully up (sealed) → fully down (~430 travel, glass hidden in door cavity). Driver `param_WinFL` 0→1, one-touch express ~1.6 s with ease-out; auto-reverse on obstruction. Frameless glass drops ~5 automatically on door-open and re-seals on close (short-drop) — `param_DoorAjar` couples a small offset.
- **Physics/mechanical:** window-up glass is part of the sealed cabin (affects wind noise state + weather ingress). Down glass removes that pane from collision/occlusion. Shatter state → `GLZ_L_doorFront_shattered` (spider-crack normal + hole mask + shard particles); laminated glass "spiders but holds" rather than fully clearing.
- **Gameplay interaction:** roll down for drive-thru/toll/parking-ticket interactions, hand signals, and "window down" ambience; wind/road noise rises with aperture; can be shot/shattered in stunt modes.
- **Rendering notes:** single-sided glass shell with backface disabled; interior visible through it via the transmission material. Frit hides the top seal line and any UV seams.

> Real-time: express-drop is a single 1-bone slide clip. Short-drop-on-open is a scripted 5mm offset, skippable on phone. Shatter uses a decal + opacity mask rather than a fractured mesh below LOD1. Transmission is faked with a tinted cutout + cubemap on low-end.

#### 5.3.2 Rear door glass

- **Purpose/role:** rear passenger operable window; slightly darker "privacy" tint; frameless top edge.
- **Geometry & dimensions:** ~760 (length) × ~410 (height), curved. A near-invisible internal division: the operable main pane + a small fixed lower-rear corner behind the B-pillar isn't present here (that role goes to the quarter glass, 5.4). Thickness ~4.6.
- **Materials:** as front but **transmission ~0.42** (darker privacy tint), same IR coating. Frit border ~15 wide.
- **Moving parts & animation:** retracts ~380 into rear door (does not fully vanish due to arch intrusion — ~20 remains visible even fully down; author the "cannot fully lower" trait). Driver `param_WinRL`, express ~1.4 s.
- **Physics/mechanical & gameplay:** child-lock state can disable operation (scenario flag); otherwise as front.
- **Rendering notes:** darker tint reduces need for detailed interior rear behind it at distance.

> Real-time: same as 5.3.1; the "20mm never lowers" trait is baked into the clip end pose.

---

### 5.4 Quarter Glass (`GLZ_L_quarterC`)

Fixed rear-quarter (C-pillar) window completing the DLO.

- **Purpose/role:** fixed glass filling the triangular/trapezoidal area between the rear door and the C-pillar; extends the glasshouse for a "greenhouse" look and rear 3/4 visibility.
- **Geometry & dimensions:** trapezoid, ~330 (front edge height) × ~210 (rear) × ~480 (length along beltline), curved to wrap toward the rear. Thickness ~4.4. Set into a bright/black surround trim.
- **Sub-parts:** glass, frit border, a slim chrome or gloss-black surround finisher (part of 5.5), optional embedded aerial (diversity antenna) trace.
- **Materials / PBR:** as rear door glass, transmission ~0.40, tint #0D1216, IR sheen. Frit border wraps the fixed perimeter (wider ~20 along the pillar side to hide bond line). Optional printed antenna traces = faint copper #B87333 hairlines under the frit (LOD0 detail only).
- **Moving parts:** none (fixed).
- **Physics/mechanical:** part of sealed cabin; shatter variant available. No collision beyond body shell.
- **Gameplay interaction:** rear 3/4 blind-spot visibility (matters for shoulder-check scoring). Embedded antenna is cosmetic here.
- **Rendering notes:** helps the C-pillar read as slim; keep frit consistent with door glass frit.

> Real-time: merges into the door-glass material/atlas from LOD1; a fixed quad, no separate physics.

---

### 5.5 Bright Trim, Beltline & Window Surrounds (`SIDE_L_trim_*`)

The chrome/satin "jewellery" framing the DLO and running the flank.

#### 5.5.1 Window surround / DLO finisher

- **Purpose/role:** frames the entire side-glass opening (A-pillar → roof rail → C-pillar → beltline), hides seals and glass edges, defines the car's "signature." Selectable finish (bright chrome / satin aluminium / gloss black "shadowline").
- **Geometry:** a continuous ~14–22 wide, ~3–6 proud extruded profile following the DLO perimeter; C-shaped cross-section clipping over the pinch-weld/seal. Total run per side ~3.4 m.
- **Materials / PBR:**

| Finish | Albedo | Metallic | Roughness | Notes |
|---|---|---|---|---|
| Bright chrome | #C7CBD0 | 1.0 | 0.06 | needs good env reflection; anisotropy 0.1 along run |
| Satin aluminium | #A9ADB2 | 1.0 | 0.28 | brushed micro-normal along length |
| Gloss black shadowline | #0B0B0D | 0.0 | 0.08 | clearcoat 1.0 |

- **Moving parts:** none.
- **Rendering notes:** chrome variant is the biggest "cheap-looking-if-wrong" risk — must sample a decent reflection probe; add a subtle roughness gradient and edge bevel (0.5) so it isn't a mirror-perfect ribbon.

> Real-time: trim becomes a thin emissive-free metallic strip sharing the body atlas; brushed/aniso dropped below LOD1; on phone, chrome uses a matcap-style cheat.

#### 5.5.2 Beltline moulding (upper & lower window seals / weatherstrips)

- **Purpose/role:** the outer weatherstrip ("belt seal") wiping the glass at the door top edge; the visible black line along the base of the DLO.
- **Geometry:** slim ~12 tall flocked rubber lip strip running the door beltline, ~880 (front) + ~760 (rear) per side; a matching inner belt seal hidden. A fin/blade lip contacts the glass.
- **Materials:** flocked EPDM, base #0C0C0E, roughness 0.9, micro-fuzz normal (velvet-like, low spec). No metallic.
- **Moving parts:** static, but the glass slides through it (visual contact only).
- **Rendering notes:** its matte black grounds the shiny surround above it; keep it truly matte to avoid a plasticky read.

> Real-time: baked into the door texture as a dark strip below LOD1.

#### 5.5.3 A-, B-, C-pillar exterior appliqués

- **Purpose/role:** the black/gloss covers over the pillars within the DLO that create the "floating roof" / blacked-out pillar look.
- **Geometry:** B-pillar appliqué ~380 (H) × ~90 (W), slightly proud; A and C pillar frit+trim continuations. B-pillar cover often piano-black gloss.
- **Materials:** gloss black #08080A, clearcoat 1.0, roughness 0.06; optional smoked-chrome trim variant. Fingerprint-prone surface — add subtle smudge detail map for realism in hero shots.
- **Moving parts:** none. Note: front door glass frameless top and B-pillar cover meet — ensure no z-fight at the seam.

> Real-time: merged into body/glass atlas; gloss retained as it reads strongly.

---

### 5.6 Rocker Panels, Side Skirts & Sill (`SIDE_L_rocker`, `SIDE_L_skirt`)

Lower flank between the wheel arches, below the doors.

#### 5.6.1 Rocker panel / sill

- **Purpose/role:** structural sill cover + aero; the visible lower edge of the body between front and rear arches; on the EV variant it also caps the battery-pack side rail (slightly deeper).
- **Geometry & dimensions:** ~1900 (length between arch cutouts) × ~150 (visible height) × sculpted profile with an undercut ~30 deep. EV variant ~25 taller to cover the pack; a subtle horizontal crease + a body-colour upper and contrast-black lower two-tone.
- **Materials:** upper = body paint; lower = textured black cladding #1A1B1D, roughness 0.6, micro pebble normal (scuff-hiding). A slim satin-aluminium insert strip optional (metallic 1.0, rough 0.3).
- **Moving parts:** none. Collision: contributes to the low side collision proxy; kerb-scrape events register here.
- **Gameplay:** kerb/curb scraping in parking tests scuffs the rocker (decal accumulation); ground-scrape sparks on hard bottom-out (stunt mode).

> Real-time: two-tone baked; pebble normal dropped below LOD2.

#### 5.6.2 Side skirt (aero extension) & step

- **Purpose/role:** performance aero addendum extending the rocker outward/down, managing side airflow; also functions as the door-sill step trim.
- **Geometry:** a ~40 outboard flare with a sharp lower lip and small strakes/fins (3–4) angled to guide air. Front kick-up meets the front arch liner; rear meets the rear diffuser strakes (owned by rear section).
- **Materials:** gloss black or carbon-weave (aniso weave normal), roughness 0.2; lip edge painted-body option. Strakes satin black.
- **Moving parts:** none. Some trims add a **deployable air blade** — omit unless "GT Performance" trim; if present, `param_AeroBlade` extends it ~15 down above 120 km/h.
- **Rendering notes:** carbon weave scale ~6mm; keep strakes as separate low insets to catch light.

> Real-time: strakes/fins collapse into normal-map detail at LOD1; deployable blade animation gameplay-optional and baked.

#### 5.6.3 Door-sill scuff plate (visible when door open)

- **Purpose/role:** illuminated tread plate on the inner sill lip, revealed when a door opens; carries the (fictional) maker wordmark.
- **Geometry:** ~500 × 55 brushed metal plate, ~2 proud, with an etched/backlit logo window.
- **Materials:** brushed stainless #B6BABF, metallic 1.0, roughness 0.35 (brushed along length); logo window emissive cool-white #EAF2FF, `param_DoorAjar`-driven glow.
- **Moving parts:** revealed by door-open (door owned by another section, but the plate lives on the sill here). Light fades in over 0.4 s on open.

> Real-time: only present/lit when a door-open state is active near the player.

---

### 5.7 Wheel-Arch Extensions / Fender Flares (`SIDE_L_archFront`, `SIDE_L_archRear`)

- **Purpose/role:** the raised lips around all four wheel openings — cover the tyre sidewall gap, add muscular haunches, house arch-liner edges; on the EV variant subtly wider to cover a wider track.
- **Geometry & dimensions:** front arch radius ~370 opening, rear ~380; flare lip projects ~18–28 outboard, cross-section a rolled/undercut lip ~25 tall. Rear haunch is more pronounced (styling). Blend seamlessly into rocker (5.6) and into the fascias (front/rear sections).
- **Sub-parts:** the flare lip, an inner arch-lip return (~30), optional contrast-black cladding vs body-paint (trim-dependent), a thin under-lip aero strake at the front arch trailing edge.
- **Materials:** body paint (painted flares) OR textured black cladding (#1A1B1D, rough 0.6, pebble normal) for the "rugged/GT" look. Painted variant uses the car-paint master. Edge bevel ~1.5 to catch highlight.
- **Moving parts:** none, but they define the visual gap to the tyre — suspension travel (owned by chassis section) moves the wheel *within* this static arch; ensure clearance so tyre never clips the flare at full bump (min gap ~15 at full compression).
- **Physics/mechanical:** contribute to the body-side collision hull; the arch opening defines the wheel-well occlusion for the tyre-spray/particle system.
- **Gameplay interaction:** at max steering + full bump the tyre nears the liner (rub scenario); off-road/kerb hops show tyre-into-arch travel; mud/spray decals accumulate on the lower arch.
- **Rendering notes:** the arch lip inner return must exist so you never see through to a hollow shell when the camera looks up into the well; pair with an arch-liner shell (dark, rough) so the wheel reads as recessed.

> Real-time: arch-liner is a simple dark shell; inner return kept to LOD1 to avoid see-through, dropped at LOD2 where wells are occluded anyway.

---

### 5.8 Door Locks, Handles Interface & Soft-Close (`SIDE_L_lockFront`, ...)

Note: the outer **door handles** styling body lives with the doors section; this subsection owns the **locking hardware, latch, and soft-close mechanism** and their side-visible cues (the flush handle deploy is described where it interacts with the flank).

#### 5.8.1 Door latch & lock mechanism

- **Purpose/role:** electro-mechanical latch securing each door; supports central locking, keyless entry, child locks (rear), and crash-lock/auto-unlock logic.
- **Geometry:** latch body ~90 × 70 × 45 recessed in the door shut face; a striker loop ~40 on the body-side pillar (B-pillar for front doors, C-pillar for rears). Visible only on door-open at the shut faces.
- **Materials:** zinc-alloy latch #6E7175 metallic 1.0 rough 0.5; striker chromed #C7CBD0 metallic 1.0 rough 0.2 (wear-polished); surrounding shut-face panel body-paint.
- **Moving parts & animation:**
  - Latch pawl rotates ~30° to release; `param_DoorLatch` pulse on open.
  - Lock state: internal, surfaced via the flush handle + indicator (below). `param_DoorLock` 0/1.
- **Physics/mechanical:** latched doors are rigid with the body; unlatched → door becomes a hinged constraint (owned by door section) — this subsection supplies the latch break/lock boolean.
- **Gameplay:** locked doors block entry in scenarios; crash auto-unlock; child-locked rear doors can't open from inside (scenario logic). Keyless: approaching with the fob (or phone key) unlocks + a chirp.

#### 5.8.2 Flush handle deploy interaction (side-visible)

- **Purpose/role:** the aero flush door handles present flush with the flank and deploy on approach/touch — a key side-surface animated feature. (Handle mesh detailing in doors section; motion + flank cutout owned here for continuity.)
- **Geometry:** handle pocket ~150 × 40 recess in the door skin; handle paddle sits flush ±0.5 when retracted.
- **Materials:** paddle body-paint or satin chrome; pocket interior satin black with a soft LED wash (welcome light).
- **Moving parts & animation:** paddle **presents outward ~22** on a 4-bar linkage, tilting ~8°, over ~0.8 s ease-out. Driver `param_HandlePresent` triggered by keyless approach, unlock, or touch-sensor. Retracts ~1.4 s after drive-away above ~5 km/h (flush for aero) or on lock.
- **Physics/mechanical:** presented handle slightly increases side width (minor); can be a snag point in tight-gap gameplay (cosmetic).
- **Gameplay:** approach-to-deploy is a satisfying entry beat; frozen-handle scenario (winter) where handle won't present until tapped.

> Real-time: 4-bar linkage baked to a 1-bone slide+tilt clip; welcome-light wash is an emissive param. Below LOD1 handles are static-flush (no deploy).

#### 5.8.3 Lock-state indicator

- **Purpose/role:** small visual cue of lock state — a subtle LED on the handle pocket or a mirror-base "welcome" sequence.
- **Materials:** emissive; **locked** = off/red pin-dot, **unlocked** = soft white welcome fade.
- **Driver:** `param_DoorLock`. Ties into the mirror puddle-lamp welcome sequence (5.2.1).

#### 5.8.4 Soft-close mechanism (cinch)

- **Purpose/role:** power cinch that pulls a door from the secondary (ajar) latch to fully closed silently — a luxury feature.
- **Geometry:** a small motorised cinch actuator integrated at the latch (~60 × 50 add-on to the latch body), a pawl arm.
- **Materials:** matte motor grey #4A4C50 rough 0.7 (internal, LOD0 only).
- **Moving parts & animation:** when a door rests at ~10 ajar, the cinch pawl rotates and **draws the door the last ~8** to full close over ~1.0 s with a soft motorised motion (no slam). `param_SoftClose` pulse; couples to the door hinge constraint to animate the last-inch pull. Reverse: on unlatch, a slight power pop-out ~4.
- **Physics/mechanical:** overrides the door hinge to a scripted close for the final travel; suppresses the hard latch impulse (so no bounce).
- **Gameplay:** doors never slam — they whisper shut; a distinct soft-close SFX cue; failure/dead-battery scenario disables cinch (door stays ajar with a warning).
- **Rendering/audio:** pair tightly with sound design — the motor whir + soft thunk is a signature audio moment; provide an animation event marker at the pull-start and seat-home frames.

> Real-time: cinch is a scripted last-8mm ease on the door close animation; actuator geometry omitted below LOD0. Keep the audio event markers even at low LOD.

---

### 5.9 Panoramic Glass Roof (`ROOF_pano`, `GLZ_roof`)

Full-length fixed panoramic glass roof with an electrochromic (switchable) tint and a powered sunshade; the moonroof front section can tilt/slide (5.10).

#### 5.9.1 Panoramic glass panel

- **Purpose/role:** large fixed laminated glass roof spanning front-header to rear-header, flooding the cabin with light; switchable opacity for glare/privacy.
- **Geometry & dimensions:** single-piece (or front-tilt + fixed rear, see 5.10) laminated panel ~1300 (length) × ~950 (width), crowned ~40 across width and ~25 along length (double curvature). Thickness ~5.2 (laminate + PVB + electrochromic film). Perimeter bonded into the roof frame with a ~30 frit border. Sits flush with roof rails, ~3 proud of the painted header.
- **Sub-parts:** outer glass, PDLC/electrochromic film layer, PVB interlayer, frit border (dotted gradient), a central rib channel (if two-panel), embedded defrost/antenna traces optional.
- **Materials / PBR:**

| Property | Value |
|---|---|
| Base colour (tint) | #10161A, dark neutral |
| Metallic | 0.0 |
| Roughness | 0.03 |
| Transmission (clear state) | ~0.55 |
| Transmission (opaque state) | ~0.06 (frosted/dark) |
| IOR | 1.52 |
| IR coating sheen | faint gold/violet fresnel tint |
| Frit border | #060607, opaque, ~30 wide, dotted fade |

- **Moving parts & animation:** the *panel itself* is fixed (except the moonroof front, 5.10). The **electrochromic tint** transitions clear→opaque: `param_RoofTint` 0→1 over ~3–5 s, a diffusion-style front sweeping across the panel (author as an animated mask, not instant). Can do zoned tinting (front/rear halves) on high trims.
- **Physics/mechanical:** part of sealed cabin; contributes to cabin thermal/greenhouse gameplay flavour (interior heat in sun). Shatter variant spiders + sags.
- **Gameplay interaction:** dim the roof in bright-sun scenarios (glare reduction on the driving-test glare metric); "open sky" ambience; night-sky reflection for cinematic drives.
- **Rendering notes:** the roof glass is a major interior-lighting contributor — drive an interior light/probe from `param_RoofTint` so dimming visibly darkens the cabin. Frit gradient hides the bond line and softens the interior/exterior transition.

> Real-time: electrochromic = one material scalar blending two tint values + a swept mask; interior darkening = a coupled interior light intensity scalar. On phone, transmission faked with a static tinted panel + cubemap sky reflection; no live interior see-through.

#### 5.9.2 Powered sunshade (interior, but coupled here)

- **Purpose/role:** a physical mesh/fabric shade under the glass (belt-and-braces with the electrochromic tint); primarily an interior part but its motion is specified here for roof-system coherence.
- **Geometry:** roll-up fabric shade ~1250 × 900, stored in a front cassette.
- **Materials:** perforated fabric, base #C9C6BE (light) or #2A2A2C (dark trim), roughness 0.9, subtle weave normal, slight translucency (thin transmission ~0.1).
- **Moving parts & animation:** slides fore→aft on rails; `param_RoofShade` 0 (stowed) →1 (fully covering) over ~4 s. Independent of glass tint.
- **Gameplay:** alternative glare control; combined with tint for full blackout.

> Real-time: a single sliding quad with a masked reveal; below LOD1 the interior roof is just a dark liner (shade omitted).

---

### 5.10 Moonroof / Sunroof (front operable section) (`ROOF_moon`)

If the pano roof includes an operable front — a tilt-and-slide moonroof over the front-row.

- **Purpose/role:** ventilation + open-air; tilt (pop-up rear edge) and slide (retract over/into the fixed rear glass) modes.
- **Geometry & dimensions:** operable glass sub-panel ~700 (length) × ~900 (width), thickness ~5.0, matching crown. Seals in a channel frame with a wind deflector at its front edge.
- **Sub-parts:** operable glass, guide shoes/rails (2), drive cable + motor (front cassette), wind deflector mesh, perimeter seal.
- **Materials:** glass as pano panel (5.9.1). Wind deflector = black mesh (#0A0A0C, rough 0.9, alpha-cutout net). Rails satin black metal, hidden.
- **Moving parts & animation (two-stage kinematics):**
  - **Tilt (vent):** rear edge of the panel lifts about a front hinge — rise ~40 at the rear edge, ~9° tilt. `param_MoonTilt` 0→1 over ~1.2 s. Wind deflector auto-raises when tilted/opened (`param_WindDeflector` follows).
  - **Slide (open):** from closed (or tilt-return), the panel drops slightly (~10) to clear the roof skin, then slides rearward up to ~600 travel, sliding **over the fixed rear pano glass on external rails** (spoiler-style) or into a cassette (inbuilt-style — choose external-slide for this frameless design). `param_MoonSlide` 0→1 over ~3 s; auto-stop at "comfort" ~70% then full on second press. Anti-pinch reverse on obstruction.
  - Wind deflector: a mesh net that flips up ~55 at the front header when the panel opens past ~15%, reducing buffeting; `param_WindDeflector` coupled to slide.
- **Physics/mechanical:** open moonroof opens the cabin (wind noise + weather ingress state; rain enters if open in rain — scenario). Buffeting audio tied to speed × aperture.
- **Gameplay interaction:** open-sky driving, "sunroof open in rain" mistake scenario, ventilation comfort; hand-out-of-roof emote (stunt/social).
- **Rendering notes:** the sliding-over-rear-glass creates a double-glass overlap zone — manage transparency sort/z there; the wind deflector's alpha-net needs correct sorting against the sky.

> Real-time: tilt+slide = a 2-bone clip (tilt bone + slide bone) with the deflector as a 3rd simple bone. Overlap double-glass simplified to a single depth-sorted layer; on phone, moonroof may be fixed-closed (animation gated off).

---

### 5.11 Roof Rails & Crossbar Mounts (`ROOF_rail_L/R`)

- **Purpose/role:** low-profile longitudinal roof rails (this sedan uses subtle integrated/flush rails more for styling + optional accessory mounting than heavy load). Frame the roof edge and cap the glass-to-body transition.
- **Geometry & dimensions:** two rails, ~1200 (length) each, ~28 (width) × ~18 (height) low-profile aero cross-section, running just inboard of the roof edge along the pano-glass frame. Flush "closed" style — minimal gap to roof; ~4 concealed T-slot mount points under removable caps.
- **Sub-parts:** rail extrusion, end caps (front/rear, teardrop), concealed mounting-point covers, foot pads.
- **Materials:**

| Finish | Albedo | Metallic | Roughness |
|---|---|---|---|
| Satin silver anodized | #A9ADB2 | 1.0 | 0.3 (brushed along length) |
| Gloss black | #0B0B0D | 0.0 | 0.08 (clearcoat 1.0) |

- **Moving parts:** none (mount caps can be "removed" to attach a fictional crossbar/roof-box accessory in customization — an accessory-mount state, not an animation).
- **Physics/mechanical:** if accessories attached (roof box), they add drag + raise the collision AABB height + shift CoG slightly (light gameplay effect). Base rails negligible.
- **Gameplay/customization:** attachment points for roof-box/bike-rack cosmetic accessories; adds height for low-clearance (car-park barrier) scenarios.
- **Rendering notes:** keep rails as separate slim pieces to catch a highlight and read the roof edge; brushed anisotropy along length.

> Real-time: rails are simple beveled bars; mount caps baked; brushed aniso → LOD1 only.

---

### 5.12 Antennas & Roof Sensors

#### 5.12.1 Shark-fin antenna module (`ROOF_sharkfin`)

- **Purpose/role:** the aero fin housing multiple antennas — cellular/5G, GPS/GNSS, satellite radio, V2X, and the emergency-call/telematics aerials — mounted at the rear roof centre (slightly offset — flag as non-symmetric).
- **Geometry & dimensions:** teardrop fin ~200 (length) × ~55 (base width) × ~70 (height), swept trailing edge; a soft rubber/plastic base gasket (~5) to the roof. Positioned at rear roof centreline, base ~200 forward of the rear header.
- **Sub-parts:** outer shell (2-part: painted upper cap + black base), base gasket, and internally (LOD0): a GPS/GNSS patch antenna (ceramic square ~25×25), 5G/cellular FR1+FR2 antenna PCBs (2–3 vertical traces), satellite antenna helix/patch, a small PCB + coax pigtails.
- **Materials:**
  - Upper cap: body-paint (car-paint master) OR gloss black; roughness/clearcoat per finish.
  - Base: satin black #17181A rough 0.55.
  - Gasket: matte rubber #0E0E10 rough 0.9.
  - Internals (LOD0): ceramic patch off-white #E6E4DC rough 0.5, PCB green #1E5B3A, copper traces metallic.
- **Moving parts:** none.
- **Physics/mechanical:** minor collision (breakaway if scraped under a low barrier — a low-clearance scenario cue); a sensor origin for the sim's GPS/comm systems (map/nav signal, radio).
- **Gameplay:** houses the "GPS lock" and radio-signal sources; damaged fin → degraded nav/radio in scenarios; low-barrier clearance mistake shears it (stunt/parking-garage).
- **Rendering notes:** paint-matched cap ties it to the body colour param; keep the swept edge crisp for silhouette reads on the roofline.

> Real-time: fin is a single low-poly teardrop with baked base; internals omitted entirely below LOD0. Signal "origin" is just a transform.

#### 5.12.2 GPS / GNSS antenna (dedicated puck, LOD0)

- **Purpose/role:** precision positioning; may be a separate low-profile puck near the fin on high-nav trims, or integrated in the fin (default: integrated). If separate: a ~40 dia × 12 black puck.
- **Materials:** matte black #101012 rough 0.7, thin base gasket.
- **Function:** feeds the nav/position system origin; sky-view dependent (tunnels drop signal — a scenario flavour).

> Real-time: integrated into fin; separate puck only appears on the LOD0 hero of the nav trim.

#### 5.12.3 5G / cellular & V2X antennas

- **Purpose/role:** connectivity for OTA updates, telematics, emergency call, and V2X (vehicle-to-everything) comms feeding the sim's connected-driving features.
- **Geometry:** integrated in the shark-fin (5.12.1) + a secondary diversity antenna printed into the rear quarter/backlight glass (traces referenced in 5.4). No separate external geometry by default.
- **Materials:** PCB/trace materials as above (LOD0 internal only); glass-embedded traces = faint copper hairlines.
- **Function/gameplay:** connectivity source for OTA/telematics scenarios and V2X hazard warnings (e.g. receiving a "hazard ahead" from the traffic system).

> Real-time: purely functional transforms; no visible geometry below LOD0.

#### 5.12.4 Satellite antenna

- **Purpose/role:** satellite radio/comm; integrated helix or patch within the shark-fin.
- **Geometry/materials:** internal helix (copper coil, metallic) or ceramic patch, LOD0 only.
- **Function:** satellite radio source (audio/ambience), satellite positioning backup.

> Real-time: omitted below LOD0; functional only.

#### 5.12.5 Roof camera modules (`ROOF_cam_*`)

- **Purpose/role:** roof-line cameras/sensors supporting the driver-assist / self-driving flavour — a forward high-mount camera behind the top of the windshield header, and small roof-edge cameras contributing to the surround/mapping view. (Distinct from the mirror surround cams.)
- **Geometry:** forward high-mount module ~90 × 40 × 30, sits at the front roof header inner edge (behind glass, top-centre of windshield), lens facing forward. Optional roof-corner micro-cams ~10 dia.
- **Materials:** module housing satin black #141416 rough 0.6; lens dark glass metallic 0.0 rough 0.05 with clearcoat + faint coating tint; a tiny status LED (green when active).
- **Moving parts:** none (fixed); some AV concepts add a small rotating LiDAR — omit for this "assist not full-autonomy" flagship (keep it a fixed camera cluster to stay grounded).
- **Physics/mechanical:** sensor origins for the driver-assist perception used in guided/assisted-drive scenarios (lane-keep, adaptive cruise visualization). A forward SceneCapture in LOD0 for any in-HUD camera view.
- **Gameplay:** powers the lane-keep/ACC assist cues; blocked/dirty camera → assist unavailable scenario; feeds the "eyes on road" comparison in scoring.
- **Rendering notes:** the forward module sits behind the windshield (owned by front/glazing) — ensure it reads through the glass; keep the lens catching a small specular glint.

> Real-time: forward module baked as a small static prop visible through the windshield; corner micro-cams omitted below LOD0; captures gated to player + when an assist HUD is active.

#### 5.12.6 Rain sensor & light (ambient) sensor cluster

- **Purpose/role:** the optical **rain sensor** (auto-wipers) and **ambient-light sensor** (auto-headlights / auto-dimming), typically a gel-coupled module on the *inside* of the windshield behind the mirror, plus a roof/cowl ambient sensor.
- **Geometry:** rain/light module ~60 × 45 × 20 mounted to the inner windshield top-centre (behind the interior mirror), with a trapezoid gel pad optically coupled to the glass; a small clear "eye" area (~20 dia) on the glass. A separate solar/ambient sensor ~15 dia dome on the top of the dash/cowl or roof header (`ROOF_ambientSensor`).
- **Materials:** module black #101012 rough 0.7; gel pad clear (transmission ~0.9, IOR 1.4); ambient dome smoked clear dome, base #0C0C0E rough 0.15, a subtle interference tint.
- **Moving parts:** none.
- **Physics/mechanical & gameplay:**
  - Rain sensor drives auto-wiper speed from the weather system's rain-intensity value (wiper meshes owned by front section, but the *trigger* originates here).
  - Ambient-light sensor drives auto-headlights (dusk/tunnel), auto-dimming mirrors, and the instrument/ambient interior brightness — tied to the sim time-of-day + tunnel occlusion.
- **Rendering notes:** the sensor "eye" on the glass is a faint textured patch; keep subtle. The ambient dome catches a small highlight.

> Real-time: sensors are functional transforms reading world weather/light; the windshield "eye" is a baked texture detail. Ambient dome kept as a tiny prop to LOD1, then omitted.

---

### 5.13 Cross-discipline handoff notes

- **Animation clips (side/roof) — canonical param list:** `param_MirrorFold`, `param_MirrorAdjustX/Y`, `param_MirrorDim`, `param_MirrorHeat`, `param_BSM_L/R`, `param_IndicatorL/R`, `param_WinFL/FR/RL/RR`, `param_DoorAjar`, `param_DoorLatch`, `param_DoorLock`, `param_HandlePresent`, `param_SoftClose`, `param_RoofTint`, `param_RoofShade`, `param_MoonTilt`, `param_MoonSlide`, `param_WindDeflector`, `param_AeroBlade`. All are 0→1 normalized; provide as a single material/animation parameter collection so vehicle-programmers bind once.
- **Audio event markers (for sound design):** mirror-fold start/end, window express start/seat, soft-close pull-start/seat-home, moonroof tilt-detent/slide-detent/comfort-stop, handle present-click, latch cinch whir. Place notify tracks on every clip above.
- **Material master instances to reuse:** `M_CarPaint_master` (body/cap/flares/rail/fin cap), `M_Glass_side`, `M_Glass_roof` (with electrochromic scalar), `M_ChromeTrim` (finish enum), `M_BlackClad` (rocker/arch), `M_RubberSeal`, `M_Emissive_signal`. One body-colour parameter must propagate to every paint-matched side/roof part.
- **UV/atlas guidance:** side trim, seals, and roof rails share a "trim atlas"; all glass shares a "glass atlas" so LOD merging (LOD1+) collapses them cleanly. Frit borders are on the glass albedo/opacity, not separate geometry.
- **Symmetry flags (non-mirror-safe parts):** shark-fin lateral offset, charge/fuel door (side), any single-side diversity-antenna trace. Everything else mirrors cleanly on -X.
- **LOD budget recap (side+roof only):** LOD0 ~28–34k tris (hero), LOD1 ~9k (gameplay), LOD2 ~3k, LOD3 ~700. Live captures (mirror reflection, surround cams, roof cam) restricted to the player vehicle and gated by active UI.

*End of Section 5 — Exterior: Sides, Glazing & Roof.*
## 6. Wheels, Tires & Braking

> **Scope.** This section specifies the four corners of the Vehicle — the rotating unsprung assemblies (wheels, tires, hubs, bearings, brake rotors and calipers, sensor rings) and the complete braking system (hydraulic circuit, ABS, booster, electronic parking brake, cooling, and regenerative blend). It is written for a multidisciplinary AAA team: 3D/Blender artists building the meshes, material artists authoring PBR, UE5/engine and vehicle-physics programmers wiring rotation/steer/suspension, sound designers cueing brake/ABS/tire audio, and animators driving caliper-piston and pad-wear detail.
>
> **Fictional-brand policy.** The Vehicle is unbadged and fictional. No real tire brand, wheel maker, or brake supplier is named. Where a real product would carry a maker mark we use a neutral "maker emblem" or invented in-world marque ("Aeronde" tires, "Halcyon" brake hardware) — all fictional. Model designation used throughout: **the Vehicle** (electrified performance flagship, offered as a twin-turbo hybrid **"TH"** and full-EV **"E"** variant).
>
> **Variant note.** Wheels/tires/brakes are shared architecture across TH and E, with three deltas: (1) the EV runs a heavier curb mass → larger rear rotors and a stiffer sidewall on the standard tire; (2) the EV leans harder on regenerative braking, so friction-brake usage (and therefore dust, glow, wear) is lower in normal driving; (3) EV wheels offer an optional low-drag aero-cover face. These deltas are called out inline.

---

### 6.0 Corner coordinate & naming conventions

Establish these once so every discipline shares a frame:

- **Corners:** `FL, FR, RL, RR` (front-left … rear-right). Front axle steers; rear axle optional rear-steer (see §6.9 physics).
- **Local wheel frame (per corner):** origin at wheel center (hub face centroid). **+X** points outboard (away from vehicle centerline), **+Y** up, **+Z** forward. **Spin axis = local X.** **Steer axis ≈ local Y** (with caster/KPI offsets, §6.9).
- **Rolling direction:** forward motion → wheel spins about **+X** using the right-hand rule as seen from **outboard looking inboard**: FL/RL (left side) spin appears counter-clockwise; FR/RR (right) clockwise. Tire tread directional arrows and asymmetric sidewall text must be mirrored L/R (see §6.6.4 — a classic art bug).
- **Naming prefix:** all assets `WHL_`, `TIRE_`, `BRK_`, `HUB_` + corner suffix, e.g. `WHL_5spoke_FL`, `BRK_caliper_front_FR`.
- **Pivot placement (critical for animation):** every rotating mesh's pivot MUST sit exactly on the spin axis at the hub-face center. Steering meshes pivot on the steer axis. A mispivoted rim wobbles; a mispivoted rotor "swims" behind the caliper.

---

### 6.1 Wheel (rim) construction

#### 6.1.1 Sizes, fitment & the staggered setup

The Vehicle ships a **staggered** fitment (wider rear than front) — standard on a rear-biased performance flagship. Two factory wheel packages plus one optional:

| Package | Front wheel | Rear wheel | Front tire | Rear tire | Notes |
|---|---|---|---|---|---|
| Standard ("Sport") | 20 × 9.0J | 20 × 10.5J | 255/40 R20 | 285/35 R20 | Cast flow-formed |
| Performance ("Sport+") | 21 × 9.5J | 21 × 11.0J | 265/35 R21 | 295/30 R21 | Forged, forged option only |
| Optional aero (E-variant) | 20 × 9.0J | 20 × 10.5J | 255/40 R20 | 285/35 R20 | Forged core + snap-on aero face cover |

- **J-width** = rim flange-to-flange bead seat width in inches (9.0J = 9.0"). **Diameter** = bead seat diameter (20" / 21"), NOT the outer tire diameter.
- **Overall rolling diameter** (tire outer): Standard ≈ **712 mm** front / **707 mm** rear (near-matched by design so the diff/ABS sees consistent rolling radii). Performance ≈ **719 / 714 mm**. These feed the physics **rolling radius** (§6.9).
- **Offset (ET):** Front **ET26**, Rear **ET21** (mm the mounting face sits outboard of rim centerline). Governs how flush the wheel sits in the arch — art must match ET so tires don't clip fenders or float inboard.
- **Center bore:** 66.5 mm (hub-centric).

> **Real-time:** ship ONE wheel diameter class for the base LOD (20") and swap only the rim face material/mesh for packages; the ~5 mm front/rear rolling-diameter delta is imperceptible and can be ignored in the collision/physics radius (use a single 356 mm radius). Keep the stagger in silhouette (rear tire visibly fatter) because it reads on screen.

#### 6.1.2 Construction method & structural geometry

Three real construction methods are represented; pick per package. Artists should understand the visual/mass differences:

- **Cast (not offered here, reference only):** thickest spokes, heaviest, most "filled" webbing.
- **Flow-formed / rotary-forged (Standard package):** cast center + spun-forged barrel. Barrel wall thinner and more uniform; spokes moderately slim. Mass ≈ **12.5 kg** (front 20×9), **13.8 kg** (rear 20×10.5).
- **Forged (Performance & aero core):** single forged billet, machined. Thinnest structurally-sound spokes, crisp machined chamfers, visible lathe-turn micro-grooves on the face. Mass ≈ **10.2 kg** (front 21×9.5), **11.6 kg** (rear 21×11). Lower unsprung mass is a genuine physics input (§6.9).

**Rim cross-section anatomy** (model the barrel as a lathe/revolve profile, then boolean/insert the spoke web):

- **Outboard flange** — the lip that retains the tire bead; rolled radius ~6 mm, chrome-machined or painted edge.
- **Outboard bead seat** + **safety hump** (small annular ridge inside the barrel that keeps the bead seated under lateral load / low pressure). Barely visible once tire is on — LOD0 only.
- **Drop center** — the deep channel mid-barrel (needed in reality to mount the tire). Hidden by tire; omit at gameplay LOD.
- **Inboard bead seat**, **inboard flange**.
- **Spoke web / center disc** — the visible face design.
- **Hub mounting pad** — flat annular face with 5 bolt holes + center bore; sits against the rotor hat/hub flange.
- **Valve hole** — Ø11.3 mm through the barrel for the valve stem (§6.5).

#### 6.1.3 Spoke design (visible face)

Default design language: **twin-5-spoke ("10-spoke split") turbine-forged**, sculpted for brake cooling and a sense of forward motion.

- **Spoke count/pattern:** 5 primary Y-split spokes → 10 tips at the flange. Each spoke tapers from a broad root at the hub pad to a narrow fork near the rim.
- **Spoke cross-section:** concave "scooped" face (turbine dish) with a chamfered leading edge — catches a specular highlight that sweeps as the wheel spins (great for motion read).
- **Windows:** 5 large open windows between spoke pairs — this is the **suspension/brake visibility aperture** (see §6.8). Window area is deliberately large on front wheels to show the big front caliper.
- **Machined face option:** two-tone — painted spoke valleys (satin graphite) with diamond-cut (bright turned) spoke faces and flange lip. This is a distinct material zone (§6.1.5).
- **Directional vs. mirrored:** design is point-symmetric (5-fold) so a single wheel mesh can be reused on all four corners by scaling X by −1 for the left side; but if the machined-face grain or any asymmetric detail exists, provide L/R variants. Rear wheels are the same face design on a wider barrel — reuse the spoke disc, extend the barrel revolve.

**Approx. dimensions (20" Standard front face):**

| Feature | Value |
|---|---|
| Overall wheel Ø (bead seat) | 508 mm (20") |
| Rim width (flange-flange) | 229 mm (9.0J) |
| Spoke root width | ~34 mm |
| Spoke tip width | ~13 mm |
| Face dish depth (pad to flange plane) | ~28 mm (concave) |
| Window open area (each, of 5) | ~7,800 mm² |

#### 6.1.4 Center cap & maker emblem

- **Center cap:** Ø 68 mm snap-in disc covering the hub bore and (on non-hub-cap designs) the lug area. Two-piece: outer dome + inner clip ring.
- **Maker emblem:** a **fictional, abstract geometric mark** (e.g. a stylized interlocking chevron/aperture motif) — NEVER a real logo. Rendered as a raised/inlaid metal insert on an enamel base.
- **Floating/self-leveling option (Performance):** a bearing-mounted cap weighted to stay upright while the wheel spins — the emblem does NOT rotate with the wheel. This is a **separate rotating (actually counter-rotating/static) mesh** with its own pivot on the spin axis; physics: gravity-damped pendulum, or simply lock its world-up. Great subtle detail; a known "wow" element.
- Materials: emblem inlay `metallic 1.0, roughness 0.15`, enamel base `metallic 0, roughness 0.2, colored`.

> **Real-time:** bake the emblem to the center-cap albedo+normal as a decal; skip the self-leveling mechanism (let the cap spin with the wheel) except in showroom/photo modes. At distance LOD the cap is a flat textured disc.

#### 6.1.5 Wheel materials (PBR)

| Zone | Base colour (sRGB) | Metallic | Roughness | Notes |
|---|---|---|---|---|
| Painted spoke valleys (satin graphite) | #2C2E31 | 1.0 | 0.42 | Metallic paint flake; subtle clearcoat |
| Diamond-cut face + flange lip | #C9CBCE | 1.0 | 0.18 | Anisotropic turned grooves (see normal) |
| Gloss black option (whole wheel) | #0E0F11 | 1.0 | 0.12 | Clearcoat 1.0 |
| Bronze/"frozen" satin option | #7A5A32 | 1.0 | 0.55 | Matte anodized look |
| Inner barrel (unpainted/primer) | #4A4C50 | 0.6 | 0.6 | Rarely seen; low-detail |
| Brake dust overlay (front-heavy) | #3A3733 | 0.0 | 0.9 | Accumulation mask, see below |

- **Diamond-cut anisotropy:** author a **tangent-space normal** with fine concentric lathe grooves (0.05–0.1 mm pitch) and an **anisotropic roughness** aligned to the groove direction (circumferential). This produces the signature circular "brushed" highlight. In UE5 use the Clearcoat or Anisotropy inputs; radial tangent map required.
- **Clearcoat:** all painted/machined wheels carry a clearcoat lacquer (clearcoat 1.0, clearcoat roughness 0.06). The diamond-cut faces have clearcoat over bare metal — do NOT set metallic 0.
- **Brake-dust & road-grime accumulation:** drive with a **dynamic mask** — front wheels accumulate more (bigger brakes, more braking energy; §6.7). Blend a dust albedo/roughness overlay by a 0–1 "grime" scalar that grows with braking work and resets on car-wash / respawn. Concentrate on the wheel face and inner spoke pockets via a baked AO/cavity mask.

> **Real-time:** collapse to 2–3 material zones (painted body, machined face, dust). Fake anisotropy with a baked highlight in the roughness/normal rather than true aniso shading on low-end. Grime as a single scalar-driven overlay, not per-particle.

---

### 6.2 Bolt pattern, fasteners & mounting

#### 6.2.1 Bolt pattern (PCD)

- **Pattern:** **5 × 112 mm** PCD (pitch circle diameter) — 5 studs/bolts on a 112 mm circle. Hub-centric on the 66.5 mm bore.
- **Fastening style:** the Vehicle uses **wheel bolts threaded into the hub** (European convention) rather than studs+lug-nuts, OR (design choice) **5 studs + conical lug nuts**. Pick one and be consistent across all corners:
  - **Bolt style:** M14 × 1.25, ball/radius seat, 14 mm hex or security spline. Head visible in the wheel face.
  - **Stud+nut style:** M14 studs, conical (60°) seat lug nuts, one locking lug per wheel.
- **Torque (flavor/telemetry):** 140 N·m — irrelevant to real-time physics but useful for a pit/tire-change animation and QA realism.

#### 6.2.2 Fastener geometry & materials

- 5 fasteners per corner arranged on the 112 mm PCD, recessed in machined counterbores in the wheel face.
- **Lug seat:** conical or ball, matched to wheel — visible chamfer.
- **Locking lug:** one per wheel with a unique spline pattern and a small cap; a subtle asymmetry that breaks the perfect 5-fold symmetry (nice for realism, but means the L/R mirror trick shifts the lock position — usually acceptable).
- Materials: fasteners `metallic 1.0, roughness 0.3, #9A9C9E`, often with a black-zinc or burnished finish on performance wheels (`#1C1D1F, roughness 0.4`).

> **Real-time:** the 5 lug heads are almost always baked into the wheel-face normal + albedo as raised detail — do NOT model 5 separate bolt meshes per wheel at gameplay LOD (that's 20 extra tiny meshes for zero silhouette gain). Only LOD0/showroom gets modeled fasteners for the tire-change animation.

---

### 6.3 Brake rotors (discs)

#### 6.3.1 Sizes, type & variant deltas

The Vehicle offers **two brake tiers**: steel (standard) and **carbon-ceramic (optional)**. Fronts are always larger than rears (front does 60–75% of braking work).

| | Front rotor | Rear rotor |
|---|---|---|
| **Steel (standard, TH)** | Ø 390 × 36 mm, internally vented + drilled/slotted | Ø 370 × 28 mm, vented |
| **Steel (E-variant)** | Ø 390 × 36 mm | Ø 380 × 30 mm (bigger — heavier EV) |
| **Carbon-ceramic (optional)** | Ø 410 × 38 mm, vented + drilled | Ø 390 × 32 mm, vented |

- **Vented (internally ventilated):** two friction faces separated by internal vanes → an air pump that cools the disc. Model as two annular plates joined by vanes; the vane pattern is visible edge-on through the spokes.
  - **Vane type:** **curved/directional vanes** on performance/ceramic (handed L/R — the curve pumps air outward correctly only if oriented per side, so FL and FR rotors are mirror-mesh, a real detail); **straight radial vanes** on base steel (non-handed, one mesh both sides).
  - Vane count: ~48 front, ~40 rear.
- **Drilled + slotted (performance/ceramic face):** cross-drilled holes (cosmetic + gas escape) and 5–8 curved surface slots per face (wipe pad gasses, refresh bite). Slots are directional → handed L/R.
- **Two-piece floating rotor (Performance/ceramic):** aluminum **hat** (the top-hat center that bolts to the hub) + separate friction **ring**, joined by ~10 **floating bobbins/pins** that allow radial thermal expansion. Distinct materials: silver/anodized hat vs. dark friction ring. The bobbins are tiny but catch light — LOD0 detail.

#### 6.3.2 Geometry anatomy (per rotor)

- **Hat (top-hat):** central drum, Ø ~170 mm, height ~50 mm, with the 5×112 bolt holes and center bore; the wheel and rotor share the hub face.
- **Friction ring:** the swept annulus the pads clamp — this is the **glow zone** (§6.3.4). Inner Ø ~250 mm, outer Ø 390 mm (front).
- **Vent gap:** ~18 mm between faces (front), filled with vanes.
- **Wear edge / lip:** a raised unswept lip at the outer and inner ring edges where pads don't reach — grows visually as the swept area wears (nice wear detail).
- **Directional marking:** small "rotation →" arrow cast into the hat (handed).

#### 6.3.3 Rotor materials (PBR) & surface states

Rotors change appearance with **temperature and use** — this is one of the most important dynamic-material features of the corner.

| State | Friction face base colour | Metallic | Roughness | Emissive |
|---|---|---|---|---|
| New steel, cold | #6E6A66 (bare cast iron, slightly warm grey) | 1.0 | 0.55 | — |
| Bedded-in steel (used) | #4B4642 with bright swept ring #B8B4AE | 1.0 | 0.35 (swept) / 0.7 (rusty edge) | — |
| Surface rust (parked overnight) | #8A5A3A orange-brown film | 0.4 | 0.85 | — (scrubs off in first few stops) |
| Hot (heavy braking) | swept ring | 1.0 | 0.4 | ramps: dull red → orange → yellow |
| Carbon-ceramic, cold | #26241F near-black matte with grey speckle | 0.2 | 0.75 | — |
| Carbon-ceramic, hot | same | 0.2 | 0.7 | subtle deep-red only at extreme temp |

- **Emissive glow model:** drive **emissive colour+intensity from a `rotorTemp` scalar** (§6.7 thermal model). Map ~450 °C → faint red, ~650 °C → orange, ~750 °C+ → yellow-orange. Glow is on the **swept friction ring only**, must show through the spoke windows, and should bloom. Steel glows readily; carbon-ceramic glows far less and only at extreme temps (art + physics differ by material).
- **Surface-rust film:** a fast-forming, fast-scrubbing overlay — appears after the car sits, disappears over the first 2–3 brake applications (mask driven by "time parked" then "braking work since parked"). A beloved realism touch for cold-start scenes.
- **Hat vs ring** are separate material zones (aluminum hat stays cool/silver; friction ring does all the thermal work).

> **Real-time:** keep the temperature→emissive glow — it's high value and cheap (one scalar → emissive LUT). Bake vanes as an edge-on normal/parallax rather than modeled geometry at gameplay LOD; keep true vanes only at LOD0. Drop bobbins, rust film, and slot handedness on low-end (use one non-handed rotor mesh). Rotor is often modeled as: hat + solid ring + a separate thin "glow ring" emissive card.

#### 6.3.4 Rotor physics parameters

For the vehicle-physics/brake programmer:

- **Rotor mass (thermal + unsprung):** front steel ≈ **9.8 kg**, rear steel ≈ **7.4 kg**, carbon-ceramic front ≈ **5.6 kg** (major unsprung-mass and thermal-capacity difference — ceramic heats/cools faster and saves ~4 kg/corner rotating mass).
- **Specific heat:** cast iron ~460 J/kg·K; carbon-ceramic ~800 J/kg·K → feeds §6.7 thermal ODE.
- **Effective radius (r_eff):** front ≈ **0.168 m** (mean of pad swept radii), rear ≈ **0.158 m**. Brake torque = pad_friction × clamp_force × r_eff × 2 faces.
- **Max continuous operating temp:** steel ~650 °C (fade onset), carbon-ceramic ~900 °C+ (fade-resistant). Fade = friction-coefficient drop above threshold (model as µ multiplier curve vs temp).
- **Rotational inertia** of the rotor+hub adds to wheel spin inertia (small but real; ~0.06 kg·m² front).

---

### 6.4 Brake calipers, pads & hydraulics

#### 6.4.1 Caliper type, size & layout

- **Front:** fixed **6-piston monobloc** caliper (opposed pistons, 3 per side), radially mounted, spanning the top of the rotor at roughly the 10–11 o'clock position (as viewed on the FL). A large, visually dominant part — the "hero" brake seen through the spokes.
- **Rear:** fixed **4-piston** caliper (2 per side) at roughly the 1–2 o'clock (or 4–5 o'clock) position, **integrating the electronic parking brake** motor-on-caliper (§6.6).
- **Carbon-ceramic option:** same piston counts, caliper often finished in a distinct colour (e.g. gold/anthracite) with a "ceramic" script (fictional).
- **Mounting:** radial-mount, 2 bolts to the upright/knuckle. The caliper is **fixed to the upright** — it does NOT spin with the wheel, but it DOES steer with the front upright (front) and moves with suspension travel (all four). Critical rig distinction (§6.9).

**Caliper geometry:**

- **Monobloc body:** single-piece bridge spanning the rotor, with 6 (front) piston bores. Approx bounding box front: **210 × 95 × 70 mm**.
- **Pistons:** exposed titanium-nitride or steel piston crowns visible at the pad backing; move linearly along their bore axis (perpendicular to rotor face). Diameters staggered (e.g. leading 30 mm, trailing 34 mm) to even pad wear.
- **Bleed nipples** (top), **brake hose banjo fitting** (inlet), **crossover bridge pipe** or internal galleries linking the two halves.
- **Maker script:** fictional marque ("Halcyon") cast/painted on the outer face.

#### 6.4.2 Caliper materials (PBR)

| Zone | Base colour | Metallic | Roughness | Notes |
|---|---|---|---|---|
| Body — signature red | #B01818 | 0.1 | 0.30 | Baked/powder-coat; slight orange-peel normal |
| Body — anthracite (ceramic) | #2A2C2E | 0.2 | 0.35 | |
| Body — yellow option | #E6B400 | 0.1 | 0.3 | |
| Painted script/logo | #ECECEC | 0 | 0.25 | Raised or decal |
| Piston crowns | #C0A860 (TiN gold) | 1.0 | 0.25 | Visible between pad and rotor |
| Bleed nipple / fittings | #8C8E90 | 1.0 | 0.4 | Steel |
| Heat discolouration overlay | straw→blue → grey | — | +rough | Optional temp-driven tint near rotor |

- **Heat tint:** hard-used calipers pick up a straw/blue temper tint near the rotor and paint fade — optional temp-driven overlay for wear/realism.

#### 6.4.3 Brake pads

- **Configuration:** 2 pads per caliper (inner + outer), each spanning the swept area; front pads larger. Pad = **friction material** bonded to a **steel backing plate**, with anti-rattle **shims/clips** and a **wear-sensor** notch/wire on one pad.
- **Geometry:** front pad friction block ~ **120 × 60 × 12 mm** (new thickness), backing plate ~4 mm. As the pad wears the 12 mm block thins → drive a small "pad thickness" scalar for wear visuals and the low-pad warning.
- **Wear sensor:** a small metal tab or wire loop that contacts the rotor at ~2 mm remaining → triggers a dash warning (gameplay: brake-wear telemetry).
- **Material (visual):** dark grey/near-black sintered friction `#232323, metallic 0, roughness 0.9`; backing plate steel `#6A6C6E, metallic 1.0, roughness 0.5`; shims bright zinc.
- **Physics:** **pad friction coefficient µ ≈ 0.42** (steel) / **0.55** (ceramic pad-on-ceramic-disc, more stable hot). µ varies with temperature (cold "green" bite low, optimal mid-band, fade when overheated). Feed the brake-torque equation and the fade curve.

> **Real-time:** pads are barely visible; model as a simple block behind each rotor face, no separate shim geometry. Pad-wear thickness is telemetry-only unless a maintenance/garage mode exists.

#### 6.4.4 Caliper piston & pad animation

- **Piston travel:** each piston extends linearly toward the rotor when brake pressure rises, clamping the pad. Range is tiny — **~0.6 mm** working travel (pad-to-rotor clearance + pad compression). Driver = **brake hydraulic pressure** (0 → ~120 bar).
  - Rig: pistons parent to caliper body, translate along bore axis by `pressure × k`. Even a sub-millimeter move sells "the brakes are biting" in cockpit/exterior close-ups.
- **Pad clamp:** pads translate the same tiny amount toward the rotor; add a micro squeeze/flex.
- **Caliper flex (LOD0):** under max clamp the monobloc bridge flexes ~0.1 mm — usually ignored.
- **No rotation:** calipers/pads never spin. They only (front) steer with the upright and (all) move vertically with suspension travel — driven by the suspension rig, not the wheel spin.

> **Real-time:** skip piston translation on low-end (invisible at speed). Keep it for cockpit-camera / photo mode / brake-test scenarios where the wheel is close and stationary.

#### 6.4.5 Hydraulic circuit (system, mostly non-visual)

For the physics/audio teams — the plumbing behind pedal feel and ABS:

- **Layout:** dual-circuit **diagonal split** (FL+RR / FR+RL) for fail-safe — losing one circuit still brakes one front + one rear diagonally. (Alternatively front/rear split; diagonal is standard on this class.)
- **Master cylinder** (tandem, two pistons) converts pedal force × booster assist into hydraulic pressure.
- **Brake booster:** on the TH (has a combustion engine) a **vacuum or electro-mechanical booster (iBooster-style, fictionalized as "electro-assist booster")**; on the E-variant a **fully electro-mechanical booster** (no engine vacuum) — important because it also enables **brake-by-wire regen blending** (§6.10).
- **Brake fluid:** DOT 4 / DOT 5.1 class, boiling point ~260 °C dry. Fluid temp/boiling = the **fade & spongy-pedal** failure mode after repeated hard stops (model as pressure loss when fluid boils — advanced sim only).
- **Lines:** steel hard lines along the body → **braided flexible hoses** at each corner (flex with suspension/steer). The flex hose is the only hydraulic part visible at the corner — a black braided line looping from the upright to the caliper banjo. Model it following suspension travel.
- **Hydraulic control unit (HCU/ABS modulator):** valve block + pump, mounted in the engine/frunk bay — houses ABS/ESC solenoids (§6.4.6). Non-visual but the **source of the ABS "buzz/tick" audio and pedal pulsation**.

#### 6.4.6 ABS / ESC hydraulic behaviour

- **ABS (Anti-lock Braking):** per-wheel solenoid valves (inlet/outlet) modulate caliper pressure to hold each wheel just below lock-up (target slip ratio ~0.1–0.2). Cycles at **~15–20 Hz**. Effects to drive:
  - **Pedal pulsation** (haptic/telemetry) + characteristic **ABS tick/buzz** audio loop (gate on `absActive` flag).
  - **No visual wheel-lock smoke** when ABS is working; if ABS is disabled/failed → wheel locks → **flat-spot tire** + white smoke + skid (§6.6, §6.9).
- **ESC/traction integration:** the same HCU can brake individual wheels for stability control (yaw correction) and torque-vectoring-by-brake. Physics hook only; visually just uneven brake glow/dust per corner.

---

### 6.5 Hub assembly, bearings, reluctor rings, valve stems & TPMS

#### 6.5.1 Hub / upright (knuckle) assembly

- **Upright (steering knuckle):** the structural casting that holds the wheel bearing, mounts the caliper, and connects to suspension arms + (front) steering tie rod. It **steers** (front) and **moves with suspension** (all) but does NOT spin. Aluminum casting, `#8A8C8E metallic 0.7 roughness 0.6`, forged/cast texture.
- **Wheel hub flange:** the rotating part bolted through the bearing — carries the 5×112 bolt circle, the rotor hat, and the wheel. **This spins with the wheel.**
- Distinct rig layers at each corner, from static→spinning:
  1. Suspension arms (move with travel) →
  2. Upright/knuckle (steers front, travels all) →
  3. Caliper + brake shield (bolted to upright, non-spinning) →
  4. Hub flange + rotor + wheel + tire (**spin**).

#### 6.5.2 Wheel bearing

- **Type:** sealed **double-row angular-contact ball bearing** (or gen-3 hub-bearing unit integrating the flange). Ø ~85 mm.
- **Function (physics):** low rolling-resistance pivot; contributes a small **bearing drag** torque (rolling resistance term) and, when damaged, a **bearing roar** audio that rises with speed (nice for a "worn car" state, else ignore).
- Visually hidden behind the rotor hat; LOD0 only if a wheel-off/garage view exists.

#### 6.5.3 ABS reluctor (tone) ring

- **Purpose:** the toothed/magnetic ring the **ABS wheel-speed sensor** reads to measure per-wheel rotational speed (feeds ABS, ESC, speedo, traction control).
- **Type/geometry:** either a **toothed steel ring** (48–96 teeth) pressed onto the hub/rotor hat, OR (modern) a **magnetic encoder** built into the bearing seal (invisible). If toothed: a fine gear-like ring behind the rotor, spins with the wheel; the sensor is a small probe on the upright with a tiny air gap.
- **Physics:** this is the **data source for wheel-speed** — the ABS/ESC/speed logic conceptually reads it. In-engine you just read the wheel's angular velocity, but note for realism the reluctor tooth count sets sensor resolution.
- Material: steel `#5A5C5E metallic 1.0 roughness 0.6`. Almost never visible — LOD0/garage only, or omit.

> **Real-time:** omit the reluctor ring mesh entirely; wheel speed comes from the physics wheel. Keep it only in a technical/garage/exploded view.

#### 6.5.4 Valve stem

- **Type:** **metal clamp-in valve stem** (performance wheels) or rubber snap-in. Protrudes ~15 mm through the barrel valve hole, angled ~10° for access.
- **Parts:** valve body + **valve cap** (fictional maker emblem or anodized colour) + Schrader core inside.
- **On TPMS wheels:** the valve stem is the external end of the **TPMS sensor** (§6.5.5) — clamp-in metal stem with the sensor body inside the barrel.
- Material: anodized aluminum/chrome `metallic 1.0 roughness 0.3`, cap colour-matched.
- **Rotation:** spins with the wheel (it's on the barrel) — a small offset detail that, at low wheel speed, is a good **visual rotation reference** (you can see the valve stem go round). Model it on-axis-offset so it orbits correctly.

> **Real-time:** a tiny cylinder or even baked into the barrel texture at distance; keep a real small mesh at close LOD because a spinning valve stem is a subconscious "the wheel is really turning" cue at low speed.

#### 6.5.5 TPMS sensor (Tire Pressure Monitoring)

- **Purpose:** measures tire pressure + temperature, transmits to the body computer → dash readout / low-pressure warning. Direct (in-wheel) system.
- **Geometry:** small sensor module (~30 × 25 × 15 mm) integral with the valve stem, sitting inside the barrel against the rim well. Spins with the wheel.
- **Gameplay hooks:** per-wheel **pressure** and **temperature** values that (a) show on a dash TPMS screen, (b) change grip in physics (under-inflation → more sidewall flex, lower grip, more heat, worse wear; a puncture → pressure decays → pull + flap-flap audio + eventual rim-on-road sparks), (c) trigger warning lights.
- **Puncture/blowout event:** pressure drops (slow leak vs. instant blowout), tire visibly deflates (sidewall bulge, tread splay, ride-height drop at that corner), audio (hiss / bang + flap), physics (grip + rolling radius drop, strong pull to that side). A high-value dynamic scenario for a driving-education sim.
- Material: black polymer, hidden; no render cost normally.

> **Real-time:** TPMS is pure telemetry/UI + a physics grip modifier — no sensor mesh. Model the deflation via a blendshape on the tire (see §6.6.5) + a corner ride-height offset.

---

### 6.6 Tires

The tire is the single most physics-relevant and one of the most render-relevant corner parts (contact patch = where all grip lives; sidewall = big readable surface).

#### 6.6.1 Sizes & the sidewall code

Sizes (from §6.1.1): front **255/40 R20**, rear **285/35 R20** (Standard). Decode for artists (governs geometry):

- **255** = section width mm (tread/sidewall width). Rear 285 = visibly fatter.
- **40** = aspect ratio: sidewall height = 40% of 255 = **102 mm** (front). Rear 35% of 285 = **99.75 mm** (lower-profile look). Low aspect = short, stiff, "rubber-band" sidewall = performance read.
- **R** = radial construction. **20** = rim diameter inches.
- **Overall Ø** front = 508 + 2×102 = **712 mm**; rear = 508 + 2×99.75 = **707.5 mm** (matches §6.1.1).
- **Contact patch:** ~ **255 × 150 mm** front footprint at load (physics contact ellipse).

#### 6.6.2 Tire geometry anatomy

Model as a revolve (tread + sidewalls) + patterned tread + lettered sidewalls:

- **Tread band** — the crowned contact surface carrying the tread pattern; slight crown radius so only the center-ish rides on straights, shoulders load in corners.
- **Shoulders** — transition tread↔sidewall; sculpted blocks, often with the most aggressive pattern; wear fastest on a hard-cornering performance car.
- **Sidewall** — the flexing wall carrying all the raised lettering, size code, maker marque (fictional "Aeronde"), and load/speed rating (fictional but plausible: "108Y").
- **Bead** — the stiff inner edge (steel bead bundle) that seats on the rim bead seat; hidden.
- **Rim protector rib** — a raised rubber rib just above the bead that overhangs the rim flange to protect the wheel from curb rash. Visible, characterful — model it.
- **Valve** exit aligns with the wheel valve hole.

**Sidewall lettering** — author as a **normal/height map** on the sidewall, NOT geometry (except LOD0 hero). Raised ~0.8 mm. Includes: marque, model name (fictional "Aeronde Vector S"), `255/40 R20 108Y`, "TUBELESS", tread-wear/traction codes, and directional/asymmetric markings (§6.6.4). **Mirror correctly L/R** so text isn't backwards on one side.

#### 6.6.3 Tread patterns — summer vs. winter (+ all-season)

Ship at least **two tread meshes/textures**; the pattern strongly signals the tire type and changes physics grip.

**Performance Summer (default):**
- **Directional or asymmetric** pattern: broad continuous center ribs (dry braking/traction), large outboard shoulder blocks (dry cornering), a few lateral/diagonal grooves for wet evacuation. Relatively **low void ratio** (~22%) → lots of rubber on road → high dry grip.
- Shallow-ish tread depth ~7.5 mm new.
- Visual read: sleek, "slick-looking," minimal siping.

**Winter:**
- **Directional** with deep grooves, dense **siping** (thousands of tiny zig-zag slits for snow/ice bite), higher void ratio (~35%), blockier. Deeper tread ~9 mm. Often a "snowflake" marking on the sidewall (fictional icon).
- Softer compound → different roughness (looks a touch matte/velvety) and much better cold/snow grip, worse warm-dry.

**All-season (optional):**
- Middle ground; symmetric or asymmetric, moderate siping and void.

**PBR & wear:**

| State | Albedo | Metallic | Roughness | Notes |
|---|---|---|---|---|
| New rubber | #1A1A1C | 0 | 0.85 | Slight sheen in grooves |
| Scrubbed/used tread | #202022 | 0 | 0.92 | Matte, micro-abrasion normal |
| Hot/greasy (track) | #242426 | 0 | 0.7 | Slight sheen, "blueing" |
| Wet film overlay | darker, +spec | 0 | 0.2 | Driven by weather wetness |
| Sidewall (brown "blooming") | #2A241E tint | 0 | 0.9 | Antiozonant browning on old tires |

- **Tread wear:** drive a 0–1 wear scalar (from slip/energy) that flattens tread-block height (normal-map blend) and, at extremes, exposes wear bars → grip penalty + a "bald tire" look. **Flat-spots** from lock-ups (non-ABS) create a localized worn patch + a rhythmic thump audio/vibration keyed to wheel rotation.

> **Real-time:** two tread normal/albedo sets (summer/winter) swapped by tire choice; wear as a single scalar tinting + slight normal flatten, no per-block deformation. Sidewall lettering baked to normal. Wet look = a global wetness param the master material reads.

#### 6.6.4 Directionality & the L/R mirror trap (art-critical)

- **Directional tires** have a rotation arrow — the V-tread must point the correct way for forward motion on BOTH sides. A single mesh mirrored X for the left side makes the tread point BACKWARD on that side. Fixes: use a directional tread that's authored per-side, OR use a symmetric/asymmetric non-directional pattern, OR keep directional and provide L and R meshes.
- **Asymmetric tires** have a fixed "OUTSIDE"/"INSIDE" sidewall face — must always face outboard on all four; mirroring flips inside/outside. Provide handed meshes or ensure the pattern is symmetric.
- **Rule for the team:** decide directionality up front. Recommended default: **asymmetric summer** (outboard face always out) with **handed L/R tire meshes** (two meshes, four instances). Winters directional, also handed.

#### 6.6.5 Tire deformation & animation

- **Rolling:** tire spins with the wheel about local X. Tread scroll can be a **UV scroll** on straights instead of true spin at distance.
- **Contact-patch flattening:** the bottom of the tire flattens against the road (a subtle squash where the tire meets ground). Options: a **blendshape/deformation** driven by load, or a shader vertex flatten near the contact plane, or (cheap) ignore and let the wheel sink slightly into the road via the physics ride height.
- **Sidewall flex/bulge:** under load/cornering the loaded sidewall bulges; under low pressure it bulges more. Blendshapes: `bulge_load`, `deflate` (§6.5.5 puncture), `sidewall_flex_lateral`.
- **Slip/smoke/marks:** when slip ratio/angle exceeds grip → **tire smoke** particles from the contact patch, **skid/scuff marks** decals on the road, and a rising **tire squeal→screech** audio keyed to slip. Lock-up (no ABS) → dense white smoke + black skid line + flat-spot.
- **Heat:** tire temp affects grip (cold = low, optimal window, overheated = greasy). Optional subtle emissive/sheen shift when very hot; mainly a physics grip curve.

#### 6.6.6 Tire physics parameters

For the vehicle-physics programmer (feeds the tire model — Pacejka/brush or engine's built-in, e.g. Chaos/PhysX vehicle):

| Parameter | Front (255/40R20 summer) | Rear (285/35R20 summer) |
|---|---|---|
| Rolling radius (loaded) | 0.352 m | 0.350 m |
| Section width | 0.255 m | 0.285 m |
| Nominal pressure | 2.4 bar (35 psi) | 2.5 bar (36 psi) |
| Peak longitudinal µ (dry, warm) | ~1.15 | ~1.20 |
| Peak lateral µ (dry, warm) | ~1.20 | ~1.25 |
| Peak slip ratio (long.) | ~0.12 | ~0.12 |
| Peak slip angle (lat.) | ~7° | ~7° |
| Cornering stiffness | high (low-profile) | higher |
| Rolling resistance coeff | ~0.011 | ~0.011 |
| Wet µ multiplier | ×0.65 | ×0.65 |
| Winter tire dry µ mult | ×0.85 | / snow ×2+ vs summer |
| Load rating (each) | ~1000 kg (108) | ~1000 kg |
| Unsprung tire mass | ~12 kg | ~13.5 kg |

- **Grip vs temp:** µ scales with a temperature window (cold ~0.8× → optimal 1.0× → overheated ~0.85×). Winter compound shifts the window colder.
- **Grip vs wear/pressure:** wear and under/over-inflation reduce peak µ and shift the slip curve; a puncture collapses grip at that corner.
- **Contact patch load sensitivity:** µ falls slightly as vertical load rises (load sensitivity) — needed for realistic weight-transfer behaviour.

---

### 6.7 Brake cooling & thermal model

#### 6.7.1 Cooling hardware (visual + functional)

- **Vented rotor vanes** (§6.3.1) — the primary cooler; act as a centrifugal pump drawing air from the rotor center and flinging it out the vanes. Directional vanes must be handed to pump correctly.
- **Brake cooling ducts** (Performance/ceramic): channels from the front bumper/splitter and inner arch liner directing air onto the rotor/caliper. Visible as ducting behind the front bumper and a shroud/backing-plate scoop at the upright. Model as tubes + a scoop aimed at the rotor inboard face.
- **Brake dust/backing shield:** a thin steel splash shield behind each rotor (protects the upright/CV from heat & debris, shapes airflow). Non-spinning, bolted to the upright. `#4A4C4E metallic 1.0 roughness 0.7`, often heat-blued.

#### 6.7.2 Thermal model (physics)

Simple lumped-mass model per rotor for glow, fade, and audio:

- **Heat in:** `Q_in = brakeTorque × wheelAngularVelocity` (braking power → heat), split front/rear per bias. Regen braking (§6.10) diverts energy away from the friction brakes → **less heat when regen is doing the work** (key EV difference).
- **Heat store:** `rotorTemp += Q_in × dt / (mass × specificHeat)` (§6.3.4 values).
- **Heat out:** convective cooling `Q_out = h(airspeed, ductOpen) × area × (rotorTemp − ambient)` — cools faster at speed and with ducts; plus radiation ∝ T⁴ at high temp (why glowing rotors shed heat fast).
- **Outputs consumed by other systems:**
  - **Emissive glow** LUT (§6.3.3).
  - **Brake fade:** µ multiplier drops above threshold temp → longer stopping distance, spongy feel (great teaching moment for a driving-ed sim: "you overheated your brakes descending the pass").
  - **Fluid boil** (advanced): sustained high temp → pedal goes long/soft.
  - **Dust generation rate** → wheel grime accumulation (§6.1.5), front-biased.
  - **Audio:** tick/ping of cooling metal after a hard stop; heavier squeal when very hot.

> **Real-time:** keep the single-scalar rotorTemp per corner (4 floats) — drives glow + fade cheaply. Ducts/shields are static meshes at LOD0 only. Radiation/fluid-boil optional for a "hardcore" sim mode.

---

### 6.8 Suspension & brake visibility through the spokes

The open spoke design (§6.1.3) exists partly so players **see the mechanicals move** — a huge realism payoff on a performance car. What's visible through the front wheel windows, back-to-front:

1. **Caliper** (big red 6-piston) clamping the rotor — the hero part; front-and-center in the top windows.
2. **Vented rotor** with drilled/slotted face + glowing swept ring when hot; vanes visible at the rotor edge.
3. **Rotor hat + bolts + reluctor** (dimmer, inner).
4. **Upright/knuckle**, **backing shield**, **flex brake hose** looping to the caliper.
5. **Suspension arms** — upper/lower control arms or multilink, **coil-over spring + damper**, **anti-roll bar drop link**, and (front) **tie rod / steering arm**. These **move with suspension travel and steering**, visibly through the spokes.

Visibility rules for the art/rig team:

- Ensure the caliper and rotor are fully modeled and correctly clocked (caliper at its real position) because they're always on show.
- The **glow and dust** must be authored assuming they're seen through spinning spokes — motion-blur/strobe of the spokes over a glowing rotor is a signature look.
- As the wheel spins, spokes sweep and periodically reveal/occlude the caliper — no extra work if geometry is correct, but LOD transitions must not pop the brakes out.

> **Real-time:** keep caliper + rotor + a single suspension-arm cluster visible at mid LOD (they read strongly). Collapse the multilink to 2–3 representative arms + spring/damper. Drop hose, shield, reluctor, drop-link at gameplay LOD. At far LOD the wheel becomes a near-solid textured disc and interior mechanicals are culled.

---

### 6.9 Rotation, steering & suspension rig — animation axes & drivers

The definitive per-corner rig spec (ties together everything above).

#### 6.9.1 Transform hierarchy (per corner)

```
Chassis (sprung body)
 └─ Suspension pickup (static on chassis)
     └─ SuspensionTravel node      [translate +Y, driven by spring compression]
         └─ SteerNode (FRONT only) [rotate about steer axis, driven by steering]  (+ optional rear-steer)
             └─ Upright/knuckle + Caliper + BrakeShield + FlexHose   (NON-spinning)
                 └─ SpinNode        [rotate about local X, driven by wheel angular velocity]
                     └─ Hub flange + Rotor(+glow) + Wheel rim + Tire + Valve + TPMS + Reluctor  (SPINNING)
```

- **Only the SpinNode subtree rotates** with wheel speed. Calipers/pads/shield/hose/upright do NOT spin — the #1 rig mistake is parenting the caliper under the spin node (it'll windmill).
- **SteerNode** rotates the whole upright+wheel assembly (front). Steer axis carries **caster** (~6°) and **KPI/SAI** (~8°) tilt, and a **scrub-radius**/caster-trail offset — so the wheel also rises/falls slightly and the contact point shifts when steering (self-centering, weight jacking). LOD0/physics honor these; simple rigs can steer about pure Y.
- **SuspensionTravel** translates vertically (and slightly fore-aft/camber-changes on a multilink) with spring compression; drives the visible arm motion and keeps the tire contacting the road.

#### 6.9.2 Drivers & ranges

| Node | Axis | Range | Driver |
|---|---|---|---|
| SpinNode | local X (spin) | continuous | wheel angular velocity from physics (ω = v / rollingRadius) |
| SteerNode (front) | steer axis (~Y + caster/KPI) | ±40–45° at wheel (lock-to-lock) | steering input × steering ratio; inner/outer differ (Ackermann) |
| Rear-steer (optional) | steer axis | ±2–3° | speed-dependent: opposite phase <60 km/h (agility), same phase >60 km/h (stability) |
| SuspensionTravel | +Y (±fore-aft on multilink) | +80 mm bump / −90 mm droop | spring/damper physics; ride-height + weight transfer |
| Caliper pistons | bore axis | ~0.6 mm | brake hydraulic pressure |
| Caliper/hub assembly camber | roll about Z | −1.5° static → varies with travel | suspension geometry (camber curve) |

- **Ackermann steering:** inner wheel steers more than outer in a turn — front SteerNodes get slightly different angles from a steering solver, not a shared value. Matters for visible wheel angles and tire scrub.
- **Wheel-spin visual anti-strobe:** at high speed the spoke pattern strobes/reverses under discrete frame sampling; mitigate with **radial motion blur** on the wheel and/or a blurred-spoke LOD material past a speed threshold. Essential for believable high-speed footage.
- **Rolling without slipping vs. slip:** normally ω = v/r. Under wheelspin (throttle) ω > v/r (spin visual + smoke); under lock-up (no ABS) ω < v/r toward 0 (skid + flat-spot). The spin animation must read the ACTUAL wheel ω from physics, not vehicle speed, so wheelspin and lockup show correctly.

#### 6.9.3 Braking physics summary (numbers the programmer needs)

- **Brake torque per corner:** `T_brake = µ_pad(temp) × clampForce × r_eff × 2 faces`. clampForce from hydraulic pressure × total piston area. Example front: pressure 100 bar × piston area (~6×π×16²mm) → ~48 kN clamp × µ0.42 × 0.168 m × 2 ≈ **~2,700 N·m** per front rotor at hard braking.
- **Brake bias:** ~64% front / 36% rear static (via piston sizing + proportioning/ESC); shifts with load transfer under braking.
- **ABS target:** modulate clampForce to hold slip ratio ~0.12 (peak µ); cycle 15–20 Hz; per-wheel independent.
- **Max deceleration:** grip-limited ~**1.15 g** dry on summer tires (≈ 0–100 km/h braking in ~33 m). Wet ~0.75 g; winter-on-warm-dry a bit less; snow far less.
- **Rotor inertia** adds to wheel spin inertia; **unsprung mass** per corner (wheel+tire+rotor+upright+hub ≈ 40–48 kg front) affects ride/impact response.
- **Failure/edge cases to support:** brake fade (temp), fluid boil (long pedal), pad wear (telemetry), ABS-off wheel lock (skid+flatspot+smoke), puncture/blowout (grip+radius collapse+pull), cold tires/brakes (low initial grip/bite).

---

### 6.10 Regenerative braking & blend (electrified specifics)

Central to an electrified flagship and a rich teaching topic for a driving-ed sim.

#### 6.10.1 Concept & hardware

- The traction motor(s) act as generators under braking, converting kinetic energy back to the battery and applying a **retarding torque at the driven axle(s)** — TH: rear (or e-axle); E: front+rear (dual-motor AWD).
- **Brake-by-wire** electro-mechanical booster (§6.4.5) decouples pedal from hydraulics so the system can **blend** regen and friction seamlessly: light-to-moderate pedal = mostly/all regen; harder pedal or low battery/high speed limits = friction brakes fill in.

#### 6.10.2 Blend logic (physics/UX)

- **Regen torque cap** depends on: battery state of charge (near-full → regen limited, friction fills in — a real "surprise, longer stop" teaching case), battery/motor temperature, speed (regen fades near 0 km/h → friction holds the final stop), and traction (ABS/ESC can cut regen on a slippery surface and hand to friction which modulates per-wheel).
- **Blend priority:** deceleration request → satisfy with regen up to its cap → remainder from friction brakes. Total decel should feel identical to the driver regardless of blend (that's the point of by-wire).
- **One-pedal driving mode (E):** lifting throttle applies strong regen (up to ~0.2–0.3 g) to a full stop without touching the brake pedal — no brake-light-less coasting; brake lights illuminate above a decel threshold even on regen.
- **Consequences for other systems:**
  - **Friction-brake heat & wear drop sharply** in normal EV driving (regen does most stops) → rotors stay cool, can even surface-rust from disuse (§6.3.3 rust film is common on EVs), and less brake dust on wheels (§6.1.5). A nice, accurate visual differentiator: **EV wheels stay cleaner; hard-driven TH wheels get dusty and rotors glow.**
  - **Regen still needs friction for hard/emergency stops**, hill-holding at rest, and when the battery can't accept charge.

#### 6.10.3 Gameplay / telemetry hooks

- Regen power flow on the dash/HUD (energy recovered), one-pedal on/off, regen-level paddles (fictional "L1–L3" regen strength).
- Teaching scenarios: full-battery regen loss, low-grip regen→friction handoff, brake-fade from ignoring regen and riding friction brakes downhill, one-pedal smoothness.

> **Real-time:** model regen as a **torque source blended into the same per-wheel brake-torque bus** the friction brakes feed — one decel request, split by a cap function. Visually it's "free": less glow/dust/wear on regen-heavy driving, more on friction-heavy. Brake lights + HUD energy flow are the main UI. No extra geometry.

---

### 6.11 Asset & LOD summary (per corner)

| Asset | LOD0 (cinematic) | Gameplay (WebGL/phone) |
|---|---|---|
| Wheel rim | Full barrel + drop center + safety hump + modeled lugs | Face + barrel shell, lugs baked to normal |
| Center cap / emblem | Modeled, self-leveling option | Textured disc, spins with wheel |
| Tire | Modeled tread blocks + geo lettering + rim protector, deform blendshapes | Revolved tire, tread+lettering as normal, UV-scroll tread, 1–2 blendshapes (deflate) |
| Rotor | Two-piece hat+ring, real vanes, bobbins, drilled/slotted, glow ring | Hat + solid ring + emissive glow card, vanes as edge normal |
| Caliper | 6-piston, modeled pistons (animated), fittings, script | Single body block + baked script, no piston anim |
| Pads | Modeled + shims + wear sensor | Simple block, telemetry wear |
| Hub/bearing/reluctor | Modeled (garage/exploded) | Omitted (read wheel ω from physics) |
| Valve stem | Small mesh, orbits | Small mesh close / baked far |
| TPMS | telemetry + hidden module | telemetry only |
| Suspension (visible) | Full multilink + spring/damper + drop link + tie rod + hose | 2–3 arms + spring/damper cluster |
| Brake ducts/shield | Modeled | Shield only / omitted |
| Dynamic states | temp glow, rust, dust, wear, wetness, deform, smoke, marks | temp glow, dust scalar, wetness param, smoke, skid decals |

**Recommended real-time budget (per wheel, mid-range):** rim ~4–8k tris, tire ~3–5k, rotor+caliper ~2–4k, suspension cluster ~2k → ~12–18k tris/corner incl. brakes; 3–4 material IDs (wheel, tire, rotor+glow, caliper). Instance L/R with correct handed tire meshes.

---

**Cross-references:** suspension geometry & unsprung dynamics — §5 (chassis/suspension); driven-axle torque, motors, differential & AWD — §7 (powertrain); dash TPMS/HUD, warning lights, brake energy flow — §8 (interior/HMI); tire smoke, skid decals, brake-glow bloom, weather wetness — §11 (VFX/materials). All brand-adjacent terms herein are fictional per ADR-001.
## 7. Underbody, Drivetrain & Suspension

**Model designation (fictional):** *Aurelian GT-e* — an unbadged, latest-generation luxury performance flagship. Two powertrain variants share ~85% of the underbody:

- **GT-e H** — twin-turbo V6 hybrid (longitudinal engine, 8-speed automatic, electric turbo-assist + rear e-axle).
- **GT-e X** — full-EV, dual-motor AWD on a skateboard battery platform.

This section is the authoritative reference for everything **below the beltline and behind the firewall**: the load-bearing floor structure, the powertrain that moves the car, and the suspension that connects sprung mass to road. All brand-specific mechanisms are neutralized to generic engineering terms.

> **Coordinate & unit convention (used throughout this section):**
> - **+X** = vehicle forward, **+Y** = left, **+Z** = up (right-handed). Origin at the **front-axle centreline, ground plane**.
> - Linear dimensions in **mm**, masses in **kg**, forces in **N**, spring rates in **N/mm**, damper rates in **N·s/mm**, torque in **N·m**.
> - "LOD0" = cinematic/hero geometry; "gameplay LOD" = real-time WebGL/mobile target.
> - PBR values assume a **metal/rough** workflow, linear albedo, sRGB only where noted.

**Overall packaging envelope**

| Attribute | Value | Notes |
|---|---|---|
| Wheelbase | 2,995 mm | Front-axle X=0 to rear-axle X=−2,995 |
| Front track | 1,660 mm | Hub face to hub face |
| Rear track | 1,675 mm | Slightly wider for stability |
| Overall length | 5,080 mm | — |
| Overall width (excl. mirrors) | 1,955 mm | — |
| Ground clearance (Comfort) | 135 mm | Air-suspension nominal |
| Ground clearance (Sport/lowered) | 110 mm | −25 mm |
| Ground clearance (Access/raised) | 160 mm | +25 mm, speed-limited |
| Underbody flat-floor coverage | ~78% | Fraction of plan area paneled |
| Kerb mass — GT-e H | 2,180 kg | 52/48 F/R |
| Kerb mass — GT-e X | 2,410 kg | 49/51 F/R (battery bias rearward-centred) |
| Drag coefficient (Cd) | 0.24 (X) / 0.26 (H) | Underbody sealing contributes ~0.02 |

---

### 7.1 Underbody Structure (Floorpan, Tunnel, Subframes)

The load-bearing "lower box" of the body-in-white. Everything in 7.2–7.9 mounts to it. Materials are a multi-material mix: hot-stamped boron steel in crash paths, aluminium castings at the corners, and a composite floor sandwich on the EV.

#### 7.1.1 Main floorpan / floor sandwich

- **Purpose/role:** Primary structural floor; ties front and rear crash structures, resists torsion, forms the sealed cabin underside, carries seat mounts and (EV) the battery-tray interface.
- **Geometry & dimensions:**
  - Plan footprint ≈ 3,400 mm (X) × 1,500 mm (Y) between the rockers.
  - Nominal panel thickness 1.2–1.8 mm steel (H); on the X, a **structural battery lid** doubles as the floor (see 7.3).
  - Longitudinal **rockers/sills** run the full length at Y = ±760 mm: closed-box section ~120 mm (Y) × 150 mm (Z), boron-steel + internal aluminium extrusion, foam-filled node at B-pillar.
  - Two **front longitudinal rails** (crash rails) run from firewall forward, section ~90×110 mm, with programmed crush initiators (bead pattern every 60 mm).
- **Sub-parts:** floor stampings (front, centre, rear), seat cross-members (2× front, 1× rear), rocker inner/outer, heel board, rear seat pan, spare-well delete panel (both variants are spare-less; the well is a tool/charge-cable cubby).
- **Materials (PBR):**

  | Sub-part | Base albedo (linear) | Metallic | Roughness | Notes |
  |---|---|---|---|---|
  | Bare boron steel (hero) | 0.10, 0.10, 0.11 | 1.0 | 0.55 | Faint mill bloom, weld discoloration |
  | E-coat cathodic dip (as-built) | 0.03, 0.03, 0.035 | 0.35 | 0.62 | Matte near-black, uniform; standard for underbody |
  | Structural adhesive bead | 0.18, 0.16, 0.14 | 0.0 | 0.85 | Beige, semi-gloss, along flange seams |
  | Spray-on sound deadener (LASD) | 0.02, 0.02, 0.02 | 0.0 | 0.9 | Textured "elephant-skin," on floor pans |
- **Moving parts / animation:** none (rigid). In deformation/crash cinematics, crush zones are handled by a separate damaged-mesh blendshape set, not here.
- **Physics/mechanical:** defines the **sprung-mass rigid body** collision proxy and the chassis frame's inertia tensor. Torsional stiffness target 38,000 N·m/deg (H), 42,000 N·m/deg (X, battery adds shear panel).
- **Gameplay interaction:** invisible in normal play; visible on flips/jumps and in a **garage "lift" inspection mode**. Underbody scrape SFX/decals trigger when clearance < contact threshold.
- **Rendering notes:** one **tiling trim-sheet** covers 90% of the floor (E-coat + deadener + fasteners). Weld seams and adhesive as decal strips.

> **Real-time:** Collapse the entire floor sandwich to a single low-poly shell (~2–4k tris) with the E-coat trim-sheet. Rockers keep silhouette only. No internal cavities; the crash-rail bead pattern is normal-mapped, not modeled. Mobile: floor is a **flat plane + AO bake**, seen only through wheel-well gaps.

#### 7.1.2 Transmission tunnel (hybrid) / centre spine (EV)

- **Purpose/role (H):** houses the prop shaft, exhaust down-pipe front section, and high-voltage cable run; structurally a torsion spine.
- **Geometry:** inverted-U channel, ~220 mm wide × 180 mm tall at the front, tapering to 160×120 mm at the rear seat. Runs X=−300 to X=−2,600.
- **EV difference:** no driveline tunnel needed; the X uses a **shallow "service spine"** (~90 mm tall) carrying HV bus bars, coolant lines, and the front/rear low-voltage harness — kept for parts commonality and to stiffen the battery lid.
- **Sub-parts:** tunnel top, tunnel reinforcement gussets, tunnel-to-crossmember brackets, heat-shield standoffs.
- **Materials:** same E-coat family; **aluminized heat-shield foil** (albedo 0.45/0.45/0.42, metallic 0.9, roughness 0.35, dimpled normal) on the tunnel underside above the exhaust.
- **Physics/mechanical:** carries torsional shear; also the mounting datum for the shifter/rotary-selector cable or by-wire actuator.
- **Rendering notes:** hero shows the crinkled heat foil catching light; a key readable detail on a lift.

> **Real-time:** tunnel is part of the floor shell. Heat foil = one emissive-free metallic decal. EV service spine omitted below gameplay LOD1.

#### 7.1.3 Front & rear subframes (cradles)

- **Purpose/role:** isolate suspension/steering/powertrain loads from the cabin; the mounting hardpoints for lower control arms, steering rack, differentials, and motors.
- **Front subframe:** hollow **aluminium high-pressure casting + extruded cross-tube**, roughly 1,000 mm (Y) × 550 mm (X), 4-point bushing mount to the body. Carries: lower control-arm pivots, steering rack (rear-mounted on subframe), anti-roll-bar clamps, engine/motor mounts (2), and (X) the front drive unit.
- **Rear subframe:** larger aluminium casting, ~1,050 × 700 mm, 4 hydro-bushings to body; carries multilink arm pivots, rear differential / e-axle, rear ARB, and air-spring lower seats.
- **Materials (PBR):**

  | Item | Albedo | Metallic | Roughness | Notes |
  |---|---|---|---|---|
  | Cast aluminium (raw) | 0.34, 0.34, 0.35 | 1.0 | 0.5 | Sand-cast grain, parting lines |
  | Cast aluminium (powder-coat satin black) | 0.02, 0.02, 0.022 | 0.4 | 0.45 | Production finish on hero |
  | Steel fasteners (zinc-flake) | 0.30, 0.31, 0.33 | 1.0 | 0.4 | Silver-grey, on all bolt heads |
- **Moving parts:** none itself, but it is the **static parent** for all suspension joints (7.9). Subframe bushings deflect ~2–4 mm under load (can be faked as a soft-body jiggle in hero crash shots).
- **Physics:** in the vehicle sim these become the **hardpoint anchor frame** for the suspension constraint solver. Bushing compliance modeled as stiff 6-DOF springs (radial 12,000 N/mm, axial 4,000 N/mm) if compliance is simulated; otherwise rigid.
- **Rendering notes:** casting is a hero-readable "engineering jewel" on a lift; give it real casting draft and rib detail at LOD0.

> **Real-time:** merge each subframe into the suspension-parts atlas as a single satin-black casting mesh (~1–2k tris). Bushing compliance = not simulated; suspension pivots are rigid to the chassis body. Mobile: subframes omitted, arms pivot on invisible chassis points.

---

### 7.2 Fuel System (GT-e H only)

#### 7.2.1 Fuel tank

- **Purpose/role:** stores petrol for the combustion side of the hybrid.
- **Geometry & capacity:** saddle-shaped **HDPE multilayer** tank, ~60 L usable, nestled ahead of the rear axle at X≈−2,300, straddling the prop shaft (saddle notch for driveline clearance). Envelope ~700 (Y) × 500 (X) × 260 (Z) mm.
- **Sub-parts:** filler neck (right rear quarter), in-tank fuel pump module + level sender (float arm, 0–90° sweep), jet pump (transfers fuel across the saddle), rollover/vent valves, EVAP charcoal canister (mounted aft), fuel-tank pressure sensor, heat shield (over the exhaust-adjacent face).
- **Materials (PBR):**

  | Item | Albedo | Metallic | Roughness |
  |---|---|---|---|
  | HDPE tank (carbon-black) | 0.015, 0.015, 0.016 | 0.0 | 0.75 |
  | Aluminized heat shield | 0.45, 0.45, 0.42 | 0.9 | 0.35 |
  | Nylon fuel lines | 0.02, 0.02, 0.02 | 0.0 | 0.6 |
- **Moving parts / animation:** float-arm sender (drives the fuel gauge; range 0–90°); check-valve flaps (not visible). Fuel slosh is a **fluid/audio effect**, not geometry.
- **Physics:** fuel mass is a **variable point mass** (0–45 kg) at the tank centroid — affects rear-axle load and CG longitudinally as it depletes. Slosh optionally modeled as a lagged CG offset (±30 mm X) under lateral G for realism.
- **Gameplay interaction:** drives fuel-level HUD; empty = engine cut (hybrid can limp on battery only, then stall). Refuel event animates the level and adjusts mass.
- **Rendering notes:** tank rarely seen; model to LOD1 only. Filler-neck cap + door are hero (cosmetic exterior tie-in).

> **Real-time:** tank is a static low-poly blob; fuel mass modeled as a scalar affecting a CG offset — no geometry change. Slosh omitted. EVAP/vent hardware omitted entirely.

#### 7.2.2 Fuel lines & delivery

- Feed + return (H uses returnless, single feed) nylon lines, 8 mm OD, routed along the tunnel then the right rocker to the engine bay high-pressure pump. Quick-connect fittings at 4 points.
- **Real-time:** represented as a single spline tube on the underbody atlas, LOD1 only; omitted at gameplay LOD.

---

### 7.3 High-Voltage Battery (GT-e X — skateboard) & Hybrid Battery (H)

#### 7.3.1 EV traction battery pack (skateboard)

- **Purpose/role:** structural floor-integrated energy store and the largest single mass in the vehicle.
- **Geometry & dimensions:** flat "skateboard" tray spanning between the rockers and axles: ~2,000 mm (X) × 1,450 mm (Y) × 110 mm (Z) at the cell zone, with a raised "foot garage" step under the front seats. Sits with its floor at Z≈+120 mm, top forming the cabin floor.
- **Energy/electrical (spec-fiction):** ~105 kWh usable, 800 V architecture, ~12 modules / prismatic cells, C-rate supporting 350 kW peak DC charge.
- **Sub-parts:**
  - **Lower tray:** aluminium extrusion frame + composite/aluminium floor plate, doubles as skid protection and side-impact structure (cross-beams every ~200 mm).
  - **Cell modules:** 12 rectangular blocks, each ~330×290×100 mm.
  - **Upper structural lid:** bonded aluminium sheet = cabin floor (see 7.1.1).
  - **Cooling plate:** serpentine aluminium cold-plate under the modules (see 7.7).
  - **BMS + junction box:** front-centre, HV contactors, fuse, shunt.
  - **HV connectors:** front (to front drive unit), rear (to rear drive unit), fast-charge inlet feed.
  - **Underside skid tray:** 3–4 mm aluminium plate + honeycomb crush layer.
- **Materials (PBR):**

  | Item | Albedo | Metallic | Roughness | Notes |
  |---|---|---|---|---|
  | Extruded aluminium frame | 0.32, 0.32, 0.33 | 1.0 | 0.4 | Brushed extrusion lines along X |
  | Skid tray (anodized dark) | 0.05, 0.05, 0.06 | 0.85 | 0.45 | Scuff decals accumulate |
  | Structural adhesive seams | 0.16, 0.15, 0.13 | 0.0 | 0.85 | Perimeter bond line |
  | HV orange cabling | 0.55, 0.18, 0.03 | 0.0 | 0.55 | Signature EV orange, emissive-off |
- **Moving parts / animation:** none structurally. Cooling flow, cell-swell, and thermal are non-geometric. In a battery-fire/damage cinematic, a separate breached-tray mesh + vent-jet VFX is used.
- **Physics:** dominant mass (~560 kg) mounted **low and central** → the single biggest CG contributor. Placement gives the X its low roll centre and ~49/51 balance. Modeled as a large fixed mass in the chassis inertia tensor. Underbody strike here triggers "battery damage" gameplay state.
- **Gameplay interaction:** drives **state-of-charge HUD**, range, regen behavior, and power derating when "hot" or "cold." A hard underbody impact can spawn a damage/limp state. Charge-port door + inlet are the interactive hero parts.
- **Rendering notes:** the pack underside (skid tray) is the **most-seen underbody surface** in jump/flip shots — give it a real bolt pattern, cross-beam ribs, scuff wear, and an orange HV connector as a focal detail.

> **Real-time:** pack = one boxy mesh with the skid-tray trim-sheet (~800 tris). SOC is a scalar; no cell geometry. Cooling/thermal = shader/param only. Mobile: pack is the flat underbody plane with a baked skid texture; connectors omitted.

#### 7.3.2 Hybrid battery (GT-e H)

- Small lithium pack (~1.8 kWh, 400 V mild-to-full hybrid buffer) mounted **above the rear axle / under the load floor**, ~350×300×160 mm, ~28 kg. Feeds the rear e-axle and the electric turbo assist (7.4.3).
- **Real-time:** static box under the boot floor, never seen in play; LOD1 garage-inspection only.

---

### 7.4 Drivetrain — Combustion & Hybrid (GT-e H)

#### 7.4.1 Engine — twin-turbo V6

- **Purpose/role:** primary motive power for the hybrid variant.
- **Configuration & geometry:** **90° V6, 3.0 L, longitudinal, front-mid** (behind front axle line). Block envelope ~600 (X) × 680 (Y) × 640 (Z) mm. Hot-vee turbo layout (turbos nestled in the valley). Dry-ish sump.
- **Spec-fiction outputs:** 480 kW combined system (engine ~370 kW + rear e-axle ~110 kW), ~800 N·m combined, redline 7,200 rpm.
- **Sub-parts (modelling checklist):**
  - Cylinder block (aluminium, open-deck), bedplate/ladder frame, oil pan (cast alloy, finned).
  - Two cylinder heads (DOHC, 24-valve), cam covers (magnesium, wrinkle-black or brushed).
  - Crankshaft (forged, 6-throw), connecting rods, pistons (not normally visible — LOD0 cutaway only).
  - Two turbochargers in the vee: compressor housing (polished alloy), turbine housing (cast, heat-blued steel), wastegate actuators, electric wastegates.
  - Intercooler (air-to-water, top-mounted), charge pipes, throttle body.
  - Intake plenum + manifold, injectors (direct + port, dual injection), fuel rail.
  - Exhaust manifolds (inside vee → up-pipe), see 7.6.
  - Accessory drive: belt, tensioner, water pump, AC compressor, e-machine belt-starter-generator (BSG).
  - Coil packs, spark plugs, dipstick, oil-fill cap, engine mounts (2 hydraulic).
- **Materials (PBR):**

  | Item | Albedo | Metallic | Roughness | Notes |
  |---|---|---|---|---|
  | Cast aluminium block | 0.30, 0.30, 0.31 | 1.0 | 0.5 | Sand texture, machined faces smoother (0.25) |
  | Magnesium cam cover (wrinkle black) | 0.02, 0.02, 0.022 | 0.3 | 0.7 | Crackle normal map |
  | Turbine housing (heat-blued) | 0.06, 0.05, 0.05 | 1.0 | 0.45 | Rainbow heat tint gradient near flanges |
  | Polished compressor housing | 0.55, 0.55, 0.56 | 1.0 | 0.15 | Near-chrome |
  | Braided/silicone hoses | 0.4, 0.4, 0.42 | 0.6 | 0.4 | Charge pipes; blue/black silicone joints |
  | Wiring loom (split-loom) | 0.02, 0.02, 0.02 | 0.0 | 0.8 | Corrugated normal |
- **Moving parts / animation:**
  - **Crank/pulley spin** — driver: engine RPM; visual blur past ~1,500 rpm.
  - **Belt + tensioner** — follows pulley rotation.
  - **Throttle body butterfly** — driver: throttle input, 0–90°.
  - **Turbo wastegate actuators** — small linear stroke on boost.
  - **Engine rock on mounts** — torque-reaction rotation about crank axis, ±3–5° transient on tip-in/shift; idle shake ±0.5°.
  - **Cooling fan** (if visible) — RPM-linked, clutched.
- **Physics:** produces the **engine torque curve** feeding the transmission; provides engine-braking; its mass (~180 kg) sits low/central for CG. Torque-reaction rock is a cosmetic driven parameter (not part of the drive physics).
- **Gameplay interaction:** RPM + boost gauges, engine-bay "open hood" inspection, tuning/upgrade slots; overheat/damage states. Turbo spool tied to SFX + boost gauge + optional wastegate flutter on lift.
- **Rendering notes:** hot-vee turbos + heat tint are the hero focal points under an open hood. Emissive not used at rest; a subtle **heat-haze post FX** and reddening exhaust manifold under sustained load add life.

> **Real-time:** engine = one baked mesh with a single 2K–4K atlas; only the crank pulley/belt and throttle butterfly animate (or none on mobile). Internals (pistons/rods) omitted unless a cutaway mode is requested. Engine rock = a small driven transform on the whole engine mesh. Mobile: engine is a static prop seen through hood gaps; torque-rock optional.

#### 7.4.2 Transmission — 8-speed automatic + torque converter/clutch

- **Purpose/role:** multiplies and manages engine torque; integrates the primary hybrid motor-generator.
- **Geometry:** longitudinal case bolted to the block, ~700 mm long, bell-housing Ø ~360 mm, cast aluminium.
- **Sub-parts:** torque converter (or in this hybrid, a **wet multi-plate launch clutch + integrated e-motor** in place of a conventional TC — model both variants as an option), planetary gearsets (LOD0 cutaway only), valve body, mechatronic controller, transmission oil pan (finned), park-lock pawl, output flange to prop shaft, transmission mount (1, at the tail).
- **Gear ratios (spec-fiction):**

  | Gear | Ratio | | Gear | Ratio |
  |---|---|---|---|---|
  | 1 | 5.00 | | 5 | 1.24 |
  | 2 | 3.20 | | 6 | 1.00 |
  | 3 | 2.14 | | 7 | 0.82 |
  | 4 | 1.60 | | 8 | 0.64 |
  | R | 3.46 | | Final drive | 3.15 |

- **Materials:** cast-alloy case (as engine), satin-black valve body cover, steel output flange (zinc-flake).
- **Moving parts / animation:** output flange spin (driver: wheel speed × final drive); park pawl engage/disengage (small rotation on P selection); shift events = torque-interrupt cosmetic dip. Internal gears animate only in cutaway/tech-mode.
- **Physics:** the **gearbox model** — ratio table above + final drive, shift map, torque-converter/clutch slip (lock-up above ~1,600 rpm), efficiency ~0.94. Feeds the driveline torque to the prop shaft/differentials. Provides engine braking scaling per gear.
- **Gameplay interaction:** gear indicator, manual paddle shift, launch-control clutch behavior, kick-down. Upgrade slot: faster shift map.
- **Rendering notes:** rarely seen; LOD1. Cutaway "tech mode" can animate planetary sets for a showroom feature.

> **Real-time:** transmission is a static case mesh; gear logic is pure data (ratio array + shift map). No internal geometry. Clutch/TC slip = a scalar in the drivetrain solver. Mobile: same data model, mesh merged into engine prop.

#### 7.4.3 Hybrid electric subsystem (H)

- **Motor-generator 1 (MG1/BSG):** belt-integrated starter-generator on the accessory drive, ~15 kW, handles auto-stop/start, torque fill, mild regen.
- **Primary traction motor (MG2):** integrated in the transmission bell-housing, ~90 kW, provides EV launch + boost + heavy regen.
- **Rear e-axle:** compact ~110 kW motor + single-speed reduction gear on the rear axle, enabling **through-the-road AWD** (engine drives front-biased via prop shaft; e-axle drives rear). See 7.5 differential note.
- **Electric turbo assist:** small e-motor on each turbo shaft (or a single 48V e-compressor) to eliminate lag — spins turbos before exhaust energy arrives.
- **Physics:** electric torque is **instant** (full torque from 0 rpm), blended with engine torque in the torque-arbitration model; regen adds a speed-dependent braking torque to the driven axle. Battery SOC gates available e-boost.
- **Real-time:** motors are static meshes; their torque contribution is data. e-turbo = an SFX + boost-response tuning param.

---

### 7.5 Drivetrain — Electric (GT-e X)

#### 7.5.1 Dual drive units (front & rear)

- **Front drive unit:** ~180 kW motor + single-speed reduction + open/eLSD front differential, mounted in the front subframe. Compact "e-axle" package ~500×400×350 mm.
- **Rear drive unit:** ~250 kW motor + single-speed reduction + **electronic limited-slip differential (eLSD)**, in the rear subframe. Rear-biased tuning.
- **Combined:** ~430 kW / ~850 N·m, AWD via independent axle control (true torque vectoring front-to-rear; the rear eLSD adds side-to-side).
- **Sub-parts (per unit):** motor stator/rotor housing (finned aluminium), inverter (mounted on top, ribbed heatsink), reduction gearset (LOD0 cutaway), differential, output stubs to half-shafts, coolant ports, HV three-phase connector (orange), park lock.
- **Materials:** finned cast-alloy housing (albedo 0.30, metallic 1.0, roughness 0.5); orange HV connectors; ribbed inverter heatsink (brushed alloy, roughness 0.35).
- **Moving parts / animation:** output stubs spin with wheel speed; internal rotor/gears only in cutaway. No shift events (single-speed) → smooth continuous drive.
- **Physics:** two independent torque sources → the **torque-vectoring AWD model**: front/rear split is software-defined (e.g., 40/60 default, up to 0/100 or 100/0). Instant torque, speed-dependent power taper (constant power above base speed, motor curve). Regen braking split per axle. Reduction ratio ~9.0:1, so wheel torque = motor torque × 9.0 × efficiency (~0.96).
- **Gameplay interaction:** drive-mode changes the F/R bias and eLSD aggressiveness; power/regen HUD; "launch" uses both axles at peak. Upgrade slots: motor power, cooling (sustained-power derate).
- **Rendering notes:** the two silver finned e-axles are the hero underbody jewelry on the X — model fins, inverter ribs, and orange cabling crisply for lift/showroom shots.

> **Real-time:** each drive unit = one baked mesh (~1k tris) with orange-cable decal; output stubs animate to feed half-shaft spin. Torque vectoring = data model. Mobile: units are static; AWD split is invisible logic only.

---

### 7.6 Exhaust System (GT-e H)

Absent entirely on the X (EV) except a cosmetic diffuser blank.

#### 7.6.1 Layout & sections (front → rear)

- **Up-pipes / manifolds:** from the hot-vee turbos, twin ~60 mm ID pipes exit the turbine housings.
- **Close-coupled catalytic converters:** two, immediately downstream of the turbos for fast light-off. Ceramic honeycomb monolith in a stainless "clamshell" can, ~120 mm Ø × 150 mm, with O2/lambda sensors upstream & downstream (small hex bosses, wiring pigtails).
- **Down-pipe / front pipe:** merges toward the tunnel; flexible braided coupler (bellows) to absorb engine rock.
- **Mid resonator:** a straight-through perforated-core resonator, ~110 mm Ø × 300 mm, tunes drone out at cruise.
- **Rear mufflers:** two transverse mufflers ahead of the rear axle valance, ~150 mm Ø × 350 mm, with **electronic exhaust valves** (butterfly flaps) for the "loud/quiet" split.
- **Tips:** quad polished tips, Ø ~90 mm, integrated into the rear diffuser (7.8).

#### 7.6.2 Heat shields

- Stamped **aluminized-steel shields** over: manifolds/cats, floor above the resonator, fuel-tank-adjacent run, and rear axle. Dimpled for stiffness.
- **Materials (PBR):**

  | Item | Albedo | Metallic | Roughness | Notes |
  |---|---|---|---|---|
  | Stainless pipe (new) | 0.55, 0.55, 0.55 | 1.0 | 0.25 | Heat-tint gradient near cats |
  | Cat/muffler can (brushed stainless) | 0.5, 0.5, 0.5 | 1.0 | 0.3 | Weld seams, stamped ribs |
  | Heat shield (aluminized, dimpled) | 0.45, 0.45, 0.42 | 0.9 | 0.35 | Dimple normal map |
  | Exhaust tip (polished, sooted inner) | 0.58, 0.58, 0.58 | 1.0 | 0.18 | Inner bore albedo → 0.03 soot |

- **Moving parts / animation:** exhaust valve butterflies (0–90°, driver: drive mode / RPM / throttle — audible + faint tip-haze change); flex bellows flexes with engine rock (small).
- **Physics:** negligible mass effect (~35 kg). Backpressure abstracted into the engine torque curve. Underbody strike on the mid-pipe can trigger a rattle/damage SFX state.
- **Gameplay interaction:** exhaust-valve state ties to **sound design** (loud/quiet), and to visible **heat glow** on the tips/manifold under sustained load. Cold-start = white condensation puff VFX at the tips.
- **Rendering notes:** near the cats/manifold, drive an **emissive heat-glow** (blackbody ramp: dull red ~600 °C → orange) as a function of a rolling "exhaust temperature" scalar. Tips get soot buildup + heat-haze.

> **Real-time:** whole exhaust = one spline-derived mesh on the underbody atlas; only the visible **tips** are hero. Valve flaps not modeled (state is audio + tip-haze only). Heat glow = a cheap emissive mask fading in with load. Mobile: only the tips exist; the rest is baked into the underbody plane.

---

### 7.7 Cooling & Fluid Lines

#### 7.7.1 Cooling circuits

- **H variant:** three loops — (1) engine high-temp coolant (radiator, water pump, thermostat), (2) intercooler low-temp loop (charge-air-to-water + its own radiator + electric pump), (3) hybrid/inverter loop (battery + power electronics, electric pump).
- **X variant:** two-to-three loops — battery cold-plate loop, drive-unit/inverter loop, cabin heat-pump loop, all cross-linked via a **coolant manifold ("octovalve"-style multi-port valve)** for thermal management (preconditioning, fast-charge cooling).
- **Sub-parts:** radiators/condensers (front-mounted, see body spec), electric coolant pumps, expansion/degas tank, thermostat/valves, coolant hoses (silicone, colored), quick-connects, the multi-port coolant valve, cold-plate under the battery.
- **Materials:** silicone hoses (albedo per color, roughness 0.4, metallic 0.5 for the sheen); alloy pump housings; the multi-port valve as a black-nylon manifold with several hose stubs.
- **Moving parts / animation:** none visible (pumps internal). Coolant flow is a **thermal/VFX** abstraction. Optional radiator fan spin (RPM/temp-linked).
- **Physics:** thermal state gates **power derating** (engine overheat, battery hot/cold, motor thermal limit) — the gameplay consequence of cooling. Preconditioning affects available regen/charge rate.
- **Rendering notes:** hoses add engine-bay/underbody richness. Multi-port valve is a neat EV detail for showroom/tech mode.

> **Real-time:** cooling lines are decorative spline tubes at LOD1, omitted at gameplay LOD. Thermal derate is pure data. Mobile: no cooling geometry; overheat is a HUD/VFX state only.

#### 7.7.2 Brake lines & hydraulic lines

- **Brake lines:** steel hard-lines from the master cylinder / brake actuator along the firewall and floor to each corner, transitioning to **braided flexible hoses** at the moving hubs. Note the X uses a **brake-by-wire** actuator blending friction + regen.
- **Materials:** hard-line = zinc/green-cad steel (albedo 0.35/0.4/0.32, metallic 1.0, roughness 0.35); flex hose = black braided (metallic 0.4, roughness 0.5).
- **Moving parts:** the **flex hose at each corner flexes** with suspension travel and steering (LOD0 hero animation; a jointed spline or physics rope). Hard-lines are static.
- **Physics:** brake torque delivery is modeled per corner; line geometry is cosmetic. Regen/friction blend is a data model on the X.
- **Rendering notes:** the flexing corner hose is a lovely detail on a raised suspension; give it a couple of clips/brackets.

> **Real-time:** flex hoses = simple 2-bone spline that follows the knuckle; hard-lines omitted or baked into the floor atlas. Mobile: omit all brake lines.

---

### 7.8 Underbody Aerodynamics & Protection

#### 7.8.1 Under-trays / flat floor

- **Purpose/role:** seal the underbody for low drag + manage cooling/brake airflow + protect components.
- **Sub-parts:** front under-tray (engine/motor bay), mid floor panels (2–3, spanning battery/tunnel), rear diffuser, active front air-dam/undertray flaps (optional), NACA-style brake-cooling ducts, wheel-well liners (with aero fins).
- **Geometry:** injection-molded PP/composite panels, ~3–5 mm, fastened on ~200 mm grid; near-flat with strakes/fences that guide air around the wheels; slight rake for ground effect.
- **Materials (PBR):**

  | Item | Albedo | Metallic | Roughness | Notes |
  |---|---|---|---|---|
  | Composite under-tray (matte) | 0.02, 0.02, 0.022 | 0.0 | 0.8 | Woven or ribbed normal; scuffs accumulate |
  | Aero strakes/fins | 0.02, 0.02, 0.022 | 0.0 | 0.8 | Same panel family |
  | Optional exposed CF panel (hero) | 0.02, 0.02, 0.025 | 0.1 | 0.35 | Clear-coat over twill weave; clearcoat layer |
- **Moving parts / animation:** optional **active front flap** (deploys at speed, 0–30° down; driver: vehicle speed / drive mode); **active rear diffuser flap** likewise. Ride-height changes (7.9 air suspension) move the whole tray closer to the ground.
- **Physics:** contributes downforce/drag as **speed-squared aero coefficients** (front/rear balance shift with active elements and ride height). Lower ride height + deployed elements → more downforce, higher grip, slightly higher drag. Underbody scrape when clearance < 0.
- **Gameplay interaction:** ties to a "downforce"/handling model in Sport mode; scrape sparks + SFX on speed bumps/curbs; visible tray damage decals after scrapes.
- **Rendering notes:** the flat floor + strakes are the **primary readable underbody** in jump/replay cameras — model strake fences and diffuser vanes crisply. Scuff/scrape as an accumulating decal layer.

#### 7.8.2 Rear diffuser

- Multi-channel diffuser integrating the exhaust tips (H) or a blank/aero insert (X). Vertical strakes, ~7–9° upsweep. Hero exterior + aero element.
- **Real-time:** diffuser stays visible (silhouette-defining from behind) even on mobile; strakes normal-mapped rather than modeled at low LOD.

#### 7.8.3 Skid / protection plates

- Aluminium skid plate under the front crash structure (H) or the battery skid tray (X); jacking-point pads; tow-eye sockets (front + rear, threaded, covered by removable caps).
- **Real-time:** skid tray already covered by the battery mesh (X). Tow eyes are hero cosmetic caps.

> **Real-time (whole 7.8):** collapse under-trays to a single flat plane + diffuser mesh with one aero trim-sheet + scuff decal. Active flaps: keep on desktop as a small driven transform; omit on mobile. Aero forces are always data-driven regardless of LOD.

---

### 7.9 Suspension System

Front: **MacPherson strut** (space-efficient, packages the front drive unit/engine). Rear: **multi-link (5-link, effectively double-wishbone behavior)** for lateral stiffness and camber control. Both corners run **air springs + continuously-variable adaptive dampers**, with ride-height control.

#### 7.9.1 Front suspension — MacPherson strut

- **Sub-parts (per side):**
  - **Strut assembly:** coil-over air spring around a monotube adaptive damper; upper strut mount (bearing + rubber isolator, allows steering rotation), dust boot, bump stop, air-spring bellows.
  - **Lower control arm (L-arm):** aluminium forging, inboard front + rear bushings to subframe, outboard ball joint to knuckle.
  - **Steering knuckle / upright:** cast aluminium; carries hub bearing, brake caliper mount, strut clamp, steering tie-rod arm, ABS/wheel-speed sensor, ride-height sensor link.
  - **Anti-roll bar (front):** tubular, Ø ~26 mm, with drop links to the struts; bushings clamp to subframe. (Optional active/electromechanical ARB.)
  - **Tie rod** (from rack) to knuckle steering arm.
  - **Hub & bearing, wheel studs** (see wheels spec for the wheel itself).
- **Geometry / kinematics (spec-fiction):**

  | Parameter | Value | Notes |
  |---|---|---|
  | Static camber | −0.8° | More negative in Sport (−1.2°) |
  | Caster | +6.5° | Stability + self-centering |
  | Kingpin inclination | 13° | — |
  | Toe (static) | +0.1° total | Slight toe-in |
  | Wheel travel (jounce/rebound) | +90 / −100 mm | From design height |
  | Motion ratio (spring:wheel) | 0.78 | — |
  | Roll centre height | ~55 mm | Above ground |
- **Materials (PBR):**

  | Item | Albedo | Metallic | Roughness | Notes |
  |---|---|---|---|---|
  | Forged alloy control arm (satin) | 0.30, 0.30, 0.31 | 1.0 | 0.45 | Forging flash lines |
  | Cast alloy knuckle | 0.28, 0.28, 0.29 | 1.0 | 0.5 | Sand-cast grain |
  | Damper body (black) | 0.03, 0.03, 0.03 | 0.6 | 0.4 | Oil-film sheen near seal |
  | Damper shaft (chromed) | 0.55, 0.55, 0.56 | 1.0 | 0.12 | Mirror shaft, shows travel |
  | Air-spring bellows (rubber) | 0.02, 0.02, 0.02 | 0.0 | 0.7 | Convolutions; flexes |
  | Coil spring (if fitted, powder-coat) | 0.02, 0.02, 0.03 | 0.4 | 0.45 | Alt to air on base trim |
  | ARB (tubular, black) | 0.03, 0.03, 0.03 | 0.7 | 0.4 | — |
  | Bushings (rubber) | 0.02, 0.02, 0.02 | 0.0 | 0.8 | — |
  | Ball-joint boot (rubber) | 0.02, 0.02, 0.02 | 0.0 | 0.75 | Accordion |
- **Moving parts / animation (the critical suspension rig):**
  - **Damper shaft telescopes** along strut axis; chromed shaft length reveals travel — driver: suspension displacement.
  - **Air bellows compress/extend** with travel (convolution squash).
  - **Lower arm rotates** about its inboard bushing axis (roughly ±8°).
  - **Knuckle** steers about the kingpin axis (upper mount bearing + lower ball joint) — driver: steering input (±40° road-wheel).
  - **Tie rod** translates laterally with the rack; its outboard end follows the knuckle.
  - **ARB twists** proportional to the L-R travel difference; **drop links** swing.
  - **Bump stop** compresses at travel extremes (adds progressive rate + a visible squash + SFX).
  - **Brake flex hose** follows knuckle (from 7.7.2).
  - **Wheel-speed & ride-height sensors** — static bodies, their linkages articulate.

#### 7.9.2 Rear suspension — multi-link

- **Sub-parts (per side):** five links — **upper control arm, lower "spring" link (carries the air spring), forward & rear lateral links, and a longitudinal trailing arm/toe link** — plus the rear knuckle/upright, hub bearing, air spring + adaptive damper (can be separated, spring-on-lower-arm + inboard-ish damper), rear ARB (Ø ~22 mm) + drop links, and (H) the half-shaft passing through to the e-axle/diff.
- **Geometry / kinematics (spec-fiction):**

  | Parameter | Value | Notes |
  |---|---|---|
  | Static camber | −1.4° | Grip + tire wear compromise |
  | Toe (static) | +0.2° total | Stability toe-in |
  | Anti-squat | ~35% | Traction under power |
  | Wheel travel (jounce/rebound) | +85 / −100 mm | — |
  | Motion ratio (spring:wheel) | 0.62 | Softer effective rate |
  | Motion ratio (damper:wheel) | 0.70 | — |
  | Roll centre height | ~110 mm | Higher than front → roll axis rake |
- **Materials:** same family as front (forged/cast alloy arms, black dampers, chromed shafts, rubber bellows and bushings). Rear arms are more numerous and slender — good silhouette detail on a lift.
- **Moving parts / animation:** each of the five links rotates about its inboard bushing; the knuckle's motion is the constrained result (camber gain + toe curve as it travels); air spring + damper articulate as front; half-shaft plunges/articulates at its CV joints (7.9.5); ARB twists with differential travel.

#### 7.9.3 Adaptive dampers

- **Type:** continuously-variable **electronically-controlled dampers** (magnetorheological or solenoid-valve CDC — model as a generic "adaptive damper"). Each has a control connector + wiring pigtail.
- **Damper rates (spec-fiction, at the damper, N·s/mm):**

  | Mode | Bump (low-speed) | Rebound (low-speed) | Notes |
  |---|---|---|---|
  | Comfort | 2.2 | 3.0 | Soft, body-motion focus |
  | Auto | 3.0 | 4.2 | Adaptive baseline |
  | Sport | 4.5 | 6.0 | Flat body control |
  | Track | 6.0 | 8.0 | Max control, harsh |
  Digressive high-speed knee at ~0.5 m/s piston velocity (rates taper ~40% above the knee).
- **Physics:** damping force = rate × piston velocity (bilinear bump/rebound with a digressive knee). Mode selection is a live parameter the handling model reads. MR dampers respond in ~5 ms → near-instant mode blends.
- **Gameplay interaction:** drive-mode selector changes ride feel + body-roll/pitch/dive; visible in the way the car squats/dives/rolls. Upgrade slot: stiffer track tune.

#### 7.9.4 Air suspension & ride-height control

- **Air springs:** rolling-lobe bellows at each corner (rear can be pure air; front air-over-strut). Fed by an **onboard compressor + air reservoir + valve block** (packaged near the spare-well/rear).
- **Spring rates (effective wheel rate via air pressure, N/mm):**

  | Load / mode | Front wheel rate | Rear wheel rate |
  |---|---|---|
  | Comfort, nominal | 28 | 32 |
  | Sport (raised pressure) | 40 | 46 |
  | Fully loaded (auto-level) | +15% | +20% |
  Air springs are **progressive** — rate rises with compression (self-stiffening), unlike linear coils.
- **Ride-height positions:** Access +25 mm, Comfort 0, Sport −25 mm, Auto-lower at highway speed −15 mm. Compressor raises; valves vent to lower.
- **Sub-parts:** compressor + dryer, reservoir tank, valve block (4 corner solenoids), air lines (nylon, 6 mm), **ride-height sensors** (a lever-arm rotary sensor linking chassis to each control arm — small but visible articulating parts).
- **Moving parts / animation:** whole car body **raises/lowers** (driver: mode/speed) over ~2–4 s with a compressor SFX; bellows change height; ride-height sensor arms rotate. Corner-by-corner leveling under load/passengers.
- **Physics:** variable spring rate + ride height feed the suspension model → CG height, aero clearance, and roll/pitch stiffness all shift. Lowering reduces CG (better handling) + aero gap; raising clears obstacles.
- **Gameplay interaction:** drive-mode + a manual "lift" control (e.g., for driveways/speed bumps); visible stance change is a signature cosmetic. Kneel-on-park option.

> **Real-time (7.9.3–7.9.4):** damper rates and air-spring rates are pure data in the vehicle physics; no fluid/air simulation. Ride-height change = animate the chassis-to-wheel offset + a driven body-height transform, with a compressor SFX. Mode blends are instantaneous parameter swaps. Mobile: still animate stance change (cheap, high-impact), but sensors/compressor/valve hardware are omitted.

#### 7.9.5 Half-shafts, axles & CV joints (both variants)

- **Front half-shafts (driven on both variants):** from front differential/e-axle out to each front hub. **Outboard CV joint** (fixed, Rzeppa-type, allows steering + travel articulation), **inboard CV/plunge joint** (tripod, allows length change as suspension travels), shaft (solid or hollow), rubber boots + clamps at both joints.
- **Rear half-shafts:** from rear differential/e-axle to rear hubs, same CV/plunge arrangement (no steering articulation, but full travel plunge).
- **Prop shaft (H only):** connects the transmission output (front-mid) to the **rear differential/e-axle**, running down the tunnel. Two-piece with a **centre support bearing** + rubber mount, **universal joints** (or CV) at each end, and a splined plunge section. On the X there is **no prop shaft** (independent axles).
- **Geometry:** half-shaft Ø ~25–30 mm, length ~600 mm (front) / ~650 mm (rear); CV joint housings Ø ~90 mm bell shape; prop shaft Ø ~70 mm tube, ~1,600 mm over two pieces.
- **Materials (PBR):**

  | Item | Albedo | Metallic | Roughness | Notes |
  |---|---|---|---|---|
  | Steel shaft (phosphate) | 0.10, 0.10, 0.11 | 1.0 | 0.45 | Dark grey |
  | CV boot (rubber) | 0.02, 0.02, 0.02 | 0.0 | 0.75 | Accordion, grease sheen at clamp |
  | CV bell housing (machined steel) | 0.18, 0.18, 0.19 | 1.0 | 0.35 | Turned finish |
  | Prop shaft tube (painted) | 0.03, 0.03, 0.03 | 0.6 | 0.4 | Balance weights tack-welded |
- **Moving parts / animation:**
  - **Shaft rotation** — driver: wheel/driveline speed (visual spin/blur).
  - **CV articulation** — outboard joint bends with steer + travel; inboard **plunges** (length change) with travel — the boots stretch/compress.
  - **Prop shaft** spins along its axis; U-joints articulate slightly; centre bearing stays put.
- **Physics:** driveline torque path; in a detailed sim, plunge/articulation is cosmetic while torque is delivered via the axle/differential model. CV joint angle limits define max steer+droop combos before "bind" (usually ignored in-game).
- **Gameplay interaction:** visible spinning shafts on a lift/replay; part of the "AWD is real" showroom story. Wheelspin shows shaft/torque behavior.
- **Rendering notes:** the ribbed CV boots + spinning shafts read strongly in underbody/wheel-well replay cameras — worth hero detail; add a subtle grease/dirt sheen.

> **Real-time:** half-shafts = a single cylinder + two boot meshes per corner; rotation driven by wheel speed, articulation baked into the wheel-carrier hierarchy so the shaft simply parents between diff and hub (auto-stretches via a 2-bone stretch). CV plunge faked by a stretchy segment. Prop shaft (H): one spinning tube, U-joints not individually animated. Mobile: shafts omitted or a single static stub; spin faked with a scrolling texture if visible at all.

#### 7.9.6 Differentials (summary cross-reference)

- **Front differential:** open or eLSD, integrated in the front drive unit (X) / driven off the transfer path (H's through-road AWD uses the engine at front axle + prop to rear). Reduction + final-drive per 7.4.2/7.5.
- **Rear differential / eLSD:** **electronically-controlled multi-plate limited-slip** — clutch pack preload varied by an electric actuator to bias torque side-to-side (torque vectoring). Sub-parts: ring & pinion (hypoid, LOD0 cutaway), clutch pack, actuator, diff housing (cast alloy), cover, breather, output flanges. On the X, integrated into the rear drive unit.
- **Physics:** the **LSD/torque-vectoring model** — locking factor 0–100% (data), varied by throttle/steer/slip to rotate the car or stabilize it. Ring-gear ratio folded into the final drive (3.15 H / 9.0 X reduction).
- **Moving parts:** output flanges spin; internals only in cutaway/tech mode.
- **Rendering notes:** the rear diff/e-axle casing is a hero underbody centerpiece; give it cooling fins, a fill/drain plug, and the orange HV connector (X).

> **Real-time:** differential = one cast-alloy mesh (merged with the drive unit); LSD locking is a scalar in the handling model, no geometry. Mobile: merged into the rear-axle prop; torque vectoring is invisible logic.

---

### 7.10 Suspension Rig — Animation & Physics Integration Notes (for tech artists / vehicle programmers)

- **Rig hierarchy per corner (recommended):** `Chassis → Subframe(static) → [ControlArm(s) rotate] → Knuckle(steer+travel result) → Hub(spin) → Wheel`. The **damper/air-spring** and **ARB/drop-links** are constrained (look-at / driven) to the arm + chassis. Half-shaft parents diff↔hub with a stretch.
- **Drivers to expose to the physics engine:** per-corner **suspension displacement** (m), **steer angle** (rad, front), **wheel spin** (rad/s), **ride-height offset** (m), **damper mode** (enum), **ARB stiffness** (if active). These fully define the visible rig.
- **Suspension model values recap:**

  | | Front | Rear |
  |---|---|---|
  | Wheel rate (Comfort) | 28 N/mm | 32 N/mm |
  | Wheel rate (Sport) | 40 N/mm | 46 N/mm |
  | Damper bump (Sport) | 4.5 N·s/mm | ~4.5 (×MR 0.70) |
  | Travel (jounce/rebound) | +90/−100 mm | +85/−100 mm |
  | Motion ratio | 0.78 | 0.62 |
  | Static camber / toe | −0.8° / +0.1° | −1.4° / +0.2° |
  | Anti-dive / anti-squat | ~50% | ~35% |
  | ARB Ø | 26 mm | 22 mm |
- **Sprung/unsprung split:** unsprung mass per corner ≈ 48 kg front / 55 kg rear (wheel, tire, brake, knuckle, half of arms/shaft). Feeds ride quality + tire-load fidelity.
- **Bump-stop engagement:** progressive contact in the last ~20 mm of jounce; add a stiffening spline + a squash + a "thud" SFX + a subtle camera shake.

> **Real-time (whole 7.10):** the same rig drives all LODs — only mesh density drops. On mobile, collapse arms to a **2-bone stretch per corner** (upper pivot + wheel carrier), keep the wheel spin + vertical travel + steer, and drive body squat/dive/roll from the physics; omit ARB, drop-links, shafts, and sensor linkages. The **stance/ride-height animation is kept at every LOD** because it is a signature, low-cost visual.

---

**End of Section 7.**
## 8. Engine Bay

**Vehicle designation:** *Aurelian GT-e* (internal codename "the Vehicle") — a fictional latest-generation luxury performance flagship sedan. This section documents the powertrain compartment forward of the firewall for **two drivetrain variants** sharing one body-in-white:

- **HY variant** — longitudinally-mounted twin-turbocharged 3.0L inline-six petrol engine + 48V mild-hybrid integrated starter-generator + one rear e-motor (P4). "Engine bay" in the literal combustion sense.
- **EV variant** — dual permanent-magnet motors (front + rear), no combustion engine. The "engine bay" becomes a **front motor + power-electronics + frunk** compartment.

Because a game team must build both, this section is authored **HY-first** (the maximal-parts case) and flags every component with an **EV delta** where the two diverge. Every component carries a **Visibility class** so artists know what to model to hero fidelity versus what is pure lore for the physics/audio programmers.

### 8.0 Visibility & authoring conventions

Every component below is tagged with one of these visibility classes. This is the single most important budgeting decision in the whole section — most of an engine bay is never seen.

| Class | Meaning | Typical treatment |
|---|---|---|
| **V0 — Hero visible** | Seen any time the hood is open in a beauty/photo/garage context. Full LOD0 geometry + unique PBR. | Model + bake + unique material |
| **V1 — Glimpse visible** | Visible through grille slats, under-car camera, wheel-well gaps, or a cracked hood in gameplay. Read at distance only. | Low-poly proxy, shared atlas material |
| **V2 — Lore/functional** | Never rendered. Exists so physics, damage, sound, and telemetry systems have something to reference. | No mesh; data-only node or collision-only box |
| **V3 — Damage-reveal** | Hidden until a collision/deformation exposes it (crumpled hood, torn bumper). | Modeled but culled until damage state ≥ threshold |

**Coordinate & orientation convention (shared with the rest of the spec):** +X = vehicle right, +Y = up, +Z = rearward (toward cabin). Origin at the center of the front axle at ground level. "Longitudinal" = Z axis; the crankshaft of the HY engine runs along Z.

**Bay envelope (both variants):**

| Dimension | Value | Notes |
|---|---|---|
| Bay opening length (bulkhead → radiator support) | ~1,180 mm | usable packaging length |
| Bay width (inner fender to inner fender) | ~1,240 mm at top, ~980 mm at floor | tapers with strut towers |
| Bay depth (hood underside → subframe top) | ~620 mm | HY; ~480 mm usable in EV (frunk floor raised) |
| Strut-tower spacing (center to center) | ~1,080 mm | shock-tower brace anchors |
| Hood underside → highest component clearance | 35–60 mm | intake/engine-cover crown |

> **Real-time:** For the WebGL/phone build the entire bay is **one hood-open reveal prop**, not a live scene. Ship a **single baked mesh** (~8–15k tris) with one 2K albedo/ORM atlas that reads as "a dense modern engine bay" plus 3–4 individually-animated hero parts (cooling fan, hood struts, oil-cap interaction, e-motor cover pulse). Everything tagged V1/V2/V3 collapses into that baked shell or is omitted. Do not ship separate meshes for hoses, clamps, or the wiring harness on mobile.

---

### 8.1 Powertrain core — the engine (HY variant)

#### 8.1.1 Engine block / crankcase assembly

- **Purpose/role:** Structural core of the combustion powertrain; houses the six cylinders, crankshaft, and coolant/oil galleries. Also a stressed engine-mount anchor.
- **Config:** Fictional **"T6" 3.0L inline-six**, twin-turbo, aluminium-silicon open-deck block with cast-iron cylinder liners, dry-sump-capable but wet-sump as fitted. Undersquare-ish: bore ~84 mm, stroke ~90 mm, ~2,998 cc.
- **Geometry & dimensions:**

| Part | Approx. dimension |
|---|---|
| Block length (along Z) | 620 mm |
| Block width | 300 mm (bare), ~520 mm across accessory faces |
| Block height (sump base → deck) | 430 mm |
| Overall dressed engine (with intake/turbos/manifolds) | ~740 L × 640 W × 700 H mm |
| Dry engine mass (lore/physics) | ~185 kg |

- **Sub-parts:** crankcase, main-bearing ladder/girdle, cylinder liners ×6, oil pan/sump, windage tray, crank position sensor boss, block-mounted oil-cooler take-off, coolant jacket core plugs (freeze plugs) ×5.
- **Materials (V1 — mostly hidden under cover, block flanks glimpsed low in bay):**

| Surface | Albedo (sRGB) | Metallic | Roughness | Notes |
|---|---|---|---|---|
| Raw cast aluminium | #9A9C9E | 1.0 | 0.62 | fine sand-cast micro-normal, subtle porosity |
| Machined mating faces | #C4C6C8 | 1.0 | 0.28 | anisotropic tooling normal |
| Oil-film sheen (lower block) | +0.03 clearcoat | — | 0.35 | thin grime/oil overlay in dirt state |

- **Moving parts:** None externally animated. Internal crank/piston motion is **not modeled** — represented by the audio system and a subtle whole-engine idle shake (see 8.1.9).
- **Physics/mechanical:** Provides the inertial mass and center-of-mass node the vehicle rigid-body reads for weight distribution (~52/48 F/R HY). The rev/torque model lives in the powertrain sim, not geometry.
- **Gameplay:** Damage target for front-impact deformation (engine pushed toward firewall on hard frontal). Coolant/oil leak spawn points parented here.

> **Real-time:** Block is fully occluded by the engine cover; ship as a **collision box + material-less proxy** only. Never rendered on mobile.

#### 8.1.2 Cylinder head

- **Purpose/role:** Seals the cylinders; houses valvetrain, intake/exhaust ports, spark plugs, cam carriers, and variable valve timing units.
- **Geometry:** DOHC, 4 valves/cylinder (24 total), ~90 mm tall casting spanning the block deck, ~600 mm long × 180 mm wide. Integrated exhaust manifold on the head casting (log-style, feeds the hot-vee turbos — see 8.1.4).
- **Sub-parts:** intake camshaft, exhaust camshaft, cam caps ×14, hydraulic lash adjusters, valve springs, VVT phasers ×2 (front-mounted, sprocket-driven), coil-on-plug bosses ×6, coolant crossover, head-bolt towers.
- **Materials (V2 — under valve cover):** cast aluminium as block; cam journals machined bright. Data-only unless a damage-reveal cracks the cover.
- **Moving parts (lore/audio-linked):** camshafts rotate at ½ crank speed; valves reciprocate. **Not visually animated.** VVT phase angle is a telemetry value the sound system reads to shade high-cam/low-cam timbre.
- **Physics:** Defines the rev limiter behavior conceptually (valve float ceiling ~7,200 rpm) — actual limit enforced numerically in the powertrain module.

#### 8.1.3 Valve (cam) cover

- **Purpose/role:** Seals the top of the head, contains oil splash, mounts the oil filler and PCV. First thing seen under the decorative cover if that is removed.
- **Geometry:** Cast magnesium-alloy or composite cover, ~600 × 190 × 70 mm, ribbed crown, integrated oil-separator labyrinth on underside.
- **Sub-parts:** oil filler neck boss (see 8.9.1), PCV valve port, coil-pack access windows, cast maker-neutral rib pattern (NO real logo — use an abstract chevron/knurl motif for the emblem cast-in).
- **Materials (V1 if decorative cover removed; otherwise V2):**

| Surface | Albedo | Metallic | Roughness |
|---|---|---|---|
| Wrinkle-black composite cover | #1C1E20 | 0.0 | 0.72 |
| Cast-in rib highlights (wear) | #2A2C2E | 0.1 | 0.55 |
| Aluminium alt-finish (variant trim) | #8E9092 | 1.0 | 0.5 |

- **Moving parts:** none. **Damage-reveal (V3):** can crack to expose cam covers in a severe frontal.

#### 8.1.4 Decorative engine cover ("beauty cover")

- **Purpose/role:** The **hero V0 top surface** — the styled plastic shroud everyone sees when the hood opens. Hides the ugly reality, carries brand identity (fictional maker emblem), and channels intake air acoustically.
- **Geometry:** Injection-molded shell ~700 × 500 × 90 mm, sculpted to echo the exterior design language: sharp longitudinal creases, a raised center spine, soft-touch top pad. Mounts on 4 rubber grommet ball-studs (push-fit).
- **Sub-parts:** main shroud, soft-touch insert pad, cast maker emblem (fictional — an abstract interlocked-A monogram, NEVER a real logo), model-designation script "GT-e" or "T6", acoustic foam underside, integrated intake snorkel.
- **Materials (V0 — model to hero fidelity):**

| Surface | Albedo | Metallic | Roughness | Clearcoat | Notes |
|---|---|---|---|---|---|
| Soft-touch matte pad | #17181A | 0.0 | 0.85 | 0 | micro-suede normal, faint dust in dirt state |
| Gloss accent spine | #0C0D0E | 0.0 | 0.15 | 0.6 | fingerprints/dust map |
| Emblem — brushed metal | #B9BCC0 | 1.0 | 0.30 | 0 | anisotropic radial brush normal |
| Emblem — enamel inlay | #C0122F | 0.0 | 0.25 | 0.5 | maker accent color |
| Script "GT-e" chrome | #E8EAEE | 1.0 | 0.08 | 0.4 | mirror clearcoat |

- **Moving parts:** none in gameplay. Optional garage interaction: **lift-off animation** (4 grommets release, cover tilts +12° and lifts +80 mm along +Y) to reveal 8.1.3.
- **Gameplay:** Primary interaction surface for a "pop the hood" inspect camera; hover highlight target; upgrade/livery swap slot (carbon-weave variant cover as a cosmetic).

> **Real-time:** This is the **one part that must survive to mobile**. Ship at ~2–4k tris with a dedicated 1K albedo/ORM/normal set. Emblem baked into the atlas as a decal, not separate geometry.

#### 8.1.5 EV delta — front drive unit (replaces 8.1.1–8.1.4)

- **Purpose/role:** In the EV variant the combustion core is replaced by a **compact front e-drive unit** (motor + reduction gearbox + inverter stack), plus the volume liberated becomes a sealed **frunk** (front trunk).
- **Geometry:** Cylindrical-ish cast housing ~430 L × 400 W × 340 H mm sitting low over the front subframe; ribbed cooling jacket; orange HV cabling.
- **Sub-parts:** motor housing, gearbox bell, silver/orange inverter box on top, HV interlock connector, coolant ports.
- **Materials (V0 — this is the EV "engine cover" equivalent):** cast-aluminium ribbed housing #9DA0A3 metallic 1.0 rough 0.5; a molded composite acoustic shroud #16171A rough 0.8 with the same emblem treatment as 8.1.4; **HV orange cabling** #E4571E rough 0.45 metallic 0 (mandatory visual language = "high voltage, do not touch").
- **Moving/emissive:** subtle **emissive pulse** on the inverter status LED (cyan #35E0FF, 0.5–2 Hz breathing when "ignition on"); faint heat-haze post effect over the housing when recently driven.
- **Frunk:** carpeted/EPP-lined box ~55 L, lid = the hood underside. V0 if the frunk-open interaction exists; otherwise V2.

> **Real-time:** EV cover + orange cabling is the hero prop; the frunk cavity is a simple carpeted box only rendered when opened.

---

### 8.2 Intake system

#### 8.2.1 Airbox / air filter housing

- **Purpose/role:** Houses the engine air filter, draws cold air from the front intake ducts, silences intake roar.
- **Geometry:** Two-piece clamshell polymer box ~320 × 220 × 180 mm, front-corner of bay (driver side), fed by a duct from behind the grille/headlamp.
- **Sub-parts:** lower housing (filter tray), upper lid (with MAF sensor boss), pleated panel air filter (paper media, ~250 × 180 mm, white/cream folds), spring clips ×4 or over-center latches, intake snorkel, unfiltered-side resonator.
- **Materials (V1):**

| Surface | Albedo | Metallic | Roughness |
|---|---|---|---|
| Black textured PA6-GF box | #202224 | 0.0 | 0.78 |
| Filter media (pleated paper) | #E8E2D0 | 0.0 | 0.9 |
| Filter rubber gasket | #17181A | 0.0 | 0.6 |

- **Moving parts:** lid opens (over-center clips, hinge along rear edge, ~40° swing) for a filter-service interaction/upgrade slot. Filter media pull-out along +Y.
- **Gameplay:** performance-intake upgrade slot (open-element cone filter cosmetic + a small intake-sound EQ change flag). Dirty-filter state = a subtle grime overlay tied to service/odometer.

#### 8.2.2 Mass airflow / intake tract plumbing

- **Purpose/role:** Carries filtered air from airbox → turbo compressor inlets; measures airflow (MAF/MAP) for the fuel model.
- **Geometry:** Ribbed silicone/PA hoses ~60–75 mm dia, molded elbows, one accordion flex section; clamped with worm-gear or T-bolt clamps.
- **Sub-parts:** MAF sensor, intake air temp sensor, PCV breather tee, turbo inlet couplers.
- **Materials (V1):** matte black EPDM #1A1B1D rough 0.7; clamps bright stainless #C8CACC metallic 1.0 rough 0.3.
- **Moving parts:** none; flex section wobbles subtly with idle shake (vertex-baked, LOD0 only).

> **Real-time:** All intake plumbing collapses into the baked bay shell; MAF is V2 data only.

#### 8.2.3 Intake manifold + throttle body

- **Purpose/role:** Distributes charge air to the six intake runners; the throttle body meters air (drive-by-wire).
- **Geometry:** Composite or cast-aluminium plenum ~500 × 200 × 150 mm with six curved runners; electronic throttle body ~70 mm bore at the plenum inlet, servo-actuated butterfly.
- **Sub-parts:** plenum, runners ×6, throttle body + throttle position servo, manifold pressure sensor, tumble/charge-motion flaps (optional), fuel-rail mounting bosses.
- **Materials (V1/V2):** composite plenum satin black #232527 rough 0.65; cast-alu variant #9EA1A4 metallic 1.0 rough 0.5; throttle body machined alu bright.
- **Moving parts (functional lore):** throttle butterfly rotates 0–~85° driven by the **throttle input**; this IS a live telemetry value the audio/turbo model reads (spool, blow-off). Not necessarily rendered, but the throttle plate can be a hero micro-animation in an "engine detail" camera.
- **Physics:** Throttle position → intake mass flow → torque map. Central to the drive model.

#### 8.2.4 Turbochargers ×2 (hot-vee)

- **Purpose/role:** Forced induction — two small twin-scroll turbos nestled in the "hot vee" (between the cylinder banks conceptually; on an I6 they sit along the exhaust side / integrated exhaust head). Provide boost, spool character, and the signature whoosh/flutter.
- **Geometry:** Each turbo ~150 mm dia turbine housing (cast iron/steel, heat-blued), ~120 mm compressor housing (cast alu), center bearing housing, integrated electronic wastegate actuator, twin-scroll divided inlet.
- **Sub-parts:** turbine housing (hot side), compressor housing (cold side), center cartridge, oil feed/drain lines, coolant lines, electronic wastegate + actuator arm, heat shield (stamped stainless, straw-gold tint), recirculation/diverter valve.
- **Materials (V1 — glimpsed low, hot side has hero heat-tint):**

| Surface | Albedo | Metallic | Roughness | Notes |
|---|---|---|---|---|
| Turbine housing (heat-blued cast iron) | #4A4438 base + iridescent | 1.0 | 0.55 | temperature-gradient tint map (straw→blue→purple), strongest near turbine |
| Compressor housing (cast alu) | #A6A8AA | 1.0 | 0.5 | |
| Stainless heat shield | #B0AC9E | 1.0 | 0.4 | straw-gold anisotropic, dimpled normal |
| Oil/coolant lines (braided) | #6E7276 | 0.9 | 0.45 | braided-steel normal |

- **Moving parts (functional):** wastegate actuator arm strokes ~8 mm with boost demand; **turbine/compressor wheels spin** — represented in audio (spool whine that tracks a `boostRpm` value) and optionally a blurred spinning-wheel micro-anim in a detail cam. Diverter valve pops on lift-off → **audible chirp/flutter**.
- **Physics/audio:** Boost pressure model → torque bonus + turbo lag curve; wastegate duty and diverter events are first-class audio triggers. **Emissive:** hot side can glow dull-red (#7A1E12 emissive, intensity tied to a `turboHeat` value) after sustained load — a great night/tunnel detail.
- **Gameplay:** boost gauge feed; overboost/anti-lag as a tuning/upgrade flag; heat glow as a "pushing hard" feedback cue.

> **Real-time:** Turbos are V1 — baked into the shell with the heat-tint painted in. Keep the **dull-red emissive glow** as a cheap material param on mobile (it's a strong "performance car" read); drop the spinning-wheel and wastegate animation.

#### 8.2.5 Intercooler(s) + charge piping

- **Purpose/role:** Cools compressed charge air before the intake (denser charge = more power). Air-to-liquid (front chargecooler) on this car for compact packaging.
- **Geometry:** Bar-and-plate core ~400 × 150 × 90 mm mounted low front, plus its own low-temp coolant loop and pump; hard charge pipes ~55 mm dia link turbos → intercooler → throttle body.
- **Sub-parts:** core, end tanks, coolant ports, charge pipes (cast alu or silicone), couplers/clamps, charge-air temp sensor.
- **Materials (V1):** bar-and-plate core #7C8084 metallic 1.0 rough 0.55 with a **fin normal/parallax** (tight vertical louvers); end tanks cast alu; silicone couplers matte black or a maker-accent color (a red coupler is a nice performance tell).
- **Moving parts:** none. Damage: front core is a **front-impact deform + coolant leak** target.

> **Real-time:** Fin detail = normal map on a flat quad; no real geometry. V1.

---

### 8.3 Cooling system

#### 8.3.1 Main radiator + condenser stack

- **Purpose/role:** Rejects engine coolant heat (and, stacked ahead of it, the A/C condenser and the low-temp intercooler radiator). Front-most large surface in the bay.
- **Geometry:** Aluminium/plastic-tank crossflow radiator ~680 × 480 × 32 mm, vertical behind the grille; A/C condenser ~660 × 460 × 18 mm ahead of it; thin low-temp rad ahead of that. Sits on the radiator support (core support) — a stamped/cast structural crossmember.
- **Sub-parts:** core, plastic end tanks (or full-alu), inlet/outlet necks, drain petcock, transmission/oil cooler lines (if fitted), mounting isolators.
- **Materials (V1 — visible through grille = actual gameplay glimpse):**

| Surface | Albedo | Metallic | Roughness | Notes |
|---|---|---|---|---|
| Radiator fin block | #2E3032 | 0.9 | 0.6 | very fine horizontal fin normal; reads black at distance |
| Plastic end tanks | #17181A | 0.0 | 0.7 | |
| Condenser (ahead) | #3A3C3E | 0.9 | 0.55 | slightly bluer |

- **Moving parts:** none. **Damage:** front-collision deform + steam/coolant plume VFX spawn; overheating gameplay state if punctured.
- **Gameplay:** Visible through the front grille — so its material quality affects the **front-3/4 hero read** of the car even with the hood shut. Temperature gauge source.

> **Real-time:** The grille-visible face IS worth keeping on mobile as a dark finned plane behind the grille mesh — cheap, high payoff for the front look.

#### 8.3.2 Cooling fan(s) + shroud

- **Purpose/role:** Pull air through the radiator stack at low speed/idle; electric, variable-speed.
- **Geometry:** One or two ~380 mm dia axial fans in a molded shroud on the engine side of the radiator; 7–9 curved blades each.
- **Sub-parts:** fan blades, hub, shroud, brushless motor, motor controller, wiring pigtail.
- **Materials (V1):** matte black glass-filled nylon #1A1B1D rough 0.75; hub slightly glossier.
- **Moving parts (HERO ANIMATION):** **fan rotation** about Z (the barrel axis), driver = a `coolantTemp`/`acLoad` value. Idle spin ~800–1,200 rpm ramping to ~2,500 rpm. This is one of the **few genuinely animated bay parts** and a great "the car is alive" cue on a hot idle or after shutdown (fan can run post-shutdown). Add motion-blur/ghost blade at speed.
- **Physics/audio:** Fan whir layered into idle audio, ramps with temp. Startup/spool has a distinct audible ramp.
- **Gameplay:** running fan = engine hot; a stalled/damaged fan → overheat state.

> **Real-time:** **Keep the spinning fan on mobile** — it's the single best low-cost "living engine" cue when the hood is open. One rotating mesh + a blurred alpha disc at high rpm.

#### 8.3.3 Coolant expansion reservoir

- **Purpose/role:** Accommodates coolant expansion, bleed point, fill point, level sensor.
- **Geometry:** Translucent polypropylene tank ~200 × 130 × 160 mm mounted high on an inner fender; pressure cap on top; MIN/MAX molded lines.
- **Sub-parts:** tank body, pressure cap (maker-neutral), level sensor, overflow hose, mounting bracket.
- **Materials (V0/V1 — a signature "glossy translucent" hero detail):**

| Surface | Albedo | Metallic | Roughness | Transmission | Notes |
|---|---|---|---|---|---|
| Translucent tank wall | #C9D6C4 | 0.0 | 0.25 | 0.85 | thin-wall; coolant visible inside |
| Coolant fluid (fictional) | #E24BA0 (magenta-pink) OR #6FE04A (green) | 0.0 | 0.1 | 0.4 | pick maker-accent coolant; strong color read |
| Pressure cap | #0E0F10 | 0.2 | 0.5 | 0 | knurled grip normal |
| Warning label decal | white/red | — | 0.7 | — | "do not open when hot" pictogram, no brand |

- **Moving parts:** cap unscrews (interaction/service). Fluid level can drop as a leak/damage visual.
- **Gameplay:** Fluid color is a distinctive brand cue; low-coolant = overheat risk flag. **Emissive-adjacent:** a faint SSS/translucency read makes this pop under the hood light.

> **Real-time:** Worth keeping as a small translucent hero prop if any hood-open beauty shot exists — cheap and reads as "premium detail." Fluid = a colored interior shell, no real sim.

#### 8.3.4 Coolant hoses & thermostat housing

- **Purpose/role:** Route coolant block↔radiator↔heater core; thermostat regulates flow to warm up fast.
- **Geometry:** EPDM molded hoses 25–40 mm dia with characteristic bends; spring/worm clamps; cast-alu or composite thermostat housing with integrated temp sensor.
- **Materials (V1):** matte black EPDM #18191B rough 0.72; some hoses in maker-accent color as a performance tell; clamps stainless.
- **Moving parts:** none. Damage: burst-hose steam VFX spawn points.

---

### 8.4 Lubrication & fluids (fillers, dipstick, reservoirs)

#### 8.4.1 Oil filler cap + neck

- **Purpose/role:** Engine oil fill point on the valve cover — a **primary hood-open interaction** (dipstick-check / oil-top-up service loop).
- **Geometry:** Threaded/bayonet cap ~70 mm dia, knurled grip, on a raised neck; oil-symbol icon molded/printed on top.
- **Materials (V0 — interactive hero):** black polymer #1B1C1E rough 0.55 with knurl normal; embossed oil-can pictogram (maker-neutral); slight oil-sheen in dirt state.
- **Moving parts:** **cap rotate + lift** interaction (quarter-turn bayonet, then lift +Y ~40 mm). Reveals filler neck bore (dark cavity, oil-slick interior shader).
- **Gameplay:** service/inspection minigame anchor; hover highlight; oil-level tie-in.

#### 8.4.2 Dipstick

- **Purpose/role:** Manual oil-level check.
- **Geometry:** Bright loop/ring handle (often a maker-accent color) on a ~350 mm flexible blade in a tube; MIN/MAX marks + crosshatch near the tip.
- **Materials (V0 — small hero):** handle bright yellow #F2C21E or maker-accent, rough 0.4; blade bright steel #C6C8CA metallic 1.0 rough 0.25 with an **oil-film gradient** near the tip that reads the "level."
- **Moving parts:** **pull-out animation** (blade slides +Y out of tube ~350 mm, slight arc). Oil-line height on the blade = an oil-level telemetry value.
- **Gameplay:** the readable oil level is the payoff of the check-oil interaction.

> **Real-time (8.4.1–8.4.2):** Keep oil cap as the interactive prop if a service loop exists; dipstick optional. Both omitted entirely if no hood-service gameplay — then they're V2.

#### 8.4.3 Oil filter & oil pan (lore)

- **Purpose/role:** Filter oil / hold sump volume. **V2** — under the car, essentially never seen except a wrench-under-car service cam.
- **Geometry:** spin-on canister ~90 mm dia × 110 mm or a cartridge cap on top of the block; sump ~6.5 L.
- **Materials:** canister satin blue/black #23405C or #1A1B1D metallic 0.3 rough 0.5.
- **Gameplay:** oil-change service node; leak origin. Data-only unless a service cam exists.

#### 8.4.4 Brake fluid reservoir

- **Purpose/role:** Feeds the master cylinder; DOT4/5.1. Mounted on the master cylinder against the firewall.
- **Geometry:** Translucent tank ~120 × 80 × 90 mm, MIN/MAX lines, cap with level float + warning switch.
- **Materials (V1):** translucent off-white #DCE0DE transmission 0.8 rough 0.3; brake fluid pale amber #C9A24B inside; black cap; hazard label decal.
- **Moving parts:** cap on/off (service). Level drop = brake-system damage cue.

#### 8.4.5 Windshield washer reservoir + filler

- **Purpose/role:** Stores washer fluid; electric pump feeds jets. Often the largest fluid tank, tucked in a fender corner with just the filler neck + cap visible.
- **Geometry:** ~4–5 L bottle mostly hidden; visible = a filler neck with a **bright cap** (usually blue, windshield-spray pictogram) ~50 mm.
- **Materials (V0 small — the cap is the only visible bit):** cap bright blue #1E7FE0 rough 0.45, spray pictogram; neck black.
- **Moving parts:** cap flip/lift; a hero close-up could show fluid pour. Pump is V2 audio-only (a faint whir when washers fire).

---

### 8.5 Electrical & control

#### 8.5.1 12V auxiliary battery

- **Purpose/role:** Powers 12V accessories, control modules, and (HY) the conventional starter path; buffered by the 48V/HV system. Often relocated to the trunk on premium cars — but a **bay-mounted** unit reads better for the "engine bay" fantasy, so place a 12V AGM battery in the bay corner.
- **Geometry:** AGM box ~260 × 175 × 190 mm; terminals (+/−) on top with a red +terminal cover; hold-down clamp; vent tube.
- **Sub-parts:** case, terminals, +terminal red boot, hold-down bracket, ground strap, sensor (IBS) on the − terminal.
- **Materials (V1):**

| Surface | Albedo | Metallic | Roughness |
|---|---|---|---|
| Battery case (black poly) | #202224 | 0.0 | 0.7 |
| Top label decal | dark + maker-neutral text | 0.0 | 0.75 |
| +terminal red boot | #B4121F | 0.0 | 0.55 |
| Lead terminals + clamps | #8A8C8E | 1.0 | 0.4 |
| Corrosion (aged state) | #6FA0B8 powder | 0.0 | 0.9 | optional wear |

- **Moving parts:** none. Terminal-disconnect could be a service interaction. **Damage:** dead-battery = no-start state (lore/gameplay).

#### 8.5.2 48V / HV battery interface (HY) — lore

- **Purpose/role:** The 48V mild-hybrid pack (small, under-floor/trunk) and its DC-DC converter feed the belt-integrated starter-generator. In the EV variant, the **HV traction battery** (skateboard floor) lives outside the bay but its HV junction/PDU may sit in the bay.
- **Geometry (bay-relevant part):** an **orange-cabled HV junction box / PDU** ~300 × 200 × 120 mm on the inner fender (EV) or a smaller 48V DC-DC box (HY).
- **Materials (V1 — orange HV language):** grey cast/steel box #7E8286; **orange HV harness** #E4571E rough 0.45; HV warning triangle decals; interlock connector.
- **Moving/emissive:** status LED; faint contactor "clunk" audio on ignition on/off. **Gameplay:** the orange = "don't touch, high voltage" visual grammar; a great authenticity cue for the EV.

#### 8.5.3 Fuse & relay box(es)

- **Purpose/role:** Distributes/protects 12V circuits; the bay unit handles high-current engine/lighting circuits.
- **Geometry:** Sealed black box ~250 × 180 × 90 mm with a snap-off lid; interior = colored blade fuses + relay cubes.
- **Sub-parts:** housing, lid (with fuse map printed inside), blade fuses (color-coded), maxi-fuses, relays, bus bars.
- **Materials (V1; interior V2):** box #1B1C1E rough 0.72; lid slightly glossier; fuses only modeled if the lid opens (then a tiny colorful V1 detail).
- **Moving parts:** lid unclips/lifts (rear-edge hinge ~50°). Mostly a set-dressing detail.

#### 8.5.4 ECU / control modules

- **Purpose/role:** Engine control unit (HY) / vehicle control + inverter logic (EV); the brain of the powertrain. Physically a sealed alloy box, usually tucked against the firewall or in a plenum-cowl box — largely hidden.
- **Geometry:** Finned/flat alloy box ~180 × 130 × 45 mm with a big weatherproof multi-pin connector.
- **Materials (V2, occasionally V1):** brushed/anodized alu #9A9DA0 metallic 1.0 rough 0.4; black connector; maker-neutral label (no real part numbers/brands — use fictional codes).
- **Moving parts:** none. **This is the physics/AI heart of the car but visually a plain box.** Its data (rpm, boost, throttle, gear, temps) is what every other system reads.

#### 8.5.5 Wiring harness(es) & connectors

- **Purpose/role:** The nervous system — bundles routing power/signal everywhere. Adds the crucial "dense/complex" read to a real engine bay.
- **Geometry:** Bundled looms 8–30 mm dia, taped/convoluted-tube wrapped, fanning out to connectors; grounded to body studs; HV looms (orange) run separately.
- **Materials (V1 — important for bay density):**

| Surface | Albedo | Metallic | Roughness |
|---|---|---|---|
| Convoluted tube (ribbed) | #141517 | 0.0 | 0.68 |
| Harness tape (cloth) | #1A1B1D | 0.0 | 0.82 |
| Connectors (colored) | grey/black/brown per circuit | 0.0 | 0.6 |
| HV loom (EV) | #E4571E | 0.0 | 0.45 |

- **Moving parts:** none. **Gameplay:** pure set dressing + a damage-reveal (torn harness sparks VFX in a severe crash).

> **Real-time:** The harness is the #1 thing to **bake, not model** — paint it into the shell's normal/albedo. Never ship as geometry on mobile; even on LOD0 use low-segment tube splines.

#### 8.5.6 Alternator / integrated starter-generator (ISG) + starter

- **Purpose/role (HY):** The **belt-driven ISG** (48V) both starts the engine (silent restarts) and generates — replaces the classic separate alternator + starter. A conventional 12V starter may still exist as backup (lore).
- **Geometry:** Cylindrical machine ~140 mm dia × 150 mm on the accessory face, ribbed alloy housing, pulley on the front, electrical studs.
- **Sub-parts:** stator housing, rotor, pulley, 48V connector, cooling fins, decoupler pulley.
- **Materials (V1):** cast/finned alu #979A9D metallic 1.0 rough 0.5; pulley bright steel; connector black/orange.
- **Moving parts (functional):** the **pulley rotates** with the belt (part of the accessory-drive spin, LOD0 micro-anim). ISG engagement = **silent auto start-stop** behavior + a subtle whir on regen (audio cue).
- **Gameplay:** start-stop and mild-hybrid boost/regen are drive-model + audio flags anchored here.

---

### 8.6 Accessory drive (belts & pulleys)

#### 8.6.1 Front-end accessory drive (FEAD)

- **Purpose/role:** A single serpentine belt (or, on a 48V-heavy car, a belt-ISG plus minimal accessories) drives water pump, A/C compressor, ISG.
- **Geometry:** Ribbed serpentine belt (6-rib, ~1,000–1,400 mm loop, ~22 mm wide) snaking over 4–6 pulleys on the engine's front face (−Z end). Automatic spring tensioner + idler pulleys.
- **Sub-parts:** serpentine belt, crank pulley/damper (harmonic balancer), water-pump pulley, A/C compressor + clutch pulley, ISG pulley, tensioner pulley + arm, idler pulley(s).
- **Materials (V1 — the belt/pulley face is a classic "engine" read):**

| Surface | Albedo | Metallic | Roughness | Notes |
|---|---|---|---|---|
| Serpentine belt (rubber, ribbed) | #16171A | 0.0 | 0.7 | rib normal on inner face; slight sheen when new |
| Crank damper (cast + elastomer ring) | #6E7175 | 1.0 | 0.5 | rubber ring #1A1B1D |
| Pulleys (stamped steel) | #8C8E90 | 1.0 | 0.42 | some black-oxide |
| Tensioner arm (cast alu) | #9A9C9E | 1.0 | 0.5 | |

- **Moving parts (HERO micro-anim):** **belt + pulleys rotate together** driven by engine rpm; the belt can be a scrolling-UV loop while pulleys spin on their axes (all about Z-ish axes on the front face). Tensioner arm has tiny reactive travel. Great detail-cam candidate.
- **Physics/audio:** belt-drive whir/whine layered subtly; a worn belt = a squeal cue (lore). A/C clutch engagement = a faint clunk + idle-load dip.

> **Real-time:** On mobile the belt run is baked static; optionally a single scrolling-UV belt strip + one spinning pulley if the detail cam exists. Otherwise V2.

---

### 8.7 Braking & steering hardware (bay side)

#### 8.7.1 Brake booster + master cylinder

- **Purpose/role:** Amplifies pedal force (vacuum or electro-hydraulic brake actuator on this hybrid/EV — likely a **brake-by-wire iBooster-style unit**) and pressurizes the hydraulic circuit. Firewall-mounted, driver side, pedal box behind it.
- **Geometry:** Large cylindrical booster ~230 mm dia × 150 mm (if vacuum) OR a compact electro-hydraulic actuator box ~200 × 150 × 150 mm (by-wire); master cylinder ~50 mm dia bore ahead of it with the brake-fluid reservoir (8.4.4) on top.
- **Sub-parts:** booster/actuator, master cylinder, pushrod, reservoir, brake lines (steel, flared), pressure sensor, ESP/ABS feed lines.
- **Materials (V1):** booster shell black/zinc #6E7276 metallic 0.8 rough 0.45; master cylinder cast alu bright; brake lines bright zinc #B8BABC metallic 1.0 rough 0.3 with characteristic bends.
- **Moving parts:** pushrod strokes with **brake input** (lore; drives the brake model). By-wire actuator has a faint motor whir on brake apply (audio cue).
- **Physics:** central to the brake force model; pedal input → line pressure → per-wheel torque.

#### 8.7.2 ABS / ESP hydraulic modulator

- **Purpose/role:** Modulates per-wheel brake pressure for ABS/traction/stability control. Compact valve block + pump + module.
- **Geometry:** Machined alu valve block ~150 × 90 × 80 mm with 6+ brake-line ports (a distinctive "hydraulic hedgehog" of bent steel lines) + an electric pump motor + bolt-on ECU.
- **Materials (V1):** machined alu block #B4B6B8 metallic 1.0 rough 0.35; black pump motor + module; a fan of bright brake lines.
- **Moving parts:** none visible; ABS actuation = a **buzz/growl audio cue + pedal feedback** during hard braking. Physics: ABS logic lives in the drive model; this is its physical avatar.

#### 8.7.3 Steering rack + electric power steering (EPS)

- **Purpose/role:** Converts steering-wheel rotation to road-wheel angle; EPS motor provides assist (no hydraulic pump on a modern flagship). Mounted on the front subframe, low in the bay/behind the engine.
- **Geometry:** Rack tube ~700 mm wide with tie-rods exiting each end; a **rack-mounted EPS motor + ECU** (belt-drive or dual-pinion) ~120 mm dia cylinder; rubber boots over the tie-rod ends; steering shaft/U-joint up to the firewall.
- **Sub-parts:** rack housing, pinion, rack bar, tie-rods ×2, tie-rod boots (accordion rubber), EPS motor, torque sensor, steering intermediate shaft + U-joints, mounting bushings.
- **Materials (V1/V2 — mostly low/hidden):** cast-alu housing #979A9D metallic 1.0 rough 0.5; rubber boots #17181A rough 0.75; EPS motor black/alu.
- **Moving parts (FUNCTIONAL — core to driving):** **rack translates laterally (±~140 mm along X)** with steering input; **tie-rods push/pull** the steering knuckles; boots compress/extend accordingly. This chain is real vehicle animation (drives wheel steer angle) even if the rack itself is rarely seen — the wheels/knuckles it drives ARE seen. Steering intermediate shaft rotates with the wheel.
- **Physics:** Steering input → rack position → Ackermann-corrected wheel angles → tire model. EPS assist curve = a feel parameter (light at parking speed, weighting up with speed); can be a tuning slider. **Audio:** faint EPS motor whine at full lock / low speed.

> **Real-time:** The rack is V2 (hidden), BUT the **tie-rod → knuckle → wheel steer** animation it drives is essential and lives in the suspension/wheel rig (see suspension section). On mobile, steer angle drives the wheel mesh directly; the rack itself is never modeled.

---

### 8.8 Mounts, structure & sensors

#### 8.8.1 Engine / motor mounts

- **Purpose/role:** Locate the engine (or e-drive) and isolate vibration; on a performance car, hydraulic/active mounts stiffen under load.
- **Geometry:** 2–3 mounts — left/right hydraulic mounts (cast-alu bracket + rubber/hydro element ~90 mm dia) + a rear/torque-arm ("dog bone") mount low down.
- **Sub-parts:** cast brackets, rubber/hydro isolator, through-bolts, active-mount solenoid (optional).
- **Materials (V1/V2):** cast alu brackets #949699 metallic 1.0 rough 0.5; rubber isolator #1A1B1D rough 0.7.
- **Moving parts (functional):** mounts flex — the **engine rocks slightly** on throttle blip / gear engagement (a subtle whole-engine rotation about the roll axis, driven by torque). This "engine torque rock" is a beloved detail-cam and hood-open cue. Active mount = firmer under sport mode.
- **Physics:** define the powertrain's vibration/rock; feed the idle-shake and launch-squat feel.

#### 8.8.2 Strut-tower brace & core support

- **Purpose/role:** Chassis stiffening across the strut towers (a visible performance/sporty detail) + the front structural crossmember carrying the radiator.
- **Geometry:** A **strut brace** bar/plate ~1,080 mm spanning the two towers (often the sportiest visible bay part — carbon or polished alu); the core support is stamped/hydroformed steel or cast alu at the bay front.
- **Materials (V0 if a strut brace is fitted — a hero visible sport detail):**

| Surface | Albedo | Metallic | Roughness | Clearcoat | Notes |
|---|---|---|---|---|---|
| Carbon-weave brace | #1A1B1D | 0.1 | 0.25 | 0.7 | 2×2 twill normal, clearcoat |
| Polished-alu brace | #C6C8CA | 1.0 | 0.18 | 0 | anisotropic |
| Maker-accent anodized | #C0122F | 0.9 | 0.3 | 0 | red/blue trim option |
| Strut-tower caps | #8C8E90 | 1.0 | 0.45 | 0 | domed nuts |

- **Moving parts:** none. **Gameplay:** cosmetic upgrade slot (carbon brace), visible sport signature when the hood opens.

#### 8.8.3 Sensors (aggregate)

- **Purpose/role:** The many small sensors feeding the ECU — mostly **V2 lore** but a few are visible bumps/connectors that add bay realism.
- **Representative list (data-only unless noted):** MAF, MAP/boost, intake-air temp, coolant temp, oil pressure/temp, crank position, cam position ×2, knock ×2, O2/lambda ×2–4 (in exhaust), brake pressure, steering torque/angle, wheel-speed ×4, ambient temp, HV interlock/current (EV), battery current sensor (IBS).
- **Materials (V1 for the visible few):** small black/grey plastic bodies #202224 rough 0.65 with 2–3-pin connectors and a pigtail into the harness.
- **Gameplay:** these are the **data taps** the HUD/telemetry and drive model read; artists model only the handful poking out of hoses/manifolds; the rest are pure nodes.

---

### 8.9 Firewall, hood underside & hinges (bay boundary)

#### 8.9.1 Firewall / bulkhead (bay rear, +Z)

- **Purpose/role:** Separates bay from cabin; carries booster, wiper motor, HVAC intake (cowl), grommets for the steering shaft and harness pass-throughs.
- **Geometry:** Stamped steel wall with a sound-deadening mat, cowl/plenum box at the base of the windshield (cabin-air intake + wiper linkage), grommets.
- **Materials (V1):** black sound mat #16171A rough 0.85 (fibrous/felt normal); bare stamped steel edges #7E8286 metallic 0.9 rough 0.5; rubber grommets.
- **Moving parts:** wiper linkage (in the cowl) — see exterior/wiper section; not a bay hero.

#### 8.9.2 Hood underside + insulation

- **Purpose/role:** The inner face of the hood you see whenever it's open — a legit V0 surface. Structural inner skin + heat/sound insulation blanket.
- **Geometry:** Stamped inner panel with ribbed reinforcements + a bonded insulation mat; hood latch striker at the front edge; a hood prop-rod boss or gas-strut mounts.
- **Materials (V0):**

| Surface | Albedo | Metallic | Roughness | Notes |
|---|---|---|---|---|
| Insulation blanket (molded fiber) | #2A2B2D | 0.0 | 0.9 | quilted/dimpled normal |
| Exposed inner-skin ribs (body color) | = exterior paint | per paint | per paint | if painted-inner premium look |
| Latch striker (zinc) | #B8BABC | 1.0 | 0.35 | |
| Maker info decal | white, maker-neutral | 0.0 | 0.75 | tire-pressure/no-brand placard |

- **Moving parts:** the hood itself (see below). Insulation is static.

#### 8.9.3 Hood hinges + struts/latch (the open/close animation)

- **Purpose/role:** The **hood-open interaction** — the gateway to the whole bay. This is the animation that matters most in this section.
- **Geometry:** Two four-bar or simple pivot hinges at the rear corners; **gas struts** (or a manual prop rod) hold it up; a two-stage latch + safety catch at the front.
- **Sub-parts:** hinge arms ×2, gas struts ×2 (~450 mm extended), latch mechanism, safety catch lever, release cable.
- **Materials (V1):** hinges black-oxide/zinc steel; gas struts glossy black cylinder #101112 rough 0.35 + bright piston rod #C6C8CA metallic 1.0 rough 0.2.
- **Moving parts (KEY ANIMATION):**
  - **Hood rotation** about the rear hinge axis (X axis), range **0° (shut) → ~62° open**, driven by an `hoodOpen` interaction/state. Two-stage: a small "pop" to the safety catch (~40 mm), then a lift.
  - **Gas struts extend** as the hood rises (piston rod slides out ~180 mm), tracking the hood angle — a constrained IK/driven relationship.
  - **Latch** rotates to release; safety-catch lever a manual nudge.
- **Physics/audio:** satisfying two-stage latch *thunk* + strut hiss on open, damped *clunk* on close. On a performance flagship, a **soft-close** or gentle self-lower is a nice premium touch.
- **Gameplay:** primary reveal for garage/photo/inspection modes; hover target; the whole bay's LOD0 content only needs to exist while `hoodOpen > 0`.

> **Real-time:** The hood + its animation is **mandatory on all platforms** (it's how the bay is revealed). Struts can be a simple 1-bone driven slide; latch detail can be faked with audio only. Everything the hood reveals streams in at open and unloads on close to protect the mobile budget.

---

### 8.10 EV-variant bay summary (net differences)

For the game team building the EV, replace/omit as follows (everything else — cooling, 12V battery, brake booster, ABS, EPS rack, mounts, firewall, hood — stays, though quieter):

| HY component | EV variant |
|---|---|
| I6 engine, head, valve/beauty cover (8.1.1–4) | **Front e-drive unit + inverter** (8.1.5) + carpeted **frunk** |
| Airbox / intake / turbos / intercooler / charge piping (8.2) | **Omitted** (no air path); reuse volume for frunk |
| Belt/pulley FEAD (8.6) | **Omitted** (electric A/C compressor + electric pumps instead) |
| Oil filler / dipstick / oil systems (8.4.1–3) | **Omitted**; only coolant/brake/washer reservoirs remain |
| ISG/alternator (8.5.6) | **Omitted** (motor is the generator); regen only |
| Engine mounts (8.8.1) | **Motor mounts** (softer; near-silent, minimal rock) |
| Radiator stack (8.3.1) | Retained but **thermal-management-heavy**: battery + inverter + motor loops, multiple coolant valves; often a busier low-temp cooling plate |
| Exhaust/lambda sensors | **Omitted**; add HV current/interlock + battery-thermal sensors |
| Engine sound sources | **Omitted**; replaced by inverter whine + regen + synthesized drive tone |

**EV visual grammar reminders:** orange HV cabling everywhere (8.5.2), cyan status LEDs/emissive, near-silent operation (only fan + coolant-valve clicks + inverter whine), and a clean molded acoustic shroud in place of the mechanical density of the HY bay. The EV bay reads **calmer and cleaner** — lean into that contrast.

---

### 8.11 Cross-discipline handoff checklist

- **3D / Blender artists:** Build **8.1.4 beauty cover, 8.3.2 fan, 8.3.3 reservoir, 8.4.1 oil cap, 8.8.2 strut brace, 8.9.2–3 hood underside/hinges** to V0 hero fidelity. Bake everything V1 (radiator face, turbos w/ heat tint, battery, belt/pulley face, harness) into a shared shell + atlas. Skip all V2.
- **Material artists:** Priority maps — heat-tint gradient (turbos), translucent coolant/brake fluids (SSS/transmission), HV-orange language (EV), carbon/polished brace options, oil-sheen dirt overlay, corrosion aged state (battery terminals). One shared "engine grime" mask drives all wear.
- **Animators / riggers:** Drive-linked rigs — **hood open (X, 0→62°) + gas struts**, **cooling fan spin (temp)**, **belt/pulley spin (rpm)**, **throttle plate (throttle)**, **oil cap + dipstick pulls (interaction)**, **engine torque-rock on mounts (torque)**, and the steering **rack→tie-rod** chain (feeds the wheel rig). Wastegate/turbo-wheel = LOD0 detail-cam only.
- **Physics / vehicle programmers:** Data-only nodes that matter — engine COM/mass (8.1.1), throttle body (8.2.3), turbo boost model (8.2.4), ECU as the value hub (8.5.4), brake master/ABS (8.7.1–2), EPS rack travel + assist curve (8.7.3), engine mounts for rock/idle-shake (8.8.1). Coolant/oil/brake/battery levels as gameplay states with leak spawn points.
- **Sound designers:** Anchor cues — turbo spool/flutter + wastegate (8.2.4), cooling-fan whir ramp + post-shutdown run-on (8.3.2), belt/accessory whir + A/C clutch clunk (8.6.1), ISG silent restart + regen whir (8.5.6), by-wire brake motor + ABS growl (8.7.1–2), EPS whine at lock (8.7.3), latch thunk + strut hiss (8.9.3). EV: swap all combustion cues for inverter whine, contactor clunk, coolant-valve clicks, synthesized tone.

*End of Section 8 — Engine Bay.*
## 9. Interior — Cockpit & Dashboard

> **Scope of this section.** This document specifies the driver-facing interior of *the Vehicle* — a fictional, unbadged latest-generation luxury performance sedan, offered as a twin-turbo hybrid (V6-PHEV) and a full-EV variant. It covers everything from the base of the windscreen back to the front-seat H-point, spanning the full width of the dashboard and the upper console. Seats, steering wheel/column, pedal box, door cards, rear cabin, and the roof/headliner are specified in their own sections; this section owns the **dashboard, instrument cluster, display suite, climate & control surfaces, the upper/mid console furniture, and every interior material family** referenced by the cockpit.
>
> **Model designation used throughout:** internal codename **"AV-1 Meridian"** (fictional). No real brand terms appear. Brand-specific concepts are neutralized: "maker emblem" (not a logo), "central rotary controller" (not any named wheel), "AWD selector" (not any named system), "central touchscreen" (not any named infotainment brand).
>
> **Coordinate & unit convention.** Right-handed, metres. +X = vehicle right, +Y = up, +Z = rearward (toward driver). Origin at the front-axle centreline on the ground plane unless a component notes a local pivot. LHD (left-hand-drive) is the primary build; RHD is a mirrored variant (call out asymmetric parts where relevant). All dimensions are approximate real-world targets for a D/E-segment sedan (≈5.05 m long, 1.51 m tall, 2.96 m wheelbase).
>
> **PBR convention.** Metallic/roughness workflow, linear albedo values given as sRGB hex for authoring convenience. Roughness and metallic are 0–1 scalars. "Clearcoat" refers to the second specular lobe (Disney/UE5 clearcoat), "IOR" only where a glass/coating override is needed. Emissive given in nits (cd/m²) targets for HDR, with an sRGB tint.

---

### 9.0 Cockpit Overview & Build Targets

#### 9.0.1 Interior architecture summary

- **Design language:** "floating horizon" — a single continuous horizontal upper-dashboard sweep (a "wing") spanning the full cabin width, under-lit by an ambient light bar, with a driver-canted display cluster rising from it. The lower dash and console form a separate, more sculptural "console spine" running fore-aft between the front seats.
- **Layout zones (for artists/LODs):**
  1. **Upper dash wing** (cowl top, defroster line, ambient bar, passenger fascia, speaker line).
  2. **Display cluster** (instrument cluster + central touchscreen, sharing one glass "shield" on hybrid, split glass on EV).
  3. **HUD projection zone** (windscreen lower-third, driver side).
  4. **Lower dash** (steering column shroud, knee bolster, driver switch bank, glovebox, footwell).
  5. **Console spine** (drive-mode selector, rotary controller, wireless pad, cupholders, armrest bin, USB/12 V).
  6. **Climate register line** (four primary vents + two demister slots + rear-console vents).

#### 9.0.2 LOD / build budget targets

| Build | Interior triangle budget (cockpit only) | Texture set | Notes |
|---|---|---|---|
| LOD0 (cinematic) | 1.8–2.6 M tris | Up to 4K per material zone, unique | Full sub-part separation, real bevels, stitched seams as geometry |
| LOD1 (hero gameplay, desktop) | 320–480 K tris | 2K atlases, ~6 sets | Bevels ≥1 mm kept; small screws/fasteners baked to normal |
| LOD2 (mid, console/desktop) | 90–140 K tris | 1K atlases, 3 sets | Vent vanes become a single normal-mapped insert; stitching baked |
| LOD3 (WebGL / phone) | 22–40 K tris | Single 1K–2K atlas + 1 emissive | Screens = unlit quads; ambient = vertex-painted gradient; most switches baked flat |

> **Real-time:** the WebGL/phone cockpit is a **single merged mesh per material atlas** with the three live screens (cluster, centre, HUD) as separate unlit/emissive quads driven by render-textures or UI canvases. Everything the player never touches (passenger vents' internal vanes, glovebox interior, sub-trim fasteners) is deleted, not just LOD-reduced.

---

### 9.1 Dashboard — Upper Structure ("The Wing")

#### 9.1.1 Upper dashboard fascia (cowl top / topper pad)

- **Purpose/role:** the large soft-touch upper surface running from the base of the windscreen rearward to the display shield and the driver/passenger fascia break. Sets the visual "horizon line" of the cabin and hosts the demister slots and the top speaker line.
- **Geometry & dimensions:**
  - Full cabin width span ≈ **1.46 m** (A-pillar to A-pillar interior).
  - Fore-aft depth from windscreen base to fascia break ≈ **0.34 m** at centre, ≈ **0.28 m** at the sides.
  - Cross-section: a shallow convex crown (radius ≈ 0.9 m) rolling into a defined character crease ≈ 40 mm from the leading edge.
  - Leading edge tucks under a rubber windscreen-base seal (separate part, 9.1.2).
- **Sub-parts:** topper pad skin · foam backing (not visible, omit at LOD1+) · defroster slot bezels (×2 primary, 9.6.6) · centre badge-free maker-emblem debossing (subtle, driver-passenger neutral, on passenger side) · perforated speaker strip cover (9.5.x cross-ref).
- **Materials / PBR:**

  | Layer | Albedo (sRGB) | Metallic | Roughness | Notes |
  |---|---|---|---|---|
  | Soft-touch skin (default charcoal) | #14161A | 0.0 | 0.62 | Fine "slush-moulded" pebble grain, normal-mapped; slight anisotropy off |
  | Optional Nappa-wrapped topper (luxe pack) | #1B1712 | 0.0 | 0.55 | Leather grain (9.8) + French-seam stitch line 30 mm from crease |
  | Stitch thread (contrast) | #B7852F | 0.0 | 0.48 | 3.2 mm pitch, "bronze" thread option |

- **Rendering notes:** this surface catches the largest single specular sweep in the cabin; its normal map must read cleanly under grazing sun. Keep grain tileable at ~0.5 m and blend a low-frequency AO into windscreen-base corners. Reflection of the topper in the windscreen (interior glare) is a known realism cue — for LOD0 render a faint planar reflection or SSR of the pad in the glass.
- **Gameplay interaction:** none direct; the pad is a raycast blocker for interior collision and a reference plane for HUD occlusion.

> **Real-time:** grain and stitch fully baked to a normal+AO; the leather variant is a texture swap on the same mesh. No foam, no separate seal geometry — the seal is a dark painted band in the albedo.

#### 9.1.2 Windscreen-base seal & cowl trim

- **Purpose:** rubber/EPDM finisher hiding the join between glass and topper pad; also the visual base of the wiper-park zone (exterior cross-ref).
- **Geometry:** a 12–16 mm wide soft ridge following the windscreen base curve; slight lip that overlaps the glass by ~4 mm.
- **Material:** matte EPDM — albedo #0C0D0F, metallic 0.0, roughness 0.85, subtle micro-normal (extruded ribbing every 3 mm).
- **Moving parts:** none. **Real-time:** merged into topper pad, represented by albedo/roughness only.

#### 9.1.3 Passenger-side fascia panel

- **Purpose:** the visible dashboard face in front of the passenger; hosts an optional decorative trim inlay (9.8.4/9.8.5/9.8.6 material families) and, on luxe pack, a discreet illuminated "AV-1 Meridian" script or a laser-etched topographic pattern (fictional Sofia street map motif — ties to the sim's real-topology theme).
- **Geometry & dimensions:** width ≈ 0.62 m, height ≈ 0.16 m visible face, gently concave toward the passenger. A full-width trim recess 22 mm deep accepts the swappable inlay.
- **Sub-parts:** upper soft-touch return · trim inlay (interchangeable) · lower shadow-gap reveal · ambient light diffuser strip along the bottom edge (9.4).
- **Materials:** upper return matches 9.1.1 skin; inlay per selected trim family. Shadow-gap reveal painted matte black #050506, roughness 0.9.
- **Screen content / lighting:** if the etched-map option is fitted, a thin edge-lit acrylic layer glows in the active ambient colour; emissive ≈ 30–60 nits, animated "trace" sweep on ignition (a light pulse travels along the mapped streets over ~1.2 s).
- **Gameplay:** cosmetic; used in customization/livery UI to preview trim swaps.

> **Real-time:** the etched-map glow is a single emissive texture channel with a scrolling mask for the ignition sweep; no separate acrylic layer.

#### 9.1.4 Display shield / cowl hood

- **Purpose:** the raised binnacle hood shading the instrument cluster (and, on hybrid, wrapping into the central touchscreen) to cut windscreen glare and frame the screens.
- **Geometry:** an arched overhang projecting ~55 mm over the cluster, inner face matte to kill reflection; driver-canted 7° toward the driver.
- **Material:** inner face — deep matte flock/anti-reflective, albedo #060607, roughness 0.95, metallic 0.0, no clearcoat. Outer face matches topper skin.
- **Rendering notes:** the inner face should read near-black even under direct sun; give it a slightly elevated roughness and a very low specular tint. Critical for screen legibility framing.
- **Real-time:** kept as geometry (silhouette matters for the cluster), inner flock is just a dark low-spec material.

---

### 9.2 Dashboard — Lower Structure

#### 9.2.1 Steering-column shroud

- **Purpose:** encloses the column, stalk bases, and the start/ignition zone; carries the wiper/indicator stalks (mechanism cross-ref to steering section).
- **Geometry:** a two-piece clamshell, ≈ 0.24 m long, 0.14 m wide, tapering to the column boss; upper half integrates a matte anti-glare crown.
- **Materials:** injection-moulded ABS, albedo #101114, metallic 0.0, roughness 0.7, fine tech-grain (9.7). Parting line between halves is a real 0.8 mm shadow gap at LOD0.
- **Moving parts:** none itself; stalks pass through (animated in steering section). **Real-time:** single piece, parting line baked.

#### 9.2.2 Knee bolster & lower knee pads

- **Purpose:** occupant knee protection surfaces below the steering column and glovebox; soft-touch on luxe pack.
- **Geometry:** two gently domed panels, driver ≈ 0.30 × 0.16 m, passenger ≈ 0.34 × 0.16 m.
- **Materials:** soft-touch TPO, albedo #121317, roughness 0.66; optional Alcantara-style microsuede wrap (albedo #1A1B20, roughness 0.9, fuzz via sheen/normal).
- **Physics:** collision proxy only. **Real-time:** flat panels, no separate pad geometry.

#### 9.2.3 Driver switch bank (lower-left cluster)

- **Purpose:** physical controls that must remain eyes-free: headlight rotary/auto switch, exterior-mirror joystick + fold toggle, headup-display height/toggle, instrument-brightness, parking-sensor/camera button, ESC/traction-off, tailgate release, and (hybrid) e-latch fuel-flap.
- **Geometry & layout:** a canted sub-panel ≈ 0.20 × 0.11 m, angled 20° toward the driver, holding 6–8 discrete controls (see 9.11.x for button anatomy).
- **Materials:** panel — soft matte black #0B0C0E, roughness 0.75; buttons per 9.11.
- **Moving parts:** each button/rotary animates per its type (9.11.2–9.11.4). **Real-time:** buttons baked to normal; only the 2–3 gameplay-relevant ones (lights, hazards nearby, traction) get a live press state.

#### 9.2.4 Glovebox

- **Purpose:** lockable storage on the passenger lower fascia.
- **Geometry:** door ≈ 0.30 × 0.16 m, bin depth ≈ 0.20 m, capacity ≈ 8 L. Damped drop-down hinge at the bottom edge.
- **Sub-parts:** outer door skin (matches lower fascia) · felt-lined interior (albedo #17181C, roughness 0.95, sheen for flock) · chrome-effect release button · soft-open damper (hidden).
- **Moving parts:** door rotates about a bottom hinge, **axis = X (cabin-lateral)**, range **0° → ~62°** open, driven by release button; damped ease-out (~0.6 s). Optional soft-close on push.
- **Gameplay:** openable container; can hold registration/first-aid prop (Bulgaria mandates a first-aid kit + warning triangle + vest — a nice diegetic tie-in; store the vest/triangle here or in the boot).
- **Rendering:** interior only rendered when open (state-driven visibility).

> **Real-time:** glovebox is often welded shut (static) at LOD3 unless the game has an interaction; if interactive, use a single hinge animation and only spawn interior geometry on first open.

#### 9.2.5 Footwell & lower closeouts

- **Purpose:** the carpeted lower boundary of the dash; hides HVAC ducting, wiring, and the pedal-box mounting (pedals in their own section).
- **Geometry:** irregular closeout panels + moulded carpet transitioning to the floor.
- **Materials:** carpet — cut-pile, albedo #0E0F12, roughness 0.98, strong sheen/fuzz normal; footwell LED spill zone (9.4).
- **Real-time:** carpet is a plane with a tiling fuzz normal; closeouts merged.

---

### 9.3 Instrument Cluster & Digital Displays

#### 9.3.1 Driver instrument cluster (primary display)

- **Purpose:** the driver's primary information display — speed, powertrain state, gear/drive-mode, navigation, ADAS status, and (in-sim) the scoring/telemetry overlay.
- **Geometry & dimensions:**
  - **12.3-inch** free-standing curved TFT, active area ≈ **292 × 109 mm**, 16:6 aspect, resolution target 2880 × 1080 (author UI at 2× for crispness).
  - Curvature radius ≈ 1.4 m (concave toward driver); glass cover extends ~6 mm beyond active area as a black mask.
  - Housed under the display shield (9.1.4), canted 7° driver-ward.
- **Sub-parts:** cover glass (see 9.3.5) · bonded TFT panel · black mask border · backlight (emissive proxy) · pixel/moiré micro-normal (LOD0 only).
- **Materials / render model:** the screen is an **emissive/unlit surface** fed by a render target. Cover glass on top: albedo near-black #030304, metallic 0.0, roughness 0.05, clearcoat 1.0, IOR ~1.5, with a faint anti-glare micro-roughness (roughness 0.12) and screen-printed dot mask at edges.
- **Screen content (author these as UI states):**
  - **Default (Comfort/Eco):** central speed readout (large), left dial = power/charge flow or tachometer (hybrid shows a tach + boost; EV shows a power/regen meter −40 kW … +160 kW), right dial = range/battery + trip. Bottom strip = gear (P R N D / B), outside temp, time, ADAS icons.
  - **Sport/Track:** reconfigures to a wide central tach sweep with a shift/energy light bar, g-meter, lap timer, tyre/brake temp (fictional but plausible), and a slim map minimises to a corner.
  - **Navigation full-map mode:** cluster becomes a 3D map with turn arrows; speed shrinks to a corner chip.
  - **In-sim learning overlay (project-specific):** a scoring HUD — current infraction feedback (e.g., "Signal used ✓", "Speed 54 in 50 zone"), upcoming-hazard cue, and a small "lesson objective" chip. This is the diegetic surface for the rule-engine feedback (teach-first, then grade).
  - **Warning states:** amber/red telltales, EV "turtle" limp icon, tyre-pressure, seatbelt, ABS/ESC, low-charge.
- **Emissive targets:** ~250–450 nits equivalent in-engine (tone-mapped); brightness auto-dims with the ambient/headlight state (day ≈ full, night ≈ 40%).
- **Moving parts / animation:** startup sequence — needles/rings sweep and settle (~1.4 s), maker-emblem-free "AV-1 Meridian" wordmark wipe, then live data. All content is texture/animation, not geometry.
- **Gameplay:** primary telemetry surface; drives the sim's speed/gear/mode HUD and the scoring feedback loop.

> **Real-time:** cluster = one unlit quad with a **canvas/UITexture** rendered by the game HUD system; the "curve" is faked by matching the quad to the shield geometry and adding a subtle fresnel glass overlay. No pixel micro-normal. Only 2–3 content layouts are shipped (Comfort, Sport, Nav) plus the learning overlay; warnings are sprite toggles.

#### 9.3.2 Central touchscreen (infotainment display)

- **Purpose:** primary touch surface for navigation, media, phone, climate detail, vehicle settings, drive-mode configuration, EV charging UI, and camera/parking views.
- **Geometry & dimensions:**
  - **14.9-inch** floating landscape OLED, active area ≈ **355 × 200 mm**, 16:9, resolution 2560 × 1440.
  - On **hybrid**, it shares one continuous curved glass "shield" with the cluster (a single glass pane spanning ~1.15 m); on **EV**, it is a separate portrait-capable floating slab canted 4° driver-ward.
  - Mounted proud of the dash on a slim brushed-aluminium stalk/foot (9.8.5).
- **Sub-parts:** cover glass · OLED panel · black mask · proximity-sensor strip (UI wakes as hand approaches) · optional haptic actuator (hidden) · aluminium foot.
- **Materials:** cover glass as 9.3.5 but roughness 0.04 (glossier, OLED). Foot = brushed aluminium (9.8.5).
- **Screen content (author as an app shell):**
  - **Home:** split cards — map, media, climate quick-row (persistent bottom bar with temp ±, fan, defrost, seat/steering heat, recirc, auto).
  - **Navigation:** live 2D/3D Sofia map (project tie-in), search, charging/fuel stops, hazard alerts.
  - **Drive-mode detail:** sliders for throttle map, steering weight, damper, exhaust/sound, regen (EV), AWD torque split; shows the current mode graphic.
  - **EV energy app:** battery %, range, charging curve, plug status, scheduled charge, cell temp.
  - **Camera app:** 360°/top-down composite, reversing guidelines, front-cross-traffic.
  - **Vehicle app:** ambient-light picker (colour wheel + zones), seat/mirror memory, ADAS toggles, tyre pressures.
  - **Learning/sim app (project-specific):** lesson selection, exam-mode start, debrief playback, and a "why" panel citing the relevant rule (retrieval + citation, never free-recalled law).
- **Emissive/brightness:** OLED true-black background; content 200–400 nits; auto-dims at night.
- **Moving parts / animation:** persistent bottom climate bar; wake/sleep fade; card transitions; a subtle parallax on the map. Physical: none (fixed slab).
- **Gameplay:** the interactive hub — menu navigation, mode changes, camera toggles, and (project) lesson/exam launch can be surfaced here or on a game UI layer.

> **Real-time:** central screen = live UITexture. Ship a small deterministic app set (Home/Nav/Climate/Mode/Camera + Learning). Proximity wake and haptics omitted; touch = raycast hit on the quad mapping to UI coordinates. Portrait/landscape variants become two authored layouts.

#### 9.3.3 Passenger companion display (luxe/EV option)

- **Purpose:** a passenger-side screen for media, navigation input, and (privacy-filtered) video; does not distract the driver.
- **Geometry:** **10.25-inch** landscape, ≈ 250 × 105 mm, recessed flush into the passenger fascia trim (9.1.3), behind a continuous dark glass so it "disappears" when off ("hidden until lit").
- **Material:** smoked glass over OLED — when off, reads as a near-black gloss panel (albedo #050506, roughness 0.06, clearcoat 1.0); when on, emissive content shows through.
- **Screen content:** media browser, map hand-off to driver, passenger camera views, ambient scene.
- **Real-time:** optional; if omitted, the fascia is a plain gloss trim. If present, an emissive quad behind a gloss card with a masked "hidden-till-lit" reveal.

#### 9.3.4 Rear-view mirror display (digital rear-view option)

- **Purpose:** switchable digital rear-view (feed from a rear camera) vs. optical mirror. Mounted at the windscreen top (roof/headliner section owns the housing).
- **Geometry:** ≈ 300 × 80 mm display behind the mirror glass.
- **Screen content:** wide rear camera feed, auto-dimming; toggle to optical.
- **Cross-ref:** housing/animation in the roof section; listed here for display-suite completeness.

#### 9.3.5 Display cover-glass (shared material spec)

- **Purpose:** the physical glass over cluster/centre screens; governs reflections and legibility.
- **Material / PBR:**

  | Param | Value | Note |
  |---|---|---|
  | Albedo | #030304 | near-black substrate |
  | Metallic | 0.0 | dielectric |
  | Roughness | 0.04–0.12 | OLED glossier, cluster anti-glare slightly higher |
  | Clearcoat | 1.0 | second specular lobe for the glossy pane |
  | IOR | 1.50 | for accurate fresnel |
  | Specular tint | neutral | |

- **Rendering notes:** the single biggest realism lever for screens is **screen-space reflection of the cabin/occupant in the glass** plus a **fresnel rim**. At LOD0 use SSR or a planar reflection of the topper/occupant; the emissive content must be composited *under* the reflection so bright reflections can wash out content (legibility drama at dawn/dusk).

> **Real-time:** approximate glass reflection with a cheap fresnel + a low-res cubemap or a baked cabin reflection texture; no SSR. Content quad renders first, glass fresnel overlays.

#### 9.3.6 Head-Up Display (HUD)

- **Purpose:** projects key driving data onto the windscreen in the driver's forward view — speed, speed-limit, next-turn, ADAS, and (project) hazard/lesson cues — so the eyes stay on the road (directly serves the "safer real drivers" north star).
- **Geometry / optics:**
  - Projector unit hidden in the upper dash (a rectangular aperture ≈ 0.14 × 0.06 m under a flip-cover or fixed slot at ~9.1.1's leading edge).
  - Virtual image plane appears ~2.2–2.6 m ahead of the driver, ~0.4 m above the bonnet line; virtual image size ≈ **0.30 × 0.13 m** (an "augmented" AR-HUD variant paints turn arrows onto the road at up to ~10 m virtual distance).
  - Eyebox ~130 × 90 mm; height & tilt adjustable (driver switch bank, 9.2.3).
- **Sub-parts:** projector aperture + glass · (optional) motorised flip cover · the projected virtual image (a screen-space/ world-space UI layer, NOT geometry on the glass).
- **Materials:** aperture glass — anti-reflective, roughness 0.08. Flip cover matches topper.
- **Screen content:**
  - **Standard:** digital speed (large), posted speed-limit sign, current gear/mode chip, next-turn arrow + distance, ADAS (adaptive-cruise set speed, lane lines), media/phone mini.
  - **AR mode:** turn arrows "painted" onto the road, lane-keep guides, hazard highlights (pedestrian/cyclist boxes) — a strong teaching surface for the sim.
  - **Project/learning:** a subtle hazard-anticipation cue and a non-nagging feedback chip ("ease off — school zone"). Kept minimal to avoid clutter.
- **Colour/emissive:** primary cyan-white #DCF0FF at ~90–200 nits perceived, amber #FFB347 for cautions, red #FF4D4D for warnings. Semi-transparent, additive blend over the world.
- **Moving parts / animation:** flip cover raises on ignition (axis X, ~0°→80°, ~0.7 s) if fitted; content parallax-locks to head/road; brightness auto-adapts to ambient.
- **Gameplay:** primary always-on driving aid; the AR arrows and hazard boxes are core to the teaching loop.
- **Rendering notes:** additive/screen blend, depth-tested against the world for AR elements but the "instrument" cluster of the HUD is a fixed screen-space overlay in the driver's view frustum. Must fade/occlude correctly and never draw over the A-pillars from the driver camera.

> **Real-time:** HUD = a screen-space UI layer anchored to the driver camera; AR arrows are world-space decals/quads projected on the road mesh. No projector geometry needed beyond a static aperture. On phone/WebGL, ship the standard (non-AR) HUD as a lightweight canvas; AR arrows optional and distance-limited.

---

### 9.4 Ambient Lighting

#### 9.4.1 System overview

- **Purpose:** multi-zone RGB(W) ambient lighting for mood, wayfinding, and functional signalling (e.g., door-open warning pulses red, "charging" breathes green on EV, ADAS warnings flash into the cabin). Ties into drive-mode (each mode has a signature hue).
- **Architecture:** edge-lit acrylic light guides + discrete RGB LEDs, addressable in **up to 8 driver-visible zones** in the cockpit (more in doors/rear, owned elsewhere). 64-colour palette + custom colour wheel; dual-tone (two-colour blends) on luxe pack.

#### 9.4.2 Cockpit ambient zones

| Zone | Location | Light-guide geometry | Default behaviour |
|---|---|---|---|
| Z1 Horizon bar | full-width strip along the dash-wing under-edge (9.1.3 bottom) | 1.4 m acrylic guide, ~6 mm face | primary mood colour; "trace" sweep on unlock/ignition |
| Z2 Console spine | edges of the console spine & wireless-pad well | ~0.5 m guides | matches Z1 or accent |
| Z3 Cupholder/well glow | ring under cupholder lip | small ring guide | soft downlight |
| Z4 Footwell (driver/pass) | under-dash downlights | 2 LED pods | pool of light on carpet |
| Z5 Door-card sweep | (door section) mirrored into cockpit look | — | continuity |
| Z6 Display shield underglow | thin line under the cluster hood | 0.3 m guide | subtle, night only |
| Z7 Speaker-ring halos | around tweeter/mid grilles (9.5) | LED ring behind grille | pulses subtly with audio (optional) |
| Z8 Start button/e-brake halo | ring around start button & controls | tiny ring | white idle, red-charging/mode tint |

- **Materials / render model:** the visible emitter is a frosted acrylic strip — albedo #0A0A0C when off, **emissive when on** (author an emissive mask per zone, tinted by a per-zone colour parameter). Frost roughness 0.5, slight subsurface/translucency for a soft glow. LEDs themselves not visible.
- **Emissive targets:** low, mood-level — 8–40 nits; functional warnings spike to ~120 nits and flash.
- **Moving parts / animation:**
  - **Ignition "trace":** a bright pulse travels along Z1 left→right over ~1.2 s.
  - **Breathing:** slow sine on brightness in idle/charging.
  - **Warning:** Z1/Z5 flash red on hard ADAS alerts or door-ajar at speed.
  - **Mode change:** hue crossfades over ~0.4 s (Eco teal, Comfort warm white/amber, Sport red, Individual custom).
- **Gameplay:** reinforces state feedback (mode, charging, warnings). In-sim, ambient can echo the scoring state subtly (e.g., a gentle red wash on a logged infraction — used sparingly).

> **Real-time:** ambient = **emissive vertex-painted or masked strips** with a per-zone colour uniform; "trace" and "breathing" are cheap shader time-based masks. Footwell/glow pools are unlit decals or a single soft light. On phone, collapse to Z1 + footwell only; warnings reuse Z1.

---

### 9.5 Speaker Grilles & Audio Surfaces

#### 9.5.1 Overview

- **Purpose:** the visible acoustic surfaces of the premium sound system (fictional "Aureon" audio, a neutral invented name). Grilles are functional (acoustically transparent) and a key material/detail moment.
- **Cockpit speaker positions:** dash centre (centre channel), two A-pillar tweeters, two dash-corner wide-range, plus door mids/woofers (door section) and headliner height/atmos speakers (roof section). This subsection covers the dash/A-pillar grilles.

#### 9.5.2 Speaker grille anatomy

- **Geometry:** a two-layer construction — an outer decorative metal fret and an inner acoustic cloth/foam.
  - Dash-centre grille: ≈ 0.16 × 0.05 m, softly domed.
  - A-pillar tweeter grilles: ≈ 40 mm round, angled toward the listener.
- **Sub-parts:** metal fret (etched pattern) · acoustic cloth backing · trim ring · optional illuminated ring (Z7).
- **Materials / PBR:**

  | Part | Albedo | Metallic | Roughness | Note |
  |---|---|---|---|---|
  | Etched aluminium fret | #C9CCD1 | 1.0 | 0.35 | perforation pattern via alpha + normal; anisotropic brush optional |
  | Acoustic cloth (behind) | #0B0B0D | 0.0 | 0.95 | dark, matte, slight sheen; visible through fret holes |
  | Trim ring (bright) | #D6D9DE | 1.0 | 0.22 | chamfered polished edge |

- **Rendering notes:** the fret perforation should be an **alpha-tested or opacity-masked pattern** over the dark cloth, giving real depth; the tiny holes must not shimmer at distance — mip the alpha carefully or bake to normal at LOD1+. The metal fret catches ambient (Z7) and cabin light attractively.
- **Moving parts:** none (optional Z7 ring pulse). **Real-time:** fret pattern baked to normal + a masked albedo; cloth is a flat dark material; ring optional emissive.

---

### 9.6 Air Vents & Climate Registers

#### 9.6.1 Register layout

- **Purpose:** direct conditioned air; a major tactile/animated detail set. Cockpit registers:
  - **2× central vents** (either side of the central screen or in a full-width slot).
  - **2× outboard vents** (driver & passenger ends of the dash).
  - **2× windscreen demister slots** (top of dash, 9.6.6).
  - **2× side-window demister slots** (dash corners toward A-pillars).
  - (Rear-console vents are in the console/rear sections.)
- **Design theme:** the AV-1 uses a **full-width "blade" central register** — a slim horizontal slot spanning ~0.6 m with fine vertical vanes and a hidden "digital"/motorised diffuse mode, plus two turbine-style round outboard vents.

#### 9.6.2 Central full-width blade vent

- **Geometry:** slot ≈ 0.60 × 0.022 m opening; internal vane bank of ~28 slim vertical blades (≈ 3 mm pitch) set back ~30 mm; a horizontal directional flap deeper inside.
- **Sub-parts:** outer bezel (trim family) · vertical vane bank · horizontal flap · centre control (a knurled slider/toggle or, on luxe, motorised control via the touchscreen) · optional ambient edge line.
- **Materials:**

  | Part | Albedo | Metallic | Roughness |
  |---|---|---|---|
  | Bezel (satin alu) | #B9BCC2 | 1.0 | 0.3 |
  | Vanes (matte black) | #0C0D0F | 0.0 | 0.55 |
  | Knurled control (bright alu) | #D2D5DA | 1.0 | 0.22 |
  | Internal cavity | #050506 | 0.0 | 0.9 |

- **Moving parts / animation:**
  - **Vertical vanes:** rotate about a **Y axis** (vertical), range **±35°** for left/right airflow; a single control moves the whole bank (author as a driven bone/blendshape for all vanes in unison). Manual grab-and-swipe interaction possible.
  - **Horizontal flap:** rotates about **X axis**, **±30°** up/down airflow.
  - **Open/close:** on "diffuse"/off, vanes can close flat (rotate to 90°, occluding the slot) with a soft motor animation (~0.8 s) on the luxe motorised version.
- **Physics/mechanical:** cosmetic airflow direction; no sim effect beyond audio/particle (fog-defog, breath in cold).
- **Gameplay:** grab-adjustable in cockpit-detail mode; part of the "living cabin" polish.

> **Real-time:** the ~28 vanes become a **single normal-mapped insert** at LOD2; only 2–3 hero vanes keep real geometry for the swipe interaction at LOD1. Motorised close is a single blendshape. On phone, vanes are a static normal-mapped strip; no animation.

#### 9.6.3 Outboard turbine vents (×2)

- **Geometry:** round, ≈ 75 mm outer diameter, a concentric "turbine" ring with angled inner fins; a central knurled push/rotate hub controls direction and volume (push to shut).
- **Sub-parts:** outer bright ring · turbine fin ring (angled) · central hub knob · rear directional gimbal.
- **Materials:** outer ring polished alu (#D2D5DA, metallic 1.0, roughness 0.2); fins matte black; hub knurled bright alu; optional ring can glow (blue=cold/red=hot mood cue on luxe).
- **Moving parts / animation:**
  - **Whole vent gimbal:** ball-joint aim, rotate about combined **X & Y**, cone of ~±25°, driven by pushing the hub off-centre (grab-drag).
  - **Central hub:** rotate about **Z** to modulate volume; **push** (translate −Z ~4 mm) to close.
  - Optional temperature-tint of the ring glow.
- **Real-time:** gimbal as one pivot; fins baked; hub press/rotate only if interactive, else static.

#### 9.6.4 Vane material & airflow visual cues

- **Rendering notes:** interior vent cavities should read genuinely dark (deep AO, high roughness) so the vanes pop. For cold-start realism, spawn a faint **air-distortion/heat-haze** or condensation-clear particle from central/demister vents (see climate FX in the environment/FX section) — a strong "the car is alive" cue.

#### 9.6.5 Climate control panel (physical + touch)

- **Purpose:** the dual-zone (tri-zone optional) climate interface. The AV-1 uses a **hybrid** approach: a persistent touchscreen climate bar (9.3.2) plus a slim **physical bar** below the central screen with real controls for temperature and defrost (deliberate ergonomics — physical for eyes-free, the north-star-friendly choice).
- **Geometry:** a horizontal control strip ≈ 0.34 × 0.045 m below the central screen.
- **Sub-parts / controls (physical):**
  - 2× temperature controls — either small OLED-capped rotaries or capacitive +/− with a tiny inline temp readout.
  - Fan speed (rocker or capacitive slider with LED bar).
  - Front/rear defrost buttons (icon-lit).
  - Auto, A/C on/off, recirculation, seat-heat/vent (driver & passenger), heated-steering.
  - Sync (link zones), Max-defrost, Air-direction presets.
- **Materials:** panel gloss-black capacitive surface (#050506, roughness 0.08, clearcoat 1.0) with backlit icons; physical rotaries knurled alu.
- **Screen/lighting content:** icons backlit white when active, dim when off; temp readouts emissive ~120 nits; active states brighten. Defrost icons turn amber when engaged.
- **Moving parts / animation:**
  - Rotaries spin about **Z**, detented, ±continuous, with a temperature-tint arc (blue→red) on the OLED cap.
  - Capacitive buttons: no travel, but a highlight + micro-haptic (audio) on touch; author a "pressed glow" state.
  - Physical push-buttons (defrost/auto): translate −Z ~1.2 mm on press.
- **Gameplay:** defrost/demist can be functionally tied to windscreen fog clearing (a teach-worthy interaction in cold/rain scenarios). Temperature/fan mostly cosmetic.

> **Real-time:** climate bar icons are an emissive atlas with per-icon on/off states; rotary temp arcs are shader-driven. Only defrost (if fog mechanic exists) is functionally live; the rest are visual toggles. On phone, fold the whole climate control into the touchscreen bar and drop the physical strip to a baked prop.

#### 9.6.6 Defroster / demister vents

- **Purpose:** windscreen and side-glass demist outlets along the top of the dash.
- **Geometry:** 2× wide windscreen slots (each ≈ 0.30 × 0.014 m) near the topper's leading edge, plus 2× narrow side-glass slots at the dash corners angled at the A-pillars. Fine internal directional fins (fixed).
- **Materials:** slot frames match topper skin; internal fins matte black #0A0B0D, roughness 0.7; deep cavity AO.
- **Moving parts:** fins fixed (no user animation). Airflow FX (heat-haze/defog particles) spawn from these when defrost active.
- **Real-time:** slots are a normal-mapped detail in the topper; no separate fin geometry; defog handled as a screen-space windscreen shader (clearing mask) driven by the defrost state.

---

### 9.7 Console Spine — Controls & Storage

#### 9.7.1 Drive-mode selector

- **Purpose:** selects the vehicle dynamic profile (Eco, Comfort, Sport, Sport+/Track, Individual; EV adds Range; hybrid adds EV/Hybrid/Charge). Core gameplay control — changes throttle map, steering weight, dampers, regen, AWD split, exhaust/motor sound, and ambient hue.
- **Geometry / type:** a **milled-aluminium toggle-collar** around the base of the central rotary controller, OR a dedicated knurled roller on the console spine (AV-1 uses a dedicated **knurled metal roller with a capacitive top cap** ≈ 45 mm long × 20 mm dia, canted toward the driver), flanked by a discrete "Sport" shortcut button and an "Individual" button.
- **Sub-parts:** knurled roller · capacitive/click top cap · mode indicator LEDs or a tiny inline OLED showing the mode glyph · shortcut buttons.
- **Materials:** roller — machined aluminium, deep knurl (real geometry at LOD0, normal-mapped at LOD1+), albedo #C7CAD0, metallic 1.0, roughness 0.28; top cap gloss black with emissive glyph.
- **Moving parts / animation:**
  - Roller rotates about its long axis (**local X**), detented clicks between modes (each detent ~30°), driving the mode state.
  - A press on the cap toggles sub-mode (e.g., Sport → Sport+).
  - On mode change: the inline OLED glyph swaps, ambient hue crossfades (9.4), cluster/HUD theme updates, and a subtle console-spine glow pulse plays.
- **Gameplay:** central to driving feel; the selected mode is read by the vehicle-physics module (damping, torque, steering) and by the audio module (engine/motor voicing). In-sim, some lessons/exams may lock the mode (e.g., Comfort for a calm test).
- **Rendering:** knurl highlights are a signature detail — keep a crisp anisotropic or high-freq normal.

> **Real-time:** roller detent is a discrete state machine; visual rotation snaps between authored angles. Knurl is baked normal. The OLED glyph is a tiny emissive swap. Mode change triggers the ambient/cluster/HUD/audio state — cheap and high-impact.

#### 9.7.2 Central rotary controller

- **Purpose:** the eyes-free primary menu controller (redundant to touch) — rotate to scroll, press to select, nudge/tilt for directional nav, with an optional touch-sensitive top surface for handwriting/gesture. Neutral term: "central rotary controller" (not any branded wheel).
- **Geometry:** a premium machined puck ≈ **45 mm diameter × 22 mm tall**, set into the console spine within thumb reach of the armrest; surrounded by 4–6 satellite hard-keys (Home, Back, Map, Media, Menu, Options).
- **Sub-parts:** knurled/polished aluminium ring · glass or touch top cap (optional maker-emblem-free etched ring) · illuminated base halo (Z8) · satellite buttons · haptic/detent mechanism (hidden).
- **Materials:**

  | Part | Albedo | Metallic | Roughness | Note |
  |---|---|---|---|---|
  | Knurled ring | #C7CAD0 | 1.0 | 0.26 | diamond knurl |
  | Glass/touch cap | #060607 | 0.0 | 0.06 | clearcoat 1.0; faint etched ring |
  | Base halo diffuser | emissive | 0.0 | 0.5 | Z8, mode-tinted |
  | Satellite keys | #0C0D0F | 0.0 | 0.5 | backlit glyphs |

- **Moving parts / animation:**
  - Rotate about **Y (vertical)** — continuous with soft detents (author as free spin driving UI scroll).
  - Press — translate −Y ~1.0 mm to select (spring return).
  - Tilt/nudge — small rocker in 4 directions (±5°) for directional nav (optional).
  - Base halo brightens on touch/press; mode-tinted.
- **Gameplay:** alternative UI input (scroll menus, adjust values); a satisfying tactile hero prop. Maps to the same UI the touchscreen drives.
- **Real-time:** rotation/press are state-driven visuals; knurl baked; halo emissive. On phone, likely non-interactive prop (touchscreen is primary), still animated for ambience if the player looks.

#### 9.7.3 Storage compartment (centre armrest bin)

- **Purpose:** lidded storage under the front armrest; often houses USB/12 V and a phone tray.
- **Geometry:** bin ≈ 0.24 × 0.14 × 0.10 m (≈ 3.3 L); split or sliding padded lid ≈ 0.26 × 0.16 m that doubles as the armrest.
- **Sub-parts:** padded lid (leather/stitch, matches seat) · hinge + damper · felt-lined tray · internal USB-C/12 V (9.7.7/9.7.8) · optional cooled-bin duct.
- **Materials:** lid leather (9.8) with contrast stitch; interior flock (#17181C, roughness 0.95, sheen).
- **Moving parts / animation:** lid hinges about a **rear X axis**, 0°→~70°, damped (~0.7 s); or slides fore-aft on the armrest-adjust variant (translate Z ±40 mm). Soft-close optional.
- **Gameplay:** openable container (store phone, documents); cooled variant could chill a drink prop (flavour).
- **Real-time:** single hinge animation; interior spawned on open; static/closed at LOD3 unless interactive.

#### 9.7.4 Cup holders

- **Purpose:** two front cup holders on the console spine ahead of the armrest, with an adjustable clamp and optional heat/cool ring (luxe).
- **Geometry:** two ≈ 78 mm diameter wells, ~65 mm deep, on a sliding cover; spring-loaded retaining "petals" or a soft clamp; a retractable lid/tambour can hide them.
- **Sub-parts:** wells · retaining petals (spring) · rubberized base pads · optional heat/cool ring · Z3 glow ring · tambour/roller cover.
- **Materials:** well interior soft-touch #101114 roughness 0.7, rubber base pads #0A0A0C roughness 0.9; Z3 glow ring emissive; petals matte black.
- **Moving parts / animation:**
  - Retaining petals: rotate inward to grip a cup (driven by cup presence; ±20°).
  - Tambour cover: rolls open/closed (author as a bone chain or a translate-along-curve), ~0.6 s.
  - Optional heat/cool ring glow (red/blue).
- **Gameplay:** can hold a drink prop; petals reacting to a placed cup is a nice touch. Mostly cosmetic.
- **Real-time:** petals usually static (or one blendshape); tambour optional; on phone, wells are static geometry.

#### 9.7.5 Wireless charging pad

- **Purpose:** Qi (neutral: "inductive") phone charging tray, ventilated/cooled, with a non-slip surface and a charge-status light.
- **Geometry:** a slanted or flat rubberized tray ≈ 0.16 × 0.08 m at the front of the console spine, with a retaining lip and a small status LED; often ventilated (fine slots) to shed heat.
- **Sub-parts:** non-slip mat · retaining lip · status LED · cooling slots · (a phone prop can snap here).
- **Materials:** non-slip mat — soft rubber, albedo #0B0B0D, metallic 0.0, roughness 0.95, fine micro-normal (grippy texture); status LED emissive (amber=charging, green=full, off=empty).
- **Moving parts:** none (LED state animation only — breathe amber while charging).
- **Gameplay:** place-phone interaction; status LED reflects a (fictional) charge state; ties to the phone/nav hand-off UI.
- **Real-time:** static tray + one emissive LED state; the "phone" is an optional prop with its own tiny screen quad.

#### 9.7.6 USB ports

- **Purpose:** data/charge ports for devices.
- **Geometry & count:** front — 2× USB-C (in the console spine / armrest bin), each aperture ≈ 9 × 3.5 mm; often one USB-A legacy for compatibility. (Rear ports owned by the rear-console section.)
- **Materials:** port surround gloss black #060607 roughness 0.2; internal connector metal #9AA0A8 metallic 1.0 roughness 0.4; blue/teal insert for the A-port; tiny icon etch above each.
- **Moving parts:** none (a rubber dust flap optional). **Real-time:** ports are a normal-mapped detail on the console; only model the aperture, bake the internals; icons in albedo.

#### 9.7.7 12 V accessory socket

- **Purpose:** legacy 12 V power outlet (accessory/lighter-style), usually in the armrest bin or a covered console recess.
- **Geometry:** ≈ 21 mm diameter recessed socket with a hinged or push cap; central pin + spring contacts inside.
- **Materials:** cap gloss black #060607 roughness 0.2 with a small power icon; socket interior dark metal.
- **Moving parts:** cap flips/pushes open (X axis, ~0°→90°) if interactive. **Real-time:** static with a baked cap; interior faked with a dark cavity + AO.

#### 9.7.8 e-Brake / drive controls note

- The AV-1 uses an **electronic parking brake** (a small pull/push switch on the console spine, not a lever) and a **column or console gear control** (P R N D via a stubby toggle or column stalk). These belong to the transmission/controls set but are visually part of the console spine; model the EPB switch (with a "P"-glyph backlight, red when engaged) and the gear toggle here for completeness. EPB switch: pull-up to set (translate/rotate ~4 mm/8°), backlight red when engaged, amber when auto-hold active.

---

### 9.8 Interior Material Families (Trim, Leather, Metal, Wood, Carbon)

> These are the shared, reusable material definitions the cockpit references. Author each as a master material with instance parameters.

#### 9.8.1 Dashboard stitching

- **Purpose:** the decorative/functional stitching along the topper pad, fascia, armrest, and lower dash seams — a key luxury cue.
- **Geometry:** at LOD0, stitching is **real geometry** (thread tubes ≈ 0.8–1.2 mm dia, 3–3.5 mm pitch, following seam splines) sitting in a slight valley of the leather. At LOD1+, baked to normal + albedo.
- **Materials:** thread — matte cotton/nylon, low sheen; default contrast options: bronze #B7852F, ivory #E8E2D2, red #9E2B25, or tonal (matches leather). Metallic 0.0, roughness 0.45, subtle sheen/anisotropy along thread direction.
- **Rendering notes:** the thread should catch a soft anisotropic highlight; the seam valley needs an AO groove. "French seam" (double parallel row) on the topper and armrest; single row on lesser panels.

> **Real-time:** stitching = a **tiling normal + albedo detail** applied along UV-straightened seam strips, or a decal. Never real geometry below LOD0. Keep pitch consistent so it reads as machine stitching.

#### 9.8.2 Leather texture (Nappa / semi-aniline)

- **Purpose:** the primary soft-wrap material for the topper (luxe), armrest, lid, and upper door/console surfaces.
- **Material / PBR:**

  | Param | Value | Note |
  |---|---|---|
  | Albedo (charcoal default) | #1B1712 | also tan #6B4A2E, cognac #7A3E22, ivory #D9CFBE options |
  | Metallic | 0.0 | dielectric |
  | Roughness | 0.5–0.62 | slightly glossier on high-wear areas |
  | Normal | grain map | natural hide grain, ~0.5–1 m tile, plus low-freq wrinkle |
  | Clearcoat | 0.1–0.2 | subtle protective sheen (semi-aniline) |
  | Sheen | low | soft fabric-like edge sheen |
  | Subsurface | faint warm | very subtle, luxe only |

- **Sub-parts / detailing:** perforation option (alpha holes for ventilated zones — bake to normal below LOD1), embossed maker-emblem-free debossing on the passenger fascia, quilting option (diamond pattern via normal + geometry at LOD0).
- **Rendering notes:** avoid uniform tiling — break up with a low-frequency variation map (wear, tone shift). Grain must not shimmer; mip normals carefully.

> **Real-time:** one shared leather material with a colour param and a tiling grain normal + AO; perforation/quilting baked; wear via a light dirt/AO overlay.

#### 9.8.3 Plastic grain (soft-touch & hard)

- **Purpose:** the moulded plastic surfaces — soft-touch (upper dash, knee pads) and hard (lower dash, closeouts, switch panels).
- **Material / PBR:**

  | Variant | Albedo | Metallic | Roughness | Grain |
  |---|---|---|---|---|
  | Soft-touch (dash) | #14161A | 0.0 | 0.6 | fine pebble, medium normal depth |
  | Hard structural | #101114 | 0.0 | 0.72 | tech/geometric grain, shallow |
  | Gloss-black (piano) | #050506 | 0.0 | 0.06 | smooth, clearcoat 1.0 (fingerprint-prone look) |

- **Sub-parts:** parting lines (shadow gaps), ejector-pin marks (LOD0 hidden faces only), grain-direction consistency.
- **Rendering notes:** piano-gloss zones (climate bar, screen bezels) should show subtle **fingerprint smudge** + reflections for realism; give them a smudge roughness-variation overlay. Soft-touch must read matte and non-metallic even under headlights.

> **Real-time:** two grain normals (fine + coarse) cover most plastics; piano-gloss is a separate glossy material with a baked smudge in roughness. Parting lines baked.

#### 9.8.4 Aluminium trim (satin & polished)

- **Purpose:** brightwork — vent bezels, control knurls, screen foot, speaker frets, door/console accents.
- **Material / PBR:**

  | Variant | Albedo | Metallic | Roughness | Note |
  |---|---|---|---|---|
  | Satin/brushed | #B9BCC2 | 1.0 | 0.3 | anisotropic brush direction map |
  | Polished/bright | #D2D5DA | 1.0 | 0.18 | mirror-ish, strong reflections |
  | Dark anodised (Sport) | #4A4D52 | 1.0 | 0.34 | "shadow" trim option |
  | Knurled machined | #C7CAD0 | 1.0 | 0.26 | knurl geometry/normal |

- **Rendering notes:** anisotropy direction is critical for brushed alu — bake a tangent/flow map so the brush follows the part's long axis. Polished trim needs a good cabin cubemap/reflection or it looks flat/grey.

> **Real-time:** metallic maps + a simple cubemap reflection; anisotropy approximated with a directional roughness/normal; knurl baked to normal.

#### 9.8.5 Screen-foot & bright accents (sub-note)

- The floating-screen foot, rotary controller ring, and drive-mode roller all use 9.8.4 polished/knurled alu variants; keep a single master metal material with instance params (roughness, anisotropy, tint) to unify the cabin's brightwork.

#### 9.8.6 Carbon-fibre trim (Sport pack)

- **Purpose:** optional performance trim inlay on the fascia, console spine, and door tops.
- **Material / PBR:**

  | Param | Value | Note |
  |---|---|---|
  | Albedo | #0B0C0E weave over #16181C | 2×2 twill weave pattern |
  | Metallic | 0.0 | dielectric under clearcoat |
  | Roughness (weave) | 0.35 | |
  | Clearcoat | 1.0 | thick lacquer, IOR ~1.5 |
  | Clearcoat roughness | 0.06 | glossy lacquer |
  | Normal | woven twill | crisp weave, ~15 mm tile |
  | Anisotropy | subtle | along weave |

- **Variants:** gloss (default), matte-lacquer (clearcoat roughness 0.25), and a "forged" chopped-fibre marble pattern.
- **Rendering notes:** the hallmark is the **deep clearcoat over a crisp weave** — dual-lobe specular (weave + lacquer). The weave should shift highlight with view angle (anisotropy). Keep the tile scale realistic (~15 mm squares).

> **Real-time:** single weave normal + a clearcoat lobe (or a faked second spec highlight); forged variant is a different normal/albedo. Below LOD2, clearcoat may collapse to a single glossy spec.

#### 9.8.7 Wood trim (open-pore, luxe pack)

- **Purpose:** alternative warm inlay — open-pore matte wood veneer on fascia/console/doors.
- **Material / PBR:**

  | Param | Value | Note |
  |---|---|---|
  | Albedo | #3A2A1C (walnut) / #5A4632 (oak) / #201712 (smoked ash) | grain + figure map |
  | Metallic | 0.0 | |
  | Roughness | 0.5–0.65 | open-pore matte (not glossy) |
  | Clearcoat | 0.15 | very subtle satin, open-pore look |
  | Normal | wood pore + grain | fine pore normal + long grain |

- **Variants:** open-pore matte (default), high-gloss lacquered (clearcoat 1.0, roughness 0.08 — classic look), and a metal-inlay "pinstripe" (a thin alu line following the grain).
- **Rendering notes:** open-pore reads as luxury now — subtle satin, visible pore normal, warm albedo with figure (book-matched left/right on the fascia so the grain mirrors at the centre). Author a book-matched UV.

> **Real-time:** one wood material with a colour/grain param; book-match via UV mirroring; pinstripe as a decal. Gloss variant just changes clearcoat/roughness.

#### 9.8.8 Trim-inlay swap system (gameplay)

- All decorative inlays (aluminium/carbon/wood) share the **same recess geometry** (9.1.3, console spine, door tops) so the customization UI can hot-swap the inlay material/mesh. Author each inlay as a matching-footprint mesh + material so a single "trim pack" toggle re-skins fascia + console + doors coherently. This is the diegetic hook for the customization/livery feature.

---

### 9.9 Cockpit Interaction & Rendering Summary (for programmers)

#### 9.9.1 Interactive elements (state list)

| Element | Input | State/anim | Live in-sim? |
|---|---|---|---|
| Drive-mode roller (9.7.1) | rotate/press | mode enum → physics/audio/ambient/HUD | Yes |
| Central rotary controller (9.7.2) | rotate/press/tilt | UI scroll/select | Yes (menu) |
| Central touchscreen (9.3.2) | touch raycast | app UI | Yes |
| Climate defrost (9.6.5/9.6.6) | press | defrost on → windscreen clear shader | If fog mechanic |
| Vents (9.6.2/9.6.3) | grab-drag | vane/gimbal aim | Cosmetic |
| Glovebox / armrest bin / cupholder cover | press/pull | hinge/slide anim | Container |
| Wireless pad / USB / 12 V | place/plug | LED state | Cosmetic/flavour |
| Ambient picker (via screen) | UI | zone colour params | Yes (visual) |
| EPB switch (9.7.8) | pull/push | park state, red glow | Yes |
| Start button (Z8 halo) | press | ignition sequence | Yes |

#### 9.9.2 Screen/render-texture budget

- Three always-live UI surfaces: **cluster, central screen, HUD** (+ optional passenger + rear-view). Budget render-texture updates: cluster/HUD may update every frame (cheap 2D UI); central screen can update at reduced rate when static. On phone, share one canvas atlas and update dirty regions only.

#### 9.9.3 Lighting/reflection notes

- The cabin needs a **local cubemap / reflection probe** at the H-point for screen glass, brightwork, and gloss-black surfaces. Ambient zones are emissive and should contribute to the probe subtly (mode hue tints the cabin at night). Bake an interior AO/lightmap for LOD1+ static surfaces; keep the three screens and ambient strips dynamic.

#### 9.9.4 Asset/naming conventions (suggested)

- Prefix cockpit meshes `INT_COCKPIT_*`; screens `INT_SCR_CLUSTER/CENTRE/HUD`; materials `MI_INT_*` (leather/plastic/alu/carbon/wood/glass/screen/ambient). One master material per family (9.8) with instanced parameters. Separate the three trim-inlay meshes so the swap system can toggle them.

---

### 9.10 Cockpit Bill of Materials (component index)

1. Upper dashboard fascia (topper pad) · 2. Windscreen-base seal/cowl trim · 3. Passenger-side fascia panel (+etched map option) · 4. Display shield/cowl hood · 5. Steering-column shroud · 6. Knee bolster & knee pads (×2) · 7. Driver switch bank · 8. Glovebox (door + bin) · 9. Footwell & closeouts + carpet · 10. Instrument cluster (12.3") · 11. Central touchscreen (14.9") · 12. Passenger companion display (10.25", option) · 13. Rear-view display (option) · 14. Display cover-glass (shared) · 15. Head-up display (projector + virtual image + AR) · 16. Ambient lighting zones Z1–Z8 · 17. Speaker grilles (centre + A-pillar tweeters) · 18. Central full-width blade vent · 19. Outboard turbine vents (×2) · 20. Windscreen/side demister slots (×4) · 21. Climate control physical bar · 22. Drive-mode selector roller · 23. Central rotary controller + satellites · 24. Centre armrest storage bin + lid · 25. Cup holders (×2) + tambour · 26. Wireless charging pad · 27. USB-C/A ports · 28. 12 V socket · 29. EPB switch + gear control · 30. Start/ignition button (Z8 halo) · 31. Material families: stitching, leather, plastic grain, aluminium, carbon, wood · 32. Trim-inlay swap system.

---

### 9.11 Physical Buttons & Switch Anatomy (shared reference)

> Referenced by 9.2.3, 9.6.5, 9.7, and door/steering sections for any physical control.

#### 9.11.1 General construction

- **Sub-parts (per button):** cap · light-pipe/icon lens · surround/bezel · plunger · return spring · membrane/tact-dome (hidden) · PCB (hidden).
- **Cap materials:** soft-touch #101114 roughness 0.5, or gloss-black capacitive #050506 roughness 0.08; icon lens translucent white, emissive when backlit (white idle ~30 nits, amber/red when active/warning).

#### 9.11.2 Push button

- **Motion:** translate along −Z (into dash) ~1.0–1.5 mm on press, spring return; slight tactile "click" (audio). Backlight brightens on active state.

#### 9.11.3 Rotary knob

- **Motion:** rotate about its face axis, detented (climate/volume) or free (tuning); optional push-to-select (translate ~1 mm). Knurled or rubber-ringed grip; may carry an OLED cap (drive-mode/temp) with a value arc.

#### 9.11.4 Rocker / toggle / capacitive

- **Rocker:** pivot ±8° about a centre axis (fan up/down). **Toggle:** two/three detent positions. **Capacitive:** no travel — highlight + haptic/audio feedback + "pressed glow" state; used on the climate bar and screen bezels.

#### 9.11.5 Backlighting

- All physical controls share the ambient/instrument dimming curve: full by day, ~40% at night, icons emissive; active functions brighten, warnings pulse amber/red. Author one emissive icon atlas with per-glyph on/off/warning states.

> **Real-time:** buttons are baked flat with an emissive icon atlas; only the handful of gameplay-relevant controls (drive-mode, start, EPB, defrost, hazards) get live press animations and state changes. Everything else is a static normal-mapped detail.
## 10. Interior — Steering, Seats, Doors & Console

> **Scope.** This section covers the driver-facing touch surfaces of the cabin: the steering wheel assembly (rim, controls, column, airbag, adjustment), the front driver and passenger seats, the rear bench, the four door cards, and the center console/tunnel. Instrument cluster, head-up display, dashboard topper, infotainment screen internals, HVAC ducting, headliner and pillar trim are documented in their own sections and are only referenced here where they physically meet these parts.
>
> **Fictional vehicle.** All references are to **"the Vehicle"** — an unbadged, fictional electrified performance flagship sedan. The corporate mark on the airbag boss and elsewhere is the generic **"maker emblem"** (a fictional four-point interlocking chevron, never a real logo). Brand-specific control names are neutralized: **central rotary controller** (not any real trade name), **AWD system**, **drive-mode selector**, **maker voice assistant**.
>
> **Two variants.** Where the twin-turbo hybrid (**"HYB"**) and full-EV (**"EV"**) differ inside this section, the difference is called out inline. The cabins are ~95% shared; the primary divergence is the gear selector (HYB has a mechanical monostable e-shifter with more travel; EV uses a short capacitive rocker) and a small "engine start/stop" vs "power" button legend.

### Global material & unit conventions for this section

| Convention | Value |
|---|---|
| Working unit | millimetres (mm); import scale 1 unit = 1 m in engine |
| Texel density target (hero interior) | 1024 px/m LOD0, 512 px/m LOD1, 256 px/m LOD2 |
| Colour space | Albedo/base colour **sRGB**; roughness, metallic, normal, AO **Linear** |
| Normal map convention | **OpenGL (+Y up)** authored; flip green channel for DirectX/UE5 import |
| Default cabin trim theme | "Graphite Nappa + Anthracite Alcantara + Dark Chrome + Open-pore Ash" (one of 4 selectable themes; see §10.7) |

#### Master interior PBR material library (referenced throughout)

| Material ID | Use | Base colour (sRGB hex) | Metallic | Roughness | Extra maps |
|---|---|---|---|---|---|
| `MI_Nappa_Perf` | Perforated seat centres, wheel rim | `#1A1B1E` | 0.0 | 0.42 | normal (grain), micro-normal (pores), detail-AO, perforation alpha+depth |
| `MI_Nappa_Smooth` | Bolsters, door armrests, upper door | `#1A1B1E` | 0.0 | 0.55 | normal (fine grain), sheen 0.15 |
| `MI_Alcantara` | Headliner-adjacent trim, seat inserts option, wheel 3/9 zones | `#232427` | 0.0 | 0.85 | anisotropic flow map, micro-fuzz normal, sheen 0.6 |
| `MI_CarbonTwill` | Wheel spokes option, console trim, door inlay | `#0C0D0F` | 0.0 (fibre) | 0.18 (clearcoat) | twill weave normal, clearcoat 1.0, clearcoat-roughness 0.08 |
| `MI_OpenPoreAsh` | Optional wood console/door inlay | `#3B3128` | 0.0 | 0.5 | pore normal, anisotropic grain, satin clearcoat 0.4 |
| `MI_DarkChrome` | Switch bezels, paddle faces, emblem ring | `#8C9094` | 1.0 | 0.22 | light scratch normal |
| `MI_SatinAlu` | Speaker grilles, console frame, door pulls | `#B8BBBE` | 1.0 | 0.35 | brushed-anisotropy flow map |
| `MI_PianoBlack` | Screen surrounds, gloss switch panels | `#050506` | 0.0 | 0.05 | clearcoat 1.0, smudge/dust detail-roughness |
| `MI_SoftPlastic_TPO` | Lower door, seat backs, kick panels | `#141517` | 0.0 | 0.7 | grain normal (technical pebble) |
| `MI_Glass_Emissive` | Backlit switch icons, ambient guides | `#000000` | 0.0 | 0.1 | emissive (RGB-driven), light-guide normal |
| `MI_Piping_Contrast` | Seat piping, stitch cord | `#B7361F` (theme accent) | 0.0 | 0.5 | round-cord normal |

---

### 10.1 Steering Wheel Assembly

**Purpose/role.** Primary directional control input, primary secondary-control cluster (audio, phone, cruise/ADAS, voice, drive interactions), tactile feedback surface, and the driver airbag host. In the game it is the single most-watched interior object in cockpit view — it must hold up at extreme near-camera distances (rim ~250–350 mm from the eye).

**Overall geometry.** Flat-bottom (D-cut) 3-spoke sport wheel.

| Dimension | Value |
|---|---|
| Outer rim diameter (12–6 o'clock) | 370 mm |
| Outer rim diameter (3–9 o'clock) | 375 mm (very slight oval) |
| Flat-bottom chord height reduction | 22 mm vs circular |
| Rim cross-section (grip) | 34 mm (3/9 thumb rests) tapering to 30 mm (top) |
| Spoke count | 3 (two lateral at ~3:20 & 8:40, one lower at 6:00 feeding column) |
| Central hub (airbag module) footprint | 150 × 130 mm, protrudes 46 mm |
| Total lock-to-lock rotation | 2.0 turns (720°) HYB / 1.9 turns EV (faster rack) |

#### 10.1.1 Rim (leather / carbon / heated)

- **Construction layers (outside-in for LOD0):** perforated/smooth Nappa leather wrap → foam grip pad (PU, 6–8 mm at thumb rests, 3 mm top) → magnesium armature ring (structural) → embedded heating film → optional forged-carbon rim shell (theme-dependent) at 5–7 o'clock and 11–1 o'clock outer face.
- **Zoning of grip materials:**
  - 3 o'clock & 9 o'clock (thumb rests): `MI_Nappa_Perf`, contoured with molded thumb detents (12 mm deep dish), perforation clusters for grip + heat throughput.
  - Top arc (10–2): `MI_Nappa_Smooth`.
  - Optional Alcantara variant swaps 2–4 and 8–10 zones to `MI_Alcantara` with anisotropic flow following the rim tangent.
  - Flat bottom face: `MI_CarbonTwill` insert plate, 90 × 40 mm, with a small laser-etched fictional model wordmark ("the Vehicle" placeholder — swap to project name).
- **Stitching:** twin-needle contrast stitch (`MI_Piping_Contrast`) running the full rim centerline, 3.0 mm stitch pitch, raised 0.6 mm. A "12 o'clock marker" — a single 18 mm contrast band (or forged-carbon chevron) at top-dead-center for the driver to sense wheel angle.
- **PBR notes:** rim leather roughness rises 0.42→0.55 from perforated to smooth zones; add a subtle sheen and a grime/oil detail-roughness map concentrated at 3/9 thumb rests and lower rim to sell wear on the hero asset.

**Heating.**
- Real function: resistive carbon-fibre film between foam and armature, 40–65 W, target surface 32 °C.
- Rendering: no geometry. Driven by an `emissive`-blend or a "warm sheen" param on the rim material toggled by the heated-wheel state; optional faint animated iridescent bloom on cold-start defog scenes. A backlit steering-heat icon lives on the left switch cluster (see 10.1.5).
> **Real-time:** heating is purely a material param + a lit icon. No thermal sim. On phone LOD the film/foam layers collapse to a single rim mesh; heated state is a 1-line shader boolean.

#### 10.1.2 Central hub & driver airbag module

- **Geometry:** trapezoidal cushioned pad, 150 × 130 mm face, soft `MI_Nappa_Smooth` cover over the folded airbag, with molded H-pattern tear seams (invisible seams — subtle normal-map grooves forming the deployment door outline).
- **Maker emblem:** fictional four-point interlocking chevron, 42 mm, `MI_DarkChrome` ring around a `MI_PianoBlack` field with the chevron in satin alu; slightly domed (2 mm crown) with a clearcoat for a hero specular glint. Mounted dead-center on the pad. **Never a real logo.**
- **Horn:** the entire central pad is the horn actuator (press-anywhere membrane). See 10.1.4.
- **Airbag (physics/mechanical):** folded nylon cushion + inflator behind the pad; deployment door is the H-seam. In-game deployment is a scripted crash animation (see 10.1.8 / crash section), not simulated fabric — a pre-baked inflate morph or a spawned airbag mesh with a 4-frame inflate then slow deflate.
- **Sub-parts:** clock-spring (rotary coupler behind hub carrying wiring across the rotating boss — invisible unless column shroud removed for a "garage/inspection" mode), horn contact plate, emblem sub-mesh (separate material slot for theme swaps).

#### 10.1.3 Spokes & switch bezels

- **Two lateral spokes** carry the switch clusters; **lower spoke** is a slim single blade feeding the column. Cross-section: satin-alu skeleton (`MI_SatinAlu`) capped by `MI_PianoBlack` switch panels.
- Spoke top surface angled ~12° toward the driver so thumb switches face the hands.
- **Optional carbon spoke caps** (`MI_CarbonTwill`) on the performance theme.
- Ambient under-spoke light strip (thin `MI_Glass_Emissive` light guide) optional on top themes — see ambient system.

#### 10.1.4 Horn

- **Purpose/mechanical:** press the central pad → membrane switch closes → horn relay. Full-pad actuation; ~15 N activation, ~3 mm pad travel.
- **Animation:** central pad presses inward 3 mm along the wheel's local Z (steering-axis), springs back over ~120 ms. Same pad hosts the airbag, so the press morph must not distort the emblem plane (keep emblem on a rigid child that translates, doesn't deform).
- **Gameplay:** bound to a horn input; triggers horn SFX (two-tone, see sound section) + AI-traffic reaction (pedestrians/cars flinch). Optional cosmetic — long-press vs tap differentiate.

#### 10.1.5 Switch clusters, scroll wheels, buttons (full inventory)

Layout mirrors a modern performance flagship. Two capacitive-backed hard-switch panels (`MI_PianoBlack` face, `MI_Glass_Emissive` icons) plus two knurled scroll wheels and two drive-mode "satellite" dials at the lower spokes.

**Left spoke cluster (audio / voice / phone):**

| Control | Type | Motion | Function / gameplay |
|---|---|---|---|
| Volume scroll wheel | Knurled thumbwheel, `MI_DarkChrome` | rotate ±, click-in | audio volume; click = mute |
| Track ▲ / ▼ | Rocker or twin buttons | 1.2 mm press | skip/prev media |
| Voice assistant | Round button, mic icon | press | opens maker voice assistant (see 10.1.6) |
| Phone answer / end | Green/red backlit buttons | press | accept/reject call |
| Mode/source | Small button | press | audio source cycle |
| Left multifunction scroll | Vertical scroll + OK click | rotate/click | cluster menu left pane navigation |

**Right spoke cluster (ADAS / cruise / cluster):**

| Control | Type | Motion | Function / gameplay |
|---|---|---|---|
| Adaptive cruise set/res | Rocker (+/−) | press | set speed / resume; +/- adjusts target |
| Cruise on/off & gap | Button + toggle | press | enable ACC; gap distance cycle |
| Lane-assist | Button, backlit lane icon | press | toggle lane keep |
| Distance/gap scroll | Thumbwheel | rotate | follow-gap 1–4 |
| Cluster view / trip | Button | press | cycle instrument-cluster layouts |
| Right multifunction scroll | Vertical scroll + OK | rotate/click | cluster menu right pane |

- **Two lower "satellite" dials** (performance signature) at 4 o'clock and 8 o'clock spoke roots:
  - **Right dial — Drive Mode selector:** knurled `MI_DarkChrome` dial with a colored ring (`MI_Glass_Emissive`), rotate through **Comfort / Sport / Sport+ / Individual / (EV: Range) / (HYB: Hybrid/Electric)**. Center push = confirm/boost. Ring color changes per mode (blue Comfort → amber Sport → red Sport+).
  - **Left dial — "M/Boost" button:** round red-ringed press button, momentary overtake/boost (HYB electric boost, EV overboost); on Sport+ pulses emissive.
- **Backlighting:** every icon is an `MI_Glass_Emissive` layer driven per-control (RGB white default, accent color for active states). Authored as one emissive atlas for all wheel icons; brightness follows day/night + dimmer.
- **Detent feel & motion for artists/animators:**
  - Buttons: 1.2 mm travel, 60 ms return.
  - Scroll wheels: 20 detents/rev, continuous spin bone; expose a driven rotation value.
  - Satellite dials: 8 detents; snap-rotate 45°/step with a small overshoot.

> **Real-time:** all switches share ONE 512² albedo + emissive atlas. Individual press animations are optional at gameplay LOD — many builds fake the press with an emissive "pressed" state and a tiny UV/AO darken rather than moving geometry. On phone, scroll wheels and satellite dials are static meshes; only their emissive/active-icon changes. Cluster reads the input value directly; the mesh need not physically move.

#### 10.1.6 Voice control & phone integration

- **Voice:** the mic button opens the **maker voice assistant** — a fictional in-car assistant. No geometry beyond the button + a listening indicator (an animated emissive ring on the cluster/HUD and an ambient-light pulse). Gameplay: opens a radial/voice UI; SFX chime.
- **Phone:** answer/end/reject buttons above; call state shown in cluster + HUD. Bluetooth handset is fictional. Gameplay hooks: incoming-call event can be a distraction mechanic in the theory/hazard-training layer.

#### 10.1.7 Shift paddles

- **Geometry:** two magnesium-cored paddles behind the rim at ~2 and 10 o'clock, column-mounted (do NOT rotate with the wheel — fixed to the column so they're always reachable).
- **Dimensions:** ~95 mm tall × 40 mm wide, 4 mm thick, face 12 mm behind rim; face material `MI_DarkChrome` or `MI_CarbonTwill` (theme), back `MI_SoftPlastic_TPO`; laser-etched "+" (right/upshift) and "−" (left/downshift).
- **Motion/animation:** pivot about a horizontal axis at their top mount; pull-toward-driver travel ~14 mm at the tip, ~9° rotation, spring return ~80 ms with a crisp click. Rig each as a single bone; driver = shift input.
- **Physics/gameplay:**
  - HYB: manual gear select on the transmission (paddle up/down through gears; auto-blip downshift SFX).
  - EV: **regen paddles** — left paddle increases regen braking level, right decreases (or momentary max-regen hold). This is a meaningful EV driving mechanic and should be surfaced in the cluster.
- **Because they're column-fixed:** if the column tilts/telescopes (10.1.9) the paddles move with it; they never counter-rotate with steering.

#### 10.1.8 Airbag deployment (crash) — animation note

- Not fabric-simulated at runtime. On qualifying frontal crash: play the H-seam "burst" (swap pad mesh to torn variant + spawn airbag), a 3–5 frame inflate morph to a ~600 mm cushion, hold, then a 10–15 frame deflate to a limp drape mesh. Trigger dust/particle puff + deploy SFX. Emblem/horn pad hidden during deployment.
> **Real-time:** most gameplay builds skip visible airbags entirely (rated content / perf). Keep a boolean-gated deploy so it can be disabled per-market.

#### 10.1.9 Steering column, electric adjustment & motors

- **Column geometry:** shrouded tube from wheel hub to firewall bulkhead; upper/lower `MI_PianoBlack`/`MI_SoftPlastic_TPO` shrouds; stalk levers (indicators/wipers/gear on some layouts) mount on the shroud sides — stalks are documented with the switchgear section but attach here.
- **Adjustment (power tilt + telescope):**
  - **Tilt:** ±4° / ~40 mm arc at the rim, pivot axis horizontal through the column mid-joint.
  - **Telescope (reach):** ~50 mm linear travel along column axis.
  - **Easy-entry:** on ignition-off the column tilts fully up + telescopes fully in to clear the driver; reverses on driver-door/seat detection.
- **Electric adjustment motors:** two 12 V DC gear-motors (tilt worm-drive + telescope lead-screw) inside the shroud. Modeled only as simple blocks for inspection/garage mode; invisible in normal play. Whine SFX on adjust.
- **Rig:** column root bone (fixed to chassis) → tilt bone → telescope bone → wheel-mount bone → wheel-rotate bone (steering) → hub/airbag (non-rotating clock-spring compensation is cosmetic). Steering rotation is a child of all adjustment bones so the wheel keeps turning correctly at any position.
- **Memory:** column position is part of the driver memory profile (with seat + mirrors, see 10.2.5).
> **Real-time:** column adjustment + easy-entry are usually cutscene/UI-only; during driving the wheel is fixed at the chosen pose. Motors are never visible. Phone LOD merges the shrouds into one mesh and keeps only the wheel-rotate bone.

---

### 10.2 Driver Seat

**Purpose/role.** Occupant support, primary posture reference for the driver camera, host for a dense set of comfort actuators (memory, lumbar, massage, heat/cool, bolster), and safety hardware (belt, occupancy sensor). Hero object in cockpit + door-open shots.

**Type.** Sport "comfort" seat with integrated (or high-mounted) headrest, pronounced bolsters, quilted perforated centre panels.

| Dimension | Value |
|---|---|
| Overall seat height (floor to headrest top, mid) | ~1180 mm |
| Cushion (squab) width | 520 mm; seating surface between bolsters ~380 mm |
| Backrest height | 700 mm |
| Cushion depth (with extender out) | 480–530 mm |
| Bolster rise above centre | 55 mm (back), 40 mm (cushion) |

#### 10.2.1 Frame & structure

- **Backrest frame:** magnesium/high-strength steel shell (garage/inspection mesh only), integrated headrest posts, side-impact reinforcement, upper cross-member hosting the belt guide (on integrated-belt variant).
- **Cushion frame + pan:** steel pan, suspension mat (S-springs or elastomer web), foam density zoned (firmer bolsters, softer centre).
- **Recliner mechanism:** motorized geared recliner at the hip pivot both sides.
- Modeled fully only for "seat exploded/inspection" mode; in play the frame is implied under trim.

#### 10.2.2 Rails, adjustment axes & electric motors

The driver seat is a full 8-to-14-way power seat. Each axis = one bone + one motor block + one whine SFX.

| Axis | Range | Motion | Motor |
|---|---|---|---|
| Fore/aft (slide) | 240 mm | linear along rail | lead-screw motor on inner rail |
| Height (lift) | 65 mm | scissor rise, slight tilt | front + rear lift motors |
| Cushion tilt | ±5° | front edge up/down | tilt motor |
| Backrest recline | 90°→160° | pivot at hip | recliner motor both sides |
| Cushion extender (thigh) | 50 mm | telescope forward | extender motor |
| Lumbar (4-way) | 30 mm up/down, 25 mm in/out | bladder + carriage | 2 motors / pump |
| Bolster width (back) | ±20 mm each side | bladder inflate | pump valves |
| Headrest height | 60 mm | linear | headrest motor (option) |

- **Rails:** twin anodized `MI_SatinAlu`/steel rails on the floor, exposed at their front ends (visible under the seat from rear-passenger view) — model with a light dust/scuff detail.
- **Motors:** small DC gear-motors clipped to frame/rails; blocks only, invisible in play.
> **Real-time:** all seat axes collapse to a single "seat pose" the game sets from the memory profile; only slide (fore/aft) commonly stays live for camera/driver-fit. Massage/bolster/lumbar bladders are never rigged at gameplay LOD.

#### 10.2.3 Foam, upholstery, stitching & leather grain

- **Cover zones:**
  - **Centre panels (back + cushion):** `MI_Nappa_Perf`, **diamond-quilted** (55 mm diamonds), perforation inside each diamond (heat/vent throughput), 3.0 mm twin-needle stitch, 4 mm quilt loft (normal + slight mesh puff).
  - **Bolsters:** `MI_Nappa_Smooth`, single-piece, plain with piping seam.
  - **Piping:** contrast cord (`MI_Piping_Contrast`) along all bolster/centre seams.
  - **Backrest rear shell:** `MI_SoftPlastic_TPO` or leather-wrapped upper + hard-shell lower (host for rear map pockets, see 10.3).
  - **Optional Alcantara centre** on performance theme.
- **Leather grain:** authored Nappa grain normal + micro-pore detail normal; grain scale ~1.2 mm cell; subtle color variation (albedo detail) to avoid plastic look; sheen 0.12–0.18.
- **Perforation:** alpha-cutout OR depth-mapped holes; hero uses actual modeled/parallax holes on centre panels only, alpha elsewhere. Hole Ø 1.6 mm, 6 mm pitch hex grid.
- **Embossed maker emblem / model script** optional on headrest or upper backrest (subtle debossed normal, no color).
> **Real-time:** quilt loft + perforation depth bake to normal/parallax. Alpha perforation is often dropped on phone (perf holes become a texture). One shared seat material atlas across driver+passenger; bolster/centre split by mask.

#### 10.2.4 Comfort actuators — lumbar, massage, heat, cool

- **Lumbar:** 4-way pneumatic; bladders behind the centre lower back. Real motion 25–30 mm. In-game: a small backrest normal/shape morph if desired, else UI-only.
- **Massage:** multi-bladder pneumatic matrix (e.g. 6–10 cells) with programs (wave, pulse, stretch). Rendering: optional low-amplitude (<8 mm) rolling backrest surface morph synced to a program timer; mostly UI + haptic-audio (faint pump). 
- **Heating:** carbon film in centre panels + bolsters; multi-level. Render = warm-sheen material param + lit icon; no geometry. Cold-start frost-clearing on windows is elsewhere.
- **Ventilation/cooling:** fans pull cabin air through the perforations. Render = optional subtle animated "airflow shimmer" and the perforation being the visible cue; icon lit. Faint fan whoosh SFX scaling with level.
> **Real-time:** all four are icon + material param + SFX. No bladder rigs, no morphs on phone. On console/PC hero, massage may drive a tiny vertex animation for flavor.

#### 10.2.5 Seat controls & memory

- **Door-mounted seat control cluster** (classic flagship placement on driver door armrest, see 10.4.6): a seat-shaped `MI_SatinAlu` switch pack — slide/height/recline mini-toggles shaped like the seat, plus separate headrest + cushion-length buttons. Each is a tiny rocker/toggle bone (optional animation).
- **Memory buttons (M / 1 / 2 / 3):** on the door armrest; store & recall full profile: seat all-axes + steering column + mirrors + (optional) HUD/climate. Recall triggers a choreographed multi-axis motor move with layered whine SFX — a great "welcome" animation for start-of-drive.
- **Massage/heat/vent/lumbar** live in the infotainment climate/seat menu (screen), not hard switches (except a heat quick-key).
- **Occupancy/seatbelt reminder** integrates here (10.2.7).
> **Real-time:** memory recall is the one seat animation most builds keep (nice intro). Otherwise the seat just snaps to the stored pose.

#### 10.2.6 Headrest

- Integrated-look headrest (part of backrest silhouette) with a separately adjustable pad. Height motor (option) + manual tilt. Material matches backrest; optional embossed emblem. Active head-restraint mechanism (ramps forward in rear crash) — inspection detail only; a scripted nudge on rear-impact events at most.

#### 10.2.7 Seat-belt buckle & occupancy sensor

- **Buckle:** chromed/`MI_DarkChrome` tongue receiver on a semi-rigid stalk rising from the inner seat base, ~120 mm stalk, red release button with belt icon. Belt webbing + retractor + B-pillar height adjuster are in the safety/belt section; the buckle stalk lives with the seat.
- **Buckle animation:** insert tongue → 6 mm click-in; press red button → tongue ejects ~20 mm with a spring pop. Belt-tension pretensioner = crash-scripted.
- **Occupancy sensor:** pressure mat in cushion (invisible); drives seatbelt-reminder chime + airbag arming + the "fasten belt" cluster warning. Gameplay: unbuckled-driving warning/penalty in training modes.
- **Belt-reminder:** chime + red belt icon; escalates. A realistic nag for the safety-training north star.

---

### 10.3 Front Passenger Seat

**Purpose/role.** Mirror of the driver seat, minus some driver-only controls; important for door-open beauty shots, passenger-camera, and occupant AI.

- **Geometry & materials:** identical shell/foam/upholstery to driver (10.2.1–10.2.3), **mirrored**. Shares the same seat material atlas.
- **Adjustment:** typically fewer powered axes (commonly no cushion extender or fewer memory slots), but model the same rails/frame for symmetry. Includes an **"easy-entry / walk-in" or fore-aft passenger memory** and often a **rear-passenger-operated fore/aft + recline switch** on the passenger seat's outboard shoulder (chauffeur convenience) — a small `MI_SatinAlu` switch pack on the upper outboard bolster.
- **Comfort:** same heat/cool/massage/lumbar option set; controlled via screen + passenger door switches.
- **Belt buckle & occupancy:** same as driver (10.2.7); occupancy sensor here also arms/disarms the passenger airbag and drives the "passenger airbag OFF" indicator (roof/console). Gameplay hook: seat can be empty or hold a passenger NPC / ISOFIX child seat.
- **Controls:** passenger has door-armrest seat controls + heat quick-key; no steering/drive controls.
> **Real-time:** treat as an instance of the driver seat mesh (mirrored) with a reduced control set. Same LOD rules.

---

### 10.4 Rear Seats

**Purpose/role.** Rear occupancy (2+1), cargo passthrough, child-seat mounting, rear comfort. Visible through side glass and in door-open/interior showcase; hosts passenger NPCs.

**Type.** Sculpted 3-place bench styled as two outboard "sport" buckets + a narrower center place, with a fold-down center armrest.

| Dimension | Value |
|---|---|
| Bench width | 1420 mm |
| Seat-back height (outboard) | 620 mm |
| Legroom (typical flagship) | ~1000 mm to front seatback |
| Center armrest (down) | 200 mm wide × 400 mm long |

#### 10.4.1 Cushion, backrest & upholstery

- Matches front seat material system (`MI_Nappa_Perf` quilted centres, `MI_Nappa_Smooth` bolsters, contrast piping). Outboard positions contoured; center flatter and firmer.
- Rear backrest top edge integrates upper seat-belt guides and (option) a slim ambient light wash onto the parcel shelf.

#### 10.4.2 Folding mechanism (40/20/40 split)

- **Split:** 40/20/40 folding backrests (the 20 = center, doubles as pass-through when armrest option present).
- **Release:** boot-mounted remote latch levers AND/OR top-of-backrest manual releases (small `MI_SoftPlastic_TPO` tabs).
- **Motion:** each backrest pivots forward about a lower hinge axis ~70° to lie near-flat, extending cargo floor. Rig = one hinge bone per segment; driver = fold input.
- **Physics/gameplay:** folded state opens trunk-to-cabin volume (cargo/loadout mechanic if used). Latches animate (small rotate) before the backrest releases.
> **Real-time:** fold is a scripted state (up/down) with a short tween, not continuous physics. Phone LOD may lock rear seats upright (no fold) to save a rig.

#### 10.4.3 Center armrest, cup holders & storage

- **Armrest:** folds down from center backrest about a top hinge (~60° down to horizontal). Padded `MI_Nappa_Smooth` top with contrast stitch; underside `MI_SoftPlastic_TPO`.
- **Reveals:** two `MI_SatinAlu`/rubber-lined **cup holders** (Ø 80 mm, spring-loaded retaining fingers), a small lidded **storage cubby**, and (option) rear climate/seat/audio **control touch panel** or hard buttons, plus a wireless/USB charge point.
- **Cup-holder detail:** optional sprung retainer arms animate to grip a cup mesh; rubber base (`MI_SoftPlastic_TPO`, roughness 0.8).
- **Pass-through:** behind the armrest, a ski-hatch to the trunk (latched door).
> **Real-time:** armrest is a single hinge bone; cup-holder retainer arms are LOD0-only flourish. Charge/controls are UI.

#### 10.4.4 Climate vents & rear controls

- **B-pillar / console-rear vents:** two adjustable eyeball or slot vents on the rear face of the center console (see 10.6) feeding rear passengers; adjustable vanes (thumbwheel + directional flap bones). Material `MI_DarkChrome` blades in `MI_PianoBlack` housing.
- **Rear climate panel:** temperature + fan, on console rear or armrest; screen or hard buttons with `MI_Glass_Emissive` icons.

#### 10.4.5 Seat heaters (rear)

- Outboard rear seats heated (option). Icon on rear panel; render = material param, as fronts. No cooling on rear typically.

#### 10.4.6 ISOFIX / child-seat anchors

- **ISOFIX bars:** two steel U-anchors in the outboard seat bight (between cushion and backrest), behind small zippered/flap covers with an "ISOFIX" pictogram tag. Ø 6 mm bars, 280 mm apart per seat.
- **Top-tether anchors:** on the rear parcel shelf / seatback rear, hooded loops.
- **Gameplay:** enables spawning a child-seat prop, and is a compliance/education beat (GDPR/minors context aside, child-safety is on-brand for the driving-academy north star). Covers can open (small flap bone).

#### 10.4.7 Rear seat belts

- Three-point belts for all three positions; outboard retractors in the C-pillar/parcel area, center belt from the roof or seatback. Buckles rise from the seat bight (like fronts). Belt-in-use sensors drive the rear occupant reminder (cluster diagram of occupied/belted seats).

#### 10.4.8 Rear display, storage & lighting

- **Rear display (option):** a screen in the rear face of the front center console (see 10.6) OR seatback-mounted screens on the front seat backs (8–11"), `MI_PianoBlack` bezel, powered tilt (option). Content = media/climate; a distraction/education surface.
- **Seatback storage:** map pockets (elasticated mesh or leather) on both front seat backs; optional folding tables; phone slots.
- **Lighting:** rear reading lights (roof/pillar), footwell ambient wash, door ambient (see 10.4/10.7). Rear ambient strips echo the front.
> **Real-time:** rear screens usually static emissive panels (looping texture) or off. Seatback pockets = simple mesh + normal. Rear lighting folds into the global ambient-light emissive set.

---

### 10.5 Door Panels (×4)

**Purpose/role.** Trim the door inner structure; host the primary door ergonomics — pull handle, armrest, window/mirror/lock switches, memory + seat controls (front), speakers, ambient light, pockets, and the interior release. Front doors are hero (constantly in peripheral view); rear doors are simplified variants.

**Overall front-door-card geometry:** ~1250 mm long × ~560 mm tall trim panel following the door inner shell; wraps from A-pillar to B-pillar; 3 vertical material bands (upper soft, mid accent/ambient, lower hard).

#### 10.5.1 Trim architecture & materials (top→bottom)

| Band | Content | Material |
|---|---|---|
| Upper (window sill to shoulder) | soft topper, defroster vent slot, tweeter | `MI_Nappa_Smooth` over foam; `MI_SatinAlu` sill trim |
| Mid (feature line) | inlay panel (carbon/wood/alu), ambient light guide, door pull recess | `MI_CarbonTwill`/`MI_OpenPoreAsh` + `MI_Glass_Emissive` |
| Armrest | horizontal pad + switch island | `MI_Nappa_Smooth` pad, `MI_SatinAlu` switch bezel |
| Lower (map pocket, speaker) | door pocket, woofer grille, bottle holder | `MI_SoftPlastic_TPO`, `MI_SatinAlu` grille |

- **Soft-touch upper** is genuine leather-wrapped with contrast twin-stitch mirroring the seats and a subtle grain normal. Foam backing gives a 4–6 mm "squish" silhouette on the armrest/topper.
- **Feature inlay** is a swappable sub-mesh/material slot for the trim theme (carbon / open-pore ash / brushed alu / piano black).

#### 10.5.2 Door pull / grab handle & armrest

- **Pull handle:** a scooped, ergonomically angled `MI_SatinAlu`/leather-wrapped grip integrated into the mid band; ~220 mm long recess, hand-sized (Ø ~40 mm grip). Doubles as the main close-pull.
- **Armrest:** wide padded top (~350 × 90 mm) blending into the pull; hosts the switch island on top.
- Optional ambient light spills from beneath the pull recess (indirect glow).

#### 10.5.3 Interior door handle & lock switch

- **Interior release:** a slim chrome/`MI_DarkChrome` lever or flush handle at the front of the mid band; pull to open. On some flagships this is an electronic e-latch button (soft-touch) with a mechanical backup pull.
  - **Motion:** lever rotates ~20° about a vertical/near-vertical axis, or e-latch button presses 2 mm; either releases the latch → door-open sequence (10.5.8). One bone; driver = open input.
- **Lock switch:** central-lock rocker (lock/unlock) on the switch island or beside the handle; `MI_PianoBlack` with `MI_Glass_Emissive` padlock icons (red locked / white unlocked). Press animates + toggles all-door lock state + SFX (clunk) + turn-signal blink outside.

#### 10.5.4 Window controls

- **Front doors:** 2 or 4 window rockers (driver door has all 4 + a rear-window lockout; passenger door has 1). `MI_SatinAlu`/`MI_PianoBlack` chrome-ringed rockers; **one-touch auto up/down** (two-stage press).
  - **Motion:** rocker tilts ±8° (down = press front, up = press rear/lift); bone-driven; drives the glass-regulator (window glass Y translation is in the door/glazing section but is *triggered here*).
  - **Feedback:** motor whine SFX + glass seal rustle; auto vs manual by press depth.
- **Rear doors:** single local window rocker each (subject to driver lockout).

#### 10.5.5 Mirror controls

- On the driver door island: a **mirror select L/R toggle + a 4-way joystick/pad** for mirror glass aim, plus a **fold** button. `MI_SatinAlu` joystick nub. Drives the exterior mirror glass tilt + power-fold (exterior mirror section). Small bone for the joystick (±10°) is LOD0 flourish.

#### 10.5.6 Seat & memory buttons (front doors)

- As per 10.2.5: the seat-shaped control pack + M/1/2/3 memory buttons sit on the driver door armrest island (and a passenger-seat control set on the passenger door). `MI_SatinAlu` shapes, `MI_Glass_Emissive` labels.

#### 10.5.7 Speakers, tweeter & grilles

- **Woofer/mid:** large driver low in the door lower band behind a `MI_SatinAlu` perforated/etched grille (often with a fictional maker-audio emblem etched — generic, no real brand). Ø ~180–200 mm woofer.
- **Tweeter:** small dome in the upper band (sail-panel/mirror triangle or door topper), pop-up motorized tweeter on top themes (rises 15 mm on startup — a signature theatrical bone).
- **Mid-range:** optional in the mid band.
- **Grille material:** `MI_SatinAlu` metallic mesh — author as a real perforation normal/alpha with the speaker cone faintly visible behind (parallax/2nd layer). Backlit ring option (`MI_Glass_Emissive`) that pulses with audio in "concert" ambient mode.
- **Rendering:** cone can subtly pulse (vertex/UV) with bass for hero shots; audio-reactive emissive on grille ring.
> **Real-time:** speaker cones static; grille = one normal-mapped plane. Pop-up tweeter = startup flourish only, dropped on phone. Audio-reactive effects LOD0/console only.

#### 10.5.8 Door pockets, bottle holders & storage

- Lower door pocket (leather/`MI_SoftPlastic_TPO`) sized for a ~1 L bottle + documents; molded bottle cradle; optional felt-lined + LED-lit. Simple mesh; can host a bottle prop.

#### 10.5.9 Ambient lighting (door)

- Continuous **light-guide strip** running the door feature line (and often tracing the pull and pocket), `MI_Glass_Emissive` driven by the cabin ambient system (RGB, 64+ zones, themes). Indirect wash onto leather (fake with an emissive + a soft light or a baked bounce on the leather's emissive-tint). Reacts to lock/unlock (pulse), open-door (welcome sweep), warnings (red flash for blind-spot/exit-warning on the door — a safety-training cue).
> **Real-time:** ambient = emissive strips + optional 1–2 dynamic lights per side; on phone it's emissive-only (no real light cast). Themes = a color param.

#### 10.5.10 Weather seals & door structure interface

- **Seals:** primary + secondary rubber weatherstrips around the aperture (`MI_SoftPlastic_TPO`-like, roughness 0.9, near-black, soft-compress silhouette). Belt-line "window scraper" seal at the glass slot with a felt/flock strip. These seals are the visible black rubber framing when the door is open — model them as tubular lips that appear to compress when shut.
- **Door check strap, hinges, wiring boot:** visible in the door shut face when open (garage/detail); the wiring rubber conduit (concertina boot) between A-pillar and door.
- **Sill/scuff plate:** `MI_SatinAlu` illuminated tread plate with fictional model script (backlit).

#### 10.5.11 Door-open animation & collision/interaction

- **Standard swing:** door pivots about the front hinge axis (near-vertical, slight rearward rake). Detents: **first detent ~35°, second ~55°, full ~70°**. Rig: hinge bone (swing) + inner handle bone + window glass + mirror children.
- **Sequence (open):** interior/exterior handle actuated → e-latch releases (SFX click) → door swings to a detent → check-strap holds → ambient "puddle"/welcome light + door-edge warning light project down. Speed eased; a slight bounce at each detent.
- **Sequence (close):** swing back → seal compression squeak → latch first-click (safety catch) → full-close clunk → **soft-close motor** (top themes) pulls the last 6 mm shut with a servo whir.
- **Collision:** 
  - Gameplay collision proxy for the swung door (so it can hit walls/cars/curbs and stop at contact angle — an "open door" hazard, great for the parking/hazard-training modules).
  - Door-edge/exit-warning: if traffic/cyclist approaching, block or flash-warn before open (safety-north-star mechanic).
  - Occupant ingress/egress: door must open before seat-entry animation; camera collision must not clip the swung door.
- **Rear doors:** same but shorter (~1050 mm), 2 detents, with a **child-lock** state (won't open from inside when engaged — a settable flag).
- **Power/soft-close, easy-entry:** optional powered doors (top trim) — motorized open on handle-touch/keyfob; must respect obstacle collision (stop on contact).
> **Real-time:** doors are a hinge bone with 2–3 snap states + tween; full continuous physics only where the parking/collision game needs it. Soft-close, puddle projection, and check-strap bounce are LOD0/flourish. Phone: single open state, no collision blocking, ambient emissive only.

---

### 10.6 Center Console & Tunnel

**Purpose/role.** The bridge between the seats: houses the primary drive-selection interface, drive-mode & chassis buttons, electronic parking brake, start/stop or power button, cup holders, wireless charge pad, connectivity, the covered storage/armrest, and (option) a cool box. Constantly in the driver's lower field of view; hero object.

**Overall geometry.** Raised floating tunnel from dash to armrest (~700 mm long usable top), ~300 mm wide, ~180 mm tall above the floor tunnel; a "floating bridge" upper deck with an open shelf beneath (charge pad / passthrough).

#### 10.6.1 Console frame, trim & stitching

- **Structure:** `MI_SatinAlu` or `MI_PianoBlack` side "wings", a leather-wrapped upper deck knee-facing sides with contrast stitch (`MI_Piping_Contrast`), and a large inlay panel (theme: carbon/wood/alu) on the top deck around the controls.
- **Knee pads:** soft leather `MI_Nappa_Smooth` on both inner console sides where knees rest.
- Ambient light guide traces the console-to-armrest seam.

#### 10.6.2 Gear selector / drive selector

- **HYB — monostable e-shifter:** a substantial `MI_DarkChrome`/leather knob or a joystick-style lever on the top deck. Monostable (springs back to center); nudge back = D, forward = R, side-button = P; a small "P" park button on top. Illuminated position readout (`MI_Glass_Emissive` P R N D).
  - **Motion:** lever tilts ~12° fore/aft about a base pivot, returns to center; P button presses. Bone + spring return. Satisfying detent SFX.
- **EV — short capacitive rocker / stubby wand:** a compact `MI_DarkChrome` rocker or column-mounted stalk (some EV layouts move it to the column, freeing the console — note which the project uses). Rocker rolls fwd (D)/back (R), press for P; capacitive, minimal travel (~6°).
- **Common:** current gear also shown in cluster/HUD; mis-shift safeguards (won't select R above speed) as gameplay logic.
> **Real-time:** selector is one bone with 3–4 snap poses; on phone the shifter is static and gear state is UI/logic only.

#### 10.6.3 Drive-mode & chassis buttons

- A row of `MI_PianoBlack`/`MI_DarkChrome` buttons around the selector (redundant with the steering satellite dial): **Drive Mode, Suspension (comfort/sport), ESC/traction, Exhaust flap (HYB) / Sound (EV synth), Auto-hold, 360 camera, Parking assist, Hazard lights (usually dash), Ride-height/lift (option).**
- Each: 1.5 mm press, `MI_Glass_Emissive` icon, active-state accent color. Hazard-warning triangle button is prominent red-backed (often on dash but note adjacency).
> **Real-time:** shared emissive atlas; pressed = emissive state, geometry static on phone.

#### 10.6.4 Electronic parking brake & auto-hold

- **EPB switch:** a small `MI_DarkChrome` pull/press toggle with a "P-in-circle" icon (`MI_Glass_Emissive`, amber when engaged), near the selector. Pull = apply, press = release. 3 mm travel + click; motor SFX (caliper actuators) on apply/release.
- **Auto-hold** button adjacent (holds brake at stops). Both are logic states with cluster indicators; great for realistic start/stop behavior in the sim.

#### 10.6.5 Start/Stop or Power button

- Round `MI_DarkChrome` ringed button on the console (or dash), backlit ring (`MI_Glass_Emissive`) — **HYB legend "ENGINE START/STOP", EV legend "POWER"**; ring breathes when ready, solid when on. Press = 2 mm + boot/ready chime (HYB adds engine crank/e-motor spool; EV = readiness chime + subtle whir). Optional pulse before ignition.

#### 10.6.6 Cup holders

- Two inline holders on the top deck (or under a sliding cover): Ø 80 mm, depth 60 mm, sprung retaining fingers (or an adjustable clamp), rubber base mat (`MI_SoftPlastic_TPO`). Optional heated/cooled cup holders (top theme). Retainer fingers animate to grip a cup mesh; cover slides (`MI_PianoBlack`).

#### 10.6.7 Wireless charging pad, USB & connectivity

- **Charge pad:** a rubberized (`MI_SoftPlastic_TPO`, high roughness, anti-slip normal) tray under the floating bridge or in a lidded cubby; Qi coil (invisible); a `MI_Glass_Emissive` charge indicator (amber charging/green full) + cooling. A phone prop can sit here and glow the indicator.
- **Ports:** 2× USB-C (in charge tray / armrest), a 12 V socket + (option) 230 V inverter socket in the armrest or rear console face, all `MI_PianoBlack` bezels with icons.

#### 10.6.8 Central armrest & storage / cool box

- **Armrest lid:** padded `MI_Nappa_Smooth` split or single lid, contrast stitch, hinged at the rear (or split butterfly). Opens ~60° about a rear hinge; soft damper (slow open). Bone + damped driver.
- **Storage bin:** deep felt-lined cubby beneath; may include USB, card slots, and a removable tray.
- **Cool box (option):** the bin is HVAC-fed (cooled compartment) — a small vent inside + a temperature indicator; render = felt-lined bin + icon (no thermal sim). Good for the flagship flavor.
- **Central rotary controller (option):** if the project's HMI includes a physical controller (not any real trade name), it lives just ahead of the armrest — a knurled `MI_DarkChrome` rotary + surrounding shortcut buttons + optional touch top; rotate/press/tilt bones. Otherwise the car is touchscreen-primary and this is omitted.

#### 10.6.9 Console rear face

- Faces rear passengers: **rear climate vents** (10.4.4), rear climate/seat/audio panel, USB/12 V, an optional **rear screen**, a small grab area, and an ambient light. Materials mirror the front console.

#### 10.6.10 Interaction & animation summary (console)

- **Interactive elements & drivers:**
  - Gear selector — gear input → pose/return bone + cluster gear state.
  - Drive-mode dial/buttons — mode input → emissive + suspension/exhaust/steering param changes (ties to physics tuning) + ambient color shift.
  - EPB / auto-hold — brake-hold logic + caliper SFX + cluster amber.
  - Start/Power — ignition state machine (off→acc→ready→drive) with chimes.
  - Armrest lid, cup-holder cover, charge-tray lid — open/close bones with dampers.
  - Cup-holder retainers — grip animation on cup insert.
- **Collision/interaction:** console is a solid collider (occupant knees, dropped-item props rest on deck / in bin); armrest lid collider must not trap the camera; charge pad accepts a phone prop (snap point).
> **Real-time:** console keeps only gear + start + EPB + mode as live interactions; lids/covers are LOD0 flourishes or simple 2-state tweens. All emissive icons share the console emissive atlas. On phone, the console is largely a static hero mesh with emissive-only state changes and gear/mode handled in logic.

---

### 10.7 Cross-cutting: Ambient lighting, themes, LOD & rig summary

- **Ambient lighting system (interior-wide):** a networked RGB light-guide set across doors, console, dash underside, footwells, and seat edges — 30–64+ addressable zones, themeable, reactive (welcome/lock/warning/audio/drive-mode). Authored as emissive light-guide meshes (`MI_Glass_Emissive`) + a handful of real dynamic lights (LOD0/console/PC) for genuine bounce; phone = emissive only. One master "ambient color/intensity/zone" material parameter set drives all zones.
- **Trim themes (4):** Graphite Nappa+Ash / Anthracite Alcantara+Carbon / Cognac Nappa+Alu / Obsidian Nappa+Piano-black. Implemented as material-slot swaps on: seat centres/piping, door inlays, console inlay, wheel spokes, ambient default color. Keep swappable sub-meshes on their own material IDs.
- **Rig/bone summary (this section):** steering (column tilt/telescope/rotate, wheel, horn pad, 2 paddles, satellite dials, scroll wheels, switches) · driver+passenger seats (up to ~10 axes each + buckle) · rear (3 fold segments, armrest, cup retainers, ISOFIX flaps, belt buckles) · 4 doors (hinge, inner handle, window rockers, mirror joystick, lock rocker, pop-up tweeter, ambient) · console (selector, EPB, buttons, start, armrest lid, cup cover, charge lid). Tag each with its input driver and a LOD-strip priority.
- **LOD strategy recap:** LOD0 cinematic keeps all micro-animation, real ambient lights, parallax perforation, soft-close, pop-up tweeters, massage morphs. LOD1 drops motors/bladders/pop-ups, bakes quilt+perf to normals, reduces to 2-state door/seat tweens. LOD2/phone: static hero meshes, emissive-only state (icons/ambient/heat/charge), gear/mode/lock/window handled in logic + minimal glass/door tween, single merged material atlases per assembly.
- **Interaction/collision recap:** doors (swing + detents + edge-warning + open-door hazard collider), seats (ingress/egress + camera), console (solid + prop snap points: phone on pad, cup in holder), buckles/handles/switches as interaction hotspots for the input + tutorial layers. All tie into the safety-training north star (belt reminders, exit-warning, child-lock, mis-shift guards).
## 11. Systems — Infotainment, Cluster, HVAC, Electronics & Lighting

**Model designation (fictional):** *Aurelis GT-e* — internal codename **"the Vehicle"** / platform **VX-1**. An electrified performance flagship sedan offered as two powertrain variants that share this system architecture identically except where noted:

- **GT-e Hybrid** — twin-turbo V6 + integrated e-motor, 48 V + 400 V hybrid electrical topology, physical fuel tank + traction battery.
- **GT-e EV** — dual-motor full-electric, 800 V architecture, no combustion subsystems (fuel gauge replaced by state-of-charge and consumption pages; exhaust/engine warning telltales suppressed).

This section documents everything the driver *sees, hears, and touches at the electronic/HMI layer* plus the invisible network and sensor backbone that game physics and AI read from. All brand-specific terms are neutralized: "maker emblem" (not a logo), "central rotary controller" (not any real click-wheel), "AWD system" (not any trademarked name), "phone projection" (not any named platform). No real brands appear anywhere in geometry, UI, or audio.

> **Scope split used throughout:** *Lore/LOD0* = the full cinematic-fidelity behavior we describe for artists and for the design bible. *Real-time* = what actually ships in the WebGL/phone driving build (Three.js + R3F + Rapier per ADR-005). Read the `> Real-time:` notes as the authoritative build target; treat the rest as reference the shippable subset is carved from.

---

### 11.0 System architecture overview & coordinate conventions

#### 11.0.1 Domain-controller topology (what the game must model, even if faked)

The Vehicle uses a **zonal + domain** electrical architecture. For the game, only a handful of these are ever simulated with real logic; the rest exist as lore and as named CAN signals that UI screens read. The five domains:

| Domain controller | Governs | Game relevance |
|---|---|---|
| **VDC — Vehicle Dynamics Controller** | Steering, braking, torque vectoring, stability, drive modes, suspension | High — feeds physics + drive-mode UI |
| **BDC — Body Domain Controller** | Lighting, doors, windows, mirrors, HVAC actuators, ambient LED, welcome/exit sequences | Medium — cosmetic + interaction |
| **IDC — Infotainment Domain Controller** | Center display, HUD, audio, nav, projection, voice, cameras | Medium — UI screens, camera feeds |
| **ADC — ADAS Domain Controller** | Radar/camera/ultrasonic fusion, cruise, lane, blind-spot, AEB | High — feeds ADAS telltales + assist logic |
| **EPC — Energy/Powertrain Controller** | Motor(s), engine (Hybrid), inverter, battery, thermal, regen | High — cluster power/battery/temp gauges |

- **Geometry footprint:** the physical ECUs are small potted boxes (80–220 mm) mounted behind the glovebox (IDC), under the driver seat (VDC), in the trunk left-quarter (EPC/BMS), and in the plenum (BDC). Artists model them **only** as low-poly greeble for an open-hood / open-trunk beauty shot; they are never seen in gameplay.

> **Real-time:** none of these controllers exist as physical assets in the shipped build. They are **software services** in the sim's ECS (entity-component-system): `PowertrainSystem`, `BodySystem`, `AdasSystem`, `HmiSystem`, `LightingSystem`. The "domains" above map 1:1 to these systems so the codebase mirrors the lore and content authors can reference a signal by its lore name.

#### 11.0.2 Coordinate & unit conventions for this section

- **Axes:** +X = vehicle right, +Y = up, +Z = forward (R3F/three.js right-handed, matching the rest of the sim). Rotations in degrees, right-hand rule.
- **Screen space:** all UI dimensions given in both **mm (physical panel)** and **px @ native panel resolution** so both the material artist (decal/UV) and the UI dev (RTT canvas) can work from one number.
- **Units:** the in-fiction market is Bulgaria → **km/h, °C, kPa/bar, litres, kWh**. Speedometer is metric primary. This is load-bearing for the theory-academy tie-in (Bulgarian exam uses metric).

---

### 11.1 Infotainment — central display & Infotainment Domain Controller (IDC)

#### 11.1.1 Center display panel (hardware)

- **Purpose/role:** primary touchscreen HMI; hosts navigation, media, climate proxy, camera views, vehicle settings, drive modes, performance pages.
- **Geometry & dimensions:**
  - Free-standing curved-glass slab, **15.6 in** diagonal, **16:9**, native **2560 × 1440**. Physical glass **388 × 218 mm**, corner radius **8 mm**, cover-glass thickness **2.8 mm** with a **1.2 mm** black ceramic-frit border (the "black mask").
  - Mounted **portrait-tilted 6° toward driver** on a floating aluminium stalk from the dash crown; **12 mm** air-gap shadow behind for the "floating" read.
  - Bezel-less: the frit border fades the active area edge-to-edge; a **0.4 mm** chamfer catches a specular highlight.
- **Sub-parts:** cover glass · frit-masked border · active LCD/OLED layer · optical-bonded touch digitizer · backlight sheet (LCD variant) / self-emissive stack (OLED lore variant) · aluminium chassis + stalk · rear heatsink fins (unseen).
- **Materials / PBR:**

| Sub-part | Base colour / albedo | Metallic | Roughness | Notes |
|---|---|---|---|---|
| Cover glass (off) | near-black `#0A0B0D` | 0.0 | 0.04 | Clearcoat 1.0, IOR 1.5, screen-space reflections of cabin |
| Frit border | `#050506` | 0.0 | 0.30 | Slight micro-roughness so it doesn't mirror like the glass |
| Active area (on) | emissive UI RTT | 0.0 | 0.05 | Emissive texture = the live UI render-target |
| Aluminium stalk | `#B8BCC0` | 1.0 | 0.35 | Brushed anisotropic normal, tangent along Y |

- **Moving parts / animation:** none mechanical (fixed panel). *All* motion is on-screen (see 11.1.3). A subtle **power-on ripple** (0.5 s emissive fade-in from center) and **power-off collapse to a horizontal line** are baked shader effects.
- **Rendering notes (LOD0):** UI is a **render-to-texture** at 2560×1440 mapped to the active area as an emissive map; cover glass is a separate transmissive/clearcoat pass so cabin reflections and fingerprints (a subtle smudge roughness map) sit *over* the UI. Fingerprint smudge map intensity scales with "time since last wipe" — pure cinematic garnish.

> **Real-time:** UI RTT drops to **1024×576** (or **512×288** on phone), refreshed **on-change only** (not per-frame) to save fill-rate. Cover-glass reflections become a single low-res static cubemap sample; fingerprint map omitted. When the HUD/menus are not the player's focus, the panel renders a **static baked snapshot** of the last state and only becomes a live RTT when the player's gaze/cursor is on it (proximity + look-at test).

#### 11.1.2 Infotainment Domain Controller (IDC) & compute

- **Purpose:** SoC that renders every pixel of center display + HUD + cluster compositing, runs projection, voice front-end, camera stitching.
- **Geometry:** 190 × 150 × 30 mm finned aluminium box behind glovebox. Greeble-only.
- **Physics/function:** in-sim it is the `HmiSystem` service; owns the UI state tree and camera-feed textures.
- **Gameplay interaction:** none direct; it is the substrate the screens run on.

> **Real-time:** collapse to `HmiSystem`. No asset.

#### 11.1.3 Home screen & UI shell

- **Layout (native px):** persistent **top status bar (2560×72 px)** — clock, outside temp, network glyphs, driver-profile avatar, active-mode chip. Persistent **bottom climate/dock bar (2560×160 px)** — driver temp, fan, sync, defrost, seat heat, "home" and "back" glyphs. Center **content region 2560×1208 px** hosts cards/apps.
- **Design language:** dark-first, deep charcoal `#101317` base, single accent that **recolours per drive mode** (see 11.1.7): Eco = teal `#2FD3B8`, Comfort = cool white `#DCE3EA`, Sport = amber `#FF8A3C`, Sport+ = red `#FF3B47`, Individual = user-chosen hue.
- **Typography:** fictional geometric sans "Aurelis Grotesk" — never a real typeface name; tabular figures for all numerics.
- **Animation:** cards use a **spring** (stiffness ~180, damping ~22) slide/scale; mode-switch triggers a **200 ms accent-colour cross-fade** across every accented element cabin-wide (screen + ambient LED + cluster + HUD in unison — a signature "the whole car changes mood" beat).
- **Rendering:** all UI authored as an in-engine 2D scene graph rendered to the RTT; no video, all vector/text so it scales cleanly across LODs.

> **Real-time:** ship ~**8 core screens** (home, nav, media, phone, climate, drive-mode, camera, settings) as HTML/DOM or a lightweight canvas UI composited into the RTT. Springs simplified to CSS-style ease-out (150 ms). The synchronized mode cross-fade is kept — it's cheap (a uniform/CSS var swap) and high-value.

#### 11.1.4 Navigation app

- **Purpose:** map, route, guidance, speed-limit + ADAS overlay source.
- **Sub-features:** 2D top-down + 3D "camera-follow" tilt map · route line with maneuver arrows · lane-guidance ribbon · junction-view inset · search · saved places · EV/Hybrid range ring / reachable-range isochrone · charging/fuel POIs · live speed-limit readout that also feeds the cluster & HUD.
- **Geometry/rendering:** map is its own mini-3D scene (extruded roads/buildings, low-poly) rendered to a sub-texture then composited into the nav card. Route line = emissive extruded ribbon, accent-coloured, animated flow (scrolling UV) toward destination.
- **Data:** consumes the **GPS + map graph**. In-fiction the map is generic "Sofia-like" topology; **must not** show a real map brand's tiles or styling.
- **Gameplay interaction:** sets the guidance arrow on HUD/cluster; the *reachable-range ring shrinking* is a live readout of battery/fuel state — teachable moment for the eco-driving lessons.

> **Real-time:** the nav map **reuses the actual game world's road graph** rendered to a small ortho render-target from a top-down camera (free, since the world already exists) — no separate map asset. 3D tilt map dropped on phone (2D only). Isochrone ring approximated as a simple radius circle scaled by remaining energy.

#### 11.1.5 Phone projection (generic), Bluetooth, Wi‑Fi & connectivity

- **Phone projection:** generic "Device Mirror" — when a phone is (lore-)connected, the center region shows a simplified launcher of phone apps (maps, calls, messages, media) in a distinct **lighter chrome** so it reads as "the phone took over." Purely cosmetic screen state.
- **Bluetooth:** pairing screen (device list, PIN confirm modal), connected-device chip in status bar, media + hands-free call routing. Call UI = full-screen card with avatar circle, mute/keypad/end, call timer.
- **Wi‑Fi / hotspot:** settings pane with SSID field (fictional default `Aurelis-VX1-xxxx`), signal-strength glyph in status bar, "vehicle as hotspot" toggle.
- **Other connectivity glyphs:** cellular bars, OTA-update badge (a pulsing dot on Settings when a lore "software update" is pending), NFC-key indicator.
- **Materials:** all glyphs are SDF (signed-distance-field) icons in the UI atlas, single-channel, tinted by accent/state.

> **Real-time:** projection/BT/Wi‑Fi are **static mock screens** with no real device logic — tapping "pair" plays a scripted success after 1.2 s. Status-bar glyphs are a small sprite atlas. Great for menu ambience and for the tutorial ("connect your phone"), zero networking. On phone build these settings sub-panes may be stubbed to a single "Connectivity" placeholder.

#### 11.1.6 Vehicle settings tree

- **Purpose:** deep config menus — the "everything else" bucket.
- **Structure (top-level tabs):** Driving · Lighting · Comfort/Climate · Displays · Safety/ADAS · Doors & Locks · Audio · Profiles · System/About.
  - **Driving:** steering weight, regen strength (0–3 / one-pedal toggle on EV), throttle map, ESC on/sport/off (with legal-disclaimer modal), exhaust-sound level (Hybrid) / e-sound theme (EV), launch-control arm.
  - **Lighting:** ambient colour picker (30 hues) + brightness, "mode-linked colour" toggle, welcome/exit sequence on/off, adaptive-beam on/off, footwell brightness.
  - **Displays:** cluster layout (Classic/Minimal/Nav/Performance), HUD on/off + height + content, day/night/auto theme, unit toggles.
  - **Profiles:** per-driver memory (seat, mirrors, HUD, ambient, radio presets) tied to key/door-sensor identity.
  - **System/About:** VIN-like fictional ID, software version string (fictional `VX1.OS 4.2.1`), legal, reset.
- **Rendering:** standard list/toggle/slider components from the UI kit; sliders show a live accent-fill.
- **Gameplay interaction:** the **Driving, Lighting, and Displays** panes are functionally wired (they change physics feel, LED colour, and cluster layout). The rest are cosmetic.

> **Real-time:** only wire the ~10 settings that change gameplay/visuals (regen, steering weight, ESC, ambient colour, cluster layout, HUD toggle, units, exhaust/e-sound level). Everything else renders as a real-looking but inert control. This keeps the settings menu convincing for screenshots while bounding scope.

#### 11.1.7 Driving modes (HMI side; physics in §on dynamics)

- **Modes:** **Eco · Comfort · Sport · Sport+ · Individual** (+ hidden **Track** on EV, + **Drift** arm behind a hold-gesture in Sport+ for gameplay fun).
- **HMI behavior per mode:** each mode broadcasts one enum that simultaneously drives: accent colour · cluster theme · ambient LED colour/brightness · HUD content density · throttle/steer/regen/ESC/exhaust maps · suspension (lore) · a **one-shot mode-change animation** on center + cluster (radial wipe in the new accent) · a short mode-specific audio stinger.
- **Geometry/interaction:** selectable via the physical drive-mode toggle on console (see body/interior spec) **and** an on-screen carousel. The carousel card shows a stylized car silhouette with the mode's character (leaf/heartbeat/checkered motifs — abstract, non-branded).

> **Real-time:** the mode enum is a **single source of truth** in `PowertrainSystem`/`HmiSystem`; every subscriber (LED, cluster, HUD, audio, physics params) reads it. This is the highest-ROI system in the whole section — one integer changes the entire cabin's look, sound, and feel. Ship all five core modes; Track/Drift are cheap variants.

#### 11.1.8 Climate control screen (HMI) — see HVAC §11.3 for hardware

- **Purpose:** the touchscreen face of HVAC.
- **Layout:** dual/quad-zone temp dials (driver/passenger, +rear pair on quad), fan speed arc, mode buttons (face/feet/defrost/auto), A/C + recirc + sync toggles, seat heat/vent per seat (3-level glyph), steering-wheel heat, "climate sync to profile," a **cabin airflow diagram** (car top-view with animated vent arrows).
- **Animation:** the airflow diagram animates arrows from active vents; temperature dials sweep with a spring; "MAX defrost" turns the windshield glyph amber with radiating heat lines.
- **Rendering:** the top-view car diagram is a flat vector illustration in the UI atlas, arrows are UV-scrolling sprites.

> **Real-time:** climate screen is **mostly cosmetic** (cabin thermal isn't simulated) but is fully interactive as UI and drives two real effects: the **windshield defrost fade** (removes a fogging/frost overlay shader on the glass) and **seat-heat / vent LED** telltales. Airflow diagram kept — cheap, and it looks premium in screenshots.

#### 11.1.9 Camera system & 360° surround view

- **Cameras (physical, 6):** front (in maker-emblem housing on grille), rear (trunk-lip / license-surround), two mirror-base down-facing (kerb view), two front-fender side. All **fisheye ~190° FOV**, tiny black hemispherical lenses (Ø 12 mm).
- **Views produced:** rear reversing (with dynamic bending guide lines), front, **360° bird's-eye** (stitched top-down over a rendered car model), **3D surround** (orbitable bowl projection), kerb/wheel view, "transparent hood" (composited underbody), trailer/blind-spot insets.
- **Geometry/rendering (LOD0):** each physical camera is a real in-engine camera; the 360 bird's-eye is a **projective texture stitch** of the six feeds onto a ground plane + a rendered mini-car model floating above it; guide lines are shader overlays that bend with steering angle (read from wheel-angle signal).
- **Materials:** lenses `#050505`, metallic 0, roughness 0.05, clearcoat 1.0 (wet glassy dome); housings body-colour or gloss black.
- **Gameplay interaction:** reversing/parking aid; the **bending guide lines are a live steering readout** and are genuinely useful for the parking lessons; ultrasonic proximity colour-codes (green→amber→red arcs) overlay on the surround view.

> **Real-time:** this is expensive, so: rear + 360 bird's-eye only on desktop; **phone build ships rear-cam only**. The 360 uses **4 cameras** (front/rear/2 sides) not 6, stitched cheaply, and floats a **low-poly baked car model** (not the hero mesh) in the center. Guide-line bending and the ultrasonic colour arcs are kept — they're near-free shader work and directly serve the parking-maneuver scoring. "Transparent hood"/3D orbit bowl = desktop-only nicety, omit on phone.

#### 11.1.10 Gesture control

- **Purpose:** mid-air hand gestures (a ToF sensor pod on the headliner reads the space above the console) for volume, call accept/reject, skip track, and a user-assignable gesture.
- **Geometry:** sensor pod = flush black oval (35 × 18 mm) in the headliner, invisible in play. Ø of active detection cone ~250 mm above the console.
- **HMI feedback:** an on-screen ripple + glyph confirms a recognized gesture; ambient LED gives a quick accent pulse.
- **Gameplay interaction:** minimal — a novelty. Could map to a keyboard/gamepad shortcut demoing "gesture" (e.g., swipe to dismiss a call popup).

> **Real-time:** **lore + one scripted demo.** No hand tracking. Optionally a settings toggle + a canned "gesture recognized" animation triggered by a hotkey during a guided tour. Sensor pod is not modeled below LOD0.

#### 11.1.11 Voice assistant

- **Purpose:** natural-language control ("set temperature to 21", "navigate home", "I'm cold"), plus the theory-academy AI-tutor hook.
- **HMI:** wake via wheel button / "Hey [wake-word]" (fictional wake-word, e.g. "Aura"); an **orb visualizer** (animated blob, accent-tinted, reactive to speech amplitude) appears bottom-center; transcribed text ribbon above it.
- **Mic array:** 4 MEMS mics in the headliner (beamforming, lore); tiny grille dots, unseen in play.
- **Gameplay interaction / project tie-in:** **critical hook** — per ADR-002 the AI never free-recalls Bulgarian law; the in-car assistant, when it answers a rules question, is retrieval-grounded from the content bank with citation. The orb + ribbon UI is the visual home for the LLM-dialogue debriefs. Keep the *voice UI* generic and non-branded.
- **Rendering:** orb is a small GPU blob shader (2–3 metaballs) tinted by accent; amplitude drives scale/noise.

> **Real-time:** ship the **orb + transcript UI** and wire it to the existing tutor/LLM pipeline (text or optional STT). No in-car wake-word DSP — activation is a button/hotkey. The orb shader is cheap and gives the assistant a premium presence. This is the one "gimmick" system with real product value, so it survives to the shipped build.

#### 11.1.12 Head-Up Display (HUD)

- **Purpose:** project speed, limit, nav arrow, ADAS state onto the windshield in the driver's sightline.
- **Geometry/optics:** HUD projector in the dash top; virtual image appears to float **~2.3 m ahead**, image size ~**300 × 120 mm** apparent, positioned low-center of the windshield. AR-HUD lore variant paints ground-locked nav arrows onto the road.
- **Content:** digital speed (large) · speed-limit sign glyph · current gear/drive-mode chip · turn-by-turn arrow + distance · ADAS icons (ACC set-speed & lead-car, lane lines, blind-spot warning mirrored here) · incoming-call / media mini-cards · warning flashes (collision, over-limit).
- **Materials/rendering:** additive emissive layer; slightly transparent, colour = mostly cool white + accent + red/amber for warnings; a faint chromatic fringe + subtle parallax vs. head position sells the "projected" look.
- **Animation:** speed digits roll; nav arrow AR variant bends/foreshortens along the road; warnings pulse.

> **Real-time:** HUD is a **screen-space HUD overlay** (2D, additive, drawn in front of the camera) — *not* a real windshield projection — positioned to look like it floats over the road. This is basically free and doubles as the game's primary telemetry HUD, so it's a core shipped feature. AR ground-locked arrows: desktop-only; phone gets the simple floating arrow. Parallax vs. head omitted (fixed cockpit cam).

#### 11.1.13 Performance / telemetry pages

- **Pages:** live power & torque split (engine vs e-motor on Hybrid; front/rear motor on EV) · **g-force meter** (lateral/longitudinal dot on a grid) · 0–100 km/h & quarter-time timers with auto-start on launch · lap timer + sector splits (track lore) · tyre & brake temp mimic · boost gauge (Hybrid) · battery power-flow diagram (regen ↔ drive) · energy-consumption history graph.
- **Rendering:** stylized gauges (SVG-like vector arcs), the g-dot leaves a fading trail; power-flow diagram animates energy particles along the drivetrain schematic.
- **Gameplay interaction:** **genuinely functional** — reads live physics (accel, speed, torque split, regen). The 0–100 timer and g-meter are legitimately fun and are re-used by the sim's scoring/telemetry for the "smoothness" driving lessons.

> **Real-time:** ship the **g-meter, digital 0–100 timer, and battery/energy power-flow** (all read straight from the physics + `PowertrainSystem`, near-free). Boost/tyre-temp gauges are cosmetic mimics driven by simple proxies (throttle, |accel|). Lap timer only where a track exists. Consumption history = a rolling array already needed for eco-scoring.

---

### 11.2 Instrument cluster (driver display)

#### 11.2.1 Cluster panel (hardware)

- **Purpose:** primary driver information surface behind the wheel.
- **Geometry:** **12.3 in** curved LCD/OLED, native **1920 × 720**, physical **295 × 110 mm**, hooded by a soft-touch cowl to kill glare; tilted **8°** up toward the driver's eyes. Set into a black-frit surround matching the center display.
- **Sub-parts:** cover glass · frit surround · active area · anti-glare cowl (part of dash mesh) · rear housing (unseen).
- **Materials:** identical PBR to the center display glass (roughness 0.05, clearcoat 1.0); cowl = soft-touch `#0C0D0F`, roughness 0.85, subtle grain normal.
- **Rendering:** RTT emissive, same pipeline as center display.

> **Real-time:** second RTT at **960×360** desktop / **480×180** phone, refresh gated to changed elements (speed digits update at ~10 Hz, not per-frame). The cluster and HUD **share one UI render pass** where possible to save a target.

#### 11.2.2 Cluster layouts (themes)

- **Classic:** two round dials (left = speed **or** power, right = RPM (Hybrid) / power-&-regen (EV)) flanking a center info well.
- **Minimal:** single large digital speed, thin arcs, maximal calm (Eco/Comfort default).
- **Nav:** center map fills the cluster, gauges shrink to side ribbons.
- **Performance (Sport/Sport+):** prominent RPM/power sweep, gear number huge center, shift-light bar across the top, red accent.
- Each theme re-lays the same data; switch is instant with a **radial dissolve** in the active accent.

> **Real-time:** ship **Minimal + Performance** (the two most-used), plus Nav if the nav RTT is already being produced. Classic can be a later add. Theme switch dissolve kept (cheap).

#### 11.2.3 Speedometer

- **Form:** large tabular digital km/h readout (primary) with an optional sweeping arc (0–260 km/h EV / 0–320 Hybrid lore, but limited in-sim). Sub-glyph "km/h."
- **Animation:** digits roll with a **50 ms lag/smoothing** so they don't jitter; arc fill lerps. Over-limit → the readout and the HUD speed flash amber (drives a lesson-relevant "you exceeded the posted limit" event).
- **Data:** wheel-speed sensors → vehicle-speed signal (see 11.4).

> **Real-time:** core, always on. Reads `physics.speed`. Smoothing kept. The over-limit flash is wired to the **live speed-limit from the nav road graph** — directly feeds the theory-track scoring.

#### 11.2.4 RPM / power & torque meter

- **Hybrid:** tachometer 0–8000 rpm, redline 6800 (red zone), needle **or** arc; a shift-light bar (green→amber→red) across the cluster top in Sport+.
- **EV:** replaces RPM with a **power meter** — a bidirectional arc: **CHARGE ← 0 → POWER** showing regen (left, teal) vs drive demand (right, accent), plus a small kW number.
- **Animation:** needle/arc responds to throttle + physics; shift-lights sweep and the top bar flashes at redline.
- **Data:** motor/engine speed & torque from `PowertrainSystem`.

> **Real-time:** EV variant (power arc) is trivial (read torque demand + regen). Hybrid tach needs an engine-rpm proxy (map road speed × gear ratio + idle) — cheap. Shift-light bar is a nice Sport-mode flourish; keep on desktop, optional on phone.

#### 11.2.5 Battery gauge (traction battery / high-voltage)

- **Display:** state-of-charge % (big number + a segmented or arc bar), estimated range (km), and a small power-flow glyph. EV shows this prominently; Hybrid shows it as a secondary well beside the fuel gauge.
- **Colour logic:** green/accent >40%, amber 15–40%, red <15% (pulses under 8%). Charging (lore) shows an animated fill + a lightning glyph.
- **Data:** BMS state-of-charge from `EPC/BMS`.

> **Real-time:** SoC is a real simulated scalar (drains with use, regens under braking/lift) — directly powers the **eco-driving lessons** (smoother = more regen = slower drain). Range = SoC × a consumption estimate. Charging animation only if a charging mini-game/station exists.

#### 11.2.6 Fuel gauge (Hybrid only)

- **Display:** classic fuel arc/bar + litres/range + low-fuel pump telltale (amber at ~10%, with a "range to empty" and nearest-fuel nav prompt).
- **Data:** fuel-level sender (float in tank, lore) → `EPC`.
- **EV variant:** **removed** — the fuel well is replaced by an expanded battery/consumption panel. No fuel telltales ever illuminate on EV.

> **Real-time:** simple scalar drain (Hybrid). On EV build the fuel gauge and all fuel telltales are **compiled out**, not just hidden, so no dead assets ship.

#### 11.2.7 Temperature gauges & thermal

- **Gauges:** coolant temp (Hybrid engine), motor/inverter temp, battery temp, outside-air temp (also in status bars), optional oil temp (Sport pages).
- **Display:** small arc or numeric; normal band green, over-temp amber→red with a warning telltale + a "reduce power" lore message (can gate max power in a track scenario).
- **Data:** thermistors across powertrain → `EPC`.

> **Real-time:** outside-air temp is a world/weather value (real). Powertrain temps are **proxies** (rise with sustained high throttle, fall at cruise) — used only for a Sport/track "thermal management" flavor and the over-temp telltale. Skip on phone.

#### 11.2.8 Warning & telltale lights (the full lamp cluster)

- **Set (ISO-style but non-branded glyphs):** seatbelt, airbag, ABS, brake (park + hydraulic), ESC/traction (steady = off, blinking = active), tyre-pressure (TPMS), engine/MIL (Hybrid), EV-system (EV), high-voltage caution, oil pressure (Hybrid), coolant temp, battery/charging (12 V), door/hood/trunk ajar, low fuel (Hybrid), low washer, lamp-out, headlight/high-beam/fog, turn-signal L/R (with audible tick), cruise/ACC state, lane-assist, blind-spot, AEB/collision, exterior-light auto, frost/ice (≤3 °C), key-not-detected, service-due.
- **Colour convention:** red = stop/danger, amber = caution/advisory, green/blue = active-and-OK (beams blue, turn/cruise green). **Bulb-check sweep** on power-up: all illuminate ~1.5 s then clear — a signature start ritual.
- **Rendering:** each is an SDF glyph in the cluster atlas, emissive-tinted; blinkers/active states animate.

> **Real-time:** implement the **~12 that map to real sim state** (seatbelt, turn signals, high-beam, ABS/ESC-active during a skid, TPMS if a flat is modeled, door-ajar, low-battery/fuel, ACC/lane/blind-spot/AEB when those assists fire, handbrake). The rest render during the **bulb-check sweep only** (they light up at startup then go dark) so the cluster looks fully authentic without wiring dead logic. Turn-signal tick + telltale is a must (lesson-relevant: signaling).

#### 11.2.9 Navigation in cluster

- Turn-by-turn arrow + street name + distance ribbon; in Nav layout the map fills the cluster. Mirrors nav app data.
> **Real-time:** reuse the nav RTT / arrow already built for HUD; just composite into the cluster well. No extra cost.

#### 11.2.10 ADAS visualization in cluster

- **Purpose:** the "car sees the road" render — ego-car model center, detected lane lines (blue when tracking, grey when lost), lead vehicle (highlighted when ACC is following, with a following-distance bar), surrounding traffic blips, set-speed marker on the speedo, blind-spot vehicles (amber car icons in mirrors zone).
- **Animation:** lane lines lock/unlock, lead-car icon locks on with a bracket, following-distance bar shrinks/grows.
- **Data:** ADAS fusion (radar/camera/ultrasonic) → `AdasSystem`.

> **Real-time:** this "world model" view is **read from the sim's actual traffic/lane data** (which already exists for the driving world) — so it's cheap and impressively accurate. Ship a simplified version (ego car + lane lines + nearest lead + blind-spot flags). It doubles as a teaching visual ("this is your following distance").

#### 11.2.11 Cruise / adaptive cruise (ACC) display

- Set-speed number, gap-setting (1–4 bars), lead-car lock icon, ACC active/standby colour (green active). Speed-limit-assist can suggest matching the posted limit.
> **Real-time:** ACC is a plausible, teachable assist to simulate (maintain speed, slow for lead car) — worth wiring for the "safe following distance" lesson. UI reads its state.

#### 11.2.12 Blind-spot & lane assist display

- **Blind-spot:** amber icon in the cluster's mirror-zone + a matching **LED in the physical door mirror** (see lighting); escalates to blinking + chime if the driver signals toward an occupied blind spot.
- **Lane assist:** lane lines turn green when centered, amber + a gentle "steering nudge" (torque event) + wheel-icon flash on unsignaled drift.
> **Real-time:** both read the existing lane graph + traffic. Blind-spot mirror LED and the lane-departure nudge are **directly lesson-relevant** (mirror checks, lane discipline) → ship them. Chime + telltale included.

#### 11.2.13 Night / day modes

- Auto theme swap driven by the light sensor / headlight state: **day** = higher brightness, cooler whites; **night** = dimmed, warmer, reduced blue, red-shifted warnings to protect night vision. A smooth 1 s cross-fade at the transition; manual override in Displays settings.
> **Real-time:** drive the swap off the **world time-of-day / headlight-on** signal (already in the sim). It's a uniform brightness/tint change on the cluster+HUD RTT — cheap and adds a lot of realism during dusk/night drives.

---

### 11.3 HVAC — heating, ventilation & air-conditioning

#### 11.3.1 Architecture & zones

- **Zoning:** **quad-zone** (driver, front-passenger, rear-left, rear-right) on top trim; **dual-zone** on base. Each zone = independent target temp, the system blends hot/cold air via blend-doors to hit it.
- **Core loop (lore):** cabin air → filters → evaporator (cooling/dehumidify) → heater core (Hybrid) / high-voltage PTC + heat-pump (EV) → blend doors → mode doors → vents. Refrigerant loop: compressor → condenser → expansion → evaporator.
- **Geometry:** the HVAC "box" lives in the dash center behind the console (≈ 400 × 300 × 250 mm), never seen in play; ducts snake to each vent.

> **Real-time:** **cabin thermodynamics are NOT simulated.** HVAC is an interaction + cosmetic system: controls move, vents animate, telltales light, and it drives exactly two real effects — **windshield/side-glass defog-defrost** (clearing a fog/frost shader) and **audible blower level** (a looping fan sound whose volume/pitch tracks fan speed). Temperatures are just displayed numbers. The whole refrigerant/heater-core chain is lore.

#### 11.3.2 Air vents (dash, physical)

- **Count/geometry:** 4 primary dash vents (2 center twinned, 2 outboard by the A-pillars) + 2 windshield defrost slots + 2 side-glass demist slots. Outboard vents Ø or rectangular **~90 × 45 mm**; center pair a continuous slim **420 × 22 mm** "blade" vent (modern low-profile look).
- **Sub-parts:** outer bezel · horizontal + vertical louvre fins · a thumb-wheel/toggle for direction & shut-off · the fictional emblem-free knurled control nub.
- **Moving parts / animation (LOD0):**
  - Louvre fins tilt: **vertical fins ±25°** (left/right airflow, axis = Y), **horizontal fins ±20°** (up/down, axis = X), driven by the (lore) occupant's hand or the auto-sweep.
  - Shut-off wheel rotates ~90° closing an internal flap.
  - Slim blade vents use a **motorized directional pin** that visibly glides (a small chrome dot travels along the slot as the airflow diagram directs) — a signature detail.
- **Materials:** bezel = satin dark chrome (`#9AA0A6`, metallic 1.0, roughness 0.3) or gloss black; fins = matte black `#141518`, roughness 0.6; knurled nub = machined metal, anisotropic.
- **Gameplay interaction:** direction can be dragged (cosmetic); shut-off toggled. Minor.

> **Real-time:** vents are modeled at LOD0–1 with **static or single-axis fins**. Louvre motion is baked to a **1–2 bone rig or a blend-shape** and only plays when the player interacts or on the "auto-sweep" cosmetic loop; on phone the fins are frozen. The motorized blade-vent dot is desktop-only eye-candy. Vents remain visible geometry (they're prominent on the dash) but are essentially non-functional.

#### 11.3.3 Rear vents

- **Locations:** B-pillar outlets + a console-rear vent stack facing row 2; optional roof-mounted rear vents (lore). Same louvre design, smaller (~70 × 35 mm).
- **Controls:** a small rear climate panel on the console back (temp ± and fan for the rear zones on quad-zone).
> **Real-time:** modeled geometry, non-functional; rear panel is a static prop unless a passenger-interaction feature exists (it doesn't in the driving build).

#### 11.3.4 Airflow modes & blend/mode doors

- **Modes:** face · face+feet (bi-level) · feet · feet+defrost · defrost. Selected by mode buttons; internal **mode doors** (flaps) rotate to route air; **blend doors** mix hot/cold; **recirc door** switches fresh↔recirculated.
- **Animation (lore):** each door is a servo-driven flap (rotational, ~0–90°); the airflow-diagram on-screen mirrors their state.
> **Real-time:** doors are **not modeled** (hidden in the box). Only the **on-screen airflow diagram** represents them. Defrost mode is the sole one with a visible effect (clears glass fog). Everything else is UI state.

#### 11.3.5 Cabin air filters

- **Type:** combined particulate + activated-carbon (odor) filter, lore HEPA-grade option; sits behind the glovebox. A "replace filter" service reminder can appear (lore/cosmetic).
- **Geometry:** pleated panel ~250 × 200 × 30 mm; only seen in a maintenance/beauty context.
> **Real-time:** lore only; not modeled below a maintenance scene.

#### 11.3.6 Compressor, condenser, evaporator, heater core, heat-pump (refrigerant + coolant hardware)

- **Compressor:** electric scroll compressor (EV) / belt-or-electric (Hybrid), mounted low front; drives the refrigerant loop; its on/off adds a faint (lore) load hum and a tiny idle-speed bump on Hybrid.
- **Condenser:** front, ahead of the radiator, sheds heat (rendered as part of the front-fascia radiator stack in the exterior spec).
- **Evaporator:** in the HVAC box; cools + dehumidifies (source of the "A/C makes water drip under the car" puddle — a cute cosmetic detail).
- **Heater core (Hybrid):** uses engine coolant heat. **EV:** high-voltage **PTC heater + heat-pump** instead (more efficient, affects range — a teachable EV detail: "running the heater cuts range").
- **Blower/fan:** variable-speed cabin blower (see 11.3.7).
> **Real-time:** all of this is **pure lore** except two optional cosmetics: the **A/C condensate puddle** decal when parked with A/C on, and a subtle **compressor-hum layer** in the ambient cabin sound when A/C is active. On EV, "heater reduces range" can be a scripted lesson tie-in (small SoC drain when cabin heat is high), otherwise omitted.

#### 11.3.7 Blower / fan & airflow feel

- **Blower:** variable 0–7 speed (or continuous in Auto); a real audible layer.
- **Feedback:** fan-speed arc on the climate screen; higher speed = louder, higher-pitched cabin airflow loop; a puff of visible "cold breath" from vents at very low outside temps (cosmetic particle).
> **Real-time:** **ship the fan audio + UI.** The looping airflow sound whose volume/low-pass tracks fan speed is the single most convincing "the HVAC works" cue for near-zero cost. Cold-breath particle = desktop-only garnish.

#### 11.3.8 HVAC sensors

- **Sensors (lore, feeding auto climate):** in-cabin temp sensor (with a tiny aspirator fan), outside-air temp, **solar/sun-load sensor** (dash-top, adjusts by sun angle/side), **humidity sensor** (on windshield, for auto-defog), evaporator temp, refrigerant pressure, air-quality sensor (auto-recirc when pollution detected).
- **Geometry:** all tiny/hidden; the sun-load and humidity sensors are small dark dots on the dash-top and windshield base — sub-LOD0.
- **Data path:** LIN-bus climate sensors → BDC.
> **Real-time:** only **outside-air temp** (world/weather) and a faux **humidity/defog trigger** matter. Auto-defog can key off "raining + cold" world state to spawn the windshield fog shader, which the driver clears with defrost — a nice interactive loop for the wipers/visibility lesson. All other sensors are lore.

---

### 11.4 Electronics — networks, ECUs & sensors

#### 11.4.1 In-vehicle networks (buses)

- **Automotive Ethernet (100/1000BASE-T1):** high-bandwidth backbone linking the domain controllers, cameras, ADAS fusion, and displays. Star topology through a central switch (in the IDC/gateway).
- **CAN / CAN-FD:** classic control bus for powertrain, chassis, safety-critical signals (motor torque, wheel speed, brake, steering angle, airbag). Multiple segments joined by the **central gateway**.
- **LIN:** low-cost sub-bus for slow body devices (window motors, mirror motors, HVAC flaps, ambient-LED nodes, rain/light sensor, seat switches).
- **FlexRay (lore, legacy option):** could appear on the chassis-dynamics loop; not required for game.
- **Central gateway:** routes/firewalls between buses; also the OTA + diagnostics (OBD-like) endpoint.
- **Geometry:** wiring harness is a lore/beauty-shot asset (loomed cables, connectors) — never gameplay geometry.

> **Real-time:** buses are a **naming/organizing fiction** in the codebase. There is no bus simulation; the ECS passes signals in-memory. But the *signal names* (e.g. `veh.wheelSpeed.FL`, `body.lin.mirrorFold`) follow the bus taxonomy so content/telemetry authors and the theory-lesson designers can reference realistic signal names. Harness geometry ships only in an optional "under the skin" cutaway view, if ever.

#### 11.4.2 Electronic Control Units (the ECU roster)

Beyond the 5 domain controllers (11.0.1), the lore ECU list (each a small potted box, greeble-only):

| ECU | Function | Sim mapping |
|---|---|---|
| Motor/Inverter Control Unit (×1 EV front, ×2 EV / ×1 Hybrid) | Motor torque, field control | `PowertrainSystem` |
| Engine Control Unit (Hybrid) | Fuelling, boost, ignition | `PowertrainSystem` (Hybrid only) |
| Battery Management System (BMS) | SoC, cell balance, thermal, contactors | `EPC/BMS` |
| Transmission Control (Hybrid multi-speed / EV reducer) | Gear/reduction | `PowertrainSystem` |
| Brake Control (ABS/ESC/regen-blend) | Wheel-slip, stability, regen blending | `VehicleDynamics` |
| Electric Power Steering ECU | Assist, return, lane-nudge torque | `VehicleDynamics` |
| Suspension/Damper ECU (adaptive) | Damper current, ride height | `VehicleDynamics` (lore feel) |
| Airbag/Restraints (SRS) ECU | Crash sensing, deploy, belt pretension | Collision event only |
| Body Control (BDC) | Lights, locks, windows, mirrors, HVAC flaps | `BodySystem` |
| Gateway/Telematics ECU | Bus routing, OTA, connectivity | `HmiSystem` |
| Instrument Cluster ECU | Cluster rendering | `HmiSystem` |
| ADAS ECU | Sensor fusion, assists | `AdasSystem` |
| Keyless/Immobilizer ECU | Key auth, start | Start interaction |
| Seat/Comfort ECU(s) | Memory, heat/vent, massage | `BodySystem` (cosmetic) |

> **Real-time:** none exist as assets. This table is the **traceability map** from lore ECU → shipped ECS system, so any engineer reading the design bible knows exactly where a "real" ECU's behavior lives in code. Greeble boxes only for open-hood/open-trunk beauty shots (desktop LOD0).

#### 11.4.3 Sensor suite — perception & ADAS

- **Front long-range radar (1):** in the lower fascia / behind emblem; ~77 GHz, ~200 m; feeds ACC/AEB. Housing: a flat radar-transparent panel (often the emblem itself) — model as a smooth body-colour or gloss-black plaque, no visible mesh vents.
- **Corner radars (4):** in bumper corners; blind-spot, cross-traffic, lane-change. Hidden behind fascia.
- **Cameras (perception, separate from the surround set):** forward tri-focal camera cluster behind the windshield (wide/main/tele) for lane/sign/object detection; a small black module at the rearview-mirror base. Model as a trapezoidal black housing on the glass.
- **Ultrasonic sensors (12):** 6 front + 6 rear bumper; Ø ~15 mm circular membranes flush in the fascia, body-colour painted; parking distance + low-speed AEB. These **are** visible geometry (small round inserts) — worth modeling as a ring of subtle circles.
- **Driver-monitoring camera (1):** IR camera on the steering column / cluster hood watching the driver for drowsiness/attention; tiny black lens + IR LEDs.
- **Lidar (lore, top variant):** roofline or grille lidar for the "highway-pilot" tier — a small smoked-glass strip; optional, may be omitted to keep the design timeless.

> **Real-time:** the physical sensors are **cosmetic geometry** (ultrasonic dots, windshield camera module, fascia radar plaque) that make the car read as modern. The *perception itself* is not sensor-simulated — assists read the sim's ground-truth world (traffic, lanes, obstacles) directly via `AdasSystem`, gated by plausible ranges/FOV so behavior feels sensor-like (e.g., blind-spot only flags cars within a rear-quarter zone). Driver-monitoring can trigger a scripted "keep your eyes on the road" attention lesson. Lidar omitted from base build.

#### 11.4.4 Sensor suite — vehicle dynamics & body

- **Wheel-speed sensors (4):** at each hub (ABS rings); feed vehicle speed, ABS/ESC/TC, TPMS-by-speed. → real physics values.
- **Steering-angle sensor:** column; feeds ESC, lane-assist, camera guide-line bending. → real (input).
- **Brake-pressure sensor(s):** master cylinder; feeds regen blend + brake telltale. → input.
- **Accelerometer + gyroscope (6-axis IMU):** the ESC/airbag inertial unit; **yaw, pitch, roll, lateral/longitudinal/vertical accel.** Feeds stability control, the g-meter, HUD/cluster, and crash sensing. → **directly the physics body's motion state.**
- **Yaw-rate sensor:** part of IMU; ESC's core input (compares intended vs actual yaw → intervenes).
- **TPMS (4 + spare):** valve-stem pressure/temp sensors per wheel; low-pressure telltale + per-wheel readout page. Ø ~40 mm sensor at each valve, unseen.
- **Ride-height / damper-position sensors (4):** adaptive suspension (lore feel).
- **Pedal-position sensors:** throttle + brake (drive-by-wire). → input.
- **Gear/shifter position sensor:** P/R/N/D + manual paddles. → input.

> **Real-time:** the **IMU/yaw/accel/wheel-speed/steering/pedal/gear** signals are **the physics engine's own state** — no sensor asset, they're read straight from Rapier's rigid body + input. This is where the "electronics" section actually touches gameplay hardest: ESC, ABS, traction control, and the g-meter are all IMU/wheel-speed consumers. TPMS is a scalar per wheel (only interesting if a puncture is modeled); ride-height sensors are lore.

#### 11.4.5 Sensor suite — environment & convenience

- **Rain sensor:** windshield IR sensor (at mirror base) → auto-wipers + auto-defog + closes windows/sunroof if rain detected while parked (lore). Model: part of the mirror-base module.
- **Light sensor:** ambient-light photodiode (dash-top or mirror base) → auto headlights + cluster day/night theme + display brightness.
- **Sun-load sensor:** dash-top, per-side solar heating (HVAC).
- **Humidity sensor:** windshield, auto-defog.
- **Air-quality sensor:** intake, auto-recirc.
- **Seat-occupancy sensors:** pressure mats → seatbelt reminder per seat, airbag suppression for empty/child seat, "passenger present" for the cluster/airbag telltale.
- **Seatbelt buckle sensors:** per seat → belt-reminder telltale + chime (lesson-relevant).
- **Door sensors:** ajar switches per door + hood + trunk → door-ajar telltale, interior-light trigger, "door open" warning if moving.
- **Window position sensors (Hall):** per window → anti-pinch, one-touch auto, position memory.
- **Proximity/keyless sensors:** door-handle capacitive touch (lock/unlock), approach detection for the **welcome sequence**, key-in-range for start.

> **Real-time:** the **high-value, lesson-relevant** ones ship as real logic: **rain sensor** (auto-wipers + spawns rain effect handling), **light sensor** (auto-headlights + day/night theme, keyed to world time-of-day), **seatbelt + seat-occupancy** (belt-reminder chime/telltale — a driving-lesson staple), **door sensors** (ajar telltale + interior-light + welcome/exit triggers), **keyless proximity** (fires the welcome light sequence when the player approaches/enters). Sun-load, humidity, air-quality, window-pinch = lore/cosmetic. Seatbelt logic is worth wiring because "fasten seatbelt first" is an examinable behavior in the theory track.

#### 11.4.6 12 V / low-voltage & power distribution (lore)

- **12 V battery** (or DC-DC from HV pack on EV) powers all the low-voltage electronics above; a **48 V mild-hybrid rail** (Hybrid) runs the e-supercharger/starter-generator and some heavy loads; the **400 V (Hybrid) / 800 V (EV)** traction bus powers motor(s) + fast charge + PTC heater + A/C compressor.
- **Fuse/relay boxes:** engine-bay + cabin (behind a kick-panel). Greeble geometry for beauty shots.
- **Charging port(s):** an AC + DC-fast combined inlet behind a motorized flap on a rear quarter (EV) / a fuel door + a smaller charge flap (Hybrid PHEV). The flap has its own **light ring** that pulses during charging (green flow → solid when full).

> **Real-time:** electrical distribution is entirely lore. The **charge-port flap** is real interactive geometry (motorized open/close animation, light ring) if a charging feature/station exists; otherwise it's a static closed flap. The 12/48/400/800 V rails are just names attached to the powertrain lore.

---

### 11.5 Lighting — interior ambient & functional; exterior signatures noted

> Exterior head/tail/DRL lamp *hardware geometry* is owned by the exterior/body spec; here we document the **light behavior, animations, and interior lighting** the systems layer drives. Cross-reference exterior spec for lens/housing PBR.

#### 11.5.1 Ambient interior LED system

- **Purpose:** the cabin mood-lighting network — the single biggest "premium at night" multiplier.
- **Coverage / geometry:** continuous light-guide strips run the **full dash width**, into both **door cards** (upper + lower runs), around the **center console**, under the **seats (footwell)**, along the **door-pull handles**, around the **cup-holders**, the **map-pocket**, the **speaker rings**, and a **headliner perimeter** strip on top trim. Each strip = a frosted acrylic light-guide (2–6 mm) edge-lit by RGB LED nodes every ~50–80 mm.
- **Colour/behavior:** **30-colour** palette OR the **mode-linked** auto-colour (Eco teal, Comfort white, Sport amber, Sport+ red, Individual custom). Brightness auto-dims at night, ramps with door-open. Supports **multi-zone** (e.g., dash one colour, doors another) on top trim and slow **colour-cycle "breathing"** ambience.
- **Materials/rendering (LOD0):** emissive light-guide meshes (thin extruded strips) with an **emissive gradient texture** so the light falls off along the run (edge-lit look, brighter near LED nodes). They **cast real light** into the cabin via a few baked/area lights or emissive GI so the colour spills onto leather/trim — this spill is what sells it.
- **Gameplay interaction:** colour picker in settings; **mode-linked colour change** is part of the synchronized drive-mode beat (11.1.7). Turn-signal and warning events can **flash the door ambient red** (e.g., blind-spot/collision) as a "haptic-by-light" cue.

> **Real-time:** ship ambient LED as **emissive strip meshes + a single tinted point/area light or a cheap emissive-bloom** per major zone (dash, 2 doors, footwells). Colour is a **material uniform** driven by the drive-mode enum — so changing mode recolours everything for free. On phone: emissive strips only, no dynamic light spill (bake a subtle static tint into the interior lightmap and just swap the strip emissive colour). The blind-spot/collision **red door flash** is kept — high safety-lesson value, trivial cost. This is a top-3 highest-ROI cosmetic system: enormous perceived quality for a uniform swap.

#### 11.5.2 Door lighting

- **Puddle lights:** downward LED under each door mirror + lower door edge projecting a soft pool (optional **maker-emblem-free logo projection** — use an abstract motif, never a brand) onto the ground when doors unlock/open. Warm white or accent.
- **Door-edge warning lights:** small red LED on the trailing door edge, lights when the door is open (warns passing traffic/cyclists — a lesson-relevant "dooring" safety detail).
- **Door-handle & door-pocket lights:** part of ambient network.
> **Real-time:** puddle light = a **projected texture / spotlight + a soft ground decal** that fades in on unlock/open (welcome sequence). Door-edge red LED = a small emissive + optional tiny spot; worth it for the safety-lesson tie-in ("check before opening"). Phone: ground decal only, no dynamic spot.

#### 11.5.3 Footwell lighting

- Front + rear footwell LEDs, colour-linked to ambient; brighten on door-open, dim while driving. Cast a soft pool onto the floor mats.
> **Real-time:** emissive + one small tinted light per footwell (front only on phone). Colour follows the ambient uniform.

#### 11.5.4 Dashboard-strip / decor-inlay lighting

- The full-width dash light-guide (and any backlit decor inlay — e.g., a laser-etched pattern that glows) is the hero ambient element; can display a subtle animated pattern (e.g., a slow left-to-right shimmer on welcome).
> **Real-time:** core ambient strip (11.5.1). The animated etched-inlay shimmer is a desktop-only scrolling-emissive nicety.

#### 11.5.5 Cup-holder, storage & map-pocket lighting

- Small LEDs ringing the cup-holders, inside the center armrest bin, door map-pockets, and the wireless-charging pad (which also has a "charging" indicator LED — amber charging, green full, blinking = misaligned phone).
> **Real-time:** emissive rings, ambient-colour-linked; the wireless-pad indicator is a tiny state LED (nice for the "phone charging" cosmetic). Mostly omitted on phone.

#### 11.5.6 Reading / map lights

- Front pair + rear pair of directional LED spots in the headliner/overhead console; touch-sensitive lenses; warm white; individually aimable (lore). Front console also has the sunroof/panoramic-shade control cluster.
> **Real-time:** each = a toggleable small spotlight + emissive lens. Ship front pair as interactive (click to toggle) on desktop; phone = static emissive, non-interactive.

#### 11.5.7 Vanity / visor mirror lights

- Illuminated vanity mirror behind each front sun-visor: a lid that slides/flips to reveal a mirror flanked by soft LED strips; light turns on when the cover opens.
- **Moving parts:** visor rotates down (hinge, ~90°), lid slides (~40 mm) or flips (hinge), mirror revealed, LEDs fade on.
> **Real-time:** visor-down is a possible interactive animation on desktop (rig: one hinge bone); the vanity light = emissive strips that toggle with the lid. Low priority — likely lore/omitted on phone; visor may be a static-up prop.

#### 11.5.8 Glovebox & storage-compartment lights

- Glovebox interior LED (on when open, via the glovebox door switch); center-console bin light; trunk/frunk lights.
> **Real-time:** emissive that toggles with the compartment-open state; only if those compartments are openable in-game (glovebox/trunk may be static → then omit).

#### 11.5.9 Trunk / frunk lighting

- Trunk LED strip(s) + a portable removable light (lore); frunk (EV, front storage) light. On when lid open.
> **Real-time:** emissive strip tied to lid-open; ship only if the trunk/frunk opens in gameplay (e.g., a "load cargo" scene). Otherwise lore.

#### 11.5.10 Welcome / approach sequence (animation)

- **Trigger:** key-in-range + door-handle-touch/approach (proximity sensor).
- **Choreography (LOD0):** exterior — DRLs + tail-lights **sweep on** (a flowing left-to-right "eyelid" animation), maker-emblem backlights, puddle lights project, indicators do a single courtesy blink; interior — ambient LEDs **fade up in a wave** (dash → doors → footwells), cluster + center display **boot with the brand-neutral start animation**, seats/mirrors adjust to the driver profile. ~2–3 s total, orchestrated by the BDC.
> **Real-time:** a **scripted timeline** fired on player-approach/enter: sequence the emissive fade-ups + a DRL/tail sweep + display boot. It's all emissive/uniform animation → cheap and a phenomenal first-impression beat. Ship a simplified 2 s version; phone gets an even shorter fade. This is worth doing well — it's the player's first frame of the car.

#### 11.5.11 Exit / farewell sequence (animation)

- **Trigger:** park + door-open/exit + walk-away lock.
- **Choreography:** ambient LEDs **linger then fade** (a "follow-me-home" that stays lit while you gather things), footwell/puddle lights guide the exit, exterior lights do a farewell sweep + lock double-blink + mirror-fold, then everything fades to dark in sequence.
> **Real-time:** mirror-image of the welcome timeline (reverse the fade wave) fired on exit/lock. Ship the LED linger-and-fade + lock double-blink + mirror-fold. Cheap, satisfying closure beat.

#### 11.5.12 Turn-indicator animation (exterior behavior)

- **Sequential/dynamic indicators:** front + rear turn signals animate as a **flowing sweep** outward (segmented LED bar, ~6–10 segments lighting in sequence, ~150 ms sweep, repeat at ~1.5 Hz) — a signature modern look. Amber. Hazards = all four sweeping in sync. Lane-change tap = 3 courtesy blinks.
- **Interior tie-in:** cluster turn telltale + audible tick synced to the flash; ambient can echo.
> **Real-time:** **ship this** — turn signals are lesson-critical (signaling is examined). Implement as an emissive segment animation (or a scrolling emissive mask on a single lens mesh to fake segments) + the cluster telltale + tick sound. The sequential sweep is a cheap scrolling-UV/mask trick. Keep on all platforms.

#### 11.5.13 Brake-light animation & behavior

- **Behavior:** tail-lights at a **dim running level**, brake application raises to **full brightness** instantly; **hard braking / ABS** triggers an **emergency-stop flash** (brake lights or hazards pulse rapidly ~4 Hz) to warn following traffic — a real safety feature and a great lesson visual. Reverse lights (white) on R gear. A full-width light-bar signature connects the tails.
- **Materials/rendering:** red lens (transmissive red, roughness ~0.2, clearcoat), emissive driven by a **brake-intensity value**; running vs brake = two emissive levels; the light-bar uses an emissive gradient.
> **Real-time:** **ship** — brake lights read the physics **brake input / deceleration**; running+brake two-level emissive is trivial. The **emergency hard-brake flash** keys off |deceleration| or ABS-active and is a fantastic, cheap safety-lesson visual (and it teaches following distance from the driver's-eye view of AI traffic). Reverse lights on R gear. Full-width bar = emissive strip. Keep everywhere.

#### 11.5.14 Headlights / DRL / adaptive beam (interior-controlled behavior)

- **Behavior the systems layer drives:** auto on/off (light sensor), **auto high-beam** (dips for oncoming/lead traffic via the forward camera), **adaptive matrix beam** (shadows out other cars while lighting the rest — lore), cornering lights (swivel/extra LED into the turn with steering angle), DRL signature always-on by day, front indicators dim the adjacent DRL segment while flashing.
- **Cluster tie-in:** high-beam blue telltale, auto-light green, adaptive-beam icon.
> **Real-time:** ship **low/high-beam toggle + auto-on at dusk/tunnel** (world-light driven) + the blue high-beam telltale + DRL emissive. Real projected light = a couple of spotlights + a baked cookie/gobo texture for the beam pattern on desktop; phone uses a simpler cone + a ground light-pool decal. Adaptive matrix/cornering = desktop-only approximations (swivel one spot with steering). Headlight on/off and high-beam etiquette are examinable → the toggle + telltale must ship. Night driving is a core lesson context.

#### 11.5.15 Interior lighting control logic summary

- All interior lighting is orchestrated by the **BDC** over **LIN** (lore). Master inputs: door-open state, ignition/drive state, ambient light level, drive mode, ADAS warnings, welcome/exit triggers, user settings.
- **Priority/override:** safety flashes (blind-spot/collision red) override mood colour momentarily; night dimming overrides brightness; user "off" disables mood but not functional/warning lights.
> **Real-time:** implement as the `LightingSystem` reading a small set of inputs (mode enum, door state, world light, ADAS flags, settings). A single priority resolver decides each strip's colour/intensity per frame (cheap; it's just uniform selection). This centralization means artists author strips once and the system drives them consistently.

---

### 11.6 Cross-discipline handoff notes

- **3D / Blender artists:** model the visible geometry — center + cluster glass slabs, dash blade + outboard vents (with a 1–2 bone louvre rig), ultrasonic dots, windshield camera module, radar plaque, charge-port flap, ambient light-guide strips (as thin emissive extrusions with a falloff-gradient UV), puddle/footwell/reading-light lenses, vanity visors (hinge rig), turn/brake/DRL lens meshes (UV laid out for a scrolling emissive mask so sequential animation works). ECUs/harness only for optional cutaway LOD0.
- **Material artists:** author two emissive states minimum for every lamp (running/active); tail-light red-transmissive + clearcoat; ambient strips need the **along-run falloff gradient** + a single tint-able emissive channel driven by a colour uniform; screen glass = clearcoat 1.0 + smudge roughness (LOD0 only). Provide the beam **gobo/cookie** texture for headlights.
- **UI / engine devs:** build the UI as an in-engine 2D scene → RTT for center (2560×1440→1024×576→512×288) and cluster (1920×720→960×360→480×180), refresh-on-change; the **drive-mode enum is the master accent source**; reuse the world road-graph ortho render for the nav map; screen-space HUD overlay for the head-up display; wire the ~8 core screens + performance pages that read live physics.
- **Vehicle/physics programmers:** the IMU/wheel-speed/steering/pedal signals **are** the Rapier body state + input — expose them as named signals for cluster/HUD/g-meter/ESC/ABS/TC; ADAS assists read world ground-truth gated by plausible FOV/range; SoC/fuel are simulated scalars feeding gauges + eco-scoring.
- **Sound designers:** must-have loops/one-shots — HVAC blower loop (volume/LPF by fan speed), turn-signal tick (synced to indicator), warning chimes (seatbelt, door-ajar, blind-spot, collision, over-speed), drive-mode stingers, welcome/exit boot sounds, EV e-sound theme (speed-pitched) / Hybrid exhaust layer (level by setting), A/C compressor hum, indicator/telltale ticks, gesture/voice confirmation blips, charge-connect chime.
- **Animation teams:** rig + sequence the welcome/exit light choreography (emissive fade waves), sequential indicators, brake two-level + emergency flash, vent louvres, vanity visors, charge-port flap, mirror-fold, and the display boot/collapse.

---

### 11.7 Real-time build — the shortlist (what actually ships)

The **minimum shippable systems set** (everything else is lore/desktop-LOD0 garnish):

1. **Drive-mode enum** → recolours screens/ambient/cluster/HUD + swaps physics params (master system).
2. **Cluster** (Minimal + Performance): speed, power/RPM, battery/fuel, ~12 live telltales + bulb-check sweep, ADAS world-view, day/night.
3. **HUD** (screen-space): speed, limit, nav arrow, ADAS/warning flashes.
4. **Center screens** (~8): home, nav (world-graph map), media, phone (mock), climate (defog-functional), drive-mode carousel, camera (rear + 360), settings (~10 wired).
5. **Voice/AI orb** wired to the content-bank tutor pipeline.
6. **Ambient LED** (emissive strips + tint uniform, mode-linked) + welcome/exit sequences + safety red-flash.
7. **Functional exterior light behavior:** turn signals (sequential + tick + telltale), brake (two-level + emergency flash + reverse), headlights (low/high + auto-dusk + telltale), DRL.
8. **HVAC feel:** blower audio loop + climate UI + windshield defog interaction.
9. **Sensor-driven assists** reading world ground-truth: ACC, lane-keep nudge, blind-spot, AEB, auto-wipers, auto-lights, seatbelt/door telltales, parking guide-lines + ultrasonic arcs.
10. **Live physics signals** (IMU/wheel-speed/steer/pedals/SoC) feeding cluster, HUD, g-meter, ESC/ABS/TC, eco-scoring.

Everything in §§11.1–11.5 not on this list is **lore or cinematic-LOD0** and may be reduced to static geometry, a mock screen, or omitted entirely on the phone build without breaking the driving-education product.
## 12. Simulation Layer — Physics, Damage, Animation & Audio

> **Subject vehicle:** the fictional **Aerion V8e "Vanta GT"** — an unbadged, latest-generation luxury performance flagship sedan, offered in two drivetrain variants:
> - **V8e** — twin-turbo 4.0 L V8 + rear e-motor mild/plug-in hybrid (P2/P4 layout), all-wheel drive.
> - **eGT** — dual-motor full battery-electric, all-wheel drive.
>
> All brand-specific systems are neutralized to generic terms: **maker emblem** (front/rear badge), **central rotary controller** (console input dial), **AWD system** (torque-vectoring all-wheel drive), **drive-mode selector**, **active aero controller**. No real marques, logos, or proprietary names appear anywhere.
>
> This section is the **authoritative tuning contract** between the physics programmers, the damage/VFX team, the animation team, and the audio team. Every number below is a concrete authored default; where two variants differ, both are given. Numbers are game-plausible engineering values, not a manufacturer datasheet — they are chosen to be internally consistent so the vehicle *feels* like a 2,100 kg, 600+ kW performance sedan.

---

### 12.0 Reference Data Block (shared source-of-truth constants)

All disciplines read from this block. If a value changes, it changes here first and propagates.

| Symbol | Quantity | V8e (hybrid) | eGT (EV) | Unit | Notes |
|---|---|---|---|---|---|
| `m_kerb` | Kerb mass | 2,050 | 2,280 | kg | EV heavier from battery pack |
| `m_gross` | Gross mass (5 occ + cargo) | 2,470 | 2,700 | kg | +75 kg/occupant, +45 kg cargo |
| `L` | Wheelbase | 3.010 | 3.010 | m | Identical body-in-white |
| `t_f / t_r` | Track (front/rear) | 1.660 / 1.680 | 1.660 / 1.680 | m | |
| `Lo` | Overall length | 5.180 | 5.180 | m | |
| `Wo` | Overall width (excl. mirrors) | 1.950 | 1.950 | m | 2.130 m over mirrors |
| `Ho` | Overall height | 1.470 | 1.475 | m | EV +5 mm ride for pack |
| `h_cg` | CG height (kerb) | 0.480 | 0.455 | m | EV lower CG (skateboard pack) |
| `wd_f` | Static weight dist. front | 52 | 48 | % | V8e nose-heavy (engine), EV rear-biased |
| `Cd` | Drag coefficient | 0.26 | 0.22 | — | Active shutters closed |
| `A_f` | Frontal area | 2.28 | 2.28 | m² | |
| `Cl_f / Cl_r` | Lift coeff (front/rear, spoiler down) | −0.06 / −0.10 | −0.06 / −0.10 | — | Negative = downforce |
| `P_max` | Peak system power | 620 | 660 | kW | 831 / 885 hp |
| `T_max` | Peak system torque | 1,020 | 1,150 | N·m | At crank / at axle |
| `v_max` | Top speed (limited) | 250 (330 derestr.) | 260 | km/h | |
| `0–100` | 0–100 km/h | 3.1 | 2.7 | s | Launch mode |

---

### 12.1 Vehicle Physics

The physics model targets a **12-DOF rigid-body chassis + 4 independent suspension/tire units** (e.g. Rapier/PhysX vehicle controller, or a custom raycast/multibody hybrid). Below are the authored parameters, grouped by subsystem, with the LOD0 (full multibody) intent and the real-time fallback.

#### 12.1.1 Rigid body — mass, inertia & center of gravity

- **Mass:** use `m_gross` at spawn with configurable occupant/cargo deltas. Fuel/charge mass modeled: full 78 L tank ≈ 58 kg (V8e); battery pack fixed 640 kg (eGT, non-consumable).
- **Center of gravity (body-local, origin at front-axle centerline ground projection, +X rearward, +Y up, +Z right):**
  - V8e: CG at X = 1.445 m (52/48 → 0.48·L from front... i.e. 48% rearward = 1.445 m), Y = `h_cg` 0.480 m, Z = 0.000 m (laterally centered, −0.010 m offset toward driver at LOD0).
  - eGT: X = 1.565 m, Y = 0.455 m, Z = 0.000 m.
- **Inertia tensor (about CG), authored (kg·m²):**

| Axis | Meaning | V8e | eGT |
|---|---|---|---|
| `Ixx` | Roll | 620 | 700 |
| `Iyy` | Pitch | 3,150 | 3,400 |
| `Izz` | Yaw | 3,050 | 3,300 |
| `Ixz` | Roll-yaw coupling | −55 | −60 |

  > Derived from a raidus-of-gyration approximation `k = 0.28·L` yaw, `0.35·h` roll. EV values scaled by mass and lower CG.

- **Sprung / unsprung split:** sprung mass = `m` − 4×(wheel+hub+brake+half-arm). Unsprung mass **per corner ≈ 42 kg** (front, includes larger brake), **38 kg** (rear). Feeds ride quality and wheel-hop.

> **Real-time:** collapse to a single rigid body with a fixed inertia tensor per variant; occupant/fuel mass deltas dropped on phone. CG height still exposed as a tunable because it dominates rollover and load transfer feel.

#### 12.1.2 Weight distribution & load transfer

- **Static corner loads (gross, level):**
  - V8e: FL/FR = 6,050 N each, RL/RR = 5,580 N each.
  - eGT: FL/FR = 6,350 N, RL/RR = 6,880 N.
- **Longitudinal load transfer** under `a_x`: `ΔW = m·a_x·h_cg / L`. At 1 g braking, V8e transfers ≈ 3,850 N front. Governs nose-dive and rear-lift animation coupling (see 12.3.7).
- **Lateral load transfer** under `a_y`: distributed front/rear by roll-stiffness ratio (front 56% / rear 44%) — tunes understeer/oversteer balance. Anti-roll bars: front 32 mm (hollow), rear 26 mm; rear bar is a 2-stage active bar at LOD0 (disconnects for ride, stiffens for cornering).

#### 12.1.3 Tire model & grip (slip curves)

- **Tire spec:** staggered. Front **265/35 R21**, rear **295/30 R21**. Unloaded radius `R0`: front 0.353 m, rear 0.349 m. Section width front 0.265 m. Nominal cold pressure 2.4 bar front / 2.6 bar rear.
- **Model:** simplified **Pacejka Magic Formula** (combined-slip) at LOD0; brush/lookup-curve at real-time.
- **Longitudinal (Fx) MF coefficients (dry tarmac, µ_peak reference):**

| Coeff | Meaning | Front | Rear |
|---|---|---|---|
| `B` | Stiffness | 11.0 | 10.2 |
| `C` | Shape | 1.65 | 1.65 |
| `D` | Peak (×Fz) | 1.35 | 1.42 |
| `E` | Curvature | 0.35 | 0.38 |

- **Lateral (Fy) MF coefficients:**

| Coeff | Front | Rear |
|---|---|---|
| `B` | 9.5 | 9.0 |
| `C` | 1.40 | 1.40 |
| `D` (×Fz) | 1.30 | 1.36 |
| `E` | 0.90 | 0.92 |

- **Peak slip points:** longitudinal peak at **~9–11% slip ratio**; lateral peak at **~7° slip angle**, falling to ~0.85·peak by 14° (progressive, forgiving breakaway). Rear grip > front by design → mild stability, controllable oversteer only under power/lift-off.
- **Surface µ scalars (multiply `D`):** dry 1.00 · damp 0.85 · wet 0.70 · standing water/aquaplane 0.35 · gravel 0.55 · snow 0.30 · ice 0.12 · painted line 0.80 · Sofia cobbles (sim-specific) 0.75 dry / 0.45 wet.
- **Load sensitivity:** `D` falls ~6% per +50% Fz over nominal (tire saturation) — prevents unrealistic grip on the loaded outside tire.
- **Temperature & wear (LOD0 only):** grip ramps from 0.82 (cold, 20 °C) to 1.00 (optimal, 85 °C) to 0.90 (overheated, 120 °C). Wear 0→100% reduces `D` linearly to 0.80 and raises puncture risk.
- **Rolling resistance:** `Crr` = 0.011; contributes coast-down and range.
- **Relaxation length:** 0.45 m (front), 0.50 m (rear) — lag on force build-up, critical for steering feel; omitted on phone.

> **Real-time:** replace MF evaluation with a **2-axis lookup texture** (slip ratio × slip angle → normalized force) sampled per wheel per tick; temperature/wear frozen at 1.00; relaxation length dropped (instantaneous force). Aquaplane collapses to a single µ multiplier keyed to a global "wetness" scalar.

#### 12.1.4 Aerodynamics

- **Drag force:** `Fd = 0.5·ρ·Cd·A_f·v²`, ρ = 1.225 kg/m³. At 200 km/h (55.6 m/s): V8e Fd ≈ 1,050 N; eGT ≈ 890 N.
- **Active grille shutters:** closing drops `Cd` from 0.30 (open, cooling) to 0.26/0.22 (closed). Controller opens above coolant/inverter temp threshold or below 40 km/h.
- **Lift/downforce:** `Fz_aero = 0.5·ρ·Cl·A_f·v²` per axle. Deployable rear spoiler shifts `Cl_r` from −0.02 (retracted) to −0.10 (deployed at >120 km/h or Sport+), and front air-dam/active flap adds front downforce to keep aero balance ≈ 40/60. At 250 km/h deployed: ~600 N rear downforce — measurably raises high-speed grip and stability.
- **Yaw/side force:** crosswind model at LOD0 — lateral `Cs` = 0.55, applies side force + yaw moment (center of pressure 0.15 m ahead of CG → mild wind sensitivity). Drives the "wind buffet" steering correction and audio (12.4).
- **Slipstream/draft (multiplayer/traffic):** −25% drag when within 1.5 car-lengths behind another vehicle.

> **Real-time:** keep drag + a single downforce term as `k·v²` scalars per axle; spoiler state still toggles the coefficient (cheap and visible). Crosswind and draft dropped on phone; kept on desktop WebGL.

#### 12.1.5 Suspension

- **Layout:** front **double-wishbone**, rear **5-link**, with adaptive dampers (CDC) and (LOD0) active air springs on eGT / coil-over adaptive on V8e.
- **Geometry & travel:**

| Parameter | Front | Rear | Unit |
|---|---|---|---|
| Total travel (bump→rebound) | 155 | 165 | mm |
| Static ride (design) | at 60% bump reserve | at 58% | — |
| Spring rate (wheel) | 42 | 38 | N/mm |
| Damper — bump (low speed) | 3,200 | 2,900 | N·s/m |
| Damper — rebound (low speed) | 4,100 | 3,700 | N·s/m |
| Motion ratio | 0.62 | 0.68 | — |
| Camber (static) | −1.2 | −1.6 | deg |
| Toe (static) | +0.05 (toe-in) | +0.15 | deg |
| Caster | 7.5 | — | deg |
| Kingpin incl. | 13 | — | deg |

- **Adaptive damper modes:** Comfort (0.7× rates), Sport (1.3×), Sport+ (1.7×), plus per-wheel road-preview scaling at LOD0. Ride-height: −10 mm above 150 km/h (auto-lower), +25 mm "lift mode" below 30 km/h for driveway/kerb clearance (eGT air only).
- **Bump stops:** progressive, engage in last 25 mm of bump; modeled as a rising exponential force to avoid harsh bottom-out.
- **Anti-geometry:** anti-dive 55% front, anti-squat 40% rear — reduces pitch under braking/accel and couples to animation (12.3.7).

> **Real-time:** raycast suspension per wheel with a **linear spring + separate bump/rebound damping** and a hard bump-stop clamp. Motion ratio baked into effective rate. Adaptive modes become 3 preset rate multipliers. Road-preview and anti-geometry dropped on phone (visual pitch faked from `a_x` directly).

#### 12.1.6 Steering

- **Type:** electric power steering (EPS), variable-ratio rack; rear-wheel steering at LOD0 (±3° rear).
- **Ratios:** overall steering ratio **13.5:1** on-center, quickening to **10.8:1** at full lock. Steering-wheel lock-to-lock **2.4 turns** (±432° wheel → ±38° road wheel at front).
- **Rear-steer logic:** counter-phase (opposite) below 60 km/h for agility/tight turns; in-phase (same) above 60 km/h for stability. ±2.5° max.
- **Assist & feel:** assist torque curve falls with speed (heavy on-center at motorway pace, light at parking). Self-aligning torque fed from tire MF pneumatic trail → this is the primary force-feedback / steering-return signal and the driver of the steering-wheel return animation (12.3.5).
- **Ackermann:** ~60% (partial) — inside wheel turns slightly more.

> **Real-time:** fixed 14:1 ratio, 2.5 turns lock-to-lock, speed-scaled return-to-center spring approximating aligning torque. Rear-steer dropped on phone, kept as a subtle yaw-rate boost on desktop.

#### 12.1.7 Wheel & driveline inertia

- **Rotational inertia per wheel+tire:** front 1.35 kg·m², rear 1.42 kg·m² (21″ forged wheels). Governs how fast wheels spin up/lock — critical for wheelspin, ABS, and audio pitch.
- **Driveline lumped inertia** (engine/motor + flywheel + gearbox reflected): V8e ≈ 0.22 kg·m² at crank (rises with gear); eGT motor rotor ≈ 0.045 kg·m² ×2, geared 8:1.
- **Wheel-hop / cleat response:** unsprung mass + tire vertical stiffness (front 310 N/mm, rear 300 N/mm) → hop frequency ~13 Hz.

#### 12.1.8 Powertrain — torque curves

**V8e (twin-turbo 4.0 V8 + P2/P4 e-motor):**

- **Engine (ICE) crank torque curve** (N·m vs rpm), turbo spooled:

| rpm | 1,000 | 1,750 | 2,500 | 3,500 | 5,000 | 6,000 | 6,800 | 7,200 (redline) |
|---|---|---|---|---|---|---|---|---|
| Torque | 320 | 720 | 850 | 850 | 800 | 720 | 640 | fuel-cut |
| Power (kW) | 34 | 132 | 223 | 312 | 419 | 452 | 456 | — |

- **Turbo model:** two parallel turbos, boost 0→1.6 bar. **Lag:** target boost reached ~350 ms after tip-in at 3,000 rpm (spool inertia). **Wastegate** vents above 1.6 bar; **anti-lag/overrun** keeps ~0.4 bar on lift for fast re-spool (Sport+). Boost adds up to +260 N·m over naturally-aspirated baseline.
- **e-motor (P2/P4):** 160 kW / 320 N·m, **full torque from 0 rpm**, fills turbo lag ("torque fill") and enables e-only creep. Combined system peak `T_max` 1,020 N·m (blended, not simple sum — capped by driveline).
- **Engine braking:** −60 to −140 N·m on overrun (throttle closed), plus regen from e-motor (see brakes).

**eGT (dual-motor EV):**

- **Front motor:** 220 kW / 400 N·m. **Rear motor:** 380 kW / 750 N·m. Combined `T_max` at axle up to 1,150 N·m.
- **Motor torque curve:** flat max torque 0→5,500 rpm, then constant-power taper to 16,000 rpm (single-speed 8:1 reduction). No lag; instantaneous.
- **Launch/overboost:** 10 s overboost to 660 kW with battery/thermal headroom, else 560 kW continuous.
- **Regen:** up to −0.3 g / 250 kW deceleration; one-pedal mode configurable (off/low/high).

#### 12.1.9 Transmission & final drive

**V8e — 8-speed dual-clutch (DCT):**

| Gear | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | R | Final |
|---|---|---|---|---|---|---|---|---|---|---|
| Ratio | 4.71 | 3.14 | 2.11 | 1.67 | 1.29 | 1.00 | 0.84 | 0.67 | 4.20 | 3.15 |

- **Shift times:** 80–120 ms (Comfort), 40 ms (Sport+), with torque-cut and (Sport+) ignition-cut "crackle." Rev-match on downshifts. Launch control holds 3,500 rpm, dumps clutch with slip control.
- **Clutch model (LOD0):** two wet clutches, slip/lock states, thermal load; feeds creep, stall (n/a — hybrid creep), and shift shock.

**eGT — single-speed:** 8.0:1 reduction each axle; no shift events. Torque split front/rear continuously variable (default 30/70, up to 0/100 or 50/50).

- **Torque-vectoring (both variants):** rear e-diff / brake-based vectoring applies up to ±1,200 N·m side-to-side to rotate the car; couples to yaw controller (12.1.11).

> **Real-time:** DCT modeled as instantaneous ratio swap with a 60 ms torque dip + audio blip; clutch thermal/slip dropped. Torque-vectoring becomes a yaw-assist torque added to the body on phone.

#### 12.1.10 Brakes & ABS

- **Hardware:** front **6-piston** fixed calipers, 410 mm carbon-ceramic (optional steel 390 mm) discs; rear **4-piston**, 390 mm. Pad µ ≈ 0.42 (steel) / 0.55 (carbon-ceramic hot).
- **Brake torque capacity:** front ~4,200 N·m/wheel, rear ~2,600 N·m/wheel at full line pressure (180 bar).
- **Brake bias:** **64% front / 36% rear** static; dynamic EBD shifts up to 70/30 under heavy decel (load-transfer aware).
- **Regen blending (both):** e-motor supplies first −0.3 g; friction brakes blend in above that or as regen fades (low SoC, cold battery). Pedal feel simulated by a blended pressure model.
- **ABS behaviour:** target slip **10–12%**, per-wheel pressure modulation at ~15 Hz (LOD0 individual channels; real-time 4-channel simplified). Releases in ~30 ms when lock detected, re-applies ramped. On split-µ, yaw-limiting reduces high-µ side to keep the car straight. Cadence audible as pedal pulse + valve chatter (12.4). ABS can be disabled in a track mode (locks wheels → flat-spot + smoke).
- **Fade:** disc temp 20→700 °C; steel fades ~15% torque above 550 °C, carbon-ceramic negligible until 900 °C. LOD0 only.
- **Handbrake / e-park:** electronic parking brake clamps rear; a "drift"/rally handbrake mode fully releases rear brake grip for slides (arcade toggle).

- **ESC (Electronic Stability Control):** monitors yaw-rate error vs. a reference model (steer angle + speed). If understeer → brakes inside rear / cuts power; if oversteer → brakes outside front / adds vectoring. Intervention thresholds tiered: **On** (early, 3°/s yaw error), **Sport** (late, 8°/s), **Off** (track). Logs interventions for the driving-lessons scoring engine.
- **Traction control (TCS):** limits drive slip to target (8% launch, 4% cruise) via torque cut + brake. Snow mode lowers to 2%. Fully off in track.

> **Real-time:** ABS = 4-channel slip clamp (hold wheel slip ≤ 12%); EBD static bias only; fade dropped on phone (kept as a slow torque-reduction on desktop). ESC/TCS as yaw-error PID adding corrective yaw torque + throttle clamp. Regen blend simplified to a fixed decel offset.

#### 12.1.11 Integrated dynamics / drive modes

Drive-mode selector presets bundle the tunables above:

| Mode | Damper | Steer | Throttle map | ESC/TCS | Aero | Exhaust/Sound | Ride ht |
|---|---|---|---|---|---|---|---|
| Eco | Comfort | Light | Lazy, e-priority | On | Closed | Quiet | Normal |
| Comfort | Comfort | Medium | Linear | On | Auto | Balanced | Normal |
| Sport | Sport | Medium-heavy | Sharp | Sport | Auto | Open | −10 |
| Sport+ | Sport+ | Heavy | Aggressive, anti-lag | Late | Spoiler up | Loud, crackle | −10 |
| Track | Sport+ | Heavy | Instant | Off | Max | Loudest | −15 |
| Individual | user | user | user | user | user | user | user |

---

### 12.2 Damage System

Damage is authored as **discrete state stages per zone** driving (a) mesh swaps/blendshapes, (b) material parameter shifts (scratch/dent masks, decals), (c) physics changes, and (d) VFX/audio. A global `damage[zone]` float 0–1 per zone maps to stage thresholds. Persistent decals accumulate in a runtime damage mask (RT texture in UV space) for scratches/scuffs.

#### 12.2.1 Damage zones & health model

- **Deformable zones:** front bumper, hood, front-L/R fender, front-L/R door, rear-L/R door, rocker-L/R, rear-L/R quarter, rear bumper, trunk lid, roof, each wheel/hub, glass (windshield, 4 side, rear, sunroof), mirrors (2), headlights (2), taillights (2), grille, underbody.
- **Per-zone health** depletes by impact impulse projected onto the zone normal, scaled by relative speed and the striking body's mass. Threshold table below defines stage entry.
- **Structural integrity:** cumulative front/rear/side crush reduces chassis stiffness (LOD0) and can trip "undriveable" (radiator/wheel/suspension critical).

#### 12.2.2 Cosmetic damage — paint

| Stage | Trigger (impact/scrape) | Visual | Material change | Physics |
|---|---|---|---|---|
| 0 Pristine | — | Clean clearcoat | Clearcoat rough 0.05, metallic 0.9 | none |
| 1 Scuff | glancing <15 km/h | Matte scuff mask, no metal | +roughness 0.05→0.30 in mask, clearcoat 0→0.6 | none |
| 2 Scratch | scrape / key | Thin scratch decals, primer grey hints | Normal detail lines, albedo −value | none |
| 3 Paint chip | stone/impact | Chipped clusters, grey primer/silver metal spots | Albedo swap to primer (0.35 grey) then bare metal (metallic 1.0, rough 0.4) | none |
| 4 Deep gouge / rust (aged) | severe | Exposed metal + optional rust decal | Metallic 1.0 rough 0.6, rust albedo | none |

- **Paint stack (reference):** 3-coat metallic — base albedo **deep graphite `#1A1D22`** (or config color), metallic flake layer (metallic 0.85, aniso), clearcoat coat (IOR 1.5, clearcoat 1.0, clearcoat-rough 0.05). Damage masks blend downward through the stack.

> **Real-time:** scratches/scuffs accumulate into ONE RGBA damage mask (R=scratch, G=chip, B=dirt, A=wetness) sampled in the paint shader; no per-decal instances on phone. Rust/aging stage cut on phone.

#### 12.2.3 Structural / body deformation

| Component | Stage 1 | Stage 2 | Stage 3 (detach/fail) |
|---|---|---|---|
| **Front bumper** | Scuff + minor push-in (blendshape 0.3) | Cracked, hanging (blend 0.7, one mount broken, dangles on hinge constraint) | Detached → spawns physics debris prop |
| **Hood** | Dented (normal-map dent + blendshape 0.4) | Buckled, ridge crease, latch popped, lifts 5° | Folded up / torn (blend 1.0), or detaches at hinges → blocks view briefly then flies |
| **Fenders/doors/quarters** | Dent blendshape | Deep crease + panel gap widen | Door: sags on hinge, won't fully close; can be torn off in high-speed side hit |
| **Trunk lid** | Dent | Won't latch, bounces | Detach |
| **Roof** | Dent (rollover) | Crush blendshape (rollover) | — |
| **Underbody** | Scrape sparks VFX | Exhaust dent, drone rattle | Sump/pack pierce → leak (12.2.7) |

- **Deformation implementation:** LOD0 = layered **blendshapes** (per panel: 3–4 progressive crush targets) + runtime normal-map dents from a projected impact splat; skeletal detach uses breakable joints. Panel gaps widen via bone offsets.
- **Glass separation:** windshield can partially detach (spider then hole).

> **Real-time:** each panel = 1 pre-baked "dented" blendshape (0–1) driven by zone health; detach = swap to a broken variant + spawn a single simplified debris prop. No dynamic normal-splat on phone.

#### 12.2.4 Glass

| Stage | Windshield | Side/rear glass | Sunroof |
|---|---|---|---|
| 0 | Clear (transmission 0.95, IOR 1.52, rough 0.02) | same | same |
| 1 Cracked | Radial crack decal from impact point, refraction wobble | Crack decal | Crack |
| 2 Shattered-opaque | Dense white spider-web mask, transmission →0.4, heavy roughness | Frosted | Frosted |
| 3 Broken-through | Hole with jagged alpha, shards VFX burst | **Tempered → collapses to pebble particles** (falls out entirely) | Collapses inward |

- Windshield is laminated (cracks, stays in place). Side/rear/sunroof are tempered (shatter to cubes → particle burst + audio). Broken glass creates ground debris decals and glint sparkle.

> **Real-time:** crack = one decal + roughness bump; shatter = swap to opaque cracked texture and hide the pane (side glass) with a one-shot particle puff. No per-shard sim on phone.

#### 12.2.5 Lights & mirrors

- **Headlights:** 3 stages — hairline crack (spec bump) → cracked lens + one LED bank dark → smashed (emissive off on that side, exposed reflector mesh, glass shard particles). Broken side loses its beam projector/light.
- **Taillights:** crack → red lens shatter (emissive segment off) → housing gone.
- **Mirrors:** fold (see anim) → cracked mirror glass (reflection→noise) → housing dangling on wire → detached prop. Losing a mirror removes that reflection render (perf win).
- **Fog/DRL/turn units:** individually killable; a dead turn-signal bulb triggers the fast "hyper-flash" indicator behavior + dash warning (gameplay/education hook).

#### 12.2.6 Wheels, tires & suspension

| Failure | Trigger | Visual | Physics |
|---|---|---|---|
| **Tire puncture / blowout** | curb strike, debris, µ-spike, wear≥95% | Deflated sidewall blendshape, tread flap | Radius −40 mm, grip `D`×0.4, heavy pull to that side, rim rides on tread |
| **Rim bend** | pothole/curb | Wobble (radial runout offset) | Vibration force at wheel freq, slight grip loss, steering shimmy |
| **Wheel deformation/loss** | severe impact | Buckled rim mesh; or lug shear → **wheel detaches** and rolls (physics prop) | Corner drops to hub, sparks + gouge decals, huge grip loss, undriveable-ish |
| **Suspension arm bend** | jump landing / kerb | Camber offset (visible lean), toe change | Alignment shifts → constant pull, clunk audio, reduced travel |
| **Suspension collapse** | extreme | Corner bottoms out, wheel splayed | Rides on stop, massive drag, sparks |
| **Flat-spot** | ABS-off lockup | Tread flat patch decal | Periodic thump (wheel-rate vibration + audio) |

> **Real-time:** puncture = radius + grip change + a "flat tire" mesh swap + shimmy force; rim bend/flat-spot become a vibration + audio loop with a small mesh wobble; wheel-detach kept (it's dramatic and cheap) but the loose wheel is a simple sphere-collider prop.

#### 12.2.7 Fluids, smoke, fire, powertrain failure

- **Oil leak:** engine/sump breach → dark drip particle + ground decal trail; oil-pressure warning; after grace period, progressive power loss then seizure (V8e). 
- **Coolant leak:** radiator (front crash) breach → green/orange puddle + steam plume from grille; temp gauge climbs → limp mode → overheat stall.
- **Fuel leak (V8e):** tank/line breach → volatile puddle, raises fire risk.
- **Battery/HV fault (eGT):** pack pierce → power derate, orange "reduce speed" warning, thermal-runaway risk (smoke → fire), HV-isolation warning.
- **Smoke stages:** (1) light wisp from a hot component, (2) steady grey stream, (3) black billow (engine bay) / white (coolant) — density + emission tied to damage float. Particle systems anchored to bay/wheel/underbody sockets.
- **Fire stages:** (1) flicker/embers at leak point, (2) engine-bay flame with heat-haze + light emitter, (3) fully involved → forced vehicle disable / respawn (education mode fades out; arcade allows spectacle). Fire adds a flickering point light + emissive + smoke column + roar audio.
- **Airbag deployment:** on impact above ~25 km/h Δv into a rigid zone: driver + passenger front bags + side curtains inflate (fast blendshape/inflate anim, 40 ms), deflate over 2 s, then hang limp; steering-wheel center opens; loud pop + powder puff VFX; belt pretensioners fire (see anim). Windows may crack from cabin pressure. Post-deploy, HUD shows crash state and (education mode) an eCall/"assess damage" prompt.

> **Real-time:** one shared smoke emitter with color/density param per fault type; fire = emissive card + light + smoke, no fluid sim. Fluid puddles = a single decal + drip sprite. Airbags = simple inflate blendshape + pop SFX; powertrain-failure stages collapse to "limp mode → dead."

#### 12.2.8 Interior damage

- Cracked instrument cluster / center display (glass crack decal + flicker/glitch shader on the screen RT).
- Deployed airbags occlude the wheel/dash.
- Dislodged trim (glovebox drop, sun-visor swing) on heavy hits.
- Steering-wheel/pedal offset if column damaged.
- Shattered side glass leaves interior pebble decals and lets rain in (wet-seat darkening).

> **Real-time:** screen-crack overlay + optional visor swing only; rest cut on phone.

---

### 12.3 Animation System

All animated parts are **skeletal (bone-driven)** unless noted; drivers are either **player input**, **physics state**, or **timeline/state-machine**. Convention: axes in body-local space (X rearward, Y up, Z right). Ranges are authored maxima; easing is per-driver.

#### 12.3.1 Doors (×4) + fuel flap + charge port

| Part | Type | Axis | Range | Driver | Notes |
|---|---|---|---|---|---|
| Front doors | Hinge (rotate) | vertical (Y) at A-pillar hinge | 0→67° | player/AI open; button/handle | 2-stage detent at 30°; check-strap resistance; gravity sag if parked on slope |
| Rear doors | Hinge | Y at B-pillar | 0→72° | same | wider for egress |
| Handles | Flush pop-out | outward (Z) + tilt | 0→22 mm out | approach/keyfob/press | auto-deploy on unlock, retract at 8 km/h |
| Fuel flap (V8e) | Hinge | X | 0→95° | press/UI | reveals capless filler |
| Charge port (eGT) | Sliding/hinged cover | — | 0→90° | press/UI | inner LED ring, charge-state emissive |

- **Handle+latch chain:** handle pull (0→18 mm) → latch release (rotate 25°) → door free to swing. Door close: swing → latch primary (soft) → secondary (full) with 2-stage clunk + slight body rock. Soft-close motor (LOD0) pulls last 10° automatically.

#### 12.3.2 Windows (×4) + rear quarter (if any)

- Type: vertical slide. **Axis Y, range 0→420 mm** (fully down into door). Driver: switch hold / one-touch auto. Speed ~120 mm/s (auto), variable with hold. Anti-pinch reverses on obstruction (LOD0). Slight rearward tilt follows the belt-line rail (not pure vertical — follows a spline). Frameless glass drops 8 mm on door-open, re-seals on close (LOD0 detail).

#### 12.3.3 Sunroof / panoramic roof

- Two-stage: **tilt** (rear edge lifts, rotate X 0→15°) then **slide** (translate X rearward 0→640 mm, glass retracts over/under roof). Separate **sunshade** slides independently (0→720 mm). Driver: switch (tilt/vent/full presets). Wind-deflector mesh flips up (rotate 0→55°) when open past vent.

#### 12.3.4 Seats (driver-focused, all 4 capable)

| Motion | Axis | Range | Driver |
|---|---|---|---|
| Slide fore/aft | X | 260 mm | seat switch / entry "easy-exit" |
| Recline backrest | pivot Z at hip | 90°→160° | switch |
| Height (cushion) | Y | 60 mm | switch |
| Cushion tilt | pivot Z front | ±7° | switch |
| Lumbar | inflate blendshape | 0→1 | switch |
| Bolster (Sport) | inflate blendshapes L/R | 0→1, auto in cornering | drive mode + `a_y` |
| Headrest | Y | 50 mm | switch |
| Easy-exit | slide back + recline forward combo | preset | door-open/ignition-off |

- Belt-integrated seats: buckle animates with recline. Massage (LOD0) = looping bladder inflate cycle.

#### 12.3.5 Steering wheel, column, pedals

- **Steering wheel:** rotate about column axis, **±432° (2.4 turns)**, driver = steering input; self-centers via aligning-torque model when hands off. Paddle shifters (rotate ~15° each, spring return, trigger up/down-shift). Column: tilt (±5°) + telescope (60 mm) adjust (motorized, ties to easy-entry). Wheel-mounted buttons/scroll wheels animate on press.
- **Pedals:** accelerator (rotate 0→28° about top hinge, driver = throttle input, non-linear pad travel), brake (0→22°, driver = brake input, firmer), (V8e has no clutch pedal — DCT). Pedal travel visually couples to input value; brake pedal pulses subtly during ABS.
- **Gear selector:** column-stalk or console toggle for P-R-N-D + manual gate. Animate detent throws; manual gate nudge for +/−. Rotary variant: rotate to P/R/N/D positions. Illuminated position emissive.

#### 12.3.6 Exterior active aero & functional bits

- **Rear spoiler:** deploys — translate up (Y 0→65 mm) + rotate to angle-of-attack (0→18°), 2-stage (auto at 120 km/h, max in Sport+/braking air-brake at 45°). Driver: speed + mode + braking. Smooth 0.8 s actuation.
- **Active grille shutters:** vane array rotate (0→90°, closed→open), driver = cooling demand/speed/aero. Visible flap movement behind the maker-emblem mesh.
- **Front splitter / air-dam flap:** lowers (rotate 0→12°) at speed for front downforce.
- **Active side skirts / diffuser flaps (LOD0):** minor deploy.
- **Antenna / lidar-dome (if AV trim):** none exposed; shark-fin static.

#### 12.3.7 Suspension & body attitude (physics-driven)

- **Per-wheel suspension compression:** knuckle/arm/spring/damper bones driven by the physics contact — visible **wheel travel ±80 mm**, spring coil compresses (scale/blendshape), damper shaft slides, arms rotate at inner pivots, driveshaft plunges/articulates, tie-rod follows steering.
- **Body pitch/roll/heave:** chassis attitude from load transfer — **dive** under braking (nose down, up to ~2.5°), **squat** under accel (~2°), **roll** in cornering (up to ~3.5° at limit, less with active bars). These are emergent from the sim at LOD0.
- **Wheel spin & steering:** wheel meshes rotate at `ω = v_wheel/R` (+ slip); front wheels steer with Ackermann; rear wheels micro-steer (rear-steer).
- **Brake caliper glow (LOD0):** disc emissive ramps orange→red with temperature.

> **Real-time:** suspension bones driven directly by the raycast compression value (spring/damper as simple slide); body pitch/roll faked from `a_x`/`a_y` on phone (a small additive rotation on the body mesh) rather than emergent. Driveshaft/tie-rod articulation simplified or dropped on phone.

#### 12.3.8 Wipers & washers

- **Front wipers (2):** tandem sweep, rotate about pivots — **park→full ~110° arc**, driver = wiper state (Int/Lo/Hi + speed-linked auto/rain sensor). Intermittent delay scales with rain intensity/speed. Blades flex (slight bend at reversal). Washer: fluid spray particle from cowl/arm jets, triggered by stalk pull, wipers auto-run.
- **Rear wiper (if fitted):** single arm, 0→90°.
- **Headlight washers (LOD0):** pop-up jets spray on headlight when washer used at night.

#### 12.3.9 Lighting animations

- **Startup "welcome" sequence:** DRL sweep, taillight animation, sequential turn-indicator (segments light in sequence, 5-seg L/R), emissive ramps.
- **Turn signals:** sequential emissive 1.5 Hz (hyper-flash 3 Hz if a bulb "out" from damage).
- **Headlights:** low/high/auto; matrix beam (LOD0) shapes around traffic; leveling motors tilt beam with load/pitch. Cornering lights swivel with steering (±15°).
- **Brake lights:** instant emissive on brake input, brighter with harder braking (LOD0); high-mount third light.
- **Reverse lights, fog, hazard (all 4 sync).**
- **Interior:** ambient light strips (color-configurable emissive), footwell, door-projected "puddle" logo (maker emblem) on open, dome lights fade on door open/close, screen brightness.

#### 12.3.10 Displays & UI (animated shader/RT surfaces)

- **Digital instrument cluster:** render-target texture — tach sweep, speed, gear, ADAS, warnings; animates with physics (needle/bar rpm & speed), mode-change transitions, warning blinks.
- **Central touchscreen (central rotary controller also drives it):** live UI RT, map, media, climate; touch ripple/press feedback.
- **Head-up display (HUD):** projected onto windshield RT layer — speed, nav arrows, limits.
- **Button/switch micro-anim:** every physical button depresses (translate ~1 mm) + backlight state; central rotary controller rotates + click detents; volume/scroll wheels spin; climate dials rotate; toggle switches flip.

> **Real-time:** cluster/HUD are simplified RT or overlay UI (not full 3D-projected) on phone; button depress reduced to material/backlight state swaps; matrix beam and cornering swivel dropped on phone.

---

### 12.4 Audio

Audio is a **layered, parameter-driven** system. Primary continuous parameters exposed to the mixer: `rpm`, `throttle` (0–1), `load` (engine load / motor torque demand), `speed`, `boost` (bar), `slip` (drive & lateral), `gear`, `surface`, `wetness`, `damage`. Engine/motor uses **granular/crossfaded RPM loops** (or a wavetable/FMOD-style RPM graph) blended by load; everything else is triggered one-shots or speed/param-mapped loops. All sources are positioned (spatialized) for interior vs exterior listener with distinct cabin-filtered buses.

#### 12.4.1 Engine / motor (the hero sound)

**V8e (twin-turbo V8):**

- **Layers, each an RPM-mapped loop set crossfaded by `rpm` and blended on-load vs off-load (overrun):**
  - Combustion body (low) — on-load & off-load loop banks, 800→7,200 rpm.
  - Mid harmonic / "V8 burble" layer.
  - High-rpm intake/induction snarl.
  - Exhaust layer (routed to a separate exterior emitter at the tailpipes; interior gets a filtered/attenuated version; valved exhaust opens in Sport → brighter, louder, +low-end).
- **RPM mapping:** pitch follows rpm; crossfade points every ~500 rpm to avoid artifacting; sample-and-hold blip on shifts.
- **Load blend:** on-throttle = fuller/harsher; closed-throttle overrun = decel burble + pops/crackle (Sport+ ignition-cut → distinct "crackle/bang" one-shots layered on overrun).
- **Idle:** dedicated idle loop (~700 rpm) with lopey character; subtle random-mod to avoid looping tell.

**eGT (EV):**

- **Motor whine:** inverter/gear whine loop, **pitch = motor rpm** (single-speed → tracks road speed directly). Layered forward (drive) and regen (decel) tonal banks; magnitude = torque demand.
- **Synthetic exterior sound (AVAS):** legally-required pedestrian sound below ~30 km/h — a designed loop, pitch/volume by speed, plays at exterior emitter.
- **Optional cabin "engine character" theme:** driver-selectable synthesized performance sound layered on the whine (mode-dependent).

#### 12.4.2 Forced induction & driveline (V8e)

| Source | Trigger | Mapping / layering |
|---|---|---|
| **Turbo spool** | boost rising with rpm+throttle | whistle loop, pitch↑ & vol↑ with `boost` and `rpm` |
| **Wastegate / BOV** | throttle lift with boost present | flutter/whoosh one-shot; intensity = boost dumped |
| **Anti-lag pop** | overrun in Sport+ | crackle bank |
| **Transmission (DCT)** | shift events, gear whine at load | shift clunk/thunk one-shots (softer Comfort, sharper Sport); light gear whine loop in low gears under load |
| **Differential / e-diff** | high torque, vectoring | subtle whine/clutch chatter under load |
| **Driveshaft/CV** | tight-lock + power | faint tick (LOD0) |

#### 12.4.3 Tire, road & aero

- **Tire roll (road noise):** surface-dependent loop, **volume/filter = speed**, timbre swapped by `surface` (smooth asphalt, coarse chip-seal, cobbles, gravel, wet-hiss). Wet adds a hiss/spray layer scaled by `wetness`×speed; aquaplane whoosh at thresholds.
- **Tire slip/screech:** grip-loss loop — **onset & pitch = `slip`** (both longitudinal spin and lateral scrub); distinct chirp (brief lock/launch) vs sustained squeal (cornering) vs gravel-spray (off-tarmac). Flat-spot/lockup adds thump.
- **Wind noise:** **volume/filter = speed**, plus buffet layer with crosswind/yaw and window-open state (open window → louder, boomy resonance, "throb" at certain speeds). Mirror/A-pillar turbulence layer at high speed.
- **Underbody/stone strike:** gravel pings one-shots on loose surfaces.

#### 12.4.4 Suspension, chassis & impacts

- **Suspension:** bump/rebound thuds and creaks — triggered by damper velocity/compression events over a threshold; big hit = "clonk," small = soft thud; bushings creak on slow articulation (parking). Anti-roll bar & jounce-bumper contact on hard hits.
- **Body/chassis:** rattles on rough surfaces (LOD0, increase with `damage`), trunk/loose-part rattle when damaged.
- **Collisions/scrapes:** impact one-shots scaled by impulse (soft scuff → crunch → heavy crash), material-aware (metal-on-metal, glass smash, plastic bumper crack); continuous scrape loop while sliding along a wall (pitch/vol = scrape speed). Underbody bottom-out scrape + spark sizzle.

#### 12.4.5 Braking

- **Brake friction:** light pad-rub loop at low speed; disc "groan" when cold/wet; **squeal** at high pad load/temp.
- **ABS:** rapid mechanical chatter/buzz loop + pedal pulse haptic cue, gated by ABS-active flag (cadence ~15 Hz).
- **Regen (eGT):** subtle whine shift on decel; brake-blend transition click.
- **E-park brake:** motor whir + clunk on engage/release.

#### 12.4.6 Body & convenience motors (one-shots / short loops)

| Source | Trigger | Notes |
|---|---|---|
| Door open | latch release | handle click → hinge creak → (open) |
| Door close | close event | 2-stage: soft catch → solid "premium thunk"; soft-close motor whir pulls it shut |
| Window up/down | switch | motor whine loop while moving + end-stop thud; frameless seal squeak |
| Sunroof/shade | switch | motor whir + slide rumble + end clunk; wind-deflector flap |
| Seat motors | adjust | low servo whine per axis; end-stop soft stop |
| Mirror fold/adjust | lock/unlock, switch | tiny servo whir |
| Charge-port / fuel flap | press | actuator click |
| Trunk/frunk power | button | motor whir + strut hiss + latch |
| Wipers | wiper on | rubber-on-glass sweep (dry = judder/squeak; wet = smooth swish), reversal thunk at park; washer pump buzz + spray patter |
| Handles pop-out | unlock | soft mechanical extend |

#### 12.4.7 Electrical, HVAC & cabin ambience

- **Starter / power-up:** V8e crank-and-catch one-shot (starter whir → fire-up → settle to idle); shutdown run-down. eGT "ready" chime + system power-up whine, contactor clunk (HV ready), shutdown power-down sweep.
- **HVAC:** blower loop — **volume/pitch = fan speed (0–8)**, ducting timbre changes with vent mode; compressor/heat-pump hum layer; defrost mode brighter airflow. AC clutch/compressor engage click (V8e).
- **Seat/steering heaters, ventilation fans:** faint fan loop.
- **Infotainment/audio system:** UI feedback (media playback is out of scope, but system sounds are here).
- **Ambient electrical:** faint inverter/coolant-pump hum (eGT) at rest; relay clicks on mode change.

#### 12.4.8 Indicators, chimes, warnings & human-interface

- **Turn indicator:** relay tick-tock loop while active (synced to blink; classic 2-tone click); **hyper-tick** if a bulb is "out" (damage) — audible fault cue.
- **Hazard:** same, both sides.
- **Seatbelt chime:** repeating chime while unbuckled + moving; escalates; stops on buckle click (buckle latch one-shot).
- **Door-ajar / key / lights-on / handbrake / low-fuel-or-charge chimes:** distinct short motifs.
- **Warning chimes (tiered by severity):** info (soft single), caution (double), critical (urgent repeating — collision warning, overheat, HV fault, low-oil). ADAS: lane-departure buzz, blind-spot tone, forward-collision urgent alarm, parking-sensor beeps (**rate = distance to obstacle**, solid tone at contact threshold).
- **Buttons/switches:** UI click/detent per control; central rotary controller detent clicks; touchscreen haptic-tick; gear-selector detent.
- **Horn:** dual-tone horn, one-shot/hold loop (exterior emitter, loud); short "chirp" on quick press vs sustained on hold; lock/unlock confirm chirp variant (softer).
- **Rain on body/glass:** patter loop layered by `wetness`/intensity, changes on wipers, louder with sunroof open; thunder one-shots (ambient, optional).

#### 12.4.9 Mix, buses & perspective

- **Buses:** Engine/Motor · Forced-induction · Driveline · Tires/Road · Wind · Suspension/Impacts · Brakes · Body-motors · Electrical/HVAC · Chimes/UI · Ambient/Weather · Horn.
- **Listener perspective:** interior listener applies a low-pass + cabin IR (muffles exterior sources, boosts intake/structure-borne); exterior/chase cams open up the exhaust and reduce cabin filtering; window-open state raises the cutoff. Occlusion when engine bay closed.
- **Ducking/priority:** critical warnings duck media/engine slightly; crash impacts momentarily duck everything with a brief "ring"/tinnitus filter option after big hits.
- **RPM-graph engine tech:** author on-load and off-load RPM sample sets with crossfade; smooth `rpm` with a slew limiter to avoid zipper noise; add micro-detune/random layers to mask loop points.

> **Real-time:** collapse engine to 2–3 crossfaded RPM loops (on-load/off-load) instead of 5+ layers; drop turbo-flutter/anti-lag on phone (keep on desktop); tire/road/wind become single param-mapped loops each; suspension/rattle events thinned to the loudest hits; HVAC/electrical/ambient reduced to one hum + blower loop; convenience-motor one-shots kept (cheap, high-value); spatialization simplified to interior/exterior LP swap without full IR convolution on phone. Cabin IR, occlusion, and post-crash tinnitus filter are desktop-only.

---

### 12.5 Cross-discipline integration map (who consumes what)

| Signal (from physics) | Damage | Animation | Audio |
|---|---|---|---|
| `rpm`, `load`, `boost` | thermal → smoke/fire risk | tach needle, pedal | engine layers, turbo |
| `speed` | — | spoiler, shutters, handles retract | wind, road, AVAS |
| `slip` (long/lat) | tire wear, flat-spot | wheel spin, body roll | screech, chirp |
| `a_x`,`a_y` (load transfer) | crash impulse | dive/squat/roll, bolsters | (mix cues) |
| suspension compression | arm-bend failure | wheel travel, dampers | bump thuds |
| brake pressure/ABS flag | disc heat, fade | pedal, caliper glow | ABS chatter, squeal |
| impact impulse+zone | deformation stage | panel blendshape, detach, airbag | impact/glass SFX |
| `surface`,`wetness` | µ, aquaplane | wiper rate, spray | road timbre, rain, hiss |
| `gear`,shift event | driveline shock | selector, paddles | shift clunk, blip |

This table is the contract: every gameplay/physics state that should be *seen* or *heard* has an owner in each downstream discipline, ensuring no omissions between the LOD0 cinematic build and the real-time WebGL/phone target.
## 13. Materials, Rendering & Level-of-Detail

**Scope.** This section is the single source of truth for how the Vehicle looks under light and how much of it we actually draw at each viewing distance. It closes the loop between the geometry/mechanical sections (01–12) and the shipping runtime. Everything here is discipline-agnostic vocabulary: material artists author to these PBR contracts, 3D/Blender artists build to these triangle budgets and UV rules, engine/UE5 devs wire the LOD chain and shader features, and the WebGL team maps the offline ideal down to the phone-browser target defined in the final subsection.

**Model designation.** Internally the car is the **"AX-1 Meridian"** (fictional, unbadged). Two powertrain variants share one exterior/interior shell:
- **AX-1 Meridian TH** — twin-turbo V6 hybrid (has grille intakes open, exhaust tips, a shallow hood power-dome, engine-bay heat detail).
- **AX-1 Meridian E** — full-EV (blanked/closed grille panel, no tailpipes, flat underbody tray, frunk). Material and LOD rules below are shared; variant-specific deltas are called out inline.

**Metrology & authoring conventions (read first).**
- Units: metres in-engine, millimetres in text. 1 texel target ≈ **0.5–1.0 mm** on hero exterior panels at LOD0, **2–4 mm** on interior touch surfaces, **4–8 mm** on underbody.
- Colour space: albedo/base colour authored in **sRGB**; all data maps (metallic, roughness, normal, AO, height, mask) authored **Linear/raw**. No sRGB on data.
- Roughness convention: **perceptual/linear roughness** (UE5/glTF standard), 0 = mirror, 1 = fully diffuse. Where a DCC uses "glossiness," invert.
- Normal maps: **OpenGL +Y (green up)** as the master; a −Y flipped set is exported for engines that need it. Tangent-space, 8-bit minimum, prefer 16-bit for large soft panels to kill banding.
- Metallic is **binary in intent** (0 for dielectrics, 1 for raw metals). Values between 0 and 1 exist only for dust/oxide blends via masks, never as an "artistic dial."
- IOR baseline 1.5 (F0 ≈ 0.04) for dielectrics unless a specific F0 is given below.

---

### 13.1 Materials Library

Master material philosophy: one **Über exterior shader**, one **Über interior shader**, plus a small set of specialised shaders (glass, clearcoat car-paint, emissive, tyre/rubber, brake-glow). Everything else is a **material instance** (parameter set) of those masters. This keeps shader permutations low for the real-time build and lets the material artists ship a spreadsheet of instances rather than hand-authored one-offs.

Global PBR channels every instance exposes: `BaseColor (sRGB)`, `Metallic`, `Roughness`, `Normal`, `AO`, `Height/Displacement`, optional `Clearcoat`, `ClearcoatRoughness`, `Anisotropy`, `AnisoDirection`, `Emissive`, `EmissiveIntensity`, `SubsurfaceColor`, `SubsurfaceRadius`, `Opacity`, `Transmission`, `DirtMask`, `WetMask`.

> Real-time: on the WebGL/phone build there is **no per-instance shader** — all of the below collapse into **3 shipping shaders** (opaque-metal-roughness, transparent-glass, unlit-emissive) fed by **texture atlases**. Clearcoat, anisotropy, transmission and subsurface are approximated in the exterior/interior atlas (see 13.4).

#### 13.1.1 Leather (Nappa & perforated seating)
- **Role/where used:** seat centres & bolsters, door armrest pads, dashboard top-roll (on higher trims), steering-wheel rim wrap, gear/mode selector boot, upper console.
- **Geometry note:** authored as a thin shell over foam; stitching is a separate floating-geo strip at LOD0–1, baked into normal/albedo at LOD2+.
- **PBR:**

| Channel | Value / map |
|---|---|
| BaseColor | Trim-dependent: "Sepia Tan" `#7A5B3E`, "Graphite" `#2B2B2E`, "Bordeaux" `#4A1E24` |
| Metallic | 0.0 |
| Roughness | 0.45–0.62 (micro-varied by grain map); worn hotspots (bolster edges, wheel 10/2 o'clock) dip to 0.35 |
| Normal | Grain tiling normal (2 mm cell) + macro wrinkle/wear normal + stitch normal |
| AO | Baked pore + seam cavity |
| Subsurface | ON (thin): `SubsurfaceColor` warm `#C98A5E`, radius ~0.6 mm — gives the soft edge-lit reading on bolsters |
| Clearcoat | Slight (0.15) on "protected" grain leathers only |
- **Sub-parts:** perforation holes (seat breathe zones) = alpha-masked micro-holes at LOD0–1, baked to normal+AO at LOD2+; contrast top-stitch; piping cord along bolster seams.
- **Weathering:** edge polish (roughness down + slight sheen), seat-base creasing, hand-oil sheen on wheel.

> Real-time: perforation is **always baked** to normal+AO (never real geometry). Subsurface faked with a warm baked rim in AO/albedo. One tiling grain normal shared across all leather UV islands.

#### 13.1.2 Alcantara / microsuede
- **Where used:** headliner, A/B/C pillars, upper door inserts, steering-wheel side grips (sport trim), seat centre inserts (performance seats).
- **PBR:** BaseColor `#26262A` (anthracite) / `#3C3F45` (grey); Metallic 0; Roughness **0.85–0.95**; Normal = very fine fuzz normal (0.3 mm) + directional nap; **Anisotropy 0.4** with a "brushed direction" map to give the two-tone light/dark suede flip; subtle sheen via a fuzz/cloth lobe (Sheen 0.3, SheenTint warm).
- **Weathering:** nap direction smudges (hand-drag), darkened wear on bolsters.

> Real-time: fuzz/sheen lobe dropped; the two-tone flip is faked by a **Fresnel-driven albedo lerp** (edge lighter) baked into a cheap sheen term. Anisotropy omitted.

#### 13.1.3 Carbon fibre (woven 2×2 twill)
- **Where used:** exterior mirror caps, rear diffuser fins, front splitter blade, interior dash trim spears, paddle shifters, seat backs (performance), sill plates.
- **PBR:** BaseColor near-black weave `#0C0C0E`; Metallic 0.0 (it's a clearcoated composite, not metal — reflectivity comes from clearcoat); Roughness base 0.25 under clearcoat; **Clearcoat 1.0, ClearcoatRoughness 0.05**; Normal = 2×2 twill weave normal (cell ~4 mm); **Anisotropy** subtle along weave; a "weave sparkle" via high-frequency spec breakup.
- **Sub-parts:** weave direction must follow part flow (mirror caps 45°, diffuser fins longitudinal); "selvedge" edge where weave is cut.

> Real-time: modelled as **opaque with baked clearcoat sheen** in the atlas; weave is a tiling normal + tiling albedo; anisotropy omitted; clearcoat faked as a second baked spec highlight.

#### 13.1.4 Forged carbon (chopped-tow marble)
- **Where used:** centre console tray, wheel spoke inlays (optional), shift surround — the "marbled" random-flake look distinct from woven twill.
- **PBR:** BaseColor mottled black/charcoal `#101014`↔`#1E1E22` via a large non-tiling marble mask; Metallic 0; Roughness 0.3 under clearcoat; **Clearcoat 1.0/0.04**; Normal = subtle chopped-flake facets; no anisotropy (random flakes).

> Real-time: single baked albedo+normal, clearcoat faked. Because the pattern is non-tiling, it gets a **dedicated small texture** rather than atlas tiling.

#### 13.1.5 Plastic / ABS (structural interior & under-hood)
- **Where used:** lower dash, kick panels, under-hood covers, wheel-arch liners, HVAC vents' bodies, switch housings.
- **PBR:** BaseColor `#1A1A1C` (dyed-through black typical); Metallic 0; Roughness 0.4–0.6; Normal = injection-mould grain (fine pebble, 0.5–1 mm) — **the grain is the read**; slight mould-line detail on edges.
- **Weathering:** UV greying on exposed arch liners; scuff sheen.

> Real-time: one shared **grain normal** tiled across all ABS islands; grain optionally baked to a single mip-safe detail map.

#### 13.1.6 Soft-touch polymer (foamed skin)
- **Where used:** upper door cards, dash mid-tier, armrest tops (non-leather trims), glovebox lid.
- **PBR:** BaseColor `#202024`; Metallic 0; Roughness 0.55–0.7; Normal = fine leather-look moulded grain (this is faux-leather grain, coarser than ABS pebble); very slight softness sheen.

> Real-time: shares the ABS grain family with a different tile/roughness instance.

#### 13.1.7 Glass (windscreen, side/rear, panoramic roof, lamp lenses, screens)
- **Where used:** windscreen (laminated, slight green tint), side/rear (tempered), panoramic roof (electrochromic-capable), headlamp/taillamp outer lenses, instrument/infotainment cover glass.
- **PBR (transmissive master):** BaseColor tint `#DDECE4` @ very low saturation (automotive green); **Transmission 0.9+**; Roughness 0.02–0.05; **IOR 1.52**; thin **edge tint absorption** (Beer-Lambert) so thick edges read green; **Clearcoat off** (it's the surface itself); interior-side **AO/dirt band** at frit edge.
- **Sub-parts:** black **ceramic frit** dot-fade border (opaque, roughness 0.4); embedded antenna/defrost lines (emissive-off thin decal); electrochromic roof = animated opacity/tint parameter (see 13.2 weather/anim).
- **Screens (cover glass):** clear glass over an **emissive UI layer** (unlit), with a smudge/fingerprint overlay and anti-reflective (low F0 ~0.02) coating.

> Real-time: glass is a **single-sided transparent shader**, no true refraction — a **cubemap/planar-reflection-lite** plus a flat tint and a baked interior-darkening. Frit border baked into the glass texture alpha. Screens = **unlit emissive quad** with a static fingerprint overlay; no live refraction.

#### 13.1.8 Rubber (tyres, seals, wiper blades, pedal pads, boots)
- **Where used:** tyre sidewall & tread, door/window weather seals, wiper blades, pedal rubber, gaiters.
- **PBR:** BaseColor `#0E0E0E`; Metallic 0; Roughness 0.7 (fresh) → 0.85 (aged); Normal = sidewall lettering/branding-neutral tread pattern (fictional tread), seal grip ribs; **no gloss** except a thin "tyre-shine" wet instance (roughness 0.3) for showroom shots.
- **Sub-parts:** sidewall raised lettering (fictional size code, e.g. `285/35 ZR21`), tread blocks, sipes; wear indicator bars.

> Real-time: tread is **normal-mapped on a smooth cylinder**, not modelled blocks; sidewall text baked; tyre-shine is a material param toggle.

#### 13.1.9 Chrome / bright trim (polished)
- **Where used:** window surround trim (chrome trim variant), lower grille frame, badge surrounds (unbadged emblem plinth), interior accent rings on vents/speakers/start button.
- **PBR:** BaseColor `#F7F8FA`; **Metallic 1.0**; Roughness 0.02–0.06; Normal ~flat; needs a good reflection source (cubemap/SSR) to read.
- **Weathering:** water spotting, fingerprint smear (interior rings), micro-pitting at LOD0.

> Real-time: reads only as good as the reflection probe — uses the **exterior static cubemap**; interior rings use a small **baked reflection** so they don't go black.

#### 13.1.10 Aluminium (brushed & machined)
- **Where used:** door-sill tread plates, speaker grille mesh, pedal faces (sport), some structural exposed brackets, wheel face (machined two-tone), roof rails (variant).
- **PBR:** BaseColor `#C9CBCE`; Metallic 1.0; Roughness 0.25–0.4 (brushed) with **Anisotropy 0.6** along brush direction; machined faces = roughness 0.15, radial aniso; AO in flutes/knurls.

> Real-time: anisotropy usually **omitted** (isotropic ~0.3 roughness); brushed direction faked in the normal/roughness texture streaks.

#### 13.1.11 Steel (raw/structural, fasteners)
- **Where used:** visible fasteners, suspension arms (under-car), exhaust heat-shields (TH), brake-caliper bracket, some chassis in engine bay.
- **PBR:** BaseColor `#8A8C90`; Metallic 1.0; Roughness 0.4–0.55; Normal = mild cast/forge texture; oxide/rust available via dirt mask on underbody.

> Real-time: underbody steel is **one dark low-spec instance**; most is in shadow and gets minimal texel budget.

#### 13.1.12 Magnesium (structural light-alloy)
- **Where used:** paddle-shift armature, seat-frame (hidden), some interior cross-brace (visible on stripped performance trim), wheel option ("mag" wheel).
- **PBR:** BaseColor `#9A9488` (slightly warm-grey vs aluminium); Metallic 1.0; Roughness 0.45–0.6; typically a **cast/pebbled** normal + protective matte coat (so less reflective than polished alu). Magnesium wheels get a bronze-tint clear (BaseColor `#8C7A5E`).

> Real-time: treated as a matte metal instance; distinct only by base tint + higher roughness.

#### 13.1.13 Titanium (exhaust tips, hardware, accents)
- **Where used:** exhaust tip inner (TH), select fasteners, optional interior badge plinth, valve-cover hardware.
- **PBR:** BaseColor `#B6B2AE`; Metallic 1.0; Roughness 0.3; the signature is **heat-tint iridescence** near exhaust tips — an emissive-free thin-film gradient (blue→purple→straw) driven by a temperature/position mask.
- **Weathering:** heat bluing intensifies with "hard driving" state if we drive it from telemetry.

> Real-time: heat-tint is **baked into the exhaust-tip texture** as a fixed gradient; no dynamic thin-film.

#### 13.1.14 Automotive Paint + Clear Coat (the hero material)
- **Where used:** all exterior body panels.
- **Layered model (LOD0 ideal):**
  1. **Basecoat / pigment** — BaseColor by colourway; Metallic 0 for solid colours, but metallic/pearl colours use a **flake sub-layer**.
  2. **Metal flake layer** — sparse high-frequency normal + spec flakes (aluminium flake) with a **flake density/size** param; orientation random. Drives the "sparkle travels as camera moves."
  3. **Clear coat** — `Clearcoat 1.0`, `ClearcoatRoughness 0.03–0.06`, separate normal for orange-peel micro-waviness.
- **Signature colourways:**

| Name | Basecoat | Type | Notes |
|---|---|---|---|
| Meridian White Pearl | `#EDEDEA` | Tri-coat pearl | blue/gold flake shift |
| Obsidian Metallic | `#15161A` | Metallic | fine silver flake |
| Storm Grey Matte | `#4B4E52` | **Matte** | clearcoat roughness 0.5, NO gloss, delicate (no polishing wear) |
| Aurora Blue | `#1C3A6E` | Metallic | strong flake |
| Signal Red | `#9E1B1B` | Solid+pearl | deep candy over silver ground |
- **Orange peel:** subtle large-scale clearcoat normal — critical for realism; without it paint looks like plastic.
- **Weathering:** swirl marks (fine circular micro-scratch in clearcoat normal/roughness), stone chips on leading edges (front bumper, sill, mirror fronts) exposing primer, water spotting, road-film haze low on panels.

> Real-time: two-layer collapse — **basecoat + a single faked clearcoat spec lobe**. Flake faked with a **detail-normal sparkle** only on the hero car; instanced traffic gets **flat metallic paint, no flake, no clearcoat normal**. Matte colourway = just a high-roughness instance. Orange peel usually dropped on phone (kept on the hero if budget allows via a shared detail normal).

#### 13.1.15 Gloss / Piano-black trim
- **Where used:** centre console fascia, infotainment surround, gloss B-pillar exterior appliqué, window switch panel.
- **PBR:** BaseColor `#050506`; Metallic 0; Roughness **0.03**; Clearcoat 0.6; the defining feature is **it shows every fingerprint and dust mote** — so it ships with a mandatory **fingerprint/dust overlay** even in showroom.

> Real-time: kept glossy but fingerprints are a **static baked overlay**; SSR-lite reflections only.

#### 13.1.16 Matte trim (non-piano)
- **Where used:** open-pore wood-look or matte-anthracite dash spears, matte body wrap option.
- **PBR:** BaseColor per finish; Roughness 0.6–0.75; Clearcoat 0.1; open-pore wood adds a **pore normal + grain albedo** with subtle anisotropy along grain.

#### 13.1.17 Fabric / cloth (base-trim seats, floor mats, boot liner)
- **Where used:** base-trim seat cloth, floor mats, trunk/boot carpet, parcel shelf.
- **PBR:** BaseColor mid-grey `#3A3B3F`; Metallic 0; Roughness 0.9; **Sheen 0.4** cloth lobe; Normal = woven thread (0.5 mm) + macro weave; fuzz on mats.

> Real-time: sheen dropped; woven look from tiling normal; mats get a single detail.

#### 13.1.18 Foam (seat cushion, arm pads — mostly hidden)
- **Where used:** under leather/cloth; visible only on cutaway/damage or seat-adjust animation gaps.
- **PBR:** BaseColor `#C9B79E` (typical PU foam); Roughness 0.95; Metallic 0; open-cell normal. Rarely visible.

> Real-time: usually **omitted/merged** into seat shell; exists only at LOD0.

#### 13.1.19 Insulation / underlay (NVH, under-hood, firewall)
- **Where used:** under-hood sound blanket, firewall pad, wheel-arch felt, underbody aero-acoustic panels.
- **PBR:** BaseColor `#1B1B1C` (black felt) / foil-faced `#8E9095` (metallic 1, rough 0.6 for heat-shield foil, with quilting normal); Roughness 0.9 felt; Normal = fibrous felt + quilt stitch pattern; foil variant has a crinkle normal.

> Real-time: under-hood is **one felt instance**; underbody insulation collapses into the flat underbody tray texture (13.4).

#### Material master summary table

| Material | Metallic | Roughness | Clearcoat | Special |
|---|---|---|---|---|
| Nappa leather | 0 | 0.45–0.62 | 0.15 | subsurface |
| Alcantara | 0 | 0.85–0.95 | 0 | aniso/sheen |
| Carbon (twill) | 0 | 0.25 | 1.0/0.05 | weave aniso |
| Forged carbon | 0 | 0.30 | 1.0/0.04 | marble mask |
| ABS | 0 | 0.4–0.6 | 0 | mould grain |
| Soft-touch | 0 | 0.55–0.7 | 0 | faux grain |
| Glass | 0 | 0.02–0.05 | — | transmission, IOR1.52 |
| Rubber | 0 | 0.7–0.85 | 0 | — |
| Chrome | 1 | 0.02–0.06 | 0 | needs reflection |
| Aluminium | 1 | 0.25–0.4 | 0 | aniso brushed |
| Steel | 1 | 0.4–0.55 | 0 | oxide mask |
| Magnesium | 1 | 0.45–0.6 | 0 | matte coat |
| Titanium | 1 | 0.30 | 0 | heat-tint |
| Car paint | 0(1 flake) | 0.03–0.5 | 1.0/0.03–0.06 | flake, orange-peel |
| Piano black | 0 | 0.03 | 0.6 | fingerprints |
| Fabric | 0 | 0.9 | 0 | sheen |
| Foam | 0 | 0.95 | 0 | hidden |
| Insulation | 0/1 | 0.6–0.9 | 0 | felt/foil |

---

### 13.2 Rendering

#### 13.2.1 Lighting & shading model
- **BRDF:** Cook-Torrance GGX, energy-conserving, multiscatter compensation ON for rough metals. Metal-roughness workflow (glTF/UE5 native).
- **Reflections (LOD0 ideal):** ray-traced reflections on paint/chrome/glass; fallback SSR + a **hero reflection-capture probe** at car centre updated per relevant environment. Car paint MUST have a real environment to read flake/clearcoat.
- **Lighting rigs the car must look correct under:** studio/showroom (softbox HDRI), overcast Sofia street, harsh noon sun (sharp clearcoat highlight + hard shadows), night with wet asphalt (streetlight streaks, emissive lamps dominate), tunnel/transition (headlamp cones visible).
- **Ambient occlusion:** baked AO per panel + runtime SSAO/GTAO in seams, arches, under mirrors, interior footwells.

#### 13.2.2 Texture resolution ladder (LOD0 authoring)

| Surface class | Albedo | Normal | ORM/packed | Notes |
|---|---|---|---|---|
| Exterior body panel (per large panel) | 4K | 4K | 2K | udim per panel-group |
| Wheels (per wheel) | 2K | 2K | 2K | shared across 4 |
| Glass set | 2K | 1K | 1K | frit+tint |
| Headlamp/taillamp internals | 4K | 4K | 2K | emissive 2K |
| Interior "touch" (seats, wheel, dash) | 4K | 4K | 2K | closest to camera |
| Interior secondary (pillars, lower trim) | 2K | 2K | 2K | |
| Screens/UI | 2K emissive | — | — | unlit |
| Underbody/engine | 2K | 2K | 2K | shared |
| Tyres | 2K | 2K | 1K | shared |

- **Packing:** ORM = Occlusion(R)/Roughness(G)/Metallic(B). Separate **mask map** (dirt/wet/wear zones) where dynamic weathering is needed. Clearcoat params packed into a 4th texture only on paint.
- **UV rules:** exterior panels get **individual UDIM tiles** so a scratch decal lands on the right door; symmetrical parts (mirrors, wheels) **mirror-share** UVs to halve memory; text/badge-plinth areas kept off mirror seams.

#### 13.2.3 Dynamic weathering & surface-state system
A stackable, mask-driven layer system on top of every exterior instance. Each layer is a masked blend with its own PBR override. Layers, bottom→top:

1. **Micro-scratches / swirl** — always-on faint clearcoat-normal + roughness noise; densest on horizontal panels (hood, roof) and door handles. Intensity param `wear`.
2. **Stone chips** — leading-edge mask (bumper, sill, mirror front, A-pillar); punches through clearcoat+basecoat to primer grey `#7C7C7C`; height/normal divot.
3. **Road film / haze** — low-panel gradient, raises roughness, slightly desaturates; driven by "km driven / weather" param.
4. **Dust** — top-facing accumulation (world-space up dot), pale `#B7AFA0`, roughness→0.9, metallic→0; wipes away where a wet layer or hand-touch mask exists.
5. **Fingerprints** — on gloss/chrome/handles/piano-black; greasy low-roughness oval smudges; **mandatory** on piano black.
6. **Water droplets** — beading via a droplet normal + high-transmission spec dots; on glass they refract slightly; parametric **wetness 0–1**; droplets slide (animated V offset) when moving.
7. **Sheet water / wet asphalt reflection** — full-surface roughness drop + darken when `wetness` high; puddle reflection on lower panels.
8. **Mud** — lower body/arches/underbody; brown `#4A3826`, roughness 0.85, chunky normal; splatter mask grows from wheel-arch outward with speed/offroad.
9. **Snow** — top-facing, world-up masked, white `#EDEEF0`, roughness 0.6, slight subsurface; melts (recedes mask) with a temperature param; slush at arch line.
10. **Brake dust** — wheels/caliper/lower-arch only; warm dark `#3A2E28`; densest on front wheels; grows with braking telemetry.

- **Drivers:** each layer reads global sim params — `weather (dry/rain/snow)`, `wetness`, `temperature`, `kmDriven/wear`, `offroad`, `brakeHeat`. This lets one car show a full clean→abused range without re-authoring.
- **Subsurface usage recap:** leather bolsters, snow, cloth sheen edge, tail-lamp red lenses (light bleed), skin-free — the car has no organic SSS beyond these.

> Real-time: the 10-layer stack collapses to **3 runtime layers on the hero car** — (a) a combined **dust+dirt** mask, (b) a **wetness** toggle (global roughness drop + one droplet normal), (c) **brake dust** on wheels. Snow/mud are **pre-baked variants** (a "winter" and a "muddy" texture set) rather than live-accumulating. Traffic cars get **wetness only** (global roughness lerp), no dirt at all.

#### 13.2.4 Emissive & lighting elements (render-side)
- Headlamps (LED matrix), DRL signature strip, indicators (amber), taillamp/brake (two-stage brightness), reverse (white), interior ambient light strips (colour-configurable), screen UI, badge-plinth backlight (variant), charge-port ring (E variant, animates during charge), footwell lights.
- Emissive authored as **unlit colour × intensity (nits-ish)**; brake = base 4× multiplier on tap; indicators animate on/off + sequential sweep option.
- Bloom is a **post** effect — emissive must be readable without bloom for phone.

> Real-time: emissive quads are **unlit, no light cast** except the **two hero light sources** (headlamp cone as a cheap projected texture + brake glow as emissive only). Interior ambient strips = emissive geometry, no real lights. Traffic cars: emissive **texture only**, no projected cones.

---

### 13.3 Level of Detail (offline / full spec)

LOD philosophy: **silhouette-preserving decimation**. Screws, badges, and interior clutter drop first; roofline, glass shape, wheel silhouette, and lamp signature drop last. Normal maps carry detail down the chain (bake LOD0 → LOD2+). Interior is **culled entirely once glass reflections/occlusion say it's not visible** (LOD3+ exterior views).

Triangle targets are **per whole car** unless noted (exterior + wheels; interior counted separately because it's independently cullable).

| LOD | Use / screen-height | Exterior tris | Interior tris | Wheels (4) | Texture set | Notes |
|---|---|---|---|---|---|---|
| **LOD0** cinematic/hero-closeup | full-screen, showroom, cutscene | ~2,500,000 | ~1,800,000 | ~600,000 | full 4K ladder | every screw/stitch modelled; forge weave real; brake-caliper text |
| **LOD1** high / near gameplay hero | car fills 40–100% screen | ~600,000 | ~350,000 | ~180,000 | 4K→2K | stitches baked, small fasteners removed, interior full but simplified vents |
| **LOD2** medium | ~15–40% screen | ~150,000 | ~60,000 | ~50,000 | 2K→1K | grille bars merged, door handles simplified, interior = single merged shell |
| **LOD3** gameplay / traffic-near | ~5–15% screen | ~30,000 | ~6,000 (or culled) | ~12,000 | 1K | interior = flat "black box + faked seats" card or culled; wheels 5-spoke silhouette |
| **LOD4** distance / dense traffic | <5% screen | ~4,000 | 0 (culled) | ~1,500 (or baked into body) | 512 atlas | wheels can be normal-mapped discs; single material |
| **LOD5** impostor (optional) | far horizon/parking lots | ~40 (billboard) | 0 | 0 | octahedral impostor atlas 1K | camera-facing baked card, 8–16 angles |

#### 13.3.1 Non-visual meshes
- **Collision mesh:** convex-decomposition body hull (≈300–1,200 tris) — a simplified but accurate outer shell; **separate wheel colliders** (cylinders) not part of body; separate **interior floor/seat colliders** only if the camera/player can be inside. No concave detail; door openings are NOT holes in collision unless doors are enterable.
- **Physics/proxy mesh (vehicle dynamics):** the car body is a **single rigid box + tuned inertia tensor** for the Rapier/vehicle-controller; wheels are 4 raycast/cylinder colliders with suspension — this is the "chassis" the sim actually drives. Visual body is parented to it. Separate from the collision hull used for world contacts.
- **Shadow mesh (shadow proxy):** a decimated ~2–5k-tri solid version used only for shadow-caster passes (no interior, filled window holes) — cheaper and avoids per-triangle shadow cost of LOD0/1 in the depth pass.
- **Occlusion mesh:** a tight low-poly (~200–500 tri) **inner hull** used as an occluder to cull world/interior geometry behind the car; also the interior-cull trigger volume.
- **Navigation/AI footprint (traffic):** a simple oriented bounding box for traffic spacing/avoidance — not rendered.

#### 13.3.2 LOD switching & transitions
- Screen-coverage-driven (not raw distance) so it's resolution-independent.
- **Dithered/temporal cross-fade** between LODs (no popping) at LOD0↔2; hard-swap acceptable LOD3↔4 in dense traffic.
- **Interior culling** is a separate track from exterior LOD: gated by camera-inside test + occlusion mesh + glass-reflection need. A parked distant car draws LOD3 body with **zero interior**.
- Wheels have their **own LOD track** (they're the most-subdivided rotating part) and can be higher-LOD than the body they're on when the camera is low/close to the ground.

---

### 13.4 Real-time web target (Книжка.AI)

This is the **shipping contract** for the browser/phone driving sim. Everything above funnels into these budgets. Target device floor: mid-range 2022 Android phone / integrated-GPU laptop, **WebGL2 (three.js/R3F + Rapier)**, 30 fps minimum with a full traffic scene, ~60 fps on desktop.

#### 13.4.1 Which LOD ships
- **Player hero car:** ships **LOD2 as its top LOD** (≈**120–150k tris** including wheels & a simplified interior), auto-dropping to **LOD3 (~30k)** when in chase-cam far / minimap-ish framing. **LOD0/LOD1 never ship to web** — they exist only for marketing renders, the loading-screen "beauty" turntable (pre-rendered video, not real-time), and store/thumbnail bakes.
- **Interior:** a **single merged interior shell (~40–60k tris)** only drawn in cockpit/interior camera; **culled entirely in exterior/chase views**. Cockpit view is the common case, so the interior gets its budget from the hero allotment when active, and the exterior detail is what's dropped instead (they're rarely both hero at once).
- **Instanced traffic cars:** ship **LOD3 (~25–30k tris)** near the player, **LOD4 (~4k)** at distance, **LOD5 octahedral impostor** for far/parked fill. All traffic uses **GPU instancing** off a shared low mesh with a **per-instance colour/paint param** (recolour via instance data, not new textures).

#### 13.4.2 Triangle budget (hard caps)

| Entity | Top LOD tris | Min LOD tris | Instances typical |
|---|---|---|---|
| Hero car exterior+wheels | 120,000 | 30,000 | 1 |
| Hero interior shell | 60,000 | culled | 0–1 |
| Traffic car (near) | 28,000 | — | 6–10 on screen |
| Traffic car (mid) | 4,000 | — | 10–20 |
| Traffic car (far/impostor) | 40 | — | 20–40 |
| **Frame car-geometry budget** | — | — | **~600k tris total for all cars** |

- Total scene triangle budget (cars + city + props) targets **≤1.2M tris/frame** on the phone floor; cars must live inside ~50% of that with traffic present.

#### 13.4.3 Texture-memory budget (hard caps)

| Asset | Web texture set | VRAM (compressed) |
|---|---|---|
| Hero car exterior (albedo+normal+ORM, atlased) | 2K ×3 | ~16 MB (ASTC/ETC2) |
| Hero interior (atlased) | 2K ×3 | ~16 MB |
| Hero wheels+tyres (shared) | 1K ×3 | ~4 MB |
| Hero glass + lamps + emissive | 1K packed | ~3 MB |
| **Hero car total** | — | **≤40 MB** |
| Traffic shared atlas (all cars, all colours via tint) | 1K ×3 | ~6 MB total |
| Impostor atlas | 1K | ~2 MB |
| **All traffic total** | — | **≤10 MB** |
| **Total car texture VRAM** | — | **≤50 MB** |

- **Compression:** ASTC 6×6 (or ETC2 fallback) for colour, ASTC for normal (or BC5-equiv via two-channel), **no uncompressed textures on device**. Mipmaps mandatory. Aggressive **texture atlasing** — the entire hero exterior on ~3 maps, entire interior on ~3 maps.
- **Screens/UI** rendered to a small **dynamic render-target** (updated only when the UI changes) — not a per-frame full-res redraw.

#### 13.4.4 Shader reduction
- Ship **3 shaders**: (1) `car-opaque` metal-roughness with baked clearcoat sheen + up-to-3 weather layers, (2) `car-glass` single-sided transparent tint + static-cubemap reflection, (3) `unlit-emissive` for lamps/screens/ambient.
- **Reflections:** one **static environment cubemap** per district (baked from the city), optionally a low-res **real-time cube** around the hero car only. No SSR, no RT. Chrome/paint read the static cube.
- **Clearcoat, anisotropy, subsurface, transmission-refraction, flake:** all **baked or faked** per 13.1 real-time notes. Flake survives only as a hero-car detail-normal sparkle if perf allows; traffic never gets it.

#### 13.4.5 What is baked / faked / omitted (summary)
- **Baked:** all stitching, perforation, weave, mould grain → into normal+AO; AO per panel; clearcoat sheen; frit borders; heat-tint on tips; fingerprints on piano black; snow/mud as texture-set variants; light signatures as emissive textures.
- **Faked:** clearcoat (single spec lobe), anisotropy (roughness streaks), subsurface (baked warm rim), glass refraction (flat tint + cube), headlamp illumination (projected texture cone), flake (detail normal, hero only), reflections (static cube).
- **Omitted on web:** ray tracing, SSR, true refraction, per-instance shaders, foam, hidden insulation detail, engine-bay clutter beyond a silhouette (TH), most fasteners, real perforation geometry, LOD0/LOD1 meshes, interior when in exterior view, dynamic snow/mud accumulation, projected shadows from every emissive.

#### 13.4.6 Offline→web mapping (the funnel)
1. Author LOD0 (2.5M) with full material library and layered weathering.
2. Bake all high-frequency + AO + clearcoat + weathering-neutral detail into LOD2's normal/ORM atlases.
3. Retopo/decimate to LOD2 (~150k) preserving silhouette + UDIM→atlas re-pack to 3× 2K.
4. Collapse per-instance materials → 3 shipping shaders; wire the 3 runtime weather layers to sim params.
5. Generate LOD3/LOD4 + octahedral impostor for traffic; instance with per-instance paint tint.
6. Compress (ASTC/ETC2), verify **≤40 MB hero / ≤50 MB all cars / ≤600k car tris/frame**, profile on the phone floor, ship.

**Acceptance gate:** on the target phone, a cockpit drive through a district with 15+ visible traffic cars holds ≥30 fps and stays within the triangle + VRAM caps above, with the hero car reading as clearly premium (clean clearcoat highlight, correct wheel silhouette, readable lamp signature, believable wet-road reflection) — that is the bar this section exists to guarantee.
