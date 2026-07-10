"""
STREETSCAPE v2 kit generator (headless Blender) — REF 1 promenade/parking dressing
+ REF 3 "leafy boulevard" greenery, per docs/simulation/70_VISUAL_REFERENCE_BRIEF.md
and the B4 dimensioned digest. Adds to (does not replace) streetscape.py v1.

Props (one GLB each; base at z=0, footprint centred on origin, cached materials,
face-material_index bmesh Builder — same conventions as glass_city_kit.py /
streetscape.py so the sim's instanced prop pipeline drops them straight in):

  PROMENADE SET (digest 15-18)
    promenade_paver_tile   6.0 x 3.0 m deck tile. NOTE ON PAVER APPROACH: fine
                           0.6 x 0.9 m running-bond joints are geometry *grooves*
                           here only as a distance read; the intended production
                           path is a tiling paver albedo/roughness texture on the
                           sim's ground material (like the markings.png decal
                           pipeline) — this tile carries the TWO-TONE BANDING that
                           must survive at 50 m: a 1.2 m dark cross band per 6 m
                           period + a continuous dark border course on the railing
                           line (place border edge toward the water).
    embankment_wall        4.0 m vertical canal-wall segment, 1.4 m tall,
                           0.4 m flat coping stone, shadow reveal groove.
    railing_run_6m         black metal guardrail 1.1 m, posts @1.5 m,
    railing_run_12m        20 mm balusters @120 mm centres (digest 17) —
                           longer runs = fewer instances along the promenade.
    promenade_lamp_double  modern double-globe pedestrian lamp, dark pole ~4.8 m,
                           two warm emissive globes (REF 1 lamp, upgraded head).

  PARKING-LOT KIT (digest 19-20)
    barrier_arm            entrance boom: housing + 3.0 m red/white striped arm
                           (down position), amber status light.
    bollard_yb             yellow-black hazard bollard 0.9 m, 168 mm dia.
    ticket_kiosk           pay/ticket column 1.15 m, angled screen, yellow band.
    wheel_stop             1.8 m concrete wheel stop, yellow reflective ends.

  ROADSIDE (REF 3)
    billboard_large        8 x 4 m blank ad panel on pole (generic light face,
    billboard_small        4 x 2 m variant) — faintly emissive so it reads lit;
                           sim can decal any fictional ad onto the face.
    bus_stop_shelter       4.0 m glass shelter: roof slab, tinted back glass,
                           end ad panel, teak bench inside.
    leafy_tree_a           mature round/spreading deciduous tree (~6.5 m).
    leafy_tree_b           tall oval deciduous tree (~8.5 m) — 2nd silhouette.
    lawn_edge_strip        4.0 x 2.0 m green lawn strip + concrete edge curb
                           (tiles along the boulevard between road and buildings).
    signage_strip          6.0 x 0.9 m blank emissive retail band (digest 13:
                           mount at +4.5 m over shopfront glazing; recolor the
                           emissive per instance for the occasional red strip).

All low-poly / instanced-friendly, <= 6 materials per prop. EEVEE contact sheet
rendered against the sim HDRI for judging.

    blender --background --python tools/blender/streetscape_v2.py -- <out_dir>
"""

import bpy
import bmesh
import sys
import os
import math
import mathutils
from mathutils import Matrix, Euler

# ---- output dir (arg after `--`) -------------------------------------------
argv = sys.argv
out_dir = None
if "--" in argv:
    extra = argv[argv.index("--") + 1:]
    if extra:
        out_dir = extra[0]
if not out_dir:
    out_dir = os.path.join(os.path.expanduser("~"), "streetscape-v2-out")
os.makedirs(out_dir, exist_ok=True)

HDRI = "E:/AI driver/platform/public/sim/env/sky_urban_1k.hdr"


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


def mat(name, rgb, rough=0.6, metal=0.0, emit=None, emit_strength=0.0, coat=0.0):
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


