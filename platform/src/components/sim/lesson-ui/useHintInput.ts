"use client";

/**
 * WHICH CONTROLS THIS SESSION'S HINTS MAY NAME — hydration-safe.
 *
 * THE DEFECT THIS REPLACES (lane D, 2026-09-22). The shell used to read
 *
 *   const [hintInput] = useState<HintInput>(() => hintInputFor(hasTouchScreen()));
 *
 * on the belief that „this shell is client-only (the whole play route is), so
 * there is no SSR pass to mismatch". That belief is false for every deep link
 * (`/simulator?scenario=…&level=…`): `SimulatorClient` renders
 * `LessonPlayShell` straight into the server HTML, and only the 3D scene
 * behind `SceneSlot` is `ssr:false`. On the server `hasTouchScreen()` is
 * `false` by design, so the server wrote the KEYBOARD copy; the phone's
 * hydration render then read `true` and produced the TOUCH copy. Captured on
 * the live dev server (HEAD 2c6d3cb, iphone16-portrait, WebKit and Chromium
 * alike), `StatusDashboard`'s engine cell:
 *
 *   + Изкл.       (client — touch: the key cap is dropped)
 *   - Изкл. I     (server — keyboard: the key cap rides along)
 *
 * which React 19 reports as „Hydration failed because the server rendered text
 * didn't match the client" and answers by THROWING AWAY the whole subtree and
 * regenerating it on the phone — on every mobile lesson arrival since at least
 * sweep w47. The same probe with touch emulation off shows no overlay at all,
 * so this was the one mismatch on that path.
 *
 * THE FIX IS THE STANDARD ONE (`lib/hooks/clientEnv.ts` explains why this repo
 * uses `useSyncExternalStore` and not a mount effect): the server snapshot is
 * the vocabulary the server can know — "keyboard" — and React hydrates with it,
 * then re-renders once with the client snapshot. A mount that is NOT hydrating
 * (the student picked the lesson from the catalogue) reads the client value on
 * its very first render, so there is no keyboard-copy flash there.
 *
 * READ ONCE, still. The old comment's other point stands: a card whose wording
 * changed mid-lesson because a matchMedia flipped would be a worse defect than
 * the one being fixed. So the client value is sampled on first read and cached
 * for the page's lifetime — touch capability is a property of the device in the
 * student's hands, not of the moment — and there is nothing to subscribe to.
 */

import { useSyncExternalStore } from "react";
import { hasTouchScreen } from "@/modules/sim/engine";
import { hintInputFor, type HintInput } from "@/modules/sim/hud";

/** What the server (and therefore the hydration render) always says. */
export const SERVER_HINT_INPUT: HintInput = "keyboard";

let clientHintInput: HintInput | null = null;

/** The device's vocabulary, sampled once per page. Client-side only. */
export function readClientHintInput(): HintInput {
  if (clientHintInput === null) clientHintInput = hintInputFor(hasTouchScreen());
  return clientHintInput;
}

/** Tests only: forget the cached sample so a new stub environment is read. */
export function resetClientHintInputForTests(): void {
  clientHintInput = null;
}

function subscribeNever(): () => void {
  return () => {};
}

function serverHintInput(): HintInput {
  return SERVER_HINT_INPUT;
}

/**
 * "keyboard" during SSR and the hydration render, the device's real
 * vocabulary afterwards (and on the first render of a non-hydrating mount).
 */
export function useHintInput(): HintInput {
  return useSyncExternalStore(subscribeNever, readClientHintInput, serverHintInput);
}
