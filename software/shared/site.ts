// Routes through the city, their stops, and the geometry helpers autonomy and the driver map share.
// Route points are intersections on street centre lines; vehicles drive the lane-offset path, on the right.
import { BOUNDS, LANE, kindX, kindY, streetAt } from "./city";

export interface Stop { name: string; at: [number, number] }
export interface Route { id: string; name: string; points: [number, number][]; targetKmh: number; stops: Stop[] }

export const SITE = { width: 1400, height: 900, blockX: 200, blockY: 150, bounds: BOUNDS };

export const ROUTES: Route[] = [
  { id: "downtown", name: "Downtown loop", targetKmh: 28, points: [[200, 150], [800, 150], [800, 600], [400, 600], [400, 450], [200, 450]],
    stops: [{ name: "City Hall", at: [500, 150] }, { name: "Market Square", at: [800, 375] }, { name: "5th & Dock", at: [600, 600] }, { name: "Civic Park", at: [300, 450] }] },
  { id: "harbor", name: "Harbor shuttle", targetKmh: 34, points: [[800, 600], [1400, 600], [1400, 900], [600, 900], [600, 750], [800, 750]],
    stops: [{ name: "Elm Station", at: [1100, 600] }, { name: "Harbor Blvd", at: [1400, 760] }, { name: "Pier 3", at: [1000, 900] }, { name: "6th & Dock", at: [700, 750] }] },
  { id: "campus", name: "Campus circulator", targetKmh: 22, points: [[0, 0], [600, 0], [600, 300], [400, 300], [400, 150], [0, 150]],
    stops: [{ name: "Campus North", at: [300, 0] }, { name: "Library", at: [600, 150] }, { name: "Campus South", at: [100, 150] }] },
  { id: "airport", name: "Airport connector", targetKmh: 40, points: [[1000, 0], [1400, 0], [1400, 450], [1000, 450]],
    stops: [{ name: "Terminal A", at: [1200, 0] }, { name: "Rental Cars", at: [1400, 225] }, { name: "Central & Foundry", at: [1200, 450] }] },
];

/** Where the cellular link is weak: latency climbs and the link can drop. */
export const WEAK_ZONES = [{ x: 1340, y: 860, r: 120, label: "Harbor underpass" }];
export const DEPOT = { x: 1100, y: 825, label: "Depot" };

export function routeById(id: string) { return ROUTES.find((r) => r.id === id) ?? ROUTES[0]; }

const segKind = (a: [number, number], b: [number, number]) => (a[0] === b[0] ? kindX(a[0]) : kindY(a[1]));

/** The path a vehicle drives: each centre-line segment shifted right by its lane offset, corners joined. */
export function lanePath(r: Route): [number, number][] {
  const P = r.points, n = P.length;
  const off = (i: number) => {
    const a = P[i], b = P[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len, o = LANE[segKind(a, b)];
    return { a: [a[0] - dy * o, a[1] + dx * o], d: [dx, dy] };   // right of travel in y-down coords is (-dy, dx)
  };
  return P.map((_, i) => {
    const s1 = off((i - 1 + n) % n), s2 = off(i);
    const den = s1.d[0] * s2.d[1] - s1.d[1] * s2.d[0];
    if (Math.abs(den) < 1e-6) return [s2.a[0], s2.a[1]] as [number, number];
    const t = ((s2.a[0] - s1.a[0]) * s2.d[1] - (s2.a[1] - s1.a[1]) * s2.d[0]) / den;
    return [s1.a[0] + s1.d[0] * t, s1.a[1] + s1.d[1] * t] as [number, number];
  });
}

/** Total loop length and per-segment cumulative distances, on the lane path. */
export function routeGeometry(r: Route) {
  const pts = lanePath(r);
  const segs: { ax: number; ay: number; bx: number; by: number; len: number; s0: number; street: string }[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const c0 = r.points[i], c1 = r.points[(i + 1) % r.points.length];
    const len = Math.hypot(bx - ax, by - ay);
    segs.push({ ax, ay, bx, by, len, s0: s, street: streetAt(c0[0], c0[1], c0[0] === c1[0] ? "x" : "y") });
    s += len;
  }
  const g = { segs, length: s, stops: [] as { name: string; s: number }[] };
  g.stops = r.stops.map((st) => ({ name: st.name, s: project(g, st.at[0], st.at[1]).s })).sort((a, b) => a.s - b.s);
  return g;
}

export type RouteGeom = ReturnType<typeof routeGeometry>;

const wrap = (g: RouteGeom, s: number) => ((s % g.length) + g.length) % g.length;
const segAt = (g: RouteGeom, s: number) => g.segs.findIndex((q) => s >= q.s0 && s < q.s0 + q.len);

export function pointAt(g: RouteGeom, s: number) {
  s = wrap(g, s);
  const seg = g.segs[Math.max(0, segAt(g, s))];
  const f = (s - seg.s0) / seg.len;
  return { x: seg.ax + (seg.bx - seg.ax) * f, y: seg.ay + (seg.by - seg.ay) * f, heading: Math.atan2(seg.by - seg.ay, seg.bx - seg.ax) };
}

/** Nearest point on the loop: arc position and distance from it. */
export function project(g: Pick<RouteGeom, "segs">, x: number, y: number) {
  let best = { s: 0, d: Infinity };
  for (const q of g.segs) {
    const dx = q.bx - q.ax, dy = q.by - q.ay;
    const f = Math.max(0, Math.min(1, ((x - q.ax) * dx + (y - q.ay) * dy) / (q.len * q.len)));
    const px = q.ax + dx * f, py = q.ay + dy * f, d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { s: q.s0 + f * q.len, d };
  }
  return best;
}

/** The next corner along the loop: distance, sharpness, which way, and the street it turns onto. */
export function nextCorner(g: RouteGeom, s: number) {
  s = wrap(g, s);
  const i = Math.max(0, segAt(g, s));
  const a = g.segs[i], b = g.segs[(i + 1) % g.segs.length];
  const turn = Math.atan2(b.by - b.ay, b.bx - b.ax) - Math.atan2(a.by - a.ay, a.bx - a.ax);
  const t = Math.atan2(Math.sin(turn), Math.cos(turn));
  // y points south, so a positive turn is clockwise on the map: a right turn.
  return { dist: a.s0 + a.len - s, angle: Math.abs(t), dir: Math.abs(t) < 0.2 ? ("straight" as const) : t > 0 ? ("right" as const) : ("left" as const), onto: b.street, current: a.street };
}

/** The next stop ahead of arc position s, and how far along the route it is. */
export function nextStop(g: RouteGeom, s: number, skipWithin = 0) {
  s = wrap(g, s);
  const best = g.stops.map((x, i) => ({ i, d: wrap(g, x.s - s) })).filter((x) => x.d > skipWithin).sort((p, q) => p.d - q.d)[0];
  return best ? { index: best.i, name: g.stops[best.i].name, dist: best.d, count: g.stops.length } : null;
}
