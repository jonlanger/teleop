"""
teleop Wheel — animation rig.

Rigid-part rig built from empties, so it survives glTF export as a plain node hierarchy:

  RIG_Root                       turntable (Z)
  ├─ RIG_Base                    base, barrel caps, feet, prints, internals
  └─ RIG_Tilt          @ hinge   tilt about local X (+ = less tilt, − = more)
     ├─ column covers, motor, knuckle, tilt index
     └─ RIG_SteerFrame @ wheel centre, oriented to the wheel (local Z = wheel axis toward the operator)
        └─ RIG_Steer             steering about local Z
           ├─ shells, grips, halo, faceplate, carriers, hub internals …
           ├─ KEY_<name>         one per key: press = translate along local −Z
           ├─ KEY_DPad           rock about local X / Y
           ├─ KEY_Stick          gimbal about local X / Y (cap + dome)
           ├─ KEY_EStop          press, latch, twist-release about local Z
           └─ PADDLE_L / _R      pull about local Y at the pivot

Clips are NLA tracks with the same name on every animated empty, so the glTF exporter
(export_animation_mode="NLA_TRACKS") writes one named animation per clip.

Light cues for the halo (and console) are a separate timeline (cues.json): the glTF format
in this Blender version can't carry material animation, and apps drive the emissive color
directly anyway. In the .blend the halo material is keyframed per clip for renders.
"""
import json
import math

import bpy
from mathutils import Matrix, Vector

FPS = 30
HALO = {"autonomy": "#3CE6B4", "operator": "#FFB020", "transitioning": "#EEF0EE", "stopped": "#E8352B"}


WORLD = {}   # intended world matrix of every rig empty (no reliance on depsgraph evaluation)


def _empty(name, mw, parent=None, size=12.0):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "ARROWS"
    e.empty_display_size = size
    coll = bpy.data.collections.get("Rig") or bpy.data.collections.new("Rig")
    if coll.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(coll)
    coll.objects.link(e)
    e.rotation_mode = "XYZ"
    if parent:
        e.parent = parent
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.matrix_basis = WORLD[parent.name].inverted() @ mw
    else:
        e.matrix_basis = mw
    WORLD[name] = mw.copy()
    return e


def _attach(obj, parent):
    """Parts carry their geometry in world coordinates with an identity transform: parent them without moving."""
    mw = obj.matrix_basis.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = WORLD[parent.name].inverted()
    obj.matrix_basis = mw


def build(parts, WM, D, ctrl, wheel_local_center, paddle_pivots, stick_pivot_z, dpad_pivot_z, base_names, tilt_names):
    """parts: {name: obj}. ctrl: {key_empty_name: [part names]} for key presses (pivot from the first part)."""
    root = _empty("RIG_Root", Matrix.Identity(4), size=40)
    base = _empty("RIG_Base", Matrix.Identity(4), root, 20)
    tilt = _empty("RIG_Tilt", Matrix.Translation(D), root, 30)
    sframe = _empty("RIG_SteerFrame", WM.copy(), tilt, 20)
    steer = _empty("RIG_Steer", WM.copy(), sframe, 40)
    WMi = WM.inverted()
    keys = {}
    claimed = set()

    def local_center(names):
        pts = [parts[n].matrix_basis @ Vector(c) for n in names for c in parts[n].bound_box]
        c = sum(pts, Vector()) / len(pts)
        return WMi @ c

    for kname, names in ctrl.items():
        lc = local_center(names)
        z = {"KEY_Stick": stick_pivot_z, "KEY_DPad": dpad_pivot_z}.get(kname, lc.z)
        e = _empty(kname, WM @ Matrix.Translation((lc.x, lc.y, z)), steer, 6)
        for n in names:
            _attach(parts[n], e)
            claimed.add(n)
        keys[kname] = e
    for side, (px, py, pz) in paddle_pivots.items():
        e = _empty(f"PADDLE_{side}", WM @ Matrix.Translation((px, py, pz)), steer, 8)
        nm = "Paddle_Brake_L" if side == "L" else "Paddle_Throttle_R"
        _attach(parts[nm], e)
        claimed.add(nm)
        keys[e.name] = e
    for n, o in parts.items():
        if n in claimed:
            continue
        if n in base_names:
            _attach(o, base)
        elif n in tilt_names:
            _attach(o, tilt)
        else:
            _attach(o, steer)
    return {"root": root, "base": base, "tilt": tilt, "steer": steer, **keys}


