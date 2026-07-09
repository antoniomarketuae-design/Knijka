"""
Blender headless smoke test for the Книжка.AI simulator asset pipeline.

Purpose: prove we can generate a web-optimized GLB from Blender's Python API
with NO GUI, NO MCP, NO Claude Code restart — just:

    blender --background --python tools/blender/smoke_test.py -- <out_dir>

It builds a trivial "city block" (a beveled building box + a ground tile with
simple PBR materials) and exports it as a single .glb. If this produces a valid
GLB that loads in the R3F sim, the whole procedural-asset pipeline is unblocked.

This is deliberately minimal — the real Sofia-appropriate generators come after
the simulator audit lands and defines what to build.
"""

import bpy
import sys
import os

# ---- resolve output dir (arg after the `--` separator) ----------------------
argv = sys.argv
out_dir = None
if "--" in argv:
    extra = argv[argv.index("--") + 1:]
    if extra:
        out_dir = extra[0]
if not out_dir:
    out_dir = os.path.join(os.path.expanduser("~"), "blender-smoke-out")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "smoke_block.glb")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            block.remove(item)


def make_material(name, rgba, roughness=0.8, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def make_building(name, x, y, w, d, h, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, h / 2))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # a small bevel reads as far less "boxy" than a raw cube
    bev = obj.modifiers.new("bevel", type="BEVEL")
    bev.width = 0.15
    bev.segments = 2
    obj.data.materials.append(mat)
    return obj


def make_ground(size, mat):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = "ground"
    obj.data.materials.append(mat)
    return obj


clear_scene()

ground_mat = make_material("asphalt", (0.05, 0.05, 0.06, 1.0), roughness=0.9)
wall_a = make_material("facade_a", (0.62, 0.60, 0.55, 1.0), roughness=0.7)
wall_b = make_material("facade_b", (0.45, 0.50, 0.58, 1.0), roughness=0.6)

make_ground(24, ground_mat)
make_building("bldg_a", -5, -4, 6, 6, 14, wall_a)
make_building("bldg_b", 5, 4, 5, 7, 20, wall_b)
make_building("bldg_c", -6, 6, 4, 4, 9, wall_a)

bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    export_apply=True,          # bake modifiers (the bevel)
    export_yup=True,            # Three.js is Y-up
    export_cameras=False,
    export_lights=False,
)

# report so the calling shell can confirm success
size = os.path.getsize(out_path) if os.path.exists(out_path) else -1
print(f"SMOKE_TEST_OK path={out_path} bytes={size}")
