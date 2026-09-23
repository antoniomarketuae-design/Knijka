/**
 * THE OPEN SHEET SHOWS EVERY STEP ON THE AUDITED PHONES AT L4/L5
 * — sc-ed-d2-priority-run:8a7372dd, sc-merge-accel-lane:2091c183.
 *
 * The complication `compile.ts` prepends at L4/L5 pushed whole instructions
 * behind «↓ още N реда — покажи» (w59 `verify-L4.txt` / `verify-L5.txt`): the
 * hard-shoulder step of merge-accel and the equal-priority step of
 * d2-priority-run on an iPhone 16 held sideways, 26–43 % of the body on the
 * 780×360 Android. A scroll cue is a mitigation (w42–w46 ruling); this file
 * holds the REPAIR — the landscape rail in `SimOverlay` — against the REAL
 * compiled briefings on every audited viewport, through `hud/sheetLayout.ts`.
 *
 * THREE LAYERS, because each one alone can lie:
 *   1. CALIBRATION — the text model against what the glass painted. If the
 *      model is optimistic it could certify a fit that is not there, so it is
 *      held to never predict fewer lines than w59 measured, and the stacked
 *      geometry to the measured scroller heights.
 *   2. THE DEFECT, REPRODUCED — the stacked layout must NOT fit these texts on
 *      the landscape phones. A model that fits everything proves nothing.
 *   3. THE REPAIR — the geometry the component now uses fits all of them, and
 *      the component is read for the classes that make that geometry real.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compileScenario, scenarioById } from "@/modules/sim/lessons";
import { briefingBodyBg, briefingLineBg, briefingLineOrdinal } from "../overlayQueue";
import { N38_CLASS_LABEL_BG } from "../../rules";
import {
  railChipFits,
  railChipText,
  SHEET_CHIP_ADVANCE_PX,
  SHEET_GLYPH_ADVANCE_PX,
  SHEET_LINE_PX,
  SHEET_RAIL_PX,
  SHEET_TEXT_PX,
  sheetFitsWhole,
  sheetGeometry,
  sheetStackedGeometry,
  sheetTextHeightPx,
  sheetUsesRail,
  type SheetViewport,
} from "../sheetLayout";

/**
 * The audited phones — `tools/mobile/lib/devices.mjs` `DEFAULT_DEVICE_IDS`,
 * copied because `tools/` is not in this package's tree. Same ids, same
 * viewports, same safe-area profile data.
 */
