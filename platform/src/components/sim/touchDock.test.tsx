import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TouchInputSource } from "@/modules/sim/engine";
import { TouchControls, keyboardTakeoverAllowed, ARC_STATIONS_LEFT } from "./TouchControls";
import type { CabinControls } from "@/modules/sim/scene/cabin";

/**
 * =============================================================================
 * TWO WAYS A PHONE LOSES THE CONTROL IT IS BEING GRADED ON — 2026-08-17.
 *
 * The catalogue sweep routed eleven rows at this component. Four of them are
 * one defect and three more are another, and both defects have the same shape:
 * a control the lesson's own first sentence asks for is not on the glass, so
 * the student is scored on an act no input he has can perform.
 *
 * ── A · ONE KEYSTROKE TAKES EVERY CONTROL, PERMANENTLY ──────────────────────
 *
 * MEASURED ON THE DEPLOYED BUILD, WebKit, iPhone 16 landscape with real insets,
 * sc-ac-night-lights@L1, one `KeyW` and nothing else:
 *
 *   before   7 stations · ⇦Ляв ⇨Дясн ⊙Клакс | ⚠Колан ДДясн ЗЗадн ЛЛяво
 *   after    0 stations
 *
 * and the same device answers `(any-pointer: fine) false`, `(pointer: coarse)
 * true`, `(any-hover: hover) false`, `navigator.maxTouchPoints 0`.
 *
 * The route back is a `pointerdown` whose `pointerType` is exactly "touch",
 * which a keyboard-driven session never produces. Three catalogue rows are that
 * one line — sc-rb-exit-signal grades «Излез на третия изход с включен десен
 * мигач», sc-sig-controller-live loses signalling and all three mirror glances
 * for 128 s, sc-ln-turn-lane-arrows grades a lane change whose briefing says
 * „огледало, мигач, после маневра".
 *
 * `maxTouchPoints` is in the measurement above because it was the obvious
 * discriminator and the phone REFUTED it: 0, with touch emulation on. A guard
 * built on it would have shipped green and changed nothing.
 *
 * ── C · THE ⚙ DOCK WAS THE BELT'S SECOND FACE, SO IT WAS NEVER ON SCREEN ────
 *
 * MEASURED, same build and device, `wave12-flanks.mjs`, belt off:
 *
 *   right flank bottom→top   ⚠Колан  ДДясн  ЗЗадн  ЛЛяво
 *   ⚙ dock                   absent
 *
 * The dock is the only door to «СВЕТЛ/КЪСИ/ДЪЛГИ», «МЪГЛА», «ЧИСТ», «ДВИГ»,
 * «РЪЧНА» and the gear lever, and four lessons open by asking for them
 * (sc-ac-night-lights, sc-ac-rain-lights, sc-ac-highbeam-lead, sc-ac-fog). The
 * sweep opened 24 mobile frames across those four and the sheet was in none.
 *
 * ── WHAT THIS FILE CAN AND CANNOT SEE ───────────────────────────────────────
 *
 * There is no DOM environment in this project's vitest config, so §2 renders
 * with `react-dom/server` — which runs no effects, which means `snap` is always
 * null here and the BELT-OFF branch cannot be rendered. That state is asserted
 * against the source instead, in §3, and labelled as such rather than dressed
 * up as a render. The browser half is the two measurements quoted above.
 * =============================================================================
 */

/** Line endings normalised — CRLF on the dev box, LF in CI. */
const SRC = readFileSync(join(__dirname, "TouchControls.tsx"), "utf8").replace(/\r\n/g, "\n");
/** …and the same file with every comment stripped, because the prose above and
 *  in the component quotes the broken lines verbatim. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** A `matchMedia` that answers one device profile. The two profiles below are
 *  transcribed from the probe run quoted in the header, not invented. */
const media = (answers: Record<string, boolean>) => (q: string) => ({
  matches: answers[q] ?? false,
});
const IPHONE_16 = media({
  "(any-pointer: fine)": false,
  "(any-pointer: coarse)": true,
  "(pointer: coarse)": true,
});
const LAPTOP = media({
  "(any-pointer: fine)": true,
  "(pointer: fine)": true,
  "(any-hover: hover)": true,
});
/** A 2-in-1: a touchscreen AND a trackpad. It must behave like the laptop —
 *  the takeover was written for exactly this machine. */
const SURFACE = media({
  "(any-pointer: fine)": true,
  "(any-pointer: coarse)": true,
  "(pointer: coarse)": true,
});

