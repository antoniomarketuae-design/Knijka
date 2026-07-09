"""
Modern glass-tower CITY KIT generator (headless Blender).

Scales the proven hero_tower prototype into a varied kit of modern curtain-wall
high-rises — offices, residential, twin sets — across heights, footprints, glass
tints, and crown types (setback+spire / flat parapet / stepped). Exports one GLB
per tower (for the sim's instanced building pipeline) + an EEVEE contact-sheet
render against the sim's real HDRI so we can judge the variety.

    blender --background --python tools/blender/glass_city_kit.py -- <out_dir>
"""

import bpy
import bmesh
import sys
import os
import math

argv = sys.argv
out_dir = None
if "--" in argv:
    extra = argv[argv.index("--") + 1:]
    if extra:
        out_dir = extra[0]
if not out_dir:
    out_dir = os.path.join(os.path.expanduser("~"), "glass-kit-out")
os.makedirs(out_dir, exist_ok=True)

HDRI = "E:/AI driver/platform/public/sim/env/sky_urban_1k.hdr"
FLOOR_H = 3.7
COL_W = 3.4


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for item in list(coll):
            coll.remove(item)


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
        c = [(cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
             (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
             (cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz),
             (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz)]
        v = [self.bm.verts.new(p) for p in c]
        for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]:
            self.bm.faces.new([v[i] for i in f]).material_index = mi

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


TINTS = {
    "blue": (0.02, 0.035, 0.06),
    "bronze": (0.06, 0.045, 0.03),
    "grey": (0.04, 0.045, 0.05),
    "silver": (0.10, 0.12, 0.14),
    "teal": (0.02, 0.05, 0.055),
}


def lit(col, floor, key):
    return ((col * 5 + floor * 11 + key * 17) % 100) < 20


def tower(name, floors, cx_cols, cy_cols, tint="blue", crown="flat", podium=3, key=1, office=False):
    b = Builder()
    W = cx_cols * COL_W
    D = cy_cols * COL_W
    Hbase = podium * FLOOR_H

    glass = mat("glass_%s" % tint, TINTS[tint], rough=0.05, metal=0.0, coat=0.6)
    glass_lit = mat("glass_lit", (0.05, 0.05, 0.06), rough=0.14, emit=(1.0, 0.80, 0.50), emit_strength=2.4)
    mullion = mat("mullion", (0.52, 0.54, 0.56), rough=0.35, metal=0.9)
    spandrel = mat("spandrel_%s" % tint, tuple(v * 0.7 for v in TINTS[tint]), rough=0.28, metal=0.3)
    stone = mat("stone", (0.72, 0.69, 0.63), rough=0.6)
    # Merge to keep material groups low (each group = an InstancedMesh per chunk
    # in the sim). Retail glazing reuses the tower glass; the crown reuses the
    # mullion metal. → 5 groups/tower (glass, glass_lit, mullion, spandrel, stone).
    retail = glass
    crown_m = mullion

    pw, pd = W + 2.0, D + 2.0
    b.box(0, 0, Hbase / 2, pw, pd, Hbase, stone)
    b.box(0, pd / 2 + 0.02, 2.0, pw - 1.2, 0.1, 3.4, retail)
    b.box(0, -pd / 2 - 0.02, 2.0, pw - 1.2, 0.1, 3.4, retail)

    top = Hbase + (floors - podium) * FLOOR_H
    shaft_h = top - Hbase
    zc = Hbase + shaft_h / 2
    for (sx, sy, sw, sd) in ((0, D / 2, W, 0.12), (0, -D / 2, W, 0.12), (W / 2, 0, 0.12, D), (-W / 2, 0, 0.12, D)):
        b.box(sx, sy, zc, sw, sd, shaft_h, glass)
    b.box(0, 0, zc, W - 0.4, D - 0.4, shaft_h, spandrel)

    for (sy, ny) in ((D / 2 + 0.05, 1), (-D / 2 - 0.05, -1)):
        # vertical mullions (residential = denser verticals; office = sparser)
        step = 1 if not office else 1
        for c in range(0, cx_cols + 1, step):
            x = -W / 2 + c * COL_W
            b.box(x, sy, zc, 0.13, 0.06, shaft_h, mullion)
        for f in range(podium, floors + 1):
            z = f * FLOOR_H
            band = 1.2 if office else 0.9   # office = fatter horizontal strips
            b.box(0, sy, z, W, 0.09, band, spandrel)
            if f < floors:
                for c in range(cx_cols):
                    if lit(c, f, key):
                        x = -W / 2 + COL_W / 2 + c * COL_W
                        b.box(x, sy + ny * 0.03, z + FLOOR_H / 2 + 0.4, COL_W - 0.4, 0.03, FLOOR_H - 1.3, glass_lit)

    if crown == "setback":
        cw, cd = W * 0.62, D * 0.62
        ch = 4 * FLOOR_H
        b.box(0, 0, top + ch / 2, cw, cd, ch, glass)
        b.box(0, 0, top + ch + 1.2, cw * 0.8, cd * 0.8, 2.4, crown_m)
        b.box(0, 0, top + ch + 3.4, 0.9, 0.9, 7.0, crown_m)
    elif crown == "stepped":
        b.box(0, 0, top + 1.6 * FLOOR_H, W * 0.78, D * 0.78, 3.2 * FLOOR_H, glass)
        b.box(0, 0, top + 3.6 * FLOOR_H, W * 0.5, D * 0.5, 1.6 * FLOOR_H, glass)
        b.box(0, 0, top + 4.6 * FLOOR_H, W * 0.5 - 0.4, D * 0.5 - 0.4, 1.2, crown_m)
    else:  # flat
        b.box(0, 0, top + 1.1, W - 0.3, D - 0.3, 2.2, crown_m)

    return b.finalize(name)


KIT = [
    # name, floors, cols_x, cols_y, tint, crown, office
    ("tower_office_dark_42", 42, 8, 7, "blue", "setback", True),
    ("tower_office_bronze_30", 30, 7, 7, "bronze", "flat", True),
    ("tower_res_teal_36", 36, 5, 6, "teal", "stepped", False),
    ("tower_res_silver_28", 28, 6, 5, "silver", "flat", False),
    ("tower_office_grey_50", 50, 7, 6, "grey", "setback", True),
    ("tower_res_blue_24", 24, 6, 6, "blue", "flat", False),
    ("tower_twin_a_40", 40, 5, 5, "grey", "flat", False),
    ("tower_twin_b_40", 40, 5, 5, "grey", "flat", False),
    ("tower_office_teal_34", 34, 8, 6, "teal", "flat", True),
    ("tower_res_bronze_46", 46, 5, 6, "bronze", "setback", False),
]

made = []
for i, (name, fl, cx, cy, tint, crown, office) in enumerate(KIT):
    o = tower(name, fl, cx, cy, tint=tint, crown=crown, key=i + 1, office=office)
    made.append((name, o))

for name, o in made:
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, name + ".glb"),
                              use_selection=True, export_format="GLB", export_apply=True,
                              export_yup=True, export_cameras=False, export_lights=False)

