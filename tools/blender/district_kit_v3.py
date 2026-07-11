"""
Waterfront financial-district BUILDING KIT v3 — facade-texture build (v4 pass).

v3 built the four REF 1 facade systems (docs/simulation/70) as real
per-window geometry with flat colors; this pass (doc 71 §4.5 Phase 4) moves
the window detail into BAKED tiling bay textures (tools/blender/
facade_atlas.py: real-3D strip boards -> Cycles albedo/normal/AO/roughness/
emissive) and UV-maps each tower's shaft onto its system's texture at true
world scale — the classic skyscraper method (lane 02 §5.2 "safest v1").

  A  bay_grid    exposed-concrete punched grid (deep recesses, chamfered
                 piers) — beige/grey via VERTEX tint over a neutral bake.
  B  bay_strip   cream precast vertical fins + glazing strips.
  C  bay_curtain bronze unitized curtain wall, 1.5 m module, most lit.
  D  bay_band    white horizontal bands + dark ribbons (rounded plans).
  trim           1024² Ultimate-Trim atlas: podium stone coursing, retail
                 glazing band (lit storefronts), 45°-chamfer parapet, red
                 signage strip, dark louver band.

What this buys (vs the flat-color v3):
  - facades gain REAL recess normals/AO + lit-window scatter (root cause #3);
  - tower tris collapse ~15k -> ~1-2k; materials collapse to 3-4 shared
    names per model — every building batches with every other;
  - lit windows live in the emissive maps; HDR intensity (>1) is applied at
    runtime (CityBuildings day/night glow). Per-MODEL whole-bay U/V offsets
    de-correlate the lit pattern across towers (per-INSTANCE offsets are not
    cheap under InstancedMesh — instanced attributes live on the shared
    geometry, one per chunk mesh would defeat sharing).

GLBs export WITHOUT embedded images (export_image_format='NONE'): the maps
ship ONCE under platform/public/sim/city-v3/textures/ (tools/glb/
pack_textures.mjs) and the runtime wires them onto the named materials —
16 GLBs embedding copies would multiply texture VRAM by the model count.

Export gotchas honoured downstream (doc 71 §4.5): per-face UV floor-subtract
happens HERE at generation; Draco quantizeTexcoord 14 in tools/glb/
optimize.mjs; anisotropy 8 + REPEAT wrap in the runtime loader.

    blender --background --python tools/blender/district_kit_v3.py -- <out_dir>

Requires tools/blender/work/facade_bakes/ (run `node tools/blender/facade_gen.mjs`
first — it replaces the deprecated Cycles facade_atlas.py bake).
"""

import bpy
import bmesh
import json
import math
import os
import sys
import zlib

argv = sys.argv
out_dir = None
if "--" in argv:
    extra = argv[argv.index("--") + 1:]
    if extra:
        out_dir = extra[0]
if not out_dir:
    out_dir = os.path.join(os.path.expanduser("~"), "district-v3-out")
os.makedirs(out_dir, exist_ok=True)

HERE = os.path.dirname(os.path.abspath(__file__))
BAKES = os.path.join(HERE, "work", "facade_bakes")
HDRI = "E:/AI driver/platform/public/sim/env/sky_urban_1k.hdr"

FLOOR_H = 3.8      # global floor-to-floor datum
GLZ = 1.5          # global glazing module
POD_FLOOR = 4.5    # podium floor height

# ---------------------------------------------------------------------------
# baked-texture layout contract (written by facade_atlas.py)
# ---------------------------------------------------------------------------
with open(os.path.join(BAKES, "layout.json"), "r", encoding="utf-8") as f:
    LAYOUT = json.load(f)
TILE_U = LAYOUT["bay"]["tile_u_m"]          # 12.0 m per bay-texture repeat
TILE_V = LAYOUT["bay"]["tile_v_m"]          # 11.4 m (3 floors)
BAY_MODULE = LAYOUT["bay"]["module_m"]      # per-system whole-bay snap step
TRIM_U = LAYOUT["trim"]["tile_u_m"]         # 12.0 m per trim-atlas U repeat
TRIM_V = LAYOUT["trim"]["total_v_m"]        # 13.7 m of stacked strips
STRIPS = LAYOUT["trim"]["strips_m"]         # {name: [z0, z1]} board metres

