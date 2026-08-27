/**
 * THE CABIN TELLTALE RAIL, MEASURED OFF THE BUILT MESH.
 *
 * WHY THIS FILE READS THE BUFFER RATHER THAN THE TABLE. clusterOcclusion.test.ts
 * already asks „does clusterLayout's placement table clear the wheel?" and
 * answers no. That is a claim about numbers. This one asks „does the geometry
 * the student is actually shipped clear the wheel?" — it builds the real face
 * mesh, applies the real relocation, and reads the four vertices of each lamp
 * quad back out of `positions`. A placement table that agrees with itself
 * proves nothing; the thing that reaches the GPU is the buffer.
 *
 * THE ARBITER IS clusterLayout's OWN SILHOUETTE. `faceVisibleFraction` /
 * `faceWorstFloorY` were shipped by the lane that measured the defect and were
 * written, in as many words, as „the acceptance test the relocation needs".
 * They are imported straight from the module rather than through the cockpit
 * barrel on purpose: the barrel is another lane's file this wave, and the
 * precedent for saying so out loud is LessonScene.tsx's CameraAidHint import.
 *
 * AND THE SILHOUETTE ITSELF WAS RE-MEASURED, per column instead of at five
 * samples, before any of this was written — see cabinTelltaleRail.ts's header
 * for the table and the two frames the grid was drawn back onto.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildClusterFaceMesh, LAMP_KEYS } from "@/modules/sim/cockpit";
import {
  BEZEL_W,
  DIAL_CX,
  DIAL_CY,
  DIGIT_COUNT,
  DIGIT_GAP,
  DIGIT_H,
  DIGIT_W,
  DIGITS_CX,
  DIGITS_CY,
  DIVIDER_X,
  DIVIDER_Y0,
  DIVIDER_Y1,
  FACE_H,
  FACE_W,
  GEAR_CX,
  GEAR_CY,
  GEAR_H,
  GEAR_W,
  LAMP_CELL,
  LAMP_CY,
  LAMP_HALO,
  TICK_R_MAJOR,
  UNIT_CX,
  UNIT_CY,
  UNIT_H,
  UNIT_W,
  faceInkRect,
  faceVisibleFraction,
  faceWorstFloorY,
  lampSlotX,
} from "@/modules/sim/cockpit/clusterLayout";
import {
  applyCabinTelltaleRail,
  CABIN_RAIL_COL_X,
  CABIN_RAIL_PRIORITY,
  CABIN_RAIL_ROW_Y,
  CABIN_RAIL_SCALE,
  cabinRailSlot,
  quadRect,
  type CabinRailOptions,
  type RailRect,
} from "./cabinTelltaleRail";

/**
 * How far below the wheel's measured silhouette a lamp must sit before it
 * counts as readable, in design units.
 *
 * NOT A ROUNDING TOLERANCE — a margin against the instrument, and it is needed
 * in one direction only. FACE_WHEEL_SILHOUETTE is five samples joined by
 * straight lines, and across the rail's own span (x 116…234) those lines run
 * OPTIMISTIC against the per-column re-measurement — they claim clear plate a
 * few units lower than the photograph shows. At the tightest cell (x 116…144)
 * the table says −53 and the frame says −50, so 8 units against the table is
 * ≥5 against the picture.
 *
 * It is a REGRESSION GUARD, not a proof: what actually establishes the grid is
 * the per-column measurement and the two frames it was drawn back onto (see
 * cabinTelltaleRail.ts). What this number does is make the next edit that
 * nudges a constant go red instead of quietly re-hiding a lamp.
 */
const CLEARANCE_UNITS = 8;

/** Inside the bezel — the only part of the plate that is face rather than rim. */
const INNER_HALF_W = FACE_W / 2 - BEZEL_W;
const INNER_HALF_H = FACE_H / 2 - BEZEL_W;

function railRects(options?: CabinRailOptions): { glyph: RailRect[]; halo: RailRect[] } {
  const face = buildClusterFaceMesh({ dialNumerals: false });
  applyCabinTelltaleRail(face, options ?? {});
  return {
    glyph: LAMP_KEYS.map((k) => quadRect(face.positions, face.lampGlyphQuad[k])),
    halo: LAMP_KEYS.map((k) => quadRect(face.positions, face.lampHaloQuad[k])),
  };
}