# ── clips ──────────────────────────────────────────────────────────────────────
def _key(e, frame, loc=None, rot=None):
    if loc is not None:
        e.location = loc
        e.keyframe_insert("location", frame=frame)
    if rot is not None:
        e.rotation_euler = rot
        e.keyframe_insert("rotation_euler", frame=frame)


def _push(e, clip):
    ad = e.animation_data
    act = ad.action
    act.name = f"{clip}__{e.name}"
    tr = ad.nla_tracks.new()
    tr.name = clip
    st = tr.strips.new(clip, int(act.frame_range[0]), act)
    st.name = clip
    ad.action = None
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.easing = "AUTO"


class Clip:
    """Collect keys per empty for one clip, relative to each empty's rest pose."""

    def __init__(self, name, rig):
        self.name, self.rig, self.used = name, rig, {}

    def at(self, e, frame, dloc=(0, 0, 0), drot_deg=(0, 0, 0)):
        if e.name not in self.used:
            self.used[e.name] = (e, e.location.copy(), e.rotation_euler.copy())
            e.animation_data_create()
            e.animation_data.action = bpy.data.actions.new(f"{self.name}__{e.name}")
            _key(e, 0, loc=e.location.copy(), rot=e.rotation_euler.copy())
        _, l0, r0 = self.used[e.name]
        loc = l0 + _local(e, Vector(dloc))
        rot = (r0[0] + math.radians(drot_deg[0]), r0[1] + math.radians(drot_deg[1]), r0[2] + math.radians(drot_deg[2]))
        _key(e, frame, loc=loc, rot=rot)

    def press(self, e, f0, travel=0.8, hold=4, down=3, up=4):
        self.at(e, f0)
        self.at(e, f0 + down, dloc=(0, 0, -travel))
        self.at(e, f0 + down + hold, dloc=(0, 0, -travel))
        self.at(e, f0 + down + hold + up)

    def done(self):
        for e, l0, r0 in self.used.values():
            e.location, e.rotation_euler = l0, r0
            _push(e, self.name)


def _local(e, d):
    """Translation expressed in the empty's own axes → parent-space delta for e.location."""
    if not d.length:
        return Vector()
    R = e.matrix_basis.to_3x3()
    return R @ d


