"""
Hero player car — fictional modern performance sedan (M5/i7-class silhouette),
DE-BADGED (no logos, no trademarked grille/light shapes). Headless Blender.

Cars are all curved surfaces, so this leans on bevel + subdivision-surface +
smooth shading to round the boxy base forms into a sleek body. Detailed wheels
(multi-spoke alloy + brake disc + caliper), tinted glazing, LED light bars,
glossy clearcoat metallic paint. Wheels are separate named nodes so the sim can
steer/roll them. Renders Cycles (ceiling) + EEVEE (real-time proxy) vs the sim
HDRI, and exports a GLB.

    blender --background --python tools/blender/hero_car.py -- <out_dir>
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
    out_dir = os.path.join(os.path.expanduser("~"), "hero-car-out")
os.makedirs(out_dir, exist_ok=True)

HDRI = "E:/AI driver/platform/public/sim/env/sky_urban_1k.hdr"
PAINT = (0.02, 0.06, 0.18)   # deep metallic blue


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for item in list(coll):
            coll.remove(item)


_mats = {}


def mat(name, rgb, rough=0.5, metal=0.0, emit=None, es=0.0, coat=0.0, coat_r=0.03, transmission=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    for key, val in (("Coat Weight", coat), ("Coat Roughness", coat_r), ("Transmission Weight", transmission)):
        try:
            b.inputs[key].default_value = val
        except Exception:
            pass
    if emit is not None:
        b.inputs["Emission Color"].default_value = (emit[0], emit[1], emit[2], 1.0)
        b.inputs["Emission Strength"].default_value = es
    _mats[name] = m
    return m


def bm_box(bm, cx, cy, cz, sx, sy, sz, taper_top=1.0, taper_front=1.0):
    """A box; taper_top scales the +Z face in X, taper_front scales the +Y face in X/Z."""
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    tx = hx * taper_top
    fx = hx * taper_front
    # 8 corners: bottom(0-3) top(4-7); +Y = front
    c = [
        (cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
        (cx + fx, cy + hy, cz - hz), (cx - fx, cy + hy, cz - hz),
        (cx - tx, cy - hy, cz + hz), (cx + tx, cy - hy, cz + hz),
        (cx + min(tx, fx), cy + hy, cz + hz), (cx - min(tx, fx), cy + hy, cz + hz),
    ]
    v = [bm.verts.new(p) for p in c]
    for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]:
        bm.faces.new([v[i] for i in f])


def obj_from_bm(bm, name, material, smooth=True):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    bpy.context.collection.objects.link(obj)
    return obj


def cylinder(name, material, radius, depth, loc, axis="X", verts=24, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc)
    o = bpy.context.active_object
    o.name = name
    if axis == "X":
        o.rotation_euler = (0, math.radians(90), 0)
    o.data.materials.append(material)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return o


reset_scene()

# ---- materials --------------------------------------------------------------
paint = mat("car_paint", PAINT, rough=0.34, metal=0.85, coat=1.0, coat_r=0.03)
glass = mat("car_glass", (0.02, 0.03, 0.04), rough=0.05, metal=0.0, coat=0.4, transmission=0.35)
chrome = mat("chrome", (0.8, 0.82, 0.85), rough=0.08, metal=1.0)
blacktrim = mat("black_trim", (0.02, 0.02, 0.025), rough=0.35, metal=0.2)
grille = mat("grille", (0.03, 0.03, 0.035), rough=0.45, metal=0.5)
tire = mat("tire", (0.02, 0.02, 0.02), rough=0.85)
alloy = mat("alloy", (0.62, 0.63, 0.66), rough=0.22, metal=1.0)
disc = mat("brake_disc", (0.35, 0.36, 0.38), rough=0.3, metal=0.9)
caliper = mat("caliper", (0.55, 0.05, 0.05), rough=0.3, metal=0.4)
drl = mat("headlight", (0.9, 0.93, 1.0), rough=0.1, emit=(0.9, 0.95, 1.0), es=3.0)
tail = mat("taillight", (0.35, 0.02, 0.02), rough=0.15, emit=(1.0, 0.05, 0.05), es=3.5)


# ---- body (one object, bevel + subsurf for smooth curves) -------------------
L, W, H = 4.9, 1.9, 1.44
bm = bmesh.new()
# lower body volume (sills to shoulder line), gently tapered in plan
bm_box(bm, 0, 0, 0.62, W, L, 0.72, taper_top=0.94)
# hood + front clip (lower, sloping forward)
bm_box(bm, 0, L * 0.34, 0.9, W * 0.96, L * 0.32, 0.26, taper_top=0.9, taper_front=0.86)
# rear deck
bm_box(bm, 0, -L * 0.36, 0.92, W * 0.96, L * 0.28, 0.24, taper_top=0.92, taper_front=0.9)
# greenhouse / cabin (narrower, set back, raked front + rear)
bm_box(bm, 0, -0.15, 1.24, W * 0.82, L * 0.42, 0.5, taper_top=0.74)
body = obj_from_bm(bm, "car_body", paint)
bev = body.modifiers.new("bevel", type="BEVEL")
bev.width = 0.06
bev.segments = 2
sub = body.modifiers.new("subsurf", type="SUBSURF")
sub.levels = 2
sub.render_levels = 2

# ---- greenhouse glass -------------------------------------------------------
bmg = bmesh.new()
bm_box(bmg, 0, -0.15, 1.26, W * 0.78, L * 0.4, 0.46, taper_top=0.72)
gl = obj_from_bm(bmg, "car_glass_green", glass)
gb = gl.modifiers.new("bevel", type="BEVEL"); gb.width = 0.04; gb.segments = 2
gs = gl.modifiers.new("subsurf", type="SUBSURF"); gs.levels = 1

# ---- front + rear detail ----------------------------------------------------
det = bmesh.new()
# lower front splitter
bm_box(det, 0, L * 0.5 - 0.02, 0.28, W * 0.98, 0.08, 0.34)
# rear diffuser
bm_box(det, 0, -L * 0.5 + 0.04, 0.26, W * 0.9, 0.14, 0.3)
detail = obj_from_bm(det, "car_lower", blacktrim)
db = detail.modifiers.new("bevel", type="BEVEL"); db.width = 0.02; db.segments = 1

# twin grille intakes (de-badged: two plain mesh rectangles, not the kidney shape)
gr = bmesh.new()
bm_box(gr, -0.32, L * 0.5 + 0.0, 0.6, 0.5, 0.06, 0.34)
bm_box(gr, 0.32, L * 0.5 + 0.0, 0.6, 0.5, 0.06, 0.34)
grobj = obj_from_bm(gr, "car_grille", grille)

# LED head + tail light bars (emissive strips)
lt = bmesh.new()
bm_box(lt, -0.62, L * 0.5 - 0.05, 0.78, 0.5, 0.05, 0.12)   # L headlight
bm_box(lt, 0.62, L * 0.5 - 0.05, 0.78, 0.5, 0.05, 0.12)    # R headlight
head = obj_from_bm(lt, "car_headlights", drl)
lt2 = bmesh.new()
bm_box(lt2, 0, -L * 0.5 + 0.03, 0.86, W * 0.82, 0.05, 0.13)  # full-width tail bar
tailo = obj_from_bm(lt2, "car_taillights", tail)

# side mirrors
mr = bmesh.new()
bm_box(mr, W * 0.5 + 0.02, 0.55, 1.12, 0.16, 0.28, 0.14)
bm_box(mr, -W * 0.5 - 0.02, 0.55, 1.12, 0.16, 0.28, 0.14)
mirrors = obj_from_bm(mr, "car_mirrors", paint)
mb = mirrors.modifiers.new("bevel", type="BEVEL"); mb.width = 0.03; mb.segments = 2

# dual exhaust tips
ex1 = cylinder("exhaust_l", chrome, 0.07, 0.16, (-0.55, -L * 0.5 + 0.02, 0.25), axis="Y")
ex2 = cylinder("exhaust_r", chrome, 0.07, 0.16, (0.55, -L * 0.5 + 0.02, 0.25), axis="Y")


# ---- wheels (separate named nodes: alloy + tire + disc + caliper) -----------
def wheel(name, x, y):
    r_tire, r_alloy, width = 0.34, 0.24, 0.24
    parent = bpy.data.objects.new(name, None)
    parent.location = (x, y, r_tire)
    bpy.context.collection.objects.link(parent)
    t = cylinder(name + "_tire", tire, r_tire, width, (x, y, r_tire), axis="X", verts=28)
    a = cylinder(name + "_alloy", alloy, r_alloy, width * 0.5, (x + (0.04 if x > 0 else -0.04), y, r_tire), axis="X", verts=28)
    d = cylinder(name + "_disc", disc, 0.19, width * 0.35, (x, y, r_tire), axis="X", verts=24)
    c = bmesh.new()
    bm_box(c, x + (0.12 if x > 0 else -0.12), y, r_tire + 0.15, 0.06, 0.14, 0.16)
    cal = obj_from_bm(c, name + "_caliper", caliper, smooth=False)
    # multi-spoke: thin boxes across the alloy face
    sp = bmesh.new()
    for i in range(10):
        ang = i * math.pi / 5
        sx = math.cos(ang) * 0.12
        sz = math.sin(ang) * 0.12
        bm_box(sp, x + (0.06 if x > 0 else -0.06), y + sx, r_tire + sz, 0.03, 0.05, 0.24)
    spokes = obj_from_bm(sp, name + "_spokes", alloy, smooth=False)
    for o in (t, a, d, cal, spokes):
        o.parent = parent
    return parent


wb, tr = 2.9, 0.82  # wheelbase, half-track
wheel("wheel_FL", -tr, wb / 2)
wheel("wheel_FR", tr, wb / 2)
wheel("wheel_RL", -tr, -wb / 2)
wheel("wheel_RR", tr, -wb / 2)


# ---- world / lights / camera / render ---------------------------------------
def setup_and_render():
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
        bg.inputs[0].default_value = (0.8, 0.85, 0.95, 1.0)
    nt.links.new(bg.outputs[0], out.inputs[0])

    sun_d = bpy.data.lights.new("sun", type="SUN")
    sun_d.energy = 3.0
    sun_d.angle = math.radians(2)
    sun = bpy.data.objects.new("sun", sun_d)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(58), math.radians(10), math.radians(-40))

    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    grd = bpy.context.active_object
    grd.data.materials.append(mat("studio", (0.05, 0.05, 0.055), rough=0.35))

    tgt = bpy.data.objects.new("t", None)
    tgt.location = (0, 0, 0.7)
    bpy.context.collection.objects.link(tgt)
    cam_d = bpy.data.cameras.new("c")
    cam_d.lens = 50
    cam = bpy.data.objects.new("c", cam_d)
    bpy.context.collection.objects.link(cam)
    cam.location = (5.2, 5.6, 2.3)
    con = cam.constraints.new("TRACK_TO")
    con.target = tgt
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    bpy.context.scene.camera = cam

    sc = bpy.context.scene
    sc.render.resolution_x = 1600
    sc.render.resolution_y = 1000
    try:
        sc.view_settings.view_transform = "AgX"
    except Exception:
        sc.view_settings.view_transform = "Filmic"

    # EEVEE proxy
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
    sc.render.filepath = os.path.join(out_dir, "hero_car_eevee.png")
    sc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)

    # Cycles ceiling
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    sc.render.filepath = os.path.join(out_dir, "hero_car_cycles.png")
    bpy.ops.render.render(write_still=True)


setup_and_render()

# export whole car (wheels stay separate named nodes)
bpy.ops.object.select_all(action="DESELECT")
for o in bpy.context.scene.objects:
    if o.type in ("MESH", "EMPTY") and o.name not in ("sun", "c", "t", "studio", "Plane"):
        o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(out_dir, "hero_car.glb"),
    use_selection=True, export_format="GLB", export_apply=True, export_yup=True,
    export_cameras=False, export_lights=False,
)
glb = os.path.join(out_dir, "hero_car.glb")
print("HERO_CAR_OK glb_bytes=%d out=%s" % (os.path.getsize(glb) if os.path.exists(glb) else -1, out_dir))
