"""
teleop Wheel in context: one operator station, a row of stations, and a full operations room.

Run (from the repo root):
  /Applications/Blender.app/Contents/MacOS/Blender -b hardware/out_v6/model.blend -P hardware/context/scene.py -- OUT_DIR [--shots=desk,row,room] [--samples=96] [--res=1600x1000]

The wheel is the v6 model, placed unchanged as collection instances. Each instance carries its own
halo colour (custom property "halo", read by the halo material through an Instancer attribute), so a
room can show vehicles in autonomy (mint) and held by an operator (amber) at the same time.
The monitors show real screenshots of the console (context/tex/monitor.png, wall.png; see
software/scripts/shots.mjs). Units are millimetres, the operator sits on the −Y side of every desk.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(next((a for a in argv if not a.startswith("--")), os.path.join(HERE, "out")))
opt = {a[2:].split("=", 1)[0]: a.split("=", 1)[1] for a in argv if a.startswith("--") and "=" in a}
SHOTS = opt.get("shots", "desk,row,room").split(",")
SAMPLES = int(opt.get("samples", "96"))
RES = tuple(int(v) for v in opt.get("res", "1600x1000").split("x"))

MINT, AMBER, WHITE = (0.235, 0.902, 0.706), (1.0, 0.69, 0.125), (0.93, 0.94, 0.93)
DESK_Z, DESK_W, DESK_D = 740.0, 1600.0, 800.0

sc = bpy.context.scene
sc.unit_settings.system = "METRIC"
sc.unit_settings.scale_length = 0.001
sc.unit_settings.length_unit = "MILLIMETERS"


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


def coll(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    p = parent or sc.collection
    if c.name not in p.children:
        p.children.link(c)
    return c


def link(o, c):
    for u in list(o.users_collection):
        u.objects.unlink(o)
    c.objects.link(o)
    return o


# ── Materials ───────────────────────────────────────────────────────────────

def principled(name, color, rough=0.5, metal=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(color) if isinstance(color, str) else color
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Coat Weight"].default_value = coat
    return m


def wood(name):
    m = principled(name, "#C9A27A", rough=0.42, coat=0.15)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.0016, 0.012, 0.012)
    wv = nt.nodes.new("ShaderNodeTexWave")
    wv.wave_type = "RINGS"
    wv.inputs["Scale"].default_value = 1.6
    wv.inputs["Distortion"].default_value = 9.0
    wv.inputs["Detail"].default_value = 3.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = srgb("#B98F66")
    ramp.color_ramp.elements[1].color = srgb("#D8B48C")
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], wv.inputs["Vector"])
    nt.links.new(wv.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    return m


def screen_mat(name, image, strength=1.4):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(image)
    tex.interpolation = "Cubic"
    b.inputs["Base Color"].default_value = (0.004, 0.004, 0.005, 1)
    b.inputs["Roughness"].default_value = 0.35   # matte anti-glare, so the key light doesn't wash out the picture
    b.inputs["Coat Weight"].default_value = 0.0
    b.inputs["Specular IOR Level"].default_value = 0.08
    nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = strength
    return m


def emissive(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = srgb(color)
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    return m


M = {
    "wood": wood("Desk oak"),
    "leg": principled("Leg graphite powder coat", "#3A3E44", rough=0.45, metal=0.6),
    "plastic": principled("Monitor graphite PC", "#24272B", rough=0.38),
    "alloy": principled("Stand alloy", "#B9BEC4", rough=0.3, metal=1.0),
    "felt": principled("Divider felt", "#3A3E44", rough=0.95),
    "floor": principled("Floor concrete", "#8C8E8C", rough=0.55),
    "carpet": principled("Floor carpet tile", "#3B3F43", rough=0.95),
    "wall": principled("Wall paint", "#E4E2DC", rough=0.85),
    "ceiling": principled("Ceiling", "#EFEFEC", rough=0.9),
    "key": principled("Keyboard alloy", "#2C3136", rough=0.4, metal=0.3),
    "keycap": principled("Keycaps", "#1A1C1F", rough=0.55),
    "chair": principled("Chair mesh", "#1F2225", rough=0.85),
    "chairframe": principled("Chair frame", "#1C1E21", rough=0.4, metal=0.5),
    "light": emissive("Ceiling panel", "#FFF6EA", 7.0),
    "sky": emissive("Window daylight", "#DDE8F2", 2.6),
}
M["floor_room"] = M["carpet"]

# Halo: drive the emission colour from the instancing object's "halo" property.
halo = bpy.data.materials["Halo PMMA light guide (autonomy mint)"]
hb = halo.node_tree.nodes["Principled BSDF"]
attr = halo.node_tree.nodes.new("ShaderNodeAttribute")
attr.attribute_type = "INSTANCER"
attr.attribute_name = "halo"
halo.node_tree.links.new(attr.outputs["Color"], hb.inputs["Emission Color"])
halo.node_tree.links.new(attr.outputs["Color"], hb.inputs["Base Color"])
hb.inputs["Emission Strength"].default_value = 9.0


# ── Geometry helpers ────────────────────────────────────────────────────────

def mesh_obj(name, bm, mat, c):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return o


def rbox(name, size, center, mat, c, bevel=2.0, segs=3):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0] + center[0], v.co.y * size[1] + center[1], v.co.z * size[2] + center[2]))
    o = mesh_obj(name, bm, mat, c)
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = segs
        m.limit_method = "ANGLE"
        o.modifiers.new("wn", "WEIGHTED_NORMAL")
    return o


def cyl(name, r, h, center, mat, c, seg=40, bevel=1.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(center))
    o = mesh_obj(name, bm, mat, c)
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 2
        m.limit_method = "ANGLE"
    return o


def curved_panel(name, width, height, radius, front_y, zc, mat, c, thick=0.0, nu=64, uv=True, tilt_deg=0.0):
    """A panel bent around a vertical axis in front of it (concave toward −Y, toward the operator).
    `tilt_deg` leans the top back (toward +Y) about the bottom edge."""
    tilt = math.radians(tilt_deg)
    z0 = zc - height / 2
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    yc = front_y - radius
    rows = []
    for j in range(2):
        row = []
        for i in range(nu + 1):
            u = i / nu
            th = (u - 0.5) * width / radius
            y, dz = yc + radius * math.cos(th), j * height
            row.append(bm.verts.new((radius * math.sin(th), y + dz * math.sin(tilt), z0 + dz * math.cos(tilt))))
        rows.append(row)
    for i in range(nu):
        f = bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
        for lp, (uu, vv) in zip(f.loops, ((i / nu, 0), ((i + 1) / nu, 0), ((i + 1) / nu, 1), (i / nu, 1))):
            lp[uvl].uv = (1 - uu, vv) if False else (uu, vv)
    bm.normal_update()
    o = mesh_obj(name, bm, mat, c)
    # Faces should look toward the operator (−Y).
    if o.data.polygons[nu // 2].normal.y > 0:
        o.data.flip_normals()
    if thick:
        s = o.modifiers.new("solid", "SOLIDIFY")
        s.thickness = thick
        s.offset = -1.0 if o.data.polygons[nu // 2].normal.y < 0 else 1.0
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = 3.0
        b.segments = 3
        b.limit_method = "ANGLE"
    return o


# ── The wheel as an instanceable collection ─────────────────────────────────

wheel = coll("Wheel")
for o in list(sc.collection.objects):
    link(o, wheel)
for ch in list(sc.collection.children):
    if ch.name not in ("Wheel",):
        for o in list(ch.all_objects):
            if o.name not in wheel.objects:
                link(o, wheel)
        if ch.name != "Wheel":
            sc.collection.children.unlink(ch)


# ── One station, built at the origin ────────────────────────────────────────

def build_station():
    c = coll("Station")
    z = DESK_Z
    # Desk: oak top, graphite T-legs, felt divider behind.
    rbox("Desk_Top", (DESK_W, DESK_D, 28), (0, 0, z - 14), M["wood"], c, bevel=3)
    for sx in (-1, 1):
        x = sx * (DESK_W / 2 - 70)
        rbox(f"Desk_Leg_{sx}", (60, 60, z - 28 - 30), (x, 0, (z - 28) / 2 + 15), M["leg"], c, bevel=4)
        rbox(f"Desk_Foot_{sx}", (70, DESK_D - 80, 30), (x, 0, 15), M["leg"], c, bevel=6)
        rbox(f"Desk_Rail_{sx}", (60, DESK_D - 160, 40), (x, 0, z - 48), M["leg"], c, bevel=4)
    rbox("Desk_Beam", (DESK_W - 200, 40, 60), (0, 250, z - 60), M["leg"], c, bevel=4)
    rbox("Divider", (DESK_W, 30, 200), (0, DESK_D / 2 - 15, z + 100), M["felt"], c, bevel=10, segs=4)

    # Windshield-size display: 1.65 × 0.7 m, 3000R, top leaning back 8°, bottom edge 0.95 m and top
    # 1.65 m above the floor. From a seated eye at 1.2 m it fills −11° to +19°, like a car windshield,
    # with the Wheel's rim just overlapping the bottom edge the way a steering wheel overlaps the glass.
    W, H, R, TILT = 1650.0, 700.0, 3000.0, 8.0
    scr_y, scr_bottom = 550.0, 950.0
    t = math.radians(TILT)
    zc = scr_bottom + H / 2
    curved_panel("Display_Housing", W + 26, H + 26, R + 2, scr_y + 2, zc - 2 * math.cos(t), M["plastic"], c, thick=45, tilt_deg=TILT)
    scr = curved_panel("Display_Screen", W, H, R, scr_y, zc, MON, c, tilt_deg=TILT)
    scr.data.uv_layers.active.name = "UVMap"
    # Floor frame behind the desk: two graphite posts on feet, a cross rail, and a VESA plate.
    back_y = scr_y + 45 + H / 2 * math.sin(t) + 60
    for sx in (-1, 1):
        x = sx * 560
        rbox(f"Frame_Post_{sx}", (60, 60, 1450), (x, back_y + 30, 725), M["leg"], c, bevel=6)
        rbox(f"Frame_Foot_{sx}", (80, 560, 26), (x, back_y + 30, 13), M["leg"], c, bevel=6)
    rbox("Frame_Rail", (1180, 50, 80), (0, back_y + 30, zc), M["leg"], c, bevel=6)
    rbox("Display_Back", (520, 60, 340), (0, back_y - 25, zc), M["plastic"], c, bevel=20, segs=4)

    # Low-profile keyboard to the right of the wheel, for logging and tickets.
    rbox("Keyboard", (360, 118, 12), (360, -210, z + 6), M["key"], c, bevel=3)
    for r in range(5):
        for k in range(15):
            rbox(f"Key_{r}_{k}", (19, 17, 4), (360 - 154 + k * 22, -210 - 44 + r * 22, z + 13), M["keycap"], c, bevel=1.2, segs=2)
    rbox("Mouse", (62, 108, 30), (600, -200, z + 15), M["key"], c, bevel=14, segs=6)
    return c


MON = screen_mat("Monitor console", os.path.join(HERE, "tex", "monitor.png"))
station = build_station()


def chair_collection():
    """A task chair: rounded seat and a reclined mesh back on a spine, five-star base."""
    c = coll("Chair")
    rbox("Seat", (480, 460, 70), (0, 0, 470), M["chair"], c, bevel=32, segs=6)
    back = rbox("Back", (420, 50, 400), (0, 0, 0), M["chair"], c, bevel=40, segs=8)
    back.location = (0, -265, 820)
    back.rotation_euler.x = math.radians(-12)
    rbox("Back_Spine", (56, 36, 300), (0, -255, 580), M["chairframe"], c, bevel=12, segs=3)
    for sx in (-1, 1):
        rbox(f"Arm_Post_{sx}", (30, 40, 200), (sx * 235, -40, 560), M["chairframe"], c, bevel=8)
        rbox(f"Arm_Pad_{sx}", (70, 260, 30), (sx * 235, -20, 670), M["chair"], c, bevel=12, segs=4)
    cyl("Column", 24, 380, (0, 0, 250), M["chairframe"], c)
    for i in range(5):
        a = i * 2 * math.pi / 5
        o = rbox(f"Leg_{i}", (330, 40, 26), (0, 0, 0), M["chairframe"], c, bevel=8)
        o.rotation_euler.z = a
        o.location = (math.cos(a) * 165, math.sin(a) * 165, 60)
        cyl(f"Caster_{i}", 26, 40, (math.cos(a) * 320, math.sin(a) * 320, 26), M["chairframe"], c, seg=20)
    return c


chair = chair_collection()

# Hide the source collections; everything in the shots is an instance.
for c in (wheel, station, chair):
    sc.view_layers[0].layer_collection.children[c.name].exclude = True

placed = coll("Placed")


def place(src, loc, rot_z=0.0, halo_rgb=None, name=None):
    o = bpy.data.objects.new(name or f"{src.name}_inst", None)
    o.instance_type = "COLLECTION"
    o.instance_collection = src
    o.location = loc
    o.rotation_euler.z = rot_z
    if halo_rgb is not None:
        o["halo"] = halo_rgb
    placed.objects.link(o)
    return o


def place_station(x, y, rot_z=0.0, halo_rgb=MINT, chair_turn=0.0, chair_y=-820):
    s = place(station, (x, y, 0), rot_z)
    c, sn = math.cos(rot_z), math.sin(rot_z)
    off = lambda dx, dy: (x + dx * c - dy * sn, y + dx * sn + dy * c)
    wx, wy = off(-30, -170)
    place(wheel, (wx, wy, DESK_Z + 1), rot_z, halo_rgb)
    cx, cy = off(-40, chair_y)
    place(chair, (cx, cy, 0), rot_z + chair_turn)
    return s


def clear_placed():
    for o in list(placed.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(placed.children):
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(c)


# ── Room shell ──────────────────────────────────────────────────────────────

def room(x0, x1, y0, y1, h=3200.0, floor="carpet", windows_x=None, light_grid=(2400, 1800)):
    c = coll("Room", placed)
    rbox("Floor", (x1 - x0, y1 - y0, 20), ((x0 + x1) / 2, (y0 + y1) / 2, -10), M[floor], c, bevel=0)
    rbox("Ceiling", (x1 - x0, y1 - y0, 20), ((x0 + x1) / 2, (y0 + y1) / 2, h + 10), M["ceiling"], c, bevel=0)
    rbox("Wall_Back", (x1 - x0, 20, h), ((x0 + x1) / 2, y1 + 10, h / 2), M["wall"], c, bevel=0)
    rbox("Wall_Front", (x1 - x0, 20, h), ((x0 + x1) / 2, y0 - 10, h / 2), M["wall"], c, bevel=0)
    rbox("Wall_Right", (20, y1 - y0, h), (x1 + 10, (y0 + y1) / 2, h / 2), M["wall"], c, bevel=0)
    if windows_x is None:
        rbox("Wall_Left", (20, y1 - y0, h), (x0 - 10, (y0 + y1) / 2, h / 2), M["wall"], c, bevel=0)
    else:
        # A glazed wall: daylight panels between graphite mullions.
        rbox("Sill", (20, y1 - y0, 700), (x0 - 10, (y0 + y1) / 2, 350), M["wall"], c, bevel=0)
        rbox("Glow", (10, y1 - y0, h - 900), (x0 - 60, (y0 + y1) / 2, 700 + (h - 900) / 2), M["sky"], c, bevel=0)
        y = y0
        while y <= y1:
            rbox("Mullion", (60, 60, h - 700), (x0 - 10, y, 700 + (h - 700) / 2), M["leg"], c, bevel=2)
            y += 1500
    gx, gy = light_grid
    x = x0 + gx / 2
    while x < x1:
        y = y0 + gy / 2
        while y < y1:
            rbox("Light", (1200, 300, 12), (x, y, h - 6), M["light"], c, bevel=0)
            y += gy
        x += gx
    return c


# ── Camera, light and render ────────────────────────────────────────────────

def camera(loc, target, lens=35.0, name="Cam"):
    cam = bpy.data.objects.get(name) or bpy.data.objects.new(name, bpy.data.cameras.new(name))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cam.data.lens = lens
    cam.data.clip_start = 10
    cam.data.clip_end = 100000
    cam.location = loc
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    return cam


def dof(cam, target, fstop):
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = (Vector(target) - cam.location).length
    cam.data.dof.aperture_fstop = fstop


def area_light(name, loc, target, size, radiance, color=(1.0, 0.96, 0.9)):
    """Area light set by radiance, so it reads the same whatever the scene's length unit (here mm)."""
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
    l.data.size = size
    l.data.energy = radiance * math.pi * size * size
    l.data.color = color
    l.location = loc
    l.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    placed.objects.link(l)
    return l


