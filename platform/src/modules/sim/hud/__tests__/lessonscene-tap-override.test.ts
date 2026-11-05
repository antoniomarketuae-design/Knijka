import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createTapActivationState,
  createTapClickLedger,
  createTapHandlers,
  type TapActivationHandlers,
  type TapClickLedger,
} from "../tapActivation";

/**
 * =============================================================================
 * THE TWO LESSONSCENE BUTTONS OBEY THE PAGE'S TAP LEDGER — lane tapswallow,
 * verifier finding F4, built at integration (2026-11-05, integrator ruling F4).
 *
 * «Разбрах» on the touch hint and «Продължи» on the pause card spread their
 * `useTapActivation` handlers and then set their OWN `onClick`, which replaced
 * the hook's. On the click path both were onClick-only:
 *  · a touch's compatibility click re-targeted onto them acted, unguarded;
 *  · their own compatibility click never consumed the ledger entry their
 *    pointerup made, so it dangled for up to 700 ms and ate the next
 *    detail-1 click anywhere on the page.
 * The repair moves each action into the hook's activate callback and drops the
 * overriding `onClick`, the house idiom (DemoDeck's `tapToggle`).
 *
 * WHAT THIS FILE DRIVES. Each button's EFFECTIVE props are built the way JSX
 * builds them from LessonScene.tsx's own source: the hook's handlers, then —
 * only if the source still sets an `onClick` after the spread — that raw
 * activation in its place. The handlers are the real `createTapHandlers` on one
 * explicit ledger and fake clock. The browser's re-targeting is chosen by the
 * model, as in tap-page-ledger.test.ts; it stays PROBABLE until the device drive.
 * =============================================================================
 */

const SRC = path.resolve(__dirname, "../../../..");
const SCENE = readFileSync(path.join(SRC, "components/sim/LessonScene.tsx"), "utf8");

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const BUTTONS = [
  {
    name: "«Разбрах» (touch hint)",
    spread: "{...tapDismissTouchHint}",
    hook: "const tapDismissTouchHint = useTapActivation(dismissTouchHint);",
  },
  {
    name: "«Продължи» (pause card)",
    spread: "{...tapResume}",
    hook: "const tapResume = useTapActivation(() => setMenuPaused(false));",
  },
] as const;

/** The `<button …>…</button>` element that carries `spread`, comments removed. */
function buttonElement(spread: string): string {
  const at = SCENE.indexOf(spread);
  expect(at, `${spread} is not in LessonScene.tsx any more`).toBeGreaterThan(0);
  expect(SCENE.indexOf(spread, at + 1), `${spread} is spread on more than one element`).toBe(-1);
  const start = SCENE.lastIndexOf("<button", at);
  const end = SCENE.indexOf("</button>", at);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(at);
  return stripComments(SCENE.slice(start, end));
}

const RECT = { left: 660, top: 148, right: 704, bottom: 192 };
const POINT = { x: 682, y: 170 };
const target = { getBoundingClientRect: () => RECT };
const ev = (id: number, type: string) => ({
  pointerId: id,
  pointerType: type,
  clientX: POINT.x,
  clientY: POINT.y,
  currentTarget: target,
});

function page(spread: string) {
  const ledger: TapClickLedger = createTapClickLedger();
  let clock = 0;
  const acted: string[] = [];
  const hookOf = (name: string) =>
    createTapHandlers(createTapActivationState(ledger), () => acted.push(name), () => clock);
  // The button: the hook's handlers, then the source's own `onClick`, if any
  // attribute after the spread still sets one (JSX: the later prop wins).
  const handlers = hookOf("button");
  const el = buttonElement(spread);
  const afterSpread = el.slice(el.indexOf(spread) + spread.length);
  const overrides = /\bonClick\b/.test(afterSpread);
  const button: TapActivationHandlers = overrides
    ? { ...handlers, onClick: () => void acted.push("button") }
    : handlers;
  // Another control on the page (a play-menu row, the ✕ chip): it only counts.
  const other = hookOf("other");
  return {
    acted,
    button,
    other,
    at(ms: number) {
      clock = ms;
    },
  };
}

describe("F4 — LessonScene's «Разбрах» and «Продължи» act through the hook, never an overriding onClick", () => {
  for (const b of BUTTONS) {
    describe(b.name, () => {
      it("the action is the hook's activate callback, and no onClick follows the spread", () => {
        expect(SCENE).toContain(b.hook);
        const el = buttonElement(b.spread);
        expect(el, "an onClick on this button overrides the hook's and bypasses the page tap ledger").not.toMatch(
          /\bonClick\b/,
        );
      });

      it("its own compatibility click is consumed: one tap acts once, and the page owes nothing after it", () => {
        const p = page(b.spread);
        p.button.onPointerDown(ev(7, "touch"));
        p.button.onPointerUp(ev(7, "touch"));
        p.at(8);
        p.button.onClick({ detail: 1 }); // its own compatibility click
        expect(p.acted, `${b.name}: one tap acted ${p.acted.length} times`).toEqual(["button"]);
        // Nothing left owed: an assistive (detail-1, no pointer) click elsewhere acts.
        p.at(50);
        p.other.onClick({ detail: 1 });
        expect(p.acted, `${b.name}: its own click left an owed entry that ate the next click`).toEqual([
          "button",
          "other",
        ]);
      });

      it("a compatibility click re-targeted onto it is suppressed", () => {
        const p = page(b.spread);
        p.other.onPointerDown(ev(7, "touch"));
        p.other.onPointerUp(ev(7, "touch")); // acts on the other control; its click is owed
        p.at(8);
        p.button.onClick({ detail: 1 }); // …and the browser lands it on this button
        expect(p.acted, `${b.name}: a stray compatibility click acted on it`).toEqual(["other"]);
      });

      it("a mouse click and a keyboard (detail-0) click still act, once each", () => {
        const p = page(b.spread);
        p.button.onPointerDown(ev(1, "mouse"));
        p.button.onPointerUp(ev(1, "mouse"));
        p.button.onClick({ detail: 1 });
        p.at(100);
        p.button.onClick({ detail: 0 });
        expect(p.acted, `${b.name}: mouse + keyboard`).toEqual(["button", "button"]);
      });
    });
  }
});
