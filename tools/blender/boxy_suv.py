"""
Hero traffic/showcase vehicle: FICTIONAL boxy luxury SUV ("Kastel Baron" working
name) — de-badged G63-type per docs/simulation/70_VISUAL_REFERENCE_BRIEF.md REF 4
and the dimensioned research digest. Headless Blender, house style of
tools/blender/vehicles.py (bmesh Builder in glTF space, cached mat(), separate
hub-centred wheel nodes wheel_FL/FR/RL/RR spinning on local X, nose +Z).

ADR-001 (HARD RULE): fully fictional. NO three-pointed star, NO Panamericana
15-slat pattern (we use 13 slats, different pitch), NO wordmarks, plain wheel
caps, plain spare cover. The generic 4x4 vocabulary (boxy slab body, round DRL
lamps, fender pods, external hinges, rear spare) is replicated per the brief.

    blender --background --python tools/blender/boxy_suv.py -- <out_dir>

Key dimensions (m, from the research digest):
  body L 4.66 (+ rear spare -> ~4.90), W 1.93 over flares (slab 1.76),
  H 1.966, wheelbase 2.89, track 1.66, tire OD 0.795 (295/40 R22).
"""

import bpy
import bmesh
import sys
import os
import math

# ---------------------------------------------------------------------------
# args / paths
# ---------------------------------------------------------------------------
argv = sys.argv
out_dir = None
if "--" in argv:
    extra = argv[argv.index("--") + 1:]
    if extra:
        out_dir = extra[0]
if not out_dir:
    out_dir = os.path.join(os.path.expanduser("~"), "boxy-suv-out")
os.makedirs(out_dir, exist_ok=True)

HDRI = "E:/AI driver/platform/public/sim/env/sky_urban_1k.hdr"
PREVIEW_DIR = "E:/AI driver/tools/blender/previews"
os.makedirs(PREVIEW_DIR, exist_ok=True)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                 bpy.data.cameras, bpy.data.worlds, bpy.data.objects):
        for item in list(coll):
            try:
                coll.remove(item)
            except Exception:
                pass


reset_scene()

# ---------------------------------------------------------------------------
# materials
# ---------------------------------------------------------------------------
_mats = {}


