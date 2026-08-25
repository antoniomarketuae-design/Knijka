/**
 * THE KEY LEGEND'S ROWS — THE TWO THINGS THE SWEEP PHOTOGRAPHED, AND THE ONE
 * IT COULD NOT SEE.
 *
 * Catalogue sweep 2026-08-17, `[data-hud="controls-help"]` (the «⌨ Клавиши ·
 * за напреднали» sheet in `LessonScene.tsx`):
 *
 *   sc-follow-distance/pc-right/04-t012s.png — the gear row laid out as
 *     «скорости: към P / към» with an orphaned «D» alone on the next line, in
 *     ghost type over a building, 12 s into a graded drive.
 *   sc-junction-rhr/pc-right/01-arrival.png — the same panel open before the
 *     student has touched anything, four of eleven essential rows visible.
 *
 * The first is fixed by binding each gear letter to its «към» with U+00A0, and
 * until this file NOTHING asserted that: the escape could be reverted to a
 * plain space and every test in the repo would still be green.
 *
 * THE ONE THE SWEEP COULD NOT SEE is the reason this file renders rather than
 * greps. The row list was keyed `key={row.keys}`, and on an EXAM rung
 * (`reverseAssistEnabled === false`, i.e. `lesson.examMode` — 162 of the 808
 * compiled rungs, measured 2026-08-18, and every one of them a level-4 rung)
 * the reverse row stops being «S / ↓» and becomes a SECOND «[ ]» row beside the
 * gear row — two children of one list with the identical React key, on every
 * rung a student sits as an exam. A screenshot cannot show that; it
 * shows up later, as the wrong sentence printed against a key cap after any
 * re-render that changes the row set («Всички клавиши», or K, whose row prints
 * its own live state).
 *
 * WHY THE GUARDS ARE HERE AND NOT BESIDE `controlsLegendLifetime.ts`. That
 * file's own wiring tests are `expect(SCENE).toContain(…)` over LessonScene's
 * source — the device this repo has already been caught by, because a string
 * that is present proves nothing about a component that renders. `ControlsHelp`
 * is a leaf: no canvas, no physics, no world. A server render is enough, and a
 * server render is evidence.
 *
 * WHAT A SERVER RENDER STILL CANNOT PROVE, stated so nobody reads more into
 * this file than is in it: `renderToStaticMarkup` does not reconcile, so React
 * emits no duplicate-key warning during it (measured — the probe that asked
 * captured zero `console.error` calls for a list with two `key="a"` children).
 * The rendered rows therefore carry `data-row={row.id}` and this file asserts
 * on THAT; the `key` expression beside it is guarded by the uniqueness of the
 * ids themselves, which is what makes any key choice over them safe.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ControlsHelp, controlsHelpRows } from "../LessonScene";

/** U+00A0. Named and written as an ESCAPE, because the whole point of the
 *  row it guards is that the two spellings of a space are indistinguishable
 *  in a source file — a literal glyph here would be a test nobody can read
 *  and a diff nobody can review. */
const NBSP = "\u00a0";

/** The eight flag combinations the panel actually ships in. */
const COMBINATIONS = [false, true].flatMap((topdownAllowed) =>
  [false, true].flatMap((reverseAssistEnabled) =>
    [false, true].map((reverseViewOn) => ({
      topdownAllowed,
      reverseAssistEnabled,
      reverseViewOn,
    })),
  ),
);

function label(c: (typeof COMBINATIONS)[number]): string {
  return `topdown=${c.topdownAllowed} assist=${c.reverseAssistEnabled} revView=${c.reverseViewOn}`;
}

/** Every `data-row` in a rendered sheet, in document order. */
function renderedRowIds(markup: string): string[] {
  return [...markup.matchAll(/data-row="([^"]*)"/g)].map((m) => m[1]);
}