/** Clearance of a rect's bottom edge above the worst column it spans. */
function clearance(r: RailRect): number {
  return r.cy - r.h / 2 - faceWorstFloorY(r);
}

function overlaps(a: RailRect, b: RailRect): boolean {
  return (
    Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2
  );
}

/** The three speed cells, as the builder authors them. */
function digitCells(): RailRect[] {
  const span = DIGIT_COUNT * DIGIT_W + (DIGIT_COUNT - 1) * DIGIT_GAP;
  return Array.from({ length: DIGIT_COUNT }, (_, i) => ({
    cx: DIGITS_CX - span / 2 + DIGIT_W / 2 + i * (DIGIT_W + DIGIT_GAP),
    cy: DIGITS_CY,
    w: DIGIT_W,
    h: DIGIT_H,
  }));
}

/** Everything on this face that carries a VALUE the driver reads. */
function readableElements(): { name: string; rect: RailRect }[] {
  return [
    ...digitCells().map((cell, i) => ({ name: `speed digit ${i}`, rect: faceInkRect(cell) })),
    {
      name: "gear letter",
      rect: faceInkRect({ cx: GEAR_CX, cy: GEAR_CY, w: GEAR_W, h: GEAR_H }),
    },
    { name: "км/ч caption", rect: { cx: UNIT_CX, cy: UNIT_CY, w: UNIT_W, h: UNIT_H } },
    {
      name: "selector divider",
      rect: {
        cx: DIVIDER_X,
        cy: (DIVIDER_Y0 + DIVIDER_Y1) / 2,
        w: 2,
        h: DIVIDER_Y1 - DIVIDER_Y0,
      },
    },
  ];
}

describe("the authored rail is behind the wheel — the defect, read off the MESH", () => {
  it("puts all eight lamps at LAMP_CY, and not one of them is visible there", () => {
    const face = buildClusterFaceMesh({ dialNumerals: false });
    LAMP_KEYS.forEach((key, i) => {
      const r = quadRect(face.positions, face.lampGlyphQuad[key]);
      // The builder really does place them where the table says — the half
      // clusterOcclusion.test.ts cannot see, because it never builds a mesh.
      expect(r.cx).toBeCloseTo(lampSlotX(i), 3);
      expect(r.cy).toBeCloseTo(LAMP_CY, 3);
      expect(r.w).toBeCloseTo(LAMP_CELL, 3);
      expect(faceVisibleFraction(r)).toBeLessThan(1);
    });
  });
});

describe("relocated, every lamp is somewhere the driver can see it", () => {
  it("clears the wheel whole, with margin, at all eight slots", () => {
    const { glyph } = railRects();
    glyph.forEach((r, i) => {
      expect({ lamp: LAMP_KEYS[i], visible: faceVisibleFraction(r) }).toEqual({
        lamp: LAMP_KEYS[i],
        visible: 1,
      });
      expect(clearance(r)).toBeGreaterThanOrEqual(CLEARANCE_UNITS);
    });
  });

  it("keeps every halo whole too, so a lit lamp still throws its glow", () => {
    // The halo is what turns a lamp into a warning at any scale; half a halo
    // reads as a smudge on the rim rather than as light.
    for (const r of railRects().halo) expect(faceVisibleFraction(r)).toBe(1);
  });

  it("stays inside the face, off the bezel, at every corner", () => {
    const { glyph, halo } = railRects();
    for (const r of [...glyph, ...halo]) {
      expect(Math.abs(r.cx) + r.w / 2).toBeLessThanOrEqual(INNER_HALF_W);
      expect(Math.abs(r.cy) + r.h / 2).toBeLessThanOrEqual(INNER_HALF_H);
    }
  });
});

