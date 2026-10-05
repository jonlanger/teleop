// The camera's 3D world: the shared city, built from the design system's scene objects (three.js).
// Static city layers are built once and merged; every kind of object is one set of InstancedMeshes,
// filled each frame with what is near the camera. The simulator owns positions; this only draws them.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import "@ds/components/SceneObjects/scene-kit.js";
import type { VehicleState } from "@shared/types";
import { BLOCKS, BUILDINGS, HALF, LANE, MARKS, PROPS, STREETS, WATER_POLY, kindX, kindY, rand, type Block, type Poly } from "@shared/city";
import { ROUTES } from "@shared/site";
import { STATE_LABEL, kmh } from "@shared/controls";

type Kind = "car" | "bus" | "truck" | "shuttle" | "pedestrian" | "cyclist" | "cone" | "barrier" | "tree" | "streetLight" | "stopShelter";
interface Kit {
  palette: Record<string, any>; dims: Record<Kind, [number, number, number]>; templates: Record<Kind, () => THREE.Group>;
  pose: { pedestrian(g: THREE.Group, phase: number): void; cyclist(g: THREE.Group, crank: number): void }; facadeMaterial(): THREE.Material;
}
const kit: Kit = (window as unknown as { teleop: { createSceneKit(t: typeof THREE): Kit } }).teleop.createSceneKit(THREE);
const P = kit.palette;
const col = (c: string) => new THREE.Color(c);
const PAINT = (P.paint as string[]).map(col), SHIRT = (P.shirt as string[]).map(col), PANTS = (P.pants as string[]).map(col), SKIN = (P.skin as string[]).map(col);
const HALO = Object.fromEntries(Object.entries(P.halo as Record<string, string>).map(([k, v]) => [k, col(v)])) as Record<VehicleState["control"], THREE.Color>;
const AMBER = col(P.amber), LAMP_OFF = col("#3A3530");

export interface Item { x: number; y: number; h: number; colors?: Record<string, THREE.Color>; phase?: number }
export interface Detection { id: string; kind: string; label: string; detail: string; x: number; y: number; d: number; box: [number, number, number, number] }
export const VIEWS = { front: { yaw: 0, mount: 2.6 }, rear: { yaw: Math.PI, mount: -3.2 }, left: { yaw: -Math.PI / 2, mount: 0.5 }, right: { yaw: Math.PI / 2, mount: 0.5 } } as const;
export const CAM_Z = 2.3;

