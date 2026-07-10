"""
TRAFFIC FLEET v2 generator (headless Blender) for the Книжка.AI simulator.

Replaces/extends tools/blender/vehicles.py with TWELVE distinct ambient-traffic
models whose silhouettes read at 30 m (R4 research digest + REF 3 of
docs/simulation/70_VISUAL_REFERENCE_BRIEF.md). The Bulgarian parc is old
(avg ~19 yrs), so the fleet skews to 2000s hatch/sedan/wagon shapes with a
crossover sprinkle, a Sofia-yellow taxi (livery, not a brand) and a
GAZelle-type yellow minibus.

    blender --background --python tools/blender/vehicles_v2.py -- <out_dir>

Models (all FICTIONAL, de-badged — ADR-001):
  vela_h3   compact hatchback  (Golf-class, vertical tail cut at rear wheel)
  pino      small city hatch   (stubby, tall cabin)
  corva_s   midsize sedan      (3-box, long trunk deck)
  dret_90   old-gen 90s sedan  (boxy, flat hood, upright glass, small wheels)
  corva_sw  wagon              (sedan roof extended flat to vertical tailgate + rails)
  arden_x   crossover          (raised hatch, black arch cladding, roof rails)
  kolos     boxy SUV           (slab sides, flat roof, spare on tailgate — ambient
                                cousin of the REF-4 hero, much simpler)
  corva_l   luxury sedan       (long, low roofline, big wheels, chrome strip)
  tarpan    pickup             (cab + open bed gap, higher ride)
  kargo_v   panel van          (cab-forward slab box)
  kargo_m   minibus            (GAZelle-type: short hood, high roof cap, window row,
                                Sofia route-van YELLOW)
  taxi      corva_s reskin     (Sofia yellow + roof sign box + generic checker band)

Silhouette rules applied (digest B): exaggerated greenhouse-to-body ratio,
distinct rear cut angle per type, ride height per type, wheels ~+8% oversize,
near-black tinted glazing, ONE non-shape identifier per model (rails / roof box /
high roof / spare / running boards).

Coordinate contract (same as vehicles.py / TrafficLayer):
  glTF space  X = right, Y = up, Z = nose-forward, ground at Y = 0.
Wheel nodes wheel_FL / wheel_FR / wheel_RL / wheel_RR, hub-centred, spin axis on
local X, parented to the body node (body node name = model key).

Also writes <out_dir>/palettes.json — per-model weighted spawn palettes derived
from Axalta 2025 EU data adjusted for the aged Bulgarian fleet (achromatic ~70%,
silver bumped, brights desaturated), for the sim's instanced-color spawner.
"""

import bpy
import bmesh
import sys
import os
import math
import json

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
    out_dir = os.path.join(os.path.expanduser("~"), "fleet-v2-out")
os.makedirs(out_dir, exist_ok=True)

HDRI = "E:/AI driver/platform/public/sim/env/sky_urban_1k.hdr"
PREVIEW_DIR = "E:/AI driver/tools/blender/previews"
PREVIEW = os.path.join(PREVIEW_DIR, "fleet_v2.png")
PREVIEW_REAR = os.path.join(PREVIEW_DIR, "fleet_v2_rear.png")
os.makedirs(PREVIEW_DIR, exist_ok=True)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                 bpy.data.cameras, bpy.data.worlds, bpy.data.objects,
                 bpy.data.curves):
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


