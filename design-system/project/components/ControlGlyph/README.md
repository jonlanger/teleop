# ControlGlyph

Draws a wheel control as an on-screen prompt, in the same shape as the physical cap.

**Consumer provides:** `control` (one of `speaker, estop, hazard, horn, ptt, claim, release, log, dpad, stick, p1, p2, brake, throttle`), optional `size` (px, default 20), optional `showLabel`.

- Glyphs follow the faceplate. Left key column: `ptt` (Talk), `log`, `speaker`, `dpad`. Right key column: `claim`, `release`, `horn`, `stick`. Centre: `estop`, `hazard`. Inside the columns: `p1`, `p2`. Behind: `brake`, `throttle`.
- Prompt with the control that does the job: "Click [stick] to acknowledge", "[dpad] left/right to change camera".
- Use glyphs in prompts, in onboarding and inside `Button`. Never use them as decoration.
- The emergency stop glyph is the only red glyph. Hazard uses a `stop`-colored outline on a neutral cap.