def M():
    return {
        # metals / frames
        "steel_black":  mat("steel_black", (0.045, 0.05, 0.055), rough=0.42, metal=0.85),
        "steel_dark":   mat("steel_dark", (0.10, 0.11, 0.12), rough=0.38, metal=0.80),
        # promenade paving (two-tone banding per digest 16)
        "paver_lt":     mat("paver_lt", (0.44, 0.41, 0.35), rough=0.86),
        "paver_dk":     mat("paver_dk", (0.11, 0.105, 0.10), rough=0.88),
        "paver_border": mat("paver_border", (0.07, 0.068, 0.066), rough=0.88),
        "paver_joint":  mat("paver_joint", (0.30, 0.28, 0.25), rough=0.9),
        # concrete
        "concrete_lt":  mat("concrete_lt", (0.80, 0.79, 0.75), rough=0.85),
        "concrete_mid": mat("concrete_mid", (0.63, 0.62, 0.59), rough=0.88),
        "coping":       mat("coping", (0.77, 0.76, 0.72), rough=0.8),
        # paint
        "paint_white":  mat("paint_white", (0.90, 0.90, 0.88), rough=0.5),
        "paint_red":    mat("paint_red", (0.66, 0.10, 0.08), rough=0.5),
        "paint_yellow": mat("paint_yellow", (0.93, 0.72, 0.07), rough=0.55),
        # lit surfaces
        "ad_face":      mat("ad_face", (0.90, 0.89, 0.86), rough=0.4,
                            emit=(1.0, 0.98, 0.92), emit_strength=1.1),
        "sign_lit":     mat("sign_lit", (0.80, 0.70, 0.50), rough=0.35,
                            emit=(1.0, 0.80, 0.45), emit_strength=1.8),
        "screen_lit":   mat("screen_lit", (0.04, 0.07, 0.11), rough=0.25,
                            emit=(0.35, 0.55, 0.95), emit_strength=1.6),
        "amber_lit":    mat("amber_lit", (0.4, 0.2, 0.02), rough=0.35,
                            emit=(1.0, 0.55, 0.08), emit_strength=2.5),
        "globe_lit":    mat("globe_lit", (0.9, 0.87, 0.8), rough=0.25,
                            emit=(1.0, 0.92, 0.74), emit_strength=3.0),
        # glass
        "glass_tint":   mat("glass_tint", (0.07, 0.09, 0.11), rough=0.12, metal=0.1),
        # greenery (deep summer greens — AgX + bright sun wash pale values to mint)
        "lawn":         mat("lawn", (0.075, 0.21, 0.045), rough=0.95),
        "lawn_hi":      mat("lawn_hi", (0.125, 0.30, 0.065), rough=0.9),
        "bark":         mat("bark", (0.24, 0.18, 0.12), rough=0.9),
        "leaf":         mat("leaf", (0.05, 0.155, 0.04), rough=0.85),
        "leaf_hi":      mat("leaf_hi", (0.10, 0.25, 0.065), rough=0.8),
        "leaf_deep":    mat("leaf_deep", (0.028, 0.095, 0.026), rough=0.9),
        # bench wood (bus shelter)
        "wood_teak":    mat("wood_teak", (0.44, 0.29, 0.16), rough=0.6),
        # contact sheet ground
        "asphalt":      mat("asphalt", (0.055, 0.056, 0.06), rough=0.92),
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

    def box(self, cx, cy, cz, sx, sy, sz, material):
        mi = self._mi(material)
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        c = [(cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
             (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
             (cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz),
             (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz)]
        v = [self.bm.verts.new(p) for p in c]
        for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                  (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]:
            self.bm.faces.new([v[i] for i in f]).material_index = mi

    def obox(self, cx, cy, cz, sx, sy, sz, material, rot=None):
        mi = self._mi(material)
        before = set(self.bm.faces)
        m = Matrix.Translation((cx, cy, cz))
        if rot is not None:
            m = m @ rot
        m = m @ Matrix.Diagonal((sx, sy, sz, 1.0))
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        self._tag(before, mi)

    def cyl(self, cx, cy, cz, r1, r2, h, material, seg=12, rot=None, caps=True):
        mi = self._mi(material)
        before = set(self.bm.faces)
        m = Matrix.Translation((cx, cy, cz))
        if rot is not None:
            m = m @ rot
        bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg,
                              radius1=r1, radius2=r2, depth=h, matrix=m)
        self._tag(before, mi)

    def ico(self, cx, cy, cz, r, material, subdiv=1, scale=(1, 1, 1)):
        mi = self._mi(material)
        before = set(self.bm.faces)
        m = Matrix.Translation((cx, cy, cz)) @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
        try:
            bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=r, matrix=m)
        except TypeError:
            bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, diameter=r * 2, matrix=m)
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


