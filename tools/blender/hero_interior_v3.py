"""hero_interior_v3.py — the cockpit DETAIL pass (doc 73: every driver-visible
real-car element), building on the v2 windshield-opening rebuild.

WHY: v2 delivered the world-first aperture (window >=65% of frame height) but
the cabin below the cowl line is still block-out massing. Doc 73 specifies 34
research-backed elements (P1 credibility floor / P2 glance+interaction honesty
/ P3 future-pose insurance) under the inherited contracts: the camera contract
moves ZERO landmarks, every element stays out of the windshield band (the
cowl-ray law, doc 73 SS2), all 13 hotspot_* nodes + screens + steering_wheel
hierarchy survive, <=45k tris, <=8 materials, <=250 KB Draco.

WHAT (chassis-local coords: +X car-left, +Y up, +Z fwd; blender frame is
bx=-cx, by=cz, bz=cy+0.55; mount yaw-pi / y-0.55 untouched):
  P1: stalk anatomy into hotspot_indicator_stalk / hotspot_wiper_stalk, column
      clamshell, steering-wheel dress (pods/detents/horn ring - rim R frozen),
      cluster hood brow ON the v2 cap plane, outboard turbine vents, centre
      blade-vent band, HVAC physical bar, centre-screen bezel + stack prow,
      ambient light line (int_emissive, dash + both doors), headlight-panel
      dress, fog icon dot, start halo, hazard triangle, left door card
      (sill/roll/flipper/window pod/armrest/tweeter), interior-mirror bezel +
      day/night tab, demister slots.
  P2: floating console bridge with RAISED selector/EPB (hotspot nodes MOVED to
      chassis (0,0.32,0.43) / (0.093,0.315,0.50) - requires the same-commit
      hotspots.ts sync, doc 73 SS4 P2-1 + the C2 forward revision below),
      right door card @60%, glovebox seam +
      inlay, speaker grilles, passenger-seat pass, grab handles, overhead
      console, door pocket lips, A-pillar base pods.
  P3: pedal set, belt buckle+stalk (hotspot_belt), column adjust lever, visor
      chamfer/elbows/seam, right pocket, etched emissive fascia line, G-Class
      passenger grab bar, B-pillar caps.
  Then: re-runs the doc-71 AO pipeline inline (adapted from
      hero_interior_ao_bake.py for the 8-material shell; occlusion is wired
      into the six LEGACY materials only - int_emissive / int_chrome stay out
      of the atlas per doc 73 SS6) and exports the INT collection.

THE SHIPPED GLB IS NOT THIS SCRIPT'S OUTPUT VERBATIM — READ BEFORE RE-EXPORTING.
Founder register B58 (2026-08-09) raised the WHOLE interior-mirror station by
105 mm: the `hotspot_mirror_rear` node plus the 168 interior_shell vertices that
are the mirror casing, the P1-16 dress and the stalk. The В26 «50» that the
speed lessons' instruction 2 tells the student to read sat behind the mirror at
every distance on the approach, and the founder chose to move the mirror rather
than lower the drills' signs.

That edit is applied POST-EXPORT by `tools/glb/raise_interior_mirror.mjs`, which
carries the derivation and refuses to run twice. It is NOT in this script,
because the mirror's base position comes from hero_interior_v2.py and this file
only dresses it. So: after any re-export, run that tool, or the mirror drops
back onto the sign and VitokCockpit's ROOF_Y / STALK block and
scene/vitok/hotspots.ts will all be 105 mm out.

MEASURED-TRUTH DEVIATIONS from doc-73 nominal coords (the black-slab lesson:
the shipped asset outranks the spec's assumed surfaces; each was re-derived by
raycast against the v2 shell at build time):
  - Door card face measured x +/-0.731 (spec assumed ~0.80): every door
    element shifts inboard with it (flipper, pod, armrest, sill, woofer).
  - Dash face measured z 0.62..0.76 (spec assumed ~0.70-0.735): ambient line,
    vents, seam/inlay hug the RAYCAST face; outboard turbine vents mount at
    the measured dash end (x +/-0.795, z ~0.62).
  - HVAC bar: the spec band y 0.300-0.345 is occupied by the v2-dropped
    centre-screen glass (measured y 0.2535-0.4405) AND the contract
    start/hazard buttons; the bar becomes the stack PROW: face z 0.664, y
    0.245-0.295, in FRONT of the dead lower glass (visible over the P2-1
    console at rest: needs y>=0.253 at that z).
  - Column shroud ends at z 0.612 with a clamped top (spec end z 0.740 would
    pierce the screen_cluster quad at z 0.698-0.723 and occlude the speedo:
    top face capped under the eye->cluster-bottom grazing ray).
  - Speaker dash rings at x +/-0.66 (spec +/-0.88 has NO surface - measured
    dash top ends ~+/-0.84).

C2 SANCTIONED REVISIONS (the two defects the a5ffe65 build flagged):
  FIX 1 - centre-screen glass vs start/hazard: the v2 drop slid the glass
    (measured y 0.2535..0.4405, z 0.665..0.735) down OVER the contract
    start/hazard buttons (band y 0.32..0.36 at z 0.74..0.77, BEHIND the
    glass) - both invisible from every pose. Fix: freeze the glass TOP edge
    (y 0.4405, proven legal under the cowl ray) and raise the BOTTOM edge to
    y 0.360 (scale about the top edge along the quad's in-plane up axis - the
    bezel/back-body derive from SCREEN.matrix_world and follow), then move
    the start/hazard nodes to row y 0.316 mounted FLUSH-PROUD of the
    RAYCAST stack wall (the v1 wall face z~0.71 sits in front of the old
    z~0.75 button coordinates - first C2 iteration showed the wall panel
    swallowing them; button base now touches the measured face, the P1-13
    halo ring lands ~2 mm in front of it). Rest-pose reads: prow cut fy
    ~0.10 < controls < glass edge fy ~0.20 - halo + P1-14 triangle in the
    open band. No windshield change: the glass silhouette only SHRINKS.
  FIX 2 - EPB glance visibility: the spec coordinate (0.093,0.315,0.35) sits
    outside the right-glance frame. The proposed z 0.35->0.25 move fixes only
    the HORIZONTAL exit (fx -0.019 -> +0.027) and drops the switch further
    below the frame BOTTOM (fy -0.122 -> -0.235: still invisible). Projection
    truth (three.js, CameraRig quats): at x 0.093 horizontal-in needs
    z <= 0.27, vertical-in needs z >= 0.49 - right-glance visibility is
    geometrically impossible on the deck. Revision: move the EPB FORWARD to
    (0.093,0.315,0.50) beside the wireless pad with a taller VW pull-tab
    (crest y 0.334) - the switch crest enters the REST frame (fy ~0.03-0.05,
    bottom-centre-right), the pose the pre-drive handbrake step is actually
    graded in. Same-commit hotspots.ts sync for all three nodes.

MUST NOT BREAK (asserted): 13 hotspot_* nodes, screen_cluster/screen_center,
steering_wheel hierarchy, interior_shell/interior_seats grouping, <=8 interior
materials, <=45k tris, window probe >=0.65 both poses, wheel rim R 0.2045.

Run (from repo root; reads the v2 geometry blend, writes v3 work files):
  "E:/blender/blender-5.1.2-windows-x64/blender.exe" --background \
    tools/blender/work/hero_interior_v2.blend \
    --python tools/blender/hero_interior_v3.py
Outputs: work/hero_interior_v3.blend (pre-AO), work/hero_interior_v3_ao.blend,
work/hero_interior_v3.glb + the numeric window probe. Then:
  cd platform && node ../tools/glb/optimize.mjs \
    ../tools/blender/work/hero_interior_v3.glb public/sim/vehicles/hero_interior.glb
"""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

D = bpy.data
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")
PREVIEWS = os.path.join(HERE, "previews")

# ============================================================================
# 1. Frames, the sightline-safety checker (doc 73 SS2), primitives
# ============================================================================
def B(p):
    """chassis (x,y,z) -> blender world Vector."""
    return Vector((-p[0], p[2], p[1] + 0.55))


EYE = (0.24, 0.71, -0.255)          # shipped cockpit camera (tuning.ts)


def cowl_ray(z):                     # rest-frame cowl ray (doc 73 SS2)
    return 0.71 - 0.2408 * (z + 0.255)


def top_ray(z):                      # rest frame-top ray
    return 0.71 + 0.3346 * (z + 0.255)


def hood_cap(z):                     # v2 binnacle hood cap plane (chassis)
    return 0.486 - (z - 0.67) * 0.24


def in_h_frustum(x, z):
    dz = z + 0.255
    return dz > 0.02 and abs(x - 0.24) <= 0.7733 * dz


# Named exemption zones: geometry allowed above the cowl ray ONLY here, with
# the doc-73 justification. Everything else must clear the band numerically.
ZONES = {
    # P1-16: grandfathered mirror-housing envelope (dressed, never enlarged)
    "mirror": lambda x, y, z: abs(x) <= 0.125 and 0.75 <= y <= 0.87 and 0.43 <= z <= 0.60,
    # P2-9: inside the frozen A-pillar base footprint
    "apillar": lambda x, y, z: 0.69 <= abs(x) <= 0.80 and 0.35 <= y <= 0.47 and 0.92 <= z <= 1.03,
    # P1-15: door-mirror sail panel face (existing above-ray surface)
    "sail": lambda x, y, z: abs(x) >= 0.84 and y <= 0.52 and 0.55 <= z <= 0.80,
    # P1-5: coplanar with the hood cap plane that DEFINES the cowl landmark
    "hood": lambda x, y, z: 0.10 <= x <= 0.58 and 0.55 <= z <= 0.90 and y <= hood_cap(z) + 0.001,
}
_violations = []
_exempt_log = set()


