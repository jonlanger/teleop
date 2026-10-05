"""
teleop Wheel — build script.

Run:  /Applications/Blender.app/Contents/MacOS/Blender -b -P build.py -- OUT_DIR [--norender]

A desk-mounted teleoperation wheel: a 280 mm wheel on a column that rises from a hinge barrel
across the back of a solid satin-carbon base. The barrel is three pieces (two fixed caps and the
centre knuckle that carries the column); push the wheel to tilt it. Form thesis: a quiet satin-carbon instrument
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
RENDERS = next((a.split("=", 1)[1] for a in args if a.startswith("--renders=")), "hero,hub,side,rear,port,exploded,internals")

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
FP_INSET, FP_T = 6.0, 2.5                        # faceplate: uniform inset from the band → concentric corners
FP_W, FP_H, FP_R = BAND_W - 2 * FP_INSET, BAND_H - 2 * FP_INSET, BAND_RP - FP_INSET   # 220 × 88, R18
COL_INSET, KEY_INSET = 4.0, 3.0                  # key column inset from the faceplate edge, keys inset from the column
GRIP_HALF_DEG = 38.0     # TPE grip zones at 3 and 9 o'clock, ±38°
GRIP_T, GRIP_RECESS = 2.0, 1.2   # TPE thickness, substrate recess (TPE stands 0.8 proud, 1.6 substrate)
HALO_T = 11.0            # z of the halo light guide on the rim's inner front face
TILT = 25.0              # wheel face leans back from vertical (push to tilt 15–35°, friction hinge + 5° detents)
COL_LEN = 175.0          # wheel centre → hinge barrel axis
# base (world frame)
BASE_W, BASE_D = 210.0, 160.0
BASE_H_FRONT, BASE_H_BACK = 100.0, 125.6
BASE_N, BASE_RT, BASE_RB = 5.0, 12.0, 4.0   # squircle plan (G2 corners), top and bottom edge radii
BASE_WALL, BASE_DRAFT, BASE_PZ = 2.5, 1.0, 16.0
BARREL_R, BARREL_Y, BARREL_RISE = 30.0, 46.0, 18.0   # hinge barrel: radius, axis y, axis height above the top surface
BARREL_HALF, KNUCKLE_HALF, SEAM = 88.0, 36.0, 0.5    # barrel half-length, centre knuckle half-length, seam between pieces
USB_Z = 30.0
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


def safe_cut(target, cutter, tries=5):
    """EXACT difference that must not add volume; on failure nudge the cutter and retry."""
    v0 = ik.volume_cm3(target)
    for i in range(tries):
        t = ik.duplicate(target, target.name + "_try")
        c = ik.duplicate(cutter, "cut_try")
        if 0 < i < tries - 1:
            xform(c, Matrix.Translation((0.013 * i, 0.007 * i, 0.011 * i)) @ Matrix.Scale(1 + 0.0007 * i, 4))
        ik.boolean(t, c, solver="FAST" if i == tries - 1 else "EXACT")   # last try: FAST solver
        if ik.volume_cm3(t) <= v0 + 0.05 and ik.is_manifold(t) >= ik.is_manifold(target):
            target.data, old = t.data, target.data
            ik.delete(t, cutter)
            return target
        ik.delete(t)
    print("safe_cut: kept best effort for", target.name, flush=True)
    return ik.boolean(target, cutter)


def ring_solid(name, d_out, d_in, h, center):
    o = ik.cylinder(name, d_out, h, center=center)
    return ik.boolean(o, ik.cylinder("ri", d_in, h + 2, center=center))


# ── wordmark strokes (brand/strokes.json → thin solids for prints) ──────────────
WM_S = json.load(open(os.path.join(HERE, "..", "brand", "strokes.json")))


def wordmark_solid(name, s, to3d, th=0.22):
    """Wordmark strokes as one thin solid. to3d(a, b, out) maps scaled 2D (a along, b up) to 3D."""
    skew = math.tan(math.radians(WM_S["skew_deg"]))
    u0 = 118.0

    def P2(u, v):
        return ((u + v * skew - u0) * s, v * s)

    def disc(c2, r_):
        bm = bmesh.new()
        lo_ = [bm.verts.new(to3d(c2[0] + r_ * math.cos(2 * math.pi * i / 16), c2[1] + r_ * math.sin(2 * math.pi * i / 16), -0.1)) for i in range(16)]
        hi_ = [bm.verts.new(to3d(c2[0] + r_ * math.cos(2 * math.pi * i / 16), c2[1] + r_ * math.sin(2 * math.pi * i / 16), th)) for i in range(16)]
        bm.faces.new(lo_)
        bm.faces.new(hi_[::-1])
        for i in range(16):
            bm.faces.new((lo_[i], lo_[(i + 1) % 16], hi_[(i + 1) % 16], hi_[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return ik._obj_from_bm("dot", bm)
    pieces = []
    for st_ in WM_S["strokes"]:
        w = st_["w"] * s
        pts = [P2(*p) for p in st_["pts"]]
        for (a0, b0), (a1, b1) in zip(pts, pts[1:]):
            L_ = math.hypot(a1 - a0, b1 - b0)
            if L_ < 1e-6:
                continue
            na, nb = -(b1 - b0) / L_, (a1 - a0) / L_
            q = [(a0 + na * w / 2, b0 + nb * w / 2), (a1 + na * w / 2, b1 + nb * w / 2), (a1 - na * w / 2, b1 - nb * w / 2), (a0 - na * w / 2, b0 - nb * w / 2)]
            bm = bmesh.new()
            vs_ = [bm.verts.new(to3d(a_, b_, -0.1)) for a_, b_ in q] + [bm.verts.new(to3d(a_, b_, th)) for a_, b_ in q]
            for f_ in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
                bm.faces.new([vs_[i] for i in f_])
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            pieces.append(ik._obj_from_bm("seg", bm))
        pieces += [disc(p, w / 2) for p in pts]
    pieces.append(disc(P2(*WM_S["hub"]["c"]), WM_S["hub"]["r"] * s))
    o = ik.join(name, pieces)
    m = o.modifiers.new("u", "BOOLEAN")
    m.operation, m.solver, m.use_self = "UNION", "EXACT", True
    far = ik.box("far", 0.1, 0.1, 0.1, center=(0, 0, -5000))
    m.object = far
    ik.apply_mods(o)
    ik.delete(far)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -4000], context="VERTS")
    bm.to_mesh(o.data)
    bm.free()
    return o


# ══════════════════════════════════════════════════════════════════════════════
# 1. WHEEL (local frame)
# ══════════════════════════════════════════════════════════════════════════════
def band_box(name, inset=0.0):
    """Hub band solid, offset by `inset` on every face (plan and depth) so walls stay uniform."""
    return ik.rounded_box(name, BAND_W - 2 * inset, BAND_H - 2 * inset, BAND_T - 2 * inset, r_plan=BAND_RP - inset,
                          r_edge=max(0.5, BAND_RE - inset), center=(0, 0, 0))


# no spoke web: the hub band joins the rim directly; open above and below the band
ext = torus("wheel_ext", RIM_A, RIM_B)
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
step = torus("step_o", RIM_A - WALL_W / 2 - 0.04, RIM_B - WALL_W / 2 - 0.04)
ik.boolean(step, band_box("step_bo", WALL_W / 2 + 0.04), "UNION")
ik.boolean(step, torus("step_i", RIM_A - WALL_W - 0.5, RIM_B - WALL_W - 0.5))
ik.clip_z(step, -0.5, LIP_H + 0.08)
ik.delete(inner)

front = ik.duplicate(ext, "Wheel_Front_Shell")
rear = ik.duplicate(ext, "Wheel_Rear_Shell")
ik.delete(ext)
ik.clip_z(front, 0, 1e4)
ik.clip_z(rear, -1e4, 0)
ik.boolean(rear, lip, "UNION")
ik.boolean(front, step)

# grips: 2K TPE wrapping the outer 210° of the rim section (the inner side, where the hub band
# joins, stays shell), substrate recessed on both shells
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

CCX, CCY = FP_W / 2 - FP_R, FP_H / 2 - FP_R      # shared corner centres: (92, 26)
COL_R = FP_R - COL_INSET                          # key column end radius R14
KEY_R = COL_R - KEY_INSET                         # end key / D-pad / stick radius R11


def print_tri(name, c):
    bm = bmesh.new()
    vs = [bm.verts.new((c[0] + 3.0 * math.cos(math.radians(90 + 120 * i)), c[1] - 0.5 + 3.0 * math.sin(math.radians(90 + 120 * i)), ZTOP + 0.8 - 0.05)) for i in range(3)]
    bm.faces.new(vs)
    bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    bm.verts.ensure_lookup_table()
    for v in bm.verts[3:]:
        v.co.z += 0.15
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ik._obj_from_bm(name, bm)


# centre: emergency stop, a plain red mushroom in a thin graphite bezel
ES = (0.0, 16.0)
ik.boolean(face, ik.cylinder("esh", 30 + 2 * GAP, 40, center=(ES[0], ES[1], ZTOP)))
bezel = ik.rounded_box("EStop_Bezel", 34, 34, 1.6, r_plan=16.999, r_edge=0.7, center=(ES[0], ES[1], ZTOP + 0.8))
ik.boolean(bezel, ring_solid("bsk", 30, 28.6, FP_T + 0.3 + 0.8, (ES[0], ES[1], FP_Z0 + (FP_T + 0.3) / 2 - 0.4)), "UNION")
ik.boolean(bezel, ik.cylinder("bzi", 28.6, 20, center=(ES[0], ES[1], ZTOP)))
controls["EStop_Bezel"] = bezel
es_cap = ik.rounded_box("EStop_Cap", 28, 28, 8.0, r_plan=13.999, r_edge=3.5, center=(ES[0], ES[1], ZTOP + 1.0))
ik.boolean(es_cap, ik.cylinder("esst", 16, 6, center=(ES[0], ES[1], ZTOP - 5.0)), "UNION")
controls["EStop_Cap"] = es_cap

HZ = (36.0, 30.0)
controls["Btn_Hazard"] = cap("Btn_Hazard", HZ, 11, proud=0.8)
haz_print = print_tri("Print_Hazard", HZ)

# programmable P1 / P2: small squares inside the columns, tactile dot count
for nm, xy, n in (("Btn_P1", (-56.0, -32.0), 1), ("Btn_P2", (56.0, -32.0), 2)):
    k = cap(nm, xy, (10, 10), "rect", proud=0.6, r_corner=2.5)
    bumps(k, [(xy[0] + d, xy[1]) for d in ((0.0,) if n == 1 else (-1.6, 1.6))])
    controls[nm] = k


# one key column per thumb: a molded carrier on the faceplate's corner centres, three keys and a D-pad / stick
def key_column(sx, names, nav):
    x = sx * CCX
    side = "L" if sx < 0 else "R"
    L_ = 2 * (CCY + COL_R)
    ik.boolean(face, ik.rounded_box("kco", 2 * COL_R + 2 * GAP, L_ + 2 * GAP, 40, r_plan=COL_R + GAP - 0.001, center=(x, 0, ZTOP)))
    carrier = ik.rounded_box(f"Key_Column_{side}", 2 * COL_R, L_, FP_T + 0.3 - 0.6, r_plan=COL_R - 0.001, r_edge=0.6,
                             center=(x, 0, FP_Z0 + (FP_T + 0.3 - 0.6) / 2))
    controls[carrier.name] = carrier
    # end key: its outer end is concentric with the column end
    yb = CCY + KEY_R - 13.0

    def end_shape(nm_, g, h, z0):
        st = ik.rounded_box(nm_, 2 * (KEY_R + g), 2 * (KEY_R + g) + 30, h, r_plan=KEY_R + g - 0.001, r_edge=0.0 if g else 0.8,
                            center=(x, CCY - 15, z0 + h / 2))
        return ik.boolean(st, ik.box("ycut", 80, 80, 80, center=(x, yb - g - 40, z0)))
    ik.boolean(carrier, end_shape("eko", GAP, 40, ZTOP - 20))
    top = end_shape(names[0], 0.0, FP_T + 0.3 - 0.6 + 1.4, FP_Z0)
    ik.boolean(top, ik.box("ekf", 2 * KEY_R + 1.6, 13.0 + 1.6, 0.8, center=(x, CCY + KEY_R - 6.5, FP_Z0 - 0.45)), "UNION")
    top["gap_mm"] = GAP
    controls[names[0]] = top
    ys = [yb - 2.0 - 5.0, yb - 2.0 - 10.0 - 2.0 - 5.0]
    for nm_, yk in zip(names[1:3], ys):
        controls[nm_] = cap(nm_, (x, yk), (2 * KEY_R, 10.0), "rect", proud=0.8, r_corner=2.5, face_obj=carrier)
    ny = -CCY
    ik.boolean(carrier, ik.cylinder("nvo", 2 * KEY_R + 2 * GAP, 40, center=(x, ny, ZTOP)))
    if nav == "dpad":
        d = ik.cylinder("DPad", 2 * KEY_R, ZTOP - 1.2 - (FP_Z0 - 0.6), center=(x, ny, (ZTOP - 1.2 + FP_Z0 - 0.6) / 2))
        ik.boolean(d, ik.cylinder("dpf", 2 * KEY_R + 3, 0.8, center=(x, ny, FP_Z0 - 1.0)), "UNION")
        for rz in (0, 90):
            arm_ = ik.rounded_box("dpa", 18, 6.5, 2.0, r_plan=1.8, r_edge=0.6, center=(x, ny, ZTOP - 1.2 + 1.0 - 0.05))
            rot_z(arm_, rz, (x, ny))
            ik.boolean(d, arm_, "UNION")
        ik.boolean(d, ik.rounded_box("dpd", 5, 5, 1.0, r_plan=2.49, r_edge=0.45, center=(x, ny, ZTOP + 0.8)))
        controls["DPad"] = d
    else:
        g_ = ik.rounded_box("Stick_Gimbal", 2 * KEY_R - 1, 2 * KEY_R - 1, ZTOP - 0.2 - (FP_Z0 - 5), r_plan=KEY_R - 0.501, r_edge=3.0,
                            center=(x, ny, (ZTOP - 0.2 + FP_Z0 - 5) / 2))
        st = ik.rounded_box("Stick_Cap", 16, 16, 3.6, r_plan=7.999, r_edge=1.4, center=(x, ny, ZTOP + 5.0 + 1.8))
        ik.boolean(st, ik.cylinder("stem", 6, 6.0, center=(x, ny, ZTOP + 2.4)), "UNION")
        ik.boolean(st, ik.rounded_box("dish", 12, 12, 1.4, r_plan=5.99, r_edge=0.6, center=(x, ny, ZTOP + 8.6 + 0.2)))
        controls["Stick_Gimbal"] = g_
        controls["Stick_Cap"] = st
    return x, ny


DPAD = key_column(-1, ["Btn_Talk", "Btn_Log", "Btn_ExtSpeaker"], "dpad")
STICK = key_column(1, ["Btn_Claim", "Btn_Release", "Btn_Horn"], "stick")
spk_y = CCY + KEY_R - 13.0 - 2.0 - 10.0 - 2.0 - 5.0
# text logo in the centre of the faceplate (replaces the horn pad): pad print, 0.12 mm
fp_logo = wordmark_solid("Print_Faceplate_Wordmark", 0.17, lambda a, b, o_: (a, b - 21.0, ZTOP + 0.05 + o_ * 0.5), th=0.12)
spk_print = ik.join("Print_SpeakerDots", [ik.cylinder("sd", 1.3, 0.2, center=(DPAD[0] + dx, spk_y, ZTOP + 0.8 + 0.05), seg=12) for dx in (-4, 0, 4)])

# ── behind the wheel ──────────────────────────────────────────────────────────
ZB = -BAND_T / 2
boss = ik.rounded_box("shaft_boss", 44, 44, 15.0, r_plan=21.999, r_edge=1.5, center=(0, 0, ZB - 7.5 + 0.3))
ik.boolean(rear, boss, "UNION")     # closed: the splined shaft threads in from inside the hub
# rear trim: a flush 1.0 mm plate hiding the six shell screws, concentric with the band (R24 → R14)
TRIM_W, TRIM_H = 100.0, 60.0
pocket = ik.rounded_box("rtp", TRIM_W + 2 * GAP, TRIM_H + 2 * GAP, 2.0, r_plan=14 + GAP, center=(0, 0, ZB))
ik.boolean(pocket, ik.cylinder("rtb", 44.4, 30, center=(0, 0, ZB)))
ik.boolean(rear, pocket)
trim = ik.rounded_box("Hub_Rear_Trim", TRIM_W, TRIM_H, 1.0, r_plan=14, r_edge=0.4, center=(0, 0, ZB + 0.5))
ik.boolean(trim, ik.cylinder("rth", 46.0, 30, center=(0, 0, ZB)))
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
ik.boolean(pcb, ik.box("smh", 24, 24, 10, center=(STICK[0], STICK[1], FP_Z0 - 5.6)))
es_block = ik.rounded_box("EStop_ContactBlock", 22, 22, 10, r_plan=3, r_edge=0.5, center=(ES[0], ES[1], FP_Z0 - 9.3))
stick_mod = ik.rounded_box("Stick_Module", 22, 22, 9, r_plan=2, r_edge=0.5, center=(STICK[0], STICK[1], FP_Z0 - 5 - 4.5))
clock = ring_solid("Clock_Spring", 40, 20, 7.0, (0, 0, ZB + WALL_W + 3.6))
lra = [ik.cylinder(f"Haptic_LRA_{s}", 10, 3.6, center=(RIM_R * math.cos(math.radians(a)), RIM_R * math.sin(math.radians(a)), 0))
       for s, a in (("L", 152), ("R", 28))]

# ── column (fixed: tilts with the wheel, does not steer) ──────────────────────
COL_Z0, COL_Z1 = ZB - 15.0 - 0.6, -COL_LEN + 8.0     # foot ends inside the knuckle, trimmed to it below
col_len = COL_Z0 - COL_Z1
col_ext = ik.rounded_box("col_ext", 60, col_len, 52, r_plan=16, r_edge=12, draft_deg=0.5, parting_z=0)
col_up, col_lo = ik.clamshell(col_ext, parting_z=0.0, wall=2.4, reveal=(0.6, 0.4), names=("Column_Cover_Upper", "Column_Cover_Lower"))
COLM = Matrix.Translation((0, 0, (COL_Z0 + COL_Z1) / 2)) @ Matrix.Rotation(math.radians(-90), 4, "X")
for o in (col_up, col_lo):
    xform(o, COLM)
col_clear = xform(ik.rounded_box("col_clr", 60.6, col_len, 52.6, r_plan=16.3, r_edge=12.3), COLM)
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
D = Vector((0, BARREL_Y, top_z(BARREL_Y) + BARREL_RISE))   # hinge barrel axis
CEN = D + COL_LEN * n_axis
WM = Matrix.Translation(CEN) @ Matrix.Rotation(math.radians(90 - TILT), 4, "X")

wheel_parts = ([front, rear, face, trim, haz_print, spk_print, pcb, es_block, stick_mod, clock, motor, stalk,
                col_up, col_lo, col_clear, fp_logo] + grip_cut + halos + paddles + lra + list(controls.values()))
for o in wheel_parts:
    xform(o, WM)

# ══════════════════════════════════════════════════════════════════════════════
# 3. BASE (world frame)
# ══════════════════════════════════════════════════════════════════════════════
bext = ik.rounded_box("base_ext", BASE_W, BASE_D, H_MID, plan="squircle", n=BASE_N, r_edge=BASE_RT, r_edge_bottom=BASE_RB,
                      center=(0, 0, H_MID / 2), draft_deg=BASE_DRAFT, parting_z=BASE_PZ)
shear(bext, K_SLOPE, z_above=BASE_PZ + 1)
bshell, bbot = ik.clamshell(bext, parting_z=BASE_PZ, wall=BASE_WALL, lip_h=3.0, reveal=(0.8, 0.5),
                            names=("Base_Shell", "Base_Bottom"))

def yobj(o, x, y, z):
    return xform(o, Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(90), 4, "X"))


y_back = BASE_D / 2 - (USB_Z - BASE_PZ) * math.tan(math.radians(BASE_DRAFT))
USB_CUT = yobj(ik.rounded_box("usb_o", 9.4, 3.8, 8, r_plan=1.7), 0, y_back - 1.5, USB_Z)



def cyl_x(name, r, length, c, re=0.0):
    """Cylinder on the X axis; re > 0 rounds both end edges."""
    if re:
        o = ik.rounded_box(name, 2 * r, 2 * r, length, r_plan=r - 0.001, r_edge=re)
    else:
        o = ik.cylinder(name, 2 * r, length, seg=96)
    return xform(o, Matrix.Translation(tuple(c)) @ Matrix.Rotation(math.radians(90), 4, "Y"))


# hinge barrel across the back: a trough cut into the shell, closed underneath by a molded liner,
# so the gaps between the three barrel pieces never show the inside
trough = cyl_x("trough", BARREL_R + 0.6, 2 * (BARREL_HALF + 0.3), D)
safe_cut(bshell, USB_CUT)
safe_cut(bshell, trough, tries=2)
liner = cyl_x("liner", BARREL_R + 0.6 + 2.5, 2 * (BARREL_HALF + 0.3 + 2.5), D)
ik.boolean(liner, cyl_x("lin_i", BARREL_R + 0.6, 2 * (BARREL_HALF + 0.3), D))
ik.boolean(liner, ik.duplicate(bext, "lx"), "INTERSECT")
ik.boolean(bshell, liner, "UNION")

cap_l = cyl_x("Hinge_Cap_L", BARREL_R, BARREL_HALF - KNUCKLE_HALF - SEAM, (-(BARREL_HALF + KNUCKLE_HALF + SEAM) / 2, D.y, D.z), re=3.0)
cap_r = cyl_x("Hinge_Cap_R", BARREL_R, BARREL_HALF - KNUCKLE_HALF - SEAM, ((BARREL_HALF + KNUCKLE_HALF + SEAM) / 2, D.y, D.z), re=3.0)
knuckle = cyl_x("Tilt_Knuckle", BARREL_R, 2 * KNUCKLE_HALF, D, re=3.0)
# five 5° detents read on the right cap: a mint index line on the knuckle, ticks printed on the cap face
idx = ik.box("Print_TiltIndex", 0.2, 1.2, 8.0, center=(KNUCKLE_HALF + 0.05, D.y - BARREL_R + 7.0, D.z))
xform(idx, Matrix.Translation(tuple(D)) @ Matrix.Rotation(math.radians(-TILT), 4, "X") @ Matrix.Translation(tuple(-D)))
axle = cyl_x("Hinge_Axle", 6.0, 2 * BARREL_HALF - 8, D)
# the column cover foot is trimmed to the knuckle surface (0.3 mm gap) so the joint closes visually
for o in (col_up, col_lo):
    ik.boolean(o, cyl_x("kc", BARREL_R + 0.3, 2 * KNUCKLE_HALF + 0.2, D))
ik.boolean(motor, cyl_x("kcm", BARREL_R + 0.3, 2 * KNUCKLE_HALF + 0.2, D))

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
    ik.boolean(keep, ik.box("slotclr", 400, 400, 400, center=(0, 0, BASE_PZ + 25 + 200)))
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

# one USB-C, centred low on the back: a 9.4 × 3.8 slot with the receptacle visible 0.8 mm in

usb = ik.rounded_box("USB_C_Receptacle", 8.34, 2.56, 7.0, r_plan=1.15)
ik.boolean(usb, ik.rounded_box("usb_in", 7.74, 1.96, 6.4, r_plan=0.85, center=(0, 0, -3.5 + 3.2 - 0.01)))
ik.boolean(usb, ik.box("tongue", 6.6, 0.7, 5.0, center=(0, 0, -3.5 + 0.8 + 2.5)), "UNION")
yobj(usb, 0, y_back - 0.8 - 3.5, USB_Z)
usb_pcb = yobj(ik.box("USB_Board", 22, 1.2, 14, center=(0, -1.9, 6.0)), 0, y_back - 0.8 - 3.5, USB_Z)
bshell["io"] = "USB-C (power + data)"

# base internals
ballast = ik.rounded_box("Ballast_Plate", 170, 108, 4, r_plan=10, center=(0, 0, BASE_WALL + 0.3 + 2))
main_pcb = ik.rounded_box("Main_PCB", 150, 96, 1.6, r_plan=6, center=(0, 0, 34))

# ── wordmark on the base sides: reflective pad print, after the Tarmac downtube ────
def wordmark(name, side):
    zb = 50.0

    def to3d(a, b, out):
        z = zb + b
        dz = (z - BASE_PZ) * math.tan(math.radians(BASE_DRAFT))
        a_, b_ = BASE_W / 2 - dz, BASE_D / 2 - dz
        y = a * side
        xw = a_ * max(0.0, 1 - abs(y / b_) ** BASE_N) ** (1 / BASE_N)
        return (side * (xw + out), y, z)
    return wordmark_solid(name, 0.36, to3d)


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
     "Ø28 domed mushroom, 4.8 mm proud of the bezel: the tallest and only red object on the hub.")
part(controls["EStop_Bezel"], M["graphite"], "PC/ABS", "Injection molded", "Thin Ø34 bezel; the cap seats in its Ø28.6 bore.")
for nm in ("Btn_Hazard", "Btn_ExtSpeaker", "Btn_Talk", "Btn_Log", "Btn_Horn", "Btn_Release", "DPad", "Btn_P1", "Btn_P2"):
    part(controls[nm], M["cap"], "PC", "Injection molded, SPI-B1 gloss key cap", "Gloss caps on a textured faceplate read as touch points (Xbox ABXY move).")
part(controls["Btn_Claim"], M["mint_cap"], "PC", "Injection molded, SPI-B1", "The only mint control. Stands 1.2 mm proud; Release sits 0.4 mm recessed.")
part(controls["Stick_Cap"], M["cap"], "PC", "Injection molded + TPE ring", "Concave Ø20 thumb cap. Pan the camera; click to acknowledge.")
part(controls["Stick_Gimbal"], M["dark"], "PA66-GF30", "Purchased (Hall-effect stick module)", "Hall-effect: no drift.")
for side in ("L", "R"):
    part(controls[f"Key_Column_{side}"], M["dark"], "PC/ABS", "Injection molded, snaps into the faceplate",
         "Key carrier: R14 ends on the faceplate's R18 corner centres (4 mm inset); sits 0.6 mm below the faceplate as a thumb well.")
part(trim, M["face"], "PC/ABS", "Injection molded, snap-fit", "Flush rear trim hiding the six shell screws; R14, concentric with the band.")
part(fp_logo, M["print_alloy"], "PC/ABS", "Pad print, metallic", "Text logo in the centre of the faceplate (replaces the horn pad).")
part(haz_print, M["print_red"], "PC", "Pad print", "Hazard triangle legend.")
part(spk_print, M["print_white"], "PC", "Pad print", "Grille-dot legend on the external speaker key.")
for p in paddles:
    part(p, M["alloy_b"], "Al6063", "Stamped + CNC edge, brushed clear anodize", "Hall-effect sensed, 18° travel, magnetic return.")
part(pcb, M["pcb"], "Glass", "FR-4 4-layer", "Hub controller, tact switches, LED driver.")
part(es_block, M["dark"], "PA66-GF30", "Purchased", "E-stop contact block, 2 NC channels, wired directly to the base safety relay.")
part(stick_mod, M["dark"], "PA66-GF30", "Purchased", "Thumbstick module, 2-axis Hall + click.")
part(clock, M["dark"], "PA66-GF30", "Purchased", "Clock spring: ±540° wheel rotation without a twisting harness.")
for o in lra:
    part(o, M["steel"], "SS304", "Purchased", "Linear resonant actuator: alert pulse and link-degradation pattern.")
part(motor, M["steel"], "SS304", "Purchased", "BLDC return-to-centre motor + 14-bit encoder.")
part(col_up, M["graphite"], "PC/ABS", "Injection molded", "Upper column cover.", wall=2.4)
part(col_lo, M["graphite"], "PC/ABS", "Injection molded", "Lower column cover; foot trimmed to the knuckle (0.3 mm gap), cable runs into the knuckle.", wall=2.4)
part(stalk, M["graphite"], "PA66-GF30", "Injection molded", "Turn signals: up = right, down = left, self-cancelling.")

part(bshell, M["carbon"], "PC/ABS", "Injection molded, 1 side action for the USB-C slot", "Satin Carbon. Squircle plan (n=5), R12 top edge, 2.5 mm wall, 1° draft; parting line 16 mm off the desk with a 0.8 × 0.5 shadow reveal. Barrel trough closed by a molded liner.",
     group="base", wall=BASE_WALL)
part(bbot, M["carbon"], "PC/ABS", "Injection molded", "Lip and screw clearance towers.", group="base", wall=BASE_WALL)
part(knuckle, M["graphite"], "Zn-Zamak3", "Zinc die-cast, satin powder coat", "Rotates with the column; friction pack + 5° detents inside. Push the wheel to tilt 15–35°.", group="base")
for c_ in (cap_l, cap_r):
    part(c_, M["carbon"], "PC/ABS", "Injection molded, screwed to the hinge brackets from inside", "Fixed barrel caps; 0.5 mm seam to the knuckle, R3 end edges.", group="base")
part(idx, M["mint_cap"], "PC/ABS", "Pad print", "Tilt index line; read against ticks on the right cap.", group="base")
part(axle, M["steel"], "SS304", "Ground steel shaft", "Hinge axle through caps and knuckle.", group="base")
part(usb, M["steel"], "SS304", "Purchased USB-C receptacle (mid-mount)", "Power + data; 0.8 mm behind the outer surface.", group="base")
part(usb_pcb, M["pcb"], "Glass", "FR-4", "USB-C daughter board, screwed to a boss on the back wall.", group="base")
for f in feet:
    part(f, M["gum"], "TPE", "Molded TPE, Shore 50A, adhesive-backed", "Hides the base screws.", group="base")
part(ballast, M["steel"], "SS304", "Laser-cut 4 mm steel, zinc-plated", "≈640 g low ballast against tipping under steering load.", group="base")
part(main_pcb, M["pcb"], "Glass", "FR-4 6-layer", "Main controller and safety relay.", group="base")
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
ik.dim("Key column pitch", W_((DPAD[0], DPAD[1], ZTOP)), W_((STICK[0], STICK[1], ZTOP)), "front")
ik.dim("Hinge barrel", (-BARREL_HALF, D.y, D.z + BARREL_R), (BARREL_HALF, D.y, D.z + BARREL_R), "top")
ik.dim("Base width", (-BASE_W / 2, -BASE_D / 2, 0), (BASE_W / 2, -BASE_D / 2, 0), "front")
ik.dim("Base depth", (BASE_W / 2, -BASE_D / 2, 0), (BASE_W / 2, BASE_D / 2, 0), "top")
ik.dim("Base height, rear", (BASE_W / 2, BASE_D / 2, 0), (BASE_W / 2, BASE_D / 2, BASE_H_BACK), "right")
ik.dim("Base height, front", (BASE_W / 2, -BASE_D / 2, 0), (BASE_W / 2, -BASE_D / 2, BASE_H_FRONT), "right")
ik.dim("Parting line", (-BASE_W / 2, -BASE_D / 2, 0), (-BASE_W / 2, -BASE_D / 2, BASE_PZ), "front")
ik.dim("Wheel centre height", (0, CEN.y, 0), tuple(CEN), "right")

ax = lambda d: tuple(n_axis * d)  # noqa: E731
EXP = {"Hub_Faceplate": 70, "Print_Faceplate_Wordmark": 75, "Hub_Rear_Trim": -30, "Print_Hazard": 120, "Print_SpeakerDots": 120,
       "Wheel_Front_Shell": 30, "Halo_Guide_Upper": 45, "Halo_Guide_Lower": 45, "Grip_L_Front": 40, "Grip_R_Front": 40,
       "Hub_PCB": 15, "EStop_ContactBlock": 5, "Stick_Module": 10, "Clock_Spring": -10, "Wheel_Rear_Shell": -15,
       "Grip_L_Rear": -30, "Grip_R_Rear": -30, "Paddle_Brake_L": -45, "Paddle_Throttle_R": -45, "Haptic_LRA_L": 0, "Haptic_LRA_R": 0,
       "Column_Cover_Upper": -60, "Column_Cover_Lower": -60, "Steer_Motor": -60, "Stalk_TurnSignal": -60}
for nm in controls:
    EXP[nm] = 100 if nm.startswith("Key_Column") or nm == "Stick_Gimbal" else 115
for nm, d in EXP.items():
    if nm in bpy.data.objects:
        v = Vector(ax(d))
        if "Column" in nm or nm in ("Steer_Motor", "Stalk_TurnSignal"):
            v += Vector((0, 0, 40))
        if nm == "Column_Cover_Upper":
            v += Vector(ax(0)) + Vector((0, 0, 25))
        ik.explode_hint(bpy.data.objects[nm], tuple(v + Vector((0, 0, 60))))
for nm, off in {"Base_Bottom": (0, 0, -70), "Ballast_Plate": (0, 0, -40), "Main_PCB": (0, 0, -15),
                "Hinge_Cap_L": (-45, 0, 25), "Hinge_Cap_R": (45, 0, 25), "Tilt_Knuckle": (0, 0, 25), "Print_TiltIndex": (0, 0, 25),
                "Hinge_Axle": (0, 0, 25), "USB_C_Receptacle": (0, 45, 0), "USB_Board": (0, 30, 0),
                "Wordmark_R": (25, 0, 0), "Wordmark_L": (-25, 0, 0)}.items():
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
    if p_.name.startswith(("Wordmark", "Print_Faceplate")):
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
    big = [f for f in bm.faces if len(f.verts) > 4]
    if big:  # boolean n-gons shade as black slivers under weighted normals: beauty-triangulate them
        bmesh.ops.triangulate(bm, faces=big, quad_method="BEAUTY", ngon_method="BEAUTY")
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
                    "Hinge brackets bolt to the ballast plate through slots in the trough liner; axle, knuckle and caps drop in from above",
                    "Column: motor + cable into lower cover, upper cover closes (2 screws), foot screws to the knuckle; cable passes through the knuckle bore",
                    "Wheel: halo guides + grips are 2K in the shells; hub PCB, clock spring, LRAs into rear shell",
                    "Front shell onto rear shell (lip), 6 × M2.5 from behind; paddles pinned to pivots",
                    "Rear trim snaps over the shell screws",
                    "Keys into the two key-column carriers; carriers, E-stop and caps into the faceplate; faceplate clips on (2 hooks + magnets)"],
                       "drivers": {"wheel_d": 2 * (RIM_R + RIM_A), "tilt_deg": TILT, "wheel_centre_mm": [round(c, 1) for c in CEN],
                                   "base": [BASE_W, BASE_D, BASE_H_FRONT, BASE_H_BACK], "top_slope_deg": round(DECK_DEG, 1)}})
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
    eye = ctr + n_axis * 600
    cam.location = eye
    cam.rotation_euler = (ctr - eye).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 85
    ik.render(os.path.join(OUT, "hub.png"), res=(1600, 1000), samples=48)
if "rear" in want:
    ik.frame(parts, az_deg=148, el_deg=18, fill=1.0)
    ik.render(os.path.join(OUT, "rear.png"), res=(1400, 1050), samples=32)
if "side" in want:
    ik.frame(parts, az_deg=-90, el_deg=6, fill=1.0)
    ik.render(os.path.join(OUT, "side.png"), res=(1400, 1050), samples=32)
if "port" in want:
    tgt = Vector((0, BASE_D / 2, USB_Z + 8))
    cam.location = tgt + Vector((70, 230, 70))
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 85
    ik.render(os.path.join(OUT, "port.png"), res=(1400, 1050), samples=32)
if "exploded" in want:
    saved = {o.name: o.location.copy() for o in parts}
    for nm, off in ik.EXPLODE.items():
        bpy.data.objects[nm].location += Vector(off) * 1.0
    ik.frame(parts, az_deg=-50, el_deg=14, fill=1.0)
    ik.render(os.path.join(OUT, "exploded.png"), res=(1400, 1050), samples=32)
    ik.restore(saved)
if "internals" in want:
    hide = {"Wheel_Front_Shell", "Hub_Faceplate", "Base_Shell", "Column_Cover_Upper", "Grip_L_Front", "Grip_R_Front",
            "Wordmark_R", "Wordmark_L", "Halo_Guide_Upper", "Halo_Guide_Lower", "Hinge_Cap_L", "Hinge_Cap_R", "Tilt_Knuckle"} | set(controls)
    hide |= {"Print_Hazard", "Print_SpeakerDots", "Print_Faceplate_Wordmark", "Print_TiltIndex"}
    for o in parts:
        o.hide_render = o.name in hide
    ik.frame([o for o in parts if not o.hide_render], az_deg=-38, el_deg=22, fill=1.0)
    ik.render(os.path.join(OUT, "internals.png"), res=(1400, 1050), samples=32)
    for o in parts:
        o.hide_render = False
ik.done()
