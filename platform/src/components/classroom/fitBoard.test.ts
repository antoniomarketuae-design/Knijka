import { describe, expect, it } from "vitest";
import {
  BOARD_CHROME_DENSE_PX,
  BOARD_CHROME_PX,
  MIN_BOARD_SCALE,
  PANE_GAP_PX,
  PANE_MIN_W,
  REPLAY_MIN_H,
  fitBoard,
} from "./boardFit";

/**
 * The board's whole layout risk is one number: `MistakeReplay` sizes its canvas
 * from its own width and then stacks ~86 px of controls and annotation under
 * it. These are the boxes the room actually hands it.
 */
describe("fitBoard", () => {
  it("shows ONE pane on a phone held upright", () => {
    // 390×844 portrait: the board gets roughly 248 × 350 beside the teacher.
    const fit = fitBoard(248, 350);
    expect(fit.wide).toBe(false);
    expect(fit.paneMaxWidthPx).toBeLessThanOrEqual(248);
    // Slight scaling is fine and preferred: a wider pane draws a bigger map,
    // and 0.94 of a 178 px canvas beats an unscaled 157 px one.
    expect(fit.scale).toBeGreaterThan(0.9);
  });

  it("keeps the whole pane — canvas AND caption — inside the height it was given", () => {
    const h = 350;
    const fit = fitBoard(248, h);
    const canvasH = Math.min(Math.max(fit.paneMaxWidthPx * 0.72, REPLAY_MIN_H), 240);
    expect((BOARD_CHROME_PX + canvasH) * fit.scale).toBeLessThanOrEqual(h + 0.5);
  });

  it("shows BOTH panes side by side once two readable ones fit the width", () => {
    const fit = fitBoard(520, 420);
    expect(fit.wide).toBe(true);
    expect(fit.paneMaxWidthPx * 2 + PANE_GAP_PX).toBeLessThanOrEqual(520);
    expect(fit.paneMaxWidthPx).toBeGreaterThanOrEqual(PANE_MIN_W);
  });

  it("gives each pane half the width — not all of it — in the two-pane layout", () => {
    const fit = fitBoard(560, 700);
    expect(fit.wide).toBe(true);
    expect(fit.paneMaxWidthPx).toBe(Math.floor((560 - PANE_GAP_PX) / 2));
  });

  it("never widens a pane past the point where the canvas stops growing", () => {
    // `MistakeReplay` clamps its canvas at 240 px, so beyond 240/0.72 ≈ 333 px
    // of width every extra pixel buys a wider letterbox and no more diagram.
    const roomy = fitBoard(1000, 900);
    expect(roomy.paneMaxWidthPx).toBe(Math.floor(240 / 0.72));
    expect(roomy.scale).toBe(1);
  });

  it("scales the board down rather than cropping its bottom sentence away", () => {
    // A phone held sideways: ~218 px for a board whose minimum is ~226.
    const fit = fitBoard(396, 218, BOARD_CHROME_DENSE_PX);
    expect(fit.scale).toBeLessThan(1);
    expect(fit.scale).toBeGreaterThanOrEqual(MIN_BOARD_SCALE);
    expect((BOARD_CHROME_DENSE_PX + REPLAY_MIN_H) * fit.scale).toBeLessThanOrEqual(218 + 0.5);
  });

  it("never scales below the legibility floor, however short the window", () => {
    expect(fitBoard(396, 60, BOARD_CHROME_DENSE_PX).scale).toBe(MIN_BOARD_SCALE);
  });

  it("never shrinks a pane into a thumbnail, even in an absurd box", () => {
    const fit = fitBoard(240, 40);
    expect(fit.paneMaxWidthPx).toBeGreaterThanOrEqual(PANE_MIN_W);
    expect(fit.wide).toBe(false);
  });

  it("refuses the two-pane layout when two panes would each be a thumbnail", () => {
    expect(fitBoard(390, 800).wide).toBe(false);
    expect(fitBoard(2 * PANE_MIN_W + PANE_GAP_PX - 1, 800).wide).toBe(false);
    expect(fitBoard(2 * PANE_MIN_W + PANE_GAP_PX, 800).wide).toBe(true);
  });

  it("budgets less chrome for the dense board, since its caption moved out", () => {
    expect(BOARD_CHROME_DENSE_PX).toBeLessThan(BOARD_CHROME_PX);
    expect(fitBoard(300, 300, BOARD_CHROME_DENSE_PX).paneMaxWidthPx).toBeGreaterThanOrEqual(
      fitBoard(300, 300, BOARD_CHROME_PX).paneMaxWidthPx,
    );
  });
});
