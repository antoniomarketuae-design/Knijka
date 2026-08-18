/**
 * =============================================================================
 * THE COLUMN STOOD ON THE INTERIOR MIRROR — the inline half of the swap
 * `notifyColumn.ts` published and could not make itself. 2026-08-17.
 * =============================================================================
 *
 * `notify-column-mirror.test.ts` derives WHERE the mirror is (from the cockpit
 * projection, not from a screenshot) and asserts that
 * `NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN` clears it. It then states, in prose,
 * that the constant is „published rather than applied", because the compact
 * column's `top` is an INLINE STYLE in this component and a module may not
 * reach into it.
 *
 * THIS FILE IS THAT APPLICATION, HELD. Two things, and they are one change:
 *
 *   1. the column's `top` reads the COLUMN constant and not the phone layout's
 *      corner DATUM (which must not move — `TouchControls.TOP_RAIL_TOP_CSS` is
 *      that datum, and the sideways demonstration deck hangs off it too);
 *   2. its `max-height` is recomputed FROM THE NEW TOP, because a `max-height`
 *      is measured from the box's own top edge.
 *
 * (2) IS THE ONE NOBODY WOULD HAVE MISSED TWICE, so it is the one with the
 * loudest test. `PlayAreaStyles` writes this column's `max-height` from the
 * datum; a swap that moved only the top would push the card's floor from 0.43
 * of the stage to 0.596 — through the hazard band the 2026-08-16 ceiling exists
 * to hold — and would have been reported as „the mirror is fixed".
 *
 * THE MIRROR ITSELF IS INSIDE THE WebGL CANVAS, so no DOM probe in this project
 * can see it and no assertion here pretends to. What is asserted is that the
 * lengths this component actually writes resolve to boxes the module's own
 * predicates accept — and that the pre-fix lengths, and the half-landed pair,
 * are rejected by the same predicates.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  notifyColumnMaxHeightPx,
  notifyColumnTopPx,
  rectClearsMirrorBand,
  HAZARD_BAND_TOP_FRACTION,
  NOTIFY_COLUMN_MAX_STAGE_FRACTION,
  NOTIFY_COLUMN_TOP_CSS_COMPACT,
  NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,
} from "../notifyColumn";
import { OVERLAY_PEEK_HEIGHT_PX } from "../overlayQueue";
import { SIM_OVERLAY_COLUMN_FLOOR_CSS } from "../SimOverlay";
import {
  notifyColumnFloorCss,
  notifyColumnFloorPx,
} from "../../../../components/sim/TouchControls";

const SRC = readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8");
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CODE = stripComments(SRC);

/** The three sideways phones the catalogue was photographed on. */
const PHONES = [
  { id: "iphone16 852×393", width: 852, height: 393, insetBottom: 21 },
  { id: "android 780×360", width: 780, height: 360, insetBottom: 0 },
  { id: "samsung gesture 780×340", width: 780, height: 340, insetBottom: 0 },
];

/** Where the column's left edge lands: right gutter + notch + flank lane. */
const columnX = (stage: { width: number }): number => stage.width - 131 - 180;

describe("the inline declaration is the one the module published for it", () => {
  it("writes the COLUMN's top, never the corner datum", () => {
    expect(CODE).toContain("top: NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,");
    // The datum is a DIFFERENT constant with two other tenants, and the sibling
    // test asserts it has not moved. This one asserts this file stopped reading
    // it — the substring check is on code, so the paragraph above the
    // declaration explaining the swap does not satisfy it.
    expect(CODE).not.toContain("top: NOTIFY_COLUMN_TOP_CSS_COMPACT,");
    expect(NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN).not.toBe(NOTIFY_COLUMN_TOP_CSS_COMPACT);
  });

  it("recomputes the ceiling from that same top, through the module's generator", () => {
    expect(CODE).toContain("maxHeight: notifyColumnMaxHeightCss(");
    expect(CODE).toContain("SIM_OVERLAY_COLUMN_FLOOR_CSS,");
    expect(CODE).toContain("NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,");
  });

  it("the floor it spells is EXACTLY the band's own, so the copy cannot drift", () => {
    // The copy exists because `components/sim` consumes `modules/sim` and not
    // the reverse (docs/architecture/05). This is the pin that keeps it a copy
    // rather than a fork: if TouchControls re-derives its floor, this fails here
    // instead of a phone reporting it three waves later.
    expect(SIM_OVERLAY_COLUMN_FLOOR_CSS).toBe(notifyColumnFloorCss());
    // …and every term of it is a published NAME, not a resolved number — the
    // `FLANK_LANE_VAR` arrangement, and the only form that survives an inline
    // style's cascade position.
    expect(SIM_OVERLAY_COLUMN_FLOOR_CSS).toContain("var(--sim-column-floor");
    expect(SIM_OVERLAY_COLUMN_FLOOR_CSS).toContain("var(--sim-svh");
    expect(SIM_OVERLAY_COLUMN_FLOOR_CSS).toContain("env(safe-area-inset-bottom");
  });
});

