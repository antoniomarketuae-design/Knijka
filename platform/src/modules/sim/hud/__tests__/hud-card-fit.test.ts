import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hudCardFitsViewport,
  hudCardMaxWidthPx,
  hudCardRenderedWidthPx,
  FOUNDER_VIEWPORT_PX,
  HUD_CARD_MAX_WIDTH_CLASS,
  HUD_CARD_SIDE_GUTTER_PX,
  NARROWEST_VIEWPORT_PX,
  TOAST_CARD_WIDTH_CLASS,
  TOAST_CARD_WIDTH_PX,
} from "../hudPreferences";

/**
 * =============================================================================
 * „NO CARD MAY BE WIDER THAN THE PHONE IT IS ON."
 *
 * THE EVIDENCE THIS FILE EXISTS FOR is a photograph, not a hypothesis:
 * `C:\Users\Ljh\Desktop\For fix\photo_2026-07-29_08-22-13 (2).jpg`. A violation
 * card on a 393 px iPhone, anchored to the right edge and running off the left
 * one. Read straight off the pixels:
 *
 *     «АСНА ГРЕШКА»                      ← «ОПАСНА ГРЕШКА», first two letters cut
 *     «ътнотранспортно произшествие»     ← «Пътнотранспортно…»
 *     «астъпи сблъсък. На реалния…»      ← «Настъпи сблъсък…»
 *     «о сесията се оценява като…»       ← «…но сесията…»
 *
 * The teach card behind it is cut the same way. The stage the HUD is painted on
 * carries `overflow-hidden` (LessonPlayShell), so an over-wide card produces no
 * scrollbar and no wrap — it is simply amputated, and the student never learns
 * that anything was there. **A student cannot read the rule he broke.**
 *
 * WHY NO EXISTING TEST CAUGHT IT. Every row of doc 87 asks whether a thing is
 * COVERED — does the lesson teach it, does the fault fire, is the WHY authored.
 * Nothing in the suite asked whether the authored WHY physically fits on the
 * screen it is printed on, and the layout numbers looked fine on their own
 * (240 px card, 393 px phone). That is precisely the shape of failure this wave
 * exists to stop: a green assertion is not evidence.
 *
 * WHAT THIS FILE ASSERTS, in the order the failure happens:
 *   1. the arithmetic — every declared card width fits the NARROWEST device,
 *      not merely the founder's;
 *   2. the clamp is really on the components (source scan), so the arithmetic
 *      is describing the shipped DOM and not a parallel universe;
 *   3. NOBODY MAY ADD A NEW OVER-WIDE CARD — the scan walks every HUD and
 *      lesson-UI surface and fails on any fixed width that cannot fit 320 px,
 *      unless that element also carries a viewport clamp.
 *
 * (3) is the part that makes the failure CATCHABLE instead of photographable.
 * =============================================================================
 */

const HUD_DIR = resolve(__dirname, "..");
const LESSON_UI_DIR = resolve(__dirname, "../../../../components/sim/lesson-ui");

/** Tailwind's spacing scale: `w-N` is N × 0.25rem at the 16 px root. */
const TAILWIND_STEP_PX = 4;

/**
 * A width declaration found in a source file: which file, which line, how many
 * px it asks for, and whether the SAME element also carries a viewport clamp.
 */
interface WidthDecl {
  file: string;
  line: number;
  token: string;
  px: number;
  clamped: boolean;
  text: string;
}

/**
 * `w-…` only — never `max-w-…` (that IS the clamp) and never `min-w-…` (a floor
 * behaves differently: it is the CONTENT that then decides the width, and the
 * clamp above it is what has to hold. `min-w-64` on the objective banner is the
 * live example, and it is listed in the report rather than silently accepted).
 * The character class before `w-` rejects both prefixes because `-` is not in
 * it, while allowing a Tailwind variant (`sm:w-96`).
 */
const WIDTH_TOKEN = /(?:^|[\s"'`:{(])w-(\d+(?:\.\d+)?|\[[^\]\s]+\])/g;

/** `max-w-[… vw …]` / `max-w-[…100vw…]` — a cap expressed against the SCREEN. */
const VIEWPORT_CLAMP = /max-w-\[[^\]]*vw[^\]]*\]/;

/** …and the percentage form, which is a cap against the stage, also acceptable. */
const CONTAINER_CLAMP = /max-w-(?:full|\[\d+%\])/;

