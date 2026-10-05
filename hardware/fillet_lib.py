"""Rolling-ball fillet between a bar along x (spoke stub) and the rim tube (ellipse-section torus)."""
import math
import bmesh
from mathutils import Quaternion, Vector
from mathutils.bvhtree import BVHTree


def ellipse_nearest(rho, z, R, a, b):
    """Nearest point on the ellipse (R + a cos t, b sin t) to (rho, z); returns (pr, pz, dist, inside)."""
    best = None
    for k in range(72):
        t = 2 * math.pi * k / 72
        d = (R + a * math.cos(t) - rho) ** 2 + (b * math.sin(t) - z) ** 2
        if best is None or d < best[0]:
            best = (d, t)
    t = best[1]
    for _ in range(12):  # Newton on f(t) = dP/dt · (P - Q)
        px, pz = R + a * math.cos(t), b * math.sin(t)
        dx, dz = -a * math.sin(t), b * math.cos(t)
        ddx, ddz = -a * math.cos(t), -b * math.sin(t)
        f = dx * (px - rho) + dz * (pz - z)
        fp = dx * dx + dz * dz + ddx * (px - rho) + ddz * (pz - z)
        if abs(fp) < 1e-12:
            break
        t -= f / fp
    px, pz = R + a * math.cos(t), b * math.sin(t)
    inside = ((rho - R) / a) ** 2 + (z / b) ** 2 < 1
    return px, pz, math.hypot(px - rho, pz - z), inside


def torus_dist(p, R, a, b):
    """Unsigned distance from p to the torus surface, and the nearest surface point."""
    rho = math.hypot(p.x, p.y)
    ux, uy = (p.x / rho, p.y / rho) if rho > 1e-9 else (1.0, 0.0)
    pr, pz, d, inside = ellipse_nearest(rho, p.z, R, a, b)
    return d, Vector((pr * ux, pr * uy, pz)), inside


def fillet_ring(band_obj, R, a, b, r, side, n_around=144, n_arc=8, depsgraph=None, x_min=40.0, x_max=115.5):
    """Closed solid ring whose outer face is the rolling-ball fillet where the bar `band_obj` (along x) meets the torus, on `side` (+1/-1)."""
    bvh = BVHTree.FromObject(band_obj, depsgraph)
    rings = []
    for k in range(n_around):
        phi = 2 * math.pi * (k + 0.5) / n_around      # half-step: no section lies in the z = 0 parting plane
        d2 = Vector((0, math.cos(phi), math.sin(phi)))

        def surf(x):
            o = Vector((x, 0, 0))
            hit = bvh.ray_cast(o, d2, 500)
            if hit[0] is None:
                return None
            return hit[0], hit[1].normalized()

        def f(x):
            s = surf(x)
            if s is None:
                return None
            S, n = s
            C = S + n * r
            d, _, inside = torus_dist(C, R, a, b)
            return (d if not inside else -d) - r, S, n, C
        lo, hi = x_min, x_max
        flo = f(side * lo)
        fhi = f(side * hi)
        if flo is None or fhi is None or flo[0] < 0 or fhi[0] > 0:
            return None, (k, flo and flo[0], fhi and fhi[0])
        for _ in range(40):
            mid = (lo + hi) / 2
            fm = f(side * mid)
            if fm[0] > 0:
                lo = mid
            else:
                hi = mid
        _, S, n, C = f(side * (lo + hi) / 2)
        _, P2, _ = torus_dist(C, R, a, b)
        u1, u2 = (S - C).normalized(), (P2 - C).normalized()
        # arc slightly larger than the ball and run past both contacts, so it crosses each surface
        # at a definite angle instead of meeting it tangentially (EXACT booleans need a real crossing)
        ax = u1.cross(u2)
        th = u1.angle(u2)
        ax = ax.normalized() if ax.length > 1e-9 else Vector((1, 0, 0))
        arc = []
        over = math.radians(4.0) / max(th, 1e-6)           # run 4° past each contact
        for j in range(n_arc + 1):
            t = -over + (1 + 2 * over) * j / n_arc
            v = Quaternion(ax, th * t) @ u1
            arc.append(C + v * (r + 0.15))
        g = (C - P2).normalized()
        w = -(n + g)
        w = w.normalized() if w.length > 1e-9 else -n
        half = n.angle(g) / 2                         # half the angle between the two surface normals
        depth = min(r / max(math.cos(half), 0.25), 4 * r)   # corner of the two tangent planes, along the bisector
        Q = C + w * (depth + 1.2)
        rings.append(arc + [Q])
    bm = bmesh.new()
    vrows = [[bm.verts.new(p) for p in ring] for ring in rings]
    m = len(rings[0])
    for i in range(len(vrows)):
        r0, r1 = vrows[i], vrows[(i + 1) % len(vrows)]
        for j in range(m):
            jj = (j + 1) % m
            bm.faces.new((r0[j], r0[jj], r1[jj], r1[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm, None
