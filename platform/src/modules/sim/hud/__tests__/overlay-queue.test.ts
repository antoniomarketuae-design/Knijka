import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hasWhy,
  isAmbientOverlay,
  overlayCentreBand,
  overlayHoldsDrive,
  overlayPriority,
  overlayQueueMaySpeak,
  overlaySilencesQueue,
  rectViewportFraction,
  requiresWhy,
  selectOverlay,
  OVERLAY_CENTRE_BAND,
  OVERLAY_PEEK_HEIGHT_PX,
  OVERLAY_PEEK_MAX_FRACTION,
  OVERLAY_SCREEN_OWNERS,
  type OverlayScreenOwner,
  type OverlaySelection,
  type SimOverlayItem,
  type SimOverlayKind,
} from "../overlayQueue";

/**
 * The founder's iPhone 16, 2026-07-29: a „ЗАДАЧА" card, a teach card and a red
 * belt warning stacked down the screen before the road got a pixel. „not
 * acceptable it is not playable at all."
 *
 * These are the rules that make that state unrepresentable, asserted against
 * his actual device geometry — 393×852 portrait and 852×393 landscape.
 */

const IPHONE16_PORTRAIT = { w: 393, h: 852 };

/**
 * THE TWO BUDGET PREDICATES NOW LIVE HERE — dead-predicate census, 2026-08-26.
 *
 * `rectClearsCentreBand` and `peekWithinBudget` used to be exported from
 * `overlayQueue.ts`, and NOTHING on the /simulator path ever called them: the
 * declarations, two barrel lines and this file were the whole census, and the
 * WebKit probe the module's header says imports them does not. They were
 * therefore predicates that shipped in the bundle so that this file could ask
 * them questions — a closed loop.
 *
 * The MEASUREMENTS below are not a closed loop and are kept verbatim: they are
 * the founder's own device geometry, and they are what decided that the peek
 * shares the top rail instead of taking a second row. They are re-expressed
 * against the two things the module still publishes — `overlayCentreBand` and
 * `rectViewportFraction` — so every number and every verdict is unchanged and
 * the shipped bundle is two functions lighter.
 *
 * WHAT THIS FILE THEREFORE DOES NOT CLAIM: that any painted rect on the real
 * page obeys them. Nothing measures that yet. See the block at the deletion.
 */
function rectClearsCentreBand(
  rect: { x: number; y: number; width: number; height: number },
  w: number,
  h: number,
): boolean {
  const band = overlayCentreBand(w, h);
  const overlapX = Math.min(rect.x + rect.width, band.right) - Math.max(rect.x, band.left);
  const overlapY = Math.min(rect.y + rect.height, band.bottom) - Math.max(rect.y, band.top);
  return overlapX <= 0 || overlapY <= 0;
}

function peekWithinBudget(
  rect: { x: number; y: number; width: number; height: number },
  w: number,
  h: number,
): boolean {
  return rectViewportFraction(rect, w, h) <= OVERLAY_PEEK_MAX_FRACTION;
}

const IPHONE16_LANDSCAPE = { w: 852, h: 393 };

function item(kind: SimOverlayKind, over: Partial<SimOverlayItem> = {}): SimOverlayItem {
  return {
    id: `${kind}-1`,
    kind,
    tone: "neutral",
    lineBg: `линия за ${kind}`,
    ...over,
  };
}