def _check(x, y, z, tag):
    if tag is not None:
        if tag.startswith("decal:"):
            _exempt_log.add(tag)         # surface-hugging decal, <=4 mm proud
            return
        zone = ZONES.get(tag)
        if zone is not None:
            if zone(x, y, z):
                _exempt_log.add(tag)
                return
            _violations.append((tag + "-ZONE-MISS", x, y, z))
            return
    if not in_h_frustum(x, z):
        return
    if y <= cowl_ray(z) - 0.010:
        return
    if y >= top_ray(z):
        return
    _violations.append((tag or "band", x, y, z))


class Acc:
    """Chassis-frame geometry accumulator for one target mesh."""

    def __init__(self, name, local=False):
        self.name = name
        self.local = local            # verts already in the object's local frame
        self.verts = []
        self.tags = []
        self.faces = []               # (index-tuple, material name, smooth)
        self.log = []

    def add(self, pts, tag):
        base = len(self.verts)
        for p in pts:
            v = Vector(p)
            self.verts.append(v)
            self.tags.append(tag)
            if not self.local:
                _check(v.x, v.y, v.z, tag)
        return base

    def face(self, idx, mat, smooth=False, lock=False):
        # lock=True: hand-wound normal (open ribbons) — exempt from recalc
        self.faces.append((tuple(idx), mat, smooth, lock))

    def mark(self, label):
        self.log.append((label, sum(len(f[0]) - 2 for f in self.faces)))


def _basis(axis, ref=None):
    a = Vector(axis).normalized()
    r = Vector((0, 0, 1)) if ref is None else Vector(ref)
    u = a.cross(r)
    if u.length < 1e-4:
        u = a.cross(Vector((1, 0, 0)))
    u.normalize()
    return a, u, a.cross(u)


def box(acc, pmin, pmax, mat, tag=None):
    x0, y0, z0 = pmin
    x1, y1, z1 = pmax
    b = acc.add([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                 (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], tag)
    for q in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
              (3, 2, 6, 7), (1, 5, 6, 2), (0, 3, 7, 4)):
        acc.face([b + i for i in q], mat)


def obox(acc, centre, ax, ay, half, mat, tag=None):
    """Oriented box: ax/ay orthogonal-ish axes, az derived; half = 3 half-sizes."""
    ax = Vector(ax).normalized()
    az = ax.cross(Vector(ay)).normalized()
    ay = az.cross(ax)
    c = Vector(centre)
    pts = []
    for sz in (-1, 1):
        for sy in (-1, 1):
            for sx in (-1, 1):
                pts.append(c + ax * (sx * half[0]) + ay * (sy * half[1]) + az * (sz * half[2]))
    b = acc.add(pts, tag)
    for q in ((0, 1, 3, 2), (6, 7, 5, 4), (0, 4, 5, 1),
              (2, 3, 7, 6), (1, 5, 7, 3), (0, 2, 6, 4)):
        acc.face([b + i for i in q], mat)


def cyl(acc, c0, c1, r0, r1, seg, mat, tag=None, cap0=True, cap1=True, smooth=True):
    a, u, v = _basis(Vector(c1) - Vector(c0))
    ring = [(u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg))
            for i in range(seg)]
    p0 = [Vector(c0) + d * r0 for d in ring]
    p1 = [Vector(c1) + d * r1 for d in ring]
    b = acc.add(p0 + p1, tag)
    for i in range(seg):
        j = (i + 1) % seg
        acc.face([b + i, b + j, b + seg + j, b + seg + i], mat, smooth)
    if cap0:
        acc.face([b + i for i in range(seg)][::-1], mat)
    if cap1:
        acc.face([b + seg + i for i in range(seg)], mat)


def annulus(acc, centre, axis, r_out, r_in, depth, seg, mat, tag=None):
    """Ring with rectangular section: front/back annulus + outer/inner walls."""
    a, u, v = _basis(axis)
    c_f = Vector(centre)
    c_b = c_f + a * depth
    ring = [(u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg))
            for i in range(seg)]
    fo = [c_f + d * r_out for d in ring]
    fi = [c_f + d * r_in for d in ring]
    bo = [c_b + d * r_out for d in ring]
    bi = [c_b + d * r_in for d in ring]
    b = acc.add(fo + fi + bo + bi, tag)
    O, I, BO, BI = 0, seg, 2 * seg, 3 * seg
    for i in range(seg):
        j = (i + 1) % seg
        acc.face([b + O + i, b + O + j, b + I + j, b + I + i], mat)              # front
        acc.face([b + BO + j, b + BO + i, b + BI + i, b + BI + j], mat)          # back
        acc.face([b + O + j, b + O + i, b + BO + i, b + BO + j], mat, True)      # outer
        acc.face([b + I + i, b + I + j, b + BI + j, b + BI + i], mat, True)      # inner


def ribbon_x(acc, nodes, y0, y1, mat, tag=None, break_dz=0.05):
    """Continuous face-hugging strip along x: nodes = [(x, z)], verts at
    y0/y1, wound to face the driver (-z). Splits where the face depth jumps
    (door shutlines, dash ends) — the stepped-dash artefact fix."""
    runs, run = [], [nodes[0]]
    for a, b in zip(nodes[:-1], nodes[1:]):
        if abs(b[1] - a[1]) > break_dz:
            runs.append(run)
            run = [b]
        else:
            run.append(b)
    runs.append(run)
    for r in runs:
        if len(r) < 2:
            continue
        base = acc.add([(x, y0, z) for x, z in r] + [(x, y1, z) for x, z in r], tag)
        n = len(r)
        for i in range(n - 1):
            acc.face([base + n + i, base + n + i + 1, base + i + 1, base + i],
                     mat, False, lock=True)


def arc_tube(acc, centre, plane_normal, R, r, a0, a1, seg_a, seg_r, mat, tag=None):
    """Partial torus (rim thumb detents). Angles in the plane's u/v basis."""
    n, u, v = _basis(plane_normal)
    rings = []
    for i in range(seg_a + 1):
        t = a0 + (a1 - a0) * i / seg_a
        c = Vector(centre) + (u * math.cos(t) + v * math.sin(t)) * R
        rad = (u * math.cos(t) + v * math.sin(t))
        rings.append([c + (rad * math.cos(2 * math.pi * k / seg_r)
                           + n * math.sin(2 * math.pi * k / seg_r)) * r
                      for k in range(seg_r)])
    flat = [p for ring in rings for p in ring]
    b = acc.add(flat, tag)
    for i in range(seg_a):
        for k in range(seg_r):
            k2 = (k + 1) % seg_r
            acc.face([b + i * seg_r + k, b + i * seg_r + k2,
                      b + (i + 1) * seg_r + k2, b + (i + 1) * seg_r + k], mat, True)
    acc.face([b + k for k in range(seg_r)][::-1], mat)
    acc.face([b + seg_a * seg_r + k for k in range(seg_r)], mat)


# ============================================================================
# 2. Materials: the two doc-73 additions (8 = ceiling)
# ============================================================================
assert "int_emissive" not in D.materials and "int_chrome" not in D.materials

em = D.materials.new("int_emissive")
em.use_nodes = True
_b = em.node_tree.nodes["Principled BSDF"]
_b.inputs["Base Color"].default_value = (0.02, 0.016, 0.012, 1)
_b.inputs["Roughness"].default_value = 0.4
_b.inputs["Emission Color"].default_value = (1.0, 0.84, 0.62, 1)   # warm white
_b.inputs["Emission Strength"].default_value = 1.2                 # ~40-nit look

ch = D.materials.new("int_chrome")
ch.use_nodes = True
_b = ch.node_tree.nodes["Principled BSDF"]
_b.inputs["Base Color"].default_value = (0.78, 0.80, 0.83, 1)
_b.inputs["Metallic"].default_value = 1.0
_b.inputs["Roughness"].default_value = 0.15                        # brighter than int_alu

# ============================================================================
# 3. Measured-surface probes (BVH against the PRE-DETAIL shell/seats)
# ============================================================================
_deps = bpy.context.evaluated_depsgraph_get()
shell_ob = D.objects["interior_shell"]
seats_ob = D.objects["interior_seats"]
BVH_SHELL = BVHTree.FromObject(shell_ob, _deps)          # shell is at origin
BVH_SEATS = BVHTree.FromObject(seats_ob, _deps)          # seats-LOCAL space
SEATS_INV = seats_ob.matrix_world.inverted()
SEATS_M = seats_ob.matrix_world


def _shell_ray(origin_c, dir_c, max_dist=2.0):
    o = B(origin_c)
    d = (B((origin_c[0] + dir_c[0], origin_c[1] + dir_c[1],
            origin_c[2] + dir_c[2])) - o).normalized()
    loc, nrm, _i, dist = BVH_SHELL.ray_cast(o, d, max_dist)
    if loc is None:
        return None
    return (-loc.x, loc.z - 0.55, loc.y)                 # chassis hit point


def dash_z(x, y, fallback):
    """Forward raycast onto the dash face; chassis z of the face."""
    h = _shell_ray((x, y, 0.20), (0, 0, 1))
    return h[2] if h and 0.45 <= h[2] <= 0.90 else fallback


def door_x(y, z, side, fallback=0.731):
    """Door inner face |x| on the given side (+1 left / -1 right)."""
    h = _shell_ray((0.30 * side, y, z), (side, 0, 0))
    return h[0] * side if h and 0.60 <= h[0] * side <= 0.90 else fallback


