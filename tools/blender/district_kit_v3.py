"""
Waterfront financial-district BUILDING KIT v3 (headless Blender).

Replaces the uniform blue-glass kit (glass_city_kit.py) with the REF 1 target
(docs/simulation/70_VISUAL_REFERENCE_BRIEF.md): a Gulf-style waterfront district
with FOUR distinct facade systems, dimensioned from the research digest —

  A  exposed-concrete punched grid — REAL deep window recesses (glass set back
     0.5 m, chamfered pier corners), strict 3.0 m pitch, solid parapet crown,
     plus a wide "slab" variant with hinted balconies (REF 1 tower 6).
  B  cream precast vertical strips — full-height glazing strips between
     projecting fins, gently barrel-curved narrow ends, thin oversailing parapet.
  C  bronze dark-glass curtain-wall TWINS — 1.5 m unitized module, floor caps +
     intermediate transom, highest lit ratio, flat top with louver band.
  D  horizontal white bands + dark glass ribbons with ROUNDED plan corners —
     bands project 0.3 m past the glass (drop-shadow line), blank double-band lid.

Every tower gets a 2–3 floor stone podium (oversailing ~3.5 m/side) with a
continuous retail glazing band, occasional red signage strip, a double-height
lobby notch + canopy. Two low bronze retail pavilions round out the kit.

Global datums (digest cross-system note): FLOOR_H = 3.8 m, glazing module 1.5 m,
podium floor 4.5 m — so towers of different heights register on shared lines.

Lit-window variation is BAKED: deterministic hash picks lit cells, merged into
horizontal runs (fewer quads), emissive material exported in the GLB.

Budget: <=6 materials per model, tower tris <= ~15k (printed per model).

    blender --background --python tools/blender/district_kit_v3.py -- <out_dir>
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
    out_dir = os.path.join(os.path.expanduser("~"), "district-v3-out")
os.makedirs(out_dir, exist_ok=True)

HDRI = "E:/AI driver/platform/public/sim/env/sky_urban_1k.hdr"

FLOOR_H = 3.8      # global floor-to-floor datum (digest #1)
GLZ = 1.5          # global glazing module (digest #7)
POD_FLOOR = 4.5    # podium floor height (digest #12)


# ---------------------------------------------------------------------------
# materials (cached by name — shared across objects, slots added per object)
# ---------------------------------------------------------------------------
_mats = {}


def mat(name, rgb, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, coat=0.0):
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
    """Kit palette. Reuse aggressively so each model stays <=6 materials."""
    return {
        # facade primaries
        "conc_beige":   mat("conc_beige", (0.60, 0.51, 0.37), rough=0.80),
        "conc_grey":    mat("conc_grey", (0.54, 0.52, 0.47), rough=0.80),
        "precast_cream": mat("precast_cream", (0.78, 0.68, 0.48), rough=0.72),
        "band_white":   mat("band_white", (0.85, 0.84, 0.80), rough=0.55),
        # glass
        "glass_dark":   mat("glass_dark", (0.025, 0.032, 0.042), rough=0.06, coat=0.6),
        "glass_bronze": mat("glass_bronze", (0.16, 0.10, 0.05), rough=0.07, metal=0.35, coat=0.5),
        "bronze_metal": mat("bronze_metal", (0.34, 0.23, 0.12), rough=0.30, metal=0.9),
        # baked lit interiors (warm golden-hour glow)
        "glass_lit":    mat("glass_lit", (0.05, 0.045, 0.04), rough=0.2,
                            emit=(1.0, 0.62, 0.28), emit_strength=1.35),
        # roofs (matte, so tops don't bounce sky)
        "roof_dark":    mat("roof_dark", (0.07, 0.07, 0.075), rough=0.9),
        # podium / ground band
        "stone_podium": mat("stone_podium", (0.56, 0.50, 0.40), rough=0.82),
        "stone_dark":   mat("stone_dark", (0.14, 0.13, 0.12), rough=0.6),
        "sign_red":     mat("sign_red", (0.52, 0.03, 0.04), rough=0.35,
                            emit=(1.0, 0.10, 0.07), emit_strength=1.5),
    }


# ---------------------------------------------------------------------------
# geometry builder — one bmesh per model, face material_index per slot
# ---------------------------------------------------------------------------
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

    def box(self, cx, cy, cz, sx, sy, sz, material):
        mi = self._mi(material)
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        c = [(cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
             (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
             (cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz),
             (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz)]
        v = [self.bm.verts.new(p) for p in c]
        for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]:
            self.bm.faces.new([v[i] for i in f]).material_index = mi

    def prism(self, pts, z0, z1, material, caps=True):
        """Extrude a plan polygon [(x,y),...] from z0 to z1. Winding enforced CCW
        (viewed from +Z) so side faces point outward."""
        area = 0.0
        n = len(pts)
        for i in range(n):
            x0, y0 = pts[i]
            x1, y1 = pts[(i + 1) % n]
            area += x0 * y1 - x1 * y0
        if area < 0:
            pts = list(reversed(pts))
        mi = self._mi(material)
        vb = [self.bm.verts.new((p[0], p[1], z0)) for p in pts]
        vt = [self.bm.verts.new((p[0], p[1], z1)) for p in pts]
        for i in range(n):
            j = (i + 1) % n
            self.bm.faces.new([vb[i], vb[j], vt[j], vt[i]]).material_index = mi
        if caps:
            self.bm.faces.new(list(reversed(vb))).material_index = mi
            self.bm.faces.new(vt).material_index = mi

    def quad(self, a, b, c, d, material):
        mi = self._mi(material)
        v = [self.bm.verts.new(p) for p in (a, b, c, d)]
        self.bm.faces.new(v).material_index = mi

    def finalize(self, name):
        mesh = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(name, mesh)
        for m in self.slots:
            obj.data.materials.append(m)
        bpy.context.collection.objects.link(obj)
        mesh.calc_loop_triangles()
        obj["tris"] = len(mesh.loop_triangles)
        return obj


# ---------------------------------------------------------------------------
# facade plumbing
# ---------------------------------------------------------------------------
class Face:
    """One rectangular tower face. u runs along the face following the CCW
    perimeter (so lit quads + prisms built in (u, d) coords face outward);
    d is depth along the outward normal (0 = facade plane)."""

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


def face_box(b, face, uc, dc, zc, su, sd, sz, material):
    x = face.cx + uc * face.ux + dc * face.nx
    y = face.cy + uc * face.uy + dc * face.ny
    sx = su * abs(face.ux) + sd * abs(face.nx)
    sy = su * abs(face.uy) + sd * abs(face.ny)
    b.box(x, y, zc, sx, sy, sz, material)


def is_lit(c, f, key, pct):
    """Deterministic baked lit-window hash."""
    h = (c * 73856093) ^ (f * 19349663) ^ (key * 83492791)
    return (h % 100) < pct


def lit_runs(n_cells, f, key, pct):
    """Merge horizontally-adjacent lit cells into runs -> fewer quads."""
    runs = []
    start = None
    for c in range(n_cells):
        if is_lit(c, f, key, pct):
            if start is None:
                start = c
        else:
            if start is not None:
                runs.append((start, c - 1))
                start = None
    if start is not None:
        runs.append((start, n_cells - 1))
    return runs


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


class Perimeter:
    """Arc-length sampler over a closed plan polygon (for curved facades)."""

    def __init__(self, pts):
        self.pts = pts
        self.cum = [0.0]
        n = len(pts)
        for i in range(n):
            x0, y0 = pts[i]
            x1, y1 = pts[(i + 1) % n]
            self.cum.append(self.cum[-1] + math.hypot(x1 - x0, y1 - y0))
        self.total = self.cum[-1]

    def at(self, s):
        s = s % self.total
        n = len(self.pts)
        for i in range(n):
            if self.cum[i + 1] >= s:
                x0, y0 = self.pts[i]
                x1, y1 = self.pts[(i + 1) % n]
                seg = self.cum[i + 1] - self.cum[i] or 1.0
                t = (s - self.cum[i]) / seg
                px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
                tx, ty = (x1 - x0) / seg, (y1 - y0) / seg
                return (px, py), (tx, ty), (ty, -tx)  # pos, tangent, outward normal
        return self.pts[0], (1, 0), (0, -1)


def barrel_plan(hx, hy, sag, seg=12):
    """Rectangle with the two narrow (x) ends bulged outward by `sag` (System B).
    sag ~ 2-3 gives the digest's 15-25 m plan radius. sag<=0 -> plain rectangle."""
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
# shared podium (digest #12-14)
# ---------------------------------------------------------------------------
def podium(b, W, D, pf, mats, sign_faces=0, arcade=False):
    pw, pd = W + 7.0, D + 7.0
    ph = pf * POD_FLOOR
    b.box(0, 0, ph / 2, pw, pd, ph, mats["stone"])
    faces = rect_faces(pw, pd)
    for i, f in enumerate(faces):
        L = f.length
        # continuous retail glazing band ~3.8 m tall
        face_box(b, f, 0, 0.09, 2.45, L - 2.4, 0.10, 3.9, mats["retail"])
        if arcade:
            ncol = max(2, int((L - 4) // 6))
            for c in range(ncol + 1):
                u = -(ncol * 6) / 2 + c * 6
                face_box(b, f, u, 0.5, 2.25, 0.75, 1.0, 4.5, mats["stone"])
        if i < sign_faces:
            face_box(b, f, 0, 0.12, 4.95, L * 0.55, 0.12, 0.9, mats["sign"])
    # double-height lobby notch + canopy on the -Y street face
    lf = faces[3]
    face_box(b, lf, 0, 0.16, 4.45, 10.0, 0.10, 8.3, mats["retail"])
    face_box(b, lf, 0, 1.8, 4.62, 11.0, 3.4, 0.35, mats["stone"])
    return ph


# ---------------------------------------------------------------------------
# SYSTEM A — exposed-concrete punched grid, deep recesses (digest #1-4)
# ---------------------------------------------------------------------------
def tower_grid(name, floors, nx, ny, tone, key, pf=3, sign_faces=0,
               arcade=False, balconies=False, lit_pct=22):
    m = M()
    b = Builder()
    conc = m["conc_" + tone]
    glass, glow = m["glass_dark"], m["glass_lit"]
    mats = {"stone": m["stone_podium"], "retail": glass, "sign": m["sign_red"]}

    PITCH, PIER, OPEN = 3.0, 0.9, 2.1        # 0.9 pier + 2.1 opening (digest #2)
    W = nx * PITCH + PIER
    D = ny * PITCH + PIER
    ph = podium(b, W, D, pf, mats, sign_faces, arcade)
    H = floors * FLOOR_H
    top = ph + H

    # inner dark-glass box, set back 0.5 m — the deep-recess read (digest #3)
    b.box(0, 0, ph + H / 2, W - 1.0, D - 1.0, H, glass)

    for f in rect_faces(W, D):
        n_op = nx if abs(f.length - W) < 0.01 else ny
        L = f.length
        # full-height piers, outer corners chamfered 0.13 (digest #3 notch)
        ch = 0.13
        for c in range(n_op + 1):
            uc = -L / 2 + c * PITCH + PIER / 2
            w2 = PIER / 2
            poly = [f.plan(uc - w2, -0.62), f.plan(uc + w2, -0.62),
                    f.plan(uc + w2, -ch), f.plan(uc + w2 - ch, 0),
                    f.plan(uc - w2 + ch, 0), f.plan(uc - w2, -ch)]
            b.prism(poly, ph, top, conc, caps=True)
        # spandrel bands: 1.6 m (sill+head), opening 2.2 m tall
        for fl in range(floors):
            z = ph + fl * FLOOR_H
            face_box(b, f, 0, -0.31, z + 0.8, L, 0.62, 1.6, conc)
            # baked lit interiors, merged runs, just in front of the glass box
            for (c0, c1) in lit_runs(n_op, fl, key, lit_pct):
                ua = -L / 2 + PIER + c0 * PITCH
                ub = -L / 2 + PIER + c1 * PITCH + OPEN
                zlo, zhi = z + 1.75, z + 3.7
                b.quad(f.pt(ua, -0.40, zlo), f.pt(ub, -0.40, zlo),
                       f.pt(ub, -0.40, zhi), f.pt(ua, -0.40, zhi), glow)
        # balconies hinted on one long face (REF 1 tower 6)
        if balconies and f.ny < -0.5:
            for fl in range(1, floors):
                z = ph + fl * FLOOR_H
                for c in range(1, n_op - 1, 3):
                    u = -L / 2 + PIER + c * PITCH + OPEN / 2
                    face_box(b, f, u, 0.8, z + 1.68, 2.5, 1.6, 0.14, conc)
                    face_box(b, f, u, 1.58, z + 2.3, 2.5, 0.07, 1.05, glass)

    # solid concrete parapet crown, no window row (digest #4) + dark roof inset
    b.box(0, 0, top + 1.1, W + 0.06, D + 0.06, 2.2, conc)
    b.box(0, 0, top + 2.24, W - 2.5, D - 2.5, 0.16, m["roof_dark"])
    return b.finalize(name)


# ---------------------------------------------------------------------------
# SYSTEM B — cream precast vertical strips, curved ends (digest #5-6)
# ---------------------------------------------------------------------------
def tower_strips(name, floors, hx, hy, sag, key, pf=2, sign_faces=0, lit_pct=14):
    m = M()
    b = Builder()
    cream = m["precast_cream"]
    glass, glow = m["glass_dark"], m["glass_lit"]
    mats = {"stone": m["stone_podium"], "retail": glass, "sign": m["sign_red"]}

    W = 2 * (hx + max(sag, 0))
    D = 2 * hy
    ph = podium(b, W, D, pf, mats, sign_faces)
    H = floors * FLOOR_H
    top = ph + H

    plan = barrel_plan(hx, hy, sag)
    # continuous glass shaft — spandrel glass hides slabs, no horizontal breaks
    b.prism(plan, ph, top, glass, caps=True)

    # projecting precast fins at constant arc pitch (fin 1.0 + strip 1.35)
    per = Perimeter(plan)
    pitch = 2.35
    n_fins = max(8, round(per.total / pitch))
    step = per.total / n_fins
    fw = 1.0
    for i in range(n_fins):
        pos, t, nrm = per.at(i * step)
        poly = []
        for du, dd in ((-fw / 2, -0.10), (fw / 2, -0.10), (fw / 2, 0.42), (-fw / 2, 0.42)):
            poly.append((pos[0] + t[0] * du + nrm[0] * dd,
                         pos[1] + t[1] * du + nrm[1] * dd))
        b.prism(poly, ph, top, cream, caps=True)

    # baked lit segments inside the glass strips between fins
    for i in range(n_fins):
        sa = i * step + fw / 2 + 0.12
        sb = (i + 1) * step - fw / 2 - 0.12
        if sb - sa < 0.5:
            continue
        p0, _, n0 = per.at(sa)
        p1, _, n1 = per.at(sb)
        for fl in range(floors):
            if not is_lit(i, fl, key, lit_pct):
                continue
            z = ph + fl * FLOOR_H
            a = (p0[0] + n0[0] * 0.12, p0[1] + n0[1] * 0.12)
            c = (p1[0] + n1[0] * 0.12, p1[1] + n1[1] * 0.12)
            b.quad((a[0], a[1], z + 0.9), (c[0], c[1], z + 0.9),
                   (c[0], c[1], z + 3.3), (a[0], a[1], z + 3.3), glow)

    # thin flat parapet slab, slightly oversailing (digest #6) + dark roof
    b.prism(offset_poly(plan, 0.6), top, top + 0.9, cream, caps=True)
    b.prism(offset_poly(plan, -0.4), top + 0.9, top + 0.96, m["roof_dark"], caps=True)
    return b.finalize(name)


# ---------------------------------------------------------------------------
# SYSTEM C — bronze curtain-wall (the TWINS) (digest #7-9)
# ---------------------------------------------------------------------------
def tower_curtain(name, floors, n_mod, key, pf=3, sign_faces=0, lit_pct=28):
    m = M()
    b = Builder()
    glass, mull, glow = m["glass_bronze"], m["bronze_metal"], m["glass_lit"]
    mats = {"stone": m["stone_podium"], "retail": glass, "sign": m["sign_red"]}

    W = D = n_mod * GLZ
    ph = podium(b, W, D, pf, mats, sign_faces)
    H = floors * FLOOR_H
    top = ph + H

    b.box(0, 0, ph + H / 2, W, D, H, glass)

    for f in rect_faces(W, D):
        L = f.length
        # vertical mullions every 1.5 m module
        for c in range(n_mod + 1):
            u = -L / 2 + c * GLZ
            face_box(b, f, u, 0.14, ph + H / 2, 0.07, 0.16, H, mull)
        for fl in range(floors):
            z = ph + fl * FLOOR_H
            # floor cap + intermediate transom at the 2.1 m sill line
            face_box(b, f, 0, 0.14, z + 0.06, L, 0.16, 0.12, mull)
            face_box(b, f, 0, 0.13, z + 2.1, L, 0.10, 0.06, mull)
            for (c0, c1) in lit_runs(n_mod, fl, key, lit_pct):
                ua = -L / 2 + c0 * GLZ + 0.08
                ub = -L / 2 + c1 * GLZ + GLZ - 0.08
                b.quad(f.pt(ua, 0.05, z + 0.25), f.pt(ub, 0.05, z + 0.25),
                       f.pt(ub, 0.05, z + 3.55), f.pt(ua, 0.05, z + 3.55), glow)
        face_box(b, f, 0, 0.14, top + 0.65, L, 0.16, 0.10, mull)

    # flat top: curtain extended 1.2 m past roof, dark louver band behind
    b.box(0, 0, top + 0.6, W, D, 1.2, glass)
    b.box(0, 0, top + 0.55, W - 0.5, D - 0.5, 1.1, mull)
    b.box(0, 0, top + 1.16, W - 0.7, D - 0.7, 0.12, m["roof_dark"])
    return b.finalize(name)


# ---------------------------------------------------------------------------
# SYSTEM D — horizontal white bands + dark ribbons, ROUNDED corners (digest #10-11)
# ---------------------------------------------------------------------------
def tower_bands(name, floors, hx, hy, r, key, pf=2, sign_faces=0, lit_pct=15):
    m = M()
    b = Builder()
    band = m["band_white"]
    glass, glow = m["glass_dark"], m["glass_lit"]
    mats = {"stone": m["stone_podium"], "retail": glass, "sign": m["sign_red"]}

    W, D = 2 * hx, 2 * hy
    ph = podium(b, W, D, pf, mats, sign_faces)
    top = ph + floors * FLOOR_H

    plan = rounded_rect(hx, hy, r)
    band_plan = offset_poly(plan, 0.3)  # band projects 0.3 m — drop-shadow line

    for fl in range(floors):
        z = ph + fl * FLOOR_H
        b.prism(band_plan, z, z + 1.35, band, caps=True)
        b.prism(plan, z + 1.35, z + 3.8, glass, caps=False)
        # lit cells on the straight edges only (corners sweep clean)
        edges = [(-(hx - r), -hy, 1, 0, 2 * (hx - r), 0, -1),
                 (hx, -(hy - r), 0, 1, 2 * (hy - r), 1, 0),
                 (hx - r, hy, -1, 0, 2 * (hx - r), 0, 1),
                 (-hx, hy - r, 0, -1, 2 * (hy - r), -1, 0)]
        for ei, (sx, sy, dx, dy, ln, nx, ny) in enumerate(edges):
            cells = int(ln // 3.0)
            if cells < 1:
                continue
            for (c0, c1) in lit_runs(cells, fl, key + ei * 7, lit_pct):
                ua, ub = c0 * 3.0 + 0.25, c1 * 3.0 + 2.75
                ax, ay = sx + dx * ua + nx * 0.07, sy + dy * ua + ny * 0.07
                bx, by = sx + dx * ub + nx * 0.07, sy + dy * ub + ny * 0.07
                b.quad((ax, ay, z + 1.6), (bx, by, z + 1.6),
                       (bx, by, z + 3.6), (ax, ay, z + 3.6), glow)

    # crown: blank double band — thick white lid (digest #11) + dark roof inset
    b.prism(band_plan, top, top + 2.7, band, caps=True)
    b.prism(offset_poly(plan, -0.8), top + 2.7, top + 2.78, m["roof_dark"], caps=True)
    return b.finalize(name)


# ---------------------------------------------------------------------------
# low retail pavilions — dark stone + bronze glazing (digest #20)
# ---------------------------------------------------------------------------
def pavilion(name, w, d, floors, key):
    m = M()
    b = Builder()
    stone, glass, mull = m["stone_dark"], m["glass_bronze"], m["bronze_metal"]

    b.box(0, 0, 0.25, w, d, 0.5, stone)  # plinth
    z = 0.5
    for fl in range(floors):
        gh = POD_FLOOR - 0.7 if fl < floors - 1 else POD_FLOOR - 0.7
        b.box(0, 0, z + gh / 2, w - 0.6, d - 0.6, gh, glass)
        # storefront mullions at 3 m centers
        for f in rect_faces(w - 0.6, d - 0.6):
            L = f.length
            ncol = int(L // 3.0)
            for c in range(ncol + 1):
                u = -(ncol * 3.0) / 2 + c * 3.0
                face_box(b, f, u, 0.03, z + gh / 2, 0.09, 0.10, gh, mull)
        z += gh
        if fl < floors - 1:
            b.box(0, 0, z + 0.35, w, d, 0.7, stone)  # intermediate slab band
            z += 0.7
    # flat roof slab oversailing 1.2 m with a 0.35 fascia (digest #20)
    b.box(0, 0, z + 0.225, w + 2.4, d + 2.4, 0.45, stone)
    return b.finalize(name)


# ---------------------------------------------------------------------------
# BUILD THE KIT
# ---------------------------------------------------------------------------
made = []


def add(o):
    made.append(o)


# System A — concrete punched grid (5)
add(tower_grid("t_grid_beige_50", 50, 13, 13, "beige", 11, pf=3, sign_faces=1, arcade=True))
add(tower_grid("t_grid_grey_38", 38, 11, 10, "grey", 12, pf=3))
add(tower_grid("t_grid_beige_26", 26, 10, 9, "beige", 13, pf=2, sign_faces=2))
add(tower_grid("t_slab_beige_18", 18, 16, 5, "beige", 14, pf=2, balconies=True))
add(tower_grid("t_grid_grey_12", 12, 8, 8, "grey", 15, pf=2, sign_faces=1))

# System B — cream vertical strips, curved ends (3)
add(tower_strips("t_strip_cream_36", 36, 15.0, 9.0, 2.5, 21, pf=2))
add(tower_strips("t_strip_cream_24", 24, 12.0, 8.5, 2.0, 22, pf=2, sign_faces=1))
add(tower_strips("t_strip_cream_14", 14, 11.0, 8.0, 0.0, 23, pf=2))

# System C — bronze curtain twins + one shorter single (3)
add(tower_curtain("t_curtain_twin_a_44", 44, 20, 31, pf=3, sign_faces=1))
add(tower_curtain("t_curtain_twin_b_44", 44, 20, 32, pf=3))
add(tower_curtain("t_curtain_bronze_20", 20, 16, 33, pf=2, sign_faces=1))

# System D — white bands + dark ribbons, rounded corners (3)
add(tower_bands("t_band_white_40", 40, 36.0, 16.0, 9.0, 41, pf=3, sign_faces=1))
add(tower_bands("t_band_white_28", 28, 24.0, 14.0, 7.0, 42, pf=2))
add(tower_bands("t_band_white_16", 16, 20.0, 12.0, 6.0, 43, pf=2, sign_faces=1))

# low retail pavilions (2)
add(pavilion("pav_bronze_2f", 30, 15, 2, 51))
add(pavilion("pav_bronze_1f", 24, 12, 1, 52))

# ---------------------------------------------------------------------------
# export one GLB per model (at origin, base z=0)
# ---------------------------------------------------------------------------
for o in made:
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, o.name + ".glb"),
                              use_selection=True, export_format="GLB", export_apply=True,
                              export_yup=True, export_cameras=False, export_lights=False)

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
cam_data.clip_start = 5.0     # depth precision at 500 m — kills lit-quad z-fighting
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

# close-up pass — verify recess depth / mullion grid / podium band at street scale
gl = by_name["t_grid_beige_26"].location
tgt.location = (gl.x + 15, gl.y - 10, 30)
cam.location = (gl.x + 55, gl.y - 95, 42)
cam_data.lens = 45
cam_data.clip_start = 1.0
sc.render.filepath = os.path.join(out_dir, "district_kit_v3_close.png")
bpy.ops.render.render(write_still=True)

total = sum(os.path.getsize(os.path.join(out_dir, o.name + ".glb")) for o in made)
print("DISTRICT_V3_OK models=%d total_glb_bytes=%d out=%s" % (len(made), total, out_dir))
