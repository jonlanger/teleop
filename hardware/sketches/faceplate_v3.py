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
# spoke web with openings
a(f'<circle cx="{cx}" cy="{cy}" r="{112 * S:.1f}" fill="#33373C"/>')
a(arc(114.5, 42, 138, "#3CE6B4", 3))
a(arc(114.5, 222, 318, "#3CE6B4", 3))
for sg in (1, -1):
    x, y = P(-62, 58 + 44 if sg > 0 else -58)
    a(f'<rect x="{x:.1f}" y="{y:.1f}" width="{124 * S:.1f}" height="{44 * S:.1f}" rx="{20 * S:.1f}" fill="#EDEDEA"/>')
# hub band + faceplate
x, y = P(-116, 50)
a(f'<rect x="{x:.1f}" y="{y:.1f}" width="{232 * S:.1f}" height="{100 * S:.1f}" rx="{24 * S:.1f}" fill="#2B2E32"/>')
x, y = P(-108, 44)
a(f'<rect x="{x:.1f}" y="{y:.1f}" width="{216 * S:.1f}" height="{88 * S:.1f}" rx="{26 * S:.1f}" fill="#3A3E44" stroke="#22252A" stroke-width="1.5"/>')

# controls
a(circ(0, 18, 36, "#26292D"))                       # E-stop: plain red mushroom in a thin bezel
a(circ(0, 18, 30, "#E8352B", "#B5241C"))
a(circ(38, 30, 12, "#2E3237"))                      # hazard
hx, hy = P(38, 30)
a(f'<path d="M{hx:.1f},{hy - 6.5:.1f} l6,10 h-12z" fill="#E8352B"/>')
for sx in (-1, 1):                                  # other buttons: inner columns
    a(rr(sx * 58, 24, 11, 11, 2.5, "#3CE6B4" if sx > 0 else "#2E3237"))
    a(rr(sx * 58, 6, 11, 11, 2.5, "#2E3237"))
a(circ(-62, -34, 11, "#2E3237"))                    # small buttons
a(circ(62, -34, 11, "#2E3237"))
dx, dy = P(-86, -14)                                # D-pad
a(circ(-86, -14, 30, "#26292D"))
u = S
a(f'<path d="M{dx - 4.5 * u:.1f},{dy - 12 * u:.1f} h{9 * u:.1f} v{7.5 * u:.1f} h{7.5 * u:.1f} v{9 * u:.1f} h{-7.5 * u:.1f} v{7.5 * u:.1f} h{-9 * u:.1f} v{-7.5 * u:.1f} h{-7.5 * u:.1f} v{-9 * u:.1f} h{7.5 * u:.1f}z" fill="#2E3237" stroke="#1C1E21" stroke-width="1.5"/>')
a(circ(86, -14, 30, "#26292D"))                     # stick
a(circ(86, -14, 20, "#2E3237"))
a(circ(86, -14, 12, "#383C42", "#26292D"))
wx, wy = P(0, -14)                                  # text logo instead of the horn pad
a(f'<text x="{wx:.1f}" y="{wy + 8:.1f}" text-anchor="middle" font-size="24" font-style="italic" font-weight="700" fill="#B9BEC4">teleop</text>')

# labels: left column x=230, right column x=970
lab(-58, 24, 300, 230, "Talk", -1)
lab(-58, 6, 300, 270, "Log", -1)
lab(-62, -34, 300, 470, "External speaker", -1)
lab(-86, -29, 300, 520, "D-pad · alerts and menus, ◀ ▶ camera", -1)
lab(0, 36, 900, 150, "Emergency stop · plain mushroom, thin bezel", 1)
lab(38, 36, 900, 190, "Hazard", 1)
lab(58, 24, 900, 300, "Claim vehicle (mint)", 1)
lab(58, 6, 900, 270, "Release vehicle (hold)", 1)
lab(62, -34, 900, 470, "Horn", 1)
lab(86, -29, 900, 520, "Stick · look around, click = acknowledge", 1)
lab(0, -22, 900, 610, "Printed wordmark (horn pad and display removed)", 1)

a('<text x="40" y="52" font-size="22" font-weight="700" fill="#1D1F21">teleop Wheel · faceplate v3</text>')
a('<text x="40" y="78" font-size="14" fill="#6B6E70">Upper outer corners stay empty as thumb rests. P1/P2 and paddles stay on the back. Link status moves to the halo and the console.</text>')
a('</svg>')
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faceplate_v3.svg"), "w").write("\n".join(o))