def top_y(x, z, fallback):
    """Downward raycast onto the dash/cowl top; chassis y of the surface."""
    h = _shell_ray((x, 0.62, z), (0, -1, 0))
    return h[1] if h and 0.30 <= h[1] <= 0.55 else fallback


def seats_hit(origin_c, dir_c, max_dist=1.5):
    o = SEATS_INV @ B(origin_c)
    d = (SEATS_INV.to_3x3() @ (B((origin_c[0] + dir_c[0], origin_c[1] + dir_c[1],
                                  origin_c[2] + dir_c[2])) - B(origin_c))).normalized()
    loc, nrm, _i, dist = BVH_SEATS.ray_cast(o, d, max_dist)
    if loc is None:
        return None
    w = SEATS_M @ loc
    return (-w.x, w.z - 0.55, w.y)


# ============================================================================
# 4. Element builds
# ============================================================================
SH = Acc("interior_shell")            # static geometry -> shell (merge policy SS7.1)
ST = Acc("interior_seats")            # P2-5
WH = Acc("steering_wheel_mesh", local=True)   # wheel-LOCAL frame (see SS4.4)

MDARK, MLTHR, MALU, MACC, MGLS, MSEAT = ("int_dark", "int_leather", "int_alu",
                                         "int_accent", "int_gloss", "int_seat")
MEM, MCHR = "int_emissive", "int_chrome"

# ---- P1-3 column shroud clamshell (top clamped under the eye->cluster ray;
#      spec end z 0.740 would pierce the screen_cluster quad, see header) ----
def build_shroud():
    zs = [0.545, 0.565, 0.585, 0.600, 0.612]
    seg = 12
    rings = []
    for k, z in enumerate(zs):
        t = k / (len(zs) - 1)
        cy = 0.30 + (z - 0.52) * 0.4892            # column axis (0,0.44,0.90)n
        hw = 0.070 - 0.010 * t
        hh = 0.0475 - 0.010 * t
        cap = 0.706 - 0.404 * (z + 0.255) - 0.002  # eye->cluster-bottom graze
        pts = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            x = 0.34 + math.cos(a) * hw
            y = cy + math.sin(a) * hh
            pts.append((x, min(y, cap), z))
        rings.append(pts)
    bases = [SH.add(r, None) for r in rings]       # one connected manifold
    for k in range(len(bases) - 1):
        for i in range(seg):
            j = (i + 1) % seg
            SH.face([bases[k] + i, bases[k] + j, bases[k + 1] + j, bases[k + 1] + i],
                    MDARK, True)
    SH.face([bases[-1] + i for i in range(seg)], MDARK)
    SH.face([bases[0] + i for i in range(seg)][::-1], MDARK)
    # parting groove: slim gloss ring inset at the clamshell split
    z = 0.585
    cy = 0.30 + (z - 0.52) * 0.4892
    cyl(SH, (0.34, cy, z - 0.0015), (0.34, cy, z + 0.0015), 0.0585, 0.0585,
        seg, MGLS, cap0=False, cap1=False)
    SH.mark("P1-3 column shroud")


build_shroud()

# ---- P1-1 / P1-2 stalks (built into their hotspot nodes in section 5) ------
def stalk_geom(acc, root, tip, alu_collar, end_button, tag=None):
    root = Vector(root)
    tip = Vector(tip)
    axis = (tip - root).normalized()
    # tapered shaft: root buried 20 mm toward the shroud for a seamless joint
    r0 = root - axis * 0.020
    shaft_end = root + (tip - root) * 0.72
    cyl(acc, tuple(r0), tuple(shaft_end), 0.0090, 0.0062, 10, MDARK, tag)
    # alu collar ring near the root (indicator) / trim ring (wiper)
    if alu_collar:
        c0 = root + axis * 0.012
        c1 = root + axis * 0.020
        cyl(acc, tuple(c0), tuple(c1), 0.0098, 0.0098, 10, MALU, tag,
            cap0=False, cap1=False)
    # flattened paddle tip 32x18x10 mm, long axis along the stalk
    pc = shaft_end + axis * 0.014
    up = Vector((0, 1, 0))
    obox(acc, tuple(pc), tuple(axis), tuple(up), (0.016, 0.009, 0.005), MDARK, tag)
    if end_button:                                  # VW wiper end button
        bc = pc + axis * 0.016
        cyl(acc, tuple(bc), tuple(bc + axis * 0.004), 0.005, 0.005, 8, MALU, tag)
        # INT slider ridge on the paddle top face
        obox(acc, tuple(pc + up * 0.0105), tuple(axis), tuple(up),
             (0.007, 0.0018, 0.003), MALU, tag)
    else:                                           # lane-change detent ridge
        obox(acc, tuple(pc + up * 0.0105), tuple(axis), tuple(up),
             (0.010, 0.0015, 0.0035), MDARK, tag)


IND = Acc("hotspot_indicator_stalk")
stalk_geom(IND, (0.42, 0.325, 0.600), (0.535, 0.305, 0.575), True, False)
IND.mark("P1-1 indicator stalk")
WIP = Acc("hotspot_wiper_stalk")
stalk_geom(WIP, (0.26, 0.325, 0.600), (0.145, 0.305, 0.575), True, True)
WIP.mark("P1-2 wiper stalk")

# ---- P1-5 cluster hood brow (top face ON the v2 cap plane: zero silhouette) -
def build_brow():
    z0, z1, th = 0.630, 0.660, 0.008
    ya, yb = hood_cap(z0), hood_cap(z1)
    pts = [(0.14, ya - th, z0), (0.54, ya - th, z0), (0.54, ya, z0), (0.14, ya, z0),
           (0.14, yb - th, z1), (0.54, yb - th, z1), (0.54, yb, z1), (0.14, yb, z1)]
    b = SH.add(pts, "hood")
    for q in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
              (3, 2, 6, 7), (1, 5, 6, 2), (0, 3, 7, 4)):
        SH.face([b + i for i in q], MDARK)
    # 4 mm recessed flock inner lip under the brow leading edge
    box(SH, (0.15, ya - th - 0.004, z0 + 0.004), (0.53, ya - th, z0 + 0.012), MDARK, "hood")
    SH.mark("P1-5 hood brow")


build_brow()

# ---- P1-6 outboard turbine vents (mounted at the MEASURED dash end) ---------
def build_turbine(side, fins, seg):
    # the whole vent is a PROUD drum: the v2 dash face has no hole to recess
    # into, so the 14 mm recess reads forward of the face (drum housing)
    face = dash_z(0.795 * side, 0.415, 0.625)
    zr = face - 0.018                                    # chrome ring face plane
    c = (0.795 * side, 0.415, zr)
    annulus(SH, c, (0, 0, 1), 0.0475, 0.0375, 0.008, seg, MCHR)
    # recess cavity: dark tube back to 2 mm in FRONT of the dash face + disc
    cyl(SH, (c[0], c[1], zr + 0.002), (c[0], c[1], face - 0.002), 0.0372, 0.0372,
        seg, MDARK, cap0=False, cap1=True, smooth=True)
    # radial fins (deep along the drum, thin tangentially)
    for i in range(fins):
        a = math.pi * 2 * i / fins + 0.3
        d = (math.cos(a), math.sin(a), 0)
        fc = (c[0] + d[0] * 0.0235, c[1] + d[1] * 0.0235, zr + 0.008)
        obox(SH, fc, d, (0, 0, 1), (0.0135, 0.0055, 0.0012), MDARK)
    # hub bullet (nose toward the driver)
    cyl(SH, (c[0], c[1], zr + 0.004), (c[0], c[1], face - 0.004), 0.0045, 0.011,
        seg, MCHR)
    # drum housing tying the ring into the dash end
    cyl(SH, (c[0], c[1], zr + 0.001), (c[0], c[1], face - 0.001), 0.050, 0.047,
        seg, MDARK, cap0=False, cap1=False, smooth=True)
    SH.mark(f"P1-6 turbine vent {'L' if side > 0 else 'R'}")


build_turbine(+1, 8, 16)      # rest-view frame-left anchor, full detail
build_turbine(-1, 6, 12)      # right-glance only, 55% detail

# ---- P1-7 centre blade vent band (face hugs the measured dash) --------------
def build_blade_band():
    # shallow-relief blade vent PROUD of the (hole-less) dash face
    zf = min(dash_z(-0.26, 0.446, 0.745), dash_z(0.26, 0.446, 0.745)) - 0.007
    y0, y1 = 0.435, 0.457
    # alu bezel frame (top/bottom rails + ends)
    box(SH, (-0.28, y1 - 0.003, zf), (0.28, y1, zf + 0.006), MALU)
    box(SH, (-0.28, y0, zf), (0.28, y0 + 0.003, zf + 0.006), MALU)
    box(SH, (-0.28, y0, zf), (-0.274, y1, zf + 0.006), MALU)
    box(SH, (0.274, y0, zf), (0.28, y1, zf + 0.006), MALU)
    # dark cavity plane 1 mm in front of the dash face
    box(SH, (-0.276, y0 + 0.002, zf + 0.0045), (0.276, y1 - 0.002, zf + 0.006), MDARK)
    # 14 vertical vanes at 40 mm pitch
    for i in range(14):
        x = -0.26 + i * 0.04
        box(SH, (x - 0.0012, y0 + 0.002, zf + 0.0005), (x + 0.0012, y1 - 0.002, zf + 0.004), MDARK)
    # knurled centre control tab
    box(SH, (-0.008, y0 + 0.004, zf - 0.004), (0.008, y0 + 0.014, zf + 0.0015), MALU)
    SH.mark("P1-7 blade vent band")