# vertex tints multiplied over the NEUTRAL bakes (beige/grey grid concrete,
# cream/white parapets) — COLOR_0 in the GLB, multiplies diffuse only.
TINT = {
    "beige": (0.83, 0.73, 0.56),
    "grey": (0.75, 0.74, 0.71),
    "cream": (0.98, 0.86, 0.63),
    "white": (1.0, 1.0, 1.0),
}


def bay_offset(name, system):
    """Per-MODEL whole-bay U + whole-floor V offset (deterministic) so the
    baked lit-window pattern never repeats across towers of one system."""
    h = zlib.crc32(name.encode("utf-8"))
    module = BAY_MODULE[system]
    nu = max(1, int(round(TILE_U / module)))
    return (h % nu) * module, ((h >> 4) % 3) * FLOOR_H


# ---------------------------------------------------------------------------
# materials (cached by name — shared across objects, slots added per object)
# ---------------------------------------------------------------------------
_mats = {}


def mat(name, rgb, rough=0.5, metal=0.0, coat=0.0):
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
    _mats[name] = m
    return m


def textured_mat(name):
    """Baked facade material: full PBR node graph so the CONTACT SHEET renders
    truthfully. Export drops the images (image_format NONE); the runtime
    re-wires the shared district textures onto the material by NAME."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    d = os.path.join(BAKES, name)

    def tex(fname, srgb):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(os.path.join(d, fname), check_existing=True)
        n.image.colorspace_settings.name = "sRGB" if srgb else "Non-Color"
        n.extension = "REPEAT"
        return n

    c = tex("color.png", True)
    o = tex("orm.png", False)
    nrm = tex("normal.png", False)
    e = tex("emissive.png", True)
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(o.outputs["Color"], sep.inputs["Color"])

    def mult(a_out, b_out):
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.blend_type = "MULTIPLY"
        mx.inputs[0].default_value = 1.0        # Factor
        nt.links.new(a_out, mx.inputs[6])       # A (color)
        nt.links.new(b_out, mx.inputs[7])       # B (color)
        return mx.outputs[2]                    # Result (color)

    # albedo x AO x vertex tint (preview-only; runtime does AO via aoMap and
    # tint via COLOR_0 vertex colors, which the exporter carries)
    ao3 = nt.nodes.new("ShaderNodeCombineColor")
    for i in range(3):
        nt.links.new(sep.outputs[0], ao3.inputs[i])
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "Col"
    shaded = mult(mult(c.outputs["Color"], ao3.outputs["Color"]), attr.outputs["Color"])
    nt.links.new(shaded, b.inputs["Base Color"])
    nt.links.new(sep.outputs[1], b.inputs["Roughness"])
    nt.links.new(sep.outputs[2], b.inputs["Metallic"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(nrm.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    nt.links.new(e.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 2.0
    _mats[name] = m
    return m


def M():
    """Kit palette: 5 shared textured materials + a few flat ones."""
    return {
        "bay_grid": textured_mat("bay_grid"),
        "bay_strip": textured_mat("bay_strip"),
        "bay_curtain": textured_mat("bay_curtain"),
        "bay_band": textured_mat("bay_band"),
        "trim": textured_mat("trim"),
        # flat materials (pavilions, lobby glass, roofs)
        "glass_dark": mat("glass_dark", (0.025, 0.032, 0.042), rough=0.06, coat=0.6),
        "glass_bronze": mat("glass_bronze", (0.16, 0.10, 0.05), rough=0.07, metal=0.35, coat=0.5),
        "bronze_metal": mat("bronze_metal", (0.34, 0.23, 0.12), rough=0.30, metal=0.9),
        "roof_dark": mat("roof_dark", (0.07, 0.07, 0.075), rough=0.9),
        "stone_dark": mat("stone_dark", (0.14, 0.13, 0.12), rough=0.6),
    }


# ---------------------------------------------------------------------------
# geometry builder — one bmesh per model; UVs + vertex tints written inline
# ---------------------------------------------------------------------------
class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        try:
            self.col = self.bm.loops.layers.float_color.new("Col")
        except AttributeError:
            self.col = self.bm.loops.layers.color.new("Col")
        self.slots = []
        self.slot_of = {}

    def _mi(self, material):
        if material.name not in self.slot_of:
            self.slot_of[material.name] = len(self.slots)
            self.slots.append(material)
        return self.slot_of[material.name]

    def _finish(self, face, mi, tint):
        face.material_index = mi
        c = (*(tint or (1.0, 1.0, 1.0)), 1.0)
        for loop in face.loops:
            loop[self.col] = c

    def _strip_uv(self, face, strip, z_base):
        """Trim-atlas strip mapping: u = horizontal metres / TRIM_U; v maps
        the element's height from its own base into the strip's V band
        (clamped — strips do not tile vertically)."""
        s0, s1 = STRIPS[strip]
        face.normal_update()
        n = face.normal
        side = abs(n.z) < 0.7
        for loop in face.loops:
            x, y, z = loop.vert.co
            if side:
                u = (y if abs(n.x) > abs(n.y) else x) / TRIM_U
                vm = s0 + min(max(z - z_base, 0.0), s1 - s0)
            else:
                u = x / TRIM_U
                vm = (s1 - 0.08) if n.z > 0 else (s0 + 0.08)
            loop[self.uv].uv = (u, vm / TRIM_V)

    def box(self, cx, cy, cz, sx, sy, sz, material, uv=None, tint=None):
        mi = self._mi(material)
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        c = [(cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
             (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
             (cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz),
             (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz)]
        v = [self.bm.verts.new(p) for p in c]
        for fi in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]:
            face = self.bm.faces.new([v[i] for i in fi])
            self._finish(face, mi, tint)
            if uv is not None and uv[0] == "strip":
                self._strip_uv(face, uv[1], cz - hz)

    def prism(self, pts, z0, z1, material, caps=True, uv=None, tint=None):
        """Extrude a plan polygon [(x,y),...] from z0 to z1 (CCW enforced).
        uv=("bay", system, u_off_m, v_off_m, snap_module|None): side quads get
        arc-length x height UVs onto the system's tiling bay texture, with the
        per-face floor(min u) subtracted (Draco texcoord-quantization guard).
        uv=("strip", name): trim-atlas strip mapping (crowns/parapets)."""
        area = 0.0
        n = len(pts)
        for i in range(n):
            x0, y0 = pts[i]
            x1, y1 = pts[(i + 1) % n]
            area += x0 * y1 - x1 * y0
        if area < 0:
            pts = list(reversed(pts))
        mi = self._mi(material)
        cum = [0.0]
        for i in range(n):
            x0, y0 = pts[i]
            x1, y1 = pts[(i + 1) % n]
            cum.append(cum[-1] + math.hypot(x1 - x0, y1 - y0))
        vb = [self.bm.verts.new((p[0], p[1], z0)) for p in pts]
        vt = [self.bm.verts.new((p[0], p[1], z1)) for p in pts]
        for i in range(n):
            j = (i + 1) % n
            face = self.bm.faces.new([vb[i], vb[j], vt[j], vt[i]])
            self._finish(face, mi, tint)
            if uv is not None and uv[0] == "bay":
                _, system, u_off, v_off, snap = uv
                seg = cum[i + 1] - cum[i]
                base = round(cum[i] / snap) * snap if snap else cum[i]
                u0 = (base + u_off) / TILE_U
                u1 = (base + seg + u_off) / TILE_U
                v0 = (v_off) / TILE_V
                v1 = ((z1 - z0) + v_off) / TILE_V
                su = math.floor(min(u0, u1))
                sv = math.floor(min(v0, v1))
                u0, u1, v0, v1 = u0 - su, u1 - su, v0 - sv, v1 - sv
                uvs = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
                for loop, luv in zip(face.loops, uvs):
                    loop[self.uv].uv = luv
            elif uv is not None and uv[0] == "strip":
                self._strip_uv(face, uv[1], z0)
        if caps:
            fb = self.bm.faces.new(list(reversed(vb)))
            ft = self.bm.faces.new(vt)
            for face in (fb, ft):
                self._finish(face, mi, tint)
                if uv is not None and uv[0] == "strip":
                    self._strip_uv(face, uv[1], z0)

    def quad(self, a, b, c, d, material, tint=None):
        mi = self._mi(material)
        v = [self.bm.verts.new(p) for p in (a, b, c, d)]
        face = self.bm.faces.new(v)
        self._finish(face, mi, tint)

    def finalize(self, name):
        mesh = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        try:
            mesh.color_attributes.active_color_name = "Col"
        except Exception:
            pass
        obj = bpy.data.objects.new(name, mesh)
        for m in self.slots:
            obj.data.materials.append(m)
        bpy.context.collection.objects.link(obj)
        mesh.calc_loop_triangles()
        obj["tris"] = len(mesh.loop_triangles)
        return obj


# ---------------------------------------------------------------------------
# facade plumbing (podium faces)
# ---------------------------------------------------------------------------
class Face:
    """One rectangular face. u runs along the face following the CCW
    perimeter; d is depth along the outward normal (0 = facade plane)."""

    def __init__(self, cx, cy, ux, uy, nx, ny, length):
        self.cx, self.cy = cx, cy
        self.ux, self.uy = ux, uy
        self.nx, self.ny = nx, ny
        self.length = length

    def pt(self, u, d, z):
        return (self.cx + u * self.ux + d * self.nx,
                self.cy + u * self.uy + d * self.ny, z)

    def plan(self, u, d):
        return (self.cx + u * self.ux + d * self.nx,
                self.cy + u * self.uy + d * self.ny)


def rect_faces(W, D):
    return [
        Face(W / 2, 0, 0, 1, 1, 0, D),    # +X
        Face(0, D / 2, -1, 0, 0, 1, W),   # +Y
        Face(-W / 2, 0, 0, -1, -1, 0, D),  # -X
        Face(0, -D / 2, 1, 0, 0, -1, W),  # -Y
    ]


def rect_plan(W, D):
    return [(-W / 2, -D / 2), (W / 2, -D / 2), (W / 2, D / 2), (-W / 2, D / 2)]


def face_box(b, face, uc, dc, zc, su, sd, sz, material, uv=None, tint=None):
    x = face.cx + uc * face.ux + dc * face.nx
    y = face.cy + uc * face.uy + dc * face.ny
    sx = su * abs(face.ux) + sd * abs(face.nx)
    sy = su * abs(face.uy) + sd * abs(face.ny)
    b.box(x, y, zc, sx, sy, sz, material, uv=uv, tint=tint)


def offset_poly(pts, dist):
    """Offset a CCW plan polygon outward by dist (mitred)."""
    n = len(pts)
    out = []
    for i in range(n):
        x0, y0 = pts[(i - 1) % n]
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        e1 = (x1 - x0, y1 - y0)
        e2 = (x2 - x1, y2 - y1)

        def norm(e):
            l = math.hypot(e[0], e[1]) or 1.0
            return (e[1] / l, -e[0] / l)  # outward for CCW

        n1, n2 = norm(e1), norm(e2)
        ax, ay = n1[0] + n2[0], n1[1] + n2[1]
        al = math.hypot(ax, ay) or 1.0
        ax, ay = ax / al, ay / al
        scale = dist / max(0.5, ax * n1[0] + ay * n1[1])
        out.append((x1 + ax * scale, y1 + ay * scale))
    return out


def barrel_plan(hx, hy, sag, seg=12):
    """Rectangle with the two narrow (x) ends bulged outward by `sag`."""
    pts = [(-hx, -hy), (hx, -hy)]
    if sag > 0.05:
        xc = hx - (hy * hy - sag * sag) / (2 * sag)
        R = (hy * hy + sag * sag) / (2 * sag)
        a0 = math.atan2(-hy, hx - xc)
        a1 = math.atan2(hy, hx - xc)
        right = [(xc + R * math.cos(a0 + (a1 - a0) * i / seg),
                  R * math.sin(a0 + (a1 - a0) * i / seg)) for i in range(1, seg)]
        pts += right
        pts += [(hx, hy), (-hx, hy)]
        pts += [(-x, y) for (x, y) in reversed(right)]
    else:
        pts += [(hx, hy), (-hx, hy)]
    return pts


def rounded_rect(hx, hy, r, seg=6):
    """CCW rounded-rectangle plan (System D)."""
    pts = []
    corners = [((hx - r, -hy + r), -90), ((hx - r, hy - r), 0),
               ((-hx + r, hy - r), 90), ((-hx + r, -hy + r), 180)]
    for (cx, cy), a_start in corners:
        for i in range(seg + 1):
            a = math.radians(a_start + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


# ---------------------------------------------------------------------------
# shared podium — stone coursing / retail band / signage from the trim atlas
# ---------------------------------------------------------------------------
def podium(b, W, D, pf, m, sign_faces=0, arcade=False):
    pw, pd = W + 7.0, D + 7.0
    ph = pf * POD_FLOOR
    # one stone band per podium floor: each maps the full podium strip
    # (4.5 m of coursing) from its own base — vertical tiling via geometry.
    for fl in range(pf):
        b.box(0, 0, fl * POD_FLOOR + POD_FLOOR / 2, pw, pd, POD_FLOOR,
              m["trim"], uv=("strip", "podium"))
    faces = rect_faces(pw, pd)
    for i, f in enumerate(faces):
        L = f.length
        # continuous retail glazing band (lit storefronts in the atlas)
        face_box(b, f, 0, 0.09, 2.45, L - 2.4, 0.10, 3.9,
                 m["trim"], uv=("strip", "retail"))
        if arcade:
            ncol = max(2, int((L - 4) // 6))
            for c in range(ncol + 1):
                u = -(ncol * 6) / 2 + c * 6
                face_box(b, f, u, 0.5, 2.25, 0.75, 1.0, 4.5,
                         m["trim"], uv=("strip", "podium"))
        if i < sign_faces:
            face_box(b, f, 0, 0.12, 4.95, L * 0.55, 0.12, 0.9,
                     m["trim"], uv=("strip", "sign"))
    # double-height lobby (clean reflective glass) + canopy on the -Y face
    lf = faces[3]
    face_box(b, lf, 0, 0.16, 4.45, 10.0, 0.10, 8.3, m["glass_dark"])
    face_box(b, lf, 0, 1.8, 4.62, 11.0, 3.4, 0.35,
             m["trim"], uv=("strip", "louver"))
    return ph


# ---------------------------------------------------------------------------
# towers — textured shafts (one prism) + trim crowns
# ---------------------------------------------------------------------------
def tower_grid(name, floors, nx, ny, tone, pf=3, sign_faces=0, arcade=False):
    m = M()
    b = Builder()
    PITCH, PIER = 3.0, 0.9
    W = nx * PITCH + PIER
    D = ny * PITCH + PIER
    ph = podium(b, W, D, pf, m, sign_faces, arcade)
    top = ph + floors * FLOOR_H
    u_off, v_off = bay_offset(name, "grid")
    tint = TINT[tone]

    b.prism(rect_plan(W, D), ph, top, m["bay_grid"], caps=True,
            uv=("bay", "grid", u_off, v_off, BAY_MODULE["grid"]), tint=tint)

    # solid parapet crown (45°-chamfer strip) + dark roof inset
    b.box(0, 0, top + 1.1, W + 0.06, D + 0.06, 2.2,
          m["trim"], uv=("strip", "parapet"), tint=tint)
    b.box(0, 0, top + 2.24, W - 2.5, D - 2.5, 0.16, m["roof_dark"])
    return b.finalize(name)


def tower_strips(name, floors, hx, hy, sag, pf=2, sign_faces=0):
    m = M()
    b = Builder()
    W = 2 * (hx + max(sag, 0))
    D = 2 * hy
    ph = podium(b, W, D, pf, m, sign_faces)
    top = ph + floors * FLOOR_H
    u_off, v_off = bay_offset(name, "strip")

    plan = barrel_plan(hx, hy, sag)
    b.prism(plan, ph, top, m["bay_strip"], caps=True,
            uv=("bay", "strip", u_off, v_off, None))

    # thin oversailing parapet slab + dark roof
    b.prism(offset_poly(plan, 0.6), top, top + 0.9,
            m["trim"], caps=True, uv=("strip", "parapet"), tint=TINT["cream"])
    b.prism(offset_poly(plan, -0.4), top + 0.9, top + 0.96, m["roof_dark"], caps=True)
    return b.finalize(name)


def tower_curtain(name, floors, n_mod, pf=3, sign_faces=0):
    m = M()
    b = Builder()
    W = D = n_mod * GLZ
    ph = podium(b, W, D, pf, m, sign_faces)
    top = ph + floors * FLOOR_H
    u_off, v_off = bay_offset(name, "curtain")

    b.prism(rect_plan(W, D), ph, top, m["bay_curtain"], caps=True,
            uv=("bay", "curtain", u_off, v_off, BAY_MODULE["curtain"]))

    # flat top: dark louver band + roof inset (REF 1 "flat tops")
    b.box(0, 0, top + 0.6, W - 0.1, D - 0.1, 1.2,
          m["trim"], uv=("strip", "louver"))
    b.box(0, 0, top + 1.26, W - 0.7, D - 0.7, 0.12, m["roof_dark"])
    return b.finalize(name)


def tower_bands(name, floors, hx, hy, r, pf=2, sign_faces=0):
    m = M()
    b = Builder()
    W, D = 2 * hx, 2 * hy
    ph = podium(b, W, D, pf, m, sign_faces)
    top = ph + floors * FLOOR_H
    u_off, v_off = bay_offset(name, "band")

    plan = rounded_rect(hx, hy, r)
    b.prism(plan, ph, top, m["bay_band"], caps=True,
            uv=("bay", "band", u_off, v_off, None))

    # crown: blank double band (white) + dark roof inset
    b.prism(offset_poly(plan, 0.3), top, top + 2.7,
            m["trim"], caps=True, uv=("strip", "parapet"), tint=TINT["white"])
    b.prism(offset_poly(plan, -0.8), top + 2.7, top + 2.78, m["roof_dark"], caps=True)
    return b.finalize(name)


# ---------------------------------------------------------------------------
# low retail pavilions — dark stone + bronze glazing (real 3D storefronts)
# ---------------------------------------------------------------------------
def pavilion(name, w, d, floors):
    m = M()
    b = Builder()
    stone, glass, mull = m["stone_dark"], m["glass_bronze"], m["bronze_metal"]

    b.box(0, 0, 0.25, w, d, 0.5, stone)  # plinth
    z = 0.5
    for fl in range(floors):
        gh = POD_FLOOR - 0.7
        b.box(0, 0, z + gh / 2, w - 0.6, d - 0.6, gh, glass)
        for f in rect_faces(w - 0.6, d - 0.6):
            L = f.length
            ncol = int(L // 3.0)
            for c in range(ncol + 1):
                u = -(ncol * 3.0) / 2 + c * 3.0
                face_box(b, f, u, 0.03, z + gh / 2, 0.09, 0.10, gh, mull)
        z += gh
        if fl < floors - 1:
            b.box(0, 0, z + 0.35, w, d, 0.7, stone)
            z += 0.7
    b.box(0, 0, z + 0.225, w + 2.4, d + 2.4, 0.45, stone)
    return b.finalize(name)


# ---------------------------------------------------------------------------
# BUILD THE KIT
# ---------------------------------------------------------------------------
made = []


def add(o):
    made.append(o)


# System A — concrete punched grid (5)
add(tower_grid("t_grid_beige_50", 50, 13, 13, "beige", pf=3, sign_faces=1, arcade=True))
add(tower_grid("t_grid_grey_38", 38, 11, 10, "grey", pf=3))
add(tower_grid("t_grid_beige_26", 26, 10, 9, "beige", pf=2, sign_faces=2))
add(tower_grid("t_slab_beige_18", 18, 16, 5, "beige", pf=2))
add(tower_grid("t_grid_grey_12", 12, 8, 8, "grey", pf=2, sign_faces=1))

# System B — cream vertical strips, curved ends (3)
add(tower_strips("t_strip_cream_36", 36, 15.0, 9.0, 2.5, pf=2))
add(tower_strips("t_strip_cream_24", 24, 12.0, 8.5, 2.0, pf=2, sign_faces=1))
add(tower_strips("t_strip_cream_14", 14, 11.0, 8.0, 0.0, pf=2))

# System C — bronze curtain twins + one shorter single (3)
add(tower_curtain("t_curtain_twin_a_44", 44, 20, pf=3, sign_faces=1))
add(tower_curtain("t_curtain_twin_b_44", 44, 20, pf=3))
add(tower_curtain("t_curtain_bronze_20", 20, 16, pf=2, sign_faces=1))

# System D — white bands + dark ribbons, rounded corners (3)
add(tower_bands("t_band_white_40", 40, 36.0, 16.0, 9.0, pf=3, sign_faces=1))
add(tower_bands("t_band_white_28", 28, 24.0, 14.0, 7.0, pf=2))
add(tower_bands("t_band_white_16", 16, 20.0, 12.0, 6.0, pf=2, sign_faces=1))

# low retail pavilions (2)
add(pavilion("pav_bronze_2f", 30, 15, 2))
add(pavilion("pav_bronze_1f", 24, 12, 1))

# ---------------------------------------------------------------------------
# export one GLB per model (at origin, base z=0) — NO embedded images
# ---------------------------------------------------------------------------
for o in made:
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    kwargs = dict(filepath=os.path.join(out_dir, o.name + ".glb"),
                  use_selection=True, export_format="GLB", export_apply=True,
                  export_yup=True, export_cameras=False, export_lights=False,
                  export_image_format="NONE")
    # ACTIVE = the Builder's "Col" tints as COLOR_0 (the variety channel).
    # Blender 5.1 ALSO duplicates it into a dead COLOR_1 ("all vertex colors",
    # and passing export_all_vertex_colors=False kills BOTH) — the asset
    # pipeline (tools/glb/optimize.mjs) strips COLOR_1+ instead.
    try:
        bpy.ops.export_scene.gltf(**kwargs, export_vertex_color="ACTIVE")
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)

for o in made:
    print("KIT_MODEL %-22s tris=%6d mats=%d dims=%.1fx%.1fx%.1f" %
          (o.name, o["tris"], len(o.data.materials),
           o.dimensions.x, o.dimensions.y, o.dimensions.z))

# ---------------------------------------------------------------------------
# contact sheet — row per system group, golden-hour HDRI, EEVEE
# ---------------------------------------------------------------------------
rows = [
    ["t_grid_beige_50", "t_slab_beige_18", "t_grid_grey_38", "t_grid_beige_26", "t_grid_grey_12"],
    ["t_strip_cream_36", "t_strip_cream_24", "t_strip_cream_14",
     "t_curtain_twin_a_44", "t_curtain_twin_b_44", "t_curtain_bronze_20"],
    ["t_band_white_40", "t_band_white_28", "t_band_white_16", "pav_bronze_2f", "pav_bronze_1f"],
]
by_name = {o.name: o for o in made}
MARGIN = 16
row_y = [135, -30, -190]
for ri, row in enumerate(rows):
    widths = [by_name[n].dimensions.x for n in row]
    total = sum(widths) + MARGIN * (len(row) - 1)
    x = -total / 2
    for n, w in zip(row, widths):
        by_name[n].location = (x + w / 2, row_y[ri], 0)
        x += w + MARGIN

# ground
bpy.ops.mesh.primitive_plane_add(size=1400, location=(0, 0, -0.02))
bpy.context.active_object.data.materials.append(mat("plaza", (0.06, 0.06, 0.065), rough=0.4))

# HDRI world + warm low sun (matches sim env)
world = bpy.data.worlds.new("sky")
world.use_nodes = True
bpy.context.scene.world = world
nt = world.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
w_out = nt.nodes.new("ShaderNodeOutputWorld")
bg = nt.nodes.new("ShaderNodeBackground")
try:
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(HDRI)
    nt.links.new(env.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 1.15
except Exception:
    bg.inputs[0].default_value = (0.9, 0.72, 0.5, 1.0)
nt.links.new(bg.outputs[0], w_out.inputs[0])
sun_data = bpy.data.lights.new("sun", type="SUN")
sun_data.energy = 3.2
sun_data.color = (1.0, 0.78, 0.52)
sun = bpy.data.objects.new("sun", sun_data)
bpy.context.collection.objects.link(sun)
sun.rotation_euler = (math.radians(74), math.radians(6), math.radians(-62))

tgt = bpy.data.objects.new("target", None)
tgt.location = (0, -30, 68)
bpy.context.collection.objects.link(tgt)
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 30
cam_data.clip_start = 5.0
cam_data.clip_end = 4000.0
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (210, -510, 285)
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
    sc.eevee.taa_render_samples = 48
    sc.eevee.use_raytracing = True
except Exception:
    pass
sc.render.resolution_x = 1920
sc.render.resolution_y = 1080
try:
    sc.view_settings.view_transform = "AgX"
except Exception:
    sc.view_settings.view_transform = "Filmic"
sc.render.filepath = os.path.join(out_dir, "district_kit_v3.png")
sc.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)

# close-up pass — verify bay texture scale / recess normals / podium strips
gl = by_name["t_grid_beige_26"].location
tgt.location = (gl.x + 15, gl.y - 10, 30)
cam.location = (gl.x + 55, gl.y - 95, 42)
cam_data.lens = 45
cam_data.clip_start = 1.0
sc.render.filepath = os.path.join(out_dir, "district_kit_v3_close.png")
bpy.ops.render.render(write_still=True)

total = sum(os.path.getsize(os.path.join(out_dir, o.name + ".glb")) for o in made)
print("DISTRICT_V3_OK models=%d total_glb_bytes=%d out=%s" % (len(made), total, out_dir))
