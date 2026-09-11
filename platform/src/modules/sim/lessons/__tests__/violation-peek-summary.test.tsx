/**
 * THE PEEK PRINTS A SUMMARY IT CAN FINISH — `sc-pk-driveway:fa602d10`.
 *
 * THE FRAME, and it is worse than the one that was filed:
 * `.audit-frames/w28/frames/sc-pk-driveway__mobile-wrong/04-t013s.png` —
 *
 *     ОПАСНА  −10 ИЗПИТНИ Т.
 *     Удар в неподвижно препятствие
 *     Удари неподвижен предмет —          ← cut, mid-clause, at a dash
 *     ЗАЩО ↓11        ✕
 *
 * Filed at «↓ ОЩЕ 6 РЕДА» and re-judged STILL twice since, the second time with
 * the number GROWN to eleven: the per-body `COLLISION_CONTACT_COPY` split made
 * the explanation longer while the phone's text window stayed 44–84 px. Under
 * doc 64 THEO-4 the WHY of a −10 ОПАСНА ГРЕШКА is precisely the part that may
 * not be the part behind a tap.
 *
 * THE REMEDY IS THE ONE THE PRODUCT ITSELF NAMED, in
 * `hud/overlayQueue.ts WHY_REACHABLE_MIN_VISIBLE_FRACTION`'s header — „A CARD
 * THAT FAILS THIS IS NOT BROKEN COPY — it is copy on the wrong surface. The
 * remedy is never to delete the explanation: it is that the peek prints a
 * SUMMARY it can finish and the sheet holds the rest" — and in `SimOverlay`'s
 * own fold block, which calls it „an AUTHORING change" and settles for a
 * counter „until the copy that needs it is rewritten". This is that copy, plus
 * the channel it travels on, plus this gate.
 *
 * NOTHING IS DELETED. `explanationBg` is untouched, «ЗАЩО» still opens it whole
 * with its citations, and `SessionEndScreen`'s FaultCard never was on this path.
 * The ONLY surface that changes is the phone card's body row.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SimOverlay } from "../../hud/SimOverlay";
import type { HudEvent, LessonSpec } from "../../contracts";
import { overlayPeekBodyBg, type SimOverlayItem } from "../../hud/overlayQueue";
import { COLLISION_CONTACT_COPY, VIOLATIONS, violationPeekBg } from "../../rules";
// Past the barrel deliberately: `PER_ACT_COPY` is the registry `violation-title
// -fits-peek.test.ts` also reads directly, and a gate over „every authored
// summary" has to walk the table itself rather than the four names it knows.
import { PER_ACT_COPY } from "../../rules/catalog";
import { applyTick, createLessonSession } from "../engine";
import { makeTick } from "./fixtures";

/* ── The budget, re-cut from the same literals `violation-title-fits-peek
      .test.ts` uses, so the two cannot drift apart. ─────────────────────── */

/** px. 11 px at `leading-tight` — the box one line of `lineBg` occupies. */
const TITLE_LINE_PX = 13.75;
/** px. 11 px at `leading-snug` — the box one line of the body occupies. */
const BODY_LINE_PX = 15.125;
/** px. The peek's text-window floor (`SimOverlay` `minHeight: "2.75rem"`). */
const WINDOW_PX = 2.75 * 16;
/** Characters one line of the compact card holds — the sibling file's proxy. */
const PEEK_LINE_CHARS = 26;
/** `hud/overlayQueue.ts WHY_REACHABLE_MIN_VISIBLE_FRACTION`. */
const MIN_VISIBLE_FRACTION = 0.5;

const OVERLAY_SRC = readFileSync(resolve(__dirname, "../../hud/SimOverlay.tsx"), "utf8");
const SHELL_SRC = readFileSync(
  resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
  "utf8",
);