def world(strength=0.25, color="#D9DCDF"):
    w = bpy.data.worlds.new("World") if not sc.world else sc.world
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = srgb(color)
    bg.inputs["Strength"].default_value = strength


def setup_render():
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = "GPU"
    except Exception as e:
        print("GPU unavailable, using CPU:", e)
        sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 8
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.render.image_settings.file_format = "PNG"


def render(name):
    os.makedirs(OUT, exist_ok=True)
    sc.render.filepath = os.path.join(OUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", sc.render.filepath)


setup_render()

# 1. One station: the wheel at the front edge of the desk, the console on the windshield-size display.
if "desk" in SHOTS:
    clear_placed()
    place_station(0, 0, chair_turn=0.35)
    room(-3200, 3200, -3600, 1600, windows_x=True, light_grid=(2400, 2000))
    world(0.3)
    area_light("Key", (-1800, -2200, 2400), (0, 0, DESK_Z), 1500, 60)
    area_light("Fill", (2200, -1400, 1600), (0, 0, DESK_Z), 1200, 20, (0.9, 0.95, 1.0))
    cam = camera((-1450, -1850, 1380), (60, 260, 1130), lens=30)
    dof(cam, (-30, -170, DESK_Z + 200), 5.6)
    render("station")

# 2. A row of four stations, two vehicles held by operators.
if "row" in SHOTS:
    clear_placed()
    halos = [MINT, AMBER, MINT, MINT]
    for i, h in enumerate(halos):
        place_station((i - 1.5) * 1700, 0, halo_rgb=h, chair_turn=(0.5, -0.45, 0.35, -0.55)[i], chair_y=-600)
    room(-5000, 5000, -4200, 1600, windows_x=True, light_grid=(2400, 2000))
    world(0.3)
    area_light("Key", (-4200, -3000, 2800), (0, 0, DESK_Z), 2500, 34)
    area_light("Fill", (3500, -2600, 2200), (0, 0, DESK_Z), 2000, 15, (0.9, 0.95, 1.0))
    cam = camera((-3300, -3900, 1900), (700, 300, 1050), lens=30)
    dof(cam, (-1300, -170, DESK_Z + 150), 8.0)
    render("row")

# 3. The operations room: five rows of five stations facing a video wall with the live fleet map.
if "room" in SHOTS:
    clear_placed()
    import random
    rnd = random.Random(14)
    rows, cols, dx, dy = 5, 5, 1750, 2700
    for r in range(rows):
        for k in range(cols):
            roll = rnd.random()
            h = AMBER if roll < 0.18 else WHITE if roll < 0.22 else MINT
            place_station((k - (cols - 1) / 2) * dx, -r * dy, halo_rgb=h, chair_turn=rnd.uniform(-0.4, 0.4))
    x0, x1 = -(cols / 2) * dx - 1600, (cols / 2) * dx + 1600
    y0, y1 = -(rows - 1) * dy - 2600, 3200
    rc = room(x0, x1, y0, y1, h=3600, windows_x=True, light_grid=(2200, 2300))
    # Video wall on the front wall, the fleet overview.
    wall_mat = screen_mat("Video wall", os.path.join(HERE, "tex", "wall.png"), strength=2.0)
    # Raised so it clears the rows of windshield displays in front of it.
    vw = curved_panel("VideoWall", 6400, 2400, 60000, y1 - 120, 2300, wall_mat, rc)
    rbox("VideoWall_Frame", (6500, 60, 2500), (0, y1 - 60, 2300), M["plastic"], rc, bevel=6)
    world(0.25)
    cam = camera((x1 - 600, y0 + 700, 3300), (-900, 2600, 900), lens=24)
    cam.data.shift_y = -0.16   # drop the frame (not the view direction) so the ceiling doesn't dominate
    render("room")

print("DONE")
