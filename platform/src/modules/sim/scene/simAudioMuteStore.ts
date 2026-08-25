"use client";

/**
 * WHETHER THE LESSON HAS SOUND — one bit, one owner.
 *
 * ── WHY THIS FILE EXISTS: NINE ROWS, ONE SENTENCE ───────────────────────────
 *
 * Sweep w10 filed nine rows across seven lessons saying the same thing — „no
 * evidence of audio anywhere, and no way to control it". Six of them photograph
 * the SAME surface, the in-lesson ⚙ sheet, and its complete contents are:
 *
 *   Съветник вкл. · Въпроси Понякога · Задача 2/2 · Карта изкл. ·
 *   Качество Авто · Ниско · Прекрати урока · ← Всички уроци
 *
 * (`sc-vu-emergency/mobile-right/07b-menu.png`, and the same list on
 * sc-vu-emergency-junction, sc-vu-pass-clearance, sc-mw-discipline and
 * sc-sp-limit-end; the pc leg's toolbar on `sc-sp-eco-coast/pc-right/
 * 01-arrival.png` is the same story with seven controls and no audio among
 * them.) No volume, no mute, no sound row, no speaker glyph, on either
 * platform, at any beat.
 *
 * THE ROWS DIAGNOSE IT AS „there is no audio in the product", AND THAT HALF IS
 * WRONG — which is why the repair is this small. `scene/simAudio.ts` is a
 * complete procedural mix (engine, tyre, wind, brake hiss, indicator relay,
 * rain and wipers) and it is LIVE on /simulator: `LessonScene.tsx:1589` builds
 * one every lesson, `VehicleRig.tsx:620` feeds it per frame.
 *
 * ⚠ ONE CLAUSE OF THAT REBUTTAL WAS OVERTURNED BY THE VERIFIER, AND IT IS
 * WRITTEN DOWN HERE SO THE NEXT READER DOES NOT REUSE IT. The first draft of
 * this header said the чл. 91 two-tone siren „exists", against the two
 * sc-vu-emergency rows. The OSCILLATORS exist (`SIREN_HEAR_M` / `SIREN_LO_HZ` /
 * `SIREN_HI_HZ`, gain by distance) — the CUE does not fire. `sirenLevel()`
 * returns 0 unless `sirenM < 160`, and `sirenM` is computed at
 * `LessonScene.tsx:3608-3615` by scanning the published traffic for an actor
 * with `profile === "emergency"`. On the judged frames there is no such actor
 * on the road at all — `05-stopped.png` is an empty four-lane boulevard and an
 * empty mirror, which is the still-open CRITICAL `sc-vu-emergency:180ed5bc` in
 * its own words. `sirenM` stays `Infinity` end to end and the lesson is silent.
 * Code existing is not a cue being delivered, so THIS FILE CLOSES NEITHER OF
 * THOSE ROWS; it closes the control clause of them and nothing else.
 *
 * WHAT IS ACTUALLY MISSING IS THE CONTROL, and it was missing in the strongest
 * possible sense. Mute had exactly one route to it:
 *
 *   CABIN_KEYS.muteAudio → cabin.ts:589 → SimAudio.toggleMute()
 *
 * — a KEYBOARD KEY. On a phone there is no keyboard, so on all six of those
 * mobile frames the sound was not merely uncontrolled, it was uncontrollABLE.
 * The one surface that ever mentions sound, `AudioLessonPrompt`, is a one-shot
 * line that persists its own dismissal and then never returns, which is why the
 * frames show nothing even on a session that had been told about it.
 *
 * ── WHY A STORE, AND WHY IT OWNS THE BIT RATHER THAN MIRRORING IT ───────────
 *
 * The writer is a DOM row in the ⚙ sheet (`LessonPlayShell`'s PlayMenu); the
 * reader is a `SimAudio` instance constructed inside `LessonScene`'s mount
 * effect. That is precisely the shape `vitok/cabinLookStore.ts` was written
 * for, and it states the reason: threading a ref between them would put an
 * audio concern into four components' prop lists — two of them other lanes' —
 * to carry one boolean. `engine/reverseViewStore.ts` is the exemplar both
 * follow, down to the key-toggle-plus-hook pair, and this file keeps its shape.
 *
 * IT OWNS THE BIT. `SimAudio` used to hold `mutedValue` as a private field; a
 * store that merely mirrored it would be two places that must agree with
 * nothing making them agree — the drift this codebase has paid for three times
 * over (the `overlayQueue.ts` census, the `dashboardStatus.ts` weather
 * vocabulary, and `GovernorCapMark`'s hand-kept copy of `modeAboveLaw`), each
 * of which ended by giving the fact one owner. So `SimAudio.muted` now READS
 * this and `SimAudio.toggleMute()` WRITES it: the M key and the menu row go
 * through the same door, and there is no second field left to drift.
 *
 * THE STORAGE KEY AND ITS ENCODING ARE `SimAudio`'S OWN, UNCHANGED —
 * `knijka.sim.muted`, "1"/"0", the same string `SimAudio.persist()` has always
 * written. The bit moved between modules; it did not move between sessions, so
 * a student who muted the sim yesterday opens today's lesson still muted.
 *
 * DEFAULT: NOT MUTED. Doc 82 §4.4 is the reason and it is pedagogy, not taste —
 * a muted session teaches a systematically FASTER car than the student will
 * really drive (~3.2 km/h of over-production; ~10 % in visual-only sims). The
 * student may choose silence, but never by default and never without being told
 * what it costs (see `soundChoice.ts` for the words).
 */