/** Greedy word wrap — the browser's own algorithm at a character budget. */
function wrap(text: string, perLine = PEEK_LINE_CHARS): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    const next = line === "" ? word : `${line} ${word}`;
    if (next.length <= perLine) line = next;
    else {
      if (line !== "") out.push(line);
      line = word;
    }
  }
  if (line !== "") out.push(line);
  return out;
}

/** Every authored summary in the catalogue, with where it came from. */
function authoredSummaries(): Array<{ where: string; peekBg: string; siblingBg: string }> {
  const out: Array<{ where: string; peekBg: string; siblingBg: string }> = [];
  for (const [code, spec] of Object.entries(VIOLATIONS)) {
    if (typeof spec.peekBg === "string") {
      out.push({ where: code, peekBg: spec.peekBg, siblingBg: spec.explanationBg });
    }
  }
  for (const [code, table] of Object.entries(PER_ACT_COPY)) {
    for (const [act, copy] of Object.entries(table ?? {})) {
      if (typeof copy.peekBg === "string") {
        out.push({ where: `${code}/${act}`, peekBg: copy.peekBg, siblingBg: copy.explanationBg });
      }
    }
  }
  return out;
}

describe("the peek's body budget", () => {
  it("is two body line boxes, derived from the window the title budget is derived from", () => {
    // The floor window still is what both budgets are cut from.
    expect(OVERLAY_SRC).toContain('minHeight: "2.75rem"');
    // A two-line title plus ONE body line still fits the floor…
    expect(WINDOW_PX).toBeGreaterThanOrEqual(2 * TITLE_LINE_PX + BODY_LINE_PX);
    // …and a second body line does not, which is why the budget is two lines
    // and not more: at two, HALF the summary is visible in the very worst case,
    // and half is exactly what `whyIsReachable` accepts.
    expect(WINDOW_PX).toBeLessThan(2 * TITLE_LINE_PX + 2 * BODY_LINE_PX);
    expect(1 / 2).toBeGreaterThanOrEqual(MIN_VISIBLE_FRACTION);
  });

  it("every authored summary finishes in two lines", () => {
    const over = authoredSummaries()
      .map((r) => ({ ...r, lines: wrap(r.peekBg) }))
      .filter((r) => r.lines.length > 2)
      .map((r) => `${r.where} (${r.peekBg.length} chars): ${r.lines.join(" / ")}`);
    expect(over).toEqual([]);
  });

  it("every authored summary is a WHOLE sentence — the defect was a cut one", () => {
    for (const { where, peekBg } of authoredSummaries()) {
      expect(peekBg.trim(), where).toBe(peekBg);
      expect(peekBg, where).toMatch(/[.!?]$/);
      // No ellipsis and no dangling clause marker: „…" after four words is how
      // a THEO-4 explanation turns back into a bare verdict.
      expect(peekBg, where).not.toMatch(/…|\.\.\.$|[,—-]\s*$/);
    }
  });

  it("carries no citation — ADR-002 keeps every article in explanationBg/lawRef", () => {
    for (const { where, peekBg } of authoredSummaries()) {
      expect(peekBg, where).not.toMatch(/чл\.|ал\.|§|Наредба|ЗДвП|ППЗДвП|приложение/i);
    }
  });

  it("is a summary and not a copy of the paragraph it stands in front of", () => {
    for (const { where, peekBg, siblingBg } of authoredSummaries()) {
      expect(peekBg, where).not.toBe(siblingBg);
      expect(peekBg.length, where).toBeLessThan(siblingBg.length);
    }
  });

  it("never merely repeats the title the card already prints above it", () => {
    for (const [code, spec] of Object.entries(VIOLATIONS)) {
      if (typeof spec.peekBg === "string") expect(spec.peekBg, code).not.toBe(spec.titleBg);
    }
    for (const [act, copy] of Object.entries(COLLISION_CONTACT_COPY)) {
      expect(copy.peekBg, act).not.toBe(copy.titleBg);
    }
  });
});