/** All instances of one kind of object. Parts of the template become InstancedMeshes; poses animate per instance. */
class KindLayer {
  private parts: { mesh: THREE.InstancedMesh; src: THREE.Mesh; local: THREE.Matrix4; key?: string }[] = [];
  private m = new THREE.Matrix4(); private base = new THREE.Matrix4();
  constructor(readonly template: THREE.Group, max: number, scene: THREE.Scene, private animate?: (g: THREE.Group, it: Item) => void) {
    template.updateMatrixWorld(true);
    template.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      const key = src.userData.colorKey as string | undefined;
      const mat = key ? (src.material as THREE.Material).clone() : (src.material as THREE.Material);
      if (key) (mat as THREE.MeshStandardMaterial).color?.set("#FFFFFF");
      const mesh = new THREE.InstancedMesh(src.geometry, mat, max);
      mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = src.renderOrder;
      if (key) for (let i = 0; i < max; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      scene.add(mesh);
      this.parts.push({ mesh, src, local: src.matrixWorld.clone(), key });
    });
  }
  set(items: Item[]) {
    const n = Math.min(items.length, this.parts[0]?.mesh.instanceMatrix.count ?? 0);
    for (let i = 0; i < n; i++) {
      const it = items[i];
      this.base.makeRotationY(-it.h); this.base.setPosition(it.x, 0, it.y);
      if (this.animate) { this.animate(this.template, it); this.template.updateMatrixWorld(true); }
      for (const p of this.parts) {
        this.m.multiplyMatrices(this.base, this.animate ? p.src.matrixWorld : p.local);
        p.mesh.setMatrixAt(i, this.m);
        if (p.key) p.mesh.setColorAt(i, it.colors?.[p.key] ?? WHITE);
      }
    }
    for (const p of this.parts) {
      p.mesh.count = n; p.mesh.instanceMatrix.needsUpdate = true;
      if (p.key && p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }
}
const WHITE = new THREE.Color(1, 1, 1);

const SHELTERS = ROUTES.flatMap((r) => r.stops.map((st) => {
  const Pt = r.points, i = Pt.findIndex((a, k) => { const b = Pt[(k + 1) % Pt.length]; return (a[0] === b[0] && st.at[0] === a[0] && between(st.at[1], a[1], b[1])) || (a[1] === b[1] && st.at[1] === a[1] && between(st.at[0], a[0], b[0])); });
  const a = Pt[Math.max(0, i)], b = Pt[(Math.max(0, i) + 1) % Pt.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len;
  const half = a[0] === b[0] ? HALF[kindX(a[0])] : HALF[kindY(a[1])];
  // The shelter's back wall faces away from the road: turn it around from the direction of travel.
  return { name: st.name, x: st.at[0] - dy * (half + 2.4), y: st.at[1] + dx * (half + 2.4), h: Math.atan2(dy, dx) + Math.PI };
}));
function between(v: number, a: number, b: number) { return v >= Math.min(a, b) && v <= Math.max(a, b); }

/** Street lights stand on the kerb with the arm reaching over the road. */
const LIGHTS: Item[] = PROPS.filter((p) => p.kind === "light").map((p) => {
  const vertical = Math.abs(Math.sin(p.heading)) > 0.5;
  const toStreet = vertical ? -Math.sign(p.x - Math.round(p.x / 200) * 200) : -Math.sign(p.y - Math.round(p.y / 150) * 150);
  // The template's arm points to its local -Z, which is (sin h, -cos h) on the map.
  let h = p.heading;
  const arm = vertical ? Math.sin(h) : -Math.cos(h);
  if (Math.sign(arm) !== Math.sign(toStreet)) h += Math.PI;
  return { x: p.x, y: p.y, h };
});
const TREES: Item[] = PROPS.filter((p) => p.kind === "tree").map((p) => ({ x: p.x, y: p.y, h: rand(p.x, p.y) * Math.PI * 2 }));
// Parked cars face the direction of traffic on their side (north–south streets flip, as for moving traffic).
const PARKED: (Item & { id: string })[] = PROPS.filter((p) => p.kind === "car").map((p) => ({
  id: `pk${Math.round(p.x)},${Math.round(p.y)}`, x: p.x, y: p.y, h: p.heading + (Math.abs(Math.sin(p.heading)) > 0.5 ? Math.PI : 0), colors: { paint: PAINT[p.tone % PAINT.length] },
}));

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.3, 520);
  private sky: THREE.Mesh;
  private layers: Record<Kind, KindLayer>;
  private nearCache = { x: 1e9, y: 1e9, trees: [] as Item[], lights: [] as Item[], parked: [] as typeof PARKED, shelters: [] as typeof SHELTERS };
  private ray = new THREE.Raycaster();
  private v3 = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const s = this.scene;
    s.environment = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.55;
    s.fog = new THREE.Fog(P.haze ?? "#343B42", 80, 360);
    s.background = new THREE.Color("#343B42");
    s.add(new THREE.HemisphereLight(0xc8d2da, 0x2a2e33, 0.95));
    const sun = new THREE.DirectionalLight(0xfff1e0, 1.35); sun.position.set(0.45, 1, 0.3); s.add(sun);

    // Sky dome: deep at the zenith, haze at the horizon, following the camera.
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(480, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color("#161B20") }, horizon: { value: new THREE.Color("#3A4148") } },
      vertexShader: "varying float vy; void main(){ vy = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 horizon; varying float vy; void main(){ gl_FragColor = vec4(mix(horizon, top, smoothstep(0.0, 0.35, vy)), 1.0);\n#include <colorspace_fragment>\n}",
    }));
    this.sky.renderOrder = -1; s.add(this.sky);

    this.buildGround();
    this.buildBuildings();
    const max = (n: number) => n;
    this.layers = {
      car: new KindLayer(kit.templates.car(), max(420), s),
      bus: new KindLayer(kit.templates.bus(), max(30), s),
      truck: new KindLayer(kit.templates.truck(), max(4), s),
      shuttle: new KindLayer(kit.templates.shuttle(), max(16), s),
      pedestrian: new KindLayer(kit.templates.pedestrian(), max(160), s, (g, it) => kit.pose.pedestrian(g, it.phase ?? 0)),
      cyclist: new KindLayer(kit.templates.cyclist(), max(40), s, (g, it) => kit.pose.cyclist(g, it.phase ?? 0)),
      cone: new KindLayer(kit.templates.cone(), max(16), s),
      barrier: new KindLayer(kit.templates.barrier(), max(4), s),
      tree: new KindLayer(kit.templates.tree(), max(500), s),
      streetLight: new KindLayer(kit.templates.streetLight(), max(80), s),
      stopShelter: new KindLayer(kit.templates.stopShelter(), max(20), s),
    };
  }

  private buildGround() {
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: "#50555A", roughness: 0.95 }));
    sidewalk.rotation.x = -Math.PI / 2; sidewalk.position.set(700, 0, 450); this.scene.add(sidewalk);
    const w = WATER_POLY;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w[1][0] - w[0][0], w[2][1] - w[0][1]), new THREE.MeshStandardMaterial({ color: "#18242E", roughness: 0.12, metalness: 0.35 }));
    water.rotation.x = -Math.PI / 2; water.position.set((w[0][0] + w[1][0]) / 2, 0.01, (w[0][1] + w[2][1]) / 2); this.scene.add(water);

    const lot: Record<Block["kind"], string> = { city: "#3A3E42", park: "#34453A", plaza: "#45494D", campus: "#38433B", depot: "#404448", civic: "#3E4246" };
    this.scene.add(flat(BLOCKS.map((b) => ({ poly: rectPoly(b.inner), color: lot[b.kind] })), 0.02, 1));
    this.scene.add(flat(STREETS.map((s) => ({ poly: s.axis === "x" ? rectPoly([s.at - s.half, s.from, s.at + s.half, s.to]) : rectPoly([s.from, s.at - s.half, s.to, s.at + s.half]), color: "#2A2D30" })), 0.04, 2));
    this.scene.add(flat(MARKS.map((m) => ({ poly: m.poly, color: m.color === "white" ? "#D2D4D0" : "#C9A64E" })), 0.06, 3));
  }

  private buildBuildings() {
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, kit.facadeMaterial(), BUILDINGS.length);
    const m = new THREE.Matrix4(), tones = (P.building as string[]).map(col);
    BUILDINGS.forEach((b, i) => {
      m.makeScale(b.x1 - b.x0, b.h, b.y1 - b.y0); m.setPosition((b.x0 + b.x1) / 2, 0, (b.y0 + b.y1) / 2);
      mesh.setMatrixAt(i, m); mesh.setColorAt(i, tones[b.tone % tones.length]);
    });
    this.scene.add(mesh);
  }

  setSize(w: number, h: number, dpr: number) {
    this.renderer.setPixelRatio(Math.min(dpr, 1.75)); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Same framing as the vehicle's camera: a 78° horizontal field.
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / 2 / (w * 0.62)));
    this.camera.updateProjectionMatrix();
  }

  /** Draw one frame. Returns what perception sees, with screen boxes, for hover and labels. */
  frame(v: VehicleState, others: VehicleState[], pose: { x: number; y: number; h: number }, view: keyof typeof VIEWS, pan: number, t: number, w: number, h: number) {
    const V = VIEWS[view];
    const yaw = pose.h + V.yaw + pan * 0.6;
    const cx = pose.x + Math.cos(pose.h) * V.mount, cy = pose.y + Math.sin(pose.h) * V.mount;
    const pitch = (0.03 * h) / (0.62 * w);
    this.camera.position.set(cx, CAM_Z, cy);
    this.camera.lookAt(cx + Math.cos(yaw) * 50, CAM_Z - 50 * pitch, cy + Math.sin(yaw) * 50);
    this.camera.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);

    const hits: Detection[] = [];
    const ahead = { x: cx + Math.cos(yaw) * 80, y: cy + Math.sin(yaw) * 80 };
    const inRange = (x: number, y: number, r: number) => Math.hypot(x - ahead.x, y - ahead.y) < r;

    // Static props near the camera, refreshed as it moves.
    const nc = this.nearCache;
    if (Math.hypot(nc.x - ahead.x, nc.y - ahead.y) > 12) {
      nc.x = ahead.x; nc.y = ahead.y;
      nc.trees = TREES.filter((p) => inRange(p.x, p.y, 240)).slice(0, 500);
      nc.lights = LIGHTS.filter((p) => inRange(p.x, p.y, 260)).slice(0, 80);
      nc.parked = PARKED.filter((p) => inRange(p.x, p.y, 200));
      nc.shelters = SHELTERS.filter((p) => inRange(p.x, p.y, 260));
      this.layers.tree.set(nc.trees); this.layers.streetLight.set(nc.lights); this.layers.stopShelter.set(nc.shelters);
    }

    const cars: (Item & { id: string; speed: number })[] = [...nc.parked.map((p) => ({ ...p, speed: 0 }))];
    const buses: (Item & { id: string; speed: number; label?: string })[] = [];
    const peds: (Item & { id: string; label?: string; detail?: string })[] = [];
    const bikes: (Item & { id: string; speed: number })[] = [];
    const trucks: Item[] = [], cones: Item[] = [], barriers: Item[] = [];

    // Background life: deterministic in space and time, so every console sees the same street. Visual only.
    const own = Math.abs(Math.cos(pose.h)) > Math.abs(Math.sin(pose.h))
      ? { axis: "y" as const, at: Math.round(pose.y / 150) * 150, dir: Math.sign(Math.cos(pose.h)) }
      : { axis: "x" as const, at: Math.round(pose.x / 200) * 200, dir: Math.sign(Math.sin(pose.h)) };
    for (const s of STREETS) {
      const perp = s.axis === "x" ? Math.abs(s.at - ahead.x) : Math.abs(s.at - ahead.y);
      if (perp > 190) continue;
      const alongC = s.axis === "x" ? ahead.y : ahead.x;
      const a0 = Math.max(s.from, alongC - 200), a1 = Math.min(s.to, alongC + 200);
      if (a1 <= a0) continue;
      const pt = (a: number, off: number) => (s.axis === "x" ? { x: s.at + off, y: a } : { x: a, y: s.at + off });
      const hd = (dir: number) => (s.axis === "x" ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI));
      // Right-hand traffic: the kerb-side lane is to the right of travel. Heading +y (south), right is -x;
      // heading +x (east), right is +y. So the lateral sign flips on north–south streets.
      const keepRight = (dir: number) => (s.axis === "x" ? -dir : dir);
      for (let a = Math.floor(a0 / 24) * 24; a < a1; a += 24) for (const side of [-1, 1]) {
        const r0 = rand(s.at, a, side, 41);
        if (r0 > 0.42) continue;
        const span = 14, speed = 1.1 + r0 * 0.6, ph = ((t * speed) / span + r0 * 7) % 2;
        const u = ph < 1 ? ph : 2 - ph, dir = ph < 1 ? 1 : -1;
        const p = pt(a + 4 + u * span, side * (s.half + (r0 > 0.2 ? 1.3 : 3.0)));
        const seed = Math.floor(r0 * 1000);
        peds.push({ id: `ped${s.id}:${a}:${side}`, x: p.x, y: p.y, h: hd(dir), phase: t * speed * 4.6 + seed,
          colors: { shirt: SHIRT[seed % 3], pants: PANTS[seed % 2], skin: SKIN[(seed >> 2) % 3] } });
      }
      const period = s.kind === "arterial" ? 70 : 110, speedT = s.kind === "arterial" ? 11 : 8;
      for (const dir of [1, -1]) {
        if (s.axis === own.axis && s.at === own.at && dir === own.dir) continue;
        const lanes = s.kind === "arterial" ? [LANE.local, LANE.arterial] : [LANE.local];
        lanes.forEach((lo, li) => {
          const shift = rand(s.at, dir, li, 7) * period;
          const base = ((t * speedT * dir + shift) % period + period) % period;
          for (let a = Math.floor((a0 - base) / period) * period + base; a < a1; a += period) {
            if (a < s.from || a > s.to) continue;
            const p = pt(a, keepRight(dir) * lo), k = Math.round((a - base) / period);
            const tone = Math.floor(rand(s.at, k, dir, li) * 8);
            if (s.kind === "arterial" && li === 1 && tone === 3) buses.push({ id: `bus${s.id}:${dir}:${k}`, x: p.x, y: p.y, h: hd(dir), speed: speedT * 0.8 });
            else cars.push({ id: `car${s.id}:${dir}:${li}:${k}`, x: p.x, y: p.y, h: hd(dir), speed: speedT, colors: { paint: PAINT[tone % PAINT.length] } });
          }
        });
      }
      if (s.kind === "local" && rand(s.at, 77) > 0.4) for (const dir of [1, -1]) {
        if (s.axis === own.axis && s.at === own.at && dir === own.dir) continue;
        const per = 160, sp = 4.5, base = ((t * sp * dir + rand(s.at, dir) * per) % per + per) % per;
        for (let a = Math.floor((a0 - base) / per) * per + base; a < a1; a += per) {
          const p = pt(a, keepRight(dir) * 3.4), seed = Math.floor(rand(s.at, a) * 100);
          bikes.push({ id: `bike${s.id}:${dir}:${Math.round((a - base) / per)}`, x: p.x, y: p.y, h: hd(dir), speed: sp, phase: t * 5.2 + seed,
            colors: { shirt: SHIRT[seed % 3], pants: PANTS[seed % 2], skin: SKIN[seed % 3] } });
        }
      }
    }

    // What autonomy stopped for, placed where it is in the world.
    const ob = v.assist?.obstacle;
    const blink = Math.floor(t * 1.6) % 2 === 0 ? AMBER : LAMP_OFF;
    if (ob && v.assist) {
      const along = (m: number, lat: number) => ({ x: ob.x + Math.cos(ob.heading) * m - Math.sin(ob.heading) * lat, y: ob.y + Math.sin(ob.heading) * m + Math.cos(ob.heading) * lat });
      const id = `assist-${v.assist.id}`;
      switch (v.assist.kind) {
        case "blocked_lane": { const p = along(3, 0); trucks.push({ ...p, h: ob.heading, colors: { hazard: blink } }); this.detect(hits, id, "truck", "Truck", "double-parked, hazards on", p.x, p.y, ob.heading); break; }
        case "pedestrian": { const p = along(0, ((t * 0.6) % 6) - 3); peds.push({ id, ...p, h: ob.heading + Math.PI / 2, phase: t * 5, label: "Pedestrian", detail: "in crosswalk", colors: { shirt: SHIRT[1], pants: PANTS[0], skin: SKIN[1] } }); break; }
        case "construction": {
          for (let i = 0; i < 5; i++) { const p = along(i * 1.6 - 1, -1.4 + i * 0.7); cones.push({ ...p, h: 0 }); this.detect(hits, `${id}-c${i}`, "cone", "Cone", "static", p.x, p.y, 0); }
          const b = along(4.5, 0.4); barriers.push({ ...b, h: ob.heading, colors: { hazard: blink } }); this.detect(hits, `${id}-b`, "barrier", "Construction barrier", "lane closed", b.x, b.y, ob.heading);
          break;
        }
        case "unprotected_turn": { const p = along(4, -5.2); buses.push({ id, ...p, h: ob.heading, speed: 0, label: "Parked bus" }); break; }
      }
    }

    // Draw layers and collect detections.
    for (const c of cars) this.detect(hits, c.id, "car", c.speed > 0.5 ? "Car" : "Parked car", c.speed > 0.5 ? `${kmh(c.speed)} km/h` : "stationary", c.x, c.y, c.h);
    for (const b of buses) this.detect(hits, b.id, "bus", b.label ?? "Bus", b.speed > 0.5 ? `${kmh(b.speed)} km/h` : "stopped", b.x, b.y, b.h);
    for (const p of peds) this.detect(hits, p.id, "pedestrian", p.label ?? "Pedestrian", p.detail ?? "walking", p.x, p.y, p.h);
    for (const b of bikes) this.detect(hits, b.id, "cyclist", "Cyclist", `${kmh(b.speed)} km/h`, b.x, b.y, b.h);
    for (const s of nc.shelters) this.detect(hits, `stop-${s.name}`, "stopShelter", `Stop: ${s.name}`, "shuttle stop", s.x, s.y, s.h);
    const shuttles = others.filter((o) => o.id !== v.id && inRange(o.pose.x, o.pose.y, 260)).map((o) => {
      this.detect(hits, o.id, "shuttle", `Shuttle ${o.id}`, `${STATE_LABEL[o.control]} · ${kmh(o.speed)} km/h`, o.pose.x, o.pose.y, o.pose.heading);
      return { x: o.pose.x, y: o.pose.y, h: o.pose.heading, colors: { halo: HALO[o.control] } };
    });
    this.layers.car.set(cars); this.layers.bus.set(buses); this.layers.pedestrian.set(peds); this.layers.cyclist.set(bikes);
    this.layers.shuttle.set(shuttles); this.layers.truck.set(trucks); this.layers.cone.set(cones); this.layers.barrier.set(barriers);

    this.renderer.render(this.scene, this.camera);
    return hits;
  }

  /** Project an object's box (from the kit's dimensions) to the screen. */
  private detect(hits: Detection[], id: string, kind: string, label: string, detail: string, x: number, y: number, h: number) {
    const d = Math.hypot(x - this.camera.position.x, y - this.camera.position.z);
    if (d > 120) return;
    const [L, W, H] = kit.dims[kind as Kind] ?? [1, 1, 1];
    const c = Math.cos(h), s = Math.sin(h);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, front = 0;
    for (const a of [-L / 2, L / 2]) for (const b of [-W / 2, W / 2]) for (const z of [0, H]) {
      const p = this.toScreen(x + a * c - b * s, z, y + a * s + b * c);
      if (!p) continue;
      front++; x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
    if (front < 8) return;
    const el = this.renderer.domElement, w = el.clientWidth, hh = el.clientHeight;
    if (x1 < 0 || x0 > w || y1 < 0 || y0 > hh) return;
    hits.push({ id, kind, label, detail: `${Math.round(d)} m${detail ? ` · ${detail}` : ""}`, x, y, d, box: [x0, y0, x1, y1] });
  }

  /** World (map x, height, map y) to CSS pixels; null when behind the camera. */
  toScreen(x: number, z: number, y: number): [number, number] | null {
    const v = this.v3.set(x, z, y).applyMatrix4(this.camera.matrixWorldInverse);
    if (v.z > -0.3) return null;
    v.applyMatrix4(this.camera.projectionMatrix);
    const el = this.renderer.domElement;
    return [((v.x + 1) / 2) * el.clientWidth, ((1 - v.y) / 2) * el.clientHeight];
  }

  /** Screen point to a point on the road (map x, y), or null above the horizon. */
  toGround(sx: number, sy: number) {
    const el = this.renderer.domElement;
    this.ray.setFromCamera(new THREE.Vector2((sx / el.clientWidth) * 2 - 1, -(sy / el.clientHeight) * 2 + 1), this.camera);
    const hit = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (!hit || hit.distanceTo(this.camera.position) > 150) return null;
    return { x: hit.x, y: hit.z };
  }

  dispose() { this.renderer.dispose(); }
}

function rectPoly([x0, y0, x1, y1]: number[]): Poly { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }

/** Many flat quads merged into one mesh: a ground layer. Layers stack by height and polygon offset. */
function flat(quads: { poly: Poly; color: string }[], y: number, layer: number) {
  const pos: number[] = [], colr: number[] = [], nor: number[] = [];
  const c = new THREE.Color();
  for (const q of quads) {
    c.set(q.color);
    const p = q.poly;
    for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(p[i][0], y, p[i][1]); nor.push(0, 1, 0); colr.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer });
  return new THREE.Mesh(g, m);
}
