"""
SCENARIO PROPS generator (headless Blender) — S0 Scenario Studio obstacles
(docs/simulation/76 §0/§12: parking scenarios need PRECISE hittable
obstacles; doc 74 noted the slalom cones missing from the streetscape kits).

Props (one GLB each; base at z=0, footprint centred on origin, cached
materials, face-material_index bmesh Builder — the same conventions as
streetscape_v2.py so the sim's instanced prop pipeline drops them straight in):

  cone            classic 50 cm traffic cone (конус): 28 cm square rubber
                  base, orange tapered body, one white reflective band.
                  Collider contract (ScenarioObstacles.tsx PROP_COLLIDERS —
                  sized to the body a bumper can reach, not the base plate):
                  cuboid half-extents 0.08 x 0.25 x 0.08 m, centre at y 0.25.
  training_pole   полигон marker pole (колче): 1.5 m orange/white striped
                  pole on a 15 cm rubber disc base. Collider contract:
                  cuboid half-extents 0.04 x 0.75 x 0.04 m, centre y 0.75.

    "E:/blender/blender-5.1.2-windows-x64/blender.exe" \
      --background --python tools/blender/scenario_props.py -- <out_dir>

Then draco-compress each GLB via `node tools/glb/optimize.mjs <in> <out>`
into platform/public/sim/props/.
"""

import bpy
import bmesh
import sys
import os
import math
from mathutils import Matrix

# ---- output dir (arg after `--`) -------------------------------------------
argv = sys.argv
out_dir = None
if "--" in argv:
    extra = argv[argv.index("--") + 1:]
    if extra:
        out_dir = extra[0]
if not out_dir:
    out_dir = os.path.join(os.path.expanduser("~"), "scenario-props-out")
os.makedirs(out_dir, exist_ok=True)


# ---- scene reset ------------------------------------------------------------
def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                 bpy.data.cameras, bpy.data.worlds, bpy.data.images):
        for item in list(coll):
            try:
                coll.remove(item)
            except Exception:
                pass


# ---- materials (cached by name) --------------------------------------------
_mats = {}


def mat(name, rgb, rough=0.6, metal=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    _mats[name] = m
    return m


def M():
    return {
        # PVC traffic-cone orange (saturated, reads at 50 m under AgX)
        "cone_orange":  mat("cone_orange", (0.85, 0.18, 0.02), rough=0.45),
        # retroreflective band — bright, low roughness
        "band_white":   mat("band_white", (0.92, 0.92, 0.90), rough=0.25),
        # recycled-rubber base / disc
        "rubber_dark":  mat("rubber_dark", (0.045, 0.045, 0.05), rough=0.9),
    }


# ---- geometry builder (one bmesh per prop; face material_index) ------------
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

    def _tag(self, before, mi):
        for f in self.bm.faces:
            if f not in before:
                f.material_index = mi

    def obox(self, cx, cy, cz, sx, sy, sz, material):
        mi = self._mi(material)
        before = set(self.bm.faces)
        m = Matrix.Translation((cx, cy, cz)) @ Matrix.Diagonal((sx, sy, sz, 1.0))
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        self._tag(before, mi)

    def cyl(self, cx, cy, cz, r1, r2, h, material, seg=12, caps=True):
        mi = self._mi(material)
        before = set(self.bm.faces)
        m = Matrix.Translation((cx, cy, cz))
        bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg,
                              radius1=r1, radius2=r2, depth=h, matrix=m)
        self._tag(before, mi)

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


# ---- props -------------------------------------------------------------------
# Cone body taper: radius at height z (base r 0.105 at z=0.03 → tip r 0.02 at
# z=0.50). The white band is a separate frustum segment so the material split
# survives the sim's per-primitive instancing without textures.
CONE_H = 0.50
CONE_BASE_Z = 0.03
CONE_R0 = 0.105
CONE_R1 = 0.02


def cone_r(z):
    t = (z - CONE_BASE_Z) / (CONE_H - CONE_BASE_Z)
    return CONE_R0 + (CONE_R1 - CONE_R0) * t


def prop_cone(mtl):
    """Traffic cone: 28 cm square rubber base + orange body + white band."""
    b = Builder()
    # Rubber base slab (rounded look is wasted tris — a low box reads right).
    b.obox(0, 0, 0.015, 0.28, 0.28, 0.03, mtl["rubber_dark"])
    # Body segments (orange / white band / orange), stacked frustums.
    for z0, z1, m in (
        (CONE_BASE_Z, 0.24, mtl["cone_orange"]),
        (0.24, 0.36, mtl["band_white"]),
        (0.36, CONE_H, mtl["cone_orange"]),
    ):
        b.cyl(0, 0, (z0 + z1) / 2, cone_r(z0), cone_r(z1), z1 - z0, m, seg=14)
    return b.finalize("cone")


def prop_training_pole(mtl):
    """Полигон marker pole: 1.5 m orange/white striped, rubber disc base."""
    b = Builder()
    b.cyl(0, 0, 0.02, 0.15, 0.14, 0.04, mtl["rubber_dark"], seg=14)
    # 4 stripes of 0.365 m: orange / white / orange / white, cap on top.
    z = 0.04
    stripe = (1.5 - z) / 4
    for i in range(4):
        m = mtl["cone_orange"] if i % 2 == 0 else mtl["band_white"]
        b.cyl(0, 0, z + stripe / 2, 0.025, 0.025, stripe, m, seg=10, caps=(i == 3))
        z += stripe
    return b.finalize("training_pole")


# ===========================================================================
#  MAIN
# ===========================================================================
reset_scene()
mtl = M()

made = []
for name, fn in (("cone", prop_cone), ("training_pole", prop_training_pole)):
    obj = fn(mtl)
    made.append((name, obj))

sizes = {}
for name, obj in made:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    path = os.path.join(out_dir, name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path, use_selection=True, export_format="GLB",
        export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
    )
    sizes[name] = os.path.getsize(path)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print("  TRIS %-16s %6d" % (name, tris))

total = sum(sizes.values())
print("SCENARIO_PROPS_OK props=%d total_raw_glb_bytes=%d out=%s" % (len(made), total, out_dir))
for n in sorted(sizes):
    print("  RAW %-16s %8d B" % (n, sizes[n]))
