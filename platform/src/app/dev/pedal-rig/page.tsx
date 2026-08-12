import { notFound } from "next/navigation";
import { PedalRigClient } from "./pedal-rig-client";

/**
 * THE PEDAL RIG — DEV BUILDS ONLY. In production this route 404s.
 *
 * The real `TouchControls`, the real `TouchInputSource`, and one switch: the
 * `hidden` prop that every card in the product raises. Nothing else — no world,
 * no physics, no rapier wasm — because the defect it exists to reproduce
 * (doc 91 §C1, the drive pad that dies permanently after a popup) lives
 * entirely in that component's reaction to that prop, and a rig that takes
 * three minutes to compile is a rig nobody runs twice.
 *
 * WHAT IT IS NOT. It is not the seam. In the product `hidden` arrives via the
 * shell's `paused={ended || activeQuiz !== null || teachQueue.length > 0 ||
 * consequence !== null}` → `LessonScene`'s `physicsPaused = paused ||
 * menuPaused` → `TouchControls hidden`, and this rig fakes that one boolean.
 * The seam is covered twice over: asserted in source
 * (`touchPadRelease.test.tsx` §4) and driven for real on `/dev/drive-rig`,
 * which mounts the actual `LessonPlayShell` — pressing its ‖ station took the
 * overlay from `pads 2 · buttons 8 · pointer-events auto` to `pads 2 ·
 * buttons 0 · inert=on · aria-hidden=true · pointer-events none`, with
 * `pointer: coarse` verified true first.
 *
 *   /dev/pedal-rig                 the pad, plus a fake card on a button
 *   /dev/pedal-rig?card=1200       the card fires 1200 ms after the first
 *                                  throttle — the seatbelt teach moment's own
 *                                  measured timing, i.e. with a thumb down
 *
 * From a capture script (all of it on `window.__pedalRig`):
 *   axis()      → { throttle, brake, steer } as SimInput would merge them
 *   hidden()    → is the overlay inert right now
 *   card(true)  → raise / dismiss the card by hand
 *   padBox()    → the drive pad's client rect, for aiming a finger
 *   log()       → every hidden/axis transition, timestamped
 */
export default function PedalRigDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PedalRigClient />;
}