def rotx(deg):
    return Matrix.Rotation(math.radians(deg), 4, "X")


def roty(deg):
    return Matrix.Rotation(math.radians(deg), 4, "Y")


def rotz(deg):
    return Matrix.Rotation(math.radians(deg), 4, "Z")


# ===========================================================================
#  PROMENADE SET
# ===========================================================================

def prop_promenade_paver_tile(mtl):
    """6x3 m deck tile. Two-tone banding is geometry; fine joints are shallow
    grooves for the mid-distance read (production texture path noted in the
    module docstring). Long axis X = direction of travel; dark border course
    along y=-1.5 edge = the railing/water line."""
    b = Builder()
    L, W, T = 6.0, 3.0, 0.07
    b.box(0, 0, T / 2, L, W, T, mtl["paver_lt"])
    top = T
    # 1.2 m dark cross band at the tile start (6 m period when tiled along X)
    b.box(-L / 2 + 0.6, 0, top + 0.003, 1.2, W, 0.006, mtl["paver_dk"])
    # continuous dark border course along the railing line (y = -1.5 edge)
    b.box(0, -W / 2 + 0.17, top + 0.003, L, 0.34, 0.006, mtl["paver_border"])
    # shallow joint lines — transverse every 0.9 m, longitudinal every 0.6 m
    x = -L / 2 + 0.9
    while x < L / 2 - 0.05:
        b.box(x, 0, top + 0.002, 0.025, W, 0.004, mtl["paver_joint"])
        x += 0.9
    for y in (-0.9, -0.3, 0.3, 0.9):
        b.box(0, y, top + 0.002, L, 0.025, 0.004, mtl["paver_joint"])
    return b.finalize("promenade_paver_tile")


def prop_embankment_wall(mtl):
    """4 m canal-wall segment: base at z=0 = waterline, promenade deck sits at
    ~+1.35; 0.4 m coping. Water side faces -Y."""
    b = Builder()
    L, H = 4.0, 1.38
    b.box(0, 0, H / 2, L, 0.35, H, mtl["concrete_mid"])
    # shadow reveal groove just under the coping (water face)
    b.box(0, -0.170, H - 0.10, L, 0.025, 0.07, mtl["paver_border"])
    # flat coping stone, 0.45 wide, slight oversail both sides
    b.box(0, 0, H + 0.065, L, 0.45, 0.13, mtl["coping"])
    return b.finalize("embankment_wall")


def _railing_run(mtl, L, name):
    """Black metal guardrail 1.1 m tall (digest 17): posts @1.5 m, flat top
    rail 60x20, 20 mm balusters @120 mm centres."""
    b = Builder()
    H = 1.10
    steel = mtl["steel_black"]
    n_posts = int(round(L / 1.5)) + 1
    for i in range(n_posts):
        x = -L / 2 + i * (L / (n_posts - 1))
        b.box(x, 0, H / 2, 0.055, 0.055, H, steel)
    b.box(0, 0, H - 0.025, L, 0.09, 0.05, steel)     # flat top rail
    b.box(0, 0, 0.13, L, 0.045, 0.04, steel)         # bottom rail
    nb = int(L / 0.12) - 1
    for i in range(nb):
        x = -L / 2 + 0.12 + i * 0.12
        b.box(x, 0, (0.13 + H - 0.05) / 2 + 0.04, 0.02, 0.02, H - 0.22, steel)
    return b.finalize(name)


def prop_railing_run_6m(mtl):
    return _railing_run(mtl, 6.0, "railing_run_6m")


def prop_railing_run_12m(mtl):
    return _railing_run(mtl, 12.0, "railing_run_12m")


