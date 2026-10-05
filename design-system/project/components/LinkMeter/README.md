# LinkMeter

Shows round-trip latency and link quality for a vehicle, matching the wheel's status display.

**Consumer provides:** `latencyMs` (number or `null` for a lost link), optional `quality` to override the thresholds, optional `compact`.

- Thresholds: under 120 ms is Good (`mint`), under 250 ms is Fair (`amber`), anything slower is Poor (`stop`). `null` reads Link lost.
- Bars, number and word always appear together. Compact drops the word and is for tiles only.
- Set telemetry in `mono` with tabular figures so the number doesn't jitter as it updates.
