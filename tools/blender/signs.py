"""
Bulgarian ROAD-SIGN asset kit generator (headless Blender) for Книжка.AI.

Produces low-poly, instancing-friendly 3D SIGN ASSEMBLIES for the sim's street
prop pipeline (Three.js/R3F, web + phone). Each assembly = a shaped PLATE (real
thickness + a slight front bevel) + a mounting BRACKET + a POLE, in the standard
Bulgarian shapes:

    warning TRIANGLE (А)            prohibitory/priority CIRCLE (В)
    give-way inverted TRIANGLE (Б1) priority DIAMOND (Б3)
    STOP OCTAGON (Б2)              mandatory CIRCLE (Г)
    informational RECTANGLE (Д/Е)  + rounded 3-lamp traffic-SIGNAL housing

The sign FACE is a textured quad sitting on the plate front. Faces are the
project's own original Bulgarian sign artwork rasterised from
`content/signs/svg/*.svg` (via sharp/librsvg in platform/node_modules) — we do
NOT invent incorrect faces. Where the standard regulatory art exists it is
reused verbatim; the retroreflective face material + galvanised pole/bracket
are approximated with PBR params.

    blender --background --python tools/blender/signs.py -- <out_dir>

GLBs land in <out_dir> (one per assembly); optimise each with
tools/glb/optimize.mjs into platform/public/sim/signs/. A contact-sheet preview
is rendered to tools/blender/previews/sign_kit.png.
"""

import bpy
import bmesh
import sys
import os
import math
import json
import tempfile
import subprocess

# ---------------------------------------------------------------------------
# Paths / args
# ---------------------------------------------------------------------------

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(THIS_DIR, "..", ".."))
PLATFORM_DIR = os.path.join(REPO, "platform")
SVG_DIR = os.path.join(REPO, "content", "signs", "svg")
PREVIEW_DIR = os.path.join(THIS_DIR, "previews")
HDRI = os.path.join(PLATFORM_DIR, "public", "sim", "env", "sky_urban_1k.hdr")

argv = sys.argv
out_dir = None
if "--" in argv:
    extra = argv[argv.index("--") + 1:]
    if extra:
        out_dir = extra[0]
if not out_dir:
    out_dir = os.path.join(os.path.expanduser("~"), "sign-kit-out")
os.makedirs(out_dir, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)

FACE_PX = 512  # rasterised face texture resolution (square)

# ---------------------------------------------------------------------------
# Face catalog — reuse the project's own Bulgarian sign SVGs (never fabricate).
#   face_id -> (svg file, optional value swap for parametrised signs)
#
# ONE BODY, MANY NUMERALS (doc 86 T4 — READ THIS BEFORE ADDING A GLB).
# The kit used to ship exactly one speed face, and props.ts hard-coded it, so
# 82 of the 211 shipped plates stated „50" on a road the reducer grades at
# 20/30/40/70/90/140. The fix did NOT bake twelve more GLBs. `sign_speed_limit_50`
# below is now the SHARED В26 body: at load time the renderer
# (platform/src/modules/sim/world/components/signFaces.ts) re-rasterises v26.svg
# with the numeral swapped and replaces the face texture on a clone of this
# asset's material — the same SVG, the same swap, the same 512 px, just done in
# the browser instead of here. В33 (v33.svg) and Д4 (d4.svg) ride the same path;
# byte-copies of those three SVGs live in platform/public/sim/signs/faces/.
#
# So: do NOT add sign_speed_limit_30 / _40 / _90 GLBs. If you ever want them
# baked (e.g. for an offline render), add the numeral to KIT and to
# SPEED_LIMIT_FACES_KMH in world/types.ts, and drop the override in
# WorldProps.SIGN_FACE_OVERRIDE for that kind — but the shipped path is the
# runtime swap, and it costs one 512 px texture per numeral actually placed.
# ---------------------------------------------------------------------------

