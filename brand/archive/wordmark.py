"""
teleop wordmark + mark — one stroke spec, two outputs.

The wordmark is drawn, not typeset: monoline strokes on a 40-unit x-height, set
italic at 12° like the Tarmac downtube logo. The "o" is the mark: a halo (the wheel's
LED ring) with three spokes at 120°, the plan of the original three-pod station.

Writes:
  strokes.json            stroke centrelines (units) for the Blender build
  teleop-wordmark.svg     single-ink wordmark (currentColor is not available in <img>,
                          so it is written in two inks: -light.svg and -dark.svg)
  teleop-mark.svg         halo mark, mint ring on carbon disc
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
W = 8.0          # stroke width
R = 16.0         # bowl centreline radius (bowl spans y 0..40 with the stroke)
SKEW = 12.0      # italic angle, degrees
SPOKE_W = 4.0


def arc(cx, cy, r, a0, a1, n=None):
    n = n or max(6, int(abs(a1 - a0) / 8))
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def strokes():
    s = []  # (polyline points, width)
    # t
    s.append((([(4, 54), (4, 12)] + arc(16, 12, 12, 180, 270)[1:] + [(20, 0)]), W))
    s.append(([(-6, 36), (18, 36)], W))
    # e
    s.append((arc(52, 20, R, 0, 322), W))
    s.append(([(36, 20), (68, 20)], W))
    # l
    s.append((([(80, 58), (80, 10)] + arc(90, 10, 10, 180, 270)[1:]), W))
    # e
    s.append((arc(122, 20, R, 0, 322), W))
    s.append(([(106, 20), (138, 20)], W))
    # o = halo + three spokes + hub
    s.append((arc(170, 20, R, 0, 360, 48), W))
    for a in (90, 210, 330):
        s.append(([(170, 20), (170 + (R - 2) * math.cos(math.radians(a)),
                                20 + (R - 2) * math.sin(math.radians(a)))], SPOKE_W))
    # p
    s.append(([(202, 40), (202, -20)], W))
    s.append((arc(218, 20, R, 0, 360, 48), W))
    return s


def skew_pt(x, y):
    return (x + y * math.tan(math.radians(SKEW)), y)


def path_d(pts):
    p = [skew_pt(*q) for q in pts]
    return "M" + " L".join(f"{x:.2f} {-y:.2f}" for x, y in p)


def wordmark_svg(ink, hub=None, ring=None):
    st = strokes()
    xs = [skew_pt(x, y)[0] for pts, _ in st for x, y in pts]
    pad = W
    x0, x1 = min(xs) - pad, max(xs) + pad
    y0, y1 = -62 - 2, 22 + 2
    body = []
    for pts, w in st:
        closed = abs(pts[0][0] - pts[-1][0]) < 1e-6 and abs(pts[0][1] - pts[-1][1]) < 1e-6
        is_ring = closed and abs(pts[0][0] - 186) < 1e-6
        col = f' stroke="{ring}"' if (ring and is_ring) else ""
        body.append(f'<path d="{path_d(pts)}{" Z" if closed else ""}" stroke-width="{w}"{col}/>')
    cx, cy = skew_pt(170, 20)
    hub_el = f'<circle cx="{cx:.2f}" cy="{-cy:.2f}" r="4" fill="{hub or ink}" stroke="none"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.1f} {y0:.1f} {x1 - x0:.1f} {y1 - y0:.1f}" '
            f'width="{(x1 - x0) * 2:.0f}" height="{(y1 - y0) * 2:.0f}">'
            f'<title>teleop</title><g fill="none" stroke="{ink}" stroke-linecap="round" stroke-linejoin="round">'
            + "".join(body) + "</g>" + hub_el + "</svg>")


def mark_svg(ring="#3CE6B4", disc="#24272B", spoke="#EEF0EE"):
    # 96-unit tile: carbon disc, mint halo, three bone-white spokes, hub
    c, r_ring = 48, 30
    sp = "".join(
        f'<line x1="{c}" y1="{c}" x2="{c + (r_ring - 5) * math.cos(math.radians(a)):.2f}" '
        f'y2="{c - (r_ring - 5) * math.sin(math.radians(a)):.2f}"/>' for a in (90, 210, 330))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="192" height="192">'
            f'<title>teleop mark</title><circle cx="{c}" cy="{c}" r="46" fill="{disc}"/>'
            f'<circle cx="{c}" cy="{c}" r="{r_ring}" fill="none" stroke="{ring}" stroke-width="10"/>'
            f'<g stroke="{spoke}" stroke-width="6" stroke-linecap="round">{sp}</g>'
            f'<circle cx="{c}" cy="{c}" r="7" fill="{spoke}"/></svg>')


if __name__ == "__main__":
    json.dump({"stroke_w": W, "skew_deg": SKEW, "x_height": 40,
               "strokes": [{"pts": pts, "w": w} for pts, w in strokes()],
               "hub": {"c": [170, 20], "r": 4}},
              open(os.path.join(HERE, "strokes.json"), "w"), indent=1)
    open(os.path.join(HERE, "teleop-wordmark-carbon.svg"), "w").write(wordmark_svg("#24272B", "#24272B"))
    open(os.path.join(HERE, "teleop-wordmark-white.svg"), "w").write(wordmark_svg("#EEF0EE", "#EEF0EE"))
    open(os.path.join(HERE, "teleop-wordmark-mint.svg"), "w").write(wordmark_svg("#24272B", "#24272B", ring="#14B88A"))
    open(os.path.join(HERE, "teleop-mark.svg"), "w").write(mark_svg())
    print("ok")
