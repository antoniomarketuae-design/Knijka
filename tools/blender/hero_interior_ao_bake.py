"""hero_interior_ao_bake.py — bake a 1024^2 ambient-occlusion map into the
GT-E cockpit interior (doc 71 §4.6/§4.8, quality-gap/03 baking pipeline).

WHY: in the cockpit camera the interior fills ~half the frame, but the shell,
seats, console and wheel are lit only by flat solid-colour PBR — no contact
shadows in the dash cavities, under the cowl, in the footwells / seat bolsters
/ door recesses, so the cabin reads as flat blocks. Baked per-asset AO on a
second UV set (glTF occlusionTexture -> aoMap, indirect-only) adds that
grounding for 0 ms at runtime and is instancing-safe (object-space, in the
asset's own uv1).

WHAT this script does (loads the CURRENT committed post-surgery interior; it
does NOT re-run the windshield surgery — that is baked into v2.blend already):
  1. On interior_shell + interior_seats + steering_wheel_mesh (the visible
     shell/seats/console/wheel), add UVMap(0) + Lightmap(1) UV sets and
     multi-object Smart-UV-Project them into ONE shared, non-overlapping 0-1
     atlas, inset to a 2% white border. UVMap is made == Lightmap so the AO
     maps correctly whichever TEXCOORD the exporter lands it on.
  2. Bake a 1024^2 Cycles AO pass (256 spp, margin 16 EXTEND, world AO
     distance 0.5 m so it captures LOCAL contact shadows, not enclosed-cabin
     darkening) into a shared atlas image INITIALISED WHITE with use_clear
     OFF. Only the three targets are visible during the bake (screens, mirror
     glass, hotspot control meshes and the whole exterior are hidden so they
     neither receive nor cast bake artifacts — doc directive).
  3. OIDN-denoise the atlas through the compositor (Cycles does not denoise
     AO bakes — T93681) and save previews/interior_ao_atlas.png.
  4. Wire the denoised AO into each interior material through the special
     "glTF Material Output" node group (Occlusion input, sampling Lightmap) so
     the exporter emits it as occlusionTexture texCoord=1. Because the six
     int_* materials are SHARED with the excluded meshes (screens/mirrors/
     hotspots), those meshes also carry the occlusion slot — but they have no
     uv1, so three.js samples atlas texel (0,0), which the white 2% border
     keeps at 1.0 (no darkening). MirrorRig also replaces mirror-glass
     materials at runtime on medium/high.
  5. Export the INT collection to work/hero_interior_v2.glb (same selection /
     Y-up convention as hero_interior_v2.py), then render driver-eye BEFORE
     (flat) and AFTER (albedo x AO) previews for visual confirmation.

Integrity guarded (the DO-NOT-BREAK list, same as hero_interior_v2.py): 13
hotspot_* nodes, screen_cluster/center, steering_wheel hierarchy,
interior_shell/seats grouping, <=6 interior materials, <60k tris. Geometry
positions are UNTOUCHED (only UV sets + a baked texture are added).

Run (from repo root):
  "E:/blender/blender-5.1.2-windows-x64/blender.exe" --background \
    tools/blender/work/hero_interior_v2.blend \
    --python tools/blender/hero_interior_ao_bake.py
Then optimise:
  cd platform && node ../tools/glb/optimize.mjs \
    ../tools/blender/work/hero_interior_v2.glb public/sim/vehicles/hero_interior.glb
"""
import math
import os

import bpy
import numpy as np
from mathutils import Vector

D = bpy.data
scene = bpy.context.scene
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")
PREVIEWS = os.path.join(HERE, "previews")
SIZE = 1024

INT_MATS = ["int_dark", "int_leather", "int_alu", "int_accent", "int_gloss", "int_seat"]
TARGET_NAMES = ["interior_shell", "interior_seats", "steering_wheel_mesh"]
targets = [D.objects[n] for n in TARGET_NAMES]


