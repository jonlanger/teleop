# teleop software

A static web app with four workspaces, built on the teleop design system (`../design-system/project`): the tokens are generated into CSS, and the eight components load from its bundle unchanged.

```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # static bundle into dist/ (what Vercel deploys)
npm run preview    # serve the built bundle locally
```

There is no server: the simulator and the operations API run in the browser (`src/engine/`), and records are saved to this browser's localStorage. Each browser has its own fleet. Open any page with `?reset` to start again from the seed data.

The homepage (`/` when signed out, `/about` for anyone) is the public pitch to autonomous delivery and freight operators. It opens on the live fleet as an interactive map (click a vehicle to follow it; the camera flies to new help requests on its own), then tells the story in order: why people still matter (cited research), who it's for and who pays, the cost per delivery, the product, hands-on technology demos, and the hardware in context. The homepage labels the simulator's routes as delivery runs; the console still shows them as shuttle routes. Under Hardware, "One system" plays one request start to finish on a single timeline: the rigged Wheel (`src/assets/wheel-rigged.glb`, exported Draco-compressed at 30 fps by `hardware/export_web.py`) plays the rig's clips with close-up cameras, and the console reads the model's transforms every frame to drive the real status bar, steering wheel, pedals and the operator's camera (the console's own `World`, rendered from a vehicle pose the story drives). "Details, matched" pairs close-ups of the Wheel with the console components they drive. The Draco decoder is served from `public/draco/`. **Sign in** (`/signin`) and **Get started** (`/signup`) both open the person picker. The homepage has its own Auto / Light / Dark switch (Auto follows the system) and does not change the console's theme. Its screenshots come from `node --experimental-websocket scripts/shots.mjs <out>` with the dev server running on port 5181 (headless Chrome); the in-context renders come from `hardware/context/scene.py`.

Sign in by picking a person (no passwords in the prototype). The top bar always shows the four workspaces in order: **Operator · Fleet · Engineer · Support**. A tab your role can't use stays visible but disabled. Operators land on Operator, the fleet manager on Fleet, engineers on Engineer, and support on Support.

## Workspaces

| Workspace | For | What's there |
| --- | --- | --- |
| **Operator** | Operators | The centre is a cockpit sized to the window, so the essentials never scroll away. A one-line status bar shows who is driving and holds claim and release; it tints amber while you drive and turns solid red only for a latched stop. Below it, the camera and route map share the main area, safety (Stop, Reset, Pull over, Approve path) sits beside or above the drive strip, and the drive strip holds the wheel, pedals, speed hold and cap, gear, parking brake, turn signals, hazards and horn. The layout adapts down to 1280×720 with both side panels open, and stacks on phones. Lights, wipers, doors, cabin, speaker, talk and Log sit below the fold. Around it: fleet list, camera view with `CameraSwitcher`, route map, and alert rail. Claim, then release with a 1.2 s hold. Drive from the screen: drag the steering wheel, and press and hold the brake and throttle pedals. The vehicle can also hold a set speed. Or drive with the teleop Wheel, a gamepad, or the keyboard. Full controls for gear, parking brake, speed cap, turn signals, hazards, headlights, wipers, horn, door locks, door, cabin lights, external speaker, talk, emergency stop and reset, pull over, approve path, and Log. The panel also shows the wheel and the operator's own shift, with clock in and out. Both side panels can be hidden. Vehicles collapse to a rail of unit numbers for one-click switching. Hiding alerts turns new ones into toasts, at most three, newest on top: critical alerts stay until acknowledged or dismissed, everything else fades after 10 s, and **View all alerts** reopens the list. The thumbstick, D-pad, and Enter work on the toasts too, and the layout is remembered per browser. |
| **Fleet** | Fleet managers | Overview (KPIs, the live city map, and needs attention, including what Support has asked fleet to do), Shifts (weekly schedule, hourly coverage against a 1:5 target, clock in and out), Vehicles (assigning vehicles to operators, service status), People. |
| **Engineer** | Engineers (support can open it to investigate) | Telemetry (live stats, 5-minute charts, sensors), Logs (streaming, filters, pause, NDJSON export), Command audit (ack and confirm p50/p95 by command, full trail), Maintenance (component health, work orders, active faults), Diagnostics (self-test, subsystem restart, software versions), Stations and wheels, and Support requests (tickets waiting on engineering). This is the only place logs and the full command trail appear. |
| **Support** | Support agents; everyone else can report issues and follow their own | The ticket queue, described below. |

## Support

Every ticket lives in Support, whoever raised it. The ticket's **source** records where it came from:

