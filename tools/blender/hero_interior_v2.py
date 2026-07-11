"""hero_interior_v2.py — raise the GT-E interior's windshield opening (founder directive).

WHY (measured, 2026-07-10): from the SHIPPED cockpit camera (chassis
(0.24, 0.67, -0.255), vFOV 47, pitch -8) the authored aperture read only
fy 0.525..0.735 at the centre column — a 21% window; full-frame world 23%.
The aperture top was the sun-visor/header underside at chassis y~0.71
(z 0.46) and the headliner sat at y 0.77-0.80 — BELOW a raised eye, so the
roof header loomed no matter the pitch. Founder contract: >=65% of the frame
must be world; cowl line <=0.33 of frame height; header >=0.97/out of frame.

WHAT (all coords BLENDER frame: bx=-chassisX, by=chassisZ, bz=chassisY+0.55;
the interior GLB mounts through VitokCockpit yaw-pi, y-0.55 — mount and DEP
are untouched):
  DELETE  every shell island with bz_min >= 1.24: old header box
          (by 0.34..0.46, bz 1.31..1.40), old roof panel (bz 1.32..1.35),
          both sun visors (bz 1.26..1.34), the old mirror stem (floats after
          the header goes), AND the old mirror HOUSING (bz_min 1.19, the chunky
          central block that dropped into the sightline under the v2 camera —
          the founder's black mass). The glass quad (hotspot_mirror_rear) is
          KEPT as a node but raised + shrunk onto a new small high housing.
  DELETE  both A-pillar sails (bz spans 0.96..1.38, by_max > 0.9) — rebuilt
          longer + slimmer for the taller opening.
  CLAMP   cowl/scuttle lip: dash-forward verts (by>=0.95) onto the plane
          bz <= 0.96 - (by-0.95)*0.30 (the old lip rose to bz 1.045 at
          by 1.17 = chassis y 0.495 -> now slopes down to ~0.895 = y 0.35).
  CLAMP   driver binnacle hood to bz <= 1.036 - (by-0.67)*0.24 (top edge
          y 0.545 -> 0.486) and drop screen_cluster 2.5 cm so the cluster
          stays tucked under the shaved hood.
  CLAMP   centre-stack bezel to bz <= 1.062, screen_center dropped 3 cm.
  RAISE   headliner: new ceiling slab bz 1.407..1.435 (chassis y 0.857..0.885,
          under the exterior skin: REF roofline bz 1.436@by0.1 .. 1.457 peak).
  NEW     header strip by 0.06..0.16, bz 1.400..1.430 — the glass-top edge is
          now chassis y 0.850 at z 0.16, ABOVE the frame-top ray of the new
          camera (out of frame at rest). Founder asked y 0.95-1.00 but ALSO
          "don't poke above the GT-E roofline" — the fastback skin (y 0.886
          over the header, 0.907 peak) caps the header at 0.85. Intent
          delivered: glass top 0.14 m above the raised camera eye, header
          off-frame, window >=65%.
  NEW     slim A-pillars (6.5x7.5 cm) cowl corners -> header ends; sun visors
          tucked flat against the new headliner (over the driver's head, out
          of frame); a SMALL rear-view mirror housing high under the header
          (chassis y 0.79..0.85) on a thin discreet stalk, glass raised/shrunk
          onto it (upper-right of frame, out of the road band); B-pillars
          extended up to meet the new ceiling.
  ALSO    centre-stack bezel + centre screen dropped below the cowl line so the
          dark screen no longer pokes into the road view as a black slab.

MUST NOT BREAK (verified at the end): 13 hotspot_* nodes, screen_cluster /
screen_center, steering_wheel hierarchy, interior_shell/interior_seats
grouping, <=6 interior materials, <60k tris.

Run (from repo root — edits hero_interior_build.blend IN MEMORY, saves v2):
  "E:/blender/blender-5.1.2-windows-x64/blender.exe" --background \
    tools/blender/work/hero_interior_build.blend \
    --python tools/blender/hero_interior_v2.py
Outputs: work/hero_interior_v2.blend, work/hero_interior_v2.glb, and a
numeric window probe (centre-column span + full-frame world fraction) from
the shipped camera pose and the DEP. Then:
  cd platform && node ../tools/glb/optimize.mjs \
    ../tools/blender/work/hero_interior_v2.glb public/sim/vehicles/hero_interior.glb
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector

D = bpy.data
WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "work")

# --------------------------------------------------------------------------
# 1. Surgery on interior_shell
# --------------------------------------------------------------------------
shell = D.objects["interior_shell"]
bm = bmesh.new()
bm.from_mesh(shell.data)
bm.verts.ensure_lookup_table()

mw = shell.matrix_world
if any(abs(mw[i][3]) > 1e-6 for i in range(3)):
    raise RuntimeError("interior_shell is no longer at the origin — remap coords")

# --- islands ---------------------------------------------------------------
seen = set()
islands = []
for v in bm.verts:
    if v.index in seen:
        continue
    stack, isl = [v], set()
    while stack:
        cur = stack.pop()
        if cur.index in isl:
            continue
        isl.add(cur.index)
        for e in cur.link_edges:
            o = e.other_vert(cur)
            if o.index not in isl:
                stack.append(o)
    seen |= isl
    islands.append(isl)

doomed = set()
log = []
for isl in islands:
    xs = [bm.verts[i].co.x for i in isl]
    ys = [bm.verts[i].co.y for i in isl]
    zs = [bm.verts[i].co.z for i in isl]
    bz_min, bz_max, by_max = min(zs), max(zs), max(ys)
    # old header / roof / visors / mirror stem — everything that formed the
    # low ceiling (mirror housing survives at bz_min 1.19)
    if bz_min >= 1.24:
        doomed |= isl
        log.append(f"deleted high island bz[{bz_min:.2f},{bz_max:.2f}] "
                   f"by_max {by_max:.2f} ({len(isl)} verts)")
    # old A-pillar sails (B-pillars have by_max ~ -0.48 and are kept/raised)
    elif bz_min <= 1.05 and bz_max >= 1.30 and by_max > 0.9:
        doomed |= isl
        log.append(f"deleted A-pillar island x[{min(xs):+.2f},{max(xs):+.2f}] "
                   f"({len(isl)} verts)")
    # OLD rear-view mirror housing (isl#82): the chunky central block that hung
    # at chassis y 0.64-0.73 (eye level) — with the v2 camera raised +0.05 and
    # pitch relaxed to -5, it dropped into the sightline as the founder's black
    # mass. Deleted here; a SMALL housing + thin stalk + raised/shrunk glass are
    # rebuilt high under the header (see the new-geometry block below).
    elif (1.15 <= bz_min <= 1.22 and bz_max <= 1.30 and by_max <= 0.66
          and max(abs(vx) for vx in xs) <= 0.16):
        doomed |= isl
        log.append(f"deleted OLD mirror housing bz[{bz_min:.2f},{bz_max:.2f}] "
                   f"by[{min(ys):.2f},{max(ys):.2f}] ({len(isl)} verts)")

bmesh.ops.delete(bm, geom=[bm.verts[i] for i in doomed], context="VERTS")
bm.verts.ensure_lookup_table()

# --- vertex clamps ----------------------------------------------------------
n_cowl = n_hood = n_bezel = n_bpil = 0
for v in bm.verts:
    x, y, z = v.co.x, v.co.y, v.co.z
    # cowl / scuttle slope (keep door-mirror sail panels |x|>0.86 intact)
    if y >= 0.95 and abs(x) <= 0.86 and 0.90 <= z <= 1.15:
        cap = 0.96 - max(0.0, y - 0.95) * 0.30
        if z > cap:
            v.co.z = cap
            n_cowl += 1
    # driver binnacle hood shave (sloping cap, keeps the shroud shape)
    elif -0.56 <= x <= -0.12 and 0.64 <= y <= 0.85 and z >= 1.00:
        cap = 1.036 - max(0.0, y - 0.67) * 0.24
        if z > cap:
            v.co.z = cap
            n_hood += 1
    # centre-stack bezel shave: dropped to bz 1.000 (chassis y 0.45, ~3 cm
    # BELOW the cowl line 0.48) so the dark centre screen tucks under the dash
    # silhouette instead of poking into the road band as a black slab.
    elif -0.23 <= x <= 0.20 and 0.62 <= y <= 0.80 and z > 1.000:
        v.co.z = 1.000
        n_bezel += 1
    # B-pillar extension up to the new ceiling
    elif -0.60 <= y <= -0.44 and abs(x) >= 0.68 and z >= 1.32:
        v.co.z = 1.412
        n_bpil += 1
log.append(f"clamped verts: cowl {n_cowl}, hood {n_hood}, bezel {n_bezel}, "
           f"B-pillar raised {n_bpil}")

# --- new geometry (all int_dark, same slot as the old header/roof) ----------
mat_names = [m.name if m else "?" for m in shell.data.materials]
DARK = mat_names.index("int_dark")

def add_box(pmin, pmax):
    x0, y0, z0 = pmin
    x1, y1, z1 = pmax
    corners = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
               (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    add_hull(corners)

def add_beam(base, top, w, d):
    """Angled box from base->top with cross-section w (lateral) x d."""
    fwd = (Vector(top) - Vector(base))
    length = fwd.length
    fwd /= length
    right = fwd.cross(Vector((0, 0, 1)))
    if right.length < 1e-4:
        right = Vector((1, 0, 0))
    right.normalize()
    up = right.cross(fwd).normalized()
    corners = []
    for end in (Vector(base), Vector(top)):
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            corners.append(end + right * (sx * w / 2) + up * (sy * d / 2))
    add_hull([tuple(c) for c in corners])

def add_hull(corners):
    vs = [bm.verts.new(c) for c in corners]
    quads = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4),
             (2, 3, 7, 6), (1, 2, 6, 5), (0, 3, 7, 4)]
    for q in quads:
        f = bm.faces.new([vs[i] for i in q])
        f.material_index = DARK

# ceiling slab (chassis y 0.857..0.885 — under the REF exterior skin)
add_box((-0.73, -1.02, 1.407), (0.73, 0.08, 1.435))
# header strip — glass-top edge chassis (y 0.850, z 0.16)
add_box((-0.73, 0.06, 1.400), (0.73, 0.16, 1.430))
# sun visors, tucked flat against the new headliner (above the driver's head)
add_box((-0.53, -0.10, 1.393), (-0.20, 0.06, 1.406))
add_box((0.20, -0.10, 1.393), (0.53, 0.06, 1.406))
# slim A-pillars: cowl corners -> header ends
add_beam((-0.76, 1.00, 0.945), (-0.72, 0.11, 1.410), 0.065, 0.075)
add_beam((0.76, 1.00, 0.945), (0.72, 0.11, 1.410), 0.065, 0.075)
# rear-view mirror REBUILT high/right/small (founder directive 2026-07-11):
# a compact housing tucked just under the header (chassis y 0.79..0.85,
# z 0.475..0.560 — above the eye line, so it frames in the UPPER-RIGHT, clear
# of the graded road band) fed by a thin discreet stalk from the header. The
# glass quad (hotspot_mirror_rear) is raised + shrunk onto it in section 2.
add_box((-0.085, 0.475, 1.340), (0.085, 0.560, 1.400))  # small mirror housing
add_beam((0.0, 0.15, 1.415), (0.0, 0.47, 1.372), 0.020, 0.020)  # thin stalk

bm.normal_update()
bm.to_mesh(shell.data)
bm.free()
shell.data.update()

# --------------------------------------------------------------------------
# 2. Screens: drop so they tuck under the shaved hood / bezel
# --------------------------------------------------------------------------
D.objects["screen_cluster"].location.z -= 0.025
# centre screen dropped 9.5 cm (was 3): its top now sits at chassis y ~0.44,
# below the cowl (0.48) and the shaved bezel (0.45) — no longer a black slab.
D.objects["screen_center"].location.z -= 0.095
# raise + shrink the rear-view mirror glass onto the new high housing: chassis
# (0, 0.80, 0.50), ~y+0.11 vs the old (0, 0.687, 0.575). It now projects to the
# UPPER-RIGHT (fy ~0.74) — high/right/small per the founder directive — while
# MirrorRig's rear RTT vantage [0,0.687,0.575] is intentionally left untouched
# (it is the rear-view sample point, not the glass surface).
mr = D.objects["hotspot_mirror_rear"]
mr.location = (0.0, 0.50, 1.353)
mr.scale = (0.84, 0.84, 0.84)
bpy.context.view_layer.update()

# --------------------------------------------------------------------------
# 3. Integrity checks (the DO-NOT-BREAK list)
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

int_objs = [o for o in D.objects
            if any(c.name == "INT" for c in o.users_collection)]
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
assert len(int_mats) <= 6, f"too many interior materials: {sorted(int_mats)}"
assert tris < 60000, f"tri budget blown: {tris}"
print(f"integrity OK: {len(HOTSPOTS)} hotspots, materials={sorted(int_mats)}, tris={tris}")
for line in log:
    print("  " + line)

# --------------------------------------------------------------------------
# 4. Window probe — the founder's acceptance numbers, computed not eyeballed
# --------------------------------------------------------------------------
MESH_INT = [o for o in int_objs if o.type == "MESH"]

def cast(origin, direction, max_dist=4.0):
    best = None
    for ob in MESH_INT:
        inv = ob.matrix_world.inverted()
        o_l = inv @ origin
        d_l = inv.to_3x3() @ direction
        s = d_l.length
        if s < 1e-9:
            continue
        hit, pos, _n, _i = ob.ray_cast(o_l, d_l / s, distance=max_dist * s * 1.5)
        if hit:
            dist = ((ob.matrix_world @ pos) - origin).length
            if dist <= max_dist and (best is None or dist < best):
                best = dist
    return best

VFOV = math.radians(47.0)
HFOV = 2 * math.atan(math.tan(VFOV / 2) * 16 / 9)

def ray(fx, fy, pitch):
    x = (2 * fx - 1) * math.tan(HFOV / 2)
    z = (2 * fy - 1) * math.tan(VFOV / 2)
    d = Vector((x, 1.0, z)).normalized()
    cp, sp = math.cos(pitch), math.sin(pitch)
    return Vector((d.x, d.y * cp - d.z * sp, d.y * sp + d.z * cp))

def probe(label, eye, pitch_deg, min_span):
    p = math.radians(pitch_deg)
    rows = 200
    top = bot = None
    for i in range(rows + 1):
        fy = i / rows
        if cast(eye, ray(0.5, fy, p)) is None:
            if bot is None:
                bot = fy
            top = fy
    span = 0.0 if bot is None else top - bot
    hits = sum(1 for iy in range(36) for ix in range(64)
               if cast(eye, ray((ix + 0.5) / 64, (iy + 0.5) / 36, p)) is None)
    frac = hits / (64 * 36)
    ok = "PASS" if span >= min_span else "FAIL"
    print(f"probe[{label}]: centre-column window fy {bot}..{top} "
          f"(span {span:.3f}, need >={min_span}) {ok}; full-frame world {frac:.3f}")
    return span >= min_span

ok_ship = probe("shipped cam (0.24,0.71,-0.255) pitch -5", Vector((-0.24, -0.255, 1.26)), -5.0, 0.65)
ok_dep = probe("DEP (0.34,0.66,0.12) pitch -6", Vector((-0.34, 0.12, 1.21)), -6.0, 0.65)
if not (ok_ship and ok_dep):
    raise RuntimeError("window probe under 65% — iterate the geometry")

# --------------------------------------------------------------------------
# 5. Save + export (INT collection only; Y-up default => car faces -Z in GLB,
#    same convention as v1 / hero_car.glb)
# --------------------------------------------------------------------------
blend_out = os.path.join(WORK, "hero_interior_v2.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend_out)

for ob in D.objects:
    ob.select_set(False)
for ob in int_objs:
    ob.select_set(True)
glb_out = os.path.join(WORK, "hero_interior_v2.glb")
bpy.ops.export_scene.gltf(filepath=glb_out, export_format="GLB", use_selection=True)
print(f"saved {blend_out}")
print(f"exported {glb_out} ({os.path.getsize(glb_out)} bytes pre-optimize)")
