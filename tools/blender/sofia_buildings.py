"""
Sofia residential building-kit generator (headless Blender).

Generates a small kit of Sofia-appropriate low-poly buildings — панелка concrete
slabs and plastered co-op mid-rises (with ground-floor retail variants) — with
BAKED geometry detail (window grids, balconies, floor string-courses, cornices,
roof parapets) and PBR-ish materials incl. a lit-window emissive set for night.
Exports one GLB per building and renders a day contact-sheet PNG so we can judge
the result without the browser.

    blender --background --python tools/blender/sofia_buildings.py -- <out_dir>

Design intent (docs/simulation/66 §3): NOT western glass towers — modest
plaster/concrete residential blocks, regular fenestration, balconies, weathered
warm/cool palette. This is v1: geometry + materials nailed here first, sim
wiring (loader/material swap) comes after.
"""

import bpy
import bmesh
import sys
import os
import math

# ---- output dir (arg after `--`) -------------------------------------------
argv = sys.argv
out_dir = None
if "--" in argv:
    extra = argv[argv.index("--") + 1:]
    if extra:
        out_dir = extra[0]
if not out_dir:
    out_dir = os.path.join(os.path.expanduser("~"), "sofia-buildings-out")
os.makedirs(out_dir, exist_ok=True)

FLOOR_H = 2.9
COL_W = 3.3          # facade module width per window column
WIN_W = 1.5
WIN_H = 1.55
SILL = 0.95          # sill height above each floor


# ---- scene reset ------------------------------------------------------------
def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for item in list(coll):
            coll.remove(item)


# ---- materials (cached by name) --------------------------------------------
_mats = {}


