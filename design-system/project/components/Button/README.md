# Button

Triggers a single action, with an optional hardware glyph that shows the physical control that does the same thing.

**Consumer provides:** `children` (sentence-case label), `variant` (`primary | secondary | ghost | stop`), optional `glyph` (any `ControlGlyph` control), optional `size="lg"`, and the usual button props.

- `primary` (`mint-fill`, `on-mint` text) is for Claim vehicle and the one forward action in a view. Use one per view.
- `stop` (`stop-fill`) is only for stopping a vehicle. It is uppercase and never sits next to `primary` without `space-6` between them.
- Pass `glyph` whenever the wheel has a matching control, so operators learn the hardware from the screen.
- Release vehicle is not a Button. Use `HoldToConfirm`.
