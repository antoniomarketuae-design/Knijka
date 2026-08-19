/**
 * THE TOAST SAYS WHEN — the glass and the debrief anchor one fault the same way.
 *
 * THE FRAME THIS FILE IS WRITTEN AGAINST, and it is a photograph rather than a
 * hypothesis: `.audit-frames/sweep161/sc-junction-stop/pc-wrong/04-t099s.png`,
 * the deployed build in Chromium at 1440 × 900. `HudToasts`' own violation card
 * is painted whole — «ВТОРОСТЕПЕННА · −1 изпитна т. · Превишена скорост ·
 * Движеше се над разрешената скорост… · ЗДвП чл. 21, ал. 1» — and the
 * instrument cluster directly beneath it reads **33 км/ч** under a posted 40.
 *
 * The card carried no moment, so the frame supports two readings and the
 * student is handed both:
 *
 *   · a RECORD of an offence several seconds old — in which case the card taught
 *     him nothing about the 33 he is doing now; or
 *   · a LIVE conviction at 33 under 40 — a FALSE FAILURE, the founder's own
 *     roundabout complaint pointing at a different rule.
 *
 * `sc-sp-curve/mobile-wrong/04-t030s.png` is the same card at 18 км/ч under a
 * posted 90, six seconds after a 96 in the open field.
 *
 * `FaultCard` — the SAME fault, the same authored sentence, three minutes later
 * on the result screen — has always ended its row with «в 1:39». So the two
 * surfaces of this product said different amounts of true about one event, and
 * the transient one said less. That is what these assertions close.
 *
 * WHAT IS PROVED HERE, AND IN WHICH ORDER:
 *   1. the vocabulary (`toastAgeBg`) — by MUTATION, i.e. every assertion is
 *      paired with the input that must make it fail;
 *   2. that the age is really MOUNTED — the rendered markup of the real
 *      `HudToasts`, not the helper in isolation. A green unit beside an unwired
 *      screen is this directory's own signature failure
 *      (`fault-card-ledger-close.test.tsx`'s header states it);
 *   3. BOTH DIRECTIONS — an unstamped card must print NO age. A false anchor on
 *      a verdict is the same crime as a missing one, so „when in doubt, say
 *      nothing" is asserted as hard as „when known, say it".
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HudEvent } from "../../contracts";
import { makeViolation } from "../../rules";
import { FaultCard } from "../FaultCard";
import {
  HudToasts,
  TOAST_AGE_NOW_MAX_MS,
  toastAgeBg,
  toastCarriesAge,
  stampToasts,
  type HudToast,
} from "../HudToasts";

/** Markup with tags stripped — what a reader actually reads. */
function textOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** The card in the frame: ЗДвП чл. 21, ал. 1, второстепенна, −1 изпитна т. */
const SPEEDING: HudEvent = {
  kind: "violation",
  titleBg: "Превишена скорост",
  explanationBg:
    "Движеше се над разрешената скорост. Ограничението е таван, не цел — дръж скоростта под него, особено там, където има пешеходци.",
  points: 1,
  severity: "vtorostepenna",
  lawRef: "ЗДвП чл. 21, ал. 1",
};

/**
 * The column as the shell mounts it, rendered `ageMs` after the fault was
 * raised. `HudToasts` reads `Date.now()` itself — there is no test seam and
 * deliberately so: a `nowMs` prop would let this file pass over a component
 * that had stopped reading any clock at all.
 */
function columnText(toasts: HudToast[], quiet = false): string {
  return textOf(<HudToasts toasts={toasts} quiet={quiet} onDismiss={() => {}} />);
}

function raisedAgo(event: HudEvent, ageMs: number, id = 1): HudToast {
  return { id, event, raisedAtMs: Date.now() - ageMs };
}

