import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TouchInputSource } from "@/modules/sim/engine";
import type { CabinControls } from "@/modules/sim/scene/cabin";
import { FLANK_LANE_PX, TouchControls } from "../TouchControls";

/**
 * =============================================================================
 * THE WORD ON A FLANK BUTTON NAMES ITS CLASS — catalogue sweep 2026-08-17.
 *
 * FOUR ROWS OF THE SWEEP ARE ONE MISREADING, and the person who made it had
 * driven all 195 legs with every frame in front of him:
 *
 *   sc-junction-gap/mobile-right/01-arrival.png
 *       „the gear cluster Л/З/Д is ghost text on the building facade"
 *   sc-pk-move-off · sc-vp-handbrake   (both graded on the mirror check)
 *       „the mobile HUD offers no mirror control … of any kind"
 *   sc-park-night
 *       the same column enumerated as „Д/З/Л", unnamed
 *
 * Л/З/Д ARE the three graded mirror glances. The faces that shipped were
 *
 *   left flank    «Ляв»   «Дясн»  «Клакс»  «Кола»
 *   right flank   «Колан» «Дясн»  «Задн»   «Ляво»
 *
 * — «ДЯСН» on two flanks meaning two different controls, «ЗАДН» (the selector
 * word for reverse) three rows from a cluster reading «D», and the noun those
 * two lessons grade, «огледало», in zero pixels of visible ink. The full census
 * and the width arithmetic are in the block above the left flank in
 * `TouchControls.tsx`; this file is the gate on it.
 *
 * WHAT THIS FILE REFUSES TO ACCEPT AS A FIX, and it is the reason §4 exists: a
 * caption that named the whole PROCEDURE — «ОГЛЕД» — would read green here and
 * be a lie, because the procedure those two briefings grade is „огледало И
 * поглед през ЛЯВОТО рамо" and `MirrorGlanceKind` is `"left" | "right" | "rear"`
 * (scene/cabin.ts). There is no blind-spot station to promise. Naming the button
 * after the act it only half performs is the same crime as crediting a student
 * for a check he never made.
 *
 * WHY A RENDER AND NOT A SOURCE READ. This project has already shipped tests
 * that assert against comment-stripped source text and therefore guard the
 * spelling of a line rather than what a phone paints. Every assertion below
 * comes out of `renderToStaticMarkup`, i.e. the markup the browser receives.
 * The `node` environment runs no effects, so `snap` is null — which is exactly
 * the belt-OFF-unknown state, and every station asserted here is unconditional.
 * =============================================================================
 */

const props = {
  touch: new TouchInputSource(),
  cabinRef: { current: null } as { current: CabinControls | null },
  onToggleCamera: () => undefined,
  onPause: () => undefined,
  onReset: () => undefined,
  onToggleFullscreen: null,
};
const shown = renderToStaticMarkup(<TouchControls {...props} hidden={false} />);

type Station = {
  side: "left" | "right";
  index: number;
  /** The accessible name — the screen reader's whole sentence. */
  label: string;
  /** The 15 px mark. */
  glyph: string;
  /** The 8 px word under it, as a student reads it (the CSS uppercases it). */
  caption: string;
};

/** Every station the overlay actually rendered, parsed out of its own markup.
 *  A station's slice runs to the NEXT station marker, so a button can never be
 *  read into its neighbour's row. */
function stations(): Station[] {
  const marks = [...shown.matchAll(/data-arc="(\d+)" data-arc-side="(left|right)"/g)];
  return marks.map((m, i) => {
    const slice = shown.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : undefined);
    const spans = [...slice.matchAll(/<span aria-hidden="true"[^>]*>([^<]*)<\/span>/g)].map(
      (s) => s[1],
    );
    return {
      side: m[2] as "left" | "right",
      index: Number(m[1]),
      label: /aria-label="([^"]+)"/.exec(slice)?.[1] ?? "",
      glyph: spans[0] ?? "",
      caption: (spans[1] ?? "").toUpperCase(),
    };
  });
}

