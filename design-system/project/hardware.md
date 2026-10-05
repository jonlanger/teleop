# Hardware

The teleop Wheel is a desk peripheral: a 280 mm wheel on a column that drops into a solid satin-carbon base. It replaces the full cockpit of the original station. The hardware follows the same rules as the screen: state is shown by color, a word and a shape together; red only means stop; everything else stays quiet.

## Form

- One expressive element: the **halo**, a mint light guide on the inner front face of the rim. Everything else is satin carbon, graphite and alloy.
- One warm material: **gum** TPE on the grips and feet, after the Tarmac's tanwall tires. It goes where hands and the desk touch, and nowhere else.
- The base is a single quiet object: a squircle plan (G2 corners), a flat top sloping 9° toward the operator, an R12 top edge, and no inset deck or cut into the top.
- Tilt lives in a **hinge barrel** across the back: two fixed caps on saddle feet and a centre knuckle that carries the column, Ø60 with R3 ends and 0.5 mm seams. It floats 1 mm above the top surface, so nothing is cut into the base. Push the wheel to tilt it (15–35°, 5° detents); a mint index line on the knuckle reads against the right cap.
- One port: USB-C, low and centered on the back, for power and data.
- The wordmark (Archivo Expanded ExtraBold Italic, the `display-xl` setting) is printed once per base side, reflective like the Tarmac's downtube logo, and once in the centre of the faceplate.

## Faceplate

Every corner on the hub is concentric: band R24 → faceplate R18 (6 mm inset all round) → key columns R14 (4 mm inset) → end keys, D-pad and stick R11 (3 mm inset), all on the same corner centres and mirrored left and right.

| Zone | Controls |
| --- | --- |
| Left key column (left thumb) | Talk · Log · External speaker, D-pad at the base (alerts and menus; left/right = camera) |
| Right key column (right thumb) | **Claim vehicle** (mint) · Release vehicle (hold 1.2 s) · Horn, thumbstick at the base (look around; click = acknowledge) |
| Centre | **Emergency stop** (plain red mushroom, thin bezel) · Hazard lights · printed wordmark |
| Inside the columns | P1 and P2 programmable keys (1 and 2 tactile dots) |
| Behind | Brake and throttle paddles |

There is no status display and no turn-signal stalk: link quality shows on the halo and the console, and turn signals are handled in software. Use these control names everywhere: legends, `ControlGlyph`, training and UI copy.

## Built-in feedback

- **Halo**: mint = autonomy, amber = operator in control, white pulse (900 ms) = transitioning, red = stopped. It must always match `ControlState` on screen.
- **Haptics**: two LRAs in the rim near the grips. Pulse once for a new warning or critical alert; pulse in a rising pattern while the link degrades.
- **Link quality** is not on the wheel: the halo dims and the grips pulse as the link degrades, and the console shows `LinkMeter`.
- **Grip sensors**: capacitive electrodes under the gum TPE. Claim vehicle only takes effect when at least one hand is on the rim.

## Part breaks

- **Wheel**: front and rear shells split on the rim's mid-plane, so the parting line runs along the rim's equator where the fingers wrap, not across a face.
- **Faceplate**: the whole hub top is a removable faceplate (2 hooks, 2 magnets), like an Xbox faceplate. Swap it per fleet; the caps come with it.
- **Grips**: 2K TPE over the outer 210° of the rim section on each half; the inner side, where the hub joins, stays hard shell.
- **Base**: one shell with a parting line 16 mm above the desk and a 0.8 × 0.5 mm shadow reveal. The top is never cut; the barrel stands on it.
- **Column**: upper and lower covers with a 0.6 mm reveal, trimmed to the knuckle with a 0.3 mm gap; it tilts with the wheel but doesn't steer.
- **Hub back**: closed; a full rear cover (220 × 88 R18, the faceplate's twin) snaps into a 1.0 mm pocket and hides four M2.5 screws that run from behind into bosses on the faceplate ledge.
- **Hub to rim**: an R5 rolling-ball fillet (R7.8 inside, so the wall stays 2.8 mm) blends the band into the rim on every side.
- No visible screws: hub screws sit under the rear cover, base screws under the feet, and the barrel caps are screwed from inside the base. The faceplate holds with two hooks and four magnets.

## CMF

| Part | Material | Color | Finish |
| --- | --- | --- | --- |
| Base shell, wheel shells | PC/ABS | Satin Carbon `#24272B` | Mold-Tech MT-11010 fine matte, light satin coat |
| Faceplate | PC/ABS | Graphite `#2E3237` | VDI 27, legends laser-etched |
| Column covers | PC/ABS | Graphite `#3A3E44` | MT-11000 |
| Hinge caps / knuckle | PC/ABS / zinc die-cast | Satin Carbon / Graphite | MT-11010 / satin powder coat |
| Caps, D-pad, stick | PC | Carbon `#30343A` | SPI-B1 gloss: gloss caps on a textured plate read as touch points |
| Claim | PC | Signal Mint `#3CE6B4` | SPI-B1 |
| Emergency stop | PC | Stop Red `#E8352B` on Safety Yellow `#F2C200` | SPI-A2 cap, ISO 13850 colors |
| Grips, feet | TPE 60A / 50A | Gum `#9C7552` | Raised micro-dots, 1.1 mm pitch |
| Thumbstick cap | TPE over PC | Carbon `#30343A` | Micro-dots, 0.7 mm pitch |
| Paddles | Al 6063 | Alloy `#B9BEC4` | Brushed, clear anodize |
| Halo | PMMA light guide | Clear, lit by RGB LEDs | SPI-A2 face, frosted back |
| Wordmark | Reflective metallic print or IMD foil | Alloy | Gloss |

Specify production colors from physical chips; hex values are for renders and screens.

## Variants

- **Robot White**: shells in `robot-white` `#E9EAE6`, the original station's color, with a graphite faceplate. Keep gum grips and the mint halo.
- **Fleet faceplates**: any color from a fleet's brand, as long as it isn't red or yellow (reserved for the stop) or mint or amber (reserved for control state).

## Motion

The wheel ships with a rig for the app and the homepage (`model_rigged.glb`, with clips as named glTF animations and halo cues in `animation_cues.json`).

- **Rig:** Root (turntable) → Tilt (hinge axis) → Steer (wheel axis) → one node per control. Keys press 0.8–1.2 mm along the wheel axis, the D-pad rocks 6°, the stick circles ±15° and clicks, paddles pull 6°, and the E-stop presses 4.5 mm, latches, and twist-releases 25°.
- **Clips:** `turntable` 8.0 s, `claim_handoff` 5.3 s, `controls_tour` 6.7 s, `steer` 4.5 s, `tilt` 5.0 s, `paddles` 2.0 s, `estop` 3.3 s.
- **Light:** drive the halo material's emissive color from the cues: `mint` for autonomy, `amber-fill` for operator, `ink` pulsing at 900 ms (`pulse-transition`) for transitioning, `stop-fill` for stopped. Match the `ControlState` badge to the same cue on screen. Under reduced motion, hold transitioning steady.
- **Timing:** ease every press (in 3 frames, out 4 at 30 fps); handoffs always pass through transitioning; Release always shows the full 1.2 s hold (`hold-confirm`).