describe("toastAgeBg — the vocabulary, each assertion paired with what breaks it", () => {
  it("an eight-second-old card says so, and a three-second-old one says something ELSE", () => {
    // The pair is the mutation guard. A helper that returned a constant — or
    // that had stopped reading `nowMs` at all — satisfies either line alone and
    // cannot satisfy both, because they must DIFFER.
    expect(toastAgeBg(0, 8000)).toBe("преди 8 с");
    expect(toastAgeBg(0, 3000)).toBe("преди 3 с");
    expect(toastAgeBg(0, 8000)).not.toBe(toastAgeBg(0, 3000));
  });

  it("the moment it happens it says «сега» — not «преди 0 с»", () => {
    expect(toastAgeBg(0, 0)).toBe("сега");
    expect(toastAgeBg(0, TOAST_AGE_NOW_MAX_MS - 1)).toBe("сега");
    // …and the boundary really is a boundary: one millisecond later it is not.
    expect(toastAgeBg(0, TOAST_AGE_NOW_MAX_MS)).toBe("преди 2 с");
  });

  it("the printed figure is the TRUE age, to within half a second, across the card's whole life", () => {
    // ⚠ THE ASSERTION THAT USED TO STAND HERE WAS A TAUTOLOGY, and the mutation
    // run said so. It swept the range and asserted that the first printed
    // figure was `TOAST_AGE_NOW_MAX_MS / 1000` — reading the same constant the
    // code reads, so moving the constant moved the expectation with it and the
    // mutation SURVIVED. „A test that passes equally before and after guards
    // nothing"; that one guarded the threshold's own definition.
    //
    // What actually matters about this string is that it is not WRONG: an
    // anchor on a verdict that overstates the age by a second is the same class
    // of defect as no anchor, one step smaller. So the property is accuracy,
    // stated against real arithmetic rather than against the constant —
    // `Math.ceil`, `Math.floor`, a /100 or a /1000 dropped all fail here.
    for (let ms = 0; ms <= 12_000; ms += 37) {
      const out = toastAgeBg(0, ms);
      expect(out).toMatch(/^(сега|преди \d+ с)$/);
      if (out === "сега") {
        // «сега» is only honest while the event really is the present.
        expect(ms).toBeLessThan(TOAST_AGE_NOW_MAX_MS);
        continue;
      }
      const printedMs = Number(out.replace(/\D+/g, "")) * 1000;
      expect(Math.abs(printedMs - ms)).toBeLessThanOrEqual(500);
    }
  });

  it("a clock that goes backwards yields «сега», never a future age", () => {
    // A system-time change mid-drive. The anchor may be uninformative; it may
    // not be wrong. `nowMs - raisedAtMs` with the operands swapped fails here.
    expect(toastAgeBg(9000, 1000)).toBe("сега");
    expect(toastAgeBg(0, Number.NaN)).toBe("сега");
  });

  it("only the two TEACHING kinds carry a moment", () => {
    expect(toastCarriesAge("violation")).toBe(true);
    expect(toastCarriesAge("lesson")).toBe(true);
    // „Браво" is a 4 s pat on the back with no verdict to date. A predicate that
    // had been loosened into „everything" fails on this line.
    expect(toastCarriesAge("commendation")).toBe(false);
    expect(toastCarriesAge("objectiveComplete")).toBe(false);
  });
});

describe("stampToasts — the one construction path", () => {
  it("stamps every card of a batch with one moment and consecutive ids", () => {
    const out = stampToasts([SPEEDING, { kind: "commendation", titleBg: "Браво" }], 7, 1234);
    expect(out.map((t) => t.id)).toEqual([7, 8]);
    expect(out.map((t) => t.raisedAtMs)).toEqual([1234, 1234]);
  });

  it("`push` builds its cards through it — the stamp cannot be lost to a second path", () => {
    // The hook cannot be invoked without a DOM (this suite is `environment:
    // "node"`), so the wiring is read off the source. Narrow on purpose: it
    // asserts the ONLY thing that could silently drop the anchor from every
    // shipped card, which is `push` going back to a bare object literal.
    const src = readFileSync(resolve(__dirname, "../HudToasts.tsx"), "utf8");
    const push = src.slice(src.indexOf("const push = useCallback"), src.indexOf("const dismiss"));
    expect(push).toContain("stampToasts(events, nextId.current, Date.now())");
    expect(push).not.toMatch(/\{\s*id:\s*nextId\.current\+\+,\s*event\s*\}/);
  });
});