def mat(name, rgb, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, coat=0.0,
        coat_rough=0.03):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    for key, val in (("Coat Weight", coat), ("Coat Roughness", coat_rough)):
        try:
            b.inputs[key].default_value = val
        except Exception:
            pass
    if emit is not None:
        b.inputs["Emission Color"].default_value = (emit[0], emit[1], emit[2], 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    _mats[name] = m
    return m


# Deep gloss-black clearcoat body (REF 4 wet-asphalt hero look).
PAINT = mat("paint_gloss_black", (0.013, 0.013, 0.015), rough=0.22, metal=0.35, coat=1.0)
MATTE = mat("matte_black", (0.022, 0.022, 0.024), rough=0.88, metal=0.0)      # arches/cladding
TRIM = mat("gloss_trim", (0.014, 0.014, 0.016), rough=0.30, metal=0.2, coat=0.4)  # handles/pillars/frames
CHROME = mat("chrome", (0.82, 0.83, 0.85), rough=0.07, metal=1.0)             # grille slats + exhaust
SILVER = mat("silver_satin", (0.52, 0.53, 0.55), rough=0.34, metal=0.9)       # boards + skid lip
RED_ACC = mat("red_accent", (0.45, 0.015, 0.02), rough=0.28, metal=0.1, coat=0.6)  # calipers + pinstripe
GLASS = mat("glass_tint", (0.014, 0.018, 0.026), rough=0.06, metal=0.65, coat=0.7)
MESH_DK = mat("mesh_dark", (0.016, 0.016, 0.018), rough=0.92, metal=0.0)      # intakes/grille backing
TIRE = mat("tire", (0.016, 0.016, 0.02), rough=0.85, metal=0.0)
RIM = mat("rim_gloss_black", (0.015, 0.015, 0.017), rough=0.16, metal=0.55, coat=0.6)
STEEL = mat("brake_steel", (0.26, 0.26, 0.28), rough=0.45, metal=0.85)
PLATE = mat("plate_blank", (0.74, 0.75, 0.76), rough=0.4, metal=0.0)
DRL = mat("drl_ring", (0.88, 0.90, 0.95), rough=0.15, emit=(1.0, 1.0, 1.0),
          emit_strength=4.0)
PROJ = mat("projector", (0.80, 0.80, 0.78), rough=0.15, emit=(1.0, 0.95, 0.85),
           emit_strength=2.2)
AMBER = mat("amber_lens", (0.55, 0.22, 0.02), rough=0.2, emit=(1.0, 0.45, 0.05),
            emit_strength=1.5)
TAIL = mat("tail_red", (0.22, 0.012, 0.012), rough=0.2, emit=(1.0, 0.05, 0.03),
           emit_strength=0.9)
REVERSE = mat("reverse_lens", (0.45, 0.45, 0.45), rough=0.2, emit=(0.9, 0.9, 0.85),
              emit_strength=0.25)

# ---------------------------------------------------------------------------
# Builder — authors in glTF space (X right/left+, Y up, Z nose+); stores Blender
# Z-up coords: (gx, gy, gz) -> (gx, -gz, gy). export_yup=True converts back.
# ---------------------------------------------------------------------------
TAU = 2 * math.pi


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.slots = []
        self.slot_of = {}

    def _mi(self, material):
        if material.name not in self.slot_of:
            self.slot_of[material.name] = len(self.slots)
            self.slots.append(material)
        return self.slot_of[material.name]

    def _vg(self, gx, gy, gz):
        return self.bm.verts.new((gx, -gz, gy))

    def box_g(self, cx, cy, cz, sx, sy, sz, material):
        mi = self._mi(material)
        bx, by, bz = cx, -cz, cy          # Blender-space center
        hx, hy, hz = sx / 2, sz / 2, sy / 2
        c = [(bx - hx, by - hy, bz - hz), (bx + hx, by - hy, bz - hz),
             (bx + hx, by + hy, bz - hz), (bx - hx, by + hy, bz - hz),
             (bx - hx, by - hy, bz + hz), (bx + hx, by - hy, bz + hz),
             (bx + hx, by + hy, bz + hz), (bx - hx, by + hy, bz + hz)]
        v = [self.bm.verts.new(p) for p in c]
        for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                  (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]:
            self.bm.faces.new([v[i] for i in f]).material_index = mi

    def prism_g(self, profile, x0, x1, material):
        """Extrude a closed side-profile (list of (gz, gy)) along X from x0..x1."""
        mi = self._mi(material)
        A = [self._vg(x0, gy, gz) for (gz, gy) in profile]
        B = [self._vg(x1, gy, gz) for (gz, gy) in profile]
        n = len(profile)
        self.bm.faces.new(A).material_index = mi
        self.bm.faces.new(list(reversed(B))).material_index = mi
        for i in range(n):
            j = (i + 1) % n
            self.bm.faces.new([A[i], A[j], B[j], B[i]]).material_index = mi

    def _circle_pt(self, c1, c2, axis, r, a, t):
        ca, sa = math.cos(a), math.sin(a)
        if axis == "x":                      # circle in glTF (y,z): a=0 -> +z
            return (t, c1 + r * sa, c2 + r * ca)
        if axis == "z":                      # circle in glTF (x,y): a=0 -> +x
            return (c1 + r * ca, c2 + r * sa, t)
        return (c1 + r * ca, t, c2 + r * sa)  # axis 'y'

    def cyl_g(self, c1, c2, axis, r, t0, t1, material, seg=20):
        """Solid cylinder along `axis`. axis'x': (c1,c2)=(cy,cz); 'z': (cx,cy); 'y': (cx,cz)."""
        mi = self._mi(material)
        t0, t1 = min(t0, t1), max(t0, t1)
        A, B = [], []
        for k in range(seg):
            a = TAU * k / seg
            A.append(self._vg(*self._circle_pt(c1, c2, axis, r, a, t0)))
            B.append(self._vg(*self._circle_pt(c1, c2, axis, r, a, t1)))
        self.bm.faces.new(list(reversed(A))).material_index = mi
        self.bm.faces.new(B).material_index = mi
        for k in range(seg):
            j = (k + 1) % seg
            self.bm.faces.new([A[k], A[j], B[j], B[k]]).material_index = mi

    def ring_g(self, c1, c2, axis, r0, r1, t0, t1, material, seg=24,
               a0=0.0, a1=None):
        """Solid annular ring (full or partial arc) along `axis`."""
        mi = self._mi(material)
        t0, t1 = min(t0, t1), max(t0, t1)
        full = a1 is None
        if full:
            a0, a1 = 0.0, TAU
        n = seg if full else seg + 1
        rows = []
        for k in range(n):
            a = a0 + (a1 - a0) * (k / seg)
            vs = []
            for (r, t) in ((r0, t0), (r1, t0), (r0, t1), (r1, t1)):
                vs.append(self._vg(*self._circle_pt(c1, c2, axis, r, a, t)))
            rows.append(vs)
        for k in range(seg):
            A = rows[k]
            B = rows[(k + 1) % n] if full else rows[k + 1]
            for (p, q) in ((0, 1), (1, 3), (3, 2), (2, 0)):
                self.bm.faces.new([A[p], A[q], B[q], B[p]]).material_index = mi
        if not full:
            F, L = rows[0], rows[-1]
            self.bm.faces.new([F[0], F[1], F[3], F[2]]).material_index = mi
            self.bm.faces.new([L[2], L[3], L[1], L[0]]).material_index = mi

    def spoke_g(self, x0, x1, r0, r1, theta, hw, material):
        """Radial box spoke in the glTF (y,z) wheel plane at angle theta."""
        mi = self._mi(material)
        st, ct = math.sin(theta), math.cos(theta)
        v = []
        for xx in (x0, x1):
            for rr in (r0, r1):
                for ww in (-hw, hw):
                    gy = rr * st + ww * ct
                    gz = rr * ct - ww * st
                    v.append(self._vg(xx, gy, gz))
        for f in [(0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4),
                  (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6)]:
            self.bm.faces.new([v[i] for i in f]).material_index = mi

    def finalize(self, name):
        mesh = bpy.data.meshes.new(name)
        self.bm.normal_update()
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(name, mesh)
        for m in self.slots:
            obj.data.materials.append(m)
        bpy.context.collection.objects.link(obj)
        return obj


# ---------------------------------------------------------------------------
# Dimensions (glTF space, m)
# ---------------------------------------------------------------------------
NOSE, Z_TAIL = 2.245, -2.415        # body 4.66; spare adds ~0.24 behind
HW = 0.88                            # slab half-width (flares reach 0.965)
FLOOR, BELT = 0.44, 1.16             # underside / fender+belt line
GLASS_TOP, ROOF = 1.88, 1.966
WZ_F, WZ_R = 1.445, -1.445           # wheelbase 2.89
WHEEL_R, TIRE_W, HUB_X = 0.3975, 0.295, 0.83
WS_BASE_Z, WS_TOP_Z = 0.95, 0.58     # windshield rake ~27 deg from vertical
CAB_HW = 0.86
FLARE_RO, FLARE_RI, FLARE_OUT = 0.575, 0.465, 0.965


def build_body():
    b = Builder()

    # ---- main slab (perfectly upright sides, flat everything) ----
    b.box_g(0, (FLOOR + BELT) / 2, (NOSE + Z_TAIL) / 2,
            2 * HW, BELT - FLOOR, NOSE - Z_TAIL, PAINT)

    # ---- greenhouse: near-flat raked windshield, vertical rear, flat sides ----
    b.prism_g([(WS_BASE_Z, BELT + 0.005), (-2.33, BELT + 0.005),
               (-2.33, GLASS_TOP), (WS_TOP_Z, GLASS_TOP)],
              -CAB_HW, CAB_HW, GLASS)

    # roof panel + gutter/drip rails (full roof edge, ~30 mm below roof plane)
    b.box_g(0, (GLASS_TOP + ROOF) / 2, -0.875, 1.75, ROOF - GLASS_TOP, 2.95, PAINT)
    for sx in (1, -1):
        b.box_g(sx * 0.872, 1.862, -0.875, 0.032, 0.028, 2.90, TRIM)

    # pillars (gloss black frames): A raked, B/C vertical, D rear corner
    for sx in (1, -1):
        b.prism_g([(WS_BASE_Z, BELT), (WS_BASE_Z + 0.12, BELT),
                   (WS_TOP_Z + 0.12, GLASS_TOP), (WS_TOP_Z, GLASS_TOP)],
                  sx * 0.848, sx * 0.876, TRIM)
        for pz, pw in ((-0.28, 0.09), (-1.30, 0.09), (-2.285, 0.10)):
            b.box_g(sx * 0.862, (BELT + GLASS_TOP) / 2, pz,
                    0.03, GLASS_TOP - BELT, pw, TRIM)

    # ---- hood: raised perimeter step + washer nozzles + cowl ----
    b.box_g(0, BELT + 0.009, 1.60, 1.42, 0.022, 1.16, PAINT)
    for sx in (1, -1):
        b.box_g(sx * 0.14, BELT + 0.027, 1.14, 0.028, 0.014, 0.05, MATTE)
    b.box_g(0, BELT - 0.003, 0.985, 1.60, 0.015, 0.06, MATTE)  # wiper bay

    # ---- fender-top indicator pods (the icon) ----
    for sx in (1, -1):
        b.box_g(sx * 0.795, BELT + 0.0275, 2.02, 0.07, 0.055, 0.15, TRIM)
        b.box_g(sx * 0.795, BELT + 0.033, 2.096, 0.05, 0.03, 0.012, AMBER)

    # ---- front fascia: round lamps in squared bezels + 13-slat grille ----
    for sx in (0.66, -0.66):
        b.box_g(sx, 0.96, 2.263, 0.30, 0.30, 0.055, MATTE)          # bezel
        b.cyl_g(sx, 0.96, "z", 0.128, 2.263, 2.298, GLASS, seg=24)  # lens
        b.ring_g(sx, 0.96, "z", 0.100, 0.122, 2.298, 2.305, DRL, seg=24)
        b.cyl_g(sx, 0.96, "z", 0.048, 2.296, 2.302, PROJ, seg=16)   # projector
    b.box_g(0, 0.93, 2.258, 1.00, 0.40, 0.026, TRIM)                # grille frame
    b.box_g(0, 0.93, 2.262, 0.94, 0.34, 0.026, MESH_DK)             # backing
    n_slats = 13                                                    # NOT 15 (ADR-001)
    pitch = 0.94 / n_slats
    for k in range(n_slats):
        xk = -0.47 + (k + 0.5) * pitch
        b.box_g(xk, 0.93, 2.276, 0.02, 0.33, 0.030, CHROME)
    # NO central badge, NO star — clean slats only.

    # ---- front bumper: 3 mesh intakes + silver skid lip + tow eyes ----
    b.box_g(0, 0.57, 2.275, 1.93, 0.34, 0.11, PAINT)
    b.box_g(0, 0.545, 2.333, 0.78, 0.21, 0.012, MESH_DK)
    for sx in (1, -1):
        b.box_g(sx * 0.60, 0.545, 2.333, 0.30, 0.21, 0.012, MESH_DK)
        b.cyl_g(sx * 0.34, 0.44, "z", 0.020, 2.33, 2.36, SILVER, seg=10)
    b.box_g(0, 0.395, 2.29, 0.90, 0.06, 0.13, SILVER)               # skid lip
    # lower-body corner wraps bridging bumper ears into the arch flares
    for sx in (1, -1):
        b.box_g(sx * 0.918, 0.57, 2.12, 0.075, 0.30, 0.22, PAINT)
        b.box_g(sx * 0.918, 0.56, -2.19, 0.075, 0.28, 0.39, PAINT)

    # ---- sides: cladding, seams, hinges, handles, boards, exhausts, mirrors ----
    for sx in (1, -1):
        # mid-height protective cladding strip
        b.box_g(sx * 0.886, 0.88, -0.085, 0.02, 0.09, 4.30, MATTE)
        # door cut seams (dark, hairline-proud)
        for sz in (0.95, -0.28, -1.30):
            b.box_g(sx * 0.882, 0.80, sz, 0.006, 0.70, 0.014, MESH_DK)
        # external barrel hinges — 2 per door on leading edges
        for hz in (0.90, -0.31):
            for hy in (0.68, 1.02):
                b.cyl_g(sx * 0.888, hz, "y", 0.016, hy, hy + 0.09, PAINT, seg=10)
        # exposed gloss-black door handles
        for hz in (0.42, -0.80):
            b.box_g(sx * 0.890, 1.03, hz, 0.025, 0.04, 0.16, TRIM)
        # silver running board + rubber treads
        b.box_g(sx * 0.945, 0.452, 0.0, 0.15, 0.05, 1.58, SILVER)
        for tz in (-0.55, -0.18, 0.18, 0.55):
            b.box_g(sx * 0.952, 0.480, tz, 0.11, 0.010, 0.22, MATTE)
        # side-exit dual exhaust tips behind front wheel, under the board
        for ez in (0.66, 0.52):
            b.cyl_g(0.385, ez, "x", 0.038, sx * 0.90, sx * 1.005, CHROME, seg=14)
        # mirror: stalk + head + amber strip + glass
        b.box_g(sx * 0.955, 1.40, 0.82, 0.13, 0.03, 0.05, MATTE)
        b.box_g(sx * 1.045, 1.45, 0.80, 0.12, 0.15, 0.075, MATTE)
        b.box_g(sx * 1.108, 1.45, 0.80, 0.012, 0.02, 0.05, AMBER)
        b.box_g(sx * 1.045, 1.45, 0.760, 0.10, 0.13, 0.008, GLASS)

    # ---- squared-off octagonal arch flares + dark liners + brakes ----
    for wz in (WZ_F, WZ_R):
        for sx in (1, -1):
            x_in, x_out = sx * (HW - 0.005), sx * FLARE_OUT
            b.ring_g(WHEEL_R, wz, "x", FLARE_RI, FLARE_RO,
                     min(x_in, x_out), max(x_in, x_out), MATTE,
                     seg=5, a0=0.05, a1=math.pi - 0.05)
            # dark arch liner ring flush on the body side
            b.ring_g(WHEEL_R, wz, "x", 0.28, FLARE_RI + 0.005,
                     sx * 0.879, sx * 0.883 if sx > 0 else sx * 0.879 - 0.004,
                     MESH_DK, seg=8, a0=-0.1, a1=math.pi + 0.1)
            # brake disc + RED caliper (static, visible through spokes)
            xd0, xd1 = sx * 0.79, sx * 0.828
            b.cyl_g(WHEEL_R, wz, "x", 0.185, min(xd0, xd1), max(xd0, xd1),
                    STEEL, seg=18)
            cz = wz + (0.11 if wz > 0 else -0.11)
            b.box_g(sx * 0.807, 0.52, cz, 0.05, 0.15, 0.11, RED_ACC)

    # ---- rear: bumper, corner lamps, side-hinged tailgate + spare ----
    b.box_g(0, 0.57, -2.44, 1.93, 0.30, 0.13, PAINT)
    for sx in (1, -1):
        b.box_g(sx * 0.45, 0.727, -2.45, 0.55, 0.025, 0.10, MATTE)  # step pads
        b.box_g(sx * 0.72, 0.47, -2.508, 0.12, 0.035, 0.012, RED_ACC)  # reflectors
        # small vertical tail lamps, low in the clean corners
        b.box_g(sx * 0.79, 0.88, -2.425, 0.13, 0.34, 0.05, TRIM)
        b.box_g(sx * 0.79, 0.945, -2.454, 0.105, 0.155, 0.012, TAIL)
        b.box_g(sx * 0.79, 0.825, -2.454, 0.105, 0.055, 0.012, AMBER)
        b.box_g(sx * 0.79, 0.762, -2.454, 0.105, 0.045, 0.012, REVERSE)
    b.box_g(0, 0.57, -2.508, 0.46, 0.10, 0.008, PLATE)              # blank plate
    # tailgate hinges (right side = -X) + handle (left)
    for hy in (0.90, 1.28):
        b.cyl_g(-0.84, -2.432, "y", 0.017, hy, hy + 0.09, PAINT, seg=10)
    b.box_g(0.68, 1.00, -2.428, 0.12, 0.035, 0.03, TRIM)
    # full-size spare in a plain hard cover (smooth face + simple ring rib ONLY)
    b.ring_g(0, 1.05, "z", 0.29, 0.40, -2.43, -2.62, TIRE, seg=24)  # tire band
    b.cyl_g(0, 1.05, "z", 0.405, -2.60, -2.645, PAINT, seg=24)      # cover
    b.ring_g(0, 1.05, "z", 0.21, 0.27, -2.645, -2.660, PAINT, seg=20)  # rib
    b.box_g(0, 1.475, -2.60, 0.18, 0.04, 0.05, TAIL)                # 3rd brake pod

    return b.finalize("suv_boxy_lux")


# ---------------------------------------------------------------------------
# Wheel: 22" gloss-black cross-spoke (7 twin pairs = 14 spokes, generic),
# red rim pinstripe, deep dish, plain black center cap. Hub-centred, axis X.
# ---------------------------------------------------------------------------
def build_wheel(name, side):
    """side=+1 for left (+X outboard), -1 for right."""
    s = side
    b = Builder()
    ht = TIRE_W / 2
    RIM_R = 0.2794                       # 22" rim radius
    # tire as a solid annulus (visible sidewalls, closed)
    b.ring_g(0, 0, "x", RIM_R + 0.006, WHEEL_R, -ht, ht, TIRE, seg=28)
    # rim outer lip + red pinstripe on the outer edge
    lo, hi = sorted((s * 0.096, s * ht))
    b.ring_g(0, 0, "x", 0.242, RIM_R + 0.008, lo, hi, RIM, seg=24)
    lo, hi = sorted((s * ht, s * (ht + 0.0045)))
    b.ring_g(0, 0, "x", 0.262, RIM_R + 0.008, lo, hi, RED_ACC, seg=24)
    # 7 twin-Y spoke pairs (14 thin spokes) — deep dish near outboard face
    for k in range(7):
        base = TAU * k / 7
        for da in (-0.13, 0.13):
            b.spoke_g(s * 0.092, s * 0.138, 0.068, 0.246,
                      base + da, 0.010, RIM)
    # hub + plain center cap (NO logo)
    lo, hi = sorted((s * 0.088, s * 0.146))
    b.cyl_g(0, 0, "x", 0.082, lo, hi, RIM, seg=16)
    lo, hi = sorted((s * 0.146, s * 0.153))
    b.cyl_g(0, 0, "x", 0.052, lo, hi, RIM, seg=16)
    return b.finalize(name)


# ---------------------------------------------------------------------------
# assemble
# ---------------------------------------------------------------------------
body = build_body()
wheels = []
for (wn, gx, gz, side) in (("wheel_FL", HUB_X, WZ_F, 1),
                           ("wheel_FR", -HUB_X, WZ_F, -1),
                           ("wheel_RL", HUB_X, WZ_R, 1),
                           ("wheel_RR", -HUB_X, WZ_R, -1)):
    w = build_wheel(wn, side)
    w.location = (gx, -gz, WHEEL_R)      # glTF hub -> Blender
    w.parent = body
    w.matrix_parent_inverse = body.matrix_world.inverted()
    wheels.append(w)

# smooth the cylindrical surfaces, keep the slab edges hard
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
for w in wheels:
    w.select_set(True)
bpy.context.view_layer.objects.active = body
try:
    bpy.ops.object.shade_auto_smooth(angle=math.radians(38))
except Exception:
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))
    except Exception:
        pass

