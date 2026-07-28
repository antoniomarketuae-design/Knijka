/**
 * Telltale warnings — WHICH cabin faults are worth surfacing outside the
 * instrument panel, right now.
 *
 * Founder review 2026-07-28: „from the POV behind the car … Belt is not on and
 * for example if needed Lights are not on, a ping where the user can see what
 * is missing, currently he only sees in the dashboard." In chase (and top-down)
 * view the 3D cluster is out of frame and the DOM status bar is a 24 px strip
 * at the bottom edge — on a 390 px phone it is even clipped at both ends. A
 * telltale nobody looks at teaches nothing.
 *
 * This module is the pure half: given the per-frame DashboardStatus it returns
 * the ARMED warnings only — armed meaning "this is genuinely wrong for the car
 * as it stands", not "this lamp is off". A ping that fires while the car is
 * parked with the engine off would be noise, and noise is what the founder is
 * already complaining about elsewhere in the same review.
 *
 * Deliberately mirrors the rule engine's own arming conditions (rules/engine.ts)
 * so the HUD never warns about something that is not a mistake, nor stays quiet
 * about something that is about to be graded:
 *   belt        SEATBELT_OFF_WHILE_MOVING   — engine running or already rolling
 *   handbrake   HANDBRAKE_LEFT_ON           — parking brake on AND moving
 *   lights      HEADLIGHTS_OFF_AT_NIGHT / _IN_RAIN — required and off
 *   fog         FOG_LIGHTS_OFF_IN_FOG       — required and off
 *   hazards     (ungraded) hazards left on while driving normally
 * Nothing here reads or writes the rule engine — it only consumes the same
 * cabin state the instrument panel already draws.
 */

import type { DashboardStatus } from "./dashboardStatus";

export type TelltaleWarningId = "belt" | "handbrake" | "lights" | "fog" | "hazards";

export interface TelltaleWarning {
  id: TelltaleWarningId;
  /** Short BG label — must read at a glance while driving. */
  labelBg: string;
  /** The key that fixes it (legend grammar); null when there is no single key. */
  keyHint: string | null;
  /** danger = graded the moment it is sustained; warn = fix it soon. */
  tone: "danger" | "warn";
  /** Screen edge. Left = "the car is not safe to move", right = "lights/signals". */
  side: "left" | "right";
}

/** Speed (km/h) above which the car counts as moving — the rule engine's own
 *  stop-and-go floor, so a ping never fires on parking-lot creep alone. */
const MOVING_KMH = 3;
/** Hazards left on above this speed reads as a forgotten button, not a genuine
 *  „I am a hazard" stop. Below it, hazards are legitimate and stay silent. */
const HAZARDS_CRUISE_KMH = 25;

/**
 * The armed warnings, in surfacing priority (most safety-critical first).
 * Pure: no clock, no randomness — same status in, same list out.
 */
export function armedTelltaleWarnings(s: DashboardStatus): TelltaleWarning[] {
  const speed = Math.abs(s.speedKmh);
  const moving = speed >= MOVING_KMH;
  // "About to drive" counts too: the belt has to be on BEFORE moving off, and a
  // warning that only appears once you are rolling arrives one mistake late.
  const live = moving || s.engineOn;
  const out: TelltaleWarning[] = [];

  if (live && !s.seatbeltOn) {
    out.push({ id: "belt", labelBg: "Коланът не е поставен", keyHint: "B", tone: "danger", side: "left" });
  }
  if (moving && s.parkingBrakeOn) {
    out.push({
      id: "handbrake",
      labelBg: "Ръчната спирачка е вдигната",
      keyHint: "Space",
      tone: "danger",
      side: "left",
    });
  }
  if (live && s.headlightsRequired && s.headlights === "off") {
    out.push({ id: "lights", labelBg: "Светлините не са включени", keyHint: "L", tone: "danger", side: "right" });
  }
  if (live && s.fogLightsRequired && !s.fogLightsOn) {
    out.push({ id: "fog", labelBg: "Фаровете за мъгла не светят", keyHint: "V", tone: "warn", side: "right" });
  }
  if (s.hazardsOn && speed >= HAZARDS_CRUISE_KMH) {
    out.push({ id: "hazards", labelBg: "Аварийните светлини са включени", keyHint: "J", tone: "warn", side: "right" });
  }
  return out;
}

/** Cheap change detector for the low-Hz poll — the ids alone decide the render. */
export function telltaleWarningsKey(list: ReadonlyArray<TelltaleWarning>): string {
  return list.map((w) => w.id).join(",");
}
