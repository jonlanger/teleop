# CameraSwitcher

A segmented control for the vehicle camera views, in the same order the wheel's D-pad steps through them.

**Consumer provides:** optional `views` (`[{id, label}]`, default front, rear, left, right), `active`, `onChange`.

- Order is fixed: Front, Rear, Left, Right. D-pad right moves one step right, D-pad left one step left, and both wrap around. The thumbstick pans within the active view.
- The active view is `ink` on `surface-0`, inverted from the track so it reads at a glance on a wall display.
