// Device capability checks for the simulator. Feature detection only —
// never user-agent sniffing.

/**
 * True when the device has ONLY coarse (touch) pointers and no hover-capable
 * input anywhere — i.e. a phone/tablet without mouse or trackpad. Such
 * devices cannot drive a keyboard simulator, so the route shows a friendly
 * gate instead of a canvas.
 *
 * A laptop with a touchscreen reports `any-pointer: fine` → not gated.
 * Call client-side only (returns false during SSR by design).
 */
export function isTouchOnlyDevice(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  const coarseOnly = window.matchMedia("(pointer: coarse)").matches;
  const anyFine = window.matchMedia("(any-pointer: fine)").matches;
  const anyHover = window.matchMedia("(any-hover: hover)").matches;
  return coarseOnly && !anyFine && !anyHover;
}