describe("and it takes nothing away", () => {
  it("moves all eight lamps, each to its own slot — none dropped, none stacked", () => {
    const { glyph } = railRects();
    expect(glyph).toHaveLength(LAMP_KEYS.length);
    const seen = new Set(glyph.map((r) => `${r.cx},${r.cy}`));
    expect(seen.size).toBe(LAMP_KEYS.length);
    // Slots are filled in CABIN_RAIL_PRIORITY order, not LAMP_KEYS order — see
    // that constant for the frame that moved `temp` out of the clipped row.
    CABIN_RAIL_PRIORITY.forEach((key, i) => {
      const r = glyph[LAMP_KEYS.indexOf(key)]!;
      const slot = cabinRailSlot(i);
      expect({ key, cx: r.cx, cy: r.cy }).toEqual({ key, cx: slot.cx, cy: slot.cy });
    });
  });

  it("keeps the halo concentric with its glyph and the authored halo:cell ratio", () => {
    const { glyph, halo } = railRects();
    glyph.forEach((g, i) => {
      const h = halo[i]!;
      expect(h.cx).toBeCloseTo(g.cx, 3);
      expect(h.cy).toBeCloseTo(g.cy, 3);
      expect(h.w / g.w).toBeCloseTo(LAMP_HALO / LAMP_CELL, 3);
      expect(g.w).toBeCloseTo(LAMP_CELL * CABIN_RAIL_SCALE, 3);
    });
  });

  it("leaves z alone, so the halo still submits behind its glyph", () => {
    // Quad order is load-bearing in the overlay mount (clusterGeometry's
    // header). A relocation that flattened z would put a halo over its lamp.
    const before = buildClusterFaceMesh({ dialNumerals: false });
    const after = buildClusterFaceMesh({ dialNumerals: false });
    applyCabinTelltaleRail(after);
    for (const key of LAMP_KEYS) {
      for (const q of [after.lampGlyphQuad[key], after.lampHaloQuad[key]]) {
        for (let k = 0; k < 4; k++) {
          expect(after.positions[q * 12 + k * 3 + 2]).toBe(before.positions[q * 12 + k * 3 + 2]);
        }
      }
    }
    expect(after.positions).toHaveLength(before.positions.length);
  });

  it("covers nothing the driver reads — digits, gear, км/ч, divider, dial", () => {
    const { glyph, halo } = railRects();
    for (const r of [...glyph, ...halo]) {
      for (const el of readableElements()) {
        expect({ el: el.name, hit: overlaps(r, el.rect) }).toEqual({ el: el.name, hit: false });
      }
      // The dial is a disc, so an AABB test would clear a corner that is
      // actually inside the tick band. Nearest-point distance instead.
      const dx = Math.max(0, Math.abs(r.cx - DIAL_CX) - r.w / 2);
      const dy = Math.max(0, Math.abs(r.cy - DIAL_CY) - r.h / 2);
      expect(Math.hypot(dx, dy)).toBeGreaterThan(TICK_R_MAJOR);
    }
  });

  it("has exactly one slot per lamp — the seam a ninth telltale has to reopen", () => {
    // TWO OPEN ROWS ON clusterLayout.ts WANT A NINTH LAMP: sc-park-gap-long
    // („no indicator telltale, no lights telltale") and sc-pk-stop-vs-park.
    // The wedge the wheel leaves holds eight cells of 28 units and no more, so
    // adding one is a re-solve, not an append. This equality is where that lane
    // finds out, in a gate, instead of on a frame six weeks later.
    expect(CABIN_RAIL_COL_X.length * CABIN_RAIL_ROW_Y.length).toBe(LAMP_KEYS.length);
  });

  it("never stacks two lamps in a slot — the overflow stays authored instead", () => {
    const face = buildClusterFaceMesh({ dialNumerals: false });
    applyCabinTelltaleRail(face, { cols: [130, 160], rows: [1] });
    const moved = CABIN_RAIL_PRIORITY.slice(0, 2).map((k) =>
      quadRect(face.positions, face.lampGlyphQuad[k]),
    );
    expect(moved.map((r) => r.cx)).toEqual([130, 160]);
    // …and every lamp past the last slot is still exactly where it was built,
    // which is the OLD defect for that lamp and a regression for no other.
    for (const k of CABIN_RAIL_PRIORITY.slice(2)) {
      const r = quadRect(face.positions, face.lampGlyphQuad[k]);
      expect({ k, cx: r.cx, cy: r.cy }).toEqual({
        k,
        cx: lampSlotX(LAMP_KEYS.indexOf(k)),
        cy: LAMP_CY,
      });
    }
  });
});

