"use client";

/**
 * Which way the driver's head is turned inside the cabin — a module-level
 * store, the same shape as `engine/reverseViewStore.ts` (the exemplar): one
 * value, a listener set, a per-frame plain read with no hook and no allocation.
 *
 * WHY A STORE AND NOT A PROP. The writer is a DOM panel (PreDriveChecklist,
 * mounted by LessonPlayShell) and the reader is inside the R3F tree
 * (CameraRig, mounted by LessonScene). Threading a ref between them would put
 * a cabin-camera concern into four components' prop lists — including two that
 * belong to other lanes — to carry one number that changes when a student
 * clicks a button. The reverse-view setting solved the identical shape this
 * way and CameraRig already reads it per frame.
 *
 * NOT persisted, deliberately: a head turn is a momentary act, not a setting.
 * Every lesson starts looking forward, and `resetCabinLook()` is called when a
 * scene mounts and when the pre-drive ends, so a pose can never outlive the
 * step that asked for it.
 */

import { useSyncExternalStore } from "react";
import type { CabinLookPoseId } from "./cabinLook";

const DEFAULT_POSE: CabinLookPoseId = "forward";

let pose: CabinLookPoseId = DEFAULT_POSE;

const listeners = new Set<() => void>();

/** Read by CameraRig every frame — a plain module read. */
export function getCabinLook(): CabinLookPoseId {
  return pose;
}

export function setCabinLook(next: CabinLookPoseId): void {
  if (next === pose) return;
  pose = next;
  for (const fn of listeners) fn();
}

/** Back to the driving pose (scene mount, pre-drive end, camera change). */
export function resetCabinLook(): void {
  setCabinLook(DEFAULT_POSE);
}

export function subscribeCabinLook(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The live pose for the HUD (button states, „върни погледа напред"). */
export function useCabinLook(): CabinLookPoseId {
  return useSyncExternalStore(subscribeCabinLook, getCabinLook, () => DEFAULT_POSE);
}
