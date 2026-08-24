/**
 * =============================================================================
 * THE DEMONSTRATION MUST NOT NARRATE OVER THE STUDENT'S OWN DRIVE
 * — wave-C corpus, seven rows, three critical, 2026-08-24.
 * =============================================================================
 *
 * `deckCaptionVoice.test.tsx` next door established that the demonstration's
 * caption is read by students (and by trained judges) as a claim about THEIR
 * driving, and fixed the voice so the sentence names whose drive it describes.
 * This is the other half of the same defect and it cannot be fixed with words:
 * the caption should not be on the glass AT ALL once the student is driving.
 *
 * The two frames that filed it, both from the certified corpus, both at speed:
 *
 *   sc-hz-breakdown-pulloff  pc-right 04-t124s — «Спряхме плътно вдясно…» while
 *                            the car does 6 км/ч IN THE RUNNING LANE, playhead
 *                            parked 0:26/0:26.
 *   sc-follow-cutin          pc-right 04-t034s — «Възглавницата е възстановена…»
 *                            over ЗАДАЧА 1/3 at 12 км/ч, scrubber 0:28/0:40.
 *
 * WHY PAUSING THE CLOCK IS NOT THE FIX ON ITS OWN, which is the trap this file
 * exists to nail down: `activeAnnotationIndex` clears a caption `windowSec`
 * after it fires, but only as the playhead MOVES past it. A clock stopped
 * inside that window pins its sentence forever — that is precisely the
 * 0:26/0:26 frame above. So `standDown` gates the RENDER, not just the clock.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import type { ScenarioTrace, TraceClock } from "@/modules/sim/traces";
import { TraceTimeline } from "../TraceTimeline";
import { DEMO_DECK_MOVING_KMH, demoDeckStandsDown } from "../demoDeckLifetime";

const CAPTION_BG = "Спряхме плътно вдясно, извън платното за движение.";

/** A trace whose annotation is live at t = 0, so the caption renders. */
function traceWithCaption(): ScenarioTrace {
  return {
    meta: { scenarioId: "sc-hz-breakdown-pulloff", kind: "shadow", version: 1, durationSec: 26 },
    samples: [
      {
        tSec: 0,
        x: 0,
        y: 0,
        headingDeg: 0,
        steerRad: 0,
        speedKmh: 0,
        gear: 1,
        indicator: "off",
        brakeOn: true,
        throttleOn: false,
      },
    ],
    events: [{ tSec: 0, kind: "annotation", textBg: CAPTION_BG }],
  };
}

function render(standDown: boolean): string {
  const clockRef = createRef<TraceClock>() as React.RefObject<TraceClock>;
  return renderToStaticMarkup(
    <TraceTimeline trace={traceWithCaption()} clockRef={clockRef} compact standDown={standDown} />,
  );
}

/**
 * The CAPTION BOX only — not the whole deck.
 *
 * The first cut of this test asserted the caption string was absent from the
 * entire markup and went red for a correct reason: each annotation TICK on the
 * scrubber carries its sentence as an aria-label, so a screen-reader user can
 * tell what they are jumping to. That label must survive a stand-down — the
 * transport stays usable, which the test below also asserts. What must go is the
 * sentence PRINTED ON THE GLASS over a moving car, and that lives here.
 */
function captionBoxInner(html: string): string {
  const at = html.indexOf('data-hud="deck-caption"');
  if (at < 0) return "";
  const tagEnd = html.indexOf(">", at);
  let depth = 1;
  let i = tagEnd + 1;
  const start = i;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf("<div", i);
    const nextClose = html.indexOf("</div>", i);
    if (nextClose < 0) return html.slice(start);
    if (nextOpen >= 0 && nextOpen < nextClose) { depth += 1; i = nextOpen + 4; }
    else { depth -= 1; i = nextClose + 6; }
  }
  return html.slice(start, i - 6);
}

describe("the demonstration's caption stands down when the student drives", () => {
  it("is on the glass while the student has not started — the demo is the point", () => {
    // The guard rail for the fix: standing the deck down must not be a way of
    // never showing the demonstration at all.
    expect(captionBoxInner(render(false))).toContain(CAPTION_BG);
  });

  it("is GONE once the deck has stood down, though the transport remains", () => {
    const html = render(true);
    expect(captionBoxInner(html)).not.toContain(CAPTION_BG);
    // The student may still replay the demonstration deliberately — what stops
    // is the deck talking over their drive unasked, not the deck itself.
    expect(html).toContain('data-hud="deck-caption"');
  });
});

describe("what counts as the student having started", () => {
  it("stands down above the shared threshold and not at or below it", () => {
    expect(demoDeckStandsDown(DEMO_DECK_MOVING_KMH + 0.1)).toBe(true);
    expect(demoDeckStandsDown(DEMO_DECK_MOVING_KMH)).toBe(false);
    expect(demoDeckStandsDown(0)).toBe(false);
  });

  it("reads a car rolling backwards as driving too", () => {
    // Reversing out of a bay is driving. A rule that only looked at the signed
    // number would leave the demonstration narrating through every manoeuvre
    // lesson that starts in reverse.
    expect(demoDeckStandsDown(-(DEMO_DECK_MOVING_KMH + 0.1))).toBe(true);
  });

  it("treats an unreadable speed as NOT driving", () => {
    // The deliberate direction, and the same one its two siblings take: an
    // unreadable number must never be able to take the demonstration off the
    // screen — that would silence it exactly on the lessons whose
    // instrumentation is broken, where the student needs it most.
    expect(demoDeckStandsDown(Number.NaN)).toBe(false);
    expect(demoDeckStandsDown(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
