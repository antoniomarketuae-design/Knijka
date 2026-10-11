/**
 * WHICH LENS OF A SIGNAL HEAD IS LIT, for every lamp state — the one table the
 * world's head and pedestrian-head passes paint from (`WorldProps.tsx`
 * `lampColorsFor` / `pedLampColors`).
 *
 * A `Record` over `SignalLampState`, not a chain of `===` tests, on purpose:
 * the chain answered «unlit» for any state it had never heard of, so a new
 * state was painted by accident rather than by decision — and the pedestrian
 * chain answered «walker red» for it. sc-sig-controller-postures:784b2ca7 added
 * "darkControlled" (the officer's junction whose lesson says the lamp is OUT);
 * with a `Record`, `tsc` refuses a state nobody has decided the lenses of.
 *
 * Pure data, no three.js: `controller-dark-lamp-head-and-voice.test.ts` reads
 * it to prove the head the lesson calls ЗАГАСНАЛ is painted with nothing lit.
 */
import type { SignalLampState } from "../../contracts";

/** [red, amber, green] lit, per state. */
export const VEHICLE_LENSES_LIT: Readonly<Record<SignalLampState, readonly [boolean, boolean, boolean]>> = {
  red: [true, false, false],
  redYellow: [true, true, false],
  yellow: [false, true, false],
  green: [false, false, true],
  dark: [false, false, false],
  // The officer's junction with the lamps out: dead like "dark" — the officer,
  // not a lens, is the signal (instruction 3 «Няма лампа за четене — четеш човека»).
  darkControlled: [false, false, false],
  amberFlashOn: [false, true, false],
  amberFlashOff: [false, false, false],
};

/**
 * [red, green] lit on a pedestrian head (red over green, no amber lens).
 * Vehicles stopped ⇒ the walker has his green; every other lit vehicle state
 * — and both halves of the amber blink — leaves the walker red, the honest read
 * of a crossing that is closing. A dead head is dead for the walker too.
 */
export const PED_LENSES_LIT: Readonly<Record<SignalLampState, readonly [boolean, boolean]>> = {
  red: [false, true],
  redYellow: [true, false],
  yellow: [true, false],
  green: [true, false],
  dark: [false, false],
  darkControlled: [false, false],
  amberFlashOn: [true, false],
  amberFlashOff: [true, false],
};