import { useSyncExternalStore } from "react";

/**
 * `SimAudio`'s own key, deliberately. See the header — this is a change of
 * owner, not a change of setting, and a new key would silently un-mute every
 * student who had already chosen silence.
 */
const STORAGE_KEY = "knijka.sim.muted";

const DEFAULT_MUTED = false;

/** `SimAudio.persist()`'s encoding: "1" is muted, anything else is not. */
function loadStored(): boolean {
  if (typeof window === "undefined") return DEFAULT_MUTED;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return DEFAULT_MUTED;
  }
}

/**
 * SEEDED ONCE, AT MODULE IMPORT — and that is a deliberate narrowing of what
 * `SimAudio` did, which re-read `localStorage` in every constructor. Identical
 * in one tab, because the store is the only writer and it writes through. It
 * differs in exactly one flow: a SECOND tab that mutes is no longer picked up
 * by a later `new SimAudio()` in the first. Two simultaneous simulator tabs is
 * not a flow this product has (one lesson, one canvas, one WebGL context), and
 * the alternative — a `storage` listener — would let a second tab silence a
 * drive already in progress. Named rather than fixed.
 */
let muted: boolean = loadStored();

const listeners = new Set<() => void>();

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // Storage may be unavailable (private mode, quota) — the setting still
    // works for the session, it just will not be remembered.
  }
}

/**
 * Current setting. Read by `SimAudio.effectiveVolume()` on every gain
 * recalculation — a plain module read, no hook, no subscription, no allocation.
 */
export function getSimAudioMuted(): boolean {
  return muted;
}

export function setSimAudioMuted(next: boolean): void {
  if (next === muted) return;
  muted = next;
  persist();
  for (const fn of listeners) fn();
}

/** The ⚙ sheet's «Звук» row and the M key both land here. */
export function toggleSimAudioMuted(): void {
  setSimAudioMuted(!muted);
}

export function subscribeSimAudioMuted(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * The live setting for the HUD — the ⚙ row's «вкл.»/«изкл.» word.
 *
 * The server snapshot is the DEFAULT rather than `getSimAudioMuted()`: the
 * module value is seeded from `localStorage` at import time, which the server
 * cannot see, and returning it there would hydrate a row whose word disagrees
 * with the markup React just sent.
 */
export function useSimAudioMuted(): boolean {
  return useSyncExternalStore(subscribeSimAudioMuted, getSimAudioMuted, () => DEFAULT_MUTED);
}

/**
 * Reset hook for tests ONLY — the module value outlives a single `it()`, and a
 * store seeded from a previous case's `localStorage` write is the classic way a
 * suite passes in one order and fails in another.
 *
 * IT RESETS THE VALUE AND NOT THE SUBSCRIBER SET. The first draft called
 * `listeners.clear()`, which is a trap with a long fuse: the subscribers here
 * are a live `SimAudio` (constructor) and every mounted `useSimAudioMuted()`,
 * so a suite that renders the shell and THEN resets would watch the row stop
 * updating and read it as a wiring bug in code that is correct. Subscribers own
 * their own unsubscribe (`subscribeSimAudioMuted` returns it, `SimAudio` calls
 * it in `dispose()`); a reset is a change of value, so it notifies like one.
 */
export function __resetSimAudioMutedForTests(next: boolean = DEFAULT_MUTED): void {
  muted = next;
  for (const fn of listeners) fn();
}
