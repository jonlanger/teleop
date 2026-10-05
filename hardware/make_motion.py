"""Package the rigged wheel + light cues into the motion preview page.

  python make_motion.py out_v5 motion.html
"""
import base64
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
src, out = sys.argv[1], sys.argv[2]
data = {"glb": base64.b64encode(open(os.path.join(src, "model_rigged.glb"), "rb").read()).decode(),
        "cues": json.load(open(os.path.join(src, "animation_cues.json")))}
tpl = open(os.path.join(HERE, "motion_template.html")).read()
html = tpl.replace("/*__DATA__*/", json.dumps(data, separators=(",", ":")).replace("</", "<\\/"))
open(out, "w").write(html)
print(f"wrote {out} ({os.path.getsize(out) / 1e6:.1f} MB)")