def prop_promenade_lamp_double(mtl):
    """Modern double-globe pedestrian lamp: dark tapering pole ~4.8 m, two
    short up-swept arms, warm emissive globes with steel caps."""
    b = Builder()
    steel = mtl["steel_black"]
    b.cyl(0, 0, 0.085, 0.19, 0.16, 0.17, mtl["steel_dark"], seg=14)
    ph = 4.55
    b.cyl(0, 0, 0.17 + ph / 2, 0.07, 0.048, ph, steel, seg=12)
    ztop = 0.17 + ph
    # collar + two up-swept arms (+X / -X)
    b.cyl(0, 0, ztop + 0.02, 0.06, 0.055, 0.10, mtl["steel_dark"], seg=10)
    for sx in (1, -1):
        b.obox(sx * 0.26, 0, ztop + 0.14, 0.52, 0.05, 0.05, steel,
               rot=roty(-sx * 24))
        gx, gz = sx * 0.47, ztop + 0.30
        b.ico(gx, 0, gz + 0.155, 0.155, mtl["globe_lit"], subdiv=2)
        b.cyl(gx, 0, gz + 0.33, 0.10, 0.045, 0.07, mtl["steel_dark"], seg=10)
    # centre finial
    b.cyl(0, 0, ztop + 0.12, 0.035, 0.012, 0.14, steel, seg=8)
    return b.finalize("promenade_lamp_double")


# ===========================================================================
#  PARKING-LOT KIT
# ===========================================================================

def prop_barrier_arm(mtl):
    """Entrance boom barrier, arm DOWN along +X: housing 1.0 m, 3.0 m boom
    with red/white 0.5 m stripes, amber status light on top."""
    b = Builder()
    b.box(0, 0, 0.50, 0.34, 0.30, 1.00, mtl["steel_dark"])
    b.box(0, 0, 1.02, 0.36, 0.32, 0.05, mtl["steel_black"])
    b.box(0, 0, 1.075, 0.16, 0.16, 0.06, mtl["amber_lit"])
    # pivot hub
    b.cyl(0.19, 0, 0.82, 0.09, 0.09, 0.10, mtl["steel_black"], seg=12,
          rot=roty(90))
    # boom: 6 x 0.5 m alternating white/red segments
    for i in range(6):
        m = mtl["paint_white"] if i % 2 == 0 else mtl["paint_red"]
        b.box(0.28 + 0.25 + i * 0.5, 0, 0.82, 0.5, 0.05, 0.10, m)
    # tip cap
    b.box(0.28 + 3.02, 0, 0.82, 0.05, 0.06, 0.11, mtl["steel_black"])
    return b.finalize("barrier_arm")


def prop_bollard_yb(mtl):
    """Yellow-black hazard bollard: 0.9 m tall, 168 mm dia (digest 19)."""
    b = Builder()
    H, r = 0.90, 0.084
    b.cyl(0, 0, H / 2, r, r * 0.94, H, mtl["paint_yellow"], seg=14)
    for z in (0.30, 0.62):
        b.cyl(0, 0, z, r + 0.004, r + 0.004, 0.14, mtl["steel_black"],
              seg=14, caps=False)
    b.cyl(0, 0, H + 0.02, r * 0.94, 0.045, 0.055, mtl["paint_yellow"], seg=14)
    return b.finalize("bollard_yb")


def prop_ticket_kiosk(mtl):
    """Parking pay/ticket column: 1.15 m body, angled blue-lit screen, ticket
    slot, yellow ID band."""
    b = Builder()
    b.box(0, 0, 0.575, 0.46, 0.40, 1.15, mtl["steel_dark"])
    b.box(0, 0, 1.175, 0.50, 0.44, 0.05, mtl["steel_black"])          # cap
    b.box(0, 0, 1.02, 0.47, 0.41, 0.09, mtl["paint_yellow"])          # ID band
    b.obox(0, -0.205, 0.86, 0.32, 0.035, 0.24, mtl["screen_lit"],
           rot=rotx(12))                                              # screen
    b.box(0, -0.205, 0.62, 0.26, 0.02, 0.035, mtl["steel_black"])     # slot
    return b.finalize("ticket_kiosk")


def prop_wheel_stop(mtl):
    """1.8 m concrete wheel stop, chamfered top, yellow reflective ends."""
    b = Builder()
    b.box(0, 0, 0.045, 1.80, 0.17, 0.09, mtl["concrete_lt"])
    b.obox(0, 0, 0.10, 1.80, 0.115, 0.06, mtl["concrete_lt"], rot=rotx(0))
    for sx in (1, -1):
        b.box(sx * 0.80, 0, 0.05, 0.18, 0.175, 0.10, mtl["paint_yellow"])
    return b.finalize("wheel_stop")


# ===========================================================================
#  ROADSIDE (REF 3)
# ===========================================================================

