"""2D faceplate layout sketch (v3 proposal). Writes faceplate_v3.svg. Units: wheel-local mm."""
import math
import os

S, CX, CY = 1.9, 600, 410
W, H = 1200, 780
o = []
a = o.append


def P(x, y):
    return CX + x * S, CY - y * S


def arc(r, a0, a1, col, w):
    x0, y0 = P(r * math.cos(math.radians(a0)), r * math.sin(math.radians(a0)))
    x1, y1 = P(r * math.cos(math.radians(a1)), r * math.sin(math.radians(a1)))
    return f'<path d="M{x0:.1f},{y0:.1f} A{r * S:.1f},{r * S:.1f} 0 0 0 {x1:.1f},{y1:.1f}" fill="none" stroke="{col}" stroke-width="{w:.1f}"/>'


def circ(x, y, d, fill, stroke="#1C1E21"):
    px, py = P(x, y)
    return f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{d / 2 * S:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>'


def rr(x, y, w, h, r, fill):
    px, py = P(x - w / 2, y + h / 2)
    return f'<rect x="{px:.1f}" y="{py:.1f}" width="{w * S:.1f}" height="{h * S:.1f}" rx="{r * S:.1f}" fill="{fill}" stroke="#1C1E21" stroke-width="1.5"/>'


def lab(x, y, tx, ty, text, side):
    px, py = P(x, y)
    a(f'<path d="M{px:.1f},{py:.1f} L{tx - (14 if side > 0 else -14)},{ty} L{tx},{ty}" fill="none" stroke="#7A7D80" stroke-width="1"/>')
    a(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="2.5" fill="#1D1F21"/>')
    anchor = "start" if side > 0 else "end"
    a(f'<text x="{tx + 6 * side}" y="{ty + 5}" text-anchor="{anchor}" font-size="15" fill="#1D1F21">{text}</text>')


a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Helvetica Neue, Arial, sans-serif">')
a(f'<rect width="{W}" height="{H}" fill="#EDEDEA"/>')
cx, cy = P(0, 0)
# rim, grips, halo
a(f'<circle cx="{cx}" cy="{cy}" r="{126 * S:.1f}" fill="none" stroke="#2B2E32" stroke-width="{28 * S:.1f}"/>')
a(arc(126, 142, 218, "#9C7552", 28.5 * S))
a(arc(126, -38, 38, "#9C7552", 28.5 * S))
# no spoke web: the hub band joins the rim directly
a(arc(114.5, 42, 138, "#3CE6B4", 3))
a(arc(114.5, 222, 318, "#3CE6B4", 3))
# hub band + faceplate
x, y = P(-116, 50)
a(f'<rect x="{x:.1f}" y="{y:.1f}" width="{232 * S:.1f}" height="{100 * S:.1f}" rx="{24 * S:.1f}" fill="#2B2E32"/>')
x, y = P(-108, 44)
a(f'<rect x="{x:.1f}" y="{y:.1f}" width="{216 * S:.1f}" height="{88 * S:.1f}" rx="{26 * S:.1f}" fill="#3A3E44" stroke="#22252A" stroke-width="1.5"/>')

# controls
GX, GT, GB, GW = 88.0, 38.0, -40.0, 30.0           # button column: x, top, bottom, width


def column(sx, keys, nav):
    x0, y0 = P(sx * GX - GW / 2, GT)
    a(f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{GW * S:.1f}" height="{(GT - GB) * S:.1f}" rx="{GW / 2 * S:.1f}" fill="#26292D"/>')
    ys = [GT - 9 - 12.5 * i for i in range(len(keys))]
    for (fill, _), yk in zip(keys, ys):
        a(rr(sx * GX, yk, GW - 7, 10.5, 5.2, fill))
    ny = -24.0
    if nav == "dpad":
        dx, dy = P(sx * GX, ny)
        u = S
        a(f'<path d="M{dx - 4.5 * u:.1f},{dy - 11.5 * u:.1f} h{9 * u:.1f} v{7 * u:.1f} h{7 * u:.1f} v{9 * u:.1f} h{-7 * u:.1f} v{7 * u:.1f} h{-9 * u:.1f} v{-7 * u:.1f} h{-7 * u:.1f} v{-9 * u:.1f} h{7 * u:.1f}z" fill="#2E3237" stroke="#1C1E21" stroke-width="1.5"/>')
    else:
        a(circ(sx * GX, ny, 20, "#2E3237"))
        a(circ(sx * GX, ny, 12, "#383C42", "#26292D"))
    return ys, ny


L_ys, L_ny = column(-1, [("#2E3237", "Talk"), ("#2E3237", "Log"), ("#2E3237", "External speaker")], "dpad")
R_ys, R_ny = column(1, [("#3CE6B4", "Claim"), ("#2E3237", "Release"), ("#2E3237", "Horn")], "stick")
a(circ(0, 16, 34, "#26292D"))                       # E-stop: plain mushroom, thin bezel
a(circ(0, 16, 28, "#E8352B", "#B5241C"))
a(circ(36, 30, 11, "#2E3237"))                      # hazard
hx, hy = P(36, 30)
a(f'<path d="M{hx:.1f},{hy - 6:.1f} l5.5,9 h-11z" fill="#E8352B"/>')
a(rr(-56, -32, 10, 10, 2.5, "#2E3237"))             # small keys from the markup
a(rr(56, -32, 10, 10, 2.5, "#2E3237"))
wx, wy = P(0, -18)                                  # text logo instead of the horn pad
a(f'<text x="{wx:.1f}" y="{wy + 8:.1f}" text-anchor="middle" font-size="24" font-style="italic" font-weight="700" fill="#B9BEC4">teleop</text>')

# labels
lab(-GX, L_ys[0], 300, 200, "Talk", -1)
lab(-GX, L_ys[1], 300, 240, "Log", -1)
lab(-GX, L_ys[2], 300, 280, "External speaker", -1)
lab(-GX, L_ny, 300, 470, "D-pad · alerts, menus, camera", -1)
lab(-56, -32, 300, 540, "P1 (programmable)", -1)
lab(0, 33, 900, 150, "Emergency stop", 1)
lab(36, 35, 900, 185, "Hazard", 1)
lab(GX, R_ys[0], 900, 230, "Claim vehicle", 1)
lab(GX, R_ys[1], 900, 270, "Release vehicle (hold)", 1)
lab(GX, R_ys[2], 900, 310, "Horn", 1)
lab(GX, R_ny, 900, 470, "Stick · look, click = acknowledge", 1)
lab(56, -32, 900, 540, "P2 (programmable)", 1)

a('<text x="40" y="52" font-size="22" font-weight="700" fill="#1D1F21">teleop Wheel · faceplate v4</text>')
a('<text x="40" y="78" font-size="14" fill="#6B6E70">One button column per thumb, stick or D-pad at the base of each. No spoke web: the hub band joins the rim. Paddles stay behind.</text>')
a('</svg>')
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faceplate_v4.svg"), "w").write("\n".join(o))
