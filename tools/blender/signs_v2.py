"""
Bulgarian ROAD-SIGN asset kit v2 (headless Blender) — the SIGN-ASSET drop for
the ZONE/CROSSING scenario maps (ADR-006 stages 2a/3a + the surface-patch
slice). Sibling of signs.py: it NEVER regenerates the shipped v1 GLBs — it
builds ONLY the new assemblies, with the exact same conventions (shaped plate
+ bracket + galvanised pole, textured face quad from the project's own
original SVG artwork in content/signs/svg — we do NOT invent faces):

  sign_no_overtaking    В24 забранено изпреварване (circle, red ring, two cars)
  sign_no_stopping      В27 забранени престоят и паркирането (blue disc, red X)
  sign_slippery         А15 опасност от хлъзгане (triangle, skidding car)
  sign_rail_guarded     А32 жп прелез С бариери (triangle, fence pictogram)
  sign_rail_unguarded   А33 жп прелез БЕЗ бариери (triangle, locomotive)
  sign_rail_cross       Андреевски кръст: X-shaped crossbuck post at the line
                        (geometry-only — white slats, red tips; no face art)
  rail_barrier          striped barrier arm, STATIC DOWN pose (rx-guarded —
                        the timetable is grading-side; render-only prop).
                        Post at origin; the arm runs along Blender +X, which
                        the renderer's pi-bake maps to the DRIVER'S LEFT
                        (toward the road centre), same face_quad convention.

    "E:/blender/blender-5.1.2-windows-x64/blender.exe" \
      --background --python tools/blender/signs_v2.py -- <out_dir>

GLBs land in <out_dir>; draco-compress each with tools/glb/optimize.mjs into
platform/public/sim/signs/. A contact-sheet preview renders to
tools/blender/previews/sign_kit_v2.png (non-fatal if it cannot).
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
    out_dir = os.path.join(os.path.expanduser("~"), "sign-kit-v2-out")
os.makedirs(out_dir, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)

FACE_PX = 512  # rasterised face texture resolution (square)

# ---------------------------------------------------------------------------
# Face catalog — the project's own Bulgarian sign SVGs (never fabricate).
# ---------------------------------------------------------------------------

FACES = {
    "v24": ("v24.svg", None),  # В24 забранено изпреварване
    "v27": ("v27.svg", None),  # В27 забранени престоят и паркирането
    "a15": ("a15.svg", None),  # А15 опасност от хлъзгане
    "a32": ("a32.svg", None),  # А32 жп прелез с бариери
    "a33": ("a33.svg", None),  # А33 жп прелез без бариери
}

# name, shape, face_id, plate_size(m for full 200-viewBox), plate-centre height z
KIT = [
    ("sign_no_overtaking", "circle_pro", "v24", 0.72, 2.12),
    ("sign_no_stopping",   "circle_pro", "v27", 0.72, 2.12),
    ("sign_slippery",      "triangle",   "a15", 0.95, 2.05),
    ("sign_rail_guarded",  "triangle",   "a32", 0.95, 2.05),
    ("sign_rail_unguarded","triangle",   "a33", 0.95, 2.05),
]

# ---------------------------------------------------------------------------
# Rasterise the needed SVG faces -> PNG via node + sharp (signs.py pattern).
# ---------------------------------------------------------------------------

def rasterise_faces():
    tmp = tempfile.mkdtemp(prefix="signfaces2_")
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

    _run_node(["node", raster_mjs, jobs_json, platform_pkg])
    return face_png


def _run_node(cmd):
    try:
        subprocess.run(cmd, cwd=PLATFORM_DIR, check=True)
    except (FileNotFoundError, OSError):
        subprocess.run(" ".join('"%s"' % c for c in cmd), cwd=PLATFORM_DIR,
                       check=True, shell=True)


def fix_glb_alpha(glb_paths):
    """Rewrite face_* materials to alphaMode=MASK (signs.py precedent — the
    5.1 exporter writes textured alpha as BLEND; the sim expects alpha-CLIP).
    No-op for geometry-only assemblies (they carry no face_* material)."""
    tmp = tempfile.mkdtemp(prefix="signfix2_")
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
# Materials (signs.py conventions)
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
    m.use_backface_culling = cull
    _mats[name] = m
    return m


def face_material(name, png_path):
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
    try:
        m.blend_method = "CLIP"
        m.alpha_threshold = 0.5
    except Exception:
        pass
    m.use_backface_culling = True
    return m


POLE_MAT = None
EDGE_MAT = None
BRACKET_MAT = None


def init_metals():
    global POLE_MAT, EDGE_MAT, BRACKET_MAT
    POLE_MAT = mat("galv_pole", (0.62, 0.64, 0.66), rough=0.42, metal=0.85)
    EDGE_MAT = mat("plate_edge", (0.72, 0.74, 0.76), rough=0.5, metal=0.6)
    BRACKET_MAT = mat("galv_bracket", (0.55, 0.57, 0.59), rough=0.5, metal=0.8)


# ---------------------------------------------------------------------------
# bmesh Builder (verbatim signs.py conventions)
# ---------------------------------------------------------------------------

class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.slots = []
        self.slot_of = {}
        self._recalc_pending = []

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

    def box(self, cx, cy, cz, sx, sy, sz, material):
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        c = [(cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
             (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
             (cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz),
             (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz)]
        for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                  (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]:
            self.face([c[i] for i in f], material)

    def slanted_box(self, u0, u1, cz, angle, height, y0, y1, material):
        """Box whose long axis runs in the X-Z plane at `angle` from
        horizontal, spanning [u0, u1] along that axis, `height` across it,
        thickness [y0, y1] in Y. Used for crossbuck slats + no other rotation
        machinery (signs.py's Builder is axis-aligned only)."""
        ca, sa = math.cos(angle), math.sin(angle)
        hh = height / 2.0

        def pt(u, v, y):
            return (u * ca - v * sa, y, cz + u * sa + v * ca)

        c = [pt(u0, -hh, y0), pt(u1, -hh, y0), pt(u1, hh, y0), pt(u0, hh, y0),
             pt(u0, -hh, y1), pt(u1, -hh, y1), pt(u1, hh, y1), pt(u0, hh, y1)]
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

    def plate(self, outline, y_center, thick, bevel, front_mat, edge_mat):
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

        self.face([(x, yf, z) for (x, z) in inset], front_mat)
        for i in range(n):
            j = (i + 1) % n
            self.face([(inset[i][0], yf, inset[i][1]), (inset[j][0], yf, inset[j][1]),
                       (outline[j][0], ych, outline[j][1]), (outline[i][0], ych, outline[i][1])],
                      edge_mat)
            self.face([(outline[i][0], ych, outline[i][1]), (outline[j][0], ych, outline[j][1]),
                       (outline[j][0], yb, outline[j][1]), (outline[i][0], yb, outline[i][1])],
                      edge_mat)
        self.face([(x, yb, z) for (x, z) in reversed(outline)], edge_mat)

    def face_quad(self, size, y, z_center, material):
        h = size / 2.0
        verts = [(-h, y, z_center + h), (h, y, z_center + h),
                 (h, y, z_center - h), (-h, y, z_center - h)]
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
# Shape outlines (signs.py verbatim, only the shapes this kit uses)
# ---------------------------------------------------------------------------

def map_local(sx, sy, size):
    return ((sx - 100.0) * size / 200.0, -(sy - 100.0) * size / 200.0)


def circle_svg(r, n, cx=100.0, cy=100.0):
    return [(cx + r * math.cos(2 * math.pi * i / n),
             cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def outline_svg(shape):
    if shape == "triangle":
        return [(100, 12), (191, 181), (9, 181)]
    if shape == "circle_pro":
        return circle_svg(99, 28)
    raise ValueError(shape)


# ---------------------------------------------------------------------------
# Assembly builders
# ---------------------------------------------------------------------------

THICK = 0.03
BEVEL = 0.018
POLE_R = 0.032
POLE_Y = -0.075


def build_sign(name, shape, face_png, size, z_center):
    b = Builder()
    outline = [map_local(sx, sy, size) for (sx, sy) in outline_svg(shape)]
    fmat = face_material("face_" + name, face_png)

    plate_top = max(z for (_x, z) in outline)
    plate_bot = min(z for (_x, z) in outline)
    hf = THICK / 2.0
    pole_top = z_center + plate_top + 0.04

    b.cyl_z(0.0, POLE_Y, 0.0, pole_top, POLE_R, POLE_MAT, n=10)
    b.cyl_z(0.0, POLE_Y, 0.0, 0.05, POLE_R * 1.8, POLE_MAT, n=10)

    plate_back = z_center
    b.cyl_z(0.0, POLE_Y, plate_back - 0.05, plate_back + 0.05, POLE_R * 1.35,
            BRACKET_MAT, n=10)
    y0 = POLE_Y + POLE_R
    y1 = -hf
    b.box(0.0, (y0 + y1) / 2.0, plate_back, 0.055, abs(y1 - y0) + 0.005, 0.30, BRACKET_MAT)
    strip_h = min(0.42, (plate_top - plate_bot) * 0.7)
    b.box(0.0, -hf - 0.008, z_center, 0.07, 0.016, strip_h, BRACKET_MAT)

    plate_local = [(x, z_center + z) for (x, z) in outline]
    b.plate(plate_local, 0.0, THICK, BEVEL,
            mat("plate_front", (0.86, 0.87, 0.88), rough=0.45, metal=0.05), EDGE_MAT)

    b.recalc()
    b.face_quad(size, hf + 0.004, z_center, fmat)
    return b.finalize(name)


# Stylized red/white palette (retroreflective film approximation, ADR-001).
def sign_white():
    return mat("cross_white", (0.88, 0.89, 0.90), rough=0.4, metal=0.05)


def sign_red():
    return mat("cross_red", (0.72, 0.05, 0.08), rough=0.4, metal=0.05)


def build_rail_cross(name):
    """Андреевски кръст: X-shaped crossbuck on a galvanised pole. White slats
    with red tips (stylized original art — geometry only, no textured face).
    Slats are stacked in Y (front slat proud of the back one) so the X never
    z-fights where the bars overlap."""
    b = Builder()
    zc = 2.35  # cross centre height
    slat_len = 1.5
    slat_h = 0.20
    slat_t = 0.03
    tip = slat_len * 0.2  # red tip length each end
    angle = math.radians(28)  # shallow X, crossbuck-style

    pole_top = zc + slat_len / 2 * math.sin(angle) + 0.12
    b.cyl_z(0.0, POLE_Y, 0.0, pole_top, POLE_R, POLE_MAT, n=10)
    b.cyl_z(0.0, POLE_Y, 0.0, 0.05, POLE_R * 1.8, POLE_MAT, n=10)
    # Bracket collar + connector to the slat stack.
    b.cyl_z(0.0, POLE_Y, zc - 0.05, zc + 0.05, POLE_R * 1.35, BRACKET_MAT, n=10)
    b.box(0.0, (POLE_Y + POLE_R - slat_t) / 2.0, zc, 0.055,
          abs(-slat_t - (POLE_Y + POLE_R)) + 0.005, 0.24, BRACKET_MAT)

    white = sign_white()
    red = sign_red()
    hl = slat_len / 2.0
    # Back slat (rising left-to-right), front slat stacked just proud of it.
    for (a, y0, y1) in ((angle, -slat_t, 0.0), (-angle, 0.002, slat_t + 0.002)):
        b.slanted_box(-hl, -hl + tip, zc, a, slat_h, y0, y1, red)
        b.slanted_box(-hl + tip, hl - tip, zc, a, slat_h, y0, y1, white)
        b.slanted_box(hl - tip, hl, zc, a, slat_h, y0, y1, red)

    b.recalc()
    return b.finalize(name)


def build_rail_barrier(name):
    """Rail barrier arm, STATIC DOWN pose (render-only; the timetable/grading
    is runtime-side). Post at the origin; the arm spans Blender +X — the
    renderer's pi-bake turns that into the driver's LEFT, i.e. from the right
    curb across the incoming lane toward the road centre. Sized for the
    perceptually-scaled 1+1 street (halfWidth ~8.1 m + 0.8 m curb offset)."""
    b = Builder()
    arm_z = 1.0     # arm axis height (down pose)
    arm_len = 8.8   # reaches the road centre from the curb-side post
    arm_h = 0.22    # vertical face the driver sees
    arm_t = 0.10    # thickness (along Y)
    seg = 1.1       # stripe length

    dark = mat("barrier_dark", (0.16, 0.165, 0.17), rough=0.55, metal=0.35)
    white = sign_white()
    red = sign_red()

    # Post + base flange + pivot hub.
    b.cyl_z(0.0, 0.0, 0.0, arm_z + 0.28, 0.06, POLE_MAT, n=10)
    b.cyl_z(0.0, 0.0, 0.0, 0.06, 0.11, POLE_MAT, n=10)
    b.box(0.09, 0.0, arm_z, 0.22, 0.16, 0.30, dark)

    # Counterweight stub behind the pivot (Blender -X = away from the road).
    b.box(-0.42, 0.0, arm_z, 0.44, 0.16, 0.26, dark)

    # Striped arm: red/white segments, red at the tip.
    x = 0.20
    idx = 0
    while x < 0.20 + arm_len:
        x1 = min(x + seg, 0.20 + arm_len)
        remaining = (0.20 + arm_len) - x1
        m = red if (idx % 2 == 0 or remaining <= 1e-6) else white
        # Last segment forced red for the tip only when it would land white.
        if remaining <= 1e-6 and idx % 2 == 1:
            m = red
        b.box((x + x1) / 2.0, 0.0, arm_z, x1 - x, arm_t, arm_h, m)
        x = x1
        idx += 1

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

made = []
for (name, shape, fid, size, zc) in KIT:
    obj = build_sign(name, shape, face_png[fid], size, zc)
    made.append((name, obj))

made.append(("sign_rail_cross", build_rail_cross("sign_rail_cross")))
made.append(("rail_barrier", build_rail_barrier("rail_barrier")))

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

fix_glb_alpha(exported)

# ---------------------------------------------------------------------------
# Contact-sheet preview (non-fatal)
# ---------------------------------------------------------------------------

try:
    COLS = 4
    GX, GY = 3.4, 4.6
    n = len(made)
    rows = (n + COLS - 1) // COLS
    for i, (name, obj) in enumerate(made):
        col = i % COLS
        row = i // COLS
        in_row = min(COLS, n - row * COLS)
        obj.location = ((col - (in_row - 1) / 2.0) * GX, -row * GY, 0.0)

    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, -((rows - 1) * GY) / 2.0, 0))
    bpy.context.active_object.data.materials.append(
        mat("asphalt", (0.14, 0.145, 0.15), rough=0.85))

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

    sun_data = bpy.data.lights.new("sun", type="SUN")
    sun_data.energy = 3.2
    sun_data.color = (1.0, 0.96, 0.9)
    sun = bpy.data.objects.new("sun", sun_data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(58), math.radians(6), math.radians(35))

    tgt = bpy.data.objects.new("target", None)
    tgt.location = (0, -((rows - 1) * GY) / 2.0, 1.8)
    bpy.context.collection.objects.link(tgt)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 52
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.0, 13.0, 7.0)
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
    except Exception:
        pass
    sc.render.resolution_x = 1600
    sc.render.resolution_y = 900
    try:
        sc.view_settings.view_transform = "AgX"
    except Exception:
        try:
            sc.view_settings.view_transform = "Filmic"
        except Exception:
            pass
    sc.render.filepath = os.path.join(PREVIEW_DIR, "sign_kit_v2.png")
    sc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
except Exception as exc:  # preview must never fail the asset build
    print("SIGN_KIT_V2_PREVIEW_SKIPPED %s" % exc)

total = 0
for name, _o in made:
    p = os.path.join(out_dir, name + ".glb")
    if os.path.exists(p):
        total += os.path.getsize(p)
print("SIGN_KIT_V2_OK assemblies=%d total_glb_bytes=%d out=%s" % (len(made), total, out_dir))
