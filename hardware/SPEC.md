# teleop Wheel — design spec (v6)

v6 splits the wheel into simpler parts. The rim and two spoke stubs are one ring, and the controls live in a separate pod that floats inside the rim. The pod's corners no longer touch the rim, so the R24 → R18 → R14 → R11 family is concentric again, and the only fillet is a bar meeting a tube. (v5 had shrunk the hub corners to R6 so one blend could run around the whole hub, which broke the concentric corners.) Earlier versions are kept as `build_v1.py` to `build_v5.py`.

## Form thesis

A quiet satin-carbon instrument whose one expressive gesture is the mint control-state halo inside the rim, and whose only red is the stop.

References (from the brief; principles borrowed, no signature product copied):
- **Xbox Wireless Controller**: D-pad and stick under the thumbs, removable faceplate, textured grips, gloss caps on a matte body, one light carrying state.
- **Specialized Tarmac SL9, Satin Carbon**: satin body, a large italic wordmark on the "downtube" (the base sides), gum/tanwall as the one warm material.
- **Original teleop station (Jon Langer)**: the mint spine becomes the halo; the red stop stays red.

**Radius family, all concentric on the pod:** pod R24 → faceplate R18 (6 mm inset) → key columns R14 (4 mm) → end keys, D-pad and stick R11 (3 mm), on shared corner centres (±74, ±26), mirrored. The pod corners clear the rim's inner face by 7–8 mm. Elsewhere: R8 pod edges, R8 stub → rim fillet, R6 stub section, R12 base top edge, R4 base bottom, R3 barrel ends, R8 saddle feet, squircle base plan (n = 5, G2).

## Faceplate

| Zone | Controls |
| --- | --- |
| Left key column | Talk · Log · External speaker · D-pad (alerts, menus; left/right = camera) |
| Right key column | Claim (mint) · Release (hold 1.2 s) · Horn · Hall-effect thumbstick (look; click = acknowledge) |
| Centre | Emergency stop (Ø28 domed cap in a Ø34 graphite bezel) · Hazard · printed wordmark |
| Inside the columns | P1 / P2 programmable (1 and 2 tactile dots), at ±48 |
| Behind | Brake / throttle paddles |

Link quality has no display on the wheel. It shows through the halo, the grip haptics and the console.

## Architecture

| Part | Process | Material | Finish | Key dims |
| --- | --- | --- | --- | --- |
| Wheel_Front / Rear_Shell | Injection molded | PC/ABS | Satin Carbon MT-11010 | Ø280 rim + two spoke stubs (28 × 14, R6) in one ring, 2.8 wall, 3.2 lip, R8 rolling-ball fillet stub → rim (R7 cavity, so the wall is ≈3.9 at the throat) |
| Pod_Front / Rear_Shell | Injection molded | PC/ABS | Satin Carbon MT-11010 | 196 × 100 × 32, R24 plan, R8 edges, 2.8 wall, lip; 0.3 slots where the stubs pass through the side walls |
| Grip_L/R_Front/Rear | 2K overmold | TPE 60A | Gum, raised micro-dots at 1.1 mm pitch | outer 210° of section, ±38° |
| Halo_Guide_Upper/Lower | Light guide, 2K | PMMA | SPI-A2 | 3.0 wide |
| Hub_Faceplate | Injection molded, removable | PC/ABS | Graphite VDI 27 | 184 × 88 R18 |
| Key_Column_L/R | Injection molded, snap into faceplate | PC/ABS | Dark | 28 × 80 R14, 0.6 below the faceplate |
| Keys, D-pad, stick cap, P1/P2, Hazard | Injection molded | PC | SPI-B1 gloss | 0.15 gap all round |
| EStop_Cap / EStop_Bezel | Injection molded | PC / PC/ABS | Stop Red SPI-A2 / Graphite | Ø28 / Ø34 |
| Hub_Rear_Cover | Injection molded, 6 snap hooks | PC/ABS | Graphite VDI 27 | 184 × 88 R18, the faceplate's twin, flush in a 1.0 pocket |
| Screws | Purchased | Steel, zinc-nickel black | — | 2 × M2.5 × 24 through the stubs + 2 × M2.5 × 22 (pod), 4 × M3 × 18 (base), 4 × M3 × 10 (cap feet) |
| Magnets / strikes | Purchased | N42 / steel | — | 4 × Ø4 × 2 in the faceplate, over strikes on the ledge |
| Hinge internals | Purchased / machined | Steel | — | 2 wave-washer friction packs Ø43, 2 detent rings (5 notches), stop pin Ø4 |
| Paddles | Stamped + CNC | Al 6063 | Brushed anodize | 82 × 42 × 3.5 |
| Column_Cover_Upper/Lower | Injection molded | PC/ABS | Graphite | 60 × 52, 0.6 reveal, foot trimmed to the knuckle (0.3 gap) |
| Tilt_Knuckle | Zinc die-cast | Zamak 3 | Satin powder coat | Ø60 × 72, R3 ends, friction pack + 5° detents |
| Hinge_Cap_L/R | Injection molded, saddle foot | PC/ABS | Satin Carbon | Ø60 × 51.5, R8 saddle 30 × 26, 0.5 seams |
| Base_Shell / Base_Bottom | Injection molded | PC/ABS | Satin Carbon | 210 × 160 × 100–126, 2.5 wall, top uncut |
| Wordmarks | Pad print | Ink | Robot White | 46 mm (faceplate), 96 mm (base sides) |
| USB-C receptacle + board | Purchased | — | — | 0.8 mm behind the back surface |

