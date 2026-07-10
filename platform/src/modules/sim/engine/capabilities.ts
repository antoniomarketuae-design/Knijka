// Device capability checks for the simulator. Feature detection only —
// never user-agent sniffing.

/**
 * True when the device has ONLY coarse (touch) pointers and no hover-capable
 * input anywhere — i.e. a phone/tablet without mouse or trackpad.
 *
 * P1: this NO LONGER gates the simulator (the old refusal screen violated
 * ADR-005 outright — audit E1). It now only informs presentation defaults:
 * the one-time touch orientation hint and collapsing the keyboard legend.
 *
 * A laptop with a touchscreen reports `any-pointer: fine` → not touch-only.
 * Call client-side only (returns false during SSR by design).
 */
export function isTouchOnlyDevice(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  const coarseOnly = window.matchMedia("(pointer: coarse)").matches;
  const anyFine = window.matchMedia("(any-pointer: fine)").matches;
  const anyHover = window.matchMedia("(any-hover: hover)").matches;
  return coarseOnly && !anyFine && !anyHover;
}

/**
 * True when the device can produce touch input at all (phones, tablets AND
 * touch laptops). Decides whether the TouchControls overlay mounts; the
 * overlay itself then auto-hides while the keyboard is in recent use, so
 * keyboard-first hybrids see no change until they actually touch the screen.
 * Call client-side only (returns false during SSR by design).
 */
export function hasTouchScreen(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0) return true;
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(any-pointer: coarse)").matches
  );
}
