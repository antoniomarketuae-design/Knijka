# 12 — Cockpit Camera Balance: interior presence vs road visibility

Research digest for fixing the REF 6 overshoot (windshield letterbox). Sources: shipped driving
sims/games (City Car Driving, ETS2, BeamNG, Assetto Corsa/ACC, Forza), sim-racing FOV practice,
and peer-reviewed GFOV/speed-perception research. All angles are **vertical FOV (vFOV)** unless
marked hFOV. Screen fractions assume 16:9 landscape.

---

## 1. The one-paragraph answer

The REF 2 (City Car Driving) look is NOT achieved with a wide lens at the driver's eyeball. It is
achieved with a **moderate FOV (~45–50° vertical) placed 0.35–0.40 m BEHIND the driver's true eye
point, slightly inboard, pitched ~8° down**. The aft offset is what brings the full dash, both
A-pillar bases, the left door mirror and the interior rear-view mirror into a ~75° horizontal
frame simultaneously — widening FOV instead (REF 6's likely failure mode, combined with a too-low/
too-level camera) shrinks the road into a letterbox and wrecks distance perception.

## 2. Recommended numbers (the deliverable)

Coordinate convention: +X forward, +Y left, +Z up, relative to the **driver design eye point
(DEP)** — the eyeball of a seated driver. For a low GT like the Aurelis GT-E the DEP is
~1.10–1.15 m above ground (sedans ~1.15–1.25 m; SAE package practice puts the eye ~0.63–0.68 m
above the seat H-point).

| Parameter | Value | Tolerance / slider range |
|---|---|---|
| Vertical FOV | **47°** | 45–50 (expose user slider 42–56) |
| → horizontal FOV @16:9 | ≈ 75.4° | derive vFOV from hFOV per aspect: `vFOV = 2·atan(tan(hFOV/2)/aspect)` |
| Camera pitch | **8° down** | 7–9° down |
| Position vs DEP: aft (−X) | **−0.375 m** | −0.30 … −0.45 |
| Position vs DEP: inboard (toward car center) | **+0.10 m** | +0.05 … +0.15 |
| Position vs DEP: up (+Z) | **+0.02 m** | 0 … +0.05 |
| Yaw / roll | 0 | — |

Resulting frame composition (verified with `f = 0.5 + tan(a_world + pitch)/(2·tan(vFOV/2))`,
using cowl line −11° and roof-header line +12° from the camera — see §6):