describe("row identity — the exam rung's two «[ ]» rows", () => {
  it("no two rows share an id, in any of the eight combinations", () => {
    for (const c of COMBINATIONS) {
      const ids = controlsHelpRows(c).map((r) => r.id);
      expect(new Set(ids).size, `${label(c)} · ids ${ids.join(",")}`).toBe(ids.length);
      // …and nothing may be anonymous either: an empty id is a duplicate the
      // moment a second one appears.
      expect(ids.every((id) => id.length > 0), label(c)).toBe(true);
    }
  });

  it("…and the KEY CAPS do collide, which is why identity is not the cap", () => {
    // THE ROW THAT MAKES THE ONE ABOVE MEAN SOMETHING. If the caps were unique
    // the fix would be pointless and this file would be ceremony. They are not:
    // on an exam rung the reverse row IS «[ ]», the same cap the gear row
    // carries, because on an exam reverse is selected with the lever.
    const exam = controlsHelpRows({
      topdownAllowed: true,
      reverseAssistEnabled: false,
      reverseViewOn: false,
    }).map((r) => r.keys);
    expect(exam.filter((k) => k === "[ ]")).toHaveLength(2);
    expect(new Set(exam).size).toBeLessThan(exam.length);

    // …and OFF an exam they do not, which is why the defect was invisible on
    // every non-exam rung the sweep drove.
    const practice = controlsHelpRows({
      topdownAllowed: true,
      reverseAssistEnabled: true,
      reverseViewOn: false,
    }).map((r) => r.keys);
    expect(practice.filter((k) => k === "[ ]")).toHaveLength(1);
    expect(new Set(practice).size).toBe(practice.length);
  });

  it("the two spellings of the reverse row are ONE slot, not two rows", () => {
    // The exam sentence must occupy the same slot the gesture sentence does —
    // borrowing the gear row's identity would be the same collision wearing a
    // different name, and inventing a second slot would print both.
    const ids = (assist: boolean) =>
      controlsHelpRows({
        topdownAllowed: true,
        reverseAssistEnabled: assist,
        reverseViewOn: false,
      }).map((r) => r.id);
    expect(ids(true)).toEqual(ids(false));
    expect(ids(true).filter((id) => id === "gears")).toHaveLength(1);
  });
});

describe("the gear row cannot break between «към» and its letter", () => {
  const gears = () => {
    const row = controlsHelpRows({
      topdownAllowed: true,
      reverseAssistEnabled: true,
      reverseViewOn: false,
    }).find((r) => r.id === "gears");
    expect(row, "the gear row must exist").toBeDefined();
    return row!;
  };

  it("binds each letter with U+00A0 — the orphaned «D» the sweep photographed", () => {
    // sc-follow-distance/pc-right/04-t012s.png: «скорости: към P / към» with
    // «D» alone on the next line. The column is `w-[min(15rem,45%)]` minus a
    // 3.75 rem key cap, so the row WILL wrap; it must not wrap there.
    expect(gears().what).toContain(`към${NBSP}P`);
    expect(gears().what).toContain(`към${NBSP}D`);
    // The explicit negative, because a bare „contains" would also pass on a
    // string that carried BOTH forms.
    expect(gears().what).not.toContain("към P");
    expect(gears().what).not.toContain("към D");
  });

  it("…and the row is still allowed to wrap everywhere else", () => {
    // THE OPPOSITE DIRECTION. „No breaking spaces anywhere" would be a
    // different bug — a 15 rem column cannot hold this row on one line, and an
    // unbreakable row would overflow the panel instead of wrapping inside it.
    expect(gears().what).toContain(" / ");
    expect(gears().what.split(" ").length).toBeGreaterThan(1);
  });

  it("and the U+00A0 survives all the way into the rendered sheet", () => {
    // The row is `essential`, so it is in the SHORT list the panel opens with —
    // which is the list the sweep photographed.
    const markup = renderToStaticMarkup(<ControlsHelp defaultOpen topdownAllowed />);
    expect(renderedRowIds(markup)).toContain("gears");
    expect(markup).toContain(`към${NBSP}P`);
    expect(markup).toContain(`към${NBSP}D`);
  });
});

