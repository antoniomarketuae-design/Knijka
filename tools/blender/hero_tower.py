"""
Hero glass tower — quality-bar prototype (headless Blender).

Builds ONE modern curtain-wall high-rise (glass skin + aluminium mullion grid +
spandrel bands + stone podium + lit crown) plus a few neighbour towers and a
ground plane so the glass has a skyline + golden-hour sky to reflect. Then
renders it TWICE from the same camera:

  * <out>/hero_cycles.png  — Cycles, ray-traced reflections (the offline CEILING)
  * <out>/hero_eevee.png   — EEVEE real-time rasteriser (~ what the live browser
                             sim can actually do: screen-space reflections + env)

and exports <out>/hero_tower.glb for real-time integration.

    blender --background --python tools/blender/hero_tower.py -- <out_dir>
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
    out_dir = os.path.join(os.path.expanduser("~"), "hero-tower-out")
os.makedirs(out_dir, exist_ok=True)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for item in list(coll):
            coll.remove(item)


_mats = {}


def mat(name, rgb, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, ior=1.45, coat=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    try:
        b.inputs["IOR"].default_value = ior
    except Exception:
        pass
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
        c = [
            (cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
            (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
            (cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz),
            (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz),
        ]
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


FLOOR_H = 3.7
COL_W = 3.4


def lit(col, floor, key):
    return ((col * 5 + floor * 11 + key * 17) % 100) < 22


def glass_tower(name, floors, cols_x, cols_y, key=1, tint=(0.015, 0.03, 0.05), podium=3, setback_at=None):
    b = Builder()
    W = cols_x * COL_W
    D = cols_y * COL_W
    Hbase = podium * FLOOR_H

    glass = mat("glass_tint_%s" % name, tint, rough=0.04, metal=0.0, ior=1.5, coat=0.6)
    glass_lit = mat("glass_lit", (0.05, 0.05, 0.06), rough=0.14, emit=(1.0, 0.80, 0.50), emit_strength=2.4)
    mullion = mat("mullion", (0.52, 0.54, 0.56), rough=0.35, metal=0.9)
    spandrel = mat("spandrel", (0.04, 0.05, 0.07), rough=0.28, metal=0.3)
    stone = mat("stone", (0.72, 0.69, 0.63), rough=0.6)
    retail = mat("retail_glass", (0.10, 0.14, 0.16), rough=0.05, metal=0.35, coat=0.5)
    crown = mat("crown", (0.30, 0.31, 0.33), rough=0.4, metal=0.6)

    # podium base (wider), with retail glazing band at ground
    pw, pd = W + 2.2, D + 2.2
    b.box(0, 0, Hbase / 2, pw, pd, Hbase, stone)
    b.box(0, pd / 2 + 0.02, 2.0, pw - 1.2, 0.1, 3.4, retail)
    b.box(0, -pd / 2 - 0.02, 2.0, pw - 1.2, 0.1, 3.4, retail)

    # shaft glass skin (4 faces) as thin glass boxes
    top = Hbase + (floors - podium) * FLOOR_H
    shaft_h = top - Hbase
    zc = Hbase + shaft_h / 2
    b.box(0, D / 2, zc, W, 0.12, shaft_h, glass)
    b.box(0, -D / 2, zc, W, 0.12, shaft_h, glass)
    b.box(W / 2, 0, zc, 0.12, D, shaft_h, glass)
    b.box(-W / 2, 0, zc, 0.12, D, shaft_h, glass)
    # inner core fill so the tower isn't see-through
    b.box(0, 0, zc, W - 0.4, D - 0.4, shaft_h, spandrel)

    # mullion grid + spandrel bands + lit panels on the two long faces
    for (sy, ny) in ((D / 2 + 0.05, 1), (-D / 2 - 0.05, -1)):
        # vertical mullions
        for c in range(cols_x + 1):
            x = -W / 2 + c * COL_W
            b.box(x, sy, zc, 0.13, 0.06, shaft_h, mullion)
        for f in range(podium, floors + 1):
            z = f * FLOOR_H
            # horizontal spandrel band at each floor slab
            b.box(0, sy, z, W, 0.09, 0.9, spandrel)
            # lit vision panels (a scattered few)
            if f < floors:
                for c in range(cols_x):
                    if lit(c, f, key):
                        x = -W / 2 + COL_W / 2 + c * COL_W
                        b.box(x, sy + ny * 0.03, z + FLOOR_H / 2 + 0.4, COL_W - 0.4, 0.03, FLOOR_H - 1.3, glass_lit)

    # setback + lit crown
    if setback_at:
        cw, cd = W * 0.62, D * 0.62
        ch = 4 * FLOOR_H
        b.box(0, 0, top + ch / 2, cw, cd, ch, glass)
        b.box(0, 0, top + ch + 1.2, cw * 0.8, cd * 0.8, 2.4, crown)
        b.box(0, 0, top + ch + 2.6, 1.0, 1.0, 6.0, crown)  # spire
    else:
        b.box(0, 0, top + 1.0, W, D, 2.0, crown)

    return b.finalize(name)


# ---- build scene ------------------------------------------------------------
reset_scene()

hero = glass_tower("hero_tower", floors=42, cols_x=8, cols_y=7, key=1,
                   tint=(0.02, 0.035, 0.055), setback_at=True)

# neighbours (context for reflections + skyline), varied
neighbours = [
    ("n1", 30, 6, 6, (0.05, 0.04, 0.03), (-52, 14)),
    ("n2", 24, 6, 5, (0.02, 0.03, 0.05), (46, -8)),
    ("n3", 36, 5, 5, (0.04, 0.045, 0.05), (60, 40)),
    ("n4", 20, 7, 6, (0.05, 0.05, 0.06), (-44, -46)),
    ("n5", 28, 5, 6, (0.03, 0.03, 0.04), (30, 58)),
]
for nm, fl, cx, cy, tnt, (px, py) in neighbours:
    o = glass_tower(nm, floors=fl, cols_x=cx, cols_y=cy, key=hash(nm) % 20, tint=tnt, setback_at=False)
    o.location = (px, py, 0)

# ground (damp reflective plaza)
bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, 0))
ground = bpy.context.active_object
ground.data.materials.append(mat("plaza", (0.07, 0.07, 0.08), rough=0.28, metal=0.0))

# golden-hour sky — use the sim's REAL HDRI so the glass reflects exactly what
# the live sim would reflect (representative, not a Blender-only look).
HDRI = "E:/AI driver/platform/public/sim/env/sky_urban_1k.hdr"
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
    mapping = nt.nodes.new("ShaderNodeMapping")
    texco = nt.nodes.new("ShaderNodeTexCoord")
    env.image = bpy.data.images.load(HDRI)
    mapping.inputs["Rotation"].default_value[2] = math.radians(60)
    nt.links.new(texco.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 1.15
except Exception:
    bg.inputs[0].default_value = (0.9, 0.72, 0.5, 1.0)
    bg.inputs[1].default_value = 1.0
nt.links.new(bg.outputs[0], out.inputs[0])

# warm low sun from the right (direct light + long shadows over the HDRI ambient)
sun_data = bpy.data.lights.new("sun", type="SUN")
sun_data.energy = 3.2
sun_data.color = (1.0, 0.78, 0.52)
sun_data.angle = math.radians(0.9)
sun = bpy.data.objects.new("sun", sun_data)
bpy.context.collection.objects.link(sun)
sun.rotation_euler = (math.radians(80), math.radians(6), math.radians(-64))

# hero camera — low 3/4 looking up at the tower
tgt = bpy.data.objects.new("target", None)
tgt.location = (0, 0, 78)
bpy.context.collection.objects.link(tgt)
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 34
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (95, -120, 34)
con = cam.constraints.new("TRACK_TO")
con.target = tgt
con.track_axis = "TRACK_NEGATIVE_Z"
con.up_axis = "UP_Y"
bpy.context.scene.camera = cam

sc = bpy.context.scene
sc.render.resolution_x = 1280
sc.render.resolution_y = 1600
sc.render.film_transparent = False
try:
    sc.view_settings.view_transform = "AgX"
except Exception:
    sc.view_settings.view_transform = "Filmic"
sc.view_settings.look = "AgX - Medium High Contrast" if sc.view_settings.view_transform == "AgX" else "None"


def render_to(engine, path, samples):
    try:
        sc.render.engine = engine
    except Exception:
        return False
    if engine == "CYCLES":
        sc.cycles.samples = samples
        sc.cycles.use_denoising = True
        try:
            sc.cycles.denoiser = "OPENIMAGEDENOISE"
        except Exception:
            pass
    else:
        try:
            sc.eevee.taa_render_samples = samples
            sc.eevee.use_raytracing = True   # EEVEE Next SSR/raytraced reflections
        except Exception:
            pass
    sc.render.filepath = path
    sc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    return True


# real-time proxy first (fast), then the offline ceiling
render_to("BLENDER_EEVEE", os.path.join(out_dir, "hero_eevee.png"), 64) or \
    render_to("BLENDER_EEVEE_NEXT", os.path.join(out_dir, "hero_eevee.png"), 64)
render_to("CYCLES", os.path.join(out_dir, "hero_cycles.png"), 48)

# export the hero for real-time integration
bpy.ops.object.select_all(action="DESELECT")
hero.select_set(True)
bpy.context.view_layer.objects.active = hero
bpy.ops.export_scene.gltf(
    filepath=os.path.join(out_dir, "hero_tower.glb"),
    use_selection=True, export_format="GLB", export_apply=True, export_yup=True,
    export_cameras=False, export_lights=False,
)

glb = os.path.join(out_dir, "hero_tower.glb")
print("HERO_OK glb_bytes=%d out=%s" % (os.path.getsize(glb) if os.path.exists(glb) else -1, out_dir))