FACES = {
    "a1": ("a1.svg", None),      # А1  опасен завой надясно (warning)
    "a18": ("a18.svg", None),    # А18 пешеходна пътека (warning)
    "b1": ("b1.svg", None),      # Б1  пропусни (give way)
    "b2": ("b2.svg", None),      # Б2  спри (STOP octagon)
    "b3": ("b3.svg", None),      # Б3  път с предимство (priority diamond)
    # В26 speed limit. The baked numeral is 50 (the commonest urban limit and
    # the one `SignKind: "limit50"` renders straight from this GLB); every OTHER
    # numeral is produced at load time from this same SVG — see the note above.
    "v26": ("v26.svg", ("60", "50")),
    "v1": ("v1.svg", None),      # В1  забранено влизане (no entry)
    "g12": ("g12.svg", None),    # Г12 кръгово движение (roundabout, mandatory)
    "d11": ("d11.svg", None),    # Д11 начало на населено място (info rectangle)
    "e7": ("e7.svg", None),      # Е7  бензиностанция (info square)
}

# name, shape, face_id, plate_size(m for full 200-viewBox), plate-centre height z
KIT = [
    ("sign_warning_bend",   "triangle",     "a1",  0.95, 2.05),
    # А18 / Б3 / Д11 / Е7 shipped finished but had no SignKind for years, so
    # nothing could place them (doc 86 D5). They are placeable kinds now:
    # А18 goes in advance of an authored crossing, Б3 on the priority arm of a
    # controlled junction; Д11 and Е7 are mapped but not auto-placed (see the
    # lane-3 note in props.ts). Е7's square info plate also carries the Д4
    # one-way face at runtime.
    ("sign_pedestrian",     "triangle",     "a18", 0.95, 2.05),
    ("sign_give_way",       "inv_triangle", "b1",  0.95, 2.05),
    ("sign_stop",           "octagon",      "b2",  0.78, 2.12),
    ("sign_priority_road",  "diamond",      "b3",  0.80, 2.12),
    ("sign_speed_limit_50", "circle_pro",   "v26", 0.72, 2.12),
    ("sign_no_entry",       "circle_pro",   "v1",  0.72, 2.12),
    ("sign_roundabout",     "circle_man",   "g12", 0.72, 2.12),
    ("sign_settlement",     "rect_wide",    "d11", 1.00, 2.20),
    ("sign_service_fuel",   "square_info",  "e7",  0.62, 2.12),
]

# ---------------------------------------------------------------------------
# Rasterise the needed SVG faces -> PNG (transparent bg) via node + sharp.
# ---------------------------------------------------------------------------

def rasterise_faces():
    tmp = tempfile.mkdtemp(prefix="signfaces_")
    face_png = {}
    jobs = []
    for fid, (svg_name, swap) in FACES.items():
        out_png = os.path.join(tmp, fid + ".png")
        jobs.append({
            "svg": os.path.join(SVG_DIR, svg_name),
            "out": out_png,
            "size": FACE_PX,
            "swap": list(swap) if swap else None,
        })
        face_png[fid] = out_png
    jobs_json = os.path.join(tmp, "jobs.json")
    with open(jobs_json, "w", encoding="utf-8") as f:
        json.dump(jobs, f)

    # sharp lives in platform/node_modules; anchor ESM resolution there via
    # createRequire (the temp script lives outside platform/), same trick as
    # tools/glb/optimize.mjs.
    platform_pkg = os.path.join(PLATFORM_DIR, "package.json")
    raster_mjs = os.path.join(tmp, "raster.mjs")
    with open(raster_mjs, "w", encoding="utf-8") as f:
        f.write(
            "import { createRequire } from 'node:module';\n"
            "import { pathToFileURL } from 'node:url';\n"
            "import { readFileSync } from 'node:fs';\n"
            "const require = createRequire(pathToFileURL(process.argv[3]));\n"
            "const sharp = require('sharp');\n"
            "const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));\n"
            "for (const j of jobs) {\n"
            "  let svg = readFileSync(j.svg, 'utf8');\n"
            "  if (j.swap) svg = svg.replace(new RegExp('>\\\\s*' + j.swap[0] + '\\\\s*<'), '>' + j.swap[1] + '<');\n"
            "  await sharp(Buffer.from(svg), { density: 400 })\n"
            "    .resize(j.size, j.size, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })\n"
            "    .png().toFile(j.out);\n"
            "}\n"
            "console.log('RASTER_OK ' + jobs.length);\n"
        )

    cmd = ["node", raster_mjs, jobs_json, platform_pkg]
    _run_node(cmd)
    return face_png


