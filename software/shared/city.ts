// The simulated city: named streets, blocks, buildings, a park, the harbor, and street furniture.
// Everything is generated deterministically, so the server, the camera and every map see the same city.
// Units are metres; x runs east, y runs south (screen orientation).

export type StreetKind = "local" | "arterial";
export interface Street { id: string; axis: "x" | "y"; at: number; from: number; to: number; name: string; kind: StreetKind; half: number }
export type BlockKind = "city" | "park" | "civic" | "depot" | "campus" | "plaza";
export interface Building { id: number; x0: number; y0: number; x1: number; y1: number; h: number; tone: number; name?: string }
export interface Block { x0: number; y0: number; x1: number; y1: number; kind: BlockKind; name?: string; inner: [number, number, number, number]; buildings: Building[] }
export interface Prop { kind: "tree" | "light" | "car"; x: number; y: number; heading: number; tone: number }
export type Poly = [number, number][];

export const BOUNDS = { x0: -400, x1: 1800, y0: -300, y1: 1050 };
export const SIDEWALK = 4;
export const HALF: Record<StreetKind, number> = { local: 6, arterial: 8 };
/** Distance from the centre line to the middle of the right-hand travel lane. */
export const LANE: Record<StreetKind, number> = { local: 1.75, arterial: 5.25 };
export const WATER = { x0: 590, y0: 914 };

const XS = range(BOUNDS.x0, BOUNDS.x1, 200);
const YS = range(BOUNDS.y0, BOUNDS.y1, 150);
const AVENUES = ["Quarry Ave", "Orchard Ave", "Ash Ave", "Birch Ave", "Cedar Ave", "Dock Ave", "Market Ave", "Elm Ave", "Foundry Ave", "Harbor Blvd", "Iron Ave", "Juniper Ave"];
const STREETS_Y = ["Ridge St", "Hill St", "1st St", "2nd St", "3rd St", "Central St", "5th St", "6th St", "Pier Rd", "Shore St"];
const ARTERIAL_X = new Set([800, 1400]);
const ARTERIAL_Y = new Set([450, 900]);