### How it fits together

1. Ballast plate and main PCB into Base_Bottom; the USB-C board screws to a boss on the back wall.
2. Base_Shell over Base_Bottom (3.0 lip, 0.8 × 0.5 reveal); 4 × M3 from below, hidden under the feet.
3. Axle through the two caps and the knuckle; each cap's saddle foot screws down through the top from inside the base (2 × M3). The harness runs axle → right foot → base, so nothing is exposed.
4. Column: motor and harness in the lower cover, upper cover closes (2 screws), foot screws to the knuckle.
5. Wheel: halo guides and grips are 2K in the wheel shells; LRAs go into the rim; the wheel shells close on their lip. Pod: hub PCB, stick module and clock spring go into the pod rear shell, the wheel's stubs drop into its side slots, and the pod front shell closes over them. 4 × M2.5 from behind (in 1.9 mm counterbores) into Ø5.6 pilot bosses hanging from the faceplate ledge. The two side screws pass through Ø6.4 tubes in the stubs, so they clamp the wheel between the pod halves; that is the whole wheel-to-pod joint. The rear cover snaps over the screws, and the paddles pin to their pivots.
6. Keys into the key-column carriers; carriers, E-stop and caps into the faceplate; the faceplate clips on with 2 hooks on its top edge and 4 Ø4 magnets over steel strikes on the ledge.

**No sightlines inside:** the pod is closed front and back, the stub slots are 0.3 mm, cap apertures are 0.15 mm, the barrel seams are 0.5 mm over solid parts, the column foot meets the knuckle at 0.3 mm, and the base top is never cut. The only opening in the base is the USB-C port, which has its receptacle in it.

## Hinge

| | Value | Why |
| --- | --- | --- |
| Range | 15–35°, hard stops | A stop pin rides in a 20° slot in the right cap |
| Detents | 5 (15/20/25/30/35°) | Detent rings at both knuckle ends; the mint index line reads against ticks on the right cap |
| Gravity moment | ≈ 2.4 N·m | Wheel assembly ≈ 1.55 kg at a 159 mm lever |
| Hand on rim | ≈ 2.8 N·m | 20 N resting on the rim top, ≈ 140 mm above the hinge |
| Friction | 5 N·m total (2 × 2.5 N·m wave-washer packs) | Holds gravity plus a resting hand; a deliberate push (≈ 35 N at the rim) tilts it |
| Tipping | Safe | The wheel overhangs the base front by ≈ 32 mm; a 20 N push down on the rim bottom gives ≈ 1.8 N·m against ≈ 3.5 N·m restoring (base, ballast and column) |

## Animation rig

`out_v5/model_rigged.glb` and `model.blend` carry a rigid-part rig built from empties, so any three.js, Unity or Blender pipeline can use it without skinning:

`RIG_Root` (turntable) → `RIG_Base` and `RIG_Tilt` (hinge axis, local X) → `RIG_SteerFrame` → `RIG_Steer` (wheel axis, local Z) → `KEY_*` (press along −Z), `KEY_DPad` and `KEY_Stick` (rock on local X/Y), `KEY_EStop` (press, latch, twist on Z), `PADDLE_L/R` (pull on local Y).

Seven named glTF animations: `turntable` 8.0 s, `claim_handoff` 5.3 s, `controls_tour` 6.7 s, `steer` 4.5 s, `tilt` 5.0 s, `paddles` 2.0 s, `estop` 3.3 s. Halo light cues are in `animation_cues.json` (time → autonomy / operator / transitioning / stopped, with colors). Apps drive the halo material (`Halo PMMA…`) emissive color from those cues; `transitioning` pulses at 900 ms. `motion.html` is the reference player.

## DFM

| | Wheel shells | Base shell / bottom | Faceplate + carriers | Column covers |
| --- | --- | --- | --- | --- |
| Wall | 2.8 (≈3.9 at the stub throat); 1.6 substrate under TPE; pod 2.8 | 2.5 | 2.8 / 2.2 | 2.4 |
| Draft | Release about the mid-plane | 1° + texture | Flat | 0.5° |
| Bosses / ribs | Shaft boss Ø44 (closed), paddle pivots, trim pocket 1.0 deep | Ø8 M3 corner bosses, 2 ribs each | Hooks, magnet pockets | 2 bosses |
| Lip / reveal | 3.2 lip | 3.0 lip, 0.8 × 0.5 reveal at 16 mm | Seats on a 1.6 ledge | 0.6 × 0.4 reveal |
| Actions | — | One side action for USB-C | — | — |

## Open issues

- **Junction fillet:** the R8 stub → rim fillet is built from 144 rolling-ball sections per side. In CAD it is a constant-radius blend between a straight bar and a torus, which any modeller handles. The cavity uses R7 rather than R8 + wall: an R10.8 ball is larger than the 8.4 mm inner stub.
- **Stub joint:** two M2.5 screws per side carry the steering torque from the rim into the pod. Check that against a 10 N·m hands-on load, and add a molded key on the stub flat if the screws alone creep.
- **Hinge:** validate the 5 N·m friction and the detent feel on a prototype. The saddle-foot screws carry the tilt reaction into the base top, so add ribs under the feet.
- **Materials and safety:** TPE bond and gum soiling; the halo as a 2K PMMA shot; a certified E-stop contact block (IEC 60947-5-5) wired to an independent safety relay; USB-C strain relief.