const AUDITED: Record<string, SheetViewport> = {
  "iphone16-portrait": { width: 393, height: 852, safeArea: { top: 59, right: 0, bottom: 34, left: 0 } },
  "iphone16-landscape": { width: 852, height: 393, safeArea: { top: 0, right: 59, bottom: 21, left: 59 } },
  "small-portrait": { width: 360, height: 780, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
  "small-landscape": { width: 780, height: 360, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
  "galaxy-gesturebar-portrait": { width: 360, height: 780, safeArea: { top: 0, right: 0, bottom: 24, left: 0 } },
  "galaxy-gesturebar-landscape": { width: 780, height: 360, safeArea: { top: 0, right: 0, bottom: 24, left: 0 } },
};

const LESSONS = ["sc-ed-d2-priority-run", "sc-merge-accel-lane"] as const;
const LEVELS = [4, 5] as const;

/** The sheet's paragraphs exactly as `SimOverlay` paints them for a briefing. */
function sheetParagraphs(id: string, level: 4 | 5): string[] {
  const steps = compileScenario(scenarioById(id)!, level).briefingBg ?? [];
  const ordinal = briefingLineOrdinal(steps);
  const lead = `${ordinal !== null ? `${ordinal}. ` : ""}${briefingLineBg(steps)}`;
  const body = briefingBodyBg(steps);
  return [lead, ...(body === null ? [] : body.split("\n"))];
}

describe("1 · calibration: the model is never optimistic against the glass (w59)", () => {
  // Painted text height = scrollH − the 10 px fade padding, 646 px measure.
  const MEASURED: Array<[string, 4 | 5, number]> = [
    ["sc-ed-d2-priority-run", 5, 264],
    ["sc-merge-accel-lane", 5, 231],
    ["sc-ed-d2-priority-run", 4, 248],
    ["sc-merge-accel-lane", 4, 248],
  ];

  it.each(MEASURED)("%s@L%i: model ≥ the %ipx the glass painted", (id, level, painted) => {
    expect(sheetTextHeightPx(sheetParagraphs(id, level), 646)).toBeGreaterThanOrEqual(painted);
  });

  it("the advance has margin over the smallest never-optimistic value (6.1 px)", () => {
    expect(SHEET_GLYPH_ADVANCE_PX).toBeGreaterThan(6.1);
  });

  it("the stacked model reproduces the measured scroller (219 / 186 px) within a pixel", () => {
    const cases: Array<[SheetViewport, number]> = [
      [AUDITED["iphone16-landscape"]!, 219],
      [AUDITED["small-landscape"]!, 186],
    ];
    for (const [vp, clientH] of cases) {
      const g = sheetStackedGeometry(vp, true);
      expect(g.textWidthPx).toBe(646);
      expect(Math.abs(g.textWindowPx - clientH)).toBeLessThanOrEqual(1.5);
    }
  });
});

describe("2 · the defect, reproduced: the STACKED sheet cannot hold these on a phone held sideways", () => {
  for (const id of LESSONS) {
    for (const level of LEVELS) {
      it(`${id}@L${level} overflows the stacked sheet on every landscape phone`, () => {
        for (const [device, vp] of Object.entries(AUDITED)) {
          if (!device.endsWith("landscape")) continue;
          const g = sheetStackedGeometry(vp, true);
          expect(sheetTextHeightPx(sheetParagraphs(id, level), g.textWidthPx), device).toBeGreaterThan(
            g.textWindowPx,
          );
        }
      });
    }
  }
});

describe("3 · the repair: every step fits, whole, on every audited phone", () => {
  for (const [device, vp] of Object.entries(AUDITED)) {
    for (const id of LESSONS) {
      for (const level of LEVELS) {
        it(`${device} · ${id}@L${level}`, () => {
          const fit = sheetFitsWhole(vp, sheetParagraphs(id, level), true);
          expect(
            fit.fits,
            `${fit.textPx} px of text in a ${fit.windowPx} px window at ${fit.geometry.textWidthPx} px wide`,
          ).toBe(true);
        });
      }
    }
  }

  it("landscape phones take the rail, portrait phones keep the stacked sheet", () => {
    for (const [device, vp] of Object.entries(AUDITED)) {
      expect(sheetUsesRail(vp), device).toBe(device.endsWith("landscape"));
    }
  });

  it("every phone keeps a readable measure (≥ 40 characters a line)", () => {
    for (const vp of Object.values(AUDITED)) {
      expect(sheetGeometry(vp).textWidthPx / SHEET_GLYPH_ADVANCE_PX).toBeGreaterThanOrEqual(40);
    }
  });

  it("the face is the floor, untouched: 12 px text on a 16.5 px line", () => {
    expect(SHEET_TEXT_PX).toBe(12);
    expect(SHEET_LINE_PX).toBe(16.5);
  });
});

/**
 * THE COMPONENT, READ FOR THE GEOMETRY THE MODEL ASSUMES. jsdom has no layout
 * engine, so this is this component's ratified technique (see
 * `sim-overlay-ack-fold-cue.test.ts`): source pins with comments stripped, each
 * one failing with the reason when it cannot find its anchor.
 */
describe("the open sheet renders the geometry the model certifies", () => {
  const SOURCE = readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8");
  const CODE = SOURCE.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const openAt = CODE.indexOf('data-sim-overlay-state="open"');
  const OPEN = CODE.slice(openAt);

  it("the open sheet is found", () => {
    expect(openAt, "unresolved: the open sheet's anchor is gone").toBeGreaterThan(-1);
  });

  it("the section: stacked box as modelled, and a full-width row in landscape", () => {
    const cls = /<section\s+className="([^"]+)"/.exec(OPEN)?.[1];
    expect(cls, "unresolved: the open sheet's <section> className").toBeDefined();
    for (const t of ["flex-col", "gap-2", "px-3", "pt-2", "pb-2", "border-x", "border-t", "max-w-2xl"]) {
      expect(cls!.split(/\s+/), t).toContain(t);
    }
    expect(cls).toContain("landscape:flex-row");
    expect(cls).toContain("landscape:max-w-[var(--sim-sheet-max-w)]");
    expect(OPEN).toContain(
      '"calc(100vw - 2 * max(env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px)))"',
    );
    expect(OPEN).toMatch(/\["--sim-sheet-rail" as string\]: `\$\{SHEET_RAIL_PX\}px`/);
    expect(SHEET_RAIL_PX).toBeLessThanOrEqual(88);
  });

  it("the rail holds BOTH the header (✕) and «Разбрах», and follows the text", () => {
    const textAt = OPEN.indexOf("data-sim-overlay-sheet-text");
    const railAt = OPEN.indexOf("data-sim-overlay-sheet-rail");
    const closeAt = OPEN.indexOf('aria-label="Затвори"');
    const ackAt = OPEN.indexOf("{...tapSheetAck}");
    const endAt = OPEN.indexOf("</section>");
    expect(Math.min(textAt, railAt, closeAt, ackAt, endAt), "unresolved: a sheet anchor").toBeGreaterThan(-1);
    expect(textAt).toBeLessThan(railAt);
    expect(railAt).toBeLessThan(closeAt);
    expect(closeAt).toBeLessThan(ackAt);
    expect(ackAt).toBeLessThan(endAt);
    const railCls = /data-sim-overlay-sheet-rail=""\s+className="([^"]+)"/.exec(OPEN)?.[1] ?? "";
    for (const t of ["contents", "landscape:flex", "landscape:w-[var(--sim-sheet-rail)]", "landscape:flex-col"]) {
      expect(railCls.split(/\s+/), t).toContain(t);
    }
  });

  it("portrait order is unchanged: the header is lifted above the text", () => {
    const header = /<div className="([^"]*)">\s*<span style=\{\{ color \}\}>\s*<ToneGlyph/.exec(
      OPEN.slice(OPEN.indexOf("data-sim-overlay-sheet-rail")),
    );
    expect(header, "unresolved: the sheet header row").not.toBeNull();
    expect(header![1].split(/\s+/)).toContain("order-first");
  });

  it("the text window takes the row's free width in landscape and keeps its face", () => {
    expect(OPEN).toMatch(/data-sim-overlay-sheet-text=""\s+className="[^"]*landscape:flex-1/);
    expect(OPEN).toContain("whitespace-pre-line break-words text-xs leading-snug text-foreground");
  });
});

