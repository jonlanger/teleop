"""
teleop Wheel — build script.

Run:  /Applications/Blender.app/Contents/MacOS/Blender -b -P build.py -- OUT_DIR [--norender]

A desk-mounted teleoperation wheel: a 282 mm wheel on a tilting column, sitting on a
satin-carbon base with a recessed deck. Form thesis: a quiet satin-carbon instrument
whose one expressive gesture is the mint control-state halo inside the rim, and whose
only red is the stop.

Frames
  World: X right, Y away from the operator (operator at -Y), Z up, desk at Z = 0.
  Wheel local: built flat with the wheel axis on +Z (towards the operator), so the
  front/rear shell split is a Z split like every other molded part here. Local +Y is
  "up" on the wheel face. One rigid transform (tilt about X, then translate) places
  every wheel and column part at the end.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.environ.get("IDKIT_DIR", "/Users/jonlanger/Library/Application Support/Claude/local-agent-mode-sessions/"
                       "skills-plugin/7a85f985-6978-4306-9414-4956b75e9408/0522dd28-113f-476a-a64b-33e826c7dfc0/"
                       "skills/industrial-design-blender/scripts")
sys.path[:0] = [HERE, SKILL]
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
import idkit as ik  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
OUT = os.path.abspath(next((a for a in args if not a.startswith("--")), os.path.join(HERE, "out_v1")))
NORENDER = "--norender" in sys.argv
RENDERS = next((a.split("=", 1)[1] for a in args if a.startswith("--renders=")), "hero,hub,exploded,internals,rear")

# ── DESIGN DRIVERS ────────────────────────────────────────────────────────────
PRODUCT = "teleop Wheel"
# wheel (local frame)
RIM_R = 126.0            # rim centreline radius → Ø282 outer
RIM_A, RIM_B = 14.0, 16.0  # rim section half-axes: radial 28, axial 32 (power grip ≈ 30)
WALL_W = 2.8             # wheel shell wall
PLATE_T = 5.0            # spoke web thickness (split 2.5 / 2.5 at the parting plane)
OPEN_Y, OPEN_R, OPEN_F = 60.0, 104.0, 16.0   # spoke openings: flat edge, outer arc, corner fillet
BAND_W, BAND_H, BAND_T = 232.0, 100.0, 32.0  # hub band
BAND_RP, BAND_RE = 24.0, 8.0
FP_W, FP_H, FP_R, FP_T = 216.0, 88.0, 26.0, 2.5  # removable faceplate
GRIP_HALF_DEG = 38.0     # TPE grip zones at 3 and 9 o'clock, ±38°
GRIP_T, GRIP_RECESS = 2.0, 1.2   # TPE thickness, substrate recess (TPE stands 0.8 proud, 1.6 substrate)
HALO_T = 11.0            # z of the halo light guide on the rim's inner front face
TILT = 25.0              # wheel face leans back from vertical (adjustable 15–35° on the drum)
COL_LEN = 120.0          # wheel centre → tilt axis
# base (world frame)
BASE_W, BASE_D = 210.0, 160.0
BASE_H_FRONT, BASE_H_BACK = 128.0, 175.0
BASE_RP, BASE_RT, BASE_RB = 26.0, 5.0, 3.0
BASE_WALL, BASE_DRAFT, BASE_PZ = 2.5, 1.0, 14.0
DECK_INSET, DECK_DEPTH = 6.0, 14.0
DRUM_D, DRUM_L, DRUM_Y = 72.0, 108.0, -5.0
GAP = 0.15

C_ = {"carbon": "#24272B", "graphite": "#3A3E44", "faceplate": "#2E3237", "cap": "#30343A", "mint": "#3CE6B4",
      "amber": "#FFB020", "stop": "#E8352B", "yellow": "#F2C200", "gum": "#9C7552", "alloy": "#B9BEC4",
      "white": "#E9EAE6", "pcb": "#1E4D33", "steel": "#7D838A"}

K_SLOPE = (BASE_H_BACK - BASE_H_FRONT) / BASE_D
H_MID = (BASE_H_BACK + BASE_H_FRONT) / 2
DECK_DEG = math.degrees(math.atan(K_SLOPE))


def top_z(y):
    return H_MID + K_SLOPE * y


ik.reset_scene(seg=20)
T = {}  # every manufactured part: name -> dict(obj, material_code, process, notes, group)


def part(obj, mat, code, process, notes="", group="wheel", wall=None):
    ik.assign(obj, mat)
    obj["process"] = process
    if wall:
        obj["wall_mm"] = wall
    T[obj.name] = dict(obj=obj, material_code=code, process=process, notes=notes, group=group)
    return obj


# ── geometry helpers (bmesh, closed solids) ───────────────────────────────────
def sweep(name, prof, a0=0.0, a1=360.0, n=None, R=0.0):
    """Revolve a closed (r, z) profile about Z from a0..a1 degrees (capped if partial)."""
    full = abs(a1 - a0) >= 359.999
    n = n or (144 if full else max(8, int(abs(a1 - a0) / 2.5)))
    bm = bmesh.new()
    rings = []
    for i in range(n if full else n + 1):
        th = math.radians(a0 + (a1 - a0) * i / n)
        c, s = math.cos(th), math.sin(th)
        rings.append([bm.verts.new(((R + r) * c, (R + r) * s, z)) for r, z in prof])
    m = len(prof)
    nxt = rings[1:] + ([rings[0]] if full else [])
    for r0, r1 in zip(rings, nxt):
        for j in range(m):
            k = (j + 1) % m
            bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
    if not full:
        bm.faces.new(rings[0])
        bm.faces.new(rings[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ik.smooth(ik._obj_from_bm(name, bm))


def ellipse_prof(a, b, m=32, cx=0.0, cz=0.0):
    return [(cx + a * math.cos(2 * math.pi * j / m), cz + b * math.sin(2 * math.pi * j / m)) for j in range(m)]


def torus(name, a, b, a0=0.0, a1=360.0, R=RIM_R, n=None):
    return sweep(name, ellipse_prof(a, b), a0, a1, n=n, R=R)


def loop_normals(pts):
    """Left normals of a CCW loop (point into the region the loop encloses)."""
    N = len(pts)
    out = []
    for i in range(N):
        (x0, y0), (x1, y1) = pts[i - 1], pts[(i + 1) % N]
        tx, ty = x1 - x0, y1 - y0
        L = math.hypot(tx, ty) or 1
        out.append((-ty / L, tx / L))
    return out


def opening_loop(sign=1, n_arc=40, n_f=10):
    """Spoke opening: inside circle OPEN_R and beyond |y| = OPEN_Y, corners filleted. CCW."""
    rf = OPEN_F
    yc = OPEN_Y + rf
    xc = math.sqrt((OPEN_R - rf) ** 2 - yc ** 2)
    a_t = math.degrees(math.atan2(yc, xc))
    pts = [(-xc + (xc * 2) * i / 8, OPEN_Y) for i in range(9)]               # flat edge, left → right
    pts += [(xc + rf * math.cos(math.radians(-90 + (a_t + 90) * i / n_f)),
             yc + rf * math.sin(math.radians(-90 + (a_t + 90) * i / n_f))) for i in range(1, n_f + 1)]
    pts += [(OPEN_R * math.cos(math.radians(a_t + (180 - 2 * a_t) * i / n_arc)),
             OPEN_R * math.sin(math.radians(a_t + (180 - 2 * a_t) * i / n_arc))) for i in range(1, n_arc)]
    pts += [(-xc + rf * math.cos(math.radians(180 - a_t + (a_t + 90) * i / n_f)),
             yc + rf * math.sin(math.radians(180 - a_t + (a_t + 90) * i / n_f))) for i in range(0, n_f)]
    if sign < 0:
        pts = [(x, -y) for x, y in reversed(pts)]
    return pts


def plate_with_holes(name, r_out, holes, t, m=8):
    """Flat disc of thickness t centred on z=0, holes with full-round edges."""
    h = t / 2
    bm = bmesh.new()
    top_rings, bot_rings = [], []
    # outer boundary: plain wall (buried inside the rim)
    N = 160
    outer = [(r_out * math.cos(2 * math.pi * i / N), r_out * math.sin(2 * math.pi * i / N)) for i in range(N)]
    lo = [bm.verts.new((x, y, -h)) for x, y in outer]
    hi = [bm.verts.new((x, y, h)) for x, y in outer]
    for i in range(N):
        j = (i + 1) % N
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    top_rings.append(hi)
    bot_rings.append(lo)
    for hole in holes:
        nrm = loop_normals(hole)
        rings = []
        for k in range(m + 1):
            ph = -math.pi / 2 + math.pi * k / m
            z, ins = h * math.sin(ph), h * (1 - math.cos(ph))
            rings.append([bm.verts.new((x - nx * ins, y - ny * ins, z)) for (x, y), (nx, ny) in zip(hole, nrm)])
        M = len(hole)
        for r0, r1 in zip(rings, rings[1:]):
            for i in range(M):
                j = (i + 1) % M
                bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
        top_rings.append(rings[-1])
        bot_rings.append(rings[0])
    for rings, nz in ((top_rings, 1), (bot_rings, -1)):
        edges = []
        for rg in rings:
            for i in range(len(rg)):
                edges.append(bm.edges.get((rg[i], rg[(i + 1) % len(rg)])) or bm.edges.new((rg[i], rg[(i + 1) % len(rg)])))
        bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges, normal=(0, 0, nz))
    ik._clean(bm)
    return ik._obj_from_bm(name, bm)


def xform(obj, M):
    obj.data.transform(M)
    obj.data.update()
    return obj


def rot_z(obj, deg, c=(0, 0)):
    M = Matrix.Translation((c[0], c[1], 0)) @ Matrix.Rotation(math.radians(deg), 4, "Z") @ Matrix.Translation((-c[0], -c[1], 0))
    return xform(obj, M)


def shear(obj, k, z_above=None):
    for v in obj.data.vertices:
        if z_above is None or v.co.z > z_above:
            v.co.z += k * v.co.y
    obj.data.update()
    return obj


def ring_solid(name, d_out, d_in, h, center):
    o = ik.cylinder(name, d_out, h, center=center)
    return ik.boolean(o, ik.cylinder("ri", d_in, h + 2, center=center))


# ══════════════════════════════════════════════════════════════════════════════
# 1. WHEEL (local frame)
# ══════════════════════════════════════════════════════════════════════════════
def band_box(name, inset=0.0, z0=-BAND_T / 2, z1=BAND_T / 2):
    return ik.rounded_box(name, BAND_W - 2 * inset, BAND_H - 2 * inset, (z1 - z0), r_plan=BAND_RP - inset,
                          r_edge=max(0.5, BAND_RE - inset), center=(0, 0, (z0 + z1) / 2))


holes = [opening_loop(1), opening_loop(-1)]
ext = torus("wheel_ext", RIM_A, RIM_B)
ik.boolean(ext, plate_with_holes("plate", RIM_R - 6, holes, PLATE_T), "UNION")
ik.boolean(ext, band_box("band"), "UNION")

inner = torus("wheel_in", RIM_A - WALL_W, RIM_B - WALL_W)
ik.boolean(inner, band_box("band_in", WALL_W), "UNION")
ik.boolean(ext, inner, keep_cutter=True)

# lip on the rear shell, step in the front shell (rim + band perimeter)
LIP_H = 3.2
lip = torus("lip_o", RIM_A - WALL_W / 2 + 0.04, RIM_B - WALL_W / 2 + 0.04)
ik.boolean(lip, band_box("lip_bo", WALL_W / 2 - 0.04), "UNION")
ik.boolean(lip, ik.duplicate(inner, "inner_c"))
ik.clip_z(lip, -0.01, LIP_H)
ik.boolean(lip, plate_with_holes("plate_c", RIM_R - 6, holes, PLATE_T + 0.3))
step = torus("step_o", RIM_A - WALL_W / 2 - 0.04, RIM_B - WALL_W / 2 - 0.04)
ik.boolean(step, band_box("step_bo", WALL_W / 2 + 0.04), "UNION")
ik.boolean(step, torus("step_i", RIM_A - WALL_W - 0.5, RIM_B - WALL_W - 0.5))
ik.clip_z(step, -0.5, LIP_H + 0.08)
ik.boolean(step, plate_with_holes("plate_c2", RIM_R - 6, holes, PLATE_T + 0.3))
ik.delete(inner)

front = ik.duplicate(ext, "Wheel_Front_Shell")
rear = ik.duplicate(ext, "Wheel_Rear_Shell")
ik.delete(ext)
ik.clip_z(front, 0, 1e4)
ik.clip_z(rear, -1e4, 0)
ik.boolean(rear, lip, "UNION")
ik.boolean(front, step)

# grips: 2K TPE wrapping the outer 210° of the rim section (the inner side, where the hub band
# and spoke web join, stays shell), substrate recessed on both shells
GRIP_PHI = 105.0


def crescent(ao, bo, ai, bi, ph=GRIP_PHI, m=40):
    out = [(ao * math.cos(math.radians(-ph + 2 * ph * j / m)), bo * math.sin(math.radians(-ph + 2 * ph * j / m))) for j in range(m + 1)]
    inn = [(ai * math.cos(math.radians(ph - 2 * ph * j / m)), bi * math.sin(math.radians(ph - 2 * ph * j / m))) for j in range(m + 1)]
    return out + inn


grip_cut = []
for ang, side in ((180.0, "L"), (0.0, "R")):
    a0, a1 = ang - GRIP_HALF_DEG, ang + GRIP_HALF_DEG
    zone = sweep("gz", crescent(RIM_A + 6, RIM_B + 6, RIM_A - GRIP_RECESS, RIM_B - GRIP_RECESS), a0, a1, R=RIM_R)
    for shell in (front, rear):
        ik.boolean(shell, ik.duplicate(zone, "gzc"))
    ik.delete(zone)
    g = sweep("grip", crescent(RIM_A - GRIP_RECESS + GRIP_T, RIM_B - GRIP_RECESS + GRIP_T, RIM_A - GRIP_RECESS, RIM_B - GRIP_RECESS,
                               ph=GRIP_PHI - 0.6), a0 + 0.4, a1 - 0.4, R=RIM_R)
    gf = ik.duplicate(g, f"Grip_{side}_Front")
    gr = ik.duplicate(g, f"Grip_{side}_Rear")
    ik.delete(g)
    ik.clip_z(gf, 0, 1e4)
    ik.clip_z(gr, -1e4, 0)
    grip_cut += [gf, gr]

# halo light guide: two arcs on the rim's inner front face, outside the band and grips
th = math.asin(HALO_T / RIM_B)
px, pz = RIM_R - RIM_A * math.cos(th), HALO_T              # section point (r, z)
nx, nz = -RIM_A * math.cos(th) / RIM_A, RIM_B * math.sin(th) / RIM_B  # not normalised: (∂/∂t)ᵀ rotated
nx, nz = -math.cos(th) / RIM_A, math.sin(th) / RIM_B
L = math.hypot(nx, nz)
nx, nz = nx / L, nz / L                                     # outward normal (towards centre & operator)
tx, tz = -nz, nx                                            # tangent in the section


def halo_prof(w, d_out, d_in):
    return [(px + tx * s * w / 2 + nx * d, pz + tz * s * w / 2 + nz * d)
            for s, d in ((-1, -d_in), (1, -d_in), (1, d_out), (-1, d_out))]


halos = []
for a0, a1, nm in ((GRIP_HALF_DEG + 2, 180 - GRIP_HALF_DEG - 2, "Halo_Guide_Upper"),
                   (180 + GRIP_HALF_DEG + 2, 360 - GRIP_HALF_DEG - 2, "Halo_Guide_Lower")):
    ik.boolean(front, sweep("hc", halo_prof(3.0 + 2 * 0.08, 1.0, WALL_W + 1.0), a0 - 0.5, a1 + 0.5))
    halos.append(sweep(nm, halo_prof(3.0, 0.25, WALL_W + 0.8), a0, a1))

# faceplate: opening in the front shell, removable cover (magnet + 2 hooks), Xbox-style
FP_Z1 = BAND_T / 2
FP_Z0 = FP_Z1 - FP_T
ik.boolean(front, ik.rounded_box("fpo", FP_W + 2 * GAP, FP_H + 2 * GAP, 20, r_plan=FP_R + GAP, center=(0, 0, FP_Z1 + 6)))
face = ik.rounded_box("Hub_Faceplate", FP_W, FP_H, FP_T + 0.3, r_plan=FP_R, r_edge=1.0, center=(0, 0, FP_Z0 + (FP_T + 0.3) / 2))

# hub ledge inside the front shell the faceplate seats on
ledge = ik.rounded_box("ledge", FP_W + 30, FP_H + 30, 1.6, r_plan=FP_R + 15, center=(0, 0, FP_Z0 - 0.8 - 0.05))
ik.boolean(ledge, ik.rounded_box("ledge_i", FP_W - 8, FP_H - 8, 4, r_plan=FP_R - 4, center=(0, 0, FP_Z0 - 0.8)))
ik.boolean(ledge, band_box("ledge_k", 0.4), "INTERSECT")
ik.boolean(front, ledge, "UNION")


# ── controls on the faceplate ────────────────────────────────────────────────
def cap(name, xy, size, shape="round", proud=0.8, rot=0.0, r_corner=None, face_obj=None):
    """Opening in the faceplate + cap with retention flange. Gap constant all round."""
    f = face_obj or face
    x, y = xy
    zs, zi = FP_Z0 + FP_T + 0.3, FP_Z0
    t = zs - zi
    w, l = (size, size) if isinstance(size, (int, float)) else size
    if shape == "round":
        cut = ik.cylinder("ap", w + 2 * GAP, 40, center=(x, y, zs))
        c = ik.rounded_box(name, w, w, t + proud, r_plan=w / 2 - 1e-3, r_edge=min(1.0, w / 8), center=(x, y, zi + (t + proud) / 2))
        fl = ik.cylinder("fl", w + 1.6, 0.8, center=(x, y, zi - 0.45))
    else:
        rr = r_corner if r_corner is not None else min(w, l) * 0.25
        cut = ik.rounded_box("ap", w + 2 * GAP, l + 2 * GAP, 40, r_plan=rr + GAP, center=(x, y, zs))
        c = ik.rounded_box(name, w, l, t + proud, r_plan=rr, r_edge=min(0.8, rr), center=(x, y, zi + (t + proud) / 2))
        fl = ik.rounded_box("fl", w + 1.6, l + 1.6, 0.8, r_plan=rr + 0.8, center=(x, y, zi - 0.45))
    for o in (cut, c, fl):
        if rot:
            rot_z(o, rot, (x, y))
    ik.boolean(f, cut)
    ik.boolean(c, fl, "UNION")
    c["gap_mm"] = GAP
    return c


def bumps(c, pts, d=1.4, h=0.45):
    """Tactile dots on a cap top (programmable keys: 1–4 dots)."""
    ztop = max((c.matrix_world @ v.co).z for v in c.data.vertices)
    for x, y in pts:
        ik.boolean(c, ik.rounded_box("b", d, d, h * 2, r_plan=d / 2 - 1e-3, r_edge=h * 0.9, center=(x, y, ztop)), "UNION")


ZTOP = FP_Z0 + FP_T + 0.3
controls = {}

# 1 emergency stop: red mushroom in a safety-yellow guard collar (ISO 13850 colours), cap 1.5 below the collar
ES = (0.0, 20.0)
ik.boolean(face, ik.cylinder("esh", 40 + 2 * GAP, 40, center=(ES[0], ES[1], ZTOP)))
collar = ik.rounded_box("EStop_Guard", 46, 46, 7.5, r_plan=22.999, r_edge=3.0, center=(ES[0], ES[1], ZTOP + 3.75))
ik.boolean(collar, ik.cylinder("cb", 33, 30, center=(ES[0], ES[1], ZTOP)))
ik.boolean(collar, ring_solid("csk", 40, 33, FP_T + 1.3, (ES[0], ES[1], FP_Z0 - 0.35 + (FP_T + 1.3) / 2 - 0.5)), "UNION")
controls["EStop_Guard"] = collar
es_cap = ik.rounded_box("EStop_Cap", 31, 31, 9.0, r_plan=15.499, r_edge=4.5, center=(ES[0], ES[1], ZTOP + 5.5 - 4.5))
ik.boolean(es_cap, ik.cylinder("esst", 18, 6, center=(ES[0], ES[1], ZTOP - 4.0)), "UNION")
controls["EStop_Cap"] = es_cap

# 2 hazard
hz = cap("Btn_Hazard", (38, 31), 12, proud=0.8)
controls["Btn_Hazard"] = hz
tri = bmesh.new()
vs = [tri.verts.new((38 + 3.4 * math.cos(math.radians(90 + 120 * i)), 31 - 0.6 + 3.4 * math.sin(math.radians(90 + 120 * i)), ZTOP + 0.8 - 0.05)) for i in range(3)]
tri.faces.new(vs)
bmesh.ops.extrude_face_region(tri, geom=tri.faces[:])
tri.verts.ensure_lookup_table()
for v in tri.verts[3:]:
    v.co.z += 0.15
bmesh.ops.recalc_face_normals(tri, faces=tri.faces)
haz_print = ik._obj_from_bm("Print_Hazard", tri)

# 3/4 claim + release, with the status display between them
controls["Btn_Claim"] = cap("Btn_Claim", (-32, -33), (24, 11), "rect", proud=1.2, r_corner=5.499)
controls["Btn_Release"] = cap("Btn_Release", (32, -33), (24, 11), "rect", proud=-0.4, r_corner=5.499)
ik.boolean(face, ik.rounded_box("dwo", 28 + 2 * GAP, 10 + 2 * GAP, 40, r_plan=2 + GAP, center=(0, -33, ZTOP)))
disp_win = ik.rounded_box("Display_Window", 28, 10, FP_T + 0.3, r_plan=2, r_edge=0.3, center=(0, -33, FP_Z0 + (FP_T + 0.3) / 2))
oled = ik.box("Display_OLED", 26, 8, 0.8, center=(0, -33, FP_Z0 - 0.6))

# 13 horn pad with the mark embossed
horn = cap("Btn_Horn", (0, -14), (48, 16), "rect", proud=0.5, r_corner=4)
hz_top = ZTOP + 0.5
mk = ring_solid("mk", 12.4, 9.2, 0.7, (0, -14, hz_top))
for a in (90, 210, 330):
    sp = ik.box("sp", 5.6, 1.3, 0.7, center=(0 + 2.6 * math.cos(math.radians(a)), -14 + 2.6 * math.sin(math.radians(a)), hz_top))
    rot_z(sp, a, (0 + 2.6 * math.cos(math.radians(a)), -14 + 2.6 * math.sin(math.radians(a))))
    ik.boolean(mk, sp, "UNION")
ik.boolean(mk, ik.cylinder("mh", 2.6, 0.7, center=(0, -14, hz_top)), "UNION")
ik.boolean(horn, mk, "UNION")
controls["Btn_Horn"] = horn

# left thumb: communication
controls["Btn_PushToTalk"] = cap("Btn_PushToTalk", (-86, 14), 17, proud=1.2)
controls["Btn_PushToLog"] = cap("Btn_PushToLog", (-92, -14), (12, 12), "rect", proud=1.0, rot=45, r_corner=2.5)
spk = cap("Btn_ExtSpeaker", (-66, -16), (18, 9), "rect", proud=0.8, r_corner=4.499)
controls["Btn_ExtSpeaker"] = spk
spk_dots = [ik.cylinder("sd", 1.4, 0.2, center=(-66 + dx, -16, ZTOP + 0.8 + 0.05), seg=12) for dx in (-4, 0, 4)]
spk_print = ik.join("Print_SpeakerDots", spk_dots)

# right thumb: interface
DIAL = (88.0, 12.0)
ik.boolean(face, ik.cylinder("dh", 24 + 2 * GAP, 40, center=(DIAL[0], DIAL[1], ZTOP)))
dial = ik.rounded_box("Dial_Ring", 24, 24, 9.5, r_plan=11.999, r_edge=0.8, center=(DIAL[0], DIAL[1], FP_Z0 + 9.5 / 2 - 0.3))
ik.boolean(dial, ik.cylinder("dc", 14.6, 30, center=(DIAL[0], DIAL[1], ZTOP)))
kn = []
for i in range(36):
    a = 360 * i / 36
    cxk, cyk = DIAL[0] + 12.0 * math.cos(math.radians(a)), DIAL[1] + 12.0 * math.sin(math.radians(a))
    b_ = ik.box("k", 1.4, 0.9, 6.5, center=(cxk, cyk, FP_Z0 + 9.5 - 3.0))
    rot_z(b_, a, (cxk, cyk))
    kn.append(b_)
ik.boolean(dial, ik.join("knurl", kn))
dial_press = ik.rounded_box("Dial_Press", 14, 14, 8.6, r_plan=6.999, r_edge=1.2, center=(DIAL[0], DIAL[1], FP_Z0 + 8.6 / 2 - 0.3))
controls["Dial_Ring"] = dial
controls["Dial_Press"] = dial_press
controls["Btn_Acknowledge"] = cap("Btn_Acknowledge", (86, -17), 15, proud=1.0)
controls["Btn_Camera"] = cap("Btn_Camera", (66, -16), 12, proud=0.8)

# programmable 1–4: square keys, tactile dot count
for i, (xy, n) in enumerate((((-58, 24), 1), ((-58, 7), 2), ((58, 24), 3), ((58, 7), 4))):
    k = cap(f"Btn_P{i + 1}", xy, (9.5, 9.5), "rect", proud=0.6, r_corner=2.0)
    pts = {1: [(0, 0)], 2: [(-1.6, 0), (1.6, 0)], 3: [(-2.2, -1.4), (2.2, -1.4), (0, 1.8)],
           4: [(-1.6, -1.6), (1.6, -1.6), (-1.6, 1.6), (1.6, 1.6)]}[n]
    bumps(k, [(xy[0] + px_, xy[1] + py_) for px_, py_ in pts])
    controls[k.name] = k

# ── behind the wheel ──────────────────────────────────────────────────────────
ZB = -BAND_T / 2
boss = ik.cylinder("shaft_boss", 44, 15.0, center=(0, 0, ZB - 7.5 + 0.3))
ik.boolean(boss, ik.cylinder("spl", 20, 40, center=(0, 0, ZB)))
ik.boolean(rear, boss, "UNION")
# paddle pivots (molded into the rear shell) and paddles
paddles = []
for sx, nm in ((-1, "Paddle_Brake_L"), (1, "Paddle_Throttle_R")):
    piv = ik.rounded_box("piv", 14, 26, 6.5, r_plan=4, r_edge=1.0, center=(sx * 64, -2, ZB - 3.0))
    ik.boolean(rear, piv, "UNION")
    p = ik.rounded_box(nm, 82, 42, 3.5, r_plan=13, r_edge=1.4, center=(sx * 104, -2, ZB - 8.2))
    arm = ik.rounded_box("arm", 18, 22, 3.5, r_plan=4, r_edge=1.0, center=(sx * 66, -2, ZB - 8.2))
    ik.boolean(p, arm, "UNION")
    paddles.append(p)

# ── hub internals ─────────────────────────────────────────────────────────────
pcb = ik.rounded_box("Hub_PCB", 196, 80, 1.6, r_plan=20, center=(0, 0, FP_Z0 - 5.6))
ik.boolean(pcb, ik.cylinder("eh", 33, 10, center=(ES[0], ES[1], FP_Z0 - 5.6)))
ik.boolean(pcb, ik.cylinder("dh2", 16, 10, center=(DIAL[0], DIAL[1], FP_Z0 - 5.6)))
es_block = ik.rounded_box("EStop_ContactBlock", 22, 22, 10, r_plan=3, r_edge=0.5, center=(ES[0], ES[1], FP_Z0 - 9.3))
encoder = ik.cylinder("Dial_Encoder", 12, 6, center=(DIAL[0], DIAL[1], FP_Z0 - 7.4))
clock = ring_solid("Clock_Spring", 40, 20, 7.0, (0, 0, ZB + WALL_W + 3.6))
lra = [ik.cylinder(f"Haptic_LRA_{s}", 10, 3.6, center=(RIM_R * math.cos(math.radians(a)), RIM_R * math.sin(math.radians(a)), 0))
       for s, a in (("L", 152), ("R", 28))]

# ── column (fixed: tilts with the wheel, does not steer) ──────────────────────
COL_Z0, COL_Z1 = ZB - 15.0 - 0.6, -COL_LEN - 4.0
col_len = COL_Z0 - COL_Z1
col_ext = ik.rounded_box("col_ext", 60, col_len, 52, r_plan=20, r_edge=13, draft_deg=0.5, parting_z=0)
col_up, col_lo = ik.clamshell(col_ext, parting_z=0.0, wall=2.4, reveal=(0.6, 0.4), names=("Column_Cover_Upper", "Column_Cover_Lower"))
COLM = Matrix.Translation((0, 0, (COL_Z0 + COL_Z1) / 2)) @ Matrix.Rotation(math.radians(-90), 4, "X")
for o in (col_up, col_lo):
    xform(o, COLM)
col_clear = xform(ik.rounded_box("col_clr", 60.6, col_len, 52.6, r_plan=20.3, r_edge=13.3), COLM)
xform(col_ext, COLM)
motor = ik.cylinder("Steer_Motor", 40, 50, center=(0, 0, COL_Z0 - 8 - 25))
# turn-signal stalk on the left of the column
stalk = ik.cylinder("Stalk_TurnSignal", 8, 58, center=(0, 0, 0), axis="X")
ik.boolean(stalk, ik.rounded_box("tip", 16, 10, 22, r_plan=4.99, r_edge=4.0, center=(-30, 0, 0)), "UNION")
xform(stalk, Matrix.Translation((-60, 10, COL_Z0 - 22)) @ Matrix.Rotation(math.radians(-8), 4, "Z"))
ik.delete(col_ext)

# ══════════════════════════════════════════════════════════════════════════════
# 2. place the wheel assembly
# ══════════════════════════════════════════════════════════════════════════════
n_axis = Vector((0, -math.cos(math.radians(TILT)), math.sin(math.radians(TILT))))   # local +Z in world
DRUM_Z = top_z(DRUM_Y) - DECK_DEPTH + DRUM_D / 2 + 2.0
D = Vector((0, DRUM_Y, DRUM_Z))
CEN = D + COL_LEN * n_axis
WM = Matrix.Translation(CEN) @ Matrix.Rotation(math.radians(90 - TILT), 4, "X")

wheel_parts = ([front, rear, face, disp_win, oled, haz_print, spk_print, pcb, es_block, encoder, clock, motor, stalk,
                col_up, col_lo, col_clear] + grip_cut + halos + paddles + lra + list(controls.values()))
for o in wheel_parts:
    xform(o, WM)

# ══════════════════════════════════════════════════════════════════════════════
# 3. BASE (world frame)
# ══════════════════════════════════════════════════════════════════════════════
bext = ik.rounded_box("base_ext", BASE_W, BASE_D, H_MID, r_plan=BASE_RP, r_edge=BASE_RT, r_edge_bottom=BASE_RB,
                      center=(0, 0, H_MID / 2), draft_deg=BASE_DRAFT, parting_z=BASE_PZ)
shear(bext, K_SLOPE, z_above=BASE_PZ + 1)
bshell, bbot = ik.clamshell(bext, parting_z=BASE_PZ, wall=BASE_WALL, lip_h=3.0, reveal=(0.8, 0.5),
                            names=("Base_Shell", "Base_Bottom"))


def deck_box(name, inset, z0, z1, rp=None, draft=0.0, pz=None):
    o = ik.rounded_box(name, BASE_W - 2 * inset, BASE_D - 2 * inset, z1 - z0, r_plan=rp if rp is not None else BASE_RP - inset,
                       r_edge=0.0, center=(0, 0, (z0 + z1) / 2), draft_deg=draft, parting_z=pz)
    return shear(o, K_SLOPE)


# deck opening in the shell top; the deck tray drops in from above (0.8 mm shadow below the rim)
ik.boolean(bshell, deck_box("deck_open", DECK_INSET, H_MID - 30, H_MID + 30))
tray = deck_box("Deck_Tray", DECK_INSET + GAP, H_MID - DECK_DEPTH - 3.0, H_MID - 0.8, draft=1.5, pz=H_MID - DECK_DEPTH - 3.0)
ik.boolean(tray, deck_box("tray_in", DECK_INSET + GAP + 2.2, H_MID - DECK_DEPTH, H_MID + 10, draft=1.5, pz=H_MID + 10))
# cable pass-through under the drum
ik.boolean(tray, ik.cylinder("cp", 26, 60, center=(0, DRUM_Y + 18, top_z(DRUM_Y) - DECK_DEPTH)))

# tilt drum, end caps (tilt lock knobs) and yokes
drum = ik.cylinder("Tilt_Drum", DRUM_D, DRUM_L, center=tuple(D), axis="X", seg=64)
ik.boolean(drum, ik.duplicate(col_clear, "cc"))
for sx in (-1, 1):
    ik.boolean(drum, ik.cylinder("grv", DRUM_D + 2, 1.2, center=(sx * (DRUM_L / 2 - 6), D.y, D.z), axis="X", seg=64))
caps_ = []
for sx, nm in ((-1, "Tilt_Knob_L"), (1, "Tilt_Knob_R")):
    KX = DRUM_L / 2 + 0.6 + 12 + 0.4 + 3.5
    k = ik.cylinder(nm, 62, 7, center=(sx * KX, D.y, D.z), axis="X", seg=64)
    kn = [ik.box("kk", 8, 3.0, 3.0, center=(sx * KX, D.y + 31 * math.cos(math.radians(a)), D.z + 31 * math.sin(math.radians(a))))
          for a in range(0, 360, 15)]
    for b_, a in zip(kn, range(0, 360, 15)):
        xform(b_, Matrix.Translation((sx * KX, D.y + 31 * math.cos(math.radians(a)), D.z + 31 * math.sin(math.radians(a))))
              @ Matrix.Rotation(math.radians(a), 4, "X")
              @ Matrix.Translation((-sx * KX, -(D.y + 31 * math.cos(math.radians(a))), -(D.z + 31 * math.sin(math.radians(a))))))
    ik.boolean(k, ik.join("kn", kn))
    caps_.append(k)
yokes = []
floor_z = top_z(DRUM_Y) - DECK_DEPTH
for sx, nm in ((-1, "Tilt_Yoke_L"), (1, "Tilt_Yoke_R")):
    xc = sx * (DRUM_L / 2 + 0.6 + 6)
    y = ik.box(nm, 12, 60, D.z - floor_z + 14, center=(xc, D.y, (D.z + floor_z - 14) / 2))
    ik.boolean(y, ik.cylinder("yc", 60, 12, center=(xc, D.y, D.z), axis="X", seg=64), "UNION")
    ik.boolean(y, deck_box("yclip", 0, H_MID - DECK_DEPTH, H_MID + 400), "INTERSECT")
    yokes.append(y)

# hidden fasteners: corner bosses in the shell (M3 thread-forming), screws enter under the feet
FEET = [(sx * 86.0, sy * 60.0) for sx in (-1, 1) for sy in (-1, 1)]
feet = []
for i, (x, y) in enumerate(FEET):
    tb = ik.cylinder("tb", 8.0, 24, center=(x, y, BASE_PZ + 12 + 0.6), draft_deg=0.5, root="top")
    ik.boolean(tb, ik.cylinder("pilot", 2.4, 20, center=(x, y, BASE_PZ + 10)))
    for dx, dy in ((math.copysign(1, x), 0), (0, math.copysign(1, y))):
        r_ = ik.box("rib", 22 if dx else 1.4, 1.4 if dx else 22, 20, center=(x + dx * 11, y + dy * 11, BASE_PZ + 14))
        ik.boolean(tb, r_, "UNION")
    ik.boolean(tb, ik.cylinder("pilot2", 2.4, 20, center=(x, y, BASE_PZ + 10)))
    keep = ik.offset_solid(bext, -0.5, "keep")
    ik.boolean(tb, keep, "INTERSECT")
    ik.boolean(tb, ik.box("lipclr", 400, 400, 4.0, center=(0, 0, BASE_PZ + 1.6)))
    ik.boolean(bshell, tb, "UNION")
    ik.boolean(bbot, ik.cylinder("clr", 3.3, 60, center=(x, y, 0)))
    tw = ring_solid("tw", 8.4, 3.3, BASE_PZ - BASE_WALL + 0.2, (x, y, BASE_WALL + (BASE_PZ - BASE_WALL) / 2 - 0.05))
    ik.boolean(bbot, tw, "UNION")
    feet.append(ik.foot(bbot, (x, y), d=16, h=1.6, recess=0.8, name=f"Foot_{i + 1}"))
    lst = json.loads(bshell.get("fasteners", "[]"))
    lst.append({"xy": [x, y], "screw": "M3 thread-forming (PT-style)", "feature": "corner pilot boss Ø8, 2 ribs", "boss_od": 8.0, "pilot": 2.4})
    bshell["fasteners"] = json.dumps(lst)
ik.delete(bext)

# rear I/O, cut through the back wall (flat zone |x| < 79)


def ycut(w, h, r, x, z, depth=20):
    o = ik.rounded_box("io", w, h, depth, r_plan=r, center=(0, 0, 0))
    return xform(o, Matrix.Translation((x, BASE_D / 2, z)) @ Matrix.Rotation(math.radians(90), 4, "X"))


IO_Z = 44.0
io = [("kensington", 7.2, 3.2, 1.0, -62), ("usb_c", 9.2, 3.6, 1.79, -44), ("rj45", 16.4, 13.6, 1.0, -22),
      ("pedals_rj12", 12.4, 9.6, 1.0, 0), ("dc_in", 9.0, 9.0, 4.49, 20), ("headset", 6.4, 6.4, 3.19, 38)]
ik.boolean(bshell, ik.join("io_all", [ycut(w, h, r, x, IO_Z) for _, w, h, r, x in io]))
bshell["io"] = ", ".join(n for n, *_ in io)

# base internals
ballast = ik.rounded_box("Ballast_Plate", 170, 108, 4, r_plan=10, center=(0, 0, BASE_WALL + 0.3 + 2))
main_pcb = ik.rounded_box("Main_PCB", 150, 96, 1.6, r_plan=6, center=(0, 0, 34))

# ── wordmark: reflective pad print on both sides, after the Tarmac downtube ────
WM_S = json.load(open(os.path.join(HERE, "..", "brand", "strokes.json")))


def wordmark(name, side):
    s, skew = 0.36, math.tan(math.radians(WM_S["skew_deg"]))
    u0, v0 = 118.0, 0.0
    zb, th = 58.0, 0.22
    pieces = []

    def P(u, v):
        uu = u + v * skew
        return ((uu - u0) * s * side, zb + (v - v0) * s)

    def place(y, z, out):
        xw = BASE_W / 2 - (z - BASE_PZ) * math.tan(math.radians(BASE_DRAFT))
        return (side * (xw + out), y, z)
    for st in WM_S["strokes"]:
        w = st["w"] * s
        pts = [P(*p) for p in st["pts"]]
        for (y0_, z0_), (y1_, z1_) in zip(pts, pts[1:]):
            L_ = math.hypot(y1_ - y0_, z1_ - z0_)
            if L_ < 1e-6:
                continue
            ty_, tz_ = (y1_ - y0_) / L_, (z1_ - z0_) / L_
            ny_, nz_ = -tz_, ty_
            bm = bmesh.new()
            q = [(y0_ + ny_ * w / 2, z0_ + nz_ * w / 2), (y1_ + ny_ * w / 2, z1_ + nz_ * w / 2),
                 (y1_ - ny_ * w / 2, z1_ - nz_ * w / 2), (y0_ - ny_ * w / 2, z0_ - nz_ * w / 2)]
            vs_ = [bm.verts.new(place(y_, z_, -0.1)) for y_, z_ in q] + [bm.verts.new(place(y_, z_, th)) for y_, z_ in q]
            for f_ in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
                bm.faces.new([vs_[i] for i in f_])
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            pieces.append(ik._obj_from_bm("seg", bm))
        for y_, z_ in pts:
            bm = bmesh.new()
            ring_lo = [bm.verts.new(place(y_ + w / 2 * math.cos(2 * math.pi * i / 16), z_ + w / 2 * math.sin(2 * math.pi * i / 16), -0.1)) for i in range(16)]
            ring_hi = [bm.verts.new(place(y_ + w / 2 * math.cos(2 * math.pi * i / 16), z_ + w / 2 * math.sin(2 * math.pi * i / 16), th)) for i in range(16)]
            bm.faces.new(ring_lo)
            bm.faces.new(ring_hi[::-1])
            for i in range(16):
                j = (i + 1) % 16
                bm.faces.new((ring_lo[i], ring_lo[j], ring_hi[j], ring_hi[i]))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            pieces.append(ik._obj_from_bm("dot", bm))
    hc = P(*WM_S["hub"]["c"])
    bm = bmesh.new()
    r_ = WM_S["hub"]["r"] * s
    lo_ = [bm.verts.new(place(hc[0] + r_ * math.cos(2 * math.pi * i / 16), hc[1] + r_ * math.sin(2 * math.pi * i / 16), -0.1)) for i in range(16)]
    hi_ = [bm.verts.new(place(hc[0] + r_ * math.cos(2 * math.pi * i / 16), hc[1] + r_ * math.sin(2 * math.pi * i / 16), th)) for i in range(16)]
    bm.faces.new(lo_)
    bm.faces.new(hi_[::-1])
    for i in range(16):
        bm.faces.new((lo_[i], lo_[(i + 1) % 16], hi_[(i + 1) % 16], hi_[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    pieces.append(ik._obj_from_bm("hub", bm))
    o = ik.join(name, pieces)
    # merge overlapping strokes into one clean solid (self-union)
    m = o.modifiers.new("u", "BOOLEAN")
    m.operation = "UNION"
    m.solver = "EXACT"
    m.use_self = True
    m.object = ik.box("far", 0.1, 0.1, 0.1, center=(0, 0, -500))
    far = m.object
    ik.apply_mods(o)
    ik.delete(far)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -400], context="VERTS")
    bm.to_mesh(o.data)
    bm.free()
    return o


wm_r = wordmark("Wordmark_R", 1)
wm_l = wordmark("Wordmark_L", -1)

# ══════════════════════════════════════════════════════════════════════════════
# 4. CMF
# ══════════════════════════════════════════════════════════════════════════════
M = {
    "carbon": ik.mat_plastic("Satin Carbon PC/ABS MT-11010", C_["carbon"], "MT-11010", coat=0.08),
    "graphite": ik.mat_plastic("Graphite PC/ABS MT-11000", C_["graphite"], "MT-11000"),
    "face": ik.mat_plastic("Faceplate Graphite PC/ABS VDI-27", C_["faceplate"], "VDI-27"),
    "cap": ik.mat_plastic("Key cap Carbon PC SPI-B1", C_["cap"], "SPI-B1", coat=0.3),
    "deck": ik.mat_softtouch("Deck Graphite soft-touch", C_["graphite"]),
    "gum": ik.mat_softtouch("Gum TPE 2K", C_["gum"]),
    "mint_cap": ik.mat_plastic("Signal Mint PC SPI-B1", C_["mint"], "SPI-B1", coat=0.3),
    "stop": ik.mat_plastic("Stop Red PC SPI-A2", C_["stop"], "SPI-A2", coat=0.5),
    "yellow": ik.mat_plastic("Safety Yellow PC SPI-B1", C_["yellow"], "SPI-B1"),
    "alloy": ik.mat_anodized("Alloy Al6063 bead-blast clear", C_["alloy"], "bead-blast"),
    "alloy_b": ik.mat_anodized("Alloy Al6063 brushed clear", C_["alloy"], "brushed"),
    "halo": ik.mat_emissive("Halo PMMA light guide (autonomy mint)", C_["mint"], 6.0),
    "oled": ik.mat_emissive("OLED status", C_["mint"], 2.5),
    "window": ik.mat_clear("Smoked PC window", "#20262A", rough=0.05, smoked=0.75),
    "print_red": ik.mat_plastic("Pad print Stop Red", C_["stop"], "SPI-B1"),
    "print_white": ik.mat_plastic("Pad print Robot White", C_["white"], "SPI-B1"),
    "print_alloy": ik.mat_anodized("Reflective metallic print (alloy)", "#D3D7DC", "polished"),
    "pcb": ik.mat_plastic("PCB FR-4", C_["pcb"], "SPI-B1"),
    "steel": ik.mat_anodized("Steel zinc-plated", C_["steel"], "bead-blast"),
    "dark": ik.mat_plastic("Internal black", "#151719", "MT-11020"),
}
for m_ in ("halo", "oled"):
    bs = M[m_].node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = ik._hex(C_["mint"])
for m_ in ("halo", "oled", "window", "pcb", "steel", "dark"):
    M[m_]["cmf"] = M[m_].name
M["halo"]["cmf"] = "PMMA light guide, 2K into the front shell; RGB LEDs on a flex inside the rim. Shown in Autonomy mint."

part(front, M["carbon"], "PC/ABS", "Injection molded, 2-plate tool, side action for the faceplate ledge",
     "A-surface. 2.8 mm wall, 1.0° + texture draft off the parting plane. Halo groove on the inner front face; TPE grip substrate recessed 1.4 mm.", wall=WALL_W)
part(rear, M["carbon"], "PC/ABS", "Injection molded",
     "Carries the lip (3.2 mm), splined shaft boss, paddle pivots and 6 × M2.5 screw towers (not modelled).", wall=WALL_W)
for g in grip_cut:
    part(g, M["gum"], "TPE", "2K overmold onto the shell (TPE Shore 60A, PC/ABS-bondable grade)",
         "Xbox-style micro-dot texture (Mold-Tech dot series). Capacitive hands-on electrode is the shell-side copper foil under the TPE.")
for h in halos:
    part(h, M["halo"], "PMMA", "Injection molded light guide, 2K/insert into front shell",
         "SPI-A2 front face, frosted back. 24 RGB LEDs per arc on a flex. Mint = autonomy, amber = operator, white pulse = transitioning.")
part(face, M["face"], "PC/ABS", "Injection molded, removable (2 hooks + 2 magnets)",
     "Swappable per fleet like an Xbox faceplate. Legends laser-etched through a dark paint layer.", wall=FP_T)
part(controls["EStop_Cap"], M["stop"], "PC", "Injection molded + dual-channel NC contact block, twist-to-release",
     "Ø31 mushroom sits 1.5 mm below the guard collar: deliberate thumb press, no accidental palm sweep.")
part(controls["EStop_Guard"], M["yellow"], "PC", "Injection molded", "Safety-yellow guard collar (ISO 13850 red on yellow).")
for nm in ("Btn_Hazard", "Btn_PushToTalk", "Btn_PushToLog", "Btn_ExtSpeaker", "Btn_Acknowledge", "Btn_Camera",
           "Btn_P1", "Btn_P2", "Btn_P3", "Btn_P4", "Btn_Horn", "Btn_Release"):
    part(controls[nm], M["cap"], "PC", "Injection molded, SPI-B1 gloss key cap", "Gloss caps on a textured faceplate read as touch points (Xbox ABXY move).")
part(controls["Btn_Claim"], M["mint_cap"], "PC", "Injection molded, SPI-B1", "The only mint control. Stands 1.2 mm proud; Release sits 0.4 mm recessed.")
part(controls["Dial_Ring"], M["alloy"], "Al6063", "CNC turned + knurled, bead-blast clear anodize", "36-flute knurl, 24 detents per turn.")
part(controls["Dial_Press"], M["cap"], "PC", "Injection molded", "Press to select.")
part(disp_win, M["window"], "PC", "Injection molded, smoked 25 % T, AR/hard-coat", "")
part(oled, M["oled"], "Glass", "Purchased 0.96\" OLED, 128 × 32", "Latency and link quality.")
part(haz_print, M["print_red"], "PC", "Pad print", "Hazard triangle legend.")
part(spk_print, M["print_white"], "PC", "Pad print", "Grille-dot legend on the external speaker key.")
for p in paddles:
    part(p, M["alloy_b"], "Al6063", "Stamped + CNC edge, brushed clear anodize", "Hall-effect sensed, 18° travel, magnetic return.")
part(pcb, M["pcb"], "Glass", "FR-4 4-layer", "Hub controller, tact switches, LED driver.")
part(es_block, M["dark"], "PA66-GF30", "Purchased", "E-stop contact block, 2 NC channels, wired directly to the base safety relay.")
part(encoder, M["steel"], "Zn-Zamak3", "Purchased", "Rotary encoder with push switch.")
part(clock, M["dark"], "PA66-GF30", "Purchased", "Clock spring: ±540° wheel rotation without a twisting harness.")
for o in lra:
    part(o, M["steel"], "SS304", "Purchased", "Linear resonant actuator: alert pulse and link-degradation pattern.")
part(motor, M["steel"], "SS304", "Purchased", "BLDC return-to-centre motor + 14-bit encoder.")
part(col_up, M["graphite"], "PC/ABS", "Injection molded", "Upper column cover.", wall=2.4)
part(col_lo, M["graphite"], "PC/ABS", "Injection molded", "Lower column cover; cable exit to the drum.", wall=2.4)
part(stalk, M["graphite"], "PA66-GF30", "Injection molded", "Turn signals: up = right, down = left, self-cancelling.")

part(bshell, M["carbon"], "PC/ABS", "Injection molded, 1 lifter for the rear I/O", "Satin Carbon. 2.5 mm wall, 1° draft; parting line 14 mm off the desk with a 0.8 × 0.5 shadow reveal.",
     group="base", wall=BASE_WALL)
part(bbot, M["carbon"], "PC/ABS", "Injection molded", "Lip, screw clearance towers, vent field.", group="base", wall=BASE_WALL)
part(tray, M["deck"], "PC/ABS", "Injection molded + soft-touch paint", "Drops into the shell opening, 0.8 mm shadow under the rim.", group="base", wall=2.2)
part(drum, M["alloy"], "Al6063", "Extruded tube + CNC, bead-blast clear anodize", "Tilt hinge 15–35°, friction pack inside.", group="base")
for k in caps_:
    part(k, M["alloy_b"], "Al6063", "CNC turned, brushed anodize", "Tilt lock: quarter-turn to free, quarter-turn to lock.", group="base")
for y in yokes:
    part(y, M["graphite"], "Zn-Zamak3", "Zinc die-cast, powder coat", "Bolts through the tray into the ballast plate.", group="base")
for f in feet:
    part(f, M["gum"], "TPE", "Molded TPE, Shore 50A, adhesive-backed", "Hides the base screws.", group="base")
part(ballast, M["steel"], "SS304", "Laser-cut 4 mm steel, zinc-plated", "≈640 g low ballast against tipping under steering load.", group="base")
part(main_pcb, M["pcb"], "Glass", "FR-4 6-layer", "Main controller, safety relay, USB/Ethernet.", group="base")
for w_ in (wm_r, wm_l):
    part(w_, M["print_alloy"], "PC/ABS", "Reflective metallic pad print (or IMD foil)", "Wordmark after the Tarmac downtube logo.", group="base")

for o in (col_clear,):
    ik.delete(o)

# ══════════════════════════════════════════════════════════════════════════════
# 5. dims + explode
# ══════════════════════════════════════════════════════════════════════════════
def W_(p):
    return tuple(WM @ Vector(p))


ik.dim("Wheel Ø", W_((-RIM_R - RIM_A, 0, 0)), W_((RIM_R + RIM_A, 0, 0)), "front")
ik.dim("Rim section", W_((0, -RIM_R, -RIM_B)), W_((0, -RIM_R, RIM_B)), "right")
ik.dim("Hub band", W_((-100, -BAND_H / 2, BAND_T / 2)), W_((-100, BAND_H / 2, BAND_T / 2)), "front")
ik.dim("Thumb cluster pitch", W_((-86, 14, ZTOP)), W_((88, 12, ZTOP)), "top")
ik.dim("E-stop cap", W_((-15.5, ES[1], ZTOP + 6)), W_((15.5, ES[1], ZTOP + 6)), "top")
ik.dim("Base width", (-BASE_W / 2, -BASE_D / 2, 0), (BASE_W / 2, -BASE_D / 2, 0), "front")
ik.dim("Base depth", (BASE_W / 2, -BASE_D / 2, 0), (BASE_W / 2, BASE_D / 2, 0), "top")
ik.dim("Base height, rear", (BASE_W / 2, BASE_D / 2, 0), (BASE_W / 2, BASE_D / 2, BASE_H_BACK), "right")
ik.dim("Base height, front", (BASE_W / 2, -BASE_D / 2, 0), (BASE_W / 2, -BASE_D / 2, BASE_H_FRONT), "right")
ik.dim("Parting line", (-BASE_W / 2, -BASE_D / 2, 0), (-BASE_W / 2, -BASE_D / 2, BASE_PZ), "front")
ik.dim("Wheel centre height", (0, CEN.y, 0), tuple(CEN), "right")

ax = lambda d: tuple(n_axis * d)  # noqa: E731
EXP = {"Hub_Faceplate": 70, "Display_Window": 85, "Display_OLED": 40, "Print_Hazard": 120, "Print_SpeakerDots": 120,
       "Wheel_Front_Shell": 30, "Halo_Guide_Upper": 45, "Halo_Guide_Lower": 45, "Grip_L_Front": 40, "Grip_R_Front": 40,
       "Hub_PCB": 15, "EStop_ContactBlock": 5, "Dial_Encoder": 10, "Clock_Spring": -10, "Wheel_Rear_Shell": -15,
       "Grip_L_Rear": -30, "Grip_R_Rear": -30, "Paddle_Brake_L": -45, "Paddle_Throttle_R": -45, "Haptic_LRA_L": 0, "Haptic_LRA_R": 0,
       "Column_Cover_Upper": -60, "Column_Cover_Lower": -60, "Steer_Motor": -60, "Stalk_TurnSignal": -60}
for nm in controls:
    EXP[nm] = 115 if nm not in ("EStop_Guard",) else 100
for nm, d in EXP.items():
    if nm in bpy.data.objects:
        v = Vector(ax(d))
        if "Column" in nm or nm in ("Steer_Motor", "Stalk_TurnSignal"):
            v += Vector((0, 0, 40))
        if nm == "Column_Cover_Upper":
            v += Vector(ax(0)) + Vector((0, 0, 25))
        ik.explode_hint(bpy.data.objects[nm], tuple(v + Vector((0, 0, 60))))
for nm, off in {"Base_Bottom": (0, 0, -70), "Ballast_Plate": (0, 0, -40), "Main_PCB": (0, 0, -15), "Deck_Tray": (0, 0, 30),
                "Tilt_Drum": (0, 0, 60), "Tilt_Knob_L": (-35, 0, 60), "Tilt_Knob_R": (35, 0, 60),
                "Tilt_Yoke_L": (-20, 0, 40), "Tilt_Yoke_R": (20, 0, 40), "Wordmark_R": (25, 0, 0), "Wordmark_L": (-25, 0, 0)}.items():
    ik.explode_hint(bpy.data.objects[nm], off)
for i in range(4):
    ik.explode_hint(bpy.data.objects[f"Foot_{i + 1}"], (0, 0, -95))
for nm in T:
    if nm not in ik.EXPLODE:
        ik.explode_hint(bpy.data.objects[nm], (0, 0, 0))

# ══════════════════════════════════════════════════════════════════════════════
# 6. outputs
# ══════════════════════════════════════════════════════════════════════════════
parts = [d["obj"] for d in T.values()]
stray = [o.name for o in bpy.context.scene.objects if o.type == "MESH" and o.name not in T]
if stray:
    print("STRAY OBJECTS (not parts):", stray)
    ik.delete(*[bpy.data.objects[n] for n in stray])
for p_ in parts:
    if p_.name.startswith("Wordmark"):
        continue
    bm = bmesh.new()
    bm.from_mesh(p_.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
    bmesh.ops.dissolve_degenerate(bm, dist=0.002, edges=bm.edges)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    loose_e = [e for e in bm.edges if not e.link_faces]
    bmesh.ops.delete(bm, geom=loose_e, context="EDGES")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bad = sum(1 for e in bm.edges if not e.is_manifold)
    bm.to_mesh(p_.data)
    bm.free()
    p_.data.validate(clean_customdata=False)
    if bad:
        print(f"NONMANIFOLD {p_.name}: {bad} edges", flush=True)
ik.finish(parts)
os.makedirs(OUT, exist_ok=True)
ik.write_report(os.path.join(OUT, "spec.json"), list(T.values()),
                extra={"product": PRODUCT, "assembly": [
                    "Base: ballast plate and main PCB (on standoffs) into Base_Bottom",
                    "Base_Shell over Base_Bottom (lip engages), 4 × M3 from below, feet cover screws",
                    "Yokes + tilt drum through the Deck_Tray into the ballast plate; tray drops into the shell",
                    "Column: motor + cable into lower cover, upper cover snaps on (2 screws), into the drum socket",
                    "Wheel: halo guides + grips are 2K in the shells; hub PCB, clock spring, LRAs into rear shell",
                    "Front shell onto rear shell (lip), 6 × M2.5 from behind; paddles pinned to pivots",
                    "Key caps + E-stop into the faceplate; faceplate clips on (2 hooks + magnets)"],
                       "drivers": {"wheel_d": 2 * (RIM_R + RIM_A), "tilt_deg": TILT, "wheel_centre_mm": [round(c, 1) for c in CEN],
                                   "base": [BASE_W, BASE_D, BASE_H_FRONT, BASE_H_BACK], "deck_slope_deg": round(DECK_DEG, 1)}})
ik.save_blend(os.path.join(OUT, "model.blend"))
print("exporting", flush=True)
try:
    ik.export_glb(os.path.join(OUT, "model.glb"), parts)
except Exception:
    import traceback
    traceback.print_exc()
    sys.stdout.flush()
    raise
ik.save_blend(os.path.join(OUT, "model.blend"))
print("BUILD OK", len(parts), "parts")
if NORENDER:
    ik.done()

# ══════════════════════════════════════════════════════════════════════════════
# 7. stills
# ══════════════════════════════════════════════════════════════════════════════
want = set(RENDERS.split(","))
cam = ik.studio(parts, preset="studio")
if "hero" in want:
    ik.frame(parts, az_deg=-32, el_deg=16, fill=1.05)
    ik.render(os.path.join(OUT, "hero.png"), res=(1600, 1200), samples=48)
if "hub" in want:
    hub_parts = [face] + list(controls.values())
    pts = [o.matrix_world @ Vector(c) for o in hub_parts for c in o.bound_box]
    ctr = sum(pts, Vector()) / len(pts)
    eye = ctr + n_axis * 640 + Vector((-90, 0, 60))
    cam.location = eye
    cam.rotation_euler = (ctr - eye).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 85
    ik.render(os.path.join(OUT, "hub.png"), res=(1600, 1000), samples=48)
if "rear" in want:
    ik.frame(parts, az_deg=148, el_deg=18, fill=1.0)
    ik.render(os.path.join(OUT, "rear.png"), res=(1400, 1050), samples=32)
if "exploded" in want:
    saved = {o.name: o.location.copy() for o in parts}
    for nm, off in ik.EXPLODE.items():
        bpy.data.objects[nm].location += Vector(off) * 1.0
    ik.frame(parts, az_deg=-50, el_deg=14, fill=1.0)
    ik.render(os.path.join(OUT, "exploded.png"), res=(1400, 1050), samples=32)
    ik.restore(saved)
if "internals" in want:
    hide = {"Wheel_Front_Shell", "Hub_Faceplate", "Base_Shell", "Deck_Tray", "Column_Cover_Upper", "Grip_L_Front", "Grip_R_Front",
            "Display_Window", "Wordmark_R", "Wordmark_L", "Halo_Guide_Upper", "Halo_Guide_Lower"} | set(controls)
    hide |= {"Print_Hazard", "Print_SpeakerDots"}
    for o in parts:
        o.hide_render = o.name in hide
    ik.frame([o for o in parts if not o.hide_render], az_deg=-38, el_deg=22, fill=1.0)
    ik.render(os.path.join(OUT, "internals.png"), res=(1400, 1050), samples=32)
    for o in parts:
        o.hide_render = False
ik.done()
