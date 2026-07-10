# Visual Reference Brief — founder-supplied targets (2026-07-10)

The founder supplied 4 reference images. Agents cannot see them; this document is the
authoritative transcription of every observable detail, written by the session that viewed
them. All replication is **de-badged and fictional** (ADR-001): shapes/proportions/materials
are the target, never logos, wordmarks, or badge geometry.

---

## REF 1 — Waterfront financial district, golden hour (the ENVIRONMENT target)

Modern Gulf-style (Dubai/Business-Bay-like) waterfront district. Overall: prosperous, clean,
newly built, organized; warm low sun from the right, long shadows, slight haze, damp asphalt
with sun reflections.

**Foreground / promenade:** dark calm water (canal) → concrete embankment wall → wide paved
promenade (large rectangular pavers, two tone bands) → continuous **black metal railing**
along the water. Sparse individual pedestrians (business/casual). Modern **street lamps**
(dark pole, single lantern head) every ~20 m. **Palm trees** in ground grates + low planters;
benches; small utility boxes.

**Midground:** a large **surface parking lot**: clean asphalt, white painted stall lines in
rows, ~15–25 parked cars (sedans/SUVs, varied dark/light), low yellow-black barrier posts at
entrances, thin curb islands with palms. One/two **low retail pavilions** (1–2 floors, dark
stone + bronze glass, thin roof slab). Wide boulevard beyond with sparse traffic.

**Towers (the building kit target — VARIETY is the point, 25–80 floors):**
1. **Concrete-grid towers** (left, tallest pair): beige/grey exposed-concrete punched-window
   grid — deep square window recesses in a strict grid, slightly rounded corner notches,
   dark reflective glass inside each recess, interior lights visible. Massive, monolithic.
2. **Cream vertical-strip tower** (center): beige/cream precast with continuous vertical
   window strips, gently curved side profile, thin parapet crown.
3. **Distant supertall spire** on the horizon (Burj-like silhouette) — background flavor only.
4. **Twin dark-glass towers** (center-right): bronze/brown curtain wall, tight mullion grid,
   many lit interiors, identical pair, flat tops.
5. **Horizontal-strip building** (right, very wide): alternating white concrete bands and
   dark glass strips, ROUNDED corner, reads corporate-HQ. 40–50 floors.
6. **Beige punched-window slab** (far right): regular square windows, some lit, balconies
   hinted on one face.
Ground floors everywhere: retail glazing bands, occasional red signage strips, arcade
recesses, stone podiums 2–3 floors.

**Palette:** beige/cream/white-grey concrete, bronze + blue-grey glass, warm golden sun,
dark asphalt, green palm accents. NOT the current uniform blue-glass towers — the kit needs
**at least 4 distinct facade SYSTEMS** (concrete grid / vertical strips / dark curtain twin /
horizontal bands) with lit-window variation.

---

## REF 2 + REF 3 — "3D Инструктор / City Car Driving" cockpit + environment (the COCKPIT-VIEW target)

**THE COCKPIT CAMERA CONTRACT (founder directive):** the interior must fill **~40–50% of the
frame (bottom)**. Visible simultaneously: the FULL dashboard left-to-right, the instrument
binnacle with round dials, the steering wheel (large, bottom-center, both rim sides), the
center console angled toward the driver (radio/HVAC stack), a wood/aluminum trim strip
across the dash, the LEFT A-pillar, the LEFT side mirror (in the left window area), and the
interior REAR-VIEW mirror (top-right of windshield) showing traffic behind. Windshield =
upper ~55% of frame. Sun visors just visible at the top edge.
→ Implementation: cockpit camera sits higher/further back than a "hood cam"; wide-enough FOV
to catch both A-pillars' bases; the rear-view mirror must be IN FRAME at top-right; the side
mirror glass visible without glancing.

**Environment style (REF 3):** wide 2×2 boulevard, long dashed white lane lines, generous
green lawns between road and buildings, mature leafy trees lining the road, prefab
panel-block apartment buildings (8–10 floors, window grid + balconies), roadside billboards
on poles, blue direction signs, parked cars along the curb, a yellow minibus (GAZelle-type)
and ordinary sedans in traffic, bus stop, street lamps on tall poles, clear blue sky.
Takeaway for us: believable ≠ fancy — it's TREES + LAWNS + PARKED CARS + BILLBOARDS + SIGNS
+ varied ordinary traffic that sell it.

---

## REF 4 — Black boxy luxury SUV (G-Class-type) — the VEHICLE replication target (DE-BADGED)

