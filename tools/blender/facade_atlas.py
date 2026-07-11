"""
DEPRECATED — superseded by tools/blender/facade_gen.mjs (Node + sharp).

This Cycles strip-board bake proved fragile in headless Blender and shipped
EMPTY / flat-white textures (degenerate normals, near-empty color). The facade
sets are now authored PROCEDURALLY by facade_gen.mjs, which writes the SAME
work/facade_bakes/<set>/{color,normal,orm,emissive}.png + layout.json contract
that pack_textures.mjs and district_kit_v3.py consume. Do NOT run this script to
regenerate the shipped textures — it will overwrite the good procedural bakes.
Kept only for reference / a future Cycles-based re-derivation.

Facade strip-board Cycles bakes — doc 71 §4.5 Phase 4 (facade kit v4).

Authors the district's facade TEXTURES from small high-detail "strip board"
scenes: each of the four REF-1 facade systems (concrete punched grid / cream
vertical strips / bronze curtain wall / white horizontal bands) is built as
REAL 3D geometry (0.5 m window recesses, projecting fins, mullion grids,
band soffits) and baked orthographically onto a seamless tiling texture, so
the runtime gets REAL recess normals + AO — the #1 thing the flat prisms and
flat-color kit lacked (doc 71 root cause #3).

Outputs (tools/blender/work/facade_bakes/<set>/):
  color.png     albedo, sRGB           512² bays / 1024² trim
  normal.png    tangent-space, linear
  orm.png       R=AO  G=roughness  B=metalness, linear
  emissive.png  lit windows / signage / storefronts, sRGB (LDR; HDR intensity
                is applied at runtime via material.emissiveIntensity)
  layout.json   tile dims + trim strip V-ranges (shared contract with
                district_kit_v3.py and the runtime loader)

Bay tile = 12.0 m (U) x 11.4 m (V = 3 floors x 3.8). Trim atlas = 12.0 m (U)
x 13.7 m of stacked strips. All materials procedural (self-made, CC0-safe —
no downloads, deterministic).

Previews (tools/blender/previews/):
  facade_bake_tiles.png — every baked set on a 2x2-tiled quad under the sim
  HDRI + a low warm sun, EEVEE: verifies seamlessness, recess normal read,
  AO depth and lit-window scatter before the kit consumes the maps.

    blender --background --python tools/blender/facade_atlas.py -- [out_dir]
"""

import bpy
import bmesh
import json
import math
import os
import sys

# ---------------------------------------------------------------------------
# paths / args
# ---------------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv
out_dir = None
if "--" in argv:
    extra = argv[argv.index("--") + 1:]
    if extra:
        out_dir = extra[0]
if not out_dir:
    out_dir = os.path.join(HERE, "work", "facade_bakes")
os.makedirs(out_dir, exist_ok=True)
PREVIEW_DIR = os.path.join(HERE, "previews")
os.makedirs(PREVIEW_DIR, exist_ok=True)
HDRI = "E:/AI driver/platform/public/sim/env/shanghai_riverside_1k.hdr"

# ---------------------------------------------------------------------------
# shared tile contract (mirrored into layout.json)
# ---------------------------------------------------------------------------
FLOOR_H = 3.8
TILE_U = 12.0                 # bay texture world width  (m)
TILE_V = 3 * FLOOR_H          # bay texture world height (m) = 11.4
BAY_RES = 512
TRIM_RES = 1024
TRIM_TILE_U = 12.0

# trim strips: (name, z0, z1) in board metres, bottom-up; 0.3 m dead gutters
# between strips get filled by the bake margin (EXTEND) from both sides.
TRIM_STRIPS = {
    "podium":  (0.0, 4.5),    # stone coursing incl. dark plinth 0–0.6
    "retail":  (4.8, 8.7),    # 3.9 m storefront glazing band, ~40 % lit
    "parapet": (9.0, 11.2),   # neutral concrete slab, 45°-chamfer top edge
    "sign":    (11.5, 12.4),  # red signage strip, emissive lettering
    "louver":  (12.7, 13.7),  # dark metal louver blades (crowns, canopies)
}
TRIM_TOTAL_V = 13.7

# per-system bay module (whole-bay U offsets snap to this at kit build time)
BAY_MODULE = {"grid": 3.0, "strip": 2.4, "curtain": 1.5, "band": 3.0}
LIT_PCT = {"grid": 30, "strip": 22, "curtain": 35, "band": 20}

# ---------------------------------------------------------------------------
# deterministic lit-cell hash (mirrors district_kit_v3.is_lit)
# ---------------------------------------------------------------------------


def is_lit(c, f, key, pct):
    h = (c * 73856093) ^ (f * 19349663) ^ (key * 83492791)
    return (h % 100) < pct


