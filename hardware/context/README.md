# The Wheel in context

`scene.py` places the v6 Wheel (`../out_v6/model.blend`, unchanged) on an oak desk in front of a windshield-size display, then renders three shots for the homepage:

| Shot | Scene |
| --- | --- |
| `out/station.png` | One station: wheel, windshield-size display on a floor frame, keyboard, low felt divider |
| `out/row.png` | Four stations in a row; the second holds a vehicle, so its halo is amber |
| `out/room.png` | 25 stations in five rows facing a video wall with the Fleet overview |

The display is 1.65 × 0.7 m, curved at 3000R and leaning back 8°, with its bottom edge at 0.95 m and its top at 1.65 m. From a seated eye height of 1.2 m it fills 11° below to 19° above eye level, about what a car windshield fills from the driver's seat, and the Wheel's rim just overlaps its bottom edge. It stands on two floor posts behind the desk, and the ops room rows are 2.7 m apart to make room.

Every wheel is a collection instance with its own `halo` colour, read by the halo material through an Instancer attribute. The displays show real console screenshots in `tex/` (from `software/scripts/shots.mjs`).

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b hardware/out_v6/model.blend -P hardware/context/scene.py -- hardware/context/out --samples=160 --res=2000x1250
```

All three take about 2.5 minutes on an M3 Pro (Metal). Use `--shots=desk` and `--samples=24 --res=800x500` for quick previews.
