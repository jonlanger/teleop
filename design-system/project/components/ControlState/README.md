# ControlState

Shows who is driving a vehicle: autonomy, operator, transitioning, or stopped. It is the on-screen twin of the wheel's LED halo.

**Consumer provides:** `state` (`"autonomy" | "operator" | "transitioning" | "stopped"`), optional `vehicle` ID, optional `size="lg"` for the takeover banner.

- Autonomy is `mint` on `mint-wash`. Operator is `amber` on `amber-wash`. Transitioning is `ink` with a 900 ms halo pulse (`pulse-transition`). Stopped is `on-stop` on `stop-fill`.
- Always render the word and the halo glyph together. Color alone never carries the state.
- Exactly one ControlState per vehicle on screen, and it must match the hardware halo color at all times.
- Don't restyle it as a button. It reports state; claiming and releasing happen through `Button` and `HoldToConfirm`.
