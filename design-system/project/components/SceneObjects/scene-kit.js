/* teleop scene kit: the standard 3D objects for camera views, renders and previews.
 *
 * Usage:  window.teleop.createSceneKit(THREE)  →  { palette, dims, templates, pose, facadeMaterial, materials }
 * Works with any three.js r150+. Load it as a classic script or import it for its side effect.
 *
 * Every template follows one spec:
 *   - units are metres; origin is on the ground at the object's centre; +Y is up
 *   - the object faces +X (its right side is +Z), so heading h maps to rotation.y = -h
 *   - meshes that take a per-instance colour carry userData.colorKey ("paint", "shirt", "pants", "skin", "halo", "hazard")
 *   - one restrained palette; variety comes from a few paints and outfits, never from new hues
 *   - every object casts a soft contact shadow (a transparent plane), so scenes need no shadow maps
 */
(function (root) {
  function createSceneKit(THREE) {
    // ── Palette: mirrors tokens.json → scene ───────────────────────────────
    var P = {
      paint: ["#8E959C", "#2E3338", "#D9DAD6", "#4A6178"],            // silver, carbon, white, slate blue
      shirt: ["#5E7896", "#A85A4C", "#D4D0C6"], pants: ["#2B3038", "#4E4A44"], skin: ["#E3B999", "#B07E5C", "#6E4B39"],
      glass: "#1B232A", tire: "#17191B", rim: "#A7ADB3", trim: "#202326", headlight: "#F4F0DE", taillight: "#C3301F", amber: "#E8A33A",
      busBody: "#3B5872", busStripe: "#E9EAE6", busSign: "#E0A93A",
      shuttleBody: "#E9EAE6", shuttleSkirt: "#24272B", lidar: "#2A2E33",
      truckCab: "#DADBD6", cargo: "#8C949B", chassis: "#1E2124",
      cone: "#E5782C", reflective: "#F2F2EC",
      foliage: ["#3F5A47", "#4C6B52"], trunk: "#5A4A3E", pole: "#6E777F", lamp: "#F6E7C2",
      shelterFrame: "#4A5158", shelterGlass: "#9FB2BF", sign: "#E9EAE6", signBand: "#24272B",
      building: ["#5A6068", "#676D74", "#50565D", "#727880"], window: "#1E262D", windowLit: "#C9AE7E", roof: "#3A3F44",
      halo: { autonomy: "#3CE6B4", operator: "#FFB020", transitioning: "#EEF0EE", stopped: "#D02B21" },
    };

    // Bounding boxes for hit-testing and labels: length (X), width (Z), height (Y).
    var dims = {
      car: [4.5, 1.86, 1.48], bus: [12, 2.55, 3.25], truck: [8.2, 2.5, 3.45], shuttle: [6.8, 2.3, 2.95],
      pedestrian: [0.5, 0.55, 1.76], cyclist: [1.75, 0.6, 1.75], cone: [0.42, 0.42, 0.74], barrier: [0.5, 1.7, 1.15],
      tree: [3.4, 3.4, 6.2], streetLight: [1.6, 0.4, 7.6], stopShelter: [3.4, 1.6, 2.6],
    };

    // ── Materials (shared) ───────────────────────────────────────────────
    function std(color, rough, metal, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: rough, metalness: metal || 0 }, extra || {})); }
    function basic(color) { return new THREE.MeshBasicMaterial({ color: color }); }
    var M = {
      paint: std("#FFFFFF", 0.38, 0.35), glass: std(P.glass, 0.08, 0.6), tire: std(P.tire, 0.92, 0), rim: std(P.rim, 0.35, 0.85),
      trim: std(P.trim, 0.7, 0.1), headlight: basic(P.headlight), taillight: basic(P.taillight), hazard: basic("#FFFFFF"),
      busBody: std(P.busBody, 0.45, 0.25), busStripe: std(P.busStripe, 0.5, 0.1), busSign: basic(P.busSign),
      shuttleBody: std(P.shuttleBody, 0.32, 0.15), shuttleSkirt: std(P.shuttleSkirt, 0.6, 0.1), halo: basic("#FFFFFF"), lidar: std(P.lidar, 0.4, 0.5),
      truckCab: std(P.truckCab, 0.4, 0.25), cargo: std(P.cargo, 0.6, 0.15), chassis: std(P.chassis, 0.8, 0.2),
      cone: std(P.cone, 0.55, 0), reflective: std(P.reflective, 0.25, 0.1), coneBase: std("#2A2D30", 0.9, 0),
      clothes: std("#FFFFFF", 0.85, 0), skin: std("#FFFFFF", 0.7, 0), hair: std("#2B2421", 0.8, 0), shoe: std("#1D1F22", 0.7, 0),
      foliage0: std(P.foliage[0], 0.95, 0, { flatShading: true }), foliage1: std(P.foliage[1], 0.95, 0, { flatShading: true }), trunk: std(P.trunk, 0.95, 0),
      pole: std(P.pole, 0.5, 0.6), lamp: basic(P.lamp),
      shelterFrame: std(P.shelterFrame, 0.45, 0.6), shelterGlass: std(P.shelterGlass, 0.05, 0.3, { transparent: true, opacity: 0.28, depthWrite: false }),
      sign: std(P.sign, 0.5, 0.1), signBand: std(P.signBand, 0.6, 0.1), frame: std("#3A3F44", 0.5, 0.6),
    };
    var shadowTex = (function () {
      var c = document.createElement("canvas"); c.width = c.height = 64;
      var g = c.getContext("2d"), grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
      grd.addColorStop(0, "rgba(0,0,0,0.55)"); grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    M.shadow = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    var stripeTex = (function () {
      var c = document.createElement("canvas"); c.width = 128; c.height = 16;
      var g = c.getContext("2d"); g.fillStyle = P.reflective; g.fillRect(0, 0, 128, 16); g.fillStyle = P.cone;
      for (var i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 16, 16); g.lineTo(i * 16 + 8, 16); g.lineTo(i * 16 + 16, 0); g.lineTo(i * 16 + 8, 0); g.fill(); }
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    M.barrierBoard = std("#FFFFFF", 0.4, 0, { map: stripeTex });

    // ── Geometry helpers ─────────────────────────────────────────────────
    function mesh(geo, mat, key, name) { var m = new THREE.Mesh(geo, mat); if (key) m.userData.colorKey = key; if (name) m.name = name; return m; }
    function at(obj, x, y, z) { obj.position.set(x, y, z); return obj; }
    function box(l, h, w) { return new THREE.BoxGeometry(l, h, w); }
    function rrectShape(w, h, r) {
      var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
      s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
    }
    /** A side profile (x forward, y up) extruded across the width, centred on Z. */
    function side(shape, width, bevel) {
      var b = bevel || 0;
      var g = new THREE.ExtrudeGeometry(shape, { depth: width - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 10 });
      g.translate(0, 0, -(width - 2 * b) / 2); return g;
    }
    /** A plan shape (x forward, y across) extruded upward from y0 to y0+height. */
    function plan(shape, y0, height, bevel) {
      var b = bevel || 0;
      var g = new THREE.ExtrudeGeometry(shape, { depth: height - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 12 });
      g.rotateX(-Math.PI / 2); g.translate(0, y0 + b, 0); return g;
    }
    /** A rounded box in plan, l × w with corner radius r, from y0 to y0+h. The bevel is inside these dimensions. */
    function pod(l, w, r, y0, h, bevel) {
      var b = bevel || 0;
      return plan(rrectShape(l - 2 * b, w - 2 * b, Math.max(0.01, r - b)), y0, h, b);
    }
    function wheel(r, w, x, z, rimR) {
      var g = new THREE.Group();
      var tire = mesh(new THREE.CylinderGeometry(r, r, w, 22), M.tire); tire.rotation.x = Math.PI / 2; g.add(tire);
      var rim = mesh(new THREE.CylinderGeometry(rimR || r * 0.58, rimR || r * 0.58, w + 0.012, 18), M.rim); rim.rotation.x = Math.PI / 2; g.add(rim);
      var hub = mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, w + 0.03, 10), M.trim); hub.rotation.x = Math.PI / 2; g.add(hub);
      return at(g, x, r, z);
    }
    function shadow(l, w) { var m = mesh(new THREE.PlaneGeometry(l, w), M.shadow); m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.renderOrder = 1; return m; }
    function tube(a, b, r, mat) {
      var A = new THREE.Vector3().fromArray(a), B = new THREE.Vector3().fromArray(b), len = A.distanceTo(B);
      var m = mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); return m;
    }
    function limb(r, len, mat, key) { var g = new THREE.Group(); var c = mesh(new THREE.CapsuleGeometry(r, len, 3, 10), mat, key); c.position.y = -len / 2 - r * 0.6; g.add(c); return g; }

    // ── Templates ────────────────────────────────────────────────────────
    function car() {
      var g = new THREE.Group(); g.name = "car";
      // Body: a side profile with wheel arches, extruded across the width.
      var s = new THREE.Shape();
      s.moveTo(-2.05, 0.3); s.lineTo(-1.8, 0.3); s.absarc(-1.38, 0.34, 0.41, Math.PI, 0, true); s.lineTo(0.98, 0.3);
      s.absarc(1.4, 0.34, 0.41, Math.PI, 0, true); s.lineTo(2.1, 0.3); s.quadraticCurveTo(2.26, 0.32, 2.26, 0.55); s.lineTo(2.22, 0.8);
      s.quadraticCurveTo(2.16, 0.93, 1.9, 0.96); s.lineTo(0.85, 1.0); s.lineTo(-1.62, 1.0); s.lineTo(-2.1, 0.96);
      s.quadraticCurveTo(-2.26, 0.9, -2.26, 0.7); s.lineTo(-2.22, 0.45); s.quadraticCurveTo(-2.2, 0.3, -2.05, 0.3);
      g.add(mesh(side(s, 1.84, 0.05), M.paint, "paint", "body"));
      // Greenhouse glass and the roof over it.
      var gl = new THREE.Shape(); gl.moveTo(0.86, 0.99); gl.lineTo(0.12, 1.4); gl.lineTo(-1.0, 1.42); gl.lineTo(-1.62, 0.99); gl.lineTo(0.86, 0.99);
      g.add(mesh(side(gl, 1.6, 0.02), M.glass));
      var rf = new THREE.Shape(); rf.moveTo(0.16, 1.385); rf.lineTo(0.08, 1.445); rf.lineTo(-0.98, 1.46); rf.lineTo(-1.04, 1.4); rf.lineTo(0.16, 1.385);
      g.add(mesh(side(rf, 1.5, 0.03), M.paint, "paint"));
      g.add(at(mesh(box(0.09, 0.41, 1.63), M.paint, "paint"), -0.38, 1.2, 0));                         // B-pillar
      // Lights, grille, bumpers, mirrors.
      [-0.62, 0.62].forEach(function (z) {
        g.add(at(mesh(box(0.06, 0.1, 0.34), M.headlight), 2.22, 0.76, z));
        g.add(at(mesh(box(0.06, 0.1, 0.36), M.taillight), -2.24, 0.82, z));
        g.add(at(mesh(box(0.2, 0.08, 0.1), M.trim), 0.72, 1.04, z * 1.5));
      });
      g.add(at(mesh(box(0.05, 0.14, 0.7), M.trim), 2.245, 0.56, 0));
      g.add(at(mesh(box(0.12, 0.12, 1.8), M.trim), 2.2, 0.36, 0));
      g.add(at(mesh(box(0.12, 0.12, 1.8), M.trim), -2.22, 0.38, 0));
      [[1.4, 0.83], [1.4, -0.83], [-1.38, 0.83], [-1.38, -0.83]].forEach(function (p) { g.add(wheel(0.33, 0.22, p[0], p[1])); });
      g.add(shadow(5.2, 2.6));
      return g;
    }

    function bus() {
      var g = new THREE.Group(); g.name = "bus";
      g.add(mesh(pod(12, 2.55, 0.34, 0.42, 2.82, 0.1), M.busBody));
      g.add(mesh(pod(11.7, 2.57, 0.33, 1.32, 1.18, 0), M.glass));                                        // window band, all round
      g.add(mesh(pod(12.02, 2.565, 0.35, 0.82, 0.12, 0), M.busStripe));                                  // livery stripe
      g.add(at(mesh(box(0.04, 0.24, 1.9), M.busSign), 6.0, 2.82, 0));                                    // destination sign
      g.add(at(mesh(box(0.05, 1.5, 2.2), M.glass), 5.99, 1.85, 0));                                      // windscreen
      [4.55, 0.6].forEach(function (x) { g.add(at(mesh(box(1.1, 2.1, 0.03), M.glass), x, 1.5, 1.29)); }); // doors, kerb side
      g.add(at(mesh(box(2.6, 0.32, 1.6), M.busBody), -1.5, 3.4, 0));                                     // roof AC
      [-0.8, 0.8].forEach(function (z) {
        g.add(at(mesh(box(0.05, 0.16, 0.3), M.headlight), 6.0, 0.72, z));
        g.add(at(mesh(box(0.05, 0.3, 0.16), M.taillight), -6.0, 0.95, z * 1.3));
      });
      [[4.0, 1], [4.0, -1], [-3.6, 1], [-3.6, -1]].forEach(function (p) { g.add(wheel(0.5, 0.32, p[0], p[1] * 1.0, 0.3)); });
      g.add(shadow(13, 3.4));
      return g;
    }

    function truck() {
      var g = new THREE.Group(); g.name = "truck";
      g.add(at(mesh(box(8.0, 0.25, 1.0), M.chassis), -0.1, 0.62, 0));
      g.add(mesh(pod(5.9, 2.5, 0.1, 0.75, 2.7, 0.05), M.cargo));
      g.children[g.children.length - 1].position.x = -1.1;
      var cab = new THREE.Shape(); cab.moveTo(-1.05, 0); cab.lineTo(0.95, 0); cab.lineTo(1.05, 0.95); cab.lineTo(0.75, 2.05); cab.lineTo(-1.05, 2.15); cab.lineTo(-1.05, 0);
      var cabG = side(cab, 2.4, 0.06); cabG.translate(3.0, 0.5, 0); g.add(mesh(cabG, M.truckCab));
      var ws = new THREE.Shape(); ws.moveTo(1.02, 1.12); ws.lineTo(0.8, 1.98); ws.lineTo(0.05, 2.05); ws.lineTo(0.05, 1.12); ws.lineTo(1.02, 1.12);
      var wsG = side(ws, 2.43, 0.02); wsG.translate(3.0, 0.5, 0); g.add(mesh(wsG, M.glass));
      g.add(at(mesh(box(0.06, 0.9, 2.42), M.truckCab), 3.45, 2.05, 0));                                // pillar between side windows
      g.add(at(mesh(box(0.1, 0.18, 2.1), M.trim), 4.08, 0.62, 0));                                     // bumper
      [-1, 1].forEach(function (z) {
        g.add(at(mesh(box(0.05, 0.14, 0.3), M.headlight), 4.08, 0.95, z * 0.85));
        g.add(at(mesh(box(0.12, 0.12, 0.12), M.hazard, "hazard"), 4.04, 1.22, z * 1.12));
        g.add(at(mesh(box(0.06, 0.12, 0.12), M.hazard, "hazard"), -4.08, 1.0, z * 1.1));
        g.add(at(mesh(box(0.06, 0.2, 0.14), M.taillight), -4.08, 0.78, z * 1.1));
      });
      [[3.1, 1.03], [3.1, -1.03], [-2.4, 1.03], [-2.4, -1.03], [-3.4, 1.03], [-3.4, -1.03]].forEach(function (p) { g.add(wheel(0.48, 0.3, p[0], p[1], 0.28)); });
      g.add(shadow(9.2, 3.2));
      return g;
    }

    /** The teleop Gen 2 shuttle: robot white, wraparound glass, and a halo strip that carries control state. */
    function shuttle() {
      var g = new THREE.Group(); g.name = "shuttle";
      g.add(mesh(pod(6.8, 2.3, 0.6, 0.42, 2.5, 0.14), M.shuttleBody));
      g.add(mesh(pod(6.82, 2.32, 0.6, 1.18, 1.22, 0), M.glass));                                         // wraparound glass
      g.add(mesh(pod(6.81, 2.31, 0.6, 0.4, 0.22, 0), M.shuttleSkirt));
      g.add(mesh(pod(6.82, 2.32, 0.6, 2.52, 0.08, 0), M.halo, "halo"));                                  // halo strip = ControlState
      g.add(at(mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.2, 20), M.lidar), 0, 3.0, 0));
      [[3.25, 0.9], [3.25, -0.9], [-3.25, 0.9], [-3.25, -0.9]].forEach(function (p) { g.add(at(mesh(box(0.14, 0.14, 0.14), M.lidar), p[0], 2.78, p[1])); });
      [-0.7, 0.7].forEach(function (z) {
        g.add(at(mesh(box(0.05, 0.08, 0.5), M.headlight), 3.42, 0.86, z));
        g.add(at(mesh(box(0.05, 0.08, 0.5), M.taillight), -3.42, 0.86, z));
      });
      [[2.35, 1.0], [2.35, -1.0], [-2.35, 1.0], [-2.35, -1.0]].forEach(function (p) { g.add(wheel(0.42, 0.26, p[0], p[1])); });
      g.add(shadow(7.6, 3.1));
      return g;
    }

    function pedestrian() {
      var g = new THREE.Group(); g.name = "pedestrian";
      var hips = 0.93;
      [-1, 1].forEach(function (s) {
        var leg = limb(0.075, 0.74, M.clothes, "pants"); leg.name = s < 0 ? "legL" : "legR"; at(leg, 0, hips, s * 0.1);
        var shoe = at(mesh(box(0.24, 0.08, 0.11), M.shoe), 0.04, -0.89, 0); leg.add(shoe); g.add(leg);
        var arm = limb(0.05, 0.52, M.clothes, "shirt"); arm.name = s < 0 ? "armL" : "armR"; at(arm, 0, 1.42, s * 0.23); g.add(arm);
      });
      var torso = mesh(new THREE.CapsuleGeometry(0.17, 0.36, 4, 12), M.clothes, "shirt"); torso.scale.set(0.72, 1, 1); at(torso, 0, 1.2, 0); g.add(torso);
      g.add(at(mesh(new THREE.SphereGeometry(0.11, 16, 12), M.skin, "skin"), 0.01, 1.64, 0));
      var hair = mesh(new THREE.SphereGeometry(0.115, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.hair); at(hair, -0.01, 1.66, 0); g.add(hair);
      g.add(shadow(0.9, 0.9));
      return g;
    }

    function cyclist() {
      var g = new THREE.Group(); g.name = "cyclist";
      [-0.52, 0.52].forEach(function (x) {
        g.add(at(mesh(new THREE.TorusGeometry(0.33, 0.028, 8, 28), M.tire), x, 0.35, 0));
        g.add(at(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 10), M.rim), x, 0.35, 0).rotateX(Math.PI / 2));
      });
      var frame = M.frame;
      [[[-0.52, 0.35, 0], [0, 0.32, 0]], [[0, 0.32, 0], [-0.12, 0.88, 0]], [[-0.52, 0.35, 0], [-0.12, 0.88, 0]], [[0, 0.32, 0], [0.42, 0.86, 0]],
        [[-0.12, 0.84, 0], [0.42, 0.86, 0]], [[0.52, 0.35, 0], [0.42, 0.96, 0]]].forEach(function (s) { g.add(tube(s[0], s[1], 0.022, frame)); });
      g.add(at(mesh(box(0.22, 0.04, 0.1), M.trim), -0.14, 0.92, 0));                                  // saddle
      g.add(at(mesh(box(0.04, 0.04, 0.5), M.trim), 0.42, 0.98, 0));                                   // bars
      var torso = mesh(new THREE.CapsuleGeometry(0.16, 0.34, 4, 10), M.clothes, "shirt"); torso.scale.set(1, 1, 0.75);
      torso.position.set(0.1, 1.22, 0); torso.rotation.z = -0.85; g.add(torso);
      g.add(tube([0.25, 1.38, 0.18], [0.42, 0.98, 0.22], 0.045, M.clothes)); g.children[g.children.length - 1].userData.colorKey = "shirt";
      g.add(tube([0.25, 1.38, -0.18], [0.42, 0.98, -0.22], 0.045, M.clothes)); g.children[g.children.length - 1].userData.colorKey = "shirt";
      g.add(at(mesh(new THREE.SphereGeometry(0.11, 14, 10), M.skin, "skin"), 0.36, 1.5, 0));
      g.add(at(mesh(new THREE.SphereGeometry(0.13, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.trim), 0.35, 1.53, 0));
      ["L", "R"].forEach(function (s) {
        var th = mesh(new THREE.CapsuleGeometry(0.06, 0.36, 3, 8), M.clothes, "pants"); th.name = "thigh" + s; g.add(th);
        var sh = mesh(new THREE.CapsuleGeometry(0.05, 0.38, 3, 8), M.clothes, "pants"); sh.name = "shin" + s; g.add(sh);
      });
      pose.cyclist(g, 0);
      g.add(shadow(2, 0.8));
      return g;
    }

    function cone() {
      var g = new THREE.Group(); g.name = "cone";
      g.add(at(mesh(box(0.42, 0.03, 0.42), M.coneBase), 0, 0.015, 0));
      var prof = [[0.17, 0.03], [0.15, 0.12], [0.045, 0.72], [0, 0.74]].map(function (p) { return new THREE.Vector2(p[0], p[1]); });
      g.add(mesh(new THREE.LatheGeometry(prof, 24), M.cone));
      var band = [[0.118, 0.3], [0.1, 0.42]].map(function (p) { return new THREE.Vector2(p[0] + 0.004, p[1]); });
      g.add(mesh(new THREE.LatheGeometry(band, 24), M.reflective));
      g.add(shadow(0.7, 0.7));
      return g;
    }

    function barrier() {
      var g = new THREE.Group(); g.name = "barrier";
      [-0.72, 0.72].forEach(function (z) {
        g.add(tube([-0.24, 0, z], [0, 1.0, z], 0.025, M.frame)); g.add(tube([0.24, 0, z], [0, 1.0, z], 0.025, M.frame));
      });
      g.add(at(mesh(box(0.04, 0.24, 1.66), M.barrierBoard), 0.02, 0.86, 0));
      g.add(at(mesh(box(0.04, 0.24, 1.66), M.barrierBoard), 0.02, 0.5, 0));
      g.add(at(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), M.hazard, "hazard"), 0, 1.07, 0.7));
      g.add(shadow(0.9, 2.0));
      return g;
    }

    function tree() {
      var g = new THREE.Group(); g.name = "tree";
      g.add(at(mesh(new THREE.CylinderGeometry(0.11, 0.17, 3.0, 8), M.trunk), 0, 1.5, 0));
      g.add(at(mesh(new THREE.IcosahedronGeometry(1.55, 1), M.foliage0), 0, 4.1, 0));
      g.add(at(mesh(new THREE.IcosahedronGeometry(1.15, 1), M.foliage1), 0.7, 3.6, 0.45));
      g.add(at(mesh(new THREE.IcosahedronGeometry(1.05, 1), M.foliage1), -0.6, 4.6, -0.35));
      g.add(shadow(3.6, 3.6));
      return g;
    }

    function streetLight() {
      var g = new THREE.Group(); g.name = "streetLight";
      g.add(at(mesh(new THREE.CylinderGeometry(0.07, 0.1, 7.4, 10), M.pole), 0, 3.7, 0));
      g.add(tube([0, 7.2, 0], [0, 7.45, -1.3], 0.05, M.pole));
      g.add(at(mesh(box(0.34, 0.12, 0.62), M.pole), 0, 7.42, -1.45));
      g.add(at(mesh(box(0.26, 0.03, 0.5), M.lamp), 0, 7.35, -1.45));
      g.add(shadow(0.8, 0.8));
      return g;
    }

    function stopShelter() {
      var g = new THREE.Group(); g.name = "stopShelter";
      [[-1.6, -0.7], [1.6, -0.7], [-1.6, 0.6], [1.6, 0.6]].forEach(function (p) { g.add(at(mesh(box(0.07, 2.4, 0.07), M.shelterFrame), p[0], 1.2, p[1])); });
      g.add(at(mesh(box(3.5, 0.08, 1.6), M.shelterFrame), 0, 2.43, -0.05));
      g.add(at(mesh(box(3.2, 2.0, 0.02), M.shelterGlass), 0, 1.25, -0.7));
      [-1.6, 1.6].forEach(function (x) { g.add(at(mesh(box(0.02, 2.0, 1.2), M.shelterGlass), x, 1.25, -0.05)); });
      g.add(at(mesh(box(2.4, 0.06, 0.4), M.trim), 0, 0.48, -0.45));
      g.add(at(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.9, 8), M.pole), 2.1, 1.45, 0.55));
      g.add(at(mesh(box(0.04, 0.5, 0.5), M.sign), 2.1, 2.7, 0.55));
      g.add(at(mesh(box(0.045, 0.1, 0.5), M.signBand), 2.1, 2.84, 0.55));
      g.add(shadow(4.0, 2.2));
      return g;
    }

    // ── Poses (animation) ────────────────────────────────────────────────
    var pose = {
      /** phase in radians; one stride is 2π. */
      pedestrian: function (g, phase) {
        var s = Math.sin(phase);
        g.getObjectByName("legL").rotation.z = s * 0.5; g.getObjectByName("legR").rotation.z = -s * 0.5;
        g.getObjectByName("armL").rotation.z = -s * 0.42; g.getObjectByName("armR").rotation.z = s * 0.42;
      },
      /** crank angle in radians. Legs solve a two-bone IK from hip to pedal. */
      cyclist: function (g, crank) {
        var hip = new THREE.Vector2(-0.1, 0.96), bb = new THREE.Vector2(0, 0.32), L1 = 0.44, L2 = 0.45;
        [["L", 0, 0.12], ["R", Math.PI, -0.12]].forEach(function (leg) {
          var a = crank + leg[1], foot = new THREE.Vector2(bb.x + Math.cos(a) * 0.17, bb.y + Math.sin(a) * 0.17);
          var d = Math.min(L1 + L2 - 0.001, hip.distanceTo(foot)), base = Math.atan2(foot.y - hip.y, foot.x - hip.x);
          var k = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)), th = base + k;            // knee forward
          var knee = new THREE.Vector2(hip.x + Math.cos(th) * L1, hip.y + Math.sin(th) * L1);
          var thigh = g.getObjectByName("thigh" + leg[0]), shin = g.getObjectByName("shin" + leg[0]);
          thigh.position.set((hip.x + knee.x) / 2, (hip.y + knee.y) / 2, leg[2]); thigh.rotation.set(0, 0, th - Math.PI / 2);
          var ts = Math.atan2(foot.y - knee.y, foot.x - knee.x);
          shin.position.set((knee.x + foot.x) / 2, (knee.y + foot.y) / 2, leg[2]); shin.rotation.set(0, 0, ts - Math.PI / 2);
        });
      },
    };

    // ── Building facade: windows and storefronts from world position, no textures ─────
    function facadeMaterial() {
      var m = new THREE.MeshStandardMaterial({ color: "#FFFFFF", roughness: 0.82, metalness: 0.05 });
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uWindow = { value: new THREE.Color(P.window) }; sh.uniforms.uLit = { value: new THREE.Color(P.windowLit) }; sh.uniforms.uRoof = { value: new THREE.Color(P.roof) };
        sh.vertexShader = "varying vec3 vWP; varying vec3 vWN;\n" + sh.vertexShader.replace("#include <begin_vertex>", [
          "#include <begin_vertex>",
          "vec4 wp = vec4(transformed, 1.0); vec3 wn = objectNormal;",
          "#ifdef USE_INSTANCING", "wp = instanceMatrix * wp; wn = mat3(instanceMatrix) * wn;", "#endif",
          "vWP = (modelMatrix * wp).xyz; vWN = normalize(mat3(modelMatrix) * wn);"].join("\n"));
        sh.fragmentShader = "varying vec3 vWP; varying vec3 vWN; uniform vec3 uWindow; uniform vec3 uLit; uniform vec3 uRoof;\n" +
          "float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n" +
          sh.fragmentShader
            .replace("#include <color_fragment>", [
              "#include <color_fragment>",
              "float litMask = 0.0;",
              "if (abs(vWN.y) > 0.5) { diffuseColor.rgb = uRoof; }",
              "else {",
              "  float along = abs(vWN.x) > abs(vWN.z) ? vWP.z : vWP.x;",
              "  if (vWP.y < 3.2) {",
              "    float u = fract(along / 4.0);",
              "    if (vWP.y > 0.35 && vWP.y < 2.9 && u > 0.06 && u < 0.94) diffuseColor.rgb = mix(uWindow, vec3(0.32, 0.38, 0.42), 0.25);",
              "  } else {",
              "    float u = fract(along / 2.6), v = fract((vWP.y - 3.2) / 3.4);",
              "    if (u > 0.16 && u < 0.84 && v > 0.22 && v < 0.82) {",
              "      vec2 cell = vec2(floor(along / 2.6), floor((vWP.y - 3.2) / 3.4));",
              "      float r = h21(cell + floor(vWN.xz * 3.0));",
              "      diffuseColor.rgb = uWindow; litMask = step(0.93, r);",
              "    } else if (v < 0.06) { diffuseColor.rgb *= 0.86; }",
              "  }",
              "}"].join("\n"))
            .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uLit * litMask * 0.45;");
      };
      return m;
    }

    var templates = { car: car, bus: bus, truck: truck, shuttle: shuttle, pedestrian: pedestrian, cyclist: cyclist, cone: cone, barrier: barrier, tree: tree, streetLight: streetLight, stopShelter: stopShelter };
    return { palette: P, dims: dims, templates: templates, pose: pose, facadeMaterial: facadeMaterial, materials: M };
  }

  root.teleop = root.teleop || {};
  root.teleop.createSceneKit = createSceneKit;
})(typeof window !== "undefined" ? window : globalThis);