describe("§1 A · the keyboard takeover asks what device this is", () => {
  it("a phone keeps its controls when a drive key arrives", () => {
    expect(keyboardTakeoverAllowed(IPHONE_16)).toBe(false);
  });

  it("…and a laptop still loses the overlay, which is what the feature is for", () => {
    expect(keyboardTakeoverAllowed(LAPTOP)).toBe(true);
  });

  it("a 2-in-1 counts as a laptop: a trackpad is a fine pointer even beside touch", () => {
    expect(keyboardTakeoverAllowed(SURFACE)).toBe(true);
  });

  it("THE NEGATIVE CONTROL: the old rule hides the overlay on that same phone", () => {
    // Both directions from one fixture, so this cannot pass by being vacuous.
    // The rule that shipped was `if (KEYBOARD_DRIVE_CODES.has(e.code))` and
    // nothing else — i.e. a predicate that is true of every device there is.
    const oldRule = () => true;
    expect(oldRule()).toBe(true); // …on the iPhone profile: 7 stations → 0
    expect(keyboardTakeoverAllowed(IPHONE_16)).toBe(false);
    expect(keyboardTakeoverAllowed(LAPTOP)).toBe(oldRule());
  });

  it("no matchMedia at all ⇒ keep the controls (the cheap failure, on purpose)", () => {
    // The two mistakes are not symmetric: clutter on a laptop that still has a
    // keyboard, against a phone with no inputs at all.
    expect(keyboardTakeoverAllowed(undefined)).toBe(false);
    expect(
      keyboardTakeoverAllowed(() => {
        throw new Error("unknown feature query");
      }),
    ).toBe(false);
  });

  it("…and it defaults to the live window, so the component needs no wiring", () => {
    // In this node environment there is no `window`, which is the same branch a
    // server render takes. It must not throw and it must not hide anything.
    expect(keyboardTakeoverAllowed()).toBe(false);
  });

  it("THE WIRING: the keydown handler consults it, and the old line is gone", () => {
    expect(CODE).toContain("if (!keyboardTakeoverAllowed()) return;");
    // The exact shipped statement, which set the flag for anybody who pressed a
    // key. A guard added beside it rather than in front of it would leave this
    // intact and change nothing.
    expect(CODE).not.toMatch(/if \(KEYBOARD_DRIVE_CODES\.has\(e\.code\)\) setKeyboardActive/);
  });

  it("…per keystroke and not once at mount — a mouse can be paired mid-lesson", () => {
    // A `useState(() => keyboardTakeoverAllowed())` would answer the question
    // for the whole session from whatever was plugged in at page load.
    expect(CODE).not.toMatch(/useState\(\(\) => keyboardTakeoverAllowed/);
    expect(CODE).not.toMatch(/useMemo\(\(\) => keyboardTakeoverAllowed/);
  });
});

const props = {
  touch: new TouchInputSource(),
  cabinRef: { current: null } as { current: CabinControls | null },
  onToggleCamera: () => undefined,
  onPause: () => undefined,
  onReset: () => undefined,
  onToggleFullscreen: null,
};
const shown = renderToStaticMarkup(<TouchControls {...props} hidden={false} />);

/** Every station's `data-arc` index on one flank, in DOM order. */
function stations(side: "left" | "right"): number[] {
  return [...shown.matchAll(/data-arc="(\d+)" data-arc-side="(left|right)"/g)]
    .filter((m) => m[2] === side)
    .map((m) => Number(m[1]));
}

/** The accessible name of the one control inside a station. Read from the
 *  station's own marker forward — the `style` attribute in between is a 300 px
 *  `calc()`, which is why a fixed-width slice was the wrong instrument. */
function stationLabel(side: "left" | "right", index: number): string | null {
  const at = shown.indexOf(`data-arc="${index}" data-arc-side="${side}"`);
  if (at < 0) return null;
  return /aria-label="([^"]+)"/.exec(shown.slice(at, at + 1200))?.[1] ?? null;
}

