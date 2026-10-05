teleop is one system for two surfaces: the wheel an operator holds and the console they watch. It borrows two things from its references. From the Xbox Wireless Controller: controls you find without looking, a removable faceplate, textured grips, and a single glowing element that carries state. From the Specialized Tarmac SL9 in Satin Carbon: a dark satin body, a reflective italic wordmark, and one warm material accent (the tanwall). It keeps two things from the original teleoperation station: the mint spine and the red stop.

## Principles

1. **State is a color, a word and a shape, all three.** Autonomy is `mint`, operator is `amber`, transitioning is a pulsing `ink` halo, stopped is `stop-fill`. The wheel's LED halo, the `ControlState` badge and the console banner always agree.
2. **Red means stop.** `stop` and `stop-fill` appear only on the emergency stop, critical alerts and a lost link. Never use red for errors in forms, delete buttons or decoration.
3. **Fixed controls get fixed names.** Each wheel control has one name, used on the hardware legend, in `ControlGlyph` and in copy: Emergency stop, Hazard lights, External speaker, Horn, Talk, Claim vehicle, Release vehicle, Log, D-pad, Thumbstick, Throttle, Brake, P1, P2.
4. **Quiet everywhere else.** Carbon and graphite surfaces, hairline `line` dividers, no shadows, no gradients. The camera feed is the brightest thing on screen.

## Voice and copy

- Write like a dispatcher: short, specific, present tense. "Pedestrian in crosswalk", not "A pedestrian has been detected".
- Sentence case for buttons and titles ("Claim vehicle"). Uppercase with `label` tracking only for field labels, badges and the Stop button.
- Name vehicles by ID in `mono` (`UNIT-14`). Name people by role ("field team", "supervisor").
- Use "claim" and "release" for control handoff. Never "take over", "disengage" or "hand back" in UI text.
- Numbers carry units, set smaller in `ink-muted`: `142 ms`, `38 km/h`.
- No emoji, no exclamation marks.

## Color

- Ground the console in `surface-0`, panels in `surface-1`, controls in `surface-2`. Hover steps up one surface; nothing floats on a shadow.
- Text is `ink`. Secondary text is `ink-muted`. `ink-faint` is for disabled text only.
- `mint-fill` with `on-mint` is the single primary action per view. In the light theme, `mint` as text darkens to stay legible.
- `amber` marks every vehicle the operator holds: the tile border, the badge, the takeover banner.
- `info` blue is for informational alerts and links, so it never competes with the three state colors.
- Hardware colors (`carbon`, `graphite`, `robot-white`, `gum`, `alloy`) are for product renders, the mark and marketing. Don't use them as UI surfaces.

## Type

- Archivo is the only typeface for words, used across its width axis. `display-xl` is expanded (wdth 125) and italic, after the Tarmac's forward-leaning downtube logo. Keep it for headlines and the takeover banner. Interface text is Archivo at normal width: `title`, `heading`, `body`, `label`, `button`.
- JetBrains Mono for anything that updates or is read character by character: `readout` for latency and speed, `data` for IDs, coordinates and timestamps. Always tabular figures.
- Load both from Google Fonts: `Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900` and `JetBrains Mono:wght@400..700`.

## Space, radius, layout

- Spacing is a 4px grid (`space-1` to `space-12`). The wheel's button pitch and edge clearances use the same steps in millimetres.
- Radii come from one family: `radius-sm` buttons, `radius-md` cards, `radius-lg` panels, `radius-pill` state badges and the hold track. The hardware mirrors it: R2 detail, R6 caps, R12 faceplate, R24 base plan.
- The console is three columns: fleet list (`VehicleTile`s) on the left, the camera viewport with `CameraSwitcher` in the center, the alert rail (`AlertRow`s) on the right. The center column gets at least 60% of the width.

## Focus, motion, accessibility

- Focus is a 2px solid `focus` ring at a 2px offset, so it lands on a surface (16:1) and never on a colored fill.
- Motion is functional only: the 900 ms transition pulse (`pulse-transition`) and the 1200 ms hold fill (`hold-confirm`). Both stop under `prefers-reduced-motion`; the word still says what is happening.
- Mint and amber also differ in lightness and always carry a word. Red is never the only signal of a stop.

## Iconography

- The only icons are `ControlGlyph`s, which draw the physical cap of each wheel control, and the halo state glyph inside `ControlState`. Don't add a general icon set; if a function has no hardware control, label it with text.

## Scene objects

- Anything that renders the world (the camera view, product renders, onboarding) uses the standard objects in `components/SceneObjects`: car, bus, truck, shuttle, pedestrian, cyclist, cone, construction barrier, tree, street light, stop shelter and building facades. They are three.js models from one kit, built to one spec: metres, facing +X, origin on the ground, a soft contact shadow under each.
- Scenes are quiet like the UI: a small, fixed set of paints and outfits from `tokens.json → scene`, neutral signs and liveries, and no extra hues for busyness.
- State colours appear in a scene only on a shuttle's halo strip, matching its `ControlState`. Red is limited to tail lights and a stopped halo; amber to hazard lamps and the operator halo.
- Scene objects are imagery, not icons. The only icons remain `ControlGlyph`s.

## Logo

- The logo is the word **teleop** alone: lowercase Archivo at width 125 (expanded), weight 800, italic, tracked -0.02 em. That is the `display-xl` setting, so the logo and the headlines are one voice. There is no symbol, no glyph inside a letter, and no tagline lockup.
- Use `teleop-wordmark-carbon.svg` on light grounds and for one-color print and engraving. Use `teleop-wordmark-white.svg` on carbon, on graphite and on camera imagery. On hardware it is a reflective metallic print.
- Don't retype it, stretch it, outline it or recolor it. Clear space is the height of the "e" on every side.