def mat(name, rgb, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, coat=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    try:
        b.inputs["Coat Weight"].default_value = coat
    except Exception:
        pass
    if emit is not None:
        b.inputs["Emission Color"].default_value = (emit[0], emit[1], emit[2], 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    _mats[name] = m
    return m


# Shared non-paint materials (identical style family to vehicles.py):
# opaque near-black "glass" — cheap, no transparency sorting, reflects the HDRI.
GLASS = mat("glass", (0.013, 0.017, 0.026), rough=0.12, metal=0.55, coat=0.6)
TIRE = mat("tire", (0.016, 0.016, 0.02), rough=0.85)
HUB = mat("hubcap", (0.40, 0.42, 0.46), rough=0.30, metal=0.9)
HUB_DARK = mat("hubcap_dark", (0.05, 0.05, 0.06), rough=0.35, metal=0.85)
TRIM = mat("trim", (0.02, 0.02, 0.025), rough=0.55, metal=0.4)     # bumpers/grille
CLAD = mat("cladding", (0.028, 0.028, 0.032), rough=0.85)          # matte arch trim
CHROME = mat("chrome", (0.62, 0.63, 0.65), rough=0.10, metal=1.0)
STEP = mat("step_silver", (0.45, 0.46, 0.48), rough=0.35, metal=0.8)
PLATE = mat("plate", (0.80, 0.81, 0.82), rough=0.35)
HEAD = mat("headlight", (0.85, 0.85, 0.82), rough=0.15,
           emit=(1.0, 0.95, 0.82), emit_strength=2.6)
TAIL = mat("taillight", (0.35, 0.02, 0.02), rough=0.2,
           emit=(1.0, 0.06, 0.03), emit_strength=2.4)
SIGN_TAXI = mat("taxi_sign", (0.92, 0.86, 0.55), rough=0.3,
                emit=(1.0, 0.92, 0.55), emit_strength=1.6)
SIGN_ROUTE = mat("route_sign", (0.90, 0.90, 0.88), rough=0.3,
                 emit=(1.0, 0.98, 0.9), emit_strength=0.8)
CHECKER = mat("checker_black", (0.015, 0.015, 0.018), rough=0.5)

# Fleet paint table — Axalta EU 2025 pushed through the "aged clearcoat" filter:
# ~15% desaturated, brights dropped in value (digest C, bullets 9–10). Linear RGB.
PAINTS = {
    "silver":        (0.30, 0.31, 0.33),
    "grey":          (0.15, 0.16, 0.17),
    "white":         (0.64, 0.65, 0.65),
    "black":         (0.024, 0.024, 0.028),
    "dark_blue":     (0.032, 0.055, 0.13),
    "midnight_blue": (0.018, 0.030, 0.085),
    "faded_blue":    (0.16, 0.21, 0.30),
    "red":           (0.28, 0.045, 0.035),
    "dark_red":      (0.13, 0.026, 0.030),
    "dark_green":    (0.030, 0.085, 0.048),
    "beige":         (0.36, 0.31, 0.21),
    "brown":         (0.11, 0.066, 0.042),
    "teal":          (0.035, 0.14, 0.14),
    "orange":        (0.42, 0.14, 0.030),
    "taxi_yellow":   (0.68, 0.44, 0.045),   # Sofia taxis are yellow by law
    "route_yellow":  (0.66, 0.40, 0.040),   # minibus / marshrutka yellow
    "dark_grey":     (0.060, 0.062, 0.068),
}


def paint(name):
    return mat("paint_%s" % name, PAINTS[name], rough=0.34, metal=0.25, coat=0.5)


# ---------------------------------------------------------------------------
# Builder — authors in glTF space (X right, Y up, Z nose), stores Blender Z-up.
#   glTF (gx, gy, gz)  ->  Blender (gx, -gz, gy)
# ---------------------------------------------------------------------------
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

    def _bbox(self, bx, by, bz, bsx, bsy, bsz, mi):
        hx, hy, hz = bsx / 2, bsy / 2, bsz / 2
        c = [(bx - hx, by - hy, bz - hz), (bx + hx, by - hy, bz - hz),
             (bx + hx, by + hy, bz - hz), (bx - hx, by + hy, bz - hz),
             (bx - hx, by - hy, bz + hz), (bx + hx, by - hy, bz + hz),
             (bx + hx, by + hy, bz + hz), (bx - hx, by + hy, bz + hz)]
        v = [self.bm.verts.new(p) for p in c]
        for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                  (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]:
            self.bm.faces.new([v[i] for i in f]).material_index = mi

    def box_g(self, cx, cy, cz, sx, sy, sz, material):
        self._bbox(cx, -cz, cy, sx, sz, sy, self._mi(material))

    def prism_g(self, profile, x0, x1, material):
        """Extrude a closed side-profile (list of (gz, gy)) along X from x0..x1."""
        mi = self._mi(material)
        A = [self.bm.verts.new((x0, -gz, gy)) for (gz, gy) in profile]
        B = [self.bm.verts.new((x1, -gz, gy)) for (gz, gy) in profile]
        n = len(profile)
        self.bm.faces.new(A).material_index = mi
        self.bm.faces.new(list(reversed(B))).material_index = mi
        for i in range(n):
            j = (i + 1) % n
            self.bm.faces.new([A[i], A[j], B[j], B[i]]).material_index = mi

    def cyl_z(self, cx, cy, cz, r, depth, material, seg=12):
        """Cylinder with spin axis along glTF Z (e.g. tailgate spare wheel)."""
        mi = self._mi(material)
        ring_a, ring_b = [], []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            gx, gy = cx + r * math.cos(a), cy + r * math.sin(a)
            ring_a.append(self.bm.verts.new((gx, -(cz - depth / 2), gy)))
            ring_b.append(self.bm.verts.new((gx, -(cz + depth / 2), gy)))
        self.bm.faces.new(ring_a).material_index = mi
        self.bm.faces.new(list(reversed(ring_b))).material_index = mi
        for k in range(seg):
            j = (k + 1) % seg
            self.bm.faces.new([ring_a[k], ring_a[j],
                               ring_b[j], ring_b[k]]).material_index = mi

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


def build_wheel(name, R, thick, hub=HUB, seg=12):
    """Tire cylinder, spin axis local X, hub-coloured caps, origin at hub."""
    bm = bmesh.new()
    ring_n, ring_p = [], []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        y, z = R * math.cos(a), R * math.sin(a)
        ring_n.append(bm.verts.new((-thick / 2, y, z)))
        ring_p.append(bm.verts.new((thick / 2, y, z)))
    for k in range(seg):
        j = (k + 1) % seg
        bm.faces.new([ring_n[k], ring_n[j], ring_p[j], ring_p[k]])
    bm.faces.new(list(reversed(ring_n)))
    bm.faces.new(ring_p)
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(TIRE)   # slot 0
    obj.data.materials.append(hub)    # slot 1
    for poly in obj.data.polygons:
        poly.material_index = 1 if len(poly.vertices) > 4 else 0
    bpy.context.collection.objects.link(obj)
    return obj


def attach_wheels(body, spec):
    R, wx, wt = spec["wheel_r"], spec["wheel_x"], spec["wheel_t"]
    zf = spec.get("wheel_zf", spec.get("wheel_z"))
    zr = -spec.get("wheel_zr", spec.get("wheel_z"))
    hub = spec.get("hub", HUB)
    wheels = []
    for (wn, gx, gz) in (("wheel_FL", wx, zf), ("wheel_FR", -wx, zf),
                         ("wheel_RL", wx, zr), ("wheel_RR", -wx, zr)):
        w = build_wheel(wn, R, wt, hub=hub)
        w.location = (gx, -gz, R)     # glTF hub (gx, R, gz) -> Blender
        w.parent = body
        w.matrix_parent_inverse = body.matrix_world.inverted()
        wheels.append(w)
    return wheels


# ---------------------------------------------------------------------------
# shared detail helpers (all author into an open Builder)
# ---------------------------------------------------------------------------
def add_mirrors(b, hw, cowl_z, belt):
    for s in (1, -1):
        b.box_g(s * (hw + 0.09), belt + 0.17, cowl_z + 0.02, 0.14, 0.10, 0.07, TRIM)


def add_bumpers(b, W, L, floor, mtl=TRIM, h=0.20):
    zf, zr = L / 2, -L / 2
    b.box_g(0, floor + h * 0.7, zf - 0.02, W * 0.92, h, 0.10, mtl)
    b.box_g(0, floor + h * 0.7, zr + 0.02, W * 0.92, h, 0.10, mtl)


def add_lights(b, W, L, head_y, tail_y, wide=0.30, tall=0.14):
    zf, zr = L / 2, -L / 2
    for s in (1, -1):
        b.box_g(s * (W / 2 - 0.24), head_y, zf - 0.04, wide, tall, 0.06, HEAD)
        b.box_g(s * (W / 2 - 0.22), tail_y, zr + 0.04, wide + 0.02, tall + 0.03, 0.06, TAIL)


def add_grille(b, W, L, y):
    b.box_g(0, y, L / 2 - 0.03, W * 0.42, 0.12, 0.06, TRIM)


def add_plates(b, L, floor):
    b.box_g(0, floor + 0.30, L / 2 + 0.005, 0.50, 0.12, 0.02, PLATE)
    b.box_g(0, floor + 0.32, -L / 2 - 0.005, 0.50, 0.12, 0.02, PLATE)


def add_roof_rails(b, cw, roof, z0, z1):
    for s in (1, -1):
        b.box_g(s * (cw - 0.09), roof + 0.055, (z0 + z1) / 2,
                0.06, 0.07, abs(z1 - z0) * 0.92, TRIM)


def add_arch_cladding(b, spec, W):
    """Matte-black squared arch flares + rocker strip (crossover/SUV cue)."""
    R = spec["wheel_r"]
    zf = spec.get("wheel_zf", spec.get("wheel_z"))
    zr = -spec.get("wheel_zr", spec.get("wheel_z"))
    for gz in (zf, zr):
        for s in (1, -1):
            b.box_g(s * (W / 2 - 0.02), R + 0.16, gz, 0.10, 0.34, 2 * R + 0.28, CLAD)
    floor = spec["floor"]
    span = (zf - zr) - 2 * R - 0.5
    b.box_g(0, floor + 0.05, (zf + zr) / 2, W + 0.05, 0.14, span, CLAD)


# ---------------------------------------------------------------------------
# generic car builder: side-profile prism + greenhouse prism + roof cap
# ---------------------------------------------------------------------------
def build_car(name, paint_mat, spec):
    L, W = spec["L"], spec["W"]
    hw = W / 2
    b = Builder()

    b.prism_g(spec["lower"], -hw, hw, paint_mat)

    cab = spec["cab"]
    cw = spec["cab_w"] / 2
    b.prism_g(cab, -cw, cw, GLASS)

    # roof cap over the flat top of the greenhouse
    roof = max(y for (_, y) in cab)
    zs = [z for (z, y) in cab if abs(y - roof) < 1e-6]
    z0, z1 = min(zs), max(zs)
    b.box_g(0, roof + 0.012, (z0 + z1) / 2, cw * 2 + 0.04,
            spec.get("cap_t", 0.06), (z1 - z0) + 0.08, paint_mat)

    floor = spec["floor"]
    cowl_z = cab[0][0]
    belt = cab[0][1]
    add_bumpers(b, W, L, floor, mtl=spec.get("bumper_mtl", TRIM))
    add_grille(b, W, L, spec["head_y"] - 0.03)
    add_lights(b, W, L, spec["head_y"], spec["tail_y"])
    add_plates(b, L, floor)
    add_mirrors(b, hw, cowl_z, belt - 0.04)

    if spec.get("rails"):
        add_roof_rails(b, cw, roof, z0, z1)
    if spec.get("clad"):
        add_arch_cladding(b, spec, W)
    if spec.get("chrome_strip"):
        b.box_g(0, belt - 0.02, 0, W + 0.02, 0.035, L * 0.62, CHROME)
    if spec.get("running_boards"):
        zf = spec["wheel_zf"]
        zr = -spec["wheel_zr"]
        span = (zf - zr) - 2 * spec["wheel_r"] - 0.45
        for s in (1, -1):
            b.box_g(s * (hw + 0.06), floor + 0.02, (zf + zr) / 2,
                    0.16, 0.06, span, STEP)
    if spec.get("spare"):
        # full-size spare on the tailgate — the boxy-SUV identifier
        sr = spec["wheel_r"] * 0.92
        b.cyl_z(0, floor + 0.62, -L / 2 - 0.10, sr, 0.22, CLAD)
        b.cyl_z(0, floor + 0.62, -L / 2 - 0.13, sr * 0.55, 0.20, TRIM)
    if spec.get("fender_pods"):
        for s in (1, -1):
            b.box_g(s * (hw - 0.18), spec["head_y"] + 0.13, L / 2 - 0.28,
                    0.12, 0.07, 0.22, TRIM)
    if spec.get("taxi_kit"):
        # Sofia livery: roof sign box + generic checker band (no operator marks)
        b.box_g(0, roof + 0.10, (z0 + z1) / 2 + 0.12, 0.16, 0.10, 0.34, TRIM)
        b.box_g(0, roof + 0.19, (z0 + z1) / 2 + 0.12, 0.13, 0.14, 0.40, SIGN_TAXI)
        for k in range(10):
            if k % 2 == 0:
                zc = -1.65 + k * 0.36
                for s in (1, -1):
                    b.box_g(s * (hw + 0.006), belt - 0.22, zc,
                            0.02, 0.21, 0.21, CHECKER)

    body = b.finalize(name)
    return body, attach_wheels(body, spec)


# ---------------------------------------------------------------------------
# pickup — cab greenhouse forward + open bed behind (dark inset top)
# ---------------------------------------------------------------------------
def build_pickup(name, paint_mat, spec):
    L, W = spec["L"], spec["W"]
    hw = W / 2
    floor, belt = spec["floor"], spec["belt"]
    zf, zr = L / 2, -L / 2
    b = Builder()

    lower = [
        (zr + 0.04, floor),
        (zf - 0.04, floor),
        (zf, floor + 0.30),
        (zf - 0.10, belt - 0.06),
        (0.60, belt),
        (zr + 0.03, belt),
        (zr, floor + 0.28),
    ]
    b.prism_g(lower, -hw, hw, paint_mat)

    cab = spec["cab"]
    cw = spec["cab_w"] / 2
    b.prism_g(cab, -cw, cw, GLASS)
    roof = max(y for (_, y) in cab)
    zs = [z for (z, y) in cab if abs(y - roof) < 1e-6]
    z0, z1 = min(zs), max(zs)
    b.box_g(0, roof + 0.012, (z0 + z1) / 2, cw * 2 + 0.04, 0.06,
            (z1 - z0) + 0.08, paint_mat)

    # open-bed read: dark inset panel on top of the bed + rail lips
    bed_f, bed_r = z0 - 0.75, zr + 0.14
    b.box_g(0, belt + 0.004, (bed_f + bed_r) / 2, W - 0.26, 0.02,
            bed_f - bed_r, CLAD)
    b.box_g(0, belt + 0.03, bed_f + 0.03, W - 0.10, 0.06, 0.06, paint_mat)

    add_bumpers(b, W, L, floor, h=0.22)
    add_grille(b, W, L, belt - 0.16)
    add_lights(b, W, L, belt - 0.14, belt - 0.16)
    add_plates(b, L, floor)
    add_mirrors(b, hw, cab[0][0], cab[0][1] - 0.04)
    add_arch_cladding(b, spec, W)

    body = b.finalize(name)
    return body, attach_wheels(body, spec)


# ---------------------------------------------------------------------------
# panel van — cab-forward slab box, no hood step
# ---------------------------------------------------------------------------
def build_van(name, paint_mat, spec):
    L, W = spec["L"], spec["W"]
    hw = W / 2
    floor, belt, roof = spec["floor"], spec["belt"], spec["roof"]
    zf, zr = L / 2, -L / 2
    ws_base, ws_top = spec["ws_base"], spec["ws_top"]   # windshield z at base/top
    b = Builder()

    # full-length lower hull to belt (nose face nearly vertical = cab-forward)
    lower = [
        (zr + 0.04, floor),
        (zf - 0.05, floor),
        (zf, floor + 0.34),
        (ws_base, belt),
        (zr + 0.02, belt),
        (zr, floor + 0.32),
    ]
    b.prism_g(lower, -hw, hw, paint_mat)

    # cargo box from belt to roof, front face begins behind the windshield top
    b.box_g(0, (belt + roof) / 2, (zr + ws_top) / 2,
            W, roof - belt, ws_top - zr, paint_mat)

    # raked windshield
    wind = [(ws_base, belt), (ws_top + 0.06, roof - 0.04),
            (ws_top - 0.14, roof - 0.04), (ws_base - 0.26, belt)]
    b.prism_g(wind, -(hw - 0.08), hw - 0.08, GLASS)
    # roof lip sealing the windshield top seam
    b.box_g(0, roof - 0.03, ws_top, W - 0.06, 0.08, 0.30, paint_mat)

    # cab door windows
    for s in (1, -1):
        b.box_g(s * (hw - 0.005), belt + 0.36, ws_base - 0.62,
                0.03, 0.52, 1.05, GLASS)
    # rear door split line
    b.box_g(0, (floor + roof) / 2 + 0.1, zr - 0.005, 0.03, roof - floor - 0.5,
            0.02, TRIM)

    add_bumpers(b, W, L, floor, h=0.24)
    add_lights(b, W, L, belt - 0.10, belt + 0.05, wide=0.28, tall=0.30)
    add_grille(b, W, L, floor + 0.62)
    add_plates(b, L, floor)
    add_mirrors(b, hw, ws_base - 0.15, belt + 0.30)

    body = b.finalize(name)
    return body, attach_wheels(body, spec)


# ---------------------------------------------------------------------------
# minibus — GAZelle-type: SHORT HOOD + tall box + HIGH ROOF CAP + window row
# ---------------------------------------------------------------------------
def build_minibus(name, paint_mat, spec):
    L, W = spec["L"], spec["W"]
    hw = W / 2
    floor, belt, roof = spec["floor"], spec["belt"], spec["roof"]
    zf, zr = L / 2, -L / 2
    cowl, ws_top = spec["cowl"], spec["ws_top"]
    b = Builder()

    # lower hull with the stubby light-truck nose
    lower = [
        (zr + 0.04, floor),
        (zf - 0.05, floor),
        (zf, floor + 0.32),
        (zf - 0.07, spec["nose_h"]),
        (cowl, spec["nose_h"] + 0.06),
        (cowl - 0.25, belt),
        (zr + 0.02, belt),
        (zr, floor + 0.30),
    ]
    b.prism_g(lower, -hw, hw, paint_mat)

    # box body from belt to roof
    b.box_g(0, (belt + roof) / 2, (zr + ws_top) / 2,
            W, roof - belt, ws_top - zr, paint_mat)

    # windshield up from the short hood
    wind = [(cowl, spec["nose_h"] + 0.08), (ws_top + 0.05, roof - 0.06),
            (ws_top - 0.15, roof - 0.06), (cowl - 0.28, spec["nose_h"] + 0.08)]
    b.prism_g(wind, -(hw - 0.10), hw - 0.10, GLASS)
    b.box_g(0, roof - 0.04, ws_top, W - 0.06, 0.10, 0.32, paint_mat)

    # passenger WINDOW ROW down both sides + rear window
    win_z0, win_z1 = zr + 0.35, ws_top - 0.35
    for s in (1, -1):
        b.box_g(s * (hw - 0.005), belt + 0.62, (win_z0 + win_z1) / 2,
                0.03, 0.52, win_z1 - win_z0, GLASS)
    b.box_g(0, belt + 0.62, zr - 0.005, W - 0.5, 0.5, 0.03, GLASS)

    # HIGH ROOF CAP — the marshrutka identifier
    b.box_g(0, roof + spec["cap_h"] / 2, (zr + ws_top - 0.5) / 2,
            W - 0.16, spec["cap_h"], (ws_top - 0.5) - zr - 0.15, paint_mat)
    # front route sign on the cap
    b.box_g(0, roof + spec["cap_h"] * 0.55, ws_top - 0.62, 0.72, 0.16, 0.05,
            SIGN_ROUTE)

    add_bumpers(b, W, L, floor, h=0.24)
    add_lights(b, W, L, spec["nose_h"] - 0.10, belt + 0.10, wide=0.28, tall=0.18)
    add_grille(b, W, L, spec["nose_h"] - 0.16)
    add_plates(b, L, floor)
    add_mirrors(b, hw, cowl - 0.20, belt + 0.40)

    body = b.finalize(name)
    return body, attach_wheels(body, spec)


# ---------------------------------------------------------------------------
# MODEL SPECS — twelve silhouettes (dims in metres, wheels ~+8% oversize)
# ---------------------------------------------------------------------------
def S(**kw):
    return kw


MODELS = [
    # 1. compact hatchback — vertical tail cut just past the rear wheel
    ("vela_h3", "silver", "car", S(
        L=4.26, W=1.78, floor=0.25, cab_w=1.60, head_y=0.72, tail_y=0.80,
        lower=[(-2.10, 0.25), (2.10, 0.25), (2.13, 0.56), (2.02, 0.80),
               (0.55, 0.92), (-1.90, 0.94), (-2.13, 0.88), (-2.13, 0.54)],
        cab=[(0.55, 0.94), (0.10, 1.47), (-1.45, 1.47), (-1.86, 0.96)],
        wheel_r=0.35, wheel_x=0.83, wheel_z=1.32, wheel_t=0.23)),
    # 2. small city hatch — stubby, TALL cabin
    ("pino", "red", "car", S(
        L=3.62, W=1.66, floor=0.24, cab_w=1.52, head_y=0.68, tail_y=0.76,
        lower=[(-1.78, 0.24), (1.78, 0.24), (1.81, 0.54), (1.70, 0.76),
               (0.92, 0.88), (-1.52, 0.90), (-1.81, 0.84), (-1.81, 0.50)],
        cab=[(0.92, 0.90), (0.40, 1.52), (-1.08, 1.52), (-1.50, 0.92)],
        wheel_r=0.32, wheel_x=0.77, wheel_z=1.15, wheel_t=0.21)),
    # 3. midsize sedan — clean 3-box, long trunk deck
    ("corva_s", "grey", "car", S(
        L=4.77, W=1.83, floor=0.26, cab_w=1.64, head_y=0.76, tail_y=0.84,
        lower=[(-2.35, 0.26), (2.35, 0.26), (2.385, 0.58), (2.26, 0.84),
               (0.62, 0.96), (-1.18, 0.96), (-2.30, 0.90), (-2.385, 0.56)],
        cab=[(0.62, 0.98), (0.08, 1.46), (-0.88, 1.46), (-1.18, 0.98)],
        wheel_r=0.36, wheel_x=0.85, wheel_z=1.42, wheel_t=0.24)),
    # 4. old-gen 90s sedan — boxy, flat hood, upright thin-pillar glass, small wheels
    ("dret_90", "dark_red", "car", S(
        L=4.45, W=1.70, floor=0.27, cab_w=1.58, head_y=0.74, tail_y=0.78,
        cap_t=0.05, bumper_mtl=CHROME,
        lower=[(-2.19, 0.27), (2.19, 0.27), (2.225, 0.58), (2.15, 0.82),
               (0.70, 0.86), (-1.05, 0.88), (-2.15, 0.86), (-2.225, 0.58)],
        cab=[(0.70, 0.88), (0.30, 1.42), (-0.62, 1.42), (-1.05, 0.90)],
        wheel_r=0.28, wheel_x=0.78, wheel_z=1.28, wheel_t=0.19)),
    # 5. wagon — sedan roofline extended FLAT to a vertical tailgate + rails
    ("corva_sw", "dark_green", "car", S(
        L=4.77, W=1.83, floor=0.26, cab_w=1.64, head_y=0.76, tail_y=0.90,
        rails=True,
        lower=[(-2.35, 0.26), (2.35, 0.26), (2.385, 0.58), (2.26, 0.84),
               (0.62, 0.96), (-2.30, 0.96), (-2.385, 0.60)],
        cab=[(0.62, 0.98), (0.08, 1.47), (-2.12, 1.47), (-2.31, 0.98)],
        wheel_r=0.36, wheel_x=0.85, wheel_z=1.42, wheel_t=0.24)),
    # 6. crossover — hatch raised ~15 cm + black arch cladding + rails
    ("arden_x", "white", "car", S(
        L=4.42, W=1.82, floor=0.38, cab_w=1.66, head_y=0.86, tail_y=0.94,
        rails=True, clad=True,
        lower=[(-2.17, 0.38), (2.17, 0.38), (2.21, 0.68), (2.09, 0.92),
               (0.55, 1.04), (-1.85, 1.06), (-2.21, 1.00), (-2.21, 0.64)],
        cab=[(0.55, 1.06), (0.08, 1.63), (-1.48, 1.63), (-1.88, 1.08)],
        wheel_r=0.38, wheel_x=0.85, wheel_z=1.34, wheel_t=0.25)),
    # 7. boxy SUV — slab sides, flat roof, upright pillars, spare on tailgate
    ("kolos", "black", "car", S(
        L=4.72, W=1.90, floor=0.48, cab_w=1.74, head_y=0.98, tail_y=1.02,
        cap_t=0.05, clad=True, running_boards=True, spare=True, fender_pods=True,
        hub=HUB_DARK,
        lower=[(-2.32, 0.48), (2.32, 0.48), (2.36, 0.80), (2.27, 1.08),
               (1.05, 1.12), (-2.32, 1.12), (-2.36, 0.78)],
        cab=[(1.05, 1.14), (0.72, 1.94), (-2.12, 1.94), (-2.32, 1.14)],
        wheel_r=0.40, wheel_x=0.87, wheel_zf=1.45, wheel_zr=1.45, wheel_t=0.27)),
    # 8. luxury sedan — long wheelbase, low fast roofline, big wheels, chrome
    ("corva_l", "midnight_blue", "car", S(
        L=5.05, W=1.90, floor=0.25, cab_w=1.70, head_y=0.78, tail_y=0.86,
        chrome_strip=True, hub=HUB_DARK,
        lower=[(-2.49, 0.25), (2.49, 0.25), (2.525, 0.55), (2.38, 0.82),
               (0.60, 0.98), (-1.42, 0.98), (-2.45, 0.92), (-2.525, 0.56)],
        cab=[(0.60, 1.00), (0.02, 1.45), (-1.02, 1.45), (-1.44, 1.00)],
        wheel_r=0.39, wheel_x=0.88, wheel_z=1.55, wheel_t=0.26)),
    # 9. pickup — cab + open bed gap, high ride
    ("tarpan", "dark_blue", "pickup", S(
        L=5.10, W=1.86, floor=0.42, belt=1.04, cab_w=1.68,
        cab=[(0.60, 1.06), (0.15, 1.80), (-0.72, 1.80), (-1.02, 1.06)],
        wheel_r=0.37, wheel_x=0.85, wheel_zf=1.60, wheel_zr=1.50, wheel_t=0.25)),
    # 10. panel van — cab-forward slab box (white trades fleet)
    ("kargo_v", "white", "van", S(
        L=5.35, W=1.98, floor=0.34, belt=1.14, roof=2.28,
        ws_base=2.58, ws_top=1.55,
        wheel_r=0.35, wheel_x=0.90, wheel_zf=1.68, wheel_zr=1.55, wheel_t=0.26)),
    # 11. minibus — GAZelle-type route van, Sofia yellow
    ("kargo_m", "route_yellow", "minibus", S(
        L=5.50, W=2.02, floor=0.36, belt=1.30, roof=2.12, nose_h=0.96,
        cowl=1.72, ws_top=1.18, cap_h=0.34,
        wheel_r=0.34, wheel_x=0.92, wheel_zf=1.72, wheel_zr=1.55, wheel_t=0.26)),
    # 12. taxi — corva_s reskin: Sofia yellow + roof sign + generic checker
    ("taxi", "taxi_yellow", "car", S(
        L=4.77, W=1.83, floor=0.26, cab_w=1.64, head_y=0.76, tail_y=0.84,
        taxi_kit=True,
        lower=[(-2.35, 0.26), (2.35, 0.26), (2.385, 0.58), (2.26, 0.84),
               (0.62, 0.96), (-1.18, 0.96), (-2.30, 0.90), (-2.385, 0.56)],
        cab=[(0.62, 0.98), (0.08, 1.46), (-0.88, 1.46), (-1.18, 0.98)],
        wheel_r=0.36, wheel_x=0.85, wheel_z=1.42, wheel_t=0.24)),
]

BUILDERS = {"car": build_car, "pickup": build_pickup,
            "van": build_van, "minibus": build_minibus}

made = []          # (name, body, wheels)
tri_counts = {}
for (mname, paint_key, kind, spec) in MODELS:
    body, wheels = BUILDERS[kind](mname, paint(paint_key), spec)
    # tri count (body + wheels)
    tris = 0
    for o in [body] + wheels:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    tri_counts[mname] = tris
    # export this model alone
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    for w in wheels:
        w.select_set(True)
    bpy.context.view_layer.objects.active = body
    glb = os.path.join(out_dir, mname + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=glb, use_selection=True, export_format="GLB",
        export_apply=False, export_yup=True, export_cameras=False,
        export_lights=False, export_materials="EXPORT")
    made.append((mname, body, wheels))
    body.name = "z_%s_body" % mname
    for w in wheels:
        w.name = "z_%s_%s" % (mname, w.name)

# ---------------------------------------------------------------------------
# palettes.json — per-model weighted spawn palettes + fleet mix (R4 digest)
# ---------------------------------------------------------------------------
palettes = {
    "colors": {k: list(v) for (k, v) in PAINTS.items()},
    "globalAmbientWeights": {
        "grey": 18, "white": 18, "silver": 15, "black": 15, "dark_blue": 10,
        "red": 7, "dark_green": 4, "beige": 4, "brown": 3,
        "orange": 2, "teal": 2, "faded_blue": 2,
    },
    "models": {
        "vela_h3": {"archetype": "compact_hatchback", "movingShare": 0.18,
                    "palette": {"silver": 30, "grey": 20, "dark_blue": 18,
                                "red": 16, "black": 16}},
        "pino": {"archetype": "city_hatchback", "movingShare": 0.10,
                 "palette": {"white": 30, "red": 25, "teal": 15,
                             "silver": 20, "orange": 10}},
        "corva_s": {"archetype": "midsize_sedan", "movingShare": 0.14,
                    "palette": {"grey": 28, "black": 22, "dark_blue": 18,
                                "silver": 20, "beige": 12}},
        "dret_90": {"archetype": "oldgen_sedan", "movingShare": 0.08,
                    "palette": {"dark_red": 25, "dark_green": 20, "beige": 20,
                                "silver": 20, "faded_blue": 15}},
        "corva_sw": {"archetype": "wagon", "movingShare": 0.12,
                     "palette": {"dark_green": 25, "grey": 22, "dark_blue": 20,
                                 "silver": 20, "brown": 13}},
        "arden_x": {"archetype": "crossover", "movingShare": 0.14,
                    "palette": {"white": 28, "grey": 24, "brown": 16,
                                "dark_red": 16, "black": 16}},
        "kolos": {"archetype": "boxy_suv", "movingShare": 0.06,
                  "palette": {"black": 50, "dark_grey": 30, "white": 20}},
        "corva_l": {"archetype": "luxury_sedan", "movingShare": 0.02,
                    "palette": {"black": 45, "dark_grey": 30,
                                "midnight_blue": 25}},
        "tarpan": {"archetype": "pickup", "movingShare": 0.02,
                   "palette": {"white": 35, "dark_blue": 25, "red": 20,
                               "grey": 20}},
        "kargo_v": {"archetype": "panel_van", "movingShare": 0.07,
                    "palette": {"white": 70, "grey": 15, "dark_blue": 15}},
        "kargo_m": {"archetype": "minibus", "movingShare": 0.03,
                    "palette": {"route_yellow": 70, "white": 20, "grey": 10}},
        "taxi": {"archetype": "taxi", "movingShare": 0.04,
                 "palette": {"taxi_yellow": 90, "dark_green": 10}},
    },
    "notes": ("Parked-car spawns: shift +10% toward vela_h3/corva_s/dret_90. "
              "Wheel hub tint (silver vs dark) may be randomized per instance. "
              "Weights from Axalta 2025 EU adjusted for the ~19-yr-old BG parc."),
}
with open(os.path.join(out_dir, "palettes.json"), "w", encoding="utf-8") as f:
    json.dump(palettes, f, indent=2)

# ---------------------------------------------------------------------------
# Contact sheet — 4 x 3 grid on a plaza under the sim HDRI, labelled
# ---------------------------------------------------------------------------
COLS = 4
SPX, SPY = 7.0, 6.6
positions = {}
for i, (mname, body, wheels) in enumerate(made):
    cxo = (i % COLS - (COLS - 1) / 2) * SPX
    cyo = (i // COLS - 1) * SPY
    body.location = (cxo, cyo, 0.0)
    # varied yaw: natural lineup + avoids every windshield catching the same
    # dead-on sun mirror flash
    body.rotation_euler = (0, 0, math.radians(-14 + (i * 9) % 30))
    positions[mname] = (cxo, cyo)

# ground
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
bpy.context.active_object.data.materials.append(
    mat("plaza", (0.05, 0.055, 0.06), rough=0.4))

# labels (render-only; exports already happened)
label_mat = mat("label", (0.9, 0.9, 0.9), rough=0.8)
for (mname, body, wheels) in made:
    cxo, cyo = positions[mname]
    crv = bpy.data.curves.new("lbl_%s" % mname, type="FONT")
    crv.body = mname
    crv.size = 0.62
    crv.align_x = "CENTER"
    txt = bpy.data.objects.new("lbl_%s" % mname, crv)
    txt.location = (cxo, cyo - 3.4, 0.03)
    txt.rotation_euler = (math.radians(35), 0, 0)
    txt.data.materials.append(label_mat)
    bpy.context.collection.objects.link(txt)

# HDRI world
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
tgt.location = (0, 0, 0.9)
bpy.context.collection.objects.link(tgt)
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 35
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (15.0, -27.0, 15.5)
con = cam.constraints.new("TRACK_TO")
con.target = tgt
con.track_axis = "TRACK_NEGATIVE_Z"
con.up_axis = "UP_Y"
bpy.context.scene.camera = cam

sc = bpy.context.scene
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
sc.render.resolution_x = 1920
sc.render.resolution_y = 1200
try:
    sc.view_settings.view_transform = "AgX"
except Exception:
    sc.view_settings.view_transform = "Filmic"
sc.render.filepath = PREVIEW
sc.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)

# rear-quarter sheet (tail cues: hatch cut / wagon gate / trunk deck / spare)
cam.location = (-16.0, 26.0, 15.0)
sc.render.filepath = PREVIEW_REAR
bpy.ops.render.render(write_still=True)

# ---------------------------------------------------------------------------
# report
# ---------------------------------------------------------------------------
total = 0
for (mname, _, _) in made:
    p = os.path.join(out_dir, mname + ".glb")
    sz = os.path.getsize(p) if os.path.exists(p) else 0
    total += sz
    print("FLEET_V2_MODEL %-9s tris=%-5d raw_glb_bytes=%d" %
          (mname, tri_counts[mname], sz))
print("FLEET_V2_OK count=%d total_raw_glb_bytes=%d out=%s preview=%s" %
      (len(made), total, out_dir, PREVIEW))
