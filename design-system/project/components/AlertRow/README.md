# AlertRow

One alert in the operator's queue, with severity, context and an Acknowledge action.

**Consumer provides:** `severity` (`critical | warning | info`), `title`, optional `detail`, `vehicle`, `time`, `acknowledged`, `onAck`.

- Critical uses `stop-wash` with a `stop` border and announces itself (`role="alert"`). Warnings use amber. Info uses `info` blue, so it never reads as a control state.
- The Acknowledge button shows the `stick` glyph: clicking the wheel's thumbstick acknowledges the selected row, and D-pad up/down moves the selection.
- The haptic pulse in the grips fires for new critical and warning alerts only.
- Acknowledged rows drop to `surface-0` and muted text. Keep them in the list until the incident closes.
