/**
 * DISABLED_FEATURES — the kill switch.
 *
 * WHY IT EXISTS. On launch day the only way to turn the simulator off if it
 * melts phones is: edit code, push, wait for the CI gate, wait up to five
 * minutes for the deploy tick (tools/deploy/knijka.cron), and hope the build
 * is green — all while students are hitting the feature. That is ten to
 * twenty minutes of a bad experience for a decision the founder already made
 * in the first ten seconds. This turns it into `pm2 restart --update-env`.
 *
 * WHY IT IS NOT A DATABASE FLAG. The failure this exists for includes "the
 * database is the thing that is on fire". An environment variable read from
 * the process is the only switch that still works when everything downstream
 * of it does not.
 *
 * WHERE IT IS CHECKED. Both the page guard AND the server action, for every
 * feature listed here — a page guard alone stops a student SEEING the feature
 * while leaving the POST endpoints wide open, and the endpoints are where the
 * expensive work happens (model tokens, physics sessions, writes). In practice
 * that is enforced by putting the check inside the ONE access function each
 * feature already routes every call site through:
 *
 *   simulator  src/app/(dashboard)/simulator/access.ts  canDriveSimulator
 *   hazard     src/app/(dashboard)/hazard/access.ts     canOpenHazardDoor
 *   tutor      src/app/(dashboard)/tutor/trial.ts       getTutorAccess
 *
 * so a new call site inherits the switch instead of having to remember it. The
 * pages ALSO check directly, because "temporarily off" and "you have not paid"
 * are different sentences and a student must never be shown the paywall for
 * something we switched off ourselves.
 *
 * READ AT CALL TIME, never cached in a module constant: a value frozen at
 * import time would need a full process restart to change even where the
 * runtime already re-reads its environment, and a kill switch whose semantics
 * depend on module evaluation order is not a kill switch.
 */

/**
 * Features that can be switched off. Deliberately a closed list rather than
 * "any string": an operator typing `DISABLED_FEATURES=simulater` at 3am must
 * find out immediately, not from the students who keep driving.
 */
export const KILLABLE_FEATURES = ["simulator", "hazard", "tutor"] as const;

export type KillableFeature = (typeof KILLABLE_FEATURES)[number];

export function isKillableFeature(value: string): value is KillableFeature {
  return (KILLABLE_FEATURES as readonly string[]).includes(value);
}

export interface DisabledFeaturesParse {
  /** Recognised feature names that are switched off. */
  disabled: KillableFeature[];
  /** Tokens that match no feature — an operator typo, surfaced not swallowed. */
  unknown: string[];
}

/**
 * Parse a DISABLED_FEATURES value. Separators are commas and/or whitespace,
 * matching to both shapes people actually type; matching is case-insensitive
 * and trims, because `DISABLED_FEATURES="Simulator, tutor"` is what a tired
 * human writes and refusing it helps nobody.
 */
export function parseDisabledFeatures(raw: string | undefined | null): DisabledFeaturesParse {
  const disabled: KillableFeature[] = [];
  const unknown: string[] = [];
  for (const token of (raw ?? "").split(/[\s,]+/)) {
    const name = token.trim().toLowerCase();
    if (name === "") continue;
    if (isKillableFeature(name)) {
      if (!disabled.includes(name)) disabled.push(name);
    } else if (!unknown.includes(name)) {
      unknown.push(name);
    }
  }
  return { disabled, unknown };
}

/** The parse of the CURRENT environment. Cheap: a split of a short string. */
export function disabledFeatures(
  env: Record<string, string | undefined> = process.env,
): DisabledFeaturesParse {
  return parseDisabledFeatures(env.DISABLED_FEATURES);
}

/**
 * Is this feature switched off right now?
 *
 * The single question every guard asks. Fails CLOSED in the sense that
 * matters: an unreadable or empty variable leaves everything ON (the normal
 * state), while any recognised name in it takes the feature away immediately.
 */
export function isFeatureDisabled(
  feature: KillableFeature,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return disabledFeatures(env).disabled.includes(feature);
}

/**
 * Bulgarian copy for the screen a student sees when a feature is off.
 *
 * It says WHAT happened, that it is us and not them, and that nothing they
 * paid for is lost. It deliberately does NOT say "buy a pack" — that is the
 * paywall's sentence and using it here would be a lie that costs a refund.
 */
export const FEATURE_OFFLINE_COPY_BG: Record<
  KillableFeature,
  { title: string; body: string }
> = {
  simulator: {
    title: "Симулаторът е временно изключен",
    body: "Изключихме го за кратко, докато оправим нещо по него. Достъпът ти остава — нищо не е загубено и не е нужно да правиш нищо. Върни се след малко.",
  },
  hazard: {
    title: "„Опасности“ е временно изключено",
    body: "Изключихме секцията за кратко, докато оправим нещо по нея. Достъпът ти остава — нищо не е загубено. Върни се след малко.",
  },
  tutor: {
    title: "AI Учителят е временно изключен",
    body: "Изключихме го за кратко, докато оправим нещо по него. Въпросите ти остават запазени, а упражненията продължават да ти обясняват всяка грешка със закона.",
  },
};