- **Customer:** riders, by rider app, phone or email. Support logs calls with **Log a rider contact**, and the simulator sends in a new rider ticket every 4 to 9 minutes.
- **Operator:** the console's Report issue, plus an automatic ticket after every emergency stop.
- **Engineering, Fleet manager or Support:** raised by that team with **Report an issue**.

Resolving a ticket:

- **Queue:** sorted by the next deadline. Rider tickets must get a first reply first (P1 15 min, P2 1 h, P3 4 h, P4 24 h); every ticket then has a resolution target (P1 4 h, P2 1 day, P3 3 days, P4 7 days). Views cover all open tickets, needs first reply, overdue, assigned to me, unassigned, waiting on engineering, waiting on fleet, reported by me, and resolved, with filters for source and search.
- **Playbook per category:** lost item, service and stops, accessibility, safety, vehicle fault, rider app, operator station, autonomy software, and other. Each step either opens the tool that does it or is ticked off by hand. A step ticks itself off when its reply or escalation actually goes out.
- **Conversation:** replies go to the requester, either the rider or the staff member who raised it. Internal notes stay inside the team. Canned replies fill in the rider's name, vehicle and stop.
- **What the vehicle did:** the vehicle's events and commands from 20 minutes before the ticket to 5 minutes after, plus its live state, related tickets and open work orders.
- **Other teams:** send a ticket to engineering, optionally opening a linked work order, or ask fleet. The ticket waits until that team hands it back. Finishing the linked work order hands it back automatically, and Fleet's overview lists what Support has asked of fleet.
- **Resolve:** every resolution records an outcome code and a one-line summary. Marking a duplicate requires the original ticket. **Insights** shows open work by source, category, outcome and owner, plus median first-reply and resolution times.

Operators can see the queue, add internal notes, and follow their own reports. Replying, escalating and resolving are for support, fleet managers and engineers, and the in-page API enforces this.

## The city

`shared/city.ts` generates one city that the simulator, the camera, and both maps share. It is deterministic, so every view matches:

- named avenues and streets, with Market Ave, Harbor Blvd, Central St and Pier Rd as four-lane arterials and the rest as two-lane local streets
- about 750 buildings, taller toward downtown, plus City Hall, the Depot, Civic Park, Campus and the Marina
- the harbor waterfront
- crosswalks, stop lines, centre and lane lines
- street trees, arterial street lights, and parked cars

Vehicles drive the right-hand lane of their route (`lanePath`). They stop at named stops, open and close the door, and pick up and drop off riders. The vehicle reports bumper contact if it is driven into a building or the harbor edge.

The camera is a three.js render of that city from the vehicle's pose (`src/apps/operator/scene/world.ts`). It is built from the design system's standard scene objects (`design-system/project/components/SceneObjects`): car, bus, truck, shuttle, pedestrian, cyclist, cone, construction barrier, tree, street light, stop shelter and building facades. Cross streets, turns, other fleet vehicles, and the obstacle autonomy stopped for all appear where the map shows them.

Rendering stays cheap: the ground layers are merged meshes, buildings are one instanced mesh with a facade shader, and every kind of object is one set of InstancedMeshes filled each frame with what is near the camera. A frame costs 1 to 3 ms, with about 150 draw calls. A 2D overlay on top carries perception: detections, hover brackets, operator labels and the predicted path. The driver's route map is heading-up (north-up is a toggle) and shows the route ahead, the next turn and street, the next stop with an ETA, and an off-route warning tied to the 15 m release rule.

## Guiding autonomy without claiming

While a vehicle is in autonomy and nobody has claimed it, an operator can help it without taking over:

- **See what it sees.** Hovering over the camera brackets whatever perception detects (cars, parked cars, buses, trucks, pedestrians, cyclists, cones, other shuttles, stops) and shows its label, distance and speed. **Detections** outlines everything nearby.
- **Label things.** Clicking an object lets you correct or add its label (pedestrian, cyclist, car, bus, truck, cone, debris, construction, animal, not an obstacle). Clicking the road marks a pothole, debris, flooding, construction, a blocked lane or crossing pedestrians. Labels are sent to the vehicle as a `perception.label` command, confirmed with distance, pinned in the camera view for everyone, and logged for engineering. They expire after 15 minutes.
- **Brake and nudge.** **Hold to brake** slows or stops the vehicle. **Nudge left** and **Nudge right** shift autonomy's path up to 3 m while held. Dragging across the camera does the same, and so do the on-screen wheel and brake pedal or a teleop Wheel. The throttle stays with autonomy. Guidance streams at 10 Hz (`guide` messages) and lapses 500 ms after you let go, so autonomy is back on its own path the moment you stop. The vehicle reports what it is following, and the predicted path turns amber while you guide it. Nudging 2 m or more around an obstacle autonomy is allowed to pass lets it creep past without Approve path.

