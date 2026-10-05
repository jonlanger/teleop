# Scene objects

The standard 3D objects for anything that renders the world: the operator camera view, product renders and onboarding scenes. They are three.js models from one kit, `scene-kit.js`, so every view shows the same car, the same pedestrian and the same shuttle.

```js
import * as THREE from "three";
import "./scene-kit.js";                       // or <script src="scene-kit.js">
const kit = window.teleop.createSceneKit(THREE);
const car = kit.templates.car();               // a THREE.Group
```

**The set:** car, bus, truck, shuttle, pedestrian, cyclist, cone, barrier (construction), tree, streetLight, stopShelter, plus `facadeMaterial()` for buildings. Add an object only when a view needs a new kind of thing, not a variant of an existing one.

## Spec

Every template follows the same rules, so placing and labelling objects never needs special cases.

- **Units and axes:** metres, +Y up, origin on the ground at the object's centre. Objects face +X and their right side is +Z, so a map heading `h` is `rotation.y = -h`.
- **Size:** `kit.dims[kind]` is `[length, width, height]`. Use it for hit boxes and labels, never a measured mesh. The sizes are real: a car is 4.5 m long, a bus 12 m, a pedestrian 1.76 m.
- **Shadows:** each object includes a soft contact shadow plane, so scenes need no shadow maps.
- **Instancing:** meshes that take a per-instance colour carry `userData.colorKey`: `paint`, `shirt`, `pants`, `skin`, `halo` or `hazard`. Draw many of a kind with one `InstancedMesh` per part, and set colours with `setColorAt`.
- **Animation:** `kit.pose.pedestrian(g, phase)` swings arms and legs. `kit.pose.cyclist(g, crank)` solves both legs from hip to pedal. Pose the template, then copy each part's matrix into its instances.

## Colour

The scene palette is `tokens.json → scene` and mirrors `kit.palette`. Keep the two in step.

- Variety is deliberately small: four car paints (silver, carbon, white, slate blue), three shirts, two trousers, three skin tones. Do not add hues to make a street look busier.
- The **shuttle's halo strip** is the only place control-state colours appear in a scene. It takes `halo.autonomy`, `halo.operator`, `halo.transitioning` or `halo.stopped` and must match that vehicle's `ControlState`.
- **Red** in a scene is limited to tail lights and the halo's stopped state. **Amber** is limited to hazard and warning lamps, and the operator halo.
- Signs and liveries stay neutral (robot white, carbon). Mint never appears on a sign or a livery.

## Quality bar

- Build from real profiles: car bodies are side profiles with wheel arches; buses and shuttles are rounded plan shapes. A body's bevel stays inside its stated size, so glass bands and halo strips sit on the surface rather than being swallowed.
- Wheels are cylinders with a tyre, a rim and a hub, placed on axle lines that sit flush with the body sides.
- Lights are unlit materials, so they read at night and in fog without bloom.
- Buildings use `facadeMaterial()`. Windows, floor lines, storefronts and a few lit windows come from world position in the shader, with no textures and no per-building geometry.
- Check new objects in `preview.html` (lit turntable, dimensions under each tile) before using them in a view.