describe("the four crashes keep four summaries", () => {
  it("no two struck bodies share one", () => {
    const bodies = Object.values(COLLISION_CONTACT_COPY).map((c) => c.peekBg);
    expect(new Set(bodies).size).toBe(4);
  });

  it("violationPeekBg reads the ACT first and the pooled row second", () => {
    expect(violationPeekBg("COLLISION", "staticObject")).toBe(
      COLLISION_CONTACT_COPY.staticObject.peekBg,
    );
    expect(violationPeekBg("COLLISION", "pedestrian")).toBe(
      COLLISION_CONTACT_COPY.pedestrian.peekBg,
    );
    // An unrecognised act falls back to the pooled row, exactly as
    // `makeViolation` does for the title and the explanation.
    expect(violationPeekBg("COLLISION", "trebuchet")).toBe(VIOLATIONS.COLLISION.peekBg);
    expect(violationPeekBg("COLLISION", undefined)).toBe(VIOLATIONS.COLLISION.peekBg);
  });

  /**
   * ── THIS CASE USED TO PIN THE DEFECT AS THE DEFAULT — `sc-roundabout-entry:
   *    fe081cf1`, 2026-09-11 ────────────────────────────────────────────────
   *
   * It read `expect(VIOLATIONS.SPEEDING_OVER_LIMIT.peekBg).toBeUndefined()` and
   * called the fallback „prints the full paragraph". That fallback was not a
   * corner: it was 55 of the 58 codes, and on every one of them the full
   * paragraph is a 100–700-character body folded into a window that holds ONE
   * line — the cut card the row was filed on. `ViolationSpec.peekBg` is
   * REQUIRED now, so the old assertion cannot be true for ANY code and pinning
   * it on one was pinning the hole open.
   *
   * WHAT IS KEPT is the behaviour the case was really about, moved to where it
   * is still reachable: the resolver's act-then-pool fallback, exercised on a
   * row that genuinely has no act summary of its own, and the card's own
   * paragraph fallback, which `overlayPeekBodyBg` still performs for any item
   * that arrives without one (the describe block below).
   */
  it("no code can print a paragraph into the peek — every one resolves a summary", () => {
    const missing = (Object.keys(VIOLATIONS) as (keyof typeof VIOLATIONS)[]).filter(
      (code) => violationPeekBg(code, undefined) === null,
    );
    expect(missing).toEqual([]);
    // The fallback itself is intact — an act this code does not carry copy for
    // resolves the pooled row rather than nothing.
    expect(violationPeekBg("SPEEDING_OVER_LIMIT", "no-such-act")).toBe(
      VIOLATIONS.SPEEDING_OVER_LIMIT.peekBg,
    );
  });
});

