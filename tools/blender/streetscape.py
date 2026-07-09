"""
Modern waterfront ROADS + STREETSCAPE kit generator (headless Blender).

Authors the street-furniture layer for the Книжка.AI driving simulator to match
the founder reference: a clean modern waterfront financial district — wide asphalt
boulevards with crisp painted lane markings, a palm-lined promenade, black steel
railings, decorative street lamps, organized order. Everything fictional/generic.

Two deliverables come out of one run:

  1. A KIT of low-poly, PBR-ish props, one GLB each (baked geometry, cached
     materials, base at z=0, footprint centred on origin — same conventions as
     glass_city_kit.py / sofia_buildings.py so the sim's instanced prop pipeline
     can drop them straight in):
        street_lamp · railing_segment · bollard · bench · trash_bin ·
        planter · curb_segment · palm_tree · ornamental_tree

  2. A crisp road-marking DECAL ATLAS (1024², transparent PNG) authored pixel-exact
     with numpy (2× supersampled for clean edges): dashed centre line, solid lane
     line, double solid line (bonus), zebra crosswalk, stop line. A sidecar
     markings.json gives the sub-rect for each element so the sim can lay any one
     as a decal on the procedural asphalt. Longitudinal cells tile along their
     length; the crosswalk tiles across the road width.

Plus an EEVEE contact-sheet render (props grid on asphalt + a demo road tile that
lays the markings in context) so quality can be judged without the browser.

    blender --background --python tools/blender/streetscape.py -- <out_dir>

Only geometry + materials are nailed here; sim wiring (loader / decal placement)
is done later, perf-aware, by the founder.
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
    out_dir = os.path.join(os.path.expanduser("~"), "streetscape-out")
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


# Modern waterfront palette --------------------------------------------------
def M():
    return {
        "steel_black":  mat("steel_black", (0.045, 0.05, 0.055), rough=0.42, metal=0.85),
        "steel_dark":   mat("steel_dark", (0.10, 0.11, 0.12), rough=0.38, metal=0.80),
        "steel_bright": mat("steel_bright", (0.52, 0.55, 0.58), rough=0.30, metal=0.90),
        "lamp_head":    mat("lamp_head", (0.14, 0.15, 0.16), rough=0.35, metal=0.75),
        "lamp_lit":     mat("lamp_lit", (0.06, 0.06, 0.06), rough=0.3,
                            emit=(1.0, 0.93, 0.78), emit_strength=3.2),
        "reflect_band": mat("reflect_band", (0.86, 0.87, 0.90), rough=0.28, metal=0.2),
        "wood_teak":    mat("wood_teak", (0.44, 0.29, 0.16), rough=0.6),
        "concrete_lt":  mat("concrete_lt", (0.80, 0.79, 0.75), rough=0.85),
        "concrete_mid": mat("concrete_mid", (0.66, 0.65, 0.62), rough=0.88),
        "soil":         mat("soil", (0.11, 0.08, 0.06), rough=1.0),
        "leaf":         mat("leaf", (0.19, 0.40, 0.17), rough=0.8),
        "leaf_hi":      mat("leaf_hi", (0.30, 0.52, 0.24), rough=0.75),
        "palm_frond":   mat("palm_frond", (0.22, 0.42, 0.16), rough=0.7),
        "palm_trunk":   mat("palm_trunk", (0.46, 0.36, 0.24), rough=0.9),
        "bark":         mat("bark", (0.30, 0.24, 0.18), rough=0.9),
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
        """Axis-aligned box (fast, clean quads)."""
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
        """Oriented box via create_cube + matrix (for angled arms / slats / fronds)."""
        mi = self._mi(material)
        before = set(self.bm.faces)
        m = Matrix.Translation((cx, cy, cz))
        if rot is not None:
            m = m @ rot
        m = m @ Matrix.Diagonal((sx, sy, sz, 1.0))
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        self._tag(before, mi)

    def cyl(self, cx, cy, cz, r1, r2, h, material, seg=12, rot=None, caps=True):
        """Cone/cylinder along local +Z, centred at (cx,cy,cz)."""
        mi = self._mi(material)
        before = set(self.bm.faces)
        m = Matrix.Translation((cx, cy, cz))
        if rot is not None:
            m = m @ rot
        bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg,
                              radius1=r1, radius2=r2, depth=h, matrix=m)
        self._tag(before, mi)

    def ico(self, cx, cy, cz, r, material, subdiv=1, scale=(1, 1, 1)):
        """Low-poly icosphere blob (foliage)."""
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
#  PROPS  (each returns an object, base at z=0, centred on origin)
# ===========================================================================

def prop_street_lamp(mtl):
    b = Builder()
    # base plinth
    b.cyl(0, 0, 0.09, 0.20, 0.17, 0.18, mtl["steel_dark"], seg=14)
    # tapering pole
    ph = 6.0
    b.cyl(0, 0, 0.18 + ph / 2, 0.075, 0.05, ph, mtl["steel_black"], seg=12)
    ztop = 0.18 + ph
    # single sleek angled arm reaching over the road (+X)
    arm_len = 1.15
    b.obox(0.55, 0, ztop - 0.05, arm_len, 0.07, 0.07, mtl["steel_black"],
           rot=Euler((0, math.radians(-14), 0)).to_matrix().to_4x4())
    # luminaire head (flat modern LED bar) at arm end, slight downward tilt
    hx = 1.02
    b.obox(hx, 0, ztop - 0.20, 0.55, 0.24, 0.10, mtl["lamp_head"],
           rot=Euler((0, math.radians(-8), 0)).to_matrix().to_4x4())
    # emissive underside panel (night glow)
    b.obox(hx, 0, ztop - 0.255, 0.46, 0.20, 0.02, mtl["lamp_lit"],
           rot=Euler((0, math.radians(-8), 0)).to_matrix().to_4x4())
    return b.finalize("street_lamp")


def prop_railing_segment(mtl):
    b = Builder()
    W = 2.0          # segment width (tiles along the promenade)
    H = 1.10
    steel = mtl["steel_black"]
    # end posts
    for x in (-W / 2 + 0.03, W / 2 - 0.03):
        b.box(x, 0, H / 2, 0.06, 0.06, H, steel)
    # top rail (flat bar) + a slim lower rail
    b.box(0, 0, H - 0.03, W, 0.09, 0.06, steel)
    b.box(0, 0, 0.14, W, 0.05, 0.04, steel)
    # vertical balusters
    n = 13
    for i in range(n):
        x = -W / 2 + 0.14 + i * ((W - 0.28) / (n - 1))
        b.box(x, 0, (0.14 + H - 0.03) / 2, 0.018, 0.018, (H - 0.06) - 0.14, steel)
    return b.finalize("railing_segment")


def prop_bollard(mtl):
    b = Builder()
    H = 0.90
    b.cyl(0, 0, H / 2, 0.085, 0.075, H, mtl["steel_black"], seg=16)
    # domed cap
    b.cyl(0, 0, H + 0.02, 0.085, 0.055, 0.06, mtl["steel_bright"], seg=16)
    # hi-vis reflective band near the top
    b.cyl(0, 0, H - 0.14, 0.088, 0.088, 0.05, mtl["reflect_band"], seg=16, caps=False)
    return b.finalize("bollard")


def prop_bench(mtl):
    b = Builder()
    L = 1.80
    frame = mtl["steel_black"]
    wood = mtl["wood_teak"]
    seat_z = 0.44
    # two side frames (leg + seat bracket) as simple boxes
    for x in (-L / 2 + 0.16, L / 2 - 0.16):
        b.box(x, 0.0, seat_z / 2, 0.05, 0.50, seat_z, frame)          # leg slab
        b.box(x, -0.02, seat_z + 0.02, 0.05, 0.56, 0.05, frame)       # seat bracket
    # seat slats (teak)
    for j, y in enumerate((-0.20, -0.07, 0.06, 0.19)):
        b.box(0, y, seat_z + 0.05, L - 0.10, 0.10, 0.035, wood)
    # low back (two slats), slightly reclined
    back_x = 0
    for k, z in enumerate((seat_z + 0.20, seat_z + 0.34)):
        b.obox(back_x, 0.24, z, L - 0.16, 0.035, 0.10, wood,
               rot=rotx(-12))
    # back support posts
    for x in (-L / 2 + 0.16, L / 2 - 0.16):
        b.obox(x, 0.25, seat_z + 0.22, 0.045, 0.045, 0.44, frame, rot=rotx(-12))
    return b.finalize("bench")


def prop_trash_bin(mtl):
    b = Builder()
    steel = mtl["steel_dark"]
    wood = mtl["wood_teak"]
    # short stem foot
    b.cyl(0, 0, 0.03, 0.14, 0.14, 0.06, steel, seg=16)
    b.cyl(0, 0, 0.20, 0.06, 0.06, 0.30, steel, seg=10)
    # drum body (wood-slat look via a wood cylinder + thin steel rings)
    by, bh = 0.62, 0.62
    b.cyl(0, 0, by, 0.215, 0.205, bh, wood, seg=18)
    b.cyl(0, 0, by - bh / 2 + 0.03, 0.225, 0.225, 0.045, steel, seg=18, caps=False)
    b.cyl(0, 0, by + bh / 2 - 0.03, 0.225, 0.225, 0.045, steel, seg=18, caps=False)
    # lid rim + slightly domed top with a dark aperture read
    top = by + bh / 2
    b.cyl(0, 0, top + 0.04, 0.235, 0.22, 0.08, steel, seg=18)
    b.cyl(0, 0, top + 0.10, 0.18, 0.14, 0.05, mtl["soil"], seg=14)
    return b.finalize("trash_bin")


def prop_planter(mtl):
    b = Builder()
    W, Dp, H = 1.20, 0.50, 0.52
    stone = mtl["concrete_lt"]
    # outer box + a thin top lip
    b.box(0, 0, H / 2, W, Dp, H, stone)
    b.box(0, 0, H + 0.02, W + 0.06, Dp + 0.06, 0.05, mtl["concrete_mid"])
    # recessed soil
    b.box(0, 0, H - 0.05, W - 0.16, Dp - 0.16, 0.06, mtl["soil"])
    # low clipped shrub — a couple of overlapping foliage blobs (manicured)
    for (dx, r) in ((-0.34, 0.24), (0.0, 0.28), (0.34, 0.24)):
        b.ico(dx, 0, H + 0.20, r, mtl["leaf"], subdiv=1, scale=(1.15, 0.9, 0.85))
    b.ico(0.0, 0.0, H + 0.30, 0.20, mtl["leaf_hi"], subdiv=1, scale=(1.1, 0.9, 0.8))
    return b.finalize("planter")


def prop_curb_segment(mtl):
    b = Builder()
    L = 2.0          # tiles along the kerb line
    stone = mtl["concrete_lt"]
    # raised kerb stone
    b.box(0, 0, 0.08, L, 0.16, 0.16, stone)
    # chamfered top edge facing the road (+Y) — a thin bevel strip
    b.obox(0, 0.075, 0.15, L, 0.05, 0.05, stone, rot=rotx(45))
    # flush gutter slab on the road side
    b.box(0, 0.22, 0.015, L, 0.28, 0.03, mtl["concrete_mid"])
    return b.finalize("curb_segment")


def prop_palm_tree(mtl):
    b = Builder()
    trunk = mtl["palm_trunk"]
    frond = mtl["palm_frond"]
    frond_hi = mtl["leaf_hi"]

    def blade(start, az, elev, length, width, thick, m):
        """One flat leaf blade: local +Z aligned to (az,elev). Returns its tip."""
        R = rotz(az) @ roty(90 - elev)
        dirv = R.to_3x3() @ mathutils.Vector((0, 0, 1))
        s = mathutils.Vector(start)
        c = s + dirv * (length / 2)
        b.obox(c.x, c.y, c.z, width, thick, length, m, rot=R)
        return s + dirv * length

    # segmented, slightly leaning trunk
    segs, seg_h, lean = 6, 0.60, 0.16
    z, cx = 0.0, 0.0
    for i in range(segs):
        t = i / (segs - 1)
        rr = 0.16 * (1 - 0.40 * t)
        cx = lean * (t ** 1.5)
        b.cyl(cx, 0, z + seg_h / 2, rr + 0.015, rr, seg_h, trunk, seg=9)
        b.cyl(cx, 0, z + seg_h, rr + 0.02, rr + 0.02, 0.05, trunk, seg=9, caps=False)
        z += seg_h
    crown = (cx, 0.0, z + 0.05)
    b.ico(crown[0], crown[1], crown[2], 0.14, trunk, subdiv=1)

    # full drooping crown — each frond is a 2-segment arc (up then droop down)
    nf = 14
    for i in range(nf):
        az = (360.0 / nf) * i + (7 if i % 2 else 0)
        m = frond_hi if i % 4 == 0 else frond
        e1 = blade(crown, az, 15, 0.95, 0.22, 0.03, m)   # inner: near-horizontal, slight lift
        blade(e1, az, -44, 1.20, 0.13, 0.028, m)         # outer: droops down
    # short upright central spears
    for j in range(4):
        blade(crown, 90 * j + 22, 66, 0.75, 0.10, 0.03, frond)
    # green boss cluster fills the join
    for j in range(3):
        R = rotz(120 * j) @ roty(85)
        d = R.to_3x3() @ mathutils.Vector((0, 0, 1))
        p = mathutils.Vector(crown) + d * 0.18
        b.ico(p.x, p.y, p.z - 0.05, 0.11, frond, subdiv=1, scale=(1, 1, 0.7))
    return b.finalize("palm_tree")


def prop_ornamental_tree(mtl):
    b = Builder()
    bark = mtl["bark"]
    leaf = mtl["leaf"]
    leaf_hi = mtl["leaf_hi"]
    # straight tidy trunk
    th = 1.6
    b.cyl(0, 0, th / 2, 0.11, 0.085, th, bark, seg=10)
    # a couple of stub branches
    for az in (30, 200):
        rot = rotz(az) @ Euler((0, math.radians(55), 0)).to_matrix().to_4x4()
        dirv = rot.to_3x3() @ mathutils.Vector((0, 0, 1))
        b.obox(dirv.x * 0.35, dirv.y * 0.35, th - 0.1 + dirv.z * 0.35,
               0.05, 0.05, 0.7, bark, rot=rot)
    # rounded manicured canopy — overlapping low-poly blobs
    cz = th + 0.75
    b.ico(0, 0, cz, 0.95, leaf, subdiv=2, scale=(1.0, 1.0, 0.92))
    for (dx, dy, dz, r) in ((0.55, 0.1, 0.25, 0.55), (-0.5, -0.2, 0.2, 0.55),
                            (0.1, 0.55, 0.35, 0.5), (0.0, -0.45, 0.45, 0.5)):
        b.ico(dx, dy, cz + dz, r, leaf, subdiv=1, scale=(1.0, 1.0, 0.9))
    # a few lighter highlight tufts up top
    for (dx, dy) in ((0.3, 0.2), (-0.25, 0.15), (0.0, -0.3)):
        b.ico(dx, dy, cz + 0.7, 0.34, leaf_hi, subdiv=1, scale=(1.0, 1.0, 0.85))
    return b.finalize("ornamental_tree")


# ===========================================================================
#  ROAD-MARKING DECAL ATLAS  (numpy, pixel-exact, 2x supersampled)
# ===========================================================================

def build_marking_atlas(png_path, json_path, res=1024, ss=2):
    import numpy as np
    import json

    AT = res * ss
    arr = np.zeros((AT, AT, 4), dtype=np.float32)      # row 0 = TOP (design space)
    WHITE = (0.96, 0.96, 0.94)

    def paint(x0, x1, y0, y1):
        xa, xb = int(round(x0 * ss)), int(round(x1 * ss))
        ya, yb = int(round(y0 * ss)), int(round(y1 * ss))
        arr[ya:yb, xa:xb, 0] = WHITE[0]
        arr[ya:yb, xa:xb, 1] = WHITE[1]
        arr[ya:yb, xa:xb, 2] = WHITE[2]
        arr[ya:yb, xa:xb, 3] = 1.0

    # --- cells (final 1024 px, y measured from top) ---
    cells = {}

    # 1) SOLID lane line — cell x[0..128], line centred x=64 (tiles trivially)
    paint(50, 78, 0, res)
    cells["line_solid"] = [0, 0, 128, res]

    # 2) DASHED centre line — cell x[128..256]; 4 dashes: on 112 / off 144 (period 256)
    period = 256
    for k in range(res // period):
        y = k * period
        paint(178, 206, y + 16, y + 128)     # 112 tall dash
    cells["line_dashed"] = [128, 0, 256, res]

    # 3) DOUBLE solid (no-overtaking) — cell x[256..384], two bars
    paint(300, 318, 0, res)
    paint(326, 344, 0, res)
    cells["line_double"] = [256, 0, 384, res]

    # 4) ZEBRA crosswalk — cell x[416..1024], y[24..312]; 8 vertical bars on38/off38
    cw_x0, cw_x1, cw_y0, cw_y1 = 416, 1024, 24, 312
    bar_period = 76
    n_bars = (cw_x1 - cw_x0) // bar_period          # 8
    for i in range(n_bars):
        bx = cw_x0 + i * bar_period
        paint(bx, bx + 38, cw_y0, cw_y1)
    cells["crosswalk"] = [cw_x0, cw_y0, cw_x0 + n_bars * bar_period, cw_y1]

    # 5) STOP line — solid transverse bar, cell x[416..1008], y[392..452]
    paint(416, 1008, 392, 452)
    cells["stop_line"] = [416, 360, 1008, 484]

    # --- 2x box-downsample for clean anti-aliased edges ---
    if ss > 1:
        arr = arr.reshape(res, ss, res, ss, 4).mean(axis=(1, 3))

    # --- write PNG via a Blender image (row 0 must be BOTTOM) ---
    img = bpy.data.images.new("road_markings", width=res, height=res, alpha=True)
    img.colorspace_settings.name = "sRGB"
    flat = np.flipud(arr).astype(np.float32).reshape(-1)
    img.pixels.foreach_set(flat)
    img.filepath_raw = png_path
    img.file_format = "PNG"
    img.save()

    # --- sidecar atlas map (px rect + normalized GL UVs, v flipped bottom-up) ---
    def norm(rect):
        x0, y0, x1, y1 = rect
        return {
            "px": [x0, y0, x1, y1],
            "uv": [x0 / res, 1 - y1 / res, x1 / res, 1 - y0 / res],
        }
    meta = {
        "image": os.path.basename(png_path),
        "size": res,
        "note": "Transparent decal atlas. White = paint (alpha 1). "
                "Longitudinal cells (line_*) tile along +V; crosswalk tiles along U.",
        "cells": {k: norm(v) for k, v in cells.items()},
        "tiling": {
            "line_solid": "V", "line_dashed": "V", "line_double": "V",
            "crosswalk": "U", "stop_line": "none",
        },
    }
    with open(json_path, "w") as f:
        json.dump(meta, f, indent=2)
    return img, cells


# ===========================================================================
#  CONTACT SHEET  (props grid on asphalt + a demo road tile using the atlas)
# ===========================================================================

def marking_material(img):
    m = bpy.data.materials.new("road_marking_decal")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Linear"
    tex.extension = "EXTEND"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Emission Strength"].default_value = 0.5
    bsdf.inputs["Roughness"].default_value = 0.6
    for attr, val in (("blend_method", "BLEND"), ("shadow_method", "NONE"),
                      ("surface_render_method", "BLENDED")):
        try:
            setattr(m, attr, val)
        except Exception:
            pass
    m.use_backface_culling = False
    return m


def decal_quad(name, x0, y0, x1, y1, z, uv, decal_mat, tile_v=1.0, tile_u=1.0):
    """Flat quad on the ground (z up), UV-mapped to a sub-rect of the atlas."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    v = [bm.verts.new((x0, y0, z)), bm.verts.new((x1, y0, z)),
         bm.verts.new((x1, y1, z)), bm.verts.new((x0, y1, z))]
    f = bm.faces.new(v)
    uvl = bm.loops.layers.uv.new()
    u0, vv0, u1, vv1 = uv
    # (v0..v1) span, tiled by tile_* (image extension handles repeat if >1)
    coords = [(u0, vv0), (u0 + (u1 - u0) * tile_u, vv0),
              (u0 + (u1 - u0) * tile_u, vv0 + (vv1 - vv0) * tile_v),
              (u0, vv0 + (vv1 - vv0) * tile_v)]
    for loop, c in zip(f.loops, coords):
        loop[uvl].uv = c
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(decal_mat)
    bpy.context.collection.objects.link(obj)
    return obj