describe("selectOverlay — one overlay, never three", () => {
  it("shows nothing when nothing is speaking", () => {
    expect(selectOverlay([]).active).toBeNull();
    expect(selectOverlay([null, undefined]).active).toBeNull();
  });

  it("returns exactly ONE active item no matter how many arrive", () => {
    // The founder's screenshot, as data.
    const selection = selectOverlay([
      item("task"),
      item("teach"),
      item("warning"),
    ]);
    expect(selection.active).not.toBeNull();
    expect(selection.waiting).toHaveLength(2);
    // …and the one that speaks is the one that froze the car.
    expect(selection.active?.kind).toBe("teach");
  });

  /**
   * …AND THE RANKING TEST BELOW IS ABOUT THE CODE THE SHELL RUNS.
   *
   * Until 2026-08-26 it was not. `selectOverlay` sorted on the private
   * `PRIORITY` table and counted on the private `AMBIENT` set, while
   * `overlayPriority` / `isAmbientOverlay` — the two functions this file
   * asserts about and the two the barrel exports — were called by nothing but
   * this file. The next test could have stayed green through any change to the
   * sort, because it was never reading the sort.
   *
   * `selectOverlay` now calls both. This is the guard that it keeps doing so:
   * a source scan, because a behavioural test cannot tell one identical table
   * from another. Delete either call and this turns red.
   */
  it("selectOverlay goes THROUGH overlayPriority and isAmbientOverlay", () => {
    const src = readFileSync(resolve(__dirname, "../overlayQueue.ts"), "utf8");
    const body = src.slice(src.indexOf("export function selectOverlay("));
    expect(body).toContain("overlayPriority(b.item.kind)");
    expect(body).toContain("overlayPriority(a.item.kind)");
    expect(body).toContain("isAmbientOverlay(i.kind)");
    // …and does not reach past them into the raw tables.
    expect(body).not.toContain("PRIORITY[");
    expect(body).not.toContain("AMBIENT.has(");
  });

  it("ranks safety and blocking pauses above ambient guidance", () => {
    const order: SimOverlayKind[] = [
      "end",
      "teach",
      "violation",
      "warning",
      "hint",
      "praise",
      "predrive",
      "advisor",
      "task",
      "legend",
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(overlayPriority(order[i - 1])).toBeGreaterThan(overlayPriority(order[i]));
    }
  });

  it("counts the queue but does not count ambient guidance as pending", () => {
    // A belt warning covering a task line is not "two messages waiting" — the
    // task line has not changed in a minute. Only real pending events earn +N.
    const ambientOnly = selectOverlay([item("warning"), item("task"), item("advisor")]);
    expect(ambientOnly.queued).toBe(0);

    const realQueue = selectOverlay([
      item("teach"),
      item("violation"),
      item("hint"),
      item("task"),
    ]);
    expect(realQueue.queued).toBe(2);
  });

  it("is stable: equal priority keeps caller order, so the line cannot flicker", () => {
    const a = item("violation", { id: "v-new" });
    const b = item("violation", { id: "v-old" });
    expect(selectOverlay([a, b]).active?.id).toBe("v-new");
    expect(selectOverlay([a, b]).active?.id).toBe("v-new");
  });

  it("keeps ambient kinds classified as ambient", () => {
    for (const kind of ["task", "advisor", "predrive", "legend"] as SimOverlayKind[]) {
      expect(isAmbientOverlay(kind)).toBe(true);
    }
    for (const kind of ["end", "teach", "violation", "warning", "hint"] as SimOverlayKind[]) {
      expect(isAmbientOverlay(kind)).toBe(false);
    }
  });
});

describe("THEO-4 — a one-line overlay may never become a bare verdict", () => {
  it("demands an authored WHY from everything that names a mistake", () => {
    for (const kind of ["teach", "violation", "hint", "warning"] as SimOverlayKind[]) {
      expect(requiresWhy(kind)).toBe(true);
      expect(hasWhy(item(kind))).toBe(false);
      expect(hasWhy(item(kind, { detailBg: "защото законът казва…" }))).toBe(true);
    }
  });

  it("does not demand one from praise, tasks, prompts or the ribbon legend", () => {
    for (const kind of ["praise", "task", "advisor", "legend", "predrive", "end"] as SimOverlayKind[]) {
      expect(requiresWhy(kind)).toBe(false);
      expect(hasWhy(item(kind))).toBe(true);
    }
  });

  it("treats whitespace as no explanation at all", () => {
    expect(hasWhy(item("violation", { detailBg: "   " }))).toBe(false);
  });
});

