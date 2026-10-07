/**
 * THE LAWFUL TURN-ROUND'S PRAISE — ON THE TWO END SURFACES THAT PRINT ONE
 * (sc-mv-uturn-ban:e98407b1 clause 4, the right side).
 *
 * `mv-uturn-ban-lawful-turn-praise.test.ts` pins WHEN the product mints
 * «Подмина забраната, обърна на прекъснатата осева» through the live rung
 * chain. This file renders WHERE the student reads it, on the drive the w81
 * verifier measured: the committed shadow-correct demo (the lawful turn at the
 * gap) driven through the compiled rung, its own result and its own debrief
 * handed to the REAL result screen —
 *
 *   · «Похвали» on the result screen     hud/SessionEndScreen.tsx (✓ + title + clock)
 *   · the debrief text beside it         lessons/debrief.ts («Какво се получи добре»)
 *
 * and, in the other direction, the committed U-turn across the solid axis: the
 * same two surfaces carry no such line.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scMvUturnBanMistakeCrossSolidScript, scMvUturnBanShadowScript } from "../../traces/scMvUturnBan";
import { SC_MV_UTURN_BAN } from "../../lessons/scenario/templates-parking2";
import { driveLiveRung, type LiveRungOutcome } from "../../lessons/scenario/__tests__/witnessLiveRung";
import { SessionEndScreen } from "../SessionEndScreen";

const PRAISE_TITLE = "Подмина забраната, обърна на прекъснатата осева";

function textOf(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function screenOf(o: LiveRungOutcome): string {
  return renderToStaticMarkup(
    <SessionEndScreen
      lessonTitleBg={o.lesson.titleBg}
      result={o.result}
      debriefText={o.debrief}
      concepts={[]}
      xpEarned={null}
      onRetry={() => undefined}
      onExit={() => undefined}
      nextLessonTitleBg={null}
      onNextLesson={null}
    />,
  );
}

/** One `<section aria-label=…>` of the screen, as text. Throws rather than returning "" on a miss. */
function section(markup: string, label: string): string {
  const open = markup.indexOf(`<section aria-label="${label}"`);
  if (open < 0) throw new Error(`no <section aria-label="${label}"> on the screen`);
  const close = markup.indexOf("</section>", open);
  if (close < 0) throw new Error(`unterminated ${label} section`);
  return textOf(markup.slice(open, close));
}

const clock = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

describe("the lawful turn-round at the gap (shadow-correct, L3) — the praise is on the screen and in the debrief", () => {
  const o = driveLiveRung(SC_MV_UTURN_BAN, 3, scMvUturnBanShadowScript(), { keepTicks: false });

  it("«Похвали» prints ✓ «Подмина забраната, обърна на прекъснатата осева» with the clock of the completing frame", () => {
    const praise = section(screenOf(o), "Похвали");
    expect(praise).toContain(`✓ ${PRAISE_TITLE}`);
    expect(praise).toContain(`${PRAISE_TITLE} ${clock(o.session.endedAtSec ?? -1)}`);
    // Not qualified: nothing in the drive contradicts it.
    expect(praise).not.toContain(`(✓) ${PRAISE_TITLE}`);
  });

  it("the debrief beside it leads «Какво се получи добре» with the same sentence", () => {
    const good = o.debrief.slice(o.debrief.indexOf("Какво се получи добре:"));
    expect(good.split("\n")[1]).toBe(`• ${PRAISE_TITLE}`);
    // …and the screen renders that very debrief.
    expect(textOf(screenOf(o))).toContain(`• ${PRAISE_TITLE}`);
  });
});

describe("the U-turn across the solid axis (mistake-cross-solid, L3) — neither surface carries it", () => {
  const o = driveLiveRung(SC_MV_UTURN_BAN, 3, scMvUturnBanMistakeCrossSolidScript(), { keepTicks: false });
  it("not in «Похвали», not anywhere on the screen, not in the debrief", () => {
    const markup = screenOf(o);
    expect(textOf(markup)).not.toContain(PRAISE_TITLE);
    expect(o.debrief).not.toContain(PRAISE_TITLE);
  });
});