def _run_node(cmd):
    try:
        subprocess.run(cmd, cwd=PLATFORM_DIR, check=True)
    except (FileNotFoundError, OSError):
        subprocess.run(" ".join('"%s"' % c for c in cmd), cwd=PLATFORM_DIR,
                       check=True, shell=True)


def fix_glb_alpha(glb_paths):
    """Blender 5.1's EEVEE-Next exporter writes textured-alpha materials as
    alphaMode=BLEND; the sim wants alpha-CLIP (MASK) like its existing
    alphaTest sign plates. Rewrite face_* materials to MASK via gltf-transform
    (in platform/node_modules)."""
    tmp = tempfile.mkdtemp(prefix="signfix_")
    list_json = os.path.join(tmp, "list.json")
    with open(list_json, "w", encoding="utf-8") as f:
        json.dump(glb_paths, f)
    platform_pkg = os.path.join(PLATFORM_DIR, "package.json")
    fix_mjs = os.path.join(tmp, "fix.mjs")
    with open(fix_mjs, "w", encoding="utf-8") as f:
        f.write(
            "import { createRequire } from 'node:module';\n"
            "import { pathToFileURL } from 'node:url';\n"
            "import { readFileSync } from 'node:fs';\n"
            "const require = createRequire(pathToFileURL(process.argv[3]));\n"
            "const { NodeIO } = require('@gltf-transform/core');\n"
            "const io = new NodeIO();\n"
            "const files = JSON.parse(readFileSync(process.argv[2], 'utf8'));\n"
            "for (const file of files) {\n"
            "  const doc = await io.read(file);\n"
            "  for (const m of doc.getRoot().listMaterials()) {\n"
            "    if (m.getName().startsWith('face_')) { m.setAlphaMode('MASK'); m.setAlphaCutoff(0.5); }\n"
            "  }\n"
            "  await io.write(file, doc);\n"
            "}\n"
            "console.log('FIX_OK ' + files.length);\n"
        )
    _run_node(["node", fix_mjs, list_json, platform_pkg])


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

_mats = {}


def mat(name, rgb, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, coat=0.0,
        cull=True):
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
    # Closed solids cull backfaces (cheaper for instanced props); lamp lenses
    # stay double-sided so the emissive disc is never culled at grazing angles.
    m.use_backface_culling = cull
    _mats[name] = m
    return m


