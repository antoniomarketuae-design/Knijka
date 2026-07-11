"""hero_interior_v3_preview.py — driver-eye verification renders for the
doc-73 cockpit detail pass (see hero_interior_v3.py).

Renders the interior at the sim's exact optics (vFOV 47, 16:9) from the
SHIPPED cockpit camera pose (tuning.ts: COCKPIT_EYE (0.24, 0.71, -0.255),
pitch -5) over a synthetic street backdrop, in the three poses that exist in
the sim (CameraRig GLANCE_OFFSETS — there is no free look):
  <prefix>.png               rest
  <prefix>_glance_right.png  right glance  (yaw -0.93 rad, pitch -0.09)
  <prefix>_glance_left.png   left glance   (yaw +0.67 rad, pitch -0.15)
Glances compose in CAMERA space after the base pitch, exactly like CameraRig
(quat = rest * Ry(yaw) * Rx(pitch)).

Run:
  blender --background work/hero_interior_v3.blend --python this.py -- \
      previews/hero_interior_v3_eye
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
prefix = argv[0] if argv else "previews/hero_interior_v3_eye"
root = os.path.dirname(os.path.abspath(__file__))
prefix = os.path.join(root, prefix) if not os.path.isabs(prefix) else prefix

D = bpy.data
scene = bpy.context.scene

# --- synthetic street backdrop (render-only; the blend is NOT saved) --------
def mat(name, rgba, rough=0.9):
    m = D.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    return m


def box(name, cx, cy, cz, sx, sy, sz, m):
    me = D.meshes.new(name)
    ob = D.objects.new(name, me)
    scene.collection.objects.link(ob)
    verts = [(cx + dx * sx / 2, cy + dy * sy / 2, cz + dz * sz / 2)
             for dz in (-1, 1) for dy in (-1, 1) for dx in (-1, 1)]
    faces = [(0, 1, 3, 2), (4, 5, 7, 6), (0, 1, 5, 4), (2, 3, 7, 6),
             (0, 2, 6, 4), (1, 3, 7, 5)]
    me.from_pydata(verts, [], faces)
    me.update()
    ob.data.materials.append(m)
    return ob


GROUND_Z = 0.06  # road plane: chassis y -0.49 -> blender z 0.06
asphalt = mat("pv_asphalt", (0.16, 0.16, 0.17, 1))
lane = mat("pv_lane", (0.85, 0.85, 0.82, 1), 0.6)
bldg = mat("pv_bldg", (0.55, 0.52, 0.50, 1))
box("pv_ground", 0, 100, GROUND_Z - 0.05, 400, 400, 0.1, asphalt)
for i in range(24):
    box(f"pv_dash{i}", 0.0, 8 + i * 8, GROUND_Z + 0.006, 0.15, 3.0, 0.01, lane)
for i in range(8):
    box(f"pv_bl{i}", -9 - (i % 3), 25 + i * 22, GROUND_Z + 6, 8, 14, 12, bldg)
    box(f"pv_br{i}", 9 + (i % 3), 32 + i * 22, GROUND_Z + 5, 8, 14, 10, bldg)

world = D.worlds.new("pv_world")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.68, 0.82, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
scene.world = world

sun = D.lights.new("pv_sun", "SUN")
sun.energy = 3.5
sun_ob = D.objects.new("pv_sun", sun)
sun_ob.rotation_euler = (math.radians(50), 0, math.radians(-30))
scene.collection.objects.link(sun_ob)

# hide the exterior REF shell (cockpit view hides it in the sim)
for o in D.objects:
    if o.type == "MESH" and any(c.name == "REF" for c in o.users_collection):
        o.hide_render = True

# --- camera at the sim optics -------------------------------------------------
cam = D.cameras.new("pv_cam")
cam.sensor_fit = "VERTICAL"
cam.sensor_height = 24.0
cam.lens = 12.0 / math.tan(math.radians(47.0 / 2))  # vFOV 47
cam.clip_start = 0.05
cam_ob = D.objects.new("pv_cam", cam)
scene.collection.objects.link(cam_ob)
scene.camera = cam_ob

scene.render.engine = "BLENDER_EEVEE"
try:
    scene.eevee.use_gtao = True                 # approximate the baked AO
except Exception:
    pass
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100

LOC = Vector((-0.24, -0.255, 1.26))             # shipped COCKPIT_EYE (blender)
BASE = Matrix.Rotation(math.radians(90 - 5.0), 4, "X")   # face +Y, pitch -5

POSES = {
    "": Matrix.Identity(4),
    "_glance_right": Matrix.Rotation(-0.93, 4, "Y") @ Matrix.Rotation(-0.09, 4, "X"),
    "_glance_left": Matrix.Rotation(0.67, 4, "Y") @ Matrix.Rotation(-0.15, 4, "X"),
}
for tag, glance in POSES.items():
    cam_ob.matrix_world = Matrix.Translation(LOC) @ BASE @ glance
    scene.render.filepath = f"{prefix}{tag}.png"
    bpy.ops.render.render(write_still=True)
    print(f"rendered {scene.render.filepath}")