def eevee_engine():
    engs = {e.identifier for e in
            bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    return "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engs else "BLENDER_EEVEE"


# --------------------------------------------------------------------------
# 1. Second UV set (shared, non-overlapping atlas) on the three targets
# --------------------------------------------------------------------------
for ob in targets:
    me = ob.data
    if "UVMap" not in me.uv_layers:
        me.uv_layers.new(name="UVMap")
    if "Lightmap" not in me.uv_layers:
        me.uv_layers.new(name="Lightmap")
    me.uv_layers.active = me.uv_layers["Lightmap"]  # smart-project + bake target

for o in D.objects:
    o.select_set(False)
for ob in targets:
    ob.select_set(True)
bpy.context.view_layer.objects.active = targets[0]
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
# multi-object Smart UV Project -> all three pack into ONE shared 0-1 space
bpy.ops.uv.smart_project(
    angle_limit=math.radians(66),
    island_margin=0.02,
    area_weight=0.0,
    correct_aspect=True,
    scale_to_bounds=False,
)
bpy.ops.object.mode_set(mode="OBJECT")

# inset every Lightmap island into [0.02, 0.98] so the (0,0) texel stays in the
# white border (the shared-material safety for meshes that lack uv1). UVMap
# (TEXCOORD_0) exists ONLY so the AO Lightmap exports as TEXCOORD_1 (uv2); it
# carries no texture, so it is collapsed to a CONSTANT (0,0) which Draco encodes
# in ~0 bytes — two real UV sets would otherwise add ~290 KB of un-compressible
# atlas coordinates (503 KB -> 240 KB).
for ob in targets:
    me = ob.data
    lm = me.uv_layers["Lightmap"]
    um = me.uv_layers["UVMap"]
    n = len(lm.data)
    flat = np.empty(n * 2, dtype=np.float32)
    lm.data.foreach_get("uv", flat)
    flat = 0.02 + flat * 0.96
    lm.data.foreach_set("uv", flat)
    um.data.foreach_set("uv", np.zeros(n * 2, dtype=np.float32))
    me.update()

# --------------------------------------------------------------------------
# 2. AO atlas image (white) + per-material bake target node
# --------------------------------------------------------------------------
ao = D.images.new("hero_interior_ao", width=SIZE, height=SIZE, alpha=False, float_buffer=False)
ao.colorspace_settings.name = "Non-Color"
ao.pixels.foreach_set(np.ones(SIZE * SIZE * 4, dtype=np.float32))
ao.update()

bake_nodes = {}
for mn in INT_MATS:
    mat = D.materials[mn]
    mat.use_nodes = True
    nt = mat.node_tree
    node = nt.nodes.new("ShaderNodeTexImage")
    node.name = "BAKE_AO"
    node.image = ao
    node.select = True
    nt.nodes.active = node
    bake_nodes[mn] = node

# --------------------------------------------------------------------------
# 3. Bake AO (Cycles, CPU, distance 0.5 m; only the 3 targets visible)
# --------------------------------------------------------------------------
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 256
scene.cycles.use_denoising = False

bake = scene.render.bake
bake.margin = 16
bake.margin_type = "EXTEND"
bake.use_clear = False            # keep the white background (safety border)
bake.target = "IMAGE_TEXTURES"
bake.use_selected_to_active = False

if scene.world is None:
    scene.world = D.worlds.new("ao_world")
scene.world.light_settings.distance = 0.5   # LOCAL contact-shadow AO

hidden = []
for o in D.objects:
    prev = o.hide_render
    o.hide_render = o not in targets   # only shell/seats/wheel occlude+receive
    hidden.append((o, prev))

for o in D.objects:
    o.select_set(False)
for ob in targets:
    ob.select_set(True)
bpy.context.view_layer.objects.active = targets[0]
print("baking AO (256 spp, 1024, distance 0.5 m) ...")
bpy.ops.object.bake(type="AO")
ao.update()

for o, prev in hidden:
    o.hide_render = prev

# --------------------------------------------------------------------------
# 4. OIDN denoise the atlas through the compositor -> PNG, reload
# --------------------------------------------------------------------------
os.makedirs(PREVIEWS, exist_ok=True)
atlas_png = os.path.join(PREVIEWS, "interior_ao_atlas.png")

# Blender 5.1 moved the scene compositor into a CompositorNodeTree datablock
# assigned to scene.compositing_node_group (the old scene.node_tree is gone).
cng = D.node_groups.new("interior_ao_comp", "CompositorNodeTree")
cng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
scene.compositing_node_group = cng
img_node = cng.nodes.new("CompositorNodeImage")
img_node.image = ao
den = cng.nodes.new("CompositorNodeDenoise")
gout = cng.nodes.new("NodeGroupOutput")
cng.links.new(img_node.outputs["Image"], den.inputs["Image"])
cng.links.new(den.outputs["Image"], gout.inputs[0])
scene.render.resolution_x = SIZE
scene.render.resolution_y = SIZE
scene.render.resolution_percentage = 100
scene.render.use_compositing = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.cycles.samples = 1                    # compositor-only; 3D result unused
if scene.camera is None:                    # render pipeline wants a camera
    scene.camera = D.objects.get("Camera") or D.objects.get("eye_cam")
scene.render.filepath = atlas_png
bpy.ops.render.render(write_still=True)
print(f"denoised AO atlas -> {atlas_png}")

ao_dn = D.images.load(atlas_png, check_existing=False)
ao_dn.colorspace_settings.name = "Non-Color"

# --------------------------------------------------------------------------
# 5. Wire AO into the "glTF Material Output" occlusion slot (texCoord 1)
# --------------------------------------------------------------------------
group = D.node_groups.get("glTF Material Output")
if group is None:
    group = D.node_groups.new("glTF Material Output", "ShaderNodeTree")
    group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")

for mn in INT_MATS:
    nt = D.materials[mn].node_tree
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "Lightmap"
    tex = bake_nodes[mn]
    tex.image = ao_dn
    tex.image.colorspace_settings.name = "Non-Color"
    nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
    g = nt.nodes.new("ShaderNodeGroup")
    g.node_tree = group
    nt.links.new(tex.outputs["Color"], g.inputs["Occlusion"])

# --------------------------------------------------------------------------
# 6. Integrity checks (mirror hero_interior_v2.py's DO-NOT-BREAK list)
# --------------------------------------------------------------------------
HOTSPOTS = [
    "hotspot_belt", "hotspot_engine_start", "hotspot_fog",
    "hotspot_gear_selector", "hotspot_hazard", "hotspot_headlights",
    "hotspot_horn", "hotspot_indicator_stalk", "hotspot_mirror_left",
    "hotspot_mirror_rear", "hotspot_mirror_right", "hotspot_parking_brake",
    "hotspot_wiper_stalk",
]
for name in HOTSPOTS + ["screen_cluster", "screen_center", "steering_wheel",
                        "steering_wheel_mesh", "interior_shell", "interior_seats"]:
    if name not in D.objects:
        raise RuntimeError(f"integrity: node {name} missing")
assert D.objects["hotspot_horn"].parent.name == "steering_wheel"
assert D.objects["steering_wheel_mesh"].parent.name == "steering_wheel"

int_objs = [o for o in D.objects if any(c.name == "INT" for c in o.users_collection)]
int_mats = set()
tris = 0
deps = bpy.context.evaluated_depsgraph_get()
for ob in int_objs:
    if ob.type != "MESH":
        continue
    for m in ob.data.materials:
        if m:
            int_mats.add(m.name)
    me = ob.evaluated_get(deps).to_mesh()
    me.calc_loop_triangles()
    tris += len(me.loop_triangles)
    ob.evaluated_get(deps).to_mesh_clear()
assert len(int_mats) <= 6, f"too many interior materials: {sorted(int_mats)}"
assert tris < 60000, f"tri budget blown: {tris}"
for ob in targets:
    assert [uv.name for uv in ob.data.uv_layers] == ["UVMap", "Lightmap"], \
        f"{ob.name} uv layers wrong: {[uv.name for uv in ob.data.uv_layers]}"
print(f"integrity OK: {len(HOTSPOTS)} hotspots, materials={sorted(int_mats)}, tris={tris}")

# --------------------------------------------------------------------------
# 7. Export INT collection -> work/hero_interior_v2.glb (overwrite)
# --------------------------------------------------------------------------
for o in D.objects:
    o.select_set(False)
    o.hide_render = False
for ob in int_objs:
    ob.select_set(True)
glb_out = os.path.join(WORK, "hero_interior_v2.glb")
bpy.ops.export_scene.gltf(
    filepath=glb_out,
    export_format="GLB",
    use_selection=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
)
print(f"exported {glb_out} ({os.path.getsize(glb_out)} bytes pre-optimize)")

# save the baked+wired blend so previews can be re-shot without re-baking
baked_blend = os.path.join(WORK, "hero_interior_ao.blend")
bpy.ops.wm.save_as_mainfile(filepath=baked_blend)
print(f"saved {baked_blend}")

# --------------------------------------------------------------------------
# 8. Driver-eye BEFORE / AFTER previews
#    aoMap darkens INDIRECT light only, so the previews are lit by a bright
#    UNIFORM world (IBL-like) with NO directional key: 'before' is then the
#    honest flat/toy baseline (uniform env = every face equally lit) and
#    'after' shows exactly what the baked AO contributes. A clay pair
#    (uniform grey albedo) isolates the AO from the dark authored colours.
# --------------------------------------------------------------------------
AO_POWER = 1.3   # preview to match the runtime aoMapIntensity (VitokCockpit)
scene.render.use_compositing = False
scene.render.engine = eevee_engine()
try:
    scene.eevee.use_gtao = False       # only the baked AO should show
except Exception:
    pass

world = D.worlds.new("pv_world")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.62, 0.64, 0.68, 1)
bg.inputs[1].default_value = 1.5
scene.world = world