def face_material(name, png_path):
    """Retroreflective-ish face: sign art (base color + alpha MASK), low
    roughness for a bright film sheen. Alpha-clipped so the square texture's
    transparent margin reveals the shaped plate silhouette."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    img = bpy.data.images.load(png_path)
    try:
        img.colorspace_settings.name = "sRGB"
    except Exception:
        pass
    tex.image = img
    tex.interpolation = "Linear"
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.38
    b.inputs["Metallic"].default_value = 0.0
    try:
        b.inputs["Coat Weight"].default_value = 0.35
    except Exception:
        pass
    # Alpha-clip -> exporter emits alphaMode=MASK.
    try:
        m.blend_method = "CLIP"
        m.alpha_threshold = 0.5
    except Exception:
        pass
    m.use_backface_culling = True
    return m


# Galvanised metal + housing palettes.
POLE_MAT = None
EDGE_MAT = None
BRACKET_MAT = None


def init_metals():
    global POLE_MAT, EDGE_MAT, BRACKET_MAT
    POLE_MAT = mat("galv_pole", (0.62, 0.64, 0.66), rough=0.42, metal=0.85)
    EDGE_MAT = mat("plate_edge", (0.72, 0.74, 0.76), rough=0.5, metal=0.6)
    BRACKET_MAT = mat("galv_bracket", (0.55, 0.57, 0.59), rough=0.5, metal=0.8)


# ---------------------------------------------------------------------------
# bmesh Builder (with UV support)
# ---------------------------------------------------------------------------

class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.slots = []
        self.slot_of = {}
        self._recalc_pending = []  # faces to normal-recalc (solid parts)

    def _mi(self, material):
        if material.name not in self.slot_of:
            self.slot_of[material.name] = len(self.slots)
            self.slots.append(material)
        return self.slot_of[material.name]

    def face(self, coords, material, uvs=None, recalc=True):
        vs = [self.bm.verts.new(c) for c in coords]
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return None
        f.material_index = self._mi(material)
        for i, loop in enumerate(f.loops):
            loop[self.uv].uv = uvs[i] if uvs else (0.0, 0.0)
        if recalc:
            self._recalc_pending.append(f)
        return f

    # -- primitives --------------------------------------------------------

    def box(self, cx, cy, cz, sx, sy, sz, material):
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        c = [(cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
             (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
             (cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz),
             (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz)]
        for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                  (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]:
            self.face([c[i] for i in f], material)

    def cyl_z(self, cx, cy, z0, z1, r0, material, n=12, r1=None, caps=True):
        r1 = r0 if r1 is None else r1
        bot, top = [], []
        for i in range(n):
            a = 2 * math.pi * i / n
            bot.append((cx + r0 * math.cos(a), cy + r0 * math.sin(a), z0))
            top.append((cx + r1 * math.cos(a), cy + r1 * math.sin(a), z1))
        for i in range(n):
            j = (i + 1) % n
            self.face([bot[i], bot[j], top[j], top[i]], material)
        if caps:
            self.face(list(reversed(bot)), material)
            self.face(list(top), material)

    def cyl_y(self, cx, cz, y0, y1, r, material, n=12, caps=True):
        """Cylinder along +Y (used for signal lamp visors)."""
        a0, a1 = [], []
        for i in range(n):
            a = 2 * math.pi * i / n
            a0.append((cx + r * math.cos(a), y0, cz + r * math.sin(a)))
            a1.append((cx + r * math.cos(a), y1, cz + r * math.sin(a)))
        for i in range(n):
            j = (i + 1) % n
            self.face([a0[i], a0[j], a1[j], a1[i]], material)
        if caps:
            self.face(list(reversed(a0)), material)
            self.face(list(a1), material)

    def disc_y(self, cx, cz, y, r, material, n=16):
        pts = [(cx + r * math.cos(2 * math.pi * i / n), y,
                cz + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
        self.face(pts, material, recalc=False)  # already faces +Y

    # -- shaped sign plate -------------------------------------------------

    def plate(self, outline, y_center, thick, bevel, front_mat, edge_mat):
        """Prism from an X/Z outline, extruded in Y, with a small 45° front
        bevel ring. Outline is a list of (x, z) in metres (plate-local,
        centred). Front faces +Y."""
        n = len(outline)
        hf = thick / 2.0
        yf = y_center + hf
        ych = yf - min(bevel, thick * 0.45)
        yb = y_center - hf
        cx = sum(p[0] for p in outline) / n
        cz = sum(p[1] for p in outline) / n
        R = max(math.hypot(p[0] - cx, p[1] - cz) for p in outline)
        s = max(0.0, 1.0 - bevel / R) if R > 1e-6 else 1.0
        inset = [(cx + (x - cx) * s, cz + (z - cz) * s) for (x, z) in outline]

        # front (inset) flat face
        self.face([(x, yf, z) for (x, z) in inset], front_mat)
        for i in range(n):
            j = (i + 1) % n
            # bevel ring
            self.face([(inset[i][0], yf, inset[i][1]), (inset[j][0], yf, inset[j][1]),
                       (outline[j][0], ych, outline[j][1]), (outline[i][0], ych, outline[i][1])],
                      edge_mat)
            # side wall
            self.face([(outline[i][0], ych, outline[i][1]), (outline[j][0], ych, outline[j][1]),
                       (outline[j][0], yb, outline[j][1]), (outline[i][0], yb, outline[i][1])],
                      edge_mat)
        # back
        self.face([(x, yb, z) for (x, z) in reversed(outline)], edge_mat)

    def face_quad(self, size, y, z_center, material):
        """Full 200-viewBox square textured quad (art). Explicit +Y winding,
        added AFTER recalc so it is never flipped (keeps text un-mirrored)."""
        h = size / 2.0
        verts = [(-h, y, z_center + h), (h, y, z_center + h),
                 (h, y, z_center - h), (-h, y, z_center - h)]
        # U is flipped: the quad faces +Y, so a viewer on the +Y (front) side has
        # +X to their LEFT — image-left (u=0) must land at +X to read un-mirrored.
        uvs = [(1.0, 1.0), (0.0, 1.0), (0.0, 0.0), (1.0, 0.0)]
        self.face(verts, material, uvs, recalc=False)

    def recalc(self):
        if self._recalc_pending:
            bmesh.ops.recalc_face_normals(self.bm, faces=self._recalc_pending)
            self._recalc_pending = []

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


# ---------------------------------------------------------------------------
# Shape outlines (SVG 200-viewBox coords -> plate-local metres)
# ---------------------------------------------------------------------------

def map_local(sx, sy, size):
    return ((sx - 100.0) * size / 200.0, -(sy - 100.0) * size / 200.0)


def circle_svg(r, n, cx=100.0, cy=100.0):
    return [(cx + r * math.cos(2 * math.pi * i / n),
             cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


# Each entry -> list of (x, y) in SVG coords, sized to CONTAIN the art silhouette.
def outline_svg(shape):
    if shape == "triangle":
        return [(100, 12), (191, 181), (9, 181)]
    if shape == "inv_triangle":
        return [(9, 19), (191, 19), (100, 189)]
    if shape == "octagon":
        base = [(183, 134), (134, 183), (66, 183), (17, 134),
                (17, 66), (66, 17), (134, 17), (183, 66)]
        return [(100 + (x - 100) * 1.055, 100 + (y - 100) * 1.055) for (x, y) in base]
    if shape == "diamond":
        return [(100, 4), (196, 100), (100, 196), (4, 100)]
    if shape == "circle_pro":
        return circle_svg(99, 28)
    if shape == "circle_man":
        return circle_svg(93, 28)
    if shape == "rect_wide":
        return [(3, 53), (197, 53), (197, 147), (3, 147)]
    if shape == "square_info":
        return [(6, 6), (194, 6), (194, 194), (6, 194)]
    raise ValueError(shape)


# ---------------------------------------------------------------------------
# Assembly builders
# ---------------------------------------------------------------------------

THICK = 0.03
BEVEL = 0.018
POLE_R = 0.032
POLE_Y = -0.075  # pole centre sits behind the plate


def build_sign(name, shape, face_png, size, z_center):
    b = Builder()
    outline = [map_local(sx, sy, size) for (sx, sy) in outline_svg(shape)]
    fmat = face_material("face_" + name, face_png)

    plate_top = max(z for (_x, z) in outline)
    plate_bot = min(z for (_x, z) in outline)
    hf = THICK / 2.0
    pole_top = z_center + plate_top + 0.04

    # Pole (galvanised), from ground to just above the plate top.
    b.cyl_z(0.0, POLE_Y, 0.0, pole_top, POLE_R, POLE_MAT, n=10)
    # Base flange.
    b.cyl_z(0.0, POLE_Y, 0.0, 0.05, POLE_R * 1.8, POLE_MAT, n=10)

    # Bracket: collar clamp on the pole + a short connector to the plate back.
    plate_back = z_center  # bracket lives around the plate centre height
    b.cyl_z(0.0, POLE_Y, plate_back - 0.05, plate_back + 0.05, POLE_R * 1.35,
            BRACKET_MAT, n=10)
    y0 = POLE_Y + POLE_R          # pole front
    y1 = -hf                      # plate back
    b.box(0.0, (y0 + y1) / 2.0, plate_back, 0.055, abs(y1 - y0) + 0.005, 0.30, BRACKET_MAT)
    # Vertical mounting strip on the plate back.
    strip_h = min(0.42, (plate_top - plate_bot) * 0.7)
    b.box(0.0, -hf - 0.008, z_center, 0.07, 0.016, strip_h, BRACKET_MAT)

    # Plate (shaped, bevelled). Front white-ish film base; art quad overlays it.
    plate_local = [(x, z_center + z) for (x, z) in outline]
    b.plate(plate_local, 0.0, THICK, BEVEL,
            mat("plate_front", (0.86, 0.87, 0.88), rough=0.45, metal=0.05), EDGE_MAT)

    b.recalc()
    # Textured art quad, just proud of the front bevel.
    b.face_quad(size, hf + 0.004, z_center, fmat)
    return b.finalize(name)


def rounded_rect_local(w, h, r, seg=4):
    """Rounded rectangle (x, z) outline centred at origin."""
    r = min(r, w / 2.0, h / 2.0)
    hw, hh = w / 2.0, h / 2.0
    corners = [(hw - r, hh - r, 0.0), (-hw + r, hh - r, math.pi / 2),
               (-hw + r, -hh + r, math.pi), (hw - r, -hh + r, 3 * math.pi / 2)]
    pts = []
    for (cxr, czr, a0) in corners:
        for k in range(seg + 1):
            a = a0 + (math.pi / 2) * k / seg
            pts.append((cxr + r * math.cos(a), czr + r * math.sin(a)))
    return pts


def build_signal_head(name):
    """Rounded 3-lamp vertical signal on a pole, with a bordered backboard."""
    b = Builder()
    zc = 2.55
    hw, hh, dep = 0.15, 0.475, 0.20
    front_y = dep / 2.0

    dark = mat("signal_housing", (0.09, 0.095, 0.10), rough=0.5, metal=0.25)
    board = mat("signal_board", (0.06, 0.065, 0.07), rough=0.6, metal=0.1)
    rim = mat("signal_rim", (0.95, 0.86, 0.15), rough=0.5, metal=0.1)
    lens_r = mat("lamp_red", (0.55, 0.03, 0.03), rough=0.25,
                 emit=(1.0, 0.06, 0.05), emit_strength=4.0, cull=False)
    lens_y = mat("lamp_yellow", (0.55, 0.4, 0.02), rough=0.25,
                 emit=(1.0, 0.62, 0.03), emit_strength=3.4, cull=False)
    lens_g = mat("lamp_green", (0.03, 0.4, 0.12), rough=0.25,
                 emit=(0.06, 0.95, 0.32), emit_strength=4.0, cull=False)

    b.cyl_z(0.0, -0.16, 0.0, 3.15, 0.05, POLE_MAT, n=10)
    b.cyl_z(0.0, -0.16, 0.0, 0.06, 0.09, POLE_MAT, n=10)
    b.box(0.0, -0.12, zc, 0.06, 0.12, 0.10, BRACKET_MAT)

    b.box(0.0, -0.055, zc, hw * 2 + 0.10, 0.02, hh * 2 + 0.10, rim)
    b.box(0.0, -0.045, zc, hw * 2 + 0.05, 0.02, hh * 2 + 0.05, board)

    outline = [(x, zc + z) for (x, z) in rounded_rect_local(hw * 2, hh * 2, 0.075, seg=4)]
    b.plate(outline, 0.0, dep, 0.03, dark, dark)
    b.recalc()

    # Short visor hoods so the lenses stay visible from above; lens disc sits
    # flush with the visor rim.
    for dz, lmat in ((0.30, lens_r), (0.0, lens_y), (-0.30, lens_g)):
        b.cyl_y(0.0, zc + dz, front_y - 0.005, front_y + 0.045, 0.094, dark, n=14, caps=False)
        b.disc_y(0.0, zc + dz, front_y + 0.05, 0.085, lmat, n=16)
    b.recalc()
    return b.finalize(name)


# ---------------------------------------------------------------------------
# Scene reset + build
# ---------------------------------------------------------------------------

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


reset_scene()
init_metals()
face_png = rasterise_faces()

made = []  # (name, obj)
for (name, shape, fid, size, zc) in KIT:
    obj = build_sign(name, shape, face_png[fid], size, zc)
    made.append((name, obj))

signal = build_signal_head("signal_head_3")
made.append(("signal_head_3", signal))

# ---------------------------------------------------------------------------
# Export one GLB per assembly
# ---------------------------------------------------------------------------

exported = []
for name, obj in made:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    path = os.path.join(out_dir, name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        use_selection=True, export_format="GLB", export_apply=True,
        export_yup=True, export_cameras=False, export_lights=False,
    )
    exported.append(path)

# Force alphaMode=MASK on the textured face materials (see fix_glb_alpha).
fix_glb_alpha(exported)

# ---------------------------------------------------------------------------
# Contact-sheet layout
# ---------------------------------------------------------------------------

COLS = 4
GX, GY = 3.0, 4.6
n = len(made)
rows = (n + COLS - 1) // COLS
for i, (name, obj) in enumerate(made):
    col = i % COLS
    row = i // COLS
    # Centre the (possibly short) last row.
    in_row = min(COLS, n - row * COLS)
    obj.location = ((col - (in_row - 1) / 2.0) * GX, -row * GY, 0.0)

# Ground.
bpy.ops.mesh.primitive_plane_add(size=80, location=(0, -((rows - 1) * GY) / 2.0, 0))
bpy.context.active_object.data.materials.append(
    mat("asphalt", (0.14, 0.145, 0.15), rough=0.85))

# World HDRI.
world = bpy.data.worlds.new("sky")
world.use_nodes = True
bpy.context.scene.world = world
nt = world.node_tree
for nnode in list(nt.nodes):
    nt.nodes.remove(nnode)
out = nt.nodes.new("ShaderNodeOutputWorld")
bg = nt.nodes.new("ShaderNodeBackground")
try:
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(HDRI)
    nt.links.new(env.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 1.1
except Exception:
    bg.inputs[0].default_value = (0.75, 0.8, 0.9, 1.0)
nt.links.new(bg.outputs[0], out.inputs[0])

# Sun.
sun_data = bpy.data.lights.new("sun", type="SUN")
sun_data.energy = 3.2
sun_data.color = (1.0, 0.96, 0.9)
sun = bpy.data.objects.new("sun", sun_data)
bpy.context.collection.objects.link(sun)
sun.rotation_euler = (math.radians(58), math.radians(6), math.radians(35))

# Camera (front, +Y side, looking toward -Y).
tgt = bpy.data.objects.new("target", None)
tgt.location = (0, -((rows - 1) * GY) / 2.0, 2.2)
bpy.context.collection.objects.link(tgt)
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 52
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
# High + pulled back so rows separate vertically instead of occluding.
cam.location = (0.0, 15.0, 8.5)
con = cam.constraints.new("TRACK_TO")
con.target = tgt
con.track_axis = "TRACK_NEGATIVE_Z"
con.up_axis = "UP_Y"
bpy.context.scene.camera = cam

# Render.
sc = bpy.context.scene
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        sc.render.engine = eng
        break
    except Exception:
        continue
try:
    sc.eevee.taa_render_samples = 64
except Exception:
    pass
sc.render.resolution_x = 1600
sc.render.resolution_y = 1200
try:
    sc.view_settings.view_transform = "AgX"
except Exception:
    try:
        sc.view_settings.view_transform = "Filmic"
    except Exception:
        pass
sc.render.filepath = os.path.join(PREVIEW_DIR, "sign_kit.png")
sc.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)

total = 0
for name, _o in made:
    p = os.path.join(out_dir, name + ".glb")
    if os.path.exists(p):
        total += os.path.getsize(p)
print("SIGN_KIT_OK assemblies=%d total_glb_bytes=%d out=%s" % (len(made), total, out_dir))