Founder: replicate every micro detail, but **REMOVE the grille star** (marked) — and by
ADR-001 remove ALL brand marks: grille badge, hood ornament, wheel-cap logos, model wording.
Ship it as a fictional boxy luxury SUV (working name free to choose).

**Proportions:** L ≈ 4.6–4.8 m, W ≈ 1.9 m (2.1 with mirrors), H ≈ 1.95–2.0 m, wheelbase
≈ 2.9 m, high ground clearance (~24 cm), short overhangs, perfectly UPRIGHT slab-sided body,
near-flat windshield, flat roof, vertical pillars.

**Front:** ROUND headlamps with full LED ring DRL, set in squared bezels against a flat
front fascia; **vertical-slat grille** (many chrome/black vertical bars — KEEP the slats,
DELETE the central badge); iconic **turn-indicator pods sitting ON TOP of the front fenders**
(small rounded housings); flat hood with two washer nozzles; lower bumper with wide
three-section mesh intake + silver skid lip; tow points.

**Sides:** flat doors with **visible external hinges**; black protective cladding strip at
mid-height; squared-off flared wheel arches (matte black); **silver running boards** (step
rails) under the doors; **side-exit dual exhaust tips** just behind the front wheels under
the running boards (AMG-style); black door handles; black mirror housings with indicator
strip; tinted glass all around.

**Wheels:** large (21–22") gloss-black **cross-spoke alloys** with a thin **red pinstripe**
on the rim edge, low-profile tires, **RED brake calipers** visible through spokes.

**Rear (standard for the type):** side-hinged tailgate with **full-size spare wheel cover**
mounted on it; small vertical tail lamps; roof-edge trim.

**Materials:** gloss black paint (deep clearcoat), matte black cladding, chrome slats +
mirrors-trim accents, red accents (calipers, rim stripe), dark tinted glass. Photographed on
wet asphalt — strong reflections (our env-map handles this).

---

## Program directives derived from the founder's message

1. **Cockpit camera** per REF 2/3 contract above (40–50% interior visible).
2. **Environment kit v3** per REF 1 (4+ facade systems, podiums, retail bands, parking lots
   with stalls + parked cars, promenade/railing/palm dressing) — replaces the uniform glass kit.
3. **Traffic fleet v2** — MANY more distinct models (sedan, hatch, wagon, crossover, boxy SUV,
   pickup, delivery van, YELLOW MINIBUS, taxi variant, luxury sedan), all self-authored in
   Blender, better silhouettes than v1 (~1–3k tris each is acceptable).
4. **The de-badged boxy luxury SUV** (REF 4) at hero quality.
5. Everything web-budget-disciplined: Draco'd GLBs, instanced rendering, existing pipelines.

---

## REF 5 — CURRENT STATE, chase view (founder screenshot 2026-07-10, post-integration)

What the sim actually looks like now (the gap's "before"): washed-out, low-contrast scene.
Buildings render as FLAT UNTEXTURED boxes — pale grey/white prisms with dark window
rectangles, zero facade texture/relief/material variation; one brick-red block visible.
Ground is uniform pale concrete/asphalt with almost no tonal variation, road/plaza boundary
barely readable; one saturated flat-green lawn patch (no texture). Sky: flat pale blue,
no gradient interest. Lighting: flat ambient, weak shadows, no warm sun direction, no
atmosphere/fog depth. Traffic: recognizable low-poly cars but toy-like — flat paint, no
material response visible at distance, simple boxes with wheels (one police car with
lightbar reads well). Palms/trees read OK but saturated flat green. The hero car (player)
looks good — glossy dark paint with sun highlight + full-width tail light bar. Street
lamps/bench present. Overall verdict: geometry/layout is there; MATERIALS, TEXTURES,
LIGHTING/ATMOSPHERE and GROUND VARIETY are missing — that's the gap.

## REF 6 — CURRENT STATE, cockpit view (founder screenshot, post-reframe)

The 40-50% interior contract OVERSHOT: dash + wheel + roof header now dominate so much
that the windshield is a thin letterbox strip — the student sees "almost nothing" of the
road (founder's words). Cluster/wheel/console read well; rear-view mirror shows a dark
smear; left door mirror shows solid green (grass — aim/exposure wrong). The fix direction:
interior presence YES, but the WINDSHIELD must get ~50-55% of frame with a clear view of
the road 10-100 m ahead; reduce roof-header intrusion (raise pitch or lower eye), fix
mirror cam aim/exposure. Balance target = REF 2 (CCD): dash visible but the WORLD readable.
