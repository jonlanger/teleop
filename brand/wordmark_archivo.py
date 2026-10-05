"""
teleop wordmark, set in the design system's display face.

Archivo Italic (variable) → static instance at wdth 125 (expanded), wght 800 (extra bold),
the same setting as `display-xl` in tokens.json. Tracking -0.02 em, lowercase, no glyph mark.

Writes:
  fonts/Archivo-ExpandedExtraBoldItalic.ttf   static instance (Blender loads this for prints)
  teleop-wordmark-carbon.svg / -white.svg     outlined SVG wordmarks, single ink

Run with the project venv:  ../.venv/bin/python wordmark_archivo.py
"""
import os

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "fonts", "Archivo-Italic[wdth,wght].ttf")
STATIC = os.path.join(HERE, "fonts", "Archivo-ExpandedExtraBoldItalic.ttf")
TEXT, WDTH, WGHT, TRACK = "teleop", 125, 800, -0.02


def make_static():
    vf = TTFont(SRC)
    inst = instancer.instantiateVariableFont(vf, {"wdth": WDTH, "wght": WGHT}, updateFontNames=False)
    inst.save(STATIC)
    return TTFont(STATIC)


def outline(font):
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    path = SVGPathPen(gs)
    bounds = BoundsPen(gs)
    x = 0.0
    for ch in TEXT:
        g = cmap[ord(ch)]
        t = (1, 0, 0, -1, x, 0)                      # flip y for SVG
        gs[g].draw(TransformPen(path, t))
        gs[g].draw(TransformPen(bounds, (1, 0, 0, 1, x, 0)))
        x += gs[g].width + TRACK * upm
    return path.getCommands(), bounds.bounds


def svg(d, b, ink):
    x0, y0, x1, y1 = b
    pad = 20
    vb = (x0 - pad, -y1 - pad, (x1 - x0) + 2 * pad, (y1 - y0) + 2 * pad)
    w = 480
    h = round(w * vb[3] / vb[2])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]:.0f} {vb[1]:.0f} {vb[2]:.0f} {vb[3]:.0f}" '
            f'width="{w}" height="{h}"><title>teleop</title><path fill="{ink}" d="{d}"/></svg>')


if __name__ == "__main__":
    f = make_static()
    d, b = outline(f)
    for name, ink in (("carbon", "#24272B"), ("white", "#EEF0EE")):
        open(os.path.join(HERE, f"teleop-wordmark-{name}.svg"), "w").write(svg(d, b, ink))
    print("ok", STATIC, b)