describe("what the sheet actually renders", () => {
  const render = (props: Parameters<typeof ControlsHelp>[0] = {}) =>
    renderToStaticMarkup(<ControlsHelp {...props} />);

  it("every rendered row is uniquely addressable", () => {
    for (const c of COMBINATIONS) {
      const ids = renderedRowIds(
        render({
          defaultOpen: true,
          topdownAllowed: c.topdownAllowed,
          reverseAssistEnabled: c.reverseAssistEnabled,
        }),
      );
      expect(ids.length, label(c)).toBeGreaterThan(0);
      expect(new Set(ids).size, `${label(c)} · ${ids.join(",")}`).toBe(ids.length);
    }
  });

  it("the short list is exactly the essential rows, in order", () => {
    const rows = controlsHelpRows({
      topdownAllowed: true,
      reverseAssistEnabled: true,
      reverseViewOn: false,
    });
    const essentials = rows.filter((r) => r.essential).map((r) => r.id);
    expect(renderedRowIds(render({ defaultOpen: true }))).toEqual(essentials);
    // …and there IS something behind the expander, or the pill promising
    // «Всички клавиши (+N)» is a lie about a list that has nothing more in it.
    expect(essentials.length).toBeLessThan(rows.length);
    expect(render({ defaultOpen: true })).toContain(`(+${rows.length - essentials.length})`);
  });

  /* ─────────────────────────────────────────────────────────────────────────
     THE GROUND, ASSERTED AS OUTPUT — sweep w10, 2026-08-24.

     `sc-junction-blind/pc-right/01-arrival.png`: the open key list drawn onto
     the sky, the power lines and the road. The panel's class list has said
     `bg-background/80 backdrop-blur` the whole time; `[data-hud="controls-
     help"]` is on `GHOST_SURFACES`, and the UNPANEL sweep hands every un-inked
     child of a ghost `background-color: transparent !important` AND
     `backdrop-filter: none !important`. So both declarations have been dead
     since the sweep landed — a component that believes it has a ground and
     does not.

     WHY HERE AND NOT ONLY IN `unpanelInkExemption.test.ts`. That file reads
     this component's SOURCE, and an adversarial pass on the first version of
     the fix showed exactly what a source read misses: deleting `relative
     isolate` from the panel left 24 assertions green while the shipped result
     would have been an 80 %-alpha band down the entire left rail. This file
     is the only runnable test that renders `ControlsHelp`, so it is the only
     place the shade can be checked as OUTPUT rather than as text — and it was
     unrunnable for a whole round because `@babel` was missing from
     `node_modules`, which is why the hole survived.
     ──────────────────────────────────────────────────────────────────────── */
  it("the open sheet renders its ground, inked and inside a container of its own", () => {
    const markup = render({ defaultOpen: true });
    // The shade exists, and carries the sweep's own opt-out. Without the
    // attribute this element is handed `background-image: none !important`
    // and the whole fix is a diff that changes no pixel.
    expect(markup).toContain('data-hud="controls-help-scrim"');
    const shadeAt = markup.indexOf('data-hud="controls-help-scrim"');
    expect(markup.slice(shadeAt - 200, shadeAt + 200)).toContain("data-hud-ink");
    // …it is the published gradient and not a hand-typed near-copy…
    expect(markup.slice(shadeAt, shadeAt + 600)).toContain("rgba(6, 11, 20, 0.8)");
    // …and it is `z-index:-1`, which is the whole reason the host below has to
    // open a stacking context.
    expect(markup.slice(shadeAt, shadeAt + 600)).toMatch(/z-index:\s*-1/);

    // THE GEOMETRY, WHICH IS THE PART A SOURCE READ CANNOT SEE AT ALL: the
    // element the shade is declared in must be the containing block for
    // `inset: 0`. Rendered, that is a `class` on the div immediately before
    // the shade — `relative` for the containing block, `isolate` for the
    // stacking context (`position: relative` at `z-index: auto` opens none).
    // Lose either and the shade sizes to `[data-hud="controls-help"]`, the
    // full-height left rail, or paints behind the stage.
    const hostClassAt = markup.lastIndexOf('class="', shadeAt);
    const hostClass = markup.slice(hostClassAt, markup.indexOf('"', hostClassAt + 7) + 1);
    expect(hostClass, "the legend shade's host lost `relative`").toContain("relative");
    expect(hostClass, "the legend shade's host lost `isolate`").toContain("isolate");
  });

  it("`defaultOpen={false}` renders the pill and NOT the rows", () => {
    // The contract behind `defaultOpen={!touchOnly && !driveLockedAtMount}`:
    // a phone (whose input is the touch dock) and a lesson that opens inside
    // the pre-drive procedure both start collapsed. Asserted as OUTPUT — the
    // old guard was a `toContain` over this expression's source text, which
    // would stay green if the prop were ignored.
    const collapsed = render({ defaultOpen: false });
    expect(collapsed).toContain("Клавиши");
    expect(renderedRowIds(collapsed)).toEqual([]);
    expect(collapsed).toContain('aria-expanded="false"');
    // …and the other direction, so this cannot pass by rendering nothing.
    const open = render({ defaultOpen: true });
    expect(renderedRowIds(open).length).toBeGreaterThan(0);
    expect(open).toContain('aria-expanded="true"');
  });

  it("an exam rung is told the truth about reverse, and only there", () => {
    // The gesture row is written for `ReverseAssist`, and on an exam neither
    // the assist nor the pedal swap exists — printing it there is the product
    // refusing an input in silence. Both directions, because a legend that
    // dropped the gesture everywhere would be the same fault mirrored.
    const rowsFor = (assist: boolean) =>
      controlsHelpRows({
        topdownAllowed: true,
        reverseAssistEnabled: assist,
        reverseViewOn: false,
      });
    const exam = rowsFor(false).find((r) => r.id === "reverse")!;
    expect(exam.keys).toBe("[ ]");
    expect(exam.what).toContain("лоста");
    expect(exam.what).not.toContain("пусни и натисни пак");

    const practice = rowsFor(true).find((r) => r.id === "reverse")!;
    expect(practice.keys).toBe("S / ↓");
    expect(practice.what).toContain("пусни и натисни пак");
    expect(practice.what).not.toContain("лоста");
  });

  it("a rung that refuses the top-down view is not advertised one", () => {
    const withTop = controlsHelpRows({
      topdownAllowed: true,
      reverseAssistEnabled: true,
      reverseViewOn: false,
    });
    const withoutTop = controlsHelpRows({
      topdownAllowed: false,
      reverseAssistEnabled: true,
      reverseViewOn: false,
    });
    expect(withTop.map((r) => r.id)).toEqual(
      expect.arrayContaining(["topdown-zoom", "topdown-north"]),
    );
    expect(withoutTop.map((r) => r.id)).not.toContain("topdown-zoom");
    expect(withoutTop.map((r) => r.id)).not.toContain("topdown-north");
    // …and the C row stops naming a view the student cannot reach.
    expect(withTop.find((r) => r.id === "view")!.what).toContain("отгоре");
    expect(withoutTop.find((r) => r.id === "view")!.what).not.toContain("отгоре");
    // …so the pill's hidden count differs between them, which is the number
    // the sweep read off the frame («Всички клавиши (+11)»).
    const hidden = (rs: typeof withTop) => rs.length - rs.filter((r) => r.essential).length;
    expect(hidden(withTop)).toBe(hidden(withoutTop) + 2);
  });

  it("the K row prints the live setting, not a fixed guess", () => {
    // The row's own reason for existing: „the legend never lies about which way
    // the view will turn". Both states, because a row hard-wired to either one
    // would pass a single-state assertion.
    const at = (reverseViewOn: boolean) =>
      controlsHelpRows({ topdownAllowed: true, reverseAssistEnabled: true, reverseViewOn })
        .find((r) => r.id === "reverse-view")!
        .what;
    expect(at(true)).toContain("вкл.");
    expect(at(false)).toContain("изкл.");
    expect(at(true)).not.toBe(at(false));
  });
});