# ---------------------------------------------------------------------------
# export GLB (raw; Draco happens in tools/glb/optimize.mjs afterwards)
# ---------------------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
for w in wheels:
    w.select_set(True)
bpy.context.view_layer.objects.active = body
glb = os.path.join(out_dir, "suv_boxy_lux.glb")
bpy.ops.export_scene.gltf(
    filepath=glb, use_selection=True, export_format="GLB",
    export_apply=False, export_yup=True, export_cameras=False,
    export_lights=False, export_materials="EXPORT")

tris = 0
for o in [body] + wheels:
    tris += sum(len(p.vertices) - 2 for p in o.data.polygons)

# ---------------------------------------------------------------------------
# contact-sheet renders vs the sim HDRI (front-3/4, rear-3/4, side)
# ---------------------------------------------------------------------------
bpy.ops.mesh.primitive_plane_add(size=90, location=(0, 0, 0))
ground = bpy.context.active_object
ground.data.materials.append(
    mat("wet_asphalt", (0.030, 0.032, 0.036), rough=0.16, metal=0.0, coat=0.4))

world = bpy.data.worlds.new("sky")
world.use_nodes = True
bpy.context.scene.world = world
nt = world.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
w_out = nt.nodes.new("ShaderNodeOutputWorld")
bg = nt.nodes.new("ShaderNodeBackground")
try:
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(HDRI)
    nt.links.new(env.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 1.1
except Exception:
    bg.inputs[0].default_value = (0.85, 0.88, 0.95, 1.0)
nt.links.new(bg.outputs[0], w_out.inputs[0])

sun_data = bpy.data.lights.new("sun", type="SUN")
sun_data.energy = 3.2
sun_data.color = (1.0, 0.95, 0.85)
sun = bpy.data.objects.new("sun", sun_data)
bpy.context.collection.objects.link(sun)
sun.rotation_euler = (math.radians(58), math.radians(12), math.radians(-50))

tgt = bpy.data.objects.new("target", None)
tgt.location = (0, 0, 0.95)
bpy.context.collection.objects.link(tgt)
cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
con = cam.constraints.new("TRACK_TO")
con.target = tgt
con.track_axis = "TRACK_NEGATIVE_Z"
con.up_axis = "UP_Y"

sc = bpy.context.scene
sc.camera = cam
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        sc.render.engine = eng
        break
    except Exception:
        continue
try:
    sc.eevee.taa_render_samples = 96
    sc.eevee.use_raytracing = True
except Exception:
    pass
sc.render.resolution_x = 1400
sc.render.resolution_y = 950
try:
    sc.view_settings.view_transform = "AgX"
except Exception:
    sc.view_settings.view_transform = "Filmic"
sc.render.image_settings.file_format = "PNG"

# Blender space: nose points toward -Y.
VIEWS = [
    ("boxy_suv_front34", (4.6, -6.0, 2.2), 40),
    ("boxy_suv_rear34", (4.6, 6.0, 2.2), 40),
    ("boxy_suv_side", (9.0, 0.2, 1.30), 50),
]
for (vname, loc, lens) in VIEWS:
    cam_data.lens = lens
    cam.location = loc
    sc.render.filepath = os.path.join(PREVIEW_DIR, vname + ".png")
    bpy.ops.render.render(write_still=True)

print("BOXY_SUV_OK tris=%d glb=%s bytes=%d previews=%s" %
      (tris, glb, os.path.getsize(glb), PREVIEW_DIR))