build_blade_band()

# ---- P1-8 HVAC bar as the stack PROW + P1-9 screen bezel/back (see header) --
SCREEN = D.objects["screen_center"]

# C2 FIX 1a: reshape the centre glass BEFORE build_stack reads its matrix.
# Freeze the top edge (y 0.4405 - proven legal), raise the bottom edge
# 0.2535 -> 0.360 by scaling the quad about its top edge along the local
# in-plane up axis (local +Z; the object origin is the quad centre, no
# parent). The P1-9 bezel lips + back-body are built from SCREEN.matrix_world
# below, so they follow the reshape automatically. This opens the rest-pose
# stack band fy ~0.10..0.20 for the start/hazard row (section 5).
_scr_m = SCREEN.matrix_world.copy()
_scr_up = (_scr_m.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()
_scr_top = _scr_m @ Vector((0.0, 0.0, 0.094))        # top-edge centre (world)
_scr_half = (_scr_top.z - (0.360 + 0.55)) / _scr_up.z / 2.0
assert 0.030 < _scr_half < 0.050, f"glass reshape out of band: {_scr_half:.4f}"
SCREEN.scale.z *= _scr_half / 0.094
SCREEN.location = _scr_top - _scr_up * _scr_half
bpy.context.view_layer.update()
print(f"C2 fix1a: screen_center bottom 0.2535 -> 0.360 "
      f"(half {_scr_half:.4f}, scale.z {SCREEN.scale.z:.4f})")


def build_stack():
    zf = 0.664                                    # prow face, in front of glass
    y0, y1 = 0.245, 0.295
    zback = dash_z(0, 0.22, 0.75)
    # gloss prow body: face panel + return to the stack face (return top kept
    # at y 0.253: below the rest-pose prow cut, so the shelf stays invisible
    # now that the C2 glass reshape lifted the glass bottom to 0.355)
    box(SH, (-0.20, y0, zf), (0.20, y1, zf + 0.012), MGLS)
    box(SH, (-0.20, y0, zf + 0.012), (0.20, 0.253, zback + 0.01), MGLS)
    # gloss ledge under the glass, ending BEFORE the canted glass plane (0.675+)
    box(SH, (-0.19, y1 - 0.004, zf), (0.19, y1, 0.671), MGLS)
    # lower fascia tying the stack into the tunnel (fills the open underside)
    box(SH, (-0.19, 0.150, zf + 0.020), (0.19, y0 + 0.004, zback + 0.010), MDARK)
    # 2 temp rotaries (alu, centre button) on the prow face
    for sx in (-1, 1):
        c = (sx * 0.140, 0.272, zf)
        cyl(SH, (c[0], c[1], zf + 0.002), (c[0], c[1], zf - 0.013), 0.019, 0.019,
            12, MALU, cap0=False, cap1=True)
        cyl(SH, (c[0], c[1], zf - 0.013), (c[0], c[1], zf - 0.016), 0.007, 0.007,
            10, MDARK)
        # knurl tick
        box(SH, (c[0] - 0.0012, 0.284, zf - 0.0155), (c[0] + 0.0012, 0.290, zf - 0.012), MDARK)
    # 5 button caps 18x12 (auto/AC/recirc/defrost x2) + emissive glyph dots
    for i in range(5):
        x = -0.052 + i * 0.026
        box(SH, (x - 0.009, 0.260, zf - 0.006), (x + 0.009, 0.272, zf + 0.002), MDARK)
        box(SH, (x - 0.0025, 0.2755, zf - 0.0025), (x + 0.0025, 0.2775, zf + 0.002), MEM)
    SH.mark("P1-8 HVAC prow bar")

    # P1-9: 6 mm gloss bezel lip around the glass sides/top + tablet back-body
    m = SCREEN.matrix_world

    def scr(lx, ly, lz):
        w = m @ Vector((lx, ly, lz))
        return (-w.x, w.z - 0.55, w.y)

    hx, hz = 0.18, 0.094
    lips = [((-hx - 0.007, -hz, -0.004), (-hx - 0.001, hz + 0.007, 0.004)),   # pass. side
            ((hx + 0.001, -hz, -0.004), (hx + 0.007, hz + 0.007, 0.004)),     # driver side
            ((-hx - 0.007, hz + 0.001, -0.004), (hx + 0.007, hz + 0.007, 0.004))]  # top
    for (a, b_) in lips:
        corners = []
        for lz in (a[2], b_[2]):                # local y = behind-glass axis
            for ly in (a[1], b_[1]):
                for lx in (a[0], b_[0]):
                    corners.append(scr(lx, lz, ly))
        bb = SH.add(corners, None)
        for q in ((0, 1, 3, 2), (6, 7, 5, 4), (0, 4, 5, 1),
                  (2, 3, 7, 6), (1, 5, 7, 3), (0, 2, 6, 4)):
            SH.face([bb + i for i in q], MGLS)
    # slim back-body slab (tablet thickness read from the side)
    corners = [scr(sx * (hx - 0.006), 0.004, sy * (hz - 0.006)) for sy in (-1, 1) for sx in (-1, 1)] + \
              [scr(sx * (hx - 0.006), 0.018, sy * (hz - 0.006)) for sy in (-1, 1) for sx in (-1, 1)]
    bb = SH.add(corners, None)
    for q in ((0, 1, 3, 2), (6, 7, 5, 4), (0, 4, 5, 1),
              (2, 3, 7, 6), (1, 5, 7, 3), (0, 2, 6, 4)):
        SH.face([bb + i for i in q], MGLS)
    SH.mark("P1-9 screen bezel + prow")


build_stack()

# ---- P1-10 ambient light line (raycast-hugging, dash + both door uppers) ----
def build_ambient():
    # ONE continuous ribbon hugging the dash face (per-node raycast, smoothed
    # with a neighbourhood min so it never sinks into locally-forward panels)
    xs = [-0.86 + i * 0.04 for i in range(44)]
    zs = [dash_z(x, 0.4145, 0.75) for x in xs]
    nodes = []
    for i, x in enumerate(xs):
        zwin = zs[max(0, i - 1):i + 2]
        nodes.append((x, min(zwin) - 0.004))
    ribbon_x(SH, nodes, 0.4130, 0.4160, MEM)
    for side in (1, -1):                          # door wraps, above the sill trim
        xf = door_x(0.42, 0.50, side)
        x0, x1 = side * (xf - 0.0065), side * (xf - 0.002)
        box(SH, (min(x0, x1), 0.422, 0.35), (max(x0, x1), 0.426, 0.62), MEM)
    SH.mark("P1-10 ambient light line")


build_ambient()

# ---- P1-11 headlight-panel dress (existing rotary kept; bezel + thumbwheel) -
def build_headlight_dress():
    n = Vector((0, 0.334, -0.943))                # measured panel rake normal
    c = Vector((0.655, 0.342, 0.71)) - n * 0.0145
    annulus(SH, tuple(c), tuple(-n), 0.0315, 0.0275, 0.004, 12, MALU)
    # range thumbwheel half-buried in a slot, inboard-below the rotary
    wc = Vector((0.596, 0.318, 0.717))
    obox(SH, tuple(wc + n * 0.004), (1, 0, 0), tuple(n), (0.011, 0.005, 0.007), MDARK)
    cyl(SH, tuple(wc + Vector((-0.008, 0, 0))), tuple(wc + Vector((0.008, 0, 0))),
        0.0085, 0.0085, 10, MALU, cap0=True, cap1=True)
    SH.mark("P1-11 headlight panel dress")


build_headlight_dress()

# ---- P1-15 left door card + P2-2 right door card (measured face) ------------
def build_door(side, full):
    xf = door_x(0.415, 0.55, side)                # ~0.731
    s = side

    def X(v):                                     # face-relative inboard offset
        return s * (xf - v)

    # beltline sill trim (alu)
    box(SH, (min(X(0.007), X(-0.001)), 0.398, 0.30), (max(X(0.007), X(-0.001)), 0.418, 0.62), MALU)
    # soft upper roll (leather)
    box(SH, (min(X(0.025), X(0.0)), 0.430, 0.30), (max(X(0.025), X(0.0)), 0.470, 0.62), MLTHR)
    # armrest pad + body
    box(SH, (min(X(0.078), X(0.0)), 0.160, 0.05), (max(X(0.078), X(0.0)), 0.190, 0.45), MLTHR)
    box(SH, (min(X(0.060), X(0.0)), 0.100, 0.08), (max(X(0.060), X(0.0)), 0.160, 0.42), MDARK)
    # pull-cup recess read (dark inset on the pad top)
    box(SH, (min(X(0.052), X(0.014)), 0.1905, 0.30), (max(X(0.052), X(0.014)), 0.1925, 0.395), MDARK)
    # chrome release flipper on a dark recess plate
    box(SH, (min(X(0.019), X(-0.001)), 0.262, 0.452), (max(X(0.019), X(-0.001)), 0.298, 0.548), MDARK)
    obox(SH, (X(0.0265), 0.280, 0.500), (0, 0, 1), (s, 0, 0), (0.045, 0.004, 0.011), MCHR)
    # door woofer ring + grille disc (ring 6.5 mm proud of the card face)
    wc = (X(0.0065), 0.045, 0.44)
    annulus(SH, wc, (s, 0, 0), 0.075, 0.062, 0.008, 14 if full else 10, MALU)
    cyl(SH, (X(0.004), 0.045, 0.44), (X(-0.002), 0.045, 0.44), 0.063, 0.063,
        14 if full else 10, MDARK, cap0=True, cap1=False)
    if full:
        # window-switch pod on the armrest top: plate + 4 rockers + lockout
        box(SH, (min(X(0.075), X(0.017)), 0.190, 0.175), (max(X(0.075), X(0.017)), 0.2055, 0.365), MDARK)
        for i in range(4):
            z = 0.205 + i * 0.034
            box(SH, (min(X(0.065), X(0.037)), 0.2055, z), (max(X(0.065), X(0.037)), 0.2125, z + 0.024), MDARK)
        box(SH, (min(X(0.060), X(0.042)), 0.2055, 0.344), (max(X(0.060), X(0.042)), 0.2105, 0.358), MACC)
        # mirror 4-way knob forward of the pod
        cyl(SH, (X(0.046), 0.2055, 0.400), (X(0.046), 0.2185, 0.400), 0.011, 0.009,
            10, MDARK)
        # tweeter pod on the mirror sail (decal on the grandfathered panel)
        cyl(SH, (s * 0.875, 0.468, 0.665), (s * 0.845, 0.472, 0.660), 0.019, 0.013,
            10, MDARK, "sail")
        annulus(SH, (s * 0.8455, 0.4715, 0.6605), (s, 0.1, -0.15), 0.014, 0.010,
                0.003, 10, MALU, "sail")
    SH.mark(f"{'P1-15 left' if full else 'P2-2 right'} door card")


build_door(+1, True)
build_door(-1, False)

# ---- P1-16 interior-mirror dress (inside the grandfathered envelope) --------
def build_mirror_dress():
    mr = D.objects["hotspot_mirror_rear"]
    m = mr.matrix_world

    def mrp(lx, ly, lz):
        w = m @ Vector((lx, ly, lz))
        return (-w.x, w.z - 0.55, w.y)

    hx, hz = 0.112, 0.038                          # quad local half extents
    fr = 0.0045                                    # 3 mm bezel / 0.84 scale
    strips = [((-hx - fr, -hz - fr), (-hx, hz + fr)),
              ((hx, -hz - fr), (hx + fr, hz + fr)),
              ((-hx, hz), (hx, hz + fr)),
              ((-hx, -hz - fr), (hx, -hz))]
    for (a, c_) in strips:
        corners = [mrp(lx, ly, lz) for ly in (-0.004, 0.004)
                   for lz in (a[1], c_[1]) for lx in (a[0], c_[0])]
        bb = SH.add(corners, "mirror")
        for q in ((0, 1, 3, 2), (6, 7, 5, 4), (0, 4, 5, 1),
                  (2, 3, 7, 6), (1, 5, 7, 3), (0, 2, 6, 4)):
            SH.face([bb + i for i in q], MDARK)
    # day/night flip tab under the bottom edge (25x8 mm)
    corners = [mrp(lx, ly, lz) for ly in (-0.006, 0.002)
               for lz in (-hz - 0.0145, -hz - 0.003) for lx in (-0.0149, 0.0149)]
    bb = SH.add(corners, "mirror")
    for q in ((0, 1, 3, 2), (6, 7, 5, 4), (0, 4, 5, 1),
              (2, 3, 7, 6), (1, 5, 7, 3), (0, 2, 6, 4)):
        SH.face([bb + i for i in q], MDARK)
    SH.mark("P1-16 mirror dress")


build_mirror_dress()

# ---- P1-17 demister slot pair (surface decals on the cowl slope) ------------
def build_demisters():
    for sx in (0.35, -0.35):
        ya = top_y(sx, 0.83, 0.45)
        yb = top_y(sx, 0.89, 0.44)
        # slot cavity: dark slab following the local slope, 1 mm proud
        for (za, zb, y0, y1) in ((0.83, 0.89, ya + 0.001, yb + 0.001),):
            pts = [(sx - 0.15, y0, za), (sx + 0.15, y0, za), (sx + 0.15, y0 + 0.003, za), (sx - 0.15, y0 + 0.003, za),
                   (sx - 0.15, y1, zb), (sx + 0.15, y1, zb), (sx + 0.15, y1 + 0.003, zb), (sx - 0.15, y1 + 0.003, zb)]
            bb = SH.add(pts, "decal:demister-slot-on-cowl")
            for q in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
                      (3, 2, 6, 7), (1, 5, 6, 2), (0, 3, 7, 4)):
                SH.face([bb + i for i in q], MDARK)
        # slot vanes read: 3 cross ribs
        for i in range(3):
            z = 0.845 + i * 0.015
            ym = top_y(sx, z, 0.445)
            box(SH, (sx - 0.14, ym + 0.003, z - 0.0012), (sx + 0.14, ym + 0.0055, z + 0.0012),
                MDARK, "decal:demister-rib")
    SH.mark("P1-17 demister slots")