/**
 * THE ORDER IS THE FIX — sc-hz-breakdown-pulloff:d1e95ccc (critical) and the
 * two sc-vp-telltale rows behind it.
 *
 * The grid did not move on 2026-08-27; WHICH LAMP SITS WHERE IN IT did. This
 * file's subject file measured, on three PC frames, that the lower row does not
 * clear the rim there — and reading-order-by-LAMP_KEYS put `temp` in it. `temp`
 * is the only lamp the director can light, the only stimulus three lessons
 * have, and the only telltale with no twin anywhere else on the glass.
 */
describe("the priority list — which four lamps get the row that clears both cameras", () => {
  it("is a permutation of LAMP_KEYS, so no lamp is dropped and none is doubled", () => {
    expect([...CABIN_RAIL_PRIORITY].sort()).toEqual([...LAMP_KEYS].sort());
  });

  it("puts `temp` in the upper row — the one the PC camera does not clip", () => {
    const slot = cabinRailSlot(CABIN_RAIL_PRIORITY.indexOf("temp"));
    expect(slot.cy).toBe(CABIN_RAIL_ROW_Y[0]);
    // …and in the roomiest COLUMN of it: the wheel silhouette gets worse to the
    // left on both cameras, so the lamp a lesson is built on takes the last cell.
    expect(slot.cx).toBe(CABIN_RAIL_COL_X[CABIN_RAIL_COL_X.length - 1]);
  });

  it("gives the upper row to the four lamps that warn while the car is moving", () => {
    const upper = CABIN_RAIL_PRIORITY.filter(
      (_, i) => cabinRailSlot(i).cy === CABIN_RAIL_ROW_Y[0],
    );
    expect([...upper].sort()).toEqual(["belt", "brake", "engine", "temp"]);
  });

  it("demotes only lamps that are green, or that light before the drive starts", () => {
    // `oil` and `battery` are red ONLY while the engine is not running
    // (clusterReadout's lamp law), and the two arrows are `go`-green with a
    // full-size «МИГАЧ» twin on the HUD rail. Nothing here is a moving warning.
    const lower = CABIN_RAIL_PRIORITY.filter(
      (_, i) => cabinRailSlot(i).cy === CABIN_RAIL_ROW_Y[1],
    );
    expect([...lower].sort()).toEqual(["arrowLeft", "arrowRight", "battery", "oil"]);
  });
});

describe("the reel mount is untouched — the layout the founder signed off", () => {
  it("leaves the authored rail exactly where clusterLayout puts it", () => {
    // InstrumentCluster only relocates when `wheelInFront`, which defaults off
    // `overlay`; the camera-pinned reel cluster has nothing in front of it.
    const face = buildClusterFaceMesh({ dialNumerals: true });
    LAMP_KEYS.forEach((key, i) => {
      const g = quadRect(face.positions, face.lampGlyphQuad[key]);
      const h = quadRect(face.positions, face.lampHaloQuad[key]);
      expect(g).toEqual({ cx: lampSlotX(i), cy: LAMP_CY, w: LAMP_CELL, h: LAMP_CELL });
      expect(h).toEqual({ cx: lampSlotX(i), cy: LAMP_CY, w: LAMP_HALO, h: LAMP_HALO });
    });
  });
});

