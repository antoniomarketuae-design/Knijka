"""
Low-poly VEHICLE KIT generator (headless Blender) for the Книжка.AI simulator.

Replaces the interim box-primitive traffic cars (platform/src/modules/sim/traffic/
TrafficLayer.tsx) with clean, game-ready low-poly GLBs: sedan, SUV, hatchback,
delivery van, and a police car. Each has a shaped hull, a glazed greenhouse,
emissive head/tail lights, and — CRUCIALLY — four SEPARATE wheel nodes so the
sim can roll them from speed and steer the front pair (see TrafficLayer's wheel
loop). Several civilian paint colours are emitted for variety.

    blender --background --python tools/blender/vehicles.py -- <out_dir>

ADR-001 (HARD RULE): all vehicles are FICTIONAL. No real car brands, logos, or
real police insignia — generic body shapes plus an INVENTED blue/white police
livery + a generic emissive roof lightbar only.

Coordinate contract (matches TrafficLayer.tsx local space):
  glTF/three space  X = right, Y = up, Z = nose-forward, ground at Y = 0.
All part geometry below is authored directly in that space; box_g/prism_g convert
to Blender's Z-up convention, and export_yup=True converts back — the two cancel,
so the final GLB lands exactly in the intended nose-+Z / Y-up frame.

Wheel nodes are named wheel_FL / wheel_FR / wheel_RL / wheel_RR
  F = front (+Z),  R = rear (-Z),  L = +X side,  R = -X side.
Each wheel's mesh is centred on its own origin (the hub) with its spin axis on
local X (lateral) — so the sim rotates the node about local X to roll it, and
adds yaw to the front pair to steer. The body mesh is the parent node.
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
    out_dir = os.path.join(os.path.expanduser("~"), "vehicle-kit-out")
os.makedirs(out_dir, exist_ok=True)

HDRI = "E:/AI driver/platform/public/sim/env/sky_urban_1k.hdr"
PREVIEW = "E:/AI driver/tools/blender/previews/vehicle_kit.png"
os.makedirs(os.path.dirname(PREVIEW), exist_ok=True)


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


# Shared (non-paint) materials. Opaque dark "glass": a smooth, slightly metallic
# near-black tint reads as tinted glazing and reflects the HDRI sky — chosen over
# alpha-blended glass to avoid transparency-sort cost when instanced on phones.
GLASS = mat("glass", (0.015, 0.02, 0.03), rough=0.06, metal=0.65, coat=0.7)
TIRE = mat("tire", (0.016, 0.016, 0.02), rough=0.85, metal=0.0)
HUB = mat("hubcap", (0.40, 0.42, 0.46), rough=0.30, metal=0.9)
TRIM = mat("trim", (0.02, 0.02, 0.025), rough=0.55, metal=0.4)   # bumpers/grille
HEAD = mat("headlight", (0.85, 0.85, 0.82), rough=0.15,
           emit=(1.0, 0.95, 0.82), emit_strength=2.6)
TAIL = mat("taillight", (0.35, 0.02, 0.02), rough=0.2,
           emit=(1.0, 0.06, 0.03), emit_strength=2.4)
BAR_RED = mat("lightbar_red", (0.4, 0.02, 0.02), rough=0.2,
              emit=(1.0, 0.03, 0.02), emit_strength=7.0)
BAR_BLUE = mat("lightbar_blue", (0.02, 0.06, 0.4), rough=0.2,
               emit=(0.06, 0.18, 1.0), emit_strength=7.0)

# Civilian paint palette (linear RGB, glossy-ish clearcoat).
PAINTS = {
    "steel_blue": (0.05, 0.10, 0.22),
    "silver":     (0.32, 0.34, 0.37),
    "maroon":     (0.20, 0.03, 0.03),
    "slate":      (0.05, 0.07, 0.09),
    "sand":       (0.44, 0.35, 0.20),
    "green":      (0.04, 0.13, 0.06),
    "red":        (0.38, 0.03, 0.02),
    "white":      (0.72, 0.72, 0.73),
    "police_white": (0.78, 0.79, 0.80),
    "police_blue":  (0.02, 0.05, 0.30),
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
        # center+size in glTF space -> Blender (swap Y/Z, negate Z->Y)
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


def build_wheel(name, R, thick, seg=12):
    """A tire cylinder with its spin axis on local X, centred on its origin."""
    bm = bmesh.new()
    ring_n, ring_p = [], []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        y, z = R * math.cos(a), R * math.sin(a)
        ring_n.append(bm.verts.new((-thick / 2, y, z)))
        ring_p.append(bm.verts.new((thick / 2, y, z)))
    tread = []
    for k in range(seg):
        j = (k + 1) % seg
        tread.append(bm.faces.new([ring_n[k], ring_n[j], ring_p[j], ring_p[k]]))
    cap_n = bm.faces.new(list(reversed(ring_n)))
    cap_p = bm.faces.new(ring_p)
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(TIRE)   # slot 0
    obj.data.materials.append(HUB)    # slot 1
    # Recompute face material indices on the real mesh (bmesh face refs are gone):
    for poly in obj.data.polygons:
        # side treads have 4 verts spanning both rings; caps are the n-gons.
        poly.material_index = 1 if len(poly.vertices) > 4 else 0
    bpy.context.collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------------------
# Car builder (sedan / suv / hatchback / police share this parametric body)
# ---------------------------------------------------------------------------
def build_car(name, body_mat, spec, livery=None, lightbar=False):
    """
    spec keys:
      L, W        overall length / body width
      floor       body underside height
      belt        beltline (greenhouse sill) height
      roof        roof height
      cab_z0/z1   greenhouse rear/front z (windshield base .. backlight base)
      roof_z0/z1  roof panel rear/front z
      cab_w       greenhouse width
      wheel_r, wheel_x, wheel_z, wheel_t
      hood_drop   how far the hood/trunk dip below the beltline
    """
    L, W = spec["L"], spec["W"]
    floor, belt, roof = spec["floor"], spec["belt"], spec["roof"]
    hd = spec.get("hood_drop", 0.12)
    hw = W / 2
    zf, zr = L / 2, -L / 2

    b = Builder()

    # --- lower body: extruded side silhouette (hood slope, beltline, tail) ---
    hood_y = belt - hd
    lower = [
        (zr + 0.02, floor),           # rear bottom
        (zf - 0.02, floor),           # front bottom
        (zf - 0.02, floor + 0.30),    # front bumper top
        (zf - 0.10, hood_y),          # hood nose
        (spec["cab_z1"], belt),       # cowl / windshield base
        (spec["cab_z0"], belt),       # rear beltline / backlight base
        (zr + 0.14, belt - 0.06),     # trunk/hatch lid
        (zr + 0.02, hood_y - 0.02),   # rear panel
    ]
    b.prism_g(lower, -hw, hw, body_mat)

    # --- greenhouse glazing: raked trapezoid prism ---
    cab = [
        (spec["cab_z1"], belt + 0.02),   # windshield base
        (spec["cab_z0"], belt + 0.02),   # backlight base
        (spec["roof_z0"], roof),         # roof rear
        (spec["roof_z1"], roof),         # roof front
    ]
    cw = spec["cab_w"] / 2
    b.prism_g(cab, -cw, cw, GLASS)

    # --- roof panel (body paint, two-tone cap over the glass) ---
    roof_zc = (spec["roof_z0"] + spec["roof_z1"]) / 2
    roof_len = abs(spec["roof_z1"] - spec["roof_z0"]) + 0.06
    b.box_g(0, roof + 0.015, roof_zc, cw * 2 + 0.04, 0.06, roof_len, body_mat)

    # --- optional livery panels (police): side band + hood/roof accents ---
    if livery is not None:
        band_y = (floor + belt) / 2 + 0.02
        band_h = (belt - floor) * 0.62
        for sx in (hw - 0.005, -hw + 0.005):
            b.box_g(sx, band_y, -0.05, 0.02, band_h, L * 0.72, livery)
        # blue hood + trunk accents
        b.box_g(0, hood_y + 0.005, zf - 0.55, W * 0.6, 0.03, 0.9, livery)
        b.box_g(0, belt - 0.02, zr + 0.5, W * 0.55, 0.03, 0.7, livery)

    # --- bumpers / grille trim ---
    b.box_g(0, floor + 0.18, zf - 0.03, W * 0.9, 0.20, 0.10, TRIM)
    b.box_g(0, floor + 0.18, zr + 0.03, W * 0.9, 0.20, 0.10, TRIM)
    b.box_g(0, hood_y - 0.02, zf - 0.06, W * 0.5, 0.14, 0.06, TRIM)  # grille

    # --- lights ---
    for sx in (0.62, -0.62):
        b.box_g(sx * (W / 1.76), belt - hd + 0.02, zf - 0.05, 0.30, 0.16, 0.05, HEAD)
        b.box_g(sx * (W / 1.76), belt - 0.06, zr + 0.05, 0.32, 0.18, 0.05, TAIL)

    # --- roof lightbar (police only) — generic two-tone emissive bar ---
    if lightbar:
        b.box_g(0, roof + 0.07, roof_zc + 0.15, 1.10, 0.12, 0.36, TRIM)
        b.box_g(-0.28, roof + 0.15, roof_zc + 0.15, 0.50, 0.14, 0.32, BAR_RED)
        b.box_g(0.28, roof + 0.15, roof_zc + 0.15, 0.50, 0.14, 0.32, BAR_BLUE)

    body = b.finalize(name)

    # --- wheels: four separate nodes, parented to the body ---
    R, wx, wz, wt = spec["wheel_r"], spec["wheel_x"], spec["wheel_z"], spec["wheel_t"]
    wheels = []
    for (wn, gx, gz) in (("wheel_FL", wx, wz), ("wheel_FR", -wx, wz),
                         ("wheel_RL", wx, -wz), ("wheel_RR", -wx, -wz)):
        w = build_wheel(wn, R, wt)
        # glTF hub (gx, R, gz) -> Blender (gx, -gz, R)
        w.location = (gx, -gz, R)
        w.parent = body
        w.matrix_parent_inverse = body.matrix_world.inverted()
        wheels.append(w)
    return body, wheels


# ---------------------------------------------------------------------------
# Delivery van — boxier, built mostly from boxes + a raked windshield
# ---------------------------------------------------------------------------
def build_van(name, body_mat, spec):
    L, W = spec["L"], spec["W"]
    hw = W / 2
    zf, zr = L / 2, -L / 2
    floor = spec["floor"]
    cargo_top = spec["roof"]
    hood_top = spec["hood_top"]
    cab_front = spec["cab_front"]     # z where windshield base sits (top of hood)
    cab_back = spec["cab_back"]       # z where cab meets cargo box

    b = Builder()
    # cargo box (main mass)
    b.box_g(0, (floor + cargo_top) / 2, (zr + cab_back) / 2,
            W, cargo_top - floor, cab_back - zr, body_mat)
    # cab lower (under windshield, between hood and cargo)
    b.box_g(0, (floor + hood_top) / 2, (cab_front + cab_back) / 2,
            W, hood_top - floor, cab_front - cab_back, body_mat)
    # short hood
    b.box_g(0, (floor + hood_top) / 2 - 0.03, (cab_front + zf) / 2,
            W * 0.98, hood_top - floor - 0.06, zf - cab_front, body_mat)
    # cab roof cap
    b.box_g(0, cargo_top - 0.02, (cab_front + cab_back) / 2 - 0.05,
            W - 0.04, 0.06, (cab_front - cab_back) + 0.1, body_mat)
    # windshield (raked glass slab)
    wind = [
        (cab_front, hood_top),
        (cab_back + 0.02, cargo_top - 0.05),
        (cab_back - 0.06, cargo_top - 0.05),
        (cab_front - 0.08, hood_top),
    ]
    b.prism_g(wind, -(hw - 0.06), (hw - 0.06), GLASS)
    # cab side windows
    for sx in (hw - 0.005, -hw + 0.005):
        b.box_g(sx, (hood_top + cargo_top) / 2 + 0.05,
                (cab_front + cab_back) / 2 - 0.02, 0.02,
                (cargo_top - hood_top) * 0.7, (cab_front - cab_back) * 0.7, GLASS)
    # bumpers / grille / lights
    b.box_g(0, floor + 0.22, zf - 0.03, W * 0.92, 0.24, 0.10, TRIM)
    b.box_g(0, floor + 0.22, zr + 0.03, W * 0.92, 0.24, 0.10, TRIM)
    b.box_g(0, hood_top - 0.10, zf - 0.06, W * 0.55, 0.16, 0.06, TRIM)
    for sx in (0.68, -0.68):
        b.box_g(sx, hood_top - 0.06, zf - 0.05, 0.30, 0.18, 0.05, HEAD)
        b.box_g(sx, floor + 0.9, zr + 0.05, 0.26, 0.55, 0.05, TAIL)
    body = b.finalize(name)

    R, wx, wz, wt = spec["wheel_r"], spec["wheel_x"], spec["wheel_z"], spec["wheel_t"]
    wheels = []
    for (wn, gx, gz) in (("wheel_FL", wx, wz), ("wheel_FR", -wx, wz),
                         ("wheel_RL", wx, -wz), ("wheel_RR", -wx, -wz)):
        w = build_wheel(wn, R, wt)
        w.location = (gx, -gz, R)
        w.parent = body
        w.matrix_parent_inverse = body.matrix_world.inverted()
        wheels.append(w)
    return body, wheels


# ---------------------------------------------------------------------------
# Kit specs
# ---------------------------------------------------------------------------
SEDAN = dict(L=4.1, W=1.76, floor=0.30, belt=0.90, roof=1.34,
             cab_z1=0.82, cab_z0=-1.05, roof_z1=0.18, roof_z0=-0.78, cab_w=1.60,
             wheel_r=0.32, wheel_x=0.80, wheel_z=1.32, wheel_t=0.22, hood_drop=0.14)

SUV = dict(L=4.34, W=1.88, floor=0.44, belt=1.06, roof=1.66,
           cab_z1=0.86, cab_z0=-1.30, roof_z1=0.40, roof_z0=-1.20, cab_w=1.70,
           wheel_r=0.39, wheel_x=0.87, wheel_z=1.45, wheel_t=0.26, hood_drop=0.14)

HATCH = dict(L=3.86, W=1.72, floor=0.29, belt=0.88, roof=1.36,
             cab_z1=0.78, cab_z0=-1.10, roof_z1=0.10, roof_z0=-1.02, cab_w=1.56,
             wheel_r=0.31, wheel_x=0.78, wheel_z=1.26, wheel_t=0.22, hood_drop=0.12)

POLICE = dict(SEDAN)  # same chassis; livery + lightbar added

VAN = dict(L=5.0, W=1.96, floor=0.40, roof=2.12, hood_top=0.98,
           cab_front=1.55, cab_back=1.02,
           wheel_r=0.37, wheel_x=0.92, wheel_z=1.72, wheel_t=0.26)

# (file base name, kind, spec, paint-key, extra)
KIT = [
    ("sedan",         "car", SEDAN, "steel_blue", {}),
    ("sedan_silver",  "car", SEDAN, "silver", {}),
    ("sedan_maroon",  "car", SEDAN, "maroon", {}),
    ("suv",           "car", SUV,   "slate", {}),
    ("suv_sand",      "car", SUV,   "sand", {}),
    ("hatchback",     "car", HATCH, "green", {}),
    ("hatchback_red", "car", HATCH, "red", {}),
    ("van",           "van", VAN,   "white", {}),
    ("police",        "car", POLICE, "police_white",
     dict(livery="police_blue", lightbar=True)),
]

made = []   # (name, body, wheels)
for (fname, kind, spec, paint_key, extra) in KIT:
    body_mat = paint(paint_key)
    if kind == "van":
        body, wheels = build_van(fname, body_mat, spec)
    else:
        livery = paint(extra["livery"]) if extra.get("livery") else None
        body, wheels = build_car(fname, body_mat, spec,
                                  livery=livery, lightbar=extra.get("lightbar", False))
    # export immediately (names are clean: body=<fname>, wheels=wheel_FL..RR)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    for w in wheels:
        w.select_set(True)
    bpy.context.view_layer.objects.active = body
    glb = os.path.join(out_dir, fname + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=glb, use_selection=True, export_format="GLB",
        export_apply=False, export_yup=True, export_cameras=False,
        export_lights=False, export_materials="EXPORT")
    made.append((fname, body, wheels))
    # rename so the next car can reuse the clean wheel names without .001 suffixes
    body.name = "z_%s_body" % fname
    for w in wheels:
        w.name = "z_%s_%s" % (fname, w.name)

# ---------------------------------------------------------------------------
# Contact-sheet render — arrange kit on a plaza under the sim HDRI
# ---------------------------------------------------------------------------
COLS = 3
SPX, SPY = 6.4, 5.6
for i, (fname, body, wheels) in enumerate(made):
    cxo = (i % COLS - (COLS - 1) / 2) * SPX
    cyo = (i // COLS - (len(made) // COLS - 1) / 2) * SPY
    body.location = (cxo, cyo, 0.0)   # children (wheels) follow

# ground
bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, 0))
bpy.context.active_object.data.materials.append(
    mat("plaza", (0.05, 0.055, 0.06), rough=0.4))

# HDRI world
world = bpy.data.worlds.new("sky")
world.use_nodes = True
bpy.context.scene.world = world
nt = world.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
out = nt.nodes.new("ShaderNodeOutputWorld")
bg = nt.nodes.new("ShaderNodeBackground")
try:
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(HDRI)
    nt.links.new(env.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 1.1
except Exception:
    bg.inputs[0].default_value = (0.85, 0.88, 0.95, 1.0)
nt.links.new(bg.outputs[0], out.inputs[0])

sun_data = bpy.data.lights.new("sun", type="SUN")
sun_data.energy = 3.2
sun_data.color = (1.0, 0.95, 0.85)
sun = bpy.data.objects.new("sun", sun_data)
bpy.context.collection.objects.link(sun)
sun.rotation_euler = (math.radians(58), math.radians(12), math.radians(-50))

tgt = bpy.data.objects.new("target", None)
tgt.location = (0, 0, 0.7)
bpy.context.collection.objects.link(tgt)
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 33
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (11.0, -21.0, 14.0)
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
sc.render.resolution_x = 1600
sc.render.resolution_y = 1000
try:
    sc.view_settings.view_transform = "AgX"
except Exception:
    sc.view_settings.view_transform = "Filmic"
sc.render.filepath = PREVIEW
sc.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)

total = 0
for (fname, _, _) in made:
    p = os.path.join(out_dir, fname + ".glb")
    if os.path.exists(p):
        total += os.path.getsize(p)
print("VEHICLE_KIT_OK count=%d total_raw_glb_bytes=%d out=%s preview=%s" %
      (len(made), total, out_dir, PREVIEW))