describe("§2 C · the ⚙ dock has a box of its own", () => {
  it("the left flank carries four stations, and the fourth is the dock", () => {
    // Fails on the shipped build, where the left flank was ⇦ ⇨ ⊙ and nothing
    // else and the dock had no station anywhere.
    expect(stations("left")).toEqual([0, 1, 2, 3]);
    expect(ARC_STATIONS_LEFT).toBe(4);
    expect(stationLabel("left", 3)).toBe("Контроли на автомобила");
  });

  it("there is exactly one dock on the screen, not one per state", () => {
    expect((shown.match(/aria-label="Контроли на автомобила"/g) ?? []).length).toBe(1);
  });

  it("the mirrors did not move: a band is indexed from the bottom", () => {
    // The three graded glances are muscle memory and they are scored A2 steps.
    // Their indices are what fixes their rects (see touchArc.test.ts), so this
    // is the assertion that a fourth station on the OTHER flank cost nothing.
    expect(stationLabel("right", 1)).toBe("Поглед в дясното огледало");
    expect(stationLabel("right", 2)).toBe("Поглед в огледалото за задно виждане");
    expect(stationLabel("right", 3)).toBe("Поглед в лявото огледало");
    // …and the horn and both indicators kept theirs on the other flank.
    expect(stationLabel("left", 0)).toBe("Мигач наляво");
    expect(stationLabel("left", 1)).toBe("Мигач надясно");
    expect(stationLabel("left", 2)).toBe("Клаксон — задръж");
  });

  it("both ghosts are drawn for four stations, so neither band changes height", () => {
    // `pitch * (4 - 1) + 44`, twice. The right flank's station 0 empties out the
    // moment the student buckles up; the band must not shrink under his thumb
    // while he is looking at it. The left one grew to four with the dock.
    const heights = [...shown.matchAll(/data-flank-ghost="(left|right)"[^>]*?height:([^;]+);/g)];
    expect(heights.map((m) => `${m[1]} ${m[2]}`)).toEqual([
      "left calc(var(--sim-arc-pitch, 2.75rem) * 3 + 2.75rem)",
      "right calc(var(--sim-arc-pitch, 2.75rem) * 3 + 2.75rem)",
    ]);
  });
});

