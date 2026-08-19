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
 *
 * ===========================================================================
 * 2026-08-19 — THE MIRROR WAS UNENFORCEABLE, AND IT HAD ALREADY DRIFTED TWICE
 * ===========================================================================
 * „Deliberately mirrors the rule engine's own arming conditions" was a claim
 * about a file this one cannot see, checked by nothing. Sweep 161 routed a
 * CRITICAL here (sc-hz-breakdown-pulloff — a lesson whose briefing names one
 * lamp and whose runtime names another) with the instruction to find out
 * whether what the telltale SHOWS and what the engine GRADES come from one
 * source. They did not. Both drifts are in the LIGHTS row, and both are read
 * off the engine's own text (`rules/engine.ts`, lines cited by value):
 *
 *  DRIFT 1 — THE SNOW ARM IS INVISIBLE TO THIS MODULE. Round 6 (O28) added a
 *    third arm to the low-beam duty:
 *      snowNoLights = snowy && !raining && !isNight && headlights==="off" && moving
 *      → makeViolation("HEADLIGHTS_OFF_IN_RAIN", t, SNOW_LIGHTS_COPY)
 *    The only input this module has for that duty is `DashboardStatus
 *    .headlightsRequired`, and the scene writes it as
 *      dash.headlightsRequired = isNight || rain;      // LessonScene.tsx:2871
 *    — snow is not in it, although `snow` is in scope on that very line and is
 *    handed to `runtime.sample(…, snow)` fourteen lines further down, which is
 *    what the GRADER reads. So on `sc-ac-snow` by day the engine convicts a
 *    dark car and this channel is silent. The car is handed over DARK there on
 *    purpose (`scene/cabin.ts initialHeadlightsFor` returns "low" for
 *    night/rain/fog and NOT for snow), and outside the cockpit the 3D cluster
 *    is not in frame at all — which is the entire reason this module exists.
 *    A student who is given a dark car, told nothing, and then billed for it is
 *    the founder's own roundabout complaint wearing a different coat.
 *
 *  DRIFT 2 — THE WARNING CITED THE WRONG LAW IN RAIN. `code` is the key into
 *    the violation catalog, and `LessonPlayShell.tsx:3206` really does spend
 *    it: `VIOLATIONS[w.code]` supplies the compact overlay's `explanationBg`,
 *    `correctiveBg` and `lawRef`. This row emitted HEADLIGHTS_OFF_AT_NIGHT
 *    unconditionally, so a DAYTIME RAIN drill printed the night row —
 *      title        «Движение нощем без светлини»   (vs «…в дъжд без светлини»)
 *      explanation  „На тъмно… Нощем виждаш само осветеното от фаровете"
 *      severity     osnovna (3 т.)                  (vs vtorostepenna, 1 т.)
 *    Requirement-zero (doc 64 THEO-4) forbids exactly this: not a bare verdict
 *    but a WRONG explanation, which is worse — it is a bare verdict wearing a
 *    citation. `lawRef` happens to coincide (both чл. 70, ал. 1); nothing else
 *    does.
 *
 * THE FIX IS TO STOP TAKING THE VERDICT AND START TAKING THE CONDITIONS.
 * `headlightsRequired` is one boolean standing for three different offences, so
 * no amount of care downstream can recover which one is true. `TelltaleConditions`
 * below carries the same four flags `reduceTick` grades on, and when it is
 * supplied both the arming AND the code are derived here, from the engine's own
 * precedence. It is OPTIONAL so that no caller breaks; when it is absent the
 * legacy `headlightsRequired` path runs unchanged, and that path is still wrong
 * in rain — see the ⚠ below.
 *
 * ⚠ ONE OF THE TWO CALL SITES IS IN A FILE THIS LANE DOES NOT OWN, so read the
 *   paragraph above as the rule and not as a description of what ships today:
 *     components/sim/LessonScene.tsx:2871   (the scene owns isNight/rain/fog/
 *       snow — all four are already local there) must publish them, which needs
 *       one field on `hud/dashboardStatus.ts`; then
 *     hud/TelltaleEdgePings.tsx:61 and
 *     components/sim/lesson-ui/LessonPlayShell.tsx:2199
 *   pass them straight through to the second argument here. Until that lands
 *   the snow hole and the rain citation stand, and `__tests__/
 *   telltale-warnings.test.ts` pins BOTH the corrected behaviour (with
 *   conditions) and the legacy behaviour (without), so the day the wiring
 *   arrives the legacy block is what has to be deleted rather than discovered.
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
  /**
   * THE RULE THIS FAULT IS ABOUT — the key into the violation catalog, so a
   * warning can always show its authored, law-cited WHY (THEO-4: no bare
   * verdicts, ever). Carried as a CODE rather than as prose because the prose
   * has exactly one home (rules/catalog.ts, ADR-002) and a second copy here
   * would be a second thing to keep true. `null` for the ungraded courtesy
   * ping (hazards left on), which is not a mistake and states no verdict.
   */
  code:
    | "SEATBELT_OFF_WHILE_MOVING"
    | "HANDBRAKE_LEFT_ON"
    | "HEADLIGHTS_OFF_AT_NIGHT"
    | "HEADLIGHTS_OFF_IN_RAIN"
    | "FOG_LIGHTS_OFF_IN_FOG"
    | null;
}