def _billboard(mtl, pw, phh, pole_h, name):
    """Blank ad billboard on a single steel pole. Panel face on -Y, faintly
    emissive so it reads lit; the sim decals fictional ads onto it."""
    b = Builder()
    b.cyl(0, 0, 0.06, 0.24, 0.22, 0.12, mtl["steel_dark"], seg=14)   # base
    r = 0.10 + pw * 0.012
    b.cyl(0, 0, pole_h / 2, r, r * 0.85, pole_h, mtl["steel_dark"], seg=12)
    cz = pole_h + phh / 2
    b.box(0, 0.02, cz, pw + 0.22, 0.16, phh + 0.22, mtl["steel_black"])  # frame
    b.box(0, -0.07, cz, pw, 0.04, phh, mtl["ad_face"])                    # face
    # top floodlight bar + two heads
    b.box(0, -0.30, pole_h + phh + 0.16, pw * 0.7, 0.05, 0.05, mtl["steel_black"])
    for sx in (1, -1):
        b.obox(sx * pw * 0.28, -0.30, pole_h + phh + 0.10, 0.14, 0.10, 0.08,
               mtl["steel_dark"], rot=rotx(35))
    return b.finalize(name)


def prop_billboard_large(mtl):
    return _billboard(mtl, 8.0, 4.0, 5.0, "billboard_large")


def prop_billboard_small(mtl):
    return _billboard(mtl, 4.0, 2.0, 3.2, "billboard_small")


def prop_bus_stop_shelter(mtl):
    """4.0 m glass shelter: dark roof slab, tinted back + one end glass, ad
    panel on the other end, teak bench. Open face toward -Y (the curb)."""
    b = Builder()
    steel = mtl["steel_dark"]
    W, D, H = 4.0, 1.40, 2.45
    # posts (4 corners)
    for x in (-W / 2 + 0.06, W / 2 - 0.06):
        for y in (-D / 2 + 0.06, D / 2 - 0.06):
            b.box(x, y, H / 2, 0.08, 0.08, H, steel)
    # roof slab + thin fascia
    b.box(0, 0, H + 0.045, W + 0.30, D + 0.30, 0.09, steel)
    b.box(0, 0, H - 0.02, W + 0.20, D + 0.20, 0.05, mtl["steel_black"])
    # back glass (full width) + left end glass
    b.box(0, D / 2 - 0.02, 0.15 + (H - 0.35) / 2, W - 0.24, 0.03, H - 0.35,
          mtl["glass_tint"])
    b.box(-W / 2 + 0.03, 0, 0.15 + (H - 0.35) / 2, 0.03, D - 0.24, H - 0.35,
          mtl["glass_tint"])
    # right end = lit ad panel (city-light)
    b.box(W / 2 - 0.05, 0, 0.30 + 0.9, 0.10, 0.94, 1.80, mtl["steel_black"])
    b.box(W / 2 - 0.11, 0, 0.30 + 0.9, 0.02, 0.80, 1.60, mtl["ad_face"])
    # teak bench along the back
    for y in (0.42, 0.55):
        b.box(-0.35, y, 0.46, 2.4, 0.11, 0.035, mtl["wood_teak"])
    for x in (-1.4, 0.7):
        b.box(x, 0.485, 0.22, 0.05, 0.30, 0.44, steel)
    # small route-number blade on the roof edge
    b.box(-W / 2 + 0.35, -D / 2 - 0.02, H + 0.32, 0.55, 0.05, 0.40,
          mtl["ad_face"])
    return b.finalize("bus_stop_shelter")