Autonomy also keeps the fleet moving on its own: pedestrians clear in 10 to 25 s, autonomy finds its own way past other obstacles in about one to two minutes, and a vehicle that touches a curb re-plans onto its route. In a 10-minute headless run, the in-service fleet was moving 75% of the time; the rest was spent at stops, at corners and on assist holds.

The camera shows background life: pedestrians on the sidewalks, two-way traffic with city buses on the arterials, and cyclists on local streets. It is deterministic in space and time, so every console sees the same street, but it is visual only and the simulator ignores it. Traffic keeps to the right. Objects come from the design system kit, so they have one fixed look and a small palette. Other shuttles show their control state on the halo strip, and the double-parked truck and the construction barrier flash their hazard lamps.

## What happened on the vehicle

The console never sets vehicle state. It sends a command, and every control shows what the vehicle reported back:

```
sent ──▶ received (vehicle acked, ms) ──▶ confirmed (vehicle reports the new state, ms)
                    └▶ rejected (vehicle refused: "Hold the brake to shift")
                    └▶ failed   (actuator fault: "Wiper motor overcurrent (B1A20)")
   └▶ rejected by server (policy: "Claim the vehicle first")      └▶ timeout (no ack in 2.5 s)
```

- In each segmented control, **filled** is what the vehicle reports and **outlined (pulsing)** is requested but not yet confirmed. The readback line under each control gives the latest status, its timing, and the vehicle's own words.
- **Engineering → Command audit** shows each command's full lifecycle, and **Logs** has the vehicle's own events. Operators see only the readback under each control.
- Driving is a 20 Hz stream (`drive` messages), not separate commands. On-screen input and the wheel, gamepad, or keyboard are merged: the larger brake input always wins, and on-screen steering takes over while you hold it. The wheel and pedals show your input (dashed) against what the vehicle actually did (solid). Speed hold runs on the vehicle, and the brake cancels it. If the stream stops for 600 ms (lost link, closed tab), the vehicle's watchdog brakes it to a stop.
- Side effects: an emergency stop opens a P1 incident ticket and a critical alert, and a failed command raises a warning. The Log key saves a snapshot that can become a ticket.

## The wheel

`shared/wheel-hid.ts` is the USB contract for the wheel firmware: Gamepad API axis and button indices for input, plus WebHID output reports for the halo (0x01) and haptics (0x02).

- **Inputs** use the same control names as the hardware. P1 and P2 default to the left and right turn signals, because the wheel has no stalk. Release must be held for 1.2 s on the wheel too.
- **Without a wheel**, any standard gamepad (such as an Xbox controller) or the keyboard stands in. The keys are listed in the Wheel panel; Esc is the emergency stop.
- **Halo**: the console sets it from the selected vehicle's `ControlState` once the wheel is paired over WebHID (Chrome or Edge). The grips pulse for new warnings and critical alerts.

## Layout

```
shared/      domain types, wire protocol, control names, wheel USB contract, site map and routes
src/engine/  runs in the page: index.ts (connection + request entry points), fleet.ts (command lifecycle,
             alerts, logs, telemetry), api.ts (routes and rules), store.ts (localStorage, rota roll-forward),
             seed.ts, sim/vehicle.ts
src/         ds/ (design system loader, generated tokens), lib/ (live store, api, router, wheel),
             ui/ (panels, charts, map, dialogs), apps/{operator,fleet,eng}
```

## Simulated today, real later

| Simulated | Replace with |
| --- | --- |
| `src/engine/sim/vehicle.ts`: physics, drive-by-wire, body, autonomy assist requests, sensors, a cellular link with a weak zone | The vehicle gateway. `Vehicle.validate()` and its readback are the interface to keep. |
| `CameraView`: a three.js render of the simulated city | WebRTC tracks per camera (keep the perception overlay on top) |
| `shared/city.ts`: a generated city | Real map data for the service area (for example OSM or HD maps) behind the same helpers |
| Sign in by choosing a person | SSO and sessions |
| The whole backend in `src/engine/`, running in the browser; data in localStorage, logs and telemetry in memory | A server running the same fleet and API code, a database, and a time-series and log store |
| Wheel USB vendor ID | The issued VID/PID, and a firmware build that matches `wheel-hid.ts` |

Not built yet: over-the-air software install (it is tracked as a software work order instead), audio for Talk and the external speaker (commands and readback only), and tests.
