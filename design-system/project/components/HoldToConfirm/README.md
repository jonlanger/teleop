# HoldToConfirm

A press-and-hold control for actions that hand off control, such as releasing a vehicle back to autonomy.

**Consumer provides:** `label`, `onConfirm`, optional `holdMs` (default `hold-confirm`, 1200 ms), `tone` (`amber` default, `mint`), `glyph`, `doneLabel`.

- The fill sweeps left to right while held. Letting go before it fills cancels with no side effect.
- Keyboard: hold Space or Enter. The hold time matches the hardware Release button's confirmation press, so the hand learns one rhythm.
- Use it for Release and for claiming a vehicle that another operator holds. Don't use it for routine actions; holding should feel rare.