describe("the mounted column, not the helper", () => {
  it("a card raised eight seconds ago prints its age ON SCREEN", () => {
    // The whole point of this case: `HudToasts` is the component the shell
    // mounts, rendered here exactly as `LessonPlayShell` renders it.
    const out = columnText([raisedAgo(SPEEDING, 8000)]);
    expect(out).toContain("Превишена скорост");
    expect(out).toContain("преди 8 с");
    // …and the citation it now shares a row with was not displaced by it.
    expect(out).toContain("ЗДвП чл. 21, ал. 1");
  });

  it("a fault raised THIS INSTANT reads «сега» on the same screen", () => {
    const out = columnText([raisedAgo(SPEEDING, 0)]);
    expect(out).toContain("сега");
    expect(out).not.toMatch(/преди \d+ с/);
  });

  it("the printed age tracks the card's real age — two ages, two strings", () => {
    // The render-level twin of the mutation pair above. A component that
    // painted a hard-coded «сега» passes the previous case and fails this one.
    expect(columnText([raisedAgo(SPEEDING, 5000)])).toContain("преди 5 с");
    expect(columnText([raisedAgo(SPEEDING, 9000)])).toContain("преди 9 с");
  });

  it("a «Научи» card is dated too — that is where the live-tense sentence was", () => {
    // `sc-merge-from-property/mobile-right/05-stopped.png`: «…а в момента караш
    // 16 км/ч» with the cluster at 0 км/ч. The sentence is `lessons/engine.ts`'s
    // to repair; the card at least stops presenting it as the present.
    const teach: HudEvent = {
      kind: "lesson",
      titleBg: "Стигна точката, но твърде бързо",
      explanationBg: "Задачата иска да си тук с не повече от 5 км/ч, а в момента караш 16 км/ч.",
      lawRef: "ЗДвП чл. 20, ал. 2",
    };
    expect(columnText([raisedAgo(teach, 6000)])).toContain("преди 6 с");
  });

  it("praise is NOT dated — the slot is spent only where there is a verdict", () => {
    const out = columnText([raisedAgo({ kind: "commendation", titleBg: "Браво" }, 3000)]);
    expect(out).toContain("Браво");
    expect(out).not.toMatch(/преди \d+ с/);
    expect(out).not.toContain("сега");
  });
});

describe("THE OTHER DIRECTION — an unstamped card may not invent a moment", () => {
  it("prints no age at all rather than «сега»", () => {
    // `app/dev/popup-rig` builds `HudToast` literals by hand and carries no
    // stamp. „сега" there would be a fabricated anchor on a verdict — the same
    // failure mode as a fabricated figure, which this product has shipped twice.
    const out = columnText([{ id: 1, event: SPEEDING }]);
    expect(out).toContain("Превишена скорост");
    expect(out).not.toContain("сега");
    expect(out).not.toMatch(/преди \d+ с/);
    // Everything else on the card is untouched — the blank costs no teaching.
    expect(out).toContain("Ограничението е таван");
    expect(out).toContain("ЗДвП чл. 21, ал. 1");
  });

  it("one stamped and one unstamped card on one screen: exactly one age", () => {
    // The pair rules out the lazy repair of dating every card off render time,
    // which would put a confident «сега» on the row that knows nothing.
    const out = columnText([raisedAgo(SPEEDING, 7000, 1), { id: 2, event: SPEEDING }]);
    expect(out.match(/преди \d+ с/g)).toEqual(["преди 7 с"]);
    expect(out).not.toContain("сега");
  });
});