build_demisters()

# ---- P2-1 floating console bridge (deck static; selector/EPB are hotspots) --
def build_console():
    tun_f = 0.152                                  # measured tunnel top (front)
    tun_a = 0.146                                  # (aft)
    # deck body + gloss top plate, top y 0.31 (doc 73 SS4 P2-1)
    box(SH, (-0.15, 0.260, 0.18), (0.15, 0.305, 0.55), MDARK)
    box(SH, (-0.15, 0.305, 0.18), (0.15, 0.310, 0.55), MGLS)
    # supports: front legs + aft pedestal (open shelf between = floating read)
    box(SH, (-0.13, tun_f - 0.01, 0.50), (0.13, 0.262, 0.55), MDARK)
    box(SH, (-0.13, tun_a - 0.01, 0.18), (0.13, 0.262, 0.235), MDARK)
    # selector collar (alu) + rubber boot cone around the hotspot shaft
    annulus(SH, (0.0, 0.3105, 0.43), (0, 1, 0), 0.033, 0.026, 0.0015, 12, MALU)
    cyl(SH, (0.0, 0.310, 0.43), (0.0, 0.328, 0.43), 0.0255, 0.013, 12, MDARK,
        cap0=False, cap1=False)
    # EPB bezel plate (switch itself = hotspot_parking_brake) — C2 fix 2:
    # moved forward with the switch, z 0.35 -> 0.50 (rest-frame visibility)
    box(SH, (0.071, 0.3105, 0.478), (0.115, 0.3135, 0.522), MALU)
    # wireless-pad slant in the front recess (z 0.52-0.55)
    obox(SH, (0.0, 0.3155, 0.524), (1, 0, 0), (0, 0.966, -0.259),
         (0.055, 0.0035, 0.026), MDARK)
    # 2 USB-C dots on the shelf face under the deck front
    for sx in (-0.022, 0.022):
        box(SH, (sx - 0.0045, 0.270, 0.4985), (sx + 0.0045, 0.2725, 0.5005), MEM)
    # open shelf floor hint on the tunnel between the supports
    box(SH, (-0.11, tun_a, 0.24), (0.11, tun_a + 0.004, 0.495), MDARK)
    SH.mark("P2-1 console bridge deck")


build_console()

# ---- P2-3 glovebox seam + latch + inlay / P3-6 etched emissive line ---------
def build_passenger_fascia():
    def strip_nodes(x0, x1, y, off):
        xs = [x0 + i * (x1 - x0) / 12 for i in range(13)]
        zs = [dash_z(x, y, 0.73) for x in xs]
        out = []
        for i, x in enumerate(xs):
            out.append((x, min(zs[max(0, i - 1):i + 2]) - off))
        return out

    ribbon_x(SH, strip_nodes(-0.75, -0.35, 0.279, 0.0025), 0.276, 0.282, MDARK)  # seam
    ribbon_x(SH, strip_nodes(-0.75, -0.35, 0.380, 0.0020), 0.362, 0.398, MACC)   # inlay
    ribbon_x(SH, strip_nodes(-0.70, -0.30, 0.380, 0.0040), 0.378, 0.3812, MEM)   # etch
    zl = dash_z(-0.52, 0.29, 0.73)
    box(SH, (-0.55, 0.282, zl - 0.008), (-0.49, 0.298, zl - 0.001), MDARK)       # latch
    box(SH, (-0.535, 0.286, zl - 0.010), (-0.505, 0.294, zl - 0.007), MALU)
    SH.mark("P2-3 glovebox fascia + P3-6 etch")


build_passenger_fascia()

# ---- P2-4 speaker grilles: dash corners at the MEASURED dash top ------------
def build_dash_speakers():
    for sx in (0.66, -0.66):
        ya = top_y(sx, 0.81, 0.46)
        yb = top_y(sx, 0.87, 0.45)
        c = (sx, (ya + yb) / 2 + 0.004, 0.84)
        n = Vector((0, 0.06, ya - yb)).normalized()
        if n.y < 0.5:
            n = Vector((0, 1, 0))
        annulus(SH, c, tuple(-n), 0.030, 0.024, 0.004, 12, MALU, "decal:dash-speaker-ring")
        cyl(SH, tuple(Vector(c) - n * 0.0005), tuple(Vector(c) - n * 0.0035), 0.025, 0.025,
            12, MDARK, "decal:dash-speaker-disc", cap0=True, cap1=False)
    SH.mark("P2-4 dash speaker rings")


build_dash_speakers()

# ---- P2-6 grab handles + P2-7 overhead console (header logic: out of frame) -
def build_headliner_kit():
    for sx in (0.70, -0.70):
        for zc in (-0.155, 0.055):                  # end mounts
            box(SH, (sx - 0.016, 0.838, zc - 0.014), (sx + 0.016, 0.858, zc + 0.014), MDARK)
        box(SH, (sx - 0.011, 0.8415, -0.168), (sx + 0.011, 0.8555, 0.068), MDARK)  # folded bar
    box(SH, (-0.09, 0.845, -0.07), (0.09, 0.858, 0.03), MDARK)                     # dome plate
    for sx in (-0.045, 0.045):                                                     # lens squares
        box(SH, (sx - 0.007, 0.8435, -0.052), (sx + 0.007, 0.8455, -0.038), MEM)
    box(SH, (-0.012, 0.8435, -0.022), (0.012, 0.8462, 0.006), MDARK)               # rocker
    SH.mark("P2-6/7 grab handles + overhead console")