def mat(name, rgb, rough=0.85, metal=0.0, emit=None, emit_strength=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit is not None:
        b.inputs["Emission Color"].default_value = (emit[0], emit[1], emit[2], 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    _mats[name] = m
    return m


# Palettes ----------------------------------------------------------------
PANELKA_FACADE = [
    ("panelka_beige", (0.76, 0.70, 0.58)),
    ("panelka_grey", (0.60, 0.63, 0.67)),
    ("panelka_bluewash", (0.55, 0.66, 0.73)),  # renovated pale blue (common in Sofia)
    ("panelka_sand", (0.82, 0.73, 0.54)),
]
COOP_FACADE = [
    ("coop_ochre", (0.86, 0.63, 0.30)),
    ("coop_terracotta", (0.78, 0.44, 0.35)),
    ("coop_sage", (0.56, 0.70, 0.53)),
    ("coop_cream", (0.90, 0.83, 0.60)),
    ("coop_rose", (0.82, 0.57, 0.55)),
]
GLASS = ("window_glass", (0.09, 0.12, 0.15))
GLASS_LIT = ("window_lit", (0.06, 0.07, 0.08))
LIT_EMIT = (1.0, 0.82, 0.52)
FRAME = ("window_frame", (0.88, 0.88, 0.85))
CONCRETE = ("concrete", (0.66, 0.64, 0.60))
RAIL = ("balcony_rail", (0.55, 0.54, 0.52))
ROOF = ("roof_dark", (0.19, 0.19, 0.21))
BASE_TRIM = ("base_trim", (0.44, 0.43, 0.42))
SHOP_GLASS = ("shop_glass", (0.10, 0.14, 0.16))


# ---- geometry builder (one bmesh per building, face material_index) --------
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

    def box(self, cx, cy, cz, sx, sy, sz, material):
        mi = self._mi(material)
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        c = [
            (cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
            (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
            (cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz),
            (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz),
        ]
        v = [self.bm.verts.new(p) for p in c]
        faces = [
            (0, 3, 2, 1),  # bottom
            (4, 5, 6, 7),  # top
            (0, 1, 5, 4),  # -Y (south)
            (2, 3, 7, 6),  # +Y (north)
            (1, 2, 6, 5),  # +X (east)
            (0, 4, 7, 3),  # -X (west)
        ]
        for f in faces:
            face = self.bm.faces.new([v[i] for i in f])
            face.material_index = mi

    def quad_y(self, cx, cy, cz, w, h, material, facing=1):
        """A single quad in the XZ plane at y=cy, normal ±Y."""
        mi = self._mi(material)
        hw, hh = w / 2, h / 2
        if facing >= 0:
            pts = [(cx - hw, cy, cz - hh), (cx + hw, cy, cz - hh),
                   (cx + hw, cy, cz + hh), (cx - hw, cy, cz + hh)]
        else:
            pts = [(cx + hw, cy, cz - hh), (cx - hw, cy, cz - hh),
                   (cx - hw, cy, cz + hh), (cx + hw, cy, cz + hh)]
        v = [self.bm.verts.new(p) for p in pts]
        self.bm.faces.new(v).material_index = mi

    def finalize(self, name):
        mesh = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(name, mesh)
        for m in self.slots:
            obj.data.materials.append(m)
        bpy.context.collection.objects.link(obj)
        return obj


def lit_seed(col, floor, key):
    """Deterministic 'is this window lit' — ~35% warm, clustered by floor."""
    return ((col * 7 + floor * 13 + key * 31) % 100) < 35


def make_building(name, style, floors, cols, palette_idx, key=0):
    b = Builder()
    W = cols * COL_W
    H = floors * FLOOR_H
    D = 11.0 if style == "panelka" else 12.5
    front = D / 2

    facade_name, facade_rgb = (PANELKA_FACADE if style == "panelka" else COOP_FACADE)[
        palette_idx % (len(PANELKA_FACADE) if style == "panelka" else len(COOP_FACADE))
    ]
    facade = mat(facade_name, facade_rgb, rough=0.9 if style == "panelka" else 0.82)
    glass = mat(*GLASS, rough=0.08, metal=0.25)
    glass_lit = mat(*GLASS_LIT, rough=0.2, emit=LIT_EMIT, emit_strength=2.6)
    frame = mat(*FRAME, rough=0.7)
    concrete = mat(*CONCRETE, rough=0.9)
    rail = mat(*RAIL, rough=0.8, metal=0.1)
    roof = mat(*ROOF, rough=0.7)
    base_trim = mat(*BASE_TRIM, rough=0.85)
    shop = mat(*SHOP_GLASS, rough=0.06, metal=0.35)

    # main slab
    b.box(0, 0, H / 2, W, D, H, facade)
    # ground-floor plinth trim
    b.box(0, 0, 0.35, W, D + 0.06, 0.7, base_trim)

    ground_retail = style == "retail"
    x0 = -W / 2 + COL_W / 2

    for floor in range(floors):
        z_floor = floor * FLOOR_H
        is_ground = floor == 0
        for col in range(cols):
            cx = x0 + col * COL_W
            if is_ground and ground_retail:
                # shopfront glazing band
                b.quad_y(cx, front + 0.02, z_floor + 1.3, COL_W - 0.35, 2.1, shop, 1)
                b.quad_y(cx, -front - 0.02, z_floor + 1.3, COL_W - 0.35, 2.1, glass, -1)
                continue
            zc = z_floor + SILL + WIN_H / 2
            lit = (not is_ground) and lit_seed(col, floor, key)
            g = glass_lit if lit else glass
            # window on +Y (front): frame quad behind, glass proud
            b.quad_y(cx, front + 0.015, zc, WIN_W + 0.18, WIN_H + 0.18, frame, 1)
            b.quad_y(cx, front + 0.03, zc, WIN_W, WIN_H, g, 1)
            # window on -Y (back)
            b.quad_y(cx, -front - 0.015, zc, WIN_W + 0.18, WIN_H + 0.18, frame, -1)
            b.quad_y(cx, -front - 0.03, zc, WIN_W, WIN_H, glass, -1)

            # panelka balconies: protruding slab on ~half the upper-floor cells
            if style == "panelka" and not is_ground and (col + floor) % 2 == 0:
                bw = COL_W - 0.15
                dep = 1.5
                by = front + dep / 2
                b.box(cx, by, z_floor + 0.12, bw, dep, 0.2, concrete)          # floor slab
                b.box(cx, front + dep, z_floor + 0.62, bw, 0.1, 1.0, rail)      # rail front
                b.box(cx - bw / 2, by, z_floor + 0.62, 0.1, dep, 1.0, rail)     # rail left
                b.box(cx + bw / 2, by, z_floor + 0.62, 0.1, dep, 1.0, rail)     # rail right

        # co-op string-course between floors
        if style in ("coop", "retail") and floor > 0:
            b.box(0, 0, z_floor, W + 0.12, D + 0.12, 0.16, base_trim)

    # roof: cornice/parapet + dark cap
    if style in ("coop", "retail"):
        b.box(0, 0, H + 0.12, W + 0.35, D + 0.35, 0.35, base_trim)  # cornice
    b.box(0, 0, H + 0.35, W - 0.2, D - 0.2, 0.7, concrete)          # parapet wall (hollow-ish read)
    b.box(0, 0, H + 0.3, W - 1.0, D - 1.0, 0.5, roof)               # roof deck

    return b.finalize(name)


# ---- world + camera + render -----------------------------------------------
def setup_world_and_render(png_path, width=1400, height=680):
    # Sky world
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    bpy.context.scene.world = world
    nt = world.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    try:
        sky = nt.nodes.new("ShaderNodeTexSky")
        sky.sky_type = "NISHITA"
        sky.sun_elevation = math.radians(38)
        sky.sun_rotation = math.radians(50)
        nt.links.new(sky.outputs[0], bg.inputs[0])
    except Exception:
        bg.inputs[0].default_value = (0.5, 0.6, 0.75, 1.0)
    bg.inputs[1].default_value = 1.0
    nt.links.new(bg.outputs[0], out.inputs[0])

    # sun
    sun_data = bpy.data.lights.new("sun", type="SUN")
    sun_data.energy = 3.0
    sun_data.angle = math.radians(1.5)
    sun = bpy.data.objects.new("sun", sun_data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(52), math.radians(12), math.radians(140))

    # ground
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
    g = bpy.context.active_object
    g.data.materials.append(mat("tarmac", (0.09, 0.09, 0.10), rough=0.95))

    # aim target at the grid centre, elevated
    tgt = bpy.data.objects.new("target", None)
    tgt.location = (0, 0, 9)
    bpy.context.collection.objects.link(tgt)

    # camera — elevated 3/4 view framing the whole grid
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 40
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (62, -82, 56)
    con = cam.constraints.new("TRACK_TO")
    con.target = tgt
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    bpy.context.scene.camera = cam

    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = eng
            break
        except Exception:
            continue
    try:
        sc.eevee.taa_render_samples = 24
    except Exception:
        pass
    sc.render.resolution_x = width
    sc.render.resolution_y = height
    sc.render.film_transparent = False
    try:
        sc.view_settings.view_transform = "Filmic"
    except Exception:
        sc.view_settings.view_transform = "Standard"
    sc.view_settings.exposure = -0.5  # richer, less-washed facade colour
    sc.render.filepath = png_path
    sc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)


# ---- generate the kit -------------------------------------------------------
reset_scene()

KIT = [
    ("sofia_panelka_8", "panelka", 8, 6, 0),
    ("sofia_panelka_5", "panelka", 5, 5, 1),
    ("sofia_panelka_10", "panelka", 10, 5, 2),
    ("sofia_coop_5", "coop", 5, 4, 0),
    ("sofia_coop_6", "coop", 6, 5, 1),
    ("sofia_retail_5", "retail", 5, 5, 2),
    ("sofia_retail_4", "retail", 4, 6, 3),
    ("sofia_coop_7", "coop", 7, 4, 4),
]

made = []
for i, (name, style, floors, cols, pal) in enumerate(KIT):
    obj = make_building(name, style, floors, cols, pal, key=i + 1)
    made.append((name, obj))

# export each individually (origin at footprint centre, base z=0)
for name, obj in made:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    path = os.path.join(out_dir, name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        use_selection=True,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )

# lay the kit out in a 4×2 grid for the contact sheet
COLS = 4
CELL_X = 28.0
CELL_Y = 32.0
for i, (name, obj) in enumerate(made):
    col = i % COLS
    row = i // COLS
    obj.location = ((col - (COLS - 1) / 2) * CELL_X, (row - 0.5) * CELL_Y, 0)

setup_world_and_render(os.path.join(out_dir, "sofia_kit_preview.png"), width=1500, height=900)

total = sum(os.path.getsize(os.path.join(out_dir, n + ".glb")) for n, _ in made)
print(f"SOFIA_KIT_OK buildings={len(made)} total_glb_bytes={total} out={out_dir}")
