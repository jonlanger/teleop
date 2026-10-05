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
import fillet_lib  # noqa: E402

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
# the wheel (rim + two spoke stubs) and the control pod are separate parts: the pod floats inside the rim, so its
# R24 corners stay visible and the R24 → R18 → R14 → R11 family is concentric; only the spoke stubs meet the rim
POD_W, POD_H, POD_T = 196.0, 100.0, 32.0   # control pod; corners clear the rim's inner face by ≥ 7 mm
POD_R, POD_RE = 24.0, 8.0                   # plan corner (the family's outer radius), edge round
SPOKE_H, SPOKE_T, SPOKE_RS = 28.0, 14.0, 6.0   # spoke stub section (y × z) and its corner radius; centred on the parting plane
SPOKE_X0 = 84.0          # stubs start inside the pod at |x| = 84 and run out into the rim
SPOKE_F, SPOKE_F_IN = 8.0, 7.0   # rolling-ball fillet stub → rim: outside, and the cavity (wall 2.8 → ≈3.9 at the throat;
                                 # R8 + wall would need a ball bigger than the 8.4 mm inner stub)
FP_INSET, FP_T = 6.0, 2.5                        # faceplate: uniform inset from the pod → concentric corners
FP_W, FP_H, FP_R = POD_W - 2 * FP_INSET, POD_H - 2 * FP_INSET, POD_R - FP_INSET   # 184 × 88, R18
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
BARREL_R, BARREL_Y = 30.0, 46.0                       # hinge barrel radius, axis y
BARREL_CLEAR = 1.0                                      # barrel floats 1 mm above the (sloped) top surface
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


def ellipse_prof(a, b, m=32, cx=0.0, cz=0.0, phase=0.5):
    """Ellipse section; the half-step phase keeps vertices off z = 0 so the shell split never runs along an edge ring."""
    return [(cx + a * math.cos(2 * math.pi * (j + phase) / m), cz + b * math.sin(2 * math.pi * (j + phase) / m)) for j in range(m)]


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


def safe_bool(target, tool, op="DIFFERENCE", tries=5):
    """EXACT boolean with a volume sanity check (a cut removes at most the tool's volume, a union adds at most it);
    on failure nudge the tool and retry, last try with the FAST solver."""
    v0, vt = ik.volume_cm3(target), ik.volume_cm3(tool)
    lo, hi = (v0 - vt - 0.05, v0 + 0.05) if op == "DIFFERENCE" else (v0 - 0.05, v0 + vt + 0.05)
    for i in range(tries):
        t = ik.duplicate(target, target.name + "_try")
        c = ik.duplicate(tool, "tool_try")
        if 0 < i < tries - 1:
            xform(c, Matrix.Translation((0.013 * i, 0.007 * i, 0.011 * i)) @ Matrix.Scale(1 + 0.0007 * i, 4))
        ik.boolean(t, c, op, solver="FAST" if i == tries - 1 else "EXACT")
        v = ik.volume_cm3(t)
        if lo <= v <= hi:
            target.data, old = t.data, target.data
            ik.delete(t, tool)
            return target
        ik.delete(t)
    print(f"safe_bool {op}: no clean result for {target.name}; skipped", flush=True)
    ik.delete(tool)
    return target


def safe_cut(target, cutter, tries=5):
    return safe_bool(target, cutter, "DIFFERENCE", tries)


def ring_solid(name, d_out, d_in, h, center):
    o = ik.cylinder(name, d_out, h, center=center)
    return ik.boolean(o, ik.cylinder("ri", d_in, h + 2, center=center))


# ── wordmark strokes (brand/strokes.json → thin solids for prints) ──────────────
FONT = os.path.join(HERE, "..", "brand", "fonts", "Archivo-ExpandedExtraBoldItalic.ttf")


def wordmark_flat(name, width, th):
    """'teleop' in Archivo Expanded ExtraBold Italic (display-xl), flat in XY, centred, `width` mm wide,
    solid from z = -0.1 (keyed into the surface) to z = th."""
    cu = bpy.data.curves.new(name + "_txt", "FONT")
    cu.body = "teleop"
    cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    cu.space_character = 0.97          # ≈ -0.02 em tracking, as in the design system
    cu.align_x, cu.align_y = "CENTER", "CENTER"
    cu.resolution_u = 6
    cu.extrude = (th + 0.1) / 2
    tob = bpy.data.objects.new(name + "_txt", cu)
    bpy.context.scene.collection.objects.link(tob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tob.evaluated_get(dg))
    bpy.data.objects.remove(tob, do_unlink=True)
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    k = width / (max(xs) - min(xs))
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    for v in me.vertices:
        v.co.x, v.co.y = (v.co.x - cx) * k, (v.co.y - cy) * k
        v.co.z = v.co.z + (th + 0.1) / 2 - 0.1
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return ik._link(bpy.data.objects.new(name, me))


def clamshell2(solid, parting_z, wall=2.0, lip_h=None, clearance=0.08, reveal=None, names=("Top", "Bottom")):
    """idkit.clamshell, but the lip's inner face sits 0.3 mm inside the cavity instead of on the wall's inner
    face; the coplanar version leaves a ring of non-manifold edges along the lip top."""
    lip_h = lip_h or 1.2 * wall
    ext_ = solid
    inner_ = ik.offset_solid(ext_, -wall, "inner")
    lip_in = ik.offset_solid(ext_, -(wall + 0.3), "lip_in")
    half_out = ik.offset_solid(ext_, -(wall / 2 + clearance / 2), "half_out")
    half_in = ik.offset_solid(ext_, -(wall / 2 - clearance / 2), "half_in")
    deep = ik.offset_solid(ext_, -(wall + 0.8), "deep")
    shell_ = ik.duplicate(ext_, "shell")
    ik.boolean(shell_, inner_, keep_cutter=True)
    top_ = ik.duplicate(shell_, names[0])
    bot_ = ik.duplicate(shell_, names[1])
    ik.delete(shell_)
    ik.clip_z(top_, parting_z, 1e5)
    ik.clip_z(bot_, -1e5, parting_z)
    lip_ = ik.duplicate(half_out, "lip")
    ik.boolean(lip_, lip_in)
    ik.clip_z(lip_, parting_z - 0.6, parting_z + lip_h)
    safe_bool(bot_, lip_, "UNION")
    step_ = ik.duplicate(half_in, "step")
    ik.boolean(step_, deep)
    ik.clip_z(step_, parting_z - 0.5, parting_z + lip_h + clearance)
    safe_bool(top_, step_)
    if reveal:
        w_, dpt = reveal
        band_ = ik.duplicate(ext_, "rev")
        ik.boolean(band_, ik.offset_solid(ext_, -dpt, "rev_in"))
        ik.clip_z(band_, parting_z - w_ / 2, parting_z + w_ / 2)
        safe_bool(top_, ik.duplicate(band_, "rev_t"))
        safe_bool(bot_, band_)
    ik.delete(inner_, half_out, half_in)
    for o in (top_, bot_):
        ik.smooth(o)
        o["process"] = "Injection molded"
        o["wall_mm"] = wall
    return top_, bot_


