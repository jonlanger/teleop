"""Export the rigged Wheel for the homepage: same nodes and NLA clips as model_rigged.glb, Draco-compressed.

  /Applications/Blender.app/Contents/MacOS/Blender -b hardware/out_v6/model.blend -P hardware/export_web.py -- software/src/assets/wheel-rigged.glb
"""
import sys
import bpy

out = sys.argv[sys.argv.index("--") + 1]
sc = bpy.context.scene
sc.render.fps, sc.render.fps_base = 30, 1.0   # the rig keys clips at 30 fps (rig.FPS); the .blend defaults to 24
sc.frame_set(0)
for o in sc.objects:
    o.select_set(o.type in ("MESH", "EMPTY") and not o.hide_render)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_yup=True, export_apply=True, export_animations=True,
                          export_animation_mode="NLA_TRACKS", export_draco_mesh_compression_enable=True,
                          export_draco_mesh_compression_level=6, export_draco_position_quantization=14,
                          export_draco_normal_quantization=10)
print("EXPORTED", out)