describe("THE SURFACE THAT MOUNTS IT — the half this directory has got wrong before", () => {
  it("the shell feeds `HudToasts` the queue's own stamped cards, unmapped", () => {
    // `FaultCard` gained `examBilled`, its unit tests went green, and
    // `SessionEndScreen` never passed the prop — so the screen printed the wrong
    // number for another day (see that file's header). The equivalent failure
    // here is `LessonPlayShell` building its own toast objects, or re-mapping
    // them through a shape that drops `raisedAtMs`, both of which are invisible
    // from inside this module. So the mount is read.
    const shell = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
      "utf8",
    );
    // One queue, and it is this module's.
    expect(shell).toContain("useHudToastQueue()");
    expect(shell).toMatch(/const\s*\{\s*toasts,\s*push,\s*dismiss,\s*clear\s*\}\s*=\s*useHudToastQueue\(\)/);
    // …handed to the column as-is. `toasts={toasts}` and not `toasts={…map(…)}`.
    const MOUNT = /<HudToasts\s+toasts=\{toasts\}/;
    expect(shell).toMatch(MOUNT);

    // ── AND THE SCAN PROVES ITSELF ───────────────────────────────────────
    // A `toContain` over a 4 000-line file is the cheapest way in this repo to
    // write an assertion that cannot fail. So the regression is applied to a
    // COPY here and the check is required to miss it: the exact re-map that
    // would drop the stamp on its way to the column.
    //
    // (Written with a literal `\n` anchor first, and this very line caught it:
    // the file is CRLF on this box, the replace was a no-op and the "proof"
    // would have proved nothing. Hence the newline-agnostic pattern.)
    const regressed = shell.replace(
      /<HudToasts(\s+)toasts=\{toasts\}/,
      "<HudToasts$1toasts={toasts.map((t) => ({ id: t.id, event: t.event }))}",
    );
    expect(regressed).not.toBe(shell); // the anchor still exists to be broken
    expect(MOUNT.test(regressed)).toBe(false);
  });

  it("THE PHONE IS NOT COVERED, and that is recorded rather than implied", () => {
    // `compact ? null : <HudToasts …>` — the roomy leg only. On a phone the
    // shell re-maps every toast into a `SimOverlayItem` for `SimOverlay`
    // (`id`, `kind`, `tone`, `chipBg`, `lineBg`, `detailBg`, `lawRef`), and that
    // shape carries no moment, so `sc-sp-curve/mobile-wrong/04-t030s.png` and
    // `sc-merge-from-property/mobile-right/05-stopped.png` are NOT closed by
    // this row. Asserted so the gap cannot be mistaken for a fix, and so that
    // whoever adds the field to `SimOverlayItem` is told this file wants it.
    const shell = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
      "utf8",
    );
    expect(shell).toMatch(/compact \? null : \(/);
    const mapped = shell.slice(shell.indexOf("...(!ended"), shell.indexOf("...(!ended") + 1400);
    expect(mapped).toContain('kind: "violation"');
    expect(mapped).not.toContain("raisedAtMs");
  });
});

describe("the glass and the debrief anchor the same fault", () => {
  it("both surfaces carry a moment for one event — the toast used to carry none", () => {
    // The lane in one assertion. `SessionEndScreen` renders `FaultCard` with
    // `atBg` (the session clock); the live column renders the same fault with
    // its own age. Neither is now a bare verdict floating free of a time.
    const glass = columnText([raisedAgo(SPEEDING, 8000)]);
    const debrief = textOf(
      <FaultCard
        event={makeViolation("SPEEDING_OVER_LIMIT", 99)}
        correctiveBg={null}
        atBg="1:39"
      />,
    );
    expect(debrief).toContain("в 1:39");
    expect(glass).toMatch(/преди \d+ с/);
    // …and the fault is the same fault on both, so the two rows are comparable
    // at all: the authored title the catalogue gives this code.
    expect(debrief).toContain("Превишена скорост");
    expect(glass).toContain("Превишена скорост");
  });
});