# grid layout for the contact sheet
COLS = 5
for i, (name, o) in enumerate(made):
    o.location = ((i % COLS - (COLS - 1) / 2) * 34, (i // COLS - 0.5) * 44, 0)

# HDRI sky + sun
bpy.ops.mesh.primitive_plane_add(size=800, location=(0, 0, 0))
bpy.context.active_object.data.materials.append(mat("plaza", (0.07, 0.07, 0.08), rough=0.3))
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
    bg.inputs[1].default_value = 1.15
except Exception:
    bg.inputs[0].default_value = (0.9, 0.72, 0.5, 1.0)
nt.links.new(bg.outputs[0], out.inputs[0])
sun_data = bpy.data.lights.new("sun", type="SUN")
sun_data.energy = 3.0
sun_data.color = (1.0, 0.8, 0.55)
sun = bpy.data.objects.new("sun", sun_data)
bpy.context.collection.objects.link(sun)
sun.rotation_euler = (math.radians(72), math.radians(8), math.radians(-60))

tgt = bpy.data.objects.new("target", None)
tgt.location = (0, 0, 72)
bpy.context.collection.objects.link(tgt)
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 34
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (150, -330, 185)
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
    sc.eevee.taa_render_samples = 64
    sc.eevee.use_raytracing = True
except Exception:
    pass
sc.render.resolution_x = 1600
sc.render.resolution_y = 900
try:
    sc.view_settings.view_transform = "AgX"
except Exception:
    sc.view_settings.view_transform = "Filmic"
sc.render.filepath = os.path.join(out_dir, "glass_kit_preview.png")
sc.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)

total = sum(os.path.getsize(os.path.join(out_dir, n + ".glb")) for n, _ in made)
print("GLASS_KIT_OK towers=%d total_glb_bytes=%d out=%s" % (len(made), total, out_dir))