describe("what the card actually prints", () => {
  const base: SimOverlayItem = {
    id: "t",
    kind: "violation",
    tone: "danger",
    lineBg: "Удар в неподвижно препятствие",
  };

  it("prints the summary when there is one and the paragraph when there is not", () => {
    expect(overlayPeekBodyBg({ ...base, detailBg: "дълъг текст", peekBg: "кратко." })).toBe(
      "кратко.",
    );
    expect(overlayPeekBodyBg({ ...base, detailBg: "дълъг текст" })).toBe("дълъг текст");
    // A blank summary is not a summary: it would blank the card's only sentence.
    expect(overlayPeekBodyBg({ ...base, detailBg: "дълъг текст", peekBg: "  " })).toBe(
      "дълъг текст",
    );
    expect(overlayPeekBodyBg({ ...base, peekBg: null })).toBeNull();
  });

  /** Markup with tags stripped — what a reader actually reads on the phone. */
  function peekText(item: SimOverlayItem): string {
    return renderToStaticMarkup(createElement(SimOverlay, { item, queued: 0 }))
      .replace(/<[^>]*>/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  it("MOUNTED: the −10 card the row was filed against now finishes its sentence", () => {
    // The item the shell's `...(!ended` re-map builds for a static-object crash,
    // field for field — this is `sc-pk-driveway__mobile-wrong/04-t013s.png`.
    const card: SimOverlayItem = {
      ...base,
      chipBg: "−10 изпитни т.",
      markClassBg: "опасна",
      lineBg: COLLISION_CONTACT_COPY.staticObject.titleBg,
      detailBg: COLLISION_CONTACT_COPY.staticObject.explanationBg,
      peekBg: COLLISION_CONTACT_COPY.staticObject.peekBg,
      lawRef: VIOLATIONS.COLLISION.lawRef,
    };
    const glass = peekText(card);
    // The WHY is ON the card, whole…
    expect(glass).toContain(COLLISION_CONTACT_COPY.staticObject.peekBg);
    // …and the 340-character paragraph that used to be cut at «Удари неподвижен
    // предмет —» is not what the body row is trying to print any more.
    expect(glass).not.toContain("Неподвижното препятствие не се появява внезапно");
    // The control that holds it is still there and still named.
    expect(glass.toUpperCase()).toContain("ЗАЩО");
    // And the card without a summary is untouched: the paragraph still prints.
    const old = peekText({ ...card, peekBg: null });
    expect(old).toContain("Удари неподвижен предмет");
  });

  it("row 2b paints it, and the sheet still paints the whole explanation", () => {
    // The body row is the ONE surface that swapped…
    expect(OVERLAY_SRC).toContain("const peekBodyBg = overlayPeekBodyBg(shown);");
    expect(OVERLAY_SRC).toContain("{peekBodyBg}");
    // …and «ЗАЩО» still opens `detailBg`, so nothing authored left the product.
    expect(OVERLAY_SRC).toContain("{shown.detailBg}");
    // The phone's re-map feeds it (the field is dropped at that boundary if the
    // line goes; that is how `raisedAtMs` was lost for a whole round).
    expect(SHELL_SRC).toContain("peekBg: t.event.peekBg ?? null,");
  });
});

describe("end to end — a real crash through the real engine", () => {
  const spec: LessonSpec = {
    id: "t-peek-summary",
    order: 99,
    titleBg: "Тест",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: false,
    objectives: [],
    examMode: true,
  };

  function drive(withWhat: "staticObject" | "pedestrian"): HudEvent[] {
    let s = createLessonSession(spec);
    const hud: HudEvent[] = [];
    for (const tick of [
      makeTick({ t: 1, speedKmh: 20 }),
      makeTick({ t: 2, speedKmh: 20, events: [{ kind: "collision", withWhat }] }),
      makeTick({ t: 3, speedKmh: 0 }),
    ]) {
      const r = applyTick(s, tick);
      s = r.state;
      hud.push(...r.hudEvents);
    }
    return hud;
  }

  it("the HUD toast carries the act's summary AND the whole paragraph", () => {
    const toast = drive("staticObject").find(
      (e): e is Extract<HudEvent, { kind: "violation" }> => e.kind === "violation",
    );
    expect(toast).toBeDefined();
    expect(toast!.titleBg).toBe(COLLISION_CONTACT_COPY.staticObject.titleBg);
    // The summary the peek can finish…
    expect(toast!.peekBg).toBe(COLLISION_CONTACT_COPY.staticObject.peekBg);
    expect(wrap(toast!.peekBg!).length).toBeLessThanOrEqual(2);
    // …and the paragraph the sheet holds, unshortened.
    expect(toast!.explanationBg).toBe(COLLISION_CONTACT_COPY.staticObject.explanationBg);
  });

  it("a different body gets a different summary on the same code", () => {
    const wall = drive("staticObject").find((e) => e.kind === "violation");
    const person = drive("pedestrian").find((e) => e.kind === "violation");
    expect(wall && wall.kind === "violation" ? wall.peekBg : null).not.toBe(
      person && person.kind === "violation" ? person.peekBg : null,
    );
  });
});
