# FEEL-NOTES — Rapier raycast vehicle spike

> Spike status: **build green, physics numerically validated headless**. This
> spike answers ADR-005's open risk ("Rapier feel tuning, plan 8–10h"): the
> `DynamicRayCastVehicleController` CAN be tuned into a credible ~1.2 t compact,
> but only after fixing three non-obvious engine quirks documented below.
> A human seat-of-pants pass in the browser is still required — this session
> tuned against measured physics, not against hands on a keyboard.

Run it: `npm install && npm run dev` (browser)
Measure it: `npx vite build --ssr src/harness.ts --outDir harness-dist && node harness-dist/harness.js` (headless scenario suite)

## How the tuning was done

Two passes, deliberately in this order:

1. **Derive, don't guess.** Every constant in `src/tuning.ts` was computed
   from vehicle dynamics first: suspension stiffness from a 1.6 Hz natural
   frequency target, damping from ζ = 0.37/0.61, brake force from a 0.9 g
   stop, tyre μ from the rollover inequality (see below), engine curve from a
   ~10 s 0–100 compact. The file documents each derivation.
2. **Measure, don't hope.** `src/harness.ts` runs the *real* `Vehicle` class
   headless in Node (rapier wasm needs no browser) through 8 scenarios and
   prints hard numbers. Tuning iterated against those numbers.

### Measured results (final constants)

| Scenario | Result | Target | Verdict |
|---|---|---|---|
| Settle | ride 0.630 m, 4 wheels grounded, 0.001 km/h drift | stable, no jitter | OK |
| Full throttle | 0–50 3.8 s · 0–100 11.6 s · ~120 km/h @ 45 s (asymptote ≈ 133) | compact hatch | OK |
| Full brake from 90 | 0.97 g, 32.9 m, 2.1° nose dive | 35–40 m, visible dive | OK (slightly strong, feels "modern ABS") |
| Steady corner ~50 km/h | 2.6° body roll, 40°/s yaw, no slide | 2–5° lean | OK |
| 12 cm sharp curb @ 57 km/h (right wheels only) | max roll 2.2°, stays upright | no flip @ 50 | OK, with margin |
| Lane change @ 90 km/h | 3.4° roll, keeps heading, no spin | controllable | OK |
| Handbrake + full lock @ 50 | rotates ~60°, recovers, no flip | playable slide | OK |
| Reverse | caps 25 km/h, gear R, throttle stops-then-forward | sane state machine | OK |

## The three things that actually mattered (rapier gotchas)

These cost the tuning time; the platform team must not rediscover them:

1. **Suspension is mass-normalized (Bullet port).** Spring force =
   `stiffness × compression × chassisMass`. Stiffness ~26 ≈ 1.6 Hz; the
   values you see in random examples (5.88) give a 0.8 Hz waterbed.
   Also `maxSuspensionForce` defaults to 6000 N — silently saturates under a
   1.2 t car; raise it (we use 26 000).
2. **`setWheelBrake()` takes an impulse per step, not a force.** Convert with
   `forceN * fixedDt` or braking will be ~60× off. Related Bullet legacy: a
   non-zero engine force on a wheel makes the solver ignore that wheel's
   brake — never set both.
3. **Raycast cars corner dead flat.** Side impulses are applied near COM
   height (Bullet `rollInfluence≈0.1`, not exposed in rapier.js), so a 0.66 g
   corner produced 0.3° of roll. Fix in `vehicle.ts`: measure lateral accel
   (low-passed) and apply `τ = m·aLat·arm` about the forward axis
   (`ROLL_COUPLING_*` constants), then let springs/ARBs fight it. That took
   roll from 0.3° → 2.6° and brake dive from 1.4° → 2.1° while the harness
   confirmed no flip on curb strike or 90 km/h lane change.

Also fixed en route:

- `controller.currentVehicleSpeed()` is `|linvel|`-based and spiked +250 km/h
  on suspension jolts (and reads freefall as road speed). `Vehicle` computes
  signed forward speed by projecting body velocity on the chassis +Z axis —
  use that for HUD *and* for the engine-curve lookup.
- rapier.js API quirk: the forward-axis setter is misnamed — assign
  `controller.setIndexForwardAxis = 2`, NOT `controller.indexForwardAxis = 2`
  (the latter is a getter-only property; assignment silently does nothing and
  the default forward axis is X, so the whole sign convention breaks).