function range(a: number, b: number, step: number) { const out = []; for (let v = a; v <= b; v += step) out.push(v); return out; }
/** Small deterministic hash → [0, 1). */
export function rand(...n: number[]) {
  let h = 2166136261;
  for (const v of n) { h ^= Math.round(v * 7) | 0; h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export const kindX = (x: number): StreetKind => (ARTERIAL_X.has(x) ? "arterial" : "local");
export const kindY = (y: number): StreetKind => (ARTERIAL_Y.has(y) ? "arterial" : "local");
export const avenueName = (x: number) => AVENUES[Math.round((x - BOUNDS.x0) / 200)] ?? `${x} Ave`;
export const streetName = (y: number) => STREETS_Y[Math.round((y - BOUNDS.y0) / 150)] ?? `${y} St`;

export const STREETS: Street[] = [
  ...XS.map((x) => ({ id: `x${x}`, axis: "x" as const, at: x, from: BOUNDS.y0, to: x >= 600 ? 900 : BOUNDS.y1, name: avenueName(x), kind: kindX(x), half: HALF[kindX(x)] })),
  ...YS.map((y) => ({ id: `y${y}`, axis: "y" as const, at: y, from: BOUNDS.x0, to: y > 900 ? WATER.x0 : BOUNDS.x1, name: streetName(y), kind: kindY(y), half: HALF[kindY(y)] })),
];

/** Name of the street a point on the grid sits on, given the travel axis. */
export function streetAt(x: number, y: number, axis: "x" | "y") {
  return axis === "x" ? avenueName(Math.round(x / 200) * 200) : streetName(Math.round(y / 150) * 150);
}

// ── Blocks and buildings ───────────────────────────────────────────────────

function blockKind(x0: number, y0: number): { kind: BlockKind; name?: string } | null {
  if (x0 >= 600 && y0 >= 900) return null; // harbor water
  if (x0 === 400 && y0 === 900) return { kind: "plaza", name: "Marina" };
  if (x0 === 200 && y0 === 300) return { kind: "park", name: "Civic Park" };
  if (x0 === 400 && y0 === 150) return { kind: "civic", name: "City Hall" };
  if (x0 === 1000 && y0 === 750) return { kind: "depot", name: "Depot" };
  if (y0 === 0 && (x0 === 0 || x0 === 200)) return { kind: "campus", name: x0 === 0 ? "Campus" : undefined };
  return { kind: "city" };
}

let bid = 0;
function buildingsFor(b: Omit<Block, "buildings">): Building[] {
  const [ix0, iy0, ix1, iy1] = b.inner;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const downtown = Math.exp(-Math.hypot(cx - 700, cy - 380) / 330);
  const out: Building[] = [];
  const add = (x0: number, y0: number, x1: number, y1: number, h: number, name?: string) =>
    out.push({ id: ++bid, x0, y0, x1, y1, h: Math.round(h), tone: Math.floor(rand(x0, y0, 3) * 4), name });

  if (b.kind === "park" || b.kind === "plaza") return out;
  if (b.kind === "civic") { add(ix0 + 22, iy0 + 18, ix1 - 22, iy1 - 18, 30, "City Hall"); return out; }
  if (b.kind === "depot") { add(ix0 + 4, iy0 + 4, ix0 + (ix1 - ix0) * 0.55, iy1 - 4, 10, "Depot"); return out; }
  if (b.kind === "campus") {
    const n = 3, w = (ix1 - ix0) / n;
    for (let i = 0; i < n; i++) if (rand(cx, i) > 0.2) add(ix0 + i * w + 6, iy0 + 10 + rand(cx, i, 1) * 10, ix0 + (i + 1) * w - 6, iy1 - 10 - rand(cx, i, 2) * 10, 10 + rand(cx, i, 4) * 8);
    return out;
  }
  const rows = iy1 - iy0 > 90 ? [[iy0, (iy0 + iy1) / 2 - 2], [(iy0 + iy1) / 2 + 2, iy1]] : [[iy0, iy1]];
  rows.forEach(([ry0, ry1], r) => {
    let x = ix0;
    let k = 0;
    while (x < ix1 - 12) {
      const w = Math.min(ix1 - x, 22 + rand(cx, cy, r, k) * 34);
      const rest = ix1 - (x + w);
      const lotW = rest < 16 ? ix1 - x : w;
      if (rand(cx, cy, r, k, 9) > 0.1) {
        const depth = (ry1 - ry0) * (0.7 + rand(cx, cy, r, k, 5) * 0.3);
        const yA = r === 0 ? ry0 : ry1 - depth, yB = r === 0 ? ry0 + depth : ry1;
        add(x + 1, yA, x + lotW - 1, yB, 9 + downtown * 46 + rand(cx, cy, r, k, 7) * (8 + downtown * 26));
      }
      x += lotW; k++;
    }
  });
  return out;
}

export const BLOCKS: Block[] = [];
for (let i = 0; i < XS.length - 1; i++) for (let j = 0; j < YS.length - 1; j++) {
  const x0 = XS[i], x1 = XS[i + 1], y0 = YS[j], y1 = YS[j + 1];
  const k = blockKind(x0, y0);
  if (!k) continue;
  const southEdge = y1 > 900 && x0 >= 400 ? HALF.local : HALF[kindY(y1)];
  const eastEdge = x1 === 600 && y0 >= 900 ? 0 : HALF[kindX(x1)];
  const inner: [number, number, number, number] = [x0 + HALF[kindX(x0)] + SIDEWALK, y0 + HALF[kindY(y0)] + SIDEWALK, x1 - eastEdge - SIDEWALK, y1 - southEdge - SIDEWALK];
  const base = { x0, y0, x1, y1, ...k, inner };
  BLOCKS.push({ ...base, buildings: buildingsFor(base) });
}
export const BUILDINGS = BLOCKS.flatMap((b) => b.buildings);

// ── Street furniture: trees, lights, parked cars ───────────────────────────

const cornerClear = (along: number, cross: number[], margin: number) => cross.every((c) => Math.abs(along - c) > margin);
export const PROPS: Prop[] = [];
for (const s of STREETS) {
  const cross = s.axis === "x" ? YS : XS;
  const crossHalf = (c: number) => (s.axis === "x" ? HALF[kindY(c)] : HALF[kindX(c)]);
  const pt = (along: number, off: number) => (s.axis === "x" ? { x: s.at + off, y: along } : { x: along, y: s.at + off });
  const heading = s.axis === "x" ? Math.PI / 2 : 0;
  const leafy = rand(s.at, 11) > 0.35;
  for (const side of [-1, 1]) {
    for (let a = s.from; a <= s.to; a += 1) {
      if (s.kind === "local" && leafy && a % 18 === 0 && cornerClear(a, cross, 14)) PROPS.push({ kind: "tree", ...pt(a, side * (s.half + 2.2)), heading, tone: Math.floor(rand(a, s.at, side) * 3) });
      if (s.kind === "arterial" && a % 32 === 0 && cornerClear(a, cross, 10)) PROPS.push({ kind: "light", ...pt(a, side * (s.half + 0.8)), heading, tone: 0 });
      if (s.kind === "local" && a % 7 === 0 && cornerClear(a, cross, 16) && cross.every((c) => Math.abs(a - c) > crossHalf(c) + 10) && rand(a, s.at, side, 2) > 0.5)
        PROPS.push({ kind: "car", ...pt(a, side * (s.half - 1.25)), heading: heading + (side < 0 ? Math.PI : 0), tone: Math.floor(rand(a, s.at, side, 3) * 6) });
    }
  }
}
for (const b of BLOCKS) if (b.kind === "park" || b.kind === "plaza") {
  const [x0, y0, x1, y1] = b.inner;
  for (let x = x0 + 8; x < x1 - 4; x += 14) for (let y = y0 + 8; y < y1 - 4; y += 14)
    if (rand(x, y, 1) > 0.3) PROPS.push({ kind: "tree", x: x + (rand(x, y) - 0.5) * 6, y: y + (rand(y, x) - 0.5) * 6, heading: 0, tone: Math.floor(rand(x, y, 2) * 3) });
}

// ── Road surface and markings ──────────────────────────────────────────────

export interface Mark { poly: Poly; color: "white" | "yellow" }
export const ROADS: Poly[] = STREETS.map((s) => s.axis === "x"
  ? [[s.at - s.half, s.from], [s.at + s.half, s.from], [s.at + s.half, s.to], [s.at - s.half, s.to]]
  : [[s.from, s.at - s.half], [s.to, s.at - s.half], [s.to, s.at + s.half], [s.from, s.at + s.half]]);

export const MARKS: Mark[] = [];
for (const s of STREETS) {
  const cross = (s.axis === "x" ? YS : XS).filter((c) => c >= s.from && c <= s.to);
  const crossHalf = (c: number) => (s.axis === "x" ? HALF[kindY(c)] : HALF[kindX(c)]);
  // rect in street-local coords: along a..b, offset o0..o1 from the centre line
  const rect = (a: number, b: number, o0: number, o1: number): Poly => s.axis === "x"
    ? [[s.at + o0, a], [s.at + o1, a], [s.at + o1, b], [s.at + o0, b]]
    : [[a, s.at + o0], [b, s.at + o0], [b, s.at + o1], [a, s.at + o1]];
  const stops = [s.from, ...cross, s.to];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i] + (cross.includes(stops[i]) ? crossHalf(stops[i]) : 0), b = stops[i + 1] - (cross.includes(stops[i + 1]) ? crossHalf(stops[i + 1]) : 0);
    if (b - a < 10) continue;
    const ca = a + 1, cb = b - 1;
    // Crosswalks at both mouths, then stop lines, then the centre and lane lines between them.
    for (const [m0, dir] of [[ca, 1], [cb, -1]] as const) {
      if (!cross.includes(dir > 0 ? stops[i] : stops[i + 1])) continue;
      for (let o = -s.half + 0.6; o < s.half - 0.4; o += 1.2) MARKS.push({ poly: rect(Math.min(m0, m0 + dir * 3.2), Math.max(m0, m0 + dir * 3.2), o, o + 0.6), color: "white" });
      const sl = m0 + dir * 4.4;
      MARKS.push({ poly: rect(Math.min(sl, sl + dir * 0.4), Math.max(sl, sl + dir * 0.4), dir > 0 ? -s.half + 0.5 : 0.1, dir > 0 ? -0.1 : s.half - 0.5), color: "white" });
    }
    const da = ca + 6, db = cb - 6;
    if (s.kind === "arterial") {
      MARKS.push({ poly: rect(da, db, -0.3, -0.15), color: "yellow" }, { poly: rect(da, db, 0.15, 0.3), color: "yellow" });
      for (let p = da; p < db - 3; p += 9) { MARKS.push({ poly: rect(p, p + 3, -3.6, -3.45), color: "white" }, { poly: rect(p, p + 3, 3.45, 3.6), color: "white" }); }
    } else {
      for (let p = da; p < db - 3; p += 9) MARKS.push({ poly: rect(p, p + 3, -0.08, 0.08), color: "yellow" });
    }
  }
}