def prop_leafy_tree_a(mtl):
    """Mature ROUND/SPREADING deciduous tree (~6.5 m tall, ~4.5 m spread) —
    REF 3 boulevard lining tree, variant A."""
    b = Builder()
    bark, leaf = mtl["bark"], mtl["leaf"]
    th = 2.1
    b.cyl(0, 0, th / 2, 0.17, 0.12, th, bark, seg=10)
    # three main branch stubs reaching into the canopy
    for az, el in ((20, 48), (150, 52), (265, 45)):
        rot = rotz(az) @ roty(90 - el)
        d = rot.to_3x3() @ mathutils.Vector((0, 0, 1))
        b.obox(d.x * 0.6, d.y * 0.6, th - 0.2 + d.z * 0.6, 0.07, 0.07, 1.3,
               bark, rot=rot)
    # canopy: big core + satellites, darker under-blobs, lighter top tufts
    cz = th + 1.9
    b.ico(0, 0, cz, 1.65, leaf, subdiv=2, scale=(1.2, 1.15, 0.85))
    for (dx, dy, dz, r) in ((1.15, 0.3, -0.35, 0.85), (-1.05, -0.45, -0.30, 0.9),
                            (0.15, 1.05, -0.15, 0.8), (-0.3, -1.1, -0.25, 0.75),
                            (0.7, -0.7, 0.5, 0.7), (-0.75, 0.7, 0.45, 0.7)):
        b.ico(dx, dy, cz + dz, r, leaf, subdiv=1, scale=(1.05, 1.0, 0.85))
    for (dx, dy, dz, r) in ((0.5, 0.4, -1.0, 0.65), (-0.6, -0.3, -1.05, 0.6)):
        b.ico(dx, dy, cz + dz, r, mtl["leaf_deep"], subdiv=1)
    for (dx, dy) in ((0.55, 0.25), (-0.5, 0.4), (0.05, -0.55), (-0.15, 0.0)):
        b.ico(dx, dy, cz + 1.1, 0.5, mtl["leaf_hi"], subdiv=1,
              scale=(1.1, 1.05, 0.8))
    return b.finalize("leafy_tree_a")


def prop_leafy_tree_b(mtl):
    """Tall OVAL deciduous tree (~8.5 m) — variant B, different silhouette
    (linden/poplar read) so alternating instances break repetition."""
    b = Builder()
    bark, leaf = mtl["bark"], mtl["leaf"]
    th = 2.5
    b.cyl(0, 0, th / 2, 0.15, 0.10, th, bark, seg=10)
    b.cyl(0.05, 0, th + 0.7, 0.10, 0.05, 1.6, bark, seg=8)
    # tall oval canopy: a clean vertical stack, radius tapering to a tip
    cz = th + 2.0
    b.ico(0, 0, cz, 1.30, leaf, subdiv=2, scale=(1.0, 0.95, 1.35))
    for (dz, r) in ((1.35, 1.05), (2.45, 0.78), (3.30, 0.48)):
        b.ico(0.04 * dz, 0.02 * dz, cz + dz, r, leaf, subdiv=2,
              scale=(1.0, 0.95, 1.05))
    # side fill low on the crown + dark underside
    for (dx, dy, dz, r) in ((0.55, 0.3, -0.5, 0.7), (-0.55, -0.25, -0.35, 0.7),
                            (0.1, 0.55, 0.6, 0.65), (-0.15, -0.5, 1.0, 0.6)):
        b.ico(dx, dy, cz + dz, r, leaf, subdiv=1, scale=(1.0, 0.95, 1.0))
    b.ico(0, -0.3, cz - 0.95, 0.6, mtl["leaf_deep"], subdiv=1)
    for (dx, dy, dz) in ((0.25, 0.15, 2.0), (-0.3, -0.1, 1.1), (0.15, -0.3, 2.9)):
        b.ico(dx, dy, cz + dz, 0.38, mtl["leaf_hi"], subdiv=1)
    return b.finalize("leafy_tree_b")


def prop_lawn_edge_strip(mtl):
    """4.0 x 2.0 m lawn strip with a concrete edge curb along y=-1.0 (road
    side). Tiles along X between carriageway and buildings (REF 3 lawns)."""
    b = Builder()
    L, W = 4.0, 2.0
    b.box(0, 0.09, 0.045, L, W - 0.34, 0.09, mtl["lawn"])
    # lighter mow-stripe patches + a few soft tufts
    b.box(0, 0.42, 0.093, L, 0.55, 0.006, mtl["lawn_hi"])
    for (dx, dy, r) in ((-1.3, -0.15, 0.16), (0.2, 0.35, 0.14), (1.4, -0.3, 0.15),
                        (-0.4, 0.65, 0.13)):
        b.ico(dx, dy, 0.10, r, mtl["lawn_hi"], subdiv=1, scale=(1.3, 1.1, 0.45))
    # concrete edge curb (road side)
    b.box(0, -W / 2 + 0.11, 0.075, L, 0.22, 0.15, mtl["concrete_lt"])
    b.obox(0, -W / 2 + 0.045, 0.145, L, 0.045, 0.045, mtl["concrete_lt"],
           rot=rotx(45))
    return b.finalize("lawn_edge_strip")