def setup_and_render(made, mtl, atlas_img, cells, png_path, width=1800, height=1000):
    # ground asphalt
    bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, 0))
    bpy.context.active_object.data.materials.append(mtl["asphalt"])

    # ---- demo road tile: asphalt patch showing the markings in context ----
    # sits front-and-centre in the foreground so the decals are fully legible.
    px, py = 1.5, -9.4
    bpy.ops.mesh.primitive_plane_add(size=1, location=(px, py, 0.005))
    patch = bpy.context.active_object
    patch.scale = (4.6, 5.4, 1)          # half-extents 2.3 x 2.7
    patch.data.materials.append(mtl["asphalt"])
    dm = marking_material(atlas_img)

    # normalized (GL) UVs from the atlas cells (px rects, v flipped bottom-up)
    def uv(key):
        x0, y0, x1, y1 = cells[key]
        return (x0 / 1024, 1 - y1 / 1024, x1 / 1024, 1 - y0 / 1024)

    z = 0.02
    # two edge solid lines
    decal_quad("d_solid_l", px - 1.6, py - 2.4, px - 1.3, py + 2.0, z, uv("line_solid"), dm, tile_v=1)
    decal_quad("d_solid_r", px + 1.3, py - 2.4, px + 1.6, py + 2.0, z, uv("line_solid"), dm, tile_v=1)
    # centre dashed (two stacked tiles for a longer run)
    decal_quad("d_dash_a", px - 0.16, py - 2.4, px + 0.16, py - 0.2, z, uv("line_dashed"), dm, tile_v=1)
    decal_quad("d_dash_b", px - 0.16, py - 0.2, px + 0.16, py + 2.0, z, uv("line_dashed"), dm, tile_v=1)
    # stop line then zebra crosswalk near the far edge
    decal_quad("d_stop", px - 1.6, py + 2.05, px + 1.6, py + 2.28, z, uv("stop_line"), dm)
    decal_quad("d_cross", px - 1.6, py + 2.35, px + 1.6, py + 2.6, z, uv("crosswalk"), dm, tile_u=1)

    # ---- lay props on a grid ----
    for name, obj, (gx, gy) in made:
        obj.location = (gx, gy, 0)

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
        bg.inputs[0].default_value = (0.6, 0.7, 0.85, 1.0)
    nt.links.new(bg.outputs[0], out.inputs[0])

    # sun
    sun_data = bpy.data.lights.new("sun", type="SUN")
    sun_data.energy = 3.2
    sun_data.color = (1.0, 0.95, 0.85)
    sun_data.angle = math.radians(1.0)
    sun = bpy.data.objects.new("sun", sun_data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(54), math.radians(10), math.radians(135))

    # camera — elevated 3/4 framing the whole grid
    tgt = bpy.data.objects.new("target", None)
    tgt.location = (0.5, -2.0, 1.8)
    bpy.context.collection.objects.link(tgt)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 38
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (15.5, -25.0, 13.5)
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