export const WATER_POLY: Poly = [[WATER.x0, WATER.y0], [BOUNDS.x1 + 200, WATER.y0], [BOUNDS.x1 + 200, BOUNDS.y1 + 300], [WATER.x0, BOUNDS.y1 + 300]];

// ── Spatial index ──────────────────────────────────────────────────────────

const CELL = 60;
type Indexed = { buildings: Building[]; props: Prop[]; marks: Mark[]; roads: Poly[]; blocks: Block[] };
const grid = new Map<string, Indexed>();
const cell = (cx: number, cy: number) => {
  const k = `${cx},${cy}`;
  let c = grid.get(k);
  if (!c) { c = { buildings: [], props: [], marks: [], roads: [], blocks: [] }; grid.set(k, c); }
  return c;
};
function bbox(p: Poly) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; }
function insert<K extends keyof Indexed>(key: K, item: Indexed[K][number], [x0, y0, x1, y1]: number[]) {
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) (cell(cx, cy)[key] as unknown[]).push(item);
}
let indexed = false;
function buildIndex() {
  if (indexed) return; indexed = true;
  for (const b of BUILDINGS) insert("buildings", b, [b.x0, b.y0, b.x1, b.y1]);
  for (const p of PROPS) insert("props", p, [p.x, p.y, p.x, p.y]);
  for (const m of MARKS) insert("marks", m, bbox(m.poly));
  for (const b of BLOCKS) insert("blocks", b, [b.x0, b.y0, b.x1, b.y1]);
  // Roads are long; index them in 60 m pieces so a query never returns a 1.3 km polygon.
  for (const s of STREETS) for (let a = s.from; a < s.to; a += CELL) {
    const b = Math.min(s.to, a + CELL);
    const p: Poly = s.axis === "x" ? [[s.at - s.half, a], [s.at + s.half, a], [s.at + s.half, b], [s.at - s.half, b]] : [[a, s.at - s.half], [b, s.at - s.half], [b, s.at + s.half], [a, s.at + s.half]];
    insert("roads", p, bbox(p));
  }
}

/** Everything within r metres of (x, y). */
export function near(x: number, y: number, r: number): Indexed {
  buildIndex();
  const out: Indexed = { buildings: [], props: [], marks: [], roads: [], blocks: [] };
  const seen = new Set<unknown>();
  for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++) {
    const c = grid.get(`${cx},${cy}`); if (!c) continue;
    for (const k of Object.keys(c) as (keyof Indexed)[]) for (const it of c[k]) if (!seen.has(it)) { seen.add(it); (out[k] as unknown[]).push(it); }
  }
  return out;
}