const ALL = stations();
const on = (side: "left" | "right") => ALL.filter((s) => s.side === side);
/** The stations that fire a mirror glance, found by what they DO (their
 *  accessible name is the one thing `touchDock.test.tsx` already pins), never
 *  by the caption this file is about to judge. */
const GLANCES = ALL.filter((s) => s.label.startsWith("Поглед в"));
const INDICATORS = ALL.filter((s) => s.label.startsWith("Мигач"));

describe("§0 the fixture is the real overlay, not an empty string", () => {
  it("both flanks rendered their stations", () => {
    expect(on("left").map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(on("right").map((s) => s.index)).toEqual([1, 2, 3]); // 0 = belt, needs `snap`
  });

  it("the three graded glances and both indicators are among them", () => {
    expect(GLANCES).toHaveLength(3);
    expect(INDICATORS).toHaveLength(2);
    for (const s of [...GLANCES, ...INDICATORS]) expect(s.caption).not.toBe("");
  });
});

describe("§1 THE DEFECT: the two flanks shared a vocabulary", () => {
  it("no word appears on both flanks", () => {
    // FAILS ON THE SHIPPED BUILD: «ДЯСН» was the right INDICATOR on the left
    // flank and the right MIRROR on the right flank, so this intersection was
    // ["ДЯСН"] — one word, two controls, on opposite edges of the screen.
    const left = new Set(on("left").map((s) => s.caption));
    const shared = on("right")
      .map((s) => s.caption)
      .filter((w) => left.has(w));
    expect(shared).toEqual([]);
  });

  it("every mirror glance says «ОГЛЕДАЛО» in ink a student can see", () => {
    // FAILS ON THE SHIPPED BUILD: «ДЯСН · ЗАДН · ЛЯВО». The noun lived only in
    // `aria-label`, which is not a pixel.
    for (const s of GLANCES) expect(s.caption, s.label).toBe("ОГЛЕДАЛО");
  });

  it("…and every indicator says «МИГАЧ»", () => {
    // FAILS ON THE SHIPPED BUILD: «ЛЯВ · ДЯСН». The instruction a student is
    // graded against is «пусни десен мигач» (sc-junction-gap, step 2) and the
    // word «мигач» was nowhere on the glass.
    for (const s of INDICATORS) expect(s.caption, s.label).toBe("МИГАЧ");
  });

  it("no glance caption is a gearbox face", () => {
    // The misreading itself: a vertical column of Bulgarian selector words. The
    // list is the gate P—R—N—D as a Bulgarian cluster spells it.
    const GEARBOX = ["ЗАДН", "ЗАДНА", "Д", "З", "P", "R", "N", "D"];
    for (const s of GLANCES) expect(GEARBOX).not.toContain(s.caption);
  });
});

describe("§2 THE OTHER DIRECTION: naming the class did not cost the side", () => {
  it("the three glances still render three different marks", () => {
    // The cheap way to pass §1 is to make every button identical. The letter is
    // now the ONLY thing separating three controls, so it has to be checked.
    expect(new Set(GLANCES.map((s) => s.glyph)).size).toBe(3);
  });

  it("…and the two indicators render two different arrows", () => {
    expect(new Set(INDICATORS.map((s) => s.glyph)).size).toBe(2);
  });

  it("the screen reader still hears which side, on all five", () => {
    // Nothing was moved OUT of `aria-label` to make room; a caption change that
    // also thinned the accessible name would fail here.
    const sides = [...GLANCES, ...INDICATORS].map((s) => s.label);
    expect(sides).toContain("Поглед в дясното огледало");
    expect(sides).toContain("Поглед в лявото огледало");
    expect(sides).toContain("Поглед в огледалото за задно виждане");
    expect(sides).toContain("Мигач наляво");
    expect(sides).toContain("Мигач надясно");
  });
});

describe("§3 the caption fits the lane it was measured against", () => {
  /** 8 px uppercase Cyrillic at `tracking-tight`, ≈ 5.2 px of advance per
   *  glyph. Deliberately the PESSIMISTIC end of the range the shipped faces
   *  measure at, because the failure this bounds is silent: a caption wider
   *  than the lane overflows into the ⚙ sheet's or the notification column's
   *  half of the screen and nothing goes red. */
  const PX_PER_GLYPH = 5.2;

  it("no face on either flank is wider than the reserved lane", () => {
    expect(FLANK_LANE_PX).toBe(60);
    for (const s of ALL) {
      expect(s.caption.length * PX_PER_GLYPH, `«${s.caption}»`).toBeLessThanOrEqual(FLANK_LANE_PX);
    }
  });

  it("…and the widest of them is the one the arithmetic in the file names", () => {
    const widest = ALL.map((s) => s.caption).sort((a, b) => b.length - a.length)[0];
    expect(widest).toBe("ОГЛЕДАЛО");
    expect(widest.length * PX_PER_GLYPH).toBeCloseTo(41.6, 1);
  });

  it("…and it overflows rather than wrapping, so the glyph cannot be pushed", () => {
    // The overflow above is only harmless while it stays on ONE line. Let
    // «ОГЛЕДАЛО» wrap inside the 44 px box and the caption becomes two 8 px
    // rows, which lifts the 15 px glyph off the station's vertical centre and
    // moves a control under a thumb already reaching for it — the founder's own
    // „elements moving". Read off the shipped class attribute, not the source.
    const captionSpans = [
      ...shown.matchAll(/<span aria-hidden="true" class="([^"]*text-\[8px\][^"]*)"/g),
    ].map((m) => m[1]);
    expect(captionSpans.length).toBe(ALL.filter((s) => s.caption !== "").length);
    for (const cls of captionSpans) expect(cls).toContain("whitespace-nowrap");
  });
});

describe("§4 the fix that would have been a lie", () => {
  it("no glance button claims the whole procedure", () => {
    // «ОГЛЕД» is the briefing's own word for the act — and the act is «огледало
    // И поглед през ЛЯВОТО рамо» (sc-vp-handbrake, step 3). These three buttons
    // perform the FIRST half only, and a caption naming the whole thing would
    // teach a student that one tap on a mirror discharged the blind spot too.
    // THE SECOND HALF NOW EXISTS AND THIS RULE OUTLIVED IT: `MirrorGlanceKind`
    // gained `"shoulder"` on 2026-09-01, and the control that performs it is
    // the «Рамо» TOP-RAIL button (both flanks are full at four stations — the
    // arithmetic is at that button in TouchControls.tsx). So the rule stands
    // for a stronger reason than „the engine cannot measure it": it can, it is
    // half of MOVE_OFF_WITHOUT_OBSERVATION, and it has its own control — which
    // is exactly why a MIRROR may not go on claiming it.
    const OVERCLAIMS = ["ОГЛЕД", "РАМО", "МЪРТВА ЗОНА", "СЛЯПА ЗОНА", "ОБСТАНОВКА"];
    for (const s of GLANCES) expect(OVERCLAIMS).not.toContain(s.caption);
  });

  it("…and there are exactly three of them, because there are three mirrors", () => {
    // Three MIRRORS, three mirror stations — and the blind-spot check is not a
    // fourth mirror, so it is not a fourth station here even now that it has a
    // member, a camera pose, a rule-engine sample and controls on every input
    // path. It could not be one anyway: `arcStationRectPx` puts a fifth right
    // station at −12 px on the narrowest landscape stage in the ladder. It is
    // the «Рамо» button in the top rail.
    expect(GLANCES.map((s) => s.label).sort()).toEqual([
      "Поглед в дясното огледало",
      "Поглед в лявото огледало",
      "Поглед в огледалото за задно виждане",
    ]);
  });
});
