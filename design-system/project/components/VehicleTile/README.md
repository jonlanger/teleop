# VehicleTile

A selectable summary of one vehicle in the fleet list: ID, route, control state, speed, link and the top alert.

**Consumer provides:** `id`, `route`, `state`, `speed` (km/h), `latencyMs`, optional `alert` and `alertSeverity`, `selected`, `onSelect`.

- A claimed vehicle gets an `amber` border, so the operator's own vehicles stand out in a long list. A stopped one gets a `stop` border.
- Selection is a 2px inset `ink` ring, independent of state color.
- Selecting a tile doesn't claim the vehicle. Claiming always goes through Claim vehicle on the wheel or a primary `Button`.