for o in D.objects:                    # interior only, exterior hidden
    o.hide_render = not any(c.name == "INT" for c in o.users_collection)

cam = D.cameras.new("pv_cam")
cam.sensor_fit = "VERTICAL"
cam.sensor_height = 24.0
cam.lens = 12.0 / math.tan(math.radians(47.0 / 2))   # vFOV 47
cam.clip_start = 0.05
cam_ob = D.objects.new("pv_cam", cam)
scene.collection.objects.link(cam_ob)
scene.camera = cam_ob
cam_ob.location = Vector((-0.24, -0.255, 1.26))       # shipped v2 cockpit pose
cam_ob.rotation_euler = (math.radians(90 - 5.0), 0, 0)  # pitch -5, face +Y
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"


def render_to(name):
    scene.render.filepath = os.path.join(PREVIEWS, name)
    bpy.ops.render.render(write_still=True)
    print(f"rendered {scene.render.filepath}")


def apply_ao():
    """Multiply pow(AO, AO_POWER) into every interior Base Color; returns undo."""
    added = []
    for mn in INT_MATS:
        nt = D.materials[mn].node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        base_in = bsdf.inputs["Base Color"]
        src = base_in.links[0].from_socket if base_in.is_linked else None
        uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "Lightmap"
        aotex = nt.nodes.new("ShaderNodeTexImage"); aotex.image = ao_dn
        aotex.image.colorspace_settings.name = "Non-Color"
        nt.links.new(uvn.outputs["UV"], aotex.inputs["Vector"])
        powr = nt.nodes.new("ShaderNodeMath"); powr.operation = "POWER"
        powr.inputs[1].default_value = AO_POWER
        nt.links.new(aotex.outputs["Color"], powr.inputs[0])
        mix = nt.nodes.new("ShaderNodeMixRGB")
        mix.blend_type = "MULTIPLY"; mix.inputs["Fac"].default_value = 1.0
        if src is not None:
            nt.links.new(src, mix.inputs["Color1"])
        else:
            mix.inputs["Color1"].default_value = base_in.default_value
        nt.links.new(powr.outputs["Value"], mix.inputs["Color2"])
        nt.links.new(mix.outputs["Color"], base_in)
        added.append((nt, [uvn, aotex, powr, mix], src, base_in))

    def undo():
        for nt, nodes, src, base_in in added:
            for n in nodes:
                nt.nodes.remove(n)
            if src is not None:
                nt.links.new(src, base_in)
    return undo


# --- real-material pair (in-context delta) ---
render_to("interior_ao_before.png")
undo = apply_ao()
render_to("interior_ao_after.png")
undo()

# --- clay pair (grey albedo isolates the AO) ---
clay_saved = []
for mn in INT_MATS:
    nt = D.materials[mn].node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        continue
    base_in = bsdf.inputs["Base Color"]
    src = base_in.links[0].from_socket if base_in.is_linked else None
    val = tuple(base_in.default_value)
    for lk in list(base_in.links):
        nt.links.remove(lk)
    base_in.default_value = (0.72, 0.72, 0.72, 1)
    clay_saved.append((nt, base_in, src, val))

render_to("interior_ao_clay_before.png")
undo = apply_ao()
render_to("interior_ao_clay_after.png")
undo()

for nt, base_in, src, val in clay_saved:   # restore authored colours
    base_in.default_value = val
    if src is not None:
        nt.links.new(src, base_in)

print("DONE: AO bake + export + previews complete")