build_headliner_kit()

# ---- P2-8 / P3-5 door pocket lips + sill scuff ------------------------------
def build_pockets():
    for side, full in ((1, True), (-1, False)):
        xf = door_x(0.10, 0.30, side)
        s = side
        lipx0, lipx1 = s * (xf - 0.026), s * (xf - 0.016)
        box(SH, (min(lipx0, lipx1), -0.020, 0.14), (max(lipx0, lipx1), 0.035, 0.34), MDARK)
        for ze in (0.14, 0.34):                     # end caps to the door face
            e0, e1 = s * (xf - 0.026), s * xf
            box(SH, (min(e0, e1), -0.020, ze - 0.006), (max(e0, e1), 0.035, ze + 0.006), MDARK)
        if full:                                    # bottle cradle bump + scuff
            box(SH, (min(s * (xf - 0.030), s * (xf - 0.014)), 0.030, 0.21),
                (max(s * (xf - 0.030), s * (xf - 0.014)), 0.040, 0.27), MDARK)
            box(SH, (min(s * (xf - 0.006), s * (xf + 0.0005)), -0.055, 0.16),
                (max(s * (xf - 0.006), s * (xf + 0.0005)), -0.030, 0.55), MDARK)
    SH.mark("P2-8/P3-5 door pockets")


build_pockets()

# ---- P2-9 A-pillar base tweeter pods (inside the frozen section) ------------
def build_pillar_pods():
    for s in (1, -1):
        cyl(SH, (s * 0.740, 0.418, 0.978), (s * 0.712, 0.424, 0.966), 0.015, 0.007,
            10, MDARK, "apillar")
    SH.mark("P2-9 A-pillar base pods")


build_pillar_pods()

# ---- P2-5 passenger-seat visible pass (surfaces probed on the seats mesh) ---
def build_seat_pass():
    top = seats_hit((-0.42, 0.45, 0.05), (0, -1, 0))
    cy = top[1] if top else 0.09                    # cushion top
    bk = seats_hit((-0.42, 0.32, 0.25), (0, 0, -1))
    bz = bk[2] if bk else -0.30                     # backrest front plane
    A = ST
    # headrest volume + posts
    box(A, (-0.50, 0.665, bz - 0.16), (-0.34, 0.760, bz - 0.075), MSEAT)
    for x in (-0.46, -0.38):
        cyl(A, (x, 0.60, bz - 0.115), (x, 0.67, bz - 0.115), 0.006, 0.006, 8, MDARK)
    # cushion bolster ridges
    for x0, x1 in ((-0.60, -0.55), (-0.29, -0.24)):
        box(A, (x0, cy - 0.005, -0.28), (x1, cy + 0.030, 0.14), MSEAT)
    # backrest stitch ridgeline (geometry crease, AO-caught)
    box(A, (-0.57, 0.30, bz - 0.008), (-0.27, 0.315, bz + 0.006), MSEAT)
    ST.mark("P2-5 passenger-seat pass")


build_seat_pass()

# ---- P3-1 pedal set (future look-down pose insurance; invisible today) ------
def build_pedals():
    obox(SH, (0.24, -0.205, 0.915), (0, 0.34, 0.94), (1, 0, 0), (0.0225, 0.100, 0.006), MDARK)
    obox(SH, (0.24, -0.205, 0.906), (0, 0.34, 0.94), (1, 0, 0), (0.018, 0.088, 0.003), MALU)
    obox(SH, (0.35, -0.165, 0.887), (0, 0.30, 0.954), (1, 0, 0), (0.050, 0.027, 0.007), MDARK)
    obox(SH, (0.35, -0.165, 0.879), (0, 0.30, 0.954), (1, 0, 0), (0.045, 0.022, 0.003), MALU)
    cyl(SH, (0.35, -0.14, 0.895), (0.35, -0.02, 0.93), 0.008, 0.008, 8, MDARK)
    obox(SH, (0.50, -0.19, 0.905), (0, 0.32, 0.947), (1, 0, 0), (0.050, 0.075, 0.006), MDARK)
    SH.mark("P3-1 pedal set")


build_pedals()

# ---- P3-3 column height-adjust lever ---------------------------------------
def build_column_lever():
    obox(SH, (0.362, 0.272, 0.612), (0, -0.2, 1), (0, 1, 0.2), (0.010, 0.008, 0.030), MDARK)
    cyl(SH, (0.355, 0.284, 0.590), (0.355, 0.296, 0.585), 0.007, 0.007, 8, MDARK)
    SH.mark("P3-3 column adjust lever")


build_column_lever()

# ---- P3-4 visor refinement (all above the frame-top ray) --------------------
def build_visor_dress():
    for s in (1, -1):
        x0, x1 = min(s * 0.21, s * 0.52), max(s * 0.21, s * 0.52)
        # leading-edge chamfer strip
        box(SH, (x0, 0.8375, 0.052), (x1, 0.8435, 0.0625), MDARK)
        # pivot elbow at the outboard front corner
        box(SH, (min(s * 0.50, s * 0.545), 0.842, 0.045), (max(s * 0.50, s * 0.545), 0.8575, 0.068), MDARK)
        # vanity flap seam on the underside
        box(SH, (x0 + 0.04, 0.8415, -0.028), (x1 - 0.04, 0.8432, -0.022), MDARK)
    SH.mark("P3-4 visor dress")


build_visor_dress()

# ---- P3-7 G-Class passenger dash grab bar (below-cowl, authentic mount) -----
def build_grab_bar():
    zf = min(dash_z(-0.36, 0.42, 0.75), dash_z(-0.60, 0.42, 0.75))
    zb = zf - 0.045                                  # standing 45 mm off the face
    cyl(SH, (-0.335, 0.425, zb), (-0.625, 0.425, zb), 0.015, 0.015, 10, MDARK)
    for xe in (-0.34, -0.62):
        cyl(SH, (xe, 0.425, zb - 0.002), (xe, 0.425, zf + 0.004), 0.011, 0.013, 10, MALU)
    SH.mark("P3-7 passenger grab bar")


build_grab_bar()

# ---- P3-8 B-pillar upper caps -----------------------------------------------
def build_bpillar_caps():
    for s in (1, -1):
        box(SH, (min(s * 0.664, s * 0.70), 0.60, -0.535), (max(s * 0.664, s * 0.70), 0.86, -0.465), MDARK)
    SH.mark("P3-8 B-pillar caps")


build_bpillar_caps()

# ---- P1-4 steering-wheel dress (wheel-LOCAL frame; rim R 0.2045 frozen) -----
# Local frame (GLB-verified): disc in local X/Y, column axis +Z (away from the
# driver), 12 o'clock -Y, driver-facing surfaces at NEGATIVE local z.
def build_wheel_dress():
    A = WH
    for s in (1, -1):                               # spoke switch pods 60x45x12
        obox(A, (s * 0.064, 0.002, -0.0125), (1, 0, 0), (0, 1, 0), (0.030, 0.0225, 0.0055), MDARK)
        obox(A, (s * 0.064, 0.002, -0.0195), (1, 0, 0), (0, 1, 0), (0.027, 0.020, 0.0018), MGLS)
        obox(A, (s * 0.064, 0.002, -0.0218), (1, 0, 0), (0, 1, 0), (0.0025, 0.020, 0.0006), MALU)
        # rim thumb detents at 3/9 (inside the frozen outer radius; the
        # _basis u/v for axis +Z put angle -pi/2 at local +X)
        centre_a = -math.pi / 2 if s > 0 else math.pi / 2
        arc_tube(A, (0, 0, 0), (0, 0, 1), 0.186, 0.0165,
                 centre_a - 0.38, centre_a + 0.38, 5, 8, MLTHR)
    # horn-pad emblem-free ring (floats 1.5 mm proud of the hotspot_horn pad)
    annulus(A, (0.0, 0.008, -0.0425), (0, 0, 1), 0.021, 0.0165, 0.002, 14, MALU)
    # hub boss ring + slim lower-spoke blade
    annulus(A, (0.0, 0.008, -0.0300), (0, 0, 1), 0.033, 0.027, 0.002, 12, MALU)
    obox(A, (0.0, 0.150, -0.0170), (0, 1, 0), (1, 0, 0), (0.0285, 0.0035, 0.0018), MALU)
    WH.mark("P1-4 wheel dress")


build_wheel_dress()