def make_clips(rig):
    k = rig
    cues = {}

    c = Clip("turntable", k)
    for i, f in enumerate(range(0, 241, 30)):
        c.at(k["root"], f, drot_deg=(0, 0, 45 * i))
    c.done()
    cues["turntable"] = {"frames": 240, "cues": [[0, "autonomy"]]}

    c = Clip("steer", k)
    for f, a in ((0, 0), (30, 90), (75, -90), (105, -90), (135, 0)):
        c.at(k["steer"], f, drot_deg=(0, 0, a))
    c.done()
    cues["steer"] = {"frames": 135, "cues": [[0, "operator"]]}

    c = Clip("tilt", k)
    for f, a in ((0, 0), (30, -10), (60, -10), (95, 10), (125, 10), (150, 0)):
        c.at(k["tilt"], f, drot_deg=(a, 0, 0))
    c.done()
    cues["tilt"] = {"frames": 150, "cues": [[0, "autonomy"]]}

    c = Clip("claim_handoff", k)
    c.press(k["KEY_Claim"], 15, travel=1.0)
    c.at(k["KEY_Release"], 0)
    c.at(k["KEY_Release"], 90)
    c.at(k["KEY_Release"], 93, dloc=(0, 0, -0.8))
    c.at(k["KEY_Release"], 129, dloc=(0, 0, -0.8))       # held 1.2 s to confirm
    c.at(k["KEY_Release"], 133)
    c.done()
    cues["claim_handoff"] = {"frames": 160, "cues": [[0, "autonomy"], [18, "transitioning"], [45, "operator"],
                                                     [129, "transitioning"], [150, "autonomy"]]}

    c = Clip("controls_tour", k)
    f = 0
    for nm in ("KEY_Talk", "KEY_Log", "KEY_ExtSpeaker"):
        c.press(k[nm], f)
        f += 12
    f += 4
    c.at(k["KEY_DPad"], f)
    for rx, ry in ((6, 0), (0, 6), (-6, 0), (0, -6)):
        c.at(k["KEY_DPad"], f + 3, drot_deg=(rx, ry, 0))
        c.at(k["KEY_DPad"], f + 8, drot_deg=(rx, ry, 0))
        c.at(k["KEY_DPad"], f + 11)
        f += 11
    f += 4
    c.at(k["KEY_Stick"], f)
    for i in range(0, 13):
        a = 2 * math.pi * i / 12
        c.at(k["KEY_Stick"], f + 4 + 3 * i, drot_deg=(15 * math.sin(a), 15 * math.cos(a), 0))
    f += 4 + 3 * 12 + 4
    c.at(k["KEY_Stick"], f)
    c.press(k["KEY_Stick"], f + 2, travel=1.2)                # click = acknowledge
    f += 16
    for nm in ("KEY_Horn", "KEY_Hazard", "KEY_P1", "KEY_P2"):
        c.press(k[nm], f)
        f += 12
    c.done()
    cues["controls_tour"] = {"frames": f + 6, "cues": [[0, "operator"]]}

    c = Clip("paddles", k)
    c.at(k["PADDLE_R"], 0)
    c.at(k["PADDLE_R"], 8, drot_deg=(0, -6, 0))
    c.at(k["PADDLE_R"], 22, drot_deg=(0, -6, 0))
    c.at(k["PADDLE_R"], 30)
    c.at(k["PADDLE_L"], 30)
    c.at(k["PADDLE_L"], 38, drot_deg=(0, 6, 0))
    c.at(k["PADDLE_L"], 52, drot_deg=(0, 6, 0))
    c.at(k["PADDLE_L"], 60)
    c.done()
    cues["paddles"] = {"frames": 60, "cues": [[0, "operator"]]}

    c = Clip("estop", k)
    e = k["KEY_EStop"]
    c.at(e, 0)
    c.at(e, 10)
    c.at(e, 14, dloc=(0, 0, -4.5))                              # latched down
    c.at(e, 60, dloc=(0, 0, -4.5))
    c.at(e, 72, dloc=(0, 0, -4.5), drot_deg=(0, 0, 25))         # twist to release
    c.at(e, 78, dloc=(0, 0, 0), drot_deg=(0, 0, 25))            # springs up
    c.at(e, 88)
    c.done()
    cues["estop"] = {"frames": 100, "cues": [[0, "operator"], [14, "stopped"], [78, "transitioning"], [96, "autonomy"]]}

    for v in cues.values():
        v["seconds"] = round(v["frames"] / FPS, 2)
        v["cues"] = [{"t": round(fr / FPS, 3), "state": s} for fr, s in v["cues"]]
    return {"fps": FPS, "halo_colors": HALO,
            "halo_states": {"autonomy": "steady", "operator": "steady", "transitioning": "pulse 900 ms (opacity 1 → 0.35)",
                            "stopped": "steady"},
            "clips": cues}


def export_rigged(path, objs, empties):
    bpy.context.scene.frame_set(0)
    for o in bpy.context.scene.objects:
        o.select_set(o in objs or o in empties)
    kw = dict(filepath=path, use_selection=True, export_yup=True, export_apply=True, export_animations=True)
    try:
        bpy.ops.export_scene.gltf(**kw, export_animation_mode="NLA_TRACKS")
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