describe("the budget — 12 % of the viewport, and never the road", () => {
  it("keeps the centre band off both corners and both rails", () => {
    const band = overlayCentreBand(IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h);
    expect(band.top).toBeGreaterThan(0);
    expect(band.bottom).toBeLessThan(IPHONE16_LANDSCAPE.h);
    expect(band.left).toBeGreaterThan(0);
    expect(band.right).toBeLessThan(IPHONE16_LANDSCAPE.w);
  });

  it("passes the real peek pill on the founder's landscape phone", () => {
    // Measured geometry: top rail, 8 px down, right of the 44 px micro menu,
    // a generous 420 px of text. This is the DEFAULT state.
    const peek = { x: 117, y: 8, width: 420, height: OVERLAY_PEEK_HEIGHT_PX };
    expect(rectClearsCentreBand(peek, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(true);
    expect(peekWithinBudget(peek, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(true);
    expect(
      rectViewportFraction(peek, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h),
    ).toBeLessThan(0.06);
  });

  it("passes the real peek pill in portrait too", () => {
    const peek = { x: 58, y: 67, width: 323, height: OVERLAY_PEEK_HEIGHT_PX };
    expect(rectClearsCentreBand(peek, IPHONE16_PORTRAIT.w, IPHONE16_PORTRAIT.h)).toBe(true);
    expect(peekWithinBudget(peek, IPHONE16_PORTRAIT.w, IPHONE16_PORTRAIT.h)).toBe(true);
  });

  it("REJECTS a second stacked row on the landscape phone — the reason the pill shares the rail", () => {
    // 44 px pill under a 52 px top rail starts at 58 and ends at 102; the band
    // starts at 78.6. This is the measurement that decided the layout, and it
    // has to keep failing or the layout stops being justified.
    const secondRow = { x: 117, y: 58, width: 420, height: OVERLAY_PEEK_HEIGHT_PX };
    expect(rectClearsCentreBand(secondRow, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(
      false,
    );
  });

  it("REJECTS the panels it replaced", () => {
    // The old teach card: `absolute inset-0` inside the scene box.
    const teachModal = { x: 0, y: 0, width: 852, height: 393 };
    expect(rectClearsCentreBand(teachModal, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(
      false,
    );
    expect(peekWithinBudget(teachModal, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(false);

    // The old compact teach sheet: 62 % of the viewport, above the band.
    const teachSheet = { x: 0, y: 109, width: 852, height: 244 };
    expect(peekWithinBudget(teachSheet, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(false);
    expect(rectClearsCentreBand(teachSheet, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(
      false,
    );
  });

  it("touching the band's edge is not entering it", () => {
    const band = overlayCentreBand(IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h);
    const flush = { x: 0, y: band.top - 44, width: 852, height: 44 };
    expect(rectClearsCentreBand(flush, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(true);
    const oneInside = { x: 0, y: band.top - 43, width: 852, height: 44 };
    expect(rectClearsCentreBand(oneInside, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(
      false,
    );
  });

  it("charges only the on-screen part of a rect, and never divides by zero", () => {
    const half = { x: -426, y: 0, width: 852, height: 393 };
    expect(rectViewportFraction(half, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBeCloseTo(
      0.5,
      3,
    );
    expect(rectViewportFraction(half, 0, 0)).toBe(0);
  });

  it("states the numbers the WebKit probe asserts against", () => {
    // tools/mobile/overlay-probe.mjs cannot import TypeScript, so it carries
    // these four fractions as literals. Pinning them here is what keeps the
    // screen and its measurement from quietly disagreeing.
    expect(OVERLAY_PEEK_MAX_FRACTION).toBe(0.12);
    expect(OVERLAY_CENTRE_BAND).toEqual({ x0: 0.16, x1: 0.84, y0: 0.2, y1: 0.74 });
  });
});

/**
 * =============================================================================
 * RULE 4 — „NOTHING ARRIVES FULL-BLEED ON ITS OWN" — 2026-08-17.
 *
 * Every assertion below is one of two frames off the deployed build, taken with
 * the shipped harness (`tools/mobile/lesson-audit.mjs`, WebKit, real insets,
 * iPhone 16 landscape 852 × 393):
 *
 *   sc-hz-breakdown-pulloff / mobile / right — 07b-menu.png
 *     «Меню на урока» open, the cluster reading «0 км/ч D» (so the car IS
 *     frozen), and «Контролна лампа: температура! / Спри спокойно вдясно»
 *     painted live over the undimmed road beside it.
 *
 *   sc-ac-rain-lights / mobile / right — the harness's own state line
 *     [01-arrival]  0 км/ч  card=warning/peek
 *     …i.e. at arrival the card on the glass is the telltale, not the briefing
 *     that ships `blocking: true`, so the drive is not held and «Разбрах» is
 *     nowhere.
 * =============================================================================
 */

const BRIEFING: SimOverlayItem = {
  id: "briefing",
  kind: "hint",
  tone: "neutral",
  chipBg: "Инструкции",
  lineBg: "Включи късите светлини — вали, макар да е ден.",
  detailBg: "2. Потегли по правата улица със съобразена за дъжда скорост.",
  blocking: true,
  ackLabelBg: "Разбрах",
};

const TELLTALE: SimOverlayItem = {
  id: "warn:temp",
  kind: "warning",
  tone: "danger",
  lineBg: "Контролна лампа: температура! Спри спокойно вдясно",
  detailBg: "Прегрятият двигател спира да е двигател.",
};

describe("the screen has ONE owner — 07b-menu.png, as data", () => {
  it("says nothing while «Меню на урока» is up", () => {
    // THE FRAME. Before this rule existed the selector had no way to be told,
    // so it returned the telltale and the shell painted it over the sheet.
    const withMenu = selectOverlay([TELLTALE], { screenOwners: ["playMenu"] });
    expect(withMenu.active).toBeNull();
    expect(withMenu.queued).toBe(0);
    expect(withMenu.waiting).toHaveLength(0);
  });

  it("silences the queue for a quiz and for a consequence card in EVERY mode", () => {
    // `pauseModalUp` guarded the consequence card with `mistakeMode`, so
    // outside the sandbox it froze the car and let the queue keep talking.
    // There is no mode here to get wrong: a surface that owns the screen owns
    // it in every mode.
    expect(selectOverlay([TELLTALE], { screenOwners: ["quiz"] }).active).toBeNull();
    expect(selectOverlay([TELLTALE], { screenOwners: ["consequence"] }).active).toBeNull();
  });

  it("and OTHERWISE speaks exactly as it always did — both directions", () => {
    // The other half of the crime. A gate that blanked the queue whenever
    // anything was open would be the same defect pointing the other way: the
    // road would go quiet during an ordinary drive.
    expect(selectOverlay([TELLTALE]).active?.id).toBe("warn:temp");
    expect(selectOverlay([TELLTALE], { screenOwners: [] }).active?.id).toBe("warn:temp");
  });

  it("does NOT silence itself for its own read sheet", () => {
    // «ПРОЧЕТИ» / «ЗАЩО» / «СПИСЪК» open the detail of the item the queue
    // selected. Blanking the queue there would delete the card the sheet
    // belongs to — and with it the «Разбрах» that closes it, which is the
    // 4-pixel dead end `noDismiss` was written for, rebuilt in a new place.
    expect(selectOverlay([TELLTALE], { screenOwners: ["readSheet"] }).active?.id).toBe(
      "warn:temp",
    );
    expect(overlayQueueMaySpeak(["readSheet"])).toBe(true);
    expect(overlaySilencesQueue("readSheet")).toBe(false);
  });

  it("keeps the census exhaustive and keyed to itself", () => {
    // `tsc` already refuses a union member with no row; this catches the other
    // way a table rots — a row filed under the wrong key.
    for (const [key, spec] of Object.entries(OVERLAY_SCREEN_OWNERS)) {
      expect(spec.id).toBe(key);
      expect(spec.ownerFile.length).toBeGreaterThan(0);
    }
    // Exactly one of the four is the overlay layer itself. If a second ever
    // claims to be, the frame above comes back.
    expect(
      Object.values(OVERLAY_SCREEN_OWNERS).filter((s) => s.isQueueSurface).map((s) => s.id),
    ).toEqual(["readSheet"]);
  });

  it("cannot let the two halves diverge again — every subset of the census", () => {
    // THE SHAPE OF THE 2026-08-17 DEFECT, made unrepresentable: `paused` had
    // six disjuncts and `pauseModalUp` had two, and nothing compared them.
    // Both answers now come off this one table, so the invariant holds over
    // all 2^4 combinations rather than over the four someone thought of.
    const all: OverlayScreenOwner[] = ["quiz", "consequence", "playMenu", "readSheet"];
    const quiet: OverlaySelection = { active: null, queued: 0, waiting: [], held: false };
    for (let mask = 0; mask < 1 << all.length; mask += 1) {
      const owners = all.filter((_, i) => (mask & (1 << i)) !== 0);
      if (!overlayQueueMaySpeak(owners)) {
        // You may never take the screen from the queue without stopping the car.
        expect(overlayHoldsDrive(owners, quiet), `owners=${owners.join("+")}`).toBe(true);
      }
      if (owners.length > 0) {
        // …and you may never stop the car with a surface of your own and leave
        // the queue talking over it. That direction is the frame.
        expect(overlayHoldsDrive(owners, quiet), `owners=${owners.join("+")}`).toBe(true);
        expect(overlayQueueMaySpeak(owners)).toBe(
          owners.every((o) => !overlaySilencesQueue(o)),
        );
      }
    }
    expect(overlayQueueMaySpeak([])).toBe(true);
    expect(overlayHoldsDrive([], quiet)).toBe(false);
  });
});

describe("`blocking` finally means something — [01-arrival] card=warning/peek", () => {
  it("holds the drive for a blocking item that LOST the priority contest", () => {
    // The measurement, as data: warning (70) outranks the briefing (hint, 60),
    // so the telltale is what the student sees. That part is deliberately
    // unchanged — a safety telltale is not something to demote. What changed is
    // that the selection now ALSO reports that a blocking item is outstanding,
    // so the car can be frozen and the briefing is still there, unacknowledged,
    // when the telltale's TTL lapses.
    const s = selectOverlay([TELLTALE, BRIEFING]);
    expect(s.active?.kind).toBe("warning");
    expect(s.held).toBe(true);
    expect(overlayHoldsDrive([], s)).toBe(true);
  });

  it("does NOT hold the drive when nothing is blocking — the other direction", () => {
    // A `held` that erred towards true would freeze a car that should be
    // moving, and the positive control in tools/mobile/lesson-audit.mjs would
    // read 0 км/ч for the whole drive: the same crime, opposite sign.
    expect(selectOverlay([TELLTALE]).held).toBe(false);
    expect(selectOverlay([item("task"), item("advisor"), item("praise")]).held).toBe(false);
    expect(selectOverlay([]).held).toBe(false);
    expect(overlayHoldsDrive([], selectOverlay([TELLTALE]))).toBe(false);
  });

  it("still reports `held` while a menu is covering the blocking item", () => {
    // The two rules meeting. The menu takes the glass, so nothing is painted —
    // but the briefing has still not been acknowledged, and a car that starts
    // rolling the instant a menu opens over its unread instruction is the
    // 13-second frame from sc-vp-stall all over again.
    const s = selectOverlay([BRIEFING], { screenOwners: ["playMenu"] });
    expect(s.active).toBeNull();
    expect(s.held).toBe(true);
    expect(overlayHoldsDrive(["playMenu"], s)).toBe(true);
  });
});