# ============================================================================
# 5. Hotspot control meshes (doc 69: separate named nodes, kept out of the
#    dash bake) — rebuilds + the P2-1 node raises
# ============================================================================
# P2-1: RAISE the selector/EPB nodes onto the new bridge deck; C2 fix 2 moves
# the EPB FORWARD (z 0.35 -> 0.50, see header: right-glance-in is impossible,
# rest-frame-in is the honest fix). C2 fix 1b moves start/hazard down to row
# y 0.316 and mounts each button base FLUSH on the RAYCAST stack wall
# (rotations kept — the v1 button meshes are authored in the raked local
# frame; base = node + 0.0066 along the rake normal, halo lands ~2 mm proud
# of the wall). The SAME COMMIT must sync
# platform/src/components/sim/vitok/hotspots.ts: gear (0,0.32,0.43), park
# brake (0.093,0.315,0.50), engine start / hazard at the printed positions.
sel_ob = D.objects["hotspot_gear_selector"]
sel_ob.location = B((0.0, 0.32, 0.43))
sel_ob.rotation_euler = (0.0, 0.0, 0.0)
epb_ob = D.objects["hotspot_parking_brake"]
epb_ob.location = B((0.093, 0.315, 0.50))
epb_ob.rotation_euler = (0.0, 0.0, 0.0)
_sta_wall = dash_z(0.095, 0.316, 0.7118)
_haz_wall = dash_z(0.0, 0.316, 0.7118)
STA_POS = (0.095, 0.316, max(_sta_wall - 0.0066, 0.700))
HAZ_POS = (0.0, 0.316, max(_haz_wall - 0.0066, 0.700))
assert 0.69 <= STA_POS[2] <= 0.745 and 0.69 <= HAZ_POS[2] <= 0.745, \
    f"start/hazard wall probe out of band: {_sta_wall:.4f}/{_haz_wall:.4f}"
sta_ob = D.objects["hotspot_engine_start"]
sta_ob.location = B(STA_POS)
haz_ob = D.objects["hotspot_hazard"]
haz_ob.location = B(HAZ_POS)
bpy.context.view_layer.update()
print(f"C2 fix1b: start ({STA_POS[0]:.4f},{STA_POS[1]:.4f},{STA_POS[2]:.4f}) "
      f"hazard ({HAZ_POS[0]:.4f},{HAZ_POS[1]:.4f},{HAZ_POS[2]:.4f}) "
      f"walls {_sta_wall:.4f}/{_haz_wall:.4f}")

SEL = Acc("hotspot_gear_selector")      # DSG stubby: shaft + knob, top y 0.345
cyl(SEL, (0.0, 0.314, 0.43), (0.0, 0.331, 0.43), 0.0105, 0.0125, 10, MDARK)
obox(SEL, (0.0, 0.3345, 0.43), (1, 0, 0), (0, 1, 0), (0.021, 0.0085, 0.027), MLTHR)
obox(SEL, (0.0, 0.3442, 0.43), (1, 0, 0), (0, 1, 0), (0.019, 0.0012, 0.025), MGLS)
obox(SEL, (0.0, 0.3335, 0.43), (1, 0, 0), (0, 1, 0), (0.0215, 0.0016, 0.0275), MALU)
box(SEL, (-0.004, 0.3355, 0.4015), (0.004, 0.3415, 0.4035), MEM)   # P glyph dot
SEL.mark("P2-1 selector knob")

EPB = Acc("hotspot_parking_brake")      # C2 fix 2: 20x36 base at z 0.50 with a
# taller VW pull-tab (crest y 0.334) so the crest breaks the rest frame bottom
# (fy ~0.03-0.05 at z 0.50); P glyph rides the crest top face
box(EPB, (0.083, 0.3145, 0.482), (0.103, 0.3225, 0.518), MDARK)
obox(EPB, (0.093, 0.328, 0.489), (0, 0, 1), (0, 1, 0.35), (0.0095, 0.006, 0.0075), MDARK)
box(EPB, (0.0895, 0.3338, 0.4855), (0.0965, 0.3352, 0.4925), MEM)  # P glyph
EPB.mark("P2-1 EPB switch (C2 fwd)")

BLT = Acc("hotspot_belt")               # P3-2: buckle head + 200 mm stalk
obox(BLT, (0.140, -0.02, -0.207), (0.05, 1, 0.15), (1, -0.05, 0), (0.0125, 0.075, 0.007), MDARK)
box(BLT, (0.118, 0.052, -0.238), (0.152, 0.102, -0.198), MGLS)     # buckle head
box(BLT, (0.124, 0.102, -0.230), (0.146, 0.1085, -0.206), MACC)    # red button
box(BLT, (0.126, 0.070, -0.240), (0.144, 0.084, -0.236), MDARK)    # tongue slot
BLT.mark("P3-2 belt buckle")

# P1-12/13/14 dressing appended to the EXISTING control meshes at the C2
# fix-1 positions (nodes moved in section 5; the glass reshape opened the
# rest-pose band fy 0.10..0.19 that the halo + triangle now land in)
_STACK_N = Vector((0, 0.334, -0.943)).normalized()   # measured stack rake

FOG = Acc("hotspot_fog")                # icon dot on the switch top face
_fog_n = Vector((0, 0.943, 0.333))                   # switch top-face normal
_fc = Vector((0.585, 0.328, 0.723)) + _fog_n * 0.0125
obox(FOG, tuple(_fc), (1, 0, 0), tuple(_fog_n), (0.008, 0.0012, 0.002), MEM)
FOG.mark("P1-12 fog icon dot")

STA = Acc("hotspot_engine_start")       # halo ring at the start-button root
_sc = Vector(STA_POS) - _STACK_N * 0.005
annulus(STA, tuple(_sc), tuple(-_STACK_N), 0.0265, 0.0235, 0.003, 14, MEM)
STA.mark("P1-13 start halo")

HAZ = Acc("hotspot_hazard")             # red triangle ridge on the cap
_u = Vector((1, 0, 0))
_v = _u.cross(_STACK_N).normalized()                 # up-ish in the cap plane
_hc = Vector(HAZ_POS) + _STACK_N * 0.011
_tri = [_hc + _u * -0.0075 + _v * -0.0045,
        _hc + _u * 0.0075 + _v * -0.0045,
        _hc + _v * 0.0085]
for i in range(3):
    a = _tri[i]
    b2 = _tri[(i + 1) % 3]
    mid = (a + b2) / 2
    d = b2 - a
    obox(HAZ, tuple(mid), tuple(d.normalized()), tuple(_STACK_N),
         (d.length / 2 + 0.0012, 0.0011, 0.0011), MACC)
HAZ.mark("P1-14 hazard triangle")

# ============================================================================
# 6. Commit all accumulators into their meshes
# ============================================================================
def commit(acc, ob, replace=False):
    me = ob.data
    bm = bmesh.new()
    if not replace:
        bm.from_mesh(me)
    existing = len(bm.faces)

    def slot(matname):
        for i, m in enumerate(me.materials):
            if m and m.name == matname:
                return i
        me.materials.append(D.materials[matname])
        return len(me.materials) - 1

    inv = ob.matrix_world.inverted()
    bverts = []
    for co in acc.verts:
        w = Vector(co) if acc.local else B(co)
        bverts.append(bm.verts.new(w if acc.local else (inv @ w)))
    recalc_faces = []
    for idx, matname, smooth, lock in acc.faces:
        f = bm.faces.new([bverts[i] for i in idx])
        f.material_index = slot(matname)
        f.smooth = smooth
        if not lock:
            recalc_faces.append(f)
    bmesh.ops.recalc_face_normals(bm, faces=recalc_faces)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.update()
    added = sum(len(f[0]) - 2 for f in acc.faces)
    print(f"  {ob.name}: +{added} tris ({'replaced' if replace else 'appended'})")
    for label, _n in acc.log:
        pass
    return added


print("committing v3 geometry:")
commit(SH, shell_ob)
commit(ST, seats_ob)
commit(WH, D.objects["steering_wheel_mesh"])
commit(IND, D.objects["hotspot_indicator_stalk"], replace=True)
commit(WIP, D.objects["hotspot_wiper_stalk"], replace=True)
commit(SEL, sel_ob, replace=True)
commit(EPB, epb_ob, replace=True)
commit(BLT, D.objects["hotspot_belt"], replace=True)
commit(FOG, D.objects["hotspot_fog"])
commit(STA, D.objects["hotspot_engine_start"])
commit(HAZ, D.objects["hotspot_hazard"])

for label, _ in SH.log + ST.log + WH.log:
    print(f"    built {label}")

if _exempt_log:
    print("  sightline exemptions used (each doc-73 justified):")
    for t in sorted(_exempt_log):
        print(f"    - {t}")
if _violations:
    for v in _violations[:40]:
        print(f"  VIOLATION {v[0]}: chassis ({v[1]:+.3f}, {v[2]:+.3f}, {v[3]:+.3f})")
    raise RuntimeError(
        f"{len(_violations)} new vertices break the doc-73 SS2 sightline law")
print("  sightline check: every new vertex clears the cowl-ray band")

# ============================================================================
# 7. Integrity (the DO-NOT-BREAK list, now at the 8-material / 45k budgets)
# ============================================================================
HOTSPOTS = [
    "hotspot_belt", "hotspot_engine_start", "hotspot_fog",
    "hotspot_gear_selector", "hotspot_hazard", "hotspot_headlights",
    "hotspot_horn", "hotspot_indicator_stalk", "hotspot_mirror_left",
    "hotspot_mirror_rear", "hotspot_mirror_right", "hotspot_parking_brake",
    "hotspot_wiper_stalk",
]
for name in HOTSPOTS + ["screen_cluster", "screen_center", "steering_wheel",
                        "steering_wheel_mesh", "interior_shell", "interior_seats"]:
    if name not in D.objects:
        raise RuntimeError(f"integrity: node {name} missing")
assert D.objects["hotspot_horn"].parent.name == "steering_wheel"
assert D.objects["steering_wheel_mesh"].parent.name == "steering_wheel"
# wheel rim radius frozen (contract landmark): local bbox must not grow
_wm = D.objects["steering_wheel_mesh"].data
_rmax = max(max(abs(v.co.x) for v in _wm.vertices), max(abs(v.co.y) for v in _wm.vertices))
assert _rmax <= 0.2055, f"wheel rim radius grew: {_rmax:.4f}"