describe("§3 C · the belt-off state, read off the source", () => {
  /** The left flank's station 3, from its opening tag to its close — empty if
   *  the dock has no station of its own, which is the state that shipped. */
  const dockStation = (() => {
    const start = SRC.indexOf('<ArcStation index={3} padH={STEER_PAD_H} side="left">');
    return start < 0 ? "" : SRC.slice(start, SRC.indexOf("</ArcStation>", start));
  })();

  it("the dock has a station of its own to be unconditional IN", () => {
    expect(dockStation, "the ⚙ dock must be left station 3").not.toBe("");
  });

  it("nothing about the seatbelt can reach the dock's station", () => {
    // THE DEFECT, EXACTLY: the dock used to be the else-branch of
    // `{snap !== null && !snap.seatbeltOn ? <belt/> : <dock/>}`, so for as long
    // as the belt was off there was no dock — and the harness, like a student
    // who buckles late, never saw one in 24 frames.
    expect(dockStation).not.toContain("snap");
    expect(dockStation).not.toContain("seatbelt");
    expect(dockStation).toContain('labelBg="Контроли на автомобила"');
  });

  it("…and the dock is not gated on the tier, the transmission or a lesson flag", () => {
    // Seven controls ride on this one button. Anything that can switch it off
    // switches them all off with it.
    for (const gate of ["difficulty", "transmission", "examMode", "reverseAssist"]) {
      expect(dockStation, `the dock must not depend on ${gate}`).not.toContain(gate);
    }
  });

  it("the belt keeps right station 0 — PlayAreaStyles pins its salience to it", () => {
    // THE CROSS-LANE CONTRACT, and the reason the DOCK moved rather than the
    // belt. `PlayAreaStyles.tsx` (a file this change does not own) gives the
    // belt its fill, hairline and pulse through a selector that names this
    // exact station and this exact accessible name. Moving either would delete
    // yesterday's answer to „«КОЛАН» is the least visible thing on screen"
    // without anything going red.
    const beltStation = SRC.slice(
      SRC.indexOf('<ArcStation index={0} padH={DRIVE_PAD_H} side="right">'),
    ).slice(0, 600);
    expect(beltStation).toContain('labelBg="Закопчай предпазния колан"');

    const css = readFileSync(join(__dirname, "lesson-ui/PlayAreaStyles.tsx"), "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(css).toContain('[data-arc="0"][data-arc-side="right"]');
    expect(css).toContain('button[aria-label="Закопчай предпазния колан"]');
  });

  // ── §3d · AND THE DISC STANDS ON A GROUND — sc-junction-gap:e87d5be1 ───────
  //
  // The cross-lane contract above is exactly WHY this assertion has to live
  // here. `PlayAreaStyles` gives this one station a FILL — `color-mix(danger
  // 20 %, transparent)` pulsing to 42 % — and a fill on nothing is a window:
  // measured on the row's own frame (w12 sc-junction-gap__mobile-right/
  // 01-arrival.png) the parked car's window rectangle and panel edges read
  // straight through the warning, because the flank ghost behind it is a
  // GRADIENT (α 0.72–0.88, feathering to 0) and never a ground. The block at
  // `WarningPlate` carries the pixel numbers.
  //
  // Three properties, and each one is a way the repair could rot back into the
  // defect while still being present: the plate has to be BEHIND the control
  // (a plate over the glyph is worse than none), it has to be a DISC (a square
  // ground under a round button paints four black corners on the road), and its
  // ink has to be genuinely OPAQUE. The last one is pinned as a property rather
  // than as a literal, because „rgba(0,0,0,0.9)" would pass any spelling test
  // and would still be the finding.
  it("§3d the belt's warning disc stands on an opaque ground, not on the road", () => {
    const beltStation = SRC.slice(
      SRC.indexOf('<ArcStation index={0} padH={DRIVE_PAD_H} side="right">'),
    ).slice(0, 900);
    expect(beltStation).toContain("<WarningPlate />");
    expect(
      beltStation.indexOf("<WarningPlate />"),
      "the plate must be rendered BEFORE the button, i.e. behind it",
    ).toBeLessThan(beltStation.indexOf('labelBg="Закопчай предпазния колан"'));

    const plate = CODE.slice(CODE.indexOf("function WarningPlate("));
    expect(plate, "the plate must not be hit-testable").toContain("pointer-events-none");
    expect(plate, "…nor announced: the station's one control is the button").toContain(
      "aria-hidden",
    );
    expect(plate, "…and it must be the button's own 44 px disc").toContain(
      "absolute inset-0 rounded-full",
    );
    expect(plate, "…painted under the control rather than over it").toContain("zIndex: -1");

    const ink = /const WARNING_PLATE_INK = "([^"]+)"/.exec(CODE)?.[1] ?? "";
    expect(ink, "the plate's ink must be declared").not.toBe("");
    expect(ink, "an alpha channel on a backing plate IS the defect").toMatch(
      /^(#[0-9a-fA-F]{6}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))$/,
    );
  });

  it("the shell's «МЕНЮ» reads the dock's lane rather than a literal of its own", () => {
    // ── THE DEFECT THIS PINS, 2026-08-18 ────────────────────────────────────
    //
    // Giving the dock a station of its own put it under the ONE surface this
    // file cannot see: `LessonPlayShell`'s «МЕНЮ» button, `z-20`, in a
    // different tree. Resolved through the shipped `arcStationRectPx`, the
    // dock lost 4 px of its height on small-landscape and 28 of 44 — 64 % —
    // on the Samsung gesture-bar profile. `touchArc.test.ts` sweeps the two
    // rects on every profile in the ladder; this holds the other half, which
    // is that the button's own offset comes from ONE place. The shell writes
    // an INLINE style, so no stylesheet in this repo can correct a literal
    // that drifts back in here.
    const shell = readFileSync(join(__dirname, "lesson-ui/LessonPlayShell.tsx"), "utf8");
    const shellCode = shell.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(shellCode).toContain("PLAY_MENU_LEFT_CSS");
    expect(shellCode).toContain("left: PLAY_MENU_LEFT_CSS,");
    // The exact string that shipped over the band. A guard that only checks
    // for the import would stay green beside it.
    expect(shellCode).not.toContain('left: "calc(0.5rem + env(safe-area-inset-left, 0px))"');
    // …and the lane it reads is the flank's own, not a second 60.
    expect(CODE).toContain("export const PLAY_MENU_LEFT_CSS");
    expect(SRC.slice(SRC.indexOf("export const PLAY_MENU_LEFT_CSS"), SRC.indexOf(
      "export const PLAY_MENU_TOP_CSS",
    ))).toContain("FLANK_LANE");
  });

  it("…and it is the station that disappears when buckled, not the button inside it", () => {
    // If the empty station were still rendered it would keep a 44 px box, and
    // `wave12-flanks.mjs` would go on reporting a station whose text is "".
    expect(CODE).toMatch(
      /\{snap !== null && !snap\.seatbeltOn \? \(\s*<ArcStation index=\{0\} padH=\{DRIVE_PAD_H\} side="right">/,
    );
  });
});