function pxFromToken(token: string): number | null {
  if (!token.startsWith("[")) {
    const n = Number(token);
    return Number.isFinite(n) ? n * TAILWIND_STEP_PX : null;
  }
  const body = token.slice(1, -1);
  const px = /^(\d+(?:\.\d+)?)px$/.exec(body);
  if (px) return Number(px[1]);
  const rem = /^(\d+(?:\.\d+)?)rem$/.exec(body);
  if (rem) return Number(rem[1]) * 16;
  // calc()/min()/clamp() with a vw term is self-limiting by construction.
  return null;
}

/**
 * Blank out every comment while KEEPING the line numbering, so a `w-80` written
 * in prose (this file's own subject matter is width classes — the comments are
 * full of them) can never be reported as a shipped declaration. Newlines are
 * preserved inside block comments for exactly that reason.
 */
function stripComments(source: string): string {
  const blanked = source.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  return blanked
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

function scanSource(file: string, source: string): WidthDecl[] {
  const out: WidthDecl[] = [];
  stripComments(source)
    .split(/\r?\n/)
    .forEach((lineText, i) => {
      for (const m of lineText.matchAll(WIDTH_TOKEN)) {
        const px = pxFromToken(m[1]);
        if (px === null) continue;
        out.push({
          file,
          line: i + 1,
          token: `w-${m[1]}`,
          px,
          clamped: VIEWPORT_CLAMP.test(lineText) || CONTAINER_CLAMP.test(lineText),
          text: lineText.trim().slice(0, 120),
        });
      }
    });
  return out;
}

function scan(dir: string): WidthDecl[] {
  const out: WidthDecl[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".tsx")) continue;
    out.push(...scanSource(name, readFileSync(resolve(dir, name), "utf8")));
  }
  return out;
}

/** Over-wide and unclamped, per `NARROWEST_VIEWPORT_PX`. */
function offendersIn(decls: readonly WidthDecl[], viewportPx: number): WidthDecl[] {
  const budget = hudCardMaxWidthPx(viewportPx);
  return decls.filter((d) => d.px > budget && !d.clamped);
}

describe("the viewport clamp — arithmetic", () => {
  it("keeps 12 px of gutter on each side of the screen", () => {
    expect(HUD_CARD_SIDE_GUTTER_PX).toBe(12);
    expect(hudCardMaxWidthPx(FOUNDER_VIEWPORT_PX)).toBe(369);
    expect(hudCardMaxWidthPx(NARROWEST_VIEWPORT_PX)).toBe(296);
  });

  it("the toast card fits every device on the ladder, narrowest first", () => {
    // The ladder the mobile lane already measures against (immersive.ts's own
    // device list) plus the founder's 393.
    for (const viewport of [320, 360, 375, 390, 393, 430, 448, 640, 641, 1280]) {
      expect(hudCardFitsViewport(TOAST_CARD_WIDTH_PX, viewport)).toBe(true);
    }
  });

  it("shrinks rather than overflows on a viewport too narrow for the card", () => {
    // Below 264 px the declaration cannot be honoured. The clamp is what decides
    // whether that reads as a narrower card or as the founder's amputated one.
    expect(hudCardRenderedWidthPx(TOAST_CARD_WIDTH_PX, 240)).toBe(216);
    expect(hudCardRenderedWidthPx(TOAST_CARD_WIDTH_PX, 393)).toBe(240);
  });

  it("names the exact frame the photograph was taken on", () => {
    expect(FOUNDER_VIEWPORT_PX).toBe(393);
    expect(NARROWEST_VIEWPORT_PX).toBe(320);
  });
});