# 1) marking atlas (also loaded for the contact sheet)
atlas_img, cells = build_marking_atlas(
    os.path.join(out_dir, "markings.png"),
    os.path.join(out_dir, "markings.json"),
)

# 2) build props + grid slots (name -> builder fn, grid x, grid y)
GX = [-8.5, -4.25, 0.0, 4.25, 8.5]
ROW0, ROW1 = 3.5, -3.0
KIT = [
    ("street_lamp",     prop_street_lamp,     (GX[0], ROW0)),
    ("railing_segment", prop_railing_segment, (GX[1], ROW0)),
    ("bollard",         prop_bollard,         (GX[2], ROW0)),
    ("bench",           prop_bench,           (GX[3], ROW0)),
    ("trash_bin",       prop_trash_bin,       (GX[4], ROW0)),
    ("planter",         prop_planter,         (GX[0], ROW1)),
    ("curb_segment",    prop_curb_segment,    (GX[1], ROW1)),
    ("palm_tree",       prop_palm_tree,       (GX[2], ROW1)),
    ("ornamental_tree", prop_ornamental_tree, (GX[3], ROW1)),
    # GX[4],ROW1 is where the marking demo tile goes (built in setup_and_render)
]

made = []
for name, fn, slot in KIT:
    obj = fn(mtl)
    made.append((name, obj, slot))

# 3) export each prop as its own GLB (origin at base, before grid layout)
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

# 4) contact sheet
setup_and_render(made, mtl, atlas_img, cells,
                 os.path.join(out_dir, "streetscape_kit.png"))

total = sum(sizes.values())
print("STREETSCAPE_OK props=%d total_raw_glb_bytes=%d out=%s" % (len(made), total, out_dir))
for n in sorted(sizes):
    print("  RAW %-18s %8d B" % (n, sizes[n]))