- Flip safety is an *inequality*, not luck: keep tyre μ (`frictionSlip` ≈ 1.4)
  below the rollover threshold `g·(track/2)/comHeight` ≈ 15.5 m/s² ÷ g ≈ 1.6.
  If someone later raises grip past ~1.8 the car will trip over itself in
  emergency-lane-change lessons.

## What feels right / wrong (honest assessment)

**Right (numerically verified):** acceleration/braking envelope, ride height
and settle, visible lean + dive, curb tolerance, speed-sensitive steering
keeping 90 km/h manageable, understeer-biased balance (front μ < rear, front
ARB > rear), handbrake slides that recover.

**Wrong or unverified — needs the human pass:**

- **Steering *texture* is unverified.** Rates (3.2/4.8 rad/s) and the
  speed-taper curve are sensible but "feel" is exactly the thing a harness
  cannot judge. Budget 2–3 h with hands on keys.
- **No tyre model.** Grip is a hard clamp (Bullet friction), so the limit
  arrives as a step, not a progressive slide with slip-angle buildup. Fine
  for a driving school (we teach *below* the limit); wrong for teaching
  skid recovery. If skid lessons matter, this is the trigger to evaluate
  Jolt's `WheeledVehicleController` (ADR-005 fallback).
- **Sharp curbs are step functions.** Single ray per wheel = the wheel
  teleports up 12 cm in one frame. It doesn't flip the car, but it will look
  harsh. Real fix: bevel curb collision meshes (cheap) or capsule/shape casts
  (expensive).
- **Steering wheel visual spin direction** and cockpit ergonomics were
  reasoned, not seen. Verify signs on first browser run.
- **60 Hz physics on high-refresh monitors**: render loop interpolation is
  not implemented (spike renders latest physics state). At 144 Hz the car
  will visibly micro-stutter.

## Recommendations for platform integration

**Keep (port nearly as-is):**

- `tuning.ts` as the single-file tuning contract — it is engine-agnostic
  data + comments, and the derivation comments are the institutional memory.
- `vehicle.ts` physics core (controller setup, brake/reverse state machine,
  roll coupling, ARB, forward-speed measurement). It is plain TS over rapier
  types; in R3F wrap it in a hook (`useVehicle`) that owns the rapier objects
  and syncs an `<group ref>` — zero React inside the physics.
- `harness.ts` — turn it into a CI check. Any tuning PR must show the
  scenario table; regression in "curb flip" or "lane change" blocks merge.
  This is how vehicle feel survives 240 h of hurried edits.
- Fixed 60 Hz timestep with accumulator + clamped frame delta (`main.ts`
  loop). Tuning is dt-sensitive; never step physics at display rate.

**Redo for the platform:**

- All visuals (placeholder boxes → Kenney car kit + hero cockpit per ADR-005).
- Collision hull: single chassis box is wrong for lesson scoring — cones get
  hit at bumper height by a flat wall. Use a compound (bumper + body + cabin)
  so the rule engine can distinguish "clipped a cone" from "hit a wall".
- Add render interpolation between physics states (store prev/curr transform,
  lerp by accumulator fraction).
- Camera: chase cam is fine; cockpit needs head-motion damping (tie eye point
  to a critically damped spring, not rigidly to the chassis) or players will
  feel every suspension tick.
- `updateVehicle` currently filters only the chassis collider by predicate;
  in the city use collision groups so wheel rays ignore trigger volumes
  (lesson checkpoints, pedestrian sensors).
- Road surfaces: grip is per-wheel (`frictionSlip`), so rain (ADR-005 weather
  lessons) = scale μ by surface material under `wheelContactPoint()` /
  `wheelGroundObject()` — the API is already there; design the road meshes
  with a material lookup in mind.

**Known issues (accepted for the spike):**

- rapier compat build logs a harmless "deprecated parameters for the
  initialization function" warning at init.
- Corner ring roads have radial texture stretch; visual only.
- The bundle is ~980 kB gzipped, ~2 MB of which (pre-gzip) is the base64
  wasm inlined by `rapier3d-compat`. The platform should use
  `@dimforge/rapier3d` (real .wasm file, streamed + cached) instead of the
  compat package.
- HUD gear display is cosmetic (speed thresholds); physics is gearless. Fine
  until lessons require clutch/manual — then this becomes a real gearbox
  model decision.