describe("the viewport clamp — it is really on the components", () => {
  it("the toast card carries the clamp AND a word-break", () => {
    const classes = TOAST_CARD_WIDTH_CLASS.split(/\s+/);
    expect(classes).toContain("w-60");
    expect(classes).toContain(HUD_CARD_MAX_WIDTH_CLASS);
    // «Пътнотранспортно» is one unbreakable 16-letter word. Without this it
    // overhangs a 216 px content box and the stage cuts it — the box fitting is
    // not the same thing as the words fitting, and the photo needed both.
    expect(classes).toContain("break-words");
    expect(VIEWPORT_CLAMP.test(TOAST_CARD_WIDTH_CLASS)).toBe(true);
  });

  it("HudToasts still takes its width from the pure module", () => {
    // If this stops being true the clamp above is decorative.
    const toasts = readFileSync(resolve(HUD_DIR, "HudToasts.tsx"), "utf8");
    expect(toasts).toMatch(/\$\{TOAST_CARD_WIDTH_CLASS\}/);
  });

  it("both clamp utilities are reachable from a .tsx, not only from a .ts", () => {
    // A Tailwind utility only exists if the v4 source scan found the literal.
    // Both of these are written in `hudPreferences.ts`; this lane could not
    // render on this box to prove the scan reaches .ts files, so each one is
    // ALSO present in a component, where the scan is beyond doubt. The day that
    // stops being true the clamp becomes a comment, silently — which is the
    // precise failure this wave exists to stop.
    const tsx = [
      readFileSync(resolve(HUD_DIR, "PreDriveChecklist.tsx"), "utf8"),
      readFileSync(
        resolve(HUD_DIR, "../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
        "utf8",
      ),
    ].join("\n");
    expect(tsx).toContain(HUD_CARD_MAX_WIDTH_CLASS);
    expect(tsx).toMatch(/\bbreak-words\b/);
  });

  it("the top-centre objective stack keeps a cap on its shrink-to-fit width", () => {
    // `absolute left-1/2 … -translate-x-1/2` with no cap is shrink-to-fit
    // against HALF the stage, so a child whose min-content exceeds that makes
    // the box wider than its own containing block — and a CENTRED box then
    // hangs off both edges at once, which is the two-sided clipping visible on
    // the founder's teach card. Defensive: today's content measures ~296 px, so
    // this asserts the shape stays bounded, not that a bug is being repaired.
    const shell = stripComments(
      readFileSync(
        resolve(HUD_DIR, "../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
        "utf8",
      ),
    );
    const line = shell.split(/\r?\n/).find((l) => /left-1\/2 top-3 flex/.test(l));
    expect(line, "the objective-stack container moved — re-anchor this test").toBeDefined();
    expect(VIEWPORT_CLAMP.test(line ?? "")).toBe(true);
  });

  it("the pre-drive checklist — 320 px wide, i.e. a whole iPhone SE — is clamped", () => {
    const source = stripComments(
      readFileSync(resolve(HUD_DIR, "PreDriveChecklist.tsx"), "utf8"),
    );
    const card = source.split(/\r?\n/).find((l) => /\bw-80\b/.test(l));
    expect(card).toBeDefined();
    expect(VIEWPORT_CLAMP.test(card ?? "")).toBe(true);
  });
});

describe("no new card may be wider than the narrowest phone", () => {
  const decls = [...scan(HUD_DIR), ...scan(LESSON_UI_DIR)];

  it("finds width declarations at all (the scan is not silently empty)", () => {
    expect(decls.length).toBeGreaterThan(20);
  });

  // THE DETECTOR HAS TEETH — proved here, not assumed. A guard that cannot be
  // shown to fail is the same green-assertion-as-evidence this wave exists to
  // end, so the over-wide card and its clamped twin are both fed through the
  // real scanner. If the regex, the px conversion or the clamp match ever rots,
  // THIS test goes red before the silent one does.
  it("flags an over-wide card, and clears the same card once it is clamped", () => {
    const bad = `<div className="absolute right-3 top-3 w-96 rounded-2xl p-3">`;
    const good = `<div className="absolute right-3 top-3 w-96 max-w-[calc(100vw-1.5rem)] p-3">`;
    expect(offendersIn(scanSource("synthetic.tsx", bad), NARROWEST_VIEWPORT_PX)).toHaveLength(1);
    expect(scanSource("synthetic.tsx", bad)[0].px).toBe(384);
    expect(offendersIn(scanSource("synthetic.tsx", good), NARROWEST_VIEWPORT_PX)).toEqual([]);
    // …and a width written in prose is never mistaken for a shipped one.
    expect(scanSource("synthetic.tsx", `// the card was w-96 before the fix`)).toEqual([]);
  });

  it("every fixed width either fits 320 px or is clamped to the viewport", () => {
    // The message is the point: whoever trips this must SEE which element, at
    // which width, on which line — and be told the one fix that resolves it.
    expect(
      offendersIn(decls, NARROWEST_VIEWPORT_PX).map(
        (o) => `${o.file}:${o.line} ${o.token} = ${o.px}px — ${o.text}`,
      ),
    ).toEqual([]);
  });

  it("…and at the founder's own 393 px, with the same answer", () => {
    expect(
      offendersIn(decls, FOUNDER_VIEWPORT_PX).map(
        (o) => `${o.file}:${o.line} ${o.token} = ${o.px}px`,
      ),
    ).toEqual([]);
  });
});

/**
 * =============================================================================
 * THE HOLE THE CLASS SCANNER CANNOT SEE — 2026-08-03.
 *
 * Everything above reads Tailwind CLASSES. A width written as an inline style
 * walks straight past it:
 *
 *     <div style={{ width: 420 }}>            // 420 px on a 393 px phone
 *     <div style={{ minWidth: "26rem" }}>     // 416 px, and min-width cannot
 *                                             // be talked down by a max-width
 *
 * Both forms are already used in this tree for legitimate things — the overlay
 * peek sets `height`, the shell sets `maxWidth` — so the door is open and only
 * the convention was holding it. `min-width` is the worse of the two: a
 * `max-width` clamp beside it LOSES, because CSS resolves min-width last, so
 * the very fix the file above prescribes would not work.
 *
 * This is not a hypothetical. Doc 89 §3's card was clipped on BOTH edges at
 * once, which a right-anchored 240 px card cannot do — something was making it
 * wider than the stage, and „no `w-` class declares it" was never proof.
 * =============================================================================
 */

/** `width: 420` / `width: "26rem"` / `minWidth: "20rem"` in a style object. */
const INLINE_WIDTH = /\b(width|minWidth)\s*:\s*(?:"([^"]+)"|'([^']+)'|(\d+(?:\.\d+)?))/g;

interface InlineDecl {
  file: string;
  line: number;
  prop: string;
  raw: string;
  px: number | null;
}

function pxFromCssValue(value: string): number | null {
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v); // React numbers are px
  const px = /^(\d+(?:\.\d+)?)px$/.exec(v);
  if (px) return Number(px[1]);
  const rem = /^(\d+(?:\.\d+)?)rem$/.exec(v);
  if (rem) return Number(rem[1]) * 16;
  // %, vw, calc(), min(), a template expression — self-limiting or unknowable
  // from source. Not this test's business; the class scan and the runtime
  // measurement cover those.
  return null;
}