int_objs = [o for o in D.objects
            if any(c.name == "INT" for c in o.users_collection)]
int_mats = set()
tris = 0
deps = bpy.context.evaluated_depsgraph_get()
for ob in int_objs:
    if ob.type != "MESH":
        continue
    for m in ob.data.materials:
        if m:
            int_mats.add(m.name)
    me = ob.evaluated_get(deps).to_mesh()
    me.calc_loop_triangles()
    tris += len(me.loop_triangles)
    ob.evaluated_get(deps).to_mesh_clear()
assert len(int_mats) <= 8, f"too many interior materials: {sorted(int_mats)}"
assert tris <= 45000, f"doc-73 tri budget blown: {tris}"
print(f"integrity OK: {len(HOTSPOTS)} hotspots, {len(int_mats)} materials "
      f"{sorted(int_mats)}, tris={tris} (ceiling 45000)")

# ============================================================================
# 8. Window probe — the founder acceptance numbers (unchanged from v2)
# ============================================================================
MESH_INT = [o for o in int_objs if o.type == "MESH"]


def cast(origin, direction, max_dist=4.0):
    best = None
    for ob in MESH_INT:
        inv = ob.matrix_world.inverted()
        o_l = inv @ origin
        d_l = inv.to_3x3() @ direction
        s = d_l.length
        if s < 1e-9:
            continue
        hit, pos, _n, _i = ob.ray_cast(o_l, d_l / s, distance=max_dist * s * 1.5)
        if hit:
            dist = ((ob.matrix_world @ pos) - origin).length
            if dist <= max_dist and (best is None or dist < best):
                best = dist
    return best


VFOV = math.radians(47.0)
HFOV = 2 * math.atan(math.tan(VFOV / 2) * 16 / 9)


def ray(fx, fy, pitch):
    x = (2 * fx - 1) * math.tan(HFOV / 2)
    z = (2 * fy - 1) * math.tan(VFOV / 2)
    d = Vector((x, 1.0, z)).normalized()
    cp, sp = math.cos(pitch), math.sin(pitch)
    return Vector((d.x, d.y * cp - d.z * sp, d.y * sp + d.z * cp))


def probe(label, eye, pitch_deg, min_span):
    p = math.radians(pitch_deg)
    rows = 200
    top = bot = None
    for i in range(rows + 1):
        fy = i / rows
        if cast(eye, ray(0.5, fy, p)) is None:
            if bot is None:
                bot = fy
            top = fy
    span = 0.0 if bot is None else top - bot
    hits = sum(1 for iy in range(36) for ix in range(64)
               if cast(eye, ray((ix + 0.5) / 64, (iy + 0.5) / 36, p)) is None)
    frac = hits / (64 * 36)
    ok = "PASS" if span >= min_span else "FAIL"
    print(f"probe[{label}]: centre-column window fy {bot}..{top} "
          f"(span {span:.3f}, need >={min_span}) {ok}; full-frame world {frac:.3f}")
    return span >= min_span


ok_ship = probe("shipped cam (0.24,0.71,-0.255) pitch -5",
                Vector((-0.24, -0.255, 1.26)), -5.0, 0.65)
ok_dep = probe("DEP (0.34,0.66,0.12) pitch -6", Vector((-0.34, 0.12, 1.21)), -6.0, 0.65)
if not (ok_ship and ok_dep):
    raise RuntimeError("window probe under 65% — iterate the geometry")

# ============================================================================
# 9. Save the pre-AO geometry blend (preview source)
# ============================================================================
blend_out = os.path.join(WORK, "hero_interior_v3.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend_out)
print(f"saved {blend_out}")

if os.environ.get("V3_SKIP_AO") == "1":              # fast geometry iteration
    print("V3_SKIP_AO=1 — geometry-only run complete (no AO bake / export)")
    import sys
    sys.exit(0)

# ============================================================================
# 10. AO rebake (adapted from hero_interior_ao_bake.py for 8 materials; the
#     two NEW materials get bake targets so Cycles can bake the shell, but
#     occlusion is wired into the six LEGACY materials only — doc 73 SS6)
# ============================================================================
SIZE = 1024
BAKE_MATS = ["int_dark", "int_leather", "int_alu", "int_accent", "int_gloss",
             "int_seat", "int_emissive", "int_chrome"]
OCC_MATS = ["int_dark", "int_leather", "int_alu", "int_accent", "int_gloss", "int_seat"]
TARGET_NAMES = ["interior_shell", "interior_seats", "steering_wheel_mesh"]
targets = [D.objects[n] for n in TARGET_NAMES]
scene = bpy.context.scene

for ob in targets:
    me = ob.data
    if "UVMap" not in me.uv_layers:
        me.uv_layers.new(name="UVMap")
    if "Lightmap" not in me.uv_layers:
        me.uv_layers.new(name="Lightmap")
    me.uv_layers.active = me.uv_layers["Lightmap"]

for o in D.objects:
    o.select_set(False)
for ob in targets:
    ob.select_set(True)
bpy.context.view_layer.objects.active = targets[0]
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02,
                         area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode="OBJECT")

for ob in targets:                      # inset to the white safety border
    me = ob.data
    lm = me.uv_layers["Lightmap"]
    um = me.uv_layers["UVMap"]
    n = len(lm.data)
    flat = np.empty(n * 2, dtype=np.float32)
    lm.data.foreach_get("uv", flat)
    flat = 0.02 + flat * 0.96
    lm.data.foreach_set("uv", flat)
    um.data.foreach_set("uv", np.zeros(n * 2, dtype=np.float32))
    me.update()

ao = D.images.new("hero_interior_ao", width=SIZE, height=SIZE, alpha=False,
                  float_buffer=False)
ao.colorspace_settings.name = "Non-Color"
ao.pixels.foreach_set(np.ones(SIZE * SIZE * 4, dtype=np.float32))
ao.update()

bake_nodes = {}
for mn in BAKE_MATS:
    mat = D.materials[mn]
    mat.use_nodes = True
    nt = mat.node_tree
    node = nt.nodes.new("ShaderNodeTexImage")
    node.name = "BAKE_AO"
    node.image = ao
    node.select = True
    nt.nodes.active = node
    bake_nodes[mn] = node

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 256
scene.cycles.use_denoising = False
bake = scene.render.bake
bake.margin = 16
bake.margin_type = "EXTEND"
bake.use_clear = False
bake.target = "IMAGE_TEXTURES"
bake.use_selected_to_active = False
if scene.world is None:
    scene.world = D.worlds.new("ao_world")
scene.world.light_settings.distance = 0.5

hidden = []
for o in D.objects:
    prev = o.hide_render
    o.hide_render = o not in targets
    hidden.append((o, prev))
for o in D.objects:
    o.select_set(False)
for ob in targets:
    ob.select_set(True)
bpy.context.view_layer.objects.active = targets[0]
print("baking AO (256 spp, 1024, distance 0.5 m) ...")
bpy.ops.object.bake(type="AO")
ao.update()
for o, prev in hidden:
    o.hide_render = prev

os.makedirs(PREVIEWS, exist_ok=True)
atlas_png = os.path.join(PREVIEWS, "interior_ao_atlas_v3.png")
cng = D.node_groups.new("interior_ao_comp", "CompositorNodeTree")
cng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
scene.compositing_node_group = cng
img_node = cng.nodes.new("CompositorNodeImage")
img_node.image = ao
den = cng.nodes.new("CompositorNodeDenoise")
gout = cng.nodes.new("NodeGroupOutput")
cng.links.new(img_node.outputs["Image"], den.inputs["Image"])
cng.links.new(den.outputs["Image"], gout.inputs[0])
scene.render.resolution_x = SIZE
scene.render.resolution_y = SIZE
scene.render.resolution_percentage = 100
scene.render.use_compositing = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.cycles.samples = 1
if scene.camera is None:
    scene.camera = D.objects.get("Camera") or D.objects.get("eye_cam")
scene.render.filepath = atlas_png
bpy.ops.render.render(write_still=True)
print(f"denoised AO atlas -> {atlas_png}")

ao_dn = D.images.load(atlas_png, check_existing=False)
ao_dn.colorspace_settings.name = "Non-Color"

group = D.node_groups.get("glTF Material Output")
if group is None:
    group = D.node_groups.new("glTF Material Output", "ShaderNodeTree")
    group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
for mn in OCC_MATS:
    nt = D.materials[mn].node_tree
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "Lightmap"
    tex = bake_nodes[mn]
    tex.image = ao_dn
    tex.image.colorspace_settings.name = "Non-Color"
    nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
    g = nt.nodes.new("ShaderNodeGroup")
    g.node_tree = group
    nt.links.new(tex.outputs["Color"], g.inputs["Occlusion"])
for mn in ("int_emissive", "int_chrome"):          # out of the atlas (doc 73 SS6)
    D.materials[mn].node_tree.nodes.remove(bake_nodes[mn])

# ============================================================================
# 11. Export the INT collection (Y-up default, same convention as v1/v2)
# ============================================================================
for o in D.objects:
    o.select_set(False)
    o.hide_render = False
for ob in int_objs:
    ob.select_set(True)
glb_out = os.path.join(WORK, "hero_interior_v3.glb")
bpy.ops.export_scene.gltf(filepath=glb_out, export_format="GLB", use_selection=True)
print(f"exported {glb_out} ({os.path.getsize(glb_out)} bytes pre-optimize)")

baked_blend = os.path.join(WORK, "hero_interior_v3_ao.blend")
bpy.ops.wm.save_as_mainfile(filepath=baked_blend)
print(f"saved {baked_blend}")
print("DONE: v3 detail pass + AO + export complete")

