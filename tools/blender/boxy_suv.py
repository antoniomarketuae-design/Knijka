"""
Hero traffic/showcase vehicle: FICTIONAL boxy luxury SUV ("Kastel Baron" working
name) — de-badged G63-type per docs/simulation/70_VISUAL_REFERENCE_BRIEF.md REF 4
and the dimensioned research digest.

v2 — MID-POLY rebuild (docs/simulation/71 §4.8, quality-gap/06_vehicle_detail.md §2):
the v1 slab body read "toy" because every edge was a razor 90° that catches no
highlight, and the headlamps read as archery-target bullseyes. The fix is the
industry mid-poly workflow, NO bake: model once at final resolution, put a real
1-segment bevel (~4.5 mm) on every visible edge, then let the Weighted Normal
modifier make the big flat faces dominate the shading so the low-poly slab reads
high-poly. Target ~15-30k tris. Headlamps rebuilt as round LED-ring DRLs (thin
bright ring over a DARK lens + chrome projector bowl — never a bright centre dot).

House style of tools/blender/vehicles.py (bmesh Builder in glTF space, cached
mat(), separate hub-centred wheel nodes wheel_FL/FR/RL/RR spinning on local X,
nose +Z). Material NAMES are a load-bearing contract with the fleet loader
(platform/src/modules/sim/traffic/vehicleFleet.ts): paint_* stays in the body
merge, mesh_dark->matte_black / brake_steel->silver_satin fold, and the wheels
count as CUSTOM because they carry rim_gloss_black/red_accent — do not rename.

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

# Golden-hour HDRI is the sim's Phase-1 primary env (doc 71 §4.2) — a real
# unclipped sun in the map is what makes gloss-black paint + chrome read as a
# "product shot" rather than the flat overcast v1 previews. Fall back to the
# older urban sky if the golden HDRI is missing.
HDRI = "E:/AI driver/platform/public/sim/env/shanghai_riverside_1k.hdr"
HDRI_FALLBACK = "E:/AI driver/platform/public/sim/env/sky_urban_1k.hdr"
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


# Two blacks are THE G-Class cue (doc 06 §4): deep gloss clearcoat paint vs matte
# cladding, obviously different gloss. Paint recipe follows the official three.js
# car shader — a rough metallic base UNDER a near-mirror clearcoat.
PAINT = mat("paint_gloss_black", (0.010, 0.010, 0.012), rough=0.42, metal=0.9,
            coat=1.0, coat_rough=0.035)
MATTE = mat("matte_black", (0.017, 0.017, 0.019), rough=0.80, metal=0.0)     # arches/cladding
TRIM = mat("gloss_trim", (0.012, 0.012, 0.014), rough=0.28, metal=0.25, coat=0.5)  # handles/pillars/frames
CHROME = mat("chrome", (0.86, 0.87, 0.89), rough=0.075, metal=1.0)           # grille slats + exhaust + lamp bezels
SILVER = mat("silver_satin", (0.55, 0.56, 0.58), rough=0.30, metal=0.92)     # boards + skid lip
RED_ACC = mat("red_accent", (0.50, 0.02, 0.02), rough=0.30, metal=0.1, coat=0.6)  # calipers + pinstripe
GLASS = mat("glass_tint", (0.010, 0.013, 0.020), rough=0.05, metal=0.85, coat=0.6)
MESH_DK = mat("mesh_dark", (0.013, 0.013, 0.015), rough=0.92, metal=0.0)     # intakes/grille backing/lens cup
TIRE = mat("tire", (0.017, 0.017, 0.021), rough=0.90, metal=0.0)
RIM = mat("rim_gloss_black", (0.013, 0.013, 0.016), rough=0.15, metal=0.55, coat=0.7)
STEEL = mat("brake_steel", (0.27, 0.27, 0.29), rough=0.42, metal=0.85)
PLATE = mat("plate_blank", (0.74, 0.75, 0.76), rough=0.4, metal=0.0)
# The ONLY lit part of the headlamp — a thin bright LED DRL ring. Everything
# inboard of it stays dark so it never reads as a bullseye.
DRL = mat("drl_ring", (0.90, 0.93, 0.98), rough=0.12, emit=(0.95, 0.97, 1.0),
          emit_strength=2.6)
AMBER = mat("amber_lens", (0.55, 0.22, 0.02), rough=0.2, emit=(1.0, 0.45, 0.05),
            emit_strength=1.4)
TAIL = mat("tail_red", (0.22, 0.012, 0.012), rough=0.2, emit=(1.0, 0.05, 0.03),
           emit_strength=0.85)
REVERSE = mat("reverse_lens", (0.45, 0.45, 0.45), rough=0.2, emit=(0.9, 0.9, 0.85),
              emit_strength=0.22)

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
# Mid-poly finisher: bevel every visible edge + Weighted Normal so the flat slab
# reads high-poly (docs/simulation/quality-gap/06 §2a). NO bake. Applied per
# object so render, tri-count and export all agree on the final geometry.
# ---------------------------------------------------------------------------
def hard_surface_pass(obj, width=0.0045, segments=1, angle_deg=32):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # Smooth shading first so custom normals (set by Weighted Normal) actually
    # drive the interpolation; the big planar faces stay flat either way.
    try:
        bpy.ops.object.shade_smooth()
    except Exception:
        pass
    bev = obj.modifiers.new("Bevel", "BEVEL")
    bev.width = width
    bev.segments = segments
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(angle_deg)
    bev.use_clamp_overlap = True          # protects thin details (seams/slats)
    bev.harden_normals = False            # soft rounded edge highlight (not hard)
    bev.miter_outer = "MITER_ARC"
    bev.loop_slide = True
    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    wn.mode = "FACE_AREA"                 # big faces dominate -> flat reads flat
    wn.weight = 50
    wn.thresh = 0.01
    for m in (bev.name, wn.name):
        try:
            bpy.ops.object.modifier_apply(modifier=m)
        except Exception as e:
            print("  modifier apply failed:", m, e)


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


def build_lamp(b, sx):
    """Round LED-ring headlamp. The single rule that separates a modern LED lamp
    from a bullseye TARGET: a thin bright DRL ring is the ONLY lit thing, sitting
    over an otherwise DARK lens with a DARK recessed projector — no chrome inside
    (chrome mirrors the bright sky into a white centre dot = instant target)."""
    cy = 0.96
    # squared matte housing set into the fascia
    b.box_g(sx, cy, 2.260, 0.31, 0.31, 0.055, MATTE)
    # dark reflector lens cup — the whole face reads dark
    b.cyl_g(sx, cy, "z", 0.142, 2.268, 2.300, MESH_DK, seg=34)
    # dark GLOSS bezel rim (not chrome, so no bright band competes with the ring)
    b.ring_g(sx, cy, "z", 0.138, 0.156, 2.292, 2.314, TRIM, seg=34)
    # THIN bright LED DRL ring near the outer edge (the ONLY lit element)
    b.ring_g(sx, cy, "z", 0.116, 0.128, 2.301, 2.307, DRL, seg=40)
    # dark recessed projector: dark bowl + dark bezel + a dark, only-slightly
    # glossy lens set BEHIND the ring plane so it stays a shadowed dark eye
    b.cyl_g(sx, cy, "z", 0.072, 2.284, 2.298, MESH_DK, seg=24)
    b.ring_g(sx, cy, "z", 0.058, 0.072, 2.294, 2.302, TRIM, seg=24)
    b.cyl_g(sx, cy, "z", 0.054, 2.290, 2.297, TRIM, seg=24)


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
    # low roof-edge trim rail across the front (REF-4 roof trim cue)
    b.box_g(0, 1.878, 0.62, 1.70, 0.02, 0.05, TRIM)

    # pillars (gloss black frames): A raked, B/C vertical, D rear corner
    for sx in (1, -1):
        b.prism_g([(WS_BASE_Z, BELT), (WS_BASE_Z + 0.12, BELT),
                   (WS_TOP_Z + 0.12, GLASS_TOP), (WS_TOP_Z, GLASS_TOP)],
                  sx * 0.848, sx * 0.876, TRIM)
        for pz, pw in ((-0.28, 0.09), (-1.30, 0.09), (-2.285, 0.10)):
            b.box_g(sx * 0.862, (BELT + GLASS_TOP) / 2, pz,
                    0.03, GLASS_TOP - BELT, pw, TRIM)

    # ---- hood: raised perimeter step + washer nozzles + cowl ----
    b.box_g(0, BELT + 0.010, 1.60, 1.44, 0.024, 1.18, PAINT)
    b.box_g(0, BELT + 0.020, 1.60, 1.30, 0.020, 1.02, PAINT)   # centre power dome
    for sx in (1, -1):
        b.box_g(sx * 0.14, BELT + 0.030, 1.14, 0.028, 0.014, 0.05, MATTE)  # washer nozzle
    b.box_g(0, BELT - 0.003, 0.985, 1.60, 0.015, 0.06, MATTE)  # wiper bay

    # ---- fender-top indicator pods (the icon) ----
    for sx in (1, -1):
        b.box_g(sx * 0.795, BELT + 0.028, 2.02, 0.072, 0.058, 0.15, TRIM)
        b.box_g(sx * 0.795, BELT + 0.034, 2.096, 0.05, 0.03, 0.012, AMBER)

    # ---- front fascia: round LED lamps + 13-slat grille (NO badge) ----
    for sx in (0.66, -0.66):
        build_lamp(b, sx)
    b.box_g(0, 0.93, 2.256, 1.02, 0.42, 0.028, TRIM)                # grille frame
    b.box_g(0, 0.93, 2.262, 0.94, 0.34, 0.026, MESH_DK)            # backing
    n_slats = 13                                                    # NOT 15 (ADR-001)
    pitch = 0.94 / n_slats
    for k in range(n_slats):
        xk = -0.47 + (k + 0.5) * pitch
        b.box_g(xk, 0.93, 2.278, 0.021, 0.33, 0.032, CHROME)
    # two chrome cross-rails tying the slats (generic, not the Panamericana pitch)
    for gy in (1.055, 0.805):
        b.box_g(0, gy, 2.280, 0.93, 0.022, 0.030, CHROME)
    # NO central badge, NO star — clean slats only.

    # ---- front bumper: 3 mesh intakes + silver skid lip + tow eyes ----
    b.box_g(0, 0.57, 2.275, 1.93, 0.34, 0.11, PAINT)
    b.box_g(0, 0.545, 2.333, 0.78, 0.21, 0.012, MESH_DK)
    for sx in (1, -1):
        b.box_g(sx * 0.60, 0.545, 2.333, 0.30, 0.21, 0.012, MESH_DK)
        b.cyl_g(sx * 0.34, 0.44, "z", 0.020, 2.33, 2.36, SILVER, seg=12)
    b.box_g(0, 0.395, 2.29, 0.90, 0.06, 0.13, SILVER)               # skid lip
    # lower-body corner wraps bridging bumper ears into the arch flares
    for sx in (1, -1):
        b.box_g(sx * 0.918, 0.57, 2.12, 0.075, 0.30, 0.22, PAINT)
        b.box_g(sx * 0.918, 0.56, -2.19, 0.075, 0.28, 0.39, PAINT)

    # ---- sides: cladding, seams, hinges, handles, boards, exhausts, mirrors ----
    for sx in (1, -1):
        # mid-height protective cladding strip (matte — the two-blacks contrast)
        b.box_g(sx * 0.888, 0.88, -0.085, 0.024, 0.10, 4.30, MATTE)
        # door cut seams (dark, hairline-proud)
        for sz in (0.95, -0.28, -1.30):
            b.box_g(sx * 0.882, 0.80, sz, 0.006, 0.70, 0.014, MESH_DK)
        # external barrel hinges — 2 per door on leading edges
        for hz in (0.90, -0.31):
            for hy in (0.68, 1.02):
                b.cyl_g(sx * 0.888, hz, "y", 0.017, hy, hy + 0.10, PAINT, seg=12)
        # exposed gloss-black door handles
        for hz in (0.42, -0.80):
            b.box_g(sx * 0.890, 1.03, hz, 0.025, 0.045, 0.16, TRIM)
        # silver running board + rubber treads
        b.box_g(sx * 0.945, 0.452, 0.0, 0.15, 0.05, 1.58, SILVER)
        for tz in (-0.55, -0.18, 0.18, 0.55):
            b.box_g(sx * 0.952, 0.480, tz, 0.11, 0.010, 0.22, MATTE)
        # side-exit dual exhaust tips behind front wheel, under the board
        for ez in (0.66, 0.52):
            b.cyl_g(0.385, ez, "x", 0.040, sx * 0.90, sx * 1.010, CHROME, seg=16)
        # mirror: stalk + head + amber strip + glass
        b.box_g(sx * 0.955, 1.40, 0.82, 0.13, 0.03, 0.05, MATTE)
        b.box_g(sx * 1.045, 1.45, 0.80, 0.12, 0.15, 0.075, MATTE)
        b.box_g(sx * 1.108, 1.45, 0.80, 0.012, 0.02, 0.05, AMBER)
        b.box_g(sx * 1.045, 1.45, 0.760, 0.10, 0.13, 0.008, GLASS)

    # ---- squared-off arch flares + dark liners + brakes ----
    for wz in (WZ_F, WZ_R):
        for sx in (1, -1):
            x_in, x_out = sx * (HW - 0.005), sx * FLARE_OUT
            b.ring_g(WHEEL_R, wz, "x", FLARE_RI, FLARE_RO,
                     min(x_in, x_out), max(x_in, x_out), MATTE,
                     seg=11, a0=0.04, a1=math.pi - 0.04)
            # dark arch liner ring flush on the body side
            b.ring_g(WHEEL_R, wz, "x", 0.28, FLARE_RI + 0.005,
                     sx * 0.879, sx * 0.883 if sx > 0 else sx * 0.879 - 0.004,
                     MESH_DK, seg=12, a0=-0.1, a1=math.pi + 0.1)
            # brake disc + RED caliper (static, visible through spokes)
            xd0, xd1 = sx * 0.79, sx * 0.828
            b.cyl_g(WHEEL_R, wz, "x", 0.185, min(xd0, xd1), max(xd0, xd1),
                    STEEL, seg=22)
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
        b.cyl_g(-0.84, -2.432, "y", 0.018, hy, hy + 0.10, PAINT, seg=12)
    b.box_g(0.68, 1.00, -2.428, 0.12, 0.035, 0.03, TRIM)
    # full-size spare in a plain hard cover (smooth face + simple ring rib ONLY).
    # `tire`-material band stays in the BODY mesh (fleet loader keeps it here).
    b.ring_g(0, 1.05, "z", 0.29, 0.40, -2.43, -2.62, TIRE, seg=28)  # tire band
    b.cyl_g(0, 1.05, "z", 0.405, -2.60, -2.645, PAINT, seg=28)      # cover
    b.ring_g(0, 1.05, "z", 0.21, 0.27, -2.645, -2.660, PAINT, seg=24)  # rib
    b.box_g(0, 1.475, -2.60, 0.18, 0.04, 0.05, TAIL)                # 3rd brake pod

    obj = b.finalize("suv_boxy_lux")
    hard_surface_pass(obj, width=0.0045, segments=1, angle_deg=32)
    return obj


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
    b.ring_g(0, 0, "x", RIM_R + 0.006, WHEEL_R, -ht, ht, TIRE, seg=32)
    # rim outer lip + red pinstripe on the outer edge
    lo, hi = sorted((s * 0.096, s * ht))
    b.ring_g(0, 0, "x", 0.242, RIM_R + 0.008, lo, hi, RIM, seg=28)
    lo, hi = sorted((s * ht, s * (ht + 0.0045)))
    b.ring_g(0, 0, "x", 0.262, RIM_R + 0.008, lo, hi, RED_ACC, seg=28)
    # 7 twin-Y spoke pairs (14 thin spokes) — deep dish near outboard face
    for k in range(7):
        base = TAU * k / 7
        for da in (-0.13, 0.13):
            b.spoke_g(s * 0.092, s * 0.140, 0.066, 0.246,
                      base + da, 0.011, RIM)
    # hub + plain center cap (NO logo)
    lo, hi = sorted((s * 0.088, s * 0.148))
    b.cyl_g(0, 0, "x", 0.082, lo, hi, RIM, seg=18)
    lo, hi = sorted((s * 0.148, s * 0.156))
    b.cyl_g(0, 0, "x", 0.052, lo, hi, RIM, seg=18)
    obj = b.finalize(name)
    # Lighter bevel on the wheel — rounds the tire shoulder + spoke edges without
    # eating the thin spokes (clamp_overlap protects them).
    hard_surface_pass(obj, width=0.0028, segments=1, angle_deg=30)
    return obj


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
# contact-sheet renders vs the sim golden-hour HDRI (front-3/4, rear-3/4, side)
# ---------------------------------------------------------------------------
bpy.ops.mesh.primitive_plane_add(size=90, location=(0, 0, 0))
ground = bpy.context.active_object
ground.data.materials.append(
    mat("wet_asphalt", (0.026, 0.028, 0.032), rough=0.14, metal=0.0, coat=0.4))

world = bpy.data.worlds.new("sky")
world.use_nodes = True
bpy.context.scene.world = world
nt = world.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
w_out = nt.nodes.new("ShaderNodeOutputWorld")
bg = nt.nodes.new("ShaderNodeBackground")
hdri_path = HDRI if os.path.exists(HDRI) else HDRI_FALLBACK
try:
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(hdri_path)
    # rotate the HDRI so its baked sun sits front-left of the hero for the 3/4s
    texco = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(-55))
    nt.links.new(texco.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 1.0
except Exception:
    bg.inputs[0].default_value = (0.85, 0.88, 0.95, 1.0)
nt.links.new(bg.outputs[0], w_out.inputs[0])

sun_data = bpy.data.lights.new("sun", type="SUN")
sun_data.energy = 2.6
sun_data.color = (1.0, 0.93, 0.80)
sun_data.angle = math.radians(1.5)
sun = bpy.data.objects.new("sun", sun_data)
bpy.context.collection.objects.link(sun)
sun.rotation_euler = (math.radians(56), math.radians(10), math.radians(-52))

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
    sc.eevee.taa_render_samples = 128
    sc.eevee.use_raytracing = True
except Exception:
    pass
sc.render.resolution_x = 1400
sc.render.resolution_y = 950
try:
    sc.view_settings.view_transform = "AgX"
except Exception:
    sc.view_settings.view_transform = "Filmic"
try:
    sc.view_settings.exposure = 0.35
except Exception:
    pass
sc.render.image_settings.file_format = "PNG"

# Blender space: nose points toward -Y.
VIEWS = [
    ("boxy_suv_v2_front34", (4.5, -5.9, 2.0), 42),
    ("boxy_suv_v2_rear34", (4.6, 6.0, 2.1), 42),
    ("boxy_suv_v2_side", (9.0, 0.2, 1.28), 50),
    ("boxy_suv_v2_front", (0.9, -6.8, 1.35), 55),   # near head-on: verify lamps
]
for (vname, loc, lens) in VIEWS:
    cam_data.lens = lens
    cam.location = loc
    sc.render.filepath = os.path.join(PREVIEW_DIR, vname + ".png")
    bpy.ops.render.render(write_still=True)

print("BOXY_SUV_OK tris=%d glb=%s bytes=%d previews=%s" %
      (tris, glb, os.path.getsize(glb), PREVIEW_DIR))