function scanInline(file: string, source: string): InlineDecl[] {
  const out: InlineDecl[] = [];
  stripComments(source)
    .split(/\r?\n/)
    .forEach((lineText, i) => {
      for (const m of lineText.matchAll(INLINE_WIDTH)) {
        const raw = m[2] ?? m[3] ?? m[4] ?? "";
        out.push({ file, line: i + 1, prop: m[1], raw, px: pxFromCssValue(raw) });
      }
    });
  return out;
}

function scanInlineDir(dir: string): InlineDecl[] {
  const out: InlineDecl[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".tsx")) continue;
    out.push(...scanInline(name, readFileSync(resolve(dir, name), "utf8")));
  }
  return out;
}

describe("no card may be sized past the phone by an INLINE style either", () => {
  const inline = [...scanInlineDir(HUD_DIR), ...scanInlineDir(LESSON_UI_DIR)];

  it("the inline detector has teeth", () => {
    const bad = `<div style={{ width: 420 }}>`;
    const badRem = `<section style={{ minWidth: "26rem" }}>`;
    const okVw = `<div style={{ width: "calc(100vw - 1.5rem)" }}>`;
    expect(scanInline("s.tsx", bad)[0]?.px).toBe(420);
    expect(scanInline("s.tsx", badRem)[0]?.px).toBe(416);
    expect(scanInline("s.tsx", okVw)[0]?.px).toBeNull();
    // and prose about a width is still never a shipped width
    expect(scanInline("s.tsx", `// it used to be width: 420`)).toEqual([]);
  });

  it("every inline width in the drive HUD fits the narrowest phone", () => {
    const offenders = inline.filter(
      (d) => d.px !== null && d.px > hudCardMaxWidthPx(NARROWEST_VIEWPORT_PX),
    );
    expect(
      offenders.map((o) => `${o.file}:${o.line} ${o.prop}: ${o.raw} (${o.px}px)`),
      "An inline width larger than a 320 px phone can hold. Use the class " +
        "clamp (HUD_CARD_MAX_WIDTH_CLASS) instead — and never min-width, which " +
        "CSS resolves AFTER max-width, so a clamp beside it does nothing.",
    ).toEqual([]);
  });

  it("nothing in the drive HUD pins a min-width in absolute units", () => {
    // Even a SMALL one: min-width is the single declaration a viewport clamp
    // cannot override, so the rule is „not in this layer at all", not „keep it
    // under 296 px". (Tailwind's `min-w-11` touch targets are a class, are
    // 44 px, and are deliberately outside this scan — see WIDTH_TOKEN.)
    const pinned = inline.filter((d) => d.prop === "minWidth" && d.px !== null);
    expect(pinned.map((o) => `${o.file}:${o.line} minWidth: ${o.raw}`)).toEqual([]);
  });
});
