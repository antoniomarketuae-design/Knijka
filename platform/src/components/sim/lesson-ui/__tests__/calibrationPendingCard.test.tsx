import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CALIBRATION_PENDING_BODY_BG } from "@/modules/learning/calibration";
import { CalibrationGate, CalibrationPendingCard } from "../CalibrationGate";

/**
 * THE CARD THAT ASKED A QUESTION AND GAVE NO WAY TO ANSWER IT.
 *
 * sweep161, `sc-speed-transition/pc-wrong/04-t024s.png`: *„The post-drive
 * self-assessment screen asks the student to state what result they expect,
 * then offers no way to answer — the only control on the card is Пропусни и
 * покажи резултата. Either the answer controls fail to mount or the copy is
 * written for controls that do not exist."*
 *
 * It was the second one. `CalibrationPendingCard` holds the window between the
 * drive ending and the server's protocol arriving, and it shipped as a title,
 * a paragraph asking for the prediction, and a skip button. The paragraph is
 * `CALIBRATION_PENDING_BODY_BG`, written in the present tense on purpose so the
 * pause would not read as „Зареждане…" — and with nothing to act on, it read as
 * a broken screen instead.
 *
 * WHY A RENDERING TEST. Nothing derivable from the module's exports could see
 * this: the copy constant is correct, the gate component is correct, and both
 * were covered. The defect lived in what the pending card DID NOT RENDER, and
 * the only instrument that can assert about an absence is one that renders the
 * card and looks.
 *
 * Both directions are pinned below, because this audit has produced as many
 * false refusals as false certificates: the pending card must show the question
 * and must NOT let it be answered early (a prediction typed before the protocol
 * exists is not what the mechanic measures, and the whole screen exists so the
 * student cannot read the score first).
 */

const gateMarkup = (): string =>
  renderToStaticMarkup(
    <CalibrationGate
      lessonTitleBg="Преход 50→30"
      onSubmit={async () => null}
      onResolved={() => undefined}
    />,
  );

const pendingMarkup = (): string =>
  renderToStaticMarkup(<CalibrationPendingCard onSkip={() => undefined} />);

/** The two things the student is asked for, as they appear in the markup. */
const POINTS_FIELD = /<input[^>]*type="number"[^>]*>/;
/**
 * React renders a boolean `disabled` as the bare attribute. The first draft
 * matched the WORD, which also matched the Tailwind class `disabled:opacity-50`
 * and reported the LIVE gate as disabled — caught on the first run by the
 * enabled-direction assertion below, which is the reason that direction is
 * tested at all rather than assumed.
 */
const DISABLED_ATTR = /disabled=""/;
const PASS_YES = "Да, издържах";
const PASS_NO = "Не, неиздържан";

describe("the calibration gate's question", () => {
  it("NON-VACUITY: the live gate is what these matchers are calibrated against", () => {
    // If the matchers stop finding the question on the screen that certainly
    // has one, every assertion below is meaningless and this fails first.
    const live = gateMarkup();
    expect(live).toMatch(POINTS_FIELD);
    expect(live).toContain(PASS_YES);
    expect(live).toContain(PASS_NO);
  });

  it("the live gate's controls are enabled — a student can actually answer", () => {
    const live = gateMarkup();
    const input = POINTS_FIELD.exec(live)?.[0] ?? "";
    expect(input).not.toMatch(DISABLED_ATTR);
    // The pass buttons sit in a fieldset that must not be disabled either.
    expect(live).not.toMatch(/<fieldset[^>]*disabled=""/);
  });
});

describe("CalibrationPendingCard shows the question it is asking for", () => {
  it("renders the real fields, not a description of them", () => {
    const pending = pendingMarkup();
    // The copy that asks for the prediction…
    expect(pending).toContain(CALIBRATION_PENDING_BODY_BG);
    // …and, on the same card, the thing it asks about.
    expect(pending, "the points field never mounted").toMatch(POINTS_FIELD);
    expect(pending, "the издържан/неиздържан choice never mounted").toContain(PASS_YES);
    expect(pending).toContain(PASS_NO);
  });

  it("but they are INERT — the answer cannot be given before the protocol lands", () => {
    const pending = pendingMarkup();
    const input = POINTS_FIELD.exec(pending)?.[0] ?? "";
    expect(input, "the points field is live during the wait").toMatch(DISABLED_ATTR);
    expect(pending, "the pass choice is live during the wait").toMatch(/<fieldset[^>]*disabled=""/);
    // And no submit control exists here at all — „Провери се" belongs to the
    // gate proper, once there is something to check against.
    expect(pending).not.toContain("Провери се");
  });

  it("the wait is visible, not only announced to screen readers", () => {
    // `aria-busy` was the ONLY signal on this card and it renders nothing. A
    // sighted seventeen-year-old got a static screen.
    const pending = pendingMarkup();
    expect(pending).toContain("aria-busy");
    expect(pending, "aria-busy has no visible counterpart").toMatch(/animate-pulse/);
    expect(pending, "nothing tells the student the question is coming").toMatch(/отключва/);
  });

  it("the escape hatch survives — a hung request never costs the debrief", () => {
    expect(pendingMarkup()).toContain("Пропусни и покажи резултата");
  });

  it("the question on the waiting card is the SAME question the gate asks", () => {
    // The drift guard. If someone re-hand-writes the preview instead of using
    // the shared fields, the two label sets diverge and this catches it.
    const labels = (html: string): string[] =>
      ["Моите наказателни точки", PASS_YES, PASS_NO, "Издържах ли?"].filter((l) =>
        html.includes(l),
      );
    expect(labels(pendingMarkup())).toEqual(labels(gateMarkup()));
    expect(labels(pendingMarkup())).toHaveLength(4);
  });
});