def clean_clamshell(make, pz, wall, names, variants, **kw):
    """Try clamshell variants (small radius / lip changes) and keep the first whose halves are both manifold."""
    best = None
    for v in variants:
        e = make(v)
        t, b_ = clamshell2(e, parting_z=pz, wall=wall, names=names, **{**kw, **v.get("cs", {})})
        bad = nonmanifold(t) + nonmanifold(b_)
        if best is None or bad < best[0]:
            if best:
                ik.delete(*best[1:])
            best = (bad, e, t, b_, v)
        else:
            ik.delete(e, t, b_)
        if bad == 0:
            break
    print("clamshell", names[0], "variant", best[4], "open edges", best[0], flush=True)
    for o, n_ in zip(best[2:4], names):
        o.name = n_
    return best[1], best[2], best[3]


# ══════════════════════════════════════════════════════════════════════════════
# 1. WHEEL (local frame)
# ══════════════════════════════════════════════════════════════════════════════
def pod_box(name, inset=0.0):
    """Control pod solid, offset by `inset` on every face (plan and depth) so walls stay uniform."""
    return ik.rounded_box(name, POD_W - 2 * inset, POD_H - 2 * inset, POD_T - 2 * inset, r_plan=max(1.0, POD_R - inset),
                          r_edge=max(0.5, POD_RE - inset), center=(0, 0, 0))