def cell_hash(c, f, key):
    return ((c * 73856093) ^ (f * 19349663) ^ (key * 83492791)) & 0x7FFFFFFF


# ---------------------------------------------------------------------------
# procedural materials (all self-made — CC0-safe by construction)
# ---------------------------------------------------------------------------
_mats = {}


def _principled(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree.nodes.get("Principled BSDF"), m.node_tree


def mat_concrete(name, rgb, rough=0.78, metal=0.0, grain=1.0):
    """Concrete/precast/stone: noise-grained color + roughness + fine bump."""
    if name in _mats:
        return _mats[name]
    m, b, nt = _principled(name)
    m["bake_metal"] = metal
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9.0 * grain
    noise.inputs["Detail"].default_value = 6.0
    noise.inputs["Roughness"].default_value = 0.55
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.72
    dark = tuple(c * 0.86 for c in rgb)
    light = tuple(min(1.0, c * 1.07) for c in rgb)
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    # roughness variation ±0.08 around base
    rmap = nt.nodes.new("ShaderNodeMapRange")
    rmap.inputs["From Min"].default_value = 0.0
    rmap.inputs["From Max"].default_value = 1.0
    rmap.inputs["To Min"].default_value = max(0.0, rough - 0.08)
    rmap.inputs["To Max"].default_value = min(1.0, rough + 0.08)
    nt.links.new(noise.outputs["Fac"], rmap.inputs["Value"])
    nt.links.new(rmap.outputs["Result"], b.inputs["Roughness"])
    # fine grain bump
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.015
    n2 = nt.nodes.new("ShaderNodeTexNoise")
    n2.inputs["Scale"].default_value = 55.0
    n2.inputs["Detail"].default_value = 4.0
    nt.links.new(n2.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Metallic"].default_value = metal
    _mats[name] = m
    return m


def mat_glass(name, rgb, rough, metal=0.9):
    if name in _mats:
        return _mats[name]
    m, b, nt = _principled(name)
    m["bake_metal"] = metal
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    _mats[name] = m
    return m


def mat_metal(name, rgb, rough):
    return mat_glass(name, rgb, rough, metal=0.95)


def mat_lit(name, warmth=1.0, bright=1.0):
    """Lit interior pane: warm emission (LDR-safe strength <= 1)."""
    if name in _mats:
        return _mats[name]
    m, b, nt = _principled(name)
    m["bake_metal"] = 0.0
    # 2700–3500 K spread comes from `warmth`
    col = (1.0 * bright, (0.55 + 0.15 * warmth) * bright, (0.22 + 0.14 * warmth) * bright)
    b.inputs["Base Color"].default_value = (0.05, 0.045, 0.04, 1.0)
    b.inputs["Roughness"].default_value = 0.4
    b.inputs["Emission Color"].default_value = (*col, 1.0)
    b.inputs["Emission Strength"].default_value = 1.0
    _mats[name] = m
    return m


GLASS_VARIANTS = [
    mat_glass("g_a", (0.024, 0.030, 0.040), 0.05),
    mat_glass("g_b", (0.030, 0.036, 0.046), 0.12),
    mat_glass("g_c", (0.020, 0.026, 0.036), 0.20),
]
BRONZE_VARIANTS = [
    mat_glass("gb_a", (0.16, 0.10, 0.05), 0.06),
    mat_glass("gb_b", (0.13, 0.085, 0.045), 0.14),
    mat_glass("gb_c", (0.18, 0.115, 0.06), 0.22),
]
LIT_VARIANTS = [
    mat_lit("lit_a", warmth=1.0, bright=1.0),
    mat_lit("lit_b", warmth=0.5, bright=0.78),
    mat_lit("lit_c", warmth=0.0, bright=0.55),
]


# ---------------------------------------------------------------------------
# board geometry builder (bmesh; faces face -Y = toward the bake plane)
# ---------------------------------------------------------------------------
class Board:
    def __init__(self, name):
        self.bm = bmesh.new()
        self.slots = []
        self.slot_of = {}
        self.name = name

    def _mi(self, material):
        if material.name not in self.slot_of:
            self.slot_of[material.name] = len(self.slots)
            self.slots.append(material)
        return self.slot_of[material.name]

    def quad_xz(self, x0, x1, z0, z1, y, material):
        """Flat pane facing -Y (toward the camera/bake plane)."""
        mi = self._mi(material)
        v = [self.bm.verts.new(p) for p in
             ((x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1))]
        f = self.bm.faces.new(v)
        f.material_index = mi
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()

    def profile_x(self, profile, x0, x1, material):
        """Extrude an OPEN (y, z) polyline along X (horizontal bands).
        Consecutive profile points make quad strips; wind so faces point -Y-ish."""
        mi = self._mi(material)
        for i in range(len(profile) - 1):
            (ya, za), (yb, zb) = profile[i], profile[i + 1]
            v = [self.bm.verts.new(p) for p in
                 ((x0, ya, za), (x1, ya, za), (x1, yb, zb), (x0, yb, zb))]
            f = self.bm.faces.new(v)
            f.material_index = mi
            f.normal_update()
            if f.normal.y > 0.999:  # only flip pure back-facing strips
                f.normal_flip()

    def profile_z(self, profile, z0, z1, material):
        """Extrude an OPEN (x, y) polyline along Z (vertical piers/mullions)."""
        mi = self._mi(material)
        for i in range(len(profile) - 1):
            (xa, ya), (xb, yb) = profile[i], profile[i + 1]
            v = [self.bm.verts.new(p) for p in
                 ((xa, ya, z0), (xb, yb, z0), (xb, yb, z1), (xa, ya, z1))]
            f = self.bm.faces.new(v)
            f.material_index = mi
            f.normal_update()
            if f.normal.y > 0.999:
                f.normal_flip()

    def finalize(self):
        mesh = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        for m in self.slots:
            obj.data.materials.append(m)
        bpy.context.collection.objects.link(obj)
        return obj


# margins: build 1 extra bay left/right + 1 extra floor above/below so the
# sampled 0..TILE window sees continuous neighbours (seamless tiling).
def bay_range(module, lo=-1, hi=None):
    n = int(round(TILE_U / module))
    if hi is None:
        hi = n + 1
    return range(lo, hi + 1), n


# ---------------------------------------------------------------------------
# SYSTEM BOARDS
# ---------------------------------------------------------------------------
def board_grid():
    b = Board("board_grid")
    conc = mat_concrete("conc_neutral", (0.72, 0.70, 0.66), rough=0.80)
    PITCH, PIER = 3.0, 0.9
    # dark-glass backing across the whole board, 0.52 m deep
    b.quad_xz(-4, 16, -4.5, 16.5, 0.52, GLASS_VARIANTS[0])
    cols, _ = bay_range(PITCH)
    for c in cols:
        x = c * PITCH
        # pier: chamfered front corners (0.13), full reveal to 0.62
        b.profile_z(
            [(x - 0.45, 0.62), (x - 0.45, 0.13), (x - 0.32, 0.0),
             (x + 0.32, 0.0), (x + 0.45, 0.13), (x + 0.45, 0.62)],
            -4.5, 16.5, conc)
    for fl in range(-1, 4):
        z = fl * FLOOR_H
        # spandrel band 0..1.6 with shadow reveals at both edges
        b.profile_x(
            [(0.30, z - 0.02), (0.30, z + 0.03), (0.0, z + 0.06),
             (0.0, z + 1.54), (0.30, z + 1.57), (0.30, z + 1.62)],
            -4, 16, conc)
        # per-cell glass + lit variation in the opening (1.6 .. 3.8)
        for c in cols:
            x0 = c * PITCH + 0.45
            x1 = (c + 1) * PITCH - 0.45
            h = cell_hash(c & 63, fl & 63, 11)
            pane = GLASS_VARIANTS[h % 3]
            b.quad_xz(x0 + 0.02, x1 - 0.02, z + 1.62, z + 3.78, 0.50, pane)
            if is_lit(c & 63, fl & 63, 11, LIT_PCT["grid"]):
                lit = LIT_VARIANTS[h % 3]
                b.quad_xz(x0 + 0.10, x1 - 0.10, z + 1.75, z + 3.70, 0.40, lit)
    return b.finalize()


def board_curtain():
    b = Board("board_curtain")
    mull = mat_metal("bronze_mull", (0.34, 0.23, 0.12), 0.30)
    MOD = 1.5
    b.quad_xz(-3, 15, -4.5, 16.5, 0.16, BRONZE_VARIANTS[0])
    cols, _ = bay_range(MOD)
    for c in cols:
        x = c * MOD
        b.profile_z(
            [(x - 0.035, 0.16), (x - 0.035, 0.0), (x + 0.035, 0.0), (x + 0.035, 0.16)],
            -4.5, 16.5, mull)
    for fl in range(-1, 4):
        z = fl * FLOOR_H
        # floor cap + intermediate transom
        b.profile_x([(0.16, z - 0.06), (0.0, z - 0.06), (0.0, z + 0.06), (0.16, z + 0.06)],
                    -3, 15, mull)
        b.profile_x([(0.16, z + 2.07), (0.03, z + 2.07), (0.03, z + 2.13), (0.16, z + 2.13)],
                    -3, 15, mull)
        for c in cols:
            x0 = c * MOD + 0.035
            x1 = (c + 1) * MOD - 0.035
            h = cell_hash(c & 63, fl & 63, 31)
            b.quad_xz(x0 + 0.01, x1 - 0.01, z + 0.10, z + 3.74, 0.15, BRONZE_VARIANTS[h % 3])
            if is_lit(c & 63, fl & 63, 31, LIT_PCT["curtain"]):
                b.quad_xz(x0 + 0.05, x1 - 0.05, z + 0.25, z + 3.55, 0.10,
                          LIT_VARIANTS[(h >> 4) % 3])
    return b.finalize()


def board_strip():
    b = Board("board_strip")
    cream = mat_concrete("precast_cream", (0.78, 0.68, 0.48), rough=0.72)
    spandrel = mat_glass("g_spandrel", (0.016, 0.020, 0.028), 0.42, metal=0.5)
    PITCH, FW = 2.4, 1.0
    b.quad_xz(-4, 16, -4.5, 16.5, 0.52, GLASS_VARIANTS[0])
    cols, _ = bay_range(PITCH)
    for c in cols:
        x = c * PITCH
        # projecting fin: front face + deep side reveals (0.52)
        b.profile_z(
            [(x - FW / 2, 0.52), (x - FW / 2, 0.0), (x + FW / 2, 0.0), (x + FW / 2, 0.52)],
            -4.5, 16.5, cream)
    for fl in range(-1, 4):
        z = fl * FLOOR_H
        # hidden-slab spandrel band behind the glass (darker, rougher)
        b.quad_xz(-4, 16, z - 0.15, z + 0.75, 0.50, spandrel)
        for c in cols:
            x0 = c * PITCH + FW / 2
            x1 = (c + 1) * PITCH - FW / 2
            h = cell_hash(c & 63, fl & 63, 21)
            if is_lit(c & 63, fl & 63, 21, LIT_PCT["strip"]):
                b.quad_xz(x0 + 0.08, x1 - 0.08, z + 0.9, z + 3.3, 0.45,
                          LIT_VARIANTS[h % 3])
    return b.finalize()


def board_band():
    b = Board("board_band")
    band = mat_concrete("band_white", (0.85, 0.84, 0.80), rough=0.55, grain=1.4)
    b.quad_xz(-4, 16, -4.5, 16.5, 0.30, GLASS_VARIANTS[1])
    for fl in range(-1, 4):
        z = fl * FLOOR_H
        # band 0..1.35 projecting 0.3 in front of the glass, chamfered edges
        b.profile_x(
            [(0.30, z - 0.01), (0.03, z + 0.0), (0.0, z + 0.03),
             (0.0, z + 1.32), (0.03, z + 1.35), (0.30, z + 1.36)],
            -4, 16, band)
        # lit cells on a 3 m rhythm in the glass ribbon (1.35 .. 3.8)
        for c in range(-1, 6):
            x0 = c * 3.0 + 0.25
            x1 = c * 3.0 + 2.75
            h = cell_hash(c & 63, fl & 63, 41)
            b.quad_xz(x0, x1, z + 1.42, z + 3.74, 0.28, GLASS_VARIANTS[h % 3])
            if is_lit(c & 63, fl & 63, 41, LIT_PCT["band"]):
                b.quad_xz(x0 + 0.1, x1 - 0.1, z + 1.55, z + 3.62, 0.24,
                          LIT_VARIANTS[(h >> 2) % 3])
    return b.finalize()


def board_trim():
    b = Board("board_trim")
    stone = mat_concrete("stone_podium", (0.56, 0.50, 0.40), rough=0.82)
    plinth = mat_concrete("stone_plinth", (0.20, 0.185, 0.17), rough=0.6, grain=1.6)
    parapet = mat_concrete("parapet_neutral", (0.80, 0.79, 0.76), rough=0.72)
    dark = mat_metal("metal_dark", (0.09, 0.09, 0.10), 0.45)
    red = mat_concrete("sign_red_back", (0.35, 0.03, 0.04), rough=0.42, grain=0.5)
    frame = mat_metal("storefront_frame", (0.12, 0.12, 0.13), 0.35)

    # --- podium stone 0 .. 4.5 (coursing 0.75, vertical joints 3.0) ----------
    b.quad_xz(-2, 14, -0.4, 5.0, 0.05, plinth)          # joint backing
    b.profile_x([(0.0, -0.4), (0.0, 0.60)], -2, 14, plinth)  # dark plinth
    zc = 0.62
    while zc < 4.5 - 0.05:
        top = min(zc + 0.73, 4.48)
        xs = -2.0
        while xs < 14.0:
            xe = min(xs + 2.985, 14.0)
            b.quad_xz(xs, xe, zc, top, 0.0, stone)
            xs = xe + 0.015
        zc = top + 0.02

    # --- retail band 4.8 .. 8.7 ----------------------------------------------
    r0, r1 = TRIM_STRIPS["retail"]
    b.quad_xz(-2, 14, r0 - 0.1, r1 + 0.1, 0.18, GLASS_VARIANTS[0])  # glazing
    b.profile_x([(0.06, r0), (0.0, r0), (0.0, r0 + 0.45), (0.06, r0 + 0.47)],
                -2, 14, plinth)                          # stallriser
    b.profile_x([(0.05, r1 - 0.6), (0.02, r1 - 0.58), (0.02, r1), (0.05, r1)],
                -2, 14, dark)                            # fascia / awning band
    for c in range(-1, 10):
        x = c * 1.5
        b.profile_z([(x - 0.04, 0.18), (x - 0.04, 0.02), (x + 0.04, 0.02), (x + 0.04, 0.18)],
                    r0 + 0.4, r1 - 0.6, frame)           # storefront mullions
    b.profile_x([(0.18, r0 + 2.9), (0.04, r0 + 2.9), (0.04, r0 + 2.96), (0.18, r0 + 2.96)],
                -2, 14, frame)                           # transom
    for c in range(-1, 9):                               # interiors: ~45 % lit
        x0 = c * 1.5 + 0.06
        x1 = (c + 1) * 1.5 - 0.06
        h = cell_hash(c & 63, 7, 71)
        if h % 100 < 45:
            b.quad_xz(x0, x1, r0 + 0.55, r1 - 0.65, 0.15, LIT_VARIANTS[h % 3])
    # door pair in bay 2
    b.profile_z([(3.02, 0.15), (3.02, 0.0), (3.10, 0.0), (3.10, 0.15)], r0 + 0.05, r0 + 2.6, frame)
    b.profile_z([(4.44, 0.15), (4.44, 0.0), (4.52, 0.0), (4.52, 0.15)], r0 + 0.05, r0 + 2.6, frame)
    b.profile_x([(0.15, r0 + 2.6), (0.0, r0 + 2.6), (0.0, r0 + 2.68), (0.15, r0 + 2.68)],
                3.02, 4.52, frame)

    # --- parapet 9.0 .. 11.2 (45° chamfer top + drip groove) -----------------
    p0, p1 = TRIM_STRIPS["parapet"]
    b.profile_x(
        [(0.30, p0 - 0.02), (0.0, p0 + 0.02), (0.0, p0 + 0.28),
         (0.05, p0 + 0.30), (0.05, p0 + 0.34), (0.0, p0 + 0.36),   # drip groove
         (0.0, p1 - 0.06), (0.06, p1), (0.30, p1)],                # 45° chamfer
        -2, 14, parapet)

    # --- signage 11.5 .. 12.4 -------------------------------------------------
    s0, s1 = TRIM_STRIPS["sign"]
    b.quad_xz(-2, 14, s0 - 0.05, s1 + 0.05, 0.02, red)
    x = -1.5
    k = 0
    while x < 13.5:
        w = 0.35 + (cell_hash(k, 3, 91) % 100) / 100.0 * 0.9
        h = cell_hash(k, 5, 91)
        if h % 100 < 70:
            lit = LIT_VARIANTS[0] if h % 3 else mat_lit("lit_sign", warmth=0.2, bright=0.9)
            b.quad_xz(x, min(x + w, 13.9), s0 + 0.22, s1 - 0.22, 0.0, lit)
        x += w + 0.25 + (h % 40) / 100.0
        k += 1

    # --- louver band 12.7 .. 13.7 ---------------------------------------------
    l0, l1 = TRIM_STRIPS["louver"]
    b.quad_xz(-2, 14, l0 - 0.05, l1 + 0.05, 0.20, plinth)  # dark backing
    zb = l0
    while zb < l1 - 0.02:
        b.profile_x([(0.16, zb - 0.01), (0.02, zb + 0.10)], -2, 14, dark)  # 45° blade
        zb += 0.125
    return b.finalize()


# ---------------------------------------------------------------------------
# bake rig
# ---------------------------------------------------------------------------
def make_bake_plane(name, w, h):
    """Bake target: w x h plane at y=-0.1 facing -Y with exact 0..1 UVs."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    v = [bm.verts.new(p) for p in
         ((0, -0.1, 0), (w, -0.1, 0), (w, -0.1, h), (0, -0.1, h))]
    f = bm.faces.new(v)
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    # assign UVs from vert coords (robust to loop order after flip)
    for loop in f.loops:
        px, _, pz = loop.vert.co
        loop[uvl].uv = (px / w, pz / h)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    m = bpy.data.materials.new(name + "_mat")
    m.use_nodes = True
    obj.data.materials.append(m)
    bpy.context.collection.objects.link(obj)
    return obj


def set_bake_target(plane, img):
    nt = plane.data.materials[0].node_tree
    node = nt.nodes.get("BAKE_TARGET")
    if node is None:
        node = nt.nodes.new("ShaderNodeTexImage")
        node.name = "BAKE_TARGET"
    node.image = img
    nt.nodes.active = node
    node.select = True


def new_img(name, size_x, size_y, srgb):
    img = bpy.data.images.new(name, width=size_x, height=size_y, alpha=False)
    img.colorspace_settings.name = "sRGB" if srgb else "Non-Color"
    return img


def select_for_bake(board, plane):
    bpy.ops.object.select_all(action="DESELECT")
    board.select_set(True)
    plane.select_set(True)
    bpy.context.view_layer.objects.active = plane


def setup_cycles():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for dev_type in ("OPTIX", "CUDA", "HIP"):
            try:
                prefs.compute_device_type = dev_type
                prefs.get_devices()
                if any(d.use for d in prefs.devices):
                    sc.cycles.device = "GPU"
                    print("BAKE_GPU", dev_type)
                    break
            except Exception:
                continue
    except Exception:
        pass
    bake = sc.render.bake
    bake.use_selected_to_active = True
    # plane sits at y=-0.1; 0.05 puts ray origins at y=-0.05 — OUTSIDE the
    # front-most geometry (trim plinth at -0.04) but clear of the plane.
    bake.cage_extrusion = 0.05
    bake.max_ray_distance = 2.5
    bake.margin = 16
    try:
        bake.margin_type = "EXTEND"
    except Exception:
        pass
    bake.use_clear = True
    try:
        # AO ray distance — 3 m reads well on buildings (doc 71 §4.6)
        sc.world.light_settings.distance = 3.0
    except Exception:
        pass
    sc.cycles.use_denoising = False  # bakes are never denoised anyway (T93681)


def denoise_image(img, out_path):
    """Compositor OIDN denoise (headless-safe) -> writes out_path PNG.
    Blender <5 uses Scene.node_tree; 5.x moved to compositing node GROUPS.
    On any failure the raw bake is saved instead (AO runs 512 samples, so the
    undenoised fallback is still clean at 512²)."""
    sc = bpy.context.scene

    def build(nt, out_node):
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        src = nt.nodes.new("CompositorNodeImage")
        src.image = img
        dn = nt.nodes.new("CompositorNodeDenoise")
        out = nt.nodes.new(out_node)
        nt.links.new(src.outputs["Image"], dn.inputs["Image"])
        nt.links.new(dn.outputs["Image"], out.inputs[0])

    try:
        try:  # pre-5.x compositor
            sc.use_nodes = True
            nt = sc.node_tree
            build(nt, "CompositorNodeComposite")
        except AttributeError:  # 5.x: compositing node group
            grp = bpy.data.node_groups.new("dn_tmp", "CompositorNodeTree")
            try:
                grp.interface.new_socket("Image", in_out="OUTPUT",
                                         socket_type="NodeSocketColor")
            except Exception:
                pass
            build(grp, "NodeGroupOutput")
            sc.compositing_node_group = grp
        sc.render.resolution_x = img.size[0]
        sc.render.resolution_y = img.size[1]
        sc.render.resolution_percentage = 100
        old_path = sc.render.filepath
        old_fmt = sc.render.image_settings.file_format
        sc.render.image_settings.file_format = "PNG"
        sc.render.filepath = out_path
        bpy.ops.render.render(write_still=True)
        sc.render.filepath = old_path
        sc.render.image_settings.file_format = old_fmt
        if not os.path.exists(out_path):
            raise RuntimeError("compositor wrote nothing")
        print("AO_DENOISED", out_path)
    except Exception as err:
        print("AO_DENOISE_SKIPPED (%s) — saving raw bake" % err)
        save_img(img, out_path)


def save_img(img, path):
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


def bake_board(board, set_name, res_x, res_y, world_h):
    """All passes for one board -> <out>/<set_name>/{color,normal,orm,emissive}.png"""
    set_dir = os.path.join(out_dir, set_name)
    os.makedirs(set_dir, exist_ok=True)
    plane = make_bake_plane(f"plane_{set_name}", TILE_U, world_h)
    sc = bpy.context.scene
    bake = sc.render.bake

    def run(btype, img, samples, **kw):
        set_bake_target(plane, img)
        select_for_bake(board, plane)
        sc.cycles.samples = samples
        bpy.ops.object.bake(type=btype, **kw)

    color = new_img(f"{set_name}_color", res_x, res_y, srgb=True)
    normal = new_img(f"{set_name}_normal", res_x, res_y, srgb=False)
    ao = new_img(f"{set_name}_ao", res_x, res_y, srgb=False)
    rough = new_img(f"{set_name}_rough", res_x, res_y, srgb=False)
    emit = new_img(f"{set_name}_emissive", res_x, res_y, srgb=True)
    metal = new_img(f"{set_name}_metal", res_x, res_y, srgb=False)

    bake.use_pass_direct = False
    bake.use_pass_indirect = False
    bake.use_pass_color = True
    run("DIFFUSE", color, 16)
    run("ROUGHNESS", rough, 16)
    run("NORMAL", normal, 16)
    run("EMIT", emit, 16)
    run("AO", ao, 512)

    # metal mask: EMIT trick — emission := per-material bake_metal, then re-bake
    for m in bpy.data.materials:
        b = m.node_tree.nodes.get("Principled BSDF") if m.use_nodes else None
        if b is None:
            continue
        mv = float(m.get("bake_metal", 0.0))
        try:
            for link in list(m.node_tree.links):
                if link.to_socket in (b.inputs["Emission Color"], b.inputs["Emission Strength"]):
                    m.node_tree.links.remove(link)
            b.inputs["Emission Color"].default_value = (mv, mv, mv, 1.0)
            b.inputs["Emission Strength"].default_value = 1.0
        except Exception:
            pass
    run("EMIT", metal, 16)
    # restore lit emissions (recreate defaults for subsequent boards)
    for name, m in list(_mats.items()):
        b = m.node_tree.nodes.get("Principled BSDF")
        if b is None:
            continue
        if name.startswith("lit"):
            # re-derive from the mat_lit recipe: color was stored pre-swap
            pass  # handled below by rebuild
        else:
            b.inputs["Emission Color"].default_value = (0, 0, 0, 1.0)
            b.inputs["Emission Strength"].default_value = 0.0
    for name, m in _mats.items():
        if name.startswith("lit"):
            b = m.node_tree.nodes.get("Principled BSDF")
            warm = {"lit_a": (1.0, 0.70, 0.36), "lit_b": (0.78, 0.49, 0.245),
                    "lit_c": (0.55, 0.3025, 0.121), "lit_sign": (0.9, 0.531, 0.216)}
            col = warm.get(name, (1.0, 0.62, 0.28))
            b.inputs["Emission Color"].default_value = (*col, 1.0)
            b.inputs["Emission Strength"].default_value = 1.0

    save_img(color, os.path.join(set_dir, "color.png"))
    save_img(normal, os.path.join(set_dir, "normal.png"))
    save_img(emit, os.path.join(set_dir, "emissive.png"))
    denoise_image(ao, os.path.join(set_dir, "ao_dn.png"))
    save_img(rough, os.path.join(set_dir, "rough.png"))
    save_img(metal, os.path.join(set_dir, "metal.png"))

    # ORM pack (R=AO denoised, G=rough, B=metal) via numpy
    import numpy as np
    ao_dn = bpy.data.images.load(os.path.join(set_dir, "ao_dn.png"))
    ao_dn.colorspace_settings.name = "Non-Color"

    def px(im):
        arr = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32)
        im.pixels.foreach_get(arr)
        return arr.reshape(-1, 4)

    a, r, mtl = px(ao_dn), px(rough), px(metal)
    orm = np.ones_like(a)
    orm[:, 0] = a[:, 0]
    orm[:, 1] = r[:, 0]
    orm[:, 2] = mtl[:, 0]
    orm_img = new_img(f"{set_name}_orm", res_x, res_y, srgb=False)
    orm_img.pixels.foreach_set(orm.reshape(-1))
    save_img(orm_img, os.path.join(set_dir, "orm.png"))
    os.remove(os.path.join(set_dir, "ao_dn.png"))
    os.remove(os.path.join(set_dir, "rough.png"))
    os.remove(os.path.join(set_dir, "metal.png"))

    # hide the board + plane so later preview renders don't see them
    board.hide_render = True
    plane.hide_render = True
    board.hide_viewport = True
    plane.hide_viewport = True
    print(f"BAKED {set_name} -> {set_dir}")
    return set_dir


# ---------------------------------------------------------------------------
# run the bakes
# ---------------------------------------------------------------------------
# world (needed for AO settings + preview HDRI)
world = bpy.data.worlds.new("bake_world")
world.use_nodes = True
bpy.context.scene.world = world

setup_cycles()

SETS = [
    ("bay_grid", board_grid, BAY_RES, int(BAY_RES * 1.0), TILE_V),
    ("bay_strip", board_strip, BAY_RES, BAY_RES, TILE_V),
    ("bay_curtain", board_curtain, BAY_RES, BAY_RES, TILE_V),
    ("bay_band", board_band, BAY_RES, BAY_RES, TILE_V),
    ("trim", board_trim, TRIM_RES, TRIM_RES, TRIM_TOTAL_V),
]
for name, builder, rx, ry, wh in SETS:
    bake_board(builder(), name, rx, ry, wh)

# layout contract for the kit generator + runtime
layout = {
    "bay": {"tile_u_m": TILE_U, "tile_v_m": TILE_V, "module_m": BAY_MODULE,
            "lit_pct": LIT_PCT},
    "trim": {"tile_u_m": TRIM_TILE_U, "total_v_m": TRIM_TOTAL_V,
             "strips_m": {k: list(v) for k, v in TRIM_STRIPS.items()}},
    "maps": ["color", "normal", "orm", "emissive"],
}
with open(os.path.join(out_dir, "layout.json"), "w", encoding="utf-8") as f:
    json.dump(layout, f, indent=2)

# ---------------------------------------------------------------------------
# preview: each baked set on a 2x2-tiled quad, HDRI + low warm sun, EEVEE
# ---------------------------------------------------------------------------
nt = world.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
w_out = nt.nodes.new("ShaderNodeOutputWorld")
bg = nt.nodes.new("ShaderNodeBackground")
try:
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(HDRI)
    nt.links.new(env.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 1.0
except Exception:
    bg.inputs[0].default_value = (0.9, 0.72, 0.5, 1.0)
nt.links.new(bg.outputs[0], w_out.inputs[0])

sun_data = bpy.data.lights.new("sun", type="SUN")
sun_data.energy = 3.0
sun_data.color = (1.0, 0.78, 0.52)
sun = bpy.data.objects.new("sun", sun_data)
bpy.context.collection.objects.link(sun)
sun.rotation_euler = (math.radians(70), 0.0, math.radians(-55))


def preview_quad(name, set_dir, x0, w, h, repeat=2.0):
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    v = [bm.verts.new(p) for p in
         ((x0, 0, 0), (x0 + w, 0, 0), (x0 + w, 0, h), (x0, 0, h))]
    f = bm.faces.new(v)
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    for loop in f.loops:
        px_, _, pz = loop.vert.co
        loop[uvl].uv = ((px_ - x0) / w * repeat, pz / h * repeat)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)

    m = bpy.data.materials.new(name + "_pv")
    m.use_nodes = True
    ntm = m.node_tree
    b = ntm.nodes.get("Principled BSDF")

    def tex(fname, srgb):
        node = ntm.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(os.path.join(set_dir, fname))
        node.image.colorspace_settings.name = "sRGB" if srgb else "Non-Color"
        node.extension = "REPEAT"
        return node

    c = tex("color.png", True)
    o = tex("orm.png", False)
    n = tex("normal.png", False)
    e = tex("emissive.png", True)
    # albedo x AO (Mix node RGBA sockets are index-addressed: 6=A, 7=B, out 2)
    mix = ntm.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    sep = ntm.nodes.new("ShaderNodeSeparateColor")
    ntm.links.new(o.outputs["Color"], sep.inputs["Color"])
    ntm.links.new(c.outputs["Color"], mix.inputs[6])
    comb = ntm.nodes.new("ShaderNodeCombineColor")
    for i in range(3):
        ntm.links.new(sep.outputs["Red"], comb.inputs[i])
    ntm.links.new(comb.outputs["Color"], mix.inputs[7])
    ntm.links.new(mix.outputs[2], b.inputs["Base Color"])
    ntm.links.new(sep.outputs["Green"], b.inputs["Roughness"])
    ntm.links.new(sep.outputs["Blue"], b.inputs["Metallic"])
    nm = ntm.nodes.new("ShaderNodeNormalMap")
    ntm.links.new(n.outputs["Color"], nm.inputs["Color"])
    ntm.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    ntm.links.new(e.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 2.0
    obj.data.materials.append(m)
    bpy.context.collection.objects.link(obj)
    return obj


x = 0.0
for name, _, rx, ry, wh in SETS:
    quad_w = 14.0
    quad_h = quad_w * (wh / TILE_U)
    preview_quad(f"pv_{name}", os.path.join(out_dir, name), x, quad_w, quad_h)
    x += quad_w + 2.0

sc = bpy.context.scene
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        sc.render.engine = eng
        break
    except Exception:
        continue
try:
    sc.eevee.taa_render_samples = 48
except Exception:
    pass
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 40
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
total_w = x - 2.0
cam.location = (total_w / 2 - 8, -46, 15)
cam.rotation_euler = (math.radians(80), 0, math.radians(-10))
sc.camera = cam
sc.render.resolution_x = 2048
sc.render.resolution_y = 860
try:
    sc.view_settings.view_transform = "AgX"
except Exception:
    sc.view_settings.view_transform = "Filmic"
sc.render.filepath = os.path.join(PREVIEW_DIR, "facade_bake_tiles.png")
sc.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)

print("FACADE_ATLAS_OK out=%s" % out_dir)