/**
 * THE RAIL'S CHIP BREAKS AT A SEAM, NEVER MID-WORD — lane E round 2 (round-1
 * low finding: «ВТОРОСТЕПЕН / НА» in the 88 px landscape rail).
 */
describe("the rail chip: every class and chip word fits, or breaks at its seam", () => {
  const SHY = String.fromCharCode(0xad);
  // Every chip the sheet can print: the three exam classes (from the rules
  // module's own table, so a new class cannot escape) and the fixed chipBg
  // strings the shell hands the overlay queue.
  const CHIPS = [
    ...Object.values(N38_CLASS_LABEL_BG),
    "Инструкции",
    "Подготовка",
    "Преживей грешката",
    "Грешката на урока",
    "Учебен момент",
    "Браво",
  ];

  it("the problem is real: «второстепенна» does not fit the rail unbroken", () => {
    expect(13 * SHEET_CHIP_ADVANCE_PX).toBeGreaterThan(SHEET_RAIL_PX);
    expect(railChipFits("второстепенна")).toBe(false);
  });

  it("railChipText gives it a soft hyphen at the compound seam «второ|степенна»", () => {
    expect(railChipText("второстепенна")).toBe(`второ${SHY}степенна`);
    expect(railChipText(`второстепенна · Учебен момент`)).toBe(`второ${SHY}степенна · Учебен момент`);
    // Matched case-insensitively, and the word keeps the case it arrived in.
    expect(railChipText("Второстепенна")).toBe(`Второ${SHY}степенна`);
    // Nothing else is touched.
    expect(railChipText("основна · Инструкции")).toBe("основна · Инструкции");
  });

  for (const chip of CHIPS) {
    it(`«${chip}» fits the ${SHEET_RAIL_PX} px rail after railChipText`, () => {
      expect(railChipFits(railChipText(chip)), railChipText(chip)).toBe(true);
    });
  }

  it("the sheet renders the chip through railChipText", () => {
    const SOURCE = readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8");
    const CODE = SOURCE.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const at = CODE.indexOf('data-sim-overlay-sheet-chip=""');
    expect(at, "unresolved: the sheet chip's handle is gone").toBeGreaterThan(-1);
    const chip = CODE.slice(at, CODE.indexOf("</span>", at));
    expect(chip).toMatch(/\{railChipText\(\s*shown\.markClassBg/);
  });
});