/**
 * The weather/time flags the RULE ENGINE grades on, as the engine names them
 * (`SimTick.isNight` / `.rain` / `.snow` / `.fog`, rules/types.ts) — not a
 * second vocabulary, so a reader can put this file and `reduceTick` side by
 * side and check the mirror by eye.
 *
 * Optional at the call site because two of the three callers live in files this
 * lane does not own (see the ⚠ in the header). Supplying it is what makes the
 * lights row agree with the grader; omitting it keeps today's behaviour exactly,
 * including today's two defects.
 */
export interface TelltaleConditions {
  isNight: boolean;
  rain: boolean;
  /** doc 72 AC-08. Compile makes the three weathers EXCLUSIVE, so a snow lesson
   *  has rain === false and fog === false — which is why `headlightsRequired`
   *  („isNight || rain") could never see it. */
  snow: boolean;
  fog: boolean;
}

/**
 * WHICH low-beam offence is live, in the engine's own precedence — or null when
 * the conditions demand no lights at all.
 *
 * Read straight off `rules/engine.ts`: the night arm carries no exclusion and
 * fires first; the rain arm is guarded `!tick.isNight`; the snow arm is guarded
 * `!raining && !tick.isNight` and deliberately REUSES the rain row's code (with
 * SNOW_LIGHTS_COPY) rather than adding a second one for the same rule. So the
 * order below is the engine's order, and a snowy night bills the night row once
 * — here as there.
 */
export function headlightDutyCode(
  c: TelltaleConditions,
): "HEADLIGHTS_OFF_AT_NIGHT" | "HEADLIGHTS_OFF_IN_RAIN" | null {
  if (c.isNight) return "HEADLIGHTS_OFF_AT_NIGHT";
  if (c.rain || c.snow) return "HEADLIGHTS_OFF_IN_RAIN";
  return null;
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
 *
 * `conditions` is the grader's own weather/time truth. Supply it and the lights
 * row arms on all THREE arms of the low-beam duty (night, rain, snowfall) and
 * cites the offence that is actually live; omit it and the row falls back to
 * `s.headlightsRequired`, which is „isNight || rain" flattened to one bit and
 * therefore cannot see snow and cannot tell rain from night (header, DRIFT 1
 * and DRIFT 2).
 */
export function armedTelltaleWarnings(
  s: DashboardStatus,
  conditions?: TelltaleConditions,
): TelltaleWarning[] {
  const speed = Math.abs(s.speedKmh);
  const moving = speed >= MOVING_KMH;
  // "About to drive" counts too: the belt has to be on BEFORE moving off, and a
  // warning that only appears once you are rolling arrives one mistake late.
  const live = moving || s.engineOn;
  const out: TelltaleWarning[] = [];

  if (live && !s.seatbeltOn) {
    out.push({
      id: "belt",
      labelBg: "Коланът не е поставен",
      keyHint: "B",
      tone: "danger",
      side: "left",
      code: "SEATBELT_OFF_WHILE_MOVING",
    });
  }
  if (moving && s.parkingBrakeOn) {
    out.push({
      id: "handbrake",
      labelBg: "Ръчната спирачка е вдигната",
      keyHint: "Space",
      tone: "danger",
      side: "left",
      code: "HANDBRAKE_LEFT_ON",
    });
  }
  // THE LIGHTS ROW IS THE ONE THAT DRIFTED, TWICE (header). With `conditions`
  // the duty and its citation are one derivation off the flags `reduceTick`
  // reads; without them this is the legacy single-bit path, kept byte-for-byte
  // so the unwired callers behave exactly as they did — including wrongly.
  const dutyCode = conditions === undefined ? null : headlightDutyCode(conditions);
  const lightsRequired = conditions === undefined ? s.headlightsRequired : dutyCode !== null;
  if (live && lightsRequired && s.headlights === "off") {
    out.push({
      id: "lights",
      labelBg: "Светлините не са включени",
      keyHint: "L",
      tone: "danger",
      side: "right",
      // `?? "HEADLIGHTS_OFF_AT_NIGHT"` is unreachable when `conditions` is
      // supplied (lightsRequired is `dutyCode !== null` there); it is the
      // legacy path's code, and naming it here rather than branching keeps the
      // two paths' difference to the one line above.
      code: dutyCode ?? "HEADLIGHTS_OFF_AT_NIGHT",
    });
  }
  if (live && s.fogLightsRequired && !s.fogLightsOn) {
    out.push({
      id: "fog",
      labelBg: "Фаровете за мъгла не светят",
      keyHint: "V",
      tone: "warn",
      side: "right",
      code: "FOG_LIGHTS_OFF_IN_FOG",
    });
  }
  if (s.hazardsOn && speed >= HAZARDS_CRUISE_KMH) {
    out.push({
      id: "hazards",
      labelBg: "Аварийните светлини са включени",
      keyHint: "J",
      tone: "warn",
      side: "right",
      code: null,
    });
  }
  return out;
}

/** Cheap change detector for the low-Hz poll — the ids alone decide the render. */
export function telltaleWarningsKey(list: ReadonlyArray<TelltaleWarning>): string {
  return list.map((w) => w.id).join(",");
}