def prop_signage_strip(mtl):
    """6.0 x 0.9 m blank retail signage band (digest 13): dark frame + warm
    emissive blank face on -Y. Mount above shopfront glazing at ~+4.5 m; tint
    the emissive per instance for the occasional red strip (REF 1)."""
    b = Builder()
    L, H = 6.0, 0.90
    b.box(0, 0, H / 2, L, 0.20, H, mtl["steel_black"])
    b.box(0, -0.105, H / 2, L - 0.16, 0.02, H - 0.16, mtl["sign_lit"])
    return b.finalize("signage_strip")


# ===========================================================================
#  CONTACT SHEET
# ===========================================================================

def setup_and_render(made, mtl, png_path, width=2000, height=1150):
    bpy.ops.mesh.primitive_plane_add(size=160, location=(0, 0, 0))
    bpy.context.active_object.data.materials.append(mtl["asphalt"])

    for name, obj, (gx, gy) in made:
        obj.location = (gx, gy, 0)

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
        bg.inputs[0].default_value = (0.6, 0.7, 0.85, 1.0)
    nt.links.new(bg.outputs[0], out.inputs[0])

    sun_data = bpy.data.lights.new("sun", type="SUN")
    sun_data.energy = 3.2
    sun_data.color = (1.0, 0.95, 0.85)
    sun_data.angle = math.radians(1.0)
    sun = bpy.data.objects.new("sun", sun_data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(54), math.radians(10), math.radians(135))

    tgt = bpy.data.objects.new("target", None)
    tgt.location = (0.5, 2.5, 2.0)
    bpy.context.collection.objects.link(tgt)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 36
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (14.0, -26.0, 13.0)
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
        sc.eevee.taa_render_samples = 64
        sc.eevee.use_raytracing = True
    except Exception:
        pass
    sc.render.resolution_x = width
    sc.render.resolution_y = height
    try:
        sc.view_settings.view_transform = "AgX"
    except Exception:
        sc.view_settings.view_transform = "Filmic"
    sc.render.filepath = png_path
    sc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)


# ===========================================================================
#  MAIN
# ===========================================================================
reset_scene()
mtl = M()

# (name, builder, contact-sheet slot)
KIT = [
    # back row — tall stuff
    ("billboard_large",       prop_billboard_large,       (-10.0, 14.0)),
    ("leafy_tree_a",          prop_leafy_tree_a,          (-1.0, 14.0)),
    ("leafy_tree_b",          prop_leafy_tree_b,          (4.0, 14.0)),
    ("billboard_small",       prop_billboard_small,       (10.5, 14.0)),
    # second row
    ("railing_run_12m",       prop_railing_run_12m,       (-5.0, 7.0)),
    ("bus_stop_shelter",      prop_bus_stop_shelter,      (5.5, 7.0)),
    ("promenade_lamp_double", prop_promenade_lamp_double, (11.5, 7.0)),
    # third row
    ("signage_strip",         prop_signage_strip,         (-9.0, 1.5)),
    ("embankment_wall",       prop_embankment_wall,       (-1.5, 1.5)),
    ("railing_run_6m",        prop_railing_run_6m,        (5.0, 1.5)),
    # front rows — ground-hugging + small
    ("promenade_paver_tile",  prop_promenade_paver_tile,  (-8.5, -4.0)),
    ("lawn_edge_strip",       prop_lawn_edge_strip,       (-1.5, -4.0)),
    ("barrier_arm",           prop_barrier_arm,           (3.0, -4.0)),
    ("bollard_yb",            prop_bollard_yb,            (7.5, -4.0)),
    ("ticket_kiosk",          prop_ticket_kiosk,          (9.5, -4.0)),
    ("wheel_stop",            prop_wheel_stop,            (12.0, -4.0)),
]

made = []
for name, fn, slot in KIT:
    obj = fn(mtl)
    made.append((name, obj, slot))

# per-object GLB export (at origin, before grid layout)
sizes = {}
for name, obj, _slot in made:
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
    print("  TRIS %-22s %6d" % (name, tris))

setup_and_render(made, mtl, os.path.join(out_dir, "streetscape_v2.png"))

total = sum(sizes.values())
print("STREETSCAPE_V2_OK props=%d total_raw_glb_bytes=%d out=%s" % (len(made), total, out_dir))
for n in sorted(sizes):
    print("  RAW %-22s %8d B" % (n, sizes[n]))
