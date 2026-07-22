# Reel Fidelity Checklist — every mistake reel must pass ALL of these

> Distilled from founder taste-pass #1 (the 8 real defects found on the first 20 reels, 2026-07-21). Every NEW reel (the 25 Half-B builds + any future) is built against this list, the revision pass **fails** anything that violates it, and Claude re-renders + eyeballs (R0) every reel before the founder sees it. The 20 originals were re-checked against this too.

## The gate (each item is a hard pass/fail)

1. **The map contains the scenario's REAL infrastructure.** A rail crossing has rails + a crossbuck (+ a train if that's the lesson); a speed-zone has the speed sign; a stop scene has the stop sign; a tram scene has tram tracks. **Never a bare sign dropped on a generic empty road.** *(rail-crossing, speed-creep defects)*

2. **The mistake is visually OBVIOUS, not subtle.** Tailgating = a tight gap (~½ a car length). Speeding = clearly over the limit and readable on the dashboard (e.g. 72 in a 50). Not-yielding = the blocked vehicle is right there and impeded. If a stranger can't tell what went wrong in 3 seconds, it fails. *(follow-distance, speed-rain, emergency defects)*

3. **Sign + road markings + geometry ALL AGREE with the rule.** No "no-overtaking" sign on a road whose lane count + markings make overtaking legal. The road must be the *kind of road the rule applies to*. *(overtake-ban defect)*

4. **The conflict actor actually creates a VISIBLE conflict.** The ambulance is in the SAME lane, blocked; the pedestrian is in the crossing; the oncoming car is on the collision path — not in a different lane, not off-screen, not a distant speck. *(emergency-lane defect)*

5. **The scene has CONTEXT — a reason for the rule.** A speed limit needs a visible reason (town entry / school / curve); a give-way needs the road you're yielding to. *(speed-creep defect)*

6. **The environment reads the condition.** Rain looks wet + gloomy in DAY and NIGHT; night is dark; fog occludes. *(rain-brightness defect)*

7. **The camera FRAMES the mistake and its cause.** The governing sign / conflict actor is in-frame at the fault beat; if the conflict is behind the car, use the rear-aware camera. *(emergency-camera defect)*

8. **Teaching aids PERSIST.** A required-lane band / highlight / marker stays visible across the clip window, not a 2-second flash, and follows the car if needed. *(lane-band defect)*

## Verification order (per reel)
build (against this list) → adversarial code-review (enforces this list) → **Claude re-renders + looks (R0)** → fix anything that fails → re-render → repeat until every item passes → founder taste-pass.