| Frame band (from bottom) | Content |
|---|---|
| 0–44% | **Interior**: full dash L-R, wheel + cluster, console — the contract's 40–50% |
| 44–53% | Road surface ~6.5 m → 10 m ahead (cowl hides <6.5 m, matches real cars' 5–8 m) |
| 53–65% | **Road 10–100 m** — clearly visible, ~12% of frame height, never occluded |
| ~66% | Horizon line |
| 66–92% | Sky + building tops |
| 92–100% | Roof header + sun visors "just visible at top edge" (contract satisfied) |

Rear-view mirror lands at ~17° right / ~21° up in camera space → **top-right of frame at
~f≈0.94** — exactly the REF 2 placement. Left door mirror at ~37° left → visible at the left
frame edge without glancing.

## 3. What shipped sims actually use (survey)

| Sim | Cockpit-cam FOV | Notes |
|---|---|---|
| **City Car Driving** (the REF 2 target) | config `cameras_common.xml` defaults **50 (h) / 36 (v)**; no in-game FOV slider | Community "wide" mod multiplies both by 1.6 → 80/57.6. Numpad seat-style camera moves (up/down/fwd/back, saved per car). The stock look = narrow-ish FOV + camera pulled back — confirms §1. |
| **Euro Truck Simulator 2** | you set **horizontal** FOV; per-truck defaults ~70–77 h; players run 80–95 h | F4 seat-adjust menu: seat fwd/back + up/down + FOV; players overwhelmingly pull the seat **all the way back** to see mirrors — same aft-bias trick. |
| **BeamNG.drive** | driver cam default ≈ **55**, chase 65; community "ideal" 62–68 | Per-vehicle FOV persistence; Numpad 9/3 live FOV. |
| **Assetto Corsa / ACC** | vertical-degrees setting; stock/default reported **~54–59 v**; players on single 27" monitors settle **50–56 v** | "Mathematically true" FOV for a single monitor (~25–30° actual visual angle) is universally rejected as undrivable — everyone runs 1.5–2× true FOV. |
| **Forza** | dashboard cam locked ~55; cockpit slider floor 40; FH4 global slider 40–110 | Dash cam (no wheel) uses LOWER FOV than cockpit — less interior needs less lens. |

Convergent industry answer: **cockpit vFOV 47–56 on a single 16:9 screen**, seat/camera
adjustable fore-aft, aft bias preferred by users, per-vehicle persistence expected.

## 4. FOV vs speed perception — the research (why not to go wider or narrower)

- Hussain et al. 2020 (Procedia CS 170, Qatar University, 36 drivers, STISIM 135° triple screen):
  GFOV 60° vs 135° — at 60° drivers **underestimated speed and drove +24.3 to +29.2 km/h faster**
  than requested (50/70/80/100 km/h targets, p<.001), constant across speeds. Lateral position was
  also unrealistic at 60° (hugged lane center; 135° matched real-world GPS studies, 20–30 cm
  offset). https://doi.org/10.1016/j.procs.2020.03.005
- Diels & Parkes 2010: even at scale factor GFOV/FOV = 1.0, simulator speed is underestimated
  ~10% on average; ratio 0.83 worsens it; larger ratios reduce production error — a Clemson
  follow-up regression put the optimum ratio at ~1.22.
- Mourant et al. 2007 (45° screen, GFOV 25/55/85): higher GFOV → lower estimated speed; 60 mph
  estimated most accurately at GFOV 55°, 30 mph at 85°.
- Mechanism: peripheral **edge rate** drives perceived speed. On a narrow display the periphery is
  gone, so optic flow reads slow.

Implications for us (single screen, teaching real speed discipline):
1. Students WILL under-feel speed at any usable FOV → they will drive too fast if graded by feel.
   Mitigate with (a) dense roadside edge-rate cues — trees/lamps/parked cars every ~20 m, which
   REF 3 already mandates for looks, (b) rule-engine speed feedback tied to the speedometer
   (checking the speedo is the pedagogically correct habit anyway), (c) optional mild dynamic FOV
   (+4–6° vFOV ramping in above ~60 km/h — common game trick; keep OFF during graded exams so
   perception conditions are constant).
2. Do NOT chase "true FOV" (~15–25° for a laptop at arm's length) — undrivable, and sim-racing
   practice universally overrides it. 47° vFOV ≈ 1.5–2× true is the sweet spot games converged on.
3. Do NOT exceed ~56° vFOV in cockpit: distance compression makes 10–30 m judgments (following
   distance, stop lines — things we grade) systematically wrong.

## 5. Eye point & seat-adjust facts

- SAE J941 "eyellipse" defines the driver eye-location distribution; practical package values:
  sedan driver eye ~1.15–1.25 m above ground, SUV ~1.35–1.50 m; eye ~0.63–0.68 m above H-point.
- Real seat tracks travel ~240 mm fore-aft, ~60–80 mm vertically — mirror this in the sim's
  seat-adjust: **fore-aft ±0.12 m, height ±0.04 m around the §2 defaults**, persisted per profile
  (CCD saves per car; ETS2 per truck — users expect persistence).
- Observed player behavior (ETS2 forum consensus): seat far back, FOV modestly above default,
  priority = "see both mirrors without leaning". Comfort beats geometric realism.

## 6. REF 2 decomposed — the interior angle budget

From the driver eye of a typical sedan/GT cockpit (used for the §2 math; re-measure once on the
actual Aurelis GT-E interior GLB and re-solve):

| Interior line | Angle from eye (level) |
|---|---|
| Roof header / visor bottom | +12° up (0.12 m up, 0.55 m fwd) |
| Rear-view mirror bottom | +8…+10° up, ~30° right of dead-ahead |
| Cowl / dash top (windshield base) | −11° down (0.20 m down, 1.0 m fwd) |
| Steering wheel top rim | −18° down (0.16 m down, 0.50 m fwd) |
| Windshield opening total | **~23° vertical** — this is the hard constraint |
| Left door mirror | ~50° left from eye — impossible in a 75° hFOV frame **from the eye point**; drops to ~37° left from the −0.375 m aft camera |
| Right A-pillar base | ~49° right from eye; ~36° right from the aft+inboard camera |

The windshield's fixed ~23° angular height is why "interior 45% + windshield 55% + no roof slab"
over-constrains the problem: at vFOV 50 you get either interior 42% + a 14%-tall roof band, or
zero roof + interior 54% (the REF 6 letterbox). **vFOV 47 + pitch 8° down is the solve** that
leaves only an 8% visor sliver while holding interior at 44%.

## 7. REF 6 failure diagnosis (what to change in code)

Symptoms → causes:
- Windshield = thin slit, roof header dominant → camera pitch too level (roof-header band maps
  low into the frame) and/or camera too high/too far back with too little down-pitch. Every degree
  of down-pitch moves the header ~2% of frame height toward the top edge at vFOV 47.
- "Dash + wheel dominate" → cowl line sitting above frame mid-height; target is cowl at **f≈0.44**.
- Acceptance test (automatable with a raycast from camera through frame rows): cowl-line row
  0.42–0.46; horizon row 0.63–0.68; header row ≥0.90; road point at 10 m ahead visible at row
  0.50–0.56; rear-view mirror center inside x∈[0.78,0.95], y∈[0.88,0.97].
- Mirror cams (out of lane but noted): side-mirror render cam should point rearward parallel to
  the body axis, tilted ~4–5° down, FOV ~15–20°, exposure locked to main-scene exposure — the
  solid-green mirror is aim (hitting the lawn) + auto-exposure, not a reflection problem.

## 8. Implementation notes (Three.js / R3F)

- `THREE.PerspectiveCamera.fov` IS vertical degrees — set **47**, and on resize hold hFOV
  constant instead: `fov = 2·atan(tan(75.4°/2)/aspect)·180/π` so phones/portrait don't zoom in.
- Parent the camera to a "head" group at DEP + (−0.375, +0.10, +0.02) m, `rotation.x = −8°`.
- Expose seat-adjust: ±0.12 m X, ±0.04 m Z, FOV 42–56; persist per profile; default = above.
- Optional dynamic FOV: `fov = 47 + 5·smoothstep(60,120,speedKmh)` — disabled in exam mode.

## Sources

- Hussain, Almallah, Alhajyaseen, Dias (2020), *Impact of the geometric field of view on drivers'
  speed perception and lateral position in driving simulators*, Procedia Computer Science 170:18–25.
  https://doi.org/10.1016/j.procs.2020.03.005 (open access PDF: documentserver.uhasselt.be/bitstream/1942/32662/1/Published%20version.pdf)
- Diels & Parkes (2010), *GFOV manipulations affect perceived speed in driving simulators*, Adv. in Transportation Studies 12:53–64. https://www.researchgate.net/publication/255730261
- Mourant et al. (2007), *Optic flow and GFOV in a driving simulator display*, Displays 28(3):145–149. https://www.sciencedirect.com/science/article/abs/pii/S0141938207000236
- Clemson thesis, *The GFOV and speed perception in a driving simulator* (optimum GFOV/FOV ≈ 1.22). https://open.clemson.edu/all_theses/978/
- CCD camera controls & config: https://steamcommunity.com/app/493490/discussions/0/1842441871279924417/ · https://steamcommunity.com/app/493490/discussions/0/3772364949841049375/ · mirror/head modding guide: https://steamcommunity.com/sharedfiles/filedetails/?id=1571724127
- ETS2 FOV is horizontal, per-truck defaults, F4 seat menu: https://forum.scssoft.com/viewtopic.php?t=281529 · https://forum.scssoft.com/viewtopic.php?t=301834 · https://steamcommunity.com/app/227300/discussions/0/2217311444322288992/
- BeamNG camera docs & defaults: https://documentation.beamng.com/modding/vehicle/sections/camera/ · https://www.beamng.com/threads/field-of-view-fov.96890/
- AC/ACC vertical-FOV practice: https://driver61.com/sim-racing/how-to-set-fov-in-assetto-corsa-and-assetto-corsa-competizione/ · https://steamcommunity.com/app/244210/discussions/0/617336568081930134 · https://simracingcockpit.gg/fov-calculator/
- Forza FOV limits: https://forums.forza.net/t/bigger-fov-range-in-cockpit-view/564529
- True-vs-comfortable FOV trade-off: https://mysimrig.nl/en/blog/simracing/sim-racing-fov-guide/ · https://www.fanatec.com/us/en/explorer/games/gaming-tips/optimizing-fov-for-sim-racing-getting-the-view-right/
- SAE J941 driver eye locations: https://www.sae.org/standards/content/j941_201003/