def spoke_solid(name, inset=0.0, x0=SPOKE_X0, x1=RIM_R, m=8):
    """Both spoke stubs: a rounded-rectangle section SPOKE_H × SPOKE_T (R SPOKE_RS) running from |x| = x0 out to the
    rim centreline (buried in the rim). `inset` offsets every face inward; negative grows it."""
    hy, hz, rs = SPOKE_H / 2 - inset, SPOKE_T / 2 - inset, max(0.5, SPOKE_RS - inset)
    sec = []
    for cy, cz, a0 in ((hy - rs, hz - rs, 0), (rs - hy, hz - rs, 90), (rs - hy, rs - hz, 180), (hy - rs, rs - hz, 270)):
        sec += [(cy + rs * math.cos(math.radians(a0 + 90 * j / m)), cz + rs * math.sin(math.radians(a0 + 90 * j / m))) for j in range(m + 1)]
    bm = bmesh.new()
    n = len(sec)
    for sx in (1, -1):
        r0, r1 = ([bm.verts.new((sx * x, y, z)) for y, z in sec] for x in (x0 + inset, x1))
        for j in range(n):
            k = (j + 1) % n
            bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
        bm.faces.new(r0)
        bm.faces.new(r1[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ik.smooth(ik._obj_from_bm(name, bm))


def nonmanifold(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    n = sum(1 for e in bm.edges if not e.is_manifold)
    bm.free()
    return n


def wheel_body(name, inset, r):
    """Rim torus ∪ spoke stubs, with a rolling-ball fillet of radius r where each stub meets the rim; offset by `inset`."""
    a, b = RIM_A - inset, RIM_B - inset
    body = torus(name, a, b)
    ref = spoke_solid(name + "_spoke", inset)
    ik.boolean(body, ik.duplicate(ref, "sdup"), "UNION")
    dg = bpy.context.evaluated_depsgraph_get()
    for side in (1, -1):
        bm, err = fillet_lib.fillet_ring(ref, RIM_R, a, b, r, side, depsgraph=dg, x_min=SPOKE_X0 + 6.0, x_max=RIM_R - 2.0)
        if bm is None:
            print("fillet ring failed", name, side, err, flush=True)
            continue
        ring = ik._obj_from_bm("fillet_ring", bm)
        m = body.modifiers.new("fr", "BOOLEAN")
        m.operation, m.solver, m.object, m.use_self = "UNION", "EXACT", ring, True
        ik.apply_mods(body)
        ik.delete(ring)
    ik.delete(ref)
    return body


# wheel: rim + stubs, one ring split front / rear at z = 0
ext = wheel_body("wheel_ext", 0.0, SPOKE_F)
inner = wheel_body("wheel_in", WALL_W, SPOKE_F_IN)
print("wheel junction: ext", nonmanifold(ext), "inner", nonmanifold(inner), flush=True)
ik.boolean(ext, inner)

# lip on the rear shell, step in the front shell; built from the same filleted offsets so they follow the junction
LIP_H = 3.2
lip = wheel_body("lip_o", WALL_W / 2 - 0.04, SPOKE_F)
ik.boolean(lip, wheel_body("lip_cav", WALL_W + 0.3, SPOKE_F_IN))   # 0.3 proud of the inner wall: no coplanar faces
ik.clip_z(lip, -0.6, LIP_H)
step = wheel_body("step_o", WALL_W / 2 + 0.04, SPOKE_F)
ik.boolean(step, wheel_body("step_i", WALL_W + 0.5, SPOKE_F_IN))
ik.clip_z(step, -0.5, LIP_H + 0.08)

wf = ik.duplicate(ext, "Wheel_Front_Shell")
wr = ik.duplicate(ext, "Wheel_Rear_Shell")
ik.delete(ext)
ik.clip_z(wf, 0, 1e4)
ik.clip_z(wr, -1e4, 0)
safe_bool(wr, lip, "UNION")
safe_bool(wf, step)
print("wheel shells: front", nonmanifold(wf), "rear", nonmanifold(wr), flush=True)

# control pod: its own clamshell, slotted 0.3 mm round the stubs where they pass through its side walls
pod_ext, front, rear = clean_clamshell(lambda v: pod_box("pod_ext", v.get("d", 0.0)), 0.0, WALL_W,
                                       ("Pod_Front_Shell", "Pod_Rear_Shell"), [{}, {"d": 0.002}])
ik.delete(pod_ext)
for sh_ in (front, rear):
    safe_cut(sh_, spoke_solid("pod_slot", -0.3, x0=SPOKE_X0 + 4.0))

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
    for shell in (wf, wr):
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

# halo light guide: two arcs on the rim's inner front face, clear of the spokes and grips
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
    ik.boolean(wf, sweep("hc", halo_prof(3.0 + 2 * 0.08, 1.0, WALL_W + 1.0), a0 - 0.5, a1 + 0.5))
    halos.append(sweep(nm, halo_prof(3.0, 0.25, WALL_W + 0.8), a0, a1))

# faceplate: opening in the pod front shell, removable cover (magnet + 2 hooks), Xbox-style
FP_Z1 = POD_T / 2
FP_Z0 = FP_Z1 - FP_T
ik.boolean(front, ik.rounded_box("fpo", FP_W + 2 * GAP, FP_H + 2 * GAP, 20, r_plan=FP_R + GAP, center=(0, 0, FP_Z1 + 6)))
face = ik.rounded_box("Hub_Faceplate", FP_W, FP_H, FP_T + 0.3, r_plan=FP_R, r_edge=1.0, center=(0, 0, FP_Z0 + (FP_T + 0.3) / 2))

# ledge inside the pod front shell the faceplate seats on
ledge = ik.rounded_box("ledge", FP_W + 30, FP_H + 30, 1.6, r_plan=FP_R + 15, center=(0, 0, FP_Z0 - 0.8 - 0.05))
ik.boolean(ledge, ik.rounded_box("ledge_i", FP_W - 8, FP_H - 8, 4, r_plan=FP_R - 4, center=(0, 0, FP_Z0 - 0.8)))
ik.boolean(ledge, pod_box("ledge_k", 0.4), "INTERSECT")
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
for nm, xy, n in (("Btn_P1", (-48.0, -32.0), 1), ("Btn_P2", (48.0, -32.0), 2)):
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
fp_logo = xform(wordmark_flat("Print_Faceplate_Wordmark", 46.0, 0.12), Matrix.Translation((0, -18.0, ZTOP)))
spk_print = ik.join("Print_SpeakerDots", [ik.cylinder("sd", 1.3, 0.2, center=(DPAD[0] + dx, spk_y, ZTOP + 0.8 + 0.05), seg=12) for dx in (-4, 0, 4)])

# ── behind the wheel ──────────────────────────────────────────────────────────
ZB = -POD_T / 2
boss = ik.rounded_box("shaft_boss", 44, 44, 15.0, r_plan=21.999, r_edge=1.5, center=(0, 0, ZB - 7.5 + 0.3))
ik.boolean(rear, boss, "UNION")     # closed: the splined shaft threads in from inside the hub
# rear cover: the faceplate's twin on the back (184 × 88 R18, concentric with the pod), flush in a 1.0 mm pocket,
# with clearances for the shaft boss and both paddle pivots; it snaps on and hides the four hub screws
PIVOTS = [(sx * 64.0, -2.0) for sx in (-1, 1)]
pocket = ik.rounded_box("rcp", FP_W + 2 * GAP, FP_H + 2 * GAP, 2.0, r_plan=FP_R + GAP, center=(0, 0, ZB))
ik.boolean(pocket, ik.cylinder("rcb", 44.4, 30, center=(0, 0, ZB)))
for px_, py_ in PIVOTS:
    ik.boolean(pocket, ik.rounded_box("rcpv", 14.4, 26.4, 30, r_plan=4.2, center=(px_, py_, ZB)))
safe_bool(rear, pocket)
trim = ik.rounded_box("Hub_Rear_Cover", FP_W, FP_H, 1.0, r_plan=FP_R, r_edge=0.4, center=(0, 0, ZB + 0.5))
ik.boolean(trim, ik.cylinder("rch", 46.0, 30, center=(0, 0, ZB)))
for px_, py_ in PIVOTS:
    ik.boolean(trim, ik.rounded_box("rchp", 15.0, 27.0, 30, r_plan=4.5, center=(px_, py_, ZB)))

# pod fasteners: 4 × M2.5 thread-forming from behind (under the rear cover) into pilot bosses that hang
# from the faceplate ledge, clear of the key columns and the E-stop. The two side screws pass through the
# spoke stubs and clamp them between the pod halves: that is the whole wheel-to-pod joint.
HUB_SCREWS = [(-90.0, 0.0), (90.0, 0.0), (0.0, 43.5), (0.0, -43.5)]
screws = []


def screw(name, top, axis_dir, length, d=2.5, head_d=4.6, head_h=1.6):
    """Pan-head screw: head at `top`, shank running along axis_dir (unit Vector)."""
    sh = ik.cylinder("sh", d, length, center=(0, 0, -length / 2))
    hd = ik.rounded_box("hd", head_d, head_d, head_h, r_plan=head_d / 2 - 1e-3, r_edge=0.6, center=(0, 0, head_h / 2))
    ik.boolean(hd, ik.box("drv", head_d * 0.5, 0.7, 2.0, center=(0, 0, head_h)))        # drive slot
    o = ik.join(name, [sh, hd])
    q = Vector((0, 0, -1)).rotation_difference(Vector(axis_dir))
    return xform(o, Matrix.Translation(tuple(top)) @ q.to_matrix().to_4x4())


for i, (x, y) in enumerate(HUB_SCREWS):
    on_spoke = abs(x) > SPOKE_X0
    z_tw, z_pb = (-SPOKE_T / 2 - 0.15, SPOKE_T / 2 + 0.15) if on_spoke else (-0.2, 0.2)   # tower top, pilot-boss bottom
    if on_spoke:      # Ø6.4 tube through the hollow stub, split with the wheel shells
        for sh_, z0, z1 in ((wf, 0.05, SPOKE_T / 2 - 0.1), (wr, -SPOKE_T / 2 + 0.1, -0.05)):   # runs into the wall, 0.1 apart at the split
            safe_bool(sh_, ring_solid("stw", 6.4, 2.8, z1 - z0, (x, y, (z0 + z1) / 2)), "UNION")
            safe_cut(sh_, ik.cylinder("stc", 2.8, 30, center=(x, y, 0)))
    tw = ring_solid("htw", 6.0, 2.8, z_tw - (ZB + WALL_W) + 0.3, (x, y, ((ZB + WALL_W) + z_tw) / 2 - 0.15))
    safe_bool(rear, tw, "UNION")
    safe_bool(rear, ik.cylinder("hcb", 5.2, 2.4, center=(x, y, ZB + 0.5 + 1.2)))         # counterbore (starts in the pocket's air): head sits under the cover
    safe_bool(rear, ik.cylinder("hcl", 2.8, 6.0, center=(x, y, ZB + 2.0)))
    pb = ring_solid("hpb", 5.6, 2.0, (FP_Z0 - 1.65) - z_pb + 0.3, (x, y, ((FP_Z0 - 1.65) + z_pb) / 2 + 0.15))
    safe_bool(front, pb, "UNION")
    screws.append(screw(f"Screw_Hub_{i + 1}", (x, y, ZB + 2.7), (0, 0, 1), 24.0 if on_spoke else 22.0))
    lst = json.loads(rear.get("fasteners", "[]"))
    lst.append({"xy": [x, y], "screw": f"M2.5 × {24 if on_spoke else 22} thread-forming",
                "feature": "Ø6 tower → " + ("Ø6.4 tube through the spoke stub → " if on_spoke else "") + "Ø5.6 pilot boss on the faceplate ledge",
                "boss_od": 5.6, "pilot": 2.0})
    rear["fasteners"] = json.dumps(lst)

# faceplate retention: 2 hooks on the top edge + 4 Ø4 × 2 magnets over steel strikes on the ledge
magnets = []
for i, (x, y) in enumerate([(sx * 40.0, sy * 41.5) for sx in (-1, 1) for sy in (-1, 1)]):
    safe_bool(face, ik.cylinder("mgp", 4.2, 2.2, center=(x, y, FP_Z0 + 1.0)))
    magnets.append(ik.cylinder(f"Magnet_{i + 1}", 4.0, 2.0, center=(x, y, FP_Z0 + 1.0)))
    magnets.append(ik.cylinder(f"Strike_{i + 1}", 6.0, 0.6, center=(x, y, FP_Z0 - 0.35)))
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
PCB_Z = FP_Z0 - 5.0                                   # 0.7 mm over the spoke stubs
pcb = ik.rounded_box("Hub_PCB", 180, 80, 1.6, r_plan=20, center=(0, 0, PCB_Z))
ik.boolean(pcb, ik.cylinder("eh", 33, 10, center=(ES[0], ES[1], PCB_Z)))
ik.boolean(pcb, ik.box("smh", 24, 24, 10, center=(STICK[0], STICK[1], PCB_Z)))
es_block = ik.rounded_box("EStop_ContactBlock", 22, 22, 10, r_plan=3, r_edge=0.5, center=(ES[0], ES[1], FP_Z0 - 9.3))
stick_mod = ik.rounded_box("Stick_Module", 22, 22, 9, r_plan=2, r_edge=0.5, center=(STICK[0], STICK[1], FP_Z0 - 5 - 4.5))
clock = ring_solid("Clock_Spring", 40, 20, 7.0, (0, 0, ZB + WALL_W + 3.6))
lra = [ik.cylinder(f"Haptic_LRA_{s}", 10, 3.6, center=(RIM_R * math.cos(math.radians(a)), RIM_R * math.sin(math.radians(a)), 0))
       for s, a in (("L", 152), ("R", 28))]

# ── column (fixed: tilts with the wheel, does not steer) ──────────────────────
COL_Z0, COL_Z1 = ZB - 15.0 - 0.6, -COL_LEN + 8.0     # foot ends inside the knuckle, trimmed to it below
col_len = COL_Z0 - COL_Z1
col_ext, col_up, col_lo = clean_clamshell(
    lambda v: ik.rounded_box("col_ext", 60, col_len, 52, r_plan=v["rp"], r_edge=v["re"], draft_deg=0.5, parting_z=0),
    0.0, 2.4, ("Column_Cover_Upper", "Column_Cover_Lower"),
    [{"rp": 16, "re": 12}, {"rp": 17, "re": 12}],
    reveal=(0.6, 0.4))
COLM = Matrix.Translation((0, 0, (COL_Z0 + COL_Z1) / 2)) @ Matrix.Rotation(math.radians(-90), 4, "X")
for o in (col_up, col_lo):
    xform(o, COLM)
col_clear = xform(ik.rounded_box("col_clr", 60.6, col_len, 52.6, r_plan=16.3, r_edge=12.3), COLM)
xform(col_ext, COLM)

motor = ik.cylinder("Steer_Motor", 40, 50, center=(0, 0, COL_Z0 - 8 - 25))
ik.delete(col_ext)

# ══════════════════════════════════════════════════════════════════════════════
# 2. place the wheel assembly
# ══════════════════════════════════════════════════════════════════════════════
n_axis = Vector((0, -math.cos(math.radians(TILT)), math.sin(math.radians(TILT))))   # local +Z in world
D = Vector((0, BARREL_Y, top_z(BARREL_Y) + (BARREL_R + BARREL_CLEAR) / math.cos(math.atan(K_SLOPE))))   # hinge barrel axis
CEN = D + COL_LEN * n_axis
WM = Matrix.Translation(CEN) @ Matrix.Rotation(math.radians(90 - TILT), 4, "X")

wheel_parts = ([wf, wr, front, rear, face, trim, haz_print, spk_print, pcb, es_block, stick_mod, clock, motor] + screws + magnets + [
                col_up, col_lo, col_clear, fp_logo] + grip_cut + halos + paddles + lra + list(controls.values()))
for o in wheel_parts:
    xform(o, WM)

# ══════════════════════════════════════════════════════════════════════════════
# 3. BASE (world frame)
# ══════════════════════════════════════════════════════════════════════════════
bext = ik.rounded_box("base_ext", BASE_W, BASE_D, H_MID, plan="squircle", n=BASE_N, r_edge=BASE_RT, r_edge_bottom=BASE_RB,
                      center=(0, 0, H_MID / 2), draft_deg=BASE_DRAFT, parting_z=BASE_PZ)
shear(bext, K_SLOPE, z_above=BASE_PZ + 1)
SRC_BASE = ik.smooth(ik.duplicate(bext, "_src_base_normals"))
_bext_src = bext
bext, bshell, bbot = clean_clamshell(
    lambda v: ik.duplicate(_bext_src, "bext_try"), BASE_PZ, BASE_WALL, ("Base_Shell", "Base_Bottom"),
    [{"cs": {"lip_h": 3.0, "clearance": 0.08}}, {"cs": {"lip_h": 2.8, "clearance": 0.1}}],
    reveal=(0.8, 0.5))
ik.delete(_bext_src)

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


# hinge barrel across the back. The base top stays one unbroken surface: the barrel floats 1 mm above it,
# and each fixed cap stands on a saddle foot (screwed from inside the base). Nothing is cut into the shell.
safe_cut(bshell, USB_CUT)


def saddle(xc):
    """Foot under a fixed cap: R8 plan, bottom sheared onto the sloped top, top buried in the cap."""
    z0 = top_z(D.y)
    f = ik.rounded_box("saddle", 30, 26, D.z - z0, r_plan=8, r_edge=0.0, center=(xc, D.y, (z0 + D.z) / 2))
    for v in f.data.vertices:
        if v.co.z < (z0 + D.z) / 2:
            v.co.z += K_SLOPE * (v.co.y - D.y)
    f.data.update()
    return f


CAPX = (BARREL_HALF + KNUCKLE_HALF + SEAM) / 2
cap_l = cyl_x("Hinge_Cap_L", BARREL_R, BARREL_HALF - KNUCKLE_HALF - SEAM, (-CAPX, D.y, D.z), re=3.0)
cap_r = cyl_x("Hinge_Cap_R", BARREL_R, BARREL_HALF - KNUCKLE_HALF - SEAM, (CAPX, D.y, D.z), re=3.0)
ik.boolean(cap_l, saddle(-CAPX), "UNION")
ik.boolean(cap_r, saddle(CAPX), "UNION")
knuckle = cyl_x("Tilt_Knuckle", BARREL_R, 2 * KNUCKLE_HALF, D, re=3.0)
# five 5° detents read on the right cap: a mint index line on the knuckle, ticks printed on the cap face
idx = ik.box("Print_TiltIndex", 0.2, 1.2, 8.0, center=(KNUCKLE_HALF + 0.05, D.y - BARREL_R + 7.0, D.z))
xform(idx, Matrix.Translation(tuple(D)) @ Matrix.Rotation(math.radians(-TILT), 4, "X") @ Matrix.Translation(tuple(-D)))
axle = cyl_x("Hinge_Axle", 6.0, 2 * BARREL_HALF - 8, D)
# friction + detent: each cap carries a wave-washer friction pack (≈2.5 N·m each, 5 N·m total) in a Ø44 pocket
# facing the knuckle; the knuckle ends carry detent rings with 5 notches (15/20/25/30/35°) and a stop pin that
# rides in a 20° slot, so tilt is limited to 15–35° by hard stops
hinge_parts = []
for sx, nm in ((-1, "L"), (1, "R")):
    xin = sx * (KNUCKLE_HALF + SEAM)
    safe_bool(cap_l if sx < 0 else cap_r, cyl_x("fpk", 22.0, 20.0, (xin + sx * 0.0, D.y, D.z)))
    hinge_parts.append(cyl_x(f"Hinge_Friction_Pack_{nm}", 21.6, 9.4, (xin + sx * 4.8, D.y, D.z)))
    safe_bool(knuckle, cyl_x("dtp", 20.6, 3.2, (sx * KNUCKLE_HALF, D.y, D.z)))
    hinge_parts.append(cyl_x(f"Hinge_Detent_Ring_{nm}", 20.4, 1.5, (sx * (KNUCKLE_HALF - 0.8), D.y, D.z)))
pin = ik.cylinder("Hinge_Stop_Pin", 4.0, 14.0, center=(0, 0, 0))
hinge_parts.append(xform(pin, Matrix.Translation((KNUCKLE_HALF - 6.0, D.y, D.z - 18.0))))
cap_screws = []
for cx_ in (-CAPX, CAPX):
    for dx in (-8.0, 8.0):
        zt = top_z(D.y) - BASE_WALL - 0.2
        cap_screws.append(screw(f"Screw_Cap_{'L' if cx_ < 0 else 'R'}{'a' if dx < 0 else 'b'}", (cx_ + dx, D.y, zt), (0, 0, 1), 10.0, d=3.0, head_d=5.5, head_h=2.0))
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
    safe_bool(bshell, tb, "UNION")
    safe_bool(bbot, ik.cylinder("clr", 3.3, 60, center=(x, y, 0)))
    tw = ring_solid("tw", 8.4, 3.3, BASE_PZ - BASE_WALL + 0.2, (x, y, BASE_WALL + (BASE_PZ - BASE_WALL) / 2 - 0.05))
    safe_bool(bbot, tw, "UNION")
    feet.append(ik.foot(bbot, (x, y), d=16, h=1.6, recess=0.8, name=f"Foot_{i + 1}"))
    cap_screws.append(screw(f"Screw_Base_{i + 1}", (x, y, 0.9), (0, 0, 1), 18.0, d=3.0, head_d=5.5, head_h=2.0))
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
    """Base side print: the flat wordmark wrapped onto the drafted squircle side wall."""
    o = wordmark_flat(name, 96.0, 0.22)
    zc = 60.0
    for v in o.data.vertices:
        a, b, out = v.co.x, v.co.y, v.co.z
        z = zc + b
        dz = (z - BASE_PZ) * math.tan(math.radians(BASE_DRAFT))
        a_, b_ = BASE_W / 2 - dz, BASE_D / 2 - dz
        y = a * side
        xw = a_ * max(0.0, 1 - abs(y / b_) ** BASE_N) ** (1 / BASE_N)
        v.co = Vector((side * (xw + out), y, z))
    o.data.update()
    if side < 0:     # mirrored placement flips winding
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(o.data)
        bm.free()
    return o


wm_r = wordmark("Wordmark_R", 1)
wm_l = wordmark("Wordmark_L", -1)

# ══════════════════════════════════════════════════════════════════════════════
# 4. CMF
# ══════════════════════════════════════════════════════════════════════════════
def mat_dots(name, color_hex, pitch=1.0):
    """Soft-touch TPE with a raised micro-dot field (Xbox grip texture): voronoi cells → dots."""
    m = ik.mat_softtouch(name, color_hex)
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    for n_ in [n_ for n_ in nt.nodes if n_.type in ("BUMP", "TEX_NOISE", "TEX_COORD")]:
        nt.nodes.remove(n_)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = 1.0 / pitch
    vor.inputs["Randomness"].default_value = 0.0
    nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value, ramp.inputs["From Max"].default_value = 0.18, 0.26
    ramp.inputs["To Min"].default_value, ramp.inputs["To Max"].default_value = 1.0, 0.0
    nt.links.new(vor.outputs["Distance"], ramp.inputs["Value"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.15
    nt.links.new(ramp.outputs["Result"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    m["cmf"] = f"TPE {color_hex}, micro-dot texture {pitch} mm pitch"
    return m


M = {
    "carbon": ik.mat_plastic("Satin Carbon PC/ABS MT-11010", C_["carbon"], "MT-11010", coat=0.08),
    "graphite": ik.mat_plastic("Graphite PC/ABS MT-11000", C_["graphite"], "MT-11000"),
    "face": ik.mat_plastic("Faceplate Graphite PC/ABS VDI-27", C_["faceplate"], "VDI-27"),
    "cap": ik.mat_plastic("Key cap Carbon PC SPI-B1", C_["cap"], "SPI-B1", coat=0.3),
    "deck": ik.mat_softtouch("Deck Graphite soft-touch", C_["graphite"]),
    "gum": mat_dots("Gum TPE 2K micro-dot", C_["gum"], pitch=1.1),
    "stick": mat_dots("Stick cap TPE micro-dot", C_["cap"], pitch=0.7),
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

part(wf, M["carbon"], "PC/ABS", "Injection molded, 2-plate tool",
     "A-surface. Rim + two spoke stubs in one ring; R8 rolling-ball fillet stub → rim. 2.8 mm wall, release about the mid-plane. "
     "Halo groove on the inner front face; TPE grip substrate recessed 1.2 mm.", wall=WALL_W)
part(wr, M["carbon"], "PC/ABS", "Injection molded",
     "Carries the 3.2 mm lip and the Ø6.4 screw tubes through the stubs; LRAs sit in the rim.", wall=WALL_W)
part(front, M["carbon"], "PC/ABS", "Injection molded, 2-plate tool",
     "Control pod front: 196 × 100 × 32, R24 plan / R8 edges, concentric with the faceplate. Faceplate ledge and pilot bosses; "
     "0.3 mm slots where the spoke stubs pass through the side walls.", wall=WALL_W)
part(rear, M["carbon"], "PC/ABS", "Injection molded",
     "Control pod rear: lip, splined shaft boss, paddle pivots, 4 screw towers (two clamp the stubs), rear-cover pocket.", wall=WALL_W)
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
part(controls["Stick_Cap"], M["stick"], "TPE", "TPE over a PC core", "Concave Ø16 thumb cap with micro-dot texture. Pan the camera; click to acknowledge.")
part(controls["Stick_Gimbal"], M["dark"], "PA66-GF30", "Purchased (Hall-effect stick module)", "Hall-effect: no drift.")
for side in ("L", "R"):
    part(controls[f"Key_Column_{side}"], M["dark"], "PC/ABS", "Injection molded, snaps into the faceplate",
         "Key carrier: R14 ends on the faceplate's R18 corner centres (4 mm inset); sits 0.6 mm below the faceplate as a thumb well.")
part(trim, M["face"], "PC/ABS", "Injection molded, 6 snap hooks", "Rear cover: the faceplate's twin (184 × 88 R18), flush in a 1.0 mm pocket; hides the four hub screws.", wall=1.0)
for o in screws + cap_screws:
    part(o, M["steel"], "SS304", "Purchased, zinc-nickel black", "Thread-forming screw (PT-style); pilot sizes per the screw supplier's table.", group="base" if "Base" in o.name or "Cap" in o.name else "wheel")
for o in magnets:
    part(o, M["steel"], "Zn-Zamak3" if "Strike" in o.name else "SS304", "Purchased", "Faceplate retention: N42 magnet over a steel strike on the ledge.")
for o in hinge_parts:
    part(o, M["steel"], "SS304", "Purchased / machined", "Hinge internals: wave-washer friction pack, 5-notch detent ring, 20° stop pin.", group="base")
part(fp_logo, M["print_white"], "PC/ABS", "Pad print, Robot White", "Text logo in the centre of the faceplate (replaces the horn pad).")
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

part(bshell, M["carbon"], "PC/ABS", "Injection molded, 1 side action for the USB-C slot", "Satin Carbon. Squircle plan (n=5), R12 top edge, 2.5 mm wall, 1° draft; parting line 16 mm off the desk with a 0.8 × 0.5 shadow reveal. The top is one unbroken surface; the hinge barrel stands on it.",
     group="base", wall=BASE_WALL)
part(bbot, M["carbon"], "PC/ABS", "Injection molded", "Lip and screw clearance towers.", group="base", wall=BASE_WALL)
part(knuckle, M["graphite"], "Zn-Zamak3", "Zinc die-cast, satin powder coat", "Rotates with the column; friction pack + 5° detents inside. Push the wheel to tilt 15–35°.", group="base")
for c_ in (cap_l, cap_r):
    part(c_, M["carbon"], "PC/ABS", "Injection molded with a saddle foot; 2 × M3 from inside the base", "Fixed barrel cap on a R8 saddle foot; 0.5 mm seam to the knuckle, R3 end edges. The axle cable passes through the right foot.", group="base")
part(idx, M["mint_cap"], "PC/ABS", "Pad print", "Tilt index line; read against ticks on the right cap.", group="base")
part(axle, M["steel"], "SS304", "Ground steel shaft", "Hinge axle through caps and knuckle.", group="base")
part(usb, M["steel"], "SS304", "Purchased USB-C receptacle (mid-mount)", "Power + data; 0.8 mm behind the outer surface.", group="base")
part(usb_pcb, M["pcb"], "Glass", "FR-4", "USB-C daughter board, screwed to a boss on the back wall.", group="base")
for f in feet:
    part(f, M["gum"], "TPE", "Molded TPE, Shore 50A, adhesive-backed", "Hides the base screws.", group="base")
part(ballast, M["steel"], "SS304", "Laser-cut 4 mm steel, zinc-plated", "≈640 g low ballast against tipping under steering load.", group="base")
part(main_pcb, M["pcb"], "Glass", "FR-4 6-layer", "Main controller and safety relay.", group="base")
for w_ in (wm_r, wm_l):
    part(w_, M["print_white"], "PC/ABS", "Pad print, Robot White", "Archivo Expanded ExtraBold Italic wordmark, placed like the Tarmac downtube logo.", group="base")

for o in (col_clear,):
    ik.delete(o)

# ══════════════════════════════════════════════════════════════════════════════
# 5. dims + explode
# ══════════════════════════════════════════════════════════════════════════════
def W_(p):
    return tuple(WM @ Vector(p))


ik.dim("Wheel Ø", W_((-RIM_R - RIM_A, 0, 0)), W_((RIM_R + RIM_A, 0, 0)), "front")
ik.dim("Rim section", W_((0, -RIM_R, -RIM_B)), W_((0, -RIM_R, RIM_B)), "right")
ik.dim("Control pod", W_((-80, -POD_H / 2, POD_T / 2)), W_((-80, POD_H / 2, POD_T / 2)), "front")
ik.dim("Key column pitch", W_((DPAD[0], DPAD[1], ZTOP)), W_((STICK[0], STICK[1], ZTOP)), "front")
ik.dim("Hinge barrel", (-BARREL_HALF, D.y, D.z + BARREL_R), (BARREL_HALF, D.y, D.z + BARREL_R), "top")
ik.dim("Base width", (-BASE_W / 2, -BASE_D / 2, 0), (BASE_W / 2, -BASE_D / 2, 0), "front")
ik.dim("Base depth", (BASE_W / 2, -BASE_D / 2, 0), (BASE_W / 2, BASE_D / 2, 0), "top")
ik.dim("Base height, rear", (BASE_W / 2, BASE_D / 2, 0), (BASE_W / 2, BASE_D / 2, BASE_H_BACK), "right")
ik.dim("Base height, front", (BASE_W / 2, -BASE_D / 2, 0), (BASE_W / 2, -BASE_D / 2, BASE_H_FRONT), "right")
ik.dim("Parting line", (-BASE_W / 2, -BASE_D / 2, 0), (-BASE_W / 2, -BASE_D / 2, BASE_PZ), "front")
ik.dim("Wheel centre height", (0, CEN.y, 0), tuple(CEN), "right")

ax = lambda d: tuple(n_axis * d)  # noqa: E731
EXP = {"Hub_Faceplate": 70, "Print_Faceplate_Wordmark": 75, "Hub_Rear_Cover": -30, "Print_Hazard": 120, "Print_SpeakerDots": 120,
       "Wheel_Front_Shell": 30, "Pod_Front_Shell": 40, "Pod_Rear_Shell": -25, "Halo_Guide_Upper": 45, "Halo_Guide_Lower": 45, "Grip_L_Front": 40, "Grip_R_Front": 40,
       "Hub_PCB": 15, "EStop_ContactBlock": 5, "Stick_Module": 10, "Clock_Spring": -10, "Wheel_Rear_Shell": -15,
       "Grip_L_Rear": -30, "Grip_R_Rear": -30, "Paddle_Brake_L": -45, "Paddle_Throttle_R": -45, "Haptic_LRA_L": 0, "Haptic_LRA_R": 0,
       "Column_Cover_Upper": -60, "Column_Cover_Lower": -60, "Steer_Motor": -60}
for nm in controls:
    EXP[nm] = 100 if nm.startswith("Key_Column") or nm == "Stick_Gimbal" else 115
for o in screws:
    EXP[o.name] = -55
for o in magnets:
    EXP[o.name] = 55 if "Magnet" in o.name else 22
for nm, d in EXP.items():
    if nm in bpy.data.objects:
        v = Vector(ax(d))
        if "Column" in nm or nm == "Steer_Motor":
            v += Vector((0, 0, 40))
        if nm == "Column_Cover_Upper":
            v += Vector(ax(0)) + Vector((0, 0, 25))
        ik.explode_hint(bpy.data.objects[nm], tuple(v + Vector((0, 0, 60))))
for nm, off in {"Base_Bottom": (0, 0, -70), "Ballast_Plate": (0, 0, -40), "Main_PCB": (0, 0, -15),
                "Hinge_Cap_L": (-45, 0, 25), "Hinge_Cap_R": (45, 0, 25), "Tilt_Knuckle": (0, 0, 25), "Print_TiltIndex": (0, 0, 25),
                "Hinge_Axle": (0, 0, 25), "Hinge_Friction_Pack_L": (-25, 0, 25), "Hinge_Friction_Pack_R": (25, 0, 25),
                "Hinge_Detent_Ring_L": (-12, 0, 25), "Hinge_Detent_Ring_R": (12, 0, 25), "Hinge_Stop_Pin": (0, 0, 10), "USB_C_Receptacle": (0, 45, 0), "USB_Board": (0, 30, 0),
                "Wordmark_R": (25, 0, 0), "Wordmark_L": (-25, 0, 0)}.items():
    ik.explode_hint(bpy.data.objects[nm], off)
for i in range(4):
    ik.explode_hint(bpy.data.objects[f"Foot_{i + 1}"], (0, 0, -95))
    ik.explode_hint(bpy.data.objects[f"Screw_Base_{i + 1}"], (0, 0, -120))
for o in cap_screws:
    if "Cap" in o.name:
        ik.explode_hint(o, (0, 0, -20))
for nm in T:
    if nm not in ik.EXPLODE:
        ik.explode_hint(bpy.data.objects[nm], (0, 0, 0))

# ══════════════════════════════════════════════════════════════════════════════
# 6. outputs
# ══════════════════════════════════════════════════════════════════════════════
parts = [d["obj"] for d in T.values()]
stray = [o.name for o in bpy.context.scene.objects if o.type == "MESH" and o.name not in T and not o.name.startswith("_src")]
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
# base: shade the outer skin with normals from the clean exterior so boolean triangles don't band
for nm in ("Base_Shell", "Base_Bottom"):
    o = bpy.data.objects[nm]
    for m_ in [m_ for m_ in o.modifiers if m_.type == "WEIGHTED_NORMAL"]:
        o.modifiers.remove(m_)
    dt = o.modifiers.new("nrm", "DATA_TRANSFER")
    dt.object = SRC_BASE
    dt.use_loop_data = True
    dt.data_types_loops = {"CUSTOM_NORMAL"}
    dt.loop_mapping = "POLYINTERP_NEAREST"
    dt.use_max_distance = True
    dt.max_distance = 0.3
    ik.apply_mods(o)
ik.delete(SRC_BASE)
os.makedirs(OUT, exist_ok=True)
ik.write_report(os.path.join(OUT, "spec.json"), list(T.values()),
                extra={"product": PRODUCT, "assembly": [
                    "Base: ballast plate and main PCB (on standoffs) into Base_Bottom",
                    "Base_Shell over Base_Bottom (lip engages), 4 × M3 from below, feet cover screws",
                    "Axle through caps and knuckle; caps' saddle feet screw down through the top from inside (2 × M3 each); cable passes through the right foot",
                    "Column: motor + cable into lower cover, upper cover closes (2 screws), foot screws to the knuckle; cable passes through the knuckle bore",
                    "Wheel: halo guides + grips are 2K in the shells; hub PCB, clock spring, LRAs into rear shell",
                    "Wheel: front shell onto rear shell (lip), bonded + 6 × M2.5 (not modelled); pod: front shell onto rear shell, paddles pinned to pivots",
                    "Pod halves close over the spoke stubs; 4 × M2.5 from behind into the faceplate-ledge bosses (the two side screws pass through the stubs); the rear cover snaps over them",
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
# ── rig + animation clips (after the static export, so model.glb stays a flat, viewer-friendly file) ──
import rig as RIG  # noqa: E402
pmap = {o.name: o for o in parts}
CTRL = {"KEY_Talk": ["Btn_Talk"], "KEY_Log": ["Btn_Log"], "KEY_ExtSpeaker": ["Btn_ExtSpeaker", "Print_SpeakerDots"],
        "KEY_Claim": ["Btn_Claim"], "KEY_Release": ["Btn_Release"], "KEY_Horn": ["Btn_Horn"],
        "KEY_Hazard": ["Btn_Hazard", "Print_Hazard"], "KEY_P1": ["Btn_P1"], "KEY_P2": ["Btn_P2"],
        "KEY_EStop": ["EStop_Cap"], "KEY_DPad": ["DPad"], "KEY_Stick": ["Stick_Cap", "Stick_Gimbal"]}
TILT_NAMES = {"Column_Cover_Upper", "Column_Cover_Lower", "Steer_Motor", "Tilt_Knuckle", "Print_TiltIndex",
              "Hinge_Detent_Ring_L", "Hinge_Detent_Ring_R", "Hinge_Stop_Pin"}
BASE_NAMES = {n for n, d in T.items() if d.get("group") == "base"} - TILT_NAMES
rig = RIG.build(pmap, WM, D, CTRL, (0, 0, 0), {"L": (-57.0, -2.0, ZB - 8.2), "R": (57.0, -2.0, ZB - 8.2)},
                FP_Z0 - 2.0, FP_Z0, BASE_NAMES, TILT_NAMES)
cues = RIG.make_clips(rig)
json.dump(cues, open(os.path.join(OUT, "animation_cues.json"), "w"), indent=2)
empties = [o for o in bpy.context.scene.objects if o.type == "EMPTY" and o.name.startswith(("RIG_", "KEY_", "PADDLE_"))]
_rest = {o.name: o.matrix_basis.copy() for o in empties + parts}
RIG.export_rigged(os.path.join(OUT, "model_rigged.glb"), parts, empties)
for n_, mb in _rest.items():          # the glTF exporter leaves sampled NLA poses behind: restore the rest pose
    bpy.data.objects[n_].matrix_basis = mb
bpy.context.scene.frame_set(0)
print("RIG OK", len(empties), "empties,", len(cues["clips"]), "clips", flush=True)
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
if "junction" in want:
    tgt = WM @ Vector((-104.0, 2.0, 2.0))                       # stub → rim fillet, seen from in front, above and inboard
    cam.location = WM @ Vector((-30.0, 70.0, 190.0))
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 85
    ik.render(os.path.join(OUT, "junction.png"), res=(1400, 1050), samples=40)
if "hinge" in want:
    tgt = Vector((40.0, D.y, D.z - 8))
    cam.location = tgt + Vector((150, 230, 90))
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 85
    ik.render(os.path.join(OUT, "hinge.png"), res=(1400, 1050), samples=40)
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
    saved = {o.name: o.matrix_world.copy() for o in parts}
    for nm, off in ik.EXPLODE.items():
        o_ = bpy.data.objects[nm]
        o_.matrix_world = Matrix.Translation(Vector(off)) @ o_.matrix_world
    ik.frame(parts, az_deg=-50, el_deg=14, fill=1.0)
    ik.render(os.path.join(OUT, "exploded.png"), res=(1400, 1050), samples=32)
    for nm, mw in saved.items():
        bpy.data.objects[nm].matrix_world = mw
if "internals" in want:
    hide = {"Wheel_Front_Shell", "Pod_Front_Shell", "Hub_Faceplate", "Base_Shell", "Column_Cover_Upper", "Grip_L_Front", "Grip_R_Front",
            "Wordmark_R", "Wordmark_L", "Halo_Guide_Upper", "Halo_Guide_Lower", "Hinge_Cap_L", "Hinge_Cap_R", "Tilt_Knuckle"} | set(controls)
    hide |= {"Print_Hazard", "Print_SpeakerDots", "Print_Faceplate_Wordmark", "Print_TiltIndex"}
    for o in parts:
        o.hide_render = o.name in hide
    ik.frame([o for o in parts if not o.hide_render], az_deg=-38, el_deg=22, fill=1.0)
    ik.render(os.path.join(OUT, "internals.png"), res=(1400, 1050), samples=32)
    for o in parts:
        o.hide_render = False
ik.done()