describe("what the pair resolves to, and what each half alone would do", () => {
  it("REJECTS the geometry that shipped this morning on all three phones", () => {
    // 8 px from the top of the stage, in the corner the mirror is projected
    // into. Measured: [data-hud="notify-column"] [541, 8, 180 × 161] against a
    // mirror painted [524, 0 → 707, 70].
    for (const p of PHONES) {
      expect(
        rectClearsMirrorBand({ x: columnX(p), y: 8, width: 180 }, p, true),
        `${p.id}: the pre-fix top is not on the mirror?`,
      ).toBe(false);
    }
  });

  it("…and ACCEPTS what this component now writes", () => {
    for (const p of PHONES) {
      expect(
        rectClearsMirrorBand({ x: columnX(p), y: notifyColumnTopPx(p, true), width: 180 }, p, true),
        `${p.id}`,
      ).toBe(true);
    }
  });

  it("REJECTS the half-landed swap — top moved, ceiling left behind", () => {
    // This is the regression the second declaration exists to prevent, and the
    // reason it could not be left to another file to land later. `PlayAreaStyles`
    // computes the compact `max-height` from the DATUM; with the top at the
    // mirror lane and that ceiling unchanged the card's floor lands at
    //   73.23 + 161 = 234.2 px of a 393 px stage = 0.596
    // against a hazard band that starts at 0.53 — a sign at 30 m and a
    // pedestrian at 15 m both project into it (notifyColumn.ts).
    for (const p of PHONES) {
      const top = notifyColumnTopPx(p, true);
      const staleCeiling = notifyColumnMaxHeightPx(p.height, notifyColumnFloorPx(p), 8);
      expect(
        (top + staleCeiling) / p.height,
        `${p.id}: the half-landed pair is somehow safe?`,
      ).toBeGreaterThan(HAZARD_BAND_TOP_FRACTION);
    }
    expect((notifyColumnTopPx(PHONES[0], true) + 161) / 393).toBeCloseTo(0.596, 3);
  });

  it("…and ACCEPTS the pair, which stops exactly on the hazard band's ceiling", () => {
    for (const p of PHONES) {
      const top = notifyColumnTopPx(p, true);
      const ceiling = notifyColumnMaxHeightPx(p.height, notifyColumnFloorPx(p), top);
      expect((top + ceiling) / p.height, `${p.id}`).toBeLessThanOrEqual(
        NOTIFY_COLUMN_MAX_STAGE_FRACTION + 1e-9,
      );
    }
    // The cost, stated in the numbers the sibling test predicted before the
    // swap was made: the peek loses about five of its eleven visible lines, and
    // they are not deleted — «↓ още N реда» beside «ПРОЧЕТИ» is what they join.
    expect(
      notifyColumnMaxHeightPx(393, notifyColumnFloorPx(PHONES[0]), notifyColumnTopPx(PHONES[0], true)),
    ).toBeCloseTo(95.76, 1);
    expect(
      notifyColumnMaxHeightPx(360, notifyColumnFloorPx(PHONES[1]), notifyColumnTopPx(PHONES[1], true)),
    ).toBeCloseTo(87.04, 1);
  });

  it("leaves a card that is still a card, and never clips its own controls", () => {
    // The peek's chrome — chip, fold row, the 44 px «ПРОЧЕТИ» row — is a set of
    // `shrink-0` siblings of a `min-h-0` scroller, and the column sets no
    // `overflow`, so a card that needs more than the ceiling PAINTS PAST IT
    // rather than losing the one control that opens the full text. That is the
    // module's own stated behaviour and it is not hypothetical: on the 780 × 340
    // Samsung gesture-bar profile the ceiling resolves to 81.76 px against
    // 86 px of chrome, so the chrome wins there and the card's real floor is
    // 64.44 + 86 = 150.4 px = 0.443 of the stage. The invariant is therefore
    // about the FLOOR, not about the ceiling, and the hazard band is what it
    // has to clear.
    const CHROME_PX = 14 + 12 + 44 + 16;
    for (const p of PHONES) {
      const top = notifyColumnTopPx(p, true);
      const ceiling = notifyColumnMaxHeightPx(p.height, notifyColumnFloorPx(p), top);
      // A peek is still a peek: 44 px is the pill's own minimum
      // (`OVERLAY_PEEK_HEIGHT_PX`), and below that this stops being a card at
      // all — which would be the „fixed it by deleting it" answer.
      expect(ceiling, `${p.id}: nothing left to be a card`).toBeGreaterThan(
        OVERLAY_PEEK_HEIGHT_PX,
      );
      expect(
        (top + Math.max(ceiling, CHROME_PX)) / p.height,
        `${p.id}: the worst-case card reaches the hazard band`,
      ).toBeLessThan(HAZARD_BAND_TOP_FRACTION);
    }
    expect(
      notifyColumnMaxHeightPx(340, notifyColumnFloorPx(PHONES[2]), notifyColumnTopPx(PHONES[2], true)),
    ).toBeCloseTo(81.76, 1);
  });
});