describe("the constants are load-bearing — every one of them fails when moved", () => {
  /** Does this grid put every lamp wholly on visible plate, with margin? */
  function allLampsReadable(options: CabinRailOptions): boolean {
    const { glyph } = railRects(options);
    return glyph.every((r) => faceVisibleFraction(r) === 1 && clearance(r) >= CLEARANCE_UNITS);
  }

  it("the shipped grid passes — the control for the four mutations below", () => {
    expect(allLampsReadable({})).toBe(true);
  });

  it("one row lower and the bottom row is back behind the wheel", () => {
    expect(allLampsReadable({ rows: CABIN_RAIL_ROW_Y.map((y) => y - 12) })).toBe(false);
  });

  it("one column left and the boss's shoulder eats the leftmost pair", () => {
    expect(allLampsReadable({ cols: CABIN_RAIL_COL_X.map((x) => x - 32) })).toBe(false);
  });

  it("at the authored cell size the block no longer fits the wedge", () => {
    // The reason the cabin rail is 0.7 and not 1: at full size the lower row's
    // leftmost cell bottoms out at −49 where the silhouette is −49.7 — inside
    // the measurement's own error — and the upper row's halo washes over the
    // selector divider.
    expect(allLampsReadable({ scale: 1 })).toBe(false);
    const full = railRects({ scale: 1 });
    const divider = readableElements().find((e) => e.name === "selector divider")!.rect;
    expect(full.halo.some((r) => overlaps(r, divider))).toBe(true);
  });

  it("and CLEARANCE_UNITS itself bites — a grid that is VISIBLE but thin is refused", () => {
    // Without this case the margin clause could be deleted or set to zero and
    // every test above would stay green on `faceVisibleFraction === 1` alone.
    // Eight units lower, the silhouette still says every lamp is wholly clear —
    // by 2 units, which is inside the instrument's own error.
    const thin = { rows: CABIN_RAIL_ROW_Y.map((y) => y - 8) };
    expect(railRects(thin).glyph.every((r) => faceVisibleFraction(r) === 1)).toBe(true);
    expect(allLampsReadable(thin)).toBe(false);
  });

  it("shifting the block right runs it off the face into the bezel", () => {
    const { halo } = railRects({ cols: CABIN_RAIL_COL_X.map((x) => x + 24) });
    expect(halo.some((r) => Math.abs(r.cx) + r.w / 2 > INNER_HALF_W)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE WIRING — added by the adversarial pass, 2026-08-23
// ---------------------------------------------------------------------------
//
// Everything above measures the pure relocation. NOTHING above notices whether
// the product calls it. Verified by mutation on the shipped tree: delete
// `if (wheelInFront) applyCabinTelltaleRail(face)` from InstrumentCluster and
// all 114 cockpit tests stay green; invert the default to `wheelInFront =
// overlay` and all 114 stay green — while the cabin loses the fix AND the reel
// mount the founder signed off has its rail moved. Typecheck passes in both.
//
// That is the exact failure clusterScope.test.ts was written against ("a
// refactor that rebuilds the shell and forgets it does not break a single
// test"), and it is answered the same way: read the source that ships. Only
// the two lines that decide WHICH MOUNT gets the relocation are pinned here —
// the behaviour itself is measured off the mesh above.
// ---------------------------------------------------------------------------

describe("the wiring — the relocation is actually reached from the cabin", () => {
  const CLUSTER_TSX = readFileSync(
    resolve(__dirname, "InstrumentCluster.tsx"),
    "utf8",
  );

  it("InstrumentCluster applies the relocation before the buffer is built", () => {
    expect(CLUSTER_TSX).toContain('from "./cabinTelltaleRail"');
    expect(CLUSTER_TSX).toContain("if (wheelInFront) applyCabinTelltaleRail(face);");
    // …and BEFORE the position attribute is handed to three, or the mutation
    // would be writing into an array the GPU has already been given.
    expect(CLUSTER_TSX.indexOf("applyCabinTelltaleRail(face)")).toBeLessThan(
      CLUSTER_TSX.indexOf('faceGeometry.setAttribute("position"'),
    );
  });

  it("the default is off `overlay`, and the rebuild follows it", () => {
    // An overlay cluster is camera-pinned chrome with nothing in front of it;
    // a non-overlay one is mounted in the cabin, behind the wheel. Inverting
    // this one `!` silently un-fixes the cabin and moves the reel's rail.
    expect(CLUSTER_TSX).toContain("wheelInFront = !overlay,");
    expect(CLUSTER_TSX).toContain("[dialNumerals, wheelInFront]);");
  });

  it("the cabin mount takes the default and the reel mount opts out", () => {
    const mount = (file: string) => {
      const src = readFileSync(file, "utf8");
      const at = src.indexOf("<InstrumentCluster");
      expect(at).toBeGreaterThan(-1);
      return src.slice(at, src.indexOf("/>", at));
    };
    const root = resolve(__dirname, "../../..");
    // VitokCockpit portals the cluster onto the interior GLB — there IS a
    // steering wheel in front of it, so it must NOT declare itself an overlay.
    expect(mount(resolve(root, "components/sim/vitok/VitokCockpit.tsx"))).not.toContain(
      "overlay",
    );
    // CaptureScene pins it to the capture camera. Nothing in front of it.
    expect(mount(resolve(root, "app/dev/clip-capture/CaptureScene.tsx"))).toContain(
      "overlay",
    );
  });
});
